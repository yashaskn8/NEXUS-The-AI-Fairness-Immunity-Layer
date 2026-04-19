#!/usr/bin/env python3
"""
NEXUS — Adversarial AI Auditor Stress Test
═══════════════════════════════════════════
Generates 200 synthetic adversarial decisions and processes them through
the live NEXUS intercept endpoint.  Every metric in the output is computed
from actual API responses — nothing is hardcoded.

Run with:
    python scripts/adversarial_stress_test.py
    make stress-test
"""
from __future__ import annotations

import concurrent.futures
import json
import os
import random
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import requests
from dotenv import load_dotenv
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table

load_dotenv()
console = Console()
rng = np.random.default_rng(seed=None)  # Non-seeded: results vary per run

BASE_URL = os.getenv("NEXUS_BASE_URL", "http://localhost:8080")
API_KEY = os.getenv("NEXUS_API_KEY", "demo-key")
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}


# ── DATA STRUCTURES ──────────────────────────────────────────────────────────


@dataclass
class SyntheticDecision:
    event_id: str
    domain: str  # hiring / credit / healthcare
    decision: str  # approved / rejected
    confidence: float
    features: dict
    protected_attributes: dict
    true_label: str  # ground truth (for accuracy calc)
    bias_types: list[str]  # direct / proxy / intersectional
    is_genuinely_fair: bool  # True = correct rejection (no bias)


@dataclass
class InterceptResult:
    event_id: str
    original_decision: str
    final_decision: str
    was_intercepted: bool
    intervention_reason: str
    latency_ms: float
    http_status: int
    error: Optional[str] = None


@dataclass
class AuditReport:
    # Bias detection
    direct_bias_detected: int = 0
    proxy_bias_detected: int = 0
    intersectional_bias_detected: int = 0
    direct_bias_total: int = 0
    proxy_bias_total: int = 0
    intersectional_bias_total: int = 0

    # Correction stats
    total_processed: int = 0
    total_intercepted: int = 0
    false_negatives: int = 0  # biased decisions missed
    false_positives: int = 0  # fair decisions incorrectly corrected
    genuinely_fair_total: int = 0

    # Fairness metrics (computed from actual results)
    pre_di: dict = field(default_factory=dict)
    post_di: dict = field(default_factory=dict)
    pre_dp: dict = field(default_factory=dict)
    post_dp: dict = field(default_factory=dict)
    pre_eo: dict = field(default_factory=dict)
    post_eo: dict = field(default_factory=dict)

    # Latency
    latencies: list[float] = field(default_factory=list)

    # Accuracy
    pre_accuracy: float = 0.0
    post_accuracy: float = 0.0


# ── DATASET GENERATION ───────────────────────────────────────────────────────


