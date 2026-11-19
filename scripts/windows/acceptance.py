"""Same UI acceptance on dev server or extracted Windows EXE. No fake CAD responses."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect

def main():
    p=argparse.ArgumentParser();p.add_argument('--bundle',type=Path);p.add_argument('--url');p.add_argument('--intake',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--browser');p.add_argument('--offline',action='store_true');a=p.parse_args()
    a.out.mkdir(parents=True,exist_ok=True);ready=a.out/'ready.json';process=None;log=None
    def start():
        nonlocal process,log
        ready.unlink(missing_ok=True)
        log=(a.out/'launcher.log').open('a',encoding='utf-8')
        env={k:v for k,v in os.environ.items() if not k.startswith(('PYTHON','CONDA','VIRTUAL_ENV'))}
        env['PATH']=str(Path(os.environ.get('SystemRoot','C:/Windows'))/'System32')
        process=subprocess.Popen([str(a.bundle/'CellStudio.exe'),'--ready-file',str(ready),'--port','18765'],cwd=a.bundle,env=env,stdout=log,stderr=subprocess.STDOUT)
        end=time.monotonic()+150
        while time.monotonic()<end:
            if process.poll() is not None:raise RuntimeError('EXE exited: '+(a.out/'launcher.log').read_text())
            if ready.exists():return json.loads(ready.read_text(encoding='utf-8'))
            time.sleep(.3)
        raise RuntimeError('EXE readiness timeout')
    def stop():
        nonlocal process,log
        if process and process.poll() is None:
            process.terminate();process.wait(timeout=30)
        process=None
        if log:log.close();log=None
    result={'environment':'extracted Windows ZIP' if a.bundle else 'Linux development build','offlineFirewall':a.offline,'errors':[],'externalRequests':[]}
    try:
        if a.bundle:
            v=json.loads((a.bundle/'VERSION.json').read_text(encoding='utf-8'));result['sourceCommit']=v['sourceCommit'];state=start();url=state['url'];result['launcher']=state
            kitVersion=json.loads((a.intake.parent/'VERSION.json').read_text(encoding='utf-8'));assert kitVersion['sourceCommit']==v['sourceCommit']
            conflict=subprocess.run([str(a.bundle/'CellStudio.exe'),'--no-browser','--port','18765'],cwd=a.bundle,capture_output=True,timeout=30)
            assert conflict.returncode!=0 and '사용 중' in conflict.stderr.decode('utf-8')
            result['portConflictRejected']=True
        else:url=a.url
        with sync_playwright() as pw:
            launch={'headless':True,'args':['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']}
            if a.browser:launch['executable_path']=a.browser
            elif os.name=='nt':launch['channel']='msedge'
            else:launch['executable_path']='/usr/bin/chromium'
            browser=pw.chromium.launch(**launch)
            ctx=browser.new_context(viewport={'width':1440,'height':1080},accept_downloads=True)
            page=ctx.new_page();page.set_default_timeout(180000)
            page.on('pageerror',lambda e:result['errors'].append(str(e)))
            page.on('request',lambda r:result['externalRequests'].append(r.url) if urlparse(r.url).scheme in ['http','https'] and urlparse(r.url).hostname not in ['127.0.0.1','localhost'] else None)
            responses=[]
            def response(r):
                if r.url.endswith('/api/rebuild'):
                    try:responses.append({'status':r.status,'request':r.request.post_data_json,'data':r.json()})
                    except Exception:pass
            page.on('response',response)
            def shot(n):page.screenshot(path=str(a.out/(n+'.png')),full_page=True)
            def tool():
                page.locator('#page-overview').click()
                page.locator('[data-component=welded][data-kind=horn][data-side=positive]').click()
                expect(page.locator('#component-dimension')).to_contain_text('mm',timeout=240000)
                field=next(v for v in page.locator('#component-dimension option').evaluate_all('(els)=>els.map(e=>e.value)') if v.endswith('.bodyDepth'))
                page.locator('#component-dimension').select_option(field);return field
            page.goto(url);expect(page.locator('#component-overview')).to_be_visible()
            page.locator('#models').click();page.locator('#intake-file').set_input_files(str(a.intake))
            expect(page.locator('#intake-preview')).to_be_enabled()
            expect(page.locator('#intake-message')).to_contain_text('trial-1')
            page.locator('#intake-preview').click();expect(page.locator('#intake-apply')).to_be_enabled(timeout=240000)
            shot('01-intake-cad');page.locator('#intake-apply').click()
            field=tool();shot('02-before-3mm')
            before=next(r['data'] for r in reversed(responses) if r['status']==200 and any(x['id']=='tool.positive.welded.horn.body' for x in r['data']['parts']))
            page.locator('#component-edit').click();page.locator('#component-edit-value').fill('4');page.locator('#component-edit-submit').click()
            expect(page.locator('#r4-message')).to_contain_text('미리보기 완료',timeout=240000)
            page.locator('#r4-apply').click();expect(page.locator('#status')).to_contain_text('CAD 확정',timeout=240000)
            after=next(r['data'] for r in reversed(responses) if r['status']==200 and r['request']['project']['product']['processTooling']['poles']['positive']['tools']['welded']['horn']['bodyDepth']==4)
            def body(m):return next(x for x in m['parts'] if x['id']=='tool.positive.welded.horn.body')
            assert body(before)['meta']['dimensions']['bodyDepth']['value']==3
            assert body(after)['meta']['dimensions']['bodyDepth']['value']==4
            assert body(before)!=body(after);assert before['geometryId']!=after['geometryId']
            assert [x for x in before['parts'] if x['id'].startswith(('negative.','tool.negative.'))]==[x for x in after['parts'] if x['id'].startswith(('negative.','tool.negative.'))]
            page.locator('#component-section-center').click();shot('03-after-4mm-section')
            with page.expect_download() as d:page.locator('#save').click()
            saved=a.out/'saved-cell.json';d.value.save_as(str(saved))
            cell=json.loads(saved.read_text(encoding='utf-8'));assert cell['modelIdentity']['modelId']=='trial-virtual-cell';assert cell['product']['processTooling']['poles']['positive']['tools']['welded']['horn']['bodyDepth']==4
            assert next(p for p in cell['intake']['parameters'] if p['parameterId']==field)['value']==4
            storage=page.evaluate('localStorage.getItem("pouch-model-library-v1")');assert storage
            result['savedModelIdentity']=cell['modelIdentity'];result['savedIntakeVersion']=cell['intake']['formatVersion']
            # Reopen with a fresh browser profile: cell JSON, not browser cache, is the source.
            ctx.close()
            if a.bundle:
                stop();time.sleep(1);result['relaunched']=start()
            ctx=browser.new_context(viewport={'width':1440,'height':1080},accept_downloads=True)
            page=ctx.new_page();page.set_default_timeout(180000);page.on('response',response);page.on('pageerror',lambda e:result['errors'].append(str(e)))
            page.goto(url);expect(page.locator('#component-overview')).to_be_visible()
            assert page.evaluate('localStorage.getItem("pouch-model-library-v1")') is None
            page.locator('#file').set_input_files(str(saved));expect(page.locator('#status')).to_contain_text('CAD 확정',timeout=240000)
            tool();expect(page.locator('#component-dimension option:checked')).to_contain_text('4 mm')
            reopened=next(r['data'] for r in reversed(responses) if r['status']==200 and r['request']['project']['product']['id']=='trial-virtual-cell' and r['request']['project']['product']['processTooling']['poles']['positive']['tools']['welded']['horn']['bodyDepth']==4)
            assert body(reopened)==body(after);shot('04-reopened')
            result['CAD']={'before':body(before)['meta'],'after':body(after)['meta'],'beforeGeometryId':before['geometryId'],'afterGeometryId':after['geometryId'],'reopenedGeometryId':reopened['geometryId'],'oppositePoleUnchanged':True,'reopenedBodyIdentical':True}
            result['libraryScope']='fresh browser profile did not contain old library; saved cell JSON restored current model/annotations/intake'
            assert not result['errors'],result['errors'];assert not result['externalRequests'],result['externalRequests']
            result['passed']=True
            browser.close()
    finally:
        stop();(a.out/'acceptance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
