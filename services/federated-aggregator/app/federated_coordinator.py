"""
NEXUS Federated Coordinator — Implements FedAvg with differential privacy.
Each org contributes local gradient updates without sharing raw data.
"""
from __future__ import annotations

import math

import time
import uuid
from typing import Any

import numpy as np
import structlog

from nexus_types.models import FairnessMetric, FederatedGradient

logger = structlog.get_logger(__name__)

MIN_PARTICIPANTS = 3
LEARNING_RATE = 0.01
THRESHOLD_CLIP_MIN = 0.5
THRESHOLD_CLIP_MAX = 0.95
MAX_EPSILON = 1.0
DP_SIGMA_TARGET_EPSILON = 0.5
DP_DELTA = 1e-5


class FederatedCoordinator:
    """
    Federated Averaging (FedAvg) with differential privacy.
    Aggregates local gradient updates from participating orgs
    to improve the global fairness model.
    """

    def __init__(self) -> None:
        # Global model: threshold vector per protected attribute
        self.global_model: dict[str, list[float]] = {}
        # Current round gradients: org_id -> FederatedGradient
        self.round_gradients: dict[str, FederatedGradient] = {}
        self.round_id: str = str(uuid.uuid4())[:8]
        self.participating_orgs: set[str] = set()
        self.round_history: list[dict[str, Any]] = []

    def register_gradient(self, gradient: FederatedGradient) -> dict[str, Any]:
        """
        Accept a differentially private gradient update from an org.
        Validate: epsilon ≤ 1.0 (refuse updates that spent too much privacy budget).
        """
        # Validate privacy budget
        if gradient.epsilon_spent > MAX_EPSILON:
            logger.warn(
                "Rejecting gradient — epsilon too high",
                org_id=gradient.org_id,
                epsilon=gradient.epsilon_spent,
                max_epsilon=MAX_EPSILON,
            )
            return {
                "accepted": False,
                "reason": f"Privacy budget exceeded: epsilon={gradient.epsilon_spent} > max={MAX_EPSILON}",
            }

        # Store gradient
        self.round_gradients[gradient.org_id] = gradient
        self.participating_orgs.add(gradient.org_id)

        logger.info(
            "Gradient registered",
            org_id=gradient.org_id,
            round_id=self.round_id,
            participants=len(self.round_gradients),
            min_required=MIN_PARTICIPANTS,
        )

        result: dict[str, Any] = {
            "accepted": True,
            "round_id": self.round_id,
            "participants": len(self.round_gradients),
            "aggregation_triggered": False,
        }

        # Trigger aggregation if enough participants
        if len(self.round_gradients) >= MIN_PARTICIPANTS:
            self.aggregate()
            result["aggregation_triggered"] = True
            result["new_round_id"] = self.round_id

        return result

    def aggregate(self) -> dict[str, Any]:
        """
        FedAvg: compute weighted average of all gradients.
        Weight = sqrt(sample_count).
        Apply to global model.
        Clip to valid threshold ranges.
        """
        if not self.round_gradients:
            return {"aggregated": False, "reason": "No gradients to aggregate"}

        logger.info(
            "Starting federated aggregation",
            round_id=self.round_id,
            participants=len(self.round_gradients),
        )

        # Compute weights: sqrt(sample_count) for each participant
        weights: dict[str, float] = {}
        total_weight = 0.0

        for org_id, gradient in self.round_gradients.items():
            w = math.sqrt(max(gradient.sample_count, 1))
            weights[org_id] = w
            total_weight += w

        if total_weight == 0:
            return {"aggregated": False, "reason": "Zero total weight"}

        # Normalize weights
        for org_id in weights:
            weights[org_id] /= total_weight

        # Compute weighted average gradient
        gradient_dim = len(next(iter(self.round_gradients.values())).gradient_vector)
        aggregated_gradient = np.zeros(gradient_dim)

        for org_id, gradient in self.round_gradients.items():
            grad_array = np.array(gradient.gradient_vector[:gradient_dim])
            # Pad or truncate to match dimension
            if len(grad_array) < gradient_dim:
                grad_array = np.pad(grad_array, (0, gradient_dim - len(grad_array)))
            aggregated_gradient += weights[org_id] * grad_array

        # Apply to global model
        # Initialize global model if needed
        all_attrs = set()
        for gradient in self.round_gradients.values():
            all_attrs.update(gradient.protected_attributes)

        if not self.global_model:
            # Initialize with current aggregated gradient
            per_attr_dim = gradient_dim // max(len(all_attrs), 1)
            for i, attr in enumerate(sorted(all_attrs)):
                start = i * per_attr_dim
                end = min(start + per_attr_dim, gradient_dim)
                self.global_model[attr] = list(
                    np.clip(
                        0.5 + LEARNING_RATE * aggregated_gradient[start:end],
                        THRESHOLD_CLIP_MIN,
                        THRESHOLD_CLIP_MAX,
                    )
                )
        else:
            # Update existing model
            per_attr_dim = gradient_dim // max(len(all_attrs), 1)
            for i, attr in enumerate(sorted(all_attrs)):
                start = i * per_attr_dim
                end = min(start + per_attr_dim, gradient_dim)

                if attr in self.global_model:
                    current = np.array(self.global_model[attr])
                    update = LEARNING_RATE * aggregated_gradient[start:end]
                    # Pad/truncate
                    if len(update) < len(current):
                        update = np.pad(update, (0, len(current) - len(update)))
                    elif len(update) > len(current):
                        update = update[:len(current)]
                    self.global_model[attr] = list(
                        np.clip(current + update, THRESHOLD_CLIP_MIN, THRESHOLD_CLIP_MAX)
                    )
                else:
                    self.global_model[attr] = list(
                        np.clip(
                            0.5 + LEARNING_RATE * aggregated_gradient[start:end],
                            THRESHOLD_CLIP_MIN,
                            THRESHOLD_CLIP_MAX,
                        )
                    )

        # Record round history
        round_summary = {
            "round_id": self.round_id,
            "participants": list(self.round_gradients.keys()),
            "participant_count": len(self.round_gradients),
            "aggregated_at": int(time.time() * 1000),
            "global_model_snapshot": {k: v[:3] for k, v in self.global_model.items()},
        }
        self.round_history.append(round_summary)

        logger.info(
            "Federated aggregation complete",
            round_id=self.round_id,
            participants=len(self.round_gradients),
            global_model_dims={k: len(v) for k, v in self.global_model.items()},
        )

        # Clear round state
        old_round_id = self.round_id
        self.round_gradients = {}
        self.round_id = str(uuid.uuid4())[:8]

        return {
            "aggregated": True,
            "completed_round_id": old_round_id,
            "new_round_id": self.round_id,
            "participants": round_summary["participant_count"],
        }

    def compute_local_gradient(
        self,
        org_id: str,
        local_metrics: list[FairnessMetric],
    ) -> FederatedGradient:
        """
        Compute gradient of fairness loss w.r.t. global threshold vector.
        Apply Gaussian differential privacy noise.
        """
        # Compute fairness loss gradient
        gradient_values: list[float] = []
        protected_attrs: list[str] = []
        sample_count = 0

        for metric in local_metrics:
            if metric.protected_attribute and metric.protected_attribute not in protected_attrs:
                protected_attrs.append(metric.protected_attribute)

            sample_count += metric.sample_count

            # Gradient: how much the threshold needs to change to approach compliance
            if metric.is_violated:
                # Positive gradient = need to lower threshold
                gap = metric.value - metric.threshold
                gradient_values.append(-gap)  # Push toward compliance
            else:
                # Small positive gradient = maintain current direction
                gradient_values.append(0.01)

        if not gradient_values:
            gradient_values = [0.0]

        # Apply Gaussian differential privacy noise
        # σ calibrated for ε=0.5, δ=1e-5
        # Using the Gaussian mechanism: σ = Δf * sqrt(2 * ln(1.25/δ)) / ε
        sensitivity = 1.0  # Sensitivity of our gradient function
        sigma = sensitivity * math.sqrt(2 * math.log(1.25 / DP_DELTA)) / DP_SIGMA_TARGET_EPSILON

        rng = np.random.default_rng()
        noise = rng.normal(0, sigma, len(gradient_values))
        noisy_gradient = [float(g + n) for g, n in zip(gradient_values, noise)]

        return FederatedGradient(
            org_id=org_id,
            round_id=self.round_id,
            gradient_vector=noisy_gradient,
            sample_count=sample_count,
            epsilon_spent=DP_SIGMA_TARGET_EPSILON,
            delta=DP_DELTA,
            protected_attributes=protected_attrs,
        )
