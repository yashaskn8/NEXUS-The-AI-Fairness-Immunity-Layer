#!/usr/bin/env bash
# NEXUS — Wait for all services to become healthy
# Usage: ./scripts/wait_for_health.sh [timeout_seconds]

set -euo pipefail

TIMEOUT=${1:-120}
INTERVAL=3
ELAPSED=0

SERVICES=(
  "Gateway|http://localhost:8080/v1/health"
  "Interceptor|http://localhost:8081/health"
  "Causal Engine|http://localhost:8082/health"
  "Prediction Engine|http://localhost:8084/health"
  "Remediation|http://localhost:8085/health"
  "Vault|http://localhost:8086/health"
)

echo "═══════════════════════════════════════════════════"
echo "  NEXUS — Waiting for services to become healthy"
echo "  Timeout: ${TIMEOUT}s"
echo "═══════════════════════════════════════════════════"
echo ""

wait_for_service() {
  local name="$1"
  local url="$2"
  local start=$SECONDS

  while true; do
    local elapsed=$(( SECONDS - start ))
    if [ $elapsed -ge $TIMEOUT ]; then
      echo "  ⚠ ${name}: TIMEOUT after ${TIMEOUT}s"
      return 1
    fi

    if curl -sf "$url" > /dev/null 2>&1; then
      echo "  ✅ ${name}: healthy (${elapsed}s)"
      return 0
    fi

    sleep $INTERVAL
  done
}

ALL_HEALTHY=true

for entry in "${SERVICES[@]}"; do
  IFS='|' read -r name url <<< "$entry"
  if ! wait_for_service "$name" "$url"; then
    ALL_HEALTHY=false
  fi
done

echo ""
if $ALL_HEALTHY; then
  echo "  🎉 All services are healthy!"
  exit 0
else
  echo "  ⚠ Some services failed to start within ${TIMEOUT}s"
  exit 1
fi
