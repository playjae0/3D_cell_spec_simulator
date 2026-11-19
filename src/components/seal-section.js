// Draw only engine-recorded section vertices. No geometric recomputation in preview.
export function sealSection(bar) {
 const sections=bar.crossSections;
 if(!sections?.length)return '<p>단면 CAD 기록 없음</p>';
 const lines=(wires)=>wires.map(points=>`<polyline points="${points.map(([u,v])=>[u,-v].join(',')).join(' ')}" fill="none" stroke="#136c65" stroke-width=".3"/>`).join('');
 const points=bar.base.flat(),us=points.map(p=>p[0]),vs=points.map(p=>p[1]);
 const u0=Math.min(...us),u1=Math.max(...us),v0=Math.min(...vs),v1=Math.max(...vs);
 return `<section class="seal-cross-sections"><h3>선택 위치의 공칭 단면 · 바디 미정</h3>${sections.map((section,i)=>{
  const a=section.intervals.flat(),x0=a.length?Math.min(...a):-1,x1=a.length?Math.max(...a):1;
  return `<details ${i===0?'open':''} data-section-id="${section.id}"><summary>${section.id} · U=${section.u.toFixed(3)} · 폭 ${section.width.toFixed(3)} / 홈 ${section.recessDepth.toFixed(3)} mm</summary><div class="seal-section-pair"><svg viewBox="${u0-2} ${-v1-2} ${u1-u0+4} ${v1-v0+4}" role="img" aria-label="단면 위치 U=${section.u}">${lines(bar.base)}<path d="M${section.u} ${-v0+1} V${-v1-1}" stroke="#c66a28" stroke-width=".45" stroke-dasharray="1 .6"/></svg><svg viewBox="${x0-1} -1 ${x1-x0+2} ${Math.max(2,section.recessDepth+2)}" role="img" aria-label="V 법선 단면">${section.profile.map(points=>`<polyline points="${points.map(p=>p.join(',')).join(' ')}" stroke="#c66a28" fill="none" stroke-width=".07"/>`).join('')}<path d="M${x0} 0 H${x1}" stroke="#93aaa5" stroke-width=".03" stroke-dasharray=".1 .1"/></svg></div><p>+V 방향 절단 · 치끝/공칭 작업면 Z=0 · 홈 양수는 제품 반대 방향 · ${section.scope}</p></details>`;
 }).join('')}</section>`;
}
