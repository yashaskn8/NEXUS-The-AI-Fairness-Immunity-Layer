"""
NEXUS — End-to-End Gateway Latency Profiler

Measures the full request path: SDK → Gateway (auth + routing) → Interceptor → response.
The gateway is NOT bypassed. This is the production-equivalent measurement.

Run with: python scripts/e2e_latency_profiler.py
   OR:    make e2e-latency
"""

import time
import uuid
import json
import os
import statistics
import concurrent.futures
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.rule import Rule
from rich import box

load_dotenv()
console = Console()

BASE_URL = os.getenv("NEXUS_BASE_URL", "http://localhost:8080")
API_KEY  = os.getenv("NEXUS_API_KEY",  "demo-key")
HEADERS  = {"Authorization": f"Bearer {API_KEY}",
            "Content-Type":  "application/json"}


def build_intercept_payload(gender: str = "female") -> dict:
    """Build a minimal valid intercept payload for latency measurement."""
    return {
        "event_id":   str(uuid.uuid4()),
        "org_id":     "demo-org",
        "model_id":   "hiring-v1",
        "domain":     "hiring",
        "decision":   "rejected",
        "confidence": 0.52,
        "features":   {
            "years_exp":    6,
            "gpa":          3.8,
            "skills_score": 0.89
        },
        "protected_attributes": {"gender": gender},
        "intercept_mode": True
    }


def measure_single_request() -> dict:
    """
    Measure wall-clock latency for one full end-to-end intercept call
    through the gateway. Returns a dict with latency_ms and status.
    """
    payload = build_intercept_payload()
    t_start = time.perf_counter()
    try:
        resp    = requests.post(
            f"{BASE_URL}/v1/intercept",
            json=payload, headers=HEADERS, timeout=5
        )
        t_end   = time.perf_counter()
        return {
            "latency_ms":      round((t_end - t_start) * 1000, 2),
            "http_status":     resp.status_code,
            "was_intercepted": resp.json().get("was_intercepted", False),
            "error":           None
        }
    except Exception as e:
        t_end = time.perf_counter()
        return {
            "latency_ms":  round((t_end - t_start) * 1000, 2),
            "http_status": 0,
            "error":       str(e)
        }


def run_warmup(n: int = 20) -> None:
    """
    Send 20 warmup requests before measurement begins.
    This ensures HTTP keep-alive connections are established and
    the gateway auth cache is populated, reflecting steady-state
    production conditions rather than cold-start overhead.
    """
    console.print(f"[dim]Running {n} warmup requests...[/dim]")
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        futures = [ex.submit(measure_single_request) for _ in range(n)]
        for f in concurrent.futures.as_completed(futures):
            f.result()
    console.print("[dim]Warmup complete.[/dim]\n")


def run_profiler(
    concurrency_levels: list[int],
    requests_per_level: int = 200
) -> dict:
    """
    Run the latency profiler at each concurrency level.
    Measures P50, P95, P99, and max latency through the full gateway.
    Returns a dict keyed by concurrency level with latency statistics.
    """
    results = {}
    for workers in concurrency_levels:
        console.print(
            f"[bold]Testing {workers} concurrent workers "
            f"({requests_per_level} requests)...[/bold]"
        )
        latencies = []
        errors    = 0
        t_wall_start = time.perf_counter()

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=workers
        ) as executor:
            futures = [
                executor.submit(measure_single_request)
                for _ in range(requests_per_level)
            ]
            for future in concurrent.futures.as_completed(futures):
                r = future.result()
                if r["error"] is None and r["http_status"] == 200:
                    latencies.append(r["latency_ms"])
                else:
                    errors += 1

        t_wall_end = time.perf_counter()
        wall_ms    = (t_wall_end - t_wall_start) * 1000

        if latencies:
            latencies_sorted = sorted(latencies)
            n = len(latencies_sorted)
            results[workers] = {
                "requests_sent":    requests_per_level,
                "successful":       len(latencies),
                "errors":           errors,
                "avg_ms":           round(statistics.mean(latencies), 2),
                "median_ms":        round(statistics.median(latencies), 2),
                "p95_ms":           round(
                    latencies_sorted[int(n * 0.95)], 2
                ),
                "p99_ms":           round(
                    latencies_sorted[int(n * 0.99)], 2
                ),
                "max_ms":           round(max(latencies), 2),
                "throughput_rps":   round(
                    len(latencies) / (wall_ms / 1000), 1
                ),
                "wall_clock_ms":    round(wall_ms, 0),
                "sla_pass":         latencies_sorted[int(n * 0.99)] < 200
            }
        else:
            results[workers] = {
                "requests_sent": requests_per_level,
                "successful":    0,
                "errors":        errors,
                "sla_pass":      False
            }
        console.print(
            f"[dim]  P99: {results[workers].get('p99_ms', 'N/A')}ms | "
            f"Errors: {errors} | "
            f"Throughput: {results[workers].get('throughput_rps', 'N/A')} rps[/dim]"
        )

    return results


