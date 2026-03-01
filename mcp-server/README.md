# @finault/mcp-server

Financial Intelligence for AI Spend — 12 tools that let Claude, Cursor, and any MCP-compatible AI assistant answer cost questions, enforce budgets, and generate Close Packs.

## Quick Start

```bash
npx @finault/mcp-server
```

Or install globally:

```bash
npm install -g @finault/mcp-server
finault-mcp
```

## Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `~/.config/claude/claude_desktop_config.json` (Linux):

```json
{
  "mcpServers": {
    "finault": {
      "command": "npx",
      "args": ["-y", "@finault/mcp-server"],
      "env": {
        "FINAULT_API_KEY": "your-api-key"
      }
    }
  }
}
```

## 12 Tools

### Visibility (4 tools)

| Tool | Description |
|------|-------------|
| `get_spend_summary` | Total AI spend with provider/model/team breakdowns for any period |
| `get_team_spend` | Team-specific spend analysis with budget utilization |
| `compare_spend` | Period-over-period comparison with variance analysis |
| `get_trends` | Trend analysis with forecasting and anomaly detection |

### Control (3 tools)

| Tool | Description |
|------|-------------|
| `check_budget` | Real-time budget status for any cost center |
| `set_budget_alert` | Configure threshold alerts (email, Slack, webhook) |
| `request_budget_increase` | Submit and track budget increase requests |

### Optimization (3 tools)

| Tool | Description |
|------|-------------|
| `get_recommendations` | AI-powered cost optimization recommendations |
| `simulate_model_switch` | Simulate switching models with savings projection |
| `calculate_roi` | Calculate ROI for AI features and cost centers |

### Reporting (2 tools)

| Tool | Description |
|------|-------------|
| `generate_close_pack` | Generate sealed Close Pack with SHA-256 integrity chain |
| `get_attestation` | Verification certificate and audit trail |

## Usage in Claude

Once configured, ask your AI assistant:

- "What did engineering spend on AI last month?"
- "Am I over budget on the ML Training cost center?"
- "What happens if we switch from GPT-4 to GPT-4o-mini for support?"
- "Generate the January 2026 Close Pack"
- "Compare this month's spend to last month"
- "What are the top cost optimization opportunities?"

## Resources

The server also exposes 4 MCP resources:

| Resource | Description |
|----------|-------------|
| `finault://spend/current` | Current period spend summary |
| `finault://budgets/status` | All budget statuses |
| `finault://anomalies/active` | Active spend anomalies |
| `finault://recommendations/top` | Top optimization recommendations |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FINAULT_API_URL` | Gateway API URL | `https://finault-gateway.finault.workers.dev` |
| `FINAULT_API_KEY` | Your API key | Falls back to demo mode with sample data |

## Demo Mode

Without an API key, the server runs in demo mode with realistic sample data — useful for evaluation and testing.

## Requirements

- Node.js >= 18.0.0
- Any MCP-compatible client (Claude Desktop, Cursor, Claude Code, etc.)

## License

MIT — Finault (https://finault.ai)