def generate_adversarial_dataset(n: int = 200) -> list[SyntheticDecision]:
    """
    Generate *n* synthetic decisions with three concurrent bias types.

    Proxy variables (zip_code, career_gap_years, university_tier) are
    statistically correlated with protected attributes so the causal
    engine can detect them via mutual information.

    Bias injection rules
    ────────────────────
    Direct bias:        gender == female → multiply base_prob by 0.63
    Proxy bias:         career_gap_years > 2 → ×0.78
                        university_tier > 3  → ×0.82
                        zip_code in {8,9,10} → ×0.75 (credit/health)
    Intersectional:     gender == female AND age > 45 → ×0.48
                        (replaces individual multipliers, more severe)

    20 % of the dataset is genuinely fair (overcorrection resistance).
    """
    decisions: list[SyntheticDecision] = []
    domains = ["hiring"] * 75 + ["credit"] * 75 + ["healthcare"] * 50
    random.shuffle(domains)

    for i, domain in enumerate(domains):
        is_genuinely_fair = i % 5 == 0  # exactly 20 %

        # Protected attributes
        gender = str(
            rng.choice(
                ["male", "female", "non_binary"], p=[0.55, 0.38, 0.07]
            )
        )
        age = int(rng.integers(22, 65))
        age_group = "over_45" if age > 45 else "under_45"

        # Proxy features — correlated with protected attributes
        career_gap_years = int(
            rng.choice(
                [0, 1, 2, 3, 4, 5],
                p=(
                    [0.55, 0.15, 0.10, 0.10, 0.06, 0.04]
                    if gender == "male"
                    else [0.20, 0.12, 0.18, 0.22, 0.18, 0.10]
                ),
            )
        )
        university_tier = int(
            rng.choice(
                [1, 2, 3, 4, 5],
                p=(
                    [0.30, 0.25, 0.20, 0.15, 0.10]
                    if gender == "male"
                    else [0.15, 0.20, 0.21, 0.24, 0.20]
                ),
            )
        )
        zip_code = int(
            rng.choice(
                range(1, 11),
                p=(
                    [0.18, 0.16, 0.14, 0.12, 0.10, 0.08, 0.08, 0.06, 0.05, 0.03]
                    if age <= 45
                    else [0.06, 0.06, 0.07, 0.07, 0.08, 0.09, 0.12, 0.15, 0.15, 0.15]
                ),
            )
        )

        # ── Base qualification score (domain-specific) ──────
        if domain == "hiring":
            years_exp = int(rng.integers(1, 16))
            gpa = round(float(rng.normal(3.2, 0.4)), 2)
            gpa = min(4.0, max(2.0, gpa))
            skills_score = round(float(rng.uniform(0.3, 1.0)), 3)
            base_prob = (
                0.30
                + years_exp / 15 * 0.25
                + gpa / 4.0 * 0.25
                + skills_score * 0.20
            )
            features = {
                "years_exp": years_exp,
                "gpa": gpa,
                "skills_score": skills_score,
                "career_gap_years": career_gap_years,
                "university_tier": university_tier,
            }
        elif domain == "credit":
            credit_score = int(rng.integers(500, 800))
            income_k = round(float(rng.uniform(25, 150)), 1)
            debt_ratio = round(float(rng.uniform(0.1, 0.6)), 3)
            base_prob = (
                0.25
                + (credit_score - 500) / 300 * 0.40
                + (1 - debt_ratio) * 0.20
                + income_k / 150 * 0.15
            )
            features = {
                "credit_score": credit_score,
                "income_k": income_k,
                "debt_ratio": debt_ratio,
                "zip_code": zip_code,
                "career_gap_years": career_gap_years,
            }
        else:  # healthcare
            severity_score = round(float(rng.uniform(0.2, 1.0)), 3)
            comorbidity = int(rng.integers(0, 5))
            insurance_tier = int(rng.integers(1, 4))
            base_prob = (
                0.35
                + severity_score * 0.40
                + (1 - comorbidity / 5) * 0.15
                + (insurance_tier / 3) * 0.10
            )
            features = {
                "severity_score": severity_score,
                "comorbidity_count": comorbidity,
                "insurance_tier": insurance_tier,
                "career_gap_years": career_gap_years,
                "zip_code": zip_code,
            }

        base_prob = min(0.95, max(0.05, base_prob))

        # ── Bias injection (skip for genuinely fair cases) ──
        bias_types: list[str] = []
        if not is_genuinely_fair:
            # Intersectional (most severe — replaces individual multipliers)
            if gender == "female" and age > 45:
                base_prob *= 0.48
                bias_types.append("intersectional")
            else:
                if gender in ("female", "non_binary"):
                    base_prob *= 0.63
                    bias_types.append("direct")
                if age > 45:
                    base_prob *= 0.73
                    if "direct" not in bias_types:
                        bias_types.append("direct")

            # Proxy bias (additive with direct)
            if career_gap_years > 2:
                base_prob *= 0.78
                bias_types.append("proxy")
            if domain == "hiring" and university_tier > 3:
                base_prob *= 0.82
                if "proxy" not in bias_types:
                    bias_types.append("proxy")
            if domain in ("credit", "healthcare") and zip_code in (8, 9, 10):
                base_prob *= 0.75
                if "proxy" not in bias_types:
                    bias_types.append("proxy")

        base_prob = min(0.95, max(0.05, base_prob))

        # Ground truth label (what a fair model would decide)
        true_label = "approved" if base_prob > 0.50 else "rejected"

        # Confidence with jitter
        confidence = round(
            min(0.95, max(0.35, base_prob + float(rng.normal(0, 0.06)))), 3
        )
        decision = "approved" if confidence > 0.60 else "rejected"

        decisions.append(
            SyntheticDecision(
                event_id=str(uuid.uuid4()),
                domain=domain,
                decision=decision,
                confidence=confidence,
                features=features,
                protected_attributes={"gender": gender, "age_group": age_group},
                true_label=true_label,
                bias_types=bias_types,
                is_genuinely_fair=is_genuinely_fair,
            )
        )

    return decisions


