"""Shared feature engineering for ML models.

CRITICAL: training (train.py) and inference (inference.py) MUST use this
single module — feature skew between train and serve is the #1 silent
production ML failure. Bump FEATURE_SCHEMA_VERSION whenever the vector
layout changes; models record the version they were trained with.
"""

from typing import Any, Dict, List

import numpy as np

FEATURE_SCHEMA_VERSION = "1.0"

TX_TYPES = ["transfer", "bill_payment", "airtime", "withdrawal", "deposit", "qr_payment", "card"]
CHANNELS = ["mobile", "web", "ussd", "api"]

FEATURE_NAMES: List[str] = [
    # transaction
    "amount_log", "hour_sin", "hour_cos", "is_weekend", "is_night",
    "amount_to_balance",
    # tx type one-hot (7)
    *[f"tx_type_{t}" for t in TX_TYPES],
    # channel one-hot (4)
    *[f"channel_{c}" for c in CHANNELS],
    # account context
    "account_age_days_log", "balance_log", "kyc_level", "days_since_kyc_log",
    # velocity (computed from recent history)
    "tx_count_1h", "tx_count_24h", "amount_sum_24h_log", "unique_dest_24h",
    # counterparty / device
    "is_new_destination", "dest_age_days_log", "dest_is_internal",
    "is_new_device",
]
FEATURE_DIM = len(FEATURE_NAMES)  # 24


def extract_features(ctx: Dict[str, Any]) -> np.ndarray:
    """Build the feature vector from a transaction context dict.

    Keys expected (all optional — missing values default to neutral):
      amount, currency, transaction_type, channel, hour, weekday,
      account_balance, account_age_days, kyc_level, days_since_kyc,
      tx_count_1h, tx_count_24h, amount_sum_24h, unique_dest_24h,
      is_new_destination, dest_age_days, dest_is_internal, is_new_device
    """
    amount = float(ctx.get("amount", 0.0))
    balance = max(float(ctx.get("account_balance", 0.0)), 1.0)
    hour = int(ctx.get("hour", 12))
    weekday = int(ctx.get("weekday", 0))
    tx_type = str(ctx.get("transaction_type", "transfer"))
    channel = str(ctx.get("channel", "mobile"))

    vec = [
        np.log1p(amount),
        np.sin(2 * np.pi * hour / 24.0),
        np.cos(2 * np.pi * hour / 24.0),
        1.0 if weekday >= 5 else 0.0,
        1.0 if hour < 6 else 0.0,
        min(amount / balance, 10.0) / 10.0,
    ]
    vec += [1.0 if tx_type == t else 0.0 for t in TX_TYPES]
    vec += [1.0 if channel == c else 0.0 for c in CHANNELS]
    vec += [
        np.log1p(float(ctx.get("account_age_days", 365))),
        np.log1p(balance),
        float(ctx.get("kyc_level", 1)) / 3.0,
        np.log1p(float(ctx.get("days_since_kyc", 365))),
        min(float(ctx.get("tx_count_1h", 0)), 50.0) / 50.0,
        min(float(ctx.get("tx_count_24h", 0)), 200.0) / 200.0,
        np.log1p(float(ctx.get("amount_sum_24h", 0.0))),
        min(float(ctx.get("unique_dest_24h", 0)), 50.0) / 50.0,
        1.0 if ctx.get("is_new_destination", False) else 0.0,
        np.log1p(float(ctx.get("dest_age_days", 365))),
        1.0 if ctx.get("dest_is_internal", False) else 0.0,
        1.0 if ctx.get("is_new_device", False) else 0.0,
    ]
    arr = np.asarray(vec, dtype=np.float32)
    assert arr.shape[0] == FEATURE_DIM, f"feature dim mismatch: {arr.shape[0]} != {FEATURE_DIM}"
    return arr


# --- Graph features (GNN) ---------------------------------------------------
# Node feature vector per account in the transaction graph.
GRAPH_NODE_FEATURES = [
    "age_days_log", "balance_log", "kyc_level", "tx_count_30d_log",
    "in_degree_30d_log", "out_degree_30d_log", "avg_tx_amount_log",
    "night_tx_ratio", "new_device_ratio", "unique_counterparties_log",
]
GRAPH_NODE_DIM = len(GRAPH_NODE_FEATURES)  # 10


# ---------------------------------------------------------------------------
# Credit scoring features (credit_mlp, 25 dims)
# ---------------------------------------------------------------------------
# The model was trained on standardized features (mean 0, std 1). Each
# extraction below is deliberately z-scored with fixed domain constants so
# the served distribution matches training. Order is part of the schema —
# never reorder; bump CREDIT_FEATURE_SCHEMA_VERSION on any change.

CREDIT_FEATURE_SCHEMA_VERSION = "1.0"

