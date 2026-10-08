# SecureNet browser extension (v1.1)

A real-time security assistant for Chrome and Edge (Manifest V3, plain
JavaScript, no build step).

## What it does

| When | What happens |
|---|---|
| You start navigating to a site | Its address is checked by the SecureNet URL model |
| Verdict is Phishing | A SecureNet warning page replaces the site, with risk score, evidence and advice |
| Verdict is Suspicious | A banner on the page (standard), or the warning page (strict) |
| Any verdict | Toolbar badge: `OK` safe, `?` suspicious, `!` phishing, `N/A` analysis unavailable |
| You open the popup or side panel | Site, verdict, risk score, confidence, strongest SHAP evidence, patterns found, advice, scan again, full analysis, report |

From the warning page you can go back, open the full analysis on the dashboard,
report a false positive (stored by the ML service for retraining), or continue
after a confirmation step.

## Privacy

* Only the address of the page is sent, to the SecureNet server you configure.
  Never page content, form fields, passwords, OTPs, UPI PINs, cookies or keystrokes.
* `user:password@` in an address is replaced by `redacted@` before sending.
  The `@` is kept because it is itself a phishing signal.
* Everything after `#` is dropped. Query values can be hidden in Settings
  (less accurate, because the model reads the query).
* `localhost`, `*.local` and private-network addresses are never sent.
* Local history is **off** by default. When on, it stores addresses without
  query strings or credentials, on this device only.
* The in-page banner lives in a closed shadow root and never reads the page.

## Failure behaviour

A timeout, network error, rate limit or invalid response is shown as
**Analysis unavailable**, with the badge `N/A`. It is never shown as safe.

## Performance

* Checks start on `webNavigation.onBeforeNavigate`, before the page loads.
* Verdicts are cached for 10 minutes in `chrome.storage.session`, so they
  survive the service worker being suspended. Identical requests in flight are
  merged. At most 40 checks per minute are sent.

## Settings

Real-time protection, notifications, sensitivity (relaxed, standard, strict:
this changes when you are interrupted, never the model's verdict), hide query
values, local history, trusted sites, server, optional gateway, optional API key,
dashboard address.

## Install

1. Start the ML service (`uvicorn app.main:app --port 8000` in `ml-service/`).
2. `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
3. Pin SecureNet to the toolbar. Settings open automatically on first install.

## Tested

20 automated end-to-end checks in Chromium 141 against the live ML service,
with phishing sites simulated by request interception (no real site contacted).
See `UPGRADE_NOTES.md` in the project root. The privacy filter has its own unit
test (`lib/privacy.js`).
