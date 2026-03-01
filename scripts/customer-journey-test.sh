#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# FINAULT — Complete Customer Journey Smoke Test
# Tests every endpoint a real customer would hit, from first touch
# through onboarding, daily usage, billing, and admin ops.
#
# Usage:
#   ./scripts/customer-journey-test.sh
#   ./scripts/customer-journey-test.sh https://api.finault.ai
#   BASE=http://localhost:8787 TOKEN=eyJ... ./scripts/customer-journey-test.sh
#
# Requires: curl, jq (optional but recommended)
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

BASE="${1:-${BASE:-https://api.finault.ai}}"
TOKEN="${TOKEN:-}"
PASS=0; FAIL=0; SKIP=0; WARN=0
RESULTS=""

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

log_pass() { PASS=$((PASS+1)); RESULTS+="✅ $1\n"; echo -e "  ${GREEN}✅${NC} $1"; }
log_fail() { FAIL=$((FAIL+1)); RESULTS+="❌ $1 → $2\n"; echo -e "  ${RED}❌${NC} $1 → $2"; }
log_warn() { WARN=$((WARN+1)); RESULTS+="⚠️  $1\n"; echo -e "  ${YELLOW}⚠️${NC}  $1"; }
log_skip() { SKIP=$((SKIP+1)); RESULTS+="⏭️  $1\n"; echo -e "  ${CYAN}⏭️${NC}  $1 (skipped)"; }

# Test helper: method, path, description, expected_code, [data], [extra_headers]
test_ep() {
  local method=$1 path=$2 desc=$3 expected=$4
  local data="${5:-}" extra="${6:-}"
  local url="$BASE$path"
  local cmd="curl -s -o /tmp/finault_resp.json -w %{http_code} --max-time 15"

  [ "$method" = "POST" ] && cmd="$cmd -X POST"
  [ "$method" = "PUT" ] && cmd="$cmd -X PUT"
  [ "$method" = "DELETE" ] && cmd="$cmd -X DELETE"
  [ -n "$data" ] && cmd="$cmd -H 'Content-Type: application/json' -d '$data'"
  [ -n "$TOKEN" ] && cmd="$cmd -H 'Authorization: Bearer $TOKEN'"
  [ -n "$extra" ] && cmd="$cmd $extra"

  local code
  code=$(eval $cmd "'$url'" 2>/dev/null) || code="000"
  local body
  body=$(cat /tmp/finault_resp.json 2>/dev/null | head -c 300)

  if [ "$code" = "$expected" ]; then
    log_pass "[$code] $method $path — $desc"
  elif [ "$code" = "000" ]; then
    log_fail "[$code] $method $path — $desc" "Connection failed"
  else
    log_fail "[$code] $method $path — $desc (expected $expected)" "$body"
  fi
}

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  FINAULT — COMPLETE CUSTOMER JOURNEY TEST${NC}"
echo -e "  Target: $BASE"
echo -e "  Auth:   ${TOKEN:+Bearer token provided}${TOKEN:-No token (public endpoints only)}"
echo -e "  Time:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"

# ─── PHASE 1: FIRST TOUCH (Customer discovers Finault) ───────────
echo ""
echo -e "${BOLD}━━━ PHASE 1: FIRST TOUCH — Customer Discovery ━━━${NC}"
echo ""

test_ep GET "/health" "Platform health check" "200"
test_ep GET "/health/database" "Database health (load balancer probe)" "200"
test_ep GET "/" "Landing page" "200"
test_ep GET "/v1/docs" "API documentation (public)" "200"
test_ep GET "/v1/billing/plans" "Public pricing page" "200"

# ─── PHASE 2: ZERO-FRICTION ONBOARDING ───────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 2: MAGIC ONBOARDING — Value Before Signup ━━━${NC}"
echo ""

# Customer uploads an invoice BEFORE creating an account
test_ep POST "/v1/magic/parse" "Anonymous invoice parse (pre-signup)" "200" \
  '{"type":"openai","data":{"total_amount":1234.56,"line_items":[{"model":"gpt-4o","cost":850},{"model":"gpt-4o-mini","cost":384.56}],"billing_period":{"start":"2026-01-01","end":"2026-01-31"}}}'

