# AIEI Specification

**Atomic Immutable Event Infrastructure**

A portable, standardized specification for cryptographically verifiable records of AI execution events. AIEI enables offline verification of AI costs, margins, and quality metrics without requiring trust in a centralized platform.

## Overview

AIEI is built on these principles:

1. **Portable** - Seals can be exported and verified offline with zero external dependencies
2. **Immutable** - Each seal is cryptographically linked to the previous one (chain of custody)
3. **Transparent** - All seal contents are human-readable JSON
4. **Verifiable** - Hash-based proofs can be independently verified

## AIEI Envelope Schema

An AIEI envelope is a JSON object containing:

### Required Fields

```json
{
  "seal_id": "seal_123abc",                 // Unique identifier
  "seal_hash": "aaa...aaa",                 // SHA-256 hash (64 hex chars)
  "sequence": 1,                            // Monotonic counter
  "timestamp": "2026-03-20T12:30:45.123Z",  // ISO 8601
  "provider": "openai",                     // AI provider
  "model": "gpt-4o",                        // Model name
  "cost_usd": 0.015                         // Cost in USD
}
```

### Optional Fields

```json
{
  "prev_hash": "bbb...bbb",                 // Previous seal hash (chain link)
  "tokens_in": 150,                         // Input tokens
  "tokens_out": 75,                         // Output tokens
  "customer_id": "cust_abc123",             // End-user identifier
  "margin": 0.005,                          // Revenue margin
  "quality_score": 0.92,                    // Quality metric (0-1)
  "trace_id": "trace_xyz",                  // Multi-call trace context
  "parent_seal_id": "seal_parent",          // Parent in hierarchical trace
  "cost_method": "metered",                 // How cost was determined
  "authorization": {                        // Auth context
    "org_id": "org_finault",
    "user_id": "user_123",
    "api_key_prefix": "fk_live_1"
  }
}
```

## Chain Verification

AIEI seals form an immutable chain where each seal references the previous one:

```
Seal 0: hash=AAA, prev_hash=000
         ↓
Seal 1: hash=BBB, prev_hash=AAA
         ↓
Seal 2: hash=CCC, prev_hash=BBB
         ↓
Seal 3: hash=DDD, prev_hash=CCC
```

If any seal is modified, its hash changes, breaking the chain and making tampering detectable.

## Usage

### Verify a Single Envelope

```javascript
import { verifyEnvelope } from '@finault/aiei-spec/verify.js';

const envelope = {
  seal_id: 'seal_123',
  seal_hash: 'aaaa...aaaa',
  sequence: 1,
  timestamp: '2026-03-20T12:30:45.123Z',
  provider: 'openai',
  model: 'gpt-4o',
  cost_usd: 0.015
};

const result = await verifyEnvelope(envelope);
console.log(result);
// { seal_id: 'seal_123', valid: true, errors: [], hash_verified: true }
```

### Verify a Chain

```javascript
import { verifyChain, summarizeChain } from '@finault/aiei-spec/verify.js';

const envelopes = [
  { seal_id: 'seal_1', seal_hash: 'aaa...', sequence: 1, ... },
  { seal_id: 'seal_2', seal_hash: 'bbb...', prev_hash: 'aaa...', sequence: 2, ... },
  { seal_id: 'seal_3', seal_hash: 'ccc...', prev_hash: 'bbb...', sequence: 3, ... }
];

const chainResult = await verifyChain(envelopes);
console.log(chainResult);
// { valid: true, errors: [], envelopes_verified: 3, ... }

const summary = summarizeChain(envelopes, chainResult);
console.log(summary);
// { status: 'valid', seal_count: 3, total_cost: 0.045, ... }
```

### Node.js Usage

```javascript
const { verifyEnvelope, verifyChain } = require('@finault/aiei-spec/verify.js');

(async () => {
  const result = await verifyEnvelope(envelope);
  console.log(result);
})();
```

## Browser Usage

Works in modern browsers with no build step required:

```html
<script type="module">
  import { verifyEnvelope } from '/packages/aiei-spec/verify.js';

  const result = await verifyEnvelope(envelope);
  console.log(result);
</script>
```

## Verification Guarantees

AIEI verification checks:

1. **Envelope Format** - All required fields present and correctly typed
2. **Hash Validity** - seal_hash matches computed SHA-256 of payload
3. **Chain Integrity** - Each seal's prev_hash matches previous seal's hash
4. **Sequence Monotonicity** - Sequence numbers always increasing
5. **Timestamp Validity** - Valid ISO 8601 format

