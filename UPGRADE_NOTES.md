# SecureNet 1.1: upgrade notes

This upgrade adds a SOC-style dashboard, a real-time browser extension and API
hardening on top of the existing system. The trained models, their artifacts,
the existing routes and every existing response field are unchanged.

Each item is labelled:

* **VERIFIED**: executed and tested in the build environment.
* **STATIC**: written and checked by reading or syntax check only.
* **UNVERIFIED**: could not be run here; check it on your machine.

---

## End-to-end flow

```
Browser ─► Extension ─► SecureNet API ─► ML model ─► SHAP ─► risk score
   ▲                                                            │
   └── warning page / banner / badge ◄──────────────────────────┘
                     │
                     ├─► Dashboard (full investigation) ─► Feedback ─► retraining file
                     └─► Report false positive ───────────► Feedback
```

Every arrow above was exercised by the automated tests below. **VERIFIED**

---

## ML service (`ml-service/`)

All changes are additive: older clients keep working.

| Change | Status |
|---|---|
| URL responses add `logit`, `other_contribution`, full `contributions` for all 35 model features, and the exact `features` vector. Base value + all contributions = model log-odds (tested to 1e-3). | VERIFIED |
| URL `anatomy`: scheme, host, subdomains, registered domain, TLD, port, path, query keys. Handles IP hosts and multi-part suffixes such as `.co.in`. Passwords in `user:pass@` are never echoed. | VERIFIED |
| URL `indicators`: the model's own features restated as findings (source `model_feature`, with their SHAP value) plus one labelled heuristic, brand impersonation (source `heuristic`). A test confirms the heuristic never changes the score. | VERIFIED |
| Messages: **every** link (up to 5) is extracted and scanned by the URL model and returned in `embedded_urls`; `text_verdict`, `text_score` and `escalated_by_url` state exactly how links affected the result. | VERIFIED |
| Messages: `scam_patterns` keyword tags (UPI collect, KYC, banking, OTP, fake job, payment, urgency). Labelled as rules, not model output. Words inside links are ignored. | VERIFIED |
| `POST /api/v1/feedback` and `GET /api/v1/feedback/summary` (JSON Lines file, counts only in the summary). The feedback loop now works without the gateway. | VERIFIED |
| `/metrics` adds `leakage_ablation` and `provenance` (dataset: synthetic by default, `SECURENET_DATASET`). | VERIFIED |
| Rate limiting (`SECURENET_RATE_LIMIT`, default 120 per minute per client, health exempt). | VERIFIED |
| Optional API key (`SECURENET_API_KEY`, header `X-SecureNet-Key`). | VERIFIED |
| Internal errors no longer return exception names or messages to the client. | VERIFIED |
| CORS: explicit methods and headers, credentials off, extension origins matched by ID format. `nosniff` and `no-store` headers. | VERIFIED |

**Behaviour change.** The link-escalation rule previously looked at the first
link only. It now applies if **any** embedded link is scored PHISHING. The
score itself is still never altered.

Tests: `pytest` → **34 passed** (15 original + 19 new in `tests/test_v11.py`).

## Dashboard (`frontend/`)

Rebuilt as a dark SOC console with React 18 and Vite only (no new frameworks;
charts are hand-written SVG, routing is a 30-line hash router, fonts are
bundled locally so it works offline).

Pages: Overview (live system status, KPIs, verdict mix, risk histogram,
activity, recent detections, model snapshot), URL analyzer, Message analyzer,
Scan history (filter, search, sort, CSV export), Investigation, Threat
intelligence, Model performance, Browser extension, Demo mode.

Every result shows: Safe / Suspicious / Phishing (or Scam), risk gauge with the
real decision bands, confidence, threshold, detection time, model version,
recommended actions, a plain-language explanation built only from the returned
attributions, the SHAP evidence waterfall, URL patterns and anatomy (links) or
scam patterns and embedded-link analysis (messages), all model features, and
feedback.

Honesty rules built in:

* Metrics are read live from `/metrics`; the synthetic-corpus origin is shown.
* Scan history and threat intelligence are computed from scans in this
  browser and say so. No statistics are invented.
* A failed scan is an error state, never a safe result.
* Demo inputs are tagged "Test input" everywhere; their verdicts are live.

| Check | Status |
|---|---|
| Production build | VERIFIED |
| Browser test, desktop 1440px and mobile 390px: all pages, demo run-all, URL deep link, message scan, history → investigation. Zero console errors, zero failed requests. | VERIFIED |
| No horizontal overflow at 390px on any page | VERIFIED |

Fixed along the way: the old Analytics panel claimed gateway-persisted counts
while counting only session scans; the old evidence axis did not reconcile to
the final score; the gateway was probed on every poll even when not configured,
producing console errors (now opt-in via `VITE_GATEWAY_URL`).

## Browser extension (`extension/`)

