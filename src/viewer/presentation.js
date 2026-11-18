// Product skin and tooling have different display and picking semantics.
// Both WebGL and the CPU renderer consume the same material properties.
export const isProductSkin = (id) => /^(pouch|seal)\./.test(id);
export const isTool = (id) => id.startsWith("tool.");
export const canPickPart = (id, internalOnly = false) =>
  !internalOnly || (!isProductSkin(id) && !isTool(id));

export function partAppearance(part, view) {
  const transparent = !!view.transparent && isProductSkin(part.id);
  return {
    transparent,
    opacity: transparent ? (part.id.startsWith("seal.") ? 0.32 : 0.22) : 1,
    depthWrite: !transparent,
  };
}

export function viewAvailability(parts, hidden = []) {
  const visible = parts.filter((p) => !hidden.includes(p.id));
  const shell = visible.some((p) => p.id.startsWith("pouch."));
  const internal = visible.some((p) => canPickPart(p.id, true));
  return {
    transparent: shell,
    internalOnly: internal && visible.some((p) => !canPickPart(p.id, true)),
  };
}
