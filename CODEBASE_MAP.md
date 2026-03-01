# Finault Codebase Map v3.0

> Quick-reference for any developer or AI session working on Finault.
> Pair with `Finault-Technical-Report-v3.docx` for full product context.

## Core Application: `static/app.html` (~4,570 lines)

This is the entire Finault SPA. Everything lives in this single file.

### CSS & Design System (Lines 1–520)
- Dark theme: `--bg: #0F0F14`, `--card: #1A1A24`, `--primary: #16A34A`
- Component classes: `.section-card`, `.metric-card`, `.confidence-badge`, `.data-table`, `.gauge-bar`
- Responsive layout with sidebar navigation

### HTML Pages (Lines 520–1300)

| Page | Lines | Key Elements |
|------|-------|-------------|
| Results | 520–690 | Bessemer gauge, metric cards, margin section, optimization cards, allocation table, Close Pack grid |
| Unit Economics | 690–860 | Input panel (spend/revenue/customers/transactions), benchmark gauge, 5 metric cards, cost-to-serve table, model mix |
| Rules | 860–922 | GL Code Rules, Cost Center Rules (pattern matching) |
| History | 922–942 | Close Pack history list from Supabase |
| Hidden: Gateway | 942–1000 | API proxy endpoints (display:none) |
| Hidden: Budgets | 1000–1060 | Team budget cards (display:none) |
| Hidden: API Access | 1060–1122 | API key gen, endpoint docs (display:none) |
| Settings | 1122–1190 | Account, plan, budget threshold, Slack webhook |
| Modals | 1190–1300 | Auth, email capture, revenue interstitial, upgrade, toast |

### JavaScript — Core Infrastructure (Lines 1300–1815)

| Function/Block | Lines | Purpose |
|---------------|-------|---------|
| Supabase init | 1302–1340 | Client setup, project `bejoptgsrhmklmllkobu` |
| State variables | 1340–1400 | `currentInvoiceData`, `processedData`, `marginState`, globals |
| `getCloseChain()` | 1400–1410 | Read temporal chain from localStorage |
| `appendToCloseChain()` | 1410–1430 | Add entry, cap at 120, persist + Supabase |
| `loadChainFromSupabase()` | 1430–1470 | Rebuild chain from server on login |
| `generateCloseId()` | 1470–1480 | `FIN-CL-XXXXXXXXXXXX` from crypto.getRandomValues |
| `sha256(data)` | 1480–1520 | Web Crypto API with djb2 fallback |
| `computeFCS()` | 1436–1565 | **Finault Confidence Score** — 5 weighted dimensions (coverage 30%, exceptions 25%, reconciliation 20%, comparability 15%, drift 10%) |
| `sendSlackNotification()` | 1566–1620 | Block Kit formatted webhook |
| `checkBudgetThreshold()` | 1620–1690 | Warning/exceeded alerts |
| DOMContentLoaded | 1696–1815 | Init, `checkAuth()` (3-tier), navigation setup |

### JavaScript — Data Processing (Lines 1816–2329)

| Function | Lines | Purpose |
|----------|-------|---------|
| `processFile()` | 1816–1860 | File validation (CSV/TSV/TXT, 50MB, non-zero) |
| `loadSampleData()` | 1860–1900 | Randomized demo data (5 cost centers, 6 models) |
| `MODEL_PRICING` | 1900–1978 | **30+ model pricing registry** — per-million-token rates by provider/tier |
| `DOWNGRADE_MAP` | 1978–2020 | **17 optimization paths** with verified savings ratios |
| `normalizeModelName(raw)` | 2020–2050 | Strips dates (-20241022), versions (-v2), normalizes Anthropic naming |
| `detectProviderFromModel()` | 2050–2080 | Claude→Anthropic, GPT→OpenAI, Gemini→Google, Llama→Meta, DeepSeek |
| `safeLookupPricing()` | 2080–2120 | Exact match → fuzzy family → mid-tier fallback |
| `estimateTokensFromCost()` | 2120–2140 | Reverse-engineers token count from dollar amount |
| `findColumnFuzzy()` | 2140–2180 | **Multi-provider column detection** — exact then substring match |
| `detectPeriodFromCSV()` | 2180–2210 | Samples date columns, returns most common month/year |
| `splitCSVLine()` | 2210–2226 | RFC 4180 compliant (handles quoted fields, escaped quotes) |
| `parseCSV()` | 2226–2290 | Main parser — column detection, model/provider extraction, invoiceData construction |
| `generateAllocations()` | 2290–2329 | Keyword fuzzy matching to cost centers with confidence scores |

