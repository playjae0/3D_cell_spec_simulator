import { engineHealth, rebuild } from "../geometry/client.js";
import { History, parseProject } from "../data/project.js";
import { designIdentity } from "../preview/identity.js";
import { loadPreview } from "../preview/records.js";
import {
  takeFile,
  switchFile,
  rememberProduct,
  tabReturn,
} from "../product-route.js";
import {
  components,
  componentParts,
  capIds,
  dimensions,
  initial,
  recordedExamples,
  stages,
  validate,
} from "./project.js";
import { PrismView, thumbnail, sectionDrawing } from "./view.js";
import "./style.css";

document.title = "적층 각형 · 3D Cell Studio";
document.body.className = "prismatic";
const nav = document.getElementById("product-types");
document.body.replaceChildren(nav);
const app = document.createElement("div");
document.body.append(app);
app.id = "prism";
app.innerHTML = `
<header><div><span class="brand">3D CELL STUDIO</span><h1></h1></div>
<div class="actions"><span id="engine" role="status">CAD 연결 중</span><button id="undo">되돌리기</button><button id="redo">다시 하기</button><button id="save">셀 JSON 저장</button><button id="open">불러오기</button><input type="file" accept=".json" id="file" hidden></div></header>
<nav class="work-nav"><div><button id="process">제품 공정도</button><button id="components">부품·요소기술</button></div><div><button id="overview">전체보기</button><button id="detail">상세보기</button></div></nav>
<div id="errors" role="alert" hidden></div>
<section id="gallery"><h2></h2><div id="cards"></div><div id="parallel" hidden><button id="parallel-cap"><canvas id="parallel-art" width="250" height="80"></canvas><span>병행 준비 · 캡 조립체 보기</span></button></div></section>
<section id="workspace" hidden><aside id="tree"><h2></h2><div id="siblings"></div><h3>현재 장면 부품</h3><div id="parts"></div></aside>
<article><div class="scene-title"><h2 id="scene-title"></h2><span id="approval"></span></div>
<div id="scene-options" class="view-tools"></div><div id="canvas"></div><div class="view-tools"><button id="fit">화면 맞춤</button><button id="labels" aria-pressed="true">치수·라벨</button><label>중심 단면 <select id="section"><option value="">전체 형상</option><option value="x">Y–Z 단면</option><option value="y">X–Z 단면</option><option value="z">X–Y 단면</option></select></label></div>
<div id="section-panel" hidden><strong id="section-title"></strong><canvas id="cross" width="720" height="180"></canvas><small id="section-key"></small></div>
<div id="measure-label" aria-live="polite"></div><div id="diagnostics"></div></article>
<aside id="inspection"><h2>치수와 기준</h2><div id="positions"></div><form id="dimensions"></form></aside></section>
<footer><span id="model-id"></span><span>가상 치수 · mm</span><details><summary>모델 근거와 한계</summary>삼성SDI 공개 공정의 스택·접합·절연·삽입·둘레 용접 순서를 표현합니다. BMW iX Gen.5 자료는 외관 참고용입니다. 실제 스택 수, 극별 내부 연결, 반대편 집전체와 용입 형상은 미확인입니다. 포일 띠의 수와 단면, 터미널 A/B의 형상·치수, 중앙 윤곽과 집전체 두께는 가상 예시입니다. 단자 극성·체결법과 중앙 윤곽의 기능은 미확인입니다. 절연 이음·코너 및 양산 삽입성은 미판정입니다.</details></footer>`;
const $ = (id) => document.getElementById(id);
const ids = Object.keys(stages);
const format = (v) => (Math.abs(v) < 0.000001 ? 0 : v).toFixed(2);
const history = new History(),
  cache = new Map();
let project = initial(),
  model,
  live = false,
  records,
  sequence = 0,
  generation = 0,
  pending = false;
let page = "process",
  detail = false,
  component = "stack",
  selected = "",
  measure = "",
  axis = "";
let view,
  labels = true;
let presentation = "assembly",
  uncover = false;
