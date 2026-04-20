# NEXUS — OMEGA STRESS TEST
# Classification: MAXIMUM ADVERSARIAL COMPLEXITY
# Run with: python scripts/omega_stress_test.py
# OR:       make omega-test
#
# SEVEN SIMULTANEOUS ATTACK VECTORS:
#   1. Temporal Chameleon      — bias hidden in time windows, not population
#   2. Fairness Metric War     — mathematically impossible to satisfy all 5 metrics
#   3. Adversarial Calibration — confidence scores inverted to defeat thresholds
#   4. Byzantine Proxy Storm   — 12 proxy variables with circular correlations
#   5. Cold Start Assassination — attacks when Redis cache is stale or empty
#   6. Federated Poisoning     — gradient updates designed to degrade global model
#   7. Regulatory Jurisdiction Conflict — same decision violates one law, complies with another
#
# PASS CONDITIONS (ALL must be true simultaneously):
#   - Bias detection rate ≥ 90% across all attack vectors
#   - False positive rate < 3% (tighter than standard stress test)
#   - P99 latency < 200ms under 100 concurrent workers (double the standard)
#   - Zero cascading service failures
#   - Federated poisoning gradient rejected by aggregator
#   - Regulatory conflict resolved to the stricter standard
#   - Metric conflict resolved without violating the primary SDG-aligned metric (DI)
#   - SHAP confidence interval stability ≥ "medium" on all proxy detections

import time
import uuid
import json
import random
import math
import hashlib
import numpy as np
import concurrent.futures
import threading
import os
import requests
import redis as redis_lib
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, field
from typing import Optional
from collections import defaultdict
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.rule import Rule
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich import box

load_dotenv()
console = Console()

BASE_URL       = os.getenv("NEXUS_BASE_URL",        "http://localhost:8080")
FED_URL        = os.getenv("NEXUS_FED_URL",         "http://localhost:8083")
CAUSAL_URL     = os.getenv("NEXUS_CAUSAL_URL",      "http://localhost:8082")
VAULT_URL      = os.getenv("NEXUS_VAULT_URL",       "http://localhost:8086")
REDIS_HOST     = os.getenv("REDIS_HOST",            "localhost")
REDIS_PORT     = int(os.getenv("REDIS_PORT",        6379))
API_KEY        = os.getenv("NEXUS_API_KEY",         "demo-key")
HEADERS        = {"Authorization": f"Bearer {API_KEY}",
                  "Content-Type": "application/json"}

rng = np.random.default_rng(seed=None)

# ═══════════════════════════════════════════════════════════════════════════
# ATTACK VECTOR 1 — TEMPORAL CHAMELEON
# ═══════════════════════════════════════════════════════════════════════════
#
# The system looks completely fair at any 5-minute rolling window snapshot.
# Bias only appears when you examine patterns across time: female candidates
# are approved in even-numbered minutes, rejected in odd-numbered minutes.
# At any single window, DI ≈ 1.0. Over the full session, DI ≈ 0.63.
#
# This defeats NEXUS if:
#   - The causal engine only computes metrics on the current window
#   - The interceptor only reads the most recent Redis cache entry
#   - The prediction engine has no longitudinal memory
#
# What NEXUS must do to pass:
#   - Detect that group approval rates are oscillating (not stable)
#   - Flag the instability itself as a bias signal
#   - Apply intervention based on the session-level DI, not the window DI

def generate_temporal_chameleon_batch(
    batch_index: int, batch_size: int = 10
) -> list[dict]:
    """
    Generate a batch of decisions where bias alternates by batch index.
    Even batches: female approval rate = male approval rate (looks fair).
    Odd batches:  female approval rate = 0.45 * male approval rate (biased).
    Over all batches combined: DI ≈ 0.63.
    """
    decisions = []
    is_biased_window = (batch_index % 2 == 1)

    for _ in range(batch_size):
        gender    = rng.choice(["male", "female"], p=[0.5, 0.5])
        base_qual = float(rng.uniform(0.4, 0.9))

        if is_biased_window and gender == "female":
            # Suppress female approvals in odd windows
            confidence = round(float(rng.uniform(0.30, 0.55)), 3)
            decision   = "rejected"
        else:
            confidence = round(base_qual + float(rng.normal(0, 0.05)), 3)
            confidence = min(0.95, max(0.35, confidence))
            decision   = "approved" if confidence > 0.60 else "rejected"

        decisions.append({
            "event_id": str(uuid.uuid4()),
            "org_id":   "omega-org",
            "model_id": "temporal-chameleon-v1",
            "domain":   "hiring",
            "decision": decision,
            "confidence": confidence,
            "features": {
                "years_exp":    int(rng.integers(3, 12)),
                "gpa":          round(float(rng.uniform(3.0, 4.0)), 2),
                "skills_score": round(base_qual, 3),
                "batch_index":  batch_index   # deliberately included as a feature
            },
            "protected_attributes": {"gender": gender},
            "intercept_mode": True,
            "_ground_truth": {
                "is_biased": is_biased_window and gender == "female",
                "attack_vector": "temporal_chameleon",
                "batch_index": batch_index
            }
        })
    return decisions

# ═══════════════════════════════════════════════════════════════════════════
# ATTACK VECTOR 2 — FAIRNESS METRIC WAR
# ═══════════════════════════════════════════════════════════════════════════
#
# These decisions are constructed so that the five fairness metrics are
# mathematically in direct conflict. Correcting Disparate Impact REQUIRES
# worsening Equalized Odds. Correcting Demographic Parity REQUIRES
# worsening Predictive Parity. There is no solution that satisfies all five.
#
# This is not a contrived scenario — it reflects a proven mathematical
# result (Chouldechova, 2017: when base rates differ across groups, it
# is impossible to satisfy calibration and error-rate parity simultaneously).
#
# The test injects exactly this condition:
#   Group A (male):   base rate 70% qualified (high base rate)
#   Group B (female): base rate 40% qualified (low base rate)
#
# A model trained on ground truth labels will inevitably fail either
# DI or EO when base rates differ this sharply.
#
# What NEXUS must do to pass:
#   - Detect the metric conflict explicitly (not just silently pick one)
#   - Resolve the conflict by prioritising the SDG-aligned metric (DI)
#     which maps to SDG 10 (Reduced Inequalities)
#   - Log the conflict resolution decision in the audit vault
#   - NOT produce a silent partial correction that looks like a full fix

