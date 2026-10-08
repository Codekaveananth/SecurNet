"""
Lexical feature extraction for URL classification.

Design note (important for the viva):
--------------------------------------
Public phishing corpora are assembled by different scrapers for the positive
and negative classes. PhishTank dumps preserve the full submitted string
(scheme, port, tracking query, trailing slash); benign lists such as Alexa /
Tranco are stored as bare registrable domains. A model trained on the raw
strings therefore learns the *scraper*, not the *phish* -- accuracy climbs
above 99% and collapses in deployment.

`canonicalise()` removes those provenance artefacts. Every feature below is
computed on the canonical form. `LEAKY_FEATURES` lists the attributes that act
as scraper proxies; `extract()` can emit them so the leakage ablation
(Table IV) can quantify exactly how much accuracy they were fabricating.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Dict, List
from urllib.parse import urlparse

# --------------------------------------------------------------------------
# Vocabulary
# --------------------------------------------------------------------------

SENSITIVE_WORDS = [
    "login", "signin", "verify", "verification", "secure", "account",
    "update", "confirm", "password", "banking", "webscr", "ebayisapi",
    "suspend", "unlock", "recover", "billing", "invoice", "payment",
]

# India-specific lexicon -- the differentiating contribution of SecureNet.
INDIA_WORDS = [
    "upi", "aadhaar", "aadhar", "kyc", "netbanking", "imps", "neft", "rtgs",
    "paytm", "phonepe", "gpay", "bhim", "rupay", "npci", "pan", "epfo",
    "sbi", "hdfc", "icici", "axis", "kotak", "pnb", "boi", "canara",
    "yesbank", "indusind", "irctc", "incometax", "cowin", "digilocker",
]

SHORTENERS = {
    "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly",
    "cutt.ly", "rebrand.ly", "shorturl.at", "rb.gy", "tiny.cc", "bitly.com",
}

SUSPICIOUS_TLDS = {
    "tk", "ml", "ga", "cf", "gq", "xyz", "top", "buzz", "click", "work",
    "support", "loan", "zip", "review", "country", "kim", "science", "party",
}

IPV4_RE = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$")
HEX_HOST_RE = re.compile(r"^0x[0-9a-f]+$", re.I)
PUNYCODE_RE = re.compile(r"xn--", re.I)

# Features that encode scraper provenance rather than phishing behaviour.
LEAKY_FEATURES = [
    "has_scheme_prefix",
    "uses_https",
    "has_trailing_slash",
    "has_explicit_port",
    "has_query_string",
    "raw_length",
]

BASE_FEATURES = [
    "url_length", "host_length", "path_length",
    "num_dots", "num_hyphens", "num_digits", "num_subdomains",
    "num_slashes", "num_at", "num_question", "num_equals",
    "num_percent", "num_ampersand", "num_underscore", "num_tilde",
    "digit_ratio", "letter_ratio", "special_ratio",
    "host_entropy", "path_entropy",
    "is_ip_host", "is_hex_host", "is_punycode", "is_shortener",
    "suspicious_tld", "tld_length",
    "longest_token_len", "avg_token_len", "num_tokens",
    "sensitive_word_count", "india_word_count",
    "has_double_slash_in_path", "has_hyphen_in_host",
    "brand_in_subdomain", "vowel_ratio_host",
]

FEATURE_NAMES: List[str] = BASE_FEATURES + LEAKY_FEATURES


# --------------------------------------------------------------------------
# Canonicalisation -- the leakage control
# --------------------------------------------------------------------------

def canonicalise(url: str) -> str:
    """Strip scraper-provenance artefacts so both classes look alike."""
    u = url.strip().strip('"').strip("'").lower()
    u = re.sub(r"^[a-z][a-z0-9+.\-]*://", "", u)   # drop scheme
    u = re.sub(r"^www\.", "", u)                    # drop www.
    u = re.sub(r":\d+(?=/|$)", "", u)               # drop explicit port
    u = u.split("#", 1)[0]                          # drop fragment
    u = u.rstrip("/")                               # drop trailing slash
    return u


def _entropy(s: str) -> float:
    if not s:
        return 0.0
    counts = Counter(s)
    n = len(s)
    return -sum((c / n) * math.log2(c / n) for c in counts.values())


def _split_host_path(canon: str):
    parts = canon.split("/", 1)
    host = parts[0]
    rest = parts[1] if len(parts) > 1 else ""
    return host, rest


# --------------------------------------------------------------------------
# Feature extraction
# --------------------------------------------------------------------------

def extract(url: str, include_leaky: bool = False) -> Dict[str, float]:
    """Return the feature dictionary for a single URL.

    include_leaky=False  -> the deployed configuration (leakage controlled)
    include_leaky=True   -> ablation configuration, reproduces the inflated
                            >99% accuracy reported by naive pipelines
    """
    raw = url.strip()
    canon = canonicalise(raw)
    host, rest = _split_host_path(canon)
    path = rest.split("?", 1)[0]
    query = rest.split("?", 1)[1] if "?" in rest else ""

    host_labels = [h for h in host.split(".") if h]
    tld = host_labels[-1] if len(host_labels) > 1 else ""
    tokens = [t for t in re.split(r"[^a-z0-9]+", canon) if t]

    n = max(len(canon), 1)
    digits = sum(c.isdigit() for c in canon)
    letters = sum(c.isalpha() for c in canon)
    specials = n - digits - letters
    vowels = sum(c in "aeiou" for c in host)

    f: Dict[str, float] = {
        "url_length": len(canon),
        "host_length": len(host),
        "path_length": len(path),
        "num_dots": canon.count("."),
        "num_hyphens": canon.count("-"),
        "num_digits": digits,
        "num_subdomains": max(len(host_labels) - 2, 0),
        "num_slashes": canon.count("/"),
        "num_at": canon.count("@"),
        "num_question": canon.count("?"),
        "num_equals": canon.count("="),
        "num_percent": canon.count("%"),
        "num_ampersand": canon.count("&"),
        "num_underscore": canon.count("_"),
        "num_tilde": canon.count("~"),
        "digit_ratio": digits / n,
        "letter_ratio": letters / n,
        "special_ratio": specials / n,
        "host_entropy": _entropy(host),
        "path_entropy": _entropy(path),
        "is_ip_host": float(bool(IPV4_RE.match(host))),
        "is_hex_host": float(bool(HEX_HOST_RE.match(host.split(".")[0]))),
        "is_punycode": float(bool(PUNYCODE_RE.search(host))),
        "is_shortener": float(host in SHORTENERS),
        "suspicious_tld": float(tld in SUSPICIOUS_TLDS),
        "tld_length": len(tld),
        "longest_token_len": max((len(t) for t in tokens), default=0),
        "avg_token_len": (sum(len(t) for t in tokens) / len(tokens)) if tokens else 0.0,
        "num_tokens": len(tokens),
        "sensitive_word_count": sum(w in canon for w in SENSITIVE_WORDS),
        "india_word_count": sum(w in canon for w in INDIA_WORDS),
        "has_double_slash_in_path": float("//" in path),
        "has_hyphen_in_host": float("-" in host),
        "brand_in_subdomain": float(
            any(w in ".".join(host_labels[:-2]) for w in INDIA_WORDS)
            if len(host_labels) > 2 else False
        ),
        "vowel_ratio_host": vowels / max(len(host), 1),
    }

    if include_leaky:
        parsed = urlparse(raw if "://" in raw else "http://" + raw)
        f.update({
            "has_scheme_prefix": float("://" in raw),
            "uses_https": float(raw.lower().startswith("https")),
            "has_trailing_slash": float(raw.rstrip().endswith("/")),
            "has_explicit_port": float(bool(re.search(r":\d+(?=/|$)", raw))),
            "has_query_string": float(bool(query or parsed.query)),
            "raw_length": float(len(raw)),
        })
    else:
        for k in LEAKY_FEATURES:
            f[k] = 0.0

    return f


def extract_vector(url: str, include_leaky: bool = False) -> List[float]:
    f = extract(url, include_leaky=include_leaky)
    return [float(f[name]) for name in FEATURE_NAMES]


def active_feature_names(include_leaky: bool = False) -> List[str]:
    return FEATURE_NAMES if include_leaky else BASE_FEATURES
