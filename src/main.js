import { mountComponentScenes, populateComponentCards } from "./components/workbench.js";
import { placementField } from "./components/contract.js";
import { fieldsForObject, get as getToolField, set as setToolField } from "./tooling/contract.js";
import { components, mountComponents, mountModelChoices, ownerForPath } from "./overview/catalog.js";
import { createPartTree } from "./overview/part-tree.js";
import { drawThumbnail, overviewFrame } from "./overview/thumbnail.js";
import { detailImage } from "./overview/part-images.js";
import { stageCode, stageGroups, mountOverview } from "./overview/panel.js";
import { mountTooling } from "./tooling/panel.js";
import {
  editorGroup,
  fieldOwner,
  editorTargets,
  fieldsForTarget,
  fieldIdentity,
  fieldUnit,
} from "./data/editor-targets.js";
import { viewAvailability } from "./viewer/presentation.js";
import { previewExamples } from "./preview/examples.js";
import { designIdentity } from "./preview/identity.js";
import { stageContract, assemblyRank, canReviewStage } from "./data/stages.js";
import { rigidPoint } from "./geometry/material.js";
import { mountComparison } from "./models/compare-panel.js";
import { basicMeasurements } from "./annotations/sets.js";
import { mountInspection } from "./annotations/panel.js";
import { mountModels } from "./models/panel.js";
import { reconcileProject, productFromIntake } from "./intake/adapter.js";
import { stableId } from "./intake/contract.js";
import "./style.css";
import {
  clone,
  stages,
  parseProject,
  validateProject,
  measurement,
  demoMeasurements,
  History,
} from "./data/project.js";
import {
  fieldsFor,
  bindingFor,
  readField,
  writeField,
  references,
  forecast,
  driversForFeature,
  stageOrder,
} from "./data/bindings.js";
import { inspectLegacy, migrateV2 } from "./data/migration.js";
import { evaluate, inspection } from "./annotations/measure.js";
import { rebuild, exportStep, engineHealth } from "./geometry/client.js";
import { RebuildQueue } from "./geometry/queue.js";

import { Viewer } from "./viewer/viewer.js";
import { withAnchors, anchorPoint } from "./annotations/anchors.js";
const previewBuild = import.meta.env.MODE === "recorded-preview";
const $ = (id) => document.getElementById(id),
  esc = (x) =>
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
let toolingPreview = false;
let state = previewExamples["pouch-phase1"](),
  draft = clone(state.product),
  targetStage = state.stage,
  model = null,
  dirty = false,
  busy = false,
  live = false,
  preview = null,
  ready = false,
  selected = null,
  selectedFeature = null,
  activePath = null,
  pickRefs = [],
  picking = false,
  pageSize = 50,
  appliedRevision = 0,
  editCounter = 0,
  editGroup = null,
  lastHistoryGroup = null,
  replacement = null;
state.measurements = demoMeasurements(state.stage, state.product);
const history = new History();
const viewer = new Viewer($("viewport"), {
  onSelect: (...hit) => { if (!toolingPreview) selectPart(...hit); },
  onPick: hit => { if (!toolingPreview) picked(hit); },
  onAnchor: hit => { if (!toolingPreview) addAnchor(hit); },
  onCamera: (c) => {
    if (!toolingPreview) state.view.camera = c;
  },
  onHover: (hit) => {
    const el = $("hover-tip");
    el.hidden = !hit;
    if (hit) {
      el.textContent =
        hit.name.replaceAll(" · ", " > ") +
        (hit.featureName ? " > " + hit.featureName : "") +
        " · " +
        stages[state.stage] +
        " · " +
        ({
          part: "부품",
          edge: "등록 모서리",
          face: "기준면",
          point: "기준점",
          radius: "원호 R",
        }[hit.kind] || hit.kind);
    }
  },
  onEdit: hit => { if (!toolingPreview) openDirect(hit); },
});
const tree = createPartTree($("parts"));
let selectedGroup = null;
let pageName = "parts", component = "welded", componentSide = "positive", drawingGeneration = 0;
const pageViews = { product:"overview", parts:"overview" };
const inComponent = () => pageName === "parts" && pageViews.parts === "detail";
const basicComponent = () => ["tab","lead","tapes","leadFilm"].includes(component) ||
  (component==="pouch" && !state.product.processTooling);
