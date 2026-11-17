export function datumFor(m, context) {
  if (!context?.datumSet) return context || { origin: [0, 0, 0], rotationZ: 0 };
  if (!m.datumId || m.datumId === "legacy") return context.datumSet;
  return context.inspectionDatums?.find((d) => d.id === m.datumId) || null;
}
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
export function datumPoint(p, datum) {
  const v = sub(p, datum.origin),
    a = (-datum.rotationZ * Math.PI) / 180;
  return [
    v[0] * Math.cos(a) - v[1] * Math.sin(a),
    v[0] * Math.sin(a) + v[1] * Math.cos(a),
    v[2],
  ];
}
export function worldVector(p, datum) {
  const a = (datum.rotationZ * Math.PI) / 180;
  return [
    p[0] * Math.cos(a) - p[1] * Math.sin(a),
    p[0] * Math.sin(a) + p[1] * Math.cos(a),
    p[2],
  ];
}
export function evaluate(
  m,
  features,
  datum = { origin: [0, 0, 0], rotationZ: 0 },
) {
  if (datum?.stage && m.stage && m.stage !== datum.stage)
    return {
      valid: false,
      code: "stage_absent",
      error: "검사 항목의 공정과 현재 공정이 다릅니다 · 기준 ID 보존",
    };
  datum = datumFor(m, datum);
  if (!datum)
    return { valid: false, error: "검사 datumId가 없음 · 재선택 필요" };
  const single = ["radius", "signed_coordinate"].includes(m.mode);
  const a = features[m.a?.featureId],
    b = features[m.b?.featureId];
  if (a?.available === false || (!single && b?.available === false))
    return {
      valid: false,
      code: (a?.available === false ? a : b).reasonCode || "stage_absent",
      error:
        (a?.available === false ? a : b).reason ||
        "해당 상태에서 사용 불가 · 원래 부품/기준 ID 보존",
    };
  if (!a || (!single && !b))
    return {
      valid: false,
      code: "reference_lost",
      error: "참조가 없음 · 재선택 필요",
    };
  if (m.mode === "radius")
    return a.kind === "radius"
      ? { valid: true, value: a.value, a: a.center, b: a.point }
      : { valid: false, error: "반경 feature를 선택하세요" };
  const axis = ["x", "y", "z"].indexOf(m.axis);
  if (m.mode.startsWith("signed_") && axis < 0)
    return { valid: false, error: "부호 좌표/오프셋의 축 필요" };
  if (m.mode === "signed_coordinate")
    return {
      valid: true,
      value: datumPoint(a.point, datum)[axis],
      a: datum.origin,
      b: a.point,
    };
  const d = sub(datumPoint(b.point, datum), datumPoint(a.point, datum));
  if (m.mode === "signed_offset")
    return { valid: true, value: d[axis], a: a.point, b: b.point };
  let value;
  if (m.mode === "thickness") {
    if (
      a.partId !== b.partId ||
      a.kind !== "face" ||
      b.kind !== "face" ||
      Math.hypot(d[0], d[1]) > 1e-5 ||
      Math.abs(d[2]) < 1e-8 ||
      Math.abs(a.normal?.[2] || 0) !== 1 ||
      a.normal[2] !== -b.normal?.[2]
    )
      return {
        valid: false,
        error: "두께는 같은 부품의 Z 대응 면 중심을 선택하세요",
      };
    value = Math.abs(d[2]);
  } else
    value =
      m.mode === "distance"
        ? Math.hypot(...d)
        : Math.abs(d[["x", "y", "z"].indexOf(m.mode)]);
  return { valid: Number.isFinite(value), value, a: a.point, b: b.point };
}
export function dimensionLayout(m, features, datum) {
  const result = evaluate(m, features, datum);
  if (!result.valid) return null;
  datum = datumFor(m, datum);
  const { a, b } = result;
  let c = [...a],
    d = [...b];
  const index = ["x", "y", "z"].indexOf(
    m.mode.startsWith("signed_")
      ? m.axis
      : m.mode === "thickness"
        ? "z"
        : m.mode,
  );
  if (index >= 0) {
    const av = datumPoint(a, datum),
      bv = datumPoint(b, datum),
      v = [0, 0, 0];
    v[index] = bv[index] - av[index];
    d = add(c, worldVector(v, datum));
  }
  const off = [0, 0, 0];
  off[["x", "y", "z"].indexOf(m.offsetAxis)] = m.offset;
  const v = worldVector(off, datum);
  c = add(c, v);
  d = add(d, v);
  if (m.mode === "radius")
    return { ...result, c: a, d: b, label: add(b, v), leader: [b, add(b, v)] };
  return { ...result, c, d, label: c.map((v, i) => (v + d[i]) / 2) };
}
export function inspection(m) {
  const s = m.spec;
  if (
    s.measured === null ||
    s.target === null ||
    s.minus === null ||
    s.plus === null
  )
    return "실측 판정 없음";
  return s.measured >= s.target - s.minus && s.measured <= s.target + s.plus
    ? "공차 내"
    : "공차 이탈";
}
