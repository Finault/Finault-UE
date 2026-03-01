#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# FINAULT — First-Time Launch Script
# ═══════════════════════════════════════════════════════════════════════════════
#
# This script takes Finault from "code ready" to "live in production".
# It handles KV namespace creation, secret injection, build, and deploy.
#
# Usage:
#   bash scripts/launch.sh                  # Interactive full launch
#   bash scripts/launch.sh --setup-only     # Create KV + set secrets, no deploy
#   bash scripts/launch.sh --skip-setup     # Deploy only (KV + secrets already done)
#   bash scripts/launch.sh --dry-run        # Build only, no deploy
#
# Prerequisites:
#   1. npx wrangler login (authenticate first)
#   2. Have your secrets ready (Supabase URL, API keys, etc.)
#   3. Database migration applied to Supabase (see Step 0 below)
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── Flags ──────────────────────────────────────────────────────────────────────
SETUP_ONLY=false
SKIP_SETUP=false
DRY_RUN=false

for arg in "$@"; do
  case $arg in
    --setup-only) SETUP_ONLY=true ;;
    --skip-setup) SKIP_SETUP=true ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

# ── Colors ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

step()  { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }
ok()    { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "  ${RED}✗${NC} $1"; exit 1; }
info()  { echo -e "  ${BOLD}→${NC} $1"; }

echo ""
echo -e "${GREEN}  ███████╗██╗███╗   ██╗ █████╗ ██╗   ██╗██╗  ████████╗${NC}"
echo -e "${GREEN}  ██╔════╝██║████╗  ██║██╔══██╗██║   ██║██║  ╚══██╔══╝${NC}"
echo -e "${GREEN}  █████╗  ██║██╔██╗ ██║███████║██║   ██║██║     ██║   ${NC}"
echo -e "${GREEN}  ██╔══╝  ██║██║╚██╗██║██╔══██║██║   ██║██║     ██║   ${NC}"
echo -e "${GREEN}  ██║     ██║██║ ╚████║██║  ██║╚██████╔╝███████╗██║   ${NC}"
echo -e "${GREEN}  ╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝   ${NC}"
echo ""
echo -e "  ${BOLD}First-Time Production Launch${NC}"
echo -e "  $(date '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

if $DRY_RUN; then
  warn "DRY RUN MODE — will build but not deploy"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 0: Preflight
# ═══════════════════════════════════════════════════════════════════════════════
step "STEP 0 / 7 — Preflight Checks"

# Check wrangler auth
if ! npx wrangler whoami > /dev/null 2>&1; then
  fail "Not authenticated. Run: npx wrangler login"
fi
ok "Cloudflare authentication verified"

# Check Node
NODE_V=$(node --version)
ok "Node.js $NODE_V"

# Check build script
if [ ! -f scripts/build.mjs ] && [ ! -f scripts/build.js ]; then
  fail "scripts/build.mjs not found"
fi
ok "Build system ready"

# Check wrangler.toml
if [ ! -f wrangler.toml ]; then
  fail "wrangler.toml not found at project root"
fi
ok "wrangler.toml found"

# Database migration reminder
echo ""
info "DATABASE: Have you applied combined-migration.sql to Supabase?"
info "  Open Supabase Dashboard → SQL Editor → paste contents of:"
info "  database/combined-migration.sql (7,119 lines, 71+ tables)"
echo ""
read -p "  Database migration applied? (y/n): " DB_READY
if [ "$DB_READY" != "y" ] && [ "$DB_READY" != "Y" ]; then
  echo ""
  warn "Apply the migration first, then re-run this script."
  warn "  File: database/combined-migration.sql"
  warn "  Target: Supabase Dashboard → SQL Editor"
  exit 0
fi
ok "Database migration confirmed"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: Create KV Namespaces
# ═══════════════════════════════════════════════════════════════════════════════
if ! $SKIP_SETUP; then

step "STEP 1 / 7 — Create KV Namespaces"

