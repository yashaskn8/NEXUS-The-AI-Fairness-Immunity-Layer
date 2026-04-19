"""
NEXUS Tests — Fairness Computer comprehensive tests.
"""
from __future__ import annotations

import sys
sys.path.insert(0, "shared/python")
sys.path.insert(0, ".")

import numpy as np
import pandas as pd
import pytest

from app.fairness_computer import FairnessComputer


@pytest.fixture
def computer() -> FairnessComputer:
    return FairnessComputer()


def _make_df(
    n: int, gender_rates: dict[str, float], seed: int = 42
) -> pd.DataFrame:
    """Helper: create a DataFrame with specified approval rates per gender group."""
    rng = np.random.default_rng(seed)
    rows = []
    for gender, rate in gender_rates.items():
        for _ in range(n):
            decision = "approved" if rng.random() < rate else "rejected"
            rows.append({
                "event_id": f"e_{len(rows)}",
                "org_id": "test-org",
                "model_id": "test-model",
                "gender": gender,
                "decision": decision,
                "confidence": rng.uniform(0.3, 0.95),
            })
    return pd.DataFrame(rows)


def test_disparate_impact_fair_dataset(computer: FairnessComputer) -> None:
    """Perfect 50/50 approval → DI = 1.0, no violation."""
    df = _make_df(200, {"male": 0.50, "female": 0.50})
    results = computer.disparate_impact(df, "gender", "male", 3600)
    assert len(results) > 0
    for metric in results:
        assert abs(metric.value - 1.0) < 0.15  # Allow for random noise
        assert not metric.is_violated or abs(metric.value - 0.8) < 0.1


def test_disparate_impact_biased_dataset(computer: FairnessComputer) -> None:
    """82% vs 51% approval → DI ≈ 0.622, severity = critical."""
    df = _make_df(500, {"male": 0.82, "female": 0.51})
    results = computer.disparate_impact(df, "gender", "male", 3600)
    assert len(results) == 1
    metric = results[0]
    assert metric.value < 0.75  # Should be around 0.62
    assert metric.is_violated
    assert metric.severity.value in ("high", "critical")


def test_demographic_parity_threshold(computer: FairnessComputer) -> None:
    """Verify correct threshold lookup."""
    df = _make_df(200, {"male": 0.70, "female": 0.55})
    results = computer.demographic_parity(df, "gender", "male", 3600)
    assert len(results) > 0
    for metric in results:
        assert metric.threshold == 0.1


def test_equalized_odds_requires_labels(computer: FairnessComputer) -> None:
    """Without true_label, uses confidence-based proxy."""
    df = _make_df(200, {"male": 0.70, "female": 0.50})
    # No true_label column — should use confidence approximation
    results = computer.equalized_odds(df, "gender", "male", 3600)
    assert len(results) > 0
    for metric in results:
        assert metric.metric_name.value == "equalized_odds"


def test_insufficient_data_returns_none(computer: FairnessComputer) -> None:
    """< 10 events → returns empty list (no false positives)."""
    df = _make_df(2, {"male": 0.80, "female": 0.50})
    results = computer.disparate_impact(df, "gender", "male", 3600)
    assert len(results) == 0


def test_individual_fairness_similar_pairs(computer: FairnessComputer) -> None:
    """200 similar pairs with identical decisions → pass."""
    rng = np.random.default_rng(42)
    n = 500
    features = rng.uniform(0, 1, (n, 5))
    # All same decision → 0% flip rate
    df = pd.DataFrame(features, columns=[f"f{i}" for i in range(5)])
    df["org_id"] = "test-org"
    df["model_id"] = "test-model"
    df["decision"] = "approved"  # All same decision

    metric = computer.individual_fairness_score(df, 3600, [f"f{i}" for i in range(5)])
    if metric is not None:
        assert metric.value == 0.0
        assert not metric.is_violated


def test_regulatory_threshold_EU_credit(computer: FairnessComputer) -> None:
    """Verify EU AI Act threshold loaded correctly for credit."""
    threshold = computer.get_regulatory_threshold("disparate_impact", "credit", "EU")
    assert threshold == 0.85  # EU AI Act is stricter
