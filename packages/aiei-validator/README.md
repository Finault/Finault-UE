# @finault/aiei-validator

Open-source validator for **AIEI** (AI Inference Economic Identity) receipts. Validates the structure, integrity, and business logic of AIEI receipts with full cryptographic verification support.

## What is AIEI?

AIEI is a standardized receipt format that captures the complete economic identity of an LLM inference call:

- **WHO**: Organization, customer, and user context
- **WHAT**: Technical details (model, tokens, latency)
- **WORTH**: Cost and revenue metrics
- **RULES**: Governance and policy constraints
- **PROOF**: Cryptographic verification (hashes, timestamps)

## Installation

```bash
npm install @finault/aiei-validator
```

## Quick Start

```typescript
import { validateReceipt, AIEIValidator } from '@finault/aiei-validator';

// Validate a receipt
const result = validateReceipt({
  receipt_id: 'rcpt_live_abc123',
  who: {
    org_id: 'org_123',
    customer_id: 'cust_456',
    user_id: 'user_789'
  },
  what: {
    model: 'gpt-4',
    provider: 'openai',
    tokens_in: 1200,
    tokens_out: 450,
    latency_ms: 2345
  },
  worth: {
    cost: 0.025,
    revenue: 0.075,
    margin: 0.050
  },
  proof: {
    receipt_hash: 'sha256_abcd1234...',
    timestamp: '2024-03-20T10:30:00Z'
  }
});

if (result.valid) {
  console.log('Receipt is valid!');
} else {
  console.log('Errors:', result.errors);
}
```

## API Reference

### `validateReceipt(receipt: any): ValidationResult`

Validates a complete AIEI receipt against the full schema.

**Parameters:**
- `receipt`: The receipt object to validate
- `minimal` (optional): If true, uses minimal schema (default: false)

**Returns:**
```typescript
{
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  receipt?: AIEIReceipt;  // Parsed receipt if valid
}
```

**Example:**
```typescript
const result = validateReceipt(myReceipt);
if (!result.valid) {
  result.errors.forEach(err => {
    console.log(`${err.field}: ${err.message}`);
  });
}
```

### `validateChain(receipts: any[]): ChainValidationResult`

Validates a chain of receipts for integrity. Each receipt's `chain_hash` must match the previous receipt's `receipt_hash`.

**Returns:**
```typescript
{
  valid: boolean;
  total_receipts: number;
  valid_receipts: number;
  invalid_receipts: number;
  chain_broken_at?: number;  // Index where chain broke
  errors: string[];
}
```

**Example:**
```typescript
const result = AIEIValidator.validateChain(receipts);
if (!result.valid) {
  console.log(`Chain broken at receipt ${result.chain_broken_at}`);
}
```

### `computeReceiptHash(receipt: any): string`

Computes the SHA-256 hash of a receipt (excluding the proof field).

**Returns:** SHA-256 hash as string (format: `sha256_<64_hex_chars>`)

**Example:**
```typescript
const hash = computeReceiptHash(receipt);
console.log(hash); // 'sha256_abcd1234...'
```

### `verifyReceiptHash(receipt: any): boolean`

Verifies that a receipt's `proof.receipt_hash` matches the computed hash.

**Example:**
```typescript
const isValid = verifyReceiptHash(receipt);
console.log(isValid); // true or false
```

## AIEI Receipt Schema

### Structure Overview

```typescript
interface AIEIReceipt {
  receipt_id: string;      // Unique ID (rcpt_live_xxx or rcpt_test_xxx)
  who: AIEIWho;           // Identity & authorization
  what: AIEIWhat;         // Technical details
  worth: AIEIWorth;       // Financial metrics
  rules?: AIEIRules;      // Governance (optional)
  proof: AIEIProof;       // Cryptographic proof
  metadata?: object;      // Additional info (optional)
}
```

### WHO Section (Identity & Authorization)

**Required fields:**
- `org_id`: Organization identifier
- `customer_id`: Customer for billing
- `user_id`: End user who triggered the call

