import { fieldsFor, references } from "../data/bindings.js";
import { measurement, demoMeasurements } from "../data/project.js";
import { stableId } from "../intake/contract.js";
import { evaluate } from "./measure.js";
import { canonical } from "./semantics.js";
export function measurementKey(m, includeStage = true) {
  return JSON.stringify(
    canonical({
      stage: includeStage ? m.stage : undefined,
      mode: m.mode,
      axis: m.mode.startsWith("signed_") ? m.axis : undefined,
      datumId: m.datumId || "legacy",
      a: m.a.featureId,
      b: ["radius", "signed_coordinate"].includes(m.mode)
        ? null
        : m.b?.featureId,
    }),
  );
}
export function basicMeasurements(project, data, datumId = "legacy") {
  const candidates = demoMeasurements(project.stage, project.product).map(
    (m) => ({ ...m, datumId }),
  );
  const title = (side) =>
    ({ positive: "양극", negative: "음극", stack: "적층체", pouch: "파우치" })[
      side
    ];
  for (const b of fieldsFor(project.product, project.stage)) {
    if (!b.available || typeof b.value !== "number") continue;
    const refs = references(b, project.product, project.stage);
    if (!refs) continue;
    const signed = /(rootY|gatherY|rootZ|gatherZ|offsetY)$/.test(b.key);
    candidates.push(
      measurement(
        title(b.side) + " " + b.label,
        refs.a.featureId,
        refs.b.featureId || refs.a.featureId,
        signed ? "signed_offset" : refs.mode,
        project.stage,
        {
          datumId,
          axis: /Z$/.test(b.key) ? "z" : "y",
          parameterId: stableId(project.product, b.path),
          group: title(b.side) + " " + b.section,
          visible: false,
        },
      ),
    );
  }
  for (const side of ["positive", "negative"])
    for (const feature of [
      "tab.root",
      "tab.gather",
      "lead.start",
      "lead.end",
      "lead.center",
      "leadFilm.start",
      "leadFilm.end",
    ])
      for (const axis of feature.startsWith("tab.") ? ["y", "z"] : ["x"])
        candidates.push(
          measurement(
            title(side) +
              " " +
              (data.features[side + "." + feature]?.name || feature) +
              " " +
              axis.toUpperCase() +
              " 좌표",
            side + "." + feature,
            side + "." + feature,
            "signed_coordinate",
            project.stage,
            { datumId, axis, group: title(side) + " 위치", visible: false },
          ),
        );
  for (const side of ["positive", "negative"])
    candidates.push(
      measurement(
        title(side) + " 실런트 전체 폭",
        side + ".leadFilm.widthMinus",
        side + ".leadFilm.widthPlus",
        "y",
        project.stage,
        { datumId, group: title(side) + " 실런트", visible: false },
      ),
    );
  for (const item of data.processMetrics || [])
    candidates.push(
      measurement(item.name, item.a, item.b, item.mode, project.stage, {
        datumId,
        parameterId: item.parameterId || null,
        group: item.kind === "input" ? "파우치 생성 치수" : "파우치 계산 결과",
        visible: false,
      }),
    );
  const keys = new Set(project.measurements.map((m) => measurementKey(m))),
    added = [],
    unsupported = [];
  for (const m of candidates) {
    const key = measurementKey(m);
    if (keys.has(key)) continue;
    const result = evaluate(m, data.features, project);
    if (!result.valid) {
      unsupported.push({ name: m.name, reason: result.error });
      continue;
    }
    keys.add(key);
    m.id =
      "set." +
      project.stage +
      "." +
      encodeURIComponent(measurementKey(m, false));
    // IDs include the process; no item silently changes its process definition.
    added.push(m);
  }
  return { added, unsupported };
}