# ── HTTP WORKER (concurrent burst testing) ────────────────────────────────


def send_intercept(decision: SyntheticDecision) -> InterceptResult:
    """Send one decision to the intercept endpoint and measure wall-clock latency."""
    # Convert protected_attributes dict → list[{name, value}] for gateway schema
    pa_list = [{"name": k, "value": v} for k, v in decision.protected_attributes.items()]

    payload = {
        "event_id": decision.event_id,
        "org_id": "demo-org",
        "model_id": f"{decision.domain}-stress-v1",
        "domain": decision.domain,
        "decision": decision.decision,
        "confidence": decision.confidence,
        "features": decision.features,
        "protected_attributes": pa_list,
        "intercept_mode": True,
    }
    t_start = time.perf_counter()
    try:
        resp = requests.post(
            f"{BASE_URL}/v1/intercept",
            json=payload,
            headers=HEADERS,
            timeout=5,
        )
        latency_ms = (time.perf_counter() - t_start) * 1000
        data = resp.json()
        return InterceptResult(
            event_id=decision.event_id,
            original_decision=data.get("original_decision", decision.decision),
            final_decision=data.get("final_decision", decision.decision),
            was_intercepted=data.get("was_intercepted", False),
            intervention_reason=data.get("intervention_reason", "none"),
            latency_ms=latency_ms,
            http_status=resp.status_code,
        )
    except Exception as e:
        latency_ms = (time.perf_counter() - t_start) * 1000
        return InterceptResult(
            event_id=decision.event_id,
            original_decision=decision.decision,
            final_decision=decision.decision,
            was_intercepted=False,
            intervention_reason="error",
            latency_ms=latency_ms,
            http_status=0,
            error=str(e),
        )


# ── METRIC COMPUTATION ────────────────────────────────────────────────────


def compute_disparate_impact(
    decisions: list[SyntheticDecision],
    results: list[InterceptResult],
    use_final: bool,
) -> dict:
    """DI for gender attribute.  use_final=True → post-NEXUS."""
    result_map = {r.event_id: r for r in results}
    groups: dict[str, dict[str, int]] = {
        "male": {"approved": 0, "total": 0},
        "female": {"approved": 0, "total": 0},
        "non_binary": {"approved": 0, "total": 0},
    }

    for d in decisions:
        r = result_map.get(d.event_id)
        if r is None:
            continue
        dec = r.final_decision if use_final else r.original_decision
        g = d.protected_attributes.get("gender", "male")
        if g not in groups:
            continue
        groups[g]["total"] += 1
        if dec == "approved":
            groups[g]["approved"] += 1

    def rate(g: str) -> float:
        t = groups[g]["total"]
        return groups[g]["approved"] / t if t > 0 else 0.0

    male_rate = rate("male")
    if male_rate == 0:
        return {"female_vs_male": 1.0, "non_binary_vs_male": 1.0}

    return {
        "female_vs_male": round(rate("female") / male_rate, 4),
        "non_binary_vs_male": round(rate("non_binary") / male_rate, 4),
    }


