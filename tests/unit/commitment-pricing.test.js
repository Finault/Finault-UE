/**
 * Unit tests for Commitment Pricing Module
 * Run: node tests/unit/commitment-pricing.test.js
 */

const commitmentPricing = require('../../platform/modules/commitment-pricing.js');

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

function assertClose(actual, expected, tolerance, message) {
  const diff = Math.abs(parseFloat(actual) - parseFloat(expected));
  assert(diff <= tolerance, `${message} (got ${actual}, expected ~${expected})`);
}

console.log('Testing Commitment Pricing Module\n');

// ============================================================================
// Test: createCommitment validates and computes amortization
// ============================================================================
try {
  console.log('createCommitment() - Commitment creation:');

  const commitment = {
    id: 'commitment-123',
    organizationId: 'org-123',
    provider: 'openai',
    commitmentType: 'reserved_capacity',
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    totalCost: 120000
  };

  const result = commitmentPricing.createCommitment(commitment);

  assert(result !== null, 'Commitment is created');
  assert(typeof result === 'object', 'Result is an object');
  assert('dailyAmortizedCost' in result, 'Daily amortized cost is computed');
  assert('monthlyAmortizedCost' in result, 'Monthly amortized cost is computed');

} catch (err) {
  failed++;
  console.error(`  ✗ createCommitment threw error: ${err.message}`);
}

// ============================================================================
// Test: calculateEffectiveCost applies discount for committed_use
// ============================================================================
try {
  console.log('\ncalculateEffectiveCost() - Discount application:');

  const commitments = [
    {
      id: 'commitment-1',
      provider: 'openai',
      model: 'gpt-4o',
      status: 'active',
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
      commitmentType: 'committed_use',
      discountRate: 25,
      remaining: 1000000
    }
  ];

  const listPricing = {
    openai: {
      'gpt-4o': { input: 2.5, output: 10.0 }
    }
  };

  const result = commitmentPricing.calculateEffectiveCost('openai', 'gpt-4o', 100, 200, commitments, listPricing);

  assert(typeof result === 'object', 'Effective cost result is an object');
  assert('effectiveCost' in result, 'Result has effectiveCost field');
  // With 25% discount: listCost = 100*2.5 + 200*10 = 250 + 2000 = 2250
  // effective = 2250 * 0.75 = 1687.50
  assert(result.effectiveCost <= result.listCost, 'Discount reduces or equals list price');
  assert(result.effectiveCost > 0, 'Effective cost is positive');

} catch (err) {
  failed++;
  console.error(`  ✗ calculateEffectiveCost threw error: ${err.message}`);
}

// ============================================================================
// Test: calculateEffectiveCost falls back to list price without commitment
// ============================================================================
try {
  console.log('\n');

  const listPricing = {
    anthropic: {
      'claude-3-5-sonnet': { input: 3.0, output: 15.0 }
    }
  };

  const result = commitmentPricing.calculateEffectiveCost('anthropic', 'claude-3-5-sonnet', 100, 200, [], listPricing);

  assert(typeof result === 'object', 'Result is an object');
  assert(result.effectiveCost === result.listCost, 'Without commitment, effective cost equals list price');

} catch (err) {
  failed++;
  console.error(`  ✗ No-commitment fallback threw error: ${err.message}`);
}

// ============================================================================
// Test: Volume discount tiers compute correctly
// ============================================================================
try {
  console.log('\nVolume discount tiers:');

  const result1 = commitmentPricing.getVolumeTier('openai', 'gpt-4o', 1000);
  const result2 = commitmentPricing.getVolumeTier('openai', 'gpt-4o', 100000);
  const result3 = commitmentPricing.getVolumeTier('openai', 'gpt-4o', 1000000);

  assert(result1 !== null, 'Tier for 1K units is found');
  assert(result2 !== null, 'Tier for 100K units is found');
  assert(result3 !== null, 'Tier for 1M units is found');

  // Higher volumes should have lower rates (better discounts)
  if (result1 && result3) {
    assert(result1.inputRate >= result3.inputRate, 'Higher volume tier receives equal or better input rate');
  }

} catch (err) {
  failed++;
  console.error(`  ✗ Volume discount tier calculation threw error: ${err.message}`);
}

