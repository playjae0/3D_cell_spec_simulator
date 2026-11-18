import {
  canonical,
  same,
  itemBasis,
  definitionDiff,
} from "../annotations/semantics.js";
import { basicMeasurements, measurementKey } from "../annotations/sets.js";
import { evaluate } from "../annotations/measure.js";
import { withAnchors } from "../annotations/anchors.js";
import {
  intakeFromProject,
  productFromIntake,
  reconcileProject,
} from "../intake/adapter.js";
import { validateProject } from "../data/project.js";
const clone = (x) => structuredClone(x);
export function comparisonSnapshot(source, stage) {
  const p = reconcileProject(clone(source));
  p.stage = stage;
  if (p.intake) {
    if (!p.intake.requestedStages.includes(stage))
      p.intake.requestedStages.push(stage);
    p.product = productFromIntake(p.intake, stage);
  }
  validateProject(p);
  return p;
}
export class ComparisonSession {
  constructor(compute, cacheKey = () => undefined) {
    this.compute = compute;
    this.cacheKey = cacheKey;
    this.generation = 0;
    this.cache = new Map();
    this.pending = new Map();
    this.tail = Promise.resolve();
    this.result = null;
    this.sequence = 0;
  }
  invalidate() {
    this.generation++;
    this.result = null;
  }
  async model(project) {
    const key = this.cacheKey(project) ?? JSON.stringify(canonical([project.product, project.stage]));
    if (this.cache.has(key)) return clone(this.cache.get(key));
    if (!this.pending.has(key)) {
      const task = this.tail
        .catch(() => {})
        .then(() => this.compute(clone(project), ++this.sequence));
      this.tail = task;
      this.pending.set(
        key,
        task
          .then((data) => {
            this.cache.set(key, clone(data));
            if (this.cache.size > 8)
              this.cache.delete(this.cache.keys().next().value);
            return data;
          })
          .finally(() => this.pending.delete(key)),
      );
    }
    return clone(await this.pending.get(key));
  }
  async run(a, b, stages) {
    const token = ++this.generation;
    this.result = null;
    try {
      const projects = [
        comparisonSnapshot(a, stages[0]),
        comparisonSnapshot(b, stages[1]),
      ];
      const models = await Promise.all(projects.map((p) => this.model(p)));
      if (token !== this.generation) return null;
      this.result = {
        projects,
        models: models.map((d, i) => withAnchors(d, projects[i].anchors)),
      };
      return this.result;
    } catch (e) {
      if (token !== this.generation) return null;
      throw e;
    }
  }
}
export function comparisonBasis(p, m, common = false) {
  const result = itemBasis(p, m, { tolerance: false });
  delete result.definition.itemId;
  delete result.definition.stage;
  if (common) {
    delete result.definition.datumId;
    delete result.datum;
  }
  return result;
}
export function comparisonContext(p, m, common = false) {
  return common
    ? {
        project: { ...p, datumSet: { origin: [0, 0, 0], rotationZ: 0 } },
        measurement: { ...m, datumId: "legacy" },
      }
    : { project: p, measurement: m };
}
export function calculatedDifferences(
  projects,
  models,
  { common = false } = {},
) {
  const lists = projects.map((p, i) => [
    ...p.measurements.filter((m) => m.stage === p.stage),
    ...basicMeasurements(p, models[i]).added,
  ]);
  const used = new Set(),
    pairs = [];
  for (const a of lists[0]) {
    let b = lists[1].find((m) => !used.has(m.id) && m.id === a.id);
    b ??= lists[1].find(
      (m) =>
        !used.has(m.id) &&
        measurementKey(m, false) === measurementKey(a, false),
    );
    if (b) used.add(b.id);
    pairs.push([a, b]);
  }
  for (const b of lists[1]) if (!used.has(b.id)) pairs.push([null, b]);
  return pairs.map(([a, b]) => {
    // A missing definition is evaluated on the other process solely to classify
    // a named feature as stage-unavailable or removed; no project is amended.
    const ms = [
      a || { ...b, stage: projects[0].stage },
      b || { ...a, stage: projects[1].stage },
    ];
    const results = ms.map((m, i) => {
      const c = comparisonContext(projects[i], m, common);
      return evaluate(c.measurement, models[i].features, c.project);
    });
    const compatible =
      !!a &&
      !!b &&
      same(
        comparisonBasis(projects[0], a, common),
        comparisonBasis(projects[1], b, common),
      );
    const comparable = compatible && results.every((r) => r.valid);
    return {
      name: a?.name || b.name,
      items: [a, b],
      displayItems: ms,
      results,
      unit: "mm",
      delta: comparable ? results[1].value - results[0].value : null,
      reason:
        !a || !b
          ? results.find((r) => !r.valid)?.error || "한쪽에 검사 정의 없음"
          : !compatible
            ? "검사 기준이 달라 직접 비교 불가"
            : results.find((r) => !r.valid)?.error || null,
      basis: common
        ? "공통 전역 프레임 X/Y/Z (원점 0, 회전 0)"
        : "각 개정에 저장된 검사 프레임",
    };
  });
}
export function partDifferences(models) {
  const maps = models.map((m) => new Map(m.parts.map((p) => [p.id, p])));
  const state = (i, id) => {
    if (maps[i].has(id)) return "존재";
    const unavailable = Object.values(models[i].features).find(
      (f) => f.partId === id && f.available === false,
    );
    if (unavailable?.reasonCode === "unconfirmed")
      return unavailable.reason || "부품 존재/입력 미확정";
    return unavailable
      ? "해당 공정에 없음"
      : "참조 소실 / 해당 모델에 부품 없음";
  };
  return [...new Set([...maps[0].keys(), ...maps[1].keys()])]
    .sort()
    .map((id) => {
      const a = maps[0].get(id),
        b = maps[1].get(id),
        delta =
          a && b
            ? {
                min: b.bounds.min.map((n, i) => n - a.bounds.min[i]),
                max: b.bounds.max.map((n, i) => n - a.bounds.max[i]),
                volume: b.volume - a.volume,
              }
            : null;
      return {
        id,
        name: a?.name || b.name,
        states: [state(0, id), state(1, id)],
        delta,
        surfaceChanged:
          a?.meta?.surfaceSignature && b?.meta?.surfaceSignature
            ? a.meta.surfaceSignature !== b.meta.surfaceSignature
            : null,
        changed:
          (a?.meta?.surfaceSignature &&
            b?.meta?.surfaceSignature &&
            a.meta.surfaceSignature !== b.meta.surfaceSignature) ||
          !delta ||
          [...delta.min, ...delta.max, delta.volume].some(
            (n) => Math.abs(n) > 1e-6,
          ),
      };
    });
}
export function inputDifferences(projects) {
  return definitionDiff(...projects.map((p) => intakeFromProject(p)));
}
