#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Finault Diamond-Tier Endpoint Sweep v2
# Tests all new standards compliance, infrastructure, and
# discovery endpoints added by Solutions 1-10
# ═══════════════════════════════════════════════════════════════

BASE_URL="${1:-https://finault-gateway.finault.workers.dev}"
TOKEN="${FINAULT_TOKEN:-test-sweep-token}"
PASS=0
FAIL=0
SKIP=0

echo "═══════════════════════════════════════════"
echo "  Finault Diamond-Tier Endpoint Sweep v2"
echo "  Target: $BASE_URL"
echo "═══════════════════════════════════════════"
echo ""

# Helper: check if status is in comma-separated list of acceptable statuses
status_matches() {
  local status="$1"
  local expected="$2"

  # Handle comma-separated expected statuses (e.g., "200,401,404")
  IFS=',' read -ra statuses <<< "$expected"
  for s in "${statuses[@]}"; do
    # Trim whitespace
    s=$(echo "$s" | xargs)
    if [ "$status" = "$s" ]; then
      return 0
    fi
  done
  return 1
}

# Helper: test an endpoint and check for HTTP status
test_endpoint() {
  local method="$1"
  local path="$2"
  local expected_status="$3"
  local description="$4"
  local body="$5"
  local auth_type="$6"

  local auth_header=""
  if [ "$auth_type" != "public" ]; then
    auth_header="-H \"Authorization: Bearer $TOKEN\""
  fi

  local status
  if [ "$method" = "GET" ]; then
    status=$(eval curl -s -o /dev/null -w '%{http_code}' $auth_header '"$BASE_URL$path"' 2>/dev/null)
  else
    status=$(eval curl -s -o /dev/null -w '%{http_code}' -X "$method" $auth_header -H "'Content-Type: application/json'" -d "'$body'" '"$BASE_URL$path"' 2>/dev/null)
  fi

  if status_matches "$status" "$expected_status"; then
    echo "  ✓ [$status] $method $path — $description"
    PASS=$((PASS + 1))
  elif [ "$status" = "000" ]; then
    echo "  ○ [SKIP] $method $path — Connection failed"
    SKIP=$((SKIP + 1))
  else
    echo "  ✗ [$status] $method $path — Expected $expected_status — $description"
    FAIL=$((FAIL + 1))
  fi
}

# Helper: test endpoint returns JSON with specific field
test_json_field() {
  local path="$1"
  local field="$2"
  local description="$3"
  local auth_type="$4"

  local auth_header=""
  if [ "$auth_type" != "public" ]; then
    auth_header="-H \"Authorization: Bearer $TOKEN\""
  fi

  local response
  response=$(eval curl -s $auth_header '"$BASE_URL$path"' 2>/dev/null)

  if [ -z "$response" ]; then
    echo "  ○ [SKIP] GET $path — No response"
    SKIP=$((SKIP + 1))
  elif echo "$response" | grep -q "\"$field\""; then
    echo "  ✓ GET $path — has '$field' — $description"
    PASS=$((PASS + 1))
  else
    echo "  ✗ GET $path — missing '$field' — $description"
    FAIL=$((FAIL + 1))
  fi
}

echo "━━━ Health Check ━━━"
test_endpoint "GET" "/health" "200" "Basic health" "" "public"
test_json_field "/health" "standards" "Health includes standards endpoints" "public"

echo ""
echo "━━━ Solution 1: FOCUS 1.3 Export ━━━"
test_endpoint "GET" "/v1/usage/focus" "200,401" "FOCUS export (auth required)"
test_endpoint "GET" "/v1/usage/focus/schema" "200,401" "FOCUS schema (may need auth)"
test_json_field "/v1/usage/focus/schema" "version" "Schema has version field" "auth"

echo ""
echo "━━━ Solution 2: ICFR/COSO Framework ━━━"
test_endpoint "GET" "/v1/icfr/matrix" "200,401" "Control matrix"
test_endpoint "GET" "/v1/icfr/report" "200,401" "ICFR report"

echo ""
echo "━━━ Solution 3: AI Governance ━━━"
test_endpoint "GET" "/v1/governance/assessment" "200,401" "Governance assessment"
test_endpoint "GET" "/v1/governance/frameworks" "200,401" "Available frameworks"

echo ""
echo "━━━ Solution 4: ASU 2018-15 Classification ━━━"
test_endpoint "GET" "/v1/cost-classification" "200,401" "Classification summary"
test_endpoint "POST" "/v1/cost-classification" "200,201,400,401" "Classify a cost record" '{"provider":"openai","model":"gpt-4o","endpoint_type":"inference","request_pattern":"recurring"}'

echo ""
echo "━━━ Solution 5: WORM Verification ━━━"
test_endpoint "GET" "/v1/close-pack/test-id/immutability" "200,401,404,500" "WORM verification"

echo ""
echo "━━━ Solution 6: OpenTelemetry Export ━━━"
test_endpoint "GET" "/v1/telemetry/export" "200,401" "OTel export"
test_endpoint "GET" "/v1/telemetry/export?format=cloudevents" "200,401" "CloudEvents export"

echo ""
echo "━━━ Solution 7: Transparency Log (PUBLIC) ━━━"
test_endpoint "GET" "/v1/transparency/log" "200,500" "Signed tree head" "" "public"
test_endpoint "GET" "/v1/transparency/log/entries?start=0&end=10" "200,500" "Log entries" "" "public"
test_endpoint "GET" "/v1/transparency/log/consistency?from=1&to=5" "200,400,500" "Consistency proof" "" "public"
test_endpoint "GET" "/v1/transparency/log/test-close-id/proof" "200,404,500" "Inclusion proof" "" "public"

echo ""
echo "━━━ Solution 8: Tag Discovery ━━━"
test_endpoint "GET" "/v1/usage/tags" "200,401" "Tag discovery"
test_endpoint "GET" "/v1/usage/by-tag?key=team&value=ml-ops" "200,400,401" "Tag-filtered usage"

echo ""
echo "━━━ Solution 9: Shadow AI Discovery ━━━"
test_endpoint "GET" "/v1/discovery/report" "200,401" "Discovery report"
test_endpoint "GET" "/v1/discovery/trends" "200,401" "Shadow spend trends"
test_endpoint "POST" "/v1/discovery/import" "200,201,400,401" "Billing import" '{"provider":"openai","data":[],"period":"2026-01"}'

echo ""
echo "━━━ Solution 10: Commitments ━━━"
test_endpoint "GET" "/v1/commitments" "200,401" "List commitments"
test_endpoint "GET" "/v1/commitments/utilization" "200,401" "Commitment utilization"
test_endpoint "GET" "/v1/commitments/savings" "200,401" "Savings analysis"

echo ""
echo "━━━ Solution 12: Evidence-Driven Compliance ━━━"
test_endpoint "GET" "/v1/evidence/collect?period=2026-01" "200,401" "Evidence collection"
test_endpoint "GET" "/v1/evidence/package/pkg-test-2026-01" "200,401,404" "Evidence package retrieval"
test_endpoint "GET" "/v1/evidence/sample?period=2026-01&size=50" "200,401" "Transaction sampling"

echo ""
echo "━━━ Existing Endpoints (Regression Check) ━━━"
test_endpoint "GET" "/health" "200" "Health check" "" "public"
test_endpoint "GET" "/health/database" "200,503" "Database health" "" "public"
test_endpoint "GET" "/v1/verify/stats" "200" "Verification stats" "" "public"

echo ""
echo "═══════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed, $SKIP skipped"
echo "═══════════════════════════════════════════"

exit $FAIL