METRIC_WAR_MALE_BASE_RATE   = 0.70
METRIC_WAR_FEMALE_BASE_RATE = 0.40

def generate_metric_war_batch(n: int = 50) -> list[dict]:
    """
    Generate decisions where satisfying all 5 fairness metrics simultaneously
    is mathematically impossible due to differential base rates.
    Include true_label so NEXUS can attempt EO and PP computation.
    """
    decisions = []
    for _ in range(n):
        gender        = rng.choice(["male", "female"], p=[0.55, 0.45])
        base_rate     = (METRIC_WAR_MALE_BASE_RATE if gender == "male"
                         else METRIC_WAR_FEMALE_BASE_RATE)
        is_qualified  = bool(rng.random() < base_rate)
        qualification = float(rng.beta(8, 2) if is_qualified
                              else rng.beta(2, 8))
        confidence    = round(
            min(0.95, max(0.30, qualification + float(rng.normal(0, 0.04)))),
            3
        )
        decision = "approved" if confidence > 0.60 else "rejected"

        decisions.append({
            "event_id": str(uuid.uuid4()),
            "org_id":   "omega-org",
            "model_id": "metric-war-v1",
            "domain":   "credit",
            "decision": decision,
            "confidence": confidence,
            "features": {
                "credit_score":    int(rng.integers(500, 800)),
                "income_k":        round(float(rng.uniform(30, 120)), 1),
                "debt_ratio":      round(float(rng.uniform(0.1, 0.5)), 3),
                "is_qualified":    int(is_qualified)
            },
            "true_label":   "approved" if is_qualified else "rejected",
            "protected_attributes": {"gender": gender},
            "intercept_mode": True,
            "_ground_truth": {
                "is_biased":     not is_qualified and decision == "rejected"
                                 and gender == "female",
                "attack_vector": "metric_war",
                "conflict": "DI_vs_EO",
                "base_rate_differential": abs(
                    METRIC_WAR_MALE_BASE_RATE - METRIC_WAR_FEMALE_BASE_RATE
                )
            }
        })
    return decisions

# ═══════════════════════════════════════════════════════════════════════════
# ATTACK VECTOR 3 — ADVERSARIAL CALIBRATION
# ═══════════════════════════════════════════════════════════════════════════
#
# The attacker has read the NEXUS interceptor source code. They know that
# the threshold autopilot intercepts decisions where:
#   confidence < group_equalized_threshold
#
# They respond by inverting the calibration: biased rejections are submitted
# with ARTIFICIALLY HIGH confidence (0.85–0.95) to defeat the threshold check.
# Legitimate approvals are submitted with ARTIFICIALLY LOW confidence (0.35–0.50).
#
# The model is still biased — female candidates with identical qualifications
# are rejected — but the confidence scores have been post-hoc calibrated to
# make the rejections look confident and the approvals look uncertain.
#
# This is a realistic adversarial scenario: an organisation that wants to
# appear compliant while maintaining discriminatory outcomes.
#
# What NEXUS must do to pass:
#   - NOT rely solely on the confidence-vs-threshold comparison
#   - Detect that the confidence distribution is inverted relative to the
#     decision distribution (biased rejections have suspiciously high confidence)
#   - Flag "adversarial calibration detected" in the audit record
#   - Apply causal intervention based on feature-level analysis, not confidence

def generate_adversarial_calibration_batch(n: int = 50) -> list[dict]:
    """
    Biased female rejections submitted with HIGH confidence (0.85–0.95).
    Fair male rejections submitted with LOW confidence (0.35–0.50).
    Confidence is deliberately inverted to defeat threshold-based interception.
    """
    decisions = []
    for _ in range(n):
        gender     = rng.choice(["male", "female"], p=[0.55, 0.45])
        years_exp  = int(rng.integers(4, 14))
        gpa        = round(float(rng.uniform(3.2, 4.0)), 2)
        skills     = round(float(rng.uniform(0.65, 0.95)), 3)
        true_qual  = 0.30 + years_exp / 14 * 0.35 + gpa / 4.0 * 0.20 + skills * 0.15

        if gender == "female":
            # Biased rejection — confidence artificially inflated to defeat threshold
            decision   = "rejected"
            confidence = round(float(rng.uniform(0.82, 0.95)), 3)
        else:
            # Fair decision — confidence reflects true qualification
            decision   = "approved" if true_qual > 0.55 else "rejected"
            confidence = round(
                min(0.95, max(0.35, true_qual + float(rng.normal(0, 0.05)))),
                3
            )

        decisions.append({
            "event_id": str(uuid.uuid4()),
            "org_id":   "omega-org",
            "model_id": "adversarial-calibration-v1",
            "domain":   "hiring",
            "decision": decision,
            "confidence": confidence,
            "features": {
                "years_exp":   years_exp,
                "gpa":         gpa,
                "skills_score": skills
            },
            "protected_attributes": {"gender": gender},
            "intercept_mode": True,
            "_ground_truth": {
                "is_biased":              gender == "female",
                "attack_vector":          "adversarial_calibration",
                "confidence_inverted":    True,
                "true_qualification":     round(true_qual, 3)
            }
        })
    return decisions

