"""
URL classifier wrapper with SHAP explanations.

SHAP TreeExplainer is exact for tree ensembles, so the attributions returned
here are the model's actual decision decomposition, not a sampled estimate.
The values are in log-odds space and sum to (log-odds of score) - base_value,
which is the property the frontend evidence ledger relies on: the bars are
additive and always reconcile with the final score.
"""

from __future__ import annotations

import threading
import time
from typing import Dict, List

import numpy as np
import shap
import xgboost as xgb

from ..config import (
    TOP_K_EVIDENCE, URL_MODEL_PATH, band, load_threshold,
)
from ..features.analysis import url_anatomy, url_indicators
from ..features.url_features import (
    BASE_FEATURES, FEATURE_NAMES, INDIA_WORDS, canonicalise, extract,
    extract_vector,
)

_lock = threading.Lock()


HUMAN = {
    "url_length": "Overall URL length",
    "host_length": "Hostname length",
    "path_length": "Path length",
    "num_dots": "Number of dots",
    "num_hyphens": "Number of hyphens",
    "num_digits": "Digit count",
    "num_subdomains": "Subdomain depth",
    "num_slashes": "Path depth",
    "num_at": "'@' characters in URL",
    "num_question": "Query separators",
    "num_equals": "Query parameters",
    "num_percent": "Percent-encoded characters",
    "num_ampersand": "Chained query parameters",
    "num_underscore": "Underscores",
    "num_tilde": "Tilde characters",
    "digit_ratio": "Proportion of digits",
    "letter_ratio": "Proportion of letters",
    "special_ratio": "Proportion of special characters",
    "host_entropy": "Randomness of the hostname",
    "path_entropy": "Randomness of the path",
    "is_ip_host": "Raw IP address used instead of a domain",
    "is_hex_host": "Hex-encoded hostname",
    "is_punycode": "Punycode / homoglyph domain",
    "is_shortener": "Known URL shortening service",
    "suspicious_tld": "Low-cost or abuse-prone TLD",
    "tld_length": "TLD length",
    "longest_token_len": "Longest unbroken token",
    "avg_token_len": "Average token length",
    "num_tokens": "Token count",
    "sensitive_word_count": "Credential-related keywords",
    "india_word_count": "Indian banking / UPI / KYC terms",
    "has_double_slash_in_path": "Double slash inside path",
    "has_hyphen_in_host": "Hyphenated hostname",
    "brand_in_subdomain": "Bank or wallet brand placed in a subdomain",
    "vowel_ratio_host": "Vowel ratio of hostname",
    "has_scheme_prefix": "Scheme present in raw string",
    "uses_https": "HTTPS scheme",
    "has_trailing_slash": "Trailing slash",
    "has_explicit_port": "Explicit port number",
    "has_query_string": "Query string present",
    "raw_length": "Raw string length",
}


class UrlModel:
    def __init__(self) -> None:
        self.booster: xgb.XGBClassifier | None = None
        self.explainer = None
        self.threshold = load_threshold()
        self.loaded = False

    def load(self) -> None:
        if not URL_MODEL_PATH.exists():
            print(f"[url_model] artifact missing: {URL_MODEL_PATH}")
            print("[url_model] run: python training/train_url_model.py")
            return
        clf = xgb.XGBClassifier()
        clf.load_model(URL_MODEL_PATH)
        self.booster = clf
        self.explainer = shap.TreeExplainer(clf)
        self.threshold = load_threshold()
        self.loaded = True
        print(f"[url_model] loaded (threshold={self.threshold:.3f})")

    # ------------------------------------------------------------------
    def predict(self, url: str) -> Dict:
        if not self.loaded:
            raise RuntimeError("URL model is not loaded. Run training first.")

        t0 = time.perf_counter()
        canon = canonicalise(url)
        feats = extract(url, include_leaky=False)
        vec = np.asarray([extract_vector(url, include_leaky=False)], dtype=np.float32)

        with _lock:
            score = float(self.booster.predict_proba(vec)[0, 1])
            sv = self.explainer.shap_values(vec)
            base = float(np.ravel(self.explainer.expected_value)[0])

        contribs = np.ravel(np.asarray(sv))

        # Only report features that are actually in play (leaky slots are
        # zeroed in the deployed configuration and must never be surfaced).
        ranked = sorted(
            (
                (FEATURE_NAMES[i], float(contribs[i]))
                for i in range(len(FEATURE_NAMES))
                if FEATURE_NAMES[i] in BASE_FEATURES and abs(contribs[i]) > 1e-6
            ),
            key=lambda kv: -abs(kv[1]),
        )[:TOP_K_EVIDENCE]

        evidence = [
            {
                "feature": name,
                "value": round(float(feats[name]), 4),
                "contribution": round(c, 4),
                "direction": "phishing" if c > 0 else "legitimate",
                "description": HUMAN.get(name, name.replace("_", " ")),
            }
            for name, c in ranked
        ]

        low = canon.lower()
        india = sorted({w for w in INDIA_WORDS if w in low})

        if score >= self.threshold:
            verdict = "PHISHING"
        elif score >= 0.35:
            verdict = "SUSPICIOUS"
        else:
            verdict = "LEGITIMATE"

        # Full additive decomposition. base + sum(all contributions) equals the
        # model's log-odds, so the dashboard can show the top-K bars plus one
        # "all other features" bar that reconciles exactly with the score.
        all_contrib = {FEATURE_NAMES[i]: float(contribs[i]) for i in range(len(FEATURE_NAMES))}
        logit = base + float(np.sum(contribs))
        shown = sum(e["contribution"] for e in evidence)
        base_contrib = {k: round(v, 4) for k, v in all_contrib.items() if k in BASE_FEATURES}

        return {
            "url": url,
            "canonical_url": canon,
            "verdict": verdict,
            "risk_band": band(score),
            "score": round(score, 4),
            "threshold": round(self.threshold, 4),
            "base_value": round(base, 4),
            "evidence": evidence,
            "india_signals": india,
            "latency_ms": round(1000 * (time.perf_counter() - t0), 3),
            "model_version": "xgboost-url-1.0.0",
            # --- additive fields (v1.1) -----------------------------------
            "logit": round(logit, 4),
            "other_contribution": round(logit - base - shown, 4),
            "confidence": round(score if verdict != "LEGITIMATE" else 1.0 - score, 4),
            "suspicious_band": 0.35,
            "features": {k: round(float(feats[k]), 4) for k in BASE_FEATURES},
            "contributions": base_contrib,
            "anatomy": url_anatomy(url),
            "indicators": url_indicators(url, feats, base_contrib),
        }

    def predict_batch(self, urls: List[str]) -> List[Dict]:
        return [self.predict(u) for u in urls]


url_model = UrlModel()
