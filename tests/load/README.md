# Finault Enterprise Load Test Suite

Production-grade load testing framework for the Finault platform, simulating real-world scenarios at scale.

## Overview

The load test suite evaluates the performance and reliability of Finault's core modules under stress conditions:

- **Invoice Ingestion Burst**: 10K invoices in 60 seconds
- **Concurrent Team Close**: 50 teams generating close packs simultaneously
- **Gateway Throughput**: 1000 concurrent cost prediction requests
- **Reconciliation at Scale**: 5000 invoice + 5000 usage records with 3-pass reconciliation
- **Budget Enforcement Under Load**: 100 budget checks per second across 50 budgets

## Quick Start

### Prerequisites

- Node.js 16+ (with ES modules support)
- Access to Finault platform modules
- Optional: Supabase instance (defaults to test configuration)

### Running the Tests

```bash
# Run all scenarios
node tests/load/load-test.js

# Run with custom Supabase configuration
SUPABASE_URL="https://your-project.supabase.co" \
SUPABASE_KEY="your-api-key" \
node tests/load/load-test.js

# Run with verbose output (if logging enabled)
LOG_LEVEL=debug node tests/load/load-test.js
```

### Exit Codes

- `0`: All scenarios passed SLA thresholds
- `1`: One or more scenarios failed or exceeded SLA limits

## Architecture

### MetricsCollector

Tracks latency measurements and calculates statistical metrics:

- **Count**: Total operations
- **Min/Max**: Minimum and maximum latencies
- **Mean**: Average latency
- **P50/P95/P99**: Percentile latencies
- **Stddev**: Standard deviation
- **Throughput**: Operations per second

```javascript
const metrics = new MetricsCollector();
metrics.startTimer();
// ... execute operations ...
metrics.endTimer();
const stats = metrics.calculate();
```

### LoadTestRunner

Orchestrates all scenarios and evaluates results against SLAs:

```javascript
class LoadTestRunner {
  // SLA thresholds
  slaThresholds = {
    p99Latency: 500,      // milliseconds
    throughput: 100,      // operations/second
    errorRate: 1,         // percentage
    memory: 512,          // megabytes
  };
}
```

## Scenario Details

### Scenario 1: Invoice Ingestion Burst

**Objective**: Validate invoice processing throughput under burst load.

**Configuration**:
- Total invoices: 10,000
- Time window: 60 seconds
- Batch size: 100
- Realistic invoice generation (variable line items, multiple providers)

**Key Metrics**:
- Throughput (invoices/sec)
- P99 latency
- Error rate
- Memory footprint

**SLA Targets**:
- P99 latency < 500ms
- Throughput > 100 invoices/sec
- Error rate < 1%
- Memory < 512MB

**Implementation Details**:
- Uses `InvoiceDiamondModule.processInvoiceFile()`
- Generates realistic invoices with:
  - Multiple cloud providers (AWS, Azure, GCP, OpenAI, Anthropic)
  - Variable line item counts (5-25 items)
  - Dynamic pricing (realistic cost ranges)
  - Currency and period metadata
- Processes in batches to avoid resource exhaustion
- Tracks individual latencies for percentile analysis

### Scenario 2: Concurrent Team Close

**Objective**: Validate close pack generation under concurrent load.

**Configuration**:
- Team count: 50
- Line items per team: 200
- Total line items: 10,000

**Key Metrics**:
- Close pack generation time
- Concurrent execution time
- Memory footprint
- Error rate

**Implementation Details**:
- Uses `ClosePackDiamondModule.executeEnhancedCloseWorkflow()`
- Generates close pack data with:
  - Realistic line item descriptions
  - Variable amounts (realistic cost ranges)
  - Artifact generation for watermarking/blockchain
- Executes all 50 teams in parallel
- Measures end-to-end close pack generation

### Scenario 3: Gateway Throughput

**Objective**: Validate gateway cost prediction endpoint throughput.

**Configuration**:
- Concurrent requests: 1,000
- Request type: Cost prediction

**Key Metrics**:
- Requests per second
- P99 latency
- Error rate
- Memory footprint

**Implementation Details**:
- Mocks cost prediction requests (200ms max latency per request)
- Simulates realistic prediction responses
- Measures gateway throughput capacity
- Identifies rate limiting behavior

### Scenario 4: Reconciliation at Scale

**Objective**: Validate invoice-to-usage reconciliation accuracy and performance at scale.

**Configuration**:
- Invoice records: 5,000
- Usage records: 5,000
- Reconciliation passes: 3
- Providers: AWS, Azure, GCP (evenly distributed)

**Key Metrics**:
- Reconciliation time per pass
- Match accuracy (95% target)
- Unmatched records
- Memory footprint

**Implementation Details**:
- Uses `ReconciliationDiamondModule` API (or equivalent)
- Creates realistic records with:
  - Provider distribution
  - Date-based grouping
  - Random amounts for variance
- Executes 3 reconciliation passes
- Groups by provider for matching
- Measures overall accuracy

### Scenario 5: Budget Enforcement Under Load

**Objective**: Validate budget checks maintain enforcement under sustained load.

**Configuration**:
- Budget count: 50
- Checks per second: 100
- Duration: 10 seconds
- Total checks: 1,000

**Key Metrics**:
- Checks per second throughput
- P99 latency
- Enforcement accuracy
- Alerts triggered

**SLA Targets**:
- Error rate < 1%
- Enforcement accuracy = 100%
- P99 latency < 500ms

**Implementation Details**:
- Simulates budget enforcement checks
- Distributes checks across 50 budgets
- Mocks spend amounts (realistic ranges)
- Tracks budget exceeded conditions
- Counts triggered alerts
- Enforces rate limiting (100 checks/sec)

## Performance Baseline

