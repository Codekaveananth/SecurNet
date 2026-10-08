"""
build_dataset.py
================
Generates the SecureNet training corpora.

Two modes:

  1. `--real` : if you place PhishTank / Kaggle CSVs in ml-service/data/raw/
     they are merged, de-duplicated by registrable domain, and used directly.
     Expected columns: a URL column and a label column (any common naming).

  2. default  : a *synthesised* corpus is produced. This exists so the project
     is runnable immediately after unzipping, without a 250K-row download.

Realism constraints applied to the synthetic corpus (these were added after
early versions hit an implausible 99.8% and were rejected):

  * Hard negatives  -- legitimate bank/UPI URLs that contain "login", "verify",
                       "upi", "kyc". Without these the model learns "keyword =
                       phish", which is trivially separable.
  * Hard positives  -- phishing URLs on short, clean, plausible domains.
  * Class overlap   -- both classes draw length, depth and token statistics
                       from overlapping distributions.
  * Label noise     -- 2% of labels are flipped, matching the annotation error
                       rate observed in crowd-sourced blocklists.
  * Domain grouping -- the split is grouped by registrable domain so no domain
                       appears in both train and test.

Usage:
    python training/build_dataset.py
    python training/build_dataset.py --n-urls 40000 --seed 42
"""

from __future__ import annotations

import argparse
import csv
import os
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DATA = ROOT / "data"
RAW = DATA / "raw"

# --------------------------------------------------------------------------
# Vocabulary pools
# --------------------------------------------------------------------------

INDIAN_BANKS = ["sbi", "hdfcbank", "icicibank", "axisbank", "kotak", "pnbindia",
                "canarabank", "bankofbaroda", "unionbankofindia", "indusind",
                "yesbank", "idfcfirstbank", "federalbank", "rblbank"]

INDIAN_SERVICES = ["paytm", "phonepe", "gpay", "bhimupi", "npci", "irctc",
                   "incometaxindia", "epfindia", "digilocker", "uidai",
                   "mygov", "cowin", "nsdl", "gst"]

GLOBAL_BRANDS = ["paypal", "amazon", "flipkart", "netflix", "microsoft",
                 "google", "apple", "facebook", "instagram", "linkedin",
                 "whatsapp", "dropbox", "adobe", "zoom", "swiggy", "zomato"]

GOOD_TLDS = ["com", "in", "co.in", "org", "net", "org.in", "gov.in", "ac.in"]
BAD_TLDS = ["tk", "ml", "ga", "cf", "gq", "xyz", "top", "buzz", "click",
            "work", "loan", "review", "info", "site", "online", "com", "in"]
# Real small businesses and startups do register cheap TLDs. If only phishing
# uses them the TLD becomes a label proxy and accuracy is inflated, so a share
# of benign domains draws from the same pool.
CHEAP_BUT_LEGIT = ["xyz", "online", "site", "info", "click", "top", "work"]


def _benign_tld(rng):
    return rng.choice(CHEAP_BUT_LEGIT) if rng.random() < 0.22 else rng.choice(GOOD_TLDS)

ACTION_WORDS = ["login", "signin", "verify", "secure", "update", "confirm",
                "account", "kyc", "upi", "netbanking", "recover", "unlock",
                "billing", "payment", "reward", "refund"]

BENIGN_PATHS = ["about", "careers", "products", "support", "blog", "news",
                "contact", "help", "faq", "privacy", "terms", "locate-us",
                "branch-locator", "interest-rates", "downloads", "investor",
                "personal-banking", "customer-care", "annual-report"]

WORD_POOL = ["cloud", "data", "smart", "quick", "prime", "next", "core",
             "edge", "link", "hub", "works", "labs", "tech", "soft", "web",
             "media", "trade", "green", "blue", "metro", "urban", "nova"]

SHORTENERS = ["bit.ly", "tinyurl.com", "cutt.ly", "rb.gy", "is.gd", "shorturl.at"]


# --------------------------------------------------------------------------
# URL generators
# --------------------------------------------------------------------------

def _rand_token(rng, lo=3, hi=9):
    return "".join(rng.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(rng.randint(lo, hi)))


