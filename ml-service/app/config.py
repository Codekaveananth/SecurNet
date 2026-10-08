"""Central configuration for the SecureNet ML microservice."""

from __future__ import annotations

import json
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = Path(os.getenv("SECURENET_ARTIFACTS", BASE_DIR / "artifacts"))

URL_MODEL_PATH = ARTIFACT_DIR / "url_model.json"
SMS_MODEL_PATH = ARTIFACT_DIR / "sms_model.joblib"
URL_METRICS_PATH = ARTIFACT_DIR / "url_metrics.json"
SMS_METRICS_PATH = ARTIFACT_DIR / "sms_metrics.json"
ABLATION_PATH = ARTIFACT_DIR / "leakage_ablation.json"

# User corrections (false positive / false negative reports). JSON Lines, one
# record per correction; exported for the next retraining batch.
FEEDBACK_PATH = Path(os.getenv("SECURENET_FEEDBACK_PATH", BASE_DIR / "data" / "feedback.jsonl"))

# Where the shipped artifacts' training data came from. The bundled models
# were trained on the synthetic corpus from training/build_dataset.py; set
# SECURENET_DATASET=real after retraining with --real.
DATASET_PROVENANCE = os.getenv("SECURENET_DATASET", "synthetic")

# --- API protection -------------------------------------------------------
# Optional shared key. When set, every /api/v1 request must send it in the
# X-SecureNet-Key header. Never commit a real value; use the environment.
API_KEY = os.getenv("SECURENET_API_KEY", "")
# Per-client request budget for /api/v1 (requests per minute). 0 disables.
RATE_LIMIT_PER_MIN = int(os.getenv("SECURENET_RATE_LIMIT", "120"))

SERVICE_NAME = "securenet-ml"
VERSION = "1.1.0"

# Risk bands. The URL threshold is the value tuned on the validation fold
# during training; it is read back from url_metrics.json at load time so the
# service and the reported results can never drift apart.
DEFAULT_URL_THRESHOLD = 0.60
SMS_THRESHOLD = 0.50

LOW_BAND = 0.35
HIGH_BAND = 0.70

# How many SHAP attributions to return per prediction.
TOP_K_EVIDENCE = 8

CORS_ORIGINS = os.getenv(
    "SECURENET_CORS",
    "http://localhost:5173,http://localhost:3000,http://localhost:8080",
).split(",")

# The browser extension calls from a chrome-extension://<id> origin. The id is
# generated when the unpacked extension is loaded, so it cannot be listed
# ahead of time; the scheme is matched by regex instead. Local development
# only -- a deployed service should pin the published extension id here.
CORS_ORIGIN_REGEX = os.getenv(
    "SECURENET_CORS_REGEX", r"chrome-extension://[a-p]{32}|moz-extension://[0-9a-f\-]{36}")


def load_threshold() -> float:
    """Read the tuned decision threshold produced by training."""
    try:
        data = json.loads(URL_METRICS_PATH.read_text())
        return float(data["test"]["threshold"])
    except Exception:
        return DEFAULT_URL_THRESHOLD


def band(score: float) -> str:
    if score >= HIGH_BAND:
        return "HIGH"
    if score >= LOW_BAND:
        return "MEDIUM"
    return "LOW"
