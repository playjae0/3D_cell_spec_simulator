import { modelImages } from "./part-images.js";

export const components = {
  tab: "포일 탭 · 집속 전", tab_preweld: "포일 탭 · 가용접 후", tab_trimmed: "포일 탭 · 커팅 후", lead: "리드 · 실런트 결합 단품", tapes: "보호 테이프",
  pouch: "파우치 · 성형 컵과 가스방",
  preweld: "가용접 혼·엔빌", welded: "메인 용접 혼·엔빌", laser: "레이저 스팟 배열", seal:"실링바",
};
export const componentGroups = [["셀 구성 부품",["tab","tab_preweld","tab_trimmed","lead","tapes","pouch"]],
  ["공정 공구",["preweld","welded","laser","seal"]]];
export const modelChoices = {
  "pouch-phase1":["대표 셀","양방향 탭 · 한 장 필름 · 탭측 실링과 폴딩"],
  demo:["기본 가상 예제","적층 조립체와 탭·리드 치수"],
  "pouch-process":["기존 파우치","상·하 시트 성형 · P0–P4"],
  "process-tooling-r4":["요소기술 R4","혼·엔빌, 레이저와 꼭짓점 방식 실링바"],
};
export function ownerForPath(path) {
  if (path.startsWith("pouchProcess.sheets.")) return "pouch";
  const [, section] = path.split(".");
  return ({tab:"tab", lead:"lead",preweldLead:"lead",leadFilm:"lead",tapes:"tapes"})[section];
}
export function mountModelChoices(host, choose) {
  for (const [key,[name,hint]] of Object.entries(modelChoices)) {
    const el = document.createElement("button");
    el.dataset.model = key;
    const image = new Image(); image.alt = ""; image.src = modelImages[key];
    const title = document.createElement("strong"); title.textContent = name;
    const detail = document.createElement("small"); detail.textContent = hint;
    el.append(image,title,detail); el.onclick = () => choose(key); host.append(el);
  }
}
export function mountComponents(host, choose) {
  for (const [name,keys] of componentGroups) {
    const section = document.createElement("section");
    const heading = document.createElement("h2"); heading.textContent = name;
    section.append(heading);
    for (const key of keys) {
      for (const side of (key==='pouch'?['common']:['positive','negative'])) {
       for(const kind of (['preweld','welded'].includes(key)?['horn','anvil']:[''])) {
        const el=document.createElement('button');el.dataset.component=key;el.dataset.side=side;el.dataset.kind=kind;
        const title=document.createElement('strong');title.textContent=(side==='common'?'':side==='positive'?'양극 · ':'음극 · ')+components[key]+(kind?' · '+(kind==='horn'?'혼':'엔빌'):'');
        const detail=document.createElement('small');detail.textContent='CAD 형상 조회 중…';el.append(title,detail);
        el.onclick=()=>choose(key,side==='common'?'positive':side,kind);section.append(el);
       }
      }
    }
    host.append(section);
  }
}
