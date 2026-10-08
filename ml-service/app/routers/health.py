"""Health and metrics endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter

from ..config import (
    ABLATION_PATH, DATASET_PROVENANCE, SERVICE_NAME, SMS_METRICS_PATH, URL_METRICS_PATH,
    VERSION,
)
from ..models import sms_model, url_model
from ..schemas import HealthResponse

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok" if (url_model.loaded and sms_model.loaded) else "degraded",
        service=SERVICE_NAME,
        version=VERSION,
        url_model_loaded=url_model.loaded,
        sms_model_loaded=sms_model.loaded,
        url_threshold=round(url_model.threshold, 4),
    )


@router.get("/metrics")
def metrics() -> dict:
    """Return the evaluation metrics written by the training scripts.

    Serving these from disk means every number quoted in the report and the
    paper can be pulled from the running system instead of transcribed.
    """
    out: dict = {}
    for key, path in (("url", URL_METRICS_PATH), ("sms", SMS_METRICS_PATH)):
        try:
            out[key] = json.loads(path.read_text())
        except Exception:
            out[key] = {"error": "metrics file not found; run the training script"}
    try:
        out["leakage_ablation"] = json.loads(ABLATION_PATH.read_text())
    except Exception:
        out["leakage_ablation"] = None
    out["provenance"] = {
        "dataset": DATASET_PROVENANCE,
        "source": "training/build_dataset.py"
                  + (" (synthetic corpus)" if DATASET_PROVENANCE == "synthetic" else " --real"),
        "note": "Metrics are read from ml-service/artifacts/*.json, written by the training scripts.",
    }
    return out