let ownerTarget = null;
const inspectionTools = mountInspection({
  getProject: () => state,
  getModel: () => model,
  viewer,
  notify: status,
  onSelect: () => {
    activePath = null;
    tab("measure");
  },
  onView: (p, part) => {
    state = p;
    selected = part;
    selectedFeature = activePath = null;
    viewer.selectedFeature = null;
    viewer.setHighlight(null);
    syncTargets();
    viewer.select(selected);
    if (selected && [...$("editor").options].some((o) => o.value === selected))
      $("editor").value = selected;
    $("selection-info").textContent = selected
      ? model.parts.find((p) => p.id === selected)?.name || selected
      : "현재 공정의 부품을 선택하세요.";
    renderFields();
    syncUI();
    refreshView();
    viewer.restore(state.view.camera);
  },
});
let focusRestore = null;
$("renderer-mode").textContent = viewer.mode;
function previewLabel() {
  return "읽기 전용 프리뷰 · 사전 계산 형상(" + preview.manifest.sourceCommit.slice(0, 7) + ")";
}
function status(message, type = "", details) {
  $("diagnostics").className = type;
  $("status").textContent = preview ? previewLabel() + " · " + message : message;
  $("revision").textContent = "REV " + appliedRevision;
  if (details !== undefined) $("messages").textContent = details;
}
function setDirty(value) {
  dirty = value;
  const pending = dirty || busy || queue.pending;
  $("dirty-state").textContent = busy
    ? (preview ? "기록 조회 중" : "CAD 계산 중") + " · 화면은 마지막 확정 형상"
    : dirty
      ? "예상 변경 · 아직 CAD에 확정되지 않았습니다."
      : preview ? "기록 형상과 일치합니다." : "입력과 확정 CAD 형상이 일치합니다.";
  for (const id of ["save", "step"]) $(id).disabled = !live || !!pending;
  for (const id of ["apply", "auto-rebuild", "edit-selection", "models"])
    $(id).disabled = !live;
  $("open").disabled = !ready || !!preview;
  $("compare").disabled = !(live || preview);
  $("stage").disabled = !ready;
  $("discard").disabled = !!preview;

  $("undo").disabled = (!!preview && busy) || (!history.undoList.length && !dirty);
  $("redo").disabled = (!!preview && busy) || !history.redoList.length;
  $("choose-model").disabled = !(live || preview) || busy || dirty;
}
function startEdit(path) {
  if (!editGroup || editGroup.path !== path)
    editGroup = { id: "edit-" + ++editCounter, path, before: clone(state) };
  return editGroup;
}
function nextProject() {
  return reconcileProject({
    ...clone(replacement || state),
    product: clone(draft),
    stage: targetStage,
  });
}
async function compute(p, revision, meta) {
  validateProject(p);
  if (meta?.overviewCard) {
    const result = overview.acceptedResult(p);
    if (result) return result;
  }
  if (live) return rebuild(p, revision);
  if (preview) return preview.model(p);
  throw Error("읽기 전용 · 실시간 CAD 서버 연결 필요");
}
const queue = new RebuildQueue({
  compute,
  onStart: () => {
    busy = true;
    setDirty(!preview);
    status(
      preview ? "기록 조회 중…" : "실시간 CAD 계산 중…",
      "busy",
      preview ? "화면은 마지막 확정 형상입니다." : "화면은 마지막 확정 형상입니다. 주황 치수는 예상 변경입니다.",
    );
  },
  onAccept: (result, job) => {
    toolingPreview = false;
    const meta = job.meta,
      changedStage = state.stage !== job.payload.stage;
    if (meta.historyAction) history[meta.historyAction](meta.before);
    if (meta.record !== false && meta.group !== lastHistoryGroup) {
      history.push(meta.before || state);
      lastHistoryGroup = meta.group;
    }
    if (meta.replace) {
      focusRestore = null;
      state = clone(job.payload);
    } else
      state = {
        ...state,
        ...(job.payload.intake ? { intake: clone(job.payload.intake) } : {}),
        product: clone(job.payload.product),
        stage: job.payload.stage,
      };
    replacement = null;
    targetStage = state.stage;
    draft = clone(state.product);
    model = withAnchors(result, state.anchors);
    if (meta.replace) selectedGroup=null;
    const closedGroups=Object.keys(state.view.groupHidden || {});
    for(const part of model.parts){
      if(closedGroups.includes(part.id.split(".")[0]) && !state.view.hidden.includes(part.id)) state.view.hidden.push(part.id);
    }
    if(selectedGroup)viewer.select(null,model.parts.filter(p=>p.id.split(".")[0]===selectedGroup).map(p=>p.id));
    else if(meta.replace)viewer.select(selected);
    appliedRevision = job.revision;
    busy = false;
    setDirty(false);
    viewer.setModel(model, state);
    if (meta.replace && state.view.camera) viewer.restore(state.view.camera);
    if (meta.fit && !$("process-detail").hidden) viewer.fit();
    if (syncTargets() || changedStage || meta.replace) renderFields();
    else syncFieldValues();
    syncUI();
    renderCalculated();
    clearErrors();
    updateHighlight();
    if (!inComponent()) toolingTools.refresh();
    overview.refresh(state, result);
    updateReview(true);
    status(
      (preview ? "기록 확정 · " : "CAD 확정 · ") + stages[state.stage],
      "",
      model.diagnostics.map((x) => x.message).join("\n"),
    );
  },
  onError: (error, job) => {
    busy = false;
    if (preview) {
      replacement = null;
      draft = clone(state.product);
      targetStage = state.stage;
      setDirty(false);
      renderFields();
      syncUI();
    } else {
      setDirty(true);
      showFieldError(job.meta.path, error.message);
    }
    status("입력 미적용 · 마지막 확정 형상 유지", "error", error.message);
    updateHighlight();
  },
  onIdle: () => {
    busy = false;
    setDirty(dirty);
  },
});
function request(next, meta = {}, immediate = true) {
  next = reconcileProject(next);
  if (!live && !preview) {
    status("읽기 전용 · 실시간 CAD 서버 연결 필요", "error");
    return;
  }
  if (meta.replace) replacement = clone(next);
  draft = clone(next.product);
  targetStage = next.stage;
  if (meta.replace) renderFields();
  setDirty(!preview);
  const group = meta.group || "action-" + ++editCounter;
  queue.schedule(
    next,
    {
      before: clone(state),
      group,
      automatic: immediate,
      ...meta,
      replace: !!replacement,
    },
    immediate,
  );
  if (immediate) queue.flush();
}
function changeField(path, value) {
  if (!live) return;
  startEdit(path);
  writeField(draft, path, value);
  activePath = path;
  const automatic = $("auto-rebuild").checked;
  setDirty(true);
  clearErrors(path);
  updateHighlight();
  queue.schedule(
    nextProject(),
    {
      ...editGroup,
      group: editGroup.id,
      path,
      automatic,
      replace: !!replacement,
    },
    automatic,
  );
}
function syncUI() {
  const modern = !!state.product.processTooling;
  for (const option of $("stage").options) {
    const contract = stageContract[option.value];
    // An already saved R4 project at a compatibility stage remains reopenable.
    const incompatible = !canReviewStage(state.product, option.value);
    option.hidden = incompatible && option.value !== state.stage;
    option.disabled = option.hidden || (!!contract.r4 && !preview && !modern);
  }
  renderPouchResults();
  $("data-origin").textContent = state.demo
    ? "DEMO · 예시값"
    : "입력 모델 · 출처 확인";
  $("stage").value = state.stage;
  renderStageNav();
  $("scene-title").textContent =
    stages[state.stage] +
    (state.modelIdentity
      ? " · " +
        state.modelIdentity.modelId +
        " / " +
        state.modelIdentity.revision
      : "");
  $("transparent").checked = state.view.transparent;
  $("dimensions-visible").checked = state.view.showDimensions !== false;
  $("datums").checked = state.view.datums;
  $("section").value = state.view.section.axis;
  $("section-position").value = state.view.section.position;
  $("notes").value = state.notes;
  $("auto-rebuild").checked = state.view.autoRebuild !== false;
  renderParts();
  renderRefs();
  renderMeasurements();
  renderDatums();
  inspectionTools.render();
}
function clearErrors(path) {
  for (const el of document.querySelectorAll(".field-error"))
    if (!path || el.dataset.path === path) el.textContent = "";
}
function showFieldError(path, message) {
  const error = [...document.querySelectorAll(".field-error")].find(
    (x) => x.dataset.path === path,
  );
  if (error) error.textContent = message;
  else $("field-guide").textContent = message;
}
function syncFieldValues() {
  for (const input of document.querySelectorAll("[data-field]")) {
    if (document.activeElement === input) continue;
    const v = readField(draft, input.dataset.field);
    if (input.type === "checkbox") input.checked = v;
    else input.value = v;
  }
}
function renderParts() {
  if (!model) return;
  const availability = viewAvailability(model.parts, state.view.hidden);
  const hasShell = availability.transparent;
  $("transparent").disabled = !hasShell;
  $("transparent").parentElement.title = hasShell
    ? "파우치 외장을 반투명으로 표시"
    : "현재 화면에 표시된 파우치 외장이 없습니다";
  $("through").disabled = !availability.internalOnly;
  $("through").checked = state.view.internalOnly === true;
  $("through").parentElement.title = availability.internalOnly
    ? "3D 선택에서 외장·제품 실링·공구를 제외합니다"
    : "표시된 외부 대상과 내부 부품이 함께 있을 때 사용할 수 있습니다";
  viewer.through =
    state.view.internalOnly === true && availability.internalOnly;
  $("joint-view").disabled = !model.parts.some((p) => p.id === "positive.tab");
  const tapes = model.parts.filter((p) => p.id.includes(".tape."));
  $("tape-toggle").disabled = !tapes.length;
  $("tape-toggle").textContent =
    tapes.length && tapes.every((p) => state.view.hidden.includes(p.id))
      ? "테이프 다시 표시"
      : "테이프 숨기기";
  tree.render({ parts:model.parts, view:state.view, selected, selectedGroup, select:selectPart,
    refresh:refreshView, redraw:renderParts, selectGroup(group) {
      selectedGroup=group; selected=selectedFeature=activePath=null;
      viewer.selectedFeature=null; viewer.setHighlight(null);
      const ids=model.parts.filter(p=>p.id.split(".")[0]===group).map(p=>p.id);
      viewer.select(null,ids);
      $("selection-info").textContent=$("parts").querySelector(`[data-group="${group}"]`).textContent+" · "+ids.length+"개 부품";
      renderParts();
    }
  });
}
function selectPart(id, feature) {
  selectedGroup = null;
  tree.reveal(id);
  selected = id;
  selectedFeature = feature || null;
  viewer.select(id);
  viewer.selectedFeature = selectedFeature;
  renderParts();
  const picked = model.parts.find(p => p.id === id);
  $("selection-info").textContent = picked?.name || id;
  if(inComponent()) {inspectionTools.related(id);return;}
  const editor = $("editor");
  editor.value = [...editor.options].some((o) => o.value === id)
    ? id
    : editorGroup(id);
  tab("design");
  renderFields();
  const candidates = driversForFeature(
    feature || id,
    state.product,
    state.stage,
  ).filter((path) => bindingFor(draft, targetStage, path)?.available);
  const path =
    candidates.find(
      (path) => bindingFor(draft, targetStage, path)?.partId === fieldOwner(id),
    ) || (feature ? candidates[0] : null);
  if (path) focusField(path, false);
  else {
    activePath = null;
    updateHighlight();
  }
  inspectionTools.related(id);
  const p = model.parts.find((x) => x.id === id);
  $("selection-info").textContent =
    (p?.name || id) +
    (feature ? " > " + (model.features[feature]?.name || feature) : "") +
    " · " +
    [p?.meta.definition, p?.meta.assumption, p?.meta.display]
      .filter(Boolean)
      .join(" · ");
}
function refreshView() {
  if (!model) return;
  viewer.setModel(model, state);
  renderParts();
  renderMeasurements();
  updateHighlight();
}
const sectionNames = {
  tab: "포일 · S0 뿌리 → S1 집속",
  prewelds: "S2 가용접 관리 영역",
  preweldLead: "S2 외부 리드 · 데모 가정",
  lead: "S3 외부 리드 · 접촉 관계",
  joints: "S3 메인 용접 관리 영역",
  tapes: "S4 테이프 · 부착 경로",
  leadFilm: "S3+ 리드 실런트 (실링 필름)",
  stack: "적층체 / Jellyroll · A/B/C",
  pouch: "포켓 → 실링 → 외곽 → 예시 접힘",
  type: "컵 구성",
  construction: "외장 구성",
  sidewall: "측벽 기준",
  seamGap: "상하 공칭 간격",
  neutralFraction: "폴딩 기준층",
  "sheet upper": "상부 시트 · 독립 치수",
  "sheet lower": "하부 시트 · 독립 치수",
  assemblyPose: "조립체 수납 위치 · 자세",
  toolFaces: "실링바 작업면 · 상하/변 독립",
  folds: "재료 접힘 작업",
};
function syncTargets() {
  if (!model) return false;
  const editor = $("editor"),
    old = editor.value;
  const options = editorTargets(state.product, state.stage, model.parts).map(
    (o) => new Option(o.label, o.value),
  );
  const changed =
    JSON.stringify([...editor.options].map((o) => [o.value, o.text])) !==
    JSON.stringify(options.map((o) => [o.value, o.text]));
  if (changed) {
    editor.replaceChildren(...options);
    if (options.some((o) => o.value === old)) editor.value = old;
    else if (options.some((o) => o.value === editorGroup(old)))
      editor.value = editorGroup(old);
  }
  if (selected && !model.parts.some((p) => p.id === selected)) {
    selected = selectedFeature = activePath = null;
    viewer.select(null);
    viewer.selectedFeature = null;
    $("selection-info").textContent = "현재 공정의 부품을 선택하세요.";
    inspectionTools.related(null);
  }
  if (selectedFeature && model.features[selectedFeature]?.available !== true) {
    selectedFeature = null;
    viewer.selectedFeature = null;
  }
  if (activePath && !bindingFor(draft, targetStage, activePath)?.available)
    activePath = null;
  return changed;
}
function renderFields() {
  const standalone = inComponent() && basicComponent();
  const target = standalone && ownerTarget ? ownerTarget : $("editor").value,
    side = editorGroup(target),
    all = (standalone && component==='lead' ?
      [...fieldsForTarget(draft,ownerStage(),componentSide+'.lead'),...fieldsForTarget(draft,ownerStage(),componentSide+'.leadFilm')] :
      fieldsForTarget(draft, standalone ? ownerStage() : targetStage, target)).filter(b=>!standalone || !placementField(b.path)),
    container = $("fields");
  container.replaceChildren();
  if (!all.length) {
    const p = document.createElement("p");
    p.textContent = model?.parts.some((p) => p.id === target)
      ? "계산 대상입니다. 독립 입력은 원인 작업면 또는 부품에서 편집하세요."
      : "현재 공정에 편집할 대상이 없습니다.";
    container.append(p);
    return;
  }
  const groups = new Map();
  for (const b of all) {
    const key = b.section + (b.itemId ? "." + b.itemId : "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  for (const [key, bs] of groups) {
    const first = bs[0],
      details = document.createElement("details");
    details.dataset.section = key;
    details.open =
      side === "stack" ||
      side === "pouch" ||
      first.section === "tab" ||
      first.partId === selected;
    const summary = document.createElement("summary");
    summary.textContent = sectionNames[first.section] || first.section;
    if (first.itemId) summary.textContent += " / " + first.itemId;
    details.append(summary);
    for (const b of bs) {
      const owner = ownerForPath(b.path);
      if (owner && !inComponent() && !placementField(b.path)) {
        const link = document.createElement("button");
        link.className="owner-ref";link.dataset.ownerPath=b.path;
        link.textContent=b.label+" · "+(b.value ?? "미정")+"  ↗ "+components[owner];
        link.onclick=()=>openOwner(owner,b);
        details.append(link);continue;
      }
      const row = document.createElement("div");
      row.className = "field";
      row.dataset.path = b.path;
      const label = document.createElement("label");
      label.textContent = b.label;
      const input = document.createElement(b.options ? "select" : "input");
      input.dataset.field = b.path;
      input.id = "field-" + b.path;
      input.setAttribute(
        "aria-label",
        side + " " + b.label + (b.itemId ? " " + b.itemId : ""),
      );
      label.htmlFor = input.id;
      if (b.options && b.value == null) input.append(new Option("미입력", ""));
      if (b.options)
        for (const [v, n] of Object.entries(b.options))
          input.append(new Option(n, v));
      else {
        input.type = b.type || "number";
        if (input.type === "number") input.step = b.step || 0.1;
      }
      if (input.type === "checkbox") {
        input.checked = b.value === true;
        input.indeterminate = b.value == null;
        if (b.value == null) label.textContent += " · 미확정";
      } else input.value = b.value ?? "";
      const item = b.itemId
        ? draft[side][b.section].find((x) => x.id === b.itemId)
        : null;
      const processHost = b.path.startsWith("pouchProcess.")
        ? b.path
            .split(".")
            .slice(0, -1)
            .reduce((o, k) => o?.[k], draft)
        : null;
      const processDisabled =
        processHost &&
        ((processHost.enabled === false && b.key !== "enabled") ||
          (/^relief(Length|Width|Offset)$/.test(b.key) &&
            !processHost.reliefEnabled));
      const absentOptional =
        (item && item.enabled === false) ||
        (b.section === "leadFilm" && draft[side].leadFilm.enabled !== true);
      const disabled =
        processDisabled ||
        (absentOptional && b.key !== "enabled") ||
        (b.section === "tapes" &&
          ((item.path === "top_edges" &&
            ["width", "offsetY"].includes(b.key)) ||
            (item.path === "top" && b.key === "edgeDrop"))) ||
        (b.section === "preweldLead" &&
          b.key !== "included" &&
          !draft[side].preweldLead.included);
      input.disabled = disabled || !live || !model;
      const controls = document.createElement("div");
      controls.className = "number-control";
      if (input.type === "number")
        for (const sign of [-1, 1]) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = sign === -1 ? "−" : "+";
          button.setAttribute(
            "aria-label",
            side + " " + b.label + (sign === -1 ? " 감소" : " 증가"),
          );
          button.disabled = input.disabled;
          button.onpointerdown = (e) => e.preventDefault();
          button.onclick = () => {
            input.focus();
            const current = Number(input.value);
            const value = Number(
              (current + sign * Number(input.step)).toFixed(6),
            );
            input.value = value;
            changeField(b.path, value);
          };
          if (sign === -1) controls.append(button);
          else {
            controls.append(input);
            controls.append(button);
          }
        }
      else controls.append(input);
      row.onclick = () => { activePath=b.path; updateHighlight(); };
      input.onfocus = () => {
        if (!live) return;
        startEdit(b.path);
        activePath = b.path;
        updateHighlight();
      };
      input.onblur = () => {
        editGroup = null;
      };
      const update = () => {
        const value =
          input.type === "checkbox"
            ? input.checked
            : b.options
              ? input.value
              : input.value.trim() === ""
                ? NaN
                : Number(input.value);
        changeField(b.path, value);
      };
      input.oninput = update;
      input.onchange = () => {
        if (input.type === "checkbox" || b.options) {
          update();
          if (["path", "included", "enabled", "reliefEnabled"].includes(b.key))
            renderFields();
        }
      };
      input.onkeydown = (e) => {
        if (!live) return;
        if (e.key === "Enter") {
          e.preventDefault();
          queue.flush();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          discard();
        }
      };
      row.onpointerenter = () => {
        if (!disabled && !document.querySelector("[data-field]:focus")) {
          activePath = b.path;
          updateHighlight();
        }
      };
      const basis = document.createElement("small");
      basis.textContent =
        b.basis + (disabled ? " · 현재 경로/포함 설정에서 미사용" : "");
      const error = document.createElement("small");
      error.className = "field-error";
      error.dataset.path = b.path;
      error.setAttribute("role", "alert");
      row.append(label, controls, basis, error);
      details.append(row);
    }
    if (["prewelds", "joints", "tapes"].includes(first.section)) {
      const remove = document.createElement("button");
      remove.textContent = state.intake
        ? "이 영역 제외 · 부재로 기록"
        : "이 영역 삭제";
      remove.disabled = !live;
      remove.onclick = () => {
        if (!live) return;
        if (state.intake)
          draft[side][first.section].find(
            (x) => x.id === first.itemId,
          ).enabled = false;
        else
          draft[side][first.section] = draft[side][first.section].filter(
            (x) => x.id !== first.itemId,
          );
        setDirty(true);
        renderFields();
        request(nextProject());
      };
      details.append(remove);
    }
    container.append(details);
  }
  if (target === side && ["positive", "negative"].includes(side)) {
    for (const [key, min, title] of [
      ["prewelds", 2, "가용접 영역"],
      ["joints", 3, "메인 용접 영역"],
      ["tapes", 4, "테이프"],
    ])
      if (assemblyRank(targetStage) >= min) {
        const add = document.createElement("button");
        add.textContent = title + " 추가";
        add.disabled = !live;
        add.onclick = () => {
          if (state.intake) {
            status(
              "입력 양식 모델의 새 부품은 모델 / 입력 양식에서 instanceId와 값을 지정하세요. 기존 항목은 여기서 편집할 수 있습니다.",
            );
            return;
          }
          const item = clone(initial().product[side][key][0]);
          item.id =
            (key === "tapes"
              ? "tape-"
              : key === "prewelds"
                ? "pre-"
                : "joint-") + Date.now();
          draft[side][key].push(item);
          setDirty(true);
          renderFields();
          request(nextProject());
        };
        container.append(add);
      }
    if (model && assemblyRank(targetStage) >= 2) {
      const derived = document.createElement("details");
      derived.id = "derived-values";
      derived.open = true;
      container.append(derived);
      renderCalculated();
    }
  }
  if(!inComponent() && draft.processTooling) {
    const box=document.createElement('details'),summary=document.createElement('summary');summary.textContent='공구 조립 배치 · 제품 기준';box.append(summary);
    for(const f of fieldsForObject(draft.processTooling,'processTooling').filter(f=>placementField(f.path))){
      const row=document.createElement('label');row.className='field';row.textContent=f.path;
      const input=document.createElement('input');input.type='number';input.step='any';input.value=f.value;input.dataset.assemblyField=f.path;input.disabled=!live;
      input.onchange=()=>{if(live)changeField(f.path,input.valueAsNumber);};row.append(input);box.append(row);
    }
    container.append(box);
  }

}
function renderCalculated() {
  const box = $("derived-values");
  if (!box || !model) return;
  const side = editorGroup($("editor").value);
  if (!["positive", "negative"].includes(side)) return;
  box.replaceChildren();
  const title = document.createElement("summary");
  title.textContent = "계산값 · 직접 덮어쓰기 불가";
  box.append(title);
  for (const [label, a, b, mode] of [
    ["탭–리드 겹침 길이", "lead.overlapStart", "lead.overlapEnd", "x"],
    ["탭–리드 겹침 폭", "lead.overlapWidthMinus", "lead.overlapWidthPlus", "y"],
  ]) {
    const m = measurement(
        label,
        side + "." + a,
        side + "." + b,
        mode,
        state.stage,
      ),
      v = evaluate(m, model.features, state);
    const button = document.createElement("button");
    button.textContent =
      label +
      " · " +
      (v.valid ? v.value.toFixed(3) + " mm" : "현재 상태 없음") +
      " ↗";
    button.disabled = !live || !v.valid;
    button.onclick = () => openDirect({ measurement: m });
    box.append(button);
  }
}
function focusField(path, focus = true) {
  const b = bindingFor(draft, targetStage, path);
  if (!b) return;
  const editor = $("editor");
  const next =
    fieldOwner(editor.value) === b.partId
      ? editor.value
      : [...editor.options].some((o) => o.value === b.partId)
        ? b.partId
        : b.side;
  if (editor.value !== next) {
    editor.value = next;
    renderFields();
  }
  tab("design");
  if (
    ![...document.querySelectorAll("[data-field]")].some(
      (x) => x.dataset.field === path,
    )
  )
    renderFields();
  const input = [...document.querySelectorAll("[data-field]")].find(
    (x) => x.dataset.field === path,
  );
  if (input) {
    input.closest("details").open = true;
    input.closest(".field").scrollIntoView({ block: "nearest" });
    if (focus) input.focus();
  }
  activePath = path;
  updateHighlight();
}
function updateHighlight() {
  const b = activePath && bindingFor(draft, targetStage, activePath);
  for (const row of document.querySelectorAll(".field"))
    row.classList.toggle("active-field", row.dataset.path === activePath);
  if (!b || !b.available) {
    viewer.setHighlight(null);
    $("field-guide").textContent =
      "입력 항목에 포커스하면 부품·경로·기준을 표시합니다.";
    $("field-to-dim").disabled = true;
    return;
  }
  let guide = forecast(b, draft, targetStage);
  if (
    guide &&
    stageContract[targetStage]?.pouch &&
    !b.path.startsWith("pouchProcess.")
  ) {
    const pose = draft.pouchProcess.assemblyPose;
    for (const f of Object.values(guide.features)) {
      for (const k of ["point", "center"])
        if (f[k]) f[k] = rigidPoint(f[k], pose);
      if (f.normal) f.normal = rigidPoint(f.normal, pose, false);
    }
    if (guide.arc) guide.arc = guide.arc.map((p) => rigidPoint(p, pose));
  }
  const refs = references(b, draft, targetStage);
  if (!guide && refs && model?.features[refs.a.featureId]?.available) {
    const a = model.features[refs.a.featureId],
      other = model.features[refs.b.featureId];
    if (other?.available)
      guide = {
        features: { "@a": a, "@b": other },
        measurement: {
          name: b.label,
          mode: refs.mode,
          a: { featureId: "@a" },
          b: { featureId: "@b" },
          offset: 8,
          offsetAxis: "y",
          visible: true,
        },
        arc: a.arc,
        committed: true,
      };
  }
  if (
    guide &&
    !dirty &&
    !busy &&
    refs &&
    model?.features[refs.a.featureId]?.available !== false
  ) {
    const a = model?.features[refs.a.featureId],
      other = model?.features[refs.b.featureId];
    if (
      a &&
      (refs.mode === "radius" || (other?.available !== false && other))
    ) {
      guide = {
        ...guide,
        features: { "@a": a, "@b": other },
        measurement: { ...guide.measurement, mode: refs.mode },
        arc: a.arc || guide.arc,
      };
    }
  }
  viewer.setHighlight({
    partId: b.partId,
    guide,
    pending: dirty || busy,
    label: b.label,
    path: b.path,
  });
  const parameterId = fieldIdentity(b);
  $("field-guide").textContent =
    b.label +
    "\n부품 ID · " +
    b.partId +
    "\n항목 경로 · " +
    parameterId +
    "\n단위 · " +
    fieldUnit(b) +
    "\n기준: " +
    b.upstream +
    "\n고정/방향: " +
    b.fixed +
    "\n영향: " +
    b.effect +
    (b.key === "gatheredLength"
      ? "\n집속 후 길이 = S0 돌출 − 집속 거리 − 투영 수축. 이 입력은 투영 수축만 변경합니다."
      : "");
  $("field-to-dim").disabled =
    !references(b, draft, targetStage) || dirty || busy;
}
function addFieldDimension(path) {
  if (dirty || busy) {
    status("CAD 확정 후 관리 치수를 추가하세요.", "error");
    return;
  }
  const b = bindingFor(state.product, state.stage, path),
    refs = b && references(b, state.product, state.stage);
  if (!refs) {
    status(
      "이 입력은 직접 측정 기준이 없습니다. 등록 기준을 선택하세요.",
      "error",
    );
    return;
  }
  const stage = b.key === "rootLength" ? "stacked" : state.stage;
  const m = measurement(
    b.label,
    refs.a.featureId,
    refs.b.featureId,
    refs.mode,
    stage,
    {
      group:
        (b.side === "positive"
          ? "양극"
          : b.side === "negative"
            ? "음극"
            : b.side) + " 설계 입력",
      driverPath: path,
      parameterId: stableId(state.product, path),
      datumId: "legacy",
      ...(/(rootY|gatherY|rootZ|gatherZ|offsetY)$/.test(b.key)
        ? { mode: "signed_offset", axis: /Z$/.test(b.key) ? "z" : "y" }
        : {}),
    },
  );
  state.measurements.push(m);
  renderMeasurements();
  status("관리 치수 추가 · " + b.label + " · " + stages[stage]);
}
function picked(id) {
  pickRefs.push(id);
  $("ref-a").value = pickRefs[0];
  if (pickRefs[1]) $("ref-b").value = pickRefs[1];
  $("pick-hint").textContent =
    pickRefs.length === 1
      ? "A: " + id + " · 끝 기준을 선택하세요."
      : "A/B 선택 완료 · 관리 치수 추가";
  if (
    pickRefs.length === 2 ||
    ["radius", "signed_coordinate"].includes($("mode").value)
  ) {
    picking = false;
    viewer.setPicking(false);
    $("pick").textContent = "모델에서 기준 선택 시작";
  }
  previewInspection();
}
function addAnchor(a) {
  if (!a) {
    status(
      "이 면의 자유점은 미지원",
      "error",
      "리드/적층체 평탄부, 포켓 바닥 또는 등록된 파우치 재료 패치에서 선택하세요.",
    );
    return;
  }
  a.mode = $("anchor-mode").value;
  if (a.mode === "fixed_mm") {
    a.reference = $("anchor-reference").value;
    a.distanceU = Number($("anchor-u").value);
    a.distanceV = Number($("anchor-v").value);
    if (
      !$("anchor-u").value ||
      !$("anchor-v").value ||
      !anchorPoint(model.features[a.baseFeatureId], a)
    )
      return status(
        "고정 mm 기준점이 면 범위를 벗어납니다. 보정하지 않았습니다.",
        "error",
      );
    delete a.u;
    delete a.v;
  }
  state.schemaVersion = 4;
  a.id = "anchor." + crypto.randomUUID();
  a.name = $("anchor-name").value || "표면점";
  state.anchors ??= [];
  state.anchors.push(a);
  model = withAnchors(model, state.anchors);
  viewer.data = model;
  renderRefs();
  picked(a.id);
  viewer.draw();
  status(
    "기준점 추가 · " +
      a.name +
      " · " +
      (a.mode === "fixed_mm" ? "고정 mm" : "면의 상대 위치"),
  );
}
function renderRefs() {
  if (!model) return;
  for (const id of ["ref-a", "ref-b"]) {
    const old = $(id).value;
    $(id).replaceChildren();
    for (const [key, f] of Object.entries(model.features))
      if (f.available !== false)
        $(id).append(new Option(f.name + " · " + key, key));
    if (model.features[old]?.available !== false) $(id).value = old;
  }
  $("ref-b").disabled = ["radius", "signed_coordinate"].includes(
    $("mode").value,
  );
}
function renderDatums() {
  const prev =
    state.view.selectedDatumId || $("datum-select").value || "legacy";
  $("datum-select").replaceChildren(
    new Option("기본 검사 프레임", "legacy"),
    ...(state.inspectionDatums || []).map((d) => new Option(d.name, d.id)),
  );
  $("datum-select").value = [...$("datum-select").options].some(
    (o) => o.value === prev,
  )
    ? prev
    : "legacy";
  const chosen = $("datum-select").value,
    d =
      chosen === "legacy"
        ? state.datumSet
        : state.inspectionDatums.find((d) => d.id === chosen);
  $("measurement-datum").replaceChildren(
    new Option("기본 검사 프레임", "legacy"),
    ...(state.inspectionDatums || []).map((d) => new Option(d.name, d.id)),
  );
  $("measurement-datum").value = chosen;
  $("datum-fields").replaceChildren();
  for (const [key, label] of [
    ["0", "원점 X"],
    ["1", "원점 Y"],
    ["2", "원점 Z"],
    ["rotationZ", "검사 축 회전 Z (°)"],
  ]) {
    const l = document.createElement("label");
    l.textContent = label;
    const i = document.createElement("input");
    i.type = "number";
    i.step = ".1";
    i.value = key === "rotationZ" ? d.rotationZ : d.origin[Number(key)];
    i.onchange = () => {
      if (i.value === "" || !Number.isFinite(Number(i.value))) return;
      if (key === "rotationZ") d.rotationZ = Number(i.value);
      else d.origin[Number(key)] = Number(i.value);
      renderMeasurements();
    };
    l.append(i);
    $("datum-fields").append(l);
  }
}
$("datum-select").onchange = () => {
  state.view.selectedDatumId = $("datum-select").value;
  renderDatums();
};
$("datum-add").onclick = () => {
  state.schemaVersion = 4;
  state.inspectionDatums ??= [];
  if (state.inspectionDatums.length >= 50)
    return status("검사 프레임은 최대 50개", "error");
  const id = "inspection-" + crypto.randomUUID();
  state.inspectionDatums.push({
    id,
    name: $("datum-name").value || "검사 프레임",
    origin: [0, 0, 0],
    rotationZ: 0,
    visible: true,
  });
  renderDatums();
  $("datum-select").value = id;
  renderDatums();
  viewer.draw();
};
function renderMeasurements() {
  if (!model) return;
  viewer.state = state;
  viewer.draw();
  $("measure-count").textContent = state.measurements.length;
  $("measurements").replaceChildren();
  const oldGroup = $("group-filter").value;
  $("group-filter").replaceChildren(new Option("모든 그룹", ""));
  for (const group of [
    ...new Set(
      state.measurements
        .filter((m) => $("other-stage-dims").checked || m.stage === state.stage)
        .map((m) => m.group),
    ),
  ])
    $("group-filter").append(new Option(group, group));
  $("group-filter").value = oldGroup;
  const query = $("filter").value.toLowerCase(),
    all = state.measurements.filter(
      (m) =>
        ($("other-stage-dims").checked || m.stage === state.stage) &&
        (!$("group-filter").value || m.group === $("group-filter").value) &&
        [m.name, m.group, m.a.featureId, m.b?.featureId]
          .join(" ")
          .toLowerCase()
          .includes(query),
    );
  $("more").hidden = all.length <= pageSize;
  for (const m of all.slice(0, pageSize)) {
    const result = evaluate(m, model.features, state),
      card = document.createElement("details");
    card.className = "dim-card" + (!result.valid ? " invalid" : "");
    const referenceText =
      m.mode === "signed_coordinate"
        ? `검사 원점 (${m.datumId || "legacy"}) → ${m.a.featureId}`
        : m.mode === "radius"
          ? `${m.a.featureId} · 원호 반경`
          : `${m.a.featureId} → ${m.b?.featureId || ""}`;
    card.innerHTML = `<summary><span>${esc(m.name)}</span><strong>${result.valid ? (m.mode === "radius" ? "R " : "") + result.value.toFixed(3) + " mm" : "참조 오류"}</strong></summary><p class="ref-text">${esc(referenceText)}<br>${result.valid ? "계산값 · " + esc(m.mode) : esc(result.error)}</p>`;
    const addInput = (label, value, handler, type = "text") => {
      const l = document.createElement("label");
      l.textContent = label;
      const input = document.createElement(
        type === "textarea" ? "textarea" : "input",
      );
      if (type !== "textarea") input.type = type;
      if (type === "number") input.step = "any";
      if (type === "checkbox") input.checked = value;
      else input.value = value ?? "";
      const update = () =>
        handler(
          type === "checkbox"
            ? input.checked
            : type === "number"
              ? input.value === ""
                ? null
                : Number(input.value)
              : input.value,
        );
      input.oninput = update;
      input.onchange = update;
      l.append(input);
      card.append(l);
      return input;
    };
    addInput(
      "치수 표시",
      m.visible,
      (v) => {
        m.visible = v;
        viewer.draw();
      },
      "checkbox",
    );
    addInput("이름", m.name, (v) => {
      m.name = v;
      card.querySelector("summary span").textContent = v;
      viewer.draw();
    });
    addInput("그룹", m.group, (v) => (m.group = v));
    const pos = document.createElement("label");
    pos.textContent = "치수선 이동 방향";
    const sel = document.createElement("select");
    for (const axis of ["x", "y", "z"])
      sel.append(new Option(axis.toUpperCase(), axis));
    sel.value = m.offsetAxis;
    sel.onchange = () => {
      m.offsetAxis = sel.value;
      viewer.draw();
    };
    pos.append(sel);
    card.append(pos);
    addInput(
      "치수선 이격 (mm)",
      m.offset,
      (v) => {
        if (Number.isFinite(v)) {
          m.offset = v;
          viewer.draw();
        }
      },
      "number",
    );
    for (const [key, label] of [
      ["target", "목표값"],
      ["minus", "하한 공차 크기 (−)"],
      ["plus", "상한 공차 크기 (+)"],
      ["measured", "실측값 · 형상 변경 없음"],
    ])
      if (key !== "measured" || !state.modelIdentity)
        addInput(
          label,
          m.spec[key],
          (v) => {
            if (
              v !== null &&
              (!Number.isFinite(v) ||
                (["minus", "plus"].includes(key) && v < 0))
            ) {
              status("공차 크기는 0 이상", "error");
              return;
            }
            m.spec[key] = v;
            verdict.textContent = inspection(m);
          },
          "number",
        );
    addInput("설명", m.spec.note, (v) => (m.spec.note = v), "textarea");
    addInput(
      "측정 조건 · 검사 의미에 포함",
      m.conditions || "",
      (v) => (m.conditions = v),
      "textarea",
    );
    const verdict = document.createElement("p");
    verdict.className = "small";
    verdict.textContent = inspection(m);
    card.append(verdict);
    const actions = document.createElement("div");
    actions.className = "card-actions";
    for (const [text, fn] of [
      ["원인 입력 편집", () => openDirect({ measurement: m })],
      [
        "이 치수만",
        () => {
          state.measurements.forEach((x) => (x.visible = x.id === m.id));
          renderMeasurements();
        },
      ],
      [
        "그룹 토글",
        () => {
          const next = !m.visible;
          state.measurements
            .filter((x) => x.group === m.group && x.stage === m.stage)
            .forEach((x) => (x.visible = next));
          renderMeasurements();
        },
      ],
      [
        "재연결",
        () => {
          m.a = { featureId: $("ref-a").value };
          m.b = { featureId: $("ref-b").value };
          renderMeasurements();
        },
      ],
      [
        "삭제",
        () => {
          state.measurements = state.measurements.filter((x) => x.id !== m.id);
          renderMeasurements();
        },
      ],
    ]) {
      const b = document.createElement("button");
      b.textContent = text;
      if (text === "원인 입력 편집") b.disabled = !live;
      b.onclick = fn;
      actions.append(b);
    }
    card.append(actions);
    const show = document.createElement("button");
    show.textContent = "대상·기준·방향 보기";
    show.onclick = () => inspectionTools.highlight(m);
    card.append(show);
    card.querySelector("summary").onpointerenter = () => inspectionTools.highlight(m, true);
    card
      .querySelector("summary")
      .addEventListener("click", () => inspectionTools.highlight(m));
    $("measurements").append(card);
  }
  const visible = state.measurements.filter(
    (m) =>
      ($("other-stage-dims").checked || m.stage === state.stage) &&
      (!$("group-filter").value || m.group === $("group-filter").value) &&
      m.visible,
  ).length;
  if (visible > 200)
    status(
      "표시 치수 " + visible + "개 · 화면에는 앞 200개 표시",
      "",
      "모든 항목은 저장됩니다. 그룹/검색으로 표시를 줄이세요.",
    );
}
function tab(which) {
  $("tooling-pane").hidden = which !== "tooling";
  document.body.classList.toggle("tooling-open", which === "tooling");
  window.dispatchEvent(new Event("resize"));
  if (which === "measure") {
    activePath = null;
    viewer.setHighlight(null);
  }
  $("design-pane").hidden = which !== "design";
  $("measure-pane").hidden = which !== "measure";
  $("design-tab").classList.toggle("active", which === "design");
  $("measure-tab").classList.toggle("active", which === "measure");
}
function discard() {
  queue.invalidate();
  replacement = null;
  draft = clone(state.product);
  targetStage = state.stage;
  editGroup = null;
  setDirty(false);
  renderFields();
  syncUI();
  updateHighlight();
  status("미적용 입력 취소 · 마지막 확정값 유지");
}
$("design-tab").onclick = () => tab("design");
$("measure-tab").onclick = () => tab("measure");
$("editor").onchange = () => {
  activePath = null;
  const target = $("editor").value;
  if (model?.parts.some((p) => p.id === target)) {
    selectPart(target);
    return;
  }
  selected = selectedFeature = null;
  viewer.select(null);
  viewer.selectedFeature = null;
  $("selection-info").textContent = $("editor").selectedOptions[0].text;
  inspectionTools.related(null);
  renderParts();
  renderFields();
  updateHighlight();
};
$("apply").onclick = () => {
  if (!live) return;
  if (queue.pending) {
    queue.pending.meta.automatic = true;
    queue.flush();
  } else
    request(nextProject(), {
      path: activePath,
      ...(editGroup ? { group: editGroup.id, before: editGroup.before } : {}),
    });
};
$("discard").onclick = discard;
$("auto-rebuild").onchange = () => {
  state.view.autoRebuild = $("auto-rebuild").checked;
  if (queue.pending) {
    queue.pending.meta.automatic = state.view.autoRebuild;
    if (state.view.autoRebuild) queue.flush();
    else clearTimeout(queue.timer);
  }
};
$("stage").onchange = () => {
  targetStage = $("stage").value;
  const next = nextProject();
  editGroup = null;
  request(next, { replace: false });
};
for (const [id, key] of [
  ["transparent", "transparent"],
  ["datums", "datums"],
])
  $(id).onchange = () => {
    state.view[key] = $(id).checked;
    refreshView();
  };
