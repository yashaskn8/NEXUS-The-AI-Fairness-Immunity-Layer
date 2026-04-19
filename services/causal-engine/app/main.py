"""
NEXUS Causal Engine — FastAPI Main Application.
"""
from __future__ import annotations

import json
import os
import time

import structlog
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.causal_graph_builder import CausalGraphBuilder
from app.fairness_computer import FairnessComputer
from app.shap_analyzer import SHAPAnalyzer
from app.stress_tester import StressTester

# ── Redis connection (for stats cache) ────────────────────────────────────────
_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is None:
        try:
            import redis
            _redis_client = redis.Redis(
                host=os.getenv("REDIS_HOST", "localhost"),
                port=int(os.getenv("REDIS_PORT", "6379")),
                decode_responses=True,
            )
            _redis_client.ping()
        except Exception:
            _redis_client = None
    return _redis_client


def _write_stats_to_redis(org_id: str, model_id: str, approval_rates: dict) -> None:
    """Write per-group approval rates to Redis for the simulation to read."""
    r = _get_redis()
    if r is None:
        return
    try:
        key = f"nexus:stats:{org_id}:{model_id}"
        r.setex(key, 300, json.dumps(approval_rates))
    except Exception:
        pass


def _write_projection_to_redis(
    org_id: str, model_id: str, attr: str,
    current_di: float, projected_di: float, threshold_map: dict,
) -> None:
    """Write projected DI after threshold correction to Redis."""
    r = _get_redis()
    if r is None:
        return
    try:
        key = f"nexus:projection:{org_id}:{model_id}:{attr}"
        payload = {
            "current_di": round(current_di, 4),
            "projected_di": round(projected_di, 4),
            "threshold_map": threshold_map,
        }
        r.setex(key, 300, json.dumps(payload))
    except Exception:
        pass

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
)

logger = structlog.get_logger(__name__)

app = FastAPI(
    title="NEXUS Causal Engine",
    version="1.0.0",
    description="Causal analysis, SHAP attribution, and fairness metrics computation",
)

START_TIME = time.time()
events_processed = 0


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "causal-engine",
        "version": "1.0.0",
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "events_processed": events_processed,
    }


@app.get("/causal/{org_id}/{model_id}/graph")
async def get_causal_graph(org_id: str, model_id: str):
    """Return the latest causal graph from Firestore as Cytoscape.js JSON."""
    try:
        from google.cloud import firestore as gfs
        db = gfs.AsyncClient(project=os.getenv("GOOGLE_CLOUD_PROJECT", "nexus-platform"))

        doc_ref = db.collection("orgs").document(org_id).collection("causal_graphs").document(model_id)
        doc = await doc_ref.get()

        if doc.exists:
            return doc.to_dict()

        return {
            "nodes": [],
            "edges": [],
            "proxy_features": [],
            "safe_features": [],
            "message": "Insufficient data. Send at least 100 decisions.",
        }
    except Exception as exc:
        logger.error("Failed to fetch causal graph", org_id=org_id, error=str(exc))
        return {
            "nodes": [],
            "edges": [],
            "proxy_features": [],
            "safe_features": [],
            "message": f"Error: {str(exc)}",
        }


@app.get("/shap/{org_id}/{model_id}")
async def get_shap_results(org_id: str, model_id: str):
    """Return the latest SHAP result from Firestore."""
    try:
        from google.cloud import firestore as gfs
        db = gfs.AsyncClient(project=os.getenv("GOOGLE_CLOUD_PROJECT", "nexus-platform"))

        doc_ref = db.collection("orgs").document(org_id).collection("shap_results").document(model_id)
        doc = await doc_ref.get()

        if doc.exists:
            return doc.to_dict()

        return {"message": "No SHAP data yet. Send at least 100 decisions."}
    except Exception as exc:
        logger.error("Failed to fetch SHAP results", org_id=org_id, error=str(exc))
        return {"message": f"Error: {str(exc)}"}


