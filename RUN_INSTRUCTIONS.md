# SecureNet — How to Run

Complete step-by-step instructions, written for **Windows + VS Code**, which is
the setup this project has actually been run on. Notes for macOS/Linux are at
the end.

Every troubleshooting entry in this document is a problem that genuinely came
up during setup, not a hypothetical.

---

## Part 0 — What you need first

| Requirement | Check it with | If missing |
|---|---|---|
| Python 3.10 or newer | `python --version` | python.org/downloads — tick **Add Python to PATH** during install |
| Node.js 18 or newer | `node --version` | nodejs.org (LTS version) |
| VS Code | — | code.visualstudio.com |
| Java 25 + Maven | `mvn -v` | **Optional.** Only for the gateway, which is not required |

You do **not** need to train any models. The trained files ship inside the zip.

---

## Part 1 — Extract to the right place

This step causes more failures than anything else. Take it slowly.

### 1.1 Extract the zip

Right-click `SecureNet.zip` → **Extract All**.

### 1.2 Find the real project folder

Open the extracted folder and look inside. You will probably see a **single
folder** called `SecureNet` rather than the project files directly.

The **real project folder** is the one that directly contains these five items:

```
README.md
ml-service
frontend
gateway
extension
```

If you have to double-click into another folder to see those, you are one
level too high.

### 1.3 Move it somewhere with a simple path

Windows extracts to names like `SecureNet (1)`, and the **space and brackets
break commands** unless every path is wrapped in quotes.

Move the real project folder to a clean location:

```
D:\SecureNet
```

or

```
C:\SecureNet
```

**Do not skip this.** It removes an entire category of errors.

### 1.4 Delete any other copies

If you extracted more than once, delete the extras. Having two copies means
you will eventually set up one and try to run the other — which happened
during this project's setup and wasted considerable time.

---

## Part 2 — Open in VS Code

1. Open VS Code
2. **File → Open Folder**
3. Select `D:\SecureNet` (the folder containing `README.md`)
4. Click **Select Folder**

### Verify before continuing

Look at the Explorer panel on the left. You must see:

```
.vscode
extension
frontend
gateway
ml-service
scripts
README.md
```

If you instead see one `SecureNet` folder you have to expand, **stop** — you
opened the wrong level. Redo Part 2 with the inner folder.

---

## Part 3 — Set up the ML service (first time only)

This takes about 3 minutes. You only do it once per machine.

### 3.1 Open a terminal

Press `` Ctrl+~ `` (the key above Tab).

### 3.2 Go to the ML service folder

```powershell
cd ml-service
```

Your prompt should now end in `\SecureNet\ml-service`.

### 3.3 Create the virtual environment

```powershell
python -m venv .venv
```

Note the leading dot in `.venv`. Takes about 20 seconds and prints nothing.

### 3.4 Install the dependencies

**Use this exact command.** It calls the environment's Python directly, which
avoids the activation problems described in Troubleshooting below:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Expect 1–3 minutes. Yellow warnings are normal. Only red `ERROR` lines matter.

It should end with a line beginning `Successfully installed` that includes
`xgboost`, `scikit-learn` and `shap`.

### 3.5 Verify the install landed correctly

```powershell
.\.venv\Scripts\python.exe -c "import xgboost, sklearn, shap; print(xgboost.__version__, sklearn.__version__, shap.__version__)"
```

Expected output:

```
3.4.0 1.8.0 0.52.0
```

If you get `ModuleNotFoundError`, the install went to the wrong Python. See
Troubleshooting → Problem 3.

### 3.6 Point VS Code at the interpreter (optional)

Press `Ctrl+Shift+P` → type `Python: Select Interpreter` → choose the entry
containing `.venv`.

This only removes red underlines in the editor. The code runs either way.

---

## Part 4 — Set up the frontend (first time only)

### 4.1 Open a second terminal

