"""Scientific inspection figures from CAD, not artistic image generation."""
import sys,json,copy,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'cad'))
import cadquery as cq
import numpy as np
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from model import build_pole,tape_shape
from proof_pocket import pocket
P=json.loads((ROOT/'examples/demo.json').read_text())['product'];OUT=ROOT/'docs/validation-v1.2';OUT.mkdir(exist_ok=True)

def project(ax,parts,axes):
    triangles=[];colors=[];depthAxis=next(i for i in [0,1,2] if i not in axes); ordered=[]
    for part in parts:
        v,f=part.get('displayShape',part['shape']).tessellate(.06,.2);v=np.array([x.toTuple() for x in v]);faces=v[np.array(f)]
        for face in faces: ordered.append((face[:,depthAxis].mean(),face[:,axes],part['color']))
    for _,tri,color in sorted(ordered,key=lambda x:x[0]): triangles.append(tri);colors.append(color)
    ax.add_collection(PolyCollection(triangles,facecolors=colors,edgecolors='none'));ax.autoscale();ax.set_aspect('equal');ax.grid(alpha=.15)
def section(ax,parts,axis,pos,axes):
    normal=[0,0,0];normal[axis]=1;origin=[0,0,0];origin[axis]=pos
    plane=cq.Face.makePlane(2000,2000,cq.Vector(*origin),cq.Vector(*normal))
    for p in parts:
        cut=p['shape'].intersect(plane)
        for edge in cut.Edges():
            pts=np.array([edge.positionAt(t).toTuple() for t in np.linspace(0,1,70)])
            ax.plot(pts[:,axes[0]],pts[:,axes[1]],color=p['color'],lw=2)
    ax.set_aspect('equal');ax.grid(alpha=.2)

parts,features,paths=build_pole('positive',P['positive'],P['stack'])
bare=[x for x in parts if '.tape.' not in x['id'] and 'Film' not in x['id']]
fig,axs=plt.subplots(3,1,figsize=(12,8),layout='constrained')
project(axs[0],bare,(0,1));axs[0].set_title('A / Front XY · tape hidden · positive example');axs[0].set_ylabel('Y / mm')
project(axs[1],bare,(0,2));axs[1].set_title('Side XZ · distributed foil roots gather to a finite central overlap');axs[1].set_ylabel('Z / mm')
for path in paths:
    if 'tab' in path['partId']:
        arr=np.array(path['points']);axs[1].plot(arr[:,0],arr[:,2],color='#4d5961',lw=.7)
section(axs[2],bare,0,-135,(1,2));axs[2].set_title('Section at X = −135 mm · tab / lead contact (below = example assumption)');axs[2].set_xlabel('Y / mm');axs[2].set_ylabel('Z / mm');axs[2].set_ylim(-2,2)
fig.suptitle('USER CORRECTION: central gathering, no V-fold, no blade / special guide',fontsize=13);fig.savefig(OUT/'tab-front-side-section.png',dpi=150);plt.close(fig)

fig,axs=plt.subplots(2,1,figsize=(12,6),layout='constrained')
for ax,dz,w in zip(axs,[0,.7],[32,36]):
    p=copy.deepcopy(P['positive']);p['tab']['gatherZ']=dz;p['tab']['foilWidth']=w;p['tapes'][0]['path']='top_edges';ps,_,_=build_pole('positive',p,P['stack'])
    section(ax,[x for x in ps if 'Film' not in x['id']],0,-135,(1,2));ax.set_ylim(-1.3,2.1);ax.set_title(f'B / Wrapped path option · gather Z={dz} · tab width={w} mm · tape touches top + side arcs');ax.set_xlabel('Y / mm');ax.set_ylabel('Z / mm')
fig.savefig(OUT/'tape-contact-before-after.png',dpi=150);plt.close(fig)

fig,axs=plt.subplots(2,2,figsize=(13,7),layout='constrained')
for ax,(d,rf,rt) in zip(axs.flat,[(4.3,1.2,.85),(5.2,1.2,.85),(4.3,1.6,.85),(4.3,1.2,1.1)]):
    shape=pocket(90,45,d,rf,rt,7,.15)
    section(ax,[{'shape':shape,'color':'#317d83'}],0,0,(1,2));ax.set_xlim(16,23.5);ax.set_ylim(-.3,6);ax.set_xlabel('Y / mm');ax.set_ylabel('Z / mm');ax.set_title(f'C / depth {d} · floor R {rf} · rim R {rt}\nfilm 0.15 mm · plan R 7 mm')
fig.savefig(OUT/'pocket-independent-radii.png',dpi=150);plt.close(fig)
print('CAD proof figures:',OUT)
