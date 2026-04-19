"""
NEXUS Pub/Sub Consumer — Streaming consumer for decision events.
Buffers events, triggers fairness computation, and updates caches.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from collections import deque
from typing import Any

import structlog
from google.cloud import firestore, pubsub_v1

from nexus_types.models import FairnessMetric
from app.fairness_computer import FairnessComputer
from app.shap_analyzer import SHAPAnalyzer

logger = structlog.get_logger(__name__)

BUFFER_MAX_SIZE = 10_000
COMPUTE_INTERVAL_SECONDS = 30
COMPUTE_EVENT_THRESHOLD = 500


class PubSubConsumer:
    """
    Streaming Pub/Sub consumer for decision events.
    Buffers events per org, triggers fairness computation periodically.
    """

    def __init__(self) -> None:
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "nexus-platform")
        self.subscriber = pubsub_v1.SubscriberClient()
        self.db = firestore.AsyncClient(project=self.project_id)
        self.fairness_computer = FairnessComputer()
        self.shap_analyzer = SHAPAnalyzer()

        # Per-org event buffers
        self.buffers: dict[str, deque[dict[str, Any]]] = {}
        self.event_counts: dict[str, int] = {}
        self.last_compute_time: dict[str, float] = {}

        self._running = False

    async def start(self, subscription_name: str) -> None:
        """Start consuming messages from the subscription."""
        subscription_path = self.subscriber.subscription_path(
            self.project_id, subscription_name
        )

        self._running = True
        logger.info("Starting Pub/Sub consumer", subscription=subscription_name)

        # Start periodic computation task
        asyncio.create_task(self._periodic_compute())

        def callback(message: Any) -> None:
            """Process each incoming message."""
            try:
                data = json.loads(message.data.decode("utf-8"))
                org_id = data.get("org_id", "unknown")

                # Buffer the event
                if org_id not in self.buffers:
                    self.buffers[org_id] = deque(maxlen=BUFFER_MAX_SIZE)
                    self.event_counts[org_id] = 0
                    self.last_compute_time[org_id] = time.time()

                self.buffers[org_id].append(data)
                self.event_counts[org_id] = self.event_counts.get(org_id, 0) + 1

                # Check if we should trigger computation (500 new events)
                if self.event_counts[org_id] >= COMPUTE_EVENT_THRESHOLD:
                    asyncio.get_event_loop().call_soon_threadsafe(
                        asyncio.create_task, self._compute_for_org(org_id)
                    )

                message.ack()

            except Exception as exc:
                logger.error("Failed to process message", error=str(exc))
                message.nack()

        streaming_pull_future = self.subscriber.subscribe(
            subscription_path, callback=callback
        )

        try:
            streaming_pull_future.result()
        except Exception as exc:
            logger.error("Streaming pull failed", error=str(exc))
            streaming_pull_future.cancel()

    async def _periodic_compute(self) -> None:
        """Trigger fairness computation every 30 seconds for active orgs."""
        while self._running:
            await asyncio.sleep(COMPUTE_INTERVAL_SECONDS)

            now = time.time()
            for org_id in list(self.buffers.keys()):
                last_compute = self.last_compute_time.get(org_id, 0)
                if now - last_compute >= COMPUTE_INTERVAL_SECONDS:
                    await self._compute_for_org(org_id)

    async def _compute_for_org(self, org_id: str) -> None:
        """Run fairness computation for an org's buffered events."""
        import pandas as pd

        buffer = self.buffers.get(org_id)
        if not buffer or len(buffer) < 10:
            return

        events = list(buffer)
        self.event_counts[org_id] = 0
        self.last_compute_time[org_id] = time.time()

        logger.info("Computing fairness metrics", org_id=org_id, event_count=len(events))

        try:
            # Convert to DataFrame
            df = pd.DataFrame(events)

            # Extract protected attributes from nested structure
            protected_attrs = set()
            for event in events:
                for pa in event.get("protected_attributes", []):
                    if isinstance(pa, dict):
                        attr_name = pa.get("name", "")
                        attr_value = pa.get("value", "")
                        if attr_name:
                            protected_attrs.add(attr_name)
                            df.loc[df["event_id"] == event.get("event_id"), attr_name] = attr_value

            # Get unique model IDs
            model_ids = df["model_id"].unique() if "model_id" in df.columns else []

            all_metrics: list[FairnessMetric] = []
            violated_metrics: list[FairnessMetric] = []

            for model_id in model_ids:
                model_df = df[df["model_id"] == model_id]

                for attr in protected_attrs:
                    if attr not in model_df.columns:
                        continue

                    groups = model_df[attr].dropna().unique()
                    if len(groups) < 2:
                        continue

                    # Use the group with highest approval rate as reference
                    ref_group = None
                    max_rate = -1.0
                    for g in groups:
                        rate = (model_df[model_df[attr] == g]["decision"] == "approved").mean()
                        if rate > max_rate:
                            max_rate = rate
                            ref_group = g

                    if ref_group is None:
                        continue

                    window = COMPUTE_INTERVAL_SECONDS

                    # Compute all metrics
                    di_metrics = self.fairness_computer.disparate_impact(model_df, attr, str(ref_group), window)
                    dp_metrics = self.fairness_computer.demographic_parity(model_df, attr, str(ref_group), window)
                    eo_metrics = self.fairness_computer.equalized_odds(model_df, attr, str(ref_group), window)
                    pp_metrics = self.fairness_computer.predictive_parity(model_df, attr, str(ref_group), window)

                    all_metrics.extend(di_metrics + dp_metrics + eo_metrics + pp_metrics)

                # Individual fairness (group-agnostic)
                if_metric = self.fairness_computer.individual_fairness_score(model_df, COMPUTE_INTERVAL_SECONDS)
                if if_metric:
                    all_metrics.append(if_metric)

            # Write metrics to Firestore (batch write)
            if all_metrics:
                batch = self.db.batch()
                for metric in all_metrics:
                    doc_ref = self.db.collection("orgs").document(org_id).collection("fairness_metrics").document(metric.metric_id)
                    batch.set(doc_ref, metric.model_dump())

                    if metric.is_violated:
                        violated_metrics.append(metric)

                await batch.commit()
                logger.info("Wrote fairness metrics to Firestore", org_id=org_id, count=len(all_metrics))

            # Write alerts for violations
            if violated_metrics:
                alert_batch = self.db.batch()
                for metric in violated_metrics:
                    alert_ref = self.db.collection("orgs").document(org_id).collection("alerts").document()
                    alert_batch.set(alert_ref, {
                        "metric": metric.model_dump(),
                        "alert_type": "metric_violation",
                        "severity": metric.severity.value,
                        "acknowledged": False,
                        "created_at_ms": int(time.time() * 1000),
                    })
                await alert_batch.commit()
                logger.warn("Metric violations detected", org_id=org_id, count=len(violated_metrics))

            # Update Redis cache for interceptor
            await self._update_redis_cache(org_id, all_metrics, df, list(protected_attrs))

        except Exception as exc:
            logger.error("Fairness computation failed", org_id=org_id, error=str(exc))

    async def _update_redis_cache(
        self,
        org_id: str,
        metrics: list[FairnessMetric],
        df: Any,
        protected_attrs: list[str],
    ) -> None:
        """Update Redis cache keys for the interceptor service."""
        try:
            import redis.asyncio as aioredis

            r = aioredis.Redis(
                host=os.getenv("REDIS_HOST", "localhost"),
                port=int(os.getenv("REDIS_PORT", "6379")),
                decode_responses=True,
            )

            model_ids = df["model_id"].unique() if "model_id" in df.columns else []

            for model_id in model_ids:
                model_df = df[df["model_id"] == model_id]

                group_stats: dict[str, dict[str, Any]] = {}
                for attr in protected_attrs:
                    if attr not in model_df.columns:
                        continue

                    groups = model_df[attr].dropna().unique()
                    approval_rates: dict[str, float] = {}
                    confidence_percentiles: dict[str, list[float]] = {}
                    active_thresholds: dict[str, float] = {}

                    for g in groups:
                        g_df = model_df[model_df[attr] == g]
                        approval_rates[str(g)] = float((g_df["decision"] == "approved").mean())
                        if "confidence" in g_df.columns:
                            confidence_percentiles[str(g)] = g_df["confidence"].astype(float).tolist()
                        active_thresholds[str(g)] = 0.5

                    active_thresholds["global"] = 0.5

                    group_stats[attr] = {
                        "approval_rates": approval_rates,
                        "confidence_percentiles": confidence_percentiles,
                        "active_thresholds": active_thresholds,
                        "last_updated": int(time.time() * 1000),
                    }

                # Write to Redis
                cache_key = f"nexus:group_stats:{org_id}:{model_id}"
                await r.setex(cache_key, 120, json.dumps(group_stats))

            await r.close()
            logger.debug("Updated Redis cache for interceptor", org_id=org_id)

        except Exception as exc:
            logger.warning("Failed to update Redis cache", org_id=org_id, error=str(exc))

    async def stop(self) -> None:
        """Stop the consumer."""
        self._running = False
        logger.info("Pub/Sub consumer stopped")
