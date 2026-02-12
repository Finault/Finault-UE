# Transparency Log - Quick Start Guide

Get the Transparency Log module running in 5 minutes.

## Files Overview

```
transparency-log/
├── transparency-log.js                   # Main module (REQUIRED)
├── transparency-log.test.js              # Unit tests
├── transparency-log.example.js           # API endpoint examples
├── transparency-log.migration.sql        # Supabase schema
├── TRANSPARENCY_LOG_README.md            # Full documentation
├── INTEGRATION_GUIDE.md                  # Integration walkthrough
├── CRYPTO_IMPLEMENTATION.md              # Cryptographic details
└── QUICK_START.md                        # This file
```

## Step 1: Database Setup (2 minutes)

### In Supabase Dashboard:

1. Navigate to **SQL Editor**
2. Click **New Query**
3. Copy and paste the contents of `transparency-log.migration.sql`
4. Click **Run**
5. Verify table was created:
   ```sql
   SELECT * FROM transparency_log LIMIT 0;
   ```

### Table Structure:
- `log_index`: Position in the append-only log
- `close_id`: Identifier for the close pack
- `attestation_hash`: Original attestation proof
- `leaf_hash`: Merkle tree commitment (SHA-256)
- `root_hash`: Current tree root hash
- `signature`: HMAC-SHA256 signature of tree head
- `org_id`: Organization for multi-tenancy

## Step 2: Environment Setup (1 minute)

Create `.env` file or Cloudflare Workers secrets:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
ANCHOR_PRIVATE_KEY=your-signing-key-here
```

**Get values from:**
- SUPABASE_URL: Dashboard → Settings → API → URL
- SUPABASE_KEY: Dashboard → Settings → API → anon key

## Step 3: Use the Module (2 minutes)

### Basic Usage:

```javascript
const { TransparencyLog } = require('./transparency-log');

// Initialize
const log = new TransparencyLog({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  ANCHOR_PRIVATE_KEY: process.env.ANCHOR_PRIVATE_KEY
});

// Append a close pack
const result = await log.append(
  'close-pack-id-123',
  'a1b2c3d4e5f6...',  // attestation hash
  'org-456'
);

console.log(result);
// {
//   logIndex: 0,
//   treeSize: 1,
//   rootHash: 'abc123...',
//   signature: 'xyz789...',
//   timestamp: 1707000000000
// }

// Get latest tree head
const treeHead = await log.getSignedTreeHead();
console.log(treeHead);

// Get inclusion proof
const proof = await log.getInclusionProof('close-pack-id-123');
console.log(proof);

// Verify proof client-side
const isValid = await log.verifyInclusionProof(
  proof.leafHash,
  proof.proof,
  treeHead.rootHash
);
console.log(`Proof valid: ${isValid}`);
```

## Common Operations

### Append Entry

```javascript
const result = await log.append(closeId, attestationHash, orgId);
```

**Returns**: `{logIndex, treeSize, rootHash, signature, timestamp}`

### Get Tree Head

```javascript
const head = await log.getSignedTreeHead();
```

**Returns**: `{treeSize, rootHash, signature, timestamp}`

### Get Inclusion Proof

```javascript
const proof = await log.getInclusionProof(closeId);
```

**Returns**: `{found, logIndex, leafHash, proof, treeSize, rootHash}`

### Verify Proof

```javascript
const valid = await log.verifyInclusionProof(
  proof.leafHash,
  proof.proof,
  treeHead.rootHash
);
```

**Returns**: `boolean`

### Get Log Entries

```javascript
const entries = await log.getEntries(0, 9);  // indices 0-9
```

**Returns**: Array of log entries

## API Endpoints (for Cloudflare Workers)

See `transparency-log.example.js` for full implementations.

### Append
```
POST /api/transparency/append
Body: {closeId, attestationHash, orgId}
Returns: {logIndex, treeSize, rootHash, signature, timestamp}
```

### Get Tree Head
```
GET /api/transparency/tree-head
Returns: {treeSize, rootHash, signature, timestamp}
```

### Get Proof
```
GET /api/transparency/proof/:closeId
Returns: {found, logIndex, leafHash, proof, treeSize, rootHash}
```

### Get Entries
```
GET /api/transparency/entries?start=0&end=9
Returns: Array of log entries
```

## Running Tests

```bash
# Requires Node.js 15+ or --experimental-global-webcrypto flag
node --experimental-global-webcrypto transparency-log.test.js
```

Expected output:
```
Test 1: Single leaf Merkle tree
  PASS: Single leaf root equals leaf hash

