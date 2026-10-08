# SecureNet Gateway — Setup and Compilation

The Spring Boot gateway with JWT authentication and persistent history is now ready to compile and deploy.

---

## Prerequisites

| Requirement | Check with | Download from |
|---|---|---|
| Java 25+ | `java -version` | adoptium.net or java.com |
| Maven 3.8+ | `mvn -version` | maven.apache.org |
| Python ML service running | visit `http://localhost:8000/health` | Run `uvicorn app.main:app --port 8000` in `ml-service/` |

---

## Step 1 — Compile the gateway

```powershell
cd gateway
mvn clean compile
```

### If compilation fails

**Common issue:** `[ERROR] FAILURE`

Run with verbose output to see the real error:

```powershell
mvn clean compile -X
```

**If you see `Could not find artifact org.springframework.boot:spring-boot-starter-security`:**

Maven might be using an old cache. Clear it:

```powershell
rmdir /s %USERPROFILE%\.m2\repository
mvn clean compile
```

---

## Step 2 — Build the fat JAR

```powershell
mvn clean package -DskipTests
```

This creates `target/gateway-1.0.0.jar` (~50 MB).

---

## Step 3 — Run the gateway

```powershell
mvn spring-boot:run
```

Wait for:

```
Started GatewayApplication in X.XXX seconds
Tomcat started on port(s): 8080
```

---

## Step 4 — Verify it's working

In a new terminal or browser:

```powershell
curl http://localhost:8080/api/v1/health
```

Expected response:

```json
{"status":"UP"}
```

---

## Creating your first user

### Register

```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

Response:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "username": "testuser",
  "email": "test@example.com",
  "role": "USER",
  "expiresIn": 86400000
}
```

### Login

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Save the `token` value.

### Use the token in a request

```bash
curl -X POST http://localhost:8080/api/v1/scan/url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"url": "http://example.com"}'
```

---

## Database

The gateway uses **H2 embedded database** by default. Data is stored in `./data/securenet.mv.db`.

### View the database

While the gateway is running, visit:

```
http://localhost:8080/h2-console
```

- JDBC URL: `jdbc:h2:file:./data/securenet`
- Username: `sa`
- Password: (leave blank)

**Tables:**

- `users` — registered users with passwords (BCrypt-hashed)
- `scan_record` — scan history with user association
- `feedback_record` — user feedback on scans

### Switch to MySQL (production-ready)

Edit `src/main/resources/application.yml`:

```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/securenet
    driver-class-name: com.mysql.cj.jdbc.Driver
    username: securenet_user
    password: your_password
  jpa:
    hibernate:
      ddl-auto: validate  # or 'update' for auto-migration
```

Hibernate will auto-create tables if `ddl-auto: update`.

---

## Architecture

```
React Frontend (port 5173)
         ↓
   Spring Boot Gateway (port 8080)
         ↓
   ├─ Database (H2 or MySQL)
   │
   └─ FastAPI ML Service (port 8000)
         ↓
      ML Models
```

The frontend tries to reach the gateway first. If it fails, it falls back to the ML service directly.

---

## Authentication flow

1. User registers or logs in via `/api/v1/auth/register` or `/api/v1/auth/login`
2. Backend returns JWT token
3. Frontend stores token in localStorage
4. Frontend sends token in `Authorization: Bearer <token>` header
5. Gateway validates token using `JwtAuthenticationFilter`
6. If valid, request is processed and associated with the user
7. Scan history is stored with `userId`
8. User can only see their own scan history

---

## Admin operations

To manually add an admin user (for debugging), connect to H2 console and run:

```sql
INSERT INTO users (username, email, password, role, enabled, created_at)
VALUES ('admin', 'admin@example.com',
  '$2a$10$your_bcrypt_hash_here', 'ADMIN', true, 
  CURRENT_TIMESTAMP
);
```

To generate a BCrypt hash of a password in Java:

```java
new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder()
    .encode("your_password")
```

---

## Troubleshooting

### "Address already in use: 8080"

Another gateway is running:

```powershell
netstat -ano | findstr :8080
taskkill /PID <number> /F
```

### "Connection refused" when calling ML service

The Python ML service is not running. Start it in a separate terminal:

```powershell
cd ml-service
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

### JWT token errors

- **Token expired:** Tokens last 24 hours. Re-login.
- **Invalid signature:** The secret key was changed. Existing tokens are invalid.
- **Malformed token:** The token was corrupted or truncated.

---

## Next steps

1. Update the React frontend to use the gateway instead of the ML service directly
2. Test the login/register flow in the frontend
3. Verify scan history is persisted and user-scoped
4. Deploy to production with a strong `jwt.secret`

---

## Production checklist

- [ ] Change `securenet.jwt.secret` to a securely generated 32+ byte string
- [ ] Use MySQL instead of H2
- [ ] Set `spring.jpa.hibernate.ddl-auto` to `validate` (not `update`)
- [ ] Enable HTTPS (configure in `application.yml`)
- [ ] Set `spring.security.require-https: true`
- [ ] Add rate limiting on `/auth/login` and `/auth/register`
- [ ] Log authentication failures for security monitoring
- [ ] Set up automated database backups
