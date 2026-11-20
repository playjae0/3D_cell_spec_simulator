"""Real server/CAD checks using a configured URL, without a browser or mock API."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import copy
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[1]


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--bind-host',default='127.0.0.1')
    p.add_argument('--output',type=Path)
    args=p.parse_args()
    host=args.bind_host
    with socket.socket() as probe:
        probe.bind((host,0));port=probe.getsockname()[1]
    url=f'http://{host}:{port}'
    env={**os.environ,'POUCH_HOST':host,'POUCH_PORT':str(port),'POUCH_ALLOWED_ORIGINS':url,'POUCH_AUTO_PORT':'0'}
    env.pop('POUCH_LAUNCH_READY',None)
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    result={}

    def request(path,body=None,headers=None,method=None):
        data=json.dumps(body).encode() if body is not None else None
        req=urllib.request.Request(url+path,data,{'Content-Type':'application/json',**(headers or {})},method=method)
        try:
            with opener.open(req,timeout=120) as r:return r.status,r.read(),r.headers
        except urllib.error.HTTPError as r:return r.code,r.read(),r.headers

    with tempfile.TemporaryFile(mode='w+t') as log:
        child=subprocess.Popen([sys.executable,'-u','cad/server.py'],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
        try:
            end=time.monotonic()+90
            while time.monotonic()<end:
                if child.poll() is not None:
                    log.seek(0);raise RuntimeError(log.read())
                try:
                    status,body,_=request('/api/health')
                    if status==200:break
                except OSError:pass
                time.sleep(.2)
            else:raise RuntimeError('CAD server not ready')
            health=json.loads(body);assert health['mode']=='live-cad' and health['schemaVersion']==4
            assert request('/')[0]==200
            assert request('/',method='HEAD')[0]==200
            assert request('/api/health',headers={'Host':'wrong.example'})[0]==403
            assert request('/api/rebuild',{}, {'Origin':'http://wrong.example'})[0]==403
            project=json.loads((ROOT/'examples/demo.json').read_text())
            project['stage']='gathered'
            def rebuild(model,n):
                status,body,headers=request('/api/rebuild',{'project':model,'revision':n,'requestToken':str(n)},{'Origin':url})
                assert status==200,(status,body[:500])
                r=json.loads(body)
                assert r['mode']=='live-cad' and r['stage']==model['stage'] and r['revision']==n and r['requestToken']==str(n)
                assert headers.get('Access-Control-Allow-Origin') is None
                return r
            before=rebuild(project,11)
            changed=copy.deepcopy(project);changed['product']['positive']['tab']['foilWidth']=34
            after=rebuild(changed,12)
            assert before['geometryId']!=after['geometryId']
            old=next(x for x in before['parts'] if x['id']=='positive.tab')
            new=next(x for x in after['parts'] if x['id']=='positive.tab')
            assert old['volume']!=new['volume']
            assert [x for x in before['parts'] if x['id'].startswith('negative.')]==[x for x in after['parts'] if x['id'].startswith('negative.')]
            with ThreadPoolExecutor(max_workers=2) as pool:
                a=pool.submit(rebuild,project,21);b=pool.submit(rebuild,changed,22)
                assert a.result()['geometryId']==before['geometryId'] and b.result()['geometryId']==after['geometryId']
            invalid=copy.deepcopy(project);invalid['product']['stack']['width']=5
            assert request('/api/rebuild',{'project':invalid,'revision':30},{'Origin':url})[0]==422
            result={'passed':True,'bindHost':host,'health':health,'allowedOrigin':url,'hostRejected':True,'originRejected':True,'staticPage':True,'twoClientRequestIsolation':True,'oppositePoleUnchanged':True,'invalidInput422':True,'foilWidthBefore':project['product']['positive']['tab']['foilWidth'],'foilWidthAfter':34,'tabVolumeBefore':old['volume'],'tabVolumeAfter':new['volume']}
        finally:
            child.terminate()
            try:child.wait(timeout=10)
            except subprocess.TimeoutExpired:child.kill();child.wait()
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
