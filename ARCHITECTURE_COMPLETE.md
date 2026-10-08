# SecureNet — Complete Architecture (Post-Gateway Implementation)

This document describes the **fully implemented and integrated** SecureNet system, including the Spring Boot gateway, persistent database, and JWT authentication.

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          USER / BROWSER LAYER                            │
│                                                                           │
│  ┌──────────────────┐              ┌───────────────────────────┐        │
│  │  React 18 + Vite │              │ Browser Extension (MV3)   │        │
│  │   (port 5173)    │              │                           │        │
│  │                  │              │ - Badge system            │        │
│  │ Scanner UI       │              │ - Warning banner          │        │
│  │ History          │              │ - Shadow DOM isolation    │        │
│  │ Analytics        │              │ - Real-time alerts        │        │
│  │ Authentication   │              │                           │        │
│  └────────┬─────────┘              └────────────┬──────────────┘        │
│           │                                      │                       │
└───────────┼──────────────────────────────────────┼───────────────────────┘
            │                                      │
            │ HTTPS / JSON                        │ HTTPS / JSON
            │                                      │
┌───────────▼──────────────────────────────────────▼───────────────────────┐
│                     API GATEWAY LAYER (Spring Boot)                       │
│                         (port 8080)                                       │
│                                                                           │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │  Authentication Controller                                    │      │
│  │  - POST /api/v1/auth/register    (public)                    │      │
│  │  - POST /api/v1/auth/login       (public)                    │      │
│  │  - JWT validation via JwtUtil & JwtAuthenticationFilter      │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                           │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │  Scan Controller (authenticated)                              │      │
│  │  - POST /api/v1/scan/url        (requires auth)              │      │
│  │  - POST /api/v1/scan/sms        (requires auth)              │      │
│  │  - GET  /api/v1/history         (user-scoped)               │      │
│  │  - GET  /api/v1/statistics      (user-scoped)               │      │
│  │                                                               │      │
│  │  - Associates scans with userId                              │      │
│  │  - Forwards requests to ML service                           │      │
│  │  - Persists results to database                              │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                           │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │  Security Layer                                               │      │
│  │  - BCryptPasswordEncoder for user passwords                 │      │
│  │  - JwtUtil for token generation & validation                │      │
│  │  - JwtAuthenticationFilter for request interception         │      │
│  │  - SecurityConfig for authorization rules                  │      │
│  └───────────────────────────────────────────────────────────────┘      │
└────────┬─────────────────────────────────┬──────────────────────────────┘
         │                                 │
         │ JDBC / JPA                      │ HTTP / JSON
         │                                 │
┌────────▼──────────────────────┐  ┌──────▼──────────────────────┐
│   Persistent Database          │  │  ML Service (FastAPI)       │
│   (H2 embedded or MySQL)       │  │  (port 8000)               │
│                                │  │                             │
│  Tables:                       │  │  ┌──────────────────────┐  │
│  - users                       │  │  │  URL Detection       │  │
│  - scan_record                 │  │  │  - Feature extract   │  │
│  - feedback_record             │  │  │  - XGBoost model     │  │
│                                │  │  │  - SHAP explain      │  │
│  Properties:                   │  │  │  - Score + evidence  │  │
│  - Audit trail (timestamp)     │  │  └──────────────────────┘  │
│  - User association (userId)   │  │                             │
│  - Scan history (queryable)    │  │  ┌──────────────────────┐  │
│  - Feedback tracking           │  │  │  SMS/UPI Detection   │  │
│                                │  │  │  - Text normalization│  │
│                                │  │  │  - TF-IDF vectorize  │  │
│                                │  │  │  - LogReg classifier │  │
│                                │  │  │  - Token explain     │  │
│                                │  │  │  - Score + evidence  │  │
│                                │  │  └──────────────────────┘  │
│                                │  │                             │
│                                │  │  Trained artifacts:         │
│                                │  │  - url_model.json           │
│                                │  │  - sms_model.joblib         │
│                                │  │  - Metrics (accuracy, F1)   │
└────────────────────────────────┘  └─────────────────────────────┘
```

---

## Data Flow — URL Scan Example

```
1. User clicks "SCAN" in React frontend
   ↓
