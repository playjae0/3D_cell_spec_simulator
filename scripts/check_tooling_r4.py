"""Export measured R4 before/after values from exact CAD; no UI claims here."""
import sys,json,copy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'cad'))
from model import build
from geometry_metrics import exact_bounds
P=json.loads((ROOT/'examples/process-tooling-r4.json').read_text())['product']
def changed(path,value):
 p=copy.deepcopy(P);o=p
 for k in path[:-1]:o=o[int(k) if isinstance(o,list) else k]
 o[int(path[-1]) if isinstance(o,list) else path[-1]]=value
 return p
def shape(m,id):return next(x['shape'] for x in m['parts'] if x['id']==id)
def box(s):
 b=exact_bounds(s);return {'min':[b.xmin,b.ymin,b.zmin],'max':[b.xmax,b.ymax,b.zmax],'volume':s.Volume()}
r={};m=build(P,'preweld');n=build(changed(['processTooling','poles','positive','gathering','depth'],3),'preweld')
r['gathering']={'before':m['toolingResults']['poles'],'after':n['toolingResults']['poles']}
n=build(changed(['processTooling','poles','positive','tools','preweld','horn','x'],1.9),'preweld');r['horn']={k:{s:{tool:{field:data[field] for field in ['contactArea','center','surfaceZ']} for tool,data in v['tools'].items()} for s,v in x['toolingResults']['plans'].items()} for k,x in [('before',m),('after',n)]}
m=build(P,'tab_sealed');n=build(changed(['processTooling','sealBars','positive_upper','vertices','1','arc'],1),'tab_sealed')
r['seal']={k:{s:{f:v for f,v in x['toolingResults']['seals'][s].items() if f in ['productArea','overlapArea','sections']} for s in ['positive','negative']} for k,x in [('before',m),('after',n)]}
r['seal']['unchangedLead']={'before':box(shape(m,'positive.lead')),'after':box(shape(n,'positive.lead'))}
r['pouch']={}
for stage in ['film_formed','assembly_loaded_open','package_closed','tab_sealed','gas_sealed','final_sealed','package_trimmed','package_folded']:
 m=build(P,stage);r['pouch'][stage]={'state':m['toolingResults']['packaging'],'seals':[x['id'] for x in m['parts'] if x['id'].startswith('seal.')],'lower':box(shape(m,'pouch.lower.flange'))}
p=copy.deepcopy(P);p['pouchProcess']['sheets']['upper']['depth']=4.7;p['pouchProcess']['sheets']['upper']['floorR']=1.4;m=build(p,'assembly_loaded_open');r['cupChange']={'upper':box(shape(m,'pouch.upper.pocket')),'lower':box(shape(m,'pouch.lower.pocket')),'settings':m['toolingResults']['packaging']}
m=build(changed(['processTooling','packaging','cutY'],52),'package_trimmed');r['trimChange']=m['toolingResults']['packaging']
(ROOT/'docs/r4/cad-results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print('CAD evidence written: docs/r4/cad-results.json')