Click the **`+`** icon in the terminal panel. Do not reuse the first one.

### 4.2 Install

```powershell
cd frontend
npm install
```

Takes 15–30 seconds.

You will see a warning about vulnerabilities. **Ignore it.** Those are in
Vite's development-only build chain and do not affect anything. Running
`npm audit fix --force` would upgrade Vite to a new major version and break the
build.

---

## Part 5 — Run it (every time from now on)

Setup is done. From here it takes about 15 seconds.

### 5.1 Terminal 1 — the ML service

```powershell
cd ml-service
```
```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

**Wait for these three lines:**

```
[url_model] loaded (threshold=0.600)
[sms_model] loaded
INFO:     Uvicorn running on http://127.0.0.1:8000
```

A yellow `FutureWarning` above them is harmless noise. A red traceback is not.

**Now leave this terminal completely alone.** It will not return to a prompt —
that is what "running" looks like. Typing anything in it stops the server.

### 5.2 Terminal 2 — the frontend

```powershell
cd frontend
```
```powershell
npm run dev
```

Wait for:

```
➜  Local:   http://localhost:5173/
```

Your browser should open automatically. If not, Ctrl+click that link.

### 5.3 Confirm it works

On the page, check the **top-right corner reads `Serving: ml`**. That confirms
the frontend found the backend.

Then click a sample button under the input box and press **SCAN**. You should
get a verdict, a score out of 100, and the evidence axis.

---

## Part 6 — Load the browser extension (optional)

The ML service must already be running.

1. Open Chrome or Edge
2. Go to `chrome://extensions`
3. Turn on **Developer mode** (toggle, top right)
4. Click **Load unpacked**
5. Select the `extension` folder inside your project
6. Pin SecureNet to the toolbar so the badge is visible

**Test it:** visit any ordinary website. Click the SecureNet toolbar icon — the
popup shows the verdict for that page.

**Important honesty note:** this extension was syntax-checked but has never
been loaded into a running Chrome instance by its author. Test it yourself
before relying on it in a demonstration. If the badge does not appear, open
`chrome://extensions`, click **Errors** under SecureNet, and read what it says.

**Never test it on a real phishing site.** The model only reads the URL string,
so there is no need to visit anything dangerous.

---

## Part 7 — Useful extras

### Run the test suite

In a third terminal:

```powershell
cd ml-service
.\.venv\Scripts\python.exe tests\test_api.py
```

Expected: **15/15 tests passed**.

### View the raw metrics

With the service running, open in a browser:

```
http://localhost:8000/metrics
```

Precision, recall, F1, ROC-AUC, confusion matrix counts, split sizes.

### Interactive API documentation

```
http://localhost:8000/docs
```

You can send test requests directly from this page.

### Reproduce the leakage ablation (Table IV)

```powershell
cd ml-service
.\.venv\Scripts\python.exe training\leakage_ablation.py
```

Writes `artifacts/table_iv.tex` and `artifacts/table_iv.md`.

### Retrain the models from scratch

Only if you want to. The trained models already ship in `artifacts/`.

```powershell
.\.venv\Scripts\python.exe training\build_dataset.py
.\.venv\Scripts\python.exe training\train_url_model.py
.\.venv\Scripts\python.exe training\train_sms_model.py
```

### Use real data instead of the synthetic corpus

