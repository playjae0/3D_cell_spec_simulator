import {clipMesh} from '../viewer/clip.js';
const NS='http://www.w3.org/2000/svg';
const el=(name,attrs)=>{const n=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
export function sectionCenter(model,partId) {
 const part=model.parts.find(p=>p.id===partId)||model.parts.find(p=>p.meta?.datum)||model.parts.find(p=>p.id==='pouch.lower.pocket');
 const origin=part?.meta?.datum?.origin||model.features[part?.id+'.opening']?.point;
 return origin||[0,0,0];
}
export function renderSection(host,model,axis,position) {
 host.replaceChildren();if(axis==='none')return;
 const k=['x','y','z'].indexOf(axis),uv=[0,1,2].filter(i=>i!==k);
 const sets=model.parts.map(p=>({color:p.color,lines:clipMesh(p.mesh,axis,position).contours}));
 const points=sets.flatMap(s=>s.lines.flat());
 const caption=document.createElement('p');caption.textContent=`${axis.toUpperCase()} = ${position.toFixed(3)} mm · ${uv.map(i=>'XYZ'[i]).join('')} 단면 · CAD 표시 메시 교차선 (정밀 측정은 CAD 기준 치수 사용)`;host.append(caption);
 if(!points.length){host.append(document.createTextNode('이 위치에서 교차하는 부품이 없습니다. 중심 단면을 선택하세요.'));return;}
 const xs=points.map(p=>p[uv[0]]),ys=points.map(p=>p[uv[1]]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y,pad=Math.max(w,h,.1)*.07;
 const svg=el('svg',{viewBox:`${x-pad} ${-y-h-pad} ${w+2*pad} ${h+2*pad}`,role:'img','aria-label':'부품 단면 교차선'});
 for(const s of sets){svg.append(el('path',{d:s.lines.map(([a,b])=>`M${a[uv[0]]} ${-a[uv[1]]} L${b[uv[0]]} ${-b[uv[1]]}`).join(' '),fill:'none',stroke:s.color,'stroke-width':1.5,'vector-effect':'non-scaling-stroke'}));}
 host.append(svg);
}