Expected baseline performance on standard infrastructure:

| Scenario | Metric | Target | Actual |
|----------|--------|--------|--------|
| Invoice Burst | Throughput | 100+ invoices/sec | TBD |
| Invoice Burst | P99 Latency | <500ms | TBD |
| Team Close | Concurrent Time | <10s for 50 teams | TBD |
| Team Close | Memory | <512MB | TBD |
| Gateway | Requests/sec | 1000+ | TBD |
| Gateway | P99 Latency | <500ms | TBD |
| Reconciliation | Accuracy | >95% match | TBD |
| Reconciliation | Time | <30s for 10K records | TBD |
| Budget | Checks/sec | 100+ | TBD |
| Budget | Enforcement Accuracy | 100% | TBD |

## Output Format

### Console Output

```
========================================
Finault Enterprise Load Test Suite
========================================

[RUNNING] Invoice Ingestion Burst...
[PASS] Invoice Ingestion Burst

[RUNNING] Concurrent Team Close...
[PASS] Concurrent Team Close

...

========================================
DETAILED LOAD TEST RESULTS
========================================

INVOICE INGESTION BURST
─────────────────────────
scenario: Invoice Ingestion Burst
totalInvoices: 10000
duration: 60.234
latency:
  count: 10000
  min: 45
  max: 1250
  mean: 234.56
  p50: 200
  p95: 450
  p99: 890
  stddev: 156.23
  throughput: 166.04 ops/sec
errorCount: 2
errorRate: 0.02
memoryMB: 245.67
...

========================================
SUMMARY
========================================

Total Scenarios: 5
Passed: 5
Failed: 0
Success Rate: 100.0%

SLA Thresholds:
  p99 Latency: 500ms
  Throughput: 100 ops/sec
  Error Rate: 1%
  Memory: 512MB
```

## Extending the Suite

### Adding New Scenarios

1. Create a new scenario method in `LoadTestRunner`:

```javascript
async scenario6MyScenario() {
  const metrics = new MetricsCollector();
  metrics.startTimer();

  // Run test operations
  const result = await myModule.operation();
  metrics.recordMeasurement(Date.now() - startTime);

  metrics.endTimer();

  return {
    scenario: 'My Scenario',
    duration: metrics.calculate().duration / 1000,
    latency: metrics.calculate(),
    // ... other metrics
  };
}
```

2. Add scenario to `runAllScenarios()`:

```javascript
const scenarios = [
  // ... existing scenarios
  { name: 'My Scenario', fn: () => this.scenario6MyScenario() },
];
```

3. Implement any necessary mock/utility functions

### Customizing SLA Thresholds

Modify `this.slaThresholds` in the `LoadTestRunner` constructor:

```javascript
this.slaThresholds = {
  p99Latency: 300,      // Lower threshold
  throughput: 200,      // Higher requirement
  errorRate: 0.5,       // Stricter error rate
  memory: 256,          // Reduced memory limit
};
```

## Testing in Different Environments

### Local Development

```bash
# With minimal data
node tests/load/load-test.js
```

### Staging Environment

```bash
SUPABASE_URL="https://staging.supabase.co" \
SUPABASE_KEY="staging-key" \
node tests/load/load-test.js
```

### Production Validation

```bash
# Use production Supabase (careful with real data!)
SUPABASE_URL="https://production.supabase.co" \
SUPABASE_KEY="production-key" \
node tests/load/load-test.js
```

## Troubleshooting

### High Memory Usage

If memory exceeds SLA:
- Reduce `batchSize` in scenario 1
- Check for memory leaks in module implementations
- Monitor garbage collection with `--trace-gc` flag

```bash
node --trace-gc tests/load/load-test.js
```

### High Latency

If P99 latency exceeds SLA:
- Check network connectivity to Supabase
- Review module processing logic
- Profile with `--prof` flag

```bash
node --prof tests/load/load-test.js
# Analyze with: node --prof-process isolate-*.log
```

### High Error Rate

If error rate exceeds SLA:
- Check module initialization
- Verify environment variables are correct
- Review error logs in detailed output
- Enable debug logging

```bash
LOG_LEVEL=debug node tests/load/load-test.js
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Load Tests

on: [push, pull_request]

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: |
          SUPABASE_URL=${{ secrets.TEST_SUPABASE_URL }} \
          SUPABASE_KEY=${{ secrets.TEST_SUPABASE_KEY }} \
          node tests/load/load-test.js
```

## Performance Monitoring

### Memory Profiling

```bash
node --max-old-space-size=4096 tests/load/load-test.js
```

### CPU Profiling

```bash
node --prof tests/load/load-test.js
node --prof-process isolate-*.log > profile.txt
```

### Network Monitoring

```bash
# Monitor network requests to Supabase
node tests/load/load-test.js 2>&1 | grep -i "fetch\|http"
```

## Best Practices

1. **Run Baseline First**: Establish baseline metrics before making changes
2. **Isolate Variables**: Test one change at a time
3. **Monitor Resources**: Watch CPU, memory, and disk during tests
4. **Review Errors**: Investigate all failures, even if error rate is within SLA
5. **Document Results**: Track performance trends over time
6. **Version Control**: Keep load test configuration in sync with code

## References

- InvoiceDiamondModule: `platform/modules/invoice-diamond.js`
- ClosePackDiamondModule: `platform/modules/closepack-diamond.js`
- GatewayDiamondModule: `platform/modules/gateway-diamond.js`
- ReconciliationDiamondModule: `platform/modules/reconciliation-diamond.js`
- BudgetDiamondModule: `platform/modules/budget-diamond.js`

## Support

For issues or questions about the load test suite:
1. Check the troubleshooting section
2. Review module documentation
3. File an issue with detailed error logs and environment info