$("dimensions-visible").onchange = () => {
  state.view.showDimensions = $("dimensions-visible").checked;
  viewer.draw();
};
$("through").onchange = () => {
  state.view.internalOnly = $("through").checked;
  renderParts();
  viewer.draw();
};
function section() {
  const raw = $("section-position").value,
    position = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(position)) {
    status("단면 위치는 유한한 숫자로 입력하세요.", "error");
    return;
  }
  state.view.section = { axis: $("section").value, position };
  refreshView();
}
$("section").onchange = section;
$("section-position").onchange = section;
$("section-position").oninput = section;
document
  .querySelectorAll("[data-view]")
  .forEach((b) => (b.onclick = () => viewer.view(b.dataset.view)));
$("fit").onclick = () => viewer.fit(selected);
$("clear-focus").onclick = () => {
  if (focusRestore) {
    state.view = focusRestore.view;
    selected = focusRestore.selected;
    selectedFeature = focusRestore.feature;
    focusRestore = null;
    syncUI();
    refreshView();
    viewer.restore(state.view.camera);
    return;
  }
  selected = null;
  selectedFeature = null;
  activePath = null;
  viewer.select(null);
  viewer.selectedFeature = null;
  $("selection-info").textContent = "현재 공정의 부품을 선택하세요.";
  inspectionTools.related(null);
  renderParts();
  updateHighlight();
  viewer.fit();
};
$("fullscreen").onclick = () => {
  document.body.classList.toggle("expanded");
  $("fullscreen").textContent = document.body.classList.contains("expanded")
    ? "패널 복원"
    : "작업영역 확대";
};
$("selection-mode").onchange = () => {
  viewer.selectionMode = $("selection-mode").value;
  viewer.draw();
};
$("edit-selection").onclick = () => {
  if (!selected) {
    status("먼저 부품 또는 등록 모서리를 선택하세요.");
    return;
  }
  openDirect({ partId: selected, featureId: selectedFeature || selected });
};
$("add-selected-dim").onclick = () => {
  if (selectedFeature) {
    tab("measure");
    $("ref-a").value = selectedFeature;
    pickRefs = [selectedFeature];
    $("pick-hint").textContent =
      "선택한 기준을 A로 설정했습니다. 끝 기준과 방향을 확인하세요.";
  } else if (activePath) addFieldDimension(activePath);
  else status("기준점·모서리·면을 먼저 선택하세요.");
};
$("field-to-dim").onclick = () => activePath && addFieldDimension(activePath);
$("show-all").onclick = () => {
  state.view.hidden = []; delete state.view.groupHidden;
  refreshView();
};
$("tape-toggle").onclick = () => {
  if (!model) return;
  const ids = model.parts
      .filter((p) => p.id.includes(".tape."))
      .map((p) => p.id),
    hide = !ids.every((id) => state.view.hidden.includes(id));
  state.view.hidden = state.view.hidden.filter((id) => !ids.includes(id));
  if (hide) state.view.hidden.push(...ids);
  $("tape-toggle").textContent = hide ? "테이프 다시 표시" : "테이프 숨기기";
  refreshView();
};
$("joint-view").onclick = () => {
  if (!model) return;
  focusRestore ??= {
    view: { ...clone(state.view), camera: viewer.getCamera() },
    selected,
    feature: selectedFeature,
  };
  state.view.hidden = [
    ...new Set([
      ...state.view.hidden,
      ...model.parts
        .filter((p) => !p.id.startsWith("positive.") || p.id.includes(".tape."))
        .map((p) => p.id),
    ]),
  ];
  selected = "positive.tab";
  refreshView();
  viewer.fit("positive.tab");
  viewer.view("side");
  $("selection-info").textContent =
    "양극 포일 집중 · 현재 공정 유지 · 테이프 숨김";
};
$("mode").onchange = () => {
  renderRefs();
  if ($("mode").value === "radius") $("snap-kind").value = "radius";
  previewInspection();
};
$("snap-kind").onchange = () =>
  viewer.setPicking(picking, $("snap-kind").value);