**Optional fields:**
- `session_id`: Session tracking ID
- `api_key_prefix`: Masked API key (e.g., `fk_live_xxx`)

```typescript
who: {
  org_id: 'org_123',
  customer_id: 'cust_456',
  user_id: 'user_789',
  session_id: 'sess_abc',
  api_key_prefix: 'fk_live_xyz'
}
```

### WHAT Section (Technical Details)

**Required fields:**
- `model`: Model identifier (e.g., `gpt-4`, `claude-3-opus`)
- `provider`: Provider name (`openai`, `anthropic`, `google`, etc.)
- `tokens_in`: Input tokens
- `tokens_out`: Output tokens
- `latency_ms`: Inference latency in milliseconds

**Optional fields:**
- `temperature`: Temperature parameter (0-2)
- `max_tokens`: Maximum tokens limit
- `cache_hit`: Whether response was cached

```typescript
what: {
  model: 'gpt-4',
  provider: 'openai',
  tokens_in: 1200,
  tokens_out: 450,
  latency_ms: 2345,
  temperature: 0.7,
  max_tokens: 500,
  cache_hit: false
}
```

### WORTH Section (Financial Metrics)

**Required fields:**
- `cost`: Cost in USD (computed if not provided)

**Optional fields:**
- `revenue`: Revenue attributed to this call
- `margin`: Profit margin (computed if cost and revenue present)
- `cost_center`: Cost center for allocation

```typescript
worth: {
  cost: 0.025,           // $0.025
  revenue: 0.075,        // $0.075
  margin: 0.050,         // $0.050 (revenue - cost)
  cost_center: 'eng'
}
```

### RULES Section (Governance & Policies)

**All optional:**
- `budget_limit`: Budget limit for customer
- `policy`: Policy name that governed this call
- `tags`: Custom categorization tags

```typescript
rules: {
  budget_limit: 1000.00,
  policy: 'standard_inference',
  tags: {
    app: 'chatbot',
    team: 'product',
    priority: 'normal'
  }
}
```

### PROOF Section (Cryptographic Verification)

**Required fields:**
- `receipt_hash`: SHA-256 hash of receipt (excluding this field)
- `timestamp`: ISO 8601 timestamp

**Optional fields:**
- `chain_hash`: Hash of previous receipt (for chain integrity)
- `signature`: Digital signature
- `nonce`: Replay protection nonce

```typescript
proof: {
  receipt_hash: 'sha256_a1b2c3d4e5f6...',
  timestamp: '2024-03-20T10:30:00Z',
  chain_hash: 'sha256_f6e5d4c3b2a1...',
  signature: 'sig_...',
  nonce: 'nonce_...'
}
```

## Examples

### Example 1: Basic Receipt Validation

```typescript
import { validateReceipt } from '@finault/aiei-validator';

const receipt = {
  receipt_id: 'rcpt_live_xyz789',
  who: {
    org_id: 'org_acme',
    customer_id: 'cust_acme_001',
    user_id: 'alice@acme.com'
  },
  what: {
    model: 'gpt-4-turbo',
    provider: 'openai',
    tokens_in: 850,
    tokens_out: 320,
    latency_ms: 1200
  },
  worth: {
    cost: 0.0085
  },
  proof: {
    receipt_hash: 'sha256_...',
    timestamp: '2024-03-20T14:30:00Z'
  }
};

const result = validateReceipt(receipt);
console.log(result.valid);  // true
```

### Example 2: Chain Validation

```typescript
import { AIEIValidator } from '@finault/aiei-validator';

const receipts = [
  { receipt_id: 'rcpt_1', ..., proof: { receipt_hash: 'hash1', timestamp: '...' } },
  { receipt_id: 'rcpt_2', ..., proof: { receipt_hash: 'hash2', chain_hash: 'hash1', timestamp: '...' } },
  { receipt_id: 'rcpt_3', ..., proof: { receipt_hash: 'hash3', chain_hash: 'hash2', timestamp: '...' } }
];

const result = AIEIValidator.validateChain(receipts);
if (result.valid) {
  console.log('All receipts form a valid chain');
} else {
  console.log(`Chain broken at receipt ${result.chain_broken_at}`);
}
```

