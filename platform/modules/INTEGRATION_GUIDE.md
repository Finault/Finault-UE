# Transparency Log Integration Guide

Complete step-by-step guide for integrating the Transparency Log module into the Finault platform.

## Quick Start

### 1. Setup Database

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `transparency-log.migration.sql`
3. Paste into SQL Editor and run
4. Verify table creation:
   ```sql
   SELECT * FROM transparency_log LIMIT 0;
   ```

### 2. Install Module

The module is CommonJS and requires no external dependencies:

```bash
# The module is self-contained and uses Web Crypto API
# No npm install needed - just copy the file to your project

cp transparency-log.js /path/to/your/project/modules/
```

### 3. Configure Environment

Create or update your `.env` file:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional: Private key for signing tree heads
# Use a secure key management service in production
ANCHOR_PRIVATE_KEY=your-private-key-here
```

For Cloudflare Workers, configure in `wrangler.toml`:

```toml
[env.production]
vars = { ENVIRONMENT = "production" }

[env.production.env]
SUPABASE_URL = "https://your-project.supabase.co"
SUPABASE_KEY = "***"
ANCHOR_PRIVATE_KEY = "***"
```

### 4. Create API Endpoints

Implement REST endpoints using the example handlers in `transparency-log.example.js`:

```javascript
const { TransparencyLog } = require('./transparency-log');