$("pick").onclick = () => {
  picking = !picking;
  pickRefs = [];
  viewer.setPicking(picking, $("snap-kind").value);
  $("pick").textContent = picking
    ? "기준 선택 취소"
    : "모델에서 기준 선택 시작";
  $("pick-hint").textContent = picking
    ? "선택 부품의 주황 마커에서 시작/끝 기준을 선택하세요."
    : "선택 취소";
};
$("add-dim").onclick = () => {
  if (dirty || busy) {
    status("CAD 확정 후 추가하세요.", "error");
    return;
  }
  const m = measurement(
    $("dim-name").value || "관리 치수",
    $("ref-a").value,
    $("ref-b").value,
    $("mode").value,
    state.stage,
    {
      group: $("dim-group").value || "기본",
      datumId: $("measurement-datum").value,
      axis: $("signed-axis").value,
    },
  );
  const target = $("dim-target").value,
    tolerance = $("dim-tolerance").value;
  if (
    (target !== "" && !Number.isFinite(Number(target))) ||
    (tolerance !== "" &&
      (!Number.isFinite(Number(tolerance)) || Number(tolerance) < 0))
  )
    return status("목표/공차 값을 확인하세요", "error");
  m.spec.target = target === "" ? null : Number(target);
  m.spec.minus = m.spec.plus = tolerance === "" ? null : Number(tolerance);
  m.conditions = $("dim-conditions").value;
  const value = evaluate(m, model.features, state);
  if (!value.valid) {
    status(value.error, "error");
    return;
  }
  state.measurements.push(m);
  renderMeasurements();
  status("치수 추가 · " + value.value.toFixed(3) + " mm");
};
$("examples").onclick = () => {
  if (!model || dirty || busy)
    return status("CAD 확정 후 검사 세트를 추가하세요", "error");
  const result = basicMeasurements(
    state,
    model,
    $("measurement-datum").value || "legacy",
  );
  state.measurements.push(...result.added);
  renderMeasurements();
  status(
    result.added.length + "개 검사 추가 · 기존 항목 중복 제외",
    "",
    result.unsupported.length
      ? "현재 CAD 기준이 없어 생성하지 않은 항목:\n" +
          result.unsupported.map((x) => x.name + ": " + x.reason).join("\n")
      : "공차·목표는 미입력으로 보존했습니다.",
  );
};
$("dims-on").onclick = () => {
  state.measurements
    .filter((m) => m.stage === state.stage)
    .forEach((m) => (m.visible = true));
  renderMeasurements();
};
$("dims-off").onclick = () => {
  state.measurements
    .filter((m) => m.stage === state.stage)
    .forEach((m) => (m.visible = false));
  renderMeasurements();
};
$("filter").oninput = () => {
  pageSize = 50;
  renderMeasurements();
};
$("group-filter").onchange = renderMeasurements;
$("other-stage-dims").onchange = renderMeasurements;
$("group-toggle").onclick = () => {
  const group = $("group-filter").value,
    items = state.measurements.filter(
      (m) => m.stage === state.stage && (!group || m.group === group),
    ),
    next = !items.every((m) => m.visible);
  items.forEach((m) => (m.visible = next));
  renderMeasurements();
};
$("more").onclick = () => {
  pageSize += 50;
  renderMeasurements();
};
$("notes").oninput = () => (state.notes = $("notes").value);
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
$("save").onclick = () => {
  if (!live || dirty || busy) return;
  try {
    state = reconcileProject(state);
    state.view.camera = viewer.getCamera();
    validateProject(state);
    download(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
      (state.modelIdentity?.modelId || "pouch-cell") + "-v1.5.json",
    );
    status("JSON 저장 · 입력/공정/기준/스펙/카메라 포함");
  } catch (e) {
    status("저장 실패", "error", e.message);
  }
};
$("open").onclick = () => { if (ready && !preview) $("file").click(); };
$("file").onchange = async (e) => {
  if (preview || !ready) return;
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    if (text.length > 12 * 1024 * 1024)
      throw Error("12 MB 이하 파일만 지원합니다");
    const raw = JSON.parse(text);
    if (raw.format === "pouch-cell-intake") models.openIntake(raw);
    else if (inspectLegacy(raw)) showMigration(raw);
    else {
      const next = parseProject(text);
      request(next, { replace: true });
    }
  } catch (err) {
    status("파일을 열 수 없습니다", "error", err.message);
  }
  e.target.value = "";
};
$("step").onclick = async () => {
  if (busy || dirty || !live) return;
  try {
    $("step").disabled = true;
    status("CAD 솔리드 STEP 내보내기…", "busy");
    download(await exportStep(state), "pouch-demo-mm.step");
    status("STEP 저장 · mm · 주석/스펙은 JSON에 보관");
  } catch (e) {
    status("STEP 실패", "error", e.message);
  } finally {
    setDirty(dirty);
  }
};
function replayHistory(action) {
  if (preview) {
    const entries = action === "undo" ? history.undoList : history.redoList;
    const next = entries.at(-1);
    if (next) request(clone(next), { record: false, replace: true, historyAction: action });
    return;
  }
  queue.invalidate();
  const next = history[action](state);
  if (next) {
    editGroup = null;
    request(next, { record: false, replace: true });
  } else if (action === "undo") discard();
}
$("undo").onclick = () => replayHistory("undo");
$("redo").onclick = () => replayHistory("redo");
let directContext = null;
function openDirect(context) {
  if (!model || !live) return;
  const m = context.measurement,
    fromDriver = m?.driverPath;
  let paths = fromDriver
    ? [fromDriver]
    : m
      ? [
          ...driversForFeature(m.a.featureId, state.product, state.stage),
          ...driversForFeature(
            m.b?.featureId || "",
            state.product,
            state.stage,
          ),
        ]
      : driversForFeature(
          context.featureId || context.partId,
          state.product,
          state.stage,
        );
  paths = [...new Set(paths)].filter((path) => {
    const b = bindingFor(draft, targetStage, path);
    return b?.available && typeof b.value === "number";
  });
  directContext = { ...context, paths };
  const val = m && evaluate(m, model.features, state);
  $("direct-title").textContent = fromDriver
    ? "설계 치수 편집"
    : m
      ? "계산 치수 · 원인 입력"
      : context.featureId
        ? "등록 모서리 / 기준 편집"
        : "부품 치수 편집";
  $("direct-kind").textContent =
    (m && !fromDriver
      ? "계산값 " +
        (val.valid ? val.value.toFixed(3) + " mm" : val.error) +
        " · 직접 덮어쓰기 불가. "
      : "") + (paths.length > 1 ? "연결된 독립 입력을 선택하세요." : "");
  $("direct-field").replaceChildren();
  if (paths.length !== 1)
    $("direct-field").append(new Option("입력 선택…", ""));
  for (const path of paths) {
    const b = bindingFor(draft, targetStage, path);
    $("direct-field").append(new Option(b.label, path));
  }
  if (!paths.length)
    $("direct-kind").textContent +=
      "이 기준의 직접 편집 연결은 없습니다. 오른쪽 설계 입력을 사용하세요.";
  $("direct-error").textContent = "";
  setDirectField();
  const dialog = $("direct-editor");
  dialog.style.left =
    context.x !== undefined
      ? Math.max(
          8,
          Math.min(
            innerWidth - 365,
            $("viewport").getBoundingClientRect().left + context.x,
          ),
        ) + "px"
      : "calc(50% - 175px)";
  dialog.style.top =
    context.y !== undefined
      ? Math.max(
          8,
          Math.min(
            innerHeight - 420,
            $("viewport").getBoundingClientRect().top + context.y,
          ),
        ) + "px"
      : "15vh";
  dialog.showModal();
  if (paths.length === 1 && !ownerForPath(paths[0])) {
    $("direct-value").focus();
    $("direct-value").select();
  }
}
function setDirectField() {
  const path = $("direct-field").value,
    b = path && bindingFor(draft, targetStage, path);
  const owner = path && ownerForPath(path);
  $("direct-controls").hidden = !b || !!owner;
  $("direct-apply").textContent = owner ? components[owner]+" 치수 열기" : "적용";
  $("direct-apply").disabled = !b;
  $("direct-basis").textContent = b
    ? "고정/방향: " + b.fixed + "\n기준: " + b.upstream + "\n영향: " + b.effect
    : "";
  if (b) {
    $("direct-value").value = b.value;
    $("direct-value").step = b.step || 0.1;
    activePath = path;
    updateHighlight();
  }
}
$("direct-field").onchange = setDirectField;
$("direct-value").oninput = () => {
  if (!live) return;
  const path = $("direct-field").value,
    b = bindingFor(draft, targetStage, path),
    value =
      $("direct-value").value.trim() === ""
        ? NaN
        : Number($("direct-value").value);
  if (!b || !Number.isFinite(value)) return;
  const preview = clone(draft);
  writeField(preview, path, value);
  viewer.setHighlight({
    partId: b.partId,
    guide: forecast(b, preview, targetStage),
    pending: true,
    label: b.label,
    path,
  });
};
function closeDirect() {
  if ($("direct-editor").open) $("direct-editor").close();
  directContext = null;
  updateHighlight();
}
$("direct-cancel").onclick = closeDirect;
$("direct-editor").addEventListener("cancel", () => {
  directContext = null;
  updateHighlight();
});
$("direct-editor").addEventListener("click", (e) => {
  const r = $("direct-editor").getBoundingClientRect();
  if (
    e.target === $("direct-editor") &&
    (e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom)
  )
    closeDirect();
});
$("direct-form").onsubmit = (e) => {
  e.preventDefault();
  if (!live) return;
  const path = $("direct-field").value,
    raw = $("direct-value").value,
    value = Number(raw);
  if(path && ownerForPath(path)){
    closeDirect();openOwner(ownerForPath(path),bindingFor(draft,targetStage,path));return;
  }
  if (!path || raw.trim() === "" || !Number.isFinite(value)) {
    $("direct-error").textContent = "유한한 숫자를 입력하세요.";
    return;
  }
  startEdit(path);
  changeField(path, value);
  $("direct-editor").close();
  directContext = null;
  syncFieldValues();
  if (queue.pending) queue.pending.meta.automatic = true;
  queue.flush();
  editGroup = null;
};
let migrationSource = null;
function showMigration(raw) {
  migrationSource = raw;
  $("migration-fields").replaceChildren();
  $("migration-error").textContent = "";
  for (const { side, root, gathered } of inspectLegacy(raw)) {
    const block = document.createElement("section");
    const title = document.createElement("h3");
    title.textContent =
      (side === "positive" ? "양극" : "음극") +
      " · 기존 뿌리 " +
      root +
      " / 집속 " +
      gathered +
      " mm" +
      (root !== gathered ? " — 불일치" : "");
    const sel = document.createElement("select");
    sel.id = "migration-" + side;
    sel.append(
      new Option("폭 선택 (필수)", ""),
      new Option("뿌리 폭 " + root + " mm", "root"),
      new Option("집속 폭 " + gathered + " mm", "gathered"),
      new Option("새 폭 직접 입력", "custom"),
    );
    const value = document.createElement("input");
    value.id = "migration-value-" + side;
    value.type = "number";
    value.step = ".1";
    value.placeholder = "직접 입력할 폭";
    block.append(title, sel, value);
    $("migration-fields").append(block);
  }
  $("migration").showModal();
}
$("migration-cancel").onclick = () => {
  $("migration").close();
  migrationSource = null;
};
$("migration-apply").onclick = () => {
  try {
    const choices = Object.fromEntries(
      ["positive", "negative"].map((side) => [
        side,
        {
          source: $("migration-" + side).value,
          value: Number($("migration-value-" + side).value),
        },
      ]),
    );
    const next = validateProject(migrateV2(migrationSource, choices));
    $("migration").close();
    migrationSource = null;
    request(next, { replace: true });
  } catch (error) {
    $("migration-error").textContent = error.message;
  }
};
async function boot() {
  setDirty(false);
  let failure;
  try {
    const engine = await engineHealth();
    live = true;
    $("engine-state").textContent =
      "실시간 CadQuery " + engine.version + " · /api/rebuild 연결 확인";
  } catch (error) {
    failure = error;
    if (previewBuild) {
      try {
        const { loadPreview } = await import("./preview/records.js");
        preview = await loadPreview(new URL("./preview/", document.baseURI));
        $("engine-state").textContent = previewLabel();
        $("compare").textContent = "기록 형상 비교";
      } catch (loadError) {
        failure = loadError;
      }
    }
  }
  ready = true;
  if (!preview) models = createModels();
  renderFields();
  setDirty(false);
  if (live || preview) {
    request(state, { record: false, replace: true, fit: true });
    overview.available(true);
    $("overview-engine").textContent = $("engine-state").textContent;
  } else {
    overview.available(false);
    $("engine-state").textContent = "읽기 전용 · CAD 서버 없음";
    status("계산 서버 연결 필요", "error", failure.message);
  }
}
let models;
const createModels = () => mountModels({
  getProject: () => clone(state),
  canOpen: () => live && !dirty && !busy && !queue.pending,
  notify: (message) => status(message),
  onGuide: (path) => {
    if (model) {
      const b = bindingFor(state.product, state.stage, path);
      if (b?.available) {
        selectPart(b.partId);
        focusField(path, false);
      }
    }
  },
  onApply: (project, result, record) => {
    queue.invalidate();
    focusRestore = null;
    if (record) history.push(state);
    state = clone(project);
    draft = clone(state.product);
    targetStage = state.stage;
    replacement = null;
    editGroup = null;
    lastHistoryGroup = null;
    busy = false;
    model = withAnchors(result || model, state.anchors);
    viewer.setModel(model, state);
    if (state.view.camera) viewer.restore(state.view.camera);
    else viewer.fit();
    setDirty(false);
    syncTargets();
    renderFields();
    syncUI();
    renderCalculated();
    if (result) overview.refresh(state, result);
    status(
      "모델 적용 · " +
        (state.modelIdentity?.modelId || state.product.id) +
        " / " +
        (state.modelIdentity?.revision || ""),
    );
  },
});
$("models").onclick = () => { if (live) models.open(); };
const comparison = mountComparison({
  getProject: () => state,
  getLibrary: () => models?.library(),
  canOpen: () => !!(live || preview) && !!model && !dirty && !busy && !queue.pending,
  compute,
  isPreview: () => !!preview,
  getRecordedSources: () => preview.manifest.designs.map(design => ({
    label: design.modelId + (design.modelRevision ? " / " + design.modelRevision : ""),
    project: previewExamples[design.name](),
  })),
  cacheKey: p => preview ? designIdentity(p) + ":" + p.stage : undefined,
  notify: status,
});
$("compare").onclick = () => comparison.open();

