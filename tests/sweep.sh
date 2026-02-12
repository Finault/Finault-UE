#!/bin/bash
# Finault Gateway — Full Endpoint Sweep
BASE="http://localhost:8787"
AUTH="Authorization: Bearer test-key"
CT="Content-Type: application/json"
PASS=0
FAIL=0

test_endpoint() {
  local name="$1"
  local method="$2"
  local path="$3"
  local data="$4"

  if [ "$method" = "GET" ]; then
    RESP=$(curl -s -w "\n%{http_code}" "$BASE$path" -H "$AUTH" 2>&1)
  else
    RESP=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE$path" -H "$AUTH" -H "$CT" -d "$data" 2>&1)
  fi

  HTTP_CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')

  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 500 ]; then
    echo "  ✅ $name [$HTTP_CODE] $(echo "$BODY" | head -c 120)"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name [$HTTP_CODE] $(echo "$BODY" | head -c 120)"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "============================================"
echo "  FINAULT GATEWAY — FULL ENDPOINT SWEEP"
echo "============================================"
echo ""

test_endpoint "Health Check" GET "/health"
test_endpoint "Root" GET "/"
test_endpoint "Parse Invoice" POST "/v1/parse" '{"file":{"name":"inv.pdf","content":"GPT-4 $30","type":"text"},"provider":"openai"}'
test_endpoint "Close Pack Gen" POST "/v1/close-pack/generate" '{"invoiceData":{"invoiceNumber":"INV-42","amount":47250,"date":"2025-01-31","vendor":"OpenAI"},"allocations":{"eng":0.6,"prod":0.25}}'
test_endpoint "Anomalies List" GET "/v1/anomalies"
test_endpoint "Anomaly Detect" POST "/v1/anomalies/detect" '{"usageData":[{"model":"gpt-4","cost":500,"date":"2025-01-01"},{"model":"gpt-4","cost":1500,"date":"2025-01-03"}]}'
test_endpoint "Agents List" GET "/v1/agents"
test_endpoint "Savings Analyze" POST "/v1/savings/analyze" '{"org_id":"test-org","period":"2025-01"}'
test_endpoint "Allocate" POST "/v1/allocate" '{"lineItems":[{"model":"gpt-4","amount":35000}],"rules":[{"name":"engineering","percentage":60}]}'
test_endpoint "Disputes List" GET "/v1/disputes"
test_endpoint "Reconcile" POST "/v1/reconcile" '{"invoice":{"id":"inv-1","provider":"openai","amount":40,"line_items":[{"model":"gpt-4","cost":30}]},"usage_logs":[{"model":"gpt-4","cost":29.95}]}'
test_endpoint "Crypto Proof" POST "/v1/proof/generate" '{"data":{"invoice":"INV-42","amount":47250},"period_start":"2025-01-01","period_end":"2025-01-31"}'
test_endpoint "Usage Stats" GET "/v1/usage"
test_endpoint "Demo Request" POST "/v1/demo" '{"email":"test@acme.com","company":"Acme"}'
test_endpoint "ERP Accounts" GET "/v1/erp/accounts"
test_endpoint "Budgets" GET "/v1/budgets"
test_endpoint "Analytics" GET "/v1/analytics"
test_endpoint "Audit Export" GET "/v1/audit/export"
test_endpoint "Onboard" POST "/v1/onboard" '{"company":"Acme","email":"cfo@acme.com","plan":"enterprise"}'
test_endpoint "Rules List" GET "/v1/rules"
test_endpoint "Invoices List" GET "/v1/invoices"
test_endpoint "Metrics" GET "/v1/metrics"

echo ""
echo "============================================"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "============================================"
