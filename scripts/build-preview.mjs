import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import { stageContract } from "../src/data/stages.js";
import { validateProject } from "../src/data/project.js";
import { reconcileProject } from "../src/intake/adapter.js";
import { rebuildRequest } from "../src/geometry/request.js";
import { previewExamples } from "../src/preview/examples.js";
import { designIdentity, sha256 } from "../src/preview/identity.js";
import { packSuccess, restoreResponse, stripRequestFields } from "../src/preview/codec.js";
import { recordedExamples, stages as prismStages, validate as validatePrism } from "../src/prismatic/project.js";
import { checkDirectory } from "./preview-limits.mjs";

process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim());
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const stages = Object.keys(stageContract);
const work = await mkdtemp(".preview-build-");
const dest = join(work, "site");
let sequence = 0;

async function capture(base, project) {
  const revision = ++sequence;
  const { requestToken, options } = rebuildRequest(project, revision);
  const response = await fetch(base + "/api/rebuild", { ...options, signal: AbortSignal.timeout(180_000) });
  const raw = Buffer.from(await response.arrayBuffer());
  const fail = message => { throw Error(`${project.product.id} / ${project.stage}: ${message}`); };
  if (![200, 422].includes(response.status)) fail(`HTTP ${response.status}: ${decoder.decode(raw)}`);
  const text = decoder.decode(raw);
  assert.deepEqual(Buffer.from(text), raw, "UTF-8 round trip");
  const data = JSON.parse(text);
  if (data.revision !== revision) fail("CAD request revision mismatch");
  if (response.status === 200) {
    if (data.mode !== "live-cad" || data.requestToken !== requestToken || data.stage !== project.stage)
      fail("CAD response does not match the request");
  } else if (!Array.isArray(data.errors) || !data.errors.length ||
      data.errors.some(message => typeof message !== "string" || message.startsWith("CAD 생성 실패:"))) {
    fail("Unexpected CAD failure: " + text);
  }
  return { status: response.status, raw, body: stripRequestFields(text) };
}

async function record(host, health, folder, examples = previewExamples, ids = stages, reconcile = reconcileProject, validate = validateProject) {
  await mkdir(folder, { recursive: true });
  const manifest = {
    formatVersion: 1, sourceCommit: commit, sourceDirty: dirty,
    cadQueryVersion: health.version, generatedAt: new Date().toISOString(), designs: [],
  };
  const stats = [];
  for (const [name, example] of Object.entries(examples)) {
    const original = reconcile(example());
    const designId = sha256(designIdentity(original));
    const dataset = { formatVersion: 1, designId, parts: {}, stages: {} };
    const descriptor = { name, designId, modelId: original.modelIdentity?.modelId ?? original.product.id,
      modelRevision: original.modelIdentity?.revision ?? null, file: name + ".json", stages: {} };
    const originals = new Map();
    let rawBytes = 0, normalizedBytes = 0;
    for (const stage of ids) {
      const project = reconcile({ ...example(), stage });
      validate(project);
      assert.equal(sha256(designIdentity(project)), designId);
      const reply = await capture(host, project);
      rawBytes += reply.raw.length;
      normalizedBytes += Buffer.byteLength(reply.body);
      const record = reply.status === 200
        ? packSuccess(reply.body, dataset.parts, sha256)
        : { body: reply.body };
      dataset.stages[stage] = { status: reply.status, ...record };
      descriptor.stages[stage] = reply.status;
      originals.set(stage, { project, ...reply });
      console.log(`record ${name} / ${stage}: HTTP ${reply.status}`);
    }
    const file = JSON.stringify(dataset);
    descriptor.sha256 = sha256(file);
    await writeFile(join(folder, descriptor.file), file);
    manifest.designs.push(descriptor);
    stats.push({
      name, rawBytes, normalizedBytes, packedBytes: Buffer.byteLength(file),
      rawGzipBytes: gzipSync([...originals.values()].map(x => x.body).join("")).length,
      packedGzipBytes: gzipSync(file).length,
      uniqueParts: Object.keys(dataset.parts).length,
      successes: Object.values(descriptor.stages).filter(s => s === 200).length,
      rejections: Object.values(descriptor.stages).filter(s => s === 422).length,
    });
    // Read the exact deployed representation and re-request every combination.
    const deployed = JSON.parse(await readFile(join(folder, descriptor.file), "utf8"));
    for (const [stage, first] of originals) {
      const again = await capture(host, first.project);
      const restored = Buffer.from(restoreResponse(deployed.stages[stage], deployed.parts));
      assert.equal(again.status, first.status, `${name} / ${stage}: replay status`);
      assert.ok(restored.equals(Buffer.from(first.body)), `${name} / ${stage}: packing round trip differs`);
      assert.ok(restored.equals(Buffer.from(again.body)), `${name} / ${stage}: live replay differs`);
    }
    console.log(`verified ${name}: ${originals.size} live byte comparisons`);
  }
  await writeFile(join(folder, "manifest.json"), JSON.stringify(manifest));
  console.table(stats);
  return stats;
}