function previewInspection() {
  if (!model) return;
  const m = measurement(
    $("dim-name").value || "새 관리 치수",
    $("ref-a").value,
    $("ref-b").value,
    $("mode").value,
    state.stage,
    {
      datumId: $("measurement-datum").value || "legacy",
      axis: $("signed-axis").value,
    },
  );
  inspectionTools.highlight(m, true);
}
for (const id of ["ref-a", "ref-b", "measurement-datum", "signed-axis"]) {
  $(id).addEventListener("change", previewInspection);
  $(id).addEventListener("focus", previewInspection);
}
$("anchor-mode").onchange = () => {
  const relative = $("anchor-mode").value === "relative";
  $("anchor-u-label").textContent = relative ? "U 위치 % (0~100)" : "U 거리 mm";
  $("anchor-v-label").textContent = relative ? "V 위치 % (0~100)" : "V 거리 mm";
  $("anchor-reference").disabled = relative;
};
$("anchor-mode").onchange();
$("anchor-create").onclick = () => {
  if (!model || dirty || busy)
    return status("CAD 확정 후 기준점을 추가하세요", "error");
  const u = $("anchor-u").value,
    v = $("anchor-v").value;
  if (u === "" || v === "" || ![Number(u), Number(v)].every(Number.isFinite))
    return status("U/V 위치를 입력하세요", "error");
  const a = {
    baseFeatureId: $("anchor-host").value,
    u: (2 * Number(u)) / 100 - 1,
    v: (2 * Number(v)) / 100 - 1,
  };
  if (
    $("anchor-mode").value === "relative" &&
    ![a.u, a.v].every((x) => Math.abs(x) <= 1)
  )
    return status("비율은 0~100% 범위여야 합니다", "error");
  addAnchor(a);
};

