import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export const limits = { file: 16_000_000, count: 511, total: 256_000_000 };

export function checkLimits(files) {
  const bytes = files.reduce((sum, f) => sum + f.bytes, 0);
  const max = files.reduce((a, b) => a.bytes >= b.bytes ? a : b, { path: "", bytes: 0 });
  const errors = files.filter(f => f.bytes > limits.file).map(f => `${f.path}: ${f.bytes} > ${limits.file} bytes`);
  if (files.length > limits.count) errors.push(`Files: ${files.length} > ${limits.count}`);
  if (bytes > limits.total) errors.push(`Total: ${bytes} > ${limits.total} bytes`);
  if (errors.length) throw Error(errors.join("\n"));
  return { files: files.length, bytes, max };
}

export async function checkDirectory(root) {
  const files = [];
  async function visit(relative) {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const path = join(relative, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push({ path, bytes: (await stat(join(root, path))).size });
      else throw Error("Unexpected deployment entry: " + path);
    }
  }
  await visit("");
  return checkLimits(files);
}
