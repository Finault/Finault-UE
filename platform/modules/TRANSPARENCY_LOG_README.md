# Transparency Log Module

Certificate Transparency-inspired append-only Merkle log for close pack attestation hashes. Provides cryptographic proofs of inclusion and consistency per RFC 6962.

## Overview

The Transparency Log implements a tamper-evident audit trail for close pack attestations:

- **Append-Only**: Entries can only be added, never modified or deleted
- **Merkle Tree Commitments**: Each state of the log is committed to a cryptographic root hash
- **Inclusion Proofs**: Prove a specific close pack is in the log
- **Consistency Proofs**: Prove the log only appended, never mutated
- **Signed Tree Heads**: Root hashes signed with HMAC-SHA256 for authenticity

## References

- RFC 6962: Certificate Transparency - https://tools.ietf.org/html/rfc6962
- Merkle Tree Implementation: https://en.wikipedia.org/wiki/Merkle_tree

## Installation

```javascript
const { TransparencyLog, computeLeafHash, computeMerkleRoot } = require('./transparency-log');
```

## Architecture

### Merkle Tree Structure

The module implements a complete binary Merkle tree per RFC 6962:

```
       Root
      /    \
    H(01)   H(23)
    /  \    /  \
   H0  H1  H2  H3
```

Key properties:
- **Leaf nodes**: Prefixed with `0x00` before hashing
- **Internal nodes**: Prefixed with `0x01` before hashing
- **Odd leaves**: Duplicated to form complete binary tree
- **Empty tree**: Root is all zeros (32 bytes)

### Database Schema

Requires `transparency_log` table in Supabase:

```sql
CREATE TABLE transparency_log (
  id BIGSERIAL PRIMARY KEY,
  log_index BIGINT NOT NULL UNIQUE,
  close_id TEXT NOT NULL,
  attestation_hash TEXT NOT NULL,
  leaf_hash TEXT NOT NULL,
  tree_size BIGINT NOT NULL,
  root_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  org_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX idx_close_id (close_id),
  INDEX idx_log_index (log_index),
  INDEX idx_org_id (org_id)
);
```

## Usage

### Initialize

```javascript
const log = new TransparencyLog({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_KEY: 'anon-key',
  ANCHOR_PRIVATE_KEY: 'optional-signing-key'
});
```

### Append Entry

```javascript
const result = await log.append(
  'close-pack-id-123',
  'a1b2c3d4e5f6...',  // attestation hash (hex)
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
```

### Get Latest Tree Head

```javascript
const treeHead = await log.getSignedTreeHead();

console.log(treeHead);
// {
//   treeSize: 42,
//   rootHash: 'abc123...',
//   signature: 'xyz789...',
//   timestamp: 1707000000000
// }
```

### Get Inclusion Proof

Proves that a close pack is committed in the log:

```javascript
const proof = await log.getInclusionProof('close-pack-id-123');

console.log(proof);
// {
//   found: true,
//   logIndex: 5,
//   leafHash: 'def456...',
//   proof: [
//     { hash: 'sibling1', position: 'left' },
//     { hash: 'sibling2', position: 'right' },
//     { hash: 'sibling3', position: 'left' }
//   ],
//   treeSize: 42,
//   rootHash: 'abc123...'
// }
```

### Verify Inclusion Proof (Client-Side)

```javascript
const isValid = await log.verifyInclusionProof(
  proof.leafHash,
  proof.proof,
  proof.rootHash
);

if (isValid) {
  console.log('Proof is valid! Close pack is committed in the log.');
}
```

### Get Consistency Proof

Proves that tree at size N is a prefix of tree at size M:

```javascript
const consistency = await log.getConsistencyProof(10, 42);

console.log(consistency);
// {
//   consistent: true,
//   fromSize: 10,
//   toSize: 42,
//   proof: ['leaf11', 'leaf12', ..., 'leaf42'],
//   fromRoot: 'root-at-10...',
//   toRoot: 'root-at-42...'
// }
```