### Example 3: Hash Verification

```typescript
import { computeReceiptHash, verifyReceiptHash } from '@finault/aiei-validator';

// Verify hash matches
const isValid = verifyReceiptHash(receipt);
console.log(isValid);  // true

// Recompute hash
const computedHash = computeReceiptHash(receipt);
console.log(computedHash === receipt.proof.receipt_hash);  // true
```

### Example 4: Detailed Error Handling

```typescript
const result = validateReceipt(malformedReceipt);

if (!result.valid) {
  console.log(`Validation failed with ${result.errors.length} errors:`);

  result.errors.forEach(error => {
    console.log(`- [${error.field}] ${error.message}`);
    if (error.value !== undefined) {
      console.log(`  Value: ${JSON.stringify(error.value)}`);
    }
  });

  result.warnings.forEach(warning => {
    console.log(`⚠️  ${warning}`);
  });
}
```

## Exported Schemas

### `AIEI_SCHEMA`

Full JSON Schema for strict validation (includes all field descriptions, patterns, and constraints).

```typescript
import { AIEI_SCHEMA } from '@finault/aiei-validator';

// Use with your JSON Schema validator
const ajv = new Ajv();
const validate = ajv.compile(AIEI_SCHEMA);
```

### `AIEI_SCHEMA_MINIMAL`

Minimal schema with only required fields (faster validation).

## Integration Examples

### With OpenAI SDK

```typescript
import OpenAI from 'openai';
import { finault } from '@finault/sdk';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const wrapped = finault.wrap(openai);

const response = await wrapped.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
});
// Receipt automatically created and validated
```

### With Anthropic SDK

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { finault } from '@finault/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const wrapped = finault.wrap(anthropic);

const response = await wrapped.messages.create({
  model: 'claude-3-opus-20240229',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }]
});
// Receipt automatically created and validated
```

## Validation Rules

### Field Constraints

| Field | Type | Min | Max | Pattern |
|-------|------|-----|-----|---------|
| `receipt_id` | string | 1 | - | `^rcpt_(live\|test)_[a-zA-Z0-9_-]{10,}$` |
| `who.org_id` | string | 1 | - | - |
| `who.customer_id` | string | 1 | - | - |
| `who.user_id` | string | 1 | - | - |
| `what.tokens_in` | integer | 0 | - | - |
| `what.tokens_out` | integer | 0 | - | - |
| `what.latency_ms` | integer | 0 | - | - |
| `what.temperature` | number | 0 | 2 | - |
| `worth.cost` | number | 0 | - | - |
| `proof.receipt_hash` | string | - | - | `^sha256_[a-f0-9]{64}$` |
| `proof.timestamp` | string | - | - | ISO 8601 |

### Business Logic Checks

1. **Margin Validation**: If both `revenue` and `cost` are present, `margin` should equal `revenue - cost`
2. **Token Validation**: Both `tokens_in` and `tokens_out` must be non-negative
3. **Cost Validation**: Cost must be non-negative and match token pricing
4. **Chain Integrity**: Each receipt's `chain_hash` must match previous receipt's `receipt_hash`

## Error Types

### ValidationError

```typescript
interface ValidationError {
  field: string;           // Path to invalid field (e.g., "who.org_id")
  message: string;         // Human-readable error message
  value?: any;            // The invalid value (if applicable)
}
```

### Common Errors

- `Missing required field`: Field is required but not present
- `Must be a [type]`: Field has wrong type
- `Must be non-empty`: String is empty
- `Must be non-negative`: Number is negative
- `Must match pattern`: String doesn't match required format
- `Chain broken at receipt X`: Chain integrity failure

## Performance

- **Validation**: < 1ms for typical receipts
- **Hash Computation**: < 2ms for typical receipts
- **Chain Validation**: O(n) for n receipts

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR on the GitHub repository.

## Security

For security issues, please email security@finault.ai instead of using the issue tracker.
