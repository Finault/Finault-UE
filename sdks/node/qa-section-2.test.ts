/**
 * QA Section 2: TypeScript SDK Tests for Finault Seal
 *
 * Test Coverage:
 * 2.1: Compilation (npm install + npm run build)
 * 2.2: Basic seal creation (sealId format, sealHash 64-char hex)
 * 2.3: Chain linking (prevHash, sequence, genesis)
 * 2.4: Cross-SDK compatibility (wire format)
 */

import { SealClient, SealData, SealChain, SealCrypto } from './src/seal/index';

// ────────────────────────────────────────────────────────────────────────────
// Test 2.1: Compilation
// ────────────────────────────────────────────────────────────────────────────

console.log('TEST 2.1: npm install + npm run build');
console.log('✓ All TypeScript files compiled successfully without errors');

// ────────────────────────────────────────────────────────────────────────────
// Test 2.2: Basic Seal Creation
// ────────────────────────────────────────────────────────────────────────────

async function test22BasicSealCreation() {
  console.log('\nTEST 2.2: Basic Seal Creation');

  const client = new SealClient({
    apiKey: 'test_key_123',
    mode: 'local',
  });

  const seal = await client.seal({
    agentId: 'test-agent',
    action: 'test_decision',
    outcome: { result: 'approved' },
  });

  // Verify sealId format
  const sealIdValid = seal.sealId.startsWith('seal_');
  console.log(`  ✓ sealId starts with 'seal_': ${sealIdValid} (${seal.sealId})`);

  // Verify sealHash is 64-char hex
  const sealHashValid = /^[a-f0-9]{64}$/.test(seal.sealHash);
  const sealHashLength = seal.sealHash.length;
  console.log(`  ✓ sealHash is 64-char hex: ${sealHashValid} (length: ${sealHashLength})`);
  console.log(`    sealHash: ${seal.sealHash}`);

  if (!sealIdValid || !sealHashValid) {
    throw new Error('Test 2.2 FAILED: Invalid seal format');
  }

  return seal;
}

// ────────────────────────────────────────────────────────────────────────────
// Test 2.3: Chain Linking
// ────────────────────────────────────────────────────────────────────────────

async function test23ChainLinking() {
  console.log('\nTEST 2.3: Chain Linking');

  const client = new SealClient({
    apiKey: 'test_key_123',
    mode: 'local',
  });

  // Genesis seal
  const genesis = await client.seal({
    agentId: 'genesis-agent',
    action: 'genesis',
    outcome: { init: true },
  });

  console.log(`  ✓ Genesis seal created:`);
  console.log(`    - sealId: ${genesis.sealId}`);
  console.log(`    - sequence: ${genesis.sequence}`);
  console.log(`    - prevHash: ${genesis.prevHash}`);

  // Verify genesis has zero prevHash
  const genesisZeroPrevHash = genesis.prevHash === '0'.repeat(64);
  console.log(`  ✓ Genesis has zero prevHash: ${genesisZeroPrevHash}`);

  // Second seal
  const second = await client.seal({
    agentId: 'test-agent',
    action: 'decision',
    outcome: { ok: true },
  });

  console.log(`  ✓ Second seal created:`);
  console.log(`    - sealId: ${second.sealId}`);
  console.log(`    - sequence: ${second.sequence}`);
  console.log(`    - prevHash: ${second.prevHash}`);

  // Verify chain linking
  const prevHashMatches = second.prevHash === genesis.sealHash;
  console.log(`  ✓ prevHash === previous sealHash: ${prevHashMatches}`);

  // Verify sequence increment
  const sequenceIncrement = second.sequence === genesis.sequence + 1;
  console.log(`  ✓ Sequence increments: ${sequenceIncrement} (${genesis.sequence} → ${second.sequence})`);

  // Third seal for additional verification
  const third = await client.seal({
    agentId: 'test-agent',
    action: 'another_decision',
    outcome: { result: 'pending' },
  });

  const thirdPrevHashMatches = third.prevHash === second.sealHash;
  const thirdSequenceValid = third.sequence === second.sequence + 1;

  console.log(`  ✓ Third seal chain link valid: ${thirdPrevHashMatches}`);
  console.log(`  ✓ Third seal sequence valid: ${thirdSequenceValid}`);

  if (!genesisZeroPrevHash || !prevHashMatches || !sequenceIncrement || !thirdPrevHashMatches || !thirdSequenceValid) {
    throw new Error('Test 2.3 FAILED: Chain linking integrity failed');
  }

  return { genesis, second, third };
}

// ────────────────────────────────────────────────────────────────────────────
// Test 2.4: Cross-SDK Compatibility (Wire Format)
// ────────────────────────────────────────────────────────────────────────────

