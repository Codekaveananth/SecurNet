"""
train_url_model.py
==================
Trains the XGBoost URL classifier.

Methodology enforced here:
  * features are computed on the CANONICALISED url (leakage control)
  * the train/test split is GROUPED BY REGISTRABLE DOMAIN, so no domain that
    appears in training can appear in test -- this is what stops the model
    from memorising "sbi-kyc.tk is bad" and forces it to learn the pattern
  * threshold is tuned on a validation fold, not on test
  * every reported number is written to artifacts/url_metrics.json so it can
    be cited in the report without being re-typed by hand

Usage:
    python training/train_url_model.py
    python training/train_url_model.py --leaky     # ablation configuration
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.features.url_features import (  # noqa: E402
    FEATURE_NAMES, extract_vector, canonicalise,
)

import xgboost as xgb  # noqa: E402
from sklearn.metrics import (  # noqa: E402
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix,
)
from sklearn.model_selection import GroupShuffleSplit  # noqa: E402

DATA = ROOT / "data" / "urls.csv"
ART = ROOT / "artifacts"


def registrable(url: str) -> str:
    host = canonicalise(url).split("/")[0].split(":")[0]
    labels = host.split(".")
    return ".".join(labels[-2:]) if len(labels) >= 2 else host


def featurise(urls, include_leaky: bool):
    return np.asarray(
        [extract_vector(u, include_leaky=include_leaky) for u in urls],
        dtype=np.float32,
    )


def evaluate(y_true, proba, threshold):
    pred = (proba >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, pred, labels=[0, 1]).ravel()
    return {
        "accuracy": float(accuracy_score(y_true, pred)),
        "precision": float(precision_score(y_true, pred, zero_division=0)),
        "recall": float(recall_score(y_true, pred, zero_division=0)),
        "f1": float(f1_score(y_true, pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, proba)),
        "false_positive_rate": float(fp / max(fp + tn, 1)),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "threshold": float(threshold),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--leaky", action="store_true",
                    help="include scraper-provenance features (ablation only)")
    ap.add_argument("--random-split", action="store_true",
                    help="ignore domain grouping (ablation only)")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="url_model.json")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    if not DATA.exists():
        raise SystemExit("data/urls.csv not found -- run training/build_dataset.py first")

    df = pd.read_csv(DATA)
    df = df.dropna(subset=["url", "label"])
    urls = df["url"].astype(str).tolist()
    y = df["label"].astype(int).to_numpy()
    groups = np.array([registrable(u) for u in urls])

    if not args.quiet:
        print(f"Loaded {len(urls)} URLs | {int(y.sum())} phishing | "
              f"{len(np.unique(groups))} distinct domains")
        print(f"Leakage features : {'INCLUDED (ablation)' if args.leaky else 'REMOVED (default)'}")
        print(f"Split strategy   : {'random (ablation)' if args.random_split else 'grouped by domain'}")

    t0 = time.time()
    X = featurise(urls, include_leaky=args.leaky)
    feat_time = time.time() - t0
    if not args.quiet:
        print(f"Featurised in {feat_time:.1f}s "
              f"({1000 * feat_time / len(urls):.3f} ms/url)")

    # ---- split -----------------------------------------------------------
    if args.random_split:
        rng = np.random.RandomState(args.seed)
        idx = rng.permutation(len(y))
        cut1, cut2 = int(0.70 * len(y)), int(0.85 * len(y))
        tr, va, te = idx[:cut1], idx[cut1:cut2], idx[cut2:]
    else:
        gss = GroupShuffleSplit(n_splits=1, test_size=0.30, random_state=args.seed)
        tr, hold = next(gss.split(X, y, groups))
        gss2 = GroupShuffleSplit(n_splits=1, test_size=0.50, random_state=args.seed)
        h_va, h_te = next(gss2.split(X[hold], y[hold], groups[hold]))
        va, te = hold[h_va], hold[h_te]

    if not args.quiet:
        print(f"train {len(tr)} | val {len(va)} | test {len(te)}")
        overlap = set(groups[tr]) & set(groups[te])
        print(f"domain overlap train/test: {len(overlap)}")

    # ---- train -----------------------------------------------------------
    clf = xgb.XGBClassifier(
        n_estimators=400,
        max_depth=6,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=3,
        reg_lambda=1.5,
        reg_alpha=0.2,
        gamma=0.1,
        eval_metric="logloss",
        early_stopping_rounds=40,
        tree_method="hist",
        random_state=args.seed,
        n_jobs=-1,
    )
    t0 = time.time()
    clf.fit(X[tr], y[tr], eval_set=[(X[va], y[va])], verbose=False)
    train_time = time.time() - t0

    # ---- threshold tuned on validation, never on test --------------------
    p_va = clf.predict_proba(X[va])[:, 1]
    grid = np.linspace(0.20, 0.80, 61)
    best_t = max(grid, key=lambda t: f1_score(y[va], (p_va >= t).astype(int), zero_division=0))

    p_te = clf.predict_proba(X[te])[:, 1]
    metrics = evaluate(y[te], p_te, best_t)
    metrics_val = evaluate(y[va], p_va, best_t)

    # ---- inference latency ----------------------------------------------
    sample = urls[:500]
    t0 = time.time()
    for u in sample:
        v = np.asarray([extract_vector(u, include_leaky=args.leaky)], dtype=np.float32)
        clf.predict_proba(v)
    infer_ms = 1000 * (time.time() - t0) / len(sample)

    ART.mkdir(exist_ok=True)
    clf.save_model(ART / args.out)

    imp = clf.get_booster().get_score(importance_type="gain")
    top = sorted(
        ((FEATURE_NAMES[int(k[1:])], round(v, 2)) for k, v in imp.items()),
        key=lambda kv: -kv[1],
    )[:15]

    payload = {
        "config": {
            "leakage_features_included": bool(args.leaky),
            "split": "random" if args.random_split else "grouped_by_registrable_domain",
            "seed": args.seed,
            "n_samples": int(len(y)),
            "n_train": int(len(tr)), "n_val": int(len(va)), "n_test": int(len(te)),
            "n_features": int(X.shape[1]),
            "best_iteration": int(getattr(clf, "best_iteration", 0) or 0),
        },
        "test": metrics,
        "validation": metrics_val,
        "timing": {
            "featurise_ms_per_url": round(1000 * feat_time / len(urls), 4),
            "train_seconds": round(train_time, 2),
            "single_inference_ms": round(infer_ms, 3),
        },
        "top_features_by_gain": top,
    }
    name = "url_metrics_leaky.json" if args.leaky else "url_metrics.json"
    (ART / name).write_text(json.dumps(payload, indent=2))

    if not args.quiet:
        m = metrics
        print("\n--- TEST (held-out domains) ---")
        print(f"accuracy  {m['accuracy']:.4f}")
        print(f"precision {m['precision']:.4f}")
        print(f"recall    {m['recall']:.4f}")
        print(f"f1        {m['f1']:.4f}")
        print(f"roc_auc   {m['roc_auc']:.4f}")
        print(f"fpr       {m['false_positive_rate']:.4f}")
        print(f"threshold {m['threshold']:.3f}")
        print(f"inference {infer_ms:.2f} ms/url")
        print("\nTop features by gain:")
        for k, v in top[:10]:
            print(f"  {k:<26} {v}")
        print(f"\nSaved {ART / args.out} and artifacts/{name}")

    return payload


if __name__ == "__main__":
    main()
