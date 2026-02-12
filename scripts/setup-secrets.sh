#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# FINAULT SECRETS SETUP
# Sets all required Cloudflare Worker secrets for deployment.
# Run this once before your first deploy, or when rotating keys.
#
# Usage: ./scripts/setup-secrets.sh [--env staging|production]
# ═══════════════════════════════════════════════════════════════

set -e

ENV_FLAG=""
ENV_NAME="production"

if [ "$1" = "--env" ] && [ -n "$2" ]; then
  ENV_NAME="$2"
  if [ "$ENV_NAME" != "production" ]; then
    ENV_FLAG="-e $ENV_NAME"
  fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  FINAULT SECRETS SETUP — $ENV_NAME"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "This will set Worker secrets via 'wrangler secret put'."
echo "You'll be prompted for each value. Press Ctrl+C to abort."
echo ""

# ── Required Secrets ──────────────────────────────────────────

echo "── REQUIRED (deployment will fail without these) ──"
echo ""

echo "1/5 SUPABASE_URL"
echo "    Your Supabase project URL (e.g., https://xxx.supabase.co)"
echo "    Find it: Supabase Dashboard → Settings → API → URL"
wrangler secret put SUPABASE_URL $ENV_FLAG

echo ""
echo "2/5 SUPABASE_SERVICE_KEY"
echo "    Your Supabase service_role key (NOT the anon key)"
echo "    Find it: Supabase Dashboard → Settings → API → service_role"
wrangler secret put SUPABASE_SERVICE_KEY $ENV_FLAG

echo ""
echo "3/5 SUPABASE_KEY"
echo "    Your Supabase anon/public key (used for client-side auth)"
echo "    Find it: Supabase Dashboard → Settings → API → anon/public"
wrangler secret put SUPABASE_KEY $ENV_FLAG

echo ""
echo "4/5 JWT_SECRET"
echo "    Secret for signing Finault session JWTs (generate a random 64-char string)"
echo "    Generate one: openssl rand -hex 32"
wrangler secret put JWT_SECRET $ENV_FLAG

echo ""
echo "5/5 CLOUDFLARE_API_TOKEN (for CI/CD — set in GitHub Secrets, not here)"
echo "    Skipping — set this in GitHub repo Settings → Secrets → Actions"
echo ""

# ── Optional Secrets ──────────────────────────────────────────

echo "── OPTIONAL (features will be disabled without these) ──"
echo ""

read -p "Set up AI provider keys? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "OPENAI_API_KEY"
  wrangler secret put OPENAI_API_KEY $ENV_FLAG
  echo ""
  echo "ANTHROPIC_API_KEY"
  wrangler secret put ANTHROPIC_API_KEY $ENV_FLAG
  echo ""
fi

read -p "Set up Stripe payment keys? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "STRIPE_SECRET_KEY"
  wrangler secret put STRIPE_SECRET_KEY $ENV_FLAG
  echo ""
  echo "STRIPE_WEBHOOK_SECRET"
  wrangler secret put STRIPE_WEBHOOK_SECRET $ENV_FLAG
  echo ""
fi

read -p "Set up blockchain anchoring keys? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "ANCHOR_PRIVATE_KEY"
  wrangler secret put ANCHOR_PRIVATE_KEY $ENV_FLAG
  echo ""
  echo "INFURA_API_KEY"
  wrangler secret put INFURA_API_KEY $ENV_FLAG
  echo ""
fi

# ── Verification ──────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✓ Secrets setup complete for $ENV_NAME"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo "    1. Run preflight:  node scripts/deploy-preflight.js"
echo "    2. Deploy gateway: npm run build && wrangler deploy"
echo "    3. Verify health:  curl https://api.finault.ai/health"
echo ""
