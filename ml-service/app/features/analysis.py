"""
Display-level analysis that sits beside the models.

Nothing in this module changes a score or a verdict. It explains the input in
human terms:

* ``url_anatomy``   - how the URL decomposes, using the same canonical form and
                      host split the URL model itself sees.
* ``url_indicators``- the model's own boolean / count features re-stated as
                      readable findings (source = "model_feature"), plus one
                      clearly labelled heuristic (brand impersonation) that is
                      NOT a model input.
* ``scam_patterns`` - keyword-rule topic tags for messages (UPI collect, KYC,
                      fake job ...). Also NOT model output; the TF-IDF model
                      decides the verdict.

Keeping these separate from the SHAP evidence is deliberate: the dashboard
must never present a rule as if it were the model's reasoning.
"""

from __future__ import annotations

import re
from typing import Dict, List

from .url_features import (
    INDIA_WORDS, IPV4_RE, SENSITIVE_WORDS, SUSPICIOUS_TLDS, _split_host_path, canonicalise,
)

# --------------------------------------------------------------------------
# URL anatomy
# --------------------------------------------------------------------------


# Multi-part public suffixes common in Indian / global phishing traffic. Used
# for DISPLAY only; the model's own num_subdomains feature keeps the simple
# last-two-labels rule it was trained with (reported separately).
MULTI_SUFFIXES = {
    "co.in", "gov.in", "org.in", "net.in", "ac.in", "edu.in", "res.in", "nic.in",
    "bank.in", "firm.in", "gen.in", "ind.in", "co.uk", "org.uk", "ac.uk", "gov.uk",
    "com.au", "net.au", "org.au", "co.nz", "com.br", "co.jp", "com.sg", "com.my",
}


def url_anatomy(url: str) -> Dict:
    raw = url.strip()
    canon = canonicalise(raw)
    host, rest = _split_host_path(canon)
    userinfo = None
    if "@" in host:
        # Never echo a password embedded in the URL; keep only the user part.
        userinfo, host = host.rsplit("@", 1)
        userinfo = userinfo.split(":", 1)[0] + (":***" if ":" in userinfo else "")
    path = rest.split("?", 1)[0]
    query = rest.split("?", 1)[1] if "?" in rest else ""
    is_ip = bool(IPV4_RE.match(host))
    labels = [h for h in host.split(".") if h]
    n_suffix = 2 if ".".join(labels[-2:]) in MULTI_SUFFIXES else 1
    n_dom = n_suffix + 1
    scheme_m = re.match(r"^([a-zA-Z][a-zA-Z0-9+.\-]*)://", raw)
    port_m = re.search(r":(\d+)(?=/|$)", re.sub(r"^[a-zA-Z][a-zA-Z0-9+.\-]*://", "", raw).split("/", 1)[0])
    return {
        "scheme": scheme_m.group(1).lower() if scheme_m else None,
        "userinfo": userinfo,
        "host": host,
        "is_ip": is_ip,
        "subdomains": labels[:-n_dom] if (len(labels) > n_dom and not is_ip) else [],
        "domain": host if is_ip else (".".join(labels[-n_dom:]) if len(labels) >= n_dom else host),
        "tld": "" if is_ip else ".".join(labels[-n_suffix:]) if len(labels) > 1 else "",
        "port": int(port_m.group(1)) if port_m else None,
        "path": "/" + path if path else "",
        "query_params": [p.split("=", 1)[0] for p in query.split("&") if p] if query else [],
    }


# --------------------------------------------------------------------------
# Brand impersonation heuristic (not a model input)
# --------------------------------------------------------------------------

