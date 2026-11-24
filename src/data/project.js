import { validateTooling } from "../tooling/contract.js";
import { stageContract, assemblyRank } from "./stages.js";
import { validateInspectionViews } from "../annotations/presets.js";
import { productFromIntake } from "../intake/adapter.js";
import demo from "../../examples/demo.json" with { type: "json" };
export const clone = (x) => structuredClone(x);
export const initial = () => ({ ...clone(demo), anchors: [] });
export const stages = Object.fromEntries(
  Object.entries(stageContract).map(([id, c]) => [id, c.label]),
);

export function validateProject(p) {
  validateTooling(p?.product?.processTooling);
  const err = (m) => {
    throw Error(m);
  };
  if (
    (p?.productType !== undefined && p.productType !== "pouch") ||
    ![3, 4].includes(p?.schemaVersion) ||
    p.modelVersion !== "pouch-process-cad-2" ||
    p.unit !== "mm"
  )
    err(
      "지원하지 않는 형식입니다. v0.4 파일은 기준이 달라 자동 변환하지 않습니다.",
    );
  if (
    !stages[p.stage] ||
    typeof p.demo !== "boolean" ||
    typeof p.notes !== "string"
  )
    err("프로젝트 상태/설명 형식 오류");
  const vector = (v) =>
    Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  if (
    !p.datumSet ||
    !vector(p.datumSet.origin) ||
    !Number.isFinite(p.datumSet.rotationZ)
  )
    err("검사 데이텀 형식 오류");
  if (
    !p.view ||
    !Array.isArray(p.view.hidden) ||
    !p.view.hidden.every((x) => typeof x === "string") ||
    typeof p.view.transparent !== "boolean" ||
    (p.view.showDimensions !== undefined &&
      typeof p.view.showDimensions !== "boolean") ||
    (p.view.internalOnly !== undefined &&
      typeof p.view.internalOnly !== "boolean") ||
    typeof p.view.datums !== "boolean" ||
    !["none", "x", "y", "z"].includes(p.view.section?.axis) ||
    !Number.isFinite(p.view.section.position)
  )
    err("표시 상태 형식 오류");
  if (
    p.view.camera &&
    (!vector(p.view.camera.position) ||
      !vector(p.view.camera.target) ||
      !vector(p.view.camera.up) ||
      !Number.isFinite(p.view.camera.zoom) ||
      p.view.camera.zoom <= 0)
  )
    err("카메라 형식 오류");
  const walk = (v, template, path) => {
    for (const [k, t] of Object.entries(template)) {
      const x = v?.[k];
      if (Array.isArray(t)) {
        if (!Array.isArray(x)) err(path + "." + k + " 목록 필요");
        if (t.length) for (const item of x) walk(item, t[0], path + "." + k);
      } else if (t && typeof t === "object") walk(x, t, path + "." + k);
      else if (t !== null && typeof x !== typeof t)
        err(path + "." + k + " 형식 오류");
      else if (typeof t === "number" && !Number.isFinite(x))
        err(path + "." + k + " 유한한 수 필요");
    }
  };
  if (p.schemaVersion === 4 && p.intake) {
    const expected = productFromIntake(p.intake, p.stage);
    const canonical = (v) =>
      v && typeof v === "object"
        ? Array.isArray(v)
          ? v.map(canonical)
          : Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, canonical(v[k])]),
            )
        : v;
    if (
      JSON.stringify(canonical(expected)) !==
      JSON.stringify(canonical(p.product))
    )
      err("입력 양식과 CAD 입력 불일치");
    if (
      p.modelIdentity?.modelId !== p.intake.model.modelId ||
      p.modelIdentity?.revision !== p.intake.model.revision
    )
      err("모델 식별/개정 불일치");
  } else walk(p.product, demo.product, "product");
  const datumIds = new Set(["legacy"]);
  for (const d of p.inspectionDatums || []) {
    if (
      typeof d.id !== "string" ||
      !d.id ||
      datumIds.has(d.id) ||
      !vector(d.origin) ||
      !Number.isFinite(d.rotationZ) ||
      typeof d.name !== "string"
    )
      err("검사 데이텀 ID/좌표 오류");
    datumIds.add(d.id);
  }
  if (p.anchors !== undefined) {
    if (!Array.isArray(p.anchors)) err("표면 기준점 목록 오류");
    const ids = new Set();
    for (const a of p.anchors) {
      if (
        typeof a.id !== "string" ||
        !a.id.startsWith("anchor.") ||
        ids.has(a.id) ||
        typeof a.name !== "string" ||
        typeof a.baseFeatureId !== "string" ||
        (a.mode === "fixed_mm"
          ? !["origin", "u_minus", "u_plus", "v_minus", "v_plus"].includes(
              a.reference,
            ) || ![a.distanceU, a.distanceV].every(Number.isFinite)
          : ![a.u, a.v].every((x) => Number.isFinite(x) && Math.abs(x) <= 1))
      )
        err("표면 기준점 형식 오류");
      ids.add(a.id);
    }
  }
  for (const side of ["positive", "negative"])
    for (const list of ["tapes", "joints", "prewelds"]) {
      const ids = p.product[side][list].map((x) => x.id);
      if (
        new Set(ids).size !== ids.length ||
        ids.some((x) => !/^[-\w]+$/.test(x))
      )
        err(side + "." + list + " ID는 중복 없는 영문/숫자/하이픈");
    }
  if (!Array.isArray(p.measurements) || p.measurements.length > 20000)
    err("측정 목록은 20,000개 이하");
  validateInspectionViews(p.inspectionViews);
  const ids = new Set();
  for (const m of p.measurements) {
    if (
      typeof m.id !== "string" ||
      ids.has(m.id) ||
      typeof m.name !== "string" ||
      typeof m.group !== "string" ||
      !stages[m.stage] ||
      typeof m.visible !== "boolean" ||
      ![
        "distance",
        "x",
        "y",
        "z",
        "thickness",
        "radius",
        "signed_coordinate",
        "signed_offset",
      ].includes(m.mode) ||
      !Number.isFinite(m.offset) ||
      !["x", "y", "z"].includes(m.offsetAxis)
    )
      err("치수 정의 형식 오류");
    ids.add(m.id);
    if (m.mode.startsWith("signed_") && !["x", "y", "z"].includes(m.axis))
      err("부호 치수 축 필요");
    if (m.datumId !== undefined && typeof m.datumId !== "string")
      err("datumId 형식 오류");
    if (
      m.parameterId !== undefined &&
      m.parameterId !== null &&
      typeof m.parameterId !== "string"
    )
      err("parameterId 형식 오류");
    if (
      typeof m.a?.featureId !== "string" ||
      (m.mode !== "radius" && typeof m.b?.featureId !== "string")
    )
      err("치수 기준 ID 필요");
    if (m.conditions !== undefined && typeof m.conditions !== "string")
      err("측정 조건 형식 오류");
    if (!m.spec || typeof m.spec.note !== "string") err("스펙 설명 필요");
    for (const k of ["target", "minus", "plus", "measured"])
      if (m.spec[k] !== null && !Number.isFinite(m.spec[k]))
        err("스펙 숫자 오류");
    if (m.spec.minus < 0 || m.spec.plus < 0) err("공차 크기는 음수 불가");
  }
  return p;
}
export function parseProject(text) {
  if (text.length > 12 * 1024 * 1024)
    throw Error("12 MB 이하 파일만 지원합니다");
  return validateProject(JSON.parse(text));
}
export function measurement(name, a, b, mode, stage, extra = {}) {
  return {
    id: crypto.randomUUID(),
    name,
    group: "기본",
    stage,
    datumId: "legacy",
    mode,
    a: { featureId: a },
    b: { featureId: b },
    visible: true,
    offset: mode === "y" ? 18 : 15,
    offsetAxis: mode === "y" ? "x" : "y",
    spec: { target: null, minus: null, plus: null, measured: null, note: "" },
    ...extra,
  };
}
export function demoMeasurements(stage, product = initial().product) {
  const result = [];
  const add = (name, a, b, mode, group, visible = false) =>
    result.push(measurement(name, a, b, mode, stage, { group, visible }));
  add("조립체 길이", "stack.length.minus", "stack.length.plus", "x", "적층체");
  add(
    "조립체 폭",
    "stack.width.minus",
    "stack.width.plus",
    "y",
    "적층체",
    stage === "stacked",
  );
  add(
    "조립체 두께",
    "stack.thickness.minus",
    "stack.thickness.plus",
    "thickness",
    "적층체",
  );
  for (const side of ["positive", "negative"]) {
    const title = side === "positive" ? "양극" : "음극",
      p = product[side],
      t = side + ".tab.";
    add(
      title + " 포일 일정 폭",
      t + "rootWidthMinus",
      t + "rootWidthPlus",
      "y",
      title + " 포일",
      side === "positive",
    );
    add(
      title + " 뿌리 높이",
      t + "rootZBase",
      t + "root",
      "z",
      title + " 포일",
    );
    if (stage === "stacked") {
      add(
        title + " 집속 전 돌출",
        t + "root",
        t + "stockEnd",
        "x",
        title + " 포일",
      );
      continue;
    }
    add(title + " 집속 거리", t + "root", t + "gather", "x", title + " 집속");
    add(
      title + " 집속 높이",
      t + "gatherZBase",
      t + "gather",
      "z",
      title + " 집속",
    );
    add(
      title + " 집속 두께",
      t + "bottom",
      t + "top",
      "thickness",
      title + " 집속",
    );
    add(
      title + " Y 편심",
      t + "gatherRootY",
      t + "gather",
      "y",
      title + " 집속",
    );
    for (const [list, kind, group, min] of [
      ["prewelds", "preweld", "가용접", 2],
      ["joints", "joint", "메인 용접", 3],
      ["tapes", "tape", "테이프", 4],
    ]) {
      if (assemblyRank(stage) < min) continue;
      for (const item of p[list]) {
        if (!item.enabled) continue;
        const k = side + "." + kind + "." + item.id + ".";
        add(
          title + " " + group + " " + item.id + " 길이",
          k + "start",
          k + "end",
          "x",
          title + " " + group,
        );
        add(
          title + " " + group + " " + item.id + " 폭",
          k + "widthMinus",
          k + "widthPlus",
          "y",
          title + " " + group,
        );
        add(
          title + " " + group + " 시작 위치",
          t + "gather",
          k + "start",
          "x",
          title + " " + group,
        );
        add(
          title + " " + group + " 탭 끝 거리",
          k + "end",
          t + "tipCenter",
          "x",
          title + " " + group,
        );
        add(
          title + " " + group + " 측면 거리",
          k + "widthPlus",
          t + "gatherWidthPlus",
          "y",
          title + " " + group,
        );
        if (kind === "joint")
          add(
            title + " 용접–리드 끝",
            k + "end",
            side + ".lead.end",
            "x",
            title + " " + group,
          );
        if (kind === "tape" && p.joints[0])
          add(
            title + " 테이프–용접 시작",
            side + ".joint." + p.joints[0].id + ".start",
            k + "start",
            "x",
            title + " " + group,
          );
      }
    }
    if (
      assemblyRank(stage) >= 3 ||
      (stage === "preweld" && p.preweldLead.included)
    ) {
      const l = side + ".lead.";
      add(
        title + " 리드 배치",
        t + "gather",
        l + "start",
        "x",
        title + " 리드",
      );
      add(
        title + " 리드 폭",
        l + "widthMinus",
        l + "widthPlus",
        "y",
        title + " 리드",
      );
      add(
        title + " 겹침 길이",
        l + "overlapStart",
        l + "overlapEnd",
        "x",
        title + " 리드",
      );
      add(
        title + " 겹침 폭",
        l + "overlapWidthMinus",
        l + "overlapWidthPlus",
        "y",
        title + " 리드",
      );
      add(
        title + " 조립체 밖 돌출",
        t + "root",
        l + "end",
        "x",
        title + " 리드",
      );
    }
  }
  if (["packaged", "finished"].includes(stage)) {
    add(
      "성형 개구 길이",
      "pouch.forming.x.minus",
      "pouch.forming.x.plus",
      "x",
      "파우치",
      true,
    );
    add(
      "실링 유효 폭",
      "pouch.sealInner.y.plus",
      "pouch.sealOuter.y.plus",
      "y",
      "파우치",
    );
    add("상부 바닥 R", "pouch.upper.floorR", null, "radius", "파우치");
  }
  return result;
}
export class History {
  constructor() {
    this.undoList = [];
    this.redoList = [];
  }
  push(p) {
    this.undoList.push(clone(p));
    if (this.undoList.length > 30) this.undoList.shift();
    this.redoList = [];
  }
  undo(current) {
    if (!this.undoList.length) return null;
    this.redoList.push(clone(current));
    return this.undoList.pop();
  }
  redo(current) {
    if (!this.redoList.length) return null;
    this.undoList.push(clone(current));
    return this.redoList.pop();
  }
}