2. Frontend sends POST /api/v1/scan/url with token
   Authorization: Bearer eyJhbGci...
   ↓
3. Gateway JwtAuthenticationFilter validates token
   ↓
4. ScanController receives authenticated request
   - Extracts userId from token
   ↓
5. ScanService forwards to ML service
   ↓
6. ML service processes URL:
   - Canonicalise() removes provenance artifacts
   - Extract features (length, dots, TLD, keywords)
   - Score via XGBoost
   - Explain via SHAP (feature contributions)
   ↓
7. ML service returns:
   - verdict (PHISHING / SUSPICIOUS / LEGITIMATE)
   - score (0.0 to 1.0)
   - evidence (list of contributing features)
   - latencyMs (inference time)
   ↓
8. Gateway persists to database:
   - INSERT INTO scan_record (artefact, verdict, score, userId, scannedAt)
   ↓
9. Gateway returns to frontend
   ↓
10. React displays verdict + evidence axis + SHAP explanations
    ↓
11. Browser extension also warned (if score > threshold)
    ↓
12. User can mark as safe/malicious for feedback loop
    → Stored in feedback_record table
```

---

## Authentication Flow

```
REGISTRATION:
User → Register form (username, email, password)
       → POST /api/v1/auth/register
       → AuthService.register()
       → BCryptPasswordEncoder.encode(password)
       → Save User entity to database
       → JwtUtil.generateToken()
       → Return JWT token + user details
       → Frontend stores token in localStorage

LOGIN:
User → Login form (email, password)
       → POST /api/v1/auth/login
       → AuthService.login()
       → Verify email exists
       → BCryptPasswordEncoder.matches(password, hash)
       → AuthenticationManager.authenticate()
       → JwtUtil.generateToken()
       → Return JWT token + user details

SUBSEQUENT REQUESTS:
Frontend → Include "Authorization: Bearer <token>" header
           → JwtAuthenticationFilter intercepts request
           → Extract token from header
           → JwtUtil.validateToken(token)
           → getUsernameFromToken()
           → Load User entity via UserDetailsService
           → Set SecurityContext
           → Allow request to proceed with user info
           → ScanService captures userId
           → Database query filters by userId

TOKEN EXPIRATION:
Token valid for 24 hours
Expired token → JwtUtil.validateToken() returns false
              → Request rejected with 401 Unauthorized
              → Frontend prompts user to re-login
```

---

## Database Schema

### users table

```sql
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,  -- BCrypt hash
    role VARCHAR(20) NOT NULL,       -- 'USER' or 'ADMIN'
    enabled BOOLEAN NOT NULL,        -- Account active
    created_at BIGINT NOT NULL       -- Unix timestamp
);
```

### scan_record table

```sql
CREATE TABLE scan_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    artefact VARCHAR(4000) NOT NULL,
    artefact_hash VARCHAR(64) NOT NULL,
    artefact_type VARCHAR(8) NOT NULL,        -- 'url' or 'sms'
    canonical_form VARCHAR(2048),
    verdict VARCHAR(16) NOT NULL,             -- PHISHING, SUSPICIOUS, LEGITIMATE, SCAM
    risk_band VARCHAR(8) NOT NULL,            -- LOW, MEDIUM, HIGH
    score DOUBLE NOT NULL,                    -- 0.0 to 1.0
    threshold DOUBLE,
    base_value DOUBLE,
    latency_ms DOUBLE,
    model_version VARCHAR(64),
    evidence_json LONGTEXT,                   -- JSON array of features
    india_signals VARCHAR(512),               -- Comma-separated UPI/KYC terms
    user_id BIGINT,                           -- Foreign key to users
    scanned_at TIMESTAMP NOT NULL,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_scan_user (user_id),
    INDEX idx_scan_time (scanned_at),
    INDEX idx_scan_hash (artefact_hash)
);
```

### feedback_record table

```sql
CREATE TABLE feedback_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    scan_id BIGINT NOT NULL,
    user_id BIGINT,
    feedback_type VARCHAR(20) NOT NULL,  -- 'mark_safe', 'mark_malicious'
    reason VARCHAR(512),
    submitted_at TIMESTAMP NOT NULL,
    
    FOREIGN KEY (scan_id) REFERENCES scan_record(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_feedback_scan (scan_id),
    INDEX idx_feedback_user (user_id)
);
```

---

## Deployment Options

### Development (H2 in-memory)

```yaml
# No database setup needed
# Data lost on application restart
# Fast startup, good for testing
datasource:
  url: jdbc:h2:mem:testdb
  driver-class-name: org.h2.Driver
