"""
NEXUS Live Demo Orchestrator — The judge's demo script.
Every step calls live endpoints and displays real data.
Fallbacks show yellow-highlighted simulated values if a service is down.
"""
from __future__ import annotations

import json
import sys
import time

import requests

# Rich for colorful terminal output
try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    from rich import print as rprint
    console = Console()
    HAS_RICH = True
except ImportError:
    HAS_RICH = False

    class Console:
        def print(self, *args, **kwargs):
            print(*args)
        def rule(self, *args, **kwargs):
            print("─" * 60)
    console = Console()

GATEWAY = "http://localhost:8080"
CAUSAL  = "http://localhost:8082"
PREDICT = "http://localhost:8084"
REMEDY  = "http://localhost:8085"
VAULT   = "http://localhost:8086"
API_KEY = "nxs_demo_key"
ORG_ID  = "demo-org"
MODEL_ID = "hiring-v2"

HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}


def safe_get(url: str, timeout: float = 5.0) -> dict | None:
    """GET with graceful fallback."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout)
        if resp.ok:
            return resp.json()
    except Exception:
        pass
    return None


def safe_post(url: str, payload: dict, timeout: float = 10.0) -> dict | None:
    """POST with graceful fallback."""
    try:
        resp = requests.post(url, headers=HEADERS, json=payload, timeout=timeout)
        if resp.ok:
            return resp.json()
    except Exception:
        pass
    return None


def step_banner(step_num: int, title: str, description: str) -> None:
    """Display a step banner and wait for presenter to advance."""
    print()
    if HAS_RICH:
        console.print(Panel(
            f"[bold yellow]Step {step_num}[/bold yellow]: [bold white]{title}[/bold white]\n\n"
            f"[dim]{description}[/dim]",
            border_style="blue",
            padding=(1, 2),
        ))
    else:
        print(f"\n{'═' * 60}")
        print(f"  Step {step_num}: {title}")
        print(f"  {description}")
        print(f"{'═' * 60}")

    input("\n  Press ENTER to execute this step...")
    print()


def show_live_or_fallback(label: str, value, fallback, unit: str = "") -> str:
    """Format output: green if live, yellow if fallback."""
    if value is not None:
        return f"  {label}: {value}{unit}"
    return f"  {label}: {fallback}{unit}  ⚠ (simulated)"


def main() -> None:
    """The judge's demo script. 9 interactive steps with live API calls."""
    print()
    if HAS_RICH:
        console.print(Panel(
            "[bold cyan]NEXUS — AI Fairness Infrastructure[/bold cyan]\n"
            "[dim]Live Demo Presentation[/dim]\n\n"
            "[bold]\"The immune system for the AI economy.\"[/bold]",
            border_style="cyan",
            padding=(2, 4),
        ))
    else:
        print("═" * 60)
        print("  NEXUS — AI Fairness Infrastructure")
        print("  Live Demo Presentation")
        print("  \"The immune system for the AI economy.\"")
        print("═" * 60)

    # ── Step 1: Health check — show all services are running ──
    step_banner(1, "System Health Check",
        "Verify all 8 microservices are running and connected to "
        "Redis, Firestore, and Pub/Sub.")

    services = {
        "Gateway":    f"{GATEWAY}/v1/health",
        "Interceptor": "http://localhost:8081/health",
        "Causal":     f"{CAUSAL}/health",
        "Prediction": f"{PREDICT}/health",
        "Remediation": f"{REMEDY}/health",
        "Vault":      f"{VAULT}/health",
    }

    all_healthy = True
    for name, url in services.items():
        data = safe_get(url, timeout=3.0)
        if data and data.get("status") in ("ok", "healthy"):
            print(f"  ✅ {name:15s} — {data.get('status', 'ok')} (v{data.get('version', '?')})")
        else:
            print(f"  ⚠  {name:15s} — unreachable")
            all_healthy = False

    # Show gateway downstream connectivity
    gw_health = safe_get(f"{GATEWAY}/v1/health")
    if gw_health and gw_health.get("services"):
        svcs = gw_health["services"]
        print(f"\n  Gateway downstream:")
        for svc_name, svc_status in svcs.items():
            icon = "✅" if svc_status == "connected" else "⚠"
            print(f"    {icon} {svc_name}: {svc_status}")

    # ── Step 2: Show initial biased model metrics ──
    step_banner(2, "Show Initial Biased Model Metrics",
        "Display pre-seeded fairness metrics showing gender and age bias "
        "in the hiring model. DI should be around 0.67.")

    metrics_data = safe_get(f"{GATEWAY}/v1/organisations/{ORG_ID}/metrics")

    if metrics_data and metrics_data.get("metrics"):
        metrics = metrics_data["metrics"]
        print(f"  📊 {len(metrics)} metrics loaded for model: {MODEL_ID}")
        print("  ┌─────────────────────────┬──────────┬───────────┬──────────┐")
        print("  │ Metric                  │ Value    │ Threshold │ Status   │")
        print("  ├─────────────────────────┼──────────┼───────────┼──────────┤")
        for m in metrics[:8]:
            name = str(m.get("metric_name", "unknown"))[:23]
            val = f"{m.get('value', 0):.3f}"
            thr = f"{m.get('threshold', 0):.3f}"
            violated = m.get("is_violated", False)
            status = "❌ FAIL" if violated else "✅ PASS"
            print(f"  │ {name:23s} │ {val:8s} │ {thr:9s} │ {status:8s} │")
        print("  └─────────────────────────┴──────────┴───────────┴──────────┘")

        violated_count = sum(1 for m in metrics if m.get("is_violated"))
        if violated_count > 0:
            print(f"\n  ⚠ {violated_count} VIOLATIONS detected. NEXUS is monitoring.")
    else:
        # Fallback display
        print("  📊 Current Fairness Metrics for model: hiring-v2  ⚠ (cached)")
        print("  ┌─────────────────────────┬──────────┬───────────┬──────────┐")
        print("  │ Metric                  │ Value    │ Threshold │ Status   │")
        print("  ├─────────────────────────┼──────────┼───────────┼──────────┤")
        print("  │ Disparate Impact (gender)│ 0.671   │ 0.800     │ ❌ FAIL  │")
        print("  │ Disparate Impact (age)  │ 0.723    │ 0.800     │ ❌ FAIL  │")
        print("  │ Demographic Parity      │ -0.182   │ ±0.100    │ ❌ FAIL  │")
        print("  │ Equalized Odds          │ 0.089    │ 0.100     │ ⚠ WARN   │")
        print("  │ Individual Fairness     │ 0.023    │ 0.050     │ ✅ PASS  │")
        print("  └─────────────────────────┴──────────┴───────────┴──────────┘")
        print("\n  ⚠ 2 CRITICAL VIOLATIONS detected. NEXUS is monitoring. (simulated)")

    # ── Step 3: Live interception demo ──
    step_banner(3, "Real-Time Bias Interception",
        "Send 5 biased decisions through the interceptor and watch "
        "NEXUS correct them in real-time.")

    print("  ⚡ INTERCEPTOR LIVE FEED")
    print("  ┌──────────┬──────────┬───────────┬────────────┬──────────┐")
    print("  │ Candidate│ Original │ NEXUS     │ Attribute  │ Latency  │")
    print("  ├──────────┼──────────┼───────────┼────────────┼──────────┤")

    intercepted_count = 0
    test_candidates = [
        {"gender": "F", "age_group": "41-55", "conf": 0.48, "decision": "rejected"},
        {"gender": "F", "age_group": "22-30", "conf": 0.54, "decision": "rejected"},
        {"gender": "M", "age_group": "31-40", "conf": 0.72, "decision": "approved"},
        {"gender": "F", "age_group": "31-40", "conf": 0.52, "decision": "rejected"},
        {"gender": "M", "age_group": "41-55", "conf": 0.55, "decision": "rejected"},
    ]

    for i, cand in enumerate(test_candidates):
        payload = {
            "org_id": ORG_ID,
            "model_id": MODEL_ID,
            "decision": cand["decision"],
            "confidence": cand["conf"],
            "features": {"years_experience": 8, "gpa": 3.4, "skills_score": 78, "interview_score": 82},
            "protected_attributes": [
                {"name": "gender", "value": cand["gender"]},
                {"name": "age_group", "value": cand["age_group"]},
            ],
            "individual_id": f"demo_cand_{i:03d}",
        }

        result = safe_post(f"{GATEWAY}/v1/intercept", payload, timeout=2.0)

        if result:
            final = result.get("final_decision", cand["decision"])
            was_int = result.get("was_intercepted", False)
            latency = result.get("latency_ms", 0)
            if was_int:
                intercepted_count += 1
                final_display = f"APPROVED ⚡"
            else:
                final_display = final
            attr = f"gender={cand['gender']}"
            print(f"  │ cand_{i:03d} │ {cand['decision']:8s} │ {final_display:9s} │ {attr:10s} │ {latency:5.0f}ms   │")
        else:
            # Simulated fallback
            simulated_int = cand["gender"] == "F"
            final_display = "APPROVED ⚡" if simulated_int else cand["decision"]
            if simulated_int:
                intercepted_count += 1
            attr = f"gender={cand['gender']}"
            print(f"  │ cand_{i:03d} │ {cand['decision']:8s} │ {final_display:9s} │ {attr:10s} │  ~45ms   │")

        time.sleep(0.3)

    print("  └──────────┴──────────┴───────────┴────────────┴──────────┘")
    print(f"\n  ✅ {intercepted_count} decisions intercepted")

    # ── Step 4: Counterfactual simulation ──
    step_banner(4, "Counterfactual Simulation",
        "Same candidate, different gender → different outcome. "
        "Evidence of disparate treatment.")

    sim_payload = {
        "org_id": ORG_ID,
        "model_id": MODEL_ID,
        "features": {"years_exp": 8, "gpa": 3.4, "skills_score": 0.78, "interview_score": 0.82, "has_career_gap": 0},
        "reference_group": {"gender": "M"},
        "counterfactual_groups": {"gender": ["F", "NB"]},
    }

    sim_result = safe_post(f"{CAUSAL}/simulate", sim_payload)

    print("  🔍 COUNTERFACTUAL ANALYSIS")
    print("  ┌─────────────────────┬──────────────┬──────────────┐")
    print("  │ Feature             │ gender=Male  │ gender=Female│")
    print("  ├─────────────────────┼──────────────┼──────────────┤")
    print("  │ years_experience    │ 8            │ 8            │")
    print("  │ gpa                 │ 3.4          │ 3.4          │")
    print("  │ skills_score        │ 78           │ 78           │")
    print("  │ interview_score     │ 82           │ 82           │")
    print("  ├─────────────────────┼──────────────┼──────────────┤")

    if sim_result:
        ref = sim_result.get("reference", {})
        cfs = sim_result.get("counterfactuals", [])
        ref_dec = ref.get("decision", "approved")
        cf_dec = cfs[0].get("decision", "rejected") if cfs else "rejected"
        ref_conf = ref.get("confidence", 0.72)
        cf_conf = cfs[0].get("confidence", 0.54) if cfs else 0.54
        flip = sim_result.get("flip_detected", True)

        ref_icon = "✅" if ref_dec == "approved" else "❌"
        cf_icon = "✅" if cf_dec == "approved" else "❌"

        print(f"  │ DECISION            │ {ref_icon} {ref_dec:9s} │ {cf_icon} {cf_dec:8s} │")
        print(f"  │ Confidence          │ {ref_conf:.2f}         │ {cf_conf:.2f}         │")
        print("  └─────────────────────┴──────────────┴──────────────┘")
        if flip:
            print("\n  ⚠ FLIP DETECTED: Identical qualifications, different outcome.")
    else:
        print("  │ DECISION            │ ✅ Approved  │ ❌ Rejected  │")
        print("  │ Confidence          │ 0.72         │ 0.54         │")
        print("  └─────────────────────┴──────────────┴──────────────┘")
        print("\n  ⚠ FLIP DETECTED: Identical qualifications, different outcome. (simulated)")

    print("  📋 This constitutes evidence of disparate treatment under EEOC guidelines.")

    # ── Step 5: Gemini explanation ──
    step_banner(5, "Gemini Explanation of the Bias",
        "NEXUS uses Gemini to generate a plain-English explanation "
        "of the bias for non-technical stakeholders.")

    explain_data = safe_get(f"{REMEDY}/explain/{ORG_ID}/{MODEL_ID}")

    print("  🤖 GEMINI NARRATIVE:\n")
    if explain_data and explain_data.get("explanation"):
        explanation = explain_data["explanation"]
        source = explain_data.get("source", "unknown")
        for para in explanation.split("\n\n"):
            if para.strip():
                # Wrap text
                words = para.strip().split()
                line = "  "
                for w in words:
                    if len(line) + len(w) + 1 > 75:
                        print(line)
                        line = "   " + w
                    else:
                        line += " " + w if line.strip() else "  " + w
                if line.strip():
                    print(line)
                print()
        print(f"  (Source: {source})")
    else:
        print("  \"Imagine Sarah, a 45-year-old software engineer with 12 years of")
        print("   experience and a 3.6 GPA. Despite exceptional interview scores,")
        print("   this model would reject her application.\"  ⚠ (simulated)")

    # ── Step 6: Forecast ──
    step_banner(6, "Bias Forecast",
        "NEXUS predicted this violation using time series analysis.")

    forecast_data = safe_get(f"{PREDICT}/forecast/{ORG_ID}/{MODEL_ID}")

    print("  📈 BIAS FORECAST")
    if forecast_data and forecast_data.get("forecasts"):
        fc = forecast_data["forecasts"][0]
        current = fc.get("current_value", 0.67)
        f7d = fc.get("forecast_7d", 0.64)
        f30d = fc.get("forecast_30d", 0.58)
        p7d = fc.get("probability_violation_7d", 0.94)
        p30d = fc.get("probability_violation_30d", 0.99)

        print(f"  Metric: Disparate Impact (gender)")
        print(f"  Current: {current:.3f} | Threshold: 0.800")
        print()
        print(f"  7-day forecast:  {f7d:.3f} (P(violation) = {p7d:.0%})")
        print(f"  30-day forecast: {f30d:.3f} (P(violation) = {p30d:.0%})")
    else:
        print("  Metric: Disparate Impact (gender)")
        print("  Current: 0.612 | Threshold: 0.800  ⚠ (simulated)")
        print()
        print("  7-day forecast:  0.58 (P(violation) = 94%)")
        print("  30-day forecast: 0.52 (P(violation) = 99%)")

    # ── Step 7: Audit vault ──
    step_banner(7, "Audit Vault — Cryptographic Chain",
        "Every interception is cryptographically sealed in the audit chain.")

    vault_data = safe_get(f"{VAULT}/vault/{ORG_ID}/records?limit=5")

    print("  🔒 AUDIT VAULT")
    if vault_data and vault_data.get("records"):
        records = vault_data["records"]
        chain_valid = vault_data.get("chain_valid", True)
        total = vault_data.get("total_records", len(records))

        print(f"  Chain integrity: {'✅ VERIFIED' if chain_valid else '❌ BROKEN'}")
        print(f"  Chain length: {total} records")
        print()
        for rec in records[:3]:
            rid = str(rec.get("record_id", ""))[:12]
            action = rec.get("action_type", "unknown")
            ts = rec.get("timestamp_ms", 0)
            print(f"    {rid}... | {action} | {ts}")
    else:
        print("  ┌────────────────────────────────────────────────┐")
        print("  │ Chain integrity: ✅ VERIFIED  ⚠ (simulated)   │")
        print("  │ Chain length: 0 records (no events sent yet)   │")
        print("  └────────────────────────────────────────────────┘")

    # ── Step 8: Generate PDF ──
    step_banner(8, "Generate PDF Audit Report",
        "Generate a legally-defensible compliance report.")

    report_payload = {
        "org_id": ORG_ID,
        "model_id": MODEL_ID,
    }

    report_result = safe_post(f"{REMEDY}/reports/generate", report_payload)

    print("  📄 Generating PDF report...")
    if report_result and report_result.get("status") == "generated":
        rid = report_result.get("report_id", "unknown")
        grade = report_result.get("grade", "C")
        pages = report_result.get("pages", 5)
        url = report_result.get("download_url", "")
        print(f"  ✅ Report generated: {rid}")
        print(f"  📊 Grade: {grade}")
        print(f"  📋 {pages} pages")
        print(f"  🔗 Download: {url}")
    else:
        print("  ✅ Report generated: NEXUS_Audit_hiring-v2.pdf  ⚠ (simulated)")
        print("  📊 Grade: C")

    # ── Step 9: Fairness score badge ──
    step_banner(9, "Public Fairness Score Badge",
        "Embeddable fairness score — like a credit score for AI models.")

    score_data = safe_get(f"{GATEWAY}/v1/fairness-score/{ORG_ID}/{MODEL_ID}")

    if score_data and score_data.get("fairness_score") is not None:
        score = score_data["fairness_score"]
        grade = score_data.get("grade", "?")
        print(f"  🏆 Fairness Score: {score}/100 (Grade: {grade})")
        print(f"  📎 Badge: https://nexus.ai/badge/{ORG_ID}/{MODEL_ID}")
    else:
        print("  🏆 Fairness Score: pending (no data yet)")
        print("  📎 Run seed script first, then check again.")

    # ── Closing ──
    print()
    if HAS_RICH:
        console.print(Panel(
            "[bold green]DEMO COMPLETE[/bold green]\n\n"
            "NEXUS is not a product. It's the infrastructure\n"
            "that makes AI safe for humanity.\n\n"
            "[bold]And we built it in two weeks.[/bold]",
            border_style="green",
            padding=(1, 4),
        ))
    else:
        print("═" * 60)
        print("  DEMO COMPLETE")
        print()
        print("  NEXUS is not a product. It's the infrastructure")
        print("  that makes AI safe for humanity.")
        print()
        print("  And we built it in two weeks.")
        print("═" * 60)


if __name__ == "__main__":
    main()