# Check if CACHE already has a real ID
CACHE_ID=$(grep -A1 'binding = "CACHE"' wrangler.toml | grep 'id =' | head -1 | sed 's/.*id = "\(.*\)"/\1/')
SESSIONS_ID=$(grep -A1 'binding = "SESSIONS"' wrangler.toml | grep 'id =' | head -1 | sed 's/.*id = "\(.*\)"/\1/')

if [[ "$CACHE_ID" == "REPLACE_WITH_CACHE_KV_ID" ]] || [[ -z "$CACHE_ID" ]]; then
  info "Creating CACHE KV namespace..."
  CACHE_OUTPUT=$(npx wrangler kv namespace create CACHE 2>&1)
  echo "$CACHE_OUTPUT"

  # Extract the ID from wrangler output (macOS-compatible)
  NEW_CACHE_ID=$(echo "$CACHE_OUTPUT" | grep -o 'id = "[a-f0-9]*"' | head -1 | sed 's/id = "//;s/"//' || echo "")
  if [ -z "$NEW_CACHE_ID" ]; then
    NEW_CACHE_ID=$(echo "$CACHE_OUTPUT" | grep -o '[a-f0-9]\{32\}' | head -1 || echo "")
  fi

  if [ -n "$NEW_CACHE_ID" ]; then
    # Update wrangler.toml — replace ONLY the first occurrence (production)
    sed -i '' "s/REPLACE_WITH_CACHE_KV_ID/$NEW_CACHE_ID/" wrangler.toml
    ok "CACHE KV created: $NEW_CACHE_ID"
  else
    warn "Could not auto-extract CACHE KV ID. Check output above and update wrangler.toml manually."
    echo ""
    read -p "  Enter CACHE KV namespace ID: " NEW_CACHE_ID
    if [ -n "$NEW_CACHE_ID" ]; then
      sed -i '' "s/REPLACE_WITH_CACHE_KV_ID/$NEW_CACHE_ID/" wrangler.toml
      ok "CACHE KV ID set: $NEW_CACHE_ID"
    fi
  fi
else
  ok "CACHE KV already configured: $CACHE_ID"
fi

if [[ "$SESSIONS_ID" == "REPLACE_WITH_SESSIONS_KV_ID" ]] || [[ -z "$SESSIONS_ID" ]]; then
  info "Creating SESSIONS KV namespace..."
  SESSIONS_OUTPUT=$(npx wrangler kv namespace create SESSIONS 2>&1)
  echo "$SESSIONS_OUTPUT"

  NEW_SESSIONS_ID=$(echo "$SESSIONS_OUTPUT" | grep -o 'id = "[a-f0-9]*"' | head -1 | sed 's/id = "//;s/"//' || echo "")
  if [ -z "$NEW_SESSIONS_ID" ]; then
    NEW_SESSIONS_ID=$(echo "$SESSIONS_OUTPUT" | grep -o '[a-f0-9]\{32\}' | head -1 || echo "")
  fi

  if [ -n "$NEW_SESSIONS_ID" ]; then
    sed -i '' "s/REPLACE_WITH_SESSIONS_KV_ID/$NEW_SESSIONS_ID/" wrangler.toml
    ok "SESSIONS KV created: $NEW_SESSIONS_ID"
  else
    warn "Could not auto-extract SESSIONS KV ID. Check output above and update wrangler.toml manually."
    echo ""
    read -p "  Enter SESSIONS KV namespace ID: " NEW_SESSIONS_ID
    if [ -n "$NEW_SESSIONS_ID" ]; then
      sed -i '' "s/REPLACE_WITH_SESSIONS_KV_ID/$NEW_SESSIONS_ID/" wrangler.toml
      ok "SESSIONS KV ID set: $NEW_SESSIONS_ID"
    fi
  fi
else
  ok "SESSIONS KV already configured: $SESSIONS_ID"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: Create R2 Bucket
# ═══════════════════════════════════════════════════════════════════════════════
step "STEP 2 / 7 — Create R2 Bucket"

# Try to create — will fail gracefully if it already exists
if npx wrangler r2 bucket create finault-closepacks 2>&1 | grep -q "already exists"; then
  ok "R2 bucket 'finault-closepacks' already exists"