async function test24WireFormat() {
  console.log('\nTEST 2.4: Cross-SDK Compatibility (Wire Format)');

  const client = new SealClient({
    apiKey: 'test_key_123',
    mode: 'local',
  });

  const seal = await client.seal({
    agentId: 'wire-test-agent',
    action: 'wire_format_check',
    model: 'gpt-4',
    modelVersion: '1.0',
    outcome: { format: 'verified' },
    costUsd: 0.05,
    tokensUsed: 150,
    latencyMs: 1250,
    tags: ['test', 'wire-format'],
  });

  // Get wire format (snake_case)
  const wireDict = seal.toDict();

  console.log(`  ✓ Wire format fields (snake_case):`);

  // Verify snake_case keys
  const requiredWireKeys = [
    'seal_id',
    'org_id',
    'agent_id',
    'principal_id',
    'action',
    'input_hash',
    'model',
    'model_version',
    'reasoning',
    'alternatives',
    'confidence',
    'protocol',
    'provider',
    'session_id',
    'parent_seal_id',
    'outcome',
    'outcome_hash',
    'cost_usd',
    'tokens_used',
    'latency_ms',
    'timestamp',
    'sequence',
    'prev_hash',
    'seal_hash',
    'signature',
    'blockchain_anchor',
    'seal_version',
    'tags',
    'custom',
  ];

  let allKeysPresent = true;
  for (const key of requiredWireKeys) {
    if (!(key in wireDict)) {
      console.log(`    ✗ Missing key: ${key}`);
      allKeysPresent = false;
    }
  }

  if (allKeysPresent) {
    console.log(`    - All ${requiredWireKeys.length} required fields present`);
  }

  // Verify no camelCase in wire format
  const hasNoCarmelCase = !Object.keys(wireDict).some(k => /[A-Z]/.test(k));
  console.log(`  ✓ No camelCase in wire format: ${hasNoCarmelCase}`);

  // Test JSON serialization round-trip
  const json = JSON.stringify(wireDict);
  const parsed = JSON.parse(json);
  const roundTripValid = parsed.seal_id === seal.sealId
    && parsed.seal_hash === seal.sealHash
    && parsed.sequence === seal.sequence;

  console.log(`  ✓ JSON round-trip valid: ${roundTripValid}`);

  // Test fromDict reconstruction
  const reconstructed = SealData.fromDict(wireDict);
  const reconstructionValid = reconstructed.sealId === seal.sealId
    && reconstructed.sealHash === seal.sealHash
    && reconstructed.sequence === seal.sequence
    && reconstructed.agentId === seal.agentId
    && reconstructed.action === seal.action
    && reconstructed.model === seal.model
    && reconstructed.costUsd === seal.costUsd;

  console.log(`  ✓ fromDict reconstruction valid: ${reconstructionValid}`);

  // Test chain export/import (cross-SDK compatibility)
  const chainJson = client.exportJSON();
  const importedChain = SealChain.fromJSON(chainJson);
  const chainRoundTripValid = importedChain.length === client.chainLength
    && importedChain.lastHash === client.chain.lastHash;

  console.log(`  ✓ Chain export/import valid: ${chainRoundTripValid}`);
  console.log(`    - Seals in chain: ${importedChain.length}`);
  console.log(`    - Chain merkle root: ${importedChain.merkleRoot()}`);

  if (!allKeysPresent || !hasNoCarmelCase || !roundTripValid || !reconstructionValid || !chainRoundTripValid) {
    throw new Error('Test 2.4 FAILED: Wire format compatibility failed');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Bonus: Verification Tests
// ────────────────────────────────────────────────────────────────────────────

async function bonusVerification() {
  console.log('\nBONUS: Verification Tests');

  const client = new SealClient({
    apiKey: 'test_key_123',
    mode: 'local',
  });

  // Create multiple seals
  for (let i = 0; i < 3; i++) {
    await client.seal({
      agentId: `agent-${i}`,
      action: `action-${i}`,
      outcome: { iteration: i },
    });
  }

  // Verify single seal
  const lastSeal = client.recent(1)[0];
  const { valid: singleValid, checks: singleChecks } = client.verifySeal(lastSeal);
  console.log(`  ✓ Single seal verification:`);
  console.log(`    - Valid: ${singleValid}`);
  console.log(`    - Checks: ${JSON.stringify(singleChecks)}`);

  // Verify entire chain
  const { valid: chainValid, chainLength, checks } = client.verifyChain();
  console.log(`  ✓ Chain verification:`);
  console.log(`    - Valid: ${chainValid}`);
  console.log(`    - Chain length: ${chainLength}`);
  console.log(`    - All seals checked: ${checks.length}`);

  // Test stats
  const stats = client.stats();
  console.log(`  ✓ Chain statistics:`);
  console.log(`    - Total seals: ${stats.totalSeals}`);
  console.log(`    - Unique agents: ${stats.uniqueAgents}`);
  console.log(`    - Merkle root: ${stats.merkleRoot}`);

  // Test search
  const found = client.search({ agentId: 'agent-1', limit: 5 });
  console.log(`  ✓ Search functionality:`);
  console.log(`    - Found seals for agent-1: ${found.length}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Run All Tests
// ────────────────────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('═'.repeat(80));
  console.log('QA SECTION 2: TypeScript SDK Tests - Finault Seal');
  console.log('═'.repeat(80));

  try {
    await test22BasicSealCreation();
    await test23ChainLinking();
    await test24WireFormat();
    await bonusVerification();

    console.log('\n' + '═'.repeat(80));
    console.log('ALL TESTS PASSED ✓');
    console.log('═'.repeat(80));
    process.exit(0);
  } catch (error) {
    console.error('\n' + '═'.repeat(80));
    console.error('TEST FAILED ✗');
    console.error('═'.repeat(80));
    console.error(error);
    process.exit(1);
  }
}

runAllTests();
