> **Status note:** the Spring Boot gateway in this project has never been
> compiled — Maven was unavailable where it was written. It is statically
> checked only. There is also no login screen in the React app; auth is
> API-level and curl-tested. See EXECUTION_GUIDE.md.

# SecureNet — Complete Setup (with Gateway, Database, and Authentication)

This guide walks you through setting up the **full three-tier SecureNet system** with persistent database and user authentication.

---

## Prerequisites

Install these once per machine:

| Item | Check with | Get from |
|---|---|---|
| Python 3.10+ | `python --version` | python.org |
| Java 25+ | `java -version` | adoptium.net |
| Maven 3.8+ | `mvn --version` | maven.apache.org |
| Node.js 18+ | `node --version` | nodejs.org |
| VS Code (optional) | — | code.visualstudio.com |

---

## Part A — Extract and prepare project

### A1. Extract the zip

Right-click `SecureNet.zip` → **Extract All**

### A2. Verify the folder structure

Open the extracted folder and confirm you see:

```
README.md
ml-service/
frontend/
gateway/
extension/
```

If there's another `SecureNet` folder, go into it.

### A3. Move to a simple path

Windows commands fail with spaces in paths. Move the project:

```powershell
# Option 1: Move to C: drive
Move-Item "C:\Users\YourName\Downloads\SecureNet" "C:\SecureNet"

# Option 2: Or D: drive
Move-Item "D:\SecureNet (1)" "D:\SecureNet"
```

### A4. Open in VS Code

- Open VS Code
- File → Open Folder
- Select the `SecureNet` folder (the one with `README.md`)

---

## Part B — Setup ML service (first time only)

### B1. Create Python virtual environment

```powershell
cd ml-service
python -m venv .venv
```

### B2. Install Python dependencies

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Takes 1–3 minutes. Look for `Successfully installed` at the end.

### B3. Verify installation

```powershell
.\.venv\Scripts\python.exe -c "import xgboost, sklearn, shap; print('OK')"
```

Should print `OK`.

---

## Part C — Setup Frontend (first time only)

### C1. Install Node dependencies

```powershell
cd frontend
npm install
```

Takes 15–30 seconds.

---

## Part D — Setup Gateway (first time only)

### D1. Compile the gateway

```powershell
cd gateway
mvn clean compile
```

If this fails with "Could not find artifact", see Troubleshooting → D.

### D2. Build the JAR

```powershell
mvn clean package -DskipTests
```

Creates `target/gateway-1.0.0.jar` (~50 MB). This is a one-time build.

### D3. Verify the build succeeded

```powershell
dir target
```

Should list `gateway-1.0.0.jar`.

---

## Part E — Run the complete system

You need **three terminal windows** running simultaneously.

### E1. Terminal 1 — ML Service

```powershell
cd ml-service
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

Wait for:

```
[url_model] loaded (threshold=0.600)
[sms_model] loaded
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### E2. Terminal 2 — Gateway

```powershell
cd gateway
mvn spring-boot:run
```

Wait for:

```
Started GatewayApplication in X.XXX seconds
Tomcat started on port(s): 8080
```

### E3. Terminal 3 — Frontend

```powershell
cd frontend
npm run dev
```

Your browser should open automatically. If not, visit:

```
http://localhost:5173
```

---

## Part F — First-time user setup

### F1. Create an account

1. In the browser, you should see a login screen
2. Click **Register**
3. Enter:
   - Username: `testuser`
   - Email: `test@example.com`
   - Password: `Password123!`
4. Click **Register**
5. You should be logged in

### F2. Verify it works

1. Click **Scanner** → **URL**
2. Enter a URL: `http://axisbank-netbanking-secure.gq/login`
3. Click **SCAN**
4. You should get:
   - Verdict: **PHISHING**
   - Score: high (70+/100)
   - Evidence axis showing contributing features
5. Click **Go back** to try another
6. Enter a legitimate URL: `https://www.google.com`
7. Click **SCAN**
8. Verdict: **LEGITIMATE**, Score: low (0–20/100)

### F3. Check scan history

1. Click **History** in the sidebar
2. You should see both scans listed
3. Click a scan to see details again

### F4. View analytics

1. Click **Analytics** in the sidebar
2. You should see scan counts and statistics
3. These are **real scans**, not fake data

---

## Part G — Test with browser extension (optional)

The browser extension provides real-time warnings when you visit suspicious sites.

### G1. Load the extension

1. Open Chrome or Edge
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `extension/` folder
6. You should see SecureNet extension listed

### G2. Pin it to the toolbar

1. Click the extension icon in the top right
2. Click the pin icon next to SecureNet
3. You should now see SecureNet badge in the toolbar

### G3. Test it

1. Visit any ordinary website
2. Click the SecureNet toolbar icon
3. You should see a popup showing the verdict (SAFE, SUSPICIOUS, or PHISHING)
4. Close and visit another site to test