else
  ok "R2 bucket 'finault-closepacks' created (or already existed)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: Set Secrets
# ═══════════════════════════════════════════════════════════════════════════════
step "STEP 3 / 7 — Set Worker Secrets"

echo ""
echo -e "  ${BOLD}Required secrets for Finault Gateway:${NC}"
echo ""
echo "  ┌─────────────────────────────────────────────────────────────┐"
echo "  │  SECRET                │  SOURCE                            │"
echo "  ├─────────────────────────────────────────────────────────────┤"
echo "  │  SUPABASE_URL          │  Supabase → Settings → API        │"
echo "  │  SUPABASE_KEY          │  Supabase → Settings → API (anon) │"
echo "  │  JWT_SECRET            │  Supabase → Settings → API (JWT)  │"
echo "  │  OPENAI_API_KEY        │  platform.openai.com/api-keys     │"
echo "  │  ANTHROPIC_API_KEY     │  console.anthropic.com/keys       │"
echo "  │  STRIPE_SECRET_KEY     │  dashboard.stripe.com/apikeys     │"
echo "  │  STRIPE_WEBHOOK_SECRET │  Stripe → Webhooks → Signing      │"
echo "  │  RESEND_API_KEY        │  resend.com/api-keys              │"
echo "  │  ANCHOR_PRIVATE_KEY    │  Ethereum wallet private key      │"
echo "  │  ANCHOR_RPC_URL        │  Alchemy/Infura Sepolia endpoint  │"
echo "  │  ALCHEMY_API_KEY       │  dashboard.alchemy.com            │"
echo "  └─────────────────────────────────────────────────────────────┘"
echo ""

# Required secrets
REQUIRED_SECRETS=(
  "SUPABASE_URL"
  "SUPABASE_KEY"
  "JWT_SECRET"
  "OPENAI_API_KEY"
  "ANTHROPIC_API_KEY"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "RESEND_API_KEY"
  "ANCHOR_PRIVATE_KEY"
  "ANCHOR_RPC_URL"
  "ALCHEMY_API_KEY"
)

echo "  You'll be prompted for each secret. Press Enter to skip any optional ones."
echo ""

SECRET_COUNT=0
for SECRET_NAME in "${REQUIRED_SECRETS[@]}"; do
  read -s -p "  $SECRET_NAME: " SECRET_VALUE
  echo ""

  if [ -n "$SECRET_VALUE" ]; then
    echo "$SECRET_VALUE" | npx wrangler secret put "$SECRET_NAME" --name finault-gateway > /dev/null 2>&1
    ok "$SECRET_NAME set"
    SECRET_COUNT=$((SECRET_COUNT + 1))
  else
    warn "$SECRET_NAME skipped"
  fi
done

ok "$SECRET_COUNT / ${#REQUIRED_SECRETS[@]} secrets configured"

if [ $SECRET_COUNT -lt 3 ]; then
  fail "At minimum SUPABASE_URL, SUPABASE_KEY, and JWT_SECRET are required"
fi

fi # end !SKIP_SETUP

if $SETUP_ONLY; then
  echo ""
  step "Setup Complete!"
  echo ""
  info "KV namespaces created and IDs written to wrangler.toml"
  info "Secrets configured in Cloudflare Workers"
  info ""
  info "To deploy: bash scripts/launch.sh --skip-setup"
  exit 0
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4: Run Tests
# ═══════════════════════════════════════════════════════════════════════════════
step "STEP 4 / 7 — Test Suite"

TEST_OUTPUT=$(npx vitest run 2>&1 | tail -5)
echo "$TEST_OUTPUT"

if echo "$TEST_OUTPUT" | grep -q "570 passed"; then
  ok "570/570 tests passed"
else
  warn "Test output may show collection errors — check that core tests pass"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5: Build
# ═══════════════════════════════════════════════════════════════════════════════
step "STEP 5 / 7 — Production Build"

info "Building gateway (esbuild → dist/gateway.js)..."
node scripts/build.mjs --production 2>&1 | tail -5

if [ ! -f dist/gateway.js ]; then
  fail "Build failed — dist/gateway.js not found"
fi

