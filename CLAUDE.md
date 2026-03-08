# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Finault is the accountability layer for the AI economy. Not a cost governance tool. Not an observability tool.

**Three layers:**
1. **Instant AI economics visibility** — Paste an API key, see everything in 15 seconds
2. **Real-time sealed receipts** — SHA-256 chained Close Packs with margin analysis and Stripe integration
3. **Agent identity via Imprints** — Permanent origin records for AI agents

**Primary interface:** CLI (`finault sync`) — infrastructure-first model. Browser upload is fallback only.

## Build & Test Commands

```bash
npm run dev              # Start Wrangler dev server
npm run build            # Build gateway (esbuild)
npm run test             # Run Vitest suite
npm run test:fcs         # FCS scoring validation tests
npm run test:integration # Integration tests (agentos)
npm run lint             # ESLint on apps/, platform/, dashboard/src/
npm run lint:fix         # Auto-fix lint issues
npm run typecheck        # TypeScript type checking
npm run preflight        # lint + typecheck + test + build (pre-deploy)
npm run deploy:gateway   # Deploy Cloudflare Worker
npm run deploy:pages     # Deploy static site to Pages
npm run db:migrate       # Run database migrations
```

**Single test file:**
```bash
npx vitest run path/to/test.js
```

**Python CLI (development):**
```bash
cd sdks/python && pip install -e .
finault init    # Configure org
finault sync    # Fetch & upload usage
finault score   # Display confidence score
```

## Architecture

### Dual Router System (CRITICAL)

The gateway has TWO routing systems that must stay in sync:

1. **Legacy:** `apps/gateway/gateway-wired.js` (~3,800 lines) — Monolithic if/else chain, runtime for Workers
2. **Modern:** `apps/gateway/src/router.js` + `src/handlers/` — Modular route table with handler imports

**When adding endpoints:** Update BOTH files or deployment breaks.

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Main SPA | `static/app.html` (~4,700 lines) | Entire frontend application |
| Gateway API | `apps/gateway/` | Cloudflare Worker endpoints |
| Python CLI | `sdks/python/finault/sync.py` | Primary user interface |
| Node SDK | `sdks/node/` | TypeScript SDK |
| MCP Server | `mcp-server/` | Claude Desktop integration (12 tools) |
| Platform modules | `platform/` | Core business logic |

### Database

Supabase (PostgreSQL + Auth + RLS). Key tables:
- `close_packs` — Sealed audit bundles (immutable)
- `org_settings` — Org config from CLI init
- `usage` — Per-request cost tracking
- `csv_ingests` — Upload metadata

### Data Flow

```
finault init → config.json + POST /v1/org/configure → Supabase
finault sync → Fetch provider APIs → CSV → POST /v1/ingest/csv → Auto-close → SHA-256 chain
Dashboard → checkForSyncData() → Hydrates from latest Close Pack
```

## Critical Rules

1. **model-registry.js is THE SINGLE SOURCE OF TRUTH for pricing.** Never create secondary pricing registries. Located at `platform/model-registry.js`.

2. **Read files before editing.** Previous sessions had accuracy failures from assumptions.

3. **Infrastructure-first:** CLI is primary path. Browser upload is emergency-only.

4. **Insert-only tables:** `close_lineage` and `baselines` are append-only by design.

## Key Files Reference

| File | Purpose |
|------|---------|
| `static/app.html` | Complete SPA (CSS + HTML + JS in one file) |
| `platform/model-registry.js` | Canonical pricing (30+ models) |
| `platform/fcs.js` | Finault Confidence Score (5 dimensions) |
| `platform/closepack-generator-v2.js` | Close Pack artifact generation |
| `apps/gateway/src/handlers/auto-close.js` | CSV ingest + auto-close pipeline |
| `sdks/python/finault/sync.py` | CLI commands (~1,200 lines) |
| `CODEBASE_MAP.md` | Detailed line-by-line reference |

## Deployment

```bash
# Static site → Cloudflare Pages
npx wrangler pages deploy static --project-name=finault-site

# Gateway → Cloudflare Workers
cd apps/gateway && npm run build && npx wrangler deploy

# MCP Server → npm
cd mcp-server && npm publish
```

Environments: Production (finault.ai), Staging (finault-site.pages.dev)

## Close Pack System

5 sealed artifacts per month:
1. Executive Summary PDF
2. GL Journal Entry CSV
3. Reconciliation Certificate PDF
4. Controls Narrative PDF (SOX 404)
5. Unit Economics PDF

Sealed with SHA-256 hash, temporally chained via `prior_close_id`.

## Finault Confidence Score (FCS)

Weighted 0–100 composite:
- Coverage (30%) — % allocations with confidence >= 85%
- Exceptions (25%) — Low-confidence allocation count
- Reconciliation (20%) — Allocation vs invoice total match
- Comparability (15%) — Prior Close Pack exists
- Drift (10%) — Month-over-month spend change