### JavaScript — Results & Bessemer (Lines 2330–2747)

| Function | Lines | Purpose |
|----------|-------|---------|
| `showResults()` | 2330–2440 | Render stats cards, FCS badge, allocations table, Close Pack grid |
| `onResultsRevenueInput()` | 2440–2533 | Computes Bessemer tier, margin metrics, verdict banner, syncs to marginState |
| `computeSavingsOpportunities()` | 2534–2600 | Maps models to DOWNGRADE_MAP, calculates monthly/annual savings |
| `renderSavingsSection()` | 2600–2663 | Savings cards with benchmark context, total savings summary |
| Revenue modal | 2665–2700 | Email capture + revenue interstitial |
| `copyBoardSummary()` | 2700–2747 | One-click board summary to clipboard |

### JavaScript — Unit Economics (Lines 2748–3003)

| Function | Lines | Purpose |
|----------|-------|---------|
| `populateUnitEconPage()` | 2748–2820 | Restores shared state from marginState, auto-fills spend from invoice |
| `recalcUnitEcon()` | 2820–3003 | **Bidirectional sync** via `_syncingMargin` guard — Bessemer gauge, 5 metric cards, cost-to-serve table, model mix bar chart, verdict banner, 3 sourced insights |

### JavaScript — Close Pack Generation (Lines 3005–3235)

| Function | Lines | Purpose |
|----------|-------|---------|
| `generateClosePack()` | 3005–3150 | **Race-guarded async** — generates Close ID, 5 artifacts, MANIFEST.json with SHA-256 hashes, ZIP bundle, temporal chain append, Slack notification, Supabase save |
| `exportToERP('quickbooks')` | 3237–3300 | QuickBooks Online JSON (JournalEntryLineDetail, AP-AI-001 credit) |
| `exportToERP('csv')` | 3300–3352 | Generic CSV (Date, Account, Cost Center, Debit, Credit, Memo) |

### JavaScript — PDF Generation (Lines 3354–4202)

| Function | Lines | Purpose |
|----------|-------|---------|
| `generateExecPDF()` | 3354–3725 | **2-page Executive Summary** — dynamic section numbering, conditional budget/period sections, provider breakdown table, Bessemer classification, approval signatures |
| `generateJournalCSV()` | 3727–3755 | GL journal entries with CSV formula injection protection (`csvSafe()`) |
| `generateReconPDF()` | 3757–3850 | Close Certificate — temporal chain, FCS score, verification instructions |
| `generateControlsPDF()` | 3850–3914 | SOX 404 structure — 5 CTRL codes (data extraction, allocation, reconciliation, exception, hash verification) |
| `generateUnitEconPDF()` | 3916–4202 | Board-ready unit economics summary |

### JavaScript — History, Auth, Utilities (Lines 4204–4567)

| Function | Lines | Purpose |
|----------|-------|---------|
| `saveToHistory()` | 4204–4250 | Saves to Supabase close_packs with chain fields |
| `loadHistory()` | 4250–4272 | Loads 20 most recent Close Packs |
| `handleAuth()` | 4274–4300 | Email/password auth via Supabase |
| `signInWithGoogle()` | 4300–4315 | Google OAuth |
| `signOut()` | 4315–4332 | Clear session + redirect |
| Email capture | 4333–4380 | Leads table insert |
| Utilities | 4380–4567 | `formatCurrency()`, modals, toast, API key gen (`fk_` prefix), settings save, Slack webhook save/test |

---

## MCP Server: `mcp-server/`

- **Package:** `@finault/mcp-server` v3.0.0
- **Entry:** `dist/index.js` (TypeScript source compiled away)
- **SDK:** `@modelcontextprotocol/sdk` with stdio transport
- **Binary:** `finault-mcp` (configured in Claude Desktop)

### 12 Tools

