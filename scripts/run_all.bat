@echo off
REM SecureNet - set up and start every tier that is available.
setlocal
set ROOT=%~dp0..

echo === SecureNet ===

cd /d "%ROOT%\ml-service"

if not exist .venv (
  echo [ml] creating virtual environment
  python -m venv .venv
)
call .venv\Scripts\activate.bat

echo [ml] installing dependencies
pip install -q -r requirements.txt

if not exist artifacts\url_model.json (
  echo [ml] no trained models found - building corpus and training
  python training\build_dataset.py
  python training\train_url_model.py
  python training\train_sms_model.py
) else (
  echo [ml] using existing models in artifacts\
)

echo [ml] starting on http://localhost:8000
start "SecureNet ML" cmd /k "call .venv\Scripts\activate.bat && uvicorn app.main:app --port 8000"

where mvn >nul 2>nul
if %ERRORLEVEL%==0 (
  echo [gateway] starting on http://localhost:8080
  start "SecureNet Gateway" cmd /k "cd /d %ROOT%\gateway && mvn spring-boot:run"
) else (
  echo [gateway] Maven not found - skipping. The UI will call the ML service directly.
)

cd /d "%ROOT%\frontend"
if not exist node_modules (
  echo [web] installing dependencies
  call npm install --no-audit --no-fund
)

echo [web] starting on http://localhost:5173
start "SecureNet UI" cmd /k "npm run dev"

echo.
echo   UI       http://localhost:5173
echo   API docs http://localhost:8000/docs
echo   Close the opened windows to stop.
pause
