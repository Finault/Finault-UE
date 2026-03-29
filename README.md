# Finault

The economic proof layer for AI. Sealed receipts connecting cost, revenue, and margin with SHA-256 cryptographic proof on every AI transaction.

**Live at [finault.ai](https://finault.ai)**

## Architecture

```
Finault-UE/
├── apps/
│   ├── gateway/
│   │   ├── gateway-wired.js   # THE gateway (47,738 lines, v4.2)
│   │   └── src/               # Reference handlers/providers/DOs
│   ├── close-pack/            # Close Pack generator
│   ├── dashboard/             # Embedded dashboard components
│   ├── mcp/                   # MCP server for Claude Desktop
│   ├── status/                # Status page worker
│   └── verifier-service/      # Seal verification
├── database/
│   └── migrations/            # 71 SQL migrations (001-071)
├── functions/                 # Cloudflare Pages functions
├── github-action/             # CI action
├── packages/
│   ├── aiei-spec/             # AIEI standard (MIT)
│   └── aiei-validator/        # Schema validator
├── platform/                  # Reference business logic (45 modules)
├── scripts/                   # Build/deploy scripts
├── sdks/
│   ├── python/                # Python SDK + CLI
│   └── node/                  # Node/TypeScript SDK
├── static/                    # Cloudflare Pages (HTML, CSS, JS)
└── tests/                     # Test suite
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