| Category | Tool | Purpose |
|----------|------|---------|
| Visibility | `get_spend_summary` | Total spend by cost center, provider, model |
| Visibility | `get_team_spend` | Team-specific with model breakdown |
| Visibility | `compare_spend` | Period-over-period variance |
| Visibility | `get_trends` | Forecasting with scenario modeling |
| Control | `check_budget` | Budget status, projected end-of-month |
| Control | `set_budget_alert` | Configure thresholds per cost center |
| Control | `request_budget_increase` | Submit with justification |
| Optimization | `get_recommendations` | Model downgrade, caching, prompt optimization |
| Optimization | `simulate_model_switch` | What-if analysis for model swaps |
| Optimization | `calculate_roi` | ROI by use case (support, code, content) |
| Reporting | `generate_close_pack` | Trigger month-end Close Pack |
| Reporting | `get_attestation` | Data integrity hashes and audit trail |

---

## Static Site Pages: `static/`

| File | Purpose |
|------|---------|
| `index.html` | Marketing landing page |
| `app.html` | **Main application** (the SPA) |
| `login.html` | Authentication page |
| `pricing.html` | Pricing tiers |
| `docs.html` | Documentation |
| `demo.html` | Interactive demo |
| `dashboard.html` | Dashboard (Next.js era, mostly superseded by app.html) |
| `security.html` | Security & compliance page |
| `privacy.html` | Privacy policy |
| `terms.html` | Terms of service |
| `changelog.html` | Product changelog |
| `audit.html` | Audit page |
| `welcome.html` | Post-signup welcome |
| `404.html` | Error page |

---

## Gateway: `apps/gateway/`

- `gateway.ts` — TypeScript source
- `gateway-wired.js` — Compiled/wired version
- `wrangler.toml` — Cloudflare Worker config
- Deployed to: `https://finault-gateway.finault.workers.dev`

---

## Database: `database/`

- **Provider:** Supabase (project `bejoptgsrhmklmllkobu`)
- **Key Tables:** `close_packs` (with chain fields: close_id, prior_close_id, chain_hash, chain_depth), `leads`
- **Auth:** Email/password + Google OAuth + token-based session fallback

---

## Key Constants

### MODEL_PRICING (sample entries)
```
claude-opus-4-5:     input $15.00/M, output $75.00/M
claude-sonnet-4-5:   input $3.00/M,  output $15.00/M
claude-haiku-4-5:    input $0.80/M,  output $4.00/M
gpt-4.1:             input $2.00/M,  output $8.00/M
gpt-4.1-mini:        input $0.40/M,  output $1.60/M
gpt-4o:              input $2.50/M,  output $10.00/M
gpt-4o-mini:         input $0.15/M,  output $0.60/M
gemini-2.5-pro:      input $1.25/M,  output $10.00/M
gemini-2.5-flash:    input $0.15/M,  output $0.60/M
```

### DOWNGRADE_MAP (all 17 paths)
```
claude-opus-4-5    → claude-sonnet-4-5  (40% savings)
claude-sonnet-4-5  → claude-haiku-4-5   (67%)
gpt-4              → gpt-4.1            (90%)
gpt-4.1            → gpt-4.1-mini       (80%)
gpt-4o             → gpt-4o-mini        (94%)
gpt-4-turbo        → gpt-4o             (50%)
o1                 → o3                  (87%)
o1-mini            → o3-mini            (80%)
o1-preview         → o3                 (87%)
gemini-2.5-pro     → gemini-2.5-flash   (93%)
gemini-1.5-pro     → gemini-2.5-flash   (85%)
claude-3-opus      → claude-sonnet-4-5  (80%)
claude-3-sonnet    → claude-haiku-4-5   (73%)
claude-3-haiku     → claude-haiku-4-5   (20%)
gpt-3.5-turbo      → gpt-4o-mini       (70%)
llama-3.1-70b      → llama-3.1-8b      (71%)
deepseek-v3        → deepseek-r1       (50%)
```

---

## Deployment

```bash
# Static site (Cloudflare Pages)
npx wrangler pages deploy static --project-name=finault-site

# Gateway (Cloudflare Worker)
cd apps/gateway && npx wrangler deploy

# MCP Server (npm)
cd mcp-server && npm publish
```

- **Production:** finault.ai
- **Staging:** finault-site.pages.dev
- **Gateway:** finault-gateway.finault.workers.dev
