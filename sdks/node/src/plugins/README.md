# Finault Framework Plugins

Complete integration for AI cost governance across popular frameworks.

---

## Overview

Finault framework plugins enable automatic cost tracking, margin enforcement, and attestation for:
- **LangChain** - LLM chains and tools
- **CrewAI** - Multi-agent orchestration
- **Vercel AI SDK** - Streaming + function calling

Each plugin intercepts AI calls, routes them through Finault verification, and returns standard responses with attestation.

---

## Installation

```bash
npm install @finault/sdk
```

---

## LangChain Plugin

### Basic Usage

```typescript
import { FinaultLangChainCallback } from '@finault/sdk/plugins/langchain';
import { Finault } from '@finault/sdk';
import { ChatOpenAI } from 'langchain/chat_models/openai';

const finault = new Finault({ apiKey: 'fk_...' });
const callback = new FinaultLangChainCallback({
  finaultClient: finault,
  enableCostTracking: true,
  enableAttestation: true,
  debug: true
});

const model = new ChatOpenAI({ modelName: 'gpt-4' });
const chain = model.pipe(outputParser);

const result = await chain.invoke(
  { topic: 'AI cost governance' },
  { callbacks: [callback] }
);

// Get metrics for the run
const metrics = callback.getRunMetrics(runId);
console.log('Cost:', metrics.cost);
console.log('Verification ID:', metrics.verification_id);
```

### Configuration

```typescript
interface FinaultLangChainCallback {
  finaultClient: Finault;           // Required: Finault SDK instance
  enableCostTracking?: boolean;      // Default: true
  enableMarginEnforcement?: boolean; // Default: true
  enableAttestation?: boolean;       // Default: true
  debug?: boolean;                   // Default: false
  onCostExceeded?: (cost, budget) => void;
  onMarginViolation?: (margin, threshold) => void;
}
```

### Methods

```typescript
// Get metrics for a completed run
const metrics = callback.getRunMetrics(runId);
// Returns: {
//   run_id, model, provider, status,
//   input_tokens, output_tokens, total_tokens,
//   latency_ms, attestation, cost, verification_id
// }

// Get all metrics
const allMetrics = callback.getAllMetrics();

// Get cost report
const report = callback.getCostReport();
// Returns: {
//   total_cost, total_tokens, runs, average_cost_per_run
// }

// Clear metrics
callback.clearRunMetrics(runId);
callback.clearAllMetrics();
```

### Error Handling

```typescript
const callback = new FinaultLangChainCallback({
  finaultClient: finault,
  onCostExceeded: (cost, budget) => {
    console.error(`Cost exceeded: $${cost} > $${budget}`);
    // Stop execution, alert user, etc.
  },
  onMarginViolation: (margin, threshold) => {
    console.error(`Margin violation: ${margin}% > ${threshold}%`);
    // Log incident, trigger review
  }
});
```

---

## CrewAI Plugin

### Basic Usage

```typescript
import { FinaultCrewAITool } from '@finault/sdk/plugins/crewai';
import { Finault } from '@finault/sdk';

const finault = new Finault({ apiKey: 'fk_...' });
const toolWrapper = new FinaultCrewAITool({
  finaultClient: finault,
  enableCostTracking: true,
  aggregateByAgent: true
});

// Wrap all agent tools
agent.tools = agent.tools.map(tool => toolWrapper.wrap(tool));

// Execute agent
const result = await agent.execute(task);

// Get cost report
const report = toolWrapper.generateCostReport();
console.log('Total cost:', report.total_cost);
console.log('Tools invoked:', report.tools_invoked);
```

### Agent-Level Tracking

```typescript
import { FinaultCrewAIAgent } from '@finault/sdk/plugins/crewai';

const agent = new FinaultCrewAIAgent(
  finault,
  'agent-123',
  'Research Agent'
);

// Wrap tools
const wrappedTools = agent.wrapTools(agent.tools);

// Execute
const result = await agent.execute(task);

// Record completion
agent.recordExecution({
  task_id: 'task-456',
  task_description: 'Market research',
  tools_used: ['web_search', 'news_api'],
  total_cost: 0.45,
  total_tokens: 2000
});

// Get summary
const summary = agent.getExecutionSummary();
// Returns: { agent_id, agent_name, metrics: { ... } }
```

### Configuration