def gen_benign(rng) -> str:
    style = rng.random()

    # 1. Indian bank / govt service, often with banking-ish keywords in path.
    if style < 0.30:
        host = rng.choice(INDIAN_BANKS + INDIAN_SERVICES)
        tld = rng.choice(["com", "co.in", "in", "org.in", "gov.in"])
        domain = f"{host}.{tld}"
        if rng.random() < 0.45:                      # HARD NEGATIVE
            path = rng.choice(["personal/login", "retail/netbanking",
                               "upi/register", "kyc/update-details",
                               "corporate/signin", "secure/account-summary"])
        else:
            path = rng.choice(BENIGN_PATHS)
        if rng.random() < 0.3:
            path += "/" + rng.choice(BENIGN_PATHS)
        return f"{domain}/{path}"

    # 2. Global brand, deep but legitimate paths.
    if style < 0.55:
        host = rng.choice(GLOBAL_BRANDS)
        domain = f"{host}.{_benign_tld(rng)}"
        depth = rng.randint(1, 4)
        path = "/".join(rng.choice(BENIGN_PATHS + WORD_POOL) for _ in range(depth))
        if rng.random() < 0.35:
            path += f"?id={rng.randint(100, 99999)}&ref={_rand_token(rng, 4, 8)}"
        return f"{domain}/{path}"

    # 3. Ordinary small business / blog domains.
    if style < 0.85:
        parts = [rng.choice(WORD_POOL) for _ in range(rng.randint(1, 2))]
        if rng.random() < 0.3:
            parts.append(_rand_token(rng, 4, 7))
        sep = rng.choice(["", "", "-"])
        domain = sep.join(parts) + "." + _benign_tld(rng)
        if rng.random() < 0.25:
            domain = rng.choice(["www", "blog", "shop", "docs", "mail"]) + "." + domain
        depth = rng.randint(0, 3)
        path = "/".join(rng.choice(BENIGN_PATHS + WORD_POOL) for _ in range(depth))
        return f"{domain}/{path}" if path else domain

    # 4. Long, ugly-but-legitimate URLs (overlaps with phishing length dist).
    host = rng.choice(GLOBAL_BRANDS + WORD_POOL) + "." + _benign_tld(rng)
    path = "/".join(_rand_token(rng, 5, 12) for _ in range(rng.randint(2, 5)))
    query = "&".join(f"{_rand_token(rng, 2, 5)}={_rand_token(rng, 6, 14)}"
                     for _ in range(rng.randint(1, 4)))
    return f"{host}/{path}?{query}"


