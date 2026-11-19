import { syncTooling, validateTooling } from "../tooling/contract.js";
import { toolingFromParameters, toolingLayout, toolingFields } from './tooling-fields.js';
import { emptyPouchProcess } from "../data/pouch-fields.js";
import {
  dictionaryFor,
  intakeFields,
  template,
  clone,
  GENERATOR,
  fieldPath,
  stableId,
  COMPONENTS,
} from "./contract.js";
import { validateIntake } from "./validate.js";
export function productFromIntake(intake, stage) {
  const report = validateIntake(intake, stage);
  if (!report.ready)
    throw Error(
      report.issues
        .filter((x) => x.blocking)
        .map((x) => (x.parameterId || x.path) + ": " + x.message)
        .join("\n"),
    );
  const p = {
    id: intake.model.modelId,
    name: intake.model.modelName,
    stack: {},
    pouch: {},
    positive: {
      tab: {},
      lead: {},
      preweldLead: {},
      leadFilm: {},
      prewelds: [],
      joints: [],
      tapes: [],
    },
    negative: {
      tab: {},
      lead: {},
      preweldLead: {},
      leadFilm: {},
      prewelds: [],
      joints: [],
      tapes: [],
    },
  };
  if (intake.parameters.some((f) => f.parameterId.startsWith("pouchProcess.")))
    p.pouchProcess = emptyPouchProcess();
  for (const c of intake.componentInstances) {
    const section = COMPONENTS[c.kind].section;
    if (Array.isArray(p[c.polarity][section]))
      p[c.polarity][section].push({
        id: c.instanceId,
        ...(c.kind === "tape"
          ? { host: "tab" }
          : { kind: c.kind === "preweld" ? "tab_to_tab" : "tab_to_lead" }),
      });
  }
  for (const f of dictionaryFor(intake.componentInstances)) {
    if (f.parameterId.startsWith("pouchProcess.") && !p.pouchProcess) continue;
    const path = fieldPath(p, f.parameterId),
      keys = path.split("."),
      key = keys.pop(),
      host = keys.reduce((o, k) => o[k], p);
    host[key] = report.normalized[f.parameterId] ?? null;
  }
  for (const side of ["positive", "negative"]) {
    const t = p[side].tab;
    t.axialShortening = [
      t.rootLength,
      t.gatherDistance,
      t.gatheredLength,
    ].every(Number.isFinite)
      ? t.rootLength - t.gatherDistance - t.gatheredLength
      : null;
    delete t.gatheredLength;
  }
  if (intake.processTooling) {
    p.processTooling = intake.formatVersion === '1.4' ? toolingFromParameters(intake,report.normalized) : clone(intake.processTooling);
    validateTooling(p.processTooling);
  }
  return p;
}
export function projectFromIntake(intake, stage) {
  return {
    schemaVersion: 4,
    modelVersion: "pouch-process-cad-2",
    unit: "mm",
    demo: intake.demo === true,
    stage,
    notes: "입력 양식 기반 · " + (intake.demo ? "가상 검증값" : "사내 입력값"),
    modelIdentity: {
      ...intake.model,
      intakeVersion: intake.formatVersion,
      generator: intake.generator || GENERATOR,
    },
    intake: clone(intake),
    product: productFromIntake(intake, stage),
    datumSet: clone(intake.legacyDatum || { origin: [0, 0, 0], rotationZ: 0 }),
    inspectionDatums: clone(intake.inspectionDatums || []),
    anchors: clone(intake.anchors || []),
    inspectionViews: clone(intake.inspectionViews || []),
    measurements: intake.inspectionItems.map((x) => ({
      id: x.itemId,
      name: x.name,
      group: x.display?.group ?? "입력 검사 항목",
      stage: x.stage,
      mode: x.definition.mode,
      axis: x.definition.axis,
      datumId: x.definition.datumId || "legacy",
      parameterId: x.definition.parameterId || null,
      conditions: x.conditions || "",
      a: { featureId: x.definition.a || "unmapped." + x.itemId },
      b: { featureId: x.definition.b || "unmapped." + x.itemId },
      visible: x.display?.visible ?? true,
      offset: x.display?.offset ?? 15,
      offsetAxis: x.display?.offsetAxis ?? "y",
      spec: {
        target: x.target,
        minus: x.minus,
        plus: x.plus,
        measured: null,
        note: x.description || "",
      },
    })),
    view: {
      hidden: [],
      transparent: false,
      datums: true,
      section: { axis: "none", position: 0 },
      autoRebuild: true,
    },
  };
}
function inspectionItems(project) {
  return project.measurements.map((m) => ({
    itemId: m.id,
    stage: m.stage,
    name: m.name,
    definition: {
      mode: m.mode,
      datumId: m.datumId || "legacy",
      a: m.a.featureId,
      b: m.b?.featureId ?? null,
      ...(m.axis ? { axis: m.axis } : {}),
      parameterId: m.parameterId || null,
    },
    target: m.spec.target,
    minus: m.spec.minus,
    plus: m.spec.plus,
    unit: "mm",
    sourceRefs: clone(
      project.intake?.inspectionItems.find((x) => x.itemId === m.id)
        ?.sourceRefs || [],
    ),
    description: m.spec.note,
    conditions: m.conditions || "",
    display: {
      group: m.group,
      visible: m.visible,
      offset: m.offset,
      offsetAxis: m.offsetAxis,
    },
  }));
}
export function intakeFromProject(project, identity = {}) {
  if (project.intake) {
    const x = clone(project.intake);
    x.model = { ...x.model, ...identity };
    x.inspectionDatums = clone(project.inspectionDatums || []);
    x.legacyDatum = clone(project.datumSet);
    x.inspectionItems = inspectionItems(project);
    x.anchors = clone(project.anchors || []);
    x.inspectionViews = clone(project.inspectionViews || []);
    return syncTooling(x, project.product);
  }
  const x = template({
    modelId: project.product.id,
    modelName: project.product.name || project.product.id,
    revision: "1",
    ...identity,
  });
  x.demo = project.demo;
  x.sources = [
    {
      sourceId: "legacy-project",
      documentName: "기존 프로젝트 JSON (제품 원문 검증 별도)",
      revision: String(project.schemaVersion),
    },
  ];
  const refs = [{ sourceId: "legacy-project", locator: "product" }];
  x.coordinateMapping = {
    ...x.coordinateMapping,
    sourceConvention: "기존 앱 mm, A/B/C",
    mappingStatus: "reviewed",
    sourceRefs: refs,
  };
  x.componentInstances = [];
  for (const side of ["positive", "negative"])
    for (const [kind, k] of Object.entries(COMPONENTS)) {
      const entries = Array.isArray(project.product[side][k.section])
        ? project.product[side][k.section]
        : [{ id: k.id, ...project.product[side][k.section] }];
      for (const v of entries.length ? entries : [{ id: k.id, enabled: false }])
        x.componentInstances.push({
          polarity: side,
          kind,
          instanceId: v.id,
          existenceStatus: (v.enabled ?? v.included) ? "present" : "absent",
          sourceRefs: refs,
        });
    }
  x.parameters = dictionaryFor(x.componentInstances)
    .filter(
      (f) =>
        !f.parameterId.startsWith("pouchProcess.") ||
        project.product.pouchProcess,
    )
    .map((f) => {
      const path = fieldPath(project.product, f.parameterId);
      let value = path?.split(".").reduce((o, k) => o?.[k], project.product);
      if (f.parameterId.endsWith(".tab.gatheredLength")) {
        const t = project.product[f.parameterId.split(".")[0]].tab;
        value = t.rootLength - t.gatherDistance - t.axialShortening;
      }
      if (value === undefined && f.parameterId.endsWith(".enabled"))
        value = false;
      return {
        parameterId: f.parameterId,
        label: f.label,
        value: value ?? null,
        unit: f.unit,
        status: value == null ? "missing" : "extracted",
        reviewStatus: "reviewed",
        sourceRefs: refs,
        originalText: null,
        conversion: null,
        note: "기존 프로젝트에서 가져옴. 원문 검토는 별도.",
      };
    });
  x.inspectionDatums = clone(project.inspectionDatums || []);
  x.legacyDatum = clone(project.datumSet);
  x.inspectionItems = inspectionItems(project).map((m) => ({
    ...m,
    sourceRefs: refs,
  }));
  x.anchors = clone(project.anchors || []);
  x.inspectionViews = clone(project.inspectionViews || []);
  return syncTooling(x, project.product);
}
// Reconcile only explicit CAD edits. Unknown future inputs remain null.
export function reconcileProject(project) {
  if (!project.intake) return project;
  const x = clone(project),
    sourceId = "manual-edits";
  if(x.intake.formatVersion==='1.4' && x.product.processTooling){
    const layout=toolingLayout(x.product.processTooling),ids=new Set(toolingFields(layout).map(f=>f.parameterId));
    for(const p of x.intake.parameters.filter(p=>p.parameterId.startsWith('processTooling.')&&!ids.has(p.parameterId)))
      (x.intake.reviewLog??=[]).push({parameterId:p.parameterId,action:'user-removed '+JSON.stringify({previous:p}),at:new Date().toISOString()});
    x.intake.parameters=x.intake.parameters.filter(p=>!p.parameterId.startsWith('processTooling.')||ids.has(p.parameterId));
    x.intake.processTooling=layout;
  }
  for (const f of intakeFields(x.intake)) {
    const path = f.tooling ? f.adapterPath : fieldPath(x.product, f.parameterId);
    let value = path?.split(".").reduce((o, k) => o?.[k], x.product);
    if (f.parameterId.endsWith(".tab.gatheredLength")) {
      const t = x.product[f.parameterId.split(".")[0]].tab;
      value = [t.rootLength, t.gatherDistance, t.axialShortening].every(
        Number.isFinite,
      )
        ? t.rootLength - t.gatherDistance - t.axialShortening
        : null;
    }
    const param = x.intake.parameters.find(
        (p) => p.parameterId === f.parameterId,
      ),
      old =
        param?.value == null
          ? null
          : typeof param.value === "number" &&
              ["um", "µm", "μm"].includes(param.unit)
            ? param.value * 0.001
            : param?.value;
    if (value === undefined || value === old) continue;
    if (!x.intake.sources.some((s) => s.sourceId === sourceId))
      x.intake.sources.push({
        sourceId,
        documentName: "앱에서 사용자가 수정",
        revision: x.modelIdentity.revision,
      });
    const changed = {
      ...param,
      parameterId: f.parameterId,
      label: param?.label || f.label,
      value,
      unit: f.unit,
      status: value === null ? "missing" : "extracted",
      reviewStatus: "reviewed",
      sourceRefs: [{ sourceId, locator: f.parameterId }],
      originalText: null,
      originalValue: value,
      originalUnit: f.unit,
      conversion: null,
      note: "이전 출처는 모델 개정/검토 기록에 보존",
    };
    if (param) Object.assign(param, changed);
    else x.intake.parameters.push(changed);
    const c = x.intake.componentInstances.find(
      (c) =>
        f.parameterId ===
        `${c.polarity}.${COMPONENTS[c.kind].section}.` +
          (["preweld", "joint", "tape"].includes(c.kind)
            ? c.instanceId + "."
            : "") +
          (c.kind === "preweldLead" ? "included" : "enabled"),
    );
    if (c && typeof value === "boolean") {
      c.existenceStatus = value ? "present" : "absent";
      c.sourceRefs = changed.sourceRefs;
    }
    (x.intake.reviewLog ??= []).push({
      parameterId: f.parameterId,
      action:
        "user-edited " +
        JSON.stringify({
          previous:
            project.intake.parameters.find(
              (p) => p.parameterId === f.parameterId,
            ) || null,
          value,
        }),
      at: new Date().toISOString(),
    });
  }
  x.intake.inspectionItems = inspectionItems(x);
  x.intake.inspectionDatums = clone(x.inspectionDatums || []);
  x.intake.legacyDatum = clone(x.datumSet);
  x.intake.anchors = clone(x.anchors || []);
  x.intake.inspectionViews = clone(x.inspectionViews || []);
  syncTooling(x.intake, x.product);
  return x;
}
