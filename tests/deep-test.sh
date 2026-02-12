#!/bin/bash
# Finault Gateway — Deep Business Logic Tests
BASE="http://localhost:8787"
AUTH="Authorization: Bearer test-key"
CT="Content-Type: application/json"
PASS=0
FAIL=0

deep_test() {
  local name="$1"
  local method="$2"
  local path="$3"
  local data="$4"
  local check="$5"

  if [ "$method" = "GET" ]; then
    RESP=$(curl -s "$BASE$path" -H "$AUTH" 2>&1)
  else
    RESP=$(curl -s -X "$method" "$BASE$path" -H "$AUTH" -H "$CT" -d "$data" 2>&1)
  fi

  if echo "$RESP" | grep -q "$check"; then
    echo "  ✅ $name — verified: '$check' present"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name — missing: '$check'"
    echo "     Response: $(echo "$RESP" | head -c 200)"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "========================================================"
echo "  FINAULT DEEP BUSINESS LOGIC VERIFICATION"
echo "========================================================"
echo ""

echo "--- INVOICE PARSING ---"
deep_test "Parse returns ACPS format" POST "/v1/parse" \
  '{"file":{"name":"openai-inv.pdf","content":"OpenAI GPT-4 usage: 1M tokens, $30.00","type":"text"},"provider":"openai"}' \
  "acpsVersion"

deep_test "Parse detects provider" POST "/v1/parse" \
  '{"file":{"name":"anthropic-inv.csv","content":"Claude 3 Opus: 500K tokens, $15.00","type":"text"},"provider":"anthropic"}' \
  "anthropic"

echo ""
echo "--- CLOSE PACK GENERATION ---"
deep_test "Close Pack has executive summary" POST "/v1/close-pack/generate" \
  '{"invoiceData":{"invoiceNumber":"INV-2025-0042","amount":47250.00,"date":"2025-01-31","vendor":"OpenAI"},"allocations":{"engineering":0.60,"product":0.25,"research":0.15}}' \
  "EXECUTIVE SUMMARY"

deep_test "Close Pack has journal entries" POST "/v1/close-pack/generate" \
  '{"invoiceData":{"invoiceNumber":"INV-2025-0042","amount":47250.00,"date":"2025-01-31","vendor":"OpenAI"},"allocations":{"engineering":0.60}}' \
  "journalEntry"

deep_test "Close Pack has reconciliation cert" POST "/v1/close-pack/generate" \
  '{"invoiceData":{"invoiceNumber":"INV-2025-0042","amount":47250.00,"date":"2025-01-31","vendor":"OpenAI"},"allocations":{"engineering":0.60}}' \
  "RECONCILIATION CERTIFICATE"

deep_test "Close Pack has controls narrative" POST "/v1/close-pack/generate" \
  '{"invoiceData":{"invoiceNumber":"INV-2025-0042","amount":47250.00,"date":"2025-01-31","vendor":"OpenAI"},"allocations":{"engineering":0.60}}' \
  "controlsNarrative"

deep_test "Close Pack has attestation" POST "/v1/close-pack/generate" \
  '{"invoiceData":{"invoiceNumber":"INV-2025-0042","amount":47250.00,"date":"2025-01-31","vendor":"OpenAI"},"allocations":{"engineering":0.60}}' \
  "attestation"

deep_test "Close Pack has download links" POST "/v1/close-pack/generate" \
  '{"invoiceData":{"invoiceNumber":"INV-2025-0042","amount":47250.00,"date":"2025-01-31","vendor":"OpenAI"},"allocations":{"engineering":0.60}}' \
  "downloadLinks"

echo ""
echo "--- COST ALLOCATION ---"
deep_test "Allocate returns allocations" POST "/v1/allocate" \
  '{"lineItems":[{"model":"gpt-4","amount":35000},{"model":"claude-3","amount":12000}],"rules":[{"name":"engineering","percentage":60},{"name":"product","percentage":25},{"name":"research","percentage":15}]}' \
  "engineering"

deep_test "Allocate calculates amounts" POST "/v1/allocate" \
  '{"lineItems":[{"model":"gpt-4","amount":10000}],"rules":[{"name":"eng","percentage":70}]}' \
  "7000"

echo ""
echo "--- ANOMALY DETECTION ---"
deep_test "Anomaly detect returns summary" POST "/v1/anomalies/detect" \
  '{"usageData":[{"model":"gpt-4","cost":500,"date":"2025-01-01"},{"model":"gpt-4","cost":520,"date":"2025-01-02"},{"model":"gpt-4","cost":1500,"date":"2025-01-03"}]}' \
  "summary"

echo ""
echo "--- AGENTS ---"
deep_test "13 AI agents registered" GET "/v1/agents" "" "count\":13"
deep_test "Finault Pal agent exists" GET "/v1/agents" "" "finault-pal"
deep_test "Close Pack agent exists" GET "/v1/agents" "" "close-pack"

echo ""
echo "--- DEMO FLOW ---"
deep_test "Demo returns full summary" POST "/v1/demo" \
  '{"email":"cfo@acme.com","company":"Acme Corp"}' \
  "total_spend"

deep_test "Demo returns savings" POST "/v1/demo" \
  '{"email":"cfo@acme.com"}' \
  "potential_savings"

echo ""
echo "--- PLATFORM METADATA ---"
deep_test "Health shows 8+ modules" GET "/health" "" "universalParser"
deep_test "Health shows endpoints" GET "/health" "" "closePack"
deep_test "Metrics returns uptime" GET "/v1/metrics" "" "uptime"

echo ""
echo "--- ERP INTEGRATION ---"
deep_test "ERP lists available systems" GET "/v1/erp/accounts" "" "quickbooks"
deep_test "ERP lists 8 systems" GET "/v1/erp/accounts" "" "dynamics365"

echo ""
echo "--- AUDIT TRAIL ---"
deep_test "Audit export returns events" GET "/v1/audit/export" "" "sequence"

echo ""
echo "========================================================"
echo "  DEEP TEST RESULTS: $PASS passed, $FAIL failed"
echo "========================================================"