```typescript
interface FinaultCrewAIConfig {
  finaultClient: Finault;
  enableCostTracking?: boolean;      // Default: true
  enableAttestation?: boolean;       // Default: true
  aggregateByAgent?: boolean;        // Default: true
  debug?: boolean;                   // Default: false
}
```

### Methods

```typescript
// Wrap a single tool
const wrappedTool = toolWrapper.wrap(tool);

// Get tool metrics
const metrics = toolWrapper.getToolMetrics('tool_name');
const allMetrics = toolWrapper.getAllToolMetrics();

// Get agent metrics
const agentMetrics = toolWrapper.getAgentMetrics('agent-123');
const allAgentMetrics = toolWrapper.getAllAgentMetrics();

// Generate report
const report = toolWrapper.generateCostReport();
// Returns: {
//   total_cost, total_tokens, tools_invoked,
//   average_cost_per_tool, tools: { ... }
// }

// Clear metrics
toolWrapper.clearMetrics();
```

---

## Vercel AI SDK Plugin

### Basic Usage

```typescript
import { finaultVercelAIMiddleware } from '@finault/sdk/plugins/vercel-ai';
import { Finault } from '@finault/sdk';
import { generateText, streamText } from 'ai';

const finault = new Finault({ apiKey: 'fk_...' });
const middleware = finaultVercelAIMiddleware(finault, {
  enableCostTracking: true,
  enableStreamTracking: true,
  enableAttestation: true
});

// Use with generateText
const { text } = await generateText({
  model: openai('gpt-4'),
  prompt: 'Explain AI governance',
  middleware
});

// Use with streamText
const result = streamText({
  model: openai('gpt-4'),
  messages: [{ role: 'user', content: 'Hello' }],
  middleware
});
```

### Streaming Usage

```typescript
import { streamText } from 'ai';
import { finaultVercelAIMiddleware } from '@finault/sdk/plugins/vercel-ai';

const middleware = finaultVercelAIMiddleware(finault);

const { toTextStream } = await streamText({
  model: openai('gpt-4'),
  messages,
  middleware
});

for await (const chunk of toTextStream()) {
  console.log(chunk);
}
```

### Configuration

```typescript
interface FinaultVercelAIConfig {
  finaultClient: Finault;
  enableCostTracking?: boolean;      // Default: true
  enableStreamTracking?: boolean;    // Default: true
  enableAttestation?: boolean;       // Default: true
  trackTools?: boolean;              // Default: true
  debug?: boolean;                   // Default: false
}
```

### Methods

```typescript
// Access metrics from middleware
const metrics = middleware.getMetrics();
const report = middleware.getUsageReport();
// Returns: {
//   total_calls, successful_calls, failed_calls,
//   total_cost, total_tokens, average_latency_ms
// }

// Clear metrics
middleware.clearMetrics();
```

### Utility Function

```typescript
import { withFinaultAttestation } from '@finault/sdk/plugins/vercel-ai';

const result = await withFinaultAttestation(
  finault,
  async () => await generateText({ model, prompt }),
  { model: 'gpt-4', provider: 'openai' }
);
```

---

## Multi-Plugin Setup

### Complete Integration

```typescript
import { Finault } from '@finault/sdk';
import { FinaultLangChainCallback } from '@finault/sdk/plugins/langchain';
import { FinaultCrewAITool } from '@finault/sdk/plugins/crewai';
import { finaultVercelAIMiddleware } from '@finault/sdk/plugins/vercel-ai';

// Initialize Finault
const finault = new Finault({ apiKey: 'fk_...' });

// LangChain callback
const langchainCallback = new FinaultLangChainCallback({
  finaultClient: finault,
  enableAttestation: true
});

// CrewAI tool wrapper
const crewaiWrapper = new FinaultCrewAITool({
  finaultClient: finault,
  enableAttestation: true
});

// Vercel AI middleware
const vercelMiddleware = finaultVercelAIMiddleware(finault, {
  enableAttestation: true
});

// Use all three in the same application
// LangChain chains use langchainCallback
// CrewAI agents use crewaiWrapper
// Vercel AI functions use vercelMiddleware
```

---

## Response Format

All plugins attach Finault attestation to responses:

```typescript
// Response with Finault attestation
{
  text: 'Model response...',
  finaultattestation: {
    verification_id: 'seal-...',
    cost: 0.025,
    seal: { seal_id, seal_hash, ... }
  }
}
```

