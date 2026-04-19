"""
NEXUS Verification Script — Checks all 12 acceptance criteria.
Run after `make demo` to verify the system is working correctly.
"""
from __future__ import annotations

import json
import sys
import time

import requests

GATEWAY = "http://localhost:8080"
CAUSAL  = "http://localhost:8082"
PREDICT = "http://localhost:8084"
REMEDY  = "http://localhost:8085"
VAULT   = "http://localhost:8086"
API_KEY = "nxs_demo_key"
ORG_ID  = "demo-org"
MODEL_ID = "hiring-v2"

HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

passed = 0
failed = 0
warnings = 0


def check(name: str, condition: bool, detail: str = "") -> bool:
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✅ {name}")
        if detail:
            print(f"     {detail}")
        return True
    else:
        failed += 1
        print(f"  ❌ {name}")
        if detail:
            print(f"     {detail}")
        return False


def warn(name: str, detail: str = "") -> None:
    global warnings
    warnings += 1
    print(f"  ⚠  {name}")
    if detail:
        print(f"     {detail}")


def safe_get(url: str, timeout: float = 5.0) -> dict | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout)
        if resp.ok:
            return resp.json()
    except Exception:
        pass
    return None


def safe_post(url: str, payload: dict, timeout: float = 10.0) -> dict | None:
    try:
        resp = requests.post(url, headers=HEADERS, json=payload, timeout=timeout)
        if resp.ok:
            return resp.json()
    except Exception:
        pass
    return None


