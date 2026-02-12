# Finault SDK for Python

Official Python SDK for the Finault AgentOS platform. Provides cost tracking, budget enforcement, and advanced governance features for LLM applications.

## Installation

```bash
pip install finault-sdk
```

## Quick Start

```python
from finault_sdk import Finault, BudgetConfig, BudgetEnforcementMode

client = Finault(
    api_key='your-api-key',
    cost_center='engineering',
    project='chatbot',
    budget_config=BudgetConfig(
        monthly_limit_usd=100.0,
        enforcement_mode=BudgetEnforcementMode.WARN,
    ),
)

# Use chat completions with cost tracking
response = client.chat.create(
    model='gpt-3.5-turbo',
    messages=[{'role': 'user', 'content': 'Hello!'}],
)

print(f"Cost: ${client.get_total_cost():.6f}")
```

## API Reference

### Chat Completions
- `chat.create(model, messages, ...)` — Send chat completion request (streaming or non-streaming)

### Invoice Reconciliation
- `reconcile_invoice(invoice)` — Reconcile a single invoice
- `batch_reconcile_invoices(invoices)` — Batch reconcile up to 100 invoices
- `parse_invoice(invoice)` — Parse invoice content

### Close Packs
- `generate_close_pack(data)` — Generate a close pack
- `get_close_pack_history(limit)` — Get close pack history
- `export_close_pack(pack_id, format)` — Export a close pack

### Budget Enforcement
- `check_budget(budget_data)` — Check budget compliance
- `configure_budget(budget_config)` — Configure budget settings
- `get_budget_status(team)` — Get budget status for a team

### Cost Allocation
- `allocate_costs(allocation_data)` — Allocate costs across departments
- `create_allocation_rules(rules)` — Create cost allocation rules
- `get_cost_allocation_dashboard(cost_center, period)` — Get allocation dashboard
- `chargeback_invoice(invoice_data)` — Generate chargeback invoice
- `generate_showback(showback_data)` — Generate showback report

### Data Residency
- `get_data_residency_region()` — Get current region
- `set_data_residency_region(region_data)` — Set data residency region
- `validate_data_transfer(transfer_data)` — Validate data transfer compliance
- `get_data_residency_report()` — Get compliance report

### Infrastructure
- `get_infra_health()` — Get infrastructure health status

### Observability
- `record_observability(data)` — Record observability data
- `get_observability_metrics(period)` — Get observability metrics
- `get_observability_traces(format)` — Get observability traces

### ROI Measurement
- `track_outcome(outcome_data)` — Track ROI outcome
- `get_roi_dashboard(period)` — Get ROI dashboard
- `get_roi_by_project(months)` — Get ROI by project
- `benchmark_roi(benchmark_data)` — Benchmark ROI performance

### Benchmark Platform
- `get_benchmark_report()` — Get benchmark report
- `get_benchmark_leaderboard(industry, metric)` — Get leaderboard
- `submit_benchmark(benchmark_data)` — Submit benchmark data
- `get_benchmark_insights(industry)` — Get insights
- `get_benchmark_maturity()` — Get maturity assessment

### Cost Tracking & Budget Management
- `get_total_cost()` — Get total accumulated cost
- `get_costs_by_model()` — Get costs grouped by model
- `get_costs_by_project()` — Get costs grouped by project
- `get_cost_history(limit)` — Get cost history
- `get_remaining_budget()` — Get remaining budget
- `get_budget_usage_percent()` — Get budget usage percentage
- `set_cost_tags(cost_center, project)` — Update cost tracking tags
- `on_budget_warning(callback)` — Register warning callback
- `on_budget_exceeded(callback)` — Register exceeded callback
- `on_budget_soft_limit(callback)` — Register soft limit callback

## Authentication

All API calls require a JWT token. Pass your API key when initializing the client:

```python
client = Finault(api_key='your-api-key')
```

Or set the `OPENAI_API_KEY` environment variable.

## Budget Enforcement

Configure budget enforcement to control spending:

```python
client = Finault(
    budget_config=BudgetConfig(
        monthly_limit_usd=1000.0,
        enforcement_mode=BudgetEnforcementMode.HARD_LIMIT,
        warning_threshold_percent=80,
    ),
)

def on_warning(current, limit):
    percent = (current / limit * 100) if limit > 0 else 0
    print(f"Budget warning: {percent:.1f}% used")

client.on_budget_warning(on_warning)
```

## License

MIT