for (const [id, c] of Object.entries(stageContract))
  if (![...$("stage").options].some((o) => o.value === id))
    $("stage").append(new Option(c.label, id));
function renderPouchResults() {
  const el = $("pouch-results");
  if (!el) return;
  el.replaceChildren();
  el.hidden = !model?.processMetrics;
  $("pouch-section-control").hidden = el.hidden;
  $("pouch-results-panel").hidden = el.hidden;
  if (el.hidden) return;
  const head = document.createElement("h3");
  head.textContent = "파우치 계산 · 실제 CAD 기준";
  el.append(head);
  for (const m of model.processMetrics.filter((m) => m.kind === "calculated")) {
    const dim = measurement(m.name, m.a, m.b, m.mode, state.stage, {
        group: "파우치 계산 결과",
      }),
      v = evaluate(dim, model.features, state);
    const button = document.createElement("button");
    button.textContent =
      m.name +
      " · " +
      (v.valid ? v.value.toFixed(3) + " mm" : v.error) +
      (m.materialValue !== undefined
        ? " / 재료 잔여 " + m.materialValue.toFixed(3) + " mm"
        : "");
    button.disabled = !v.valid || dirty || busy;
    button.onclick = () => {
      state.measurements.push(dim);
      renderMeasurements();
      refreshView();
      status("계산 치수 추가 · " + m.name);
    };
    el.append(button);
  }
  for (const side of ["positive", "negative"]) {
    if (!model.toolingResults?.seals[side]?.tabDimensions || !model.parts.some(p => p.id === "seal." + side)) continue;
    const inspect = document.createElement("button");
    inspect.textContent = (side === "positive" ? "양극" : "음극") + " 탭 실링 확대·치수";
    inspect.onclick = () => inspectTabSeal(side);
    el.prepend(inspect);
    const dims=model.toolingResults.seals[side].tabDimensions;
    for(const [key,label,value] of [["centerLength","중앙 L",dims.center?.length],["transitionR","전이 R",dims.radius?.radius]]){
      if(!Number.isFinite(value))continue;
      const ref=document.createElement("button");
      ref.dataset.ownerPath="processTooling.sealBars."+side+"_upper.tabProfile."+key;
      ref.textContent=(side==="positive"?"양극 ":"음극 ")+label+" "+value.toFixed(3)+" mm · 실링바 기준 보기";
      ref.onclick=()=>{
        openComponent("seal",side,true);
        const input=$("r4-fields").querySelector(`[data-r4-field$=".tabProfile.${key}"]`);
        input?.closest("label")?.click();
      };
      el.append(ref);
    }
  }
  const presets = $("pouch-section");
  presets.replaceChildren(new Option("리드 통과부 단면 선택", ""));
  for (const side of ["positive", "negative"]) {
    const a = model.features[side + ".lead.widthMinus"]?.point,
      b = model.features[side + ".lead.widthPlus"]?.point;
    if (!a || !b) continue;
    for (const [name, y] of [
      ["중심", (a[1] + b[1]) / 2],
      ["폭 −", a[1]],
      ["폭 +", b[1]],
      ["리드 바깥", b[1] + 1],
    ])
      presets.append(
        new Option(side + " " + name + " · Y=" + y.toFixed(2), String(y)),
      );
  }
}
$("pouch-section").onchange = () => {
  if ($("pouch-section").value === "") return;
  $("section").value = "y";
  $("section-position").value = $("pouch-section").value;
  section();
};