Test 2: Power-of-2 leaves (2 leaves)
  PASS: Root computed from 2 leaves
  Root: abc123...

...

Test Results: 13 passed, 0 failed
Success Rate: 100.0%
```

## Module Exports

```javascript
const {
  TransparencyLog,              // Main class
  computeLeafHash,              // Pure function
  computeMerkleRoot,            // Pure function
  hashPair,                     // Pure function
  verifyInclusionProof          // Pure function
} = require('./transparency-log');
```

## Key Features

✓ **Append-Only**: Entries can only be added, never modified
✓ **Merkle Trees**: Cryptographic commitments via SHA-256
✓ **Inclusion Proofs**: Prove a close pack is in the log
✓ **Consistency Proofs**: Prove the log only appended
✓ **Signed Tree Heads**: HMAC-SHA256 signatures for authenticity
✓ **Multi-Tenant**: Org-level isolation with RLS
✓ **Cloudflare Compatible**: Uses Web Crypto API
✓ **No Dependencies**: Pure CommonJS module

## Security Checklist

Before production:

- [ ] Store ANCHOR_PRIVATE_KEY in secure key management (AWS Secrets Manager, etc.)
- [ ] Enable Row Level Security (RLS) on transparency_log table
- [ ] Verify SUPABASE_KEY has minimal required permissions
- [ ] Set up monitoring for tree size anomalies
- [ ] Implement rate limiting on API endpoints
- [ ] Enable audit logging on the transparency_log table
- [ ] Test verification logic with real proofs
- [ ] Document backup and recovery procedures

## Troubleshooting

### "Supabase error 401: Unauthorized"
- Check SUPABASE_KEY in Supabase Dashboard → Settings → API
- Verify no typos in the key
- Ensure key has correct permissions

### "Supabase error 404: Not found"
- Run the migration SQL to create the table
- Verify table exists: `SELECT * FROM information_schema.tables WHERE table_name = 'transparency_log';`

### "Proof verification failed"
- Use latest tree head (not an old root)
- Don't modify the proof between generation and verification
- Verify you're checking the correct leafHash

### High latency on append
- Normal for large trees (O(n) tree rebuild)
- Tree size in millions will be slower
- Consider caching frequently accessed proofs

## Next Steps

1. **Read Full Documentation**: See `TRANSPARENCY_LOG_README.md`
2. **Review Cryptography**: See `CRYPTO_IMPLEMENTATION.md`
3. **Integration Guide**: See `INTEGRATION_GUIDE.md`
4. **Examples**: See `transparency-log.example.js`
5. **Run Tests**: `node --experimental-global-webcrypto transparency-log.test.js`

## Reference

**File**: `/sessions/tender-magical-babbage/mnt/Finault-Enterprise-Hardening/finault-monorepo/platform/modules/transparency-log.js`

**Class**: `TransparencyLog`

**Methods**:
- `append(closeId, attestationHash, orgId)`
- `getSignedTreeHead()`
- `getInclusionProof(closeId)`
- `getConsistencyProof(fromSize, toSize)`
- `getEntries(start, end)`
- `verifyInclusionProof(leafHash, proof, rootHash)`
- `verifyConsistencyProof(proof, fromSize, toSize, fromRoot, toRoot)`

## Support Resources

- RFC 6962: https://tools.ietf.org/html/rfc6962
- Merkle Trees: https://en.wikipedia.org/wiki/Merkle_tree
- Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- Supabase Docs: https://supabase.com/docs
- Cloudflare Workers: https://developers.cloudflare.com/workers/
