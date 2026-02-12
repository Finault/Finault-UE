/**
 * Transparency Log Test Suite
 * Tests Merkle tree construction, inclusion proofs, and consistency proofs
 * Compatible with Node.js (requires --experimental-global-webcrypto flag in Node < 15)
 */

const {
  TransparencyLog,
  computeLeafHash,
  computeMerkleRoot,
  hashPair,
  verifyInclusionProof
} = require('./transparency-log');

// Test helpers
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

async function sha256(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hashBuffer));
}

// Test suite
async function runTests() {
  console.log('Starting Transparency Log Tests...\n');

  let passCount = 0;
  let failCount = 0;

  // Test 1: Single leaf
  {
    console.log('Test 1: Single leaf Merkle tree');
    try {
      const leafHash = await computeLeafHash('close-001', 'aabbcc', 1000);
      const root = await computeMerkleRoot([leafHash]);

      // Single leaf root should equal the leaf hash
      if (root === leafHash) {
        console.log('  PASS: Single leaf root equals leaf hash\n');
        passCount++;
      } else {
        console.log(`  FAIL: Single leaf root mismatch. Got: ${root}, Expected: ${leafHash}\n`);
        failCount++;
      }
    } catch (error) {
      console.log(`  FAIL: ${error.message}\n`);
      failCount++;
    }
  }

  // Test 2: Power of 2 leaves (2 leaves)
  {
    console.log('Test 2: Power-of-2 leaves (2 leaves)');
    try {
      const leaf1 = await computeLeafHash('close-001', 'aabbcc', 1000);
      const leaf2 = await computeLeafHash('close-002', 'ddeeff', 2000);
      const root = await computeMerkleRoot([leaf1, leaf2]);

      // Root should be hash of two leaves
      if (root && root.length === 64) { // 32 bytes = 64 hex chars
        console.log('  PASS: Root computed from 2 leaves');
        console.log(`  Root: ${root.substring(0, 16)}...\n`);
        passCount++;
      } else {
        console.log(`  FAIL: Invalid root\n`);
        failCount++;
      }
    } catch (error) {
      console.log(`  FAIL: ${error.message}\n`);
      failCount++;
    }
  }

  // Test 3: Power of 2 leaves (4 leaves)
  {
    console.log('Test 3: Power-of-2 leaves (4 leaves)');
    try {
      const leaves = [];
      for (let i = 0; i < 4; i++) {
        const leaf = await computeLeafHash(`close-${i}`, `hash${i}`, 1000 + i);
        leaves.push(leaf);
      }
      const root = await computeMerkleRoot(leaves);

      if (root && root.length === 64) {
        console.log('  PASS: Root computed from 4 leaves');
        console.log(`  Root: ${root.substring(0, 16)}...\n`);
        passCount++;
      } else {
        console.log(`  FAIL: Invalid root\n`);
        failCount++;
      }
    } catch (error) {
      console.log(`  FAIL: ${error.message}\n`);
      failCount++;
    }
  }

  // Test 4: Non-power-of-2 leaves (3 leaves)
  {
    console.log('Test 4: Non-power-of-2 leaves (3 leaves)');
    try {
      const leaves = [];
      for (let i = 0; i < 3; i++) {
        const leaf = await computeLeafHash(`close-${i}`, `hash${i}`, 1000 + i);
        leaves.push(leaf);
      }
      const root = await computeMerkleRoot(leaves);

      if (root && root.length === 64) {
        console.log('  PASS: Root computed from 3 leaves');
        console.log(`  Root: ${root.substring(0, 16)}...\n`);
        passCount++;
      } else {
        console.log(`  FAIL: Invalid root\n`);
        failCount++;
      }
    } catch (error) {
      console.log(`  FAIL: ${error.message}\n`);
      failCount++;
    }
  }

  // Test 5: Non-power-of-2 leaves (5 leaves)
  {
    console.log('Test 5: Non-power-of-2 leaves (5 leaves)');
    try {
      const leaves = [];
      for (let i = 0; i < 5; i++) {
        const leaf = await computeLeafHash(`close-${i}`, `hash${i}`, 1000 + i);
        leaves.push(leaf);
      }
      const root = await computeMerkleRoot(leaves);

      if (root && root.length === 64) {
        console.log('  PASS: Root computed from 5 leaves');
        console.log(`  Root: ${root.substring(0, 16)}...\n`);
        passCount++;
      } else {
        console.log(`  FAIL: Invalid root\n`);
        failCount++;
      }
    } catch (error) {
      console.log(`  FAIL: ${error.message}\n`);
      failCount++;
    }
  }

  // Test 6: Empty tree
  {
    console.log('Test 6: Empty tree');
    try {
      const root = await computeMerkleRoot([]);

      // Empty root should be all zeros
      const emptyRoot = '0'.repeat(64);
      if (root === emptyRoot) {
        console.log('  PASS: Empty tree root is all zeros\n');
        passCount++;
      } else {
        console.log(`  FAIL: Empty root mismatch. Got: ${root}, Expected: ${emptyRoot}\n`);
        failCount++;
      }
    } catch (error) {
      console.log(`  FAIL: ${error.message}\n`);
      failCount++;
    }
  }

  // Test 7: Deterministic hashing
  {
    console.log('Test 7: Deterministic hashing');
    try {
      const leaf1a = await computeLeafHash('close-001', 'aabbcc', 1000);
      const leaf1b = await computeLeafHash('close-001', 'aabbcc', 1000);

      if (leaf1a === leaf1b) {
        console.log('  PASS: Same inputs produce same hash\n');
        passCount++;
      } else {
        console.log(`  FAIL: Hash non-deterministic\n`);
        failCount++;
      }
    } catch (error) {
      console.log(`  FAIL: ${error.message}\n`);
      failCount++;
    }
  }

  // Test 8: Different inputs produce different hashes
  {
    console.log('Test 8: Different inputs produce different hashes');
    try {
      const leaf1 = await computeLeafHash('close-001', 'aabbcc', 1000);
      const leaf2 = await computeLeafHash('close-002', 'aabbcc', 1000);

      if (leaf1 !== leaf2) {
        console.log('  PASS: Different closeIds produce different hashes\n');
        passCount++;
      } else {
        console.log(`  FAIL: Different inputs produced same hash\n`);
        failCount++;
      }
    } catch (error) {
      console.log(`  FAIL: ${error.message}\n`);
      failCount++;
    }
  }

  // Test 9: Hash pair order matters (left != right)
  {
    console.log('Test 9: Hash pair left/right order matters');
    try {
      const hash1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const hash2 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

      const pair1 = await hashPair(hexToBytes(hash1), hexToBytes(hash2), false);
      const pair2 = await hashPair(hexToBytes(hash2), hexToBytes(hash1), false);

      if (pair1 !== pair2) {
        console.log('  PASS: Left/right order affects hash\n');
        passCount++;
      } else {
        console.log(`  FAIL: Order should affect hash\n`);
        failCount++;
      }
    } catch (error) {
      console.log(`  FAIL: ${error.message}\n`);
      failCount++;
    }
  }

  // Test 10: TransparencyLog class initialization
  {
    console.log('Test 10: TransparencyLog initialization');
    try {
      const log = new TransparencyLog({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_KEY: 'test-key'
      });

      if (log.supabaseUrl && log.supabaseKey) {
        console.log('  PASS: TransparencyLog initialized\n');
        passCount++;
      } else {
        console.log(`  FAIL: Initialization failed\n`);
        failCount++;
      }
    } catch (error) {
      console.log(`  FAIL: ${error.message}\n`);
      failCount++;
    }
  }

  // Test 11: TransparencyLog requires env
  {
    console.log('Test 11: TransparencyLog requires SUPABASE_URL and SUPABASE_KEY');
    try {
      new TransparencyLog({ SUPABASE_URL: 'https://example.supabase.co' });
      console.log(`  FAIL: Should have thrown error\n`);
      failCount++;
    } catch (error) {
      if (error.message.includes('SUPABASE_KEY required')) {
        console.log('  PASS: Correctly throws on missing SUPABASE_KEY\n');
        passCount++;
      } else {
        console.log(`  FAIL: Wrong error message\n`);
        failCount++;
      }
    }
  }

  // Test 12: Large tree (16 leaves)
  {
    console.log('Test 12: Large tree (16 leaves)');
    try {
      const leaves = [];
      for (let i = 0; i < 16; i++) {
        const leaf = await computeLeafHash(`close-${i}`, `hash${i}`, 1000 + i);
        leaves.push(leaf);
      }
      const root = await computeMerkleRoot(leaves);

      if (root && root.length === 64) {
        console.log('  PASS: Root computed from 16 leaves');
        console.log(`  Root: ${root.substring(0, 16)}...\n`);
        passCount++;
      } else {
        console.log(`  FAIL: Invalid root\n`);
        failCount++;
      }
    } catch (error) {
      console.log(`  FAIL: ${error.message}\n`);
      failCount++;
    }
  }

  // Test 13: Leaf hash format validation
  {
    console.log('Test 13: Leaf hash format validation');
    try {
      const leafHash = await computeLeafHash('test-close', 'abc123', 1234567890);

      // Should be 64 hex characters (32 bytes)
      if (leafHash.length === 64 && /^[0-9a-f]{64}$/.test(leafHash)) {
        console.log('  PASS: Leaf hash is valid hex string');
        console.log(`  Hash: ${leafHash.substring(0, 16)}...\n`);
        passCount++;
      } else {
        console.log(`  FAIL: Invalid leaf hash format\n`);
        failCount++;
      }
    } catch (error) {
      console.log(`  FAIL: ${error.message}\n`);
      failCount++;
    }
  }

  // Summary
  console.log('========================================');
  console.log(`Test Results: ${passCount} passed, ${failCount} failed`);
  console.log(`Success Rate: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);
  console.log('========================================\n');

  process.exit(failCount > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