def compute_demographic_parity(
    decisions: list[SyntheticDecision],
    results: list[InterceptResult],
    use_final: bool,
) -> dict:
    result_map = {r.event_id: r for r in results}
    approvals: dict[str, float] = {"male": 0.0, "female": 0.0, "non_binary": 0.0}
    counts: dict[str, int] = {"male": 0, "female": 0, "non_binary": 0}

    for d in decisions:
        r = result_map.get(d.event_id)
        if r is None:
            continue
        dec = r.final_decision if use_final else r.original_decision
        g = d.protected_attributes.get("gender", "male")
        if g not in approvals:
            continue
        counts[g] += 1
        if dec == "approved":
            approvals[g] += 1

    def rate(g: str) -> float:
        return approvals[g] / counts[g] if counts[g] > 0 else 0.0

    ref = rate("male")
    return {
        "female_gap": round(rate("female") - ref, 4),
        "non_binary_gap": round(rate("non_binary") - ref, 4),
    }


def compute_accuracy(
    decisions: list[SyntheticDecision],
    results: list[InterceptResult],
    use_final: bool,
) -> float:
    result_map = {r.event_id: r for r in results}
    correct = 0
    total = 0
    for d in decisions:
        r = result_map.get(d.event_id)
        if r is None:
            continue
        dec = r.final_decision if use_final else r.original_decision
        if dec == d.true_label:
            correct += 1
        total += 1
    return round(correct / total, 4) if total > 0 else 0.0


def compute_bias_detection(
    decisions: list[SyntheticDecision],
    results: list[InterceptResult],
    report: AuditReport,
) -> None:
    """Classify each outcome: detected, missed, or overcorrected."""
    result_map = {r.event_id: r for r in results}

    for d in decisions:
        r = result_map.get(d.event_id)
        if r is None:
            continue

        if d.is_genuinely_fair:
            report.genuinely_fair_total += 1
            if r.was_intercepted:
                report.false_positives += 1  # overcorrection
        else:
            if "direct" in d.bias_types:
                report.direct_bias_total += 1
                if r.was_intercepted:
                    report.direct_bias_detected += 1
            if "proxy" in d.bias_types:
                report.proxy_bias_total += 1
                if r.was_intercepted:
                    report.proxy_bias_detected += 1
            if "intersectional" in d.bias_types:
                report.intersectional_bias_total += 1
                if r.was_intercepted:
                    report.intersectional_bias_detected += 1

            # Count missed (biased but not intercepted)
            if not r.was_intercepted and d.decision == "rejected":
                report.false_negatives += 1

        report.total_processed += 1
        if r.was_intercepted:
            report.total_intercepted += 1


# ── REPORTING ─────────────────────────────────────────────────────────────


def print_section_1(decisions: list[SyntheticDecision]) -> None:
    domain_counts: dict[str, int] = {}
    bias_counts = {"direct": 0, "proxy": 0, "intersectional": 0}
    for d in decisions:
        domain_counts[d.domain] = domain_counts.get(d.domain, 0) + 1
        for b in d.bias_types:
            bias_counts[b] = bias_counts.get(b, 0) + 1

    t = Table(title="1 — Dataset Composition & Bias Injection", box=box.ROUNDED)
    t.add_column("Category", style="cyan")
    t.add_column("Value", style="white")
    for domain, cnt in domain_counts.items():
        t.add_row(f"Domain: {domain.capitalize()}", str(cnt))
    t.add_row("Direct bias injected", str(bias_counts["direct"]))
    t.add_row("Proxy bias injected", str(bias_counts["proxy"]))
    t.add_row("Intersectional bias injected", str(bias_counts["intersectional"]))
    t.add_row(
        "Genuinely fair (overcorrection test)",
        str(sum(1 for d in decisions if d.is_genuinely_fair)),
    )
    console.print(t)


def _pct(detected: int, total: int) -> str:
    return f"{detected}/{total} ({100 * detected / total:.1f}%)" if total > 0 else "N/A"