function inspectTabSeal(side) {
  if (!model || dirty || busy) return;
  const seal = model.parts.find(p => p.id === "seal." + side);
  if (!seal) return;
  state.view.hidden = [...new Set([...state.view.hidden, ...model.parts
    .filter(p => p.id.startsWith("tool.seal.")).map(p => p.id)])];
  state.view.hidden = state.view.hidden.filter(id => ![
    seal.id, side+".lead", side+".leadFilm", "pouch.upper.pocket"
  ].includes(id));
  const x = (seal.bounds.min[0] + seal.bounds.max[0]) / 2;
  const lead = model.parts.find(p => p.id === side+".lead");
  const y = lead ? (lead.bounds.min[1] + lead.bounds.max[1]) / 2 : 0;
  selectPart(seal.id);
  openComponent("seal", side, true);
  refreshView();
  const viewport = $("viewport");
  const aspect = Math.max(.4, viewport.clientWidth / Math.max(1, viewport.clientHeight));
  viewer.restore({position:[x,y,400],target:[x,y,0],up:[0,1,0],zoom:Math.min(2.9, 2.4*aspect)});
}

const componentScenes=mountComponentScenes({
  project:()=>state, editable:()=>live, reference:referenceModel,
  stageLabel:s=>stages[s]||s, title:()=>components[component],
  fieldValue:path=>toolingTools.fieldValue(path), edit:(path,v)=>toolingTools.edit(path,v),
  selectField:path=>{const el=document.querySelector(`[data-r4-field="${path}"]`);document.querySelectorAll('.chosen-field').forEach(x=>x.classList.remove('chosen-field'));if(el)el.closest('label').classList.add('chosen-field');},
  pending:()=>dirty,
});
const toolingTools = mountTooling({
  component: (m,selection)=>componentScenes.show(m,selection),
  componentMode:()=>inComponent(),
  project: () => state, model: () => model, stageLabel: s => stages[s] || s,
  editable: () => live,
  recorded: () => !!preview,
  isOpen: () => inComponent() && !basicComponent(),
  optionChanged(id,value) {
    if(id==="r4-location")sealLocation=value;
    if(id==="r4-location" && ["positive","negative"].includes(value))componentSide=value;
    if(id==="r4-side")componentSide=value;
    $("component-side").value=componentSide; applicationState();
  },
  reference: stage => referenceModel(stage),
  openStage: stage => request({ ...state, stage }),
  lock: v => setDirty(v),
  preview: async p => {
    if (!live) throw Error("로컬 CAD 서버에서 편집하세요.");
    return compute(reconcileProject(p), 1000000 + ++editCounter);
  },
  showPreview: (m,p) => { toolingPreview = true; if (state.stage===p.stage) viewer.setModel(m,p); status("R4 미리보기 · 적용 전 · " + stages[p.stage]); },
  restore: () => { toolingPreview = false; if(model) viewer.setModel(model,state); },
  apply: p => { if (live) request({...p,stage:state.stage}, { replace: true }); },
});
const overview = mountOverview({
  host: $("process-overview"),
  details: $("process-detail"),
  getProject: () => state,
  calculate: project => compute(reconcileProject(project), 2000000 + ++editCounter),
  selectStage: stage => {
    pageViews.product="detail";
    navigate("product","detail");
    if (stage === state.stage && model) viewer.fit();
    else request({ ...state, stage }, { fit: true, overviewCard: true });
  },
});
function ownerStage() {
  if(component==="lead" && state.product[componentSide].leadFilm.enabled==null)return "welded";
  if (component==="pouch") return state.product.pouchProcess ? "pouch_formed" : "packaged";
  if (component==="lead" && state.stage==="preweld" && state.product[componentSide].preweldLead.included)
    return "preweld";
  return "assembly";
}