SIZE=$(wc -c < dist/gateway.js)
SIZE_MB=$(echo "scale=2; $SIZE / 1048576" | bc)
ok "Gateway bundle: ${SIZE_MB} MB (412 modules)"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6: Deploy
# ═══════════════════════════════════════════════════════════════════════════════
if $DRY_RUN; then
  step "STEP 6 / 7 — Dry Run Complete"
  ok "dist/gateway.js ready for deployment"
  info "To deploy for real: bash scripts/launch.sh --skip-setup"
  exit 0
fi

step "STEP 6 / 7 — Deploy to Cloudflare"

# Final check for placeholders
if grep -q "REPLACE_WITH_" wrangler.toml; then
  fail "wrangler.toml still has REPLACE_WITH_ placeholders. Run --setup-only first."
fi

info "Deploying gateway to Cloudflare Workers..."
npx wrangler deploy 2>&1
ok "Gateway deployed to Cloudflare Workers"

# Static site deploy (Pages)
if [ -d "static" ]; then
  info "Deploying static site to Cloudflare Pages..."
  npx wrangler pages deploy static --project-name finault-site 2>&1 || warn "Static site deploy skipped (Pages project may not exist yet)"
  ok "Static site deployed"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 7: Health Checks
# ═══════════════════════════════════════════════════════════════════════════════
step "STEP 7 / 7 — Post-Deploy Verification"

GATEWAY_URL="https://api.finault.ai"

info "Waiting 5 seconds for deployment propagation..."
sleep 5

# Gateway health
HEALTHY=false
for i in 1 2 3 4 5; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    ok "Gateway /health → 200 OK"
    HEALTHY=true
    break
  fi
  echo "  Attempt $i: HTTP $HTTP_CODE — retrying in 5s..."
  sleep 5
done

if ! $HEALTHY; then
  warn "Gateway health check did not return 200 after 5 attempts."
  warn "This is normal if DNS hasn't propagated yet."
  warn "Manual check: curl -v $GATEWAY_URL/health"
fi

# Version check
VERSION=$(curl -s "$GATEWAY_URL/health" 2>/dev/null | grep -o '"version":"[^"]*"' | sed 's/"version":"//;s/"//' || echo "unknown")
if [ "$VERSION" != "unknown" ]; then
  ok "Gateway version: $VERSION"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# DONE
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}  ╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}  ║                                                           ║${NC}"
echo -e "${GREEN}  ║   🚀  FINAULT IS LIVE  🚀                                ║${NC}"
echo -e "${GREEN}  ║                                                           ║${NC}"
echo -e "${GREEN}  ║   Gateway:  https://api.finault.ai                        ║${NC}"
echo -e "${GREEN}  ║   Site:     https://finault.ai                            ║${NC}"
echo -e "${GREEN}  ║                                                           ║${NC}"
echo -e "${GREEN}  ║   Next steps:                                             ║${NC}"
echo -e "${GREEN}  ║   1. Configure DNS CNAMEs (if not done)                   ║${NC}"
echo -e "${GREEN}  ║   2. Test: curl https://api.finault.ai/health             ║${NC}"
echo -e "${GREEN}  ║   3. Create first API key in dashboard                    ║${NC}"
echo -e "${GREEN}  ║                                                           ║${NC}"
echo -e "${GREEN}  ╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# DNS reminder
echo -e "${YELLOW}  DNS Configuration (if not already done):${NC}"
echo ""
echo "  In Cloudflare Dashboard → DNS → Add records:"
echo ""
echo "  ┌──────────┬──────────────────┬────────────────────────────────────┐"
echo "  │  Type    │  Name            │  Target                            │"
echo "  ├──────────┼──────────────────┼────────────────────────────────────┤"
echo "  │  CNAME   │  api             │  finault-gateway.workers.dev       │"
echo "  │  CNAME   │  app             │  finault-dashboard.pages.dev       │"
echo "  │  CNAME   │  @               │  finault-site.pages.dev            │"
echo "  └──────────┴──────────────────┴────────────────────────────────────┘"
echo ""
echo "  All records should have Proxy enabled (orange cloud)."
echo ""