### Get Log Entries

```javascript
const entries = await log.getEntries(0, 9);

console.log(entries);
// [
//   {
//     log_index: 0,
//     close_id: 'close-001',
//     attestation_hash: 'abc123...',
//     leaf_hash: 'def456...',
//     tree_size: 1,
//     root_hash: 'ghi789...',
//     signature: 'sig...',
//     org_id: 'org-456',
//     created_at: '2025-02-08T00:00:00Z'
//   },
//   ...
// ]
```

## Module Exports

### Classes

#### `TransparencyLog`

Main class for managing the append-only log.

**Constructor**
```javascript
new TransparencyLog(env)
```
- `env.SUPABASE_URL` (required): Supabase project URL
- `env.SUPABASE_KEY` (required): Supabase anon key
- `env.ANCHOR_PRIVATE_KEY` (optional): Private key for signing tree heads

**Methods**

- `async append(closeId, attestationHash, orgId)` → `{logIndex, treeSize, rootHash, signature, timestamp}`
- `async getSignedTreeHead()` → `{treeSize, rootHash, signature, timestamp}`
- `async getInclusionProof(closeId)` → `{found, logIndex, leafHash, proof, treeSize, rootHash}`
- `async getConsistencyProof(fromSize, toSize)` → `{consistent, fromSize, toSize, proof, fromRoot, toRoot}`
- `async getEntries(start, end)` → `Array<LogEntry>`
- `async verifyInclusionProof(leafHash, proof, rootHash)` → `boolean`
- `async verifyConsistencyProof(proof, fromSize, toSize, fromRoot, toRoot)` → `boolean`

### Functions

#### `computeLeafHash(closeId, attestationHash, timestamp)`

Computes leaf hash for a close pack entry.

**Parameters**
- `closeId` (string): Unique close pack identifier
- `attestationHash` (string): Attestation proof hash (hex)
- `timestamp` (number): Unix timestamp in milliseconds

**Returns**: Promise<string> - Leaf hash as hex string

**Example**
```javascript
const leafHash = await computeLeafHash(
  'close-123',
  'a1b2c3...',
  Date.now()
);
// 'abc123def456...' (64 hex chars)
```

#### `computeMerkleRoot(leafHashes)`

Builds complete Merkle tree from leaves and returns root.

**Parameters**
- `leafHashes` (Array<string>): Leaf hashes in order (hex strings)

**Returns**: Promise<string> - Root hash as hex string

**Handles**
- Empty trees (returns all zeros)
- Single leaves (returns leaf hash)
- Power-of-2 leaves (1, 2, 4, 8, 16, ...)
- Non-power-of-2 leaves (3, 5, 7, ...)

**Example**
```javascript
const leaves = ['hash1', 'hash2', 'hash3'];
const root = await computeMerkleRoot(leaves);
// 'xyz789...' (64 hex chars)
```

#### `hashPair(left, right, isLeaf)`

Computes SHA-256 hash of two concatenated byte arrays.

**Parameters**
- `left` (Uint8Array): Left hash
- `right` (Uint8Array): Right hash
- `isLeaf` (boolean): Whether this is a leaf node (default: false)

**Returns**: Promise<Uint8Array> - Hash of concatenated input

**Prefixing** (per RFC 6962)
- Leaf nodes: 0x00 || hash(data)
- Internal nodes: 0x01 || hash(data)

#### `verifyInclusionProof(leafHash, proof, rootHash)`

Verifies a Merkle inclusion proof client-side.

**Parameters**
- `leafHash` (string): Leaf hash (hex)
- `proof` (Array): Proof array from `getInclusionProof`
- `rootHash` (string): Root hash to verify against (hex)

**Returns**: Promise<boolean> - True if valid

**Example**
```javascript
const proof = await log.getInclusionProof('close-123');
const isValid = await verifyInclusionProof(
  proof.leafHash,
  proof.proof,
  proof.rootHash
);
```

