#!/usr/bin/env bash
# SecureNet - set up and start every tier that is available.
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== SecureNet ==="

# ---- ML service -----------------------------------------------------------
cd "$ROOT/ml-service"

if [ ! -d .venv ]; then
  echo "[ml] creating virtual environment"
  python3 -m venv .venv
fi
source .venv/bin/activate

echo "[ml] installing dependencies"
pip install -q -r requirements.txt

if [ ! -f artifacts/url_model.json ] || [ ! -f artifacts/sms_model.joblib ]; then
  echo "[ml] no trained models found - building corpus and training"
  python training/build_dataset.py
  python training/train_url_model.py
  python training/train_sms_model.py
else
  echo "[ml] using existing models in artifacts/"
fi

echo "[ml] starting on http://localhost:8000"
uvicorn app.main:app --port 8000 &
ML_PID=$!

# ---- Gateway (optional) ---------------------------------------------------
GW_PID=""
if command -v mvn >/dev/null 2>&1; then
  echo "[gateway] starting on http://localhost:8080"
  (cd "$ROOT/gateway" && mvn -q spring-boot:run) &
  GW_PID=$!
else
  echo "[gateway] Maven not found - skipping. The UI will call the ML service directly."
fi

# ---- Frontend -------------------------------------------------------------
cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  echo "[web] installing dependencies"
  npm install --no-audit --no-fund
fi

echo "[web] starting on http://localhost:5173"
npm run dev &
WEB_PID=$!

cleanup() {
  echo ""
  echo "stopping..."
  kill $ML_PID $WEB_PID 2>/dev/null || true
  [ -n "$GW_PID" ] && kill $GW_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "  UI       http://localhost:5173"
echo "  API docs http://localhost:8000/docs"
echo "  Ctrl+C to stop"
wait
