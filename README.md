# SecureNet

> **New here? Read [RUN_INSTRUCTIONS.md](RUN_INSTRUCTIONS.md)** for complete
> step-by-step setup with troubleshooting.
>
> **Version 1.1:** SOC dashboard, real-time browser extension and API
> hardening. What changed, how it was tested and what is still unverified:
> [UPGRADE_NOTES.md](UPGRADE_NOTES.md).

Phishing URL and UPI/SMS scam detection with explainable AI.

Final year project, Department of Computer Science and Engineering,
Sathyabama Institute of Science and Technology, Chennai.

---

## What this is

Three tiers:

| Tier | Stack | Port | Status |
|---|---|---|---|
| ML microservice | Python 3.12, FastAPI, XGBoost, SHAP | 8000 | **Trained, running, 34/34 tests pass** |
| API gateway | Java 25, Spring Boot 3.5, JPA, H2 | 8080 | **Compiles on Java 25; no gateway tests yet** |
| Frontend | React 18, Vite | 5173 | **Builds clean, browser-tested desktop and mobile, no console errors** |
| Browser extension | Manifest V3, vanilla JS | — | **Loaded and tested in Chromium, 20/20 end-to-end checks** |

The frontend runs against the gateway when it is up, and falls back to calling
the ML service directly when it is not. So you can demo the whole system
without the gateway.

## Read this before your viva

Four things in this repository are not what you might assume.

**0. The browser extension was tested in Chromium, not in your Chrome.** Version
1.1 passed 20 automated end-to-end checks in Chromium 141 (warning page, badge,
banner, cache, privacy filtering, backend-down behaviour, feedback, dashboard
bridge). Load it via `chrome://extensions` → Developer mode → Load unpacked →
`extension/` and try it once before you demonstrate it. See `extension/README.md`.

**1. The gateway compiles on Java 25, but has no Java test suite yet.** It was
verified with `mvn -q clean test` using Java 25. The command compiles the
gateway, but no tests run because `gateway/src/test` is not present. Start it
with:

```bash
cd gateway
mvn -q clean test
mvn spring-boot:run
```

The frontend can still run without the gateway and detects this automatically.

**2. The metrics below come from synthetic data.** `training/build_dataset.py`
generates the corpus. It is built to be realistic — hard negatives, genuine
class overlap, 2% label noise, domain-grouped splits — but it is not
PhishTank. If you cite these numbers, say where they came from. To use real
data, drop CSVs into `ml-service/data/raw/` and run
`python training/build_dataset.py --real`.

**3. The leakage figure is smaller than you may expect.** Measured inflation
is **1.94 percentage points**, not the 99% → 92% collapse often described for
real merged corpora. The synthetic corpus has a 2% label-noise ceiling that
caps how high the leaky configuration can climb. The mechanism is real and
reproducible; the magnitude is bounded by the data. Do not quote a larger
number than the one the script prints.

## Measured results

Run `python training/train_url_model.py` and `train_sms_model.py` to reproduce.
Every number is written to `ml-service/artifacts/*.json` and served at
`GET /metrics`, so nothing needs to be transcribed by hand.

**URL classifier** — XGBoost, 30,000 URLs, 15,353 distinct registrable
domains, split grouped by domain with zero train/test domain overlap:

| Metric | Value |
|---|---|
| Accuracy | 0.959 |
| Precision | 0.972 |
| Recall | 0.962 |
| F1 | 0.967 |
| ROC-AUC | 0.983 |
| False positive rate | 0.044 |
| Inference | 0.42 ms/URL |

**SMS/UPI classifier** — TF-IDF (word 1-2 grams + char 3-5 grams) into
logistic regression, 6,000 messages:

| Metric | Value |
|---|---|
| Accuracy | 0.976 |
| Precision | 0.972 |
| Recall | 0.980 |
| F1 | 0.976 |
| 5-fold CV F1 | 0.980 ± 0.003 |
| Inference | 1.76 ms/message |

**Leakage ablation** (`python training/leakage_ablation.py`, 3 seeds):

| | Configuration | Accuracy | F1 |
|---|---|---|---|
| A | Leaky features + random split | 0.981 | 0.981 |
| B | Leaky features + grouped split | 0.980 | 0.981 |
| C | Clean features + random split | 0.965 | 0.965 |
| D | Clean features + grouped split (SecureNet) | 0.962 | 0.965 |

Accuracy inflation attributable to leakage: **1.94 pp**.

`table_iv.tex` and `table_iv.md` are written alongside for pasting into the
paper.

## The methodology, in one page

**The problem.** Public phishing corpora are assembled by different scrapers
for each class. PhishTank preserves the full submitted string — scheme, port,
tracking query, trailing slash. Tranco and Alexa store bare registrable
domains. A model trained on the raw strings learns which scraper produced the
row, not whether the URL is a phish. It scores above 99% and fails in
deployment.

**The control.** `canonicalise()` in `app/features/url_features.py` strips
scheme, `www.`, explicit port, fragment and trailing slash before any feature
is computed. The six provenance attributes are named in `LEAKY_FEATURES` and
zeroed in the deployed configuration; the ablation switches them back on to
measure what they were worth.

**The second control.** The train/test split is grouped by registrable domain
(`GroupShuffleSplit`), so no domain in training can appear in test. Without
this the model memorises specific hosts. The training script prints the
train/test domain overlap — it should always read 0.

**Why the synthetic corpus reproduces the artefact.** `stylise()` in
`build_dataset.py` writes positives in PhishTank style and negatives in Tranco
style. This is not cheating; it is the phenomenon under study. Without it the
ablation measures nothing, because both classes are already canonical. The
first run of this experiment returned a 0.35 pp gap for exactly that reason.

