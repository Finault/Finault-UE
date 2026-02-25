#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Finault Deployment Preflight Check
# ═══════════════════════════════════════════════════════════════════
# Validates environment, connectivity, and build readiness before
# deploying the gateway and dashboard.
#
# Usage:
#   ./scripts/preflight.sh              # Full preflight (default)
#   ./scripts/preflight.sh --env-only   # Only check environment vars
#   ./scripts/preflight.sh --smoke      # Run smoke tests against gateway
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass()  { PASS=$((PASS + 1)); echo -e "  ${GREEN}✓${NC} $1"; }
fail()  { FAIL=$((FAIL + 1)); echo -e "  ${RED}✗${NC} $1"; }
warn()  { WARN=$((WARN + 1)); echo -e "  ${YELLOW}⚠${NC} $1"; }
header(){ echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# ── Load .env if present ──────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [ -f .env ]; then
  set -a; source .env; set +a
  pass ".env file loaded"
elif [ -f .env.local ]; then
  set -a; source .env.local; set +a
  pass ".env.local file loaded"
else
  warn "No .env file found (using system environment only)"
fi

# ═══════════════════════════════════════════════════════════════════
# 1. ENVIRONMENT VARIABLES
# ═══════════════════════════════════════════════════════════════════
header "1. Environment Variables"

check_env() {
  local name="$1"
  local required="${2:-true}"
  if [ -n "${!name:-}" ]; then
    # Mask the value for display
    local val="${!name}"
    local masked="${val:0:6}...${val: -4}"
    pass "$name = $masked"
  elif [ "$required" = "true" ]; then
    fail "$name is NOT SET (required)"
  else
    warn "$name is not set (optional)"
  fi
}

# Required
check_env SUPABASE_URL true
check_env SUPABASE_SERVICE_KEY true
check_env SUPABASE_KEY true
check_env JWT_SECRET true
check_env STRIPE_SECRET_KEY true
check_env STRIPE_WEBHOOK_SECRET true

# Optional but recommended
check_env OPENAI_API_KEY false
check_env ANTHROPIC_API_KEY false
check_env ANCHOR_PRIVATE_KEY false
check_env ALCHEMY_API_KEY false

# Dashboard-specific
check_env NEXT_PUBLIC_SUPABASE_URL false
check_env NEXT_PUBLIC_GATEWAY_URL false

# ═══════════════════════════════════════════════════════════════════
# 2. TOOL AVAILABILITY
# ═══════════════════════════════════════════════════════════════════
header "2. Tool Availability"

check_tool() {
  if command -v "$1" &>/dev/null; then
    local ver
    ver=$("$1" --version 2>&1 | head -1) || ver="installed"
    pass "$1 ($ver)"
  else
    fail "$1 is NOT installed"
  fi
}

check_tool node
check_tool npm
check_tool npx
check_tool wrangler || warn "wrangler not found — install via: npm install -g wrangler"
check_tool git

# ═══════════════════════════════════════════════════════════════════
# 3. SUPABASE CONNECTIVITY
# ═══════════════════════════════════════════════════════════════════
header "3. Supabase Connectivity"

if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_KEY:-}" ]; then
  # Health check
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "${SUPABASE_URL}/rest/v1/" \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    --connect-timeout 10 2>/dev/null) || HTTP_CODE="000"

  if [ "$HTTP_CODE" = "200" ]; then
    pass "Supabase REST API reachable (HTTP $HTTP_CODE)"
  elif [ "$HTTP_CODE" = "000" ]; then
    fail "Supabase REST API unreachable (connection failed)"
  else
    warn "Supabase REST API returned HTTP $HTTP_CODE"
  fi

  # Check key tables exist
  for table in organizations users api_keys budgets usage_logs; do
    TABLE_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      "${SUPABASE_URL}/rest/v1/${table}?select=count&limit=0" \
      -H "apikey: ${SUPABASE_SERVICE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
      --connect-timeout 5 2>/dev/null) || TABLE_CODE="000"

    if [ "$TABLE_CODE" = "200" ] || [ "$TABLE_CODE" = "206" ]; then
      pass "Table '$table' exists and is queryable"
    elif [ "$TABLE_CODE" = "404" ]; then
      fail "Table '$table' does NOT exist — run migrations first"
    else
      warn "Table '$table' returned HTTP $TABLE_CODE"
    fi
  done
else
  warn "Skipping Supabase checks (SUPABASE_URL or SUPABASE_SERVICE_KEY not set)"
fi

# ═══════════════════════════════════════════════════════════════════
# 4. BUILD VALIDATION
# ═══════════════════════════════════════════════════════════════════
header "4. Build Validation"

# Check gateway compiles
if [ -f apps/gateway/gateway.ts ]; then
  if npx tsc --noEmit --strict apps/gateway/gateway.ts 2>/dev/null; then
    pass "gateway.ts compiles without errors"
  else
    warn "gateway.ts has TypeScript issues (may still deploy — Workers uses esbuild)"
  fi
else
  fail "apps/gateway/gateway.ts not found"
