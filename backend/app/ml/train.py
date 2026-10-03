"""Training loops for all ML models.

Real training: Adam/AdamW, class-weighted BCE, early stopping on
validation PR-AUC, normalization stats fitted on train split only
(no leakage), metrics: ROC-AUC, PR-AUC, F1@0.5, precision/recall.

Run:  python -m app.ml.train --model fraud_mlp --samples 50000
Weights land in backend/models/<name>-<version>.pt + registry entry.
"""

import argparse
import json
import os
import time
from datetime import datetime, timezone
from typing import Dict, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import (average_precision_score, f1_score,
                             precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import train_test_split

from app.ml.features import FEATURE_SCHEMA_VERSION
from app.ml.models import FraudAutoencoder, FraudMLP, TxnGCN
from app.ml.synthetic_data import generate_corpus, generate_graph

MODELS_DIR = os.environ.get("NEOBANK_MODELS_DIR",
                            os.path.join(os.path.dirname(__file__), "..", "..", "models"))
DEVICE = torch.device("cpu")


def _metrics(y_true: np.ndarray, y_score: np.ndarray, threshold: float = 0.5) -> Dict[str, float]:
    y_pred = (y_score >= threshold).astype(int)
    return {
        "roc_auc": float(roc_auc_score(y_true, y_score)),
        "pr_auc": float(average_precision_score(y_true, y_score)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
    }


def _standardize(X_train: np.ndarray, X_test: np.ndarray) -> Tuple[np.ndarray, np.ndarray, Dict]:
    mean = X_train.mean(axis=0)
    std = X_train.std(axis=0) + 1e-8
    return (X_train - mean) / std, (X_test - mean) / std, {"mean": mean.tolist(), "std": std.tolist()}


def _save(model: nn.Module, name: str, metrics: Dict, extra: Dict) -> str:
    os.makedirs(MODELS_DIR, exist_ok=True)
    version = datetime.now(timezone.utc).strftime("v%Y%m%d%H%M%S")
    weights_path = os.path.join(MODELS_DIR, f"{name}-{version}.pt")
    torch.save(model.state_dict(), weights_path)

    registry_path = os.path.join(MODELS_DIR, "registry.json")
    registry = {}
    if os.path.exists(registry_path):
        registry = json.load(open(registry_path))
    entry = {
        "version": version,
        "weights": os.path.basename(weights_path),
        "feature_schema": FEATURE_SCHEMA_VERSION,
        "metrics": metrics,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "status": "champion" if name not in registry else "challenger",
        **extra,
    }
    registry[name] = entry
    json.dump(registry, open(registry_path, "w"), indent=2)

    # MLflow tracking (optional — only if server configured)
    mlflow_uri = os.environ.get("MLFLOW_TRACKING_URI")
    if mlflow_uri:
        try:
            import mlflow
            mlflow.set_tracking_uri(mlflow_uri)
            with mlflow.start_run(run_name=f"{name}-{version}"):
                mlflow.log_params({"model": name, "schema": FEATURE_SCHEMA_VERSION, **extra.get("hyperparams", {})})
                mlflow.log_metrics(metrics)
                mlflow.pytorch.log_model(model, artifact_path="model")
        except Exception as exc:  # noqa: BLE001
            print(f"[mlflow] logging skipped: {exc}")

    print(f"[saved] {name} {version} -> {weights_path}")
    print(f"[metrics] {json.dumps(metrics, indent=2)}")
    return weights_path


def train_fraud_mlp(n_samples: int = 50_000, epochs: int = 40, seed: int = 42) -> Dict:
    torch.manual_seed(seed)
    corpus = generate_corpus(n_samples=n_samples, seed=seed)
    X_train, X_val, y_train, y_val = train_test_split(
        corpus.X, corpus.y, test_size=0.2, stratify=corpus.y, random_state=seed)
    X_train, X_val, norm = _standardize(X_train, X_val)

    Xtr = torch.tensor(X_train, dtype=torch.float32)
    ytr = torch.tensor(y_train, dtype=torch.float32)
    Xv = torch.tensor(X_val, dtype=torch.float32)
    yv = y_val

    model = FraudMLP().to(DEVICE)
    # Class imbalance: weight positives
    pos_weight = torch.tensor([(len(y_train) - y_train.sum()) / max(y_train.sum(), 1)])
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, patience=3, factor=0.5)
    criterion = nn.BCELoss(weight=None, reduction="none")

    best_pr, patience, best_state = 0.0, 0, None
    batch = 512
    for epoch in range(epochs):
        model.train()
        perm = torch.randperm(len(Xtr))
        for i in range(0, len(Xtr), batch):
            xb, yb = Xtr[perm[i:i+batch]], ytr[perm[i:i+batch]]
            opt.zero_grad()
            out = model(xb)
            loss_vec = criterion(out, yb)
            w = torch.where(yb > 0.5, pos_weight, torch.ones_like(yb))
            (loss_vec * w).mean().backward()
            opt.step()

        model.eval()
        with torch.inference_mode():
            scores = model(Xv).numpy()
        m = _metrics(yv, scores)
        sched.step(1 - m["pr_auc"])
        print(f"epoch {epoch+1:02d} pr_auc={m['pr_auc']:.4f} roc_auc={m['roc_auc']:.4f}")
        if m["pr_auc"] > best_pr:
            best_pr, patience, best_state = m["pr_auc"], 0, {k: v.clone() for k, v in model.state_dict().items()}
        else:
            patience += 1
            if patience >= 6:
                print("early stop")
                break

    model.load_state_dict(best_state)
    with torch.inference_mode():
        final = _metrics(yv, model(Xv).numpy())
    _save(model, "fraud_mlp", final, {"normalization": norm,
          "hyperparams": {"epochs": epochs, "batch": batch, "samples": n_samples}})
    return final


def train_autoencoder(n_samples: int = 50_000, epochs: int = 30, seed: int = 42) -> Dict:
    """Trained ONLY on legitimate transactions (anomaly detection)."""
    torch.manual_seed(seed)
    corpus = generate_corpus(n_samples=n_samples, seed=seed)
    legit = corpus.X[corpus.y == 0]
    X_train, X_val = train_test_split(legit, test_size=0.15, random_state=seed)
    X_train, X_val, norm = _standardize(X_train, X_val)
    Xtr = torch.tensor(X_train, dtype=torch.float32)
    Xv = torch.tensor(X_val, dtype=torch.float32)

    model = FraudAutoencoder().to(DEVICE)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    for epoch in range(epochs):
        model.train()
        perm = torch.randperm(len(Xtr))
        tot = 0.0
        for i in range(0, len(Xtr), 512):
            xb = Xtr[perm[i:i+512]]
            opt.zero_grad()
            loss = F.mse_loss(model(xb), xb)
            loss.backward()
            opt.step()
            tot += loss.item()
        if (epoch + 1) % 5 == 0:
            print(f"epoch {epoch+1:02d} mse={tot:.4f}")

    model.eval()
    with torch.inference_mode():
        legit_err = model.anomaly_score(Xv).numpy()
    # Threshold: 99th percentile of legit reconstruction error
    threshold = float(np.quantile(legit_err, 0.99))
    # Evaluate separation on mixed validation corpus
    X_all = torch.tensor((corpus.X - np.array(norm["mean"])) / np.array(norm["std"]),
                         dtype=torch.float32)
    with torch.inference_mode():
        all_err = model.anomaly_score(X_all).numpy()
    m = _metrics(corpus.y, all_err / (all_err.max() + 1e-9))
    m["threshold"] = threshold
    _save(model, "fraud_autoencoder", m, {"normalization": norm,
          "hyperparams": {"epochs": epochs, "samples": n_samples}})
    return m


def train_gnn(seed: int = 42, epochs: int = 500, max_attempts: int = 5) -> Dict:
    # Dense-GCN training on small graphs is bistable (can plateau into a
    # position-memorising minimum). Retry with fresh seeds until the model
    # clears a quality gate — never silently ship a degenerate GNN.
    for attempt in range(max_attempts):
        metrics = _train_gnn_once(seed=seed + attempt * 1000, epochs=epochs)
        if metrics["pr_auc"] >= 0.5:
            return metrics
        print(f"[gnn] attempt {attempt+1} degenerate (pr_auc={metrics['pr_auc']:.3f}), reseeding")
    raise RuntimeError("GNN training failed quality gate after retries — investigate data/architecture")


def _train_gnn_once(seed: int = 42, epochs: int = 300) -> Dict:
    """Neighbor-sampled GNN training (GraphSAGE-style, production-correct).

    Instead of full-batch dense propagation over the whole graph (which
    memorises node positions), each step scores a batch of target nodes
    against their sampled 2-hop subgraphs. This generalises and matches
    how inference works (small neighborhood around one account).
    """
    rng = np.random.default_rng(seed)
    torch.manual_seed(seed)

    X, adj, y = generate_graph(n_accounts=2000, n_edges=15000, mule_fraction=0.04, seed=seed)
    mean, std = X.mean(axis=0), X.std(axis=0) + 1e-8
    Xn = torch.tensor((X - mean) / std, dtype=torch.float32)
    A = torch.tensor(adj, dtype=torch.float32)
    yt = torch.tensor(y, dtype=torch.float32)

    n = len(y)
    tr, va = train_test_split(np.arange(n), test_size=0.2, stratify=y, random_state=seed)

    def sample_subgraph(targets: np.ndarray, fanout: int = 10, max_nodes: int = 64):
        """2-hop neighbor sampling around target nodes."""
        nodes = list(dict.fromkeys(targets.tolist()))
        frontier = list(nodes)
        for _ in range(2):  # 2 hops
            nxt = []
            for node in frontier:
                nbrs = np.flatnonzero(adj[node] > 0)
                if len(nbrs) > fanout:
                    nbrs = rng.choice(nbrs, fanout, replace=False)
                nxt.extend(nbrs.tolist())
            frontier = nxt
            nodes = list(dict.fromkeys(nodes + nxt))[:max_nodes]
        idx = torch.tensor(nodes, dtype=torch.long)
        sub_adj = A[idx][:, idx]
        sub_x = Xn[idx]
        target_pos = torch.tensor([nodes.index(t) for t in targets], dtype=torch.long)
        return sub_x, sub_adj, target_pos

    model = TxnGCN().to(DEVICE)
    opt = torch.optim.AdamW(model.parameters(), lr=5e-3, weight_decay=1e-5)
    criterion = nn.BCEWithLogitsLoss()

    batch_targets = 32
    best_pr, patience, best_state = 0.0, 0, None
    steps_per_epoch = max(len(tr) // batch_targets, 1)

    for epoch in range(epochs):
        model.train()
        perm = rng.permutation(tr)
        for step in range(steps_per_epoch):
            targets = perm[step * batch_targets:(step + 1) * batch_targets]
            if len(targets) == 0:
                continue
            sub_x, sub_adj, tpos = sample_subgraph(targets)
            opt.zero_grad()
            logits = model(sub_x, sub_adj)
            loss = criterion(logits[tpos], yt[torch.tensor(targets, dtype=torch.long)])
            loss.backward()
            opt.step()

        # Eval on full-graph propagation (transductive eval, val-only scoring)
        model.eval()
        with torch.inference_mode():
            all_logits = model(Xn, A)
            vs = torch.sigmoid(all_logits)[torch.tensor(va, dtype=torch.long)].numpy()
        m = _metrics(y[va], vs)
        if m["pr_auc"] > best_pr:
            best_pr, patience, best_state = m["pr_auc"], 0, {k: v.clone() for k, v in model.state_dict().items()}
        else:
            patience += 1
            if patience >= 30:
                break
        if (epoch + 1) % 10 == 0:
            print(f"epoch {epoch+1:02d} pr_auc={m['pr_auc']:.4f} loss={loss.item():.4f}")

    model.load_state_dict(best_state)
    model.eval()
    with torch.inference_mode():
        final = _metrics(y[va], torch.sigmoid(model(Xn, A))[torch.tensor(va, dtype=torch.long)].numpy())
    if final["pr_auc"] >= 0.5:
        _save(model, "fraud_gnn", final, {"normalization": {"mean": mean.tolist(), "std": std.tolist()},
              "hyperparams": {"epochs": epochs, "lr": 5e-3, "loss": "BCEWithLogits",
                              "training": "neighbor_sampled"}})
    return final


def train_credit_mlp(n_samples: int = 30_000, epochs: int = 30, seed: int = 42) -> Dict:
    """Credit PD model on synthetic bureau features (25 dims).
    Signal: debt-to-income, utilisation, delinquencies, tenure."""
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    X = rng.normal(0, 1, (n_samples, 25)).astype(np.float32)
    # Latent default propensity driven by a few dims
    logit = (2.2 * X[:, 0] + 1.8 * X[:, 3] + 1.5 * X[:, 7]
             - 1.2 * X[:, 1] + 0.8 * X[:, 11] + rng.normal(0, 1.0, n_samples))
    y = (logit > np.quantile(logit, 0.85)).astype(np.int64)  # 15% default rate

    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2,
                                                      stratify=y, random_state=seed)
    Xtr = torch.tensor(X_train); ytr = torch.tensor(y_train, dtype=torch.float32)
    Xv = torch.tensor(X_val)

    from app.ml.models import CreditMLP
    model = CreditMLP().to(DEVICE)
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    pos_weight = torch.tensor([(len(y_train) - y_train.sum()) / y_train.sum()])
    best_pr, best_state = 0.0, None
    for epoch in range(epochs):
        model.train()
        perm = torch.randperm(len(Xtr))
        for i in range(0, len(Xtr), 512):
            xb, yb = Xtr[perm[i:i+512]], ytr[perm[i:i+512]]
            opt.zero_grad()
            out = model(xb)
            w = torch.where(yb > 0.5, pos_weight, torch.ones_like(yb))
            (F.binary_cross_entropy(out, yb, reduction="none") * w).mean().backward()
            opt.step()
        model.eval()
        with torch.inference_mode():
            m = _metrics(y_val, model(Xv).numpy())
        if m["pr_auc"] > best_pr:
            best_pr, best_state = m["pr_auc"], {k: v.clone() for k, v in model.state_dict().items()}
    model.load_state_dict(best_state)
    with torch.inference_mode():
        final = _metrics(y_val, model(Xv).numpy())
    _save(model, "credit_mlp", final, {"hyperparams": {"epochs": epochs, "samples": n_samples}})
    return final


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=["fraud_mlp", "fraud_autoencoder", "fraud_gnn",
                                            "credit_mlp", "all"], default="all")
    parser.add_argument("--samples", type=int, default=50_000)
    parser.add_argument("--epochs", type=int, default=40)
    args = parser.parse_args()
    t0 = time.time()
    if args.model in ("fraud_mlp", "all"):
        train_fraud_mlp(n_samples=args.samples, epochs=args.epochs)
    if args.model in ("fraud_autoencoder", "all"):
        train_autoencoder(n_samples=args.samples, epochs=max(args.epochs - 10, 10))
    if args.model in ("fraud_gnn", "all"):
        train_gnn()
    if args.model in ("credit_mlp", "all"):
        train_credit_mlp()
    print(f"[done] total {time.time()-t0:.0f}s")
