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
