import json,urllib.request,urllib.error,copy
from pathlib import Path
root=Path(__file__).resolve().parents[1]
project=json.loads((root/'examples/demo.json').read_text())
base='http://127.0.0.1:8765'
health=json.load(urllib.request.urlopen(base+'/api/health'))
assert health['status']=='ready'
for revision,stage in enumerate(['assembly','packaged','finished'],101):
 project['stage']=stage
 request=urllib.request.Request(base+'/api/rebuild',data=json.dumps({'project':project,'revision':revision}).encode(),headers={'Content-Type':'application/json'},method='POST')
 response=json.load(urllib.request.urlopen(request));assert response['revision']==revision;assert response['features']['stack.width.plus']['point'][1]==34
 print(stage,'revision',revision,'parts',len(response['parts']))
project['product']['stack']['width']=5
request=urllib.request.Request(base+'/api/rebuild',data=json.dumps({'project':project,'revision':999}).encode(),headers={'Content-Type':'application/json'},method='POST')
try:urllib.request.urlopen(request);raise AssertionError('invalid width accepted')
except urllib.error.HTTPError as e: assert e.code==422;assert '폭' in json.load(e)['errors'][0]
html=urllib.request.urlopen(base+'/').read().decode();assert '/src/main.js' not in html;assert 'assets/' in html
print('production HTML, local CAD API, revision echo and invalid input: PASS')