# brand token -> official registrable domains. Tokens are matched as whole
# tokens, never substrings, so "pan" in "japan" or "axis" in "praxis" cannot
# fire. Ambiguous short tokens are deliberately omitted.
OFFICIAL_DOMAINS: Dict[str, List[str]] = {
    "sbi": ["sbi.co.in", "onlinesbi.sbi", "onlinesbi.com", "sbicard.com", "sbi.bank.in"],
    "onlinesbi": ["onlinesbi.sbi", "onlinesbi.com"],
    "hdfc": ["hdfcbank.com", "hdfc.com", "hdfcbank.bank.in"],
    "hdfcbank": ["hdfcbank.com"],
    "icici": ["icicibank.com", "icicidirect.com", "icici.bank.in"],
    "icicibank": ["icicibank.com"],
    "axisbank": ["axisbank.com", "axis.bank.in"],
    "kotak": ["kotak.com", "kotak.bank.in"],
    "pnb": ["pnbindia.in", "netpnb.com", "pnb.bank.in"],
    "canara": ["canarabank.com", "canarabank.in"],
    "canarabank": ["canarabank.com", "canarabank.in"],
    "yesbank": ["yesbank.in"],
    "indusind": ["indusind.com"],
    "paytm": ["paytm.com", "paytm.in", "paytmbank.com"],
    "phonepe": ["phonepe.com"],
    "gpay": ["google.com"],
    "bhim": ["bhimupi.org.in", "npci.org.in"],
    "npci": ["npci.org.in"],
    "irctc": ["irctc.co.in"],
    "incometax": ["incometax.gov.in", "incometaxindia.gov.in"],
    "uidai": ["uidai.gov.in"],
    "aadhaar": ["uidai.gov.in"],
    "epfo": ["epfindia.gov.in"],
    "digilocker": ["digilocker.gov.in"],
    "paypal": ["paypal.com"],
    "amazon": ["amazon.com", "amazon.in"],
    "netflix": ["netflix.com"],
    "microsoft": ["microsoft.com", "live.com", "office.com"],
    "apple": ["apple.com", "icloud.com"],
    "whatsapp": ["whatsapp.com"],
    "facebook": ["facebook.com"],
    "instagram": ["instagram.com"],
}


def _is_official(host: str, domains: List[str]) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains)


def brand_impersonation(url: str) -> List[Dict]:
    canon = canonicalise(url)
    host, rest = _split_host_path(canon)
    host = host.split("@")[-1]
    # Banks in India are moving to the restricted .bank.in registry; a host
    # there is registry-verified, so it is not reported as impersonation.
    if host.endswith(".bank.in"):
        return []
    host_tokens = set(t for t in re.split(r"[^a-z0-9]+", host) if t)
    path_tokens = set(t for t in re.split(r"[^a-z0-9]+", rest) if t)
    found = []
    for brand, domains in OFFICIAL_DOMAINS.items():
        if _is_official(host, domains):
            continue
        where = "hostname" if brand in host_tokens else ("path" if brand in path_tokens else None)
        if where:
            found.append({"brand": brand, "where": where, "official": domains[0]})
    return found


# --------------------------------------------------------------------------
# Indicators: model features restated + the heuristic above
# --------------------------------------------------------------------------


