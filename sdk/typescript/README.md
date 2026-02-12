# Finault SDK for TypeScript

Official TypeScript SDK for the Finault AgentOS platform. Provides cost tracking, budget enforcement, and advanced governance features for LLM applications.

## Installation

```bash
npm install finault-sdk
# or
yarn add finault-sdk
```

## Quick Start

```typescript
import Finault, { BudgetConfig, BudgetEnforcementMode } from './finault-sdk';

const client = new Finault({
  apiKey: process.env.FINAULT_API_KEY,
  costCenter: 'engineering',
  project: 'chatbot',
  budgetConfig: {
    monthlyLimitUsd: 100.0,
    enforcementMode: BudgetEnforcementMode.WARN,
  },
});

// Use chat completions with cost tracking
const response = await client.chat.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(`Cost: $${client.getTotalCost().toFixed(6)}`);
```

## API Reference

### Chat Completions
- `chat.create(params)` — Send chat completion request (streaming or non-streaming)

### Invoice Reconciliation
- `reconcileInvoice(invoice)` — Reconcile a single invoice
- `batchReconcileInvoices(invoices)` — Batch reconcile up to 100 invoices
- `parseInvoice(invoice)` — Parse invoice content

### Close Packs
- `generateClosePack(data)` — Generate a close pack
- `getClosePackHistory(limit)` — Get close pack history
- `exportClosePack(packId, format)` — Export a close pack

### Budget Enforcement
- `checkBudget(budgetData)` — Check budget compliance
- `configureBudget(budgetConfig)` — Configure budget settings
- `getBudgetStatus(team)` — Get budget status for a team

### Cost Allocation
- `allocateCosts(allocationData)` — Allocate costs across departments
- `createAllocationRules(rules)` — Create cost allocation rules
- `getCostAllocationDashboard(costCenter, period)` — Get allocation dashboard
- `chargebackInvoice(invoiceData)` — Generate chargeback invoice
- `generateShowback(showbackData)` — Generate showback report

### Data Residency
- `getDataResidencyRegion()` — Get current region
- `setDataResidencyRegion(regionData)` — Set data residency region
- `validateDataTransfer(transferData)` — Validate data transfer compliance
- `getDataResidencyReport()` — Get compliance report

### Infrastructure
- `getInfraHealth()` — Get infrastructure health status

### Observability
- `recordObservability(data)` — Record observability data
- `getObservabilityMetrics(period)` — Get observability metrics
- `getObservabilityTraces(format)` — Get observability traces

### ROI Measurement
- `trackOutcome(outcomeData)` — Track ROI outcome
- `getRoiDashboard(period)` — Get ROI dashboard
- `getRoiByProject(months)` — Get ROI by project
- `benchmarkRoi(benchmarkData)` — Benchmark ROI performance

### Benchmark Platform
- `getBenchmarkReport()` — Get benchmark report
- `getBenchmarkLeaderboard(industry, metric)` — Get leaderboard
- `submitBenchmark(benchmarkData)` — Submit benchmark data
- `getBenchmarkInsights(industry)` — Get insights
- `getBenchmarkMaturity()` — Get maturity assessment

### Cost Tracking & Budget Management
- `getTotalCost()` — Get total accumulated cost
- `getCostsByModel()` — Get costs grouped by model
- `getCostsByProject()` — Get costs grouped by project
- `getCostHistory(limit)` — Get cost history
- `getRemainingBudget()` — Get remaining budget
- `getBudgetUsagePercent()` — Get budget usage percentage
- `setCostTags(costCenter, project)` — Update cost tracking tags
- `onBudgetWarning(callback)` — Register warning callback
- `onBudgetExceeded(callback)` — Register exceeded callback
- `onBudgetSoftLimit(callback)` — Register soft limit callback

## Authentication

All API calls require a JWT token. Pass your API key when initializing the client:

```typescript
const client = new Finault({
  apiKey: 'your-api-key-here',
});
```

Or set the `OPENAI_API_KEY` environment variable.

## Budget Enforcement

Configure budget enforcement to control spending:

```typescript
const client = new Finault({
  budgetConfig: {
    monthlyLimitUsd: 1000.0,
    enforcementMode: BudgetEnforcementMode.HARD_LIMIT,
    warningThresholdPercent: 80,
  },
});

client.onBudgetWarning((current, limit) => {
  console.warn(`Budget warning: ${(current / limit * 100).toFixed(1)}% used`);
});
```

## License

MIT
