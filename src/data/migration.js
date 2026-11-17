// Explicit migration: no legacy width is discarded without a recorded decision.
export function inspectLegacy(p) {
  if (p?.schemaVersion !== 2 || p.modelVersion !== "pouch-datum-cad-1")
    return null;
  return ["positive", "negative"].map((side) => ({
    side,
    root: p.product[side].tab.rootWidth,
    gathered: p.product[side].tab.width,
  }));
}
export function migrateV2(source, choices) {
  const conflicts = inspectLegacy(source);
  if (!conflicts) throw Error("v1.1 schemaVersion 2 파일만 변환합니다.");
  const p = structuredClone(source);
  p.schemaVersion = 3;
  p.modelVersion = "pouch-process-cad-2";
  p.migration = {
    from: 2,
    originalProduct: structuredClone(source.product),
    widthChoices: {},
  };
  for (const { side, root, gathered } of conflicts) {
    const c = choices[side];
    if (!["root", "gathered", "custom"].includes(c?.source))
      throw Error(side + " 포일 폭을 명시적으로 선택하세요.");
    const width =
      c.source === "root" ? root : c.source === "gathered" ? gathered : c.value;
    if (!Number.isFinite(width) || width <= 0)
      throw Error(side + " 포일 폭은 양수여야 합니다.");
    const pole = p.product[side],
      t = pole.tab;
    p.migration.widthChoices[side] = {
      root,
      gathered,
      selected: width,
      source: c.source,
    };
    t.foilWidth = width;
    t.rootLength = t.gatherDistance + t.length;
    t.axialShortening = 0;
    delete t.rootWidth;
    delete t.width;
    delete t.length;
    pole.prewelds = [];
    pole.preweldLead = { included: false, ...structuredClone(pole.lead) };
    for (const tape of pole.tapes) tape.face ??= "top";
  }
  p.anchors ??= [];
  p.view.autoRebuild = true;
  return p;
}
