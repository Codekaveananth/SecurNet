# SecureNet — Step-by-Step Execution Guide

Full system: ML service, Spring Boot gateway, database, authentication, React frontend, browser extension.

## Read this first: what is verified and what is not

Being clear about this will save you time, and it matters if an examiner asks.

**Verified by running it:**

- ML service runs; 15 of 15 tests pass
- React frontend builds cleanly
- Model artifacts load and produce correct scores

**Written and statically checked, but NEVER COMPILED:**

- The entire Spring Boot gateway, including authentication

Maven and a Java compiler were not available in the environment where this code was written, so the gateway has never been built or started. Every cross-file reference has been checked by script (method names, argument counts, repository queries, imports), and several real bugs were found and fixed that way. But static checking is not compilation. Budget time for the first `mvn compile` to surface something, and do it well before any deadline.

**Not built at all:**

- There is no login or registration screen in the React app

Authentication works at the API level and is tested with curl in Part F. The web interface does not use it yet. The scan endpoints are deliberately left public so the app and the browser extension keep working without an account.

## Part A — Install prerequisites

| Requirement | Check with | Needed for |
|---|---|---|
| Python 3.10+ | python --version | ML service |
| Node.js 18+ | node --version | Frontend |
| Java 25+ | java -version | Gateway |
| Maven 3.8+ | mvn -version | Gateway |

Python and Node are enough to run the detection system. Java and Maven are only needed for the gateway, which adds the database and authentication.

## Part B — Extract to a simple path

Windows extracts to folder names like `SecureNet (1)`. The space and brackets break commands unless every path is quoted. Move the project first:

```
D:\SecureNet
```

The correct folder is the one that directly contains `README.md`, `ml-service`, `frontend`, `gateway`, and `extension`. If you have to open another folder to see those, you are one level too high.

Delete any duplicate copies. Setting up one copy and then running another is a common and confusing waste of time.

Then in VS Code: File, Open Folder, select `D:\SecureNet`.

## Part C — Set up the ML service

One time only, about three minutes. Open a terminal with Ctrl and backtick.

```
cd ml-service
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Use the full interpreter path exactly as written. On Windows, PowerShell often shows the `(.venv)` prefix without actually activating the environment, which sends pip to the system Python and produces `ModuleNotFoundError` later. Calling the interpreter by path sidesteps that entirely.

Verify:

```
.\.venv\Scripts\python.exe -c "import xgboost, sklearn, shap; print('ok')"
```

## Part D — Set up the frontend

```
cd frontend
npm install
```

Ignore the vulnerability warning. Those are development-only build dependencies. Do not run `npm audit fix --force`; it upgrades Vite across a major version and breaks the build.

## Part E — Build the gateway

This is the step that has never been tested. Expect to spend time here.

```
cd gateway
mvn clean package -DskipTests
```

The first run downloads roughly 50 MB of dependencies and takes several minutes. If it fails, see Troubleshooting.

## Part F — Run the system

Each service needs its own terminal, and each one runs indefinitely rather than returning to a prompt. Typing in a running terminal stops that service.

Terminal 1, ML service:

```
cd ml-service
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

Wait for the lines reading `[url_model] loaded`, `[sms_model] loaded`, and `Uvicorn running on http://127.0.0.1:8000`.

Terminal 2, gateway (optional):

```
cd gateway
mvn spring-boot:run
```

Wait for `Started GatewayApplication`.

Terminal 3, frontend:

```
cd frontend
npm run dev
```

Open http://localhost:5173. The indicator in the top right reads `gateway` when the gateway is running and `ml` when it is not. Both are working states; without the gateway you lose persistence and the correction buttons.

## Part G — Confirm detection works

In the Link tab, scan a phishing URL:

```
http://axisbank-netbanking-secure.gq/login/verify.php
```

Expect a high score and a PHISHING verdict. Then scan a legitimate one:

```
https://www.icicibank.com/personal-banking/accounts
```

Expect a low score and LEGITIMATE.

In the Message tab, try a real bank message that contains alarming words:

```
Urgent: cheque no 448210 returned unpaid. Please contact your home branch. -SBI
```

It should stay clean. This is the more interesting demonstration, because it shows the model is not simply matching keywords.

## Part H — Test authentication

There is no login screen, so use curl. The gateway must be running.

Register:

```
curl -X POST http://localhost:8080/api/v1/auth/register -H "Content-Type: application/json" -d "{\"username\":\"kavi\",\"email\":\"kavi@example.com\",\"password\":\"Password123\"}"
```

A JSON response containing a token means registration worked and the password was stored as a BCrypt hash.

Log in:

```
curl -X POST http://localhost:8080/api/v1/auth/login -H "Content-Type: application/json" -d "{\"email\":\"kavi@example.com\",\"password\":\"Password123\"}"
```

Copy the token, then read your own history:

```
curl http://localhost:8080/api/v1/history -H "Authorization: Bearer PASTE_TOKEN_HERE"
```

Without the header the same request returns 401, which is the expected behaviour. Confirm a wrong password returns 401 and not 500.

## Part I — Inspect the database

While the gateway runs, open http://localhost:8080/h2-console

- JDBC URL: jdbc:h2:file:./data/securenet
- User: sa
- Password: leave blank

Useful queries:

```
SELECT id, username, email, role FROM users;
SELECT id, artefact_type, verdict, score, user_id, scanned_at FROM scan_record ORDER BY scanned_at DESC;
```

The password column holds a BCrypt hash beginning `$2a$`, never plaintext. The `user_id` column is null for scans made without a token, which is expected.

## Part J — Load the browser extension

The ML service must be running.

1. Open chrome://extensions
2. Enable Developer mode
3. Click Load unpacked
4. Select the `extension` folder
5. Pin SecureNet to the toolbar

Click the toolbar icon on any ordinary site to see the verdict. Version 1.1 of the extension was loaded and tested end to end in Chromium (see UPGRADE_NOTES.md); still check it in your own Chrome before a demo. If the badge does not appear, click Errors under SecureNet on the extensions page.

Never test against a real phishing site. The model reads only the URL string, so there is no reason to load a dangerous page.

## Everyday startup

```
cd ml-service
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

```
cd frontend
npm run dev
```

Add the gateway terminal only when you need persistence or authentication.

## Troubleshooting

**Gateway compilation fails**

Run `mvn clean compile -X` and read the first error, not the last. If it mentions a missing artifact, the dependency cache is incomplete: delete `%USERPROFILE%\.m2\repository` and build again with a working internet connection.

**Application fails to start with a message about jwt.secret**

The secret in `application.yml` is shorter than 32 bytes. HS256 requires at least that, and the code refuses to start rather than run with a weak key. Lengthen it.

**ModuleNotFoundError: No module named 'xgboost'**

The virtual environment is not really active. Check with:

```
python -c "import sys; print(sys.executable)"
```

If that path does not end in `ml-service\.venv\Scripts\python.exe`, use the full interpreter path for every Python command as shown in Part C.

**AttributeError about __sklearn_tags__**

xgboost and scikit-learn versions disagree. The shipped requirements file pins compatible versions, so this should not occur; if it does, reinstall those four packages at the pinned versions.

**Port already in use**

```
netstat -ano | findstr :8000
taskkill /PID THE_NUMBER /F
```

**A 401 from /history**

Expected without a token. Include the Authorization header from Part H.

**The server exits right after starting**

Do not use the `--reload` flag on Windows. The file watcher can exit when the parent shell changes.

**A double angle bracket prompt appears**

PowerShell is waiting for more input, usually because several lines were pasted at once. Press Enter on an empty line, then run one command at a time.

## Honest limitations

State these before an examiner finds them. Knowing the weaknesses of your own system reads as competence.

- The gateway has never been compiled or started. It is statically checked only.
- The React app has no login screen; authentication is API-level and curl-tested.
- All reported metrics come from a synthetic corpus, not from PhishTank or live traffic. The 97.6 percent SMS figure in particular is an upper bound, since the messages are template-generated.
- Features are lexical only. There is no WHOIS age, DNS, TLS, or page content, so a short clean-looking phishing domain can evade detection.
- There has been no adversarial evaluation.
- The default JWT secret is a development value committed to the repository and must be replaced before any real deployment.
- Scans made without a token are stored with no owner, so they are visible in the unscoped history view.

## Before any real deployment

- Replace the JWT secret with a securely generated value supplied through an environment variable
- Switch from H2 to MySQL and set ddl-auto to validate rather than update
- Serve over HTTPS, since a bearer token sent over plain HTTP can be intercepted
- Add rate limiting to the login and registration endpoints
- Restrict CORS to the real deployed origin