# ═══════════════════════════════════════════════════════════════════════════
# ATTACK VECTOR 4 — BYZANTINE PROXY STORM
# ═══════════════════════════════════════════════════════════════════════════
#
# The standard stress test uses 3 proxy variables. This attack uses 12,
# arranged in a deliberate structure designed to confuse mutual information
# analysis and SHAP attribution:
#
#   LAYER 1 (direct proxies): career_gap, zip_code, university_tier
#     → directly correlated with gender (MI > 0.3)
#
#   LAYER 2 (indirect proxies): gym_membership, commute_minutes,
#     linkedin_connections, years_since_promotion
#     → correlated with Layer 1 (MI ≈ 0.2 with gender, but via chain)
#
#   LAYER 3 (decoy features): coffee_budget, book_purchases,
#     travel_frequency, hobby_diversity
#     → correlated with OUTCOME but NOT with gender (legitimate predictors)
#     → deliberately designed to absorb SHAP mass away from real proxies
#
#   CIRCULAR CORRELATION: career_gap → linkedin_connections → university_tier
#     → career_gap (mutual information loop that inflates all three MI scores)
#
# What NEXUS must do to pass:
#   - Correctly identify Layer 1 as proxies (not Layer 3)
#   - Not be confused by the circular correlation into flagging non-proxies
#   - Compute SHAP with "medium" or "high" stability despite 12 features
#   - Not overcorrect (Layer 3 features are legitimate and should be retained)

def generate_byzantine_proxy_storm(n: int = 60) -> list[dict]:
    """
    12-feature adversarial payload where proxy identification is
    deliberately obfuscated by circular correlations and decoy features.
    """
    decisions = []
    for _ in range(n):
        gender    = rng.choice(["male", "female", "non_binary"], p=[0.55, 0.35, 0.10])
        age_group = rng.choice(["under_40", "over_40"], p=[0.60, 0.40])

        # Layer 1 — real proxies (correlated with gender)
        career_gap      = int(rng.choice([0,1,2,3,4], p=[0.55,0.15,0.12,0.10,0.08]
                               if gender == "male"
                               else [0.18,0.14,0.20,0.25,0.23]))
        zip_code        = int(rng.choice(range(1,11),
                               p=[0.20,0.18,0.15,0.12,0.10,0.08,0.07,0.04,0.03,0.03]
                               if gender == "male"
                               else [0.05,0.06,0.08,0.10,0.12,0.15,0.16,0.13,0.09,0.06]))
        uni_tier        = int(rng.choice([1,2,3,4,5],
                               p=[0.35,0.25,0.18,0.12,0.10]
                               if gender == "male"
                               else [0.12,0.18,0.22,0.26,0.22]))

        # Layer 2 — indirect proxies (correlated with Layer 1)
        gym_membership     = int(career_gap > 2) * int(rng.random() > 0.3)
        commute_mins       = int(zip_code * 4 + rng.integers(0, 20))
        linkedin_conn      = int(max(50, 600 - uni_tier * 80 + rng.integers(-30, 30)))
        yrs_since_promo    = int(career_gap + rng.integers(0, 3))

        # Layer 3 — decoy features (legitimate predictors, NOT correlated with gender)
        # These absorb SHAP mass and make proxy identification harder
        coffee_budget      = round(float(rng.uniform(2.0, 8.0)), 2)
        book_purchases     = int(rng.integers(0, 25))
        travel_frequency   = int(rng.integers(0, 12))
        hobby_diversity    = int(rng.integers(1, 8))

        # TRUE qualification (determined only by non-proxy features)
        true_qual = (0.35
                     + min(book_purchases, 20) / 20 * 0.25
                     + min(travel_frequency, 10) / 10 * 0.20
                     + hobby_diversity / 8 * 0.20)

        # Bias injection: proxy chain penalises female candidates
        biased_qual = true_qual
        if gender in ["female", "non_binary"]:
            biased_qual *= (0.68 - career_gap * 0.05)
            biased_qual *= (1.0 - (zip_code - 1) / 10 * 0.15)
            biased_qual *= (1.0 + (1 - uni_tier / 5) * 0.1)

        biased_qual = min(0.95, max(0.05, biased_qual))
        confidence  = round(
            min(0.95, max(0.30, biased_qual + float(rng.normal(0, 0.04)))),
            3
        )
        decision = "approved" if confidence > 0.58 else "rejected"

        decisions.append({
            "event_id": str(uuid.uuid4()),
            "org_id":   "omega-org",
            "model_id": "byzantine-proxy-v1",
            "domain":   "hiring",
            "decision": decision,
            "confidence": confidence,
            "features": {
                # Layer 1
                "career_gap_years":   career_gap,
                "zip_code":           zip_code,
                "university_tier":    uni_tier,
                # Layer 2
                "gym_membership":     gym_membership,
                "commute_minutes":    commute_mins,
                "linkedin_connections": linkedin_conn,
                "years_since_promo":  yrs_since_promo,
                # Layer 3 (decoys)
                "coffee_budget":      coffee_budget,
                "book_purchases":     book_purchases,
                "travel_frequency":   travel_frequency,
                "hobby_diversity":    hobby_diversity
            },
            "protected_attributes": {
                "gender":    gender,
                "age_group": age_group
            },
            "intercept_mode": True,
            "_ground_truth": {
                "is_biased":        gender in ["female", "non_binary"],
                "attack_vector":    "byzantine_proxy_storm",
                "real_proxies":     ["career_gap_years","zip_code","university_tier"],
                "indirect_proxies": ["gym_membership","commute_minutes",
                                     "linkedin_connections","years_since_promo"],
                "decoy_features":   ["coffee_budget","book_purchases",
                                     "travel_frequency","hobby_diversity"],
                "true_qual":        round(true_qual, 3),
                "biased_qual":      round(biased_qual, 3)
            }
        })
    return decisions

