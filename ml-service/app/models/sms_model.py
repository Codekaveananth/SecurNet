"""
SMS / UPI scam classifier wrapper.

For a linear model the exact SHAP value of feature i is
    phi_i = coef_i * (x_i - E[x_i])
so the token attributions returned here are exact, cheap, and reconcile with
the decision function the same way the URL model's TreeExplainer values do.
That keeps one explanation contract across both scanners, which is what lets
the frontend render a single evidence-ledger component for either artefact.
"""

from __future__ import annotations

import threading
import time
from typing import Dict, List

import joblib
import numpy as np

from ..config import SMS_MODEL_PATH, SMS_THRESHOLD, TOP_K_EVIDENCE, band
from ..features.text_clean import contains_url, matched_india_terms, normalise

_lock = threading.Lock()

PLACEHOLDER_LABEL = {
    "urltoken": "Embedded link",
    "upiid": "UPI handle",
    "phonenum": "Phone number",
    "amounttok": "Rupee amount",
    "numtok": "Numeric code / OTP",
    "senderid": "Sender header",
}


class SmsModel:
    def __init__(self) -> None:
        self.pipe = None
        self.mean_ = None
        self.loaded = False
        self.threshold = SMS_THRESHOLD

    def load(self) -> None:
        if not SMS_MODEL_PATH.exists():
            print(f"[sms_model] artifact missing: {SMS_MODEL_PATH}")
            print("[sms_model] run: python training/train_sms_model.py")
            return
        self.pipe = joblib.load(SMS_MODEL_PATH)
        self.loaded = True
        print("[sms_model] loaded")

    # ------------------------------------------------------------------
    def _feature_names(self) -> np.ndarray:
        union = self.pipe.named_steps["features"]
        names: List[str] = []
        for _, vec in union.transformer_list:
            names.extend(vec.get_feature_names_out().tolist())
        return np.asarray(names)

    def predict(self, message: str) -> Dict:
        if not self.loaded:
            raise RuntimeError("SMS model is not loaded. Run training first.")

        t0 = time.perf_counter()
        norm = normalise(message)

        with _lock:
            score = float(self.pipe.predict_proba([norm])[0, 1])
            X = self.pipe.named_steps["features"].transform([norm])
            clf = self.pipe.named_steps["clf"]
            names = self._feature_names()

        coef = clf.coef_.ravel()
        base = float(clf.intercept_[0])

        Xc = X.tocoo()
        contributions = [(int(j), float(v * coef[j])) for j, v in zip(Xc.col, Xc.data)]
        contributions.sort(key=lambda kv: -abs(kv[1]))

        evidence, seen = [], set()
        for j, c in contributions:
            if len(evidence) >= TOP_K_EVIDENCE:
                break
            token = str(names[j]).strip()
            if not token or token in seen or len(token) < 3:
                continue
            # char n-grams are noisy to display; prefer whole words
            if token.count(" ") == 0 and not token.isalpha() and "num" not in token:
                continue
            seen.add(token)
            evidence.append({
                "feature": token,
                "value": round(float(X[0, j]), 4),
                "contribution": round(c, 4),
                "direction": "phishing" if c > 0 else "legitimate",
                "description": PLACEHOLDER_LABEL.get(token, f"Term \u201c{token}\u201d"),
            })

        if score >= self.threshold:
            verdict = "SCAM"
        elif score >= 0.35:
            verdict = "SUSPICIOUS"
        else:
            verdict = "LEGITIMATE"

        logit = base + float(sum(c for _, c in contributions))
        shown = sum(e["contribution"] for e in evidence)

        return {
            "message": message,
            "verdict": verdict,
            "risk_band": band(score),
            "score": round(score, 4),
            "threshold": self.threshold,
            "base_value": round(base, 4),
            "evidence": evidence,
            "india_signals": matched_india_terms(message),
            "contains_url": contains_url(message),
            "embedded_url_verdict": None,
            "latency_ms": round(1000 * (time.perf_counter() - t0), 3),
            "model_version": "tfidf-lr-sms-1.0.0",
            # --- additive fields (v1.1) -----------------------------------
            "logit": round(logit, 4),
            "other_contribution": round(logit - base - shown, 4),
            "confidence": round(score if verdict != "LEGITIMATE" else 1.0 - score, 4),
            "suspicious_band": 0.35,
        }


sms_model = SmsModel()
