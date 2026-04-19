#!/usr/bin/env bash
# NEXUS — Quick health check for all services
# Usage: ./scripts/check_health.sh

set -uo pipefail

echo "═══════════════════════════════════════════════════"
echo "  NEXUS — Service Health Check"
echo "═══════════════════════════════════════════════════"
echo ""

SERVICES=(
  "Gateway|http://localhost:8080/v1/health"
  "Interceptor|http://localhost:8081/health"
  "Causal Engine|http://localhost:8082/health"
  "Prediction|http://localhost:8084/health"
  "Remediation|http://localhost:8085/health"
  "Vault|http://localhost:8086/health"
  "Web Dashboard|http://localhost:5173"
)

TOTAL=0
HEALTHY=0

for entry in "${SERVICES[@]}"; do
  IFS='|' read -r name url <<< "$entry"
  TOTAL=$((TOTAL + 1))

  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

  if [ "$STATUS" = "200" ]; then
    HEALTHY=$((HEALTHY + 1))
    DETAIL=""
    # Try to get version from JSON response
    VERSION=$(curl -sf "$url" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('version',''))" 2>/dev/null || echo "")
    if [ -n "$VERSION" ]; then
      DETAIL=" (v${VERSION})"
    fi
    printf "  ✅ %-20s healthy%s\n" "$name" "$DETAIL"
  else
    printf "  ❌ %-20s unreachable (HTTP %s)\n" "$name" "$STATUS"
  fi
done

echo ""
echo "  ${HEALTHY}/${TOTAL} services healthy"
echo "═══════════════════════════════════════════════════"

if [ $HEALTHY -eq $TOTAL ]; then
  exit 0
else
  exit 1
fi