---

## Cost Reporting

### LangChain

```typescript
const report = callback.getCostReport();
console.log(`
  Runs: ${report.runs}
  Total cost: $${report.total_cost.toFixed(4)}
  Total tokens: ${report.total_tokens}
  Average: $${report.average_cost_per_run.toFixed(4)}/run
`);
```

### CrewAI

```typescript
const report = toolWrapper.generateCostReport();
console.log(`
  Tools invoked: ${report.tools_invoked}
  Total cost: $${report.total_cost.toFixed(4)}
  Total tokens: ${report.total_tokens}
  Cost per tool: $${report.average_cost_per_tool.toFixed(4)}
`);
console.log('By tool:', report.tools);
```

### Vercel AI

```typescript
const report = middleware.getUsageReport();
console.log(`
  Calls: ${report.total_calls} (${report.successful_calls} OK, ${report.failed_calls} failed)
  Total cost: $${report.total_cost.toFixed(4)}
  Total tokens: ${report.total_tokens}
  Avg latency: ${report.average_latency_ms.toFixed(0)}ms
`);
```

---

## Error Handling

### Budget Exceeded

```typescript
const callback = new FinaultLangChainCallback({
  finaultClient: finault,
  onCostExceeded: (cost, budget) => {
    throw new Error(`Budget exceeded: $${cost} > $${budget}`);
  }
});

try {
  await chain.invoke({}, { callbacks: [callback] });
} catch (err) {
  if (err.message.includes('Budget exceeded')) {
    // Handle budget limit
  }
}
```

### Margin Violation

```typescript
const callback = new FinaultLangChainCallback({
  finaultClient: finault,
  onMarginViolation: (margin, threshold) => {
    console.warn(`Margin at ${margin}% exceeds ${threshold}% threshold`);
  }
});
```

### Verification Failures

Plugins log warnings but don't throw:

```typescript
// Check metrics after execution
const metrics = callback.getRunMetrics(runId);
if (!metrics.verification_id) {
  console.warn('Verification failed but execution succeeded');
}
```

---

## Best Practices

### 1. Enable All Safety Checks

```typescript
const plugin = new FinaultLangChainCallback({
  finaultClient: finault,
  enableCostTracking: true,      // Track costs
  enableMarginEnforcement: true, // Check margins
  enableAttestation: true,       // Generate proofs
  debug: true                    // Log activity
});
```

### 2. Handle Budget Limits

```typescript
const plugin = new FinaultLangChainCallback({
  finaultClient: finault,
  onCostExceeded: (cost, budget) => {
    // Log incident
    auditLog.warn('Budget exceeded', { cost, budget });
    // Notify user
    notifySlack(`Over budget: $${cost} > $${budget}`);
    // Stop execution
    process.exit(1);
  }
});
```

### 3. Monitor Margin Health

```typescript
const callback = new FinaultLangChainCallback({
  finaultClient: finault,
  onMarginViolation: (margin, threshold) => {
    // Alert finance team
    slack.send(`Margin violation: ${margin}% > ${threshold}%`);
    // Trigger cost review
    triggerCostOptimization();
  }
});
```

### 4. Regular Reporting

```typescript
// Daily cost summary
setInterval(() => {
  const report = callback.getCostReport();
  slack.send(`Daily AI costs: $${report.total_cost}`);
}, 24 * 60 * 60 * 1000);
```

### 5. Clear Old Metrics

```typescript
// Prevent memory leaks
setInterval(() => {
  callback.clearAllMetrics();
}, 60 * 60 * 1000); // Every hour
```

---

## Troubleshooting

### Plugin not intercept calls

- Ensure plugin is passed to callbacks/middleware
- Check that finaultClient is properly initialized
- Verify API key is correct (starts with `fk_`)

### Missing attestation in response

- Check if `enableAttestation: true` in config
- Verify Finault API is reachable
- Check Finault API key and permissions

### Cost calculations seem off

- Model pricing table is approximate
- For production: use actual provider billing
- Compare with provider invoices regularly

### High memory usage

- Clear metrics regularly
- Set debug to false in production
- Monitor with `getAllMetrics().size`

---

## Related

- [Finault SDK Documentation](../../README.md)
- [Framework Plugin Spec](./SPEC.md)
- [Cost Governance Guide](../../docs/cost-governance.md)