// Append endpoint
export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { closeId, attestationHash, orgId } = req.body;

    const log = new TransparencyLog({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_KEY: process.env.SUPABASE_KEY,
      ANCHOR_PRIVATE_KEY: process.env.ANCHOR_PRIVATE_KEY
    });

    try {
      const result = await log.append(closeId, attestationHash, orgId);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
```

## Integration Patterns

### Pattern 1: Post-Close Attestation

When a close pack is finalized, immediately append to transparency log:

```javascript
async function finalizeClosePack(closePack) {
  // 1. Finalize in main DB
  const saved = await db.closePacks.save(closePack);

  // 2. Compute attestation
  const attestation = await computeAttestationHash(saved);

  // 3. Append to transparency log
  const log = new TransparencyLog(env);
  const logResult = await log.append(
    saved.id,
    attestation.hash,
    saved.orgId
  );

  // 4. Store proof reference
  await db.attestations.save({
    closeId: saved.id,
    logIndex: logResult.logIndex,
    treeSize: logResult.treeSize,
    rootHash: logResult.rootHash,
    timestamp: logResult.timestamp
  });

  return { closePack: saved, attestation: logResult };
}
```

### Pattern 2: Client Verification

Allow clients to verify close pack attestations independently:

```javascript
async function verifyCloseAttestation(closeId, attestationHash) {
  const log = new TransparencyLog(env);

  // Get the proof
  const proof = await log.getInclusionProof(closeId);
  if (!proof.found) {
    return { verified: false, reason: 'Not in log' };
  }

  // Get latest tree head
  const treeHead = await log.getSignedTreeHead();

  // Verify proof
  const valid = await log.verifyInclusionProof(
    proof.leafHash,
    proof.proof,
    treeHead.rootHash
  );

  return {
    verified: valid,
    logIndex: proof.logIndex,
    treeSize: treeHead.treeSize,
    rootHash: treeHead.rootHash
  };
}
```

### Pattern 3: Continuous Auditing

Periodically audit the transparency log for anomalies:

```javascript
async function auditTransparencyLog(orgId) {
  const log = new TransparencyLog(env);

  // Get current state
  const treeHead = await log.getSignedTreeHead();

  // Check against known good state
  const lastAudit = await db.audits.getLatest(orgId);

  if (lastAudit && treeHead.treeSize < lastAudit.treeSize) {
    // CRITICAL: Log shrank!
    await alert.sendCritical({
      title: 'Transparency Log Anomaly',
      message: `Tree size decreased from ${lastAudit.treeSize} to ${treeHead.treeSize}`,
      orgId
    });
    return false;
  }

  // Record this audit
  await db.audits.save({
    orgId,
    treeSize: treeHead.treeSize,
    rootHash: treeHead.rootHash,
    timestamp: Date.now()
  });

  return true;
}
```

### Pattern 4: Batch Operations

Append multiple close packs efficiently:

```javascript
async function processCloseQueue(queue, orgId) {
  const log = new TransparencyLog(env);
  const results = [];

  for (const item of queue) {
    try {
      const result = await log.append(
        item.closeId,
        item.attestationHash,
        orgId
      );

      results.push({
        closeId: item.closeId,
        success: true,
        logIndex: result.logIndex
      });
    } catch (error) {
      results.push({
        closeId: item.closeId,
        success: false,
        error: error.message
      });
    }
  }

  return results;
}
```

## API Specification

### POST /api/transparency/append

Appends a new close pack to the transparency log.

**Request**
```json
{
  "closeId": "close-pack-id-123",
  "attestationHash": "a1b2c3d4e5f6...",
  "orgId": "org-456"
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "logIndex": 0,
    "treeSize": 1,
    "rootHash": "abc123def456...",
    "signature": "xyz789...",
    "timestamp": 1707000000000
  }
}
```

**Errors**
- 400: Missing required fields
- 500: Database error

---

### GET /api/transparency/tree-head

Gets the current signed tree head.

**Response**
```json
{
  "success": true,
  "data": {
    "treeSize": 42,
    "rootHash": "abc123def456...",
    "signature": "xyz789...",
    "timestamp": 1707000000000
  }
}
```

---

### GET /api/transparency/proof/:closeId

Gets Merkle inclusion proof for a close pack.

**Response (Found)**
```json
{
  "success": true,
  "data": {
    "found": true,
    "logIndex": 5,
    "leafHash": "def456...",
    "proof": [
      { "hash": "sibling1", "position": "left" },
      { "hash": "sibling2", "position": "right" }
    ],
    "treeSize": 42,
    "rootHash": "abc123..."
  }
}
```

**Response (Not Found)**
```json
{
  "success": false,
  "data": {
    "found": false,
    "logIndex": -1,
    "leafHash": null,
    "proof": [],
    "treeSize": 0,
    "rootHash": null
  }
}
```

---

### GET /api/transparency/consistency?from=10&to=50

Gets consistency proof between two tree sizes.

**Response**
```json
{
  "success": true,
  "data": {
    "consistent": true,
    "fromSize": 10,
    "toSize": 50,
    "proof": ["leaf11", "leaf12", ..., "leaf50"],
    "fromRoot": "root-at-10...",
    "toRoot": "root-at-50..."
  }
}
```

---

### GET /api/transparency/entries?start=0&end=9

Gets paginated log entries.

**Response**
```json
{
  "success": true,
  "data": [
    {
      "log_index": 0,
      "close_id": "close-001",
      "attestation_hash": "abc123...",
      "leaf_hash": "def456...",
      "tree_size": 1,
      "root_hash": "ghi789...",
      "signature": "sig...",
      "org_id": "org-456",
      "created_at": "2025-02-08T00:00:00Z"
    },
    ...
  ],
  "pagination": {
    "start": 0,
    "end": 9,
    "total": 10
  }
}
```

## Security Best Practices

### 1. Private Key Management

**DO:**
- Store ANCHOR_PRIVATE_KEY in a secure key management service (AWS Secrets Manager, Google Secret Manager, HashiCorp Vault)
- Rotate keys quarterly
- Use different keys per environment

**DON'T:**
- Commit keys to git
- Store in .env files in version control
- Use the same key across environments

### 2. Database Security

**DO:**
- Enable Row Level Security (RLS) on the transparency_log table
- Use column-level encryption for sensitive data
- Enable audit logging on the table
- Restrict API key permissions to minimal needed

**DON'T:**
- Expose SUPABASE_KEY in client-side code
- Use admin keys for non-admin operations
- Allow unauthenticated access to the API

### 3. Verification

**DO:**
- Always verify inclusion proofs before trusting an attestation
- Periodically verify consistency of the log
- Monitor for anomalies (tree size decreasing)
- Store signed tree heads in a separate, immutable location

**DON'T:**
- Trust unverified proofs
- Assume the log is correct without independent verification
- Ignore verification failures

### 4. Access Control

**DO:**
- Implement org-level isolation (via org_id in RLS)
- Use strong authentication for API access
- Log all access to the transparency log
- Rate-limit API endpoints

**DON'T:**
- Allow cross-org access
- Use weak or shared API keys
- Skip access logging
- Expose raw database access

## Monitoring and Operations

### Health Checks

Implement periodic health checks:

```javascript
const monitor = new TransparencyMonitor(env, 'https://alerts.example.com/webhook');

