import { initial } from "../data/project.js";
import pouch from "../../examples/pouch-process.json" with { type: "json" };
import tooling from "../../examples/process-tooling-r4.json" with { type: "json" };

// The recorder and app use the same allowlist. No file enumeration or saved models.
export const previewExamples = {
  demo: initial,
  "pouch-process": () => structuredClone(pouch),
  "process-tooling-r4": () => structuredClone(tooling),
};
