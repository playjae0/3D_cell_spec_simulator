"""Reproducible engineering views of the virtual intake example, not product validation."""
import sys,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'cad'))
from model import build
import cadquery as cq
import numpy as np
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
project=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import fs from 'node:fs';import {projectFromIntake} from './src/intake/adapter.js';console.log(JSON.stringify(projectFromIntake(JSON.parse(fs.readFileSync('examples/intake/virtual-complete.json')),'welded')));"],cwd=ROOT))
m=build(project['product'],'welded');parts=m['parts'];out=ROOT/'docs/validation-integrated';out.mkdir(exist_ok=True)
fig,axs=plt.subplots(3,1,figsize=(13,9),layout='constrained')
def projection(ax,ps,axes):
 depth=next(a for a in [0,1,2] if a not in axes);tris=[]
 for p in ps:
  v,f=p.get('displayShape',p['shape']).tessellate(.1,.2);points=np.array([x.toTuple() for x in v]);faces=points[np.array(f)]
  tris.extend((face[:,depth].mean(),face[:,axes],p['color']) for face in faces)
 tris.sort(key=lambda t:t[0]);ax.add_collection(PolyCollection([t[1] for t in tris],facecolors=[t[2] for t in tris],edgecolors='none'));ax.autoscale();ax.set_aspect('equal');ax.grid(alpha=.2)
projection(axs[0],parts,(0,1));axs[0].set_title('Front XY / independent positive and negative inputs; S3 lead sealant present, yellow tape not yet applied');axs[0].set_ylabel('Y / mm')
left=[p for p in parts if p['id'].startswith('positive.') and '.tape.' not in p['id'] ]
projection(axs[1],left,(0,2));axs[1].set_ylim(-4,4);axs[1].set_title('Side XZ / positive tab gathering and lead, lead sealant retained');axs[1].set_ylabel('Z / mm')
for path in m['paths']:
 if path['partId']=='positive.tab':a=np.array(path['points']);axs[1].plot(a[:,0],a[:,2],color='#5a727a',lw=.6)
film=next(p for p in parts if p['id']=='positive.leadFilm')['shape'].BoundingBox();sectionX=(film.xmin+film.xmax)/2
plane=cq.Face.makePlane(1000,1000,cq.Vector(sectionX,0,0),cq.Vector(1,0,0))
for p in parts:
 if not p['id'].startswith('positive.'):continue
 for e in p['shape'].intersect(plane).Edges():
  a=np.array([e.positionAt(t).toTuple() for t in np.linspace(0,1,60)]);axs[2].plot(a[:,1],a[:,2],color=p['color'],lw=2)
axs[2].set_aspect('equal');axs[2].set_ylim(-2,2);axs[2].grid(alpha=.2);axs[2].set_title(f'Section X = {sectionX:.3f} mm / nominal lead and independent lead sealant');axs[2].set_xlabel('Y / mm');axs[2].set_ylabel('Z / mm')
fig.suptitle('INTEGRATED INSPECTION / VIRTUAL FIXTURE ONLY / original CAD retained',fontsize=14)
fig.savefig(out/'s3-sealant-front-side-section.png',dpi=150);print(out/'s3-sealant-front-side-section.png')
