# NEXUS — Contributor Guide

## Development Environment Setup

### Python (all Python services)
```bash
# Install uv (fast pip replacement)
pip install uv

# Install shared internal packages into local environment
uv pip install ./shared/python

# Install test utilities
uv pip install pytest pytest-asyncio pytest-cov ruff mypy

# Per-service dependencies
uv pip install -r services/causal-engine/requirements.txt
uv pip install -r services/interceptor/requirements.txt
# ... repeat for each service
```

### Node.js (gateway and vault)
```bash
cd services/gateway && npm install
cd services/vault   && npm install
```

### React Dashboard
```bash
cd apps/web && npm install
npm run dev   # starts Vite dev server at http://localhost:5173
```

### IDE Configuration
A `pyrightconfig.json` at the workspace root configures Pylance to
resolve the `nexus_sdk` and `shared/python` packages correctly.
VS Code with the Python and ESLint extensions is the recommended setup.

## Code Style

Python services must pass `ruff check` with no warnings.
TypeScript must pass `tsc --noEmit` in strict mode.
Run `make lint && make typecheck` before opening a pull request.

## Adding a New Regulatory Standard

1. Edit `services/causal-engine/app/regulatory_standards.json`.
   Add a new entry under the appropriate domain and jurisdiction.
2. Run `pytest services/causal-engine/tests/` — the test
   `test_regulatory_threshold_EU_credit` will catch schema errors.
3. No Python changes are required; the standards file is loaded
   at runtime by `RegulatoryStandards.get_thresholds()`.

## Adding a New Fairness Metric

1. Implement the method in
   `services/causal-engine/app/fairness_computer.py`.
   Return a `FairnessMetric` Pydantic model.
2. Add a corresponding test in
   `services/causal-engine/tests/test_fairness_calculator.py`
   with both a fair-dataset case and a biased-dataset case.
3. Update `shared/proto/decision.proto` if the metric requires
   a new field on `MetricResult`.
4. Add the metric name to the interceptor's
   `SUPPORTED_METRICS` list in `realtime_assessor.py`.

## Pull Request Checklist

Before opening a PR, confirm all of the following:
- `make test` passes with ≥ 75% coverage on the changed service
- `make lint` produces zero warnings
- `make typecheck` exits with code 0
- If you changed a service's API, update `docs/api_reference.md`
- If you changed fairness thresholds, re-run `make stress-test`
  and commit the updated `adversarial_stress_test_report.json`
