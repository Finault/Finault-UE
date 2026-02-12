# Finault Gateway — Deployment Guide

## Current State (February 6, 2026)

**All systems green:**
- Endpoint sweep: 22/22 passed
- Deep business logic: 22/22 passed
- Bundle: 59 modules → 1.33 MB
- Build time: ~300ms

## What Was Wired This Session

### Phase A: Core Data Flow
- **Invoice parsing** → stores to Supabase `invoices` table
- **Cost allocation** → stores to Supabase `allocation_rules` table
- **Close Pack generation** → stores to Supabase `close_packs` + R2 bucket
- **Audit trail** → `persistAuditLog()` writes to `audit_trail` table

### Phase B: Auth & Security
- **API key validation** → `validateApiKey()` checks `api_keys` table with SHA-256 hashing
- **JWT verification** → reads `JWT_SECRET` from env
- **API key auth** → checks `X-Finault-Key` and `x-api-key` headers

### Phase C: Crypto & Storage
- **Blockchain anchoring** → stores to `blockchain_anchors`, `crypto_proofs`, `proof_registry`
- **R2 Close Pack storage** → stores manifest + full data at `closepacks/{id}/`
- **R2 retrieval** → GET `/v1/close-pack/:id` checks R2 first, falls back to Supabase
- **Public verification** → `/v1/verify/:id` queries proof_registry (no auth)

### Phase D: ERP & Operations
- **ERP posting** → logs to `erp_posting_log` with status tracking
- **Savings implementation** → stores to `savings_implementations`
- **Reconciliation** → stores full report to `reconciliation_reports`
- **Budget creation** → stores to `budgets` with audit fields
- **Health check** → includes Supabase connectivity + latency

## Deploy to Production

### Step 1: Run Supabase Migrations
Open Supabase Dashboard → SQL Editor → paste contents of:
```
database/combined-migration.sql
```
This creates all 71 tables, RLS policies, indexes, and stored procedures.

### Step 2: Login to Cloudflare
```bash
npx wrangler login
```

### Step 3: Create KV Namespace
```bash
npx wrangler kv namespace create RATE_LIMIT
```
Copy the ID and update `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "<the-real-id>"
```

### Step 4: Create R2 Bucket
```bash
npx wrangler r2 bucket create finault-closepacks
```

### Step 5: Set Production Secrets
```bash
# Required
npx wrangler secret put JWT_SECRET
# Generate a strong secret: openssl rand -hex 32

# Move Supabase creds to secrets (remove from [vars])
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY

# Optional (enable features)
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ANCHOR_PRIVATE_KEY
npx wrangler secret put ALCHEMY_API_KEY
```

### Step 6: Build for Production
```bash
node scripts/build.js --production
```

### Step 7: Deploy
```bash
npx wrangler deploy
```
This deploys to: `finault-gateway.<your-subdomain>.workers.dev`

### Step 8: Custom Domain (Optional)
Uncomment and edit in `wrangler.toml`:
```toml
routes = [
  { pattern = "api.finault.ai/*", zone_name = "finault.ai" }
]
```
Then redeploy: `npx wrangler deploy`

## Architecture (106 Endpoints)

```
Client → Cloudflare Edge (rate limiting, TLS)
  → Finault Gateway (Workers)
    → Auth Middleware (JWT + API Key)
    → Route Handler
      → Platform Module (business logic)
      → Supabase (persistence)
      → R2 (Close Pack storage)
      → Blockchain (anchoring)
    → Audit Trail (Supabase)
  → Response
```

## Testing

```bash
# Full endpoint sweep (22 endpoints)
bash tests/sweep.sh

# Deep business logic (22 assertions)
bash tests/deep-test.sh
```