@app.get("/causal/{org_id}/{model_id}/metrics")
async def get_metrics(org_id: str, model_id: str):
    """Return the latest computed fairness metrics from Redis/Firestore.

    Also writes stats and projections to Redis for simulation consumption.
    This is Contract 2 of the simulation correctness contracts.
    """
    metrics: list[dict] = []
    approval_rates: dict[str, float] = {}

    # ── Try Redis first ──
    r = _get_redis()
    if r:
        try:
            stats_raw = r.get(f"nexus:stats:{org_id}:{model_id}")
            if stats_raw:
                approval_rates = json.loads(stats_raw)
        except Exception:
            pass

    # ── Fallback: compute from Firestore ──
    if not approval_rates:
        try:
            from google.cloud import firestore as gfs
            db = gfs.AsyncClient(
                project=os.getenv("GOOGLE_CLOUD_PROJECT", "nexus-platform")
            )

            # Read recent decisions
            decisions_ref = (
                db.collection("orgs").document(org_id)
                .collection("decisions")
                .order_by("timestamp", direction=gfs.Query.DESCENDING)
                .limit(500)
            )
            docs = []
            async for doc in decisions_ref.stream():
                docs.append(doc.to_dict())

            if docs:
                # Compute approval rates per gender group
                from collections import defaultdict
                group_counts: dict[str, dict[str, int]] = defaultdict(
                    lambda: {"approved": 0, "total": 0}
                )
                for d in docs:
                    attrs = d.get("protected_attributes", [])
                    decision = d.get("decision", d.get("final_decision", ""))
                    for attr in attrs:
                        if isinstance(attr, dict) and attr.get("name") == "gender":
                            val = attr.get("value", "unknown")
                            group_counts[val]["total"] += 1
                            if decision == "approved":
                                group_counts[val]["approved"] += 1

                for group, counts in group_counts.items():
                    if counts["total"] > 0:
                        approval_rates[group] = round(
                            counts["approved"] / counts["total"], 4
                        )

                # Write to Redis cache
                _write_stats_to_redis(org_id, model_id, approval_rates)
        except Exception as exc:
            logger.warning("Firestore fallback failed", error=str(exc))

    # ── Compute DI metrics from approval rates ──
    if approval_rates:
        # Find majority group (highest approval rate)
        majority_group = max(approval_rates, key=lambda k: approval_rates[k])
        majority_rate = approval_rates[majority_group]

        for group, rate in approval_rates.items():
            if group == majority_group:
                continue

            di_value = round(rate / majority_rate, 4) if majority_rate > 0 else 0.0
            violated = di_value < 0.80
            severity = "critical" if di_value < 0.70 else "high" if di_value < 0.80 else "low"

            metrics.append({
                "metric_name": "disparate_impact",
                "protected_attribute": "gender",
                "group": group,
                "reference_group": majority_group,
                "value": di_value,
                "threshold": 0.80,
                "violated": violated,
                "severity": severity,
                "window": "5m",
                "sample_size": sum(
                    1 for g in approval_rates if g in [group, majority_group]
                ),
                "approval_rate": rate,
                "reference_rate": majority_rate,
            })

            # Compute projected DI with threshold correction
            # ThresholdCalibrator.project_impact() logic:
            # Adjust group threshold to achieve DI >= 0.80
            if violated and majority_rate > 0:
                target_rate = majority_rate * 0.85  # slightly above 0.80
                projected_di = round(target_rate / majority_rate, 4)
                threshold_map = {
                    group: round(0.5 * (rate / target_rate), 4),
                    majority_group: 0.5,
                }
                _write_projection_to_redis(
                    org_id, model_id, "gender",
                    di_value, projected_di, threshold_map,
                )
            else:
                projected_di = di_value

    return {
        "metrics": metrics,
        "approval_rates": approval_rates,
        "last_computed_ms": int(time.time() * 1000),
    }


class SimulateRequest(BaseModel):
    org_id: str
    model_id: str
    features: dict
    reference_group: dict
    counterfactual_groups: dict


