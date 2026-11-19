import { designIdentity } from "../preview/identity.js";
import { drawThumbnail, overviewFrame } from "./thumbnail.js";

export const groups = [
  ["전극 조립·탭 용접", [
    ["stacked", "전극 적층"], ["gathered", "탭 정렬·집속"],
    ["preweld", "가용접"], ["welded", "메인 용접"], ["assembly", "테이프 부착"],
  ]],
  ["파우치 성형·수납", [
    ["film_formed", "한 장 필름 · 열린 두 컵"], ["assembly_loaded_open", "열린 컵에 테이프 부착 조립체 수납"],
    ["package_closed", "브리지 닫힘"],
  ]],
  ["패키지 실링·마감", [
    ["tab_sealed", "탭측 실링 · 가스측 개구"], ["gas_sealed", "가스방 외곽 실링"],
    ["final_sealed", "최종 실링 · 절단 전"], ["package_trimmed", "절단 후"],
    ["package_folded", "폴딩 · 완성셀"],
  ]],
];
const legacy = [
  groups[0],
  ["기존 파우치 공정", [
    ["pouch_formed", "파우치 성형"], ["loaded", "조립체 수납"],
    ["sealed", "공칭 실링"], ["trimmed", "절단 후"], ["folded", "폴딩 후"],
  ]],
];
const compatibility = [groups[0], ["기존 파우치 공정", [
  ["packaged", "파우치 패키징"], ["finished", "완성 셀"],
]]];

export function stageGroups(project) {
  if (project.product.processTooling) return groups;
  return project.product.pouchProcess ? legacy : compatibility;
}

const codeGroups = [
  ["S", ["stacked","gathered","preweld","welded","assembly","packaged","finished"]],
  ["P", legacy[1][1].map(([id]) => id)],
  ["R", groups.slice(1).flatMap(([, entries]) => entries.map(([id]) => id))],
];
export function stageCode(stage) {
  for (const [prefix, ids] of codeGroups) if (ids.includes(stage)) return prefix + ids.indexOf(stage);
  return "";
}

export function mountOverview({ host, details, getProject, calculate, selectStage }) {
  const cards = new Map();
  const photos = new Map();
  let key, generation = 0, ready = false;

  function paint(card, photo) {
    card.caption.textContent = photo.error || "";
    card.image.hidden = !!photo.error;
    if (!photo.error) card.image.src = photo.url;
    card.button.dataset.state = photo.error ? "unavailable" : "ready";
    card.button.disabled = !!photo.error;
  }

  function remember(project, result) {
    if (designIdentity(project) !== key || !cards.has(result.stage)) return;
    if (photos.has(result.stage)) return;
    const canvas = document.createElement("canvas");
    canvas.width = 624;
    const opened = ["film_formed", "assembly_loaded_open"].includes(result.stage);
    canvas.height = opened ? 452 : 250;
    drawThumbnail(canvas, result, opened ? { ...overviewFrame, centerY: -46 } : overviewFrame);
    const photo = { url: canvas.toDataURL(), result };
    photos.set(result.stage, photo);
    paint(cards.get(result.stage), photo);
  }

  async function load(project, token) {
    const order = [project.stage, ...cards.keys()];
    for (const stage of new Set(order)) {
      if (token !== generation || host.hidden || !ready) return;
      if (photos.has(stage) || !cards.has(stage)) continue;
      const card = cards.get(stage);
      try {
        const result = await calculate({ ...project, stage });
        if (token !== generation) return;
        remember(project, result);
      } catch (error) {
        if (token !== generation) return;
        const item = { error: error.message };
        photos.set(stage, item);
        paint(card, item);
      }
    }
  }

  function sync() {
    const project = structuredClone(getProject());
    const design = designIdentity(project);

    if (design !== key) {
      generation++;
      key = design;
      photos.clear();
      cards.clear();
      host.querySelector("#overview-model").textContent =
        [project.modelIdentity?.modelId || project.product.id,
          project.modelIdentity?.revision, project.demo ? "가상 예제" : ""].filter(Boolean).join(" · ");
      const sections = host.querySelector("#overview-groups");
      sections.replaceChildren();
      for (const [label, list] of stageGroups(project)) {
        const section = document.createElement("section");
        const heading = document.createElement("h2");
        heading.textContent = label;
        const row = document.createElement("div");
        row.className = "overview-cards";
        section.append(heading, row);
        sections.append(section);
        for (const [stage, name] of list) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "process-card";
          button.dataset.stage = stage;
          button.disabled = !ready;
          button.onclick = () => selectStage(stage);
          const frame = document.createElement("span");
          frame.className = "process-frame";
          const image = new Image();
          image.alt = "";
          image.hidden = true;
          const caption = document.createElement("span");
          caption.textContent = ready ? "CAD 형상 준비 중" : "형상 데이터 확인 중";
          const title = document.createElement("strong");
          title.textContent = name;
          const code = document.createElement("small"); code.textContent = stageCode(stage); title.append(code);
          frame.append(image, caption);
          button.append(frame, title);
          row.append(button);
          cards.set(stage, { button, image, caption });
        }
      }
    }
    for (const [stage, card] of cards) {
      if (stage === project.stage) card.button.setAttribute("aria-current", "true");
      else card.button.removeAttribute("aria-current");
    }
    return project;
  }

  function open() {
    host.hidden = false;
    details.hidden = true;
    document.body.classList.add("overview-open");
    const project = sync();
    load(project, ++generation);
  }

  function showDetail() {
    generation++;
    host.hidden = true;
    details.hidden = false;
    document.body.classList.remove("overview-open");
    window.dispatchEvent(new Event("resize"));
  }

  return {
    open, showDetail,
    acceptedResult(project) {
      if (designIdentity(project) === key) return photos.get(project.stage)?.result;
    },
    refresh(project, result) {
      const previous = key;
      sync();
      remember(project, result);
      if (previous !== key && !host.hidden) load(project, generation);
    },
    available(value) {
      ready = value;
      host.querySelector("#overview-message").textContent = value
        ? "공정을 선택하면 같은 모델의 3D 상세가 열립니다."
        : "로컬 CAD 서버 또는 사전 계산 프리뷰에서 공정 형상을 확인할 수 있습니다.";
      for (const card of cards.values()) {
        card.button.disabled = !value;
        if (!value) card.caption.textContent = "형상 데이터 없음";
      }
      if (value && !host.hidden) open();
    },
  };
}
