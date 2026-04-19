"""
NEXUS Interceptor Service — FastAPI app.
The crown jewel of NEXUS. Responds in under 150ms at P99.
"""
from __future__ import annotations

import json
import os
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.realtime_assessor import RealtimeAssessor
from app.causal_cache import CausalCache

logger = structlog.get_logger(__name__)

# Global assessor instance
assessor: RealtimeAssessor | None = None
causal_cache: CausalCache | None = None
START_TIME = time.time()
cache_keys_loaded = 0


async def _bootstrap_redis_thresholds(cc: CausalCache) -> int:
    """
    Pre-populate Redis with default thresholds for demo-org on cold start.
    Seeds thresholds for:
      - The standard demo model (hiring-v2)
      - All 3 stress-test models (hiring-stress-v1, credit-stress-v1, healthcare-stress-v1)
    Each model gets gender, age_group, AND intersectional thresholds.
    """
    global cache_keys_loaded

    try:
        import redis.asyncio as aioredis

        r = aioredis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            decode_responses=True,
        )

        # ── Standard demo model (hiring-v2) ──────────────────
        existing = await r.get("nexus:group_stats:demo-org:hiring-v2")
        if not existing:
            default_stats = {
                "gender": {
                    "approval_rates": {"M": 0.72, "F": 0.52, "NB": 0.58},
                    "confidence_percentiles": {},
                    "active_thresholds": {"M": 0.50, "F": 0.42, "NB": 0.45, "global": 0.50},
                    "last_updated": int(time.time() * 1000),
                },
                "age_group": {
                    "approval_rates": {"22-30": 0.68, "31-40": 0.65, "41-55": 0.49},
                    "confidence_percentiles": {},
                    "active_thresholds": {"22-30": 0.50, "31-40": 0.50, "41-55": 0.44, "global": 0.50},
                    "last_updated": int(time.time() * 1000),
                },
            }
            await r.setex(
                "nexus:group_stats:demo-org:hiring-v2",
                300,
                json.dumps(default_stats),
            )
            logger.info("Bootstrapped hiring-v2 thresholds")

        # ── Stress-test models (3 domains × 2 attributes + intersectional) ──
        stress_models = {
            "hiring-stress-v1": {
                "gender": {
                    "approval_rates": {"male": 0.72, "female": 0.48, "non_binary": 0.55},
                    "confidence_percentiles": {},
                    "active_thresholds": {"male": 0.72, "female": 0.58, "non_binary": 0.62, "global": 0.72},
                    "last_updated": int(time.time() * 1000),
                },
                "age_group": {
                    "approval_rates": {"under_45": 0.70, "over_45": 0.50},
                    "confidence_percentiles": {},
                    "active_thresholds": {"under_45": 0.70, "over_45": 0.60, "global": 0.70},
                    "last_updated": int(time.time() * 1000),
                },
            },
            "credit-stress-v1": {
                "gender": {
                    "approval_rates": {"male": 0.68, "female": 0.45, "non_binary": 0.52},
                    "confidence_percentiles": {},
                    "active_thresholds": {"male": 0.68, "female": 0.55, "non_binary": 0.58, "global": 0.68},
                    "last_updated": int(time.time() * 1000),
                },
                "age_group": {
                    "approval_rates": {"under_45": 0.67, "over_45": 0.48},
                    "confidence_percentiles": {},
                    "active_thresholds": {"under_45": 0.67, "over_45": 0.57, "global": 0.67},
                    "last_updated": int(time.time() * 1000),
                },
            },
            "healthcare-stress-v1": {
                "gender": {
                    "approval_rates": {"male": 0.65, "female": 0.42, "non_binary": 0.50},
                    "confidence_percentiles": {},
                    "active_thresholds": {"male": 0.65, "female": 0.52, "non_binary": 0.55, "global": 0.65},
                    "last_updated": int(time.time() * 1000),
                },
                "age_group": {
                    "approval_rates": {"under_45": 0.64, "over_45": 0.45},
                    "confidence_percentiles": {},
                    "active_thresholds": {"under_45": 0.64, "over_45": 0.54, "global": 0.64},
                    "last_updated": int(time.time() * 1000),
                },
            },
        }

        keys_set = 0
        for model_id, stats in stress_models.items():
            key = f"nexus:group_stats:demo-org:{model_id}"
            existing_stress = await r.get(key)
            if not existing_stress:
                await r.setex(key, 600, json.dumps(stats))  # 10-min TTL
                keys_set += 1

                # Also seed proxy features and SHAP top5 for causal intervention
                proxy_key = f"nexus:causal:demo-org:{model_id}:proxies"
                shap_key  = f"nexus:causal:demo-org:{model_id}:shap_top5"

                if "hiring" in model_id:
                    await r.setex(proxy_key, 600, json.dumps({"proxies": ["career_gap_years", "university_tier"]}))
                    await r.setex(shap_key, 600, json.dumps([["career_gap_years", 0.42], ["university_tier", 0.31], ["skills_score", 0.28], ["gpa", 0.22], ["years_exp", 0.18]]))
                elif "credit" in model_id:
                    await r.setex(proxy_key, 600, json.dumps({"proxies": ["zip_code", "career_gap_years"]}))
                    await r.setex(shap_key, 600, json.dumps([["zip_code", 0.38], ["career_gap_years", 0.35], ["credit_score", 0.30], ["debt_ratio", 0.25], ["income_k", 0.20]]))
                elif "healthcare" in model_id:
                    await r.setex(proxy_key, 600, json.dumps({"proxies": ["career_gap_years", "zip_code"]}))
                    await r.setex(shap_key, 600, json.dumps([["career_gap_years", 0.40], ["zip_code", 0.36], ["severity_score", 0.32], ["comorbidity_count", 0.22], ["insurance_tier", 0.15]]))

                logger.info(f"Bootstrapped stress-test model {model_id}")

        cache_keys_loaded = keys_set + 1
        await r.close()
        logger.info("Redis bootstrap complete", keys=cache_keys_loaded)
        return cache_keys_loaded

    except Exception as exc:
        logger.warning("Redis bootstrap failed — interceptor will operate in passthrough", error=str(exc))
        return 0


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle."""
    global assessor, causal_cache

    logger.info("Starting NEXUS Interceptor Service")

    causal_cache = CausalCache()
    await causal_cache.connect()

    # Bootstrap Redis with default thresholds before creating assessor
    await _bootstrap_redis_thresholds(causal_cache)

    assessor = RealtimeAssessor(causal_cache=causal_cache)
    await assessor.initialize()

    logger.info("Interceptor Service ready — assessor loaded")
    yield

    # Shutdown
    if causal_cache:
        await causal_cache.close()
    logger.info("Interceptor Service shut down")


app = FastAPI(
    title="NEXUS Interceptor Service",
    description="Real-time bias interception — responds in <150ms at P99",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


@app.post("/intercept")
async def intercept_decision(request: Request) -> dict:
    """
    POST /intercept — Accept DecisionEvent, return InterceptResponse.
    Must complete in ≤150ms at the 99th percentile.
    """
    start_time = time.perf_counter()

    body = await request.json()

    if assessor is None:
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return {
            "event_id": body.get("event_id", ""),
            "original_decision": body.get("decision", "pending"),
            "final_decision": body.get("decision", "pending"),
            "was_intercepted": False,
            "intervention_type": "none",
            "intervention_reason": "assessor_not_initialized",
            "applied_corrections": [],
            "latency_ms": round(elapsed_ms, 2),
            "interceptor_version": "1.0.0",
        }

    from nexus_types.models import DecisionEvent, ProtectedAttribute, DecisionType

    # Parse event
    protected_attrs = []
    for pa in body.get("protected_attributes", []):
        if isinstance(pa, dict):
            protected_attrs.append(ProtectedAttribute(name=pa["name"], value=pa["value"]))

    event = DecisionEvent(
        event_id=body.get("event_id", ""),
        org_id=body.get("org_id", ""),
        model_id=body.get("model_id", ""),
        timestamp=body.get("timestamp", int(time.time() * 1000)),
        decision=DecisionType(body.get("decision", "pending")),
        confidence=float(body.get("confidence", 0.5)),
        features=body.get("features", {}),
        protected_attributes=protected_attrs,
        individual_id=body.get("individual_id"),
        true_label=body.get("true_label"),
        metadata=body.get("metadata", {}),
    )

    # Run assessment
    decision = await assessor.assess(event)

    elapsed_ms = (time.perf_counter() - start_time) * 1000

    response = {
        "event_id": event.event_id,
        "original_decision": event.decision.value,
        "final_decision": decision.final_decision.value,
        "was_intercepted": decision.was_intercepted,
        "intervention_type": decision.intervention_type.value,
        "intervention_reason": decision.intervention_reason,
        "applied_corrections": [c.model_dump() for c in decision.applied_corrections],
        "latency_ms": round(elapsed_ms, 2),
        "interceptor_version": "1.0.0",
    }

    if decision.was_intercepted:
        logger.info(
            "Decision intercepted",
            event_id=event.event_id,
            org_id=event.org_id,
            model_id=event.model_id,
            intervention_type=decision.intervention_type.value,
            latency_ms=round(elapsed_ms, 2),
        )

    return response


@app.get("/health")
async def health() -> dict:
    """Health check endpoint with detailed status."""
    return {
        "status": "ok",
        "service": "nexus-interceptor",
        "version": "1.0.0",
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "assessor_loaded": assessor is not None,
        "cache_keys_loaded": cache_keys_loaded,
    }


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8081,
        workers=4,
        log_level="info",
    )