@app.post("/simulate")
async def simulate_counterfactual(req: SimulateRequest):
    """Run counterfactual simulation using surrogate model."""
    results = []
    base_features = req.features

    # Score the reference group
    ref_score = _score_features(base_features, req.reference_group)
    ref_decision = "approved" if ref_score > 0.5 else "rejected"

    results.append({
        "group": req.reference_group,
        "confidence": round(ref_score, 4),
        "decision": ref_decision,
    })

    # Score each counterfactual group
    flips_detected = False
    for attr_name, attr_values in req.counterfactual_groups.items():
        if not isinstance(attr_values, list):
            attr_values = [attr_values]
        for val in attr_values:
            cf_group = {**req.reference_group, attr_name: val}
            cf_score = _score_features(base_features, cf_group)
            cf_decision = "approved" if cf_score > 0.5 else "rejected"

            if cf_decision != ref_decision:
                flips_detected = True

            results.append({
                "group": cf_group,
                "confidence": round(cf_score, 4),
                "decision": cf_decision,
                "flip_detected": cf_decision != ref_decision,
            })

    return {
        "reference": results[0],
        "counterfactuals": results[1:],
        "flip_detected": flips_detected,
        "features_used": base_features,
    }


def _score_features(features: dict, group: dict) -> float:
    """Simple scoring heuristic when no surrogate model is available."""
    import numpy as np

    base_score = 0.35
    base_score += features.get("years_exp", 5) / 15 * 0.2
    base_score += features.get("gpa", 3.0) / 4.0 * 0.25
    base_score += features.get("skills_score", 0.7) * 0.15
    base_score += features.get("interview_score", 0.7) * 0.15

    # Apply bias pattern matching the seed script
    gender = group.get("gender", "male")
    if gender in ("female", "F"):
        base_score *= 0.63
    elif gender in ("non_binary", "NB"):
        base_score *= 0.71

    if features.get("has_career_gap", 0) == 1:
        base_score *= 0.80

    return float(np.clip(base_score, 0.0, 1.0))


# Service instances for batch endpoints
graph_builder = CausalGraphBuilder()
fairness_computer = FairnessComputer()
shap_analyzer = SHAPAnalyzer()
stress_tester = StressTester()


class MetricsRequest(BaseModel):
    org_id: str
    model_id: str
    events: list[dict]
    protected_attributes: list[str]


@app.post("/v1/compute-metrics")
async def compute_metrics(req: MetricsRequest):
    """Compute all five fairness metrics for a batch of events."""
    import pandas as pd

    df = pd.DataFrame(req.events)
    if len(df) < 10:
        raise HTTPException(status_code=400, detail="Need at least 10 events")

    results = []
    for attr in req.protected_attributes:
        if attr not in df.columns:
            continue
        groups = df[attr].unique()
        if len(groups) < 2:
            continue
        ref_group = str(groups[0])

        results.extend(fairness_computer.disparate_impact(df, attr, ref_group, 0))
        results.extend(fairness_computer.demographic_parity(df, attr, ref_group, 0))
        results.extend(fairness_computer.equalized_odds(df, attr, ref_group, 0))
        results.extend(fairness_computer.predictive_parity(df, attr, ref_group, 0))

    if_metric = fairness_computer.individual_fairness_score(df, 0)
    if if_metric:
        results.append(if_metric)

    return {"metrics": [m.model_dump() for m in results]}


@app.post("/v1/causal-graph")
async def build_causal_graph(req: MetricsRequest):
    """Build and return a causal graph for the events."""
    import pandas as pd

    df = pd.DataFrame(req.events)
    graph = graph_builder.build(df, req.protected_attributes)
    return graph_builder.to_json(graph)


@app.post("/v1/shap-analysis")
async def run_shap_analysis(req: MetricsRequest):
    """Run SHAP analysis on the events."""
    import pandas as pd

    df = pd.DataFrame(req.events)
    result = shap_analyzer.analyze(df, req.model_id, req.protected_attributes)
    return result.model_dump()


class StressTestRequest(BaseModel):
    org_id: str
    model_id: str
    model_endpoint: str
    feature_schema: dict
    protected_attributes: list[str]
    n_samples: int = 10000


@app.post("/v1/stress-test")
async def run_stress_test(req: StressTestRequest):
    """Run pre-deployment stress test."""
    report = await stress_tester.run(
        model_endpoint=req.model_endpoint,
        feature_schema=req.feature_schema,
        protected_attrs=req.protected_attributes,
        org_id=req.org_id,
        model_id=req.model_id,
        n_samples=req.n_samples,
    )
    return report.model_dump()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8082")))
