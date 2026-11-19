import { stageIds } from "../data/stages.js";
import { previewExamples } from "./examples.js";
import { designIdentity, sha256 } from "./identity.js";
import { restoreResponse } from "./codec.js";

const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const unavailable = () => Error("기록되지 않은 설계·모델 개정·공정입니다. 로컬 CAD 서버에서 열어주세요.");
const corrupt = message => Error("프리뷰 데이터 로딩 오류 · " + message);
const decode = new TextDecoder("utf-8", { fatal: true });
const validStageTable = table => table && Object.keys(table).length === stageIds.length &&
  stageIds.every(stage => [200, 422].includes(table[stage]));

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`HTTP ${response.status} · ${url.pathname}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadPreview(base) {
  try {
    const manifest = JSON.parse(decode.decode(await fetchBytes(new URL("manifest.json", base))));
    if (manifest.formatVersion !== 1 || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit) ||
        typeof manifest.cadQueryVersion !== "string" || !Number.isFinite(Date.parse(manifest.generatedAt)) ||
        !Array.isArray(manifest.designs) || manifest.designs.length !== Object.keys(previewExamples).length)
      throw Error("매니페스트 형식 불일치");
    const designs = new Map(), names = new Set();
    for (const entry of manifest.designs) {
      if (!Object.hasOwn(previewExamples, entry.name) || names.has(entry.name) ||
          designs.has(entry.designId) || !hash(entry.designId) || !hash(entry.sha256) ||
          entry.file !== entry.name + ".json" || !validStageTable(entry.stages))
        throw Error("설계 매니페스트 항목 오류");
      designs.set(entry.designId, entry);
      names.add(entry.name);
    }
    return new PreviewRecords(manifest, designs, base);
  } catch (error) {
    throw corrupt(error.message);
  }
}

class PreviewRecords {
  constructor(manifest, designs, base) {
    this.manifest = manifest;
    this.designs = designs;
    this.base = base;
    this.files = new Map();
  }

  dataset(design) {
    if (!this.files.has(design.designId)) {
      this.files.set(design.designId, this.readDataset(design).catch(error => {
        this.files.delete(design.designId);
        throw error;
      }));
    }
    return this.files.get(design.designId);
  }

  async readDataset(design) {
    const bytes = await fetchBytes(new URL(design.file, this.base));
    if (sha256(bytes) !== design.sha256) throw Error("설계 파일 해시 불일치");
    const data = JSON.parse(decode.decode(bytes));
    if (data.formatVersion !== 1 || data.designId !== design.designId ||
        !data.parts || Array.isArray(data.parts) || !data.stages ||
        !stageIds.every(stage => data.stages[stage]?.status === design.stages[stage]))
      throw Error("설계 파일 형식 불일치");
    return data;
  }

  async model(project) {
    const design = this.designs.get(sha256(designIdentity(project)));
    if (!design || !Object.hasOwn(design.stages, project.stage)) throw unavailable();
    let result;
    try {
      const data = await this.dataset(design);
      result = JSON.parse(restoreResponse(data.stages[project.stage], data.parts));
      if (design.stages[project.stage] === 422) {
        if (!Array.isArray(result.errors) || !result.errors.length ||
            result.errors.some(error => typeof error !== "string"))
          throw Error("CAD 거부 기록 형식 오류");
      } else if (result.mode !== "live-cad" || result.stage !== project.stage ||
          !hash(result.geometryId) || !Array.isArray(result.parts) ||
          !result.features || !Array.isArray(result.diagnostics)) {
        throw Error("CAD 성공 기록 형식 오류");
      }
    } catch (error) {
      throw corrupt(error.message);
    }
    if (design.stages[project.stage] === 422) throw Error(result.errors.join("\n"));
    return result;
  }
}
