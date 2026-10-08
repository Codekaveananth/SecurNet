"""Dashboard end-to-end test (desktop 1440px and mobile 390px). Needs the ML service
on :8000 and the dashboard on :5173. Fails on any console error or failed request.
    python tests/e2e/dashboard_e2e.py
"""
import json, os, sys
os.makedirs('/tmp/shots', exist_ok=True)
from playwright.sync_api import sync_playwright
BASE="http://localhost:5173/"
errors=[]; failed=[]
def run(p, width, tag):
    b=p.chromium.launch()
    pg=b.new_page(viewport={"width":width,"height":900})
    pg.on("console", lambda m: m.type in("error","warning") and errors.append(f"[{tag}] {m.type}: {m.text}"))
    pg.on("pageerror", lambda e: errors.append(f"[{tag}] pageerror: {e}"))
    pg.on("requestfailed", lambda r: failed.append(f"[{tag}] {r.url} {r.failure}"))
    pg.goto(BASE); pg.wait_for_selector("text=Detection online", timeout=8000)
    pg.screenshot(path=f"/tmp/shots/{tag}-overview-empty.png", full_page=True)
    # demo run all
    pg.goto(BASE+"#/demo"); pg.click("text=/Analyse all/"); pg.wait_for_selector("text=/Analyse all 17/", timeout=30000)
    pg.screenshot(path=f"/tmp/shots/{tag}-demo.png", full_page=True)
    # url analyzer deep link
    pg.goto(BASE+"#/url?u=http%3A%2F%2Fsbi-kyc-verify.tk%2Fnetbanking%2Flogin.php&auto=1"); pg.wait_for_selector(".verdict", timeout=10000)
    pg.screenshot(path=f"/tmp/shots/{tag}-url.png", full_page=True)
    pg.goto(BASE+"#/message"); pg.fill("#scan-sms","Dear customer your SBI account will be BLOCKED today. Complete KYC now bit.ly/kyc-upd"); pg.click("text=Analyse message"); pg.wait_for_selector(".verdict", timeout=10000)
    pg.screenshot(path=f"/tmp/shots/{tag}-msg.png", full_page=True)
    for route in ["", "history", "intel", "model", "extension"]:
        pg.goto(BASE+"#/"+route); pg.wait_for_timeout(1200)
        pg.screenshot(path=f"/tmp/shots/{tag}-{route or 'overview'}.png", full_page=True)
    # investigation via history
    pg.goto(BASE+"#/history"); pg.click("table.history tbody tr:first-child a"); pg.wait_for_selector("text=Investigation")
    pg.screenshot(path=f"/tmp/shots/{tag}-investigation.png", full_page=True)
    b.close()
with sync_playwright() as p:
    run(p, 1440, "desk")
    run(p, 390, "mob")
print("ERRORS:", json.dumps(errors, indent=1)); print("FAILED:", json.dumps(failed, indent=1))
sys.exit(1 if errors or failed else 0)