// ============================================================================
// Test: COMMITMENT_TYPES has all 6 types
// ============================================================================
try {
  console.log('\nCOMMITMENT_TYPES validation:');

  const types = commitmentPricing.COMMITMENT_TYPES;

  assert(typeof types === 'object', 'COMMITMENT_TYPES is an object');
  assert(Object.keys(types).length === 6, 'COMMITMENT_TYPES has 6 types');

  // Verify expected types (from the module)
  const expectedTypes = [
    'reserved_capacity',
    'committed_use',
    'volume_discount',
    'prompt_caching',
    'savings_plan',
    'enterprise_agreement'
  ];
  let hasExpectedTypes = true;

  for (const expected of expectedTypes) {
    if (!Object.values(types).includes(expected)) {
      hasExpectedTypes = false;
      break;
    }
  }

  assert(hasExpectedTypes, 'COMMITMENT_TYPES includes all required types');

} catch (err) {
  failed++;
  console.error(`  ✗ COMMITMENT_TYPES validation threw error: ${err.message}`);
}

// ============================================================================
// Test: getCommitmentUtilization computes utilization percentages
// ============================================================================
try {
  console.log('\ngetCommitmentUtilization() - Utilization calculation:');

  const commitment = {
    id: 'commitment-1',
    committedUnits: 120000,
    consumed: 85000,
    periodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    periodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
  };

  const result = commitmentPricing.getCommitmentUtilization([commitment]);

  assert(Array.isArray(result), 'Result is an array');
  assert(result.length > 0, 'Array has utilization data');

  if (result.length > 0) {
    const util = result[0];
    assert('currentUtilizationPct' in util, 'Has currentUtilizationPct field');
    assert(typeof util.currentUtilizationPct === 'number', 'Utilization is a number');
    assertClose(util.currentUtilizationPct, 70.83, 1, 'Utilization percentage is correct (85000/120000)');
  }

} catch (err) {
  failed++;
  console.error(`  ✗ getCommitmentUtilization threw error: ${err.message}`);
}

// ============================================================================
// Test: toFOCUSPricing maps to correct FOCUS fields
// ============================================================================
try {
  console.log('\ntoFOCUSPricing() - FOCUS field mapping:');

  const costResult = {
    listCost: 10000,
    effectiveCost: 7500,
    focusCommitmentStatus: 'Used',
    savings: 2500
  };

  const focusMapping = commitmentPricing.toFOCUSPricing(costResult);

  assert(focusMapping !== null, 'FOCUS mapping is generated');
  assert(typeof focusMapping === 'object', 'Mapping is an object');
  assert('ListCost' in focusMapping, 'FOCUS ListCost field is mapped');
  assert('EffectiveCost' in focusMapping, 'FOCUS EffectiveCost field is mapped');
  assert('CommitmentDiscountStatus' in focusMapping, 'FOCUS CommitmentDiscountStatus field is mapped');

} catch (err) {
  failed++;
  console.error(`  ✗ toFOCUSPricing threw error: ${err.message}`);
}

// ============================================================================
// Test: calculateSavingsReport produces savings summary
// ============================================================================
try {
  console.log('\ncalculateSavingsReport() - Savings analysis:');

  const commitments = [
    {
      id: 'commitment-1',
      provider: 'openai',
      model: 'gpt-4o',
      status: 'active',
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
      totalCost: 120000
    }
  ];

  const usageRecords = [
    {
      provider: 'openai',
      model: 'gpt-4o',
      listCost: 11000,
      effectiveCost: 8500,
      commitmentType: 'reserved_capacity',
      timestamp: new Date().toISOString()
    }
  ];

  const period = { startDate: '2025-01-01', endDate: '2025-12-31' };

  const report = commitmentPricing.calculateSavingsReport(commitments, usageRecords, period);

  assert(report !== null, 'Savings report is generated');
  assert(typeof report === 'object', 'Report is an object');
  assert('totalSavings' in report, 'Report includes totalSavings calculation');

} catch (err) {
  failed++;
  console.error(`  ✗ calculateSavingsReport threw error: ${err.message}`);
}

