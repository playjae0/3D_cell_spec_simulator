"""Live server check; no fixed precomputed meshes. Start cad/server.py first."""
import json,sys,urllib.request,urllib.error
from pathlib import Path
root=Path(__file__).resolve().parents[1];base=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765'
def post(project,revision):
 req=urllib.request.Request(base+'/api/rebuild',json.dumps({'project':project,'revision':revision,'requestToken':str(revision)}).encode(),{'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=90) as response:return json.load(response)
health=json.load(urllib.request.urlopen(base+'/api/health'));assert health['mode']=='live-cad' and health['schemaVersion'] in [3,4]
assert 'Pouch Cell' in urllib.request.urlopen(base).read().decode()
p=json.loads((root/'examples/demo.json').read_text())
for i,stage in enumerate(['stacked','gathered','preweld','welded','assembly','packaged','finished']):
 p['stage']=stage;r=post(p,100+i);assert r['revision']==100+i and r['requestToken']==str(100+i) and r['stage']==stage;print(stage,'parts',len(r['parts']),'geometryId',r['geometryId'][:12])
p['stage']='gathered';before=post(p,201);p['product']['positive']['tab']['foilWidth']=34;after=post(p,202)
assert before['geometryId']!=after['geometryId']
a={x['id']:x for x in after['parts']};b={x['id']:x for x in before['parts']}
assert a['positive.tab']['volume']!=b['positive.tab']['volume'];assert a['negative.tab']==b['negative.tab']
assert after['features']['positive.tab.rootWidthPlus']['point'][1]-after['features']['positive.tab.rootWidthMinus']['point'][1]==34
p['product']['stack']['width']=5
try:post(p,203);raise AssertionError('invalid input accepted')
except urllib.error.HTTPError as error:assert error.code==422
print('Live shape change, independent pole, 7 stages, request token/revision, invalid input: PASS')
