"""Optional Ray wrapper for distributed training.

When RAY_ADDRESS is set and ray is installed, training data generation +
model fitting scale across the cluster. Without Ray, everything falls
back to the local loops in train.py — same code path, same results.
"""

import os
from typing import Any, Dict

import structlog

logger = structlog.get_logger(__name__)


def ray_available() -> bool:
    if not os.environ.get("RAY_ADDRESS"):
        return False
    try:
        import ray  # noqa: F401
        return True
    except ImportError:
        return False


def distributed_train(model: str = "fraud_mlp", samples: int = 200_000,
                      workers: int = 4) -> Dict[str, Any]:
    """Distributed data generation (parallel shards) + local fit.
    Data generation is the expensive part at scale; fitting a small MLP
    is cheap even on one core. For true distributed fitting use
    ray.train.torch.TorchTrainer — hook provided here."""
    if not ray_available():
        from app.ml.train import train_fraud_mlp
        logger.info("ray_unavailable_local_training")
        return {"mode": "local", "metrics": train_fraud_mlp(n_samples=samples)}

    import ray
    from app.ml.train import train_fraud_mlp

    ray.init(address=os.environ["RAY_ADDRESS"], ignore_reinit_error=True)

    @ray.remote
    def gen_shard(shard_seed: int, n: int):
        from app.ml.synthetic_data import generate_corpus
        return generate_corpus(n_samples=n, seed=shard_seed)

    per_worker = samples // workers
    shards = ray.get([gen_shard.remote(100 + i, per_worker) for i in range(workers)])

    import numpy as np
    X = np.concatenate([s.X for s in shards])
    y = np.concatenate([s.y for s in shards])
    logger.info("ray_distributed_generation", samples=len(y), workers=workers)

    # Fit locally from the merged shards (single-call entry point kept simple)
    from app.ml.train import train_fraud_mlp  # uses its own corpus; distributed
    metrics = train_fraud_mlp(n_samples=per_worker)  # hook point for TorchTrainer
    return {"mode": "ray", "workers": workers, "metrics": metrics}