test_ep POST "/v1/discovery/scan" "Discovery scan (requires provider API key)" "400" \
  '{"providers":["openai","anthropic"]}'
# Note: Discovery scan expects apiKey in body — 400 without it is correct behavior

test_ep GET "/v1/demo" "Demo data (prospect exploration)" "200"

# ─── PHASE 3: ONBOARDING & ACCOUNT CREATION ──────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 3: ONBOARDING & ACCOUNT SETUP ━━━${NC}"
echo ""

test_ep POST "/v1/onboard" "Magic onboarding" "200" \
  '{"company":"Customer Journey Test Co","email":"test@example.com","tier":"pro"}'

# ─── PHASE 4: PUBLIC CRYPTO PROOF LAYER ──────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 4: PUBLIC VERIFICATION — Zero-Trust Proofs ━━━${NC}"
echo ""

test_ep GET "/v1/transparency/log" "Transparency log (CT-inspired)" "200"
test_ep GET "/v1/registry/test-cert" "Public verification certificate" "200"

# ═════════════════════════════════════════════════════════════════
# AUTHENTICATED ENDPOINTS — Require Bearer token
# ═════════════════════════════════════════════════════════════════

if [ -z "$TOKEN" ]; then
  echo ""
  echo -e "${YELLOW}━━━ NO AUTH TOKEN PROVIDED — Skipping authenticated tests ━━━${NC}"
  echo -e "  Set TOKEN env var to test authenticated endpoints:"
  echo -e "  TOKEN=\$(curl -s \$SUPABASE_URL/auth/v1/token?grant_type=password \\"
  echo -e "    -H 'apikey: \$SUPABASE_ANON_KEY' \\"
  echo -e "    -d '{\"email\":\"you@co.com\",\"password\":\"...\"}' | jq -r .access_token)"
  echo ""

  log_skip "Phases 5-12: All authenticated endpoints"
else

# ─── PHASE 5: DAILY USAGE — Gateway Proxy ────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 5: AI GATEWAY — Proxy Requests ━━━${NC}"
echo ""

test_ep POST "/v1/chat/completions" "OpenAI proxy" "200" \
  '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"say hello"}],"max_tokens":5}'

test_ep GET "/v1/usage" "Usage dashboard" "200"
test_ep GET "/v1/usage?range=7d" "Usage (7-day range)" "200"
test_ep GET "/v1/metrics" "Metrics overview" "200"

# ─── PHASE 6: INVOICE PARSING — Module 2 ─────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 6: INVOICE PARSING + FOCUS 1.3 ━━━${NC}"
echo ""

test_ep POST "/v1/parse" "Parse OpenAI invoice" "200" \
  '{"type":"openai","data":{"organization":"org-test","total_amount":5432.10,"line_items":[{"model":"gpt-4o","requests":1000,"tokens":{"input":500000,"output":200000},"cost":3200},{"model":"gpt-4o-mini","requests":5000,"tokens":{"input":2000000,"output":1000000},"cost":2232.10}],"billing_period":{"start":"2026-01-01","end":"2026-01-31"}}}'

test_ep GET "/v1/invoices" "List invoices" "200"
test_ep GET "/v1/usage/focus" "FOCUS 1.3 export" "200"
test_ep GET "/v1/usage/focus/schema" "FOCUS 1.3 schema" "200"

# ─── PHASE 7: ANOMALY DETECTION — Module 3 ───────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 7: ANOMALY DETECTION (6-Method Ensemble) ━━━${NC}"
echo ""

test_ep POST "/v1/anomalies/detect" "Detect anomalies (spike at index 9)" "200" \
  '{"data":[{"date":"2026-01-01","cost":100},{"date":"2026-01-02","cost":105},{"date":"2026-01-03","cost":98},{"date":"2026-01-04","cost":110},{"date":"2026-01-05","cost":103},{"date":"2026-01-06","cost":99},{"date":"2026-01-07","cost":107},{"date":"2026-01-08","cost":102},{"date":"2026-01-09","cost":495},{"date":"2026-01-10","cost":108}],"field":"cost","sensitivity":"medium"}'

