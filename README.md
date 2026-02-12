# Finault Platform v2.0

**The Finance-Safe Layer for AI Spend.**

Finault earns its role by refusing ambiguity, declining intelligence layers, and leaning into repeatable, verifiable truth.

## Architecture — 9 Pillars

| Pillar | Module | Status |
|--------|--------|--------|
| 1. Source Ingestion | `platform/universal-parser.js` + `platform/source-parsers/` | 12+ providers |
| 2. Reconciliation | `platform/reconciliation-engine.js` + `platform/pricing-ruleset.js` | Deterministic |
| 3. Close Pack | `platform/closepack-generator.js` + `platform/finault-platform.js` | All-or-nothing |
| 4. Crypto Finality | `scripts/blockchain-anchor-real.js` + `platform/merkleTree.js` | ethers.js + Base/ETH/Polygon |
| 5. Drift + FCS | `platform/drift-detector.js` + `platform/fcs.js` | Evidence-based |
| 6. ERP Integration | `integrations/erp-posting-service.js` + `integrations/erp-export-generators.js` | QB/Xero/NetSuite |
| 7. Verification | `apps/verifier-service/api_server.py` + `tools/verify-close.js` | Zero-trust |
| 8. Pack Types | `platform/finault-platform.js` | Invoice, URS, Infra, Agent, ERP |
| 9. Governance | `database/` (INSERT-only triggers, RLS, immutable audit) | Constitutional |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up Supabase
# Run all SQL files in database/ in order:
#   schema.sql → functions.sql → rls-policies.sql → phase2 → phase3 → phase4 → phase5

# 3. Set secrets
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_KEY
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put VERIFIER_URL
wrangler secret put ANCHOR_PRIVATE_KEY  # For blockchain anchoring

# 4. Deploy Gateway
npm run deploy:gateway

# 5. Deploy Static Site
npm run deploy:pages

# 6. Deploy Verifier (Python)
cd apps/verifier-service && railway up
```

## API Endpoints

### Public (No Auth)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/magic/parse` | Magic onboarding — anonymous parse |
| POST | `/api/v1/verify` | Upload ZIP for verification |
| GET | `/api/v1/replay/:closeId` | Replay a verified close |
| GET | `/health` | Health check |

### Authenticated (JWT or API Key)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/ingest` | Ingest raw usage data (Pillar 1) |
| POST | `/api/v1/close` | Execute full close pipeline (Pillars 1-5) |
| POST | `/api/v1/erp/post` | Post journal to ERP (Pillar 6) |
| GET | `/api/v1/intelligence` | Flywheel intelligence score |
| GET | `/api/v1/profile` | Organization enriched profile |
| GET | `/api/v1/closes` | Close pack history |
| GET | `/api/v1/rulesets` | Pricing rulesets |
| GET | `/api/v1/analytics/roi` | ROI analytics |
| GET | `/api/v1/status` | Platform status |

## Monorepo Structure

```
/apps
  /dashboard          — React components + TypeScript API
  /gateway            — Cloudflare Worker (unified entry point)
  /verifier-service   — Python verification microservice (Railway)
  /status-page        — Public status page

/sdk
  /typescript         — TypeScript SDK
  /python             — Python SDK

/database
  schema.sql          — Phase 1: Core tables (29 tables)
  functions.sql       — Stored procedures
  rls-policies.sql    — Row-level security
  phase2-5 migrations — Lineage, anchors, ERP, flywheel

/integrations
  erp-integrations.js — ERP connection management
  erp-posting-service.js — Idempotent ERP posting
  erp-export-generators.js — QB/Xero/NetSuite format converters
  anomaly-detection.js — Real-time anomaly detection
  roi-analytics.js — ROI tracking
  enterprise-sso.js — SSO/RBAC

/onboarding
  magic-onboarding.js — Anonymous → full account
  sso-rbac.js — Role-based access control

/platform
  finault-platform.js — MASTER ORCHESTRATOR (wires all pillars)
  universal-parser.js — Multi-provider invoice parser
  reconciliation-engine.js — Deterministic matching
  pricing-ruleset.js — Versioned pricing enforcement
  closepack-generator.js — Artifact generation
  blockchain-anchor.js — Anchoring (simulated)
  drift-detector.js — Baseline drift detection
  fcs.js — Financial Confidence Score
  merkleTree.js — Merkle tree construction
  flywheel.js — Cross-feature intelligence
  /source-parsers/
    extended-parsers.js — All 12+ source types

/scripts
  blockchain-anchor-real.js — REAL ethers.js anchoring

/tools
  verify-close.js — CLI: `finault verify <zip>`
  finault-cli.js — CLI tools
  lineage_viewer.py — Lineage visualization

/tests
  fcs/ — FCS threshold tests
  unit/ — Unit tests
  integration/ — Integration tests

/final-deploy — Static site (Cloudflare Pages)
```

## Constitutional Principles

| Principle | Mechanism |
|-----------|-----------|
| Immutability | INSERT-only metadata; R2-sealed ZIPs; no mutation endpoints |
| Determinism | Pricing rulesets; reconciliation rules; failure aborts |
| Audit Survivability | Manifest, certificate, normalized_totals, hash receipts |
| Finality | Close ID + sealed pack; blockchain anchor; ERP receipts |

## Secrets Required

| Secret | Service | Purpose |
|--------|---------|---------|
| `SUPABASE_URL` | Supabase | Database connection |
| `SUPABASE_KEY` | Supabase | Service role key |
| `STRIPE_SECRET_KEY` | Stripe | Payment processing |
| `VERIFIER_URL` | Railway | Python verifier endpoint |
| `ANCHOR_PRIVATE_KEY` | Ethereum | Blockchain anchoring wallet |
| `ALCHEMY_API_KEY` | Alchemy | RPC provider (optional) |
| `ERP_SANDBOX` | ERP | Set `true` for sandbox mode |

## Pack Types

| Pack Type | ID Prefix | Input | Output Artifacts |
|-----------|-----------|-------|-----------------|
| Invoice Close | FIN-CL-* | API invoices | executive_summary, journal_entry, certificate, variance, fcs |
| URS | FIN-URS-* | Usage logs + ruleset | urs_statement, journal_entry, manifest, certificate |
| Infra Spend | FIN-INFRA-* | Vector DB, embeddings | reconciliation, drift, variance, journal_entry |
| Agent Tooling | FIN-AGENT-* | Agent telemetry | tooling_summary, normalized_totals, fcs |
| ERP Receipt | FIN-ERP-* | ERP document receipt | erp_post_receipt, erp_variance |