## Trace Context

For multi-call sequences (e.g., agent loops), use trace_id and parent_seal_id:

```json
{
  "seal_id": "seal_root",
  "trace_id": "trace_xyz",
  "parent_seal_id": null,  // Root of trace
  ...
}
```

Child seals reference the parent:

```json
{
  "seal_id": "seal_child",
  "trace_id": "trace_xyz",
  "parent_seal_id": "seal_root",  // Links to parent
  ...
}
```

This creates a DAG of seal dependencies for complex agentic workflows.

## Quality Scoring

Seals can include quality metrics:

```json
{
  "quality_score": 0.92,  // 0-1 numeric score
  ...
}
```

Finault interprets quality thresholds:

- **Good** (0.85-1.0): High-quality response
- **Acceptable** (0.5-0.85): Usable response
- **Bad** (0-0.5): Poor or unusable response

## Cost Methods

The `cost_method` field indicates how cost was derived:

- **estimated** - Calculated from token counts and model pricing
- **metered** - Actual metering from provider (most accurate)
- **callback** - Reported by downstream cost callback
- **fixed** - Hardcoded fixed cost for this model/provider

## Provider Support

AIEI supports any AI provider:

```
openai          - OpenAI (GPT-4, GPT-3.5, etc)
anthropic       - Anthropic (Claude)
google          - Google (Gemini)
meta            - Meta (Llama)
mistral         - Mistral
cohere          - Cohere
azure           - Azure OpenAI
custom          - Self-hosted or unknown provider
```

## Hash Algorithm

AIEI uses SHA-256 for seal hashing. The hash is computed over:

```javascript
{
  seal_id,
  sequence,
  timestamp,
  provider,
  model,
  cost_usd,
  tokens_in,
  tokens_out
}
```

This ensures any modification to core fields is detectable.

## Privacy Considerations

AIEI envelopes contain:

- Organization and user identifiers
- Model and provider information
- Cost and margin data
- Quality metrics

**Export seals carefully** - they contain sensitive financial and operational data. Consider:

1. Never export seals over unencrypted channels
2. Restrict access to seal exports to authorized parties
3. Use customer_id obfuscation if sharing across organizations
4. Consider hashing sensitive fields before external verification

## Integration with Finault

The Finault platform:

1. **Creates seals** - Automatically generates AIEI envelopes for every AI call
2. **Exports chains** - Allows customers to download complete seal chains
3. **Verifies offline** - Customers can verify exported seals without Finault
4. **Audits trails** - Seals provide immutable audit trail of AI execution

## Specifications

- **Version**: 1.0.0
- **Hash Algorithm**: SHA-256
- **Timestamp Format**: ISO 8601
- **Encoding**: JSON
- **Chain Format**: Sequential array with prev_hash links

## Examples

### Simple Cost Tracking

```json
{
  "seal_id": "seal_openai_001",
  "seal_hash": "aaaa...",
  "sequence": 1,
  "timestamp": "2026-03-20T12:00:00Z",
  "provider": "openai",
  "model": "gpt-4o",
  "cost_usd": 0.015,
  "tokens_in": 150,
  "tokens_out": 75
}
```

### With Quality and Margin

```json
{
  "seal_id": "seal_claude_001",
  "seal_hash": "bbbb...",
  "sequence": 2,
  "prev_hash": "aaaa...",
  "timestamp": "2026-03-20T12:01:00Z",
  "provider": "anthropic",
  "model": "claude-3-opus",
  "cost_usd": 0.010,
  "customer_id": "acme_corp",
  "margin": 0.005,
  "quality_score": 0.95,
  "tokens_in": 200,
  "tokens_out": 120,
  "cost_method": "metered"
}
```

### With Trace Context

```json
{
  "seal_id": "seal_agent_step_2",
  "seal_hash": "cccc...",
  "sequence": 3,
  "prev_hash": "bbbb...",
  "timestamp": "2026-03-20T12:02:00Z",
  "provider": "openai",
  "model": "gpt-3.5-turbo",
  "cost_usd": 0.002,
  "trace_id": "agent_run_xyz",
  "parent_seal_id": "seal_agent_step_1",
  "quality_score": 0.78
}
```

## Testing

Run verification tests:

```bash
node test/verify.test.js
```

## License

Part of the Finault platform. See LICENSE file.

## Contributing

Submit issues and PRs to the Finault repository.
