import json,argparse
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
cli=argparse.ArgumentParser();cli.add_argument('--url',default='http://127.0.0.1:8765');args=cli.parse_args()
out=Path('docs/component-v2/evidence');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']);page=b.new_page(viewport={'width':1194,'height':834},has_touch=True);errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.goto(args.url);expect(page.locator('#status')).to_contain_text('CAD 확정',timeout=180000)
 values=[]
 for kind,key,value in [('horn','pitchU','1'),('anvil','height','0.3')]:
  page.locator('#page-overview').tap();page.locator(f'[data-component=welded][data-kind={kind}][data-side=positive]').tap();expect(page.locator('#component-dimension option')).to_have_count(7,timeout=180000)
  field=f'processTooling.poles.positive.tools.welded.{kind}.{key}';page.locator('#component-dimension').select_option(field);before=page.locator(f'[data-r4-field="{field}"]').input_value()
  page.locator('#component-edit').tap();expect(page.locator('#component-dimension-editor')).to_be_visible();page.locator('#component-edit-value').fill(value);page.locator('#component-edit-submit').tap();expect(page.locator('#r4-message')).to_contain_text('미리보기 완료',timeout=180000)
  expect(page.locator(f'[data-r4-field="{field}"]')).to_have_value(value);page.screenshot(path=str(out/f'live-touch-{kind}-edited.png'),full_page=True)
  values.append({'field':field,'before':before,'after':value,'datum':page.locator('#component-datum').inner_text()});page.locator('#r4-cancel').tap();expect(page.locator(f'[data-r4-field="{field}"]')).to_have_value(before)
 page.set_viewport_size({'width':600,'height':900});page.screenshot(path=str(out/'live-touch-narrow.png'),full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2');assert not errors,errors
 (out/'live-touch-results.json').write_text(json.dumps({'actions':values,'viewport':[1194,834],'narrow':[600,900],'errors':errors},ensure_ascii=False,indent=2));print('PASS touch editor and layout');b.close()
