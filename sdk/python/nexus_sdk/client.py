"""
NEXUS SDK Client — NexusClient for async monitoring and synchronous interception.
"""
from __future__ import annotations

import json
import queue
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

import requests


@dataclass
class InterceptResponse:
    """Response from the NEXUS interceptor."""
    event_id: str
    original_decision: str
    final_decision: str
    was_intercepted: bool
    intervention_type: str = "none"
    intervention_reason: Optional[str] = None
    applied_corrections: list[dict[str, Any]] = field(default_factory=list)
    latency_ms: float = 0.0
    interceptor_version: str = "1.0.0"


class NexusClient:
    """
    NEXUS SDK Client.

    mode="async": fire-and-forget logging (for monitoring only)
    mode="intercept": SYNCHRONOUS — block and wait for InterceptResponse
                      before returning the decision to the caller
    """

    def __init__(
        self,
        api_key: str,
        org_id: str,
        model_id: str,
        domain: str = "hiring",
        mode: str = "async",
        base_url: str = "https://api.nexus.ai",
        batch_size: int = 100,
        flush_interval_ms: int = 500,
    ) -> None:
        self.api_key = api_key
        self.org_id = org_id
        self.model_id = model_id
        self.domain = domain
        self.mode = mode
        self.base_url = base_url.rstrip("/")
        self.batch_size = batch_size
        self.flush_interval_ms = flush_interval_ms

        self._queue: queue.Queue[dict[str, Any]] = queue.Queue()
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "NexusSDK/1.0.0",
        })

        # Background drainer thread
        self._running = True
        self._drainer_thread = threading.Thread(
            target=self._drain_loop, daemon=True, name="nexus-drainer"
        )
        self._drainer_thread.start()

    def log_decision(
        self,
        decision: str,
        confidence: float,
        features: dict[str, Any],
        protected_attributes: Optional[dict[str, str]] = None,
        individual_id: Optional[str] = None,
    ) -> Optional[InterceptResponse]:
        """
        Log a decision event.

        If mode="async": enqueue and return immediately.
        If mode="intercept": POST to /v1/intercept synchronously and return InterceptResponse.
        """
        event_id = str(uuid.uuid4())
        timestamp = int(time.time() * 1000)

        # Build protected attributes list
        pa_list = []
        if protected_attributes:
            for name, value in protected_attributes.items():
                pa_list.append({"name": name, "value": value})

        event = {
            "event_id": event_id,
            "org_id": self.org_id,
            "model_id": self.model_id,
            "timestamp": timestamp,
            "decision": decision,
            "confidence": confidence,
            "features": features,
            "protected_attributes": pa_list,
            "individual_id": individual_id,
            "domain": self.domain,
        }

        if self.mode == "intercept":
            return self._intercept_sync(event)
        else:
            self._queue.put(event)
            return None

    def _intercept_sync(self, event: dict[str, Any]) -> InterceptResponse:
        """
        Synchronous interception: POST to /v1/intercept.
        The caller REPLACES their original decision with response.final_decision.
        """
        url = f"{self.base_url}/v1/intercept"
        max_retries = 5
        backoff_ms = [100, 200, 400, 800, 1600]

        for attempt in range(max_retries):
            try:
                response = self._session.post(url, json=event, timeout=5.0)

                if response.status_code == 200:
                    data = response.json()
                    return InterceptResponse(
                        event_id=data.get("event_id", event["event_id"]),
                        original_decision=data.get("original_decision", event["decision"]),
                        final_decision=data.get("final_decision", event["decision"]),
                        was_intercepted=data.get("was_intercepted", False),
                        intervention_type=data.get("intervention_type", "none"),
                        intervention_reason=data.get("intervention_reason"),
                        applied_corrections=data.get("applied_corrections", []),
                        latency_ms=data.get("latency_ms", 0.0),
                        interceptor_version=data.get("interceptor_version", "1.0.0"),
                    )

                # Retry on server errors
                if response.status_code >= 500:
                    time.sleep(backoff_ms[attempt] / 1000)
                    continue

                # Non-retryable error: return original decision
                break

            except (requests.ConnectionError, requests.Timeout):
                if attempt < max_retries - 1:
                    time.sleep(backoff_ms[attempt] / 1000)
                    continue
                break
            except Exception:
                break

        # Fallback: return original decision unchanged
        return InterceptResponse(
            event_id=event["event_id"],
            original_decision=event["decision"],
            final_decision=event["decision"],
            was_intercepted=False,
            intervention_reason="sdk_fallback_no_connection",
        )

    def _drain_loop(self) -> None:
        """Background thread: drain queue in batches."""
        while self._running:
            batch: list[dict[str, Any]] = []

            try:
                # Wait for first item or timeout
                item = self._queue.get(timeout=self.flush_interval_ms / 1000)
                batch.append(item)
            except queue.Empty:
                continue

            # Collect remaining items up to batch_size
            while len(batch) < self.batch_size:
                try:
                    item = self._queue.get_nowait()
                    batch.append(item)
                except queue.Empty:
                    break

            if batch:
                self._send_batch(batch)

    def _send_batch(self, batch: list[dict[str, Any]]) -> None:
        """Send a batch of events to the gateway."""
        url = f"{self.base_url}/v1/events"
        max_retries = 5
        backoff_ms = [100, 200, 400, 800, 1600]

        for event in batch:
            for attempt in range(max_retries):
                try:
                    response = self._session.post(url, json=event, timeout=5.0)
                    if response.status_code < 500:
                        break
                    time.sleep(backoff_ms[attempt] / 1000)
                except (requests.ConnectionError, requests.Timeout):
                    if attempt < max_retries - 1:
                        time.sleep(backoff_ms[attempt] / 1000)
                except Exception:
                    break

    def flush(self) -> None:
        """Block until the queue is empty."""
        while not self._queue.empty():
            time.sleep(0.05)
        # Give drainer time to finish
        time.sleep(0.2)

    def close(self) -> None:
        """Shutdown the client."""
        self.flush()
        self._running = False
        self._session.close()

    def __enter__(self) -> "NexusClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
