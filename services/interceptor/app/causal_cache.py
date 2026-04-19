"""
NEXUS Causal Cache — Thin read-through cache to Redis for causal graph data.
TTL: 120 seconds. On cache miss: return None (never block the intercept path).
"""
from __future__ import annotations

import json
import os
from typing import Any, Optional

import structlog

logger = structlog.get_logger(__name__)

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
CACHE_TTL = 120  # seconds


class CausalCache:
    """
    Read-through cache to Redis for causal graph and SHAP data.
    Keys:
      nexus:causal:{org_id}:{model_id}:proxies
      nexus:causal:{org_id}:{model_id}:shap_top5
      nexus:thresholds:{org_id}:{model_id}:{protected_attr}
      nexus:group_stats:{org_id}:{model_id}
    TTL: 120 seconds (causal engine refreshes every 60s)
    On cache miss: return None (never block intercept path)
    """

    def __init__(self) -> None:
        self._redis: Any = None
        self._local_cache: dict[str, tuple[float, Any]] = {}

    async def connect(self) -> None:
        """Connect to Redis."""
        try:
            import redis.asyncio as aioredis
            self._redis = aioredis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=1,
            )
            await self._redis.ping()
            logger.info("CausalCache connected to Redis", host=REDIS_HOST, port=REDIS_PORT)
        except Exception as exc:
            logger.warning("CausalCache failed to connect to Redis — running in local-only mode", error=str(exc))
            self._redis = None

    async def close(self) -> None:
        """Close Redis connection."""
        if self._redis:
            await self._redis.close()

    async def _get(self, key: str) -> Optional[str]:
        """Get a value from Redis. Returns None on miss or error."""
        if self._redis is None:
            return None
        try:
            value: Optional[str] = await self._redis.get(key)
            return value
        except Exception as exc:
            logger.debug("Redis get failed", key=key, error=str(exc))
            return None

    async def _set(self, key: str, value: str, ttl: int = CACHE_TTL) -> None:
        """Set a value in Redis with TTL."""
        if self._redis is None:
            return
        try:
            await self._redis.setex(key, ttl, value)
        except Exception as exc:
            logger.debug("Redis set failed", key=key, error=str(exc))

    async def get_proxy_features(
        self, org_id: str, model_id: str
    ) -> Optional[dict[str, Any]]:
        """
        Get proxy feature list for a model.
        Returns: { "proxies": ["feature1", "feature2", ...] } or None
        """
        key = f"nexus:causal:{org_id}:{model_id}:proxies"
        raw = await self._get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return None

    async def get_shap_top5(
        self, org_id: str, model_id: str
    ) -> Optional[list[tuple[str, float]]]:
        """
        Get top 5 SHAP features for a model.
        Returns: [("feature_name", shap_value), ...] or None
        """
        key = f"nexus:causal:{org_id}:{model_id}:shap_top5"
        raw = await self._get(key)
        if raw is None:
            return None
        try:
            parsed = json.loads(raw)
            return [(item[0], float(item[1])) for item in parsed]
        except (json.JSONDecodeError, TypeError, IndexError):
            return None

    async def get_thresholds(
        self, org_id: str, model_id: str, protected_attr: str
    ) -> Optional[dict[str, float]]:
        """
        Get per-group thresholds for a protected attribute.
        Returns: { "group_value": threshold_float, ... } or None
        """
        key = f"nexus:thresholds:{org_id}:{model_id}:{protected_attr}"
        raw = await self._get(key)
        if raw is None:
            return None
        try:
            parsed = json.loads(raw)
            return {k: float(v) for k, v in parsed.items()}
        except (json.JSONDecodeError, TypeError):
            return None

    async def get_group_stats(
        self, org_id: str, model_id: str
    ) -> Optional[dict[str, Any]]:
        """
        Get all GroupStats for a model.
        Returns: { attr_name: GroupStats_dict } or None
        """
        key = f"nexus:group_stats:{org_id}:{model_id}"
        raw = await self._get(key)
        if raw is None:
            return None
        try:
            parsed = json.loads(raw)
            from nexus_types.models import GroupStats
            result: dict[str, GroupStats] = {}
            for attr_name, stats_data in parsed.items():
                result[attr_name] = GroupStats(**stats_data)
            return result
        except (json.JSONDecodeError, TypeError, Exception) as exc:
            logger.debug("Failed to parse group stats", error=str(exc))
            return None

    async def set_proxy_features(
        self, org_id: str, model_id: str, proxies: list[str]
    ) -> None:
        """Set proxy feature list in cache."""
        key = f"nexus:causal:{org_id}:{model_id}:proxies"
        await self._set(key, json.dumps({"proxies": proxies}))

    async def set_shap_top5(
        self, org_id: str, model_id: str, top5: list[tuple[str, float]]
    ) -> None:
        """Set top 5 SHAP features in cache."""
        key = f"nexus:causal:{org_id}:{model_id}:shap_top5"
        await self._set(key, json.dumps(top5))

    async def set_thresholds(
        self, org_id: str, model_id: str, protected_attr: str,
        thresholds: dict[str, float]
    ) -> None:
        """Set per-group thresholds in cache."""
        key = f"nexus:thresholds:{org_id}:{model_id}:{protected_attr}"
        await self._set(key, json.dumps(thresholds))

    async def set_group_stats(
        self, org_id: str, model_id: str,
        stats: dict[str, Any]
    ) -> None:
        """Set GroupStats for a model in cache."""
        key = f"nexus:group_stats:{org_id}:{model_id}"
        # Serialize GroupStats objects
        serialized: dict[str, Any] = {}
        for attr_name, gs in stats.items():
            if hasattr(gs, "model_dump"):
                serialized[attr_name] = gs.model_dump()
            elif isinstance(gs, dict):
                serialized[attr_name] = gs
        await self._set(key, json.dumps(serialized))