See `extension/README.md`. Warning page, badge, banner, popup, side panel,
settings, notifications, local history, trusted sites, session cache, rate
limit, privacy filter, fail-closed behaviour, dashboard bridge, feedback.

`tests/e2e/extension_e2e.py` in Chromium 141 → **20 of 20 passed**, no console
errors. **VERIFIED** in Chromium; not yet tried in your installed Chrome.

| # | Check |
|---|---|
| 1 | Phishing URL replaced by the warning page |
| 2 | Badge `!` survives the redirect (bug found and fixed: Chrome clears badges on navigation) |
| 3 | "View full analysis" opens the dashboard investigation |
| 4 | "This site is safe" stores a false-positive report in the backend |
| 5 | "Continue anyway" (with confirmation) loads the site and is not re-blocked |
| 6–7 | Safe site not interrupted; badge `OK` |
| 8 | Repeat visit served from cache |
| 9–10 | Suspicious site shows the banner; the page's password field is untouched |
| 11 | Strict sensitivity blocks suspicious sites |
| 12 | Password, username and `#fragment` stripped before sending |
| 13 | Private-network address never sent |
| 14 | Popup shows site, verdict, risk, evidence, recommendation |
| 15–16 | Backend down → `N/A` badge and "not a safe verdict" in the popup |
| 17–18 | Dashboard detects the extension and its local history |
| 19–20 | Settings reject plain-http remote servers; connection test works |

`node extension/tests/privacy.test.mjs` → privacy filter unit test passes.

## Gateway (`gateway/`)

**UNVERIFIED: still never compiled.** Maven Central is blocked here. `javac`
reports no syntax errors (only unresolved Spring symbols, expected without the
jars). Changes, each small:

* JWT secret, DB credentials, ML URL and CORS origins from environment
  variables. No committed secret; without one, a random per-process key is used.
* H2 console off by default (`SECURENET_H2_CONSOLE=true` to enable locally).
* `GET /api/v1/scan/{id}` is owner-only (ids are sequential; this prevented
  enumeration of other people's scans).
* Feedback summary, disagreements and export require login; submitting feedback
  stays open.
* Unknown routes are denied; actuator exposes health only, without details.
* Error responses no longer include exception messages.
* Fresh scans pass the new ML analysis through in an `analysis` field.

Compile and test it with `mvn -q clean compile` before relying on it.

## Model behaviour observed during testing

Live results for the 17 demo inputs: **15 as intended**. Two phishing links
were scored safe by the URL model:

| Input | Score | Why, from its SHAP evidence |
|---|---|---|
| `paytm-cashback-reward.top/claim` | 22 | Hyphens and short path pull it down; the brand heuristic flags the impersonation but does not affect the score |
| `bit.ly/kyc-upd-now` | 28 | A shortener hides the destination, so there is little lexical signal |

Also: the "IP address used as host" feature has a SHAP value of about 0; the
model captures that signal through the hostname vowel ratio instead, and the
dashboard says so. For messages, most of the score usually comes from many
small character n-gram features that the API does not list individually; the
waterfall shows them as one "all other features" bar.

These are real limitations of a lexical-only model and good viva material.

## Consistency with the IEEE paper: action needed

1. **Numbers.** This build's artifacts give URL accuracy 0.9593, F1 0.9667,
   ROC-AUC 0.9826 and message accuracy 0.976, on a synthetic 30,000-URL
   corpus. The paper reports 95.9% / 0.9608 and describes PhishTank and Kaggle
   data. The paper must use one source of truth and state the data origin.
2. **Link mechanism.** The paper describes the link verdict as an input
   feature of the message model. The code applies it as a rule after the model
   (raise LEGITIMATE to SUSPICIOUS if a link is PHISHING; score unchanged).
   Either change the paper's description or retrain with the feature.
3. **Robustness.** The paper's adversarial-evaluation section should match
   whatever robustness numbers you regenerate with the experiment script.

## Running everything

```bash
# 1. ML service
cd ml-service && uvicorn app.main:app --port 8000
# 2. Dashboard
cd frontend && npm install && npm run dev        # http://localhost:5173
# 3. Extension: chrome://extensions → Load unpacked → extension/
# Tests
cd ml-service && pytest -q
node extension/tests/privacy.test.mjs
python tests/e2e/dashboard_e2e.py               # needs services 1 and 2 running
python tests/e2e/extension_e2e.py
```

Environment variables: `SECURENET_API_KEY`, `SECURENET_RATE_LIMIT`,
`SECURENET_CORS`, `SECURENET_CORS_REGEX`, `SECURENET_FEEDBACK_PATH`,
`SECURENET_DATASET` (ML service); `SECURENET_JWT_SECRET`, `SECURENET_DB_USER`,
`SECURENET_DB_PASSWORD`, `SECURENET_H2_CONSOLE`, `SECURENET_ML_URL` (gateway);
`VITE_GATEWAY_URL`, `VITE_ML_URL`, `VITE_API_KEY` (dashboard).