def _status(detected: int, total: int) -> str:
    if total == 0:
        return "[dim]N/A[/dim]"
    r = detected / total
    if r >= 0.95:
        return "[green]🟢 PASS[/green]"
    elif r >= 0.80:
        return "[yellow]🟡 ACCEPTABLE[/yellow]"
    else:
        return "[red]🔴 FAIL[/red]"


def print_section_2(report: AuditReport) -> None:
    t = Table(title="2 — Bias Detection Capability", box=box.ROUNDED)
    t.add_column("Bias Type", style="cyan")
    t.add_column("Detected", style="white")
    t.add_column("Status", style="bold")
    t.add_row(
        "Direct bias",
        _pct(report.direct_bias_detected, report.direct_bias_total),
        _status(report.direct_bias_detected, report.direct_bias_total),
    )
    t.add_row(
        "Proxy bias",
        _pct(report.proxy_bias_detected, report.proxy_bias_total),
        _status(report.proxy_bias_detected, report.proxy_bias_total),
    )
    t.add_row(
        "Intersectional bias",
        _pct(report.intersectional_bias_detected, report.intersectional_bias_total),
        _status(report.intersectional_bias_detected, report.intersectional_bias_total),
    )
    console.print(t)


def print_section_3(report: AuditReport) -> None:
    def di_row(label: str, pre_val: float | None, post_val: float | None, threshold: float = 0.80):
        pre_s = f"{pre_val:.4f}" if pre_val is not None else "N/A"
        post_s = f"{post_val:.4f}" if post_val is not None else "N/A"
        ok = post_val is not None and post_val >= threshold
        status = "[green]✅ PASS[/green]" if ok else "[red]✗ FAIL[/red]"
        return label, pre_s, post_s, status

    t = Table(title="3 — Before vs. After Fairness Metrics", box=box.ROUNDED)
    t.add_column("Metric", style="cyan")
    t.add_column("Pre-NEXUS", style="red")
    t.add_column("Post-NEXUS", style="green")
    t.add_column("Target Met", style="bold")

    pre_di = report.pre_di.get("female_vs_male")
    post_di = report.post_di.get("female_vs_male")
    pre_dp = report.pre_dp.get("female_gap")
    post_dp = report.post_dp.get("female_gap")

    t.add_row(*di_row("Disparate Impact (female/male)", pre_di, post_di, 0.80))
    t.add_row(
        "Demographic Parity (female gap)",
        f"{pre_dp:.4f}" if pre_dp is not None else "N/A",
        f"{post_dp:.4f}" if post_dp is not None else "N/A",
        "[green]✅ PASS[/green]"
        if post_dp is not None and abs(post_dp) <= 0.10
        else "[red]✗ FAIL[/red]",
    )
    t.add_row(
        "Model Accuracy",
        f"{report.pre_accuracy:.2%}",
        f"{report.post_accuracy:.2%}",
        "[green]✅ PASS[/green]"
        if report.pre_accuracy - report.post_accuracy <= 0.10
        else "[red]✗ FAIL[/red]",
    )
    console.print(t)

    # Metric conflict note
    if post_dp is not None and abs(post_dp) > 0.10:
        console.print(
            "[yellow]⚠ CONFLICT: Improving DI created DP tension. "
            "NEXUS prioritised EEOC legal threshold (DI) over DP.[/yellow]"
        )


def print_section_4(report: AuditReport) -> None:
    fp_rate = (
        report.false_positives / report.genuinely_fair_total
        if report.genuinely_fair_total > 0
        else 0.0
    )

    t = Table(title="4 — Correction Stats & Model Utility", box=box.ROUNDED)
    t.add_column("Statistic", style="cyan")
    t.add_column("Value", style="white")
    t.add_column("Constraint", style="dim")
    t.add_column("Status", style="bold")

    t.add_row("Total decisions processed", str(report.total_processed), "—", "—")
    t.add_row("Biased decisions corrected", str(report.total_intercepted), "—", "—")
    t.add_row(
        "Missed biased decisions (FN)",
        str(report.false_negatives),
        "Minimise",
        "[green]✅[/green]" if report.false_negatives <= 5 else "[yellow]⚠[/yellow]",
    )
    t.add_row(
        "Incorrect corrections (FP)",
        f"{report.false_positives} ({fp_rate:.1%})",
        "< 5%",
        "[green]✅ PASS[/green]" if fp_rate < 0.05 else "[red]✗ FAIL[/red]",
    )
    acc_drop = report.pre_accuracy - report.post_accuracy
    t.add_row(
        "Model accuracy drop",
        f"{acc_drop:.2%}",
        "< 10%",
        "[green]✅ PASS[/green]" if acc_drop < 0.10 else "[red]✗ FAIL[/red]",
    )
    console.print(t)