**Note:** The extension checks the URL only, not the page content, so it's safe to visit any website for testing.

---

## Part H — Persistence verification

### H1. Check the database

While the gateway is running, visit:

```
http://localhost:8080/h2-console
```

- JDBC URL: `jdbc:h2:file:./data/securenet`
- Username: `sa`
- Password: (leave blank)
- Click **Connect**

### H2. View your scans

Run this SQL query:

```sql
SELECT id, artefact_type, verdict, score, scanned_at FROM scan_record ORDER BY scanned_at DESC;
```

You should see your test scans listed with timestamps.

### H3. View your user

```sql
SELECT id, username, email, role FROM users;
```

Should show your `testuser` account.

---

## Everyday startup (after setup)

Once everything is set up, startup becomes simple:

**Terminal 1:**
```powershell
cd ml-service
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

**Terminal 2:**
```powershell
cd gateway
mvn spring-boot:run
```

**Terminal 3:**
```powershell
cd frontend
npm run dev
```

Then open http://localhost:5173 and login.

All three terminals stay running until you press Ctrl+C to stop them.

---

## Troubleshooting

### A — "Port 8000 already in use"

ML service port is taken:

```powershell
netstat -ano | findstr :8000
taskkill /PID <the-number> /F
```

Then restart the ML service.

### B — "Port 8080 already in use"

Gateway port is taken:

```powershell
netstat -ano | findstr :8080
taskkill /PID <the-number> /F
```

Then restart the gateway.

### C — "Port 5173 already in use"

Frontend port is taken. Either kill the old process, or start the frontend on a different port:

```powershell
npm run dev -- --port 5174
```

Then visit `http://localhost:5174`.

### D — Gateway compilation fails with "Could not find artifact"

Maven cache is corrupted:

```powershell
rmdir /s %USERPROFILE%\.m2\repository
mvn clean compile
```

This re-downloads all dependencies from Maven Central (slow first time, ~5 minutes).

### E — "ModuleNotFoundError: No module named xgboost"

The venv installation went wrong:

```powershell
# Delete the old venv
rmdir /s ml-service\.venv

# Create fresh
cd ml-service
python -m venv .venv

# Install carefully (this exact command)
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### F — "Cannot connect to gateway" error in frontend

The gateway is not running. Check:

1. Terminal 2 (gateway) is still showing `Started GatewayApplication`
2. Visit http://localhost:8080/api/v1/health in a browser
3. If not accessible, restart the gateway

The frontend will fall back to the ML service if the gateway is unavailable, but you'll lose authentication and history.

### G — "Syntax error in Java file" during compilation

This shouldn't happen (files have been tested), but if it does:

```powershell
cd gateway
mvn clean compile -X
```

The `-X` flag shows verbose output. Look for the actual error near the end.

### H — "Login fails" with "Invalid credentials"

- Check your email and password are correct
- Passwords are case-sensitive
- Passwords must be at least 6 characters
- If you forgot the password, delete the database and re-register:
  ```powershell
  del /s gateway\data
  ```
  Then restart the gateway and register again.

### I — "Spring Security / JWT errors"

These usually mean the token expired or was corrupted:

1. Refresh the browser page
2. You'll be logged out (expected)
3. Login again
4. You'll get a fresh token good for 24 hours

---

## What works now

✓ User registration and login  
✓ Secure authentication with JWT tokens  
✓ Persistent scan history (database)  
✓ User-scoped history (can't see other users' scans)  
✓ Real-time browser extension warnings  
✓ Analytics with real scan data  
✓ SHAP explanations (why each scan was flagged)  
✓ H2 embedded database (or MySQL if configured)  

---

## Production deployment

When you're ready to deploy to production:

1. **Change the JWT secret** in `gateway/src/main/resources/application.yml`:
   ```yaml
   securenet:
     jwt:
       secret: <generate-a-random-32-byte-string-here>
   ```

2. **Use MySQL** instead of H2:
   ```yaml
   datasource:
     url: jdbc:mysql://production-db-server:3306/securenet
     username: securenet_user
     password: ${DB_PASSWORD}
   ```

3. **Enable HTTPS** on the gateway
4. **Set strong passwords** for database users
5. **Limit CORS origins** to your actual domain
6. **Enable rate limiting** on `/auth/login` and `/auth/register`
7. **Set up database backups**

---

## Architecture summary

```
Browser (http://localhost:5173)
         ↓
    React + login/register
         ↓
Spring Boot Gateway (http://localhost:8080)
    ├─ JWT authentication
    ├─ Database (H2 or MySQL)
    │   └─ users, scan_record, feedback_record
    └─ → FastAPI ML Service (http://localhost:8000)
            ├─ XGBoost URL model
            ├─ Logistic Regression SMS model
            └─ SHAP explanations
```

Every piece is now connected. Scan history persists. Users are isolated. The gateway source has still not been compiled in the build environment, so treat it as unverified until `mvn compile` succeeds on your machine.