## Cryptographic Properties

### Preimage Resistance
SHA-256 is preimage resistant. Given a hash, it's computationally infeasible to find an input that produces it.

### Collision Resistance
SHA-256 provides 256-bit collision resistance. The probability of two different inputs producing the same hash is negligible.

### Tree Properties
- **Immutability**: Modifying any leaf changes the root hash
- **Tamper Detection**: Any mutation is immediately detectable when verifying against a signed tree head
- **Append-Only Proof**: Consistency proofs can only be satisfied by appending, never modifying

## Edge Cases

### Empty Tree
```javascript
const root = await computeMerkleRoot([]);
// Returns: '0000000000000000000000000000000000000000000000000000000000000000'
```

### Single Leaf
```javascript
const root = await computeMerkleRoot(['abc123...']);
// Returns: 'abc123...' (same as leaf)
```

### Odd Number of Leaves
```javascript
const root = await computeMerkleRoot(['h0', 'h1', 'h2']);
// h0 and h1 pair into h01
// h2 duplicates into h22, which then pairs with h01
// Tree structure: h(h01, h22) where h22 = h(h2, h2)
```

## Cloudflare Workers Compatibility

The module uses Web Crypto API (`crypto.subtle.digest`) which is available in Cloudflare Workers:

```javascript
// In a Cloudflare Worker
const log = new TransparencyLog({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_KEY: env.SUPABASE_KEY
});

export default {
  async fetch(request, env, ctx) {
    const result = await log.append(
      closeId,
      attestationHash,
      orgId
    );
    return new Response(JSON.stringify(result));
  }
};
```

## Security Considerations

### Private Key Management
- Store `ANCHOR_PRIVATE_KEY` securely (environment variables, key vault)
- Never commit keys to version control
- Rotate keys periodically

### Verification
- Always verify inclusion proofs before trusting a close pack commitment
- Verify signed tree heads against a trusted public key
- Monitor tree head changes for anomalies

### Database Security
- Use Supabase Row Level Security (RLS) to restrict access by org_id
- Ensure SUPABASE_KEY has minimal required permissions
- Audit all transparency log modifications

## Testing

Run test suite (requires Node.js with --experimental-global-webcrypto):

```bash
node --experimental-global-webcrypto transparency-log.test.js
```

Test coverage:
- Single leaf tree
- Power-of-2 leaves (2, 4, 16)
- Non-power-of-2 leaves (3, 5)
- Empty tree
- Deterministic hashing
- Different inputs → different hashes
- Hash pair order sensitivity
- Large trees (16+ leaves)
- Leaf hash format validation
- Module initialization

## Performance

Approximate operation costs (per RFC 6962):
- **Append**: O(log n) tree operations, O(1) database write
- **Inclusion Proof**: O(n) database query, O(log n) proof computation
- **Verification**: O(log n) hash operations
- **Consistency Proof**: O(n) tree walk

For n=1M entries, an inclusion proof requires ~20 hash operations for verification.

## Implementation Notes

### Merkle Tree Balance
The implementation uses a complete binary tree (even number of leaves through duplication) rather than a compact tree. This simplifies proof generation and verification.

### Consistency Proofs
Current implementation returns the list of new leaves added. A production implementation could compute a more compact proof path.

### Signature Scheme
Uses HMAC-SHA256 for signing. For production, consider:
- ECDSA with secp256k1 (Ethereum compatibility)
- Ed25519 (modern, fast)
- RSA-4096 (traditional, widely trusted)

## Future Enhancements

1. **Compact Consistency Proofs**: Implement RFC 6962 Section 4.4 fully
2. **Batch Operations**: Append multiple entries with single root computation
3. **Proof Caching**: Cache frequently verified proofs
4. **Audit Trail**: Track and expose all tree mutations
5. **Multi-Signature**: Require multiple signers for tree head commitment
6. **Time-Stamping**: Integrate with external time-stamp authorities

## License

Part of Finault Enterprise Hardening Platform
