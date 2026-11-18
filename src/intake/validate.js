import { validateTooling } from "../tooling/contract.js";
import { assemblyRank, stageContract } from "../data/stages.js";
import { validateInspectionViews } from "../annotations/presets.js";
import Ajv from "ajv/dist/2020.js";
import schema from "./schema.json" with { type: "json" };
import {
  dictionaryFor,
  requiredField,
  legacyUnknownSealant,
  componentFor,
  COMPONENTS,
  STAGES,
  TARGET,
} from "./contract.js";
const validateSchema = new Ajv({ allErrors: true, strict: false }).compile(
  schema,
);
export function validateIntake(input, stage = "stacked") {
  const issues = [],
    rows = [],
    normalized = {};
  const issue = (path, message, parameterId = null, blocking = true) =>
    issues.push({ path, message, parameterId, blocking });
  if (!validateSchema(input)) {
    for (const e of validateSchema.errors.slice(0, 150))
      issue(
        e.instancePath +
          (e.params.additionalProperty
            ? "/" + e.params.additionalProperty
            : ""),
        e.message +
          (e.params.missingProperty ? " · " + e.params.missingProperty : ""),
      );
    return { valid: false, ready: false, issues, rows, normalized };
  }
  if (JSON.stringify(input).length > 12 * 1024 * 1024) {
    issue("/", "파일은 12 MB 이하");
    return { valid: false, ready: false, issues, rows, normalized };
  }
  try {
    validateInspectionViews(input.inspectionViews);
  } catch (e) {
    issue("/inspectionViews", e.message);
  }
  try { validateTooling(input.processTooling); } catch (e) { issue("/processTooling", e.message); }
  const d = input,
    fields = dictionaryFor(d.componentInstances),
    byId = new Map(fields.map((f) => [f.parameterId, f])),
    params = new Map(),
    sources = new Set(),
    instanceKeys = new Set();
  const refs = (rs, path, required = false) => {
    if (required && !rs.length) issue(path, "출처와 문서 내 위치 필요");
    for (const r of rs)
      if (!sources.has(r.sourceId) || !r.locator.trim())
        issue(path, "존재하는 sourceId와 페이지/치수/행 위치 필요");
  };
  for (const s of d.sources) {
    if (sources.has(s.sourceId))
      issue("/sources", "중복 sourceId: " + s.sourceId);
    sources.add(s.sourceId);
  }
  for (const [i, c] of d.componentInstances.entries()) {
    const key = [c.polarity, c.kind, c.instanceId].join(".");
    if (instanceKeys.has(key))
      issue("/componentInstances/" + i, "중복 instanceId: " + key);
    instanceKeys.add(key);
    if (["__proto__", "constructor", "prototype"].includes(c.instanceId))
      issue("/componentInstances/" + i, "사용할 수 없는 ID");
    if (["leadFilm", "preweldLead"].includes(c.kind) && c.instanceId !== c.kind)
      issue("/componentInstances/" + i, "단일 부품 ID는 " + c.kind);
    refs(
      c.sourceRefs,
      "/componentInstances/" + i + "/sourceRefs",
      c.existenceStatus !== "unknown",
    );
  }
  for (const side of ["positive", "negative"])
    for (const [kind, k] of Object.entries(COMPONENTS)) {
      const rank = assemblyRank(stage);
      if (
        !(kind === "leadFilm" && legacyUnknownSealant(d, side, stage)) &&
        rank >= k.min &&
        rank <= (k.max ?? 6) &&
        !d.componentInstances.some(
          (c) => c.polarity === side && c.kind === kind,
        )
      )
        issue(
          "/componentInstances",
          side + "." + kind + ": 존재/부재 확인 항목 필요",
        );
    }
  for (const [i, p] of d.parameters.entries()) {
    if (params.has(p.parameterId))
      issue("/parameters/" + i, "중복 parameterId", p.parameterId);
    params.set(p.parameterId, p);
    const f = byId.get(p.parameterId);
    if (!f) {
      issue(
        "/parameters/" + i,
        "지원하지 않는 parameterId. unmappedRequirements에 기록하세요.",
        p.parameterId,
      );
      continue;
    }
    refs(
      p.sourceRefs,
      "/parameters/" + i + "/sourceRefs",
      ["extracted", "derived"].includes(p.status),
    );
    if (p.value !== null) {
      if (
        typeof p.value !== f.valueType ||
        (typeof p.value === "number" && !Number.isFinite(p.value))
      )
        issue(
          "/parameters/" + i + "/value",
          f.valueType + " 형식의 유한한 값 필요",
          p.parameterId,
        );
      if (f.allowedValues && !f.allowedValues.includes(p.value))
        issue(
          "/parameters/" + i + "/value",
          "허용 값: " + f.allowedValues.join(", "),
          p.parameterId,
        );
    }
    const scale =
      f.unit === "mm" && ["um", "µm", "μm"].includes(p.unit) ? 0.001 : 1;
    if (p.unit !== f.unit && scale === 1)
      issue(
        "/parameters/" + i + "/unit",
        "단위 불일치 · " + (f.unit ?? "단위 없음") + " 필요",
        p.parameterId,
      );
    normalized[p.parameterId] =
      p.value === null
        ? null
        : typeof p.value === "number"
          ? p.value * scale
          : p.value;
  }
  const resolving = new Set(),
    resolved = new Set();
  const resolve = (id) => {
    if (resolved.has(id)) return normalized[id];
    const p = params.get(id);
    if (!p) return undefined;
    if (resolving.has(id)) {
      issue("/parameters", "계산 참조 순환", id);
      return null;
    }
    resolving.add(id);
    if (p.status === "derived") {
      const conv = p.conversion;
      if (!conv) {
        issue("/parameters", "derived에는 허용 계산식 필요", id);
      } else {
        const ids = conv.inputParameterIds,
          vals = ids.map((k) => resolve(k));
        let result;
        if (conv.op === "unit_scale") {
          if (
            ids.length ||
            !["um", "µm", "μm"].includes(p.originalUnit) ||
            !Number.isFinite(p.originalValue) ||
            byId.get(id)?.unit !== "mm"
          )
            issue("/parameters", "unit_scale은 원 단위 µm와 원 숫자 필요", id);
          else result = p.originalValue * 0.001;
        } else if (
          !ids.length ||
          (conv.op === "difference" && ids.length !== 2) ||
          ids.some(
            (k) =>
              !params.has(k) ||
              byId.get(k)?.unit !== byId.get(id)?.unit ||
              params.get(k).reviewStatus !== "reviewed",
          ) ||
          vals.some((v) => typeof v !== "number" || !Number.isFinite(v))
        )
          issue("/parameters", "계산 입력 ID/단위/검토 상태 오류", id);
        else
          result =
            conv.op === "sum"
              ? vals.reduce((a, b) => a + b, 0)
              : vals[0] - vals[1];
        if (result !== undefined) {
          if (Math.abs(result - normalized[id]) > 1e-8)
            issue(
              "/parameters",
              "입력값과 허용 계산식 결과가 다릅니다: " + result,
              id,
            );
          normalized[id] = result;
        }
      }
    } else if (p.conversion !== null)
      issue("/parameters", "변환 근거가 있으면 derived로 지정하세요", id);
    resolving.delete(id);
    resolved.add(id);
    return normalized[id];
  };
  for (const p of d.parameters) resolve(p.parameterId);
  const configured = d.model.modelId && d.model.modelName && d.model.revision;
  if (!configured) issue("/model", "모델 ID/이름/개정 필요");
  if (!STAGES.includes(stage)) issue("/requestedStages", "알 수 없는 공정");
  if (!d.requestedStages.includes(stage))
    issue("/requestedStages", "생성할 공정을 requestedStages에 포함하세요");
  refs(
    d.coordinateMapping.sourceRefs,
    "/coordinateMapping/sourceRefs",
    d.coordinateMapping.mappingStatus === "reviewed",
  );
  if (
    d.coordinateMapping.mappingStatus !== "reviewed" ||
    !d.coordinateMapping.sourceConvention?.trim() ||
    d.coordinateMapping.targetConvention !== TARGET
  )
    issue("/coordinateMapping", "원점·축·극성 매핑 확인 필요");
  for (const side of ["positive", "negative"])
    if (legacyUnknownSealant(d, side, stage))
      issue(
        "/componentInstances",
        side +
          ".leadFilm: 구버전 S3 실런트 미확정 · 생성 제외, 부재로 확정하지 않음. 1.1 새 개정에서 검토 필요",
        side + ".leadFilm.enabled",
        false,
      );
  for (const f of fields) {
    const p = params.get(f.parameterId),
      required = requiredField(f, d, stage),
      c = componentFor(f.parameterId, d.componentInstances);
    let message = "";
    if (required && (!p || p.value === null)) message = "현재 공정 필수값 누락";
    else if (
      required &&
      (p.reviewStatus !== "reviewed" ||
        !["extracted", "derived"].includes(p.status))
    )
      message = "사용자 검토 필요";
    if (required && c) {
      if (c.existenceStatus === "unknown") message = "부품 존재/부재 미확인";
      if (
        /\.(enabled|included)$/.test(f.parameterId) &&
        p?.value !== null &&
        p?.value !== (c.existenceStatus === "present")
      )
        message = "존재 상태와 enabled/included 불일치";
    }
    if (message) issue("/parameters/" + f.parameterId, message, f.parameterId);
    rows.push({
      field: f,
      parameter: p ?? null,
      required,
      normalized: normalized[f.parameterId] ?? null,
      message:
        message ||
        (p?.value === null || !p
          ? "미입력"
          : p.reviewStatus === "reviewed"
            ? "검토됨"
            : "검토 대기"),
    });
  }
  if (
    normalized["positive.end"] !== null &&
    normalized["negative.end"] !== null &&
    normalized["positive.end"] !== -normalized["negative.end"]
  )
    issue(
      "/parameters",
      "양극/음극은 서로 반대쪽 끝이어야 합니다",
      "negative.end",
    );
  for (const c of d.conflicts) {
    refs(c.sourceRefs, "/conflicts");
    issue("/conflicts", c.description, c.parameterId);
    if (!byId.has(c.parameterId))
      issue("/conflicts", "알 수 없는 충돌 parameterId", c.parameterId);
  }
  for (const p of d.parameters)
    if (p.status === "conflict")
      issue("/parameters", "출처 충돌을 해결하세요", p.parameterId);
  for (const x of d.unmappedRequirements) {
    refs(x.sourceRefs, "/unmappedRequirements");
    issue("/unmappedRequirements", x.description, null, false);
  }
  const anchorIds = new Set();
  for (const a of d.anchors || []) {
    if (anchorIds.has(a.id)) issue("/anchors", "중복 표면점 ID: " + a.id);
    anchorIds.add(a.id);
  }
  const datums = new Set(["legacy"]);
  for (const f of d.inspectionDatums || []) {
    if (datums.has(f.id)) issue("/inspectionDatums", "중복 datumId");
    datums.add(f.id);
  }
  const itemIds = new Set();
  for (const item of d.inspectionItems) {
    if (itemIds.has(item.itemId) || !item.itemId)
      issue("/inspectionItems", "중복/빈 itemId");
    itemIds.add(item.itemId);
    refs(item.sourceRefs, "/inspectionItems");
    const def = item.definition;
    if (def.datumId && !datums.has(def.datumId))
      issue("/inspectionItems", "없는 검사 datumId: " + def.datumId);
    if (def.parameterId && !byId.has(def.parameterId))
      issue("/inspectionItems", "없는 parameterId: " + def.parameterId);
    if (def.mode.startsWith("signed_") && !def.axis)
      issue("/inspectionItems", "signed 모드는 axis 필요");
    if (item.unit !== "mm")
      issue("/inspectionItems", "현재 거리/반경 검사는 mm만 지원", null, true);
    if (
      !def.a ||
      (!["radius", "signed_coordinate"].includes(def.mode) && !def.b)
    )
      issue(
        "/inspectionItems",
        "연결되지 않은 검사 기준 · 항목은 보존됩니다: " + item.itemId,
        null,
        false,
      );
  }
  return {
    valid: !issues.some(
      (i) =>
        i.blocking &&
        !i.message.includes("누락") &&
        !i.message.includes("검토") &&
        !i.message.includes("미확인"),
    ),
    ready: !issues.some((i) => i.blocking),
    issues,
    rows,
    normalized,
  };
}
export function reviewParameter(intake, id) {
  const p = intake.parameters.find((p) => p.parameterId === id);
  if (!p) throw Error("없는 parameterId");
  p.reviewStatus = "reviewed";
  (intake.reviewLog ??= []).push({
    parameterId: id,
    action: "user-reviewed",
    at: new Date().toISOString(),
  });
}