Put PhishTank or Kaggle CSV files into `ml-service\data\raw\`, then:

```powershell
.\.venv\Scripts\python.exe training\build_dataset.py --real
.\.venv\Scripts\python.exe training\train_url_model.py
```

The CSVs need a URL column and a label column; common names are detected
automatically.

---

## Part 8 — Stopping everything

Press `Ctrl+C` in each terminal, or just close VS Code.

---

## Troubleshooting

### Problem 1 — `cd ml-service` says "Cannot find path"

You are in the wrong folder, almost always because of the nested-folder
problem from Part 1.

Run `dir` to see what is actually there. If you see a `SecureNet` folder
listed, your project is one level deeper:

```powershell
cd SecureNet
cd ml-service
```

Permanent fix: File → Open Folder, and select the folder that directly
contains `README.md`.

---

### Problem 2 — "running scripts is disabled on this system"

PowerShell's execution policy. Run this once per terminal:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

This only affects the current terminal window and is safe.

---

### Problem 3 — `ModuleNotFoundError: No module named 'xgboost'`

This is the trickiest one. The `(.venv)` prefix can appear in your prompt even
when the environment is **not actually active**, so `pip` installs into your
system Python while `python` runs a different one.

Check which Python you are actually using:

```powershell
python -c "import sys; print(sys.executable)"
```

If that does **not** end in `...\ml-service\.venv\Scripts\python.exe`, the
environment is not active despite appearances.

**Solution — stop using activation entirely.** Call the interpreter by path:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

This always works regardless of activation state. Use this form for every
Python command in the project.

---

### Problem 4 — `AttributeError: 'super' object has no attribute '__sklearn_tags__'`

Version mismatch between xgboost and scikit-learn. The shipped
`requirements.txt` already has the correct pins, so this should not occur. If
it does, force the right versions:

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade "xgboost==3.4.0" "scikit-learn==1.8.0" "shap==0.52.0" "joblib==1.5.3"
```

---

### Problem 5 — The web page says "No backend is reachable"

The ML service is not running. Check:

1. Is Terminal 1 still showing `Uvicorn running on...`?
2. Does `http://localhost:8000/health` load in a browser?

If the terminal returned to a normal prompt, the server exited — restart it
per step 5.1. Anything you type into that terminal kills the server.

---

### Problem 6 — The server exits immediately after starting

Do not use `--reload` on Windows. The file-watcher can exit when the parent
shell changes. Start it without:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

---

### Problem 7 — Commands running together, or a `>>` prompt appears

Pasting multiple lines at once makes PowerShell concatenate them into one
broken command. The `>>` prompt means it is waiting for more input.

Press **Enter** on an empty line to clear it, then run **one command at a
time**, waiting for each to finish.

---

### Problem 8 — "Port 8000 is already in use"

An old server is still running. Find and stop it:

```powershell
netstat -ano | findstr :8000
taskkill /PID <the-number-from-the-last-column> /F
```

Or just use a different port — but then update
`frontend\.env.example` to match.

---

### Problem 9 — The gateway will not compile

Expected. **The Spring Boot gateway has never been compiled**, because Maven
Central was unreachable in the environment where this project was built. Two
bugs were found and fixed by inspection; others may remain.

You do not need it. The frontend detects its absence and calls the ML service
directly. Everything except persisted scan history works without it.

If you want to try:

```powershell
cd gateway
mvn -q clean compile
```

Do this with time to spare, never right before a demonstration.

---

## macOS / Linux differences

Only three things change:

| Windows | macOS / Linux |
|---|---|
| `python -m venv .venv` | `python3 -m venv .venv` |
| `.\.venv\Scripts\python.exe` | `.venv/bin/python` |
| `scripts\run_all.bat` | `./scripts/run_all.sh` |

Activation is reliable on these platforms, so `source .venv/bin/activate`
followed by plain `python` works normally.

---

## Quick reference card

**Every-day startup, two terminals:**

```powershell
# Terminal 1
cd ml-service
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000

# Terminal 2
cd frontend
npm run dev
```

**Then open:** http://localhost:5173

**Key URLs:**

| What | Where |
|---|---|
| Dashboard | http://localhost:5173 |
| API docs | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |
| Model metrics | http://localhost:8000/metrics |

**Golden rules:**

1. Open the folder containing `README.md` — not its parent
2. Two terminals, both stay running
3. Use `.\.venv\Scripts\python.exe` instead of activating
4. One command per line
5. No `--reload` on Windows