function preset() {
  if (page === "components" && component === "cap") return "top";
  if (page === "components" && component === "tab") return "foil";
  return "standard";
}
rememberProduct("prismatic", () => (model && live ? project : null));
function button(label, handler, attrs = {}) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.onclick = handler;
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  return b;
}
function error(message = "") {
  $("errors").hidden = !message;
  $("errors").textContent = message;
}
function toolbar() {
  // A navigation click during an edit must not issue a new CAD request from
  // the previous project and silently discard the submitted dimensions.
  for (const button of app.querySelectorAll(
    ".work-nav button,#cards button,#parallel-cap,#siblings button,#positions button",
  ))
    button.disabled = pending;
  $("undo").disabled = pending || !history.undoList.length;
  $("redo").disabled = pending || !history.redoList.length;
  $("save").disabled = pending || !live || !model;
  $("open").disabled = pending || !live;
}
async function calculate(p, refresh = false) {
  validate(p);
  const key = designIdentity(p) + p.stage;
  if (!cache.has(key) || (refresh && live)) {
    const promise = live
      ? rebuild(p, ++sequence)
      : records
        ? records.model(p)
        : Promise.reject(Error("로컬 CAD 서버가 필요합니다."));
    cache.set(key, promise);
    promise.catch(() => {
      if (cache.get(key) === promise) cache.delete(key);
    });
    if (cache.size > 40) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}
const scene = () => ({ project, page, detail, component });
async function change(next, action = "push", fit = true) {
  const token = ++generation;
  pending = true;
  toolbar();
  error();
  try {
    const result = await calculate(next.project, true);
    if (token !== generation) return;
    const before = scene();
    if (action === "undo") history.undo(before);
    if (action === "redo") history.redo(before);
    if (action === "push") history.push(before);
    ({ project, page, detail, component } = next);
    model = result;
    presentation = "assembly";
    uncover = false;
    selected = "";
    measure = "";
    axis = "";
    render(fit);
  } catch (e) {
    if (token === generation) {
      error(e.message + " · 입력 미적용 · 마지막 확정 형상 유지");
      if (model) render(false);
    }
  } finally {
    if (token === generation) {
      pending = false;
      toolbar();
    }
  }
}
function go(delta, action = "push", fit = true) {
  return change({ ...scene(), ...delta }, action, fit);
}
function stage(id) {
  return go(
    { page: "process", detail: true, project: { ...project, stage: id } },
    "push",
    true,
  );
}
function part(id) {
  return go({
    page: "components",
    component: id,
    detail: true,
    project: { ...project, stage: components[id][1] },
  });
}
function values(changes) {
  const next = structuredClone(project);
  Object.assign(next.product.values, changes);
  return go({ project: next }, "push", Object.hasOwn(changes, "A01"));
}
function choosePart(id) {
  selected = selected === id ? "" : id;
  for (const b of $("parts").children)
    b.setAttribute("aria-pressed", b.dataset.part === selected);
  draw(false);
}
function visible() {
  if (page === "components") return componentParts(model.parts, component);
  return model.parts.filter((p) => {
    if (uncover && capIds.includes(p.id)) return false;
    if (
      presentation === "internal" &&
      ["can", "insulation", "weld"].includes(p.id)
    )
      return false;
    if (presentation === "empty") return p.id === "can";
    if (presentation === "bare") return p.id !== "insulation";
    if (presentation === "before") return !["joint", "contact"].includes(p.id);
    return true;
  });
}
function options() {
  const host = $("scene-options");
  host.replaceChildren();
  const control = (id, label, fn, state) =>
    host.append(
      button(label, fn, {
        "data-view": id,
        ...(state === undefined ? {} : { "aria-pressed": state }),
      }),
    );
  const camera = (id, label) => control(id, label, () => view.fit(id));
  const mode = (id, label, fit) =>
    control(
      id,
      label,
      () => {
        presentation = id;
        axis = "";
        measure = "";
        selected = "";
        render(fit);
      },
      presentation === id,
    );
  if (page === "components" && component === "cap") {
    camera("top", "캡 상면");
    camera("bottom", "캡 하면");
    camera("underside", "하면 집전체 확대");
  }
  if (
    (page === "components" && ["stack", "tab"].includes(component)) ||
    (page === "process" && project.stage === "prism-stack")
  )
    camera("foil", "포일 끝 확대");
  if (page !== "process") return;
  if (project.stage === "prism-join") {
    mode("before", "용접 전 정렬", "joint");
    mode("assembly", "접합 후", "joint");
    mode("interface", "접촉면 투시", "joint");
    camera("joint", "접합부 확대");
  }
  if (project.stage === "prism-weld") {
    mode("assembly", "완성 외관", true);
    if (model.approval.welded) {
      control("seam", "둘레 용접 확대", () => {
        presentation = "assembly";
        selected = "weld";
        render("seam");
      });
    }
    if (model.approval.joined) mode("internal", "내부 접합 확인", "joint");
  }
  if (project.stage === "prism-insulate") {
    mode("bare", "절연 전", false);
    mode("assembly", "절연 후", false);
    camera("top", "상면");
    camera("bottom", "바닥");
    host.append(
      button(
        "상면 확인 · 캡 숨김",
        () => {
          uncover = !uncover;
          render(false);
        },
        {
          id: "uncover",
          "aria-pressed": uncover,
        },
      ),
    );
  }
  if (project.stage === "prism-insert") {
    mode("empty", "빈 캔", "opening");
    mode("assembly", "조립체와 캔", true);
  }
}
function draw(fit) {
  if (!model || !detail) return;
  view ??= new PrismView($("canvas"), choosePart);
  const measured =
    measure === "A06" && model.features.A01.value > 0
      ? model.currentBottomGap
      : model.features[measure];
  const feature =
      labels &&
      presentation !== "before" &&
      presentation !== "empty" &&
      measured,
    def = dimensions.find((d) => d.id === measure);
  const before = presentation === "before";
  const offsets = before
    ? Object.fromEntries(capIds.map((id) => [id, [10, 0, 10]]))
    : {};
  view.show(model, visible(), {
    selected,
    axis,
    measure: feature,
    fit: fit === true ? preset() : fit,
    offsets,
    muted: presentation === "interface" ? ["collector", "joint"] : [],
  });
  $("labels").setAttribute("aria-pressed", labels);
  $("section").disabled = before || presentation === "empty";
  $("section").value = axis;
  $("section-panel").hidden = !axis;
  if (axis) {
    const plane = { x: "Y–Z", y: "X–Z", z: "X–Y" }[axis];
    $("section-title").textContent =
      plane +
      " 단면" +
      (feature ? " · " + measure + " " + format(feature.value) + " mm" : "");
    const colors = visible()
      .filter((p) => model.sections[axis]?.[p.id]?.length)
      .map((p) => p.name);
    $("section-key").textContent =
      colors.join(" · ") +
      (measure === "A06" ? " · 절연 바닥 ↔ 캔 내측 바닥" : "");
    sectionDrawing(
      $("cross"),
      model,
      visible(),
      axis,
      feature && { ...feature, id: measure },
    );
  }
  $("measure-label").textContent =
    def && feature
      ? measure +
        "  " +
        (measure === "A06" && model.features.A01.value > 0
          ? "현재 위치 바닥 간극 (안착 기준 " +
            format(model.features.A06.value) +
            " mm)"
          : def.name) +
        "  " +
        format(feature.value) +
        " mm　｜　" +
        def.datum +
        "　·　" +
        def.direction
      : "";
}
function highlight(id) {
  if (id === measure || presentation === "empty" || presentation === "before")
    return;
  measure = id;
  const f = model.features[id];
  if (id === "A01") axis = "x";
  if (/^A0[2-7]$/.test(id)) axis = f.axis === 0 ? "y" : "x";
  for (const row of $("dimensions").querySelectorAll("[data-measure]"))
    row.classList.toggle("active", row.dataset.measure === id);
  draw(false);
}
function showList(host, entries, active, fn) {
  host.replaceChildren(
    ...Object.entries(entries).map(([id, label]) =>
      button(Array.isArray(label) ? label[0] : label, () => fn(id), {
        "data-key": id,
        "aria-pressed": id === active,
      }),
    ),
  );
}
function drawFields() {
  const n = ids.indexOf(project.stage) + 1,
    form = $("dimensions"),
    valuesById = project.product.values;
  form.replaceChildren();
  $("positions").replaceChildren();
  if (page === "process" && n === 4) {
    for (const [name, u] of [
      ["삽입 직전 · 95 mm", 95],
      ["삽입 중간 · 45 mm", 45],
      ["안착 위치 · 0 mm", 0],
    ]) {
      $("positions").append(
        button(name, () => values({ A01: u }), {
          "data-travel": u,
          "aria-pressed": valuesById.A01 === u,
        }),
      );
    }
    if (records)
      $("positions").append(
        button("기록 사례 · +Y 간섭", () =>
          go({
            project: {
              ...recordedExamples.interference(),
              stage: project.stage,
            },
          }),
        ),
        button("기본 예제 복원", () =>
          go({ project: { ...initial(), stage: project.stage } }),
        ),
      );
  }
  const list = dimensions.filter((d) =>
    page === "components"
      ? d.owner === component
      : d.owner === project.stage ||
        (!d.owner && d.stage === n) ||
        (d.owner === "display" && n === 5),
  );
  if (!list.length)
    form.append("부품 형상 치수는 부품·요소기술에서 설정합니다.");
  let hasInput = false;
  for (const d of list) {
    if (d.id === "W01") {
      const h = document.createElement("h3");
      h.textContent = "화면 표시 설정";
      form.append(h);
    }
    const row = document.createElement("div");
    row.className = "dimension";
    row.dataset.measure = d.id;
    const name = button(d.id + "  " + d.name, () => highlight(d.id));
    name.title = d.datum + " · " + d.direction;
    row.append(name);
    if (d.owner) {
      hasInput = true;
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.required = true;
      input.name = d.id;
      input.setAttribute("aria-label", d.id + " " + d.name + " (mm)");
      input.value = valuesById[d.id];
      input.disabled = !live;
      row.append(input);
    } else {
      const output = document.createElement("output");
      output.textContent = format(model.features[d.id].value) + " mm";
      row.append(output);
    }
    row.onpointerenter = () => highlight(d.id);
    row.addEventListener("focusin", () => highlight(d.id));
    row.onpointerdown = () => highlight(d.id);
    form.append(row);
  }
  if (hasInput) {
    const apply = document.createElement("button");
    apply.type = "submit";
    apply.textContent = "치수 적용";
    apply.id = "apply";
    apply.disabled = !live;
    const cancel = button("입력 취소", () => {
      form.reset();
      drawFields();
    });
    cancel.disabled = !live;
    form.append(apply, cancel);
  }
}
$("dimensions").onsubmit = (e) => {
  e.preventDefault();
  if (!live || pending) return;
  const changes = {};
  for (const input of $("dimensions").querySelectorAll("input"))
    changes[input.name] = input.valueAsNumber;
  values(changes);
};
const approvalText = (m) =>
  m.diagnostics.length
    ? "진단 · " + m.diagnostics[0].message
    : m.approval.welded
      ? "둘레 용접 표시"
      : m.approval.seated
        ? "안착 완료"
        : m.stage === "prism-insert"
          ? "삽입 행정 " + format(m.features.A01.value) + " mm"
          : m.approval.joined
            ? "접촉대 접합 성립"
            : "스택 기준";
function render(fit) {
  app.querySelector("h1").textContent = project.product.name;
  $("model-id").textContent =
    project.modelIdentity.modelId + " / 개정 " + project.modelIdentity.revision;
  for (const key of ["process", "components"])
    $(key).setAttribute("aria-pressed", key === page);
  $("overview").setAttribute("aria-pressed", !detail);
  $("detail").setAttribute("aria-pressed", detail);
  $("gallery").hidden = detail;
  $("workspace").hidden = !detail;
  const entries = page === "components" ? components : stages;
  $("parallel").hidden = detail || page !== "process";
  if (!detail) {
    $("gallery").querySelector("h2").textContent =
      page === "components" ? "부품·요소기술 전체보기" : "제품 공정도 전체보기";
    const host = $("cards");
    host.replaceChildren();
    const current = generation;
    if (page === "process")
      calculate({ ...project, stage: "prism-join" })
        .then((m) => {
          if (generation === current)
            thumbnail($("parallel-art"), componentParts(m.parts, "cap"));
        })
        .catch((e) => {
          if (generation === current) $("parallel-cap").title = e.message;
        });
    for (const [id, label] of Object.entries(entries)) {
      const isPart = page === "components";
      const card = button("", () => (isPart ? part(id) : stage(id)), {
        "data-card": id,
      });
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 290;
      const title = document.createElement("strong");
      title.textContent = isPart ? label[0] : number(id) + "  " + label;
      const status = document.createElement("small");
      status.textContent = "CAD 형상 조회 중";
      card.append(canvas, title, status);
      host.append(card);
      calculate({ ...project, stage: isPart ? label[1] : id })
        .then((m) => {
          if (current !== generation) return;
          thumbnail(canvas, isPart ? componentParts(m.parts, id) : m.parts);
          status.textContent = isPart
            ? dimensions.filter((d) => d.owner === id).length + "개 형상 입력"
            : approvalText(m);
        })
        .catch((e) => {
          if (current === generation) status.textContent = e.message;
        });
    }
  } else {
    const isPart = page === "components";
    $("tree").querySelector("h2").textContent = isPart
      ? "부품·요소기술"
      : "제품 공정도";
    showList(
      $("siblings"),
      entries,
      isPart ? component : project.stage,
      isPart ? part : stage,
    );
    $("parts").replaceChildren(
      ...visible().map((p) =>
        button(p.name, () => choosePart(p.id), {
          "data-part": p.id,
          "aria-pressed": p.id === selected,
        }),
      ),
    );
    $("scene-title").textContent = isPart
      ? components[component][0]
      : number(project.stage) + "  " + stages[project.stage];
    $("approval").textContent = isPart
      ? "단품"
      : ({
          internal: "외장·절연 숨김 · 내부 탭 접합",
          before: "정렬 분해도 · 표시 간격 X/Z +10 mm",
          bare: "절연 전",
          empty: "빈 캔",
          interface: "집전체 투시 · 접촉면 확인",
        }[presentation] ?? approvalText(model));
    $("diagnostics").replaceChildren(
      ...model.diagnostics.map((d) => {
        const p = document.createElement("p");
        p.textContent = d.message;
        return p;
      }),
    );
    options();
    drawFields();
    draw(fit);
  }
  toolbar();
}
function number(id) {
  return String(ids.indexOf(id) + 1).padStart(2, "0");
}
$("process").onclick = () => go({ page: "process", detail: false });
$("components").onclick = () => go({ page: "components", detail: false });
$("overview").onclick = () => go({ detail: false });
$("detail").onclick = () =>
  page === "components" ? part(component) : stage(project.stage);
$("parallel-cap").onclick = () => part("cap");
$("labels").onclick = () => {
  labels = !labels;
  draw(false);
};
$("fit").onclick = () => view?.fit(preset());
$("section").onchange = (e) => {
  axis = e.target.value;
  draw(false);
};
$("undo").onclick = () => change(history.undoList.at(-1), "undo");
$("redo").onclick = () => change(history.redoList.at(-1), "redo");
$("save").onclick = () => {
  if (!live || pending) return;
  const a = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob([JSON.stringify(project, null, 2)], {
        type: "application/json",
      }),
    );
  a.href = url;
  a.download = "prismatic-cell.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("open").onclick = () => {
  if (live) $("file").click();
};
$("file").onchange = async (e) => {
  try {
    if (!live) return;
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024)
      throw Error("12 MB 이하 파일을 선택하세요.");
    const raw = JSON.parse(await file.text());
    if (raw.productType === "prismatic")
      await go({ project: validate(raw), page: "process", detail: true });
    else {
      parseProject(JSON.stringify(raw));
      switchFile(raw, "pouch");
    }
  } catch (err) {
    error(err.message);
  } finally {
    e.target.value = "";
  }
};
export async function startPrismatic() {
  toolbar();
  try {
    const engine = await engineHealth();
    live = true;
    $("engine").textContent = "실시간 CAD · CadQuery " + engine.version;
  } catch (e) {
    if (import.meta.env.MODE !== "recorded-preview") {
      error(e.message);
      $("engine").textContent = "CAD 서버 없음";
      return;
    }
    try {
      records = await loadPreview(
        new URL("./prismatic-preview/", document.baseURI),
        recordedExamples,
        ids,
      );
      $("engine").textContent =
        "읽기 전용 프리뷰 · 사전 계산 형상 (" +
        records.manifest.sourceCommit.slice(0, 7) +
        ")";
    } catch (err) {
      error(err.message);
      return;
    }
  }
  const transfer = takeFile(),
    returning = tabReturn();
  await change(
    {
      project: transfer && live ? transfer : initial(),
      page: "process",
      detail: !!transfer && live && !returning,
      component: "stack",
    },
    "initial",
  );
  if (!model && transfer) {
    const msg = $("errors").textContent;
    await change(
      {
        project: initial(),
        page: "process",
        detail: false,
        component: "stack",
      },
      "initial",
    );
    error(msg);
  }
}