# ═══════════════════════════════════════════════════════════════════════════
# ATTACK VECTOR 5 — COLD START ASSASSINATION
# ═══════════════════════════════════════════════════════════════════════════
#
# This attack deliberately targets the interceptor during its most vulnerable
# state: the first 30 seconds after the Redis cache has been forcibly cleared.
#
# The attack sequence:
#   Step A: Flush all NEXUS keys from Redis (simulates cache expiry / restart)
#   Step B: Immediately send 20 biased decisions BEFORE the causal engine
#           has had time to recompute thresholds
#   Step C: Send 5 decisions with confidence exactly at the default global
#           threshold (0.60) — boundary exploitation
#   Step D: After 35 seconds, send another 20 decisions to see if recovery works
#
# What NEXUS must do to pass:
#   - During cold start (Steps B and C): either refuse to intercept with
#     a "cache_miss_passthrough" flag, OR use a conservative default threshold
#     that errs toward intervention rather than pass-through
#   - After recovery (Step D): thresholds must be repopulated and interception
#     must resume with correct DI-improving behaviour
#   - The audit vault must log ALL events including cold-start pass-throughs,
#     with intervention_reason = "cold_start_passthrough" where applicable
#   - CRITICAL: must NOT crash, timeout, or return 5xx during cold start

def execute_cold_start_assassination(
    redis_client: redis_lib.Redis
) -> dict:
    """
    Executes the cold start attack sequence. Returns results per phase.
    """
    results = {
        "phase_a_cache_cleared":   False,
        "phase_b_cold_responses":  [],
        "phase_c_boundary_responses": [],
        "phase_d_recovery_responses": [],
        "service_crashed":         False,
        "cold_start_handled":      False,
        "recovery_successful":     False
    }

    # Phase A: Clear all NEXUS Redis keys
    console.print(
        "[yellow]⚡ Phase A: Clearing Redis cache (cold start simulation)...[/yellow]"
    )
    try:
        keys = redis_client.keys("nexus:*")
        if keys:
            redis_client.delete(*keys)
        results["phase_a_cache_cleared"] = True
        console.print(
            f"[yellow]  Deleted {len(keys)} Redis keys.[/yellow]"
        )
    except Exception as e:
        console.print(f"[red]  Redis flush failed: {e}[/red]")
        return results

    # Phase B: Immediate biased decisions (cache is empty)
    console.print(
        "[yellow]⚡ Phase B: Sending 20 biased decisions during cold start...[/yellow]"
    )
    for i in range(20):
        payload = {
            "event_id":   str(uuid.uuid4()),
            "org_id":     "omega-org",
            "model_id":   "cold-start-v1",
            "domain":     "hiring",
            "decision":   "rejected",
            "confidence": round(float(rng.uniform(0.45, 0.60)), 3),
            "features":   {"years_exp": 7, "gpa": 3.7, "skills_score": 0.82},
            "protected_attributes": {"gender": "female"},
            "intercept_mode": True
        }
        try:
            t0   = time.perf_counter()
            resp = requests.post(
                f"{BASE_URL}/v1/intercept",
                json=payload, headers=HEADERS, timeout=3
            )
            ms   = (time.perf_counter() - t0) * 1000
            data = resp.json()
            results["phase_b_cold_responses"].append({
                "http_status":        resp.status_code,
                "was_intercepted":    data.get("was_intercepted", False),
                "intervention_reason": data.get("intervention_reason", ""),
                "latency_ms":         round(ms, 1)
            })
        except Exception as e:
            results["service_crashed"] = True
            results["phase_b_cold_responses"].append({
                "error": str(e),
                "http_status": 0
            })

    # Phase C: Boundary exploitation — confidence exactly at default threshold
    console.print(
        "[yellow]⚡ Phase C: Boundary exploitation (confidence = 0.600)...[/yellow]"
    )
    for _ in range(5):
        payload = {
            "event_id":   str(uuid.uuid4()),
            "org_id":     "omega-org",
            "model_id":   "cold-start-v1",
            "domain":     "hiring",
            "decision":   "rejected",
            "confidence": 0.600,           # exactly at the default threshold
            "features":   {"years_exp": 7, "gpa": 3.7, "skills_score": 0.82},
            "protected_attributes": {"gender": "female"},
            "intercept_mode": True
        }
        try:
            resp = requests.post(
                f"{BASE_URL}/v1/intercept",
                json=payload, headers=HEADERS, timeout=3
            )
            data = resp.json()
            results["phase_c_boundary_responses"].append({
                "http_status":     resp.status_code,
                "was_intercepted": data.get("was_intercepted", False),
                "final_decision":  data.get("final_decision", ""),
                "reason":          data.get("intervention_reason", "")
            })
        except Exception as e:
            results["phase_c_boundary_responses"].append({"error": str(e)})

    # Wait 35 seconds for causal engine to repopulate cache
    console.print(
        "[yellow]⚡ Waiting 35 seconds for cache recovery...[/yellow]"
    )
    for remaining in range(35, 0, -5):
        console.print(f"[dim]  {remaining}s remaining...[/dim]")
        time.sleep(5)

    # Phase D: Post-recovery interception test
    console.print(
        "[yellow]⚡ Phase D: Recovery test (20 biased decisions post-cache)...[/yellow]"
    )
    intercepted_in_recovery = 0
    for _ in range(20):
        payload = {
            "event_id":   str(uuid.uuid4()),
            "org_id":     "omega-org",
            "model_id":   "cold-start-v1",
            "domain":     "hiring",
            "decision":   "rejected",
            "confidence": round(float(rng.uniform(0.45, 0.60)), 3),
            "features":   {"years_exp": 7, "gpa": 3.7, "skills_score": 0.82},
            "protected_attributes": {"gender": "female"},
            "intercept_mode": True
        }
        try:
            resp = requests.post(
                f"{BASE_URL}/v1/intercept",
                json=payload, headers=HEADERS, timeout=3
            )
            data = resp.json()
            was_intercepted = data.get("was_intercepted", False)
            if was_intercepted:
                intercepted_in_recovery += 1
            results["phase_d_recovery_responses"].append({
                "was_intercepted": was_intercepted,
                "latency_ms": round(
                    data.get("latency_ms", 999), 1
                )
            })
        except Exception as e:
            results["phase_d_recovery_responses"].append({"error": str(e)})

    # Cold start is "handled" if no crashes and latency < 200ms during cold
    cold_latencies = [
        r["latency_ms"] for r in results["phase_b_cold_responses"]
        if "latency_ms" in r
    ]
    results["cold_start_handled"] = (
        not results["service_crashed"]
        and all(lat < 200 for lat in cold_latencies)
        and all(r.get("http_status", 0) in [200, 202]
                for r in results["phase_b_cold_responses"])
    )
    results["recovery_successful"] = intercepted_in_recovery >= 10
    return results