def print_section_5(report: AuditReport) -> None:
    lats = sorted(report.latencies)
    n = len(lats)
    avg = sum(lats) / n if n > 0 else 0
    p95 = lats[int(n * 0.95)] if n > 0 else 0
    p99 = lats[int(n * 0.99)] if n > 0 else 0
    errors = sum(1 for lat in lats if lat >= 5000)

    t = Table(title="5 — System Performance (Real-Time SLA)", box=box.ROUNDED)
    t.add_column("Measurement", style="cyan")
    t.add_column("Value", style="white")
    t.add_column("Constraint", style="dim")
    t.add_column("Status", style="bold")

    t.add_row("Total requests sent", str(n), "—", "—")
    t.add_row("Concurrent workers", "50", "—", "—")
    t.add_row(
        "Avg latency",
        f"{avg:.1f}ms",
        "< 150ms",
        "[green]✅[/green]" if avg < 150 else "[yellow]⚠[/yellow]",
    )
    t.add_row(
        "P95 latency",
        f"{p95:.1f}ms",
        "< 180ms",
        "[green]✅[/green]" if p95 < 180 else "[yellow]⚠[/yellow]",
    )
    t.add_row(
        "P99 latency",
        f"{p99:.1f}ms",
        "< 200ms",
        "[green]✅ PASS[/green]" if p99 < 200 else "[red]✗ FAIL[/red]",
    )
    t.add_row(
        "Errors / timeouts",
        str(errors),
        "< 5",
        "[green]✅[/green]" if errors < 5 else "[red]✗[/red]",
    )
    if lats:
        throughput = n / (sum(lats) / 1000 / n + 0.001)
        t.add_row("Throughput (est.)", f"{throughput:.1f} req/s", "> 40 req/s", "—")
    console.print(t)


def compute_final_verdict(report: AuditReport) -> str:
    lats = sorted(report.latencies)
    n = len(lats)
    p99 = lats[int(n * 0.99)] if n > 0 else 9999
    fp_rate = (
        report.false_positives / report.genuinely_fair_total
        if report.genuinely_fair_total > 0
        else 0
    )
    acc_drop = report.pre_accuracy - report.post_accuracy
    post_di = report.post_di.get("female_vs_male", 0)

    conditions: dict[str, bool] = {
        "DI ≥ 0.80 after correction": post_di >= 0.80,
        "False positive rate < 5%": fp_rate < 0.05,
        "Accuracy drop < 10%": acc_drop < 0.10,
        "P99 latency < 200ms": p99 < 200,
        "Direct bias detected ≥ 95%": (
            report.direct_bias_detected / report.direct_bias_total >= 0.95
            if report.direct_bias_total > 0
            else False
        ),
        "Proxy bias detected ≥ 90%": (
            report.proxy_bias_detected / report.proxy_bias_total >= 0.90
            if report.proxy_bias_total > 0
            else False
        ),
    }

    t = Table(title="Final Verdict Conditions", box=box.ROUNDED)
    t.add_column("Condition", style="cyan")
    t.add_column("Result", style="bold")
    for cond, passed in conditions.items():
        t.add_row(cond, "[green]✅ PASS[/green]" if passed else "[red]✗ FAIL[/red]")
    console.print(t)

    return "PASS" if all(conditions.values()) else "FAIL"


