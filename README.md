# Finault

The economic proof layer for AI. Sealed receipts connecting cost, revenue, and margin with SHA-256 cryptographic proof on every AI transaction.

**Live at [finault.ai](https://finault.ai)**

## Architecture

```
finault-monorepo/
├── apps/
│   ├── gateway/          # Cloudflare Worker — THE gateway (47K lines)
│   │   ├── gateway-wired.js   # Main gateway (deployed as finault-gateway-gold)
│   │   └── src/               # Modularized handlers + provider adapters
│   ├── mcp/              # MCP Server for Claude Desktop (6 tools)
│   └── status/           # Status page worker (status.finault.ai)
├── database/
│   └── migrations/       # Supabase SQL migrations (001-071)
├── packages/
│   ├── aiei-spec/        # AIEI standard (Apache 2.0)
│   └── aiei-validator/   # Schema validator
├── sdks/
│   ├── python/           # Python SDK + CLI (`pip install finault`)
│   └── node/             # Node/TypeScript SDK (`npm install finault`)
├── static/               # Cloudflare Pages static files
│   ├── app.html          # Dashboard SPA
│   ├── index.html        # Landing page
│   └── experience.html   # Receipt / experience page
├── dashboard/            # Next.js dashboard
├── platform/             # Standalone modules (time machine, economic router)
└── docs/                 # Architecture documentation
```

## Four-Layer Architecture

1. **Rails** — Gateway routing (OpenAI, Anthropic, Google, Azure, Bedrock), cryptographic sealing (SHA-256 + HMAC), agent identity, AIEI standard
2. **Intelligence** — Finault Score (6 dimensions), anomaly detection, drift monitoring, cost optimization, budget management via Durable Objects
3. **Reconciliation & Settlement** — Three-way matching (usage/invoices/rate cards), certificates, 14 exception codes, dispute generation, GL entries
4. **Network** — Finault Index (cross-company benchmarks), Live Close Pack, verification portal, receipt network

## Quick Start

```python
from finault import OpenAI

client = OpenAI()  # Uses FINAULT_API_KEY from env
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    extra_headers={"X-Finault-Revenue": "0.15"}
)
# Every call is sealed. Check X-Finault-Seal header for receipt URL.
```

## Deploy

```bash
npx wrangler deploy apps/gateway/gateway-wired.js \
  --name finault-gateway-gold \
  --compatibility-date 2024-09-23 \
  --compatibility-flags nodejs_compat
```

## Gateway Features (v4.2)

The gateway (`apps/gateway/gateway-wired.js`) is a single 47K-line Cloudflare Worker with zero external dependencies. Key systems:

- **FinaultRouter** — Express-style router with middleware chain (zero deps, replaces Hono)
- **AES-256-GCM Encryption** — Stripe token encryption at rest
- **KV Rate Limiter** — Sliding window counters across 7 category tiers
- **Read-Through Cache** — KV→Supabase fallback with async cache population
- **Durable Objects** — BudgetCounter, SealSequencer, DashboardStream
- **D1 Hot-Path** — Edge SQLite for sub-ms auth lookups
- **Schema Validation** — SealValidator rejecting malformed seals
- **HMAC Webhooks** — Signed delivery for 8 event types
- **Semantic Cache** — SHA-256 of canonicalized requests
- **API Key Manager** — Generate/validate/revoke with D1→Supabase fallback
- **Intelligence Reports** — Executive summaries, cost analysis, recommendations
- **AI P&L** — Revenue, COGS, gross margin, dark debt sections
- **Margin Forensics** — Period-over-period delta attribution
- **Provider Abstraction** — OpenAI/Anthropic/Google with auto-detection
- **Revenue Connectors** — Lago + Kill Bill integrations
- **Finault Replay** — "What if" cost modeling
- **Finault Index** — Cross-company benchmarks with percentile rankings
- **Quality Signal** — Third axis of WORTH (cost, revenue, quality)
- **Offline Seals** — Base64url compact proofs for offline verification

## Links

- **Site:** https://finault.ai
- **API:** https://api.finault.ai
- **Status:** https://status.finault.ai
- **AIEI Spec:** https://github.com/Finault/aiei-spec
- **First Imprint:** https://api.finault.ai/seal/seal_de8ad2460a2e

## License

Apache 2.0