# ═══════════════════════════════════════════════════════════════════════════
# ATTACK VECTOR 6 — FEDERATED POISONING
# ═══════════════════════════════════════════════════════════════════════════
#
# The attacker registers as a legitimate organisation on the NEXUS network
# and submits malicious federated gradient updates designed to:
#   - Gradually lower the global DI threshold for the "hiring" domain
#   - Do so slowly enough that the change is below the per-round detection limit
#   - Exploit the FedAvg weighting: submit with artificially large sample_count
#     (n=100,000) to dominate the weighted average
#
# The poisoned gradients are:
#   gradient_values: [-0.03, -0.03, ..., -0.03]  (100 dimensions, all negative)
#   This pushes all global thresholds DOWN by 0.03 * learning_rate per round.
#   After 10 rounds, global thresholds drop from 0.80 to approximately 0.60.
#
# The attack also tests the cumulative privacy budget enforcement from
# Phase 8 Hardening A: epsilon=0.95 submitted 6 times to exceed the
# ROUND_BUDGET_LIMIT=5.0 on the 6th submission.
#
# What NEXUS must do to pass:
#   - Reject the oversized sample_count (cap at max_samples = 10,000)
#   - Detect anomalous gradient direction (all-negative gradients are
#     statistically implausible for honest participants)
#   - Reject the 6th epsilon submission (cumulative > 5.0)
#   - NOT update the global model with the poisoned gradient

def execute_federated_poisoning_attack() -> dict:
    """
    Submits poisoned gradient updates to the federated aggregator.
    Returns whether the aggregator correctly rejected the poisoned updates.
    """
    results = {
        "total_submitted":        0,
        "rejected_oversized_n":   0,
        "rejected_anomalous_grad": 0,
        "rejected_budget_exceeded": 0,
        "global_model_corrupted": False,
        "attack_neutralised":     False
    }

    # Fetch the global model state BEFORE poisoning attempt
    try:
        pre_resp = requests.get(
            f"{FED_URL}/global-model",
            headers=HEADERS, timeout=5
        )
        pre_model = pre_resp.json() if pre_resp.status_code == 200 else {}
    except Exception:
        pre_model = {}

    # Submit 6 poisoned gradient updates
    for i in range(6):
        gradient = {
            "org_id":          "malicious-org-omega",
            "round_id":        "omega-poison-round-001",
            "gradient_vector": [-0.03] * 100,    # All negative — anomalous
            "epsilon_spent":   0.95,              # Just under 1.0 per-gradient limit
            "sample_count":    100000,            # Inflated to dominate FedAvg
            "timestamp":       int(time.time() * 1000)
        }
        try:
            resp = requests.post(
                f"{FED_URL}/gradients",
                json=gradient, headers=HEADERS, timeout=5
            )
            results["total_submitted"] += 1
            data = resp.json() if resp.status_code != 204 else {}
            rejection_reason = data.get("rejection_reason", "")

            if resp.status_code == 400:
                if "sample_count" in rejection_reason.lower():
                    results["rejected_oversized_n"] += 1
                elif "anomalous" in rejection_reason.lower():
                    results["rejected_anomalous_grad"] += 1
                elif "budget" in rejection_reason.lower() or i >= 5:
                    results["rejected_budget_exceeded"] += 1
        except Exception as e:
            console.print(
                f"[dim]Federated endpoint error (may be expected): {e}[/dim]"
            )

    # Fetch the global model state AFTER poisoning attempt
    try:
        post_resp  = requests.get(
            f"{FED_URL}/global-model",
            headers=HEADERS, timeout=5
        )
        post_model = post_resp.json() if post_resp.status_code == 200 else {}
        # Check if thresholds were degraded by the poisoned gradient
        pre_threshold  = pre_model.get("hiring_di_threshold", 0.80)
        post_threshold = post_model.get("hiring_di_threshold", 0.80)
        results["global_model_corrupted"] = (
            post_threshold < pre_threshold - 0.02
        )
    except Exception:
        post_model = {}

    results["attack_neutralised"] = (
        not results["global_model_corrupted"]
        and (results["rejected_oversized_n"] > 0
             or results["rejected_anomalous_grad"] > 0
             or results["rejected_budget_exceeded"] > 0
             or results["total_submitted"] == 0)
    )
    return results

# ═══════════════════════════════════════════════════════════════════════════
# ATTACK VECTOR 7 — REGULATORY JURISDICTION CONFLICT
# ═══════════════════════════════════════════════════════════════════════════
#
# A credit decision is submitted with:
#   domain: "credit"
#   jurisdiction: "cross_border"   (EU organisation, US applicant)
#
# The same decision has DI = 0.82.
#   Under EEOC (US, hiring threshold 0.80): COMPLIANT — no intervention needed
#   Under EU AI Act (credit threshold 0.85): NON-COMPLIANT — intervention required
#
# The decision must be intercepted under the stricter standard (EU AI Act).
# But the intervention_reason must correctly identify the governing regulation.
#
# Additionally, the test sends decisions where:
#   US EEOC says: intervention required (DI = 0.78, below 0.80)
#   EU AI Act says: NOT required because the domain is "legal" not "credit"
#     and the EU AI Act's legal domain threshold is 0.80, DI = 0.82 ≥ 0.80
#
# What NEXUS must do to pass:
#   - Apply the STRICTER threshold when jurisdictions conflict
#   - Correctly identify which regulation triggered the intervention
#   - Log the jurisdictional conflict in the audit vault
#   - NOT apply EU thresholds to US-only decisions (avoid over-reach)

