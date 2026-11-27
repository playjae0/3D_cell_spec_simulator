"""Local-only geometry API + production static host. No network dependency at runtime."""
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from tempfile import TemporaryDirectory
import json, hashlib, threading, traceback, os
import cadquery as cq
from model import build, serialize, ModelError
from process import STAGES
from local_host import bind_local, publish_bound_port
import prismatic

ROOT=Path(__file__).resolve().parents[1]
LOCK=threading.Lock()
CACHE={}
def model_for(project):
    kind = project.get('productType', 'pouch')
    if kind not in ('pouch', 'prismatic'):
        raise ModelError(['지원하지 않는 제품 타입'])
    prism = kind == 'prismatic'
    version = 'prismatic-stacked-cad-1' if prism else 'pouch-process-cad-2'
    if project.get('schemaVersion') not in [3,4] or project.get('modelVersion') != version or project.get('unit') != 'mm':
        raise ModelError(['지원하지 않는 프로젝트 버전 또는 단위'])
    if project.get('stage') not in (prismatic.STAGES if prism else STAGES):
        raise ModelError(['지원하지 않는 상태'])
    identity = [project['product'],project['stage']]
    if prism:
        identity.insert(0, kind)
    key=hashlib.sha256(json.dumps(identity,sort_keys=True,allow_nan=False).encode()).hexdigest()
    if key not in CACHE:
        builder = prismatic.build if prism else build
        result = builder(project['product'],project['stage'])
        CACHE[key]=(result,serialize(result, precise_bounds=prism))
        if len(CACHE)>8: CACHE.pop(next(iter(CACHE)))
    return key,*CACHE[key]

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(ROOT/'dist'),**kw)
    def log_message(self,*args): pass
    def send_json(self,code,data):
        body=json.dumps(data,ensure_ascii=False,allow_nan=False).encode();self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
    def do_GET(self):
        if self.path=='/api/health': return self.send_json(200,{'engine':'CadQuery','version':cq.__version__,'unit':'mm','status':'ready','mode':'live-cad','schemaVersion':4,'capabilities':['rebuild','step','process-states']})
        super().do_GET()
    def do_POST(self):
        try:
            # Same-origin local app only. No wildcard CORS / remote URL/file ingestion.
            origin=self.headers.get('Origin','')
            if origin and origin not in [f'http://{host}:{port}' for host in ['127.0.0.1','localhost'] for port in [5174,5175,self.server.server_port]]: return self.send_json(403,{'error':'허용되지 않은 Origin'})
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=12*1024*1024: return self.send_json(413,{'error':'요청 파일은 12 MB 이하'})
            req=json.loads(self.rfile.read(size)); project=req['project']; revision=req.get('revision',0)
            with LOCK:
                key,model,data=model_for(project)
                if self.path=='/api/rebuild': return self.send_json(200,{'revision':revision,'requestToken':req.get('requestToken'),'mode':'live-cad','geometryId':key,**data})
                if self.path=='/api/step':
                    wanted=req.get('partIds'); solids=[x['shape'] for x in model['parts'] if x['role']!='region' and (not wanted or x['id'] in wanted)]
                    if not solids: raise ModelError(['내보낼 유효한 솔리드가 없습니다'])
                    shape=cq.Compound.makeCompound(solids)
                    with TemporaryDirectory() as tmp:
                        path=Path(tmp)/'cell.step';cq.exporters.export(shape,str(path));body=path.read_bytes()
                    self.send_response(200);self.send_header('Content-Type','application/step');self.send_header('Content-Disposition','attachment; filename="pouch-demo-mm.step"');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
                self.send_json(404,{'error':'알 수 없는 API'})
        except ModelError as e: self.send_json(422,{'revision':locals().get('revision',0),'errors':e.errors})
        except (ValueError,KeyError,TypeError) as e: self.send_json(400,{'errors':['데이터 형식 오류: '+str(e)]})
        except Exception as e:
            traceback.print_exc();self.send_json(422,{'errors':['CAD 생성 실패: '+str(e)]})

if __name__=='__main__':
    port=int(os.environ.get('POUCH_PORT','8765'))
    with bind_local(Handler, port, automatic=os.environ.get('POUCH_AUTO_PORT')=='1') as server:
        publish_bound_port(server, os.environ.get('POUCH_LAUNCH_READY'))
        print(f'Pouch Cell CAD + web: http://127.0.0.1:{server.server_port}', flush=True)
        server.serve_forever()
