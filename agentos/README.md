# Finault AgentOS

**"The Apple of AI Cost Governance"**

A production-ready multi-agent system for autonomous AI cost management.

## Vision

**Jobs:** Make the complex invisible. Ask a question, get an answer, take action.
**Musk:** 10x better, not 10% better. Full automation. Agents that learn and improve autonomously.

## What's Included

### 🤖 Agents

| Agent | Purpose |
|-------|---------|
| **Finault Pal** | Your AI cost governance co-pilot. Natural language interface to ALL capabilities. |
| **Cost Intelligence** | Anomaly detection using Z-score, IQR, EWMA, CUSUM. Pattern learning. |
| **Optimization** | Finds savings opportunities. Model switching, caching, rate limiting. |
| **Forecasting** | Predicts future costs. Scenario modeling. Budget impact analysis. |
| **Policy** | Compliance monitoring. Budget enforcement. Approval workflows. |
| **Compound Learning** | Self-improving agent. Reviews sessions, extracts learnings, updates instructions. |

### 🔧 Features

- **Learning** - Agents remember and improve over time
- **Persistence** - State, sessions, and memory backed by PostgreSQL/Supabase
- **Agentic RAG** - Knowledge retrieval for pricing, best practices, benchmarks
- **MCP Tools** - Model Context Protocol server for any AI to use Finault
- **Compound Engineering** - Nightly loop that compounds learnings

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for local development)
- Supabase account (or PostgreSQL)
- Anthropic API key

### Setup

```bash
# Clone
git clone https://github.com/finault/agentos
cd agentos

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your keys

# Start with Docker
docker-compose up -d

# Or run directly
npm run dev
```

### Connect to the UI

1. Open your Finault dashboard
2. Navigate to Settings → Agent OS
3. Enter `http://localhost:8000` as the URL
4. Start chatting with Finault Pal

## Usage Examples

### Chat with Finault Pal

```
You: Why did my AI costs spike last week?

Finault Pal: Your costs jumped 34% last week, driven by three factors:
1. GPT-4 usage tripled on the Analytics project
2. A batch job ran without rate limiting
3. New team members weren't using the approved models

I can fix all three right now. Want me to apply rate limits and model policies?
```

### Find Optimizations

```
You: Optimize my costs

Finault Pal: Found $52,000/month in savings:
├── Switch 3 workloads to Claude Haiku (-$12,400)
├── Enable response caching (-$8,200)
├── Apply rate limiting (-$15,800)
└── Reserved capacity discounts (-$15,600)

Should I apply these? [Apply All] [Review Each]
```

### Forecast Costs

```
You: What will I spend next quarter?

Finault Pal: Q2 2026 Forecast: $892,000 (±8%)
├── OpenAI: $412,000 (+12%)
├── Anthropic: $298,000 (stable)
├── AWS Bedrock: $124,000 (+23%)
└── Others: $58,000

⚠️ Warning: At current trajectory, you'll exceed your $1M/quarter budget by July.
```

## API Endpoints

### Chat

```bash
POST /api/v1/chat
{
  "message": "Why did my costs spike?",
  "session_id": "optional-session-id"
}
```

### Cost Intelligence

```bash
POST /api/v1/intelligence/anomalies
{
  "lookback_days": 30,
  "sensitivity": "medium"
}
```

### Optimizations

```bash
GET /api/v1/optimizations?min_savings=100

POST /api/v1/optimizations/:id/apply
{
  "confirmed": true
}
```

### Forecasting

```bash
GET /api/v1/forecast?months=3&scenario=baseline

POST /api/v1/forecast/budget-analysis
{
  "budget": 100000,
  "months_ahead": 3
}
```

### Policy Compliance

```bash
GET /api/v1/policies/compliance?period=30d
GET /api/v1/policies/violations
```

## MCP Integration

Finault exposes all capabilities via Model Context Protocol:

```javascript
import { MCPTools } from 'your-agent-framework';

const agent = Agent({
  tools: [MCPTools(url="http://localhost:8000/mcp")]
});

// Now your agent can use Finault tools:
// - finault_analyze_costs
// - finault_detect_anomalies
// - finault_find_optimizations
// - finault_forecast_costs
// - finault_generate_report
// - finault_check_policies
```

## Compound Learning

The system runs a nightly loop that:

1. **10:30 PM** - Reviews all sessions from last 24 hours
2. **10:45 PM** - Extracts learnings and updates AGENTS.md
3. **11:00 PM** - Verifies forecast accuracy against actuals
4. **11:15 PM** - Identifies and queues priority improvements

### Manual Trigger

```bash
npm run compound

# Or via API
POST /api/v1/learning/compound
```

### AGENTS.md

Learnings are stored in `AGENTS.md`:

```markdown
## cost_patterns
- [2026-01-30] Monday morning spikes correlate with batch jobs (High) - Add monitoring

## optimization_strategies
- [2026-01-30] Model switching GPT-4→Haiku yields 60% savings for FAQ workloads (High) - Recommend by default
```

## Architecture

```
finault-agentos/
├── agents/
│   ├── finault-pal.js          # Main conversational agent
│   ├── cost-intelligence.js     # Anomaly & pattern detection
│   ├── optimization-agent.js    # Savings finder
│   ├── forecasting-agent.js     # Predictive analytics
│   ├── policy-agent.js          # Compliance enforcement
│   └── compound-learning.js     # Self-improvement
├── tools/
│   └── finault-tools.js         # Core capabilities
├── mcp/
│   └── finault-mcp-server.js    # MCP server
├── api/
│   └── server.js                # REST API
├── db/
│   └── schema.sql               # Database schema
├── scripts/
│   └── nightly-compound.sh      # Automation
├── AGENTS.md                    # Living knowledge base
├── docker-compose.yml           # Docker setup
└── package.json
```

## Environment Variables

```bash
# Required
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-service-key
ANTHROPIC_API_KEY=your-anthropic-key

# Optional
JWT_SECRET=your-jwt-secret
INTERNAL_API_KEY=your-internal-key
PORT=8000
SLACK_WEBHOOK=your-slack-webhook
```

## Success Metrics

- **Time to Insight**: < 5 seconds for any cost question
- **Automation Rate**: 90%+ of routine tasks automated
- **Accuracy**: 95%+ on cost predictions
- **Savings Found**: Average 23% cost reduction
- **User Delight**: NPS > 70

## The Apple Moment

When a CFO can say:

> "I just ask Finault what's happening with our AI costs, and it tells me. It finds savings I didn't know existed. It predicts problems before they happen. It's like having a team of 10 cost analysts that never sleep."

That's when we've won.

---

Built with ❤️ by Finault
