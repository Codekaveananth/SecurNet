"""
train_sms_model.py
==================
Trains the SMS / UPI scam classifier.

TF-IDF (word 1-2 grams + char 3-5 grams) into calibrated Logistic Regression.
Logistic regression is chosen deliberately: its coefficients are directly
interpretable, so the explanation shown to the user is the actual decision
function rather than a post-hoc approximation.

Normalisation (app/features/text_clean.py) replaces sender IDs, URLs, amounts,
phone numbers and OTP digits with placeholder tokens so the model cannot
memorise carrier headers as a label proxy.

Usage:
    python training/train_sms_model.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.features.text_clean import normalise  # noqa: E402

from sklearn.feature_extraction.text import TfidfVectorizer  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import (  # noqa: E402
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix,
)
from sklearn.model_selection import train_test_split, cross_val_score  # noqa: E402
from sklearn.pipeline import FeatureUnion, Pipeline  # noqa: E402

DATA = ROOT / "data" / "sms.csv"
ART = ROOT / "artifacts"


def build_pipeline() -> Pipeline:
    return Pipeline([
        ("features", FeatureUnion([
            ("word", TfidfVectorizer(
                analyzer="word", ngram_range=(1, 2),
                min_df=2, max_df=0.9, sublinear_tf=True, max_features=20000,
            )),
            ("char", TfidfVectorizer(
                analyzer="char_wb", ngram_range=(3, 5),
                min_df=3, sublinear_tf=True, max_features=30000,
            )),
        ])),
        ("clf", LogisticRegression(
            C=4.0, max_iter=2000, class_weight="balanced", solver="liblinear",
        )),
    ])


def main():
    if not DATA.exists():
        raise SystemExit("data/sms.csv not found -- run training/build_dataset.py first")

    df = pd.read_csv(DATA).dropna(subset=["message", "label"])
    texts = [normalise(m) for m in df["message"].astype(str)]
    y = df["label"].astype(int).to_numpy()
    print(f"Loaded {len(texts)} messages | {int(y.sum())} scam | {len(y) - int(y.sum())} ham")

    X_tr, X_te, y_tr, y_te = train_test_split(
        texts, y, test_size=0.25, random_state=42, stratify=y
    )

    pipe = build_pipeline()
    t0 = time.time()
    pipe.fit(X_tr, y_tr)
    train_time = time.time() - t0

    proba = pipe.predict_proba(X_te)[:, 1]
    pred = (proba >= 0.5).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_te, pred, labels=[0, 1]).ravel()

    cv = cross_val_score(build_pipeline(), texts, y, cv=5, scoring="f1", n_jobs=-1)

    t0 = time.time()
    for m in X_te[:300]:
        pipe.predict_proba([m])
    infer_ms = 1000 * (time.time() - t0) / 300

    metrics = {
        "config": {
            "n_samples": int(len(y)),
            "n_train": int(len(X_tr)),
            "n_test": int(len(X_te)),
            "vectoriser": "word(1,2) + char_wb(3,5) TF-IDF",
            "classifier": "LogisticRegression(C=4.0, balanced)",
            "n_features": int(pipe.named_steps["features"].transform(X_tr[:1]).shape[1]),
        },
        "test": {
            "accuracy": float(accuracy_score(y_te, pred)),
            "precision": float(precision_score(y_te, pred, zero_division=0)),
            "recall": float(recall_score(y_te, pred, zero_division=0)),
            "f1": float(f1_score(y_te, pred, zero_division=0)),
            "roc_auc": float(roc_auc_score(y_te, proba)),
            "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        },
        "cross_validation": {
            "folds": 5,
            "f1_mean": float(np.mean(cv)),
            "f1_std": float(np.std(cv)),
            "f1_per_fold": [round(float(v), 4) for v in cv],
        },
        "timing": {
            "train_seconds": round(train_time, 2),
            "single_inference_ms": round(infer_ms, 3),
        },
    }

    ART.mkdir(exist_ok=True)
    joblib.dump(pipe, ART / "sms_model.joblib")
    (ART / "sms_metrics.json").write_text(json.dumps(metrics, indent=2))

    m = metrics["test"]
    print(f"\n--- TEST ---")
    print(f"accuracy  {m['accuracy']:.4f}")
    print(f"precision {m['precision']:.4f}")
    print(f"recall    {m['recall']:.4f}")
    print(f"f1        {m['f1']:.4f}")
    print(f"roc_auc   {m['roc_auc']:.4f}")
    print(f"5-fold f1 {np.mean(cv):.4f} +/- {np.std(cv):.4f}")
    print(f"inference {infer_ms:.2f} ms/message")
    print(f"\nSaved artifacts/sms_model.joblib and artifacts/sms_metrics.json")


if __name__ == "__main__":
    main()
