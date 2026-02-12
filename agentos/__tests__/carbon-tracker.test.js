/**
 * CARBON TRACKER AGENT TEST SUITE
 * Comprehensive tests for carbon emission estimation and tracking
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;
const failures = [];

function test(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  ✗ FAIL: ${message}`);
  }
}

function testClose(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
    console.log(`  ✓ ${message} (${actual.toFixed(6)} ≈ ${expected.toFixed(6)})`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  ✗ FAIL: ${message} (${actual.toFixed(6)} differs from ${expected.toFixed(6)} by ${diff.toFixed(6)})`);
  }
}

async function runTests() {
  console.log('═'.repeat(80));
  console.log('CARBON TRACKER AGENT TEST SUITE');
  console.log('═'.repeat(80));

  const { CarbonTracker, createCarbonTracker } = await import(
    path.join(__dirname, '..', 'agents', 'carbon-tracker.js')
  );

  // =========================================================================
  // SECTION 1: MODULE STRUCTURE AND EXPORTS (~8 tests)
  // =========================================================================
  console.log('\n[SECTION 1] Module Structure and Exports');

  test(typeof CarbonTracker === 'function', 'ct_1: CarbonTracker class is exported');
  test(typeof createCarbonTracker === 'function', 'ct_2: createCarbonTracker factory function is exported');

  const tracker = new CarbonTracker({ organizationId: 'test-org', userId: 'test-user' });
  test(tracker !== null, 'ct_3: CarbonTracker instance can be created');
  test(typeof tracker.estimateEmissions === 'function', 'ct_4: estimateEmissions method exists');
  test(typeof tracker.getGridCarbonIntensity === 'function', 'ct_5: getGridCarbonIntensity method exists');
  test(typeof tracker.getProviderCarbonData === 'function', 'ct_6: getProviderCarbonData method exists');
  test(typeof tracker.generateSustainabilityScorecard === 'function', 'ct_7: generateSustainabilityScorecard method exists');
  test(typeof tracker.recommendGreenRouting === 'function', 'ct_8: recommendGreenRouting method exists');

  // =========================================================================
  // SECTION 2: GRID CARBON INTENSITY LOOKUPS (~20 tests)
  // =========================================================================
  console.log('\n[SECTION 2] Grid Carbon Intensity Region Lookups');

  // Major regions
  test(tracker.getGridCarbonIntensity('us-east-1') === 385, 'ct_9: us-east-1 intensity = 385 gCO2/kWh');
  test(tracker.getGridCarbonIntensity('us-west-2') === 156, 'ct_10: us-west-2 intensity = 156 gCO2/kWh (hydro)');
  test(tracker.getGridCarbonIntensity('eu-west-1') === 368, 'ct_11: eu-west-1 intensity = 368 gCO2/kWh');
  test(tracker.getGridCarbonIntensity('eu-central-1') === 420, 'ct_12: eu-central-1 intensity = 420 gCO2/kWh (coal)');
  test(tracker.getGridCarbonIntensity('ap-northeast-1') === 540, 'ct_13: ap-northeast-1 intensity = 540 gCO2/kWh');

  // GCP regions
  test(tracker.getGridCarbonIntensity('us-central1') === 380, 'ct_14: GCP us-central1 = 380 gCO2/kWh');
  test(tracker.getGridCarbonIntensity('us-west1') === 160, 'ct_15: GCP us-west1 = 160 gCO2/kWh (hydro)');
  test(tracker.getGridCarbonIntensity('europe-west1') === 240, 'ct_16: GCP europe-west1 = 240 gCO2/kWh (nuclear)');

  // Azure regions
  test(tracker.getGridCarbonIntensity('eastus') === 385, 'ct_17: Azure eastus = 385 gCO2/kWh');
  test(tracker.getGridCarbonIntensity('westus2') === 150, 'ct_18: Azure westus2 = 150 gCO2/kWh (hydro)');
  test(tracker.getGridCarbonIntensity('northeurope') === 50, 'ct_19: Azure northeurope = 50 gCO2/kWh (wind)');

  // Case insensitivity
  test(tracker.getGridCarbonIntensity('US-EAST-1') === 385, 'ct_20: Region lookup is case-insensitive');
  test(tracker.getGridCarbonIntensity('  us-east-1  ') === 385, 'ct_21: Region lookup trims whitespace');

  // Unknown regions fall back to default
  test(tracker.getGridCarbonIntensity('unknown-region') === 400, 'ct_22: Unknown region returns default 400 gCO2/kWh');
  test(tracker.getGridCarbonIntensity(null) === 400, 'ct_23: Null region returns default');
  test(tracker.getGridCarbonIntensity('') === 400, 'ct_24: Empty region returns default');

  // =========================================================================
  // SECTION 3: MODEL ENERGY CONSUMPTION LOOKUPS (~15 tests)
  // =========================================================================
  console.log('\n[SECTION 3] Model Energy Consumption Lookups');

  test(tracker.getModelEnergyConsumption('claude-3-opus') === 4.2, 'ct_25: Claude 3 Opus = 4.2 kWh/1M tokens');
  test(tracker.getModelEnergyConsumption('claude-3-sonnet') === 3.8, 'ct_26: Claude 3 Sonnet = 3.8 kWh/1M tokens');
  test(tracker.getModelEnergyConsumption('claude-3-haiku') === 2.1, 'ct_27: Claude 3 Haiku = 2.1 kWh/1M tokens (lighter)');
  test(tracker.getModelEnergyConsumption('claude-opus-4-6') === 4.5, 'ct_28: Claude Opus 4.6 = 4.5 kWh/1M tokens');

  test(tracker.getModelEnergyConsumption('gpt-4') === 5.2, 'ct_29: GPT-4 = 5.2 kWh/1M tokens');
  test(tracker.getModelEnergyConsumption('gpt-3.5-turbo') === 2.5, 'ct_30: GPT-3.5 Turbo = 2.5 kWh/1M tokens (lighter)');

  // Case insensitivity
  test(tracker.getModelEnergyConsumption('CLAUDE-3-OPUS') === 4.2, 'ct_31: Model lookup is case-insensitive');
  test(tracker.getModelEnergyConsumption('  gpt-4  ') === 5.2, 'ct_32: Model lookup trims whitespace');

  // Partial matches - search for longest matching key
  test(tracker.getModelEnergyConsumption('claude-3-opus-test') === 4.2, 'ct_33: Partial match "claude-3-opus*" returns 4.2');
  test(tracker.getModelEnergyConsumption('gpt-4-turbo-preview') === 4.8, 'ct_34: Partial match "gpt-4-turbo*" returns 4.8');

  // Unknown models fall back to default
  test(tracker.getModelEnergyConsumption('unknown-model') === 3.5, 'ct_35: Unknown model returns default 3.5 kWh/1M tokens');
  test(tracker.getModelEnergyConsumption(null) === 3.5, 'ct_36: Null model returns default');

  // =========================================================================
  // SECTION 4: PROVIDER PUE (Power Usage Effectiveness) (~8 tests)
  // =========================================================================
  console.log('\n[SECTION 4] Provider PUE Lookups');

  test(tracker.getProviderPUE('aws') === 1.11, 'ct_37: AWS PUE = 1.11 (most efficient)');
  test(tracker.getProviderPUE('gcp') === 1.10, 'ct_38: GCP PUE = 1.10 (most efficient)');
  test(tracker.getProviderPUE('azure') === 1.125, 'ct_39: Azure PUE = 1.125');
  test(tracker.getProviderPUE('AWS') === 1.11, 'ct_40: PUE lookup is case-insensitive');

  // Unknown providers use default
  test(tracker.getProviderPUE('unknown') === 1.15, 'ct_41: Unknown provider uses default 1.15');
  test(tracker.getProviderPUE(null) === 1.15, 'ct_42: Null provider uses default');

  // =========================================================================
  // SECTION 5: EMISSION ESTIMATION WITH KNOWN INPUTS (~30 tests)
  // =========================================================================
  console.log('\n[SECTION 5] Emission Estimation Calculations');

  // Test 1: Simple calculation - 1M Claude tokens on us-east-1 AWS
  // Energy = 1M tokens / 1M * 4.2 kWh = 4.2 kWh
  // With PUE 1.11: 4.2 * 1.11 = 4.662 kWh
  // Emissions = 4.662 kWh * 385 gCO2/kWh / 1M = 0.001795 tCO2e
  const result1 = tracker.estimateEmissions({
    tokens: 1000000,
    modelName: 'claude-3-opus',
    provider: 'aws',
    region: 'us-east-1'
  });
  test(result1.success === true, 'ct_43: Emission estimation succeeds with valid inputs');
  test(result1.emissions_tco2e > 0, 'ct_44: Emissions are positive for valid inputs');
  testClose(result1.emissions_tco2e, 0.001795, 0.0001, 'ct_45: 1M Claude tokens ≈ 0.001795 tCO2e on us-east-1');

  // Test 2: Lighter model should produce fewer emissions
  const result2 = tracker.estimateEmissions({
    tokens: 1000000,
    modelName: 'claude-3-haiku',
    provider: 'aws',
    region: 'us-east-1'
  });
  test(result2.emissions_tco2e < result1.emissions_tco2e, 'ct_46: Haiku produces fewer emissions than Opus');

  // Test 3: Cleaner region (us-west-2) produces fewer emissions
  const result3 = tracker.estimateEmissions({
    tokens: 1000000,
    modelName: 'claude-3-opus',
    provider: 'aws',
    region: 'us-west-2'
  });
  test(result3.emissions_tco2e < result1.emissions_tco2e, 'ct_47: us-west-2 (hydro) produces fewer emissions than us-east-1');

  // Test 4: Zero tokens = zero emissions
  const result4 = tracker.estimateEmissions({
    tokens: 0,
    modelName: 'claude-3-opus',
    provider: 'aws',
    region: 'us-east-1'
  });
  test(result4.success === true, 'ct_48: Zero tokens handled successfully');
  test(result4.emissions_tco2e === 0, 'ct_49: Zero tokens = zero emissions');

  // Test 5: Breakdown structure validation
  test(typeof result1.breakdown === 'object', 'ct_50: Result includes breakdown object');
  test(result1.breakdown.inference_emissions > 0, 'ct_51: Breakdown includes inference_emissions');
  test(result1.breakdown.idle_emissions === 0, 'ct_52: Breakdown includes idle_emissions (0 when hours=0)');
  test(result1.breakdown.total > 0, 'ct_53: Breakdown includes total emissions');

  // Test 6: Factors breakdown
  test(typeof result1.factors === 'object', 'ct_54: Result includes factors object');
  test(result1.factors.gridIntensity === 385, 'ct_55: Factors includes grid intensity');
  test(result1.factors.pue === 1.11, 'ct_56: Factors includes PUE');
  test(result1.factors.energyPerMTokens === 4.2, 'ct_57: Factors includes energy per 1M tokens');

  // =========================================================================
  // SECTION 6: EDGE CASES AND ERROR HANDLING (~12 tests)
  // =========================================================================
  console.log('\n[SECTION 6] Edge Cases and Error Handling');

  // Invalid inputs
  const invalidResult1 = tracker.estimateEmissions(null);
  test(invalidResult1.success === false, 'ct_58: Null input returns error');

  const invalidResult2 = tracker.estimateEmissions('not an object');
  test(invalidResult2.success === false, 'ct_59: String input returns error');

  const invalidResult3 = tracker.estimateEmissions({ tokens: -100 });
  test(invalidResult3.success === false, 'ct_60: Negative tokens return error');

  const invalidResult4 = tracker.estimateEmissions({ tokens: NaN });
  test(invalidResult4.success === false, 'ct_61: NaN tokens return error');

  const invalidResult5 = tracker.estimateEmissions({ tokens: Infinity });
  test(invalidResult5.success === false, 'ct_62: Infinity tokens return error (or handled gracefully)');

  // Emissions always non-negative
  const result5 = tracker.estimateEmissions({
    tokens: 1000000,
    modelName: 'unknown-model',
    provider: 'unknown-provider',
    region: 'unknown-region'
  });
  test(result5.success === true, 'ct_63: Unknown model/provider/region still succeeds (uses defaults)');
  test(result5.emissions_tco2e >= 0, 'ct_64: Emissions are always non-negative');

  // =========================================================================
  // SECTION 7: CARBON BUDGET CHECKING (~15 tests)
  // =========================================================================
  console.log('\n[SECTION 7] Carbon Budget Tracking and Alerts');

  // Add some emissions to the cache
  tracker.trackModelEmissions('claude-3-opus', 1000000, 'aws', 'us-east-1');
  tracker.trackModelEmissions('gpt-4', 500000, 'aws', 'us-east-1');

  // Test budget check with sufficient budget
  const budgetResult1 = tracker.checkCarbonBudget('org-123', 100);
  test(budgetResult1.success === true, 'ct_65: Carbon budget check succeeds');
  test(budgetResult1.alertLevel !== 'critical', 'ct_66: No critical alert with sufficient budget');
  test(budgetResult1.remaining > 0, 'ct_67: Remaining budget is positive');

  // Test budget check with tight budget
  const budgetResult2 = tracker.checkCarbonBudget('org-123', 0.002);
  test(budgetResult2.alertLevel === 'critical', 'ct_68: Critical alert when over budget');

  // Test invalid budget value
  const budgetResult3 = tracker.checkCarbonBudget('org-123', -10);
  test(budgetResult3.success === false, 'ct_69: Negative budget returns error');

  const budgetResult4 = tracker.checkCarbonBudget('org-123', 0);
  test(budgetResult4.success === false, 'ct_70: Zero budget returns error');

  // Test missing org ID
  const budgetResult5 = tracker.checkCarbonBudget(null, 100);
  test(budgetResult5.success === false, 'ct_71: Missing org ID returns error');

  // =========================================================================
  // SECTION 8: SUSTAINABILITY SCORECARD GENERATION (~12 tests)
  // =========================================================================
  console.log('\n[SECTION 8] Sustainability Scorecard Generation');

  const scorecard = tracker.generateSustainabilityScorecard('org-123', '30d');
  test(scorecard.success === true, 'ct_72: Scorecard generation succeeds');
  test(scorecard.summary !== undefined, 'ct_73: Scorecard includes summary');
  test(scorecard.summary.totalEmissions !== undefined, 'ct_74: Summary includes totalEmissions');
  test(scorecard.summary.esgScore !== undefined, 'ct_75: Summary includes ESG score');

  const esgScoreNum = parseFloat(scorecard.summary.esgScore);
  test(esgScoreNum >= 0 && esgScoreNum <= 100, 'ct_76: ESG score is between 0 and 100');

  test(Array.isArray(scorecard.modelEfficiency), 'ct_77: Scorecard includes modelEfficiency array');
  test(Array.isArray(scorecard.regionEfficiency), 'ct_78: Scorecard includes regionEfficiency array');
  test(Array.isArray(scorecard.recommendations), 'ct_79: Scorecard includes recommendations array');

  // Invalid org ID
  const scorecardError = tracker.generateSustainabilityScorecard(null);
  test(scorecardError.success === false, 'ct_80: Null org ID returns error');

  // =========================================================================
  // SECTION 9: GREEN ROUTING RECOMMENDATIONS (~18 tests)
  // =========================================================================
  console.log('\n[SECTION 9] Green Routing Recommendations');

  const routingResult1 = tracker.recommendGreenRouting({
    modelName: 'claude-3-opus',
    currentProvider: 'aws',
    currentRegion: 'eu-central-1',
    tokens: 1000000
  });

  test(routingResult1.success === true, 'ct_81: Green routing recommendation succeeds');
  test(routingResult1.currentEmissions_tco2e > 0, 'ct_82: Current emissions are calculated');
  test(Array.isArray(routingResult1.options), 'ct_83: Recommendations include options array');
  test(routingResult1.options.length > 0, 'ct_84: At least one option is provided');
  test(routingResult1.bestOption !== undefined, 'ct_85: Best option is identified');

  // Best option should have same or lower emissions
  test(
    routingResult1.bestOption.emissions_tco2e <= routingResult1.currentEmissions_tco2e,
    'ct_86: Best option has <= current emissions'
  );

  // Options should be sorted by emissions
  for (let i = 0; i < routingResult1.options.length - 1; i++) {
    test(
      routingResult1.options[i].emissions_tco2e <= routingResult1.options[i + 1].emissions_tco2e,
      `ct_${87 + i}: Options are sorted by emissions`
    );
  }

  // Test invalid request
  const routingError1 = tracker.recommendGreenRouting(null);
  test(routingError1.success === false, 'ct_90: Null request returns error');

  const routingError2 = tracker.recommendGreenRouting({ tokens: -1 });
  test(routingError2.success === false, 'ct_91: Negative tokens returns error');

  const routingError3 = tracker.recommendGreenRouting({ tokens: 0 });
  test(routingError3.success === false, 'ct_92: Zero tokens returns error');

  // =========================================================================
  // SECTION 10: PROVIDER CARBON DATA RETRIEVAL (~10 tests)
  // =========================================================================
  console.log('\n[SECTION 10] Provider Carbon Data Retrieval');

  const providerData1 = tracker.getProviderCarbonData('aws', '30d');
  test(providerData1.success === true, 'ct_93: AWS carbon data retrieval succeeds');
  test(providerData1.emissions_tco2e > 0, 'ct_94: AWS has emissions data');
  test(providerData1.breakdown !== undefined, 'ct_95: Breakdown included in result');

  const providerData2 = tracker.getProviderCarbonData('gcp', '30d');
  test(providerData2.success === true, 'ct_96: GCP carbon data retrieval succeeds');
  test(providerData2.emissions_tco2e > 0, 'ct_97: GCP has emissions data');

  const providerData3 = tracker.getProviderCarbonData('azure', '30d');
  test(providerData3.success === true, 'ct_98: Azure carbon data retrieval succeeds');

  // Unknown provider
  const providerError = tracker.getProviderCarbonData('unknown-provider');
  test(providerError.success === false, 'ct_99: Unknown provider returns error');

  // Missing provider
  const providerError2 = tracker.getProviderCarbonData(null);
  test(providerError2.success === false, 'ct_100: Null provider returns error');

  // =========================================================================
  // SECTION 11: MODEL EMISSION TRACKING (~8 tests)
  // =========================================================================
  console.log('\n[SECTION 11] Per-Model Emission Tracking');

  const tracker2 = new CarbonTracker({ organizationId: 'test-org2', userId: 'test-user2' });
  const trackResult = tracker2.trackModelEmissions('gpt-4', 500000, 'aws', 'us-east-1');

  test(trackResult.success === true, 'ct_101: Model emission tracking succeeds');
  test(trackResult.emissions_tco2e > 0, 'ct_102: Tracked emissions are positive');

  // Verify tracking was cached
  const scorecard2 = tracker2.generateSustainabilityScorecard('org-test2', '30d');
  test(scorecard2.summary.requestCount >= 1, 'ct_103: Tracked emissions appear in scorecard');

  // =========================================================================
  // SECTION 12: EXECUTE METHOD (ORCHESTRATOR COMPATIBILITY) (~10 tests)
  // =========================================================================
  console.log('\n[SECTION 12] Execute Method for Orchestrator Compatibility');

  const execTracker = new CarbonTracker({ organizationId: 'exec-test', userId: 'exec-user' });

  const exec1 = await execTracker.execute('estimate_emissions', {
    tokens: 1000000,
    modelName: 'claude-3-opus',
    provider: 'aws',
    region: 'us-east-1'
  });
  test(exec1.success === true, 'ct_104: Execute estimate_emissions succeeds');

  const exec2 = await execTracker.execute('get_provider_carbon_data', { provider: 'aws' });
  test(exec2.success === true, 'ct_105: Execute get_provider_carbon_data succeeds');

  const exec3 = await execTracker.execute('check_carbon_budget', { orgId: 'test', monthlyBudget: 100 });
  test(exec3.success === true, 'ct_106: Execute check_carbon_budget succeeds');

  const exec4 = await execTracker.execute('generate_scorecard', { orgId: 'test' });
  test(exec4.success === true, 'ct_107: Execute generate_scorecard succeeds');

  const exec5 = await execTracker.execute('recommend_green_routing', {
    modelName: 'claude-3-opus',
    currentProvider: 'aws',
    currentRegion: 'us-east-1',
    tokens: 1000000
  });
  test(exec5.success === true, 'ct_108: Execute recommend_green_routing succeeds');

  const exec6 = await execTracker.execute('unknown_task', {});
  test(exec6.success === false, 'ct_109: Unknown task returns error');

  // =========================================================================
  // SECTION 13: FACTORY FUNCTION (~3 tests)
  // =========================================================================
  console.log('\n[SECTION 13] Factory Function');

  const tracker3 = createCarbonTracker({ organizationId: 'factory-test', userId: 'factory-user' });
  test(tracker3 instanceof CarbonTracker, 'ct_110: Factory creates CarbonTracker instance');
  test(typeof tracker3.estimateEmissions === 'function', 'ct_111: Factory-created instance has methods');

  // =========================================================================
  // FINAL SUMMARY
  // =========================================================================
  console.log('\n' + '═'.repeat(80));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(80));

  if (failed > 0) {
    console.log('\nFailed tests:');
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f}`);
    });
    process.exit(1);
  } else {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
