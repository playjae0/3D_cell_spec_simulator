const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
export function datumPoint(p,datum){const v=sub(p,datum.origin),a=-datum.rotationZ*Math.PI/180;return [v[0]*Math.cos(a)-v[1]*Math.sin(a),v[0]*Math.sin(a)+v[1]*Math.cos(a),v[2]];}
export function worldVector(p,datum){const a=datum.rotationZ*Math.PI/180;return [p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a),p[2]];}
export function evaluate(m,features,datum={origin:[0,0,0],rotationZ:0}){
  const a=features[m.a?.featureId],b=features[m.b?.featureId];
  if(!a||(m.mode!=='radius'&&!b))return {valid:false,error:'참조가 없음 · 재선택 필요'};
  if(m.mode==='radius')return a.kind==='radius'?{valid:true,value:a.value,a:a.center,b:a.point}:{valid:false,error:'반경 feature를 선택하세요'};
  const d=sub(datumPoint(b.point,datum),datumPoint(a.point,datum));let value;
  if(m.mode==='thickness'){
    if(a.partId!==b.partId||a.kind!=='face'||b.kind!=='face'||Math.hypot(d[0],d[1])>1e-5||Math.abs(d[2])<1e-8||Math.abs(a.normal?.[2]||0)!==1||a.normal[2]!==-b.normal?.[2])return {valid:false,error:'두께는 같은 부품의 Z 대응 면 중심을 선택하세요'};
    value=Math.abs(d[2]);
  }else value=m.mode==='distance'?Math.hypot(...d):Math.abs(d[['x','y','z'].indexOf(m.mode)]);
  return {valid:Number.isFinite(value),value,a:a.point,b:b.point};
}
export function dimensionLayout(m,features,datum){
  const result=evaluate(m,features,datum);if(!result.valid)return null;
  const {a,b}=result;let c=[...a],d=[...b];
  const index=['x','y','z'].indexOf(m.mode==='thickness'?'z':m.mode);
  if(index>=0){const av=datumPoint(a,datum),bv=datumPoint(b,datum),v=[0,0,0];v[index]=bv[index]-av[index];d=add(c,worldVector(v,datum));}
  const off=[0,0,0];off[['x','y','z'].indexOf(m.offsetAxis)]=m.offset;const v=worldVector(off,datum);c=add(c,v);d=add(d,v);
  if(m.mode==='radius')return {...result,c:a,d:b,label:add(b,v),leader:[b,add(b,v)]};
  return {...result,c,d,label:c.map((v,i)=>(v+d[i])/2)};
}
export function inspection(m){const s=m.spec;if(s.measured===null||s.target===null||s.minus===null||s.plus===null)return '실측 판정 없음';return s.measured>=s.target-s.minus&&s.measured<=s.target+s.plus?'공차 내':'공차 이탈';}