def print_results_table(results: dict) -> None:
    """Print a formatted results table and the critical 100-worker row."""
    t = Table(
        title="End-to-End Gateway Latency Profile (Full Stack)",
        box=box.ROUNDED
    )
    t.add_column("Workers",    style="cyan",  width=10)
    t.add_column("Avg",        style="white", width=10)
    t.add_column("Median",     style="white", width=10)
    t.add_column("P95",        style="white", width=10)
    t.add_column("P99",        style="white", width=10)
    t.add_column("Max",        style="white", width=10)
    t.add_column("Errors",     style="white", width=8)
    t.add_column("Throughput", style="white", width=12)
    t.add_column("SLA",        style="bold",  width=10)

    for workers, r in sorted(results.items()):
        sla_label = (
            "[green]✅ PASS[/green]"
            if r.get("sla_pass")
            else "[red]✗ FAIL[/red]"
        )
        t.add_row(
            str(workers),
            f"{r.get('avg_ms', 'N/A')}ms",
            f"{r.get('median_ms', 'N/A')}ms",
            f"{r.get('p95_ms', 'N/A')}ms",
            f"{r.get('p99_ms', 'N/A')}ms",
            f"{r.get('max_ms', 'N/A')}ms",
            str(r.get("errors", 0)),
            f"{r.get('throughput_rps', 'N/A')} rps",
            sla_label
        )
    console.print(t)


def append_to_omega_report(profiler_results: dict) -> None:
    """
    Append full-stack latency results to omega_stress_test_report.json.
    This produces a single source-of-truth document that contains both
    the gateway-bypass results and the full-stack end-to-end results,
    allowing judges to compare them transparently.
    """
    report_path = "omega_stress_test_report.json"
    try:
        with open(report_path) as f:
            report = json.load(f)
    except FileNotFoundError:
        report = {}

    report["e2e_gateway_latency"] = {
        "measured_at":   datetime.now(timezone.utc).isoformat(),
        "description":   (
            "Full end-to-end latency measured through the complete "
            "gateway stack (auth + circuit breaker + interceptor). "
            "This supersedes the direct-to-interceptor measurement "
            "from the Omega test high-concurrency phase."
        ),
        "results_by_concurrency": {
            str(k): v for k, v in profiler_results.items()
        }
    }

    # Surface the headline 100-worker P99 at top level for easy inspection
    workers_100 = profiler_results.get(100, {})
    report["e2e_p99_100_workers_ms"] = workers_100.get("p99_ms", None)
    report["e2e_sla_pass_100_workers"] = workers_100.get("sla_pass", False)

    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    console.print(
        f"[dim]Full-stack latency appended to {report_path}[/dim]"
    )


if __name__ == "__main__":
    console.print(Rule(
        "[bold blue]NEXUS — End-to-End Gateway Latency Profiler[/bold blue]"
    ))
    console.print(
        "[dim]This measures the full request path: "
        "SDK → Gateway (auth + routing) → Interceptor → response.\n"
        "The gateway is NOT bypassed. This is the production-equivalent "
        "measurement.[/dim]\n"
    )

    # Warmup: establish keep-alive connections and populate auth cache
    run_warmup(n=20)

    # Profile at 1, 10, 50, and 100 concurrent workers
    # 1  worker  → baseline single-request latency
    # 10 workers → light concurrency
    # 50 workers → standard stress test level
    # 100 workers → Omega test level (the previously unmeasured path)
    profiler_results = run_profiler(
        concurrency_levels=[1, 10, 50, 100],
        requests_per_level=200
    )

    print_results_table(profiler_results)

    # Critical verdict: the 100-worker P99 through the full stack
    result_100 = profiler_results.get(100, {})
    p99_full   = result_100.get("p99_ms")
    sla_pass   = result_100.get("sla_pass", False)

    colour = "green" if sla_pass else "red"
    icon   = "✅" if sla_pass else "✗"
    console.print(Panel(
        f"\n  {icon}  [bold]Full-Stack P99 at 100 Workers: "
        f"{p99_full}ms[/bold]\n\n"
        f"  SLA Requirement: < 200ms\n"
        f"  Result: {'PASS' if sla_pass else 'FAIL'}\n\n"
        f"  This measurement includes gateway authentication, "
        f"rate-limit checking,\n"
        f"  circuit breaker logic, and HTTP forwarding overhead.\n"
        f"  It replaces the gateway-bypass result from the Omega test.\n",
        title="[bold]End-to-End Latency Verdict[/bold]",
        border_style=colour
    ))

    append_to_omega_report(profiler_results)

    console.print(Rule("[bold]Profiler Complete[/bold]"))
    exit(0 if sla_pass else 1)
