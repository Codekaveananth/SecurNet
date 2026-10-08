"""
Integration tests for the SecureNet ML service.

Run:
    pytest -v            (from the ml-service directory)
    python tests/test_api.py    (no pytest required)
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.features.url_features import canonicalise, extract  # noqa: E402
from app.features.text_clean import normalise  # noqa: E402
from app.main import app  # noqa: E402

# The context manager is required: it triggers the FastAPI lifespan hook,
# which is what loads the model artefacts into memory.
client = TestClient(app)
client.__enter__()

PHISHING = [
    "http://sbi-kyc-verify.tk/login",
    "http://198.51.100.23:8080/netbanking/verify.php",
    "http://hdfcbank.secure-update.xyz/account/confirm?token=abcdef123456",
    "paytm-cashback-reward.top/claim",
]

LEGITIMATE = [
    "https://www.sbi.co.in/personal-banking",
    "https://www.hdfcbank.com/personal/borrow/popular-loans",
    "https://www.irctc.co.in/nget/train-search",
    "github.com/features/actions",
]

SCAM_SMS = [
    "Dear customer your SBI account will be BLOCKED today. Complete KYC now bit.ly/kyc-upd",
    "URGENT: Your UPI ID is suspended due to incomplete verification. Reactivate here hdfc-verify.xyz",
    "Congratulations! You have won Rs 25,000 in ICICI lucky draw. Claim within 2 hours upi-reward.top",
]

HAM_SMS = [
    "OTP for your HDFC netbanking login is 448210. Valid 10 min. Do not share with anyone.",
    "Rs 1,299 debited from a/c XX4471 on 12-05 to UPI/swiggy. Ref 883021.",
    "Your KYC has been successfully updated. No further action needed. -SBI",
]


# --------------------------------------------------------------------------
# Unit-level: leakage control
# --------------------------------------------------------------------------

def test_canonicalise_removes_provenance():
    variants = [
        "http://example.com/login/",
        "https://www.example.com:8080/login",
        "example.com/login",
        "HTTP://WWW.EXAMPLE.COM/LOGIN/#frag",
    ]
    canon = {canonicalise(v) for v in variants}
    assert canon == {"example.com/login"}, canon


def test_leaky_features_are_zero_by_default():
    f = extract("https://example.com/login/", include_leaky=False)
    assert f["uses_https"] == 0.0
    assert f["has_trailing_slash"] == 0.0
    g = extract("https://example.com/login/", include_leaky=True)
    assert g["uses_https"] == 1.0
    assert g["has_trailing_slash"] == 1.0


def test_normalise_masks_sender_and_amount():
    n = normalise("AD-HDFCBK Rs 5,000 debited. OTP 448210 call +919876543210")
    assert "hdfcbk" not in n
    assert "448210" not in n
    assert "9876543210" not in n
    assert "amounttok" in n


# --------------------------------------------------------------------------
# API level
# --------------------------------------------------------------------------

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["url_model_loaded"] is True
    assert body["sms_model_loaded"] is True


def test_metrics_endpoint():
    r = client.get("/metrics")
    assert r.status_code == 200
    assert "accuracy" in r.json()["url"]["test"]


def test_url_scan_shape():
    r = client.post("/api/v1/scan/url", json={"url": PHISHING[0]})
    assert r.status_code == 200
    b = r.json()
    for k in ("verdict", "score", "evidence", "base_value", "canonical_url"):
        assert k in b
    assert 0.0 <= b["score"] <= 1.0
    assert len(b["evidence"]) > 0


def test_phishing_scores_higher_than_legitimate():
    def mean_score(urls):
        return sum(client.post("/api/v1/scan/url", json={"url": u}).json()["score"]
                   for u in urls) / len(urls)
    assert mean_score(PHISHING) > mean_score(LEGITIMATE)


def test_evidence_is_additive():
    """SHAP values must reconcile with the score in log-odds space."""
    import math
    r = client.post("/api/v1/scan/url", json={"url": PHISHING[2]}).json()
    logit = math.log(r["score"] / (1 - r["score"]))
    partial = r["base_value"] + sum(e["contribution"] for e in r["evidence"])
    # top-k only, so partial should move in the right direction from base
    assert (partial - r["base_value"]) * (logit - r["base_value"]) > 0


def test_india_signals_detected():
    r = client.post("/api/v1/scan/url", json={"url": "http://sbi-upi-kyc.tk/verify"}).json()
    assert set(r["india_signals"]) >= {"kyc", "sbi", "upi"}


def test_sms_scan_shape():
    r = client.post("/api/v1/scan/sms", json={"message": SCAM_SMS[0]})
    assert r.status_code == 200
    b = r.json()
    assert b["contains_url"] is True
    assert len(b["evidence"]) > 0


def test_scam_sms_scores_higher_than_ham():
    def mean_score(msgs):
        return sum(client.post("/api/v1/scan/sms", json={"message": m}).json()["score"]
                   for m in msgs) / len(msgs)
    assert mean_score(SCAM_SMS) > mean_score(HAM_SMS)


def test_message_alias_matches_sms():
    """The /scan/message alias must return the same result as /scan/sms."""
    a = client.post("/api/v1/scan/sms", json={"message": SCAM_SMS[1]}).json()
    b = client.post("/api/v1/scan/message", json={"message": SCAM_SMS[1]}).json()
    assert a["verdict"] == b["verdict"]
    assert abs(a["score"] - b["score"]) < 1e-9


def test_extension_response_contract():
    """Fields the browser extension validates before trusting a response."""
    r = client.post("/api/v1/scan/url", json={"url": PHISHING[1]}).json()
    assert isinstance(r["verdict"], str)
    assert isinstance(r["score"], float) and 0.0 <= r["score"] <= 1.0
    assert isinstance(r["evidence"], list)
    for e in r["evidence"]:
        assert e["direction"] in ("phishing", "legitimate")
        assert "description" in e


def test_batch_endpoint():
    r = client.post("/api/v1/scan/url/batch", json={"urls": PHISHING + LEGITIMATE})
    assert r.status_code == 200
    assert r.json()["count"] == len(PHISHING) + len(LEGITIMATE)


def test_validation_rejects_empty():
    assert client.post("/api/v1/scan/url", json={"url": ""}).status_code == 422
    assert client.post("/api/v1/scan/sms", json={"message": ""}).status_code == 422


# --------------------------------------------------------------------------

def _run_standalone():
    tests = [(n, f) for n, f in sorted(globals().items())
             if n.startswith("test_") and callable(f)]
    passed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"  PASS  {name}")
            passed += 1
        except Exception as exc:
            print(f"  FAIL  {name}: {type(exc).__name__}: {exc}")
    print(f"\n{passed}/{len(tests)} tests passed")
    return passed == len(tests)


if __name__ == "__main__":
    sys.exit(0 if _run_standalone() else 1)
