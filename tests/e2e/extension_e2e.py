"""Extension end-to-end test. Needs: ML service on :8000, dashboard on :5173,
`pip install playwright && playwright install chromium`. Run from the project root:
    python tests/e2e/extension_e2e.py
Phishing sites are simulated by request interception; no real site is contacted.
"""
import json, os, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright
EXT=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'extension'))
os.makedirs('/tmp/shots', exist_ok=True)
results=[]; errors=[]
def check(name, cond, detail=''):
    results.append(('PASS' if cond else 'FAIL', name, detail)); 
def fb_total():
    return json.load(urllib.request.urlopen('http://localhost:8000/api/v1/feedback/summary'))['total']

with sync_playwright() as p:
    ctx=p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel='chromium', headless=True, viewport={'width':1280,'height':900},
        args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker')
    eid = sw.url.split('/')[2]
    time.sleep(1.5)
    sw.on('console', lambda m: m.type=='error' and errors.append('sw: '+m.text))
    # Fake every non-local site: the page is never fetched from the internet.
    def fake(route):
        u=route.request.url
        if not u.startswith('http') or 'localhost' in u or '127.0.0.1' in u: return route.continue_()
        route.fulfill(status=200, content_type='text/html', body='<html><body><h1>Test page</h1><form><input type=password name=pw></form></body></html>')
    ctx.route('**/*', fake)
    for pg in ctx.pages: pg.close()
    sw.evaluate("chrome.storage.local.set({notifications:false, localHistory:true})")
    page=ctx.new_page()
    page.on('console', lambda m: m.type=='error' and errors.append('page: '+m.text))
    page.on('pageerror', lambda e: errors.append('pageerror: '+str(e)))
    tabid=lambda: sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>!x.url.includes('options')).id)")

    # 1. phishing -> warning page before load
    page.goto('http://198.51.100.23:8080/upi/verify.php'); page.wait_for_url(f'chrome-extension://{eid}/warning/warning.html*', timeout=8000)
    page.wait_for_selector('text=very likely a phishing page')
    check('Phishing URL redirected to warning page', True, page.url)
    page.screenshot(path='/tmp/shots/ext-warning.png', full_page=True)
    tid=int(page.url.split('tab=')[1])
    badge=sw.evaluate(f"chrome.action.getBadgeText({{tabId:{tid}}})")
    check('Badge shows ! for phishing', badge=='!', badge)
    full=page.get_attribute('#full','href')
    check('"View full analysis" links to dashboard investigation', full.startswith('http://localhost:5173/#/url?u=') and 'auto=1' in full, full)

    # 2. report false positive from the warning page
    before=fb_total(); page.click('#report'); page.wait_for_selector('text=Your report was saved', timeout=6000)
    check('False-positive report stored by backend', fb_total()==before+1, f'{before}->{fb_total()}')

    # 3. continue anyway (with confirmation) -> page loads, not re-blocked
    page.click('#proceed'); page.click('#go'); page.wait_for_url('http://198.51.100.23:8080/upi/verify.php', timeout=8000)
    page.wait_for_timeout(1200)
    check('Continue anyway loads the site and is not re-blocked', page.url.startswith('http://198.51.100.23'), page.url)

    # 4. safe site -> OK badge, no warning
    page.goto('https://www.hdfcbank.com/personal/borrow/popular-loans'); page.wait_for_timeout(1500)
    tid=tabid(); st=sw.evaluate(f"chrome.storage.session.get('tab:{tid}')")[f'tab:{tid}']
    check('Safe site: verdict LEGITIMATE, page not interrupted', st['status']=='ok' and st['result']['verdict']=='LEGITIMATE' and 'hdfcbank' in page.url, st['result']['verdict'])
    check('Badge shows OK for safe', sw.evaluate(f"chrome.action.getBadgeText({{tabId:{tid}}})")=='OK')

    # 5. cache: second visit uses cache
    page.goto('https://www.irctc.co.in/nget/train-search'); page.wait_for_timeout(800)
    page.goto('https://www.hdfcbank.com/personal/borrow/popular-loans'); page.wait_for_timeout(800)
    st=sw.evaluate(f"chrome.storage.session.get('tab:{tid}')")[f'tab:{tid}']
    check('Repeat visit served from cache', st.get('cached') is True)

    # 6. suspicious at standard sensitivity -> banner (closed shadow root host present)
    page.goto('http://sbi-kyc-verify.tk/netbanking/login.php'); page.wait_for_selector('#__securenet_banner_host__', state='attached', timeout=8000)
    st=sw.evaluate(f"chrome.storage.session.get('tab:{tid}')")[f'tab:{tid}']
    check('Suspicious site shows in-page banner (standard)', st['result']['verdict']=='SUSPICIOUS', str(round(st['result']['score'],3)))
    page.screenshot(path='/tmp/shots/ext-banner.png')
    check('Content script never read the password field', page.input_value('input[name=pw]')=='' )

    # 7. strict sensitivity -> suspicious gets warning page
    sw.evaluate("chrome.storage.local.set({sensitivity:'strict'})")
    page.goto('http://sbi-kyc-verify.tk/netbanking/other.php'); page.wait_for_url('**/warning/warning.html*', timeout=8000)
    check('Strict sensitivity blocks suspicious sites', 'warning.html' in page.url)
    sw.evaluate("chrome.storage.local.set({sensitivity:'standard'})")

    # 8. privacy: credentials/fragments never sent
    page.goto('https://alice:hunter2@paypal.com.secure-login.xyz/verify#otp=123456'); page.wait_for_timeout(1500)
    keys=json.dumps(list(sw.evaluate("chrome.storage.session.get('cache')")['cache'].keys()))
    check('Password, username and fragment stripped before sending', 'hunter2' not in keys and 'alice' not in keys and '123456' not in keys and 'redacted@paypal' in keys)

    # 9. private address never sent
    page.goto('http://192.168.1.1/login'); page.wait_for_timeout(700)
    tid=tabid(); st=sw.evaluate(f"chrome.storage.session.get('tab:{tid}')")[f'tab:{tid}']
    check('Private-network address skipped', st['status']=='skipped' and st['reason']=='private')

    # 10. popup for a scanned tab
    page.goto('http://paytm-cashback-reward.top/claim'); page.wait_for_timeout(1500)
    tid=tabid()
    pop=ctx.new_page(); pop.goto(f'chrome-extension://{eid}/popup/popup.html?tab={tid}')
    pop.wait_for_selector('.verdict', timeout=6000); pop.set_viewport_size({'width':360,'height':700})
    txt=pop.inner_text('body')
    check('Popup shows site, verdict, risk, evidence, recommendation', 'paytm-cashback-reward.top' in txt and 'risk score' in txt and 'Strongest evidence' in txt, txt[:80].replace('\n',' | '))
    pop.screenshot(path='/tmp/shots/ext-popup.png', full_page=True); pop.close()

    # 11. backend failure -> unavailable, never safe
    sw.evaluate("chrome.storage.local.set({serverUrl:'http://localhost:8099'})"); page.wait_for_timeout(300)
    page.goto('https://www.github.com/features'); page.wait_for_timeout(5000)
    tid=tabid(); st=sw.evaluate(f"chrome.storage.session.get('tab:{tid}')")[f'tab:{tid}']
    badge=sw.evaluate(f"chrome.action.getBadgeText({{tabId:{tid}}})")
    check('Backend down: status unavailable, badge N/A (not safe)', st['status']=='unavailable' and badge=='N/A', st.get('reason'))
    pop=ctx.new_page(); pop.goto(f'chrome-extension://{eid}/popup/popup.html?tab={tid}'); pop.wait_for_selector('text=Analysis unavailable')
    check('Popup says "not a safe verdict" when backend is down', 'not a safe verdict' in pop.inner_text('body'))
    pop.screenshot(path='/tmp/shots/ext-popup-down.png', full_page=True); pop.close()
    sw.evaluate("chrome.storage.local.set({serverUrl:'http://localhost:8000'})")

    # 12. dashboard bridge
    dash=ctx.new_page(); dash.goto('http://localhost:5173/#/extension')
    dash.wait_for_selector('text=Extension connected', timeout=8000)
    check('Dashboard detects extension via bridge', 'Yes, version 1.1.0' in dash.inner_text('main'))
    check('Dashboard shows extension local history', 'Recently checked by the extension' in dash.inner_text('main'))
    dash.screenshot(path='/tmp/shots/ext-dashboard.png', full_page=True)

    # 13. options page renders, validates server URL
    op=ctx.new_page(); op.goto(f'chrome-extension://{eid}/options/options.html'); op.fill('#serverUrl','http://evil.example:8000'); op.click('#saveConn')
    check('Options rejects plain-http remote server', 'https, or http on localhost' in op.inner_text('#connStatus'))
    op.fill('#serverUrl','http://localhost:8000'); op.click('#test'); op.wait_for_selector('#connStatus.ok', timeout=5000)
    check('Options connection test succeeds', 'Both models loaded' in op.inner_text('#connStatus'))
    op.screenshot(path='/tmp/shots/ext-options.png', full_page=True)
    ctx.close()

for r in results: print(*r, sep=' | ')
print('PASSED', sum(r[0]=='PASS' for r in results), 'of', len(results))
print('CONSOLE ERRORS:', errors)
