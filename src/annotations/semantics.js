// Engineering meaning is independent of camera, labels, colors and dimension layout.
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((k) => value[k] !== undefined)
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export const same = (a, b) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const pick = (v, keys) =>
  Object.fromEntries(keys.map((k) => [k, v?.[k] ?? null]));
const ordered = (xs, key = "id") =>
  [...xs].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
export function geometryDefinition(product) {
  const p = structuredClone(product);
  delete p.id;
  delete p.name;
  for (const side of ["positive", "negative"])
    for (const list of ["prewelds", "joints", "tapes"])
      p[side][list] = ordered(p[side][list] || []);
  return p;
}
export function itemDefinition(m) {
  return {
    itemId: m.id,
    stage: m.stage,
    mode: m.mode,
    axis: m.mode.startsWith("signed_") ? m.axis : null,
    a: m.a?.featureId ?? null,
    b: ["radius", "signed_coordinate"].includes(m.mode)
      ? null
      : (m.b?.featureId ?? null),
    datumId: m.datumId || "legacy",
    unit: "mm",
    ...pick(m.spec, ["target", "minus", "plus"]),
    conditions: m.conditions ?? null,
  };
}
export function anchorDefinition(a) {
  if (!a) return null;
  return {
    id: a.id,
    baseFeatureId: a.baseFeatureId,
    mode: a.mode || "relative",
    ...(a.mode === "fixed_mm"
      ? pick(a, ["reference", "distanceU", "distanceV"])
      : pick(a, ["u", "v"])),
  };
}
export function itemBasis(project, measurement, { tolerance = true } = {}) {
  const d = itemDefinition(measurement);
  if (!tolerance) {
    delete d.target;
    delete d.minus;
    delete d.plus;
  }
  const frame =
    d.datumId === "legacy"
      ? project.datumSet
      : project.inspectionDatums?.find((x) => x.id === d.datumId);
  return {
    definition: d,
    datum: frame
      ? pick(frame, ["origin", "rotationZ"])
      : { missing: d.datumId },
    anchors: [d.a, d.b]
      .filter((id) => id?.startsWith("anchor."))
      .map(
        (id) =>
          anchorDefinition(project.anchors?.find((a) => a.id === id)) || {
            missing: id,
          },
      ),
  };
}
export function inspectionSnapshot(project) {
  return {
    product: geometryDefinition(project.product),
    items: ordered(project.measurements).map((m) => itemBasis(project, m)),
  };
}
export function sameInspection(a, b) {
  return same(inspectionSnapshot(a), inspectionSnapshot(b));
}
export function assertSampleBasis(saved, current, sample) {
  if (!saved || !current || !sameInspection(saved, current))
    throw Error(
      "검사 기준 또는 형상이 저장 개정과 다릅니다. 현재 작업을 새 개정으로 저장한 뒤 실측을 연결하세요.",
    );
  const m = saved.measurements.find((m) => m.id === sample.itemId);
  if (!m || (sample.stage !== undefined && sample.stage !== m.stage))
    throw Error("검사 itemId/공정 연결 오류");
  if (sample.unit !== undefined && sample.unit !== "mm")
    throw Error("실측 단위는 검사 정의와 같은 mm여야 합니다");
  return m;
}

// Intake diff keeps value/source/display categories separate, using stable IDs.
export function definitionDiff(before, after) {
  const rows = [];
  function diff(kind, a, b, id, split) {
    const am = new Map((a || []).map((x) => [id(x), x])),
      bm = new Map((b || []).map((x) => [id(x), x]));
    for (const key of [...new Set([...am.keys(), ...bm.keys()])].sort()) {
      const x = am.get(key),
        y = bm.get(key);
      if (same(x, y)) continue;
      const changes = !x
        ? ["added"]
        : !y
          ? ["removed"]
          : Object.keys(split).filter((k) => !same(split[k](x), split[k](y)));
      if (!changes.length) continue;
      rows.push({
        kind,
        id: key,
        change: !x ? "added" : !y ? "removed" : "changed",
        categories: changes,
        parameterId: kind === "parameter" ? key : undefined,
        before: kind === "parameter" ? (x?.value ?? null) : (x ?? null),
        after: kind === "parameter" ? (y?.value ?? null) : (y ?? null),
        ...(kind === "parameter"
          ? { beforeParameter: x ?? null, afterParameter: y ?? null }
          : {}),
      });
    }
  }
  const origin = (x) => pick(x, ["origin", "rotationZ"]);
  diff(
    "parameter",
    before?.parameters,
    after?.parameters,
    (x) => x.parameterId,
    {
      value: (x) => pick(x, ["value", "unit"]),
      source: (x) => ({
        ...pick(x, [
          "originalValue",
          "originalUnit",
          "originalText",
          "conversion",
          "status",
          "reviewStatus",
        ]),
        sourceRefs: [...(x.sourceRefs || [])].sort((a, b) =>
          JSON.stringify(canonical(a)).localeCompare(
            JSON.stringify(canonical(b)),
          ),
        ),
      }),
      description: (x) => pick(x, ["label", "note"]),
    },
  );
  const datums = (x) =>
    x
      ? [
          {
            ...(x.legacyDatum || { origin: [0, 0, 0], rotationZ: 0 }),
            id: "legacy",
          },
          ...(x.inspectionDatums || []),
        ]
      : [];
  diff("datum", datums(before), datums(after), (x) => x.id, {
    definition: origin,
    display: (x) => pick(x, ["name", "visible"]),
  });
  diff("anchor", before?.anchors, after?.anchors, (x) => x.id, {
    definition: anchorDefinition,
    description: (x) => x.name,
  });
  diff(
    "inspectionItem",
    before?.inspectionItems,
    after?.inspectionItems,
    (x) => x.itemId,
    {
      definition: (x) =>
        pick(x, [
          "stage",
          "definition",
          "target",
          "minus",
          "plus",
          "unit",
          "conditions",
        ]),
      source: (x) =>
        ordered(
          (x.sourceRefs || []).map((y) => ({
            ...y,
            id: y.sourceId + "/" + y.locator,
          })),
        ),
      display: (x) => pick(x, ["display", "name"]),
      description: (x) => x.description,
    },
  );
  diff(
    "component",
    before?.componentInstances,
    after?.componentInstances,
    (x) => [x.polarity, x.kind, x.instanceId].join("."),
    {
      existence: (x) => x.existenceStatus,
      source: (x) =>
        ordered(
          (x.sourceRefs || []).map((y) => ({
            ...y,
            id: y.sourceId + "/" + y.locator,
          })),
        ),
    },
  );
  diff("source", before?.sources, after?.sources, (x) => x.sourceId, {
    source: (x) => x,
  });
  return rows;
}
