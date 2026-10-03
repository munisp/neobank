"""Continuous training pipeline.

Closes the loop: production fraud decisions (labeled FraudAlert rows with
resolution outcomes) flow back into training, models retrain, and a
challenger is promoted only if it beats the champion on held-out PR-AUC.

Data sources, in priority order:
  1. Resolved fraud alerts from PostgreSQL (real labels)
  2. Lakehouse (Iceberg `ml_training` table) — historical snapshots
  3. Fresh synthetic top-up to keep class balance when real labels are scarce

Can run standalone (cron / Temporal schedule) or distributed via Ray
(ray_train.py wraps this module when a Ray cluster is configured).
"""

import json
import os
from typing import Any, Dict, List, Optional

import numpy as np
import structlog

from app.ml.features import extract_features
from app.ml.inference import ModelRegistry

logger = structlog.get_logger(__name__)

MIN_REAL_LABELS = 500  # below this, synthetic top-up dominates


async def fetch_labeled_from_db(session) -> List[Dict[str, Any]]:
    """Pull resolved fraud alerts as labeled examples.
    label = 1 if alert confirmed fraud, 0 if dismissed as false positive."""
    from sqlalchemy import select
    from database.models import FraudAlert

    result = await session.execute(
        select(FraudAlert).where(FraudAlert.status.in_(["confirmed", "false_positive"])))
    rows = result.scalars().all()
    labeled = []
    for r in rows:
        rules = r.detection_rules or {}
        ctx = rules.get("context", {})
        labeled.append({
            "context": ctx,
            "label": 1 if r.status == "confirmed" else 0,
        })
    return labeled


async def export_to_lakehouse(records: List[Dict[str, Any]]) -> bool:
    """Append labeled records to the Iceberg ml_training table."""
    try:
        import pandas as pd
        from app.services.lakehouse_service import get_lakehouse_service
        lake = get_lakehouse_service()
        df = pd.DataFrame([
            {"features": extract_features(r["context"]).tolist(), "label": r["label"]}
            for r in records
        ])
        # lakehouse_service exposes an append via pyiceberg; degrade gracefully
        await lake.append_table("ml_training", df)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.info("lakehouse_export_skipped", error=str(exc))
        return False


def build_training_matrix(labeled: List[Dict[str, Any]],
                          topup_samples: int = 20_000, seed: int = 7):
    """Combine real labels with a synthetic top-up (keeps distribution
    coverage for rare fraud typologies)."""
    from app.ml.synthetic_data import generate_corpus

    real_X = np.stack([extract_features(r["context"]) for r in labeled]) if labeled \
        else np.zeros((0, 24), dtype=np.float32)
    real_y = np.array([r["label"] for r in labeled], dtype=np.int64)

    corpus = generate_corpus(n_samples=topup_samples, seed=seed)
    X = np.concatenate([real_X, corpus.X]) if len(real_X) else corpus.X
    y = np.concatenate([real_y, corpus.y]) if len(real_y) else corpus.y
    return X, y, len(real_y)


async def run_continuous_training(session, topup_samples: int = 20_000) -> Dict[str, Any]:
    """One full cycle: fetch → retrain → evaluate → maybe promote."""
    from sklearn.metrics import average_precision_score
    from sklearn.model_selection import train_test_split
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    labeled = await fetch_labeled_from_db(session)
    await export_to_lakehouse(labeled)
    X, y, n_real = build_training_matrix(labeled, topup_samples=topup_samples)
    logger.info("continuous_training_data", real=n_real, total=len(y))

    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2,
                                                      stratify=y, random_state=7)
    mean, std = X_train.mean(axis=0), X_train.std(axis=0) + 1e-8
    Xtr = torch.tensor((X_train - mean) / std, dtype=torch.float32)
    ytr = torch.tensor(y_train, dtype=torch.float32)
    Xv = torch.tensor((X_val - mean) / std, dtype=torch.float32)

    from app.ml.models import FraudMLP
    challenger = FraudMLP()
    opt = torch.optim.AdamW(challenger.parameters(), lr=1e-3, weight_decay=1e-4)
    pos_weight = torch.tensor([(len(y_train) - y_train.sum()) / max(y_train.sum(), 1)])
    for _ in range(15):
        perm = torch.randperm(len(Xtr))
        for i in range(0, len(Xtr), 512):
            xb, yb = Xtr[perm[i:i+512]], ytr[perm[i:i+512]]
            opt.zero_grad()
            out = challenger(xb)
            w = torch.where(yb > 0.5, pos_weight, torch.ones_like(yb))
            (F.binary_cross_entropy(out, yb, reduction="none") * w).mean().backward()
            opt.step()

    challenger.eval()
    with torch.inference_mode():
        challenger_pr = average_precision_score(y_val, challenger(Xv).numpy())

    # Compare with champion
    registry = ModelRegistry()
    champion_meta = registry.load().get("fraud_mlp")
    champion_pr = champion_meta.get("metrics", {}).get("pr_auc", 0.0) if champion_meta else 0.0

    promoted = False
    if challenger_pr > champion_pr or not champion_meta:
        models_dir = registry.models_dir
        import datetime
        version = "ct-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
        torch.save(challenger.state_dict(), os.path.join(models_dir, f"fraud_mlp-{version}.pt"))
        data = registry.load()
        data["fraud_mlp"] = {
            "version": version,
            "weights": f"fraud_mlp-{version}.pt",
            "feature_schema": "1.0",
            "metrics": {"pr_auc": float(challenger_pr)},
            "status": "champion",
            "normalization": {"mean": mean.tolist(), "std": std.tolist()},
            "trained_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "real_labels": n_real,
        }
        json.dump(data, open(registry.registry_path, "w"), indent=2)
        promoted = True
        logger.info("ml_challenger_promoted", challenger_pr=challenger_pr,
                    champion_pr=champion_pr)

    return {
        "real_labels": n_real,
        "total_samples": int(len(y)),
        "challenger_pr_auc": round(float(challenger_pr), 4),
        "champion_pr_auc": round(float(champion_pr), 4),
        "promoted": promoted,
    }
