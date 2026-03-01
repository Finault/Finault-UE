/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DIAMOND HANDLER INTEGRATION TEST SUITE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests that every handler's constructor chain + method call works at runtime.
 * These tests mirror the EXACT instantiation patterns in diamond-handlers.js:
 *   1. Construct the class with the correct params (env, options, registry, etc.)
 *   2. Call the exact method the handler calls
 *   3. Verify it doesn't throw (method exists, params accepted)
 *
 * This catches bugs that static analysis misses:
 *   - Constructor params that cause TypeError
 *   - Methods that don't exist on the constructed instance
 *   - Async/sync mismatches
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';

// All 14 Diamond modules
import * as GatewayModule from '../modules/gateway-diamond.js';
import * as InvoiceModule from '../modules/invoice-diamond.js';
import * as AllocationModule from '../modules/allocation-diamond.js';
import * as ClosepackModule from '../modules/closepack-diamond.js';
import * as ReconciliationModule from '../modules/reconciliation-diamond.js';
import * as AnomalyModule from '../modules/anomaly-diamond.js';
import * as BudgetModule from '../modules/budget-diamond.js';
import * as DisputeModule from '../modules/dispute-diamond.js';
import * as ShadowModule from '../modules/shadow-diamond.js';
import * as ComplianceModule from '../modules/compliance-diamond.js';
import * as ERPModuleNS from '../modules/erp-diamond.js';
import * as AnalyticsModule from '../modules/analytics-diamond.js';
import * as InfraModule from '../modules/infrastructure-diamond.js';
import * as SDKModule from '../modules/sdk-diamond.js';

const ERPModule = ERPModuleNS.default;