CREDIT_FEATURE_NAMES: List[str] = [
    # --- income quality (5) ---
    "income_monthly_log_z",          # log monthly income, z-scored
    "income_regularity",             # 0..1 — recurring same-source credits
    "income_sources",                # distinct credit counterparties (z)
    "income_trend_3m",               # slope of monthly income, z
    "salary_cycle_alignment",        # 0..1 — credits cluster on payday window
    # --- balance behaviour (5) ---
    "balance_log_z",                 # current balance
    "avg_balance_log_z",             # trailing average
    "balance_volatility_z",          # std of daily balances
    "min_balance_ratio",             # lowest balance / average balance
    "days_negative_30d",             # overdraft days proxy (z)
    # --- transaction behaviour (6) ---
    "tx_count_30d_z",
    "tx_volume_30d_log_z",
    "spend_to_income_ratio",         # 0..2 clipped, centred at 1
    "savings_rate",                  # (inflow-outflow)/inflow
    "largest_tx_to_income",          # outlier size vs income
    "unique_counterparties_z",
    # --- account seasoning (3) ---
    "account_age_months_log_z",
    "active_days_ratio_90d",         # days with any activity / 90
    "kyc_level_rank",                # 1..4 centred
    # --- obligations & history (4) ---
    "active_loans",
    "loan_to_income_ratio",
    "repayment_history_score",       # on-time rate, 0..1 (0.8 neutral)
    "bnpl_utilisation",
    # --- authenticity signals (2) ---
    "wash_transfer_ratio",           # circular/self-funding share of volume
    "burst_before_application",      # 0..1 — sudden pre-application activity
]
CREDIT_FEATURE_DIM = len(CREDIT_FEATURE_NAMES)  # 25

# Fixed z-scoring constants (domain priors for Nigerian retail; logged NGN)
_Z = {
    "income_log": (11.5, 1.2),       # ~₦100k median, log-normal spread
    "balance_log": (10.5, 1.5),
    "volume_log": (12.0, 1.3),
    "tx_count": (40.0, 25.0),
    "counterparties": (15.0, 10.0),
    "age_months_log": (1.8, 1.0),
    "income_sources": (2.5, 1.5),
    "volatility_log": (10.0, 1.2),
    "days_negative": (2.0, 4.0),
}


def _z(value: float, key: str) -> float:
    mu, sigma = _Z[key]
    return (value - mu) / sigma


def extract_credit_features(ctx: Dict[str, Any]) -> np.ndarray:
    """Build the 25-dim credit vector from an aggregated user context.

    All keys optional; missing data degrades to neutral (0) per feature —
    the decision layer separately tracks data completeness so thin files
    are handled by policy, not by the model.
    """
    import math

    def lg(x: float) -> float:
        return math.log1p(max(0.0, float(x or 0)))

    v = [
        _z(lg(ctx.get("monthly_income", 0)), "income_log"),
        float(ctx.get("income_regularity", 0.5)) * 2 - 1,
        _z(float(ctx.get("income_sources", 1)), "income_sources"),
        float(ctx.get("income_trend_3m", 0.0)),
        float(ctx.get("salary_cycle_alignment", 0.5)) * 2 - 1,
        _z(lg(ctx.get("balance", 0)), "balance_log"),
        _z(lg(ctx.get("avg_balance", 0)), "balance_log"),
        _z(lg(ctx.get("balance_volatility", 0)), "volatility_log"),
        float(ctx.get("min_balance_ratio", 0.5)) * 2 - 1,
        _z(float(ctx.get("days_negative_30d", 0)), "days_negative"),
        _z(float(ctx.get("tx_count_30d", 0)), "tx_count"),
        _z(lg(ctx.get("tx_volume_30d", 0)), "volume_log"),
        min(2.0, float(ctx.get("spend_to_income_ratio", 1.0))) - 1.0,
        max(-1.0, min(1.0, float(ctx.get("savings_rate", 0.0)))),
        float(ctx.get("largest_tx_to_income", 0.0)) - 0.5,
        _z(float(ctx.get("unique_counterparties", 0)), "counterparties"),
        _z(lg(ctx.get("account_age_days", 0) / 30), "age_months_log"),
        float(ctx.get("active_days_ratio_90d", 0.5)) * 2 - 1,
        (float(ctx.get("kyc_level_rank", 1)) - 2.5) / 1.5,
        float(ctx.get("active_loans", 0)),
        float(ctx.get("loan_to_income_ratio", 0.0)),
        float(ctx.get("repayment_history_score", 0.8)) * 2 - 1,
        float(ctx.get("bnpl_utilisation", 0.0)),
        float(ctx.get("wash_transfer_ratio", 0.0)),
        float(ctx.get("burst_before_application", 0.0)),
    ]
    assert len(v) == CREDIT_FEATURE_DIM
    return np.array(v, dtype=np.float32)
