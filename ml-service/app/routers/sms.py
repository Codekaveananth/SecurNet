"""SMS / UPI scam scanning endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..features.analysis import scam_patterns
from ..features.text_clean import URL_RE
from ..models import sms_model, url_model
from ..schemas import SmsRequest, SmsResponse

router = APIRouter(prefix="/api/v1", tags=["sms"])


@router.post("/scan/message", response_model=SmsResponse)
def scan_message(req: SmsRequest) -> SmsResponse:
    """Alias for /scan/sms.

    The architecture document names this endpoint /scan/message. The original
    path is kept so nothing already calling it breaks.
    """
    return scan_sms(req)


MAX_EMBEDDED_URLS = 5


@router.post("/scan/sms", response_model=SmsResponse)
def scan_sms(req: SmsRequest) -> SmsResponse:
    try:
        result = sms_model.predict(req.message)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    result["text_verdict"] = result["verdict"]
    result["text_score"] = result["score"]
    result["escalated_by_url"] = False
    result["embedded_urls"] = []
    result["scam_patterns"] = scam_patterns(req.message)

    # Cross-check: every link in the message is also run through the URL
    # model. A benign-looking message carrying a phishing link is the single
    # most common smishing pattern reported to Indian banks.
    #
    # How the link result contributes (this is the whole mechanism, and the
    # dashboard states it verbatim):
    #   1. The text model sees each link only as the placeholder token
    #      "urltoken"; its SHAP attribution is part of the text evidence.
    #   2. If ANY embedded link is scored PHISHING by the URL model and the
    #      text model said LEGITIMATE, the verdict is raised to SUSPICIOUS.
    #      The text score itself is never altered.
    links = []
    for m in URL_RE.finditer(req.message or ""):
        u = m.group(0).rstrip(".,;:!?)]}\"'")
        if u and u not in links:
            links.append(u)
    if links and url_model.loaded:
        for u in links[:MAX_EMBEDDED_URLS]:
            try:
                result["embedded_urls"].append(url_model.predict(u))
            except Exception:
                continue
        if result["embedded_urls"]:
            # Backwards-compatible single field: the first link's verdict.
            result["embedded_url_verdict"] = result["embedded_urls"][0]["verdict"]
            if (any(e["verdict"] == "PHISHING" for e in result["embedded_urls"])
                    and result["verdict"] == "LEGITIMATE"):
                result["verdict"] = "SUSPICIOUS"
                result["risk_band"] = "MEDIUM"
                result["escalated_by_url"] = True

    return SmsResponse(**result)
