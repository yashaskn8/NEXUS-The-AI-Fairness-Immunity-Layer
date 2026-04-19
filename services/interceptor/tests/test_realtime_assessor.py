"""
NEXUS Tests — Realtime Assessor tests.
"""
from __future__ import annotations

import sys
import time

sys.path.insert(0, "shared/python")
sys.path.insert(0, ".")

import pytest
import asyncio

from nexus_types.models import (
    DecisionEvent,
    DecisionType,
    GroupStats,
    InterventionType,
    ProtectedAttribute,
)
from app.realtime_assessor import RealtimeAssessor
from app.causal_cache import CausalCache


class MockCausalCache:
    """Mock cache for testing without Redis."""

    async def connect(self):
        pass

    async def close(self):
        pass

    async def get_proxy_features(self, org_id, model_id):
        return None

    async def get_shap_top5(self, org_id, model_id):
        return None

    async def get_group_stats(self, org_id, model_id):
        return None


@pytest.fixture
def assessor():
    cache = MockCausalCache()
    a = RealtimeAssessor(causal_cache=cache)
    return a


def _make_event(decision="rejected", confidence=0.6, gender="female"):
    return DecisionEvent(
        event_id="test-001",
        org_id="test-org",
        model_id="test-model",
        decision=DecisionType(decision),
        confidence=confidence,
        features={"years_exp": 5, "gpa": 3.5},
        protected_attributes=[ProtectedAttribute(name="gender", value=gender)],
    )


@pytest.mark.asyncio
async def test_no_intervention_when_compliant(assessor):
    """DI = 0.92 → was_intercepted = False."""
    # Pre-populate cache with compliant stats
    cache_key = ("test-org", "test-model")
    assessor._group_stats_cache[cache_key] = {
        "gender": GroupStats(
            approval_rates={"male": 0.80, "female": 0.74},  # DI = 0.92
            confidence_percentiles={},
            active_thresholds={"global": 0.5, "male": 0.5, "female": 0.5},
            last_updated=int(time.time() * 1000),
        )
    }
    assessor._cache_timestamps[cache_key] = time.time()

    event = _make_event(decision="rejected", confidence=0.6, gender="female")
    result = await assessor.assess(event)
    assert not result.was_intercepted


@pytest.mark.asyncio
async def test_threshold_intervention_triggered(assessor):
    """DI = 0.73, decision=rejected, confidence=0.62 → was_intercepted = True."""
    cache_key = ("test-org", "test-model")
    assessor._group_stats_cache[cache_key] = {
        "gender": GroupStats(
            approval_rates={"male": 0.82, "female": 0.60},  # DI ≈ 0.73
            confidence_percentiles={"male": [0.7, 0.8], "female": [0.4, 0.6]},
            active_thresholds={"global": 0.65, "male": 0.65, "female": 0.55},
            last_updated=int(time.time() * 1000),
        )
    }
    assessor._cache_timestamps[cache_key] = time.time()

    event = _make_event(decision="rejected", confidence=0.62, gender="female")
    result = await assessor.assess(event)
    assert result.was_intercepted
    assert result.intervention_type == InterventionType.THRESHOLD


@pytest.mark.asyncio
async def test_latency_under_50ms(assessor):
    """Assert assess() completes in < 50ms."""
    cache_key = ("test-org", "test-model")
    assessor._group_stats_cache[cache_key] = {
        "gender": GroupStats(
            approval_rates={"male": 0.80, "female": 0.70},
            confidence_percentiles={},
            active_thresholds={"global": 0.5},
            last_updated=int(time.time() * 1000),
        )
    }
    assessor._cache_timestamps[cache_key] = time.time()

    event = _make_event()
    start = time.perf_counter()
    await assessor.assess(event)
    elapsed_ms = (time.perf_counter() - start) * 1000
    assert elapsed_ms < 50, f"assess() took {elapsed_ms:.1f}ms, expected < 50ms"


@pytest.mark.asyncio
async def test_fallback_on_cache_miss(assessor):
    """Missing cache → pass through unchanged."""
    event = _make_event(decision="rejected", confidence=0.6)
    result = await assessor.assess(event)
    assert not result.was_intercepted
    assert result.final_decision == DecisionType.REJECTED
