# Finault SDK for Node.js

Official Node.js SDK for [Finault](https://finault.ai) - AI Cost Governance Platform

## Features

- Zero dependencies (uses native fetch)
- Full TypeScript support with comprehensive types
- Automatic retry logic with exponential backoff
- Streaming support for chat completions
- AbortController support for request cancellation
- Built-in error handling with typed exceptions
- Production-ready and thoroughly tested

## Installation

```bash
npm install @finault/sdk
```

Requires Node.js 18 or higher.

## Quick Start

### Initialize the Client

```typescript
import Finault from '@finault/sdk';

const finault = new Finault({ apiKey: 'fk_live_...' });
```

### Route AI Requests Through Finault

```typescript
const response = await finault.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'What is machine learning?' }],
  providerApiKey: 'sk-...', // Your OpenAI API key
});

console.log(`Response: ${response.content}`);
console.log(`Cost: $${response.cost}`);
console.log(`Tokens: ${response.tokens}`);
console.log(`Request ID: ${response.requestId}`);
```

### Stream Chat Completions

```typescript
const stream = await finault.chat.completions.createStream({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Write a poem about AI' }],
  providerApiKey: 'sk-...',
});

for await (const chunk of stream) {
  process.stdout.write(chunk.delta.content || '');
}
```

## Budget Management

### Create a Budget

```typescript
const budget = await finault.budgets.create({
  name: 'GPT-4 Monthly Budget',
  limit: 1000.0,
  period: 'monthly',
});

console.log(`Budget ID: ${budget.id}`);
```

### List Budgets

```typescript
const budgets = await finault.budgets.list();
for (const budget of budgets) {
  console.log(`${budget.name}: $${budget.spent}/${budget.limit}`);
  console.log(`Utilization: ${budget.utilizationPercent.toFixed(1)}%`);
  console.log(`Remaining: $${budget.remaining}`);
}
```

### Get Budget Details

```typescript
const budget = await finault.budgets.get('budget_123');
console.log(`Status: ${budget.status}`);
console.log(`Alert count: ${budget.alerts.length}`);
```

### Update a Budget

```typescript
const updated = await finault.budgets.update('budget_123', {
  limit: 2000.0,
  status: 'paused',
});
```

## Cost Anomaly Detection

### List Detected Anomalies

```typescript
const anomalies = await finault.anomalies.list();
for (const anomaly of anomalies) {
  console.log(`[${anomaly.severity}] ${anomaly.description}`);
  console.log(`Variance: ${anomaly.percentageVariance.toFixed(1)}%`);
}
```

### Filter by Severity

```typescript
const criticalAnomalies = await finault.anomalies.list({
  severity: 'critical',
});
```

### Filter by Acknowledgement

```typescript
const unacknowledged = await finault.anomalies.list({
  acknowledged: false,
});
```

### Acknowledge an Anomaly

```typescript
const anomaly = await finault.anomalies.acknowledge('anomaly_123');
console.log(`Acknowledged at: ${anomaly.acknowledgedAt}`);
```

## Financial Close Pack

### Generate a Close Pack

```typescript
const pack = await finault.closePack.generate({ period: '2026-02' });
console.log(`Period: ${pack.period}`);
console.log(`Total Spend: $${pack.totalSpend}`);
console.log(`Summary: ${pack.summary}`);
console.log(`Journal Entries: ${pack.journalEntries.length}`);
```

### List Previous Close Packs

```typescript
const packs = await finault.closePack.list({ limit: 10 });
for (const pack of packs) {
  console.log(`${pack.period}: $${pack.totalSpend} (${pack.status})`);
}
```

## API Key Management

### Create an API Key

```typescript
const key = await finault.keys.create({ name: 'Production Gateway' });
console.log(`Key ID: ${key.id}`);
// Note: The full key is only shown once upon creation
```

### List API Keys

```typescript
const keys = await finault.keys.list();
for (const key of keys) {
  console.log(`${key.name} (Preview: ${key.keyPreview})`);
}
```

### Revoke an API Key

```typescript
await finault.keys.revoke('key_123');
console.log('Key revoked successfully');
```

## Dashboard & Insights

### Get Overview Metrics

```typescript
const metrics = await finault.dashboard.overview();
console.log(`Total Spend: $${metrics.totalSpend}`);
console.log(`Trend: ${metrics.spendTrend > 0 ? '+' : ''}${metrics.spendTrend.toFixed(1)}%`);
console.log(`Requests: ${metrics.requestCount}`);
console.log(`Avg Cost/Request: $${metrics.averageCostPerRequest.toFixed(4)}`);

console.log('\nTop Models:');
for (const model of metrics.topModels) {
  console.log(`  ${model.name}: ${model.usage} calls, $${model.cost}`);
}
```

### Get Insights and Recommendations

```typescript
const insights = await finault.dashboard.insights();

console.log('Key Findings:');
for (const finding of insights.keyFindings) {
  console.log(`  - ${finding}`);
}

console.log('\nRecommendations:');
for (const rec of insights.recommendations) {
  console.log(`  - ${rec}`);
}

console.log('\nOptimization Opportunities:');
for (const opp of insights.optimizationOpportunities) {
  console.log(`  - ${opp.title}: $${opp.potentialSavings} potential savings`);
}
```

## Error Handling

```typescript
import {
  FinaultError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  APIError,
} from '@finault/sdk';

try {
  const response = await finault.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello' }],
    providerApiKey: 'sk-...',
  });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error(`Authentication failed: ${error.message}`);
    console.error(`Request ID: ${error.requestId}`);
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${error.retryAfter}s`);
  } else if (error instanceof ValidationError) {
    console.error(`Validation error: ${error.message}`);
    console.error(`Field errors: ${JSON.stringify(error.fieldErrors)}`);
  } else if (error instanceof APIError) {
    console.error(`API error: ${error.message}`);
    console.error(`Status: ${error.statusCode}`);
  } else if (error instanceof Error) {
    console.error(`Unexpected error: ${error.message}`);
  }
}
```

## Request Cancellation

Use AbortController to cancel requests:

```typescript
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  const response = await finault.chat.completions.create(
    {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      providerApiKey: 'sk-...',
    },
    { signal: controller.signal }
  );
} catch (error) {
  if (error instanceof APIError && error.message.includes('timeout')) {
    console.error('Request was cancelled or timed out');
  }
}
```

## Configuration Options

```typescript
const finault = new Finault({
  apiKey: 'fk_live_...',
  baseUrl: 'https://api.finault.ai', // Custom base URL
  timeout: 30000, // Request timeout in milliseconds (default: 30000)
  maxRetries: 3, // Automatic retry attempts for 429/5xx (default: 3)
});
```

## Retry Logic

The SDK automatically retries requests that fail with:
- 429 (Rate Limit)
- 500, 502, 503, 504 (Server Errors)

Retries use exponential backoff with a configurable base delay (default 1 second).

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import Finault, {
  ChatCompletionRequest,
  ChatCompletionResponse,
  Budget,
  Anomaly,
  DashboardOverview,
} from '@finault/sdk';

const finault = new Finault({ apiKey: 'fk_live_...' });

const request: ChatCompletionRequest = {
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
  providerApiKey: 'sk-...',
};

const response: ChatCompletionResponse = await finault.chat.completions.create(request);
const budgets: Budget[] = await finault.budgets.list();
const anomalies: Anomaly[] = await finault.anomalies.list();
const overview: DashboardOverview = await finault.dashboard.overview();
```

## API Reference

### Resources

- `finault.chat.completions.create()` - Create a chat completion
- `finault.chat.completions.createStream()` - Stream a chat completion
- `finault.closePack.generate()` - Generate a financial close pack
- `finault.closePack.list()` - List previous close packs
- `finault.budgets.create()` - Create a new budget
- `finault.budgets.list()` - List all budgets
- `finault.budgets.get()` - Get a specific budget
- `finault.budgets.update()` - Update a budget
- `finault.anomalies.list()` - List detected anomalies
- `finault.anomalies.get()` - Get specific anomaly
- `finault.anomalies.acknowledge()` - Mark anomaly as acknowledged
- `finault.keys.create()` - Create an API key
- `finault.keys.list()` - List API keys
- `finault.keys.revoke()` - Revoke an API key
- `finault.dashboard.overview()` - Get dashboard overview
- `finault.dashboard.insights()` - Get dashboard insights

## Support

For issues, questions, or feedback:
- Email: support@finault.ai
- Docs: https://docs.finault.ai
- Issues: https://github.com/finault/finault-node/issues

## License

MIT License - see LICENSE file for details