test_ep GET "/v1/anomalies" "List anomalies" "200"
test_ep GET "/v1/anomalies/configure" "Anomaly config" "200"

# ─── PHASE 8: CLOSE PACKS — Module 4 ─────────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 8: CLOSE PACKS — CFO-Ready Crypto Proofs ━━━${NC}"
echo ""

test_ep POST "/v1/close-pack/generate" "Generate close pack" "200" \
  '{"period":"2026-01","company":"Journey Test Inc","invoiceData":{"totalAmount":5432.10,"provider":"multi","lineItems":[{"model":"gpt-4o","cost":3200,"inputTokens":10000000,"outputTokens":4000000},{"model":"claude-3.5-sonnet","cost":2232.10,"inputTokens":8000000,"outputTokens":3000000}]},"allocationData":{"engineering":{"budget":4000,"actual":3800},"marketing":{"budget":2000,"actual":1632.10}}}'

# ─── PHASE 9: COST ALLOCATION ────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 9: COST ALLOCATION & BUDGETS ━━━${NC}"
echo ""

test_ep POST "/v1/allocate" "Allocate costs" "200" \
  '{"costs":[{"model":"gpt-4o","amount":3200,"department":"engineering"},{"model":"claude-3.5-sonnet","amount":2232,"department":"marketing"}]}'

test_ep GET "/v1/rules" "Allocation rules" "200"
test_ep GET "/v1/budgets" "Budget overview" "200"

test_ep POST "/v1/budgets/check" "Budget check" "200" \
  '{"department":"engineering","amount":500}'

# ─── PHASE 10: RECONCILIATION ────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 10: INVOICE RECONCILIATION ━━━${NC}"
echo ""

test_ep POST "/v1/reconcile" "Reconcile invoice vs usage" "200" \
  '{"invoiceTotal":5432.10,"usageTotal":5410.85,"tolerance":0.05}'

test_ep GET "/v1/usage-logs" "Usage logs" "200"

# ─── PHASE 11: ERP INTEGRATIONS ──────────────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 11: ERP INTEGRATIONS ━━━${NC}"
echo ""

test_ep GET "/v1/erp/accounts" "ERP account mappings" "200"
test_ep GET "/v1/erp/attempts" "ERP sync history" "200"

# ─── PHASE 12: SAVINGS INTELLIGENCE ──────────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 12: SAVINGS & RECOMMENDATIONS ━━━${NC}"
echo ""

test_ep POST "/v1/savings/analyze" "Savings analysis" "200" \
  '{"period":"2026-01","include_model_recommendations":true}'

test_ep GET "/v1/savings/recommendations" "Savings recommendations" "200"
test_ep GET "/v1/recommendations" "Model recommendations" "200"

# ─── PHASE 13: WEBHOOKS ──────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 13: WEBHOOK MANAGEMENT ━━━${NC}"
echo ""

test_ep GET "/v1/webhooks" "List webhooks" "200"
test_ep POST "/v1/webhooks" "Register webhook" "201" \
  '{"url":"https://httpbin.org/post","events":["anomaly.detected","invoice.parsed"],"description":"Test webhook"}'

# ─── PHASE 14: API KEY MANAGEMENT ────────────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 14: API KEY MANAGEMENT ━━━${NC}"
echo ""

test_ep GET "/v1/keys" "List API keys" "200"
test_ep POST "/v1/keys" "Create API key" "200" \
  '{"name":"Journey Test Key","scopes":["proxy","parse"]}'

# ─── PHASE 15: BILLING ───────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 15: BILLING & SUBSCRIPTIONS ━━━${NC}"
echo ""

test_ep GET "/v1/billing/subscription" "Current subscription" "200"
test_ep GET "/v1/billing/usage" "Billing usage" "200"

test_ep POST "/v1/billing/checkout" "Stripe checkout session" "200" \
  '{"plan":"pro","success_url":"https://app.finault.ai/billing/success","cancel_url":"https://app.finault.ai/billing/cancel"}'

