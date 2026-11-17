import * as T from 'three';
// CPU z-buffer fallback. Opaque visibility is depth tested per pixel.
// Transparent layers use sorted alpha blending (preview only).
export class SoftwareRenderer{
  constructor(){this.domElement=document.createElement('canvas');this.ctx=this.domElement.getContext('2d');}
  setSize(w,h){this.domElement.width=Math.round(w);this.domElement.height=Math.round(h);}
  render(scene,camera){
    const ctx=this.ctx,w=this.domElement.width,h=this.domElement.height;if(!w||!h)return;
    const image=ctx.createImageData(w,h),pixels=image.data,depth=new Float32Array(w*h).fill(Infinity),opaque=[],transparent=[],lines=[];
    scene.updateMatrixWorld();camera.updateMatrixWorld();const light=new T.Vector3(-.3,-.4,1).normalize();
    const screen=v=>{const p=v.clone().project(camera);return [(p.x+1)*w/2,(1-p.y)*h/2,p.z];};
    scene.traverse(obj=>{if(!obj.visible||!obj.geometry||obj.parent?.visible===false)return;const attr=obj.geometry.getAttribute('position');if(!attr)return;const verts=[];for(let i=0;i<attr.count;i++)verts.push(new T.Vector3().fromBufferAttribute(attr,i).applyMatrix4(obj.matrixWorld));
      if(obj.isMesh){const idx=obj.geometry.index?.array||Array.from({length:attr.count},(_,i)=>i);for(let i=0;i<idx.length;i+=3){const a=verts[idx[i]],b=verts[idx[i+1]],c=verts[idx[i+2]],normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),p=[a,b,c].map(screen);if(p.every(x=>x[2]>1||x[2]< -1))continue;const shade=.58+.42*Math.abs(normal.dot(light)),col=obj.material.color.clone();if(obj.material.emissive)col.add(obj.material.emissive);col.convertLinearToSRGB();const rgb=[col.r,col.g,col.b].map(c=>Math.min(255,Math.round(c*255*shade)));const face={p,rgb,alpha:obj.material.opacity,z:p.reduce((s,x)=>s+x[2],0)/3};(face.alpha<1?transparent:opaque).push(face);}}
      else if(obj.isLine){const color=obj.material.color.clone().convertLinearToSRGB();lines.push({p:verts.map(screen),rgb:[color.r,color.g,color.b].map(c=>Math.round(c*255)),segments:obj.isLineSegments});}
    });
    const raster=(face,blend=false)=>{const [a,b,c]=face.p,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-8)return;
      const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],c[0]))),y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],c[1])));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const u=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/den,v=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/den,t=1-u-v;if(u< -1e-7||v< -1e-7||t< -1e-7)continue;const z=u*a[2]+v*b[2]+t*c[2],index=y*w+x;if(z>=depth[index]+1e-8)continue;const i=index*4;if(!blend){depth[index]=z;pixels.set([...face.rgb,255],i);}else{const alpha=face.alpha,previous=pixels[i+3]/255,total=alpha+previous*(1-alpha);for(let k=0;k<3;k++)pixels[i+k]=(face.rgb[k]*alpha+pixels[i+k]*previous*(1-alpha))/total;pixels[i+3]=total*255;}}
    };
    opaque.forEach(f=>raster(f));transparent.sort((a,b)=>b.z-a.z).forEach(f=>raster(f,true));
    for(const line of lines){for(let j=1;j<line.p.length;j+=line.segments?2:1){const a=line.p[j-1],b=line.p[j],n=Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1])));for(let q=0;q<=n;q++){const u=n?q/n:0,x=Math.round(a[0]+u*(b[0]-a[0])),y=Math.round(a[1]+u*(b[1]-a[1])),z=a[2]+u*(b[2]-a[2]);if(x<0||x>=w||y<0||y>=h||z>depth[y*w+x]+.00001)continue;pixels.set([...line.rgb,255],(y*w+x)*4);}}}
    ctx.putImageData(image,0,0);
  }
}
