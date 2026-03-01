# Finault — AI Cost Governance Platform

**The finance-safe layer for enterprise AI spending.**

Finault gives finance teams, CFOs, and engineering leaders a single source of truth for their organization's AI costs. Upload a CSV invoice from any AI provider, get instant cost allocation, unit economics, model-swap savings, and a sealed Close Pack of audit-ready artifacts.

**Live at [finault.ai](https://finault.ai)**

## What Finault Does

1. **Ingests** raw AI provider invoices (OpenAI, Anthropic, AWS Bedrock, Azure AI, Google Vertex)
2. **Allocates** costs to business cost centers via keyword fuzzy matching with confidence scoring
3. **Benchmarks** unit economics against the Bessemer Venture Partners AI framework
4. **Identifies** model-swap savings using 30+ model pricing registry and 17 verified downgrade paths
5. **Produces** a sealed, hash-verified Close Pack of 5 audit-ready artifacts monthly
6. **Chains** Close Packs via SHA-256 temporal chain for cryptographic audit trail

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  static/app.html                     │
│              Single-file SPA (~4,570 lines)          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │  Upload   │ │ Results  │ │Unit Econ │ │Settings│ │
│  │  (Parse)  │ │(Analyze) │ │(Margins) │ │(Config)│ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┘ │
│       │             │            │                    │
│  ┌────▼─────────────▼────────────▼──────────────┐   │
│  │  parseCSV → generateAllocations → computeFCS  │   │
│  │  computeSavings → generateClosePack → SHA-256 │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   ┌─────────┐  ┌──────────┐  ┌──────────┐
   │Supabase │  │Cloudflare│  │   Slack   │
   │ Auth+DB │  │  Pages   │  │ Webhooks  │
   └─────────┘  └──────────┘  └──────────┘
```

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Single-file SPA, vanilla JS, CSS custom properties, no build step |
| Backend/Auth | Supabase (PostgreSQL + Auth + Row-Level Security) |
| Hosting | Cloudflare Pages (static), Cloudflare Workers (gateway) |
| PDF Generation | jsPDF (client-side, no server dependency) |
| ZIP Generation | JSZip (client-side Close Pack bundling) |
| Cryptography | Web Crypto API (SHA-256) with djb2 fallback |
| MCP Server | TypeScript + @modelcontextprotocol/sdk, published as @finault/mcp-server |
| Email Delivery | Cloudflare Worker gateway (/v1/send-closepack) |

## Repository Structure

```
finault-monorepo/
├── static/                    # Production site (Cloudflare Pages)
│   ├── app.html              # ★ Main application (~4,570 lines)
│   ├── index.html            # Marketing landing page
│   ├── login.html            # Authentication
│   ├── pricing.html          # Pricing tiers
│   ├── docs.html             # Documentation
│   └── ...                   # Other static pages
│
├── mcp-server/               # MCP Server for Claude Desktop
│   ├── index.ts              # TypeScript source (12 tools)
│   ├── package.json          # @finault/mcp-server v3.0.0
│   └── dist/                 # Compiled output
│
├── apps/
│   ├── gateway/              # Cloudflare Worker (API gateway)
│   └── status-page/          # Public status page
│
├── dashboard/                # Next.js dashboard (supplementary)
│   └── src/                  # React components + TypeScript API
│
├── platform/                 # Backend modules
│   ├── closepack-generator-v2.js
│   └── modules/              # Diamond tier modules
│
├── database/                 # Supabase migrations
│   └── migrations/           # SQL migration files
│
├── CODEBASE_MAP.md          # ★ Developer quick-reference (line numbers, functions)
└── README.md                # This file
```

## Key Features

### Close Pack System
A sealed ZIP bundle containing 5 artifacts + MANIFEST.json, SHA-256 hash-verified, temporally chained:
- **Executive Summary PDF** — 2-page audit-ready report with dynamic sections
- **GL Journal Entry CSV** — Debit/credit entries with CSV formula injection protection
- **Reconciliation Certificate PDF** — Temporal chain details, FCS score
- **Controls Narrative PDF** — SOX 404 structure with 5 CTRL codes
- **Unit Economics PDF** — Board-ready summary with Bessemer classification

### Finault Confidence Score (FCS)
Weighted 0–100 composite score across 5 audit dimensions:
- Coverage (30%) — percentage of allocations with confidence >= 85%
- Exceptions (25%) — count of low-confidence allocations
- Reconciliation (20%) — allocation total vs invoice total match
- Comparability (15%) — existence of prior Close Pack for comparison
- Drift (10%) — month-over-month spend change severity

### Model Pricing & Savings Engine
- 30+ model pricing registry (Anthropic, OpenAI, Google, Meta, DeepSeek)
- 17 verified downgrade paths with real savings ratios
- 60/40 input/output token split assumption
- Per-model-swap cards with monthly and annual projections

### MCP Server (12 Tools)
Claude Desktop integration via @finault/mcp-server:
- **Visibility:** get_spend_summary, get_team_spend, compare_spend, get_trends
- **Control:** check_budget, set_budget_alert, request_budget_increase
- **Optimization:** get_recommendations, simulate_model_switch, calculate_roi
- **Reporting:** generate_close_pack, get_attestation

### Integrations
- **ERP Export:** QuickBooks Online JSON, generic CSV (Xero/NetSuite/Sage)
- **Slack Webhook:** Block Kit notifications on Close Pack sealing
- **Email Delivery:** Close Pack artifacts via Cloudflare Worker gateway
- **Board Summary:** One-click clipboard copy for board decks

## Deployment

```bash
# Deploy static site to Cloudflare Pages
npx wrangler pages deploy static --project-name=finault-site

# Deploy gateway worker
cd apps/gateway && npx wrangler deploy

# Publish MCP server to npm
cd mcp-server && npm publish
```

| Environment | URL |
|------------|-----|
| Production | [finault.ai](https://finault.ai) |
| Staging | finault-site.pages.dev |
| Gateway | finault-gateway.finault.workers.dev |

## Compliance & Standards
- U.S. GAAP (ASC 350-40) categorization
- SOX Section 404 control structure (5 CTRL codes)
- IRS Publication 946 depreciation references
- FinOps FOCUS 1.3 Specification alignment
- SHA-256 data integrity verification
- 7-year document retention recommendation

## For Developers

See **[CODEBASE_MAP.md](CODEBASE_MAP.md)** for a complete line-by-line reference to every function, constant, and section in the codebase. This is the fastest way to orient yourself for any coding task.
