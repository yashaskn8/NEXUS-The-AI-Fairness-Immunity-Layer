# CONTRIBUTING.md

## 💻 Development Environment Setup

To ensure IDEs (like VS Code/Pylance) correctly resolve internal Python packages (`nexus_types`) and TypeScript modules, run the following setup commands:

**1. Python Dependencies & Pylance Configuration:**
```bash
# Install internal packages natively into local environment
uv pip install ./shared/python
uv pip install pytest-asyncio
```
*Note: A `pyrightconfig.json` is located at the workspace root to correctly map the `.venv` and internal `sdk/python` paths.*

**2. Node.js Dependencies:**
```bash
# Install dependencies for gateway
cd services/gateway && npm install

# Initialize and install dependencies for vault
cd ../vault && npm init -y && npm install @google-cloud/firestore @google-cloud/kms winston @types/winston typescript @types/node
```

## 📝 Code Style Guide
- **Python**: Use `ruff` for linting and formatting. Ensure all files pass type checking with `mypy --strict`.
- **TypeScript**: Use `eslint` with strict rules enabled. Run `tsc --noEmit` before submitting.

## 🌍 Adding a New Regulatory Standard
1. Edit the `regulatory_standards.json` file in the Regulatory Intelligence service.
2. Define the jurisdiction, target threshold, and domain.
3. Run the complete test suite to ensure the parser integrates it properly.
4. Open a Pull Request detailing the legal source of the standard.

## 📊 Adding a New Fairness Metric
1. Implement the mathematical definition inside `causal-engine/app/fairness_computer.py`.
2. Ensure the logic explicitly handles edge cases (e.g., divide by zero if a protected group is fully absent).
3. Add full unit tests covering varying demographic splits.
4. Update the Protobuf schema in the `nexus_types` package so the Gateway and Interceptor recognize the new enum.

## ✅ Pull Request Checklist
Before opening a PR, ensure:
- [ ] Tests pass across all modified microservices (`make test`).
- [ ] Coverage remains ≥ 75%.
- [ ] No `mypy` or TypeScript compilation errors exist.
- [ ] Documentation has been updated to reflect the new feature.
