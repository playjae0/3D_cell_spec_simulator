"""Real UI input/response evidence; no injected app data or network interception."""
import os,json,argparse
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
cli=argparse.ArgumentParser();cli.add_argument('--url',default='http://127.0.0.1:19878');cli.add_argument('--mode',default='live');cli.add_argument('--touch',action='store_true');args=cli.parse_args()
out=Path('docs/component-v2/evidence');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1194 if args.touch else 1440,'height':834 if args.touch else 1100},has_touch=args.touch,accept_downloads=True)
 errors=[];responses=[];posts=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:posts.append(r.url) if r.method=='POST' else None)
 def response(r):
  if r.url.endswith('/api/rebuild'):
   try:responses.append({'status':r.status,'data':r.json()})
   except Exception:pass
 page.on('response',response)
 label=args.mode+('-touch' if args.touch else '')
 def shot(name):
  print('capture',name,flush=True);page.screenshot(path=str(out/f'{label}-{name}.png'),full_page=True)
 def click(q):page.locator(q).tap() if args.touch else page.locator(q).click()
 def open_card(part,kind=''):
  click('#page-overview');click(f'[data-component="{part}"][data-side="positive"]'+(f'[data-kind="{kind}"]' if kind else ''))
  if kind:expect(page.locator('#component-dimension option')).to_have_count(7,timeout=180000)
 def select_dim(key):
  opts=page.locator('#component-dimension option');value=next(v for v in opts.evaluate_all('(els)=>els.map(e=>e.value)') if v.endswith('.'+key));page.locator('#component-dimension').select_option(value);return value
 def edit3d(key,value):
  field=select_dim(key)
  if args.touch:click('#component-edit')
  else:
   text=page.locator('#standalone-viewport svg text').filter(has_text={'pitchU':'U 피치','height':'치높이'}[key]).last
   box=text.bounding_box();assert box
   page.mouse.dblclick(box['x']+box['width']/2,box['y']+box['height']/2)
  expect(page.locator('#component-dimension-editor')).to_be_visible()
  page.locator('#component-edit-value').fill(str(value));click('#component-edit-submit')
  expect(page.locator('#r4-message')).to_contain_text('미리보기 완료',timeout=180000)
  expect(page.locator(f'[data-r4-field="{field}"]')).to_have_value(str(value))
  return next(r['data'] for r in reversed(responses) if r['status']==200 and r['data']['stage']=='welded')
 def tooth(m,k='horn',s='positive'):return next(p for p in m['parts'] if p['id']==f'tool.{s}.welded.{k}.teeth')
 page.goto(args.url);expect(page.locator('#component-overview')).to_be_visible()
 page.wait_for_function("document.querySelector('[data-component=welded][data-kind=horn] img')?.src",timeout=240000)
 shot('cards');open_card('welded','horn');expect(page.locator('#reference-status')).to_contain_text('phase1-1',timeout=180000)
 shot('horn-before');events=[];original_stage=page.locator('#stage').input_value()
 if args.mode=='live':
  base=next(r['data'] for r in reversed(responses) if r['status']==200 and r['data']['stage']=='welded')
  changed=edit3d('pitchU',1)
  for k,s in [('anvil','positive'),('horn','negative'),('anvil','negative')]:assert tooth(base,k,s)==tooth(changed,k,s)
  assert tooth(base)['meta']['datum']==tooth(changed)['meta']['datum']
  events.append({'action':'3D 혼 U 피치 .8 → 1','before':tooth(base)['meta'],'after':tooth(changed)['meta']})
  shot('horn-pitch-after');click('#r4-cancel');expect(page.locator('#component-dimension')).to_contain_text('0.8 mm')
  edit3d('height',.4);shot('horn-height-iso');click('[data-component-view=side]');shot('horn-height-side');click('#r4-cancel')
  open_card('welded','anvil');before=base;click('[data-component-view=side]');select_dim('height');shot('anvil-height-before')
  changed=edit3d('height',.3);assert tooth(before)==tooth(changed)
  a=tooth(before,'anvil')['meta'];c=tooth(changed,'anvil')['meta'];assert a['datum']['tipZ']==c['datum']['tipZ'];assert abs(c['datum']['rootZ']-a['datum']['rootZ']+.15)<1e-8
  events.append({'action':'3D 엔빌 치높이 .15 → .3','before':a,'after':c})
  shot('anvil-height-after');click('#r4-apply');expect(page.locator('#status')).to_contain_text('CAD 확정',timeout=180000)
  expect(page.locator('[data-r4-field$=".welded.anvil.height"]')).to_have_value('0.3',timeout=180000)
  with page.expect_download() as dl:click('#save')
  path=out/'live-saved-project.json';dl.value.save_as(str(path));saved=json.loads(path.read_text());assert saved['product']['processTooling']['poles']['positive']['tools']['welded']['anvil']['height']==.3
  page.locator('#file').set_input_files(str(path));expect(page.locator('#status')).to_contain_text('CAD 확정',timeout=180000)
  expect(page.locator('[data-r4-field$=".welded.anvil.height"]')).to_have_value('0.3',timeout=180000)
  select_dim('height');click('#component-edit');page.locator('#component-edit-value').fill('-1');click('#component-edit-submit');expect(page.locator('#r4-message')).to_contain_text('양수',timeout=180000)
  click('#r4-cancel');expect(page.locator('[data-r4-field$=".welded.anvil.height"]')).to_have_value('0.3')
 else:
  select_dim('pitchU');expect(page.locator('#component-edit')).to_be_disabled()
  assert page.locator('[data-r4-field]').evaluate_all('(els)=>els.every(e=>e.disabled)')
  for q in ['#save','#step']:expect(page.locator(q)).to_be_disabled()
 if args.mode=='live':
  # Same combined component, independent source IDs. Test legacy paired movement in product design below.
  open_card('lead');expect(page.locator('[data-field="positive.lead.width"]')).to_be_visible(timeout=180000)
  width=page.locator('[data-field="positive.lead.width"]');old=float(width.input_value())
  page.locator('#auto-rebuild').uncheck();width.fill(str(old+1));click('#apply');expect(page.locator('#status')).to_contain_text('CAD 확정',timeout=180000)
  assert abs(float(width.input_value())-old-1)<1e-8
  click('#page-product');expect(page.locator('.process-card[data-state=ready]')).to_have_count(13,timeout=360000)
  click('.process-card[data-stage=assembly]');expect(page.locator('#stage')).to_have_value('assembly',timeout=180000)
  page.locator('#editor').select_option('positive.lead');lead_start=page.locator('[data-field="positive.lead.start"]');lead_start.locator('xpath=ancestor::details').evaluate('(e)=>e.open=true')
  start=float(lead_start.input_value());lead_start.fill(str(start+.2));click('#apply');expect(page.locator('#status')).to_contain_text('CAD 확정',timeout=180000)
  with page.expect_download() as dl:click('#save')
  path=out/f'{label}-lead-move.json';dl.value.save_as(str(path));moved=json.loads(path.read_text())
  a=saved['product']['positive'];c=moved['product']['positive'];assert abs((c['leadFilm']['start']-c['lead']['start'])-(a['leadFilm']['start']-a['lead']['start']))<1e-9
  events.append({'action':'lead width +1, combined assembly start +.2, save','lead':c['lead'],'leadFilm':c['leadFilm']})
  click('#page-parts');open_card('welded','anvil');original_stage=page.locator('#stage').input_value()
 click('#application-toggle');expect(page.locator('#reference-title')).to_contain_text('S3',timeout=180000);shot('application');assert page.locator('#stage').input_value()==original_stage
 open_card('seal');expect(page.locator('.seal-cross-sections')).to_be_visible(timeout=180000);expect(page.locator('[data-section-id=central] summary')).to_contain_text('폭 3.000');click('[data-section-id=outside-left] summary');expect(page.locator('[data-section-id=outside-left] summary')).to_contain_text('폭 5.000');shot('seal-section')
 click('#page-product');expect(page.locator('#process-overview')).to_be_visible();expect(page.locator('.process-card[data-state=ready]')).to_have_count(13,timeout=360000)
 click('.process-card[data-stage=preweld]');expect(page.locator('#stage')).to_have_value('preweld',timeout=180000)
 # group visibility restores all pole parts without camera jumps
 click('[data-group-eye=positive]') if page.locator('[data-group-eye=positive]').count() else None
 click('#page-overview');expect(page.locator('#process-overview')).to_be_visible();click('#page-parts');click('#page-overview');shot('final-overview')
 if args.touch:
  page.set_viewport_size({'width':600,'height':900});open_card('welded','horn');shot('narrow')
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2')
 assert not errors,errors
 if args.mode!='live':assert not posts,posts
 (out/f'{label}-results.json').write_text(json.dumps({'mode':args.mode,'touch':args.touch,'errors':errors,'actions':events,'postCount':len(posts)},ensure_ascii=False,indent=2))
 print('PASS',label,flush=True);b.close()
