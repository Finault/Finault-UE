# Finault Python SDK

Official Python SDK for [Finault](https://finault.ai) - AI Cost Governance Platform

## Installation

```bash
pip install finault
```

## Quick Start

### Initialize the Client

```python
import finault

client = finault.FinaultClient(api_key="fk_live_...")
```

### Route AI Requests Through Finault

```python
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "What is machine learning?"}],
    provider_api_key="sk-..."  # Your OpenAI API key
)

print(f"Response: {response.content}")
print(f"Cost: ${response.cost}")
print(f"Tokens: {response.tokens}")
print(f"Request ID: {response.request_id}")
```

### Stream Chat Completions

```python
stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Write a poem about AI"}],
    provider_api_key="sk-...",
    stream=True
)

for chunk in stream:
    print(chunk.delta.get("content", ""), end="", flush=True)
```

## Budget Management

### Create a Budget

```python
budget = client.budgets.create(
    name="GPT-4 Monthly Budget",
    limit=1000.0,
    period="monthly"
)
print(f"Budget ID: {budget.id}")
```

### List Budgets

```python
budgets = client.budgets.list()
for budget in budgets:
    print(f"{budget.name}: ${budget.spent}/${budget.limit}")
    print(f"Utilization: {budget.utilization_percent:.1f}%")
    print(f"Remaining: ${budget.remaining}")
```

### Get Budget Details

```python
budget = client.budgets.get("budget_123")
print(f"Status: {budget.status}")
print(f"Alert count: {len(budget.alerts)}")
```

## Cost Anomaly Detection

### List Detected Anomalies

```python
anomalies = client.anomalies.list()
for anomaly in anomalies:
    print(f"[{anomaly.severity}] {anomaly.description}")
    print(f"Variance: {anomaly.percentage_variance:.1f}%")
```

### Filter by Severity

```python
critical_anomalies = client.anomalies.list(severity="critical")
```

### Acknowledge an Anomaly

```python
anomaly = client.anomalies.acknowledge("anomaly_123")
print(f"Acknowledged at: {anomaly.acknowledged_at}")
```

## Financial Close Pack

### Generate a Close Pack

```python
pack = client.closepack.generate(period="2026-02")
print(f"Period: {pack.period}")
print(f"Total Spend: ${pack.total_spend}")
print(f"Summary: {pack.summary}")
print(f"Journal Entries: {len(pack.journal_entries)}")
```

### List Previous Close Packs

```python
packs = client.closepack.list()
for pack in packs:
    print(f"{pack.period}: ${pack.total_spend} ({pack.status})")
```

## API Key Management

### Create an API Key

```python
key = client.keys.create(name="Production Gateway")
print(f"Key ID: {key.id}")
# Note: The full key is only shown once upon creation
```

### List API Keys

```python
keys = client.keys.list()
for key in keys:
    print(f"{key.name} (Preview: {key.key_preview})")
```

### Revoke an API Key

```python
client.keys.revoke("key_123")
print("Key revoked successfully")
```

## Dashboard & Insights

### Get Overview Metrics

```python
metrics = client.dashboard.overview()
print(f"Total Spend: ${metrics.total_spend}")
print(f"Trend: {metrics.spend_trend:+.1f}%")
print(f"Requests: {metrics.request_count}")
print(f"Avg Cost/Request: ${metrics.average_cost_per_request:.4f}")

print("\nTop Models:")
for model in metrics.top_models:
    print(f"  {model['name']}: {model['usage']} calls, ${model['cost']}")
```

### Get Insights and Recommendations

```python
insights = client.dashboard.insights()
print("Key Findings:")
for finding in insights.key_findings:
    print(f"  - {finding}")

print("\nRecommendations:")
for rec in insights.recommendations:
    print(f"  - {rec}")
```

## System Health & Pricing

### Check API Health

```python
health = client.health.status()
print(f"Status: {health.status}")
print(f"Version: {health.version}")
```

### Get Pricing Information

```python
pricing = client.pricing.get()
print("Model Pricing:")
for model, rates in pricing.models.items():
    print(f"  {model}: ${rates['input']}/1K input, ${rates['output']}/1K output")
```

## Error Handling

```python
from finault import (
    FinaultError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    APIError,
)

try:
    response = client.chat.completions.create(...)
except AuthenticationError as e:
    print(f"Authentication failed: {e.message}")
    print(f"Request ID: {e.request_id}")
except RateLimitError as e:
    print(f"Rate limited. Retry after {e.retry_after}s")
except ValidationError as e:
    print(f"Validation error: {e.message}")
    print(f"Field errors: {e.field_errors}")
except APIError as e:
    print(f"API error: {e.message}")
    print(f"Status: {e.status_code}")
```

## Context Manager

Use the client as a context manager for automatic cleanup:

```python
with finault.FinaultClient(api_key="fk_live_...") as client:
    response = client.chat.completions.create(...)
    print(response.cost)
```

## Configuration Options

```python
client = finault.FinaultClient(
    api_key="fk_live_...",
    base_url="https://api.finault.ai",  # Custom base URL
    timeout=30.0,  # Request timeout in seconds
    max_retries=3,  # Automatic retry attempts for 429/5xx
)
```

## Retry Logic

The SDK automatically retries requests that fail with:
- 429 (Rate Limit)
- 500, 502, 503, 504 (Server Errors)

Retries use exponential backoff starting at 1 second.

## Streaming

Chat completions support streaming for real-time token delivery:

```python
stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[...],
    provider_api_key="sk-...",
    stream=True
)

for chunk in stream:
    if chunk.delta.get("content"):
        print(chunk.delta["content"], end="", flush=True)
```

## API Reference

### Resources

- `client.chat.completions.create()` - Create a chat completion
- `client.closepack.generate()` - Generate a financial close pack
- `client.closepack.list()` - List previous close packs
- `client.budgets.create()` - Create a new budget
- `client.budgets.list()` - List all budgets
- `client.budgets.get()` - Get a specific budget
- `client.budgets.update()` - Update a budget
- `client.anomalies.list()` - List detected anomalies
- `client.anomalies.get()` - Get specific anomaly
- `client.anomalies.acknowledge()` - Mark anomaly as acknowledged
- `client.keys.create()` - Create an API key
- `client.keys.list()` - List API keys
- `client.keys.revoke()` - Revoke an API key
- `client.dashboard.overview()` - Get dashboard overview
- `client.dashboard.insights()` - Get dashboard insights
- `client.health.status()` - Check API health
- `client.pricing.get()` - Get pricing information

## Support

For issues, questions, or feedback:
- Email: support@finault.ai
- Docs: https://docs.finault.ai
- Issues: https://github.com/finault/finault-python/issues

## License

MIT License - see LICENSE file for details
