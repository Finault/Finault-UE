# Finault SDK for Go

Official Go SDK for the Finault AgentOS platform. Provides cost tracking, budget enforcement, and advanced governance features for LLM applications.

## Installation

```bash
go get github.com/finault/go-sdk
```

## Quick Start

```go
package main

import (
	"fmt"
	"github.com/finault/go-sdk/finault"
)

func main() {
	client, err := finault.NewClient("your-api-key",
		finault.WithCostCenter("engineering"),
		finault.WithProject("chatbot"),
	)
	if err != nil {
		panic(err)
	}

	// Use chat completions with cost tracking
	response, err := client.Chat(
		[]finault.ChatCompletionMessage{
			{Role: "user", Content: "Hello!"},
		},
		map[string]interface{}{"model": "gpt-3.5-turbo"},
	)
	if err != nil {
		panic(err)
	}

	fmt.Printf("Cost: $%.6f\n", client.GetTotalCost())
}
```

## API Reference

### Chat Completions
- `Chat(messages, options)` — Send chat completion request
- `ChatStream(messages, options)` — Send streaming chat completion request

### Invoice Reconciliation
- `ReconcileInvoice(invoice)` — Reconcile a single invoice
- `BatchReconcileInvoices(invoices)` — Batch reconcile up to 100 invoices
- `ParseInvoice(invoice)` — Parse invoice content

### Close Packs
- `GenerateClosePack(data)` — Generate a close pack
- `GetClosePackHistory(limit)` — Get close pack history
- `ExportClosePack(packID, format)` — Export a close pack

### Budget Enforcement
- `CheckBudget(budgetData)` — Check budget compliance
- `ConfigureBudget(budgetConfig)` — Configure budget settings
- `GetBudgetStatus(team)` — Get budget status for a team

### Cost Allocation
- `AllocateCosts(allocationData)` — Allocate costs across departments
- `CreateAllocationRules(rules)` — Create cost allocation rules
- `GetCostAllocationDashboard(costCenter, period)` — Get allocation dashboard
- `ChargebackInvoice(invoiceData)` — Generate chargeback invoice
- `GenerateShowback(showbackData)` — Generate showback report

### Data Residency
- `GetDataResidencyRegion()` — Get current region
- `SetDataResidencyRegion(regionData)` — Set data residency region
- `ValidateDataTransfer(transferData)` — Validate data transfer compliance
- `GetDataResidencyReport()` — Get compliance report

### Infrastructure
- `GetInfraHealth()` — Get infrastructure health status

### Observability
- `RecordObservability(data)` — Record observability data
- `GetObservabilityMetrics(period)` — Get observability metrics
- `GetObservabilityTraces(format)` — Get observability traces

### ROI Measurement
- `TrackOutcome(outcomeData)` — Track ROI outcome
- `GetRoiDashboard(period)` — Get ROI dashboard
- `GetRoiByProject(months)` — Get ROI by project
- `BenchmarkRoi(benchmarkData)` — Benchmark ROI performance

### Benchmark Platform
- `GetBenchmarkReport()` — Get benchmark report
- `GetBenchmarkLeaderboard(industry, metric)` — Get leaderboard
- `SubmitBenchmark(benchmarkData)` — Submit benchmark data
- `GetBenchmarkInsights(industry)` — Get insights
- `GetBenchmarkMaturity()` — Get maturity assessment

### Cost Tracking & Budget Management
- `GetTotalCost()` — Get total accumulated cost
- `GetCostsByModel()` — Get costs grouped by model
- `GetCostsByProject()` — Get costs grouped by project
- `GetCostHistory(limit)` — Get cost history
- `GetRemainingBudget()` — Get remaining budget
- `GetBudgetUsagePercent()` — Get budget usage percentage
- `SetCostTags(costCenter, project)` — Update cost tracking tags
- `OnBudgetWarning(callback)` — Register warning callback
- `OnBudgetExceeded(callback)` — Register exceeded callback
- `OnBudgetSoftLimit(callback)` — Register soft limit callback

## Authentication

All API calls require an API key. Pass it when creating the client:

```go
client, err := finault.NewClient("your-api-key")
```

Or set the `FINAULT_API_KEY` environment variable.

## Budget Enforcement

Configure budget enforcement to control spending:

```go
client, err := finault.NewClient(
	"your-api-key",
	finault.WithBudgetConfig(finault.BudgetConfig{
		MonthlyLimitUSD:         1000.0,
		EnforcementMode:         finault.HardLimit,
		WarningThresholdPercent: 80,
	}),
)
if err != nil {
	panic(err)
}

client.OnBudgetWarning(func(current, limit float64) {
	percent := (current / limit * 100)
	fmt.Printf("Budget warning: %.1f%% used\n", percent)
})
```

## License

MIT
