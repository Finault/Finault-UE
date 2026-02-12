/**
 * Unit Tests for Evidence Collector Module
 * Finault Compliance Framework
 *
 * Tests constants, utility functions, and function signatures without
 * requiring a live Supabase connection.
 */

const {
  CONTROL_DEFINITIONS,
  PCAOB_ASSERTIONS,
  EFFECTIVENESS_THRESHOLDS,
  MATERIALITY_THRESHOLD,
  parsePeriod,
  computeConfidenceInterval,
  hashPackage,
  querySupabase,
  collectControlEvidence,
  collectPCAOBEvidence,
  collectGovernanceEvidence,
  collectEUAIActEvidence,
  runTransactionSampling,
  generateEvidencePackage,
} = require('../../platform/modules/evidence-collector');

// ============================================================================
// TEST RUNNER
// ============================================================================

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function testSection(title) {
  console.log(`\n${title}`);
  console.log('─'.repeat(title.length));
}

// ============================================================================
// ASYNC TEST RUNNER
// ============================================================================

(async () => {
  try {
    // ========== 1. CONSTANTS VALIDATION ==========
    testSection('1. Constants Validation');

    // CONTROL_DEFINITIONS validation
    const controlIds = Object.keys(CONTROL_DEFINITIONS);
    assert(controlIds.length === 6, 'CONTROL_DEFINITIONS has exactly 6 controls');
    assert(
      controlIds.every(id => id.match(/^AI-FIN-00[1-6]$/)),
      'All control IDs match AI-FIN-001 through AI-FIN-006 pattern'
    );

    controlIds.forEach(id => {
      const ctrl = CONTROL_DEFINITIONS[id];
      assert(ctrl.name && typeof ctrl.name === 'string', `${id} has name property (string)`);
      assert(ctrl.description && typeof ctrl.description === 'string', `${id} has description property (string)`);
      assert(Array.isArray(ctrl.assertions), `${id} has assertions array`);
      assert(Array.isArray(ctrl.tables), `${id} has tables array`);
      assert(typeof ctrl.sampleSize === 'number', `${id} has sampleSize (number)`);
    });

    // PCAOB_ASSERTIONS validation
    const assertionKeys = Object.keys(PCAOB_ASSERTIONS);
    assert(assertionKeys.length === 6, 'PCAOB_ASSERTIONS has exactly 6 assertions');

    assertionKeys.forEach(key => {
      const assertion = PCAOB_ASSERTIONS[key];
      assert(assertion.name && typeof assertion.name === 'string', `${key} assertion has name (string)`);
      assert(assertion.standard && typeof assertion.standard === 'string', `${key} assertion has standard (string)`);
    });

    // EFFECTIVENESS_THRESHOLDS validation
    assert(
      EFFECTIVENESS_THRESHOLDS.effective === 0.05,
      'EFFECTIVENESS_THRESHOLDS.effective is 0.05'
    );
    assert(
      EFFECTIVENESS_THRESHOLDS.needsImprovement === 0.15,
      'EFFECTIVENESS_THRESHOLDS.needsImprovement is 0.15'
    );
    assert(
      EFFECTIVENESS_THRESHOLDS.ineffective === 1.0,
      'EFFECTIVENESS_THRESHOLDS.ineffective is 1.0'
    );

    // MATERIALITY_THRESHOLD validation
    assert(MATERIALITY_THRESHOLD === 0.05, 'MATERIALITY_THRESHOLD is 0.05');

    // ========== 2. parsePeriod() TESTS ==========
    testSection('2. parsePeriod() Tests');

    const jan2026 = parsePeriod('2026-01');
    assert(jan2026.periodStart === '2026-01-01', "parsePeriod('2026-01') periodStart is 2026-01-01");
    assert(jan2026.periodEnd === '2026-02-01', "parsePeriod('2026-01') periodEnd is 2026-02-01");

    const dec2025 = parsePeriod('2025-12');
    assert(dec2025.periodStart === '2025-12-01', "parsePeriod('2025-12') periodStart is 2025-12-01");
    assert(dec2025.periodEnd === '2026-01-01', "parsePeriod('2025-12') periodEnd is 2026-01-01 (year rollover)");

    const mayPeriod = parsePeriod('2025-05');
    assert(mayPeriod.periodStart === '2025-05-01', "parsePeriod('2025-05') periodStart is 2025-05-01");
    assert(mayPeriod.periodEnd === '2025-06-01', "parsePeriod('2025-05') periodEnd is 2025-06-01");

    // ========== 3. computeConfidenceInterval() TESTS ==========
    testSection('3. computeConfidenceInterval() Tests');

    const ci1 = computeConfidenceInterval(0.0, 100);
    assert(ci1.lower !== undefined && ci1.upper !== undefined, 'Returns object with lower and upper fields');
    assert(
      typeof ci1.lower === 'number' && typeof ci1.upper === 'number',
      'lower and upper are numbers'
    );
    assert(ci1.lower >= 0 && ci1.lower <= 0.05, 'For 0% error rate (100 samples): lower bound near 0');
    assert(ci1.upper >= 0 && ci1.upper <= 0.15, 'For 0% error rate (100 samples): upper bound reasonable');

    const ci2 = computeConfidenceInterval(0.5, 100);
    const ciWidth2 = ci2.upper - ci2.lower;
    assert(ciWidth2 > 0.15, 'For 50% error rate: confidence interval is wide');

    const ci3 = computeConfidenceInterval(0.3, 1000);
    const ciWidth3 = ci3.upper - ci3.lower;
    const ciWidth4 = computeConfidenceInterval(0.3, 100).upper - computeConfidenceInterval(0.3, 100).lower;
    assert(
      ciWidth3 < ciWidth4,
      'Larger sample size produces narrower confidence interval'
    );

    // ========== 4. hashPackage() TESTS ==========
    testSection('4. hashPackage() Tests');

    const testData = { control: 'AI-FIN-001', result: 'effective' };
    const hash1 = await hashPackage(testData);
    assert(typeof hash1 === 'string', 'hashPackage returns string');
    assert(hash1.length === 64, 'Hash is 64-character hex string (SHA-256)');
    assert(/^[a-f0-9]{64}$/.test(hash1), 'Hash is valid hex format');

    const hash2 = await hashPackage(testData);
    assert(hash1 === hash2, 'Same input produces same hash');

    const differentData = { control: 'AI-FIN-002', result: 'ineffective' };
    const hash3 = await hashPackage(differentData);
    assert(hash1 !== hash3, 'Different input produces different hash');

    // ========== 5. querySupabase() SIGNATURE ==========
    testSection('5. querySupabase() Signature');

    assert(typeof querySupabase === 'function', 'querySupabase function exists and is exported');
    assert(querySupabase.constructor.name === 'AsyncFunction', 'querySupabase is async function');

    // ========== 6. CORE FUNCTION SIGNATURES ==========
    testSection('6. Core Function Signatures');

    assert(typeof collectControlEvidence === 'function', 'collectControlEvidence is a function');
    assert(typeof collectPCAOBEvidence === 'function', 'collectPCAOBEvidence is a function');
    assert(typeof collectGovernanceEvidence === 'function', 'collectGovernanceEvidence is a function');
    assert(typeof collectEUAIActEvidence === 'function', 'collectEUAIActEvidence is a function');
    assert(typeof runTransactionSampling === 'function', 'runTransactionSampling is a function');
    assert(typeof generateEvidencePackage === 'function', 'generateEvidencePackage is a function');

    // Verify they are async
    assert(
      collectControlEvidence.constructor.name === 'AsyncFunction',
      'collectControlEvidence is async'
    );
    assert(
      collectPCAOBEvidence.constructor.name === 'AsyncFunction',
      'collectPCAOBEvidence is async'
    );
    assert(
      collectGovernanceEvidence.constructor.name === 'AsyncFunction',
      'collectGovernanceEvidence is async'
    );
    assert(
      collectEUAIActEvidence.constructor.name === 'AsyncFunction',
      'collectEUAIActEvidence is async'
    );
    assert(
      runTransactionSampling.constructor.name === 'AsyncFunction',
      'runTransactionSampling is async'
    );
    assert(
      generateEvidencePackage.constructor.name === 'AsyncFunction',
      'generateEvidencePackage is async'
    );

    // ========== 7. CONTROL DEFINITION INTEGRITY ==========
    testSection('7. Control Definition Integrity');

    assert(
      CONTROL_DEFINITIONS['AI-FIN-001'].assertions.includes('COMPLETENESS'),
      'AI-FIN-001 assertions include COMPLETENESS'
    );
    assert(
      CONTROL_DEFINITIONS['AI-FIN-002'].assertions.includes('RIGHTS_OBLIGATIONS'),
      'AI-FIN-002 assertions include RIGHTS_OBLIGATIONS'
    );
    assert(
      CONTROL_DEFINITIONS['AI-FIN-003'].assertions.includes('ACCURACY'),
      'AI-FIN-003 assertions include ACCURACY'
    );
    assert(
      CONTROL_DEFINITIONS['AI-FIN-004'].assertions.includes('RIGHTS_OBLIGATIONS'),
      'AI-FIN-004 assertions include RIGHTS_OBLIGATIONS'
    );
    assert(
      CONTROL_DEFINITIONS['AI-FIN-005'].assertions.includes('EXISTENCE'),
      'AI-FIN-005 assertions include EXISTENCE'
    );
    assert(
      CONTROL_DEFINITIONS['AI-FIN-006'].assertions.includes('COMPLETENESS'),
      'AI-FIN-006 assertions include COMPLETENESS'
    );

    // ========== 8. PCAOB ASSERTION STANDARDS ==========
    testSection('8. PCAOB Assertion Standards');

    Object.entries(PCAOB_ASSERTIONS).forEach(([key, assertion]) => {
      assert(
        assertion.standard.includes('AS 1105'),
        `${key} assertion references AS 1105 standard`
      );
    });

    // ========== SUMMARY ==========
    console.log('\n' + '═'.repeat(50));
    console.log(`Tests Passed: ${passed}`);
    console.log(`Tests Failed: ${failed}`);
    console.log('═'.repeat(50));

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n✗ Test suite error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