def main() -> None:
    print("═" * 60)
    print("  NEXUS — Acceptance Criteria Verification")
    print("═" * 60)
    print()

    # ── Output 1: Health check ──
    print("[1/12] Gateway health check")
    health = safe_get(f"{GATEWAY}/v1/health")
    if health:
        check("Gateway responds to /v1/health", True, f"Status: {health.get('status')}")
        check("Status is 'ok'", health.get("status") == "ok", f"Got: {health.get('status')}")
        services = health.get("services", {})
        check("Redis connected", services.get("redis") == "connected")
        check("Firestore connected", services.get("firestore") == "connected")
    else:
        check("Gateway responds to /v1/health", False, "Gateway unreachable")

    # ── Output 2: Interceptor health ──
    print("\n[2/12] Interceptor health check")
    int_health = safe_get("http://localhost:8081/health")
    if int_health:
        check("Interceptor healthy", int_health.get("status") == "ok")
        check("Assessor loaded", int_health.get("assessor_loaded", False))
        check("Cache keys loaded", int_health.get("cache_keys_loaded", 0) > 0,
              f"Keys: {int_health.get('cache_keys_loaded', 0)}")
    else:
        check("Interceptor healthy", False, "Interceptor unreachable")

    # ── Output 3: Submit async event ──
    print("\n[3/12] Async event submission")
    event_payload = {
        "org_id": ORG_ID,
        "model_id": MODEL_ID,
        "decision": "rejected",
        "confidence": 0.54,
        "features": {"years_experience": 8, "gpa": 3.4},
        "protected_attributes": [{"name": "gender", "value": "F"}],
    }
    event_result = safe_post(f"{GATEWAY}/v1/events", event_payload)
    if event_result:
        check("Event accepted (202)", True, f"Status: {event_result.get('status')}")
        check("Status is 'queued'", event_result.get("status") == "queued")
    else:
        check("Event accepted", False, "Gateway unreachable")

    # ── Output 4: Intercept decision ──
    print("\n[4/12] Real-time interception")
    intercept_payload = {
        "org_id": ORG_ID,
        "model_id": MODEL_ID,
        "decision": "rejected",
        "confidence": 0.48,
        "features": {"years_experience": 8, "gpa": 3.4, "skills_score": 78},
        "protected_attributes": [
            {"name": "gender", "value": "F"},
            {"name": "age_group", "value": "41-55"},
        ],
        "individual_id": "verify_candidate_001",
    }
    int_result = safe_post(f"{GATEWAY}/v1/intercept", intercept_payload)
    if int_result:
        latency = int_result.get("latency_ms", 999)
        check("Intercept responded", True, f"Latency: {latency:.0f}ms")
        check("Latency < 200ms", latency < 200, f"Got: {latency:.0f}ms")
        check("Response has was_intercepted field", "was_intercepted" in int_result)
    else:
        check("Intercept responded", False, "Interceptor unreachable")

    # ── Output 5: Causal engine ──
    print("\n[5/12] Causal engine endpoints")
    causal_health = safe_get(f"{CAUSAL}/health")
    check("Causal engine healthy", causal_health is not None and causal_health.get("status") == "ok")

    graph = safe_get(f"{CAUSAL}/causal/{ORG_ID}/{MODEL_ID}/graph")
    check("Causal graph endpoint responds", graph is not None)

    shap = safe_get(f"{CAUSAL}/shap/{ORG_ID}/{MODEL_ID}")
    check("SHAP endpoint responds", shap is not None)

    # ── Output 6: Counterfactual simulation ──
    print("\n[6/12] Counterfactual simulation")
    sim_payload = {
        "org_id": ORG_ID,
        "model_id": MODEL_ID,
        "features": {"years_exp": 8, "gpa": 3.4, "skills_score": 0.78, "interview_score": 0.82},
        "reference_group": {"gender": "M"},
        "counterfactual_groups": {"gender": ["F"]},
    }
    sim_result = safe_post(f"{CAUSAL}/simulate", sim_payload)
    if sim_result:
        check("Simulation responded", True)
        check("Flip detected", sim_result.get("flip_detected", False))
    else:
        check("Simulation responded", False, "Causal engine unreachable")

    # ── Output 7: Prediction engine ──
    print("\n[7/12] Prediction engine forecast")
    forecast = safe_get(f"{PREDICT}/forecast/{ORG_ID}/{MODEL_ID}")
    if forecast:
        check("Forecast endpoint responds", True)
        fc_list = forecast.get("forecasts", [])
        check("Forecast data present", len(fc_list) > 0, f"Got {len(fc_list)} forecasts")
    else:
        check("Forecast endpoint responds", False)

    # ── Output 8: Remediation ──
    print("\n[8/12] Remediation service")
    remedy_health = safe_get(f"{REMEDY}/health")
    check("Remediation healthy", remedy_health is not None)

    explain = safe_get(f"{REMEDY}/explain/{ORG_ID}/{MODEL_ID}")
    if explain:
        check("Gemini explanation responds", True)
        check("Explanation text present", len(explain.get("explanation", "")) > 50,
              f"Length: {len(explain.get('explanation', ''))} chars")
    else:
        check("Gemini explanation responds", False)

    # ── Output 9: PDF report ──
    print("\n[9/12] PDF report generation")
    report = safe_post(f"{REMEDY}/reports/generate",
                       {"org_id": ORG_ID, "model_id": MODEL_ID})
    if report:
        check("Report generation triggered", True, f"ID: {report.get('report_id', '?')}")
        check("Report status", report.get("status") in ("generated", "queued"),
              f"Status: {report.get('status')}")
    else:
        check("Report generation", False)

    # ── Output 10: Vault ──
    print("\n[10/12] Vault audit chain")
    vault_health = safe_get(f"{VAULT}/health")
    check("Vault healthy", vault_health is not None)

    vault_records = safe_get(f"{VAULT}/vault/{ORG_ID}/records")
    if vault_records:
        check("Vault records endpoint responds", True)
        check("Chain valid", vault_records.get("chain_valid", False))
    else:
        check("Vault records endpoint", False)

    # ── Output 11: Fairness score badge ──
    print("\n[11/12] Fairness score badge")
    badge = safe_get(f"{GATEWAY}/v1/fairness-score/{ORG_ID}/{MODEL_ID}")
    check("Fairness score endpoint responds", badge is not None)

    # ── Output 12: Auth ──
    print("\n[12/12] Authentication")
    no_auth = None
    try:
        resp = requests.get(f"{GATEWAY}/v1/organisations/{ORG_ID}/metrics", timeout=5)
        no_auth = resp.status_code
    except Exception:
        pass
    check("Unauthenticated request returns 401", no_auth == 401, f"Got: {no_auth}")

    # ── Summary ──
    total = passed + failed
    print(f"\n{'═' * 60}")
    print(f"  RESULTS: {passed}/{total} passed, {failed} failed, {warnings} warnings")
    print(f"{'═' * 60}")

    if failed == 0:
        print("  🎉 ALL CHECKS PASSED!")
    elif failed <= 3:
        print("  ⚠  MOSTLY PASSING — check failed items above")
    else:
        print("  ❌ SIGNIFICANT FAILURES — services may not be running")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
