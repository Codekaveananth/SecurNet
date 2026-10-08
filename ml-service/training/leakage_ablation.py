"""
leakage_ablation.py
===================
Produces the leakage ablation table (Table IV in the paper).

Four configurations are trained on the SAME data with the SAME
hyper-parameters. Only the evaluation protocol and the feature set change:

  A. leaky features  + random split   -> the naive pipeline most papers report
  B. leaky features  + grouped split  -> removes domain memorisation only
  C. clean features  + random split   -> removes scraper artefacts only
  D. clean features  + grouped split  -> SecureNet's deployed configuration

The gap between A and D is the headline claim: it is the accuracy the naive
protocol was fabricating. Reporting A as a result is what makes >99% figures
appear in the literature and then fail in deployment.

Output:
  artifacts/leakage_ablation.json   machine-readable, cite directly
  artifacts/table_iv.tex            LaTeX table, paste into the paper
  artifacts/table_iv.md             markdown, paste into the report

Usage:
    python training/leakage_ablation.py
    python training/leakage_ablation.py --repeats 5      # with std deviations
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from statistics import mean, pstdev

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.features.url_features import extract_vector, canonicalise  # noqa: E402

import xgboost as xgb  # noqa: E402
from sklearn.metrics import (  # noqa: E402
    accuracy_score, f1_score, precision_score, recall_score, roc_auc_score,
)
from sklearn.model_selection import GroupShuffleSplit  # noqa: E402

DATA = ROOT / "data" / "urls.csv"
ART = ROOT / "artifacts"

CONFIGS = [
    ("A", "Leaky features + random split",  True,  True),
    ("B", "Leaky features + grouped split", True,  False),
    ("C", "Clean features + random split",  False, True),
    ("D", "Clean features + grouped split (SecureNet)", False, False),
]


def registrable(url: str) -> str:
    host = canonicalise(url).split("/")[0].split(":")[0]
    labels = host.split(".")
    return ".".join(labels[-2:]) if len(labels) >= 2 else host


def run_one(urls, y, groups, leaky: bool, random_split: bool, seed: int):
    X = np.asarray([extract_vector(u, include_leaky=leaky) for u in urls], dtype=np.float32)

    if random_split:
        rng = np.random.RandomState(seed)
        idx = rng.permutation(len(y))
        cut = int(0.75 * len(y))
        tr, te = idx[:cut], idx[cut:]
    else:
        gss = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=seed)
        tr, te = next(gss.split(X, y, groups))

    clf = xgb.XGBClassifier(
        n_estimators=400, max_depth=6, learning_rate=0.08,
        subsample=0.85, colsample_bytree=0.85, min_child_weight=3,
        reg_lambda=1.5, reg_alpha=0.2, gamma=0.1,
        eval_metric="logloss", tree_method="hist",
        random_state=seed, n_jobs=-1,
    )
    clf.fit(X[tr], y[tr], verbose=False)

    proba = clf.predict_proba(X[te])[:, 1]
    pred = (proba >= 0.5).astype(int)

    shared = len(set(groups[tr]) & set(groups[te]))
    return {
        "accuracy": accuracy_score(y[te], pred),
        "precision": precision_score(y[te], pred, zero_division=0),
        "recall": recall_score(y[te], pred, zero_division=0),
        "f1": f1_score(y[te], pred, zero_division=0),
        "roc_auc": roc_auc_score(y[te], proba),
        "shared_domains": shared,
        "n_test": int(len(te)),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeats", type=int, default=3,
                    help="number of seeds; results are averaged")
    args = ap.parse_args()

    if not DATA.exists():
        raise SystemExit("data/urls.csv not found -- run training/build_dataset.py first")

    df = pd.read_csv(DATA).dropna(subset=["url", "label"])
    urls = df["url"].astype(str).tolist()
    y = df["label"].astype(int).to_numpy()
    groups = np.array([registrable(u) for u in urls])

    print(f"Corpus: {len(urls)} URLs, {len(np.unique(groups))} distinct domains")
    print(f"Running {len(CONFIGS)} configurations x {args.repeats} seeds\n")

    results = {}
    for tag, label, leaky, rand in CONFIGS:
        runs = [run_one(urls, y, groups, leaky, rand, seed=42 + i)
                for i in range(args.repeats)]
        agg = {k: {"mean": mean(r[k] for r in runs),
                   "std": pstdev([r[k] for r in runs]) if len(runs) > 1 else 0.0}
               for k in ("accuracy", "precision", "recall", "f1", "roc_auc")}
        agg["shared_domains_train_test"] = int(mean(r["shared_domains"] for r in runs))
        agg["label"] = label
        agg["leaky_features"] = leaky
        agg["random_split"] = rand
        results[tag] = agg
        print(f"{tag}  {label:<48} acc {agg['accuracy']['mean']:.4f} "
              f"(+/-{agg['accuracy']['std']:.4f})  f1 {agg['f1']['mean']:.4f}  "
              f"shared domains {agg['shared_domains_train_test']}")

    inflation = results["A"]["accuracy"]["mean"] - results["D"]["accuracy"]["mean"]
    print(f"\nAccuracy inflation attributable to leakage: "
          f"{100 * inflation:.2f} percentage points")

    ART.mkdir(exist_ok=True)
    (ART / "leakage_ablation.json").write_text(json.dumps({
        "repeats": args.repeats,
        "corpus_size": int(len(urls)),
        "distinct_domains": int(len(np.unique(groups))),
        "configurations": results,
        "accuracy_inflation_pp": round(100 * inflation, 2),
    }, indent=2))

    # ---- LaTeX ----------------------------------------------------------
    tex = [
        r"\begin{table}[t]",
        r"\caption{Effect of leakage control on reported performance}",
        r"\label{tab:leakage}",
        r"\centering",
        r"\begin{tabular}{llcccc}",
        r"\hline",
        r"& Configuration & Acc. & Prec. & Rec. & F1 \\",
        r"\hline",
    ]
    for tag, _, _, _ in CONFIGS:
        r = results[tag]
        tex.append(
            f"{tag} & {r['label'].replace('(SecureNet)', '(ours)')} & "
            f"{r['accuracy']['mean']:.3f} & {r['precision']['mean']:.3f} & "
            f"{r['recall']['mean']:.3f} & {r['f1']['mean']:.3f} \\\\"
        )
    tex += [r"\hline", r"\end{tabular}", r"\end{table}"]
    (ART / "table_iv.tex").write_text("\n".join(tex))

    # ---- Markdown -------------------------------------------------------
    md = ["| | Configuration | Accuracy | Precision | Recall | F1 |",
          "|---|---|---|---|---|---|"]
    for tag, _, _, _ in CONFIGS:
        r = results[tag]
        md.append(f"| {tag} | {r['label']} | {r['accuracy']['mean']:.3f} | "
                  f"{r['precision']['mean']:.3f} | {r['recall']['mean']:.3f} | "
                  f"{r['f1']['mean']:.3f} |")
    md.append("")
    md.append(f"Accuracy inflation attributable to leakage: "
              f"**{100 * inflation:.2f} percentage points**")
    (ART / "table_iv.md").write_text("\n".join(md))

    print("Wrote artifacts/leakage_ablation.json, table_iv.tex, table_iv.md")


if __name__ == "__main__":
    main()
