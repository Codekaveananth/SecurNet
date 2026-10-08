"""URL scanning endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..models import url_model
from ..schemas import BatchUrlRequest, UrlRequest, UrlResponse

router = APIRouter(prefix="/api/v1", tags=["url"])


@router.post("/scan/url", response_model=UrlResponse)
def scan_url(req: UrlRequest) -> UrlResponse:
    try:
        return UrlResponse(**url_model.predict(req.url))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/scan/url/batch")
def scan_url_batch(req: BatchUrlRequest) -> dict:
    if not req.urls:
        raise HTTPException(status_code=400, detail="urls list is empty")
    try:
        results = url_model.predict_batch(req.urls)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {
        "count": len(results),
        "phishing": sum(r["verdict"] == "PHISHING" for r in results),
        "results": results,
    }
