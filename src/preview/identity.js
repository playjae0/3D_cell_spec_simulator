import { sha256 as digest } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function designIdentity(project) {
  return JSON.stringify(canonical({
    schemaVersion: project.schemaVersion,
    modelVersion: project.modelVersion,
    unit: project.unit,
    modelId: project.modelIdentity?.modelId ?? project.product.id,
    modelRevision: project.modelIdentity?.revision ?? project.intake?.model?.revision ?? null,
    product: project.product,
  }));
}

export function sha256(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return bytesToHex(digest(bytes));
}