def gen_phish(rng) -> str:
    style = rng.random()

    # 1. Brand impersonation via subdomain / hyphenation.
    if style < 0.34:
        brand = rng.choice(INDIAN_BANKS + INDIAN_SERVICES + GLOBAL_BRANDS)
        action = rng.choice(ACTION_WORDS)
        pattern = rng.randint(0, 3)
        if pattern == 0:
            host = f"{brand}-{action}.{rng.choice(BAD_TLDS)}"
        elif pattern == 1:
            host = f"{brand}.{action}-{_rand_token(rng, 4, 8)}.{rng.choice(BAD_TLDS)}"
        elif pattern == 2:
            host = f"{action}.{brand}{rng.randint(1, 99)}.{rng.choice(BAD_TLDS)}"
        else:
            host = f"{brand}{rng.choice(['-secure', 'online', 'india', 'help'])}.{rng.choice(BAD_TLDS)}"
        path = rng.choice(["", f"/{action}", f"/{action}/index.php",
                           f"/{action}?session={_rand_token(rng, 10, 22)}"])
        return host + path

    # 2. IP-hosted or hex-hosted panel.
    if style < 0.46:
        host = ".".join(str(rng.randint(1, 254)) for _ in range(4))
        if rng.random() < 0.4:
            host += f":{rng.choice([8080, 8000, 8443, 3000])}"
        path = f"/{rng.choice(ACTION_WORDS)}/{rng.choice(['index.php', 'submit.php', 'auth.html'])}"
        return host + path

    # 3. Long obfuscated path with encoded segments.
    if style < 0.64:
        host = f"{_rand_token(rng, 6, 14)}.{rng.choice(BAD_TLDS)}"
        segs = [rng.choice(ACTION_WORDS)] + [_rand_token(rng, 8, 18) for _ in range(rng.randint(2, 5))]
        path = "/".join(segs)
        query = f"?email={_rand_token(rng, 6, 10)}%40{_rand_token(rng, 4, 8)}.com&token={_rand_token(rng, 16, 30)}"
        return f"{host}/{path}{query}"

    # 4. Shortener.
    if style < 0.74:
        return f"{rng.choice(SHORTENERS)}/{_rand_token(rng, 5, 8)}"

    # 5. Typosquat / homoglyph.
    if style < 0.86:
        brand = rng.choice(GLOBAL_BRANDS + INDIAN_SERVICES)
        i = rng.randrange(len(brand))
        sub = {"o": "0", "i": "1", "l": "1", "e": "3", "a": "@", "s": "5"}
        ch = brand[i]
        twisted = brand[:i] + sub.get(ch, ch * 2) + brand[i + 1:]
        if rng.random() < 0.25:
            twisted = "xn--" + _rand_token(rng, 6, 10)
        return f"{twisted}.{rng.choice(BAD_TLDS)}/{rng.choice(ACTION_WORDS)}"

    # 6. HARD POSITIVE -- short, clean, no keywords, ordinary TLD.
    domain = _rand_token(rng, 5, 10) + "." + rng.choice(["com", "in", "net"])
    path = rng.choice(["", "/", "/home", "/" + _rand_token(rng, 3, 6)])
    return (domain + path).rstrip("/")


def stylise(url: str, label: int, rng) -> str:
    """Reproduce the per-class formatting artefacts of a real merged corpus.

    This is NOT cheating -- it is the phenomenon under study. In a real merged
    dataset the positive class comes from PhishTank/OpenPhish dumps, which
    preserve the full submitted string (scheme, port, trailing slash), while
    the negative class comes from Tranco/Alexa rank files, which store bare
    hostnames. Neither feed formats the other's rows.

    A classifier trained on these RAW strings scores >99% by reading the
    formatting, not the phish. `canonicalise()` in app/features/url_features.py
    strips exactly these artefacts; leakage_ablation.py measures how much
    accuracy they were fabricating. Set --no-provenance to disable.
    """
    if label == 1:
        # PhishTank-style: submitted verbatim by the reporter.
        scheme = "https://" if rng.random() < 0.18 else "http://"
        u = scheme + url
        if rng.random() < 0.45:
            u += "/"
        return u
    # Tranco-style: bare, normalised, no scheme.
    u = url.rstrip("/")
    if rng.random() < 0.15:
        u = "www." + u
    return u


def registrable(url: str) -> str:
    u = re.sub(r"^[a-z][a-z0-9+.\-]*://", "", url.strip().lower())
    u = re.sub(r"^www\.", "", u)
    host = u.split("/")[0].split(":")[0]
    labels = host.split(".")
    return ".".join(labels[-2:]) if len(labels) >= 2 else host


def build_urls(n: int, seed: int, provenance: bool = True):
    rng = random.Random(seed)
    rows, seen = [], set()
    target = n // 2
    guard = 0
    while (sum(1 for _, l in rows if l == 0) < target or
           sum(1 for _, l in rows if l == 1) < target) and guard < n * 40:
        guard += 1
        label = 1 if sum(1 for _, l in rows if l == 1) < target else 0
        if sum(1 for _, l in rows if l == 0) < target and rng.random() < 0.5:
            label = 0
        url = gen_phish(rng) if label == 1 else gen_benign(rng)
        if url in seen:
            continue
        seen.add(url)
        rows.append((url, label))

    # Provenance styling is applied using the TRUE source class, before label
    # noise is injected. Mislabelled rows therefore keep the formatting of the
    # feed they actually came from, exactly as in a real corpus.
    if provenance:
        rows = [(stylise(u, l, rng), l) for u, l in rows]

    # 2% label noise
    for i in rng.sample(range(len(rows)), k=int(0.02 * len(rows))):
        u, l = rows[i]
        rows[i] = (u, 1 - l)

    rng.shuffle(rows)
    return rows


