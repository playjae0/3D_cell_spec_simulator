"""Component-only live edits and static-preview selection/section acceptance."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:19881');p.add_argument('--preview',action='store_true');a=p.parse_args()
out=Path('docs/component-v3/evidence');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1440,'height':1050},accept_downloads=True);errors=[];responses=[];posts=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:posts.append(r.url) if r.method=='POST' else None)
 def response(r):
  if r.url.endswith('/api/rebuild'):
   try:responses.append({'status':r.status,'data':r.json()})
   except Exception:pass
 page.on('response',response)
 label='preview' if a.preview else 'live'
 def shot(n):
  print('capture',n,flush=True);page.screenshot(path=str(out/f'{label}-{n}.png'),full_page=True)
 def card(part,kind=None):
  page.locator('#page-overview').click();page.locator(f'[data-component="{part}"][data-side="'+('common' if part=='pouch' else 'positive')+'"]'+(f'[data-kind={kind}]' if kind else '')).click()
 def dim(path):
  expect(page.locator('#component-dimension')).to_contain_text('mm',timeout=180000)
  value=next(v for v in page.locator('#component-dimension option').evaluate_all('(els)=>els.map(e=>e.value)') if v.endswith(path));page.locator('#component-dimension').select_option(value);return value
 def edit(key,value):
  field=dim(key);page.locator('#component-edit').click();expect(page.locator('#component-dimension-editor')).to_be_visible();page.locator('#component-edit-value').fill(str(value));page.locator('#component-edit-submit').click();return field
 page.goto(a.url)
 expect(page.locator('#component-overview')).to_be_visible()
 expect(page.locator('[data-component=gathering]')).to_have_count(0)
 for k in ['tab','tab_preweld','tab_trimmed']:expect(page.locator(f'[data-component={k}]')).to_have_count(2)
 expect(page.locator('[data-component=welded][data-kind=horn][data-side=positive] img')).to_have_attribute('src',__import__('re').compile('data:'),timeout=240000)
 shot('overview')
 for key,labeltext in [('tab','집속 전'),('tab_preweld','가용접 후'),('tab_trimmed','커팅 후')]:
  card(key);expect(page.locator('#standalone-title')).to_contain_text(labeltext,timeout=180000);expect(page.locator('#component-dimension')).to_contain_text('mm',timeout=180000);shot(key)
  if key=='tab_trimmed':
   field=dim('foilCut.removedLength');expect(page.locator('#component-scene-status')).to_contain_text('절단량');
   if not a.preview:
    edit('foilCut.removedLength',1.2);expect(page.locator('#status')).to_contain_text('CAD 확정',timeout=180000);expect(page.locator('[data-field$="foilCut.removedLength"]')).to_have_value('1.2');shot('foil-cut-edited')
 card('welded','horn');expect(page.locator('#component-dimension option')).to_have_count(8,timeout=180000);dim('bodyDepth');shot('horn-block')
 page.locator('#component-section-center').click();expect(page.locator('#component-section-drawing svg')).to_be_visible();shot('horn-center-section')
 page.locator('#component-section-position').fill('-0.5');expect(page.locator('#component-section-drawing')).to_contain_text('-0.500');shot('horn-section-moved')
 if not a.preview:
  field=edit('bodyDepth',4);expect(page.locator('#r4-message')).to_contain_text('미리보기 완료',timeout=180000);expect(page.locator(f'[data-r4-field="{field}"]')).to_have_value('4');shot('horn-block-edited');page.locator('#r4-apply').click();expect(page.locator('#status')).to_contain_text('CAD 확정',timeout=180000)
 card('welded','anvil');expect(page.locator('#component-dimension option')).to_have_count(8,timeout=180000);page.locator('#component-section-center').click();expect(page.locator('#component-section-drawing svg')).to_be_visible();shot('anvil-center-section')
 card('pouch');expect(page.locator('#component-dimension option')).to_have_count(14,timeout=180000)
 field=dim('sheets.lower.depth');page.locator(f'[data-r4-field="{field}"]').locator('xpath=..').click();expect(page.locator('#component-scene-status')).to_contain_text('깊이');page.locator('#component-section-center').click();expect(page.locator('#component-section-drawing svg')).to_be_visible();shot('pouch-depth-section')
 if not a.preview:
  old=float(page.locator(f'[data-r4-field="{field}"]').input_value());edit('sheets.lower.depth',old+.2);expect(page.locator('#r4-message')).to_contain_text('미리보기 완료',timeout=180000);expect(page.locator('#component-section-axis')).to_have_value('x');shot('pouch-depth-edited');page.locator('#r4-apply').click();expect(page.locator('#status')).to_contain_text('CAD 확정',timeout=180000);expect(page.locator('#component-section-axis')).to_have_value('x');expect(page.locator('#component-section-drawing svg')).to_be_visible()
  field=dim('sheets.lower.floorR');old=float(page.locator(f'[data-r4-field="{field}"]').input_value());edit('sheets.lower.floorR',old+.1);expect(page.locator('#r4-message')).to_contain_text('미리보기 완료',timeout=180000);shot('pouch-radius-edited');page.locator('#r4-cancel').click()
  with page.expect_download() as dl:page.locator('#save').click()
  dl.value.save_as(str(out/'saved-project.json'))
  saved=json.loads((out/'saved-project.json').read_text());assert saved['product']['processTooling']['poles']['positive']['tools']['welded']['horn']['bodyDepth']==4;assert saved['product']['processTooling']['poles']['positive']['foilCut']['removedLength']==1.2
  page.locator('#file').set_input_files(str(out/'saved-project.json'));expect(page.locator('#status')).to_contain_text('CAD 확정',timeout=180000)
 else:
  expect(page.locator('#component-edit')).to_be_disabled();expect(page.locator('#component-mode-help')).to_contain_text('읽기 전용');assert not posts
 page.set_viewport_size({'width':600,'height':900});shot('narrow');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
 assert not errors,errors
 (out/f'{label}-results.json').write_text(json.dumps({'mode':label,'errors':errors,'posts':len(posts),'successfulStages':sorted(set(r['data']['stage'] for r in responses if r['status']==200))},ensure_ascii=False,indent=2))
 print('PASS',label,flush=True);b.close()
