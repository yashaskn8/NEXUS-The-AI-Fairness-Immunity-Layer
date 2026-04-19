"""
NEXUS Tests — SDK Client tests.
"""
from __future__ import annotations

import sys
import time
import json
from unittest.mock import MagicMock, patch

sys.path.insert(0, ".")

import pytest

from nexus_sdk.client import NexusClient, InterceptResponse


def test_async_mode_nonblocking():
    """log_decision returns immediately (<1ms) in async mode."""
    client = NexusClient(
        api_key="test-key",
        org_id="test-org",
        model_id="test-model",
        mode="async",
        base_url="http://localhost:9999",
    )

    start = time.perf_counter()
    result = client.log_decision(
        decision="approved",
        confidence=0.85,
        features={"x": 1},
        protected_attributes={"gender": "female"},
    )
    elapsed_ms = (time.perf_counter() - start) * 1000

    assert result is None  # Async mode returns None
    assert elapsed_ms < 10, f"log_decision took {elapsed_ms:.1f}ms, expected <10ms"
    client.close()


def test_intercept_mode_returns_response():
    """Mock HTTP → InterceptResponse returned."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "event_id": "test-id",
        "original_decision": "rejected",
        "final_decision": "approved",
        "was_intercepted": True,
        "intervention_type": "threshold",
        "intervention_reason": "DI violation corrected",
        "applied_corrections": [],
        "latency_ms": 42.5,
        "interceptor_version": "1.0.0",
    }

    client = NexusClient(
        api_key="test-key",
        org_id="test-org",
        model_id="test-model",
        mode="intercept",
        base_url="http://localhost:9999",
    )

    with patch.object(client._session, "post", return_value=mock_response):
        result = client.log_decision(
            decision="rejected",
            confidence=0.55,
            features={"x": 1},
        )

    assert result is not None
    assert isinstance(result, InterceptResponse)
    assert result.was_intercepted is True
    assert result.final_decision == "approved"
    client.close()


def test_flush_drains_queue():
    """flush() blocks until queue is empty."""
    client = NexusClient(
        api_key="test-key",
        org_id="test-org",
        model_id="test-model",
        mode="async",
        base_url="http://localhost:9999",
    )

    for _ in range(5):
        client.log_decision(
            decision="approved",
            confidence=0.9,
            features={"x": 1},
        )

    client.flush()
    assert client._queue.empty()
    client.close()


def test_retry_on_network_failure():
    """Mock 503 twice → succeeds on third."""
    responses = [
        MagicMock(status_code=503),
        MagicMock(status_code=503),
        MagicMock(
            status_code=200,
            json=MagicMock(return_value={
                "event_id": "test",
                "original_decision": "rejected",
                "final_decision": "rejected",
                "was_intercepted": False,
                "intervention_type": "none",
                "applied_corrections": [],
                "latency_ms": 10.0,
            }),
        ),
    ]

    client = NexusClient(
        api_key="test-key",
        org_id="test-org",
        model_id="test-model",
        mode="intercept",
        base_url="http://localhost:9999",
    )

    with patch.object(client._session, "post", side_effect=responses):
        result = client.log_decision(
            decision="rejected",
            confidence=0.6,
            features={"x": 1},
        )

    assert result is not None
    assert result.final_decision == "rejected"
    client.close()


def test_context_manager():
    """Test context manager support."""
    with NexusClient(
        api_key="test-key",
        org_id="test-org",
        model_id="test-model",
        mode="async",
        base_url="http://localhost:9999",
    ) as client:
        client.log_decision(
            decision="approved",
            confidence=0.9,
            features={"x": 1},
        )
    # Should not raise
