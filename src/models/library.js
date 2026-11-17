import { assertSampleBasis, definitionDiff } from "../annotations/semantics.js";
import { validateProject } from "../data/project.js";
// Immutable model revisions, incomplete drafts, and observations are separate stores.
import { clone, GENERATOR } from "../intake/contract.js";
export class ModelLibrary {
  constructor(
    data = {
      format: "pouch-model-library",
      version: 1,
      models: [],
      drafts: [],
      samples: [],
    },
  ) {
    if (
      data.format !== "pouch-model-library" ||
      data.version !== 1 ||
      !["models", "drafts", "samples"].every((k) => Array.isArray(data[k]))
    )
      throw Error("모델 목록 형식 오류");
    if (
      data.models.length > 200 ||
      data.samples.length > 100000 ||
      data.drafts.length > 500
    )
      throw Error("모델 목록 크기 제한");
    const modelIds = new Set();
    for (const m of data.models) {
      if (
        !m.modelId ||
        modelIds.has(m.modelId) ||
        !Array.isArray(m.revisions) ||
        !m.revisions.length
      )
        throw Error("중복/잘못된 모델 ID");
      modelIds.add(m.modelId);
      const revIds = new Set();
      for (const r of m.revisions) {
        validateProject(r.project);
        if (
          !r.revision ||
          revIds.has(r.revision) ||
          r.project.modelIdentity?.modelId !== m.modelId ||
          r.project.modelIdentity?.revision !== r.revision
        )
          throw Error("개정 ID/프로젝트 불일치");
        revIds.add(r.revision);
      }
      const byId=new Map(m.revisions.map(r=>[r.revision,r]));
      for(const r of m.revisions){
        if((r.baseRevision??null)!==(r.project.modelIdentity.baseRevision??null))throw Error("기준 개정/프로젝트 불일치");
        const seen=new Set([r.revision]);let parent=r.baseRevision;
        while(parent){if(!byId.has(parent))throw Error("기준 개정 참조 없음: "+parent);if(seen.has(parent))throw Error("개정 부모 참조 순환");seen.add(parent);parent=byId.get(parent).baseRevision;}
      }
    }
    const samples = new Set();
    for (const s of data.samples) {
      const k = JSON.stringify([
        s.sampleId,
        s.modelId,
        s.modelRevision,
        s.itemId,
      ]);
      if (
        samples.has(k) ||
        !Number.isFinite(s.value) ||
        (s.unit !== undefined && s.unit !== "mm") ||
        !data.models
          .find((m) => m.modelId === s.modelId)
          ?.revisions.find((r) => r.revision === s.modelRevision)
          ?.project.measurements.some((m) => m.id === s.itemId)
      )
        throw Error("실측 연결/중복 오류");
      const saved = data.models.find(m => m.modelId === s.modelId).revisions.find(r => r.revision === s.modelRevision).project;
      assertSampleBasis(saved, saved, s);
      samples.add(k);
    }
    const draftKeys=new Set();
    for (const d of data.drafts) {
      if (draftKeys.has(d.key)) throw Error("중복 초안 키");
      draftKeys.add(d.key);
      if (typeof d.key !== "string" || d.intake?.format !== "pouch-cell-intake")
        throw Error("초안 형식 오류");
    }
    this.data = clone(data);
  }
  check(project) {
    validateProject(project);
    const id = project.modelIdentity;
    if (!id?.modelId || !id.revision) throw Error("모델 ID/개정 필요");
    const existing = this.data.models.find((x) => x.modelId === id.modelId);
    if (existing?.revisions.some((r) => r.revision === id.revision))
      throw Error("이미 저장된 개정입니다. 새 개정 번호를 지정하세요.");
    if (
      existing &&
      !existing.revisions.some((r) => r.revision === id.baseRevision)
    )
      throw Error("존재하는 기준 개정 필요");
    if (!existing && id.baseRevision)
      throw Error("신규 모델은 기준 개정이 없어야 합니다");
    return existing;
  }
  commit(project) {
    const existing = this.check(project);
    const id = project.modelIdentity;
    const entry = {
      revision: id.revision,
      baseRevision: id.baseRevision,
      createdAt: new Date().toISOString(),
      generator: GENERATOR,
      project: clone(project),
    };
    if (existing) existing.revisions.push(entry);
    else
      this.data.models.push({
        modelId: id.modelId,
        name: id.modelName,
        revisions: [entry],
      });
    return clone(entry);
  }
  saveDraft(intake) {
    const key = [intake.model.modelId, intake.model.revision].join("@");
    const i = this.data.drafts.findIndex((d) => d.key === key);
    const d = { key, intake: clone(intake), savedAt: new Date().toISOString() };
    if (i < 0) this.data.drafts.push(d);
    else this.data.drafts[i] = d;
  }
  addSample(sample, currentProject = null) {
    if (!sample.sampleId || !Number.isFinite(sample.value))
      throw Error("샘플 ID/유한한 실측값 필요");
    const model = this.data.models.find((m) => m.modelId === sample.modelId),
      rev = model?.revisions.find((r) => r.revision === sample.modelRevision);
    if (!rev?.project.measurements.some((m) => m.id === sample.itemId))
      throw Error("저장된 모델 개정과 검사 itemId 필요");
    const item = assertSampleBasis(rev.project, currentProject || rev.project, sample);
    if(currentProject && currentProject.stage !== item.stage)throw Error("검사 항목의 공정을 연 뒤 실측을 기록하세요.");
    if (
      this.data.samples.some((s) =>
        ["sampleId", "modelId", "modelRevision", "itemId"].every(
          (k) => s[k] === sample[k],
        ),
      )
    )
      throw Error("중복 샘플/검사 항목");
    this.data.samples.push({
      ...clone(sample),
      unit: "mm",
      stage: item.stage,
      recordedAt: new Date().toISOString(),
    });
  }
  snapshot() {
    return clone(this.data);
  }
}
export const revisionDiff = definitionDiff;
// Editing invalidates in-flight responses immediately; cancel never touches active project.
export class PreviewSession {
  constructor(compute) {
    this.compute = compute;
    this.generation = 0;
    this.preview = null;
  }
  invalidate() {
    this.generation++;
    this.preview = null;
  }
  async run(project) {
    const token = ++this.generation;
    this.preview = null;
    try {
      const model = await this.compute(clone(project), token);
      if (token !== this.generation) return null;
      this.preview = { project: clone(project), model, token };
      return this.preview;
    } catch (e) {
      if (token !== this.generation) return null;
      throw e;
    }
  }
  take() {
    if (!this.preview || this.preview.token !== this.generation)
      throw Error("현재 입력의 CAD 미리보기가 필요합니다");
    const p = this.preview;
    this.invalidate();
    return p;
  }
}
