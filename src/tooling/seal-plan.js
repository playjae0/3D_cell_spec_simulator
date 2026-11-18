const format = value => value.toFixed(2);
const marker = (id, color) => `<marker id="${id}" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L6 3 L0 6 Z" fill="${color}"/></marker>`;

export function tabSealPlan(seals, project, side, half) {
  const bar = seals[side + "_" + half];
  const product = seals[side];
  const p = bar.definition.tabProfile;
  const pole = project.product[side];
  const cy = pole.tab.gatherY + pole.lead.offsetY;
  const local = ([x, y]) => [y - cy, bar.definition.v - x * pole.end];
  const tool = ([u, v]) => [u, -v];
  const points = (list, convert) => list.map(point => convert(point).join(",")).join(" ");
  const outline = (wires, convert, stroke, fill, classes = "") => (wires || []).map(wire =>
    `<polygon points="${points(wire, convert)}" stroke="${stroke}" stroke-width=".34" fill="${fill}" ${classes}/>`
  ).join("");
  const context = product.planContext || {};
  function box(id, fill, stroke, dash = "") {
    const values = context[id];
    if (!values) return "";
    const [x0, y0, x1, y1] = values;
    const [u0, v0] = local([x0, y0]), [u1, v1] = local([x1, y1]);
    return `<rect x="${Math.min(u0,u1)}" y="${Math.min(v0,v1)}" width="${Math.abs(u0-u1)}" height="${Math.abs(v0-v1)}" fill="${fill}" stroke="${stroke}" stroke-width=".25" ${dash}/>`;
  }
  const dimensions = product.tabDimensions || {};
  const dim = dimensions.center ? dimensions : bar.tabDimensions;
  const measured = !!dimensions.center;
  const convert = measured ? local : tool;
  let guides = "";
  if (dim?.center) {
    const ends = dim.center.ends.map(convert).sort((a,b) => a[0]-b[0]);
    const [[x0, y], [x1]] = ends;
    guides = `<path d="M${x0} ${y} v7 M${x1} ${y} v7" stroke="#276365" stroke-width=".26"/><path d="M${x0} ${y+5} H${x1}" stroke="#276365" stroke-width=".3" marker-start="url(#seal-arrow)" marker-end="url(#seal-arrow)"/><text x="${(x0+x1)/2}" y="${y+8.9}" text-anchor="middle" fill="#184c51">L ${format(dim.center.length)}</text>`;
  }
  if (dim?.radius) {
    const a = convert(dim.radius.arc[Math.floor(dim.radius.arc.length/2)]);
    guides += `<path d="M${a[0]} ${a[1]} l8 7 h6" stroke="#8a4d23" stroke-width=".26" fill="none" marker-start="url(#seal-radius-arrow)"/><text class="radius-label" x="${a[0]+15}" y="${a[1]+7.8}" fill="#8a4d23">R ${format(dim.radius.radius)}</text>`;
  }
  const w = Math.max(p.centerLength + 52, 92);
  return `<p>${side === "positive" ? "양극" : "음극"} · 리드 쪽 ↑ / 컵 쪽 ↓ · ${measured ? "제품 접점·원호" : "선택 공구 기준"}</p>
    <svg viewBox="${-w/2} -19 ${w} 41" role="img" aria-label="탭측 실링면과 L, R 치수" class="tab-seal-plan">
      <defs>${marker("seal-arrow","#276365")}${marker("seal-radius-arrow","#8a4d23")}</defs>
      ${outline(product.cupOpening, local, "#71868d", "#d7e1e5")}
      ${box(side+".lead","#c4cbce","#6b7e81")}
      ${box(side+".leadFilm","#eedcb3","#a17a2d",'stroke-dasharray="1.4 1"')}
      ${outline(bar.base, tool, "#4180b5", "none", 'stroke-dasharray="1.4 1"')}
      ${outline(product.product, local, "#007c69", "#87cabaaf")}
      ${guides}
    </svg>
    <p class="seal-legend">파란 점선 공구 · 녹색 제품 실링 · 황색 리드 실런트 · 회색 컵 입구와 리드</p>`;
}