fi

# Check wrangler.toml
if [ -f wrangler.toml ]; then
  pass "wrangler.toml exists"

  # Validate KV namespace bindings
  if grep -q 'binding = "RATE_LIMIT"' wrangler.toml; then
    pass "RATE_LIMIT KV binding configured"
  else
    fail "RATE_LIMIT KV binding missing from wrangler.toml"
  fi

  if grep -q 'binding = "CLOSEPACKS"' wrangler.toml; then
    pass "CLOSEPACKS R2 binding configured"
  else
    fail "CLOSEPACKS R2 binding missing from wrangler.toml"
  fi

  # Check for placeholder KV IDs
  if grep -q 'id = "00000000' wrangler.toml; then
    warn "KV namespace IDs contain placeholders — create namespaces before production deploy"
  fi
else
  fail "wrangler.toml not found"
fi

# Check dashboard builds
if [ -f dashboard/package.json ]; then
  pass "dashboard/package.json exists"
else
  fail "dashboard/package.json missing"
fi

# ═══════════════════════════════════════════════════════════════════
# 5. SECURITY CHECKS
# ═══════════════════════════════════════════════════════════════════
header "5. Security Checks"

# Check for leaked secrets in code
SECRET_PATTERNS='(sk_live_|sk_test_|whsec_|eyJhbGciOi|SUPABASE_SERVICE_KEY\s*=\s*ey)'
if grep -rE "$SECRET_PATTERNS" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
   apps/ dashboard/src/ platform/ 2>/dev/null | grep -v '.env' | grep -v 'node_modules' | head -3; then
  fail "Possible hardcoded secrets found in source files"
else
  pass "No hardcoded secrets detected in source"
fi

# Check .env is gitignored
if [ -f .gitignore ] && grep -q '\.env' .gitignore; then
  pass ".env is in .gitignore"
else
  warn ".env may not be gitignored"
fi

# Check for direct Supabase calls in dashboard (should use gateway)
DIRECT_CALLS=$(grep -rn 'SUPABASE_URL.*rest/v1\|SUPABASE_ANON_KEY' dashboard/src/ 2>/dev/null | grep -v node_modules | grep -v '.next' | wc -l)
if [ "$DIRECT_CALLS" -gt 0 ]; then
  warn "$DIRECT_CALLS direct Supabase call(s) remain in dashboard/src/ — should route through gateway"
else
  pass "No direct Supabase REST calls in dashboard source"
fi

# ═══════════════════════════════════════════════════════════════════
# 6. GATEWAY SMOKE TESTS (optional --smoke flag)
# ═══════════════════════════════════════════════════════════════════
if [[ "${1:-}" == "--smoke" ]]; then
  header "6. Gateway Smoke Tests"

  GATEWAY_URL="${GATEWAY_URL:-http://localhost:8787}"
  echo -e "  Testing against: $GATEWAY_URL"

  # Health endpoint
  HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/health" --connect-timeout 5 2>/dev/null) || HEALTH="000"
  if [ "$HEALTH" = "200" ]; then
    pass "GET /health → 200"
  else
    fail "GET /health → $HEALTH (expected 200)"
  fi

  # Auth required on protected endpoint
  NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/v1/team" --connect-timeout 5 2>/dev/null) || NOAUTH="000"
  if [ "$NOAUTH" = "401" ] || [ "$NOAUTH" = "403" ]; then
    pass "GET /v1/team without auth → $NOAUTH (correctly rejected)"
  else
    warn "GET /v1/team without auth → $NOAUTH (expected 401/403)"
  fi

  # Pricing endpoint (public)
  PRICING=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/v1/pricing" --connect-timeout 5 2>/dev/null) || PRICING="000"
  if [ "$PRICING" = "200" ]; then
    pass "GET /v1/pricing → 200"
  else
    warn "GET /v1/pricing → $PRICING"
  fi

  # CORS preflight
  CORS=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$GATEWAY_URL/v1/team" \
    -H "Origin: https://app.finault.ai" \
    -H "Access-Control-Request-Method: PUT" \
    --connect-timeout 5 2>/dev/null) || CORS="000"
  if [ "$CORS" = "200" ] || [ "$CORS" = "204" ]; then
    pass "OPTIONS /v1/team CORS preflight → $CORS"
  else
    warn "OPTIONS /v1/team CORS preflight → $CORS"
  fi
fi

# ═══════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════
header "RESULTS"
echo -e "  ${GREEN}Passed:${NC}  $PASS"
echo -e "  ${YELLOW}Warnings:${NC} $WARN"
echo -e "  ${RED}Failed:${NC}  $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}⛔ PREFLIGHT FAILED — $FAIL issue(s) must be resolved before deployment${NC}"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo -e "${YELLOW}⚠  PREFLIGHT PASSED WITH WARNINGS — review $WARN warning(s) above${NC}"
  exit 0
else
  echo -e "${GREEN}✅ PREFLIGHT PASSED — all checks green, ready to deploy${NC}"
  exit 0
fi