# ─── PHASE 16: ADMIN OPERATIONS ──────────────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 16: ADMIN OPERATIONS ━━━${NC}"
echo ""

test_ep GET "/v1/admin/pricing" "Model pricing (KV-backed)" "200"
test_ep GET "/v1/settings" "Organization settings" "200"
test_ep GET "/v1/analytics" "Analytics dashboard" "200"
test_ep GET "/v1/analytics/summary" "Analytics summary" "200"

# ─── PHASE 17: GOVERNANCE & COMPLIANCE ───────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 17: GOVERNANCE & COMPLIANCE ━━━${NC}"
echo ""

test_ep GET "/v1/governance/frameworks" "Governance frameworks" "200"
test_ep POST "/v1/governance/assessment" "AI governance assessment" "200" \
  '{"framework":"eu_ai_act"}'

test_ep GET "/v1/icfr/matrix" "ICFR control matrix" "200"
test_ep GET "/v1/cost-classification" "Cost classification (ASU 2018-15)" "200"

# ─── PHASE 18: SPACE APPLE DASHBOARD ─────────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 18: SPACE APPLE DASHBOARD ━━━${NC}"
echo ""

test_ep GET "/v1/dashboard/alerts" "Proactive alerts" "200"
test_ep GET "/v1/dashboard/goals" "Goal tracking" "200"
test_ep GET "/v1/dashboard/benchmarks" "Industry benchmarks" "200"
test_ep GET "/v1/dashboard/insights" "NL insights" "200"
test_ep GET "/v1/dashboard/money-machine" "Money machine (ROI ticker)" "200"

test_ep POST "/v1/dashboard/what-if" "What-if scenario" "200" \
  '{"scenario":"switch_model","from":"gpt-4o","to":"claude-3.5-haiku","volume":100000}'

test_ep POST "/v1/dashboard/drill-down" "Infinite drill-down" "200" \
  '{"level":"department","id":"engineering"}'

# ─── PHASE 19: PLATFORM INTELLIGENCE ─────────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 19: PLATFORM INTELLIGENCE ━━━${NC}"
echo ""

test_ep GET "/v1/platform/journey" "Customer journey" "200"
test_ep GET "/v1/platform/intelligence" "Intelligence score" "200"
test_ep GET "/v1/platform/value" "Compound value" "200"

# ─── PHASE 20: OBSERVABILITY ─────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ PHASE 20: OBSERVABILITY ━━━${NC}"
echo ""

test_ep GET "/v1/observability/metrics" "Observability metrics" "200"
test_ep GET "/v1/observability/errors" "Error tracking" "200"
test_ep GET "/v1/observability/health-history" "Health history" "200"

fi  # end of TOKEN check

# ═════════════════════════════════════════════════════════════════
# RESULTS
# ═════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  RESULTS${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}Passed:${NC}  $PASS"
echo -e "  ${RED}Failed:${NC}  $FAIL"
echo -e "  ${YELLOW}Warnings:${NC} $WARN"
echo -e "  ${CYAN}Skipped:${NC} $SKIP"
TOTAL=$((PASS + FAIL))
if [ $TOTAL -gt 0 ]; then
  PCT=$((PASS * 100 / TOTAL))
  echo -e "  Score:   ${PCT}%"
fi
echo -e "═══════════════════════════════════════════════════════════"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo -e "${RED}FAILURES:${NC}"
  echo -e "$RESULTS" | grep "❌"
fi

echo ""
if [ $FAIL -eq 0 ] && [ $SKIP -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}🎉 ALL TESTS PASSED — Customer journey is fully operational!${NC}"
elif [ $FAIL -eq 0 ]; then
  echo -e "  ${YELLOW}${BOLD}⚠️  Public tests passed. Set TOKEN to test authenticated endpoints.${NC}"
else
  echo -e "  ${RED}${BOLD}🚨 $FAIL test(s) failed — review failures above.${NC}"
fi
echo ""

exit $FAIL
