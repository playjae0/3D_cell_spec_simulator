import { ModelLibrary } from "./library.js";
import { canonical, same } from "../annotations/semantics.js";
const clone = (x) => structuredClone(x),
  key = (...xs) => JSON.stringify(xs);
function comparable(value) {
  if (Array.isArray(value)) {
    const xs = value.map(comparable),
      id = ["parameterId", "id", "itemId", "sourceId", "revision", "key"].find(
        (k) =>
          xs.length &&
          xs.every(
            (x) => x && typeof x === "object" && typeof x[k] === "string",
          ) &&
          new Set(xs.map((x) => x[k])).size === xs.length,
      );
    return id ? xs.sort((a, b) => a[id].localeCompare(b[id])) : xs;
  }
  return value && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(canonical(value)).map(([k, v]) => [k, comparable(v)]),
      )
    : value;
}
const equal = (a, b) => same(comparable(a), comparable(b));
const revisionContent = (r) => ({
  baseRevision: r.baseRevision ?? null,
  project: r.project,
});
const sampleContent = (s) => {
  const x = clone(s);
  delete x.recordedAt;
  return { ...x, unit: x.unit || "mm" };
};
const unique = (wanted, exists) => {
  let id = wanted,
    n = 2;
  while (exists(id)) id = wanted + "-" + n++;
  return id;
};
function remapViews(views, modelMap, revisionMap) {
  for (const view of views || []) {
    const o = view.owner,
      model = modelMap.get(o?.modelId);
    if (!model) continue;
    const rev = revisionMap.get(key(o.modelId, o.revision));
    o.modelId = model;
    if (rev) o.revision = rev;
  }
}
function remapProject(project, modelMap, revisionMap) {
  const p = clone(project),
    id = p.modelIdentity,
    old = id.modelId;
  id.modelId = modelMap.get(old) || old;
  id.revision = revisionMap.get(key(old, id.revision)) || id.revision;
  id.baseRevision = id.baseRevision
    ? revisionMap.get(key(old, id.baseRevision)) || id.baseRevision
    : null;
  if (p.intake) {
    Object.assign(p.intake.model, {
      modelId: id.modelId,
      revision: id.revision,
      baseRevision: id.baseRevision,
    });
    p.product.id = id.modelId;
    remapViews(p.intake.inspectionViews, modelMap, revisionMap);
  } else if (p.product.id === old) p.product.id = id.modelId;
  remapViews(p.inspectionViews, modelMap, revisionMap);
  return p;
}
// Pure preview. Nothing is written until the caller persists the completed candidate.
export function planLibraryMerge(current, incoming, choices = new Map()) {
  const out = new ModelLibrary(
      current instanceof ModelLibrary ? current.snapshot() : current,
    ).snapshot(),
    source = new ModelLibrary(
      incoming instanceof ModelLibrary ? incoming.snapshot() : incoming,
    ).snapshot();
  const summary = {
      addedModels: 0,
      addedRevisions: 0,
      duplicateRevisions: 0,
      addedSamples: 0,
      duplicateSamples: 0,
      addedDrafts: 0,
      duplicateDrafts: 0,
      skipped: 0,
    },
    conflicts = [],
    modelMap = new Map(),
    revisionMap = new Map(),
    excluded = new Set(),
    deferred = [];
  const conflict = (type, id, label, options) => {
    const k = key(type, id);
    conflicts.push({ key: k, type, id, label, options });
    return choices.get(k);
  };
  for (const m of source.models) {
    const existing = out.models.find((x) => x.modelId === m.modelId);
    const collisions = existing
      ? m.revisions.filter((r) => {
          const old = existing.revisions.find((x) => x.revision === r.revision);
          return old && !equal(revisionContent(old), revisionContent(r));
        })
      : [];
    const hasConflict =
      collisions.length > 0 || (existing && existing.name !== m.name);
    let action = "merge",
      target = m.modelId,
      suffix = "import";
    if (hasConflict) {
      const c = conflict(
        "model",
        m.modelId,
        m.modelId +
          ": 같은 ID의 다른 내용 (개정 " +
          collisions.map((r) => r.revision).join(", ") +
          ")",
        ["skip", "copy_model", "copy_revisions"],
      );
      if (!c) {
        excluded.add(m.modelId);
        continue;
      }
      action = c.action;
      if (action === "skip") {
        excluded.add(m.modelId);
        summary.skipped += m.revisions.length;
        continue;
      }
      if (action === "copy_model") {
        target =
          c.target?.trim() ||
          unique(m.modelId + "-import", (id) =>
            out.models.some((m) => m.modelId === id),
          );
        if (out.models.some((m) => m.modelId === target))
          throw Error("복사할 모델 ID가 이미 있습니다: " + target);
      } else if (action === "copy_revisions")
        suffix = c.target?.trim() || "import";
      else throw Error("모델 충돌 선택 오류");
    }
    modelMap.set(m.modelId, target);
    const occupied = new Set(
      out.models
        .find((x) => x.modelId === target)
        ?.revisions.map((r) => r.revision) || [],
    );
    for (const r of m.revisions) {
      const rev =
        action === "copy_revisions"
          ? unique(r.revision + "-" + suffix, (id) => occupied.has(id))
          : r.revision;
      occupied.add(rev);
      revisionMap.set(key(m.modelId, r.revision), rev);
    }
    let dest = out.models.find((x) => x.modelId === target);
    if (!dest) {
      dest = { ...clone(m), modelId: target, revisions: [] };
      out.models.push(dest);
      summary.addedModels++;
    }
    for (const r of m.revisions) {
      if (
        action === "merge" &&
        dest.revisions.some((x) => x.revision === r.revision)
      ) {
        summary.duplicateRevisions++;
        continue;
      }
      const project = remapProject(r.project, modelMap, revisionMap);
      const entry = {
        ...clone(r),
        revision: project.modelIdentity.revision,
        baseRevision: project.modelIdentity.baseRevision,
        project,
        ...(action !== "merge"
          ? { importedFrom: { modelId: m.modelId, revision: r.revision } }
          : {}),
      };
      dest.revisions.push(entry);
      deferred.push([entry, r.project]);
      summary.addedRevisions++;
    }
  }
  for (const [entry, sourceProject] of deferred)
    entry.project = remapProject(sourceProject, modelMap, revisionMap);
  for (const sample of source.samples) {
    if (excluded.has(sample.modelId)) {
      summary.skipped++;
      continue;
    }
    const s = clone(sample);
    s.modelId = modelMap.get(sample.modelId) || sample.modelId;
    s.modelRevision =
      revisionMap.get(key(sample.modelId, sample.modelRevision)) ||
      sample.modelRevision;
    const saved = out.models
      .find((m) => m.modelId === s.modelId)
      ?.revisions.find((r) => r.revision === s.modelRevision)?.project;
    s.stage ??= saved?.measurements.find((m) => m.id === s.itemId)?.stage;
    s.unit ??= "mm";
    const identity = (x) =>
        key(x.sampleId, x.modelId, x.modelRevision, x.itemId),
      exists = out.samples.find((x) => identity(x) === identity(s));
    if (exists) {
      const normalized = {
        ...exists,
        stage: exists.stage ?? s.stage,
        unit: exists.unit ?? "mm",
      };
      if (equal(sampleContent(normalized), sampleContent(s))) {
        summary.duplicateSamples++;
        continue;
      }
      const c = conflict(
        "sample",
        identity(s),
        "실측 충돌: " +
          s.sampleId +
          " / " +
          s.itemId +
          " (기존 " +
          exists.value +
          ", 입력 " +
          s.value +
          " mm)",
        ["skip", "rename"],
      );
      if (!c) continue;
      if (c.action === "skip") {
        summary.skipped++;
        continue;
      }
      if (c.action !== "rename") throw Error("실측 충돌 선택 오류");
      s.sampleId =
        c.target?.trim() ||
        unique(s.sampleId + "-import", (id) =>
          out.samples.some(
            (x) => identity(x) === identity({ ...s, sampleId: id }),
          ),
        );
      if (out.samples.some((x) => identity(x) === identity(s)))
        throw Error("새 샘플 ID도 충돌합니다");
    }
    out.samples.push(s);
    summary.addedSamples++;
  }
  for (const original of source.drafts) {
    const d = clone(original),
      old = d.intake.model?.modelId,
      oldRevision = d.intake.model?.revision;
    if (excluded.has(old)) {
      summary.skipped++;
      continue;
    }
    if (modelMap.has(old)) {
      d.intake.model.modelId = modelMap.get(old);
      d.intake.model.revision =
        revisionMap.get(key(old, oldRevision)) || oldRevision;
      if (d.intake.model.baseRevision)
        d.intake.model.baseRevision =
          revisionMap.get(key(old, d.intake.model.baseRevision)) ||
          d.intake.model.baseRevision;
      remapViews(d.intake.inspectionViews, modelMap, revisionMap);
      if (
        old !== d.intake.model.modelId ||
        oldRevision !== d.intake.model.revision
      )
        d.key = d.intake.model.modelId + "@" + d.intake.model.revision;
    }
    const exists = out.drafts.find((x) => x.key === d.key);
    if (exists) {
      if (equal(exists.intake, d.intake)) {
        summary.duplicateDrafts++;
        continue;
      }
      const c = conflict("draft", d.key, "미완성 초안 충돌: " + d.key, [
        "skip",
        "rename",
      ]);
      if (!c) continue;
      if (c.action === "skip") {
        summary.skipped++;
        continue;
      }
      if (c.action !== "rename") throw Error("초안 충돌 선택 오류");
      const modelId = d.intake.model?.modelId || "",
        wanted =
          c.target?.trim() || (d.intake.model?.revision || "draft") + "-import";
      const revision = unique(wanted, (id) =>
        out.drafts.some((x) => x.key === modelId + "@" + id),
      );
      d.intake.model = { ...d.intake.model, revision };
      d.key = modelId + "@" + revision;
      // Only the explicitly copied draft identity changes; unknown fields survive.
      d.importedFrom = { key: original.key };
    }
    out.drafts.push(d);
    summary.addedDrafts++;
  }
  const unresolved = conflicts.filter((c) => !choices.has(c.key));
  return {
    summary,
    conflicts,
    unresolved,
    mappings: { models: [...modelMap], revisions: [...revisionMap] },
    candidate: unresolved.length ? null : new ModelLibrary(out),
  };
}