async function withServer(task) {
  const python = process.env.POUCH_PYTHON || (process.platform === "win32"
    ? ".venv/Scripts/python.exe" : ".venv/bin/python");
  const executable = process.env.POUCH_PYTHON || await access(python).then(() => python, () => "python");
  const child = spawn(executable, ["-u", "cad/server.py"], {
    env: { ...process.env, POUCH_PORT: "0" }, stdio: ["ignore", "pipe", "inherit"],
  });
  // Install the exit/error listener before any readiness work.
  const closed = new Promise(resolve => child.once("close", resolve));
  let stop;
  try {
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("CAD server readiness timed out")), 30_000);
      stop = () => clearTimeout(timer);
      let output = "";
      child.stdout.on("data", chunk => {
        output += chunk.toString();
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { stop(); resolve(match[0]); }
      });
      child.once("error", reject);
      child.once("exit", code => reject(Error("CAD server exited: " + code)));
    });
    const response = await fetch(base + "/api/health", { signal: AbortSignal.timeout(10_000) });
    assert.ok(response.ok, "CAD health HTTP " + response.status);
    const health = await response.json();
    assert.ok(health.status === "ready" && health.mode === "live-cad" &&
      [3, 4].includes(health.schemaVersion) && health.capabilities.includes("rebuild") &&
      typeof health.version === "string", "Unexpected CAD health response");
    console.log(`Recording ${commit}${dirty ? " (local changes)" : ""} · CadQuery ${health.version}`);
    return await task(base, health);
  } finally {
    stop?.();
    child.kill();
    const force = setTimeout(() => child.kill("SIGKILL"), 5_000);
    await closed;
    clearTimeout(force);
  }
}

async function publish() {
  // Install only after validation and retain an earlier successful build on failure.
  const previous = join(work, "previous");
  const hadPrevious = await rename("dist-preview", previous).then(() => true, error => {
    if (error.code !== "ENOENT") throw error;
    return false;
  });
  try { await rename(dest, "dist-preview"); }
  catch (error) {
    if (hadPrevious) await rename(previous, "dist-preview");
    throw error;
  }
}

try {
  const assets = join(work, "public");
  const stats = await withServer(async (base, health) => [
    ...await record(base, health, join(assets, "preview")),
    ...await record(base, health, join(assets, "prismatic-preview"), recordedExamples, Object.keys(prismStages), p => p, validatePrism),
  ]);
  await build({ mode: "recorded-preview", base: "./", publicDir: assets, build: { outDir: dest } });
  const deployment = await checkDirectory(dest);
  await publish();
  console.log(JSON.stringify({ commit, stats, deployment }, null, 2));
  console.log("Verified static preview: dist-preview/");
} finally {
  await rm(work, { recursive: true, force: true });
}