// Check every 5 minutes
setInterval(() => {
  const health = await monitor.checkHealth();
  if (!health.healthy) {
    // Handle alert
  }
}, 5 * 60 * 1000);
```

### Metrics to Track

1. **Tree Size**: Current number of entries
2. **Append Rate**: Entries per minute/hour
3. **Proof Verification Latency**: Time to verify proofs
4. **Database Query Performance**: Query latencies by operation

### Alerting Rules

Set up alerts for:
- Tree size decrease (critical)
- Signature verification failure (critical)
- Append latency > 5 seconds (warning)
- Tree head change without log growth (critical)

## Testing

### Unit Tests

Run the test suite:

```bash
node --experimental-global-webcrypto transparency-log.test.js
```

### Integration Tests

Test against a real Supabase instance:

```javascript
describe('TransparencyLog Integration', () => {
  let log;

  beforeAll(() => {
    log = new TransparencyLog({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_KEY: process.env.SUPABASE_KEY
    });
  });

  test('append and verify', async () => {
    // Append
    const result = await log.append(
      'test-close-1',
      'abc123',
      'test-org'
    );

    // Get proof
    const proof = await log.getInclusionProof('test-close-1');
    expect(proof.found).toBe(true);

    // Get tree head
    const treeHead = await log.getSignedTreeHead();

    // Verify
    const valid = await log.verifyInclusionProof(
      proof.leafHash,
      proof.proof,
      treeHead.rootHash
    );
    expect(valid).toBe(true);
  });
});
```

## Troubleshooting

### "Supabase error 401: Unauthorized"

**Cause**: Invalid SUPABASE_KEY

**Solution**:
1. Verify key in Supabase Dashboard → Settings → API
2. Check for typos
3. Ensure key has correct permissions

### "Supabase error 404: Not found"

**Cause**: Table not created

**Solution**:
1. Run migration: `transparency-log.migration.sql`
2. Verify table exists: `SELECT * FROM information_schema.tables WHERE table_name = 'transparency_log';`

### "Proof verification failed"

**Cause**: Using wrong root hash or modified proof

**Solution**:
1. Always verify against latest tree head
2. Don't modify proof between generation and verification
3. Check that leaf hash matches

### High latency on append

**Cause**: Tree size is large (tree rebuild is O(n))

**Solution**:
1. This is expected for very large trees (100k+ entries)
2. Consider caching frequently accessed proofs
3. Batch appends to reduce tree rebuilds

## Migration from Legacy System

If migrating from an existing close pack system:

1. **Export all close packs** from legacy system
2. **Compute attestation hashes** for each close pack
3. **Batch append** to transparency log
4. **Verify tree integrity** after migration
5. **Update clients** to use new transparency log APIs

```javascript
async function migrate(legacyCloses, orgId) {
  const log = new TransparencyLog(env);
  const results = [];

  for (const closePack of legacyCloses) {
    const attestation = await computeAttestationHash(closePack);
    const result = await log.append(closePack.id, attestation, orgId);
    results.push(result);
  }

  console.log(`Migrated ${results.length} close packs`);
}
```

## Further Reading

- RFC 6962: Certificate Transparency - https://tools.ietf.org/html/rfc6962
- Merkle Trees: https://en.wikipedia.org/wiki/Merkle_tree
- Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Supabase Documentation: https://supabase.com/docs

## Support

For issues or questions:
1. Check the README: `TRANSPARENCY_LOG_README.md`
2. Review examples: `transparency-log.example.js`
3. Run tests: `transparency-log.test.js`
4. Check server logs for database errors