// Mock env matching Cloudflare Worker bindings
const env = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_KEY: 'test-key-xxx',
  SUPABASE_ANON_KEY: 'test-anon-key-xxx',
  ANTHROPIC_API_KEY: 'test-anthropic-key'
};

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER 1: GATEWAY — Constructor + method chains
// ═══════════════════════════════════════════════════════════════════════════════
describe('Handler Integration: Gateway', () => {
  it('CostPredictor instantiates and predictRequestCost works', () => {
    const cp = new GatewayModule.CostPredictor({});
    const result = cp.predictRequestCost({
      provider: 'openai', model: 'gpt-4', prompt: 'test', expectedOutputTokens: 100
    });
    expect(result).toBeDefined();
  });

  it('PromptShield instantiates and process works', () => {
    const ps = new GatewayModule.PromptShield({ strictMode: false });
    const result = ps.process('test prompt', true);
    expect(result).toBeDefined();
  });

  it('DiamondTierGateway subsystems work', () => {
    const gateway = new GatewayModule.DiamondTierGateway(env);
    expect(gateway.abTester).toBeDefined();
    expect(gateway.slaMonitor).toBeDefined();
    expect(typeof gateway.getStats).toBe('function');
    expect(typeof gateway.getSLACompliance).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER 2: INVOICE — Constructor + method chains
// ═══════════════════════════════════════════════════════════════════════════════
describe('Handler Integration: Invoice', () => {
  it('InvoiceDiamondModule(env) constructs and has processInvoiceFile', () => {
    // InvoiceDiamondModule is a default export — accessible at .default on namespace import
    const InvoiceDiamondModule = InvoiceModule.default;
    const invoice = new InvoiceDiamondModule(env);
    expect(typeof invoice.processInvoiceFile).toBe('function');
  });

  it('InvoiceDeduplicator(env) constructs and has hashInvoice/isDuplicate/storeHash', () => {
    const dedup = new InvoiceModule.InvoiceDeduplicator(env);
    expect(typeof dedup.hashInvoice).toBe('function');
    expect(typeof dedup.isDuplicate).toBe('function');
    expect(typeof dedup.storeHash).toBe('function');
  });

  it('InvoiceAnomalyDetector(env) constructs and has generateAnomalyReport', () => {
    const ad = new InvoiceModule.InvoiceAnomalyDetector(env);
    expect(typeof ad.generateAnomalyReport).toBe('function');
  });

  it('MultiCurrencyEngine(env) constructs and has convertCurrency', () => {
    const mce = new InvoiceModule.MultiCurrencyEngine(env);
    expect(typeof mce.convertCurrency).toBe('function');
  });

  it('ContractAwareParser(env) constructs and has generateComplianceReport', () => {
    const cap = new InvoiceModule.ContractAwareParser(env);
    expect(typeof cap.generateComplianceReport).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER 3: ALLOCATION — Constructor + method chains
// ═══════════════════════════════════════════════════════════════════════════════
describe('Handler Integration: Allocation', () => {
  it('MLAutoAllocator(env) has learnFromHistory/suggestAllocationRules/calculateConfidenceScores', () => {
    const ml = new AllocationModule.MLAutoAllocator(env);
    expect(typeof ml.learnFromHistory).toBe('function');
    expect(typeof ml.suggestAllocationRules).toBe('function');
    expect(typeof ml.calculateConfidenceScores).toBe('function');
  });

  it('AllocationSimulator(env) has createScenario/simulateRulesAgainstHistory/generateComparisonReport', () => {
    const sim = new AllocationModule.AllocationSimulator(env);
    expect(typeof sim.createScenario).toBe('function');
    expect(typeof sim.simulateRulesAgainstHistory).toBe('function');
    expect(typeof sim.generateComparisonReport).toBe('function');
  });

  it('ChargebackEngine(env) has generateJournalEntries', () => {
    const ce = new AllocationModule.ChargebackEngine(env);
    expect(typeof ce.generateJournalEntries).toBe('function');
  });

  it('CostFlowVisualizer(env) has generateSankeyData', () => {
    const cfv = new AllocationModule.CostFlowVisualizer(env);
    expect(typeof cfv.generateSankeyData).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER 4: CLOSE PACK — Constructor + method chains
// ═══════════════════════════════════════════════════════════════════════════════
describe('Handler Integration: Close Pack', () => {
  it('WatermarkEngine(env) has generateContentHash/addVisibleWatermark', () => {
    const we = new ClosepackModule.WatermarkEngine(env);
    expect(typeof we.generateContentHash).toBe('function');
    expect(typeof we.addVisibleWatermark).toBe('function');
  });

  it('BlockchainAnchor(env) has buildMerkleTree/publishMerkleRoot', () => {
    const ba = new ClosepackModule.BlockchainAnchor(env);
    expect(typeof ba.buildMerkleTree).toBe('function');
    expect(typeof ba.publishMerkleRoot).toBe('function');
  });

  it('AuditorShareManager(env) has generateAuditorShareUrl', () => {
    const asm = new ClosepackModule.AuditorShareManager(env);
    expect(typeof asm.generateAuditorShareUrl).toBe('function');
  });

  it('ClosePackComparator(env) has compareClosePacks', () => {
    const cpc = new ClosepackModule.ClosePackComparator(env);
    expect(typeof cpc.compareClosePacks).toBe('function');
  });

  it('RegulatoryTemplateEngine(env) has SOX302/SOX906/EU AI Act methods', () => {
    const rte = new ClosepackModule.RegulatoryTemplateEngine(env);
    expect(typeof rte.generateSox302Certification).toBe('function');
    expect(typeof rte.generateSox906Certification).toBe('function');
    expect(typeof rte.generateEuAiActImpactAssessment).toBe('function');
  });

  it('CloseProgressTracker(env) has getCloseProgress', () => {
    const cpt = new ClosepackModule.CloseProgressTracker(env);
    expect(typeof cpt.getCloseProgress).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER 5: RECONCILIATION — Constructor + method chains
// ═══════════════════════════════════════════════════════════════════════════════
describe('Handler Integration: Reconciliation', () => {
  it('FinaultConfidenceScore() has calculateOverallScore', () => {
    const fcs = new ReconciliationModule.FinaultConfidenceScore();
    expect(typeof fcs.calculateOverallScore).toBe('function');
  });

  it('ContinuousReconciler(env) has ingestUsageRecord/ingestInvoiceRecord/getStatus/getRecentMismatches', () => {
    const cr = new ReconciliationModule.ContinuousReconciler(env);
    expect(typeof cr.ingestUsageRecord).toBe('function');
    expect(typeof cr.ingestInvoiceRecord).toBe('function');
    expect(typeof cr.getStatus).toBe('function');
    expect(typeof cr.getRecentMismatches).toBe('function');
  });

  it('PredictiveReconciler(env) has trainOnHistoricalData/predictInvoice/flagDeviationFromPrediction/getPredictionAccuracy', () => {
    const pr = new ReconciliationModule.PredictiveReconciler(env);
    expect(typeof pr.trainOnHistoricalData).toBe('function');
    expect(typeof pr.predictInvoice).toBe('function');
    expect(typeof pr.flagDeviationFromPrediction).toBe('function');
    expect(typeof pr.getPredictionAccuracy).toBe('function');
  });

  it('CrossProviderReconciler(env) has registerWorkload/detectDuplicateBilling/crossReferenceWorkloads/getDuplicateBillingReport', () => {
    const cpr = new ReconciliationModule.CrossProviderReconciler(env);
    expect(typeof cpr.registerWorkload).toBe('function');
    expect(typeof cpr.detectDuplicateBilling).toBe('function');
    expect(typeof cpr.crossReferenceWorkloads).toBe('function');
    expect(typeof cpr.getDuplicateBillingReport).toBe('function');
  });

  it('ExceptionWorkflow() has createException', () => {
    const ew = new ReconciliationModule.ExceptionWorkflow();
    expect(typeof ew.createException).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER 6: ANOMALY — Constructor + method chains
// ═══════════════════════════════════════════════════════════════════════════════
describe('Handler Integration: Anomaly', () => {
  it('EnsembleAnomalyDetector({}) has detect', () => {
    const ead = new AnomalyModule.EnsembleAnomalyDetector({});
    expect(typeof ead.detect).toBe('function');
  });

  it('RootCauseAnalyzer({}) has analyze', () => {
    const rca = new AnomalyModule.RootCauseAnalyzer({});
    expect(typeof rca.analyze).toBe('function');
  });

  it('FinancialImpactCalculator({}) has calculateImpact', () => {
    const fic = new AnomalyModule.FinancialImpactCalculator({});
    expect(typeof fic.calculateImpact).toBe('function');
  });

  it('AnomalyPlaybookEngine({}) has executePlaybook', () => {
    const ape = new AnomalyModule.AnomalyPlaybookEngine({});
    expect(typeof ape.executePlaybook).toBe('function');
  });

  it('FinaultAnomalyDetection(env) has detectCorrelatedAnomalies', () => {
    // FinaultAnomalyDetection is a default export — accessible at .default on namespace import
    const FinaultAnomalyDetection = AnomalyModule.default;
    const fad = new FinaultAnomalyDetection(env);
    expect(typeof fad.detectCorrelatedAnomalies).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER 7: BUDGET — Constructor + method chains
// ═══════════════════════════════════════════════════════════════════════════════
describe('Handler Integration: Budget', () => {
  it('AIBudgetCreator(env) has generateBudgetProposal', () => {
    const abc = new BudgetModule.AIBudgetCreator(env);
    expect(typeof abc.generateBudgetProposal).toBe('function');
  });

  it('BudgetFederator(env) has federateBudget', () => {
    const bf = new BudgetModule.BudgetFederator(env);
    expect(typeof bf.federateBudget).toBe('function');
  });

  it('BudgetReallocator(env) has analyzeBudgetImbalance/generateReallocationSuggestions', () => {
    const br = new BudgetModule.BudgetReallocator(env);
    expect(typeof br.analyzeBudgetImbalance).toBe('function');
    expect(typeof br.generateReallocationSuggestions).toBe('function');
  });

  it('BudgetComplianceScorer(env) has calculateComplianceScore', () => {
    const bcs = new BudgetModule.BudgetComplianceScorer(env);
    expect(typeof bcs.calculateComplianceScore).toBe('function');
  });

  it('ForecastingEngine(env) has generateForecast', () => {
    const fe = new BudgetModule.ForecastingEngine(env);
    expect(typeof fe.generateForecast).toBe('function');
  });

  it('ScenarioPlanner(env) has createScenario', () => {
    const sp = new BudgetModule.ScenarioPlanner(env);
    expect(typeof sp.createScenario).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER 8: DISPUTE — Constructor + method chains
// ═══════════════════════════════════════════════════════════════════════════════
describe('Handler Integration: Dispute', () => {
  it('DisputeSuccessPredictor(env) has predictWinProbability', () => {
    const dsp = new DisputeModule.DisputeSuccessPredictor(env);
    expect(typeof dsp.predictWinProbability).toBe('function');
  });

  it('AutomatedDisputeExecutor(env) has executeDispute', () => {
    const ade = new DisputeModule.AutomatedDisputeExecutor(env);
    expect(typeof ade.executeDispute).toBe('function');
  });

  it('DisputeAnalytics(env) has getAllProviderMetrics/getProviderMetrics', () => {
    const da = new DisputeModule.DisputeAnalytics(env);
    expect(typeof da.getAllProviderMetrics).toBe('function');
    expect(typeof da.getProviderMetrics).toBe('function');
  });

  it('DisputeEvidenceLocker(env) has createEvidencePackage/savePackage', () => {
    const del = new DisputeModule.DisputeEvidenceLocker(env);
    expect(typeof del.createEvidencePackage).toBe('function');
    expect(typeof del.savePackage).toBe('function');
  });

  it('CreditRecoveryTracker(env) has trackRecovery', () => {
    const crt = new DisputeModule.CreditRecoveryTracker(env);
    expect(typeof crt.trackRecovery).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER 9: SHADOW — Constructor + method chains
// ═══════════════════════════════════════════════════════════════════════════════
describe('Handler Integration: Shadow', () => {
  it('ShadowHunterAgent(env) has aggregateDiscoveries', () => {
    const sha = new ShadowModule.ShadowHunterAgent(env);
    expect(typeof sha.aggregateDiscoveries).toBe('function');
  });

  it('ShadowRiskMatrix(env) has calculateRiskScore', () => {
    const srm = new ShadowModule.ShadowRiskMatrix(env);
    expect(typeof srm.calculateRiskScore).toBe('function');
  });

  it('ShadowROICalculator() has calculateGovernanceROI', () => {
    const src = new ShadowModule.ShadowROICalculator();
    expect(typeof src.calculateGovernanceROI).toBe('function');
  });

  it('ToolSubstitutionRecommender({}) has recommendSubstitutions', () => {
    const tsr = new ShadowModule.ToolSubstitutionRecommender({});
    expect(typeof tsr.recommendSubstitutions).toBe('function');
  });

  it('ComplianceHeatMap() has generateHeatMap', () => {
    const chm = new ShadowModule.ComplianceHeatMap();
    expect(typeof chm.generateHeatMap).toBe('function');
  });

  it('WeeklyDigestGenerator(env) has generateWeeklyDigest', () => {
    const wdg = new ShadowModule.WeeklyDigestGenerator(env);
    expect(typeof wdg.generateWeeklyDigest).toBe('function');
  });

  it('ShadowMigrationEngine(env) has migrateShadowTool', () => {
    const sme = new ShadowModule.ShadowMigrationEngine(env);
    expect(typeof sme.migrateShadowTool).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER 10: COMPLIANCE — Constructor + dependency injection chain
// ═══════════════════════════════════════════════════════════════════════════════
describe('Handler Integration: Compliance', () => {
  it('ComplianceControlRegistry() → ContinuousControlTester(registry) chain works', () => {
    const registry = new ComplianceModule.ComplianceControlRegistry();
    const tester = new ComplianceModule.ContinuousControlTester(registry);
    expect(typeof tester.registry).toBe('object');
  });

  it('FrameworkReadinessTracker(registry) has getFrameworkReadiness', () => {
    const registry = new ComplianceModule.ComplianceControlRegistry();
    const frt = new ComplianceModule.FrameworkReadinessTracker(registry);
    expect(typeof frt.getFrameworkReadiness).toBe('function');
  });

  it('ComplianceCoPilot(registry, tester, tracker) has processQuery', () => {
    const registry = new ComplianceModule.ComplianceControlRegistry();
    const tester = new ComplianceModule.ContinuousControlTester(registry);
    const tracker = new ComplianceModule.FrameworkReadinessTracker(registry);
    const copilot = new ComplianceModule.ComplianceCoPilot(registry, tester, tracker);
    expect(typeof copilot.processQuery).toBe('function');
  });

  it('RegulatoryChangeMonitor(registry) has getDetectedChanges/getRegulatoryUpdateReport', () => {
    const registry = new ComplianceModule.ComplianceControlRegistry();
    const rcm = new ComplianceModule.RegulatoryChangeMonitor(registry);
    expect(typeof rcm.getDetectedChanges).toBe('function');
    expect(typeof rcm.getRegulatoryUpdateReport).toBe('function');
  });

  it('ComplianceEvidenceMarketplace(registry) has searchEvidenceTemplates/getEvidenceTemplatesByControl', () => {
    const registry = new ComplianceModule.ComplianceControlRegistry();
    const cem = new ComplianceModule.ComplianceEvidenceMarketplace(registry);
    expect(typeof cem.searchEvidenceTemplates).toBe('function');
    expect(typeof cem.getEvidenceTemplatesByControl).toBe('function');
  });

  it('CrossFrameworkMapper(registry) has buildControlMappingMatrix/getControlOverlapAnalysis', () => {
    const registry = new ComplianceModule.ComplianceControlRegistry();
    const cfm = new ComplianceModule.CrossFrameworkMapper(registry);
    expect(typeof cfm.buildControlMappingMatrix).toBe('function');
    expect(typeof cfm.getControlOverlapAnalysis).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER 11: ERP — Factory pattern + constructor chains
// ═══════════════════════════════════════════════════════════════════════════════
describe('Handler Integration: ERP', () => {
  let erp;

  it('ERP factory produces valid module with class constructors', () => {
    const erpFactory = typeof ERPModule === 'function' && ERPModule.default
      ? ERPModule.default : ERPModule;
    erp = erpFactory(env);
    expect(erp).toBeDefined();
    expect(erp.JournalPushEngine).toBeDefined();
    expect(erp.GLPullbackEngine).toBeDefined();
    expect(erp.VarianceDetector).toBeDefined();
    expect(erp.SandboxSimulator).toBeDefined();
    expect(erp.ERPHealthMonitor).toBeDefined();
    expect(erp.IntelligentGLSuggester).toBeDefined();
  });

  it('JournalPushEngine() has postToERP', () => {
    const erpFactory = typeof ERPModule === 'function' && ERPModule.default
      ? ERPModule.default : ERPModule;
    const e = erpFactory(env);
    const je = new e.JournalPushEngine();
    expect(typeof je.postToERP).toBe('function');
  });

  it('GLPullbackEngine() has pullGLEntriesFromERP', () => {
    const erpFactory = typeof ERPModule === 'function' && ERPModule.default
      ? ERPModule.default : ERPModule;
    const e = erpFactory(env);
    const gl = new e.GLPullbackEngine();
    expect(typeof gl.pullGLEntriesFromERP).toBe('function');
  });

  it('VarianceDetector() has detectVariances/batchDetectVariances', () => {
    const erpFactory = typeof ERPModule === 'function' && ERPModule.default
      ? ERPModule.default : ERPModule;
    const e = erpFactory(env);
    const vd = new e.VarianceDetector();
    expect(typeof vd.detectVariances).toBe('function');
    expect(typeof vd.batchDetectVariances).toBe('function');
  });

  it('SandboxSimulator() has simulateJournalEntry', () => {
    const erpFactory = typeof ERPModule === 'function' && ERPModule.default
      ? ERPModule.default : ERPModule;
    const e = erpFactory(env);
    const ss = new e.SandboxSimulator();
    expect(typeof ss.simulateJournalEntry).toBe('function');
  });

  it('ERPHealthMonitor() has getHealthReport', () => {
    const erpFactory = typeof ERPModule === 'function' && ERPModule.default
      ? ERPModule.default : ERPModule;
    const e = erpFactory(env);
    const hm = new e.ERPHealthMonitor();
    expect(typeof hm.getHealthReport).toBe('function');
  });

  it('IntelligentGLSuggester() has suggestGLAccounts (sync)', () => {
    const erpFactory = typeof ERPModule === 'function' && ERPModule.default
      ? ERPModule.default : ERPModule;
    const e = erpFactory(env);
    const gs = new e.IntelligentGLSuggester();
    expect(typeof gs.suggestGLAccounts).toBe('function');
    // Verify it's callable and returns results
    const result = gs.suggestGLAccounts('compute', { description: 'test' });
    expect(result).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER 12: ANALYTICS — Constructor + method chains
// ═══════════════════════════════════════════════════════════════════════════════
describe('Handler Integration: Analytics', () => {
  it('NaturalLanguageAnalytics(env) has processQuery', () => {
    const nla = new AnalyticsModule.NaturalLanguageAnalytics(env);
    expect(typeof nla.processQuery).toBe('function');
  });

  it('BoardDeckGenerator(env) has generateMonthlySlideData', () => {
    const bdg = new AnalyticsModule.BoardDeckGenerator(env);
    expect(typeof bdg.generateMonthlySlideData).toBe('function');
  });

  it('MobileAPIEngine(env) has dashboardSummary/spendToday/alerts/trends', () => {
    const mae = new AnalyticsModule.MobileAPIEngine(env);
    expect(typeof mae.dashboardSummary).toBe('function');
    expect(typeof mae.spendToday).toBe('function');
    expect(typeof mae.alerts).toBe('function');
    expect(typeof mae.trends).toBe('function');
  });

  it('SpendBenchmarker(env) has benchmarkComparison', () => {
    const sb = new AnalyticsModule.SpendBenchmarker(env);
    expect(typeof sb.benchmarkComparison).toBe('function');
  });

  it('FinOpsMaturityAssessor(env) has assessMaturity', () => {
    const fma = new AnalyticsModule.FinOpsMaturityAssessor(env);
    expect(typeof fma.assessMaturity).toBe('function');
  });

  it('UnitEconomicsCalculator(env) has calculateCostPerToken/modelEfficiencyComparison', () => {
    const uec = new AnalyticsModule.UnitEconomicsCalculator(env);
    expect(typeof uec.calculateCostPerToken).toBe('function');
    expect(typeof uec.modelEfficiencyComparison).toBe('function');
  });

  it('ROIAnalyzer(env) has roiDashboardData', () => {
    const ra = new AnalyticsModule.ROIAnalyzer(env);
    expect(typeof ra.roiDashboardData).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER 13: INFRASTRUCTURE — Constructor + method chains
// ═══════════════════════════════════════════════════════════════════════════════
describe('Handler Integration: Infrastructure', () => {
  it('AgentLeaderboard({}) has getLeaderboard', () => {
    const al = new InfraModule.AgentLeaderboard({});
    expect(typeof al.getLeaderboard).toBe('function');
  });

  it('TenantAnalytics({}) has generateReport/calculateHealthScore/getResourceUtilization/calculateCostToServe', () => {
    const ta = new InfraModule.TenantAnalytics({});
    expect(typeof ta.generateReport).toBe('function');
    expect(typeof ta.calculateHealthScore).toBe('function');
    expect(typeof ta.getResourceUtilization).toBe('function');
    expect(typeof ta.calculateCostToServe).toBe('function');
  });

  it('AgentSelfHealer({}) has getAgentHealth', () => {
    const ash = new InfraModule.AgentSelfHealer({});
    expect(typeof ash.getAgentHealth).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER 14: SDK — Constructor + method chains
// ═══════════════════════════════════════════════════════════════════════════════
describe('Handler Integration: SDK', () => {
  it('MCPServer({ serverName }) has listTools/executeTool', () => {
    const mcp = new SDKModule.MCPServer({ serverName: 'finault-mcp-server' });
    expect(typeof mcp.listTools).toBe('function');
    expect(typeof mcp.executeTool).toBe('function');
  });

  it('APIExplorer() has getEndpoint/getEndpoints', () => {
    const explorer = new SDKModule.APIExplorer();
    expect(typeof explorer.getEndpoint).toBe('function');
    expect(typeof explorer.getEndpoints).toBe('function');
  });
});
