"""User corrections: the last step of Browser -> ... -> Dashboard -> Feedback.

Corrections are appended to a JSON Lines file (no database is needed for the
ML tier). The Spring Boot gateway has its own feedback table; this endpoint
lets the loop work when the gateway is not running.
"""

from __future__ import annotations

import json
import threading
import time
from collections import Counter

from fastapi import APIRouter

from ..config import FEEDBACK_PATH
from ..schemas import FeedbackRequest

router = APIRouter(prefix="/api/v1", tags=["feedback"])
_lock = threading.Lock()


@router.post("/feedback", status_code=201)
def submit(req: FeedbackRequest) -> dict:
    record = req.model_dump()
    record["kind"] = (
        "false_positive" if req.predicted_label == 1 and req.correct_label == 0
        else "false_negative" if req.predicted_label == 0 and req.correct_label == 1
        else "confirmation"
    )
    record["received_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    FEEDBACK_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _lock, FEEDBACK_PATH.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    return {"stored": True, "kind": record["kind"]}


@router.get("/feedback/summary")
def summary() -> dict:
    """Counts only - the stored artefacts are not echoed back."""
    counts: Counter = Counter()
    by_type: Counter = Counter()
    total = 0
    if FEEDBACK_PATH.exists():
        with _lock, FEEDBACK_PATH.open(encoding="utf-8") as fh:
            for line in fh:
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                total += 1
                counts[r.get("kind", "unknown")] += 1
                by_type[r.get("artefact_type", "unknown")] += 1
    return {"total": total, "by_kind": dict(counts), "by_type": dict(by_type)}
