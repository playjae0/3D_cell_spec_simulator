import { evaluate, datumFor } from "./measure.js";
import { captureInspectionView, applyInspectionView } from "./presets.js";
export function mountInspection({
  getProject,
  getModel,
  viewer,
  onView,
  onSelect,
  notify,
}) {
  const $ = (id) => document.getElementById(id);
  let selectedId = null;
  const modeName = {
    distance: "두 점 직선 거리 (양수)",
    x: "X 투영 거리 (양수)",
    y: "Y 투영 거리 (양수)",
    z: "Z 투영 거리 (양수)",
    signed_coordinate: "검사 원점에서의 부호 좌표",
    signed_offset: "A→B 부호 오프셋",
    thickness: "Z 대응 면 두께",
    radius: "원호 반경",
  };
  function highlight(m, temporary = false) {
    const p = getProject(),
      data = getModel();
    if (!data) return;
    if (!temporary) {
      selectedId = m.id;
      onSelect?.(m);
    }
    const r = evaluate(m, data.features, p),
      d = datumFor(m, p),
      a = data.features[m.a.featureId],
      b = data.features[m.b?.featureId];
    $("inspection-guide").textContent = [
      temporary ? "작성 중인 기준" : "선택한 검사: " + m.name,
      modeName[m.mode] +
        (m.mode.startsWith("signed_") ? " · " + m.axis.toUpperCase() : ""),
      "A: " + (a?.name || m.a.featureId),
      ["radius", "signed_coordinate"].includes(m.mode)
        ? "B: 사용하지 않음"
        : "B: " + (b?.name || m.b?.featureId),
      "검사 프레임: " +
        (m.datumId || "legacy") +
        (d
          ? " · 원점 " +
            d.origin.join(", ") +
            " mm / Z 회전 " +
            d.rotationZ +
            "°"
          : " · 참조 소실"),
      r.valid ? r.value.toFixed(3) + " mm" : r.error,
    ].join("\n");
    if (!r.valid) {
      viewer.setHighlight(null);
      return;
    }
    viewer.select(a?.partId);
    viewer.setHighlight({
      partId: a?.partId,
      partIds: [a?.partId, b?.partId].filter(Boolean),
      label: m.name,
      pending: false,
      guide: {
        measurement: m,
        features: data.features,
        context: p,
        value: r.value,
        mode: m.mode,
        arc: a?.arc,
      },
    });
  }
  function render() {
    const p = getProject(),
      old = $("inspection-view-list").value;
    $("inspection-view-list").replaceChildren(
      ...(p.inspectionViews || []).map(
        (v) =>
          new Option(
            v.name +
              " · " +
              v.owner.modelId +
              " / " +
              (v.owner.revision || "작업본") +
              " / " +
              v.owner.stage,
            v.id,
          ),
      ),
    );
    if ([...$("inspection-view-list").options].some((o) => o.value === old))
      $("inspection-view-list").value = old;
    const host = $("anchor-host"),
      prev = host.value;
    host.replaceChildren(
      ...Object.entries(getModel()?.features || {})
        .filter(([, f]) => f.patch && f.available !== false)
        .map(([id, f]) => new Option(f.name + " · " + id, id)),
    );
    if ([...host.options].some((o) => o.value === prev)) host.value = prev;
  }
  $("inspection-view-save").onclick = () => {
    try {
      const p = getProject();
      const v = captureInspectionView(p, getModel(), {
        name: $("inspection-view-name").value,
        camera: viewer.getCamera(),
        selectedDatumId: $("measurement-datum").value || "legacy",
        selectedMeasurementId: selectedId,
        selectedPartId: viewer.selected,
      });
      p.inspectionViews ??= [];
      if (p.inspectionViews.length >= 100) throw Error("프리셋은 100개 이하");
      p.inspectionViews.push(v);
      render();
      $("inspection-view-list").value = v.id;
      notify(
        "현재 작업에 검사 보기 저장 · JSON 저장 또는 현재 작업 개정 저장으로 보관하세요.",
      );
    } catch (e) {
      notify(e.message, "error");
    }
  };
  $("inspection-view-apply").onclick = () => {
    try {
      const p = getProject(),
        v = p.inspectionViews?.find(
          (x) => x.id === $("inspection-view-list").value,
        );
      if (!v) throw Error("저장한 검사 보기를 선택하세요");
      const r = applyInspectionView(p, getModel(), v);
      onView(r.project, r.selectedPartId);
      selectedId = r.selectedMeasurementId;
      render();
      if (selectedId) {
        const m = r.project.measurements.find((m) => m.id === selectedId);
        if (m) highlight(m);
      }
      notify(
        r.crossModel
          ? "다른 모델/개정의 참조를 확인한 뒤 보기를 적용했습니다."
          : "검사 보기 복원 · 형상과 검사 정의는 유지",
      );
    } catch (e) {
      notify(e.message, "error");
    }
  };
  function related(partId) {
    const host = $("related-inspections");
    host.replaceChildren();
    const p = getProject(),
      f = getModel()?.features || {};
    const matches = p.measurements.filter(
      (m) =>
        m.stage === p.stage &&
        [m.a.featureId, m.b?.featureId].some((id) => f[id]?.partId === partId),
    );
    for (const m of matches.slice(0, 20)) {
      const b = document.createElement("button");
      b.textContent = m.name;
      b.onclick = () => highlight(m);
      host.append(b);
    }
    if (matches.length > 20) {
      const span = document.createElement("span");
      span.textContent =
        "연결 검사 " + matches.length + "개 · 전체 목록에서 검색";
      host.append(span);
    }
  }
  return { render, highlight, related, selected: () => selectedId };
}