function renderStageNav() {
  const host=$("detail-processes");
  host.replaceChildren();
  for (const [name,entries] of stageGroups(state)) {
    const group=document.createElement("details");
    group.open=true;
    const heading=document.createElement("summary");heading.textContent=name;group.append(heading);
    for(const [id,label] of entries) {
      const btn=document.createElement("button");
      btn.dataset.process=id;btn.textContent=label+" · "+stageCode(id);
      btn.setAttribute("aria-current",String(id===state.stage));
      btn.onclick=()=>changeProcess(id);
      group.append(btn);
    }
    host.append(group);
  }
}
function changeProcess(id) {
  if (!canNavigate() || id===state.stage) return;
  request({...state,stage:id},{overviewCard:true});
}
function canNavigate() {
  if (dirty || busy || toolingPreview) {
    status("계산이 끝난 뒤 미적용 입력을 적용하거나 취소하세요.");return false;
  }
  return true;
}
let sealLocation="positive";
let referenceKey, referenceCache=new Map();
function referenceModel(stage) {
  const key=designIdentity(state);
  if(referenceKey!==key) {referenceKey=key;referenceCache=new Map();}
  if(model?.stage===stage)return Promise.resolve(model);
  const project=reconcileProject({...state,stage});
  const cached=overview.acceptedResult(project);
  if(cached)return Promise.resolve(cached);
  if(!referenceCache.has(stage)){
    const cache=referenceCache;
    cache.set(stage,compute(project,3000000 + ++editCounter).catch(e=>{cache.delete(stage);throw e;}));
  }
  return referenceCache.get(stage);
}
function applicationState() {
  const box=$("application-state");
  box.hidden=!inComponent();
  if(!inComponent())return;
  const step=stageContract[state.stage].step ?? -1;
  const loc=$("r4-location")?.value;
  const when=loc==="gas"?4:loc==="final"?5:3;
  let detail="";
  if(component==="seal")detail=step<when ? "실링 적용 전" : step===7 ? "접힌 플랜지에 남은 실링" :
    step===6 ? "절단 외곽과 잔류 실링" : "필름 위 공칭 접촉 영역";
  else if(basicComponent())detail=model?.parts.some(p=>matchesComponent(p.id)) ? "제품에 부품 있음" : "해당 공정에 부품 없음";
  else if(component==="pouch")detail=step<0?"파우치 적용 전":"제품에 파우치 적용";
  else detail=component==="gathering" && assemblyRank(state.stage)>=2 || state.stage===component ||
    component==="laser" && assemblyRank(state.stage)>=3 && state.product.processTooling?.poles[componentSide]?.method==="laser" ? "적용 공정" : "현재 공정에 공구 미적용";
  box.textContent="적용 제품 · "+stages[state.stage]+" · "+detail+" · "+(preview?"읽기 전용 · CAD 기록":live?"실시간 CAD":"기록 없음");
}
function matchesComponent(id) {
  if(component==="pouch")return id.startsWith("pouch.");
  if(component==="lead")return id===componentSide+".lead"||id===componentSide+".leadFilm";
  if(component==="tapes")return id.startsWith(componentSide+".tape.");
  return id===componentSide+"."+component;
}
function openOwner(key,b) {
  if(!canNavigate())return;
  const side=["positive","negative"].includes(b.side)?b.side:componentSide;
  openComponent(key,side);
  const field=[...document.querySelectorAll("[data-field],[data-r4-field]")].find(el=>(el.dataset.field??el.dataset.r4Field)===b.path);
  if(field){const details=field.closest("details");if(details)details.open=true;field.scrollIntoView({block:"nearest"});if(!field.disabled)field.focus();}
  activePath=b.path;updateHighlight();
}
function openComponent(key, side=componentSide, fromSeal=false, kind) {
  if(!canNavigate())return;
  component=key==="leadFilm"?"lead":key; componentSide=side;
  if(kind)toolingTools.kind(kind);
  if(fromSeal || (key==="seal" && ["positive","negative"].includes(sealLocation)))sealLocation=side;
  navigate("parts","detail");
}
function drawPartDetail() {
  const token=++drawingGeneration;
  const drawing=$("component-drawing");
  drawing.replaceChildren();
  const basic=basicComponent(), tool=!basic;
  $("component-title").textContent=components[component];
  $("component-choice").value=component;
  $("component-polarity").hidden=component==="pouch" || component==="seal";
  $("component-side").value=componentSide;
  $("component-host").append(basic ? $("design-pane") : $("tooling-pane"));
  $("design-pane").hidden=!basic;
  $("tooling-pane").hidden=basic;
  if(tool && !state.product.processTooling){
    $("tooling-pane").hidden=true;drawing.textContent="현재 모델에 이 공구의 설계·CAD 기록이 없습니다.";return;
  }
  const refStage=basic?ownerStage():"film_formed";
  if(basic || component==="pouch"){
    const target=model?.parts.find(p=>matchesComponent(p.id));
    ownerTarget=component==="pouch"?"pouch":target?.id ||
      (component==="tapes"?componentSide+".tape."+state.product[componentSide].tapes[0]?.id:componentSide+"."+component);
    if(basic){
      if(target){tree.reveal(target.id); selectedGroup=null;selected=target.id;viewer.select(target.id);}
      renderFields();
      if(component==="leadFilm"){
        const pole=state.product[componentSide], ref=document.createElement("button");
        ref.className="owner-ref";ref.dataset.ownerPath=componentSide+".lead.width";
        ref.textContent="실런트 폭 "+(pole.lead.width+2*pole.leadFilm.overhang).toFixed(3)+" mm = 리드 폭 "+pole.lead.width+" + 2 × 돌출량 "+pole.leadFilm.overhang+" · 리드 폭 보기";
        ref.onclick=()=>openOwner("lead",{side:componentSide,path:componentSide+".lead.width"});
        drawing.append(ref);
      }
    }
    referenceModel(refStage).then(m=>{
      if(token!==drawingGeneration || !inComponent())return;
      const parts=m.parts.filter(p=>matchesComponent(p.id));
      if(!parts.length){drawing.textContent="단품 CAD 기록에 해당 부품 없음";return;}
      componentScenes.show(m,{part:component,side:componentSide},{reset:true});
      if(component==='lead'){
       const pole=state.product[componentSide],note=document.createElement('p');
       note.textContent=pole.leadFilm.enabled===true?'실런트 상대 시작 = '+(pole.leadFilm.start-pole.lead.start).toFixed(3)+' mm · 기존 형상 보존. 폭 = 리드 폭 + 2 × 돌출량':pole.leadFilm.enabled===false?'실런트 부재 · 원본 설정 유지':'실런트 미확정 · 원본 설정 유지';drawing.append(note);
       if(pole.leadFilm.enabled===true){
        const label=document.createElement('label');label.textContent='리드 시작 대비 실런트 시작 · 단품 내 상대 거리 (mm)';
        const input=document.createElement('input');input.type='number';input.step='any';input.dataset.relativeFilmStart=componentSide;
        input.value=pole.leadFilm.start-pole.lead.start;input.disabled=!live;
        input.onchange=()=>changeField(componentSide+'.leadFilm.start',Number(input.value)+draft[componentSide].lead.start);
        label.append(input);drawing.append(label);
       }

      }
    }).catch(e=>{if(token===drawingGeneration)drawing.textContent=e.message;});
  }
  if(tool){
    const mode=["preweld","welded"].includes(component)?"ultrasonic":component;
    toolingTools.open(mode,componentSide,mode==="ultrasonic"?component:null,component==="seal"?sealLocation:null);
  }
  applicationState();
}
function updateReview(afterAccept=false) {
  $("current-model").textContent=(state.modelIdentity?.modelId || state.product.id)+" / "+(state.modelIdentity?.revision || state.intake?.model?.revision || "개정 미지정");
  $("page-product").setAttribute("aria-pressed",String(pageName==="product"));
  $("page-parts").setAttribute("aria-pressed",String(pageName==="parts"));
  const overviewMode=pageViews[pageName]==="overview";
  $("page-overview").setAttribute("aria-pressed",String(overviewMode));
  $("page-detail").setAttribute("aria-pressed",String(!overviewMode));
  if(afterAccept && inComponent())drawPartDetail();
  if(afterAccept && pageName==='parts' && pageViews.parts==='overview')populateComponentCards($('component-list'),{project:()=>state,reference:referenceModel});
  applicationState();
}
function navigate(page,view) {
  if(!canNavigate())return;
  pageName=page;pageViews[page]=view;
  const isPart=page==="parts",full=view==="overview";
  $("component-overview").hidden=!(isPart && full);
  $("component-scenes").hidden=!(isPart&&!full);
  if(!(isPart&&!full))componentScenes.clear();
  if(isPart&&full&&model)populateComponentCards($("component-list"),{project:()=>state,reference:referenceModel});
  $("component-workbench").hidden=!(isPart && !full);
  document.body.classList.toggle("component-detail",isPart&&!full);
  document.body.classList.remove("tooling-open");
  const inspector=document.querySelector(".inspector");
  inspector.insertBefore($("tooling-pane"),$("measure-pane"));
  inspector.insertBefore($("design-pane"),$("measure-pane"));
  if(!isPart && full)overview.open();
  else{
    overview.showDetail();
    $("process-detail").hidden=full;document.body.classList.toggle("overview-open",full);
  }
  if(inComponent() && model)drawPartDetail();
  else if(inComponent())$("component-drawing").textContent="현재 모델의 확정 형상 또는 기록 없음";
  else{drawingGeneration++;tab("design");if(model)renderFields();}
  updateReview();window.dispatchEvent(new Event("resize"));
}
function initReview() {
  mountModelChoices($("model-choices"),key=>{
    if(!canNavigate())return;
    $("model-picker").close();
    navigate("product","overview");pageViews.parts="overview";
    request(previewExamples[key](),{replace:true,fit:true});
  });
  $("choose-model").onclick=()=>{if(canNavigate())$("model-picker").showModal();};
  $("close-model-picker").onclick=()=>$("model-picker").close();
  for(const [key,title] of Object.entries(components))$("component-choice").append(new Option(title,key));
  mountComponents($("component-list"),(key,side,kind)=>openComponent(key,side,false,kind));
  $("component-choice").onchange=e=>openComponent(e.target.value);
  $("component-side").onchange=e=>openComponent(component,e.target.value);
  $("page-product").onclick=()=>navigate("product",pageViews.product);
  $("page-parts").onclick=()=>navigate("parts",pageViews.parts);
  $("page-overview").onclick=()=>navigate(pageName,"overview");
  $("page-detail").onclick=()=>navigate(pageName,"detail");
  $("open-seal").onclick=()=>openComponent("seal");
  navigate("parts","overview");
}

initReview();
boot();
