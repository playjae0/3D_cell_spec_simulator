import { partImage } from "./part-images.js";

const groups = {stack:"적층 조립체", positive:"양극 탭 조립체", negative:"음극 탭 조립체",
  pouch:"파우치 외장", seal:"제품 실링", tool:"작업 공구"};

function button(label, attribute, value, action) {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  el.setAttribute(attribute, value);
  el.onclick = action;
  return el;
}
function eye(name, attribute, id, visible, action) {
  const el = button("", attribute, id, action);
  el.className = "visibility-button";
  el.setAttribute("aria-label", name + " 표시");
  el.setAttribute("aria-pressed", String(visible));
  el.title = name + (visible ? " 숨기기" : " 표시");
  el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12Q12 -2 22 12Q12 26 2 12Z"/><circle cx="12" cy="12" r="3"/>' +
    (visible ? "" : '<path d="m3 3 18 18"/>') + '</svg>';
  return el;
}
export function createPartTree(host) {
  const expanded = new Set(["stack","positive"]);
  return {
    reveal(id) { expanded.add(id.split(".")[0]); },
    render({parts, view, selected, selectedGroup, select, selectGroup, refresh, redraw}) {
      host.replaceChildren();
      const hidden = new Set(view.hidden);
      for (const [group, name] of Object.entries(groups)) {
        const members = parts.filter(p => p.id.split(".")[0] === group);
        if (!members.length) continue;
        const header = document.createElement("div");
        header.className = "tree-header";
        const toggle = button(expanded.has(group) ? "▾" : "▸", "data-expand", group, () => {
          if (expanded.has(group)) expanded.delete(group); else expanded.add(group);
          redraw();
        });
        toggle.setAttribute("aria-label", name + " 목록");
        toggle.setAttribute("aria-expanded", String(expanded.has(group)));
        const choose = button(name, "data-group", group, () => selectGroup(group));
        choose.setAttribute("aria-pressed", String(selectedGroup === group));
        const snapshots = view.groupHidden || {};
        const groupIsVisible = !Object.hasOwn(snapshots, group);
        const visibility = eye(name, "data-group-eye", group, groupIsVisible, () => {
          const snapshots = view.groupHidden ||= {};
          if (Object.hasOwn(snapshots, group)) {
            const restore = new Set(snapshots[group]);
            view.hidden = view.hidden.filter(id => id.split(".")[0] !== group || restore.has(id));
            delete snapshots[group];
          } else {
            snapshots[group] = view.hidden.filter(id => id.split(".")[0] === group);
            view.hidden = [...new Set([...view.hidden,...members.map(p=>p.id)])];
          }
          refresh();
        });
        header.append(toggle, choose, visibility);
        host.append(header);
        if (!expanded.has(group)) continue;
        for (const p of members) {
          const row = document.createElement("div");
          row.className = "tree-row";
          const pick = button(p.name.replace(/^(양극|음극) · /,""), "data-part",p.id,()=>select(p.id));
          const img = new Image(); img.alt = ""; img.src = partImage(p);
          pick.prepend(img);
          pick.setAttribute("aria-pressed", String(selected === p.id || selectedGroup === group));
          const show = eye(p.name, "data-eye",p.id,!hidden.has(p.id),()=>{
            view.hidden = hidden.has(p.id) ? view.hidden.filter(x=>x!==p.id) : [...view.hidden,p.id];
            refresh();
          });
          show.disabled = !groupIsVisible;
          row.append(pick, show);
          host.append(row);
        }
      }
    },
  };
}