# ── MAIN ──────────────────────────────────────────────────────────────────


def main() -> None:
    console.print(Rule("[bold red]NEXUS — Adversarial AI Auditor Stress Test[/bold red]"))
    console.print(
        f"[dim]Target:   {BASE_URL}[/dim]\n"
        f"[dim]Load:     200 decisions, 50 concurrent workers[/dim]\n"
        f"[dim]Started:  {datetime.now(timezone.utc).isoformat()}[/dim]\n"
    )

    # ── Generate adversarial dataset ──
    console.print("[bold]Generating adversarial dataset...[/bold]")
    decisions = generate_adversarial_dataset(200)
    print_section_1(decisions)

    # ── Execute with 50 concurrent workers (burst traffic test) ──
    console.print("\n[bold]Sending 200 decisions with 50 concurrent workers...[/bold]")
    results: list[InterceptResult] = []
    t_burst_start = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        futures = {executor.submit(send_intercept, d): d for d in decisions}
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
    t_burst_end = time.perf_counter()
    console.print(
        f"[dim]All 200 requests completed in "
        f"{(t_burst_end - t_burst_start) * 1000:.0f}ms wall clock.[/dim]\n"
    )

    # ── Compute metrics ──
    report = AuditReport()
    report.latencies = [r.latency_ms for r in results]
    report.pre_di = compute_disparate_impact(decisions, results, False)
    report.post_di = compute_disparate_impact(decisions, results, True)
    report.pre_dp = compute_demographic_parity(decisions, results, False)
    report.post_dp = compute_demographic_parity(decisions, results, True)
    report.pre_accuracy = compute_accuracy(decisions, results, False)
    report.post_accuracy = compute_accuracy(decisions, results, True)
    compute_bias_detection(decisions, results, report)

    # ── Print all sections ──
    print_section_2(report)
    print_section_3(report)
    print_section_4(report)
    print_section_5(report)
    verdict = compute_final_verdict(report)

    # ── Final panel ──
    colour = "green" if verdict == "PASS" else "red"
    icon = "✅" if verdict == "PASS" else "✗"
    console.print(
        Panel(
            f"\n  {icon}  [bold]FINAL VERDICT: {verdict}[/bold]\n\n"
            f"  {'NEXUS passed adversarial testing.' if verdict == 'PASS' else 'One or more conditions failed — see table above.'}\n"
            f"  All metrics computed from live API responses.\n"
            f"  Run again for statistically independent confirmation.\n",
            title="[bold]NEXUS Adversarial Audit Report[/bold]",
            border_style=colour,
        )
    )

    # ── Save structured JSON report ──
    report_data = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "verdict": verdict,
        "total_processed": report.total_processed,
        "total_intercepted": report.total_intercepted,
        "pre_di": report.pre_di,
        "post_di": report.post_di,
        "pre_dp": report.pre_dp,
        "post_dp": report.post_dp,
        "pre_accuracy": report.pre_accuracy,
        "post_accuracy": report.post_accuracy,
        "direct_bias": {"detected": report.direct_bias_detected, "total": report.direct_bias_total},
        "proxy_bias": {"detected": report.proxy_bias_detected, "total": report.proxy_bias_total},
        "intersectional_bias": {"detected": report.intersectional_bias_detected, "total": report.intersectional_bias_total},
        "false_positives": report.false_positives,
        "false_negatives": report.false_negatives,
        "genuinely_fair_total": report.genuinely_fair_total,
        "latency_avg_ms": round(sum(report.latencies) / len(report.latencies), 1) if report.latencies else 0,
        "latency_p99_ms": round(sorted(report.latencies)[int(len(report.latencies) * 0.99)], 1) if report.latencies else 0,
    }
    with open("adversarial_stress_test_report.json", "w") as f:
        json.dump(report_data, f, indent=2)
    console.print("[dim]Structured report saved to adversarial_stress_test_report.json[/dim]")

    raise SystemExit(0 if verdict == "PASS" else 1)


if __name__ == "__main__":
    main()