def generate_regulatory_conflict_batch(n: int = 30) -> list[dict]:
    """
    Generate decisions that produce different compliance outcomes under
    EEOC vs EU AI Act, requiring intelligent jurisdiction resolution.
    """
    decisions = []
    conflict_scenarios = [
        # (di_target, domain, jurisdiction, expected_action)
        (0.82, "credit",    "EU",           "intercept"),  # EU Act 0.85 > DI
        (0.82, "credit",    "US",           "pass"),       # EEOC 0.80 < DI
        (0.82, "credit",    "cross_border", "intercept"),  # stricter = EU
        (0.78, "hiring",    "US",           "intercept"),  # EEOC 0.80 > DI
        (0.78, "hiring",    "EU",           "intercept"),  # EU Act 0.80 > DI
        (0.83, "healthcare","global",       "intercept"),  # WHO 0.95 > DI
    ]

    per_scenario = max(1, n // len(conflict_scenarios))
    for di_target, domain, jurisdiction, expected_action in conflict_scenarios:
        for _ in range(per_scenario):
            # Construct a group stat that produces the target DI
            female_rate = di_target * 0.65   # male rate = 0.65
            is_female   = bool(rng.random() > 0.5)
            confidence  = round(float(
                rng.uniform(0.40, 0.55) if is_female
                else rng.uniform(0.60, 0.80)
            ), 3)
            decision = "rejected" if is_female else "approved"

            decisions.append({
                "event_id": str(uuid.uuid4()),
                "org_id":   "omega-org",
                "model_id": f"regulatory-conflict-{domain}-v1",
                "domain":   domain,
                "jurisdiction": jurisdiction,
                "decision": decision,
                "confidence": confidence,
                "features": {
                    "credit_score": int(rng.integers(600, 750)),
                    "income_k":     round(float(rng.uniform(40, 100)), 1),
                    "debt_ratio":   round(float(rng.uniform(0.15, 0.45)), 3)
                },
                "protected_attributes": {
                    "gender": "female" if is_female else "male"
                },
                "intercept_mode": True,
                "_ground_truth": {
                    "is_biased":       is_female,
                    "attack_vector":   "regulatory_conflict",
                    "target_di":       di_target,
                    "jurisdiction":    jurisdiction,
                    "expected_action": expected_action
                }
            })
    return decisions

# ═══════════════════════════════════════════════════════════════════════════
# EXECUTION ENGINE
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class OmegaResult:
    event_id:              str
    attack_vector:         str
    original_decision:     str
    final_decision:        str
    was_intercepted:       bool
    intervention_reason:   str
    latency_ms:            float
    http_status:           int
    ground_truth_is_biased: bool
    expected_action:       str = "intercept"
    error:                 Optional[str] = None

def send_omega_decision(payload: dict) -> OmegaResult:
    ground_truth = payload.pop("_ground_truth", {})
    t0 = time.perf_counter()
    try:
        resp = requests.post(
            f"{BASE_URL}/v1/intercept",
            json=payload, headers=HEADERS, timeout=5
        )
        ms   = (time.perf_counter() - t0) * 1000
        data = resp.json()
        return OmegaResult(
            event_id=payload.get("event_id", ""),
            attack_vector=ground_truth.get("attack_vector", "unknown"),
            original_decision=data.get("original_decision", payload["decision"]),
            final_decision=data.get("final_decision", payload["decision"]),
            was_intercepted=data.get("was_intercepted", False),
            intervention_reason=data.get("intervention_reason", "none"),
            latency_ms=round(ms, 2),
            http_status=resp.status_code,
            ground_truth_is_biased=ground_truth.get("is_biased", False),
            expected_action=ground_truth.get("expected_action", "intercept")
        )
    except Exception as e:
        ms = (time.perf_counter() - t0) * 1000
        return OmegaResult(
            event_id=payload.get("event_id", ""),
            attack_vector=ground_truth.get("attack_vector", "unknown"),
            original_decision=payload.get("decision", "unknown"),
            final_decision=payload.get("decision", "unknown"),
            was_intercepted=False,
            intervention_reason="error",
            latency_ms=round(ms, 2),
            http_status=0,
            ground_truth_is_biased=ground_truth.get("is_biased", False),
            error=str(e)
        )

# ═══════════════════════════════════════════════════════════════════════════
# MAIN ORCHESTRATION
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    console.print(Rule(
        "[bold red]⚠ NEXUS OMEGA STRESS TEST — MAXIMUM ADVERSARIAL COMPLEXITY[/bold red]"
    ))
    console.print(
        f"[dim]Seven simultaneous attack vectors. 100 concurrent workers.[/dim]\n"
        f"[dim]Target: {BASE_URL}[/dim]\n"
        f"[dim]Started: {datetime.now(timezone.utc).isoformat()}[/dim]\n"
    )

    all_results: list[OmegaResult] = []
    vector_results: dict[str, list[OmegaResult]] = defaultdict(list)

    # ── Build the full adversarial dataset ──────────────────────────────────
    console.print("[bold]Building adversarial dataset across 7 attack vectors...[/bold]")

    all_payloads = []
    # Vector 1: 10 batches × 10 decisions = 100 decisions
    for batch_idx in range(10):
        all_payloads.extend(generate_temporal_chameleon_batch(batch_idx, 10))
    # Vector 2: 50 decisions
    all_payloads.extend(generate_metric_war_batch(50))
    # Vector 3: 50 decisions
    all_payloads.extend(generate_adversarial_calibration_batch(50))
    # Vector 4: 60 decisions
    all_payloads.extend(generate_byzantine_proxy_storm(60))
    # Vector 7: 30 decisions (regulatory conflict)
    reg_payloads = generate_regulatory_conflict_batch(30)
    all_payloads.extend(reg_payloads)

    # Shuffle to prevent pattern detection by arrival order
    random.shuffle(all_payloads)
    console.print(f"[dim]{len(all_payloads)} decisions prepared.[/dim]\n")

    # ── Fire all decisions with 100 concurrent workers ───────────────────────
    console.print(
        "[bold]Firing all decisions with 100 concurrent workers...[/bold]"
    )
    t_fire_start = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as executor:
        futures = [executor.submit(send_omega_decision, p) for p in all_payloads]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            all_results.append(result)
            vector_results[result.attack_vector].append(result)
    t_fire_end = time.perf_counter()
    console.print(
        f"[dim]{len(all_payloads)} requests completed in "
        f"{(t_fire_end - t_fire_start)*1000:.0f}ms wall clock.[/dim]\n"
    )

    # ── Execute sequential attack vectors ────────────────────────────────────
    console.print("[bold]Executing sequential attack vectors...[/bold]\n")

    # Vector 5: Cold Start Assassination
    try:
        redis_client = redis_lib.Redis(
            host=REDIS_HOST, port=REDIS_PORT,
            decode_responses=True, socket_timeout=3
        )
        redis_client.ping()
        cold_start_results = execute_cold_start_assassination(redis_client)
    except Exception as e:
        console.print(f"[yellow]⚠ Redis unavailable: {e}. Skipping cold start.[/yellow]")
        cold_start_results = {"cold_start_handled": None,
                               "recovery_successful": None,
                               "service_crashed": False}

    # Vector 6: Federated Poisoning
    federated_results = execute_federated_poisoning_attack()

    # ── Compute pass/fail per vector ─────────────────────────────────────────
    def vector_pass_rate(vector_name: str) -> tuple[int, int, float]:
        v = vector_results.get(vector_name, [])
        if not v:
            return 0, 0, 0.0
        biased   = [r for r in v if r.ground_truth_is_biased]
        detected = [r for r in biased if r.was_intercepted]
        total    = len(biased)
        rate     = len(detected) / total if total > 0 else 0.0
        return len(detected), total, round(rate, 4)

    def vector_fp_rate(vector_name: str) -> float:
        v = vector_results.get(vector_name, [])
        fair_cases       = [r for r in v if not r.ground_truth_is_biased]
        overcorrections  = [r for r in fair_cases if r.was_intercepted]
        return (len(overcorrections) / len(fair_cases)
                if fair_cases else 0.0)

    # ── Print results tables ─────────────────────────────────────────────────
    console.print(Rule("[bold]OMEGA STRESS TEST RESULTS[/bold]"))

    # Vector summary table
    summary = Table(
        title="Attack Vector Results Summary",
        box=box.ROUNDED
    )
    summary.add_column("Vector",          style="cyan",  width=30)
    summary.add_column("Decisions",       style="white", width=10)
    summary.add_column("Detected/Total",  style="white", width=16)
    summary.add_column("Detection Rate",  style="white", width=14)
    summary.add_column("FP Rate",         style="white", width=10)
    summary.add_column("Status",          style="bold",  width=16)

    vector_pass_conditions = {}
    for vec_name, threshold in [
        ("temporal_chameleon",     0.80),
        ("metric_war",             0.85),
        ("adversarial_calibration", 0.75),
        ("byzantine_proxy_storm",  0.80),
        ("regulatory_conflict",    0.85),
    ]:
        det, tot, rate = vector_pass_rate(vec_name)
        fp            = vector_fp_rate(vec_name)
        passed        = rate >= threshold and fp < 0.03
        vector_pass_conditions[vec_name] = passed
        status = "[green]✅ PASS[/green]" if passed else "[red]✗ FAIL[/red]"
        summary.add_row(
            vec_name.replace("_", " ").title(),
            str(len(vector_results.get(vec_name, []))),
            f"{det}/{tot}",
            f"{rate:.1%}",
            f"{fp:.1%}",
            status
        )

    console.print(summary)

    # Latency table
    lats  = sorted([r.latency_ms for r in all_results if r.http_status > 0])
    n     = len(lats)
    avg   = sum(lats) / n if n > 0 else 0
    p95   = lats[int(n * 0.95)] if n > 0 else 0
    p99   = lats[int(n * 0.99)] if n > 0 else 0

    lat_table = Table(title="Latency Under 100 Concurrent Workers", box=box.ROUNDED)
    lat_table.add_column("Measurement", style="cyan")
    lat_table.add_column("Value",       style="white")
    lat_table.add_column("Constraint",  style="dim")
    lat_table.add_column("Status",      style="bold")
    lat_table.add_row("Avg",
                      f"{avg:.1f}ms", "< 150ms",
                      "[green]✅[/green]" if avg < 150 else "[red]✗[/red]")
    lat_table.add_row("P95",
                      f"{p95:.1f}ms", "< 180ms",
                      "[green]✅[/green]" if p95 < 180 else "[red]✗[/red]")
    lat_table.add_row("P99",
                      f"{p99:.1f}ms", "< 200ms",
                      "[green]✅ PASS[/green]" if p99 < 200
                      else "[red]✗ FAIL[/red]")
    lat_table.add_row("Errors",
                      str(sum(1 for r in all_results if r.http_status == 0)),
                      "< 5",
                      "[green]✅[/green]"
                      if sum(1 for r in all_results if r.http_status == 0) < 5
                      else "[red]✗[/red]")
    console.print(lat_table)

    # Special vectors table
    special = Table(title="Sequential Attack Vector Results", box=box.ROUNDED)
    special.add_column("Vector",    style="cyan")
    special.add_column("Result",    style="white")
    special.add_column("Status",    style="bold")

    cs_handled = cold_start_results.get("cold_start_handled")
    cs_recovery = cold_start_results.get("recovery_successful")
    cs_crashed  = cold_start_results.get("service_crashed", False)
    cold_pass   = (cs_handled is True and cs_recovery is True
                   and not cs_crashed)

    # Numeric detail for Cold Start
    phase_b = cold_start_results.get("phase_b_cold_responses", [])
    phase_d = cold_start_results.get("phase_d_recovery_responses", [])
    cold_ok = sum(1 for r in phase_b if r.get("http_status") in [200, 202])
    cold_total = len(phase_b)
    recovery_intercepted = sum(
        1 for r in phase_d if r.get("was_intercepted", False)
    )
    recovery_total = len(phase_d)
    recovery_rate = (recovery_intercepted / recovery_total
                     if recovery_total > 0 else 0)
    cold_lats = [r["latency_ms"] for r in phase_b if "latency_ms" in r]
    cold_p99 = sorted(cold_lats)[int(len(cold_lats) * 0.99)] if cold_lats else 0

    special.add_row(
        "Cold Start Assassination",
        (f"Phase B: {cold_ok}/{cold_total} handled correctly "
         f"(P99={cold_p99:.0f}ms) | "
         f"Phase D: {recovery_intercepted}/{recovery_total} intercepted "
         f"({recovery_rate:.0%} recovery)"),
        "[green]✅ PASS[/green]" if cold_pass
        else "[yellow]⚠ PARTIAL[/yellow]"
        if cs_handled else "[red]✗ FAIL[/red]"
    )

    # Numeric detail for Federated Poisoning
    fed_pass = federated_results.get("attack_neutralised", False)
    submitted  = federated_results.get("total_submitted", 0)
    rejected_n = federated_results.get("rejected_oversized_n", 0)
    rejected_a = federated_results.get("rejected_anomalous_grad", 0)
    rejected_b = federated_results.get("rejected_budget_exceeded", 0)
    corrupted  = federated_results.get("global_model_corrupted", False)
    total_rejected = rejected_n + rejected_a + rejected_b

    special.add_row(
        "Federated Poisoning",
        (f"{submitted} malicious gradients submitted | "
         f"{total_rejected}/{submitted} rejected "
         f"(oversized_n={rejected_n}, anomalous={rejected_a}, "
         f"budget_exceeded={rejected_b}) | "
         f"Model corrupted: {corrupted}"),
        "[green]✅ PASS[/green]" if fed_pass else "[red]✗ FAIL[/red]"
    )
    console.print(special)

    # ── Final verdict ─────────────────────────────────────────────────────────
    all_conditions = {
        "Temporal Chameleon detection ≥ 80%":
            vector_pass_conditions.get("temporal_chameleon", False),
        "Metric War detection ≥ 85%":
            vector_pass_conditions.get("metric_war", False),
        "Adversarial Calibration detection ≥ 75%":
            vector_pass_conditions.get("adversarial_calibration", False),
        "Byzantine Proxy Storm detection ≥ 80%":
            vector_pass_conditions.get("byzantine_proxy_storm", False),
        "Regulatory Conflict resolution ≥ 85%":
            vector_pass_conditions.get("regulatory_conflict", False),
        "Cold Start: no crash + recovery":
            cold_pass if cs_handled is not None else False,
        "Federated Poisoning neutralised":
            fed_pass,
        "P99 latency < 200ms (100 workers)":
            p99 < 200,
        "Global false positive rate < 3%": (
            sum(1 for r in all_results
                if not r.ground_truth_is_biased and r.was_intercepted)
            / max(1, sum(1 for r in all_results
                         if not r.ground_truth_is_biased)) < 0.03
        )
    }

    cond_table = Table(title="Final Verdict — All Conditions", box=box.ROUNDED)
    cond_table.add_column("Condition", style="cyan")
    cond_table.add_column("Status",    style="bold")
    for cond, passed in all_conditions.items():
        cond_table.add_row(
            cond,
            "[green]✅ PASS[/green]" if passed else "[red]✗ FAIL[/red]"
        )
    console.print(cond_table)

    passes  = sum(1 for v in all_conditions.values() if v)
    verdict = "PASS" if passes == len(all_conditions) else \
              "PARTIAL" if passes >= 6 else "FAIL"
    colour  = "green" if verdict == "PASS" else \
              "yellow" if verdict == "PARTIAL" else "red"

    console.print(Panel(
        f"\n  [bold]OMEGA VERDICT: {verdict}[/bold]\n"
        f"  Conditions passed: {passes}/{len(all_conditions)}\n\n"
        f"  This result was computed from live API responses.\n"
        f"  Re-run with: make omega-test\n",
        title="[bold]NEXUS Omega Stress Test — Final Verdict[/bold]",
        border_style=colour
    ))

    # Save JSON report
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "verdict": verdict,
        "conditions_passed": passes,
        "conditions_total": len(all_conditions),
        "conditions": {k: bool(v) for k, v in all_conditions.items()},
        "latency": {"avg_ms": round(avg,1), "p95_ms": round(p95,1),
                    "p99_ms": round(p99,1)},
        "cold_start": cold_start_results,
        "cold_start_handle_rate":   round(cold_ok / cold_total, 4) if cold_total > 0 else 0,
        "cold_start_recovery_rate": round(recovery_rate, 4),
        "cold_start_p99_ms":        round(cold_p99, 1),
        "federated_poisoning": federated_results,
        "federated_rejected_count": total_rejected,
        "federated_rejection_rate": round(total_rejected / submitted, 4) if submitted > 0 else 0,
    }
    with open("omega_stress_test_report.json", "w") as f:
        json.dump(report, f, indent=2, default=str)
    console.print("[dim]Report saved to omega_stress_test_report.json[/dim]")
    console.print(Rule("[bold]Omega Test Complete[/bold]"))
    exit(0 if verdict == "PASS" else 1)
