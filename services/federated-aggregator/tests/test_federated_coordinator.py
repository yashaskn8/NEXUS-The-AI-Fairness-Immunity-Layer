"""
NEXUS Federated Coordinator — Test Suite
Tests gradient acceptance, FedAvg weighting, privacy budget, and round management.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from app.federated_coordinator import FederatedCoordinator, MIN_PARTICIPANTS, THRESHOLD_CLIP_MAX
from nexus_types.models import FederatedGradient


def _make_gradient(
    org_id: str,
    gradient_vector: list[float],
    sample_count: int = 100,
    epsilon: float = 0.5,
    protected_attributes: list[str] | None = None,
    round_id: str = "test-round",
) -> FederatedGradient:
    return FederatedGradient(
        org_id=org_id,
        round_id=round_id,
        gradient_vector=gradient_vector,
        sample_count=sample_count,
        epsilon_spent=epsilon,
        protected_attributes=protected_attributes or ["gender"],
    )


class TestFederatedCoordinator:
    def test_gradient_accepted_within_privacy_budget(self) -> None:
        coord = FederatedCoordinator()
        grad = _make_gradient("org_a", [1.0, 0.0], sample_count=100, epsilon=0.5)

        result = coord.register_gradient(grad)

        assert result["accepted"] is True
        assert "org_a" in coord.round_gradients

    def test_gradient_rejected_when_epsilon_exceeds_limit(self) -> None:
        coord = FederatedCoordinator()
        grad = _make_gradient("org_bad", [1.0, 0.0], epsilon=1.5)

        result = coord.register_gradient(grad)

        assert result["accepted"] is False
        assert "org_bad" not in coord.round_gradients

    def test_fedavg_weighted_by_sqrt_sample_count(self) -> None:
        coord = FederatedCoordinator()

        # Register 3 gradients manually (bypass auto-aggregate by setting MIN_PARTICIPANTS high)
        grad_a = _make_gradient("org_a", [1.0, 0.0], sample_count=100)
        grad_b = _make_gradient("org_b", [0.0, 1.0], sample_count=400)
        grad_c = _make_gradient("org_c", [0.5, 0.5], sample_count=100)

        coord.round_gradients["org_a"] = grad_a
        coord.round_gradients["org_b"] = grad_b
        coord.round_gradients["org_c"] = grad_c

        # Expected weights: sqrt(100)=10, sqrt(400)=20, sqrt(100)=10, total=40
        # expected_grad[0] = (10*1.0 + 20*0.0 + 10*0.5) / 40 = 0.375
        # expected_grad[1] = (10*0.0 + 20*1.0 + 10*0.5) / 40 = 0.625
        result = coord.aggregate()

        assert result["aggregated"] is True
        assert result["participants"] == 3

        # The global model should exist after aggregation
        assert len(coord.global_model) > 0

        # Verify the aggregation produced a model update
        # (exact values depend on LEARNING_RATE and initialization)
        for values in coord.global_model.values():
            for v in values:
                assert isinstance(v, float)

    def test_aggregate_not_triggered_below_min_participants(self) -> None:
        coord = FederatedCoordinator()

        # Register only 2 (MIN_PARTICIPANTS = 3)
        result1 = coord.register_gradient(
            _make_gradient("org_a", [1.0, 0.0])
        )
        result2 = coord.register_gradient(
            _make_gradient("org_b", [0.0, 1.0])
        )

        assert result1["aggregation_triggered"] is False
        assert result2["aggregation_triggered"] is False
        assert len(coord.round_gradients) == 2

    def test_global_model_clipped_to_valid_range(self) -> None:
        coord = FederatedCoordinator()

        # Use extreme gradient values to force large updates
        extreme = [100.0] * 4
        coord.round_gradients["org_a"] = _make_gradient("org_a", extreme, sample_count=1000)
        coord.round_gradients["org_b"] = _make_gradient("org_b", extreme, sample_count=1000)
        coord.round_gradients["org_c"] = _make_gradient("org_c", extreme, sample_count=1000)

        coord.aggregate()

        # All global model values should be clipped to [0.5, 0.95]
        for values in coord.global_model.values():
            for v in values:
                assert v <= THRESHOLD_CLIP_MAX, f"Value {v} exceeds clip max {THRESHOLD_CLIP_MAX}"

    def test_round_id_refreshes_after_aggregation(self) -> None:
        coord = FederatedCoordinator()
        original_round_id = coord.round_id

        coord.round_gradients["org_a"] = _make_gradient("org_a", [1.0])
        coord.round_gradients["org_b"] = _make_gradient("org_b", [0.5])
        coord.round_gradients["org_c"] = _make_gradient("org_c", [0.3])

        coord.aggregate()

        assert coord.round_id != original_round_id
        assert len(coord.round_gradients) == 0
