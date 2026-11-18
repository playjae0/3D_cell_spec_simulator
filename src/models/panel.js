import { planLibraryMerge } from "./merge.js";
import { LibraryStorage } from "./storage.js";
import { assertSampleBasis } from "../annotations/semantics.js";
import {
  template,
  VERSION,
  clone,
  STAGES,
  GENERATOR,
  dictionaryFor,
  fieldPath,
} from "../intake/contract.js";
import { validateIntake, reviewParameter } from "../intake/validate.js";
import { projectFromIntake, intakeFromProject } from "../intake/adapter.js";
import { ModelLibrary, PreviewSession, revisionDiff } from "./library.js";
import { Viewer } from "../viewer/viewer.js";
import { evaluate } from "../annotations/measure.js";
import { withAnchors } from "../annotations/anchors.js";
import { rebuild } from "../geometry/client.js";
import { stages } from "../data/project.js";
import { bindingFor, forecast } from "../data/bindings.js";
import "./panel.css";
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
const download = (x, name) => {
  const u = URL.createObjectURL(
      new Blob([JSON.stringify(x, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
};
export function mountModels({ getProject, canOpen, onApply, onGuide, notify }) {
  const storage = new LibraryStorage(localStorage);
  let library = storage.library,
    storageError = storage.error,
    mergeSource = null,
    mergeChoices = new Map(),
    mergePlan = null;
  let intake = null,
    report = null,
    selectedId = null,
    previewViewer = null,
    prior = null;
  const session = new PreviewSession(rebuild),
    dialog = document.createElement("dialog");
  dialog.id = "models-dialog";
  dialog.innerHTML = `<div class="intake-header"><div><h2>모델 · 입력 양식 검토</h2><p>전체 CAD 프로그램 v1.5 · 임시 미리보기는 적용 전까지 현재 작업과 분리됩니다.</p></div><button id="intake-close">닫기 / 취소</button></div>
 <div class="intake-toolbar"><button id="model-new">신규 모델</button><button id="model-revise">현재 모델 새 개정</button><button id="model-copy">다른 모델로 복사</button><button id="model-register">현재 작업 개정 저장</button><button id="library-save">전체 보관함 백업 내보내기</button><button id="intake-upload">입력 양식 / 보관함 가져오기</button><input hidden id="intake-file" type="file" accept=".json"></div>
 <p class="small">상단 ‘셀 JSON 저장’은 현재 셀 한 개입니다. ‘전체 보관함 백업’은 저장된 모든 모델·개정·초안·실측입니다. 미저장 작업은 먼저 개정 저장 또는 셀 JSON으로 보관하세요.</p>
 <section id="library-recovery" hidden><p id="storage-error" role="alert"></p><button id="storage-raw">손상 원본 파일로 백업</button><button id="storage-recover">원본을 별도 보존하고 빈 보관함 복구</button></section>
 <details id="storage-history" hidden><summary>보존된 복구 원본</summary><select id="storage-backups"></select><button id="storage-export-backup">선택 원본 다운로드</button></details>
 <section id="library-merge" hidden><h3>보관함 병합 검토</h3><pre id="merge-summary"></pre><div id="merge-conflicts"></div><button id="merge-apply" disabled>검토한 병합 적용 · 기존 내용 유지</button><button id="merge-cancel">병합 취소</button></section>
 <details><summary>저장된 모델·개정 / 미완성 초안</summary><div id="model-list"></div></details>
 <p id="intake-message" role="status"></p><div id="intake-work" hidden>
 <div class="intake-toolbar"><label>생성 공정<select id="intake-stage"></select></label><button id="intake-template">현재 공정 빈 양식</button><button id="intake-template-all">전체 빈 양식</button><button id="intake-draft">초안 저장·다운로드</button><button id="intake-preview">임시 CAD 생성</button><button id="intake-apply" disabled>새 모델/개정 적용</button></div>
 <details><summary>입력 JSON 수정 · 모델 ID/개정/출처 포함</summary><textarea id="intake-json" spellcheck="false" rows="12"></textarea><button id="intake-json-apply">JSON 수정 반영 · 재검증</button></details>
 <div class="intake-grid"><div><div class="intake-toolbar"><label><input type="checkbox" id="intake-required" checked> 현재 공정 필수 항목만</label><input id="intake-search" placeholder="이름 / parameterId 검색"></div><div id="intake-errors"></div><div class="intake-table"><table><thead><tr><th>항목 · ID</th><th>원문값 / 단위</th><th>정규화</th><th>상태</th></tr></thead><tbody id="intake-rows"></tbody></table></div><pre id="intake-detail">항목을 선택하면 기준·출처와 3D 가이드를 표시합니다.</pre><button id="intake-review">선택 항목을 사용자 검토 완료로 기록</button><details><summary>기준 개정과 입력·검사·출처·표시 차이</summary><pre id="intake-diff"></pre></details></div>
 <div><p id="intake-preview-label">임시 CAD 미생성</p><div id="intake-viewport"></div><div class="intake-toolbar"><button data-intake-view="front">정면</button><button data-intake-view="side">측면</button><button data-intake-view="iso">입체</button><button id="intake-section">Y 단면</button></div><p class="small">사내 실물 검증 전입니다. 형상 해석과 부품 연결은 기존 CAD 엔진을 사용합니다.</p></div></div></div>
 <details><summary>실측 샘플 · 설계 형상과 별도 저장</summary><p>저장된 모델 개정의 검사 항목에 여러 샘플을 연결합니다.</p><div class="intake-toolbar"><label>샘플 ID<input id="sample-id" placeholder="sample-001"></label><label>검사 itemId<select id="sample-item"></select></label><label>실측 mm<input id="sample-value" type="number" step="any"></label><button id="sample-add">현재 개정에 실측 추가</button></div><pre id="sample-list"></pre></details>`;
  document.body.append(dialog);
  const $ = (id) => dialog.querySelector("#" + id);
  for (const s of STAGES) $("intake-stage").append(new Option(stages[s], s));
  function say(s) {
    $("intake-message").textContent = s;
  }
  function persist(next) {
    library = storage.save(next);
  }
  function downloadText(text, name) {
    const u = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  function renderStorage() {
    $("library-recovery").hidden = !storage.blocked;
    $("storage-error").textContent = storage.error;
    $("library-save").disabled = storage.blocked;
    const backups = storage.backups();
    $("storage-history").hidden = !backups.length;
    $("storage-backups").replaceChildren(
      ...backups.map((k) => new Option(k, k)),
    );
  }
  $("storage-raw").onclick = () => {
    if (storage.raw !== null)
      downloadText(storage.raw, "pouch-library-recovery-original.json");
    else say("원본을 읽을 수 없어 다운로드할 수 없습니다.");
  };
  $("storage-recover").onclick = () => {
    try {
      const backup = storage.recover();
      library = storage.library;
      storageError = "";
      renderLibrary();
      say("원본은 별도 키에 보존했습니다: " + backup);
    } catch (e) {
      say("복구 실패 · 원본 유지: " + e.message);
    }
  };
  $("storage-export-backup").onclick = () => {
    try {
      downloadText(
        storage.backup($("storage-backups").value),
        "pouch-library-recovery-original.json",
      );
    } catch (e) {
      say(e.message);
    }
  };
  function renderMerge() {
    if (!mergeSource) return;
    $("library-merge").hidden = false;
    $("merge-apply").disabled = true;
    try {
      mergePlan = planLibraryMerge(library, mergeSource, mergeChoices);
      const s = mergePlan.summary;
      $("merge-summary").textContent =
        `추가: 모델 ${s.addedModels}, 개정 ${s.addedRevisions}, 실측 ${s.addedSamples}, 초안 ${s.addedDrafts}\n동일 중복 건너뛰기: 개정 ${s.duplicateRevisions}, 실측 ${s.duplicateSamples}, 초안 ${s.duplicateDrafts}\n사용자 제외: ${s.skipped} · 미해결 충돌 ${mergePlan.unresolved.length}\n기존 목록은 적용 전까지 바뀌지 않습니다.`;
      $("merge-conflicts").replaceChildren();
      for (const c of mergePlan.conflicts) {
        const block = document.createElement("div"),
          label = document.createElement("p"),
          sel = document.createElement("select"),
          target = document.createElement("input");
        label.textContent = c.label;
        sel.setAttribute("aria-label", c.label);
        sel.append(new Option("충돌 처리 선택 (필수)", ""));
        for (const action of c.options)
          sel.append(
            new Option(
              {
                skip: "기존 유지 · 이 입력 제외",
                copy_model: "새 모델 ID로 복사",
                copy_revisions: "새 개정 가지로 복사 · 부모/샘플 함께 매핑",
                rename:
                  c.type === "draft"
                    ? "새 초안 개정으로 복사"
                    : "새 샘플 ID로 복사",
              }[action],
              action,
            ),
          );
        const choice = mergeChoices.get(c.key);
        sel.value = choice?.action || "";
        target.placeholder = "새 ID/개정 접미사 (비우면 충돌 없는 이름)";
        target.value = choice?.target || "";
        target.setAttribute("aria-label", c.label + " 새 식별자");
        const change = () => {
          if (sel.value)
            mergeChoices.set(c.key, {
              action: sel.value,
              target: target.value,
            });
          else mergeChoices.delete(c.key);
          renderMerge();
        };
        sel.onchange = change;
        target.onchange = change;
        block.append(label, sel, target);
        $("merge-conflicts").append(block);
      }
      $("merge-apply").disabled = !mergePlan.candidate || storage.blocked;
    } catch (e) {
      mergePlan = null;
      $("merge-summary").textContent =
        "병합 검토 오류 · 원본 유지: " + e.message;
    }
  }
  $("merge-cancel").onclick = () => {
    mergeSource = null;
    mergePlan = null;
    mergeChoices.clear();
    $("library-merge").hidden = true;
    say("병합 취소 · 기존 보관함 유지");
  };
  $("merge-apply").onclick = () => {
    try {
      const plan = planLibraryMerge(library, mergeSource, mergeChoices);
      if (!plan.candidate) throw Error("모든 충돌을 먼저 검토하세요");
      persist(plan.candidate);
      mergeSource = null;
      mergePlan = null;
      $("library-merge").hidden = true;
      renderLibrary();
      say("보관함 병합 저장 완료 · 활성 셀과 기존 개정은 유지했습니다.");
    } catch (e) {
      say(e.message);
    }
  };
  function renderLibrary() {
    renderStorage();
    const host = $("model-list");
    host.replaceChildren();
    for (const m of library.data.models)
      for (const r of m.revisions) {
        const b = document.createElement("button");
        b.textContent = m.name + " · " + m.modelId + " / " + r.revision;
        b.onclick = () => {
          if (!canOpen()) return say("현재 CAD 작업 완료 후 여세요.");
          const x = intakeFromProject(r.project, {
            revision: r.revision + "-next",
            baseRevision: r.revision,
          });
          openIntake(x, r.project);
        };
        host.append(b);
        const view = document.createElement("button");
        view.textContent = "저장 개정 열기";
        view.onclick = async () => {
          try {
            session.invalidate();
            say("저장 개정 CAD 확인 중…");
            const project = clone(r.project),
              result = await session.run(project);
            if (result) {
              onApply(project, result.model, false);
              session.invalidate();
              dialog.close();
            }
          } catch (e) {
            say(e.message);
          }
        };
        host.append(view);
      }
    for (const d of library.data.drafts) {
      const b = document.createElement("button");
      b.textContent = "초안 · " + d.key;
      b.onclick = () => openIntake(d.intake);
      host.append(b);
    }
    const p = getProject();
    const previousItem = $("sample-item").value;
    $("sample-item").replaceChildren(
      ...p.measurements
        .filter((m) => m.stage === p.stage)
        .map((m) => new Option(m.name + " · " + m.id, m.id)),
    );
    if (p.measurements.some((m) => m.id === previousItem))
      $("sample-item").value = previousItem;
    $("sample-list").textContent = JSON.stringify(
      library.data.samples.filter(
        (s) =>
          s.modelId === p.modelIdentity?.modelId &&
          s.modelRevision === p.modelIdentity?.revision,
      ),
      null,
      2,
    );
  }
  function invalidate() {
    session.invalidate();
    $("intake-viewport").style.visibility = "hidden";
    $("intake-apply").disabled = true;
    $("intake-preview-label").textContent =
      "입력이 변경되었습니다 · CAD 재생성 필요";
  }
  function renderReview() {
    if (!intake) return;
    report = validateIntake(intake, $("intake-stage").value);
    $("intake-preview").disabled = !report.ready;
    $("intake-json").value = JSON.stringify(intake, null, 2);
    $("intake-errors").replaceChildren();
    for (const e of report.issues.slice(0, 120)) {
      const b = document.createElement("button");
      b.className = e.blocking ? "intake-error" : "intake-warning";
      b.textContent = (e.parameterId || e.path) + ": " + e.message;
      b.onclick = () => {
        if (e.parameterId) selectRow(e.parameterId);
        else $("intake-json").closest("details").open = true;
      };
      $("intake-errors").append(b);
    }
    const query = $("intake-search").value.toLowerCase();
    $("intake-rows").replaceChildren();
    for (const row of report.rows.filter(
      (r) =>
        (!$("intake-required").checked || r.required) &&
        (!query ||
          [r.field.parameterId, r.field.label]
            .join(" ")
            .toLowerCase()
            .includes(query)),
    )) {
      const p = row.parameter,
        tr = document.createElement("tr");
      tr.dataset.parameter = row.field.parameterId;
      tr.tabIndex = 0;
      tr.innerHTML = `<td>${esc(p?.label || row.field.label)}<small>${esc(row.field.parameterId)}</small></td><td>${esc(p?.originalValue ?? p?.value ?? "미입력")} ${esc(p?.originalUnit ?? p?.unit)}</td><td>${esc(row.normalized ?? "—")} ${esc(row.field.unit)}</td><td>${esc(row.message)}</td>`;
      tr.onclick = () => selectRow(row.field.parameterId);
      tr.onkeydown = (e) => {
        if (e.key === "Enter") selectRow(row.field.parameterId);
      };
      $("intake-rows").append(tr);
    }
    $("intake-diff").textContent = Array.isArray(intake.parameters)
      ? JSON.stringify(
          revisionDiff(
            prior?.intake || (prior ? intakeFromProject(prior) : null),
            intake,
          ),
          null,
          2,
        )
      : "입력 구조 확인 필요";
    say(
      `${intake.model?.modelName || "미입력 모델"} / ${intake.model?.revision || "개정 미입력"} · ${report.ready ? "선택 공정 CAD 생성 가능" : "필수값·기준·출처를 확인하세요"} · ${intake.demo ? "가상 검증값" : "사용자 입력 (실물 검증 별도)"}`,
    );
  }
  function selectRow(id) {
    selectedId = id;
    const row = report.rows.find((r) => r.field.parameterId === id);
    if (!row) return;
    $("intake-detail").textContent = JSON.stringify(
      {
        parameterId: id,
        basis: row.field.basis,
        normalized: row.normalized,
        normalizedUnit: row.field.unit,
        ...row.parameter,
      },
      null,
      2,
    );
    for (const tr of $("intake-rows").children)
      tr.classList.toggle("selected", tr.dataset.parameter === id);
    const p = session.preview?.project || getProject(),
      path = fieldPath(p.product, id);
    if (!path) return;
    const b = bindingFor(p.product, p.stage, path);
    if (session.preview && b) {
      previewViewer.select(b.partId);
      previewViewer.setHighlight({
        partId: b.partId,
        guide: forecast(b, p.product, p.stage),
        label: b.label,
        pending: false,
        path: b.path,
      });
    } else onGuide(path);
  }
  function openIntake(x, base = null) {
    if (!canOpen())
      return notify(
        "현재 미적용 입력을 적용하거나 되돌린 뒤 모델 관리를 여세요.",
      );
    invalidate();
    intake = clone(x);
    prior = base;
    selectedId = null;
    if (x.format !== "pouch-cell-intake") {
      say(
        "pouch-cell-intake/1.2 (구버전 1.0/1.1 호환) 양식이 필요합니다. 기존 프로젝트는 상단 JSON 열기를 이용하세요.",
      );
      return;
    }
    if (!prior && intake.model?.baseRevision)
      prior =
        library.data.models
          .find((m) => m.modelId === intake.model.modelId)
          ?.revisions.find((r) => r.revision === intake.model.baseRevision)
          ?.project || null;
    $("intake-work").hidden = false;
    $("intake-stage").value = STAGES.includes(x.requestedStages?.[0])
      ? x.requestedStages[0]
      : "stacked";
    renderLibrary();
    renderReview();
    if (!dialog.open) dialog.showModal();
  }
  $("intake-close").onclick = () => {
    invalidate();
    mergeSource = null;
    mergePlan = null;
    $("library-merge").hidden = true;
    dialog.close();
  };
  dialog.addEventListener("cancel", () => {
    invalidate();
    mergeSource = null;
    mergePlan = null;
    $("library-merge").hidden = true;
  });
  $("intake-stage").onchange = () => {
    invalidate();
    renderReview();
  };
  $("intake-required").onchange = renderReview;
  $("intake-search").oninput = renderReview;
  $("intake-json").oninput = () => {
    invalidate();
    $("intake-preview").disabled = true;
  };
  $("intake-json-apply").onclick = () => {
    try {
      const x = JSON.parse($("intake-json").value);
      if (!x || typeof x !== "object" || !x.model)
        throw Error("intake/model 객체가 필요합니다");
      invalidate();
      intake = x;
      renderReview();
    } catch (e) {
      say(e.message);
    }
  };
  $("intake-review").onclick = () => {
    try {
      if (!selectedId) throw Error("검토할 항목을 선택하세요");
      reviewParameter(intake, selectedId);
      invalidate();
      renderReview();
      selectRow(selectedId);
    } catch (e) {
      say(e.message);
    }
  };
  $("intake-draft").onclick = () => {
    try {
      const next = new ModelLibrary(library.snapshot());
      next.saveDraft(intake);
      persist(next);
      download(
        intake,
        (intake.model?.modelId || "unnamed") + "-intake-draft.json",
      );
      renderLibrary();
      say("미완성 초안 저장 · CAD 완료 개정과 구분");
    } catch (e) {
      say(e.message);
    }
  };
  for (const [id, scope] of [
    ["intake-template", false],
    ["intake-template-all", true],
  ])
    $(id).onclick = () =>
      download(
        template(intake.model, scope ? STAGES : [$("intake-stage").value]),
        scope
          ? "cell-intake-" + VERSION + "-all.json"
          : "cell-intake-" + VERSION + "-" + $("intake-stage").value + ".json",
      );
  $("intake-preview").onclick = async () => {
    try {
      const project = projectFromIntake(intake, $("intake-stage").value);
      if (prior) {
        project.view = clone(prior.view);
        project.view.camera = undefined;
      }
      say("임시 CAD 계산 중 · 현재 모델과 이력은 유지됩니다.");
      $("intake-apply").disabled = true;
      const result = await session.run(project);
      if (!result) return;
      if (!previewViewer)
        previewViewer = new Viewer($("intake-viewport"), {
          onSelect: (id) => previewViewer.select(id),
          onPick: () => {},
          onAnchor: () => {},
          onCamera: () => {},
        });
      result.model = withAnchors(result.model, project.anchors);
      $("intake-viewport").style.visibility = "visible";
      previewViewer.setModel(result.model, project);
      previewViewer.fit();
      previewViewer.view("iso");
      $("intake-preview-label").textContent =
        "임시 CAD · " +
        intake.model.modelId +
        " / " +
        intake.model.revision +
        " · " +
        stages[project.stage];
      $("intake-apply").disabled = false;
      const warnings = project.measurements
        .filter((m) => m.stage === project.stage)
        .flatMap((m) => {
          const v = evaluate(m, result.model.features, project);
          return v.valid ? [] : [m.id + ": " + v.error];
        });
      say(
        "임시 CAD 생성 성공. 정면·측면·단면과 변경표를 검토한 뒤 적용하세요." +
          (warnings.length
            ? "\n검사 기준 확인 필요 (ID 보존):\n" + warnings.join("\n")
            : ""),
      );
    } catch (e) {
      say("임시 생성 실패 · 현재 모델 유지\n" + e.message);
      $("intake-apply").disabled = true;
    }
  };
  $("intake-apply").onclick = () => {
    try {
      const candidate = session.preview;
      if (!candidate) throw Error("미리보기가 필요합니다");
      const next = new ModelLibrary(library.snapshot());
      next.commit(candidate.project);
      persist(next);
      const result = session.take();
      onApply(result.project, result.model, true);
      dialog.close();
    } catch (e) {
      say(e.message);
    }
  };
  for (const b of dialog.querySelectorAll("[data-intake-view]"))
    b.onclick = () => previewViewer?.view(b.dataset.intakeView);
  $("intake-section").onclick = () => {
    if (!session.preview) return;
    const p = session.preview.project;
    p.view.section = {
      axis: p.view.section.axis === "y" ? "none" : "y",
      position: 0,
    };
    previewViewer.setModel(session.preview.model, p);
  };
  function currentIntake(copy = false) {
    const p = getProject(),
      id = p.modelIdentity?.modelId || p.product.id,
      registered = library.data.models.find((m) => m.modelId === id);
    const base = p.modelIdentity?.revision || "1";
    const x = intakeFromProject(p, {
      modelId: copy ? "model-" + Date.now() : id,
      modelName: p.modelIdentity?.modelName || p.product.name || id,
      revision: copy ? "1" : registered ? base + "-next" : "1",
      baseRevision: !copy && registered ? base : null,
    });
    return x;
  }
  $("model-new").onclick = () =>
    openIntake(
      template(
        {
          modelId: "model-" + Date.now(),
          modelName: "새 셀 모델",
          revision: "1",
        },
        [getProject().stage],
      ),
    );
  $("model-revise").onclick = () => openIntake(currentIntake(), getProject());
  $("model-copy").onclick = () => openIntake(currentIntake(true), getProject());
  $("model-register").onclick = () => {
    try {
      const p = getProject();
      if (!canOpen()) throw Error("현재 CAD 완료 후 저장하세요");
      const x = currentIntake();
      const project = projectFromIntake(x, p.stage);
      Object.assign(project, {
        measurements: clone(p.measurements).map((m) => ({
          ...m,
          spec: { ...m.spec, measured: null },
        })),
        anchors: clone(p.anchors || []),
        view: clone(p.view),
        inspectionDatums: clone(p.inspectionDatums || []),
        notes: p.notes,
      });
      const next = new ModelLibrary(library.snapshot());
      next.commit(project);
      for (const m of p.measurements)
        if (Number.isFinite(m.spec.measured))
          next.addSample({
            sampleId: "legacy-import",
            modelId: project.modelIdentity.modelId,
            modelRevision: project.modelIdentity.revision,
            itemId: m.id,
            value: m.spec.measured,
          });
      persist(next);
      onApply(project, null, true);
      notify(
        "현재 작업을 모델 개정 " +
          project.modelIdentity.revision +
          "으로 보관했습니다. 실측은 별도 기록하세요.",
      );
      invalidate();
      $("intake-work").hidden = true;
      renderLibrary();
      dialog.close();
    } catch (e) {
      say(e.message);
    }
  };
  $("library-save").onclick = () =>
    download(library.snapshot(), "pouch-model-library.json");
  $("sample-add").onclick = () => {
    try {
      const p = getProject(),
        value = $("sample-value").value;
      const saved = library.data.models
        .find((m) => m.modelId === p.modelIdentity?.modelId)
        ?.revisions.find(
          (r) => r.revision === p.modelIdentity?.revision,
        )?.project;
      assertSampleBasis(saved, p, { itemId: $("sample-item").value });
      if (value === "") throw Error("실측값 필요");
      const next = new ModelLibrary(library.snapshot());
      next.addSample(
        {
          sampleId: $("sample-id").value,
          modelId: p.modelIdentity?.modelId,
          modelRevision: p.modelIdentity?.revision,
          itemId: $("sample-item").value,
          value: Number(value),
        },
        p,
      );
      persist(next);
      renderLibrary();
      say("실측 샘플 저장 · 설계 형상은 변경되지 않았습니다.");
    } catch (e) {
      say(e.message);
    }
  };
  $("intake-upload").onclick = () => $("intake-file").click();
  $("intake-file").onchange = async (e) => {
    const f = e.target.files[0];
    try {
      if (!f) return;
      if (f.size > 12 * 1024 * 1024) throw Error("12 MB 이하 파일 필요");
      invalidate();
      const generation = session.generation;
      const raw = JSON.parse(await f.text());
      if (generation !== session.generation) return;
      if (raw.format === "pouch-model-library") {
        $("intake-work").hidden = true;
        mergeSource = new ModelLibrary(raw).snapshot();
        mergeChoices = new Map();
        renderMerge();
        say("보관함 병합 요약과 충돌을 검토한 뒤 적용하세요.");
      } else openIntake(raw);
    } catch (err) {
      say(err.message);
    } finally {
      e.target.value = "";
    }
  };
  return {
    openIntake,
    open() {
      if (!canOpen())
        return notify("현재 입력을 적용하거나 되돌린 후 모델 관리를 여세요.");
      renderLibrary();
      if (!dialog.open) dialog.showModal();
      if (storage.blocked) say(storage.error);
    },
    library: () => library,
  };
}