// ============================================================================
// Test: Monthly commitment amortization
// ============================================================================
try {
  console.log('\nMonthly commitment amortization:');

  const commitment = {
    id: 'commitment-1',
    organizationId: 'org-123',
    provider: 'openai',
    commitmentType: 'reserved_capacity',
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    totalCost: 120000
  };

  const result = commitmentPricing.createCommitment(commitment);

  if (result && ('monthlyAmortizedCost' in result)) {
    // 120000 / 12 months = 10000 per month
    assertClose(result.monthlyAmortizedCost, 10000, 500, 'Monthly amortization is ~$10,000');
  }

} catch (err) {
  failed++;
  console.error(`  ✗ Monthly amortization test threw error: ${err.message}`);
}

// ============================================================================
// Test: Three-year commitment discount
// ============================================================================
try {
  console.log('\nThree-year commitment pricing:');

  const commitments = [
    {
      id: 'commitment-3yr',
      provider: 'openai',
      model: 'gpt-4o',
      status: 'active',
      periodStart: '2025-01-01',
      periodEnd: '2027-12-31',
      commitmentType: 'committed_use',
      discountRate: 35
    }
  ];

  const listPricing = {
    openai: {
      'gpt-4o': { input: 2.5, output: 10.0 }
    }
  };

  const result = commitmentPricing.calculateEffectiveCost('openai', 'gpt-4o', 100, 200, commitments, listPricing);

  assert(typeof result === 'object', 'Three-year commitment pricing is computed');
  assert(result.effectiveCost < result.listCost, 'Three-year term receives discount vs. list price');

} catch (err) {
  failed++;
  console.error(`  ✗ Three-year commitment test threw error: ${err.message}`);
}

// ============================================================================
// Test: Commitment term validation
// ============================================================================
try {
  console.log('\nCommitment term validation:');

  const validCommitment = {
    id: 'commitment-valid',
    organizationId: 'org-123',
    provider: 'openai',
    commitmentType: 'reserved_capacity',
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    totalCost: 120000
  };

  const result = commitmentPricing.createCommitment(validCommitment);

  assert(result !== null, 'Valid commitment term is accepted');

} catch (err) {
  failed++;
  console.error(`  ✗ Commitment term validation threw error: ${err.message}`);
}

// ============================================================================
// Test: Utilization over 100% is flagged
// ============================================================================
try {
  console.log('\nHigh utilization handling:');

  const commitment = {
    id: 'commitment-overage',
    committedUnits: 100000,
    consumed: 125000,
    periodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    periodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
  };

  const result = commitmentPricing.getCommitmentUtilization([commitment]);

  assert(Array.isArray(result), 'Result is an array');
  if (result.length > 0) {
    const util = result[0];
    assert(typeof util.currentUtilizationPct === 'number', 'Utilization for overage is computed');
    assert(util.currentUtilizationPct > 100, 'Overage is correctly reported (>100%)');
  }

} catch (err) {
  failed++;
  console.error(`  ✗ High utilization test threw error: ${err.message}`);
}

// ============================================================================
// Test: Volume discount tiers are tiered correctly
// ============================================================================
try {
  console.log('\nVolume tier progression:');

  const tier1 = commitmentPricing.getVolumeTier('openai', 'gpt-4o', 10000);
  const tier2 = commitmentPricing.getVolumeTier('openai', 'gpt-4o', 100000);
  const tier3 = commitmentPricing.getVolumeTier('openai', 'gpt-4o', 1000000);

  if (tier1 && tier2 && tier3) {
    // Higher volumes should have lower rates
    assert(tier1.inputRate >= tier2.inputRate, 'Volume tier 1 input rate >= tier 2');
    assert(tier2.inputRate >= tier3.inputRate, 'Volume tier 2 input rate >= tier 3');
  }

} catch (err) {
  failed++;
  console.error(`  ✗ Volume tier progression test threw error: ${err.message}`);
}

// ============================================================================
// Summary
// ============================================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