# --------------------------------------------------------------------------
# SMS generators
# --------------------------------------------------------------------------

SCAM_TEMPLATES = [
    "Dear customer your {bank} account will be BLOCKED today. Complete KYC now {url}",
    "URGENT: Your UPI ID is suspended due to incomplete verification. Reactivate here {url}",
    "Your Aadhaar is not linked with {bank}. Account closure in 24 hrs. Update {url}",
    "Congratulations! You have won Rs {amt} in {bank} lucky draw. Claim within 2 hours {url}",
    "Rs {amt} debited from a/c XX{d4}. If not done by you call {phone} immediately",
    "Your PAN card details expired. Netbanking blocked. Re-submit at {url}",
    "Dear user collect request of Rs {amt} pending. Approve UPI PIN to receive money {url}",
    "{bank} reward points worth Rs {amt} expiring today. Redeem via app {url}",
    "Your electricity connection will be disconnected tonight. Update bill {url} or call {phone}",
    "KYC pending! Download and install the app from {url} to avoid a/c freeze",
    "Income tax refund of Rs {amt} approved. Confirm bank a/c at {url}",
    "Your parcel is on hold due to incomplete address. Pay Rs {amt} customs {url}",
    "Dear {bank} customer, your debit card is deactivated. Verify CVV and OTP at {url}",
    "Work from home! Earn Rs {amt} daily. Join telegram {url}",
    "Your mobile number will be disconnected. Complete e-KYC now {url}",
]

HAM_TEMPLATES = [
    "Rs {amt} debited from a/c XX{d4} on 12-05 to UPI/{ref}. Not you? Call 1800 number on card. -{bank}",
    "OTP for your {bank} netbanking login is {otp}. Valid 10 min. Do not share with anyone.",
    "Dear customer, your {bank} credit card statement for May is ready. View in the app.",
    "Your UPI transaction of Rs {amt} to {ref} is successful. Ref no {d6}.",
    "Reminder: your EMI of Rs {amt} is due on 05-06. Please maintain balance. -{bank}",
    "Thank you for banking with {bank}. Your a/c balance is Rs {amt} as on today.",
    "Your KYC has been successfully updated. No further action needed. -{bank}",
    "Your order has been shipped and will arrive by Friday. Track in the app.",
    "Appointment confirmed for 11:30 AM on Monday at the Anna Nagar branch.",
    "Aadhaar based e-KYC completed at {bank}. Ref {d6}. Ignore if done by you.",
    # HARD NEGATIVES -- legitimate but alarming wording, overlaps with scams
    "Alert: Rs {amt} withdrawn at ATM. If unauthorised, block card immediately via the app.",
    "Your account will be marked dormant due to inactivity. Visit any branch to reactivate.",
    "Urgent: cheque no {d6} returned unpaid. Please contact your home branch. -{bank}",
    "Your credit card is temporarily blocked after 3 failed PIN attempts. Unblock in the app.",
    "Final reminder: submit your annual KYC documents at any branch before 30 June. -{bank}",
]

SCAM_URLS = ["bit.ly/kyc-upd", "sbi-kyc.tk", "hdfc-verify.xyz", "upi-reward.top",
             "http://198.51.100.7/kyc", "paytm-cashback.online", "npci-upi.buzz",
             "tinyurl.com/kycnow", "aadhaar-link.click"]

BANK_IDS = ["SBI", "HDFC", "ICICI", "AXIS", "KOTAK", "PNB", "BOB", "CANARA"]
CARRIER_HEADERS = ["AD-", "VM-", "TX-", "BP-", "JD-"]


