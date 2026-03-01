#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# FINAULT — One-Command Production Deploy
# ═══════════════════════════════════════════════════════════════════════════════
#
# Usage:
#   bash scripts/deploy-production.sh              # Full deploy
#   bash scripts/deploy-production.sh --dry-run    # Build only, no deploy
#   bash scripts/deploy-production.sh --gateway    # Gateway only
#   bash scripts/deploy-production.sh --dashboard  # Dashboard only
#
# Prerequisites:
#   - npx wrangler login (authenticated)
#   - KV namespace IDs set in wrangler.toml
#   - Secrets set via: wrangler secret put <NAME>
#   - Database migrations applied to Supabase
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN=false
GATEWAY_ONLY=false
DASHBOARD_ONLY=false

for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --gateway) GATEWAY_ONLY=true ;;
    --dashboard) DASHBOARD_ONLY=true ;;
  esac
done

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

step() { echo -e "\n${CYAN}═══ $1${NC}"; }
ok() { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

echo -e "${CYAN}"
echo "  ╔═══════════════════════════════════════════════════════════╗"
echo "  ║  FINAULT — Production Deploy                             ║"
echo "  ║  Gateway + Dashboard + Health Checks                     ║"
echo "  ╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

if $DRY_RUN; then
  warn "DRY RUN — builds only, no deployment"
fi

# ── Step 1: Preflight ────────────────────────────────────────────────────────
step "Step 1/6: Preflight Checks"

cd "$ROOT"

# Check wrangler auth
if ! npx wrangler whoami > /dev/null 2>&1; then
  fail "Not authenticated with Cloudflare. Run: npx wrangler login"
fi
ok "Cloudflare auth verified"

# Check for placeholder KV IDs
if grep -q "REPLACE_WITH_" wrangler.toml; then
  warn "wrangler.toml has placeholder KV namespace IDs"
  warn "Create namespaces and update IDs before deploying:"
  warn "  npx wrangler kv namespace create CACHE"
  warn "  npx wrangler kv namespace create SESSIONS"
  if ! $DRY_RUN; then
    fail "Cannot deploy with placeholder KV IDs"
  fi
fi

# Run tests
step "Step 2/6: Running Tests"
npx vitest run --reporter=verbose 2>&1 | tail -5
ok "Tests passed"

# ── Step 3: Build Gateway ────────────────────────────────────────────────────
if ! $DASHBOARD_ONLY; then
  step "Step 3/6: Building Gateway"
  node scripts/build.js --production

  if [ ! -f dist/gateway.js ]; then
    fail "Gateway build failed — dist/gateway.js not found"
  fi

  SIZE=$(wc -c < dist/gateway.js)
  SIZE_MB=$(echo "scale=2; $SIZE / 1048576" | bc)
  ok "Gateway built: dist/gateway.js (${SIZE_MB} MB)"
else
  step "Step 3/6: Skipping gateway build (--dashboard flag)"
fi

# ── Step 4: Build Dashboard ──────────────────────────────────────────────────
if ! $GATEWAY_ONLY; then
  step "Step 4/6: Building Dashboard"
  cd "$ROOT/dashboard"
  npm ci --silent
  npm run build

  if [ ! -d "out" ]; then
    fail "Dashboard build failed — out/ directory not found"
  fi

  FILE_COUNT=$(find out -type f | wc -l)
  ok "Dashboard built: ${FILE_COUNT} static files in out/"
  cd "$ROOT"
else
  step "Step 4/6: Skipping dashboard build (--gateway flag)"
fi

# ── Step 5: Deploy ───────────────────────────────────────────────────────────
if $DRY_RUN; then
  step "Step 5/6: Dry Run Complete"
  ok "Gateway: dist/gateway.js ready"
  if [ -d "dashboard/out" ]; then
    ok "Dashboard: dashboard/out/ ready"
  fi
  echo ""
  echo "To deploy for real: bash scripts/deploy-production.sh"
  exit 0
fi

step "Step 5/6: Deploying"

if ! $DASHBOARD_ONLY; then
  echo "  Deploying gateway to Cloudflare Workers..."
  npx wrangler deploy 2>&1
  ok "Gateway deployed"
fi

if ! $GATEWAY_ONLY; then
  echo "  Deploying dashboard to Cloudflare Pages..."
  npx wrangler pages deploy dashboard/out --project-name finault-dashboard 2>&1
  ok "Dashboard deployed"
fi

# ── Step 6: Health Checks ────────────────────────────────────────────────────
step "Step 6/6: Post-Deploy Health Checks"

GATEWAY_URL="https://api.finault.ai"
DASHBOARD_URL="https://app.finault.ai"

# Gateway health
echo "  Checking gateway..."
sleep 3
for i in 1 2 3 4 5; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    ok "Gateway healthy ($GATEWAY_URL/health → 200)"
    break
  fi
  if [ "$i" = "5" ]; then
    warn "Gateway health check failed after 5 attempts (HTTP $HTTP_CODE)"
    warn "Check: curl $GATEWAY_URL/health"
  else
    echo "  Retry $i... (HTTP $HTTP_CODE)"
    sleep 5
  fi
done

# Dashboard health
if ! $GATEWAY_ONLY; then
  echo "  Checking dashboard..."
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL/" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    ok "Dashboard healthy ($DASHBOARD_URL → 200)"
  else
    warn "Dashboard returned HTTP $HTTP_CODE (may need DNS propagation)"
  fi
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy complete!${NC}"
echo -e "${GREEN}  Gateway:   $GATEWAY_URL${NC}"
echo -e "${GREEN}  Dashboard: $DASHBOARD_URL${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