**SMS side.** The same principle. Carrier headers (`AD-HDFCBK`), amounts,
phone numbers and OTP digits are replaced with placeholder tokens by
`normalise()`, and headers are attached to both classes during generation so
the sender ID cannot act as a label proxy.

**Explanations.** SHAP `TreeExplainer` is exact for tree ensembles, so URL
attributions are the model's actual decision decomposition. For the linear SMS
model the exact SHAP value is `coef_i * (x_i - E[x_i])`, computed directly.
Both return the same envelope, so the frontend renders one evidence component
for either artefact. The bars are additive: they sum toward the score rather
than describing it.

## Running it

Prerequisites: Python 3.10+, Node 18+, and (optionally) Java 25 + Maven.

### Everything at once

```bash
./scripts/run_all.sh        # macOS / Linux
scripts\run_all.bat         # Windows
```

### On Windows, if `activate` misbehaves

PowerShell sometimes shows the `(.venv)` prefix without actually activating the
environment, which sends `pip install` to the system Python and then fails with
`ModuleNotFoundError`. Calling the venv's interpreter by path avoids the whole
problem:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

Do not add `--reload` on Windows; the reloader can exit when the parent shell
changes. Run one command per line and wait for each to finish.

### Step by step

**1. ML service** (required)

```bash
cd ml-service
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python training/build_dataset.py    # ~10 s
python training/train_url_model.py  # ~30 s
python training/train_sms_model.py  # ~20 s

uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs for the interactive API.

**2. Frontend** (required)

```bash
cd frontend
npm install
npm run dev                         # http://localhost:5173
```

**3. Gateway** (optional — adds scan history and the feedback loop)

```bash
cd gateway
mvn spring-boot:run                 # http://localhost:8080
```

H2 console at http://localhost:8080/h2-console
(JDBC URL `jdbc:h2:file:./data/securenet`, user `sa`, no password).

**4. Browser extension** (optional — the real-time alerts)

With the ML service running: open `chrome://extensions`, enable Developer
mode, click **Load unpacked**, select the `extension/` folder. Full detail and
the security rationale are in `extension/README.md`.

### Tests

```bash
cd ml-service
pytest                    # or: python tests/test_api.py
```

## Opening this in VS Code

Open the `SecureNet` folder as the workspace root. Recommended extensions:
Python, Pylance, Extension Pack for Java, ES7+ React snippets.

Select the interpreter from `ml-service/.venv` (Ctrl+Shift+P → *Python: Select
Interpreter*) or imports will show as unresolved.

## API

Both tiers expose the same scan envelope. The gateway wraps `artefact`; the
ML service takes `url` or `message`.

```
POST /api/v1/scan/url        { "url": "..." }
POST /api/v1/scan/url/batch  { "urls": [...] }
POST /api/v1/scan/sms        { "message": "..." }
POST /api/v1/scan/message    alias for /scan/sms
GET  /health
GET  /metrics
```

Gateway only:

```
POST /api/v1/scan            auto-routes by artefact shape
GET  /api/v1/history?limit=25
GET  /api/v1/statistics
POST /api/v1/feedback        { "scanId": 1, "correctLabel": 0 }
GET  /api/v1/feedback/export?type=url
```

Example:

```bash
curl -X POST http://localhost:8000/api/v1/scan/url \
  -H "Content-Type: application/json" \
  -d '{"url":"http://sbi-kyc-verify.tk/netbanking/login.php"}'
```

## Layout

```
SecureNet/
├── ml-service/
│   ├── app/
│   │   ├── features/     url_features.py (canonicalise, 41 features)
│   │   │                 text_clean.py   (normalise, India lexicon)
│   │   ├── models/       url_model.py (SHAP), sms_model.py
│   │   ├── routers/      health.py, url.py, sms.py
│   │   ├── config.py     thresholds, risk bands
│   │   └── main.py       FastAPI app
│   ├── training/         build_dataset.py, train_url_model.py,
│   │                     train_sms_model.py, leakage_ablation.py
│   ├── artifacts/        trained models + metrics JSON + table_iv.*
│   ├── data/             urls.csv, sms.csv (generated)
│   └── tests/test_api.py
├── gateway/              Spring Boot source (uncompiled)
├── frontend/             React 18 + Vite
│   └── src/components/   Scanner, VerdictPanel, EvidenceAxis,
│                         HistoryList, Analytics
├── extension/            Manifest V3 browser extension
│   ├── manifest.json
│   ├── background/       service_worker.js (tab watch, API call, cache)
│   ├── content/          warning.js (shadow-DOM banner)
│   ├── popup/            popup.html/js/css
│   └── README.md
└── scripts/              run_all.sh, run_all.bat
```

## Known limitations

State these before an examiner finds them.

- The gateway has not been compiled or run.
- Results are from a synthetic corpus, not PhishTank or Kaggle.
- Features are lexical only. No WHOIS age, DNS, TLS certificate, or page
  content — all of which real phishing detectors use, and all of which would
  likely improve on these numbers.
- No adversarial evaluation. A phisher who knows the feature set can evade it;
  short clean domains are the obvious gap, which is why they were added to the
  corpus as hard positives.
- The SMS corpus is template-generated, so its diversity is far below real
  smishing traffic. The 0.976 F1 should be read as an upper bound.
- No authentication on any endpoint. Do not deploy this as-is.
- The extension warns but does not block navigation, and it checks the URL
  only — not page content, redirects, or the certificate.
- Analytics in the dashboard cover the current browser session unless the
  gateway is running to persist history. The panel says which it is showing.
