"""
SecureNet ML microservice
=========================
FastAPI application exposing the URL and SMS classifiers with SHAP-based
explanations.

Run:
    uvicorn app.main:app --reload --port 8000

Interactive docs:
    http://localhost:8000/docs
"""

from __future__ import annotations

import hmac
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import (
    API_KEY, CORS_ORIGIN_REGEX, CORS_ORIGINS, RATE_LIMIT_PER_MIN, SERVICE_NAME, VERSION,
)
from .models import sms_model, url_model
from .routers import feedback, health, sms, url


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("=" * 60)
    print(f"  {SERVICE_NAME} v{VERSION} starting")
    print("=" * 60)
    url_model.load()
    sms_model.load()
    if not (url_model.loaded and sms_model.loaded):
        print("\n  WARNING: one or more models are missing.")
        print("  Run:  python training/build_dataset.py")
        print("        python training/train_url_model.py")
        print("        python training/train_sms_model.py\n")
    yield
    print(f"  {SERVICE_NAME} shutting down")


app = FastAPI(
    title="SecureNet ML Service",
    description=(
        "Phishing URL and UPI/SMS scam detection with explainable AI. "
        "Every prediction is returned with an additive attribution ledger."
    ),
    version=VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-SecureNet-Key"],
    expose_headers=["X-Process-Time-ms", "Retry-After"],
)

# --- Rate limiting --------------------------------------------------------
# Sliding one-minute window per client address. In-process and therefore
# per-worker; enough to stop a runaway extension or script from saturating a
# local or single-node deployment.
_hits: dict = defaultdict(deque)
_hits_lock = threading.Lock()


def _rate_limited(client: str) -> int:
    """Return seconds to wait if the client is over budget, else 0."""
    if RATE_LIMIT_PER_MIN <= 0:
        return 0
    now = time.monotonic()
    with _hits_lock:
        q = _hits[client]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= RATE_LIMIT_PER_MIN:
            return max(1, int(60 - (now - q[0])) + 1)
        q.append(now)
    return 0


@app.middleware("http")
async def guard(request: Request, call_next):
    t0 = time.perf_counter()
    if request.url.path.startswith("/api/") and request.method != "OPTIONS":
        if API_KEY and not hmac.compare_digest(
                request.headers.get("X-SecureNet-Key", ""), API_KEY):
            return JSONResponse(status_code=401, content={"error": "Unauthorized",
                                                          "detail": "Missing or invalid API key"})
        client = request.client.host if request.client else "unknown"
        wait = _rate_limited(client)
        if wait:
            return JSONResponse(status_code=429, headers={"Retry-After": str(wait)},
                                content={"error": "TooManyRequests",
                                         "detail": f"Rate limit reached; retry in {wait}s"})
    response = await call_next(request)
    response.headers["X-Process-Time-ms"] = f"{1000 * (time.perf_counter() - t0):.2f}"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    # Log the detail server-side; never return internals to the client.
    print(f"[error] {request.method} {request.url.path}: {type(exc).__name__}: {exc}")
    return JSONResponse(status_code=500,
                        content={"error": "InternalError", "detail": "The scan could not be completed."})


app.include_router(health.router)
app.include_router(url.router)
app.include_router(sms.router)
app.include_router(feedback.router)


@app.get("/")
def root() -> dict:
    return {
        "service": SERVICE_NAME,
        "version": VERSION,
        "docs": "/docs",
        "endpoints": [
            "GET  /health",
            "GET  /metrics",
            "POST /api/v1/scan/url",
            "POST /api/v1/scan/url/batch",
            "POST /api/v1/scan/sms",
            "POST /api/v1/scan/message",
            "POST /api/v1/feedback",
            "GET  /api/v1/feedback/summary",
        ],
    }
