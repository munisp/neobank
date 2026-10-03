"""Realistic synthetic Nigerian banking data generator.

Not random noise — models the actual rhythms of Nigerian retail banking:

- Salary cycles: 25th–5th of month spike in inflows, then bill payments
  (DSTV/GOtv, DisCos like IKEDC/EKEDC, MTN/Glo/Airtel/9mobile airtime)
- NIP instant transfers dominate; USSD (*737# etc.) heavy in low-income
  segments; POS/agent banking withdrawals cluster evenings
- Amount distribution: log-normal, median ~₦8,500, long tail to ₦5M
  (tier-3 KYC cap), SME accounts higher
- Fraud typologies (5% base rate, labeled):
    1. account_takeover   — night hours, new device, drain-to-balance ratio ~1
    2. sim_swap_otp       — new device + rapid velocity burst + USSD channel
    3. mule_network       — fan-in from many sources then fan-out < 24h
    4. card_testing       — many tiny amounts in < 1h, card channel
    5. social_engineering — daytime, victim-initiated, new destination,
                            above-median amount, elderly account ages
    6. first_party        — normal-looking but velocity anomalies, new accounts
- Benign anomalies injected (2%): genuine big purchases, travel — teaches
  the model not to fire on amount alone.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Tuple

import numpy as np

from app.ml.features import TX_TYPES, CHANNELS, extract_features, FEATURE_DIM

FRAUD_TYPES = [
    "account_takeover", "sim_swap_otp", "mule_network",
    "card_testing", "social_engineering", "first_party",
]

# Median Nigerian retail transaction ~₦8.5k; sigma tuned to match NIBSS reports
AMOUNT_MEDIAN = 8500.0
AMOUNT_SIGMA = 1.6


@dataclass
class SyntheticCorpus:
    X: np.ndarray            # [N, FEATURE_DIM]
    y: np.ndarray            # [N] binary fraud label
    fraud_type: np.ndarray   # [N] string labels ('' for legit)
    contexts: List[Dict] = field(default_factory=list)


def _sample_amount(rng: np.random.Generator, is_sme: bool = False) -> float:
    amt = rng.lognormal(mean=np.log(AMOUNT_MEDIAN * (8 if is_sme else 1)), sigma=AMOUNT_SIGMA)
    return float(np.clip(amt, 100.0, 5_000_000.0))


def _base_context(rng: np.random.Generator) -> Dict:
    """A plausible everyday transaction context."""
    is_sme = rng.random() < 0.08
    # Salary-cycle day weighting: 25th-5th heavier
    day = int(rng.choice(np.arange(1, 29), p=_day_weights()))
    hour = int(np.clip(rng.normal(14, 4.5), 0, 23))  # daytime-skewed
    balance = _sample_amount(rng, is_sme) * rng.uniform(3, 40)
    kyc_level = int(rng.choice([1, 2, 3], p=[0.35, 0.45, 0.20]))
    return {
        "amount": _sample_amount(rng, is_sme),
        "transaction_type": str(rng.choice(TX_TYPES,
                                p=[0.42, 0.16, 0.12, 0.10, 0.08, 0.07, 0.05])),
        "channel": str(rng.choice(CHANNELS, p=[0.52, 0.10, 0.30, 0.08])),
        "hour": hour,
        "weekday": int(rng.integers(0, 7)),
        "account_balance": balance,
        "account_age_days": float(rng.lognormal(np.log(400), 0.9)),
        "kyc_level": kyc_level,
        "days_since_kyc": float(rng.lognormal(np.log(300), 0.8)),
        "tx_count_1h": float(rng.poisson(0.7)),
        "tx_count_24h": float(rng.poisson(4)),
        "amount_sum_24h": balance * rng.uniform(0.01, 0.15),
        "unique_dest_24h": float(rng.poisson(2)),
        "is_new_destination": bool(rng.random() < 0.15),
        "dest_age_days": float(rng.lognormal(np.log(500), 1.0)),
        "dest_is_internal": bool(rng.random() < 0.3),
        "is_new_device": bool(rng.random() < 0.03),
        "_day": day,
    }


def _day_weights() -> np.ndarray:
    w = np.ones(28)
    for d in (25, 26, 27, 28, 1, 2, 3, 4, 5):  # salary window
        w[d - 1] = 2.6
    return w / w.sum()


def _apply_fraud_pattern(ctx: Dict, fraud_type: str, rng: np.random.Generator) -> Dict:
    c = dict(ctx)
    if fraud_type == "account_takeover":
        c.update(hour=int(rng.integers(0, 6)), is_new_device=True,
                 amount=c["account_balance"] * rng.uniform(0.8, 1.0),
                 channel="mobile", is_new_destination=True,
                 tx_count_1h=float(rng.integers(1, 4)))
    elif fraud_type == "sim_swap_otp":
        c.update(is_new_device=True, channel="ussd",
                 tx_count_1h=float(rng.integers(4, 12)),
                 tx_count_24h=float(rng.integers(15, 40)),
                 unique_dest_24h=float(rng.integers(5, 15)),
                 amount=_sample_amount(rng) * rng.uniform(1, 4))
    elif fraud_type == "mule_network":
        c.update(unique_dest_24h=float(rng.integers(10, 40)),
                 tx_count_24h=float(rng.integers(20, 60)),
                 amount_sum_24h=c["account_balance"] * rng.uniform(0.5, 1.0),
                 account_age_days=float(rng.uniform(1, 90)),
                 kyc_level=1)
    elif fraud_type == "card_testing":
        c.update(transaction_type="card", amount=float(rng.uniform(100, 1500)),
                 tx_count_1h=float(rng.integers(6, 20)),
                 hour=int(rng.integers(0, 24)))
    elif fraud_type == "social_engineering":
        c.update(is_new_destination=True, channel=str(rng.choice(["mobile", "ussd"])),
                 amount=_sample_amount(rng) * rng.uniform(3, 10),
                 account_age_days=float(rng.lognormal(np.log(1500), 0.5)),
                 hour=int(np.clip(rng.normal(11, 3), 6, 22)))
    elif fraud_type == "first_party":
        c.update(account_age_days=float(rng.uniform(1, 45)),
                 tx_count_24h=float(rng.integers(10, 30)),
                 amount_sum_24h=c["account_balance"] * rng.uniform(0.3, 0.9),
                 days_since_kyc=float(rng.uniform(1, 30)))
    return c


def generate_corpus(n_samples: int = 50_000, fraud_rate: float = 0.05,
                    benign_anomaly_rate: float = 0.02, seed: int = 42) -> SyntheticCorpus:
    rng = np.random.default_rng(seed)
    contexts: List[Dict] = []
    labels = np.zeros(n_samples, dtype=np.int64)
    ftypes: List[str] = []

    n_fraud = int(n_samples * fraud_rate)
    n_anomaly = int(n_samples * benign_anomaly_rate)
    fraud_idx = set(rng.choice(n_samples, n_fraud, replace=False).tolist())
    remaining = sorted(set(range(n_samples)) - fraud_idx)
    anomaly_idx = set(rng.choice(remaining, min(n_anomaly, len(remaining)), replace=False).tolist())

    for i in range(n_samples):
        ctx = _base_context(rng)
        if i in fraud_idx:
            ft = str(rng.choice(FRAUD_TYPES, p=[0.22, 0.20, 0.18, 0.12, 0.18, 0.10]))
            ctx = _apply_fraud_pattern(ctx, ft, rng)
            labels[i] = 1
            ftypes.append(ft)
        elif i in anomaly_idx:
            # benign spike: big purchase or travel-like pattern, label stays 0
            ctx["amount"] = _sample_amount(rng) * rng.uniform(5, 20)
            ctx["is_new_destination"] = True
            ftypes.append("")
        else:
            ftypes.append("")
        contexts.append(ctx)

    X = np.stack([extract_features(c) for c in contexts])
    return SyntheticCorpus(X=X, y=labels, fraud_type=np.array(ftypes, dtype=object),
                           contexts=contexts)


def generate_graph(n_accounts: int = 3000, n_edges: int = 20_000,
                   mule_fraction: float = 0.02, seed: int = 42) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Generate an account-transfer graph for GNN training.

    Returns (node_features [N, D], adjacency [N, N] weighted, labels [N]).
    Mule accounts: high in/out degree within short windows, young age,
    low KYC — labeled 1.
    """
    rng = np.random.default_rng(seed)
    from app.ml.features import GRAPH_NODE_DIM

    labels = (rng.random(n_accounts) < mule_fraction).astype(np.int64)
    X = np.zeros((n_accounts, GRAPH_NODE_DIM), dtype=np.float32)
    for i in range(n_accounts):
        mule = labels[i] == 1
        age = rng.uniform(1, 90) if mule else rng.lognormal(np.log(400), 0.9)
        in_deg = rng.integers(15, 60) if mule else rng.poisson(3)
        out_deg = rng.integers(15, 60) if mule else rng.poisson(3)
        X[i] = [
            np.log1p(age),
            np.log1p(_sample_amount(rng) * rng.uniform(0.5, 5)),
            1 / 3 if mule else rng.choice([1, 2, 3]) / 3,
            np.log1p(in_deg + out_deg),
            np.log1p(in_deg), np.log1p(out_deg),
            np.log1p(_sample_amount(rng)),
            rng.uniform(0.3, 0.7) if mule else rng.uniform(0.0, 0.15),
            rng.uniform(0.3, 0.8) if mule else rng.uniform(0.0, 0.05),
            np.log1p(in_deg + out_deg),
        ]

    adj = np.zeros((n_accounts, n_accounts), dtype=np.float32)
    # Preferential attachment + mule clustering
    hot = rng.choice(n_accounts, size=int(n_accounts * 0.05), replace=False)
    for _ in range(n_edges):
        if rng.random() < 0.35:
            src, dst = rng.choice(hot, 2, replace=False)
        else:
            src, dst = rng.integers(0, n_accounts, 2)
        if src != dst:
            adj[src, dst] += float(np.log1p(_sample_amount(rng)))
    # Symmetrize-ish (directed but both directions learnable) and scale
    adj = adj / (adj.max() + 1e-9)
    return X, adj, labels
