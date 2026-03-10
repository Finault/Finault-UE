# Finault

The financial operating system for AI.

Every AI transaction gets a Seal. Every agent gets an Imprint.
The chain proves the whole story.

## What This Is

Finault is the accountability layer for the AI economy. We sit between your application and your AI providers. Every API call gets a cryptographic receipt. Every agent gets a permanent identity. The chain is tamper-proof and independently verifiable.

## Architecture

Four layers:

1. **Rails** — Gateway proxy (OpenAI, Anthropic, Google, Azure, Bedrock), Seal engine (SHA-256 + HMAC), Imprint system, AIEI open standard
2. **Intelligence** — Finault Score (6 dimensions), anomaly detection, drift analysis, savings engine, budget enforcement
3. **Reconciliation & Settlement** — 3-way match (usage vs invoices vs rate cards), immutable certificates, 14 exception codes, continuous reconciliation, dispute auto-generation, GL journal entries
4. **Network** — Finault Index, Live Close Pack, chain verification portal (building)

## Live Infrastructure

| What | Where |
|------|-------|
| Product | [finault.ai](https://finault.ai) |
| Gateway | gateway.finault.ai (api.finault.ai) |
| First Imprint | [api.finault.ai/seal/seal_de8ad2460a2e](https://api.finault.ai/seal/seal_de8ad2460a2e) |
| AIEI Spec | [github.com/Finault/aiei-spec](https://github.com/Finault/aiei-spec) |
| Python SDK | `pip install finault` |
| Node SDK | `npm install finault` |
| Chain | 15+ seals, self-sovereign (SHA-256, no Ethereum) |

## Quick Start

### Scan your AI spend
Go to [finault.ai/experience](https://finault.ai/experience), paste your API key.

### Route through the gateway
```python
import openai
client = openai.OpenAI(
    base_url="https://gateway.finault.ai/v1",
    api_key="your-key"
)
```

### Install the SDK
```bash
pip install finault
# or
npm install finault
```

## Repository Structure

```
finault/
├── apps/
│   ├── gateway/              # Cloudflare Worker — core gateway proxy
│   │   ├── gateway-wired.js  # Main handler (900KB+, 32+ route handlers)
│   │   └── wrangler.toml
│   └── dashboard/            # Next.js admin dashboard
│
├── static/                   # Cloudflare Pages — finault.ai
│   ├── index.html            # Landing page
│   ├── experience.html       # 5-step product experience
│   ├── pricing.html          # Pricing
│   ├── docs.html             # Documentation
│   ├── login.html            # Auth
│   └── ...                   # All deployed pages
│
├── sdks/                     # Multi-language SDKs
│   ├── python/               # finault on PyPI
│   ├── node/                 # finault on npm
│   ├── go/                   # Go client
│   ├── java/                 # Java client
│   └── ruby/                 # Ruby client
│
├── platform/                 # Backend orchestration & modules
│   ├── orchestrator.js       # Core platform orchestrator
│   └── modules/              # Intelligence modules
│
├── agentos/                  # Agent operating system
│   ├── core/                 # Agent runtime
│   ├── protocols/            # AIEI protocol implementation
│   └── tools/                # Agent tool definitions
│
├── database/                 # Supabase schema & migrations
│   └── migrations/           # 23 SQL migration files
│
├── mcp-server/               # MCP Server for Claude Desktop
│   └── src/                  # 12 tools for AI cost management
│
├── integrations/             # ERP, SSO, provider connectors
├── modules/                  # Anomaly detection, policy engine
├── services/                 # Microservices (billing, notifications)
├── tools/                    # CLI tools
├── tests/                    # Test suites
└── docs/                     # Architecture documentation
```

## Database

100+ Supabase tables, 23 migrations. Key tables include: seals and seal_chain (the immutable chain), imprints and agent_careers (agent identity system), reconciliation_reports and reconciliation_certificates (settlement layer), finault_scores, anomalies, and drift_alerts (intelligence layer).

## Standards & Compliance

- AIEI v1.0.0 (Apache 2.0)
- EU AI Act Article 12 compatible
- Colorado SB205 compatible
- SOC 2 readiness exports
- NIST AI Agent Standards aligned

## Deployment

```bash
# Deploy site to Cloudflare Pages
cd static && npx wrangler pages deploy . --project-name finault

# Deploy gateway worker
cd apps/gateway && npx wrangler deploy
```

## Team

Bernie Cotter — Founder & CEO (bernard.cotter@finault.co)
Ian Lapham — Advisor (ex-Uniswap)
David Rubin — Advisor (MathWorks)

## License

Apache 2.0
