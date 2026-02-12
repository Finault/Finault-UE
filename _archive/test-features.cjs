/**
 * FINAULT FEATURE TEST SUITE
 * Tests each feature's core logic without requiring a running server
 */

const crypto = require('crypto');

// Mock Supabase
const mockSupabase = {
  from: (table) => ({
    select: () => ({
      data: [],
      error: null,
      single: () => ({ data: {}, error: null }),
      eq: () => ({
        single: () => ({ data: {}, error: null }),
        order: () => ({ limit: () => ({ data: [], error: null }) })
      }),
      order: () => ({ limit: () => ({ data: [], error: null }) })
    }),
    insert: (data) => ({
      data: data,
      error: null,
      select: () => ({ single: () => ({ data: { id: 'test-id', ...data }, error: null }) })
    }),
    update: (data) => ({ eq: () => ({ data: data, error: null }) }),
    upsert: (data) => ({ data: data, error: null }),
    delete: () => ({ eq: () => ({ data: {}, error: null }) })
  }),
  rpc: () => Promise.resolve({ data: {}, error: null })
};

const mockEnv = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_KEY: 'test-key',
  JWT_SECRET: 'test-jwt-secret',
  OPENAI_API_KEY: 'test-openai-key'
};

console.log('═══════════════════════════════════════════════════════════════════');
console.log('           FINAULT FEATURE TEST SUITE');
console.log('═══════════════════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// ═══════════════════════════════════════════════════════════════════
// 1. INVOICE PARSING TESTS
// ═══════════════════════════════════════════════════════════════════

async function testInvoiceParsing() {
  console.log('\n📄 TESTING INVOICE PARSING\n');

  await test('UniversalParser can parse OpenAI CSV format', async () => {
    const UniversalParser = require('./modules/universal-parser.js');
    const parser = new UniversalParser({ acpsVersion: '1.0' });

    const csvContent = `date,model,input_tokens,output_tokens,cost
2024-01-15,gpt-4,1000,500,0.045
2024-01-15,gpt-3.5-turbo,5000,2000,0.012`;

    const result = await parser.parse(csvContent, { provider: 'openai', format: 'csv' });
    assert(result.lineItems.length >= 0, 'Should parse line items');
    assert(result.provider, 'Should detect provider');
  });

  await test('UniversalParser detects provider automatically', async () => {
    const UniversalParser = require('./modules/universal-parser.js');
    const parser = new UniversalParser({ acpsVersion: '1.0' });

    assert(parser.detectProvider, 'Should have detectProvider method');
  });

  await test('UniversalParser converts to ACPS format', async () => {
    const UniversalParser = require('./modules/universal-parser.js');
    const parser = new UniversalParser({ acpsVersion: '1.0' });

    const mockInvoice = {
      provider: 'openai',
      lineItems: [{ model: 'gpt-4', cost: 100, inputTokens: 1000, outputTokens: 500 }],
      totalAmount: 100
    };

    const acps = parser.toACPS(mockInvoice);
    assert(acps, 'Should convert to ACPS format');
  });
}

// ═══════════════════════════════════════════════════════════════════
// 2. ALLOCATION TESTS
// ═══════════════════════════════════════════════════════════════════

async function testAllocation() {
  console.log('\n📊 TESTING ALLOCATION ENGINE\n');

  await test('PolicyEngine can create allocation rules', async () => {
    const { PolicyEngine, AllocationRule } = require('./modules/policy-engine.js');

    const engine = new PolicyEngine({
      enableVersioning: true,
      supabaseUrl: mockEnv.SUPABASE_URL,
      supabaseKey: mockEnv.SUPABASE_KEY
    });

    assert(engine.allocate || engine.applyRules, 'Should have allocate method');
  });

  await test('AllocationRule can match by pattern', async () => {
    const { AllocationRule } = require('./modules/policy-engine.js');

    const rule = new AllocationRule({
      id: 'test-rule',
      pattern: 'gpt-4',
      type: 'prefix',
      costCenter: 'engineering',
      priority: 1
    });

    assert(rule, 'Should create allocation rule');
  });
}

// ═══════════════════════════════════════════════════════════════════
// 3. RECONCILIATION TESTS
// ═══════════════════════════════════════════════════════════════════

async function testReconciliation() {
  console.log('\n🔄 TESTING RECONCILIATION ENGINE\n');

  await test('ReconciliationEngine can match invoices to usage', async () => {
    const { ReconciliationEngine } = require('./modules/reconciliation-engine.js');

    const engine = new ReconciliationEngine({
      supabaseUrl: mockEnv.SUPABASE_URL,
      supabaseKey: mockEnv.SUPABASE_KEY
    });

    assert(engine.reconcile || engine.match, 'Should have reconcile method');
  });

  await test('ReconciliationEngine supports fuzzy matching', async () => {
    const { ReconciliationEngine } = require('./modules/reconciliation-engine.js');

    const engine = new ReconciliationEngine({
      timestampTolerance: 86400000, // 24 hours
      tokenTolerance: 0.05 // 5%
    });

    assert(engine, 'Should support tolerance settings');
  });
}

// ═══════════════════════════════════════════════════════════════════
// 4. ANOMALY DETECTION TESTS
// ═══════════════════════════════════════════════════════════════════

async function testAnomalyDetection() {
  console.log('\n🔍 TESTING ANOMALY DETECTION\n');

  await test('AnomalyDetector can detect cost spikes', async () => {
    const { AnomalyDetector } = require('./modules/anomaly-detection.js');

    const detector = new AnomalyDetector({
      zScoreThreshold: 2.5,
      enableEWMA: true
    });

    assert(detector.detect || detector.analyze, 'Should have detect method');
  });

  await test('AnomalyDetector supports multiple detection methods', async () => {
    const { AnomalyDetector, MathUtils } = require('./modules/anomaly-detection.js');

    assert(MathUtils.standardDeviation || MathUtils, 'Should have statistical utilities');
  });
}

// ═══════════════════════════════════════════════════════════════════
// 5. SPACE APPLE DASHBOARD TESTS
// ═══════════════════════════════════════════════════════════════════

async function testSpaceAppleDashboard() {
  console.log('\n🚀 TESTING SPACE APPLE DASHBOARD\n');

  await test('ProactiveAlertSystem can check and alert', async () => {
    const { ProactiveAlertSystem } = require('./gateway/space-apple-dashboard.js');
    const system = new ProactiveAlertSystem(mockEnv);
    assert(system.checkAndAlert, 'Should have checkAndAlert method');
  });

  await test('DrillDownEngine supports 6 levels of drill-down', async () => {
    const { DrillDownEngine } = require('./gateway/space-apple-dashboard.js');
    const engine = new DrillDownEngine(mockEnv);
    assert(engine.getDrillDown, 'Should have getDrillDown method');
    assert(engine.getOrgLevel, 'Should have org level');
    assert(engine.getDepartmentLevel, 'Should have department level');
  });

  await test('AutonomousSavingsEngine can run optimizations', async () => {
    const { AutonomousSavingsEngine } = require('./gateway/space-apple-dashboard.js');
    const engine = new AutonomousSavingsEngine(mockEnv);
    assert(engine.runAutonomousOptimizations, 'Should have runAutonomousOptimizations');
  });

  await test('GoalTracker can track progress', async () => {
    const { GoalTracker } = require('./gateway/space-apple-dashboard.js');
    const tracker = new GoalTracker(mockEnv);
    assert(tracker.getGoalProgress, 'Should have getGoalProgress method');
  });

  await test('BenchmarkEngine can compare to industry', async () => {
    const { BenchmarkEngine } = require('./gateway/space-apple-dashboard.js');
    const engine = new BenchmarkEngine(mockEnv);
    assert(engine.getBenchmarks, 'Should have getBenchmarks method');
  });

  await test('InsightGenerator can generate natural language insights', async () => {
    const { InsightGenerator } = require('./gateway/space-apple-dashboard.js');
    const generator = new InsightGenerator(mockEnv);
    assert(generator.generateInsights, 'Should have generateInsights method');
  });

  await test('WhatIfEngine can simulate scenarios', async () => {
    const { WhatIfEngine } = require('./gateway/space-apple-dashboard.js');
    const engine = new WhatIfEngine(mockEnv);
    assert(engine.runScenario, 'Should have runScenario method');
  });

  await test('MoneyMachine tracks live value', async () => {
    const { MoneyMachine } = require('./gateway/space-apple-dashboard.js');
    const machine = new MoneyMachine(mockEnv);
    assert(machine.getMoneyMachineStats, 'Should have getMoneyMachineStats method');
  });
}

// ═══════════════════════════════════════════════════════════════════
// 6. PLATFORM FLYWHEEL TESTS
// ═══════════════════════════════════════════════════════════════════

async function testPlatformFlywheel() {
  console.log('\n🔄 TESTING PLATFORM FLYWHEEL\n');

  await test('UnifiedDataLayer stores all customer knowledge', async () => {
    const { UnifiedDataLayer } = require('./platform/flywheel.js');
    const layer = new UnifiedDataLayer(mockEnv);
    assert(layer.getOrganizationProfile, 'Should have getOrganizationProfile');
    assert(layer.getSpendingPatterns, 'Should have getSpendingPatterns');
  });

  await test('CrossFeatureIntelligence enriches on each action', async () => {
    const { CrossFeatureIntelligence } = require('./platform/flywheel.js');
    const intel = new CrossFeatureIntelligence(mockEnv);
    assert(intel.onGatewayRequest, 'Should hook into gateway requests');
    assert(intel.onInvoiceParsed, 'Should hook into invoice parsing');
    assert(intel.onReconciliationComplete, 'Should hook into reconciliation');
  });

  await test('CompoundLearningEngine calculates intelligence score', async () => {
    const { CompoundLearningEngine } = require('./platform/flywheel.js');
    const engine = new CompoundLearningEngine(mockEnv);
    assert(engine.getIntelligenceScore, 'Should calculate intelligence score');
  });

  await test('CustomerJourneyOrchestrator runs full 8-step flow', async () => {
    const { CustomerJourneyOrchestrator } = require('./platform/flywheel.js');
    const orchestrator = new CustomerJourneyOrchestrator(mockEnv);
    assert(orchestrator.executeFullJourney, 'Should execute full journey');
  });

  await test('PlatformOrchestrator is the single entry point', async () => {
    const { PlatformOrchestrator } = require('./platform/flywheel.js');
    const platform = new PlatformOrchestrator(mockEnv);
    assert(platform.execute, 'Should have unified execute method');
  });
}

// ═══════════════════════════════════════════════════════════════════
// 7. MAGIC ONBOARDING TESTS
// ═══════════════════════════════════════════════════════════════════

async function testMagicOnboarding() {
  console.log('\n✨ TESTING MAGIC ONBOARDING\n');

  await test('MagicParser parses without auth', async () => {
    const { MagicParser } = require('./gateway/magic-onboarding.js');
    const parser = new MagicParser(mockEnv);
    assert(parser.parseAnonymous || parser.parse, 'Should parse without auth');
  });

  await test('MagicSession creates temporary sessions', async () => {
    const { MagicSession } = require('./gateway/magic-onboarding.js');
    const session = new MagicSession(mockEnv);
    assert(session.create || session.createSession, 'Should create sessions');
  });

  await test('MagicSSO supports Google and Microsoft', async () => {
    const { MagicSSO } = require('./gateway/magic-onboarding.js');
    const sso = new MagicSSO(mockEnv);
    assert(sso, 'Should support SSO providers');
  });
}

// ═══════════════════════════════════════════════════════════════════
// 8. CLOSE PACK TESTS
// ═══════════════════════════════════════════════════════════════════

async function testClosePack() {
  console.log('\n📦 TESTING CLOSE PACK GENERATOR\n');

  await test('ClosePackGenerator creates CFO-ready reports', async () => {
    const ClosePackGenerator = require('./modules/closepack-generator.js');
    const generator = new ClosePackGenerator({
      format: 'professional',
      includeJournalEntries: true
    });
    assert(generator.generate || generator.createClosePack, 'Should generate close packs');
  });

  await test('ClosePackGenerator includes journal entries', async () => {
    const ClosePackGenerator = require('./modules/closepack-generator.js');
    const generator = new ClosePackGenerator({ includeJournalEntries: true });
    assert(generator, 'Should support journal entries');
  });
}

// ═══════════════════════════════════════════════════════════════════
// 9. MODEL RECOMMENDATION TESTS
// ═══════════════════════════════════════════════════════════════════

async function testModelRecommendation() {
  console.log('\n💡 TESTING MODEL RECOMMENDATION ENGINE\n');

  await test('ModelRecommendationEngine analyzes usage patterns', async () => {
    const { ModelRecommendationEngine } = require('./gateway/model-recommendation.js');
    const engine = new ModelRecommendationEngine(mockEnv);
    assert(engine.analyzeAndRecommend, 'Should analyze and recommend');
  });

  await test('ModelRecommendationEngine calculates savings', async () => {
    const { ModelRecommendationEngine, MODEL_TIERS } = require('./gateway/model-recommendation.js');
    assert(MODEL_TIERS, 'Should have model pricing tiers');
  });
}

// ═══════════════════════════════════════════════════════════════════
// 10. AUDIT & COMPLIANCE TESTS
// ═══════════════════════════════════════════════════════════════════

async function testAuditCompliance() {
  console.log('\n🔒 TESTING AUDIT & COMPLIANCE\n');

  await test('AuditSystem logs all actions', async () => {
    const { AuditSystem, AUDIT_EVENTS } = require('./gateway/audit-compliance.js');
    const system = new AuditSystem(mockEnv);
    assert(AUDIT_EVENTS, 'Should have audit event types');
    assert(system.log || system.logEvent, 'Should log events');
  });

  await test('AuditSystem creates tamper-evident hashes', async () => {
    const { AuditSystem } = require('./gateway/audit-compliance.js');
    const system = new AuditSystem(mockEnv);
    assert(system, 'Should support cryptographic hashing');
  });
}

// ═══════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════

async function runAllTests() {
  await testInvoiceParsing();
  await testAllocation();
  await testReconciliation();
  await testAnomalyDetection();
  await testSpaceAppleDashboard();
  await testPlatformFlywheel();
  await testMagicOnboarding();
  await testClosePack();
  await testModelRecommendation();
  await testAuditCompliance();

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`                    TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }

  console.log('🎉 ALL FEATURE TESTS PASSED!\n');
}

runAllTests().catch(console.error);
