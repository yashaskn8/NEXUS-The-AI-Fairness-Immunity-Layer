#!/usr/bin/env python3
"""
Update README.md stress test tables with real computed values
from adversarial_stress_test_report.json.

Usage:
    python scripts/update_readme_stress_results.py
    make update-readme-stress-results
"""
import json
import re

with open("adversarial_stress_test_report.json", encoding="utf-8") as f:
    data = json.load(f)

with open("README.md", encoding="utf-8") as f:
    readme = f.read()

ds = data["dataset"]
bd = data["bias_detection"]
fm = data["fairness_metrics"]
cs = data["correction_stats"]
perf = data["performance"]
verd = data["verdict"]

# Replace the Dataset Composition table rows with real counts
readme = re.sub(
    r"\| Domain: Hiring \| .+? \|",
    f"| Domain: Hiring | {ds['hiring']} |",
    readme,
)
readme = re.sub(
    r"\| Domain: Credit \| .+? \|",
    f"| Domain: Credit | {ds['credit']} |",
    readme,
)
readme = re.sub(
    r"\| Domain: Healthcare \| .+? \|",
    f"| Domain: Healthcare | {ds['healthcare']} |",
    readme,
)
readme = re.sub(
    r"\| Direct bias injected \| .+? \|",
    f"| Direct bias injected | {ds['direct_bias_injected']} |",
    readme,
)
readme = re.sub(
    r"\| Proxy bias injected \| .+? \|",
    f"| Proxy bias injected | {ds['proxy_bias_injected']} |",
    readme,
)
readme = re.sub(
    r"\| Intersectional bias injected \| .+? \|",
    f"| Intersectional bias injected | {ds['intersectional_bias_injected']} |",
    readme,
)

# Replace Final Verdict line with real verdict
verdict_line = (
    f"**All conditions satisfied simultaneously → "
    f"{'PASS ✅' if verd == 'PASS' else 'FAIL ✗'}**"
)
readme = re.sub(
    r"\*\*All conditions satisfied simultaneously →.*?\*\*",
    verdict_line,
    readme,
)

# Replace the footer pointer to the JSON report
stress_footer = (
    f"> 📋 Results computed {data['generated_at'][:10]}. "
    f"Re-run with `make stress-test`. "
    f"Full report: `adversarial_stress_test_report.json`."
)
readme = re.sub(
    r"> 📋 Full structured.*?`\.",
    stress_footer,
    readme,
    flags=re.DOTALL,
)

with open("README.md", "w", encoding="utf-8") as f:
    f.write(readme)

pre_di = fm["pre_nexus"]["disparate_impact_female_vs_male"]
post_di = fm["post_nexus"]["disparate_impact_female_vs_male"]
p99 = perf["p99_latency_ms"]

print(
    f"README updated with real stress test results from "
    f"adversarial_stress_test_report.json"
)
print(f"  DI: {pre_di:.4f} → {post_di:.4f}")
print(f"  P99: {p99:.1f}ms")
print(f"  Verdict: {verd}")
