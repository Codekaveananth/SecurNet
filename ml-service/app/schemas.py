"""Request and response models for the SecureNet ML API."""

from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class UrlRequest(BaseModel):
    url: str = Field(..., min_length=3, max_length=2048,
                     json_schema_extra={"example": "http://sbi-kyc-verify.tk/login"})


class SmsRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000,
                         json_schema_extra={"example":
                             "Dear customer your SBI account will be BLOCKED today. "
                             "Complete KYC now bit.ly/kyc-upd"})


class BatchUrlRequest(BaseModel):
    urls: List[str] = Field(..., max_length=100)


class Evidence(BaseModel):
    """One attribution on the explanation axis."""
    feature: str
    value: float
    contribution: float = Field(..., description="Signed SHAP value; + pushes toward phishing")
    direction: Literal["phishing", "legitimate"]
    description: str


class Indicator(BaseModel):
    """A readable finding. source=model_feature restates a model input;
    source=heuristic is a display-only rule that never affects the score."""
    id: str
    label: str
    severity: Literal["high", "medium", "low"]
    detail: str
    feature: Optional[str] = None
    source: Literal["model_feature", "heuristic"]
    shap: Optional[float] = None


class UrlAnatomy(BaseModel):
    scheme: Optional[str] = None
    userinfo: Optional[str] = None
    host: str
    is_ip: bool
    subdomains: List[str]
    domain: str
    tld: str
    port: Optional[int] = None
    path: str
    query_params: List[str]


class ScamPattern(BaseModel):
    """Keyword-rule topic tag. Not model output."""
    id: str
    label: str
    matched: List[str]


class UrlResponse(BaseModel):
    url: str
    canonical_url: str
    verdict: Literal["PHISHING", "SUSPICIOUS", "LEGITIMATE"]
    risk_band: Literal["LOW", "MEDIUM", "HIGH"]
    score: float
    threshold: float
    base_value: float = Field(..., description="Model expected value; the axis origin")
    evidence: List[Evidence]
    india_signals: List[str]
    latency_ms: float
    model_version: str
    # additive fields (v1.1)
    logit: Optional[float] = None
    other_contribution: Optional[float] = Field(
        None, description="Sum of SHAP values for features outside the top-K evidence list")
    confidence: Optional[float] = Field(
        None, description="Probability of the reported class (uncalibrated)")
    suspicious_band: Optional[float] = None
    features: Optional[Dict[str, float]] = None
    contributions: Optional[Dict[str, float]] = None
    anatomy: Optional[UrlAnatomy] = None
    indicators: List[Indicator] = []


class SmsResponse(BaseModel):
    message: str
    verdict: Literal["SCAM", "SUSPICIOUS", "LEGITIMATE"]
    risk_band: Literal["LOW", "MEDIUM", "HIGH"]
    score: float
    threshold: float
    base_value: float
    evidence: List[Evidence]
    india_signals: List[str]
    contains_url: bool
    embedded_url_verdict: Optional[str] = None
    latency_ms: float
    model_version: str
    # additive fields (v1.1)
    logit: Optional[float] = None
    other_contribution: Optional[float] = None
    confidence: Optional[float] = None
    suspicious_band: Optional[float] = None
    text_verdict: Optional[str] = None
    text_score: Optional[float] = None
    escalated_by_url: bool = False
    embedded_urls: List[UrlResponse] = []
    scam_patterns: List[ScamPattern] = []


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    url_model_loaded: bool
    sms_model_loaded: bool
    url_threshold: float


class FeedbackRequest(BaseModel):
    artefact: str = Field(..., min_length=1, max_length=4000,
                          description="the URL or message that was scanned")
    artefact_type: Literal["url", "sms"]
    predicted_label: int = Field(..., ge=0, le=1)
    correct_label: int = Field(..., ge=0, le=1)
    predicted_verdict: Optional[str] = Field(None, max_length=20)
    score: Optional[float] = Field(None, ge=0, le=1)
    model_version: Optional[str] = Field(None, max_length=64)
    source: Literal["dashboard", "extension"] = "dashboard"
    note: Optional[str] = Field(None, max_length=500)
