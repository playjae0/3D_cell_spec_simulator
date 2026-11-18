import { fieldsFor } from "./bindings.js";

export const editorGroup = (id) =>
  /^(tool|seal)\./.test(id) ? "pouch" : id.split(".")[0];
export const fieldOwner = (id) => id.replace(/^tool\./, "seal.");

export function editorTargets(product, stage, parts) {
  const fields = fieldsFor(product, stage).filter((b) => b.available);
  const editable = new Set(fields.map((b) => b.partId));
  const options = [];
  for (const [side, label] of Object.entries({
    positive: "양극",
    negative: "음극",
    stack: "적층 조립체",
    pouch: "파우치",
  })) {
    const members = parts.filter((p) => editorGroup(p.id) === side);
    if (!members.length || !fields.some((b) => b.side === side)) continue;
    options.push({ value: side, label });
    for (const p of members) {
      if (p.id === side) continue;
      const calculated = !editable.has(fieldOwner(p.id));
      options.push({
        value: p.id,
        label: "　" + p.name + (calculated ? " · 계산 대상" : ""),
      });
    }
  }
  return options;
}

export function fieldsForTarget(product, stage, target) {
  const side = editorGroup(target);
  return fieldsFor(product, stage).filter(
    (b) =>
      b.available &&
      ((target === side && b.side === side) || b.partId === fieldOwner(target)),
  );
}

export function fieldIdentity(b) {
  return b.itemId ? [b.side, b.section, b.itemId, b.key].join(".") : b.path;
}

export function fieldUnit(b) {
  if (b.unit !== undefined) return b.unit || "무차원/해당 없음";
  if (b.options || b.type === "checkbox") return "해당 없음";
  return /Angle$/.test(b.key) ? "deg" : "mm";
}
