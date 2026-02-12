# Finault SDK for Java

Official Java SDK for the Finault AgentOS platform. Provides cost tracking, budget enforcement, and advanced governance features for LLM applications.

## Installation

Maven:
```xml
<dependency>
    <groupId>com.finault</groupId>
    <artifactId>finault-sdk</artifactId>
    <version>1.0.0</version>
</dependency>
```

Gradle:
```gradle
implementation 'com.finault:finault-sdk:1.0.0'
```

## Quick Start

```java
import com.finault.sdk.FinaultClient;
import com.finault.sdk.FinaultClient.ChatMessage;
import com.finault.sdk.FinaultClient.BudgetConfig;
import java.util.List;

public class Example {
    public static void main(String[] args) {
        FinaultClient client = FinaultClient.builder()
            .apiKey("your-api-key")
            .costCenter("engineering")
            .project("chatbot")
            .budgetConfig(new BudgetConfig(100.0))
            .build();

        // Use chat completions with cost tracking
        var response = client.chat(
            List.of(new ChatMessage("user", "Hello!")),
            "gpt-3.5-turbo"
        );

        System.out.printf("Cost: $%.6f%n", client.getTotalCost());
    }
}
```

## API Reference

### Chat Completions
- `chat(messages, model)` — Send chat completion request
- `chat(messages, model, temperature, maxTokens, userId)` — Chat with options

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
- `getCostHistory()` — Get cost history
- `getRemainingBudget()` — Get remaining budget
- `getBudgetUsagePercent()` — Get budget usage percentage
- `setCostTags(costCenter, project)` — Update cost tracking tags
- `addBudgetListener(listener)` — Register budget listener

## Authentication

All API calls require an API key. Pass it when creating the client:

```java
FinaultClient client = FinaultClient.builder()
    .apiKey("your-api-key")
    .build();
```

Or set the `OPENAI_API_KEY` environment variable.

## Budget Enforcement

Configure budget enforcement to control spending:

```java
BudgetConfig config = new BudgetConfig(
    1000.0,
    BudgetEnforcementMode.HARD_LIMIT,
    80.0,
    100.0,
    1
);

FinaultClient client = FinaultClient.builder()
    .apiKey("your-api-key")
    .budgetConfig(config)
    .build();

client.addBudgetListener(new FinaultClient.BudgetListener() {
    @Override
    public void onWarning(double current, double limit) {
        double percent = (current / limit * 100);
        System.out.printf("Budget warning: %.1f%% used%n", percent);
    }

    @Override
    public void onHardLimit(double current, double limit) {
        System.out.printf("Hard limit exceeded: $%.2f > $%.2f%n", current, limit);
    }

    @Override
    public void onSoftLimit(double current, double limit) {
        // Handle soft limit
    }
});
```

## License

MIT
