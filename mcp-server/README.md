# Finault MCP Server

Claude Desktop integration for AI cost management.

## Tools Available

| Tool | Description |
|------|-------------|
| `get_spend_summary` | Get AI spend summary for a period (YYYY-MM) |
| `check_budget` | Check budget status for a cost center |
| `get_unit_economics` | Calculate cost/transaction, cost/user, AI % of revenue |
| `generate_close_pack` | Generate Close Pack documents for month-end |

## Installation

```bash
cd mcp-server
npm install
npm run build
```

## Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "finault": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "FINAULT_API_URL": "https://finault-gateway.finault.workers.dev",
        "FINAULT_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Usage in Claude

Once configured, ask Claude:
- "What's my AI spend for January 2026?"
- "Check my engineering team's budget"
- "Calculate unit economics for last month"
- "Generate a Close Pack for 2026-01"

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FINAULT_API_URL` | Gateway API URL | `https://finault-gateway.finault.workers.dev` |
| `FINAULT_API_KEY` | Your API key | (required) |
