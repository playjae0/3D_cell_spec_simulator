import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {SoftwareRenderer} from './software.js';
import {clipMesh} from './clip.js';
import {locateOnPatch} from '../annotations/anchors.js';
import {dimensionLayout} from '../annotations/measure.js';
const NS='http://www.w3.org/2000/svg';
const sv=(tag,attrs={},text)=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;return e;};
export class Viewer{
  constructor(host,{onSelect,onPick,onAnchor,onCamera}){
    this.host=host;this.onSelect=onSelect;this.onPick=onPick;this.onCamera=onCamera;this.scene=new T.Scene();this.camera=new T.OrthographicCamera(-180,180,110,-110,.1,3000);this.camera.position.set(160,-220,320);this.camera.up.set(0,0,1);
    try{this.renderer=new T.WebGLRenderer({antialias:true,alpha:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.mode='WebGL · CAD 메시';}catch{this.renderer=new SoftwareRenderer();this.mode='CPU CAD 미리보기 · 투명 합성 근사';}
    this.host.append(this.renderer.domElement);this.overlay=sv('svg',{'class':'model-overlay'});this.host.append(this.overlay);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=false;this.controls.addEventListener('change',()=>{this.draw();onCamera?.(this.getCamera());});
    this.scene.add(new T.HemisphereLight(0xffffff,0x71828b,2));const lamp=new T.DirectionalLight(0xffffff,2.4);lamp.position.set(-50,-80,200);this.scene.add(lamp);
    this.model=new T.Group();this.scene.add(this.model);this.meshes=[];this.selected=null;this.picking=false;this.pickKind='point';this.through=false;this.zoomScale=1;
    this.ray=new T.Raycaster();let down;
    this.renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
    this.renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=host.getBoundingClientRect(),pt=[e.clientX-r.left,e.clientY-r.top];this.ray.setFromCamera(new T.Vector2(pt[0]/r.width*2-1,-pt[1]/r.height*2+1),this.camera);const candidates=this.meshes.filter(m=>m.visible&&(!this.through||!m.userData.part.id.startsWith('pouch.')));const hits=this.ray.intersectObjects(candidates);if(this.picking){if(this.pickKind==='surface'){const hit=hits[0];if(!hit){onAnchor?.(null);return;}for(const [id,f] of Object.entries(this.data.features)){if(f.partId!==hit.object.userData.part.id)continue;const uv=locateOnPatch(f,hit.point.toArray());if(uv){onAnchor?.({baseFeatureId:id,...uv});return;}}onAnchor?.(null);return;}const fs=this.visibleFeatures().filter(([,f])=>f.kind===this.pickKind);const near=fs.map(([id,f])=>({id,f,p:this.project(f.point)})).map(x=>({...x,d:Math.hypot(x.p[0]-pt[0],x.p[1]-pt[1])})).sort((a,b)=>a.d-b.d);if(near[0]?.d<24){onPick(near[0].id);return;}if(hits[0]){const id=hits[0].object.userData.part.id;const fs2=near.filter(x=>x.f.partId===id);if(fs2[0])onPick(fs2[0].id);}}else if(hits[0]){this.select(hits[0].object.userData.part.id);onSelect(this.selected);}});
    new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;this.renderer.setSize(w,h);const half=115;this.camera.left=-half*w/h;this.camera.right=half*w/h;this.camera.top=half;this.camera.bottom=-half;this.camera.updateProjectionMatrix();this.overlay.setAttribute('viewBox',`0 0 ${w} ${h}`);this.draw();}).observe(host);
    this.view('iso');
  }
  disposeModel(){for(const child of [...this.model.children]){child.geometry?.dispose();child.material?.dispose();this.model.remove(child);}this.meshes=[];}
  setModel(data,state){this.data=data;this.state=state;this.disposeModel();const hidden=new Set(state.view.hidden);for(const part of data.parts){
    const {mesh,contours}=clipMesh(part.mesh,state.view.section.axis,state.view.section.position);const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(mesh.positions,3));geo.setIndex(mesh.indices);geo.computeVertexNormals();
    const transparent=state.view.transparent&&part.id.startsWith('pouch.');const material=new T.MeshStandardMaterial({color:part.color,metalness:.28,roughness:.55,side:T.DoubleSide,transparent,opacity:transparent?.22:1,polygonOffset:part.role==='region',polygonOffsetFactor:-1});
    const obj=new T.Mesh(geo,material);obj.userData.part=part;obj.visible=!hidden.has(part.id);this.model.add(obj);this.meshes.push(obj);
    if(contours.length&&!hidden.has(part.id)){const line=new T.LineSegments(new T.BufferGeometry().setFromPoints(contours.flat().map(p=>new T.Vector3(...p))),new T.LineBasicMaterial({color:'#dc6a42'}));this.model.add(line);}
  }
    for(const path of data.paths){if(hidden.has(path.partId))continue;const k=['x','y','z'].indexOf(state.view.section.axis),points=path.points;const segments=[];for(let i=1;i<points.length;i++){let a=points[i-1],b=points[i];if(k>=0){const da=a[k]-state.view.section.position,db=b[k]-state.view.section.position;if(da>0&&db>0)continue;if(da*db<0){const v=a.map((x,j)=>x+(b[j]-x)*da/(da-db));if(da>0)a=v;else b=v;}}segments.push(a,b);}const line=new T.LineSegments(new T.BufferGeometry().setFromPoints(segments.map(p=>new T.Vector3(...p))),new T.LineBasicMaterial({color:path.color}));this.model.add(line);}
    this.select(this.selected);this.draw();
  }
  visibleFeatures(){return Object.entries(this.data?.features||{}).filter(([,f])=>!this.state?.view.hidden.includes(f.partId)&&(!this.through||!f.partId.startsWith('pouch.')));}
  project(p){const v=new T.Vector3(...p).project(this.camera);return [(v.x+1)*this.host.clientWidth/2,(1-v.y)*this.host.clientHeight/2,v.z];}
  select(id){this.selected=id;for(const mesh of this.meshes)mesh.material.emissive?.set(mesh.userData.part.id===id?'#173f40':'#000000');this.draw();}
  setPicking(on,kind='point'){this.picking=on;this.pickKind=kind;this.draw();}
  getCamera(){return {position:this.camera.position.toArray(),target:this.controls.target.toArray(),up:this.camera.up.toArray(),zoom:this.camera.zoom};}
  restore(c){if(!c)return;this.camera.position.fromArray(c.position);this.camera.up.fromArray(c.up);this.camera.zoom=c.zoom;this.camera.updateProjectionMatrix();this.controls.target.fromArray(c.target);this.controls.update();this.draw();}
  view(name){const target=this.controls?.target.clone()||new T.Vector3();const dirs={front:[0,0,400],back:[0,0,-400],side:[0,-400,0],end:[400,0,0],iso:[130,-190,320]};this.camera.up.set(0,name==='front'||name==='back'?1:0,name==='front'||name==='back'?0:1);this.camera.position.copy(target).add(new T.Vector3(...dirs[name]));this.camera.lookAt(target);this.controls.update();this.draw();}
  fit(id){const part=this.data?.parts.find(p=>p.id===id);if(part){const a=part.bounds.min,b=part.bounds.max;this.controls.target.set(...a.map((v,i)=>(v+b[i])/2));this.camera.zoom=Math.min(6,230/Math.max(...a.map((v,i)=>b[i]-v))*0.65);}else{this.controls.target.set(0,0,0);this.camera.zoom=Math.min(1.5,(this.host.clientWidth/this.host.clientHeight)*230/390);}
    this.camera.updateProjectionMatrix();this.view('iso');}
  draw(){if(!this.renderer||!this.overlay)return;this.renderer.render(this.scene,this.camera);this.overlay.replaceChildren();const svg=this.overlay;
    const line=(a,b,color='#158b82',width=1,dash)=>{const x=this.project(a),y=this.project(b);const attrs={x1:x[0],y1:x[1],x2:y[0],y2:y[1],stroke:color,'stroke-width':width};if(dash)attrs['stroke-dasharray']='4 3';svg.append(sv('line',attrs));return [x,y];};
    const text=(p,label,color='#146e6a')=>{const [x,y]=this.project(p);svg.append(sv('text',{x,y:y-6,fill:color,'class':'dim-text','text-anchor':'middle'},label));};
    if(this.state?.view.datums){const L=this.state.product.stack.length,W=this.state.product.stack.width;line([-L*.6,0,0],[L*.6,0,0],'#d98763',.8,true);line([0,-W*.8,0],[0,W*.8,0],'#6f9b84',.8,true);line([0,0,-18],[0,0,18],'#718ac5',.8,true);text([L*.6,0,0],'X · C');text([0,W*.8,0],'Y · B');text([0,0,18],'Z · A');}
    let shown=0;for(const m of this.state?.measurements||[]){if(!m.visible||m.stage!==this.state.stage||shown>=200)continue;const d=dimensionLayout(m,this.data.features,this.state.datumSet);if(!d)continue;shown++;line(d.a,d.c,'#559b96',.8);line(d.b,d.d,'#559b96',.8);const [a,b]=line(d.c,d.d,'#0b877e',1.2);const len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len>2){const u=[(b[0]-a[0])/len,(b[1]-a[1])/len];for(const [v,sgn] of [[a,1],[b,-1]])svg.append(sv('path',{d:`M${v[0]} ${v[1]} L${v[0]+sgn*u[0]*7-u[1]*2.6} ${v[1]+sgn*u[1]*7+u[0]*2.6} L${v[0]+sgn*u[0]*7+u[1]*2.6} ${v[1]+sgn*u[1]*7-u[0]*2.6} Z`,fill:'#0b877e'}));}if(d.leader)line(...d.leader,'#0b877e',.8);text(d.label,`${m.mode==='radius'?'R ':''}${d.value.toFixed(2)} · ${m.name}`);}
    if(this.picking){for(const [id,f] of this.visibleFeatures().filter(([,f])=>f.kind===this.pickKind)){const [cx,cy]=this.project(f.point);const mark=sv('circle',{cx,cy,r:4,fill:'#f8a244',stroke:'white','stroke-width':1});mark.append(sv('title',{},id+' · '+f.name));svg.append(mark);}}
  }
}