def url_indicators(url: str, feats: Dict[str, float], contributions: Dict[str, float]) -> List[Dict]:
    canon = canonicalise(url)
    host, _ = _split_host_path(canon)
    host = host.split("@")[-1]
    out: List[Dict] = []

    def add(fid, label, severity, detail, feature=None, source="model_feature"):
        out.append({
            "id": fid, "label": label, "severity": severity, "detail": detail,
            "feature": feature, "source": source,
            "shap": round(contributions[feature], 4) if feature in contributions else None,
        })

    if feats.get("is_ip_host"):
        add("ip_host", "IP address used instead of a domain name", "high",
            f"Host is the raw address {host}.", "is_ip_host")
    if feats.get("is_punycode"):
        add("punycode", "Punycode hostname (possible look-alike characters)", "high",
            "The host contains an xn-- label.", "is_punycode")
    if feats.get("is_hex_host"):
        add("hex_host", "Hex-encoded hostname", "high", "The host is written in hex.", "is_hex_host")
    if feats.get("num_at"):
        add("at_sign", "'@' inside the URL", "high",
            "Text before an '@' can disguise the real destination.", "num_at")
    if feats.get("brand_in_subdomain"):
        add("brand_subdomain", "Bank or wallet name placed in a subdomain", "high",
            "A brand term appears left of the registered domain.", "brand_in_subdomain")
    if feats.get("is_shortener"):
        add("shortener", "URL shortener hides the destination", "medium",
            f"{host} is a known shortening service.", "is_shortener")
    if feats.get("suspicious_tld"):
        tld = host.rsplit(".", 1)[-1]
        add("tld", f"Abuse-prone top-level domain .{tld}", "medium",
            "Low-cost TLDs on the model's watch list: " + ", ".join(sorted(SUSPICIOUS_TLDS)[:6]) + " …",
            "suspicious_tld")
    sens = sorted({w for w in SENSITIVE_WORDS if w in canon})
    if sens:
        add("credential_words", "Credential / account keywords", "medium",
            "Matched: " + ", ".join(sens), "sensitive_word_count")
    india = sorted({w for w in INDIA_WORDS if w in canon})
    if india:
        add("india_words", "Indian banking / UPI / KYC terms", "medium",
            "Matched: " + ", ".join(india), "india_word_count")
    if feats.get("num_subdomains", 0) >= 3:
        add("deep_subdomains", "Unusually deep subdomain chain", "medium",
            f"{int(feats['num_subdomains'])} subdomain levels.", "num_subdomains")
    if feats.get("has_hyphen_in_host"):
        add("hyphen_host", "Hyphenated hostname", "low",
            "Common in look-alike domains, but also in many legitimate sites.", "has_hyphen_in_host")
    if feats.get("num_percent"):
        add("percent", "Percent-encoded characters", "low",
            f"{int(feats['num_percent'])} encoded characters.", "num_percent")
    if feats.get("has_double_slash_in_path"):
        add("double_slash", "Double slash inside the path", "low",
            "Sometimes used for redirect tricks.", "has_double_slash_in_path")

    for b in brand_impersonation(url):
        add(f"brand_{b['brand']}",
            f"Possible impersonation of '{b['brand']}'",
            "high" if b["where"] == "hostname" else "medium",
            f"'{b['brand']}' appears in the {b['where']}, but the host is not an official "
            f"domain such as {b['official']}.",
            source="heuristic")

    order = {"high": 0, "medium": 1, "low": 2}
    out.sort(key=lambda i: order[i["severity"]])
    return out


# --------------------------------------------------------------------------
# Message scam-pattern tags (keyword rules, not model output)
# --------------------------------------------------------------------------

SCAM_PATTERNS = {
    "upi_collect": ("UPI collect / PIN request", [
        "collect request", "approve", "upi pin", "enter pin", "enter your pin",
        "receive money", "request money", "payment request"]),
    "kyc": ("KYC / identity update", [
        "kyc", "pan card", "aadhaar", "aadhar", "re-kyc", "documents expire"]),
    "banking": ("Bank account threat", [
        "blocked", "block", "suspended", "deactivated", "account will be",
        "netbanking", "debit card", "credit card", "a/c"]),
    "otp": ("OTP / verification code", [
        "otp", "one time password", "verification code", "share the code"]),
    "fake_job": ("Job / task offer", [
        "work from home", "part time", "part-time", "daily income", "per day",
        "job offer", "hiring", "salary", "earn rs", "earn ₹", "telegram", "task",
        "youtube like", "like videos"]),
    "payment": ("Payment, refund or prize", [
        "refund", "cashback", "lottery", "prize", "winner", "won", "lucky draw",
        "reward", "claim", "electricity", "bill", "deducted", "debited"]),
    "urgency": ("Urgency / pressure", [
        "urgent", "immediately", "today", "within 24 hours", "24 hours",
        "last chance", "expire", "expired", "act now", "call now", "click"]),
}


def scam_patterns(message: str) -> List[Dict]:
    from .text_clean import URL_RE  # local import avoids a cycle at module load
    # Links are analysed separately by the URL model; matching words inside
    # them here would double-count (e.g. "reward" in upi-reward.top).
    low = URL_RE.sub(" ", (message or "")).lower()
    out = []
    for key, (label, terms) in SCAM_PATTERNS.items():
        hits = [t for t in terms if re.search(r"(?<![a-z])" + re.escape(t) + r"(?![a-z])", low)]
        if hits:
            out.append({"id": key, "label": label, "matched": hits[:6]})
    return out
