"""
Normalisation for SMS / UPI scam text.

The same leakage principle applies here. Indian smishing messages carry
carrier-inserted headers (e.g. "AD-HDFCBK", "VM-SBIINB", "-SBI") and 6-digit
transaction references. If those are left in place the classifier memorises
sender IDs instead of the persuasion pattern, so they are normalised to
placeholder tokens before vectorisation.
"""

from __future__ import annotations

import re

HEADER_RE = re.compile(r"\b[A-Z]{2}-[A-Z0-9]{4,8}\b")          # AD-HDFCBK
TRAILER_RE = re.compile(r"-\s?[A-Z]{2,8}\s*$")                  # trailing -SBI
URL_RE = re.compile(
    r"("
    r"https?://\S+"                                        # explicit scheme
    r"|www\.\S+"                                           # www prefix
    r"|\b[a-z0-9][a-z0-9\-]*(?:\.[a-z0-9\-]+)+/\S*"        # domain with a path
    r"|\b[a-z0-9][a-z0-9\-]*(?:\.[a-z0-9\-]+)*\."          # bare known TLD
    r"(?:com|in|net|org|xyz|tk|ml|ga|cf|gq|top|buzz|click|link|"
    r"info|online|site|work|loan|ly|gd|co|app|shop)\b"
    r")",
    re.I,
)
PHONE_RE = re.compile(r"(?<!\d)(?:\+?91[\-\s]?)?[6-9]\d{9}(?!\d)")
AMOUNT_RE = re.compile(r"(?:rs\.?|inr|₹)\s?\d[\d,]*(?:\.\d{1,2})?", re.I)
UPI_ID_RE = re.compile(r"\b[\w.\-]{2,}@(?:ybl|okaxis|oksbi|okhdfcbank|okicici|paytm|upi|apl|ibl)\b", re.I)
OTP_RE = re.compile(r"\b\d{4,8}\b")
MULTISPACE_RE = re.compile(r"\s+")

# Terms that identify Indian financial-fraud framing. Surfaced as explanation
# evidence alongside the TF-IDF coefficients.
INDIA_SCAM_TERMS = [
    "upi", "kyc", "aadhaar", "aadhar", "pan card", "netbanking", "otp",
    "block", "blocked", "suspend", "suspended", "expire", "expired",
    "reward", "cashback", "refund", "lottery", "winner", "prize",
    "verify", "update", "urgent", "immediately", "24 hours", "click",
    "debit", "credit", "deducted", "collect request", "autopay", "mandate",
]


def normalise(text: str) -> str:
    """Lower-case and replace volatile entities with stable placeholders."""
    t = text or ""
    t = HEADER_RE.sub(" SENDERID ", t)
    t = TRAILER_RE.sub(" SENDERID ", t)
    t = URL_RE.sub(" URLTOKEN ", t)
    t = UPI_ID_RE.sub(" UPIID ", t)
    t = PHONE_RE.sub(" PHONENUM ", t)
    t = AMOUNT_RE.sub(" AMOUNTTOK ", t)
    t = t.lower()
    t = OTP_RE.sub(" NUMTOK ", t)
    t = re.sub(r"[^a-z0-9\s]", " ", t)
    t = MULTISPACE_RE.sub(" ", t).strip()
    return t


def contains_url(text: str) -> bool:
    return bool(URL_RE.search(text or ""))


def matched_india_terms(text: str) -> list[str]:
    low = (text or "").lower()
    return [term for term in INDIA_SCAM_TERMS if term in low]
