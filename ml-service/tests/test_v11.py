"""
Tests for the v1.1 additions: full SHAP reconciliation, URL anatomy and
indicators, embedded-link analysis, scam-pattern tags, feedback, rate
limiting, API key, and error handling. Existing behaviour is covered by
test_api.py and must keep passing unchanged.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

import app.main as main_mod  # noqa: E402
import app.routers.feedback as feedback_mod  # noqa: E402
from app.features.analysis import brand_impersonation, scam_patterns, url_anatomy  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)
client.__enter__()


def _sigmoid(x):
    return 1 / (1 + math.exp(-x))


# --- SHAP reconciliation ------------------------------------------------------

def test_url_shap_reconciles_with_score():
    for u in ["http://sbi-kyc-verify.tk/netbanking/login.php",
              "https://www.hdfcbank.com/personal/borrow/popular-loans",
              "http://198.51.100.23:8080/upi/verify.php"]:
        r = client.post("/api/v1/scan/url", json={"url": u}).json()
        shown = sum(e["contribution"] for e in r["evidence"])
        total = r["base_value"] + shown + r["other_contribution"]
        assert abs(total - r["logit"]) < 1e-3
        assert abs(_sigmoid(r["logit"]) - r["score"]) < 1e-3
        # the full decomposition also reconciles
        assert abs(r["base_value"] + sum(r["contributions"].values()) - r["logit"]) < 5e-3


def test_sms_shap_reconciles_with_score():
    r = client.post("/api/v1/scan/sms", json={
        "message": "Dear customer your SBI account will be BLOCKED today. Complete KYC now bit.ly/kyc-upd"}).json()
    total = r["base_value"] + sum(e["contribution"] for e in r["evidence"]) + r["other_contribution"]
    assert abs(total - r["logit"]) < 1e-3
    assert abs(_sigmoid(r["logit"]) - r["text_score"]) < 1e-3


def test_leaky_features_never_reported():
    r = client.post("/api/v1/scan/url", json={"url": "https://example.com/"}).json()
    for k in ["has_scheme_prefix", "uses_https", "has_trailing_slash", "raw_length"]:
        assert k not in r["features"] and k not in r["contributions"]


# --- URL anatomy and indicators ----------------------------------------------

def test_anatomy_ip_and_port():
    a = url_anatomy("http://198.51.100.23:8080/upi/verify.php")
    assert a["is_ip"] and a["port"] == 8080 and a["subdomains"] == [] and a["tld"] == ""


def test_anatomy_multipart_suffix_and_userinfo_redacted():
    a = url_anatomy("https://user:hunter2@login.sbi.co.in.evil.xyz/x")
    assert a["userinfo"] == "user:***"
    assert "hunter2" not in json.dumps(a)
    assert url_anatomy("https://www.sbi.co.in/x")["domain"] == "sbi.co.in"


def test_indicators_label_their_source():
    r = client.post("/api/v1/scan/url",
                    json={"url": "http://sbi-kyc-verify.tk/netbanking/login.php"}).json()
    ids = {i["id"]: i for i in r["indicators"]}
    assert ids["tld"]["source"] == "model_feature" and ids["tld"]["shap"] is not None
    assert ids["brand_sbi"]["source"] == "heuristic" and ids["brand_sbi"]["shap"] is None


def test_brand_heuristic_respects_official_domains():
    assert brand_impersonation("https://www.sbi.co.in/login") == []
    assert brand_impersonation("https://www.onlinesbi.sbi/") == []
    assert brand_impersonation("https://sbi.bank.in/") == []
    assert brand_impersonation("https://www.japan-travel.com/") == []   # no substring hits
    assert brand_impersonation("http://paytm-cashback.top/claim")[0]["brand"] == "paytm"


def test_heuristics_do_not_change_verdict():
    """The brand heuristic must not alter the score: compare against the raw model."""
    from app.models import url_model
    u = "http://sbi-kyc-verify.tk/netbanking/login.php"
    api = client.post("/api/v1/scan/url", json={"url": u}).json()
    import numpy as np
    from app.features.url_features import extract_vector
    p = float(url_model.booster.predict_proba(np.asarray([extract_vector(u)], dtype=np.float32))[0, 1])
    assert abs(api["score"] - round(p, 4)) < 1e-4


# --- Messages: embedded URLs and patterns -------------------------------------

def test_all_embedded_urls_are_scanned():
    msg = "Verify KYC at http://sbi-kyc-verify.tk/login or www.hdfcbank.com today"
    r = client.post("/api/v1/scan/sms", json={"message": msg}).json()
    assert len(r["embedded_urls"]) == 2
    assert r["embedded_url_verdict"] == r["embedded_urls"][0]["verdict"]
    assert all("anatomy" in e for e in r["embedded_urls"])


def test_escalation_rule_is_reported():
    r = client.post("/api/v1/scan/sms", json={
        "message": "Hi, photos from the trip are here http://198.51.100.23:8080/upi/verify.php"}).json()
    if r["text_verdict"] == "LEGITIMATE" and any(e["verdict"] == "PHISHING" for e in r["embedded_urls"]):
        assert r["escalated_by_url"] and r["verdict"] == "SUSPICIOUS"
    else:
        assert r["escalated_by_url"] is False
    assert r["text_score"] == r["score"]   # escalation never alters the score


def test_scam_patterns():
    tags = {t["id"] for t in scam_patterns(
        "Earn Rs 3000 per day, part time work from home. Join Telegram")}
    assert "fake_job" in tags
    tags = {t["id"] for t in scam_patterns(
        "Collect request of Rs 4,999 pending. Approve with UPI PIN upi-reward.top")}
    assert "upi_collect" in tags and "payment" not in tags   # 'reward' inside the link is ignored


# --- Feedback ---------------------------------------------------------------

def test_feedback_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(feedback_mod, "FEEDBACK_PATH", tmp_path / "fb.jsonl")
    r = client.post("/api/v1/feedback", json={
        "artefact": "https://example.com", "artefact_type": "url",
        "predicted_label": 1, "correct_label": 0, "source": "extension"})
    assert r.status_code == 201 and r.json()["kind"] == "false_positive"
    s = client.get("/api/v1/feedback/summary").json()
    assert s["total"] == 1 and s["by_kind"]["false_positive"] == 1
    assert "example.com" not in json.dumps(s)          # summary never echoes artefacts


def test_feedback_validation():
    r = client.post("/api/v1/feedback", json={
        "artefact": "x", "artefact_type": "url", "predicted_label": 5, "correct_label": 0})
    assert r.status_code == 422


# --- Hardening --------------------------------------------------------------

def test_rate_limit(monkeypatch):
    monkeypatch.setattr(main_mod, "RATE_LIMIT_PER_MIN", 3)
    main_mod._hits.clear()
    codes = [client.post("/api/v1/scan/url", json={"url": "example.com"}).status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and codes[3] == 429
    main_mod._hits.clear()


def test_health_is_not_rate_limited(monkeypatch):
    monkeypatch.setattr(main_mod, "RATE_LIMIT_PER_MIN", 1)
    main_mod._hits.clear()
    assert all(client.get("/health").status_code == 200 for _ in range(5))
    main_mod._hits.clear()


def test_api_key_enforced_when_configured(monkeypatch):
    monkeypatch.setattr(main_mod, "API_KEY", "k3y")
    assert client.post("/api/v1/scan/url", json={"url": "example.com"}).status_code == 401
    assert client.post("/api/v1/scan/url", json={"url": "example.com"},
                       headers={"X-SecureNet-Key": "k3y"}).status_code == 200


def test_metrics_include_provenance_and_ablation():
    m = client.get("/metrics").json()
    assert m["provenance"]["dataset"] in ("synthetic", "real")
    assert "configurations" in m["leakage_ablation"]


def test_security_headers():
    r = client.get("/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"


def test_internal_errors_do_not_leak(monkeypatch):
    from app.models import url_model

    def boom(_):
        raise ValueError("C:/secret/path/model.json corrupted")
    monkeypatch.setattr(url_model, "predict", boom)
    c = TestClient(app, raise_server_exceptions=False)
    r = c.post("/api/v1/scan/url", json={"url": "example.com"})
    assert r.status_code == 500 and "secret" not in r.text and "ValueError" not in r.text