```

### Development (H2 persistent)

```yaml
# Data stored in ./data/securenet.mv.db
# Persists across restarts
# Good for local development
datasource:
  url: jdbc:h2:file:./data/securenet
  driver-class-name: org.h2.Driver
```

### Production (MySQL)

```yaml
# Requires external MySQL server
# Scalable, standard database
# Supports connection pooling
datasource:
  url: jdbc:mysql://db-server:3306/securenet
  driver-class-name: com.mysql.cj.jdbc.Driver
  username: securenet_user
  password: ${DB_PASSWORD}
```

---

## Fallback behavior

If the Spring Boot gateway is not running, the React frontend automatically falls back to calling the ML service directly:

```javascript
// frontend/src/lib/api.js

async function callBackend(method, endpoint, data) {
    // Try gateway first
    try {
        return await fetch(`http://localhost:8080${endpoint}`, ...)
    } catch {
        // Gateway unavailable, use ML service directly
        return await fetch(`http://localhost:8000${endpoint}`, ...)
    }
}
```

This ensures the system is still usable even if the gateway is down, though without authentication and persistent history.

---

## Running the complete system

### Terminal 1 — ML Service

```powershell
cd ml-service
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

Wait for `Uvicorn running on http://127.0.0.1:8000`

### Terminal 2 — Gateway

```powershell
cd gateway
mvn spring-boot:run
```

Wait for `Started GatewayApplication in X.XXX seconds`

### Terminal 3 — Frontend

```powershell
cd frontend
npm run dev
```

Open http://localhost:5173

### Terminal 4 — Browser Extension (optional)

In Chrome/Edge:
- Go to `chrome://extensions`
- Enable Developer mode
- Load unpacked → select `extension/` folder
- Pin SecureNet to toolbar

---

## Security considerations

1. **JWT Secret**: Change `securenet.jwt.secret` in production to a securely generated 32-byte string
2. **HTTPS**: Use HTTPS in production to prevent token interception
3. **Password hashing**: Uses BCryptPasswordEncoder with 10 rounds (industry standard)
4. **Token expiration**: 24 hours, user must re-login
5. **CORS**: Restricted to `localhost:5173` and `localhost:3000` in development
6. **SQL injection**: Protected via JPA parameterized queries
7. **XSS**: Browser extension uses shadow DOM to prevent page scripts from modifying warnings

---

## What was implemented

✓ Spring Boot gateway with JWT authentication
✓ User registration and login endpoints
✓ Password encryption with BCrypt
✓ Persistent scan history with user association
✓ Token-based authorization on /scan endpoints
✓ Database schema for users, scans, and feedback
✓ Graceful fallback when gateway is unavailable
✓ CORS configuration for cross-origin requests
✓ H2 embedded database (and MySQL support)

---

## What was not implemented (future work)

- [ ] Email verification for registration
- [ ] Password reset functionality
- [ ] Rate limiting on /auth endpoints
- [ ] Automatic token refresh (currently 24-hour expiration)
- [ ] Admin dashboard for user management
- [ ] Two-factor authentication
- [ ] Audit logging of sensitive operations
- [ ] API key generation for programmatic access
