import {
  stageIds,
  newPouchStages,
  assemblyStage,
  stageContract,
} from "../data/stages.js";
import { pouchFieldDefinitions } from "../data/pouch-fields.js";
import dictionary from "./dictionary.json" with { type: "json" };
import { toolingFields } from './tooling-fields.js';
export const STAGES = stageIds;
export const VERSION = "1.2",
  DICTIONARY = "cell-intake-1.2";
export const GENERATOR = {
  version: "1.5.0",
  baselineCommit: "cde0950f6255c946524b05973619750b0e123522",
};
export const TARGET =
  "X=조립체 길이, Y=폭, Z=두께; A=Z0, B=Y0, C=X0; 원점=조립체 중심";
export const COMPONENTS = {
  preweld: { section: "prewelds", id: "pre-1", min: 2 },
  joint: { section: "joints", id: "main", min: 3 },
  tape: { section: "tapes", id: "yellow", min: 4 },
  leadFilm: { section: "leadFilm", id: "leadFilm", min: 3 },
  preweldLead: { section: "preweldLead", id: "preweldLead", min: 2, max: 2 },
};
export const clone = (x) => structuredClone(x);
export function intakeFields(intake) {
  return [...dictionaryFor(intake.componentInstances), ...(intake.formatVersion === '1.4' ? toolingFields(intake.processTooling) : [])];
}
export function dictionaryFor(instances = []) {
  const fields = dictionary.parameters.filter(
    (f) => !/^\w+\.(prewelds|joints|tapes)\./.test(f.parameterId),
  );
  for (const c of instances) {
    const kind = COMPONENTS[c.kind];
    if (!kind || !["preweld", "joint", "tape"].includes(c.kind)) continue;
    const prefix = c.polarity + "." + kind.section + "." + kind.id + ".";
    for (const f of dictionary.parameters.filter((f) =>
      f.parameterId.startsWith(prefix),
    ))
      fields.push({
        ...f,
        parameterId: f.parameterId.replace(
          "." + kind.id + ".",
          "." + c.instanceId + ".",
        ),
        adapterPath: f.parameterId.replace(
          "." + kind.id + ".",
          "." + c.instanceId + ".",
        ),
        partId: `${c.polarity}.${c.kind}.${c.instanceId}`,
      });
  }
  return [...fields, ...pouchFieldDefinitions];
}
export function componentFor(id, instances) {
  return instances.find((c) => {
    const k = COMPONENTS[c.kind];
    return id.startsWith(
      `${c.polarity}.${k?.section}.` +
        (["preweld", "joint", "tape"].includes(c.kind)
          ? c.instanceId + "."
          : ""),
    );
  });
}
export function legacyUnknownSealant(intake, side, stage) {
  if (intake.formatVersion !== "1.0" || stage !== "welded") return false;
  const c = intake.componentInstances.find(
    (c) => c.polarity === side && c.kind === "leadFilm",
  );
  const enabled = intake.parameters.find(
    (p) => p.parameterId === side + ".leadFilm.enabled",
  )?.value;
  return (!c || c.existenceStatus === "unknown") && enabled == null;
}
export function requiredField(f, intake, stage) {
  if (f.tooling) return true;
  if (f.parameterId.startsWith("pouchProcess.")) {
    if (!f.activeStages.includes(stage)) return false;
    const pre = f.parameterId.slice(0, f.parameterId.lastIndexOf("."));
    const val = (k) =>
      intake.parameters.find((p) => p.parameterId === pre + "." + k)?.value;
    if (
      /\.(toolFaces|folds)\./.test(f.parameterId) &&
      !f.parameterId.endsWith(".enabled") &&
      val("enabled") === false
    )
      return false;
    if (
      /\.relief(Length|Width|Offset)$/.test(f.parameterId) &&
      val("reliefEnabled") === false
    )
      return false;
    return true;
  }
  if (stageContract[stage]?.pouch) {
    if (f.parameterId.startsWith("pouch.") || !assemblyStage(stage))
      return false;
    stage = assemblyStage(stage);
  }
  if (
    f.parameterId.includes(".leadFilm.") &&
    legacyUnknownSealant(intake, f.parameterId.split(".")[0], stage)
  )
    return false;
  if (
    !f.activeStages.includes(stage) ||
    /\.(material|process)$/.test(f.parameterId)
  )
    return false;
  const c = componentFor(f.parameterId, intake.componentInstances);
  if (c) {
    if (/\.(enabled|included)$/.test(f.parameterId)) return true;
    if (c.existenceStatus === "absent") return false;
  }
  if (f.parameterId.includes(".tapes.")) {
    const prefix = f.parameterId.slice(0, f.parameterId.lastIndexOf("."));
    const path = intake.parameters.find(
      (p) => p.parameterId === prefix + ".path",
    )?.value;
    if (path === "top" && f.parameterId.endsWith(".edgeDrop")) return false;
    if (path === "top_edges" && /\.(width|offsetY)$/.test(f.parameterId))
      return false;
  }
  return true;
}
export function template(model = {}, stages = STAGES) {
  const componentInstances = Object.entries(COMPONENTS).flatMap(([kind, k]) =>
    ["positive", "negative"].map((polarity) => ({
      polarity,
      kind,
      instanceId: k.id,
      existenceStatus: "unknown",
      sourceRefs: [],
    })),
  );
  const x = {
    format: "pouch-cell-intake",
    formatVersion: VERSION,
    dictionaryVersion: DICTIONARY,
    generator: GENERATOR,
    demo: false,
    model: {
      modelId: null,
      modelName: null,
      revision: null,
      baseRevision: null,
      assemblyType: "sheet_stacked",
      tabLayout: "opposite_ends",
      ...model,
    },
    requestedStages: stages,
    coordinateMapping: {
      sourceConvention: null,
      targetConvention: TARGET,
      mappingStatus: "missing",
      sourceRefs: [],
      note: "사진 방향으로 극성을 판정하지 않음. 원점/축과 치수 시작·끝 확인.",
    },
    sources: [],
    componentInstances,
    parameters: [],
    inspectionDatums: [],
    inspectionItems: [],
    reviewLog: [],
    unmappedRequirements: [],
    conflicts: [],
  };
  x.parameters = dictionaryFor(componentInstances)
    .filter(
      (f) =>
        !f.activeStages.length ||
        f.activeStages.some((s) => stages.includes(s)),
    )
    .map((f) => ({
      parameterId: f.parameterId,
      label: f.label,
      value: null,
      unit: f.unit,
      status: "missing",
      reviewStatus: "pending",
      sourceRefs: [],
      originalText: null,
      conversion: null,
      note: "",
    }));
  return x;
}
export function stableId(product, path) {
  const a = path.split(".");
  if (["prewelds", "joints", "tapes"].includes(a[1]))
    a[2] = product[a[0]][a[1]][Number(a[2])]?.id;
  return a.join(".");
}
export function fieldPath(product, id) {
  const a = id.split(".");
  if (["prewelds", "joints", "tapes"].includes(a[1])) {
    const i = product[a[0]]?.[a[1]]?.findIndex((x) => x.id === a[2]);
    if (i < 0 || i === undefined) return null;
    a[2] = String(i);
  }
  return a.join(".");
}
export function conditionsDocument() {
  return dictionaryFor(template().componentInstances).map((f) => ({
    ...f,
    requiredWhen: /\.(process|material)$/.test(f.parameterId)
      ? "선택 메타데이터"
      : f.parameterId.includes(".tapes.")
        ? "활성 공정 + 존재 확인 + 부착 경로별 필드"
        : componentFor(f.parameterId, template().componentInstances)
          ? "활성 공정 + 존재 확인 (enabled/included는 부재도 입력)"
          : "활성 공정",
  }));
}
