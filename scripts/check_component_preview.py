"""Verify recorded component UI and every exposed product process from dist-preview only."""
import argparse,json,subprocess,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from check_preview_browser import static_host,restored,instrument,no_errors
cli=argparse.ArgumentParser();cli.add_argument('--folder',type=Path,required=True);args=cli.parse_args()
folder=args.folder.resolve();manifest=json.loads((folder/'preview/manifest.json').read_text());assert not manifest['sourceDirty']
out=Path('docs/component-v2/evidence');out.mkdir(parents=True,exist_ok=True)
results=[]
with static_host(folder) as (url,requests):
 subprocess.run(['node','scripts/check_preview_lookup.mjs',url],check=True)
 subprocess.run(['python','scripts/check_component_browser.py','--url',url,'--mode','preview','--touch'],check=True)
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  page=browser.new_page(viewport={'width':1440,'height':1000});faults,console=instrument(page)
  page.goto(url);expect(page.locator('#status')).to_contain_text('기록 확정',timeout=120000)
  first=[path for method,path in requests if path.endswith('.json') and '/preview/' in path and not path.endswith('manifest.json')]
  # The prior separate checks deliberately opened other examples. Observe this page independently below.
  for design in manifest['designs']:
   page.locator('#choose-model').click();page.locator(f'[data-model="{design["name"]}"]').click()
   page.locator('#page-product').click();page.locator('#page-overview').click()
   dataset=json.loads((folder/'preview'/design['file']).read_text())
   stages=page.locator('.process-card').evaluate_all('(els)=>els.map(e=>e.dataset.stage)')
   expect(page.locator('.process-card[data-state=ready]')).to_have_count(len(stages),timeout=120000)
   for stage in stages:
    page.locator(f'.process-card[data-stage="{stage}"]').click();expect(page.locator('#stage')).to_have_value(stage)
    for selector in page.locator('[data-expand][aria-expanded=false]').evaluate_all('(els)=>els.map(e=>e.dataset.expand)'):page.locator(f'[data-expand="{selector}"]').click()
    expected=restored(dataset,stage);actual=set(page.locator('[data-eye]').evaluate_all('(els)=>els.map(e=>e.dataset.eye)'))
    assert actual=={p['id'] for p in expected['parts']},(design['name'],stage,actual^{p['id'] for p in expected['parts']})
    results.append({'model':design['name'],'stage':stage,'parts':len(actual),'status':200})
    page.locator('#page-overview').click()
   print('matrix',design['name'],len(stages),flush=True)
  no_errors(faults,console)
  assert not [x for x in requests if x[0]=='POST'],requests
  browser.close()
(out/'preview-matrix.json').write_text(json.dumps({'sourceCommit':manifest['sourceCommit'],'combinations':len(results),'results':results,'pageErrors':faults},ensure_ascii=False,indent=2))
print('PASS static component and process matrix',len(results),flush=True)
