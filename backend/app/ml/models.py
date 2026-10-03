"""PyTorch model definitions — pure torch, no torch_geometric dependency.

All models run inference on CPU (torch.inference_mode, single thread pool
tunable via torch.set_num_threads). The GNN uses a dense normalized
adjacency implementation which is exact for the small subgraphs
(neighborhood around one account) used at inference time.
"""

from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F

from app.ml.features import FEATURE_DIM, GRAPH_NODE_DIM


class FraudMLP(nn.Module):
    """Tabular fraud classifier — the production workhorse."""

    def __init__(self, in_dim: int = FEATURE_DIM, hidden: int = 64, dropout: float = 0.2):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(hidden, hidden), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(hidden, 32), nn.ReLU(),
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self.net(x)).squeeze(-1)


class FraudAutoencoder(nn.Module):
    """Unsupervised anomaly detector — catches novel fraud patterns
    the supervised model has never seen. Score = reconstruction error."""

    def __init__(self, in_dim: int = FEATURE_DIM, bottleneck: int = 8):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(in_dim, 32), nn.ReLU(),
            nn.Linear(32, bottleneck),
        )
        self.decoder = nn.Sequential(
            nn.Linear(bottleneck, 32), nn.ReLU(),
            nn.Linear(32, in_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.decoder(self.encoder(x))

    def anomaly_score(self, x: torch.Tensor) -> torch.Tensor:
        recon = self.forward(x)
        return ((recon - x) ** 2).mean(dim=-1)


class TxnGCN(nn.Module):
    """Graph convolutional fraud scorer over the account-transfer graph.
    Returns raw logits; apply sigmoid for probabilities.

    Pure-torch dense GCN (Kipf-Welling), 2 layers + readout MLP.
    Input: node features [N, D], adjacency [N, N] (weighted by transfer volume).
    Output: per-node fraud logit.
    """

    def __init__(self, in_dim: int = GRAPH_NODE_DIM, hidden: int = 32):
        super().__init__()
        self.w1 = nn.Linear(in_dim, hidden)
        self.w2 = nn.Linear(hidden, hidden)
        self.skip = nn.Linear(in_dim, hidden)  # residual: preserve per-node signal
        self.head = nn.Linear(hidden, 1)

    @staticmethod
    def normalize_adjacency(adj: torch.Tensor) -> torch.Tensor:
        n = adj.size(0)
        a_hat = adj + torch.eye(n, device=adj.device)
        deg = a_hat.sum(dim=1).clamp(min=1e-6)
        d_inv_sqrt = deg.pow(-0.5)
        return d_inv_sqrt.unsqueeze(1) * a_hat * d_inv_sqrt.unsqueeze(0)

    def forward(self, x: torch.Tensor, adj: torch.Tensor) -> torch.Tensor:
        a_norm = self.normalize_adjacency(adj)
        h = F.relu(a_norm @ self.w1(x) + self.skip(x))
        # No dropout: at inference-subgraph scale (<=1k nodes) dropout destabilises
        # optimisation; generalisation is enforced by the train-time quality gate.
        h = F.relu(a_norm @ self.w2(h) + h)
        return self.head(h).squeeze(-1)  # logits — apply sigmoid at inference


class CreditMLP(nn.Module):
    """Credit default-risk scorer (PD model). Input: credit bureau +
    financial features vector (25 dims, defined in credit_risk_service)."""

    def __init__(self, in_dim: int = 25, hidden: int = 48):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden), nn.ReLU(),
            nn.Linear(hidden, hidden), nn.ReLU(),
            nn.Linear(hidden, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self.net(x)).squeeze(-1)


MODEL_REGISTRY = {
    "fraud_mlp": FraudMLP,
    "fraud_autoencoder": FraudAutoencoder,
    "fraud_gnn": TxnGCN,
    "credit_mlp": CreditMLP,
}


def load_model(name: str, weights_path: str, device: Optional[torch.device] = None) -> nn.Module:
    """Load a registered model with trained weights for CPU inference."""
    device = device or torch.device("cpu")
    model = MODEL_REGISTRY[name]()
    state = torch.load(weights_path, map_location=device, weights_only=True)
    model.load_state_dict(state)
    model.to(device).eval()
    return model