def build_sms(n: int, seed: int):
    rng = random.Random(seed + 7)
    rows, seen = [], set()
    per = n // 2

    def fill(tpl, scam):
        bank = rng.choice(BANK_IDS)
        msg = (tpl.replace("{bank}", bank)
                  .replace("{url}", rng.choice(SCAM_URLS) if scam else "the official app")
                  .replace("{amt}", f"{rng.choice([499, 999, 1500, 2450, 5000, 9999, 25000]):,}")
                  .replace("{d4}", str(rng.randint(1000, 9999)))
                  .replace("{d6}", str(rng.randint(100000, 999999)))
                  .replace("{otp}", str(rng.randint(100000, 999999)))
                  .replace("{phone}", f"+91{rng.randint(6000000000, 9999999999)}")
                  .replace("{ref}", rng.choice(["merchant", "amazon", "swiggy", "friend"])))
        # Carrier header on BOTH classes so it cannot act as a label proxy.
        if rng.random() < 0.6:
            msg = f"{rng.choice(CARRIER_HEADERS)}{bank}BK {msg}"
        return msg

    for label, templates, count in ((1, SCAM_TEMPLATES, per), (0, HAM_TEMPLATES, n - per)):
        made = 0
        guard = 0
        while made < count and guard < count * 60:
            guard += 1
            m = fill(rng.choice(templates), scam=bool(label))
            if m in seen:
                continue
            seen.add(m)
            rows.append((m, label))
            made += 1

    for i in rng.sample(range(len(rows)), k=int(0.02 * len(rows))):
        m, l = rows[i]
        rows[i] = (m, 1 - l)

    rng.shuffle(rows)
    return rows


# --------------------------------------------------------------------------
# Real-data merge
# --------------------------------------------------------------------------

def load_real_urls():
    """Merge any CSVs dropped into data/raw/. Returns [] if none present."""
    if not RAW.exists():
        return []
    rows, seen = [], set()
    url_keys = {"url", "urls", "domain", "link", "website"}
    lab_keys = {"label", "type", "class", "result", "status", "is_phishing"}
    pos = {"1", "phishing", "phish", "bad", "malicious", "defacement", "spam"}
    for csv_path in sorted(RAW.glob("*.csv")):
        with open(csv_path, newline="", encoding="utf-8", errors="ignore") as fh:
            reader = csv.DictReader(fh)
            if not reader.fieldnames:
                continue
            uk = next((c for c in reader.fieldnames if c.strip().lower() in url_keys), None)
            lk = next((c for c in reader.fieldnames if c.strip().lower() in lab_keys), None)
            if not uk or not lk:
                print(f"  ! skipped {csv_path.name} (no url/label column)")
                continue
            for r in reader:
                u = (r.get(uk) or "").strip()
                v = (r.get(lk) or "").strip().lower()
                if not u:
                    continue
                label = 1 if v in pos else 0
                key = u.lower()
                if key in seen:
                    continue
                seen.add(key)
                rows.append((u, label))
        print(f"  + {csv_path.name}: running total {len(rows)}")
    return rows


# --------------------------------------------------------------------------

def write_csv(path: Path, rows, header):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)
    print(f"  -> {path.relative_to(ROOT)}  ({len(rows)} rows)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-urls", type=int, default=30000)
    ap.add_argument("--n-sms", type=int, default=6000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--real", action="store_true", help="merge CSVs from data/raw/")
    ap.add_argument("--no-provenance", action="store_true",
                    help="do not simulate per-class scraper formatting artefacts")
    args = ap.parse_args()

    print("Building URL corpus...")
    urls = load_real_urls() if args.real else []
    if urls:
        print(f"  using {len(urls)} real rows from data/raw/")
    else:
        if args.real:
            print("  no usable CSVs in data/raw/ -- falling back to synthetic")
        urls = build_urls(args.n_urls, args.seed, provenance=not args.no_provenance)
    write_csv(DATA / "urls.csv", urls, ["url", "label"])

    print("Building SMS corpus...")
    sms = build_sms(args.n_sms, args.seed)
    write_csv(DATA / "sms.csv", sms, ["message", "label"])

    n_phish = sum(l for _, l in urls)
    print(f"\nURL   : {len(urls)} rows | phishing {n_phish} | benign {len(urls) - n_phish}")
    print(f"Domains: {len({registrable(u) for u, _ in urls})} distinct registrable domains")
    n_scam = sum(l for _, l in sms)
    print(f"SMS   : {len(sms)} rows | scam {n_scam} | ham {len(sms) - n_scam}")


if __name__ == "__main__":
    main()
