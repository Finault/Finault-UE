/**
 * REGULATORY INTELLIGENCE TEST SUITE
 * Tests for compliance monitoring and regulatory mapping
 *
 * Coverage: ~180 tests across all RegulatoryIntel methods
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(message);
        console.log(`  ✗ FAIL: ${message}`);
    }
}

function assertExists(obj, path, message) {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
            current = current[key];
        } else {
            failed++;
            failures.push(message);
            console.log(`  ✗ FAIL: ${message}`);
            return;
        }
    }
    passed++;
    console.log(`  ✓ ${message}`);
}

async function runTests() {
    console.log('═'.repeat(70));
    console.log('REGULATORY INTELLIGENCE TEST SUITE');
    console.log('═'.repeat(70));

    // Mock environment to avoid Supabase initialization
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-key-123456789';

    const { RegulatoryIntel, REGULATORY_FRAMEWORKS } = await import(
        path.join(__dirname, '..', 'agents', 'regulatory-intel.js')
    );

    // =========================================================================
    // SECTION 1: REGULATORY_FRAMEWORKS Constants (~40 tests)
    // =========================================================================
    console.log('\n[SECTION 1] REGULATORY_FRAMEWORKS');

    // ri_001: Framework object exists
    assert(typeof REGULATORY_FRAMEWORKS === 'object', 'ri_001: REGULATORY_FRAMEWORKS is object');

    // ri_002: All required frameworks present
    assert(REGULATORY_FRAMEWORKS.EU_AI_ACT !== undefined, 'ri_002: EU_AI_ACT framework');
    assert(REGULATORY_FRAMEWORKS.NIST_AI_RMF !== undefined, 'ri_003: NIST_AI_RMF framework');
    assert(REGULATORY_FRAMEWORKS.SOX_404 !== undefined, 'ri_004: SOX_404 framework');
    assert(REGULATORY_FRAMEWORKS.GDPR !== undefined, 'ri_005: GDPR framework');
    assert(REGULATORY_FRAMEWORKS.SOC_2 !== undefined, 'ri_006: SOC_2 framework');

    // ri_007: EU AI Act properties
    const euAI = REGULATORY_FRAMEWORKS.EU_AI_ACT;
    assert(euAI.name !== undefined, 'ri_007: EU AI Act has name');
    assert(euAI.jurisdiction === 'European Union', 'ri_008: EU AI Act jurisdiction');
    assert(euAI.version !== undefined, 'ri_009: EU AI Act version');
    assert(euAI.riskCategories !== undefined, 'ri_010: EU AI Act risk categories');
    assert(Array.isArray(euAI.riskCategories.prohibited), 'ri_011: Prohibited category is array');
    assert(Array.isArray(euAI.riskCategories.highRisk), 'ri_012: High-risk category is array');
    assert(euAI.keyRequirements !== undefined, 'ri_013: EU AI Act requirements');

    // ri_014: NIST AI RMF properties
    const nist = REGULATORY_FRAMEWORKS.NIST_AI_RMF;
    assert(nist.name !== undefined, 'ri_014: NIST has name');
    assert(nist.jurisdiction === 'United States', 'ri_015: NIST jurisdiction');
    assert(nist.pillars !== undefined, 'ri_016: NIST pillars defined');
    assert(nist.pillars.Govern !== undefined, 'ri_017: Govern pillar');
    assert(nist.pillars.Map !== undefined, 'ri_018: Map pillar');
    assert(nist.pillars.Measure !== undefined, 'ri_019: Measure pillar');
    assert(nist.pillars.Manage !== undefined, 'ri_020: Manage pillar');

    // ri_021: SOX 404 properties
    const sox = REGULATORY_FRAMEWORKS.SOX_404;
    assert(sox.name !== undefined, 'ri_021: SOX has name');
    assert(sox.framework === 'COSO Internal Control Framework', 'ri_022: SOX framework');
    assert(sox.applicability !== undefined, 'ri_023: SOX applicability');
    assert(sox.keyRequirements !== undefined, 'ri_024: SOX requirements');

    // ri_025: GDPR properties
    const gdpr = REGULATORY_FRAMEWORKS.GDPR;
    assert(gdpr.name !== undefined, 'ri_025: GDPR has name');
    assert(gdpr.jurisdiction === 'European Union', 'ri_026: GDPR jurisdiction');
    assert(gdpr.articles !== undefined, 'ri_027: GDPR articles');
    assert(gdpr.articles.Art_17 !== undefined, 'ri_028: GDPR Art. 17');
    assert(gdpr.articles.Art_20 !== undefined, 'ri_029: GDPR Art. 20');

    // ri_030: SOC 2 properties
    const soc2 = REGULATORY_FRAMEWORKS.SOC_2;
    assert(soc2.name !== undefined, 'ri_030: SOC 2 has name');
    assert(soc2.trustCriteria !== undefined, 'ri_031: SOC 2 trust criteria');
    assert(soc2.trustCriteria.Security !== undefined, 'ri_032: Security criterion');
    assert(soc2.trustCriteria.Availability !== undefined, 'ri_033: Availability criterion');
    assert(soc2.trustCriteria.Privacy !== undefined, 'ri_034: Privacy criterion');

    // ri_035: Deadlines present
    assert(euAI.deadlines !== undefined, 'ri_035: EU AI Act deadlines');
    assert(nist.deadlines !== undefined, 'ri_036: NIST deadlines');
    assert(sox.deadlines !== undefined, 'ri_037: SOX deadlines');
    assert(gdpr.deadlines !== undefined, 'ri_038: GDPR deadlines');
    assert(soc2.deadlines !== undefined, 'ri_039: SOC 2 deadlines');

    // ri_040: Last updated dates
    assert(euAI.lastUpdated !== undefined, 'ri_040: EU AI Act lastUpdated');
    assert(nist.lastUpdated !== undefined, 'ri_041: NIST lastUpdated');

    // =========================================================================
    // SECTION 2: RegulatoryIntel Constructor & Initialization (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 2] RegulatoryIntel Constructor & Initialization');

    // ri_042: Constructor creates instance
    const intel = new RegulatoryIntel({
        organizationId: 'test-org',
        userId: 'test-user'
    });
    assert(intel !== null, 'ri_042: RegulatoryIntel instance created');
    assert(intel.organizationId === 'test-org', 'ri_043: Organization ID set');
    assert(intel.userId === 'test-user', 'ri_044: User ID set');
    assert(intel.memory !== null, 'ri_045: Memory initialized');
    assert(intel.frameworks !== undefined, 'ri_046: Frameworks loaded');

    // ri_047: Key methods exist
    assert(typeof intel.scanRegulatoryChanges === 'function', 'ri_047: scanRegulatoryChanges exists');
    assert(typeof intel.assessComplianceGap === 'function', 'ri_048: assessComplianceGap exists');
    assert(typeof intel.generateReadinessScorecard === 'function', 'ri_049: generateReadinessScorecard exists');
    assert(typeof intel.recommendPolicyUpdates === 'function', 'ri_050: recommendPolicyUpdates exists');
    assert(typeof intel.trackFrameworkDeadlines === 'function', 'ri_051: trackFrameworkDeadlines exists');
    assert(typeof intel.mapControlToRequirement === 'function', 'ri_052: mapControlToRequirement exists');
    assert(typeof intel.generateComplianceReport === 'function', 'ri_053: generateComplianceReport exists');
    assert(typeof intel.execute === 'function', 'ri_054: execute exists');

    // ri_055: Multiple instances independent
    const intel2 = new RegulatoryIntel({ organizationId: 'other-org', userId: 'other-user' });
    assert(intel.organizationId !== intel2.organizationId, 'ri_055: Multiple instances are independent');

    // ri_056: initMemory method exists
    assert(typeof intel.initMemory === 'function', 'ri_056: initMemory method exists');

    // =========================================================================
    // SECTION 3: scanRegulatoryChanges Tests (~25 tests)
    // =========================================================================
    console.log('\n[SECTION 3] scanRegulatoryChanges');

    // ri_057: Scan all frameworks
    const scanAll = intel.scanRegulatoryChanges([]);
    assert(scanAll.success === true, 'ri_057: Scan all frameworks succeeds');
    assert(scanAll.scannedAt !== undefined, 'ri_058: Scan timestamp');
    assert(Array.isArray(scanAll.frameworksScanned), 'ri_059: Scanned frameworks array');
    assert(scanAll.frameworksScanned.length >= 5, 'ri_060: At least 5 frameworks scanned');

    // ri_061: Specific framework scan
    const scanEU = intel.scanRegulatoryChanges(['EU_AI_ACT']);
    assert(scanEU.success === true, 'ri_061: Scan specific framework');
    assert(scanEU.frameworksScanned.length === 1, 'ri_062: One framework in results');
    assert(scanEU.frameworksScanned[0].name && (scanEU.frameworksScanned[0].name.includes('AI') || scanEU.frameworksScanned[0].name.includes('Artificial')), 'ri_063: Correct framework returned');

    // ri_064: Multiple framework scan
    const scanMulti = intel.scanRegulatoryChanges(['EU_AI_ACT', 'GDPR', 'NIST_AI_RMF']);
    assert(scanMulti.frameworksScanned.length === 3, 'ri_064: Three frameworks scanned');

    // ri_065: Changes detection
    assert(Array.isArray(scanAll.changes), 'ri_065: Changes array present');
    assert(scanAll.updatesAvailable !== undefined, 'ri_066: Updates available count');

    // ri_067: Framework versions in scan
    for (const fw of scanAll.frameworksScanned) {
        assert(fw.name !== undefined, 'ri_067: Framework name present');
        assert(fw.currentVersion !== undefined, 'ri_068: Current version present');
    }

    // ri_069: Invalid framework name ignored
    const scanInvalid = intel.scanRegulatoryChanges(['INVALID_FRAMEWORK', 'EU_AI_ACT']);
    assert(scanInvalid.frameworksScanned.length === 1, 'ri_069: Invalid framework ignored');

    // ri_070: Empty array scans all
    const scanEmpty = intel.scanRegulatoryChanges([]);
    assert(scanEmpty.frameworksScanned.length > 3, 'ri_070: Empty array scans all frameworks');

    // =========================================================================
    // SECTION 4: assessComplianceGap Tests (~25 tests)
    // =========================================================================
    console.log('\n[SECTION 4] assessComplianceGap');

    // ri_071: Basic gap assessment
    const gapEU = intel.assessComplianceGap('test-org', 'EU_AI_ACT');
    assert(gapEU.success === true, 'ri_071: Gap assessment succeeds');
    assert(gapEU.framework !== undefined, 'ri_072: Framework name');
    assert(gapEU.organization === 'test-org', 'ri_073: Organization ID');

    // ri_074: Gap summary
    assertExists(gapEU, 'gapSummary.totalGaps', 'ri_074: Total gaps present');
    assertExists(gapEU, 'gapSummary.criticalGaps', 'ri_075: Critical gaps count');
    assertExists(gapEU, 'gapSummary.highGaps', 'ri_076: High gaps count');

    // ri_077: Gaps array
    assert(Array.isArray(gapEU.gaps), 'ri_077: Gaps array');
    for (const gap of gapEU.gaps) {
        assert(gap.control !== undefined, 'ri_078: Gap control name');
        assert(['critical', 'high', 'medium'].includes(gap.severity), 'ri_079: Gap severity valid');
    }

    // ri_080: Controls coverage
    assert(gapEU.controlsCoverage !== undefined, 'ri_080: Controls coverage');
    assert(typeof gapEU.controlsCoverage === 'object', 'ri_081: Coverage is object');

    // ri_082: Readiness level
    assert(['Advanced', 'Intermediate', 'Initial'].includes(gapEU.readinessLevel), 'ri_082: Valid readiness level');
    assert(gapEU.overallImplementationRate !== undefined, 'ri_083: Implementation rate');

    // ri_084: Different frameworks
    const gapNIST = intel.assessComplianceGap('test-org', 'NIST_AI_RMF');
    const gapGDPR = intel.assessComplianceGap('test-org', 'GDPR');
    assert(gapNIST.success === true, 'ri_084: NIST assessment');
    assert(gapGDPR.success === true, 'ri_085: GDPR assessment');

    // ri_086: Invalid organization ID
    const gapInvalidOrg = intel.assessComplianceGap(null, 'EU_AI_ACT');
    assert(gapInvalidOrg.success === false, 'ri_086: Null org ID returns error');

    // ri_087: Invalid framework
    const gapInvalidFW = intel.assessComplianceGap('org', 'INVALID_FRAMEWORK');
    assert(gapInvalidFW.success === false, 'ri_087: Invalid framework returns error');

    // ri_088: Assessment date present
    assert(gapEU.assessmentDate !== undefined, 'ri_088: Assessment date included');

    // =========================================================================
    // SECTION 5: generateReadinessScorecard Tests (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 5] generateReadinessScorecard');

    // ri_089: Scorecard generation
    const scorecard = intel.generateReadinessScorecard('test-org');
    assert(scorecard.success === true, 'ri_089: Scorecard generation succeeds');
    assert(scorecard.organization === 'test-org', 'ri_090: Organization ID in scorecard');
    assert(scorecard.generatedAt !== undefined, 'ri_091: Generation timestamp');

    // ri_092: Framework results
    assert(Array.isArray(scorecard.frameworks), 'ri_092: Frameworks array');
    assert(scorecard.frameworks.length >= 5, 'ri_093: All frameworks in scorecard');

    // ri_094: Framework scoring
    for (const fw of scorecard.frameworks) {
        assert(fw.framework !== undefined, 'ri_094: Framework name');
        assert(fw.readinessScore !== undefined, 'ri_095: Readiness score');
        assert(['Ready', 'Mostly Ready', 'Partial', 'Not Ready'].includes(fw.readinessLevel), 'ri_096: Valid readiness level');
        assert(fw.estimatedTimeToFull !== undefined, 'ri_097: Time to full compliance');
    }

    // ri_098: Overall score
    assert(scorecard.overallReadinessScore !== undefined, 'ri_098: Overall score');
    assert(scorecard.overallStatus !== undefined, 'ri_099: Overall status');
    assert(['Well-Prepared', 'On Track', 'Needs Attention'].includes(scorecard.overallStatus), 'ri_100: Valid overall status');

    // ri_101: Key gaps
    for (const fw of scorecard.frameworks) {
        if (fw.keyGaps) {
            assert(Array.isArray(fw.keyGaps), 'ri_101: Key gaps array');
        }
    }

    // ri_102: Next steps
    for (const fw of scorecard.frameworks) {
        if (fw.nextSteps) {
            assert(Array.isArray(fw.nextSteps), 'ri_102: Next steps array');
        }
    }

    // ri_103: Invalid org ID
    const invalidScorecard = intel.generateReadinessScorecard(null);
    assert(invalidScorecard.success === false, 'ri_103: Null org ID returns error');

    // =========================================================================
    // SECTION 6: recommendPolicyUpdates Tests (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 6] recommendPolicyUpdates');

    // ri_104: Policy recommendations from gaps
    const gaps = [
        { control: 'Incident_Response', severity: 'high', gap: 'Not implemented' },
        { control: 'Data_Classification', severity: 'high', gap: 'Not implemented' }
    ];
    const policyRec = intel.recommendPolicyUpdates(gaps);
    assert(policyRec.success === true, 'ri_104: Policy recommendations succeed');

    // ri_105: Recommended policies
    assert(Array.isArray(policyRec.policiesRecommended), 'ri_105: Policies array');
    assert(policyRec.policiesRecommended.length > 0, 'ri_106: Policies recommended');

    // ri_107: Policy structure
    for (const policy of policyRec.policiesRecommended) {
        assert(policy.policy !== undefined, 'ri_107: Policy name');
        assert(policy.purpose !== undefined, 'ri_108: Policy purpose');
        assert(Array.isArray(policy.keyElements), 'ri_109: Key elements array');
        assert(policy.estimatedDays !== undefined, 'ri_110: Estimated days');
        assert(policy.estimatedCost !== undefined, 'ri_111: Estimated cost');
    }

    // ri_112: Prioritized actions
    assert(Array.isArray(policyRec.prioritizedActions), 'ri_112: Actions array');
    for (const action of policyRec.prioritizedActions) {
        assert(action.action !== undefined, 'ri_113: Action description');
        assert(['P0', 'P1', 'P2'].includes(action.priority), 'ri_114: Valid priority');
        assert(action.dueDate !== undefined, 'ri_115: Due date');
    }

    // ri_116: Implementation cost
    assert(typeof policyRec.estimatedImplementationCost === 'number', 'ri_116: Total cost is number');
    assert(policyRec.estimatedImplementationCost >= 0, 'ri_117: Cost non-negative');

    // ri_118: Empty gaps
    const emptyRecRec = intel.recommendPolicyUpdates([]);
    assert(emptyRecRec.success === true, 'ri_118: Empty gaps handled');

    // ri_119: Invalid parameter type
    const invalidRec = intel.recommendPolicyUpdates('not-an-array');
    assert(invalidRec.success === false, 'ri_119: Non-array parameter returns error');

    // =========================================================================
    // SECTION 7: trackFrameworkDeadlines Tests (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 7] trackFrameworkDeadlines');

    // ri_120: Track EU AI Act deadlines
    const dlEU = intel.trackFrameworkDeadlines('EU_AI_ACT');
    assert(dlEU.success === true, 'ri_120: Deadline tracking succeeds');
    assert(dlEU.framework !== undefined, 'ri_121: Framework name');
    assert(Array.isArray(dlEU.deadlines), 'ri_122: Deadlines array');
    assert(dlEU.deadlines.length > 0, 'ri_123: Deadlines present');

    // ri_124: Deadline structure
    for (const dl of dlEU.deadlines) {
        assert(dl.milestone !== undefined, 'ri_124: Milestone name');
        assert(dl.deadline !== undefined, 'ri_125: Deadline date');
        assert(typeof dl.daysRemaining === 'number', 'ri_126: Days remaining is number');
        assert(['Overdue', 'Urgent', 'Soon', 'On Track'].includes(dl.status), 'ri_127: Valid status');
        assert(dl.action !== undefined, 'ri_128: Action specified');
    }

    // ri_129: Track NIST deadlines
    const dlNIST = intel.trackFrameworkDeadlines('NIST_AI_RMF');
    assert(dlNIST.success === true, 'ri_129: NIST deadlines');

    // ri_130: Track SOX deadlines
    const dlSOX = intel.trackFrameworkDeadlines('SOX_404');
    assert(dlSOX.success === true, 'ri_130: SOX deadlines');

    // ri_131: Invalid framework
    const dlInvalid = intel.trackFrameworkDeadlines('INVALID');
    assert(dlInvalid.success === false, 'ri_131: Invalid framework returns error');

    // ri_132: Deadlines sorted by urgency
    const sortedDL = dlEU.deadlines;
    if (sortedDL.length > 1) {
        assert(sortedDL[0].daysRemaining <= sortedDL[sortedDL.length - 1].daysRemaining, 'ri_132: Deadlines sorted');
    }

    // =========================================================================
    // SECTION 8: mapControlToRequirement Tests (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 8] mapControlToRequirement');

    // ri_133: Map Data Encryption to requirements
    const mapEnc = intel.mapControlToRequirement('Data_Encryption', 'EU_AI_ACT');
    assert(mapEnc.success === true, 'ri_133: Control mapping succeeds');
    assert(mapEnc.control === 'Data_Encryption', 'ri_134: Control name');
    assert(mapEnc.framework !== undefined, 'ri_135: Framework name');

    // ri_136: Mapped requirements
    assert(Array.isArray(mapEnc.mappedRequirements), 'ri_136: Requirements array');
    for (const req of mapEnc.mappedRequirements) {
        assert(req.framework !== undefined, 'ri_137: Requirement framework');
        assert(req.requirement !== undefined, 'ri_138: Requirement ID');
        assert(req.purpose !== undefined, 'ri_139: Requirement purpose');
    }

    // ri_140: Implementation evidence
    assert(Array.isArray(mapEnc.implementationEvidenceTypes), 'ri_140: Evidence types array');
    assert(mapEnc.implementationEvidenceTypes.length > 0, 'ri_141: Evidence types provided');

    // ri_142: Compliance status
    assert(['Mapped', 'Requires Analysis'].includes(mapEnc.complianceStatus), 'ri_142: Valid compliance status');

    // ri_143: Map Access Controls
    const mapAC = intel.mapControlToRequirement('Access_Controls', 'GDPR');
    assert(mapAC.success === true, 'ri_143: Access controls mapping');

    // ri_144: Different framework mapping
    const mapEnc2 = intel.mapControlToRequirement('Data_Encryption', 'SOC_2');
    assert(mapEnc2.success === true, 'ri_144: Different framework mapping');

    // ri_145: Invalid control
    const mapInvalidCtrl = intel.mapControlToRequirement('INVALID_CONTROL', 'EU_AI_ACT');
    // Result may have empty mappedRequirements but still succeed
    assert(mapInvalidCtrl !== undefined, 'ri_145: Invalid control handled');

    // ri_146: Invalid framework
    const mapInvalidFW = intel.mapControlToRequirement('Data_Encryption', 'INVALID_FRAMEWORK');
    assert(mapInvalidFW.success === false, 'ri_146: Invalid framework returns error');

    // =========================================================================
    // SECTION 9: generateComplianceReport Tests (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 9] generateComplianceReport');

    // ri_147: Generate compliance report
    const report = intel.generateComplianceReport('test-org');
    assert(report.success === true, 'ri_147: Compliance report succeeds');
    assert(report.reportId !== undefined, 'ri_148: Report ID generated');
    assert(report.organization === 'test-org', 'ri_149: Organization in report');

    // ri_150: Report structure
    assertExists(report, 'executiveSummary', 'ri_150: Executive summary');
    assertExists(report, 'executiveSummary.overallStatus', 'ri_151: Overall status');
    assertExists(report, 'executiveSummary.frameworksCovered', 'ri_152: Frameworks covered');

    // ri_153: Framework assessments
    assert(Array.isArray(report.frameworkAssessments), 'ri_153: Assessments array');
    assert(report.frameworkAssessments.length > 0, 'ri_154: Assessments present');

    // ri_155: Assessment detail
    for (const assessment of report.frameworkAssessments) {
        assert(assessment.framework !== undefined, 'ri_155: Framework name');
        assert(assessment.complianceScore !== undefined, 'ri_156: Compliance score');
        assert(['Compliant', 'Substantially Compliant', 'Non-Compliant'].includes(assessment.status), 'ri_157: Valid status');
        if (assessment.findings) {
            assert(Array.isArray(assessment.findings.strengths), 'ri_158: Strengths array');
            assert(Array.isArray(assessment.findings.gaps), 'ri_159: Gaps array');
        }
    }

    // ri_160: Recommendations in report
    for (const assessment of report.frameworkAssessments) {
        if (assessment.recommendations) {
            assert(Array.isArray(assessment.recommendations), 'ri_160: Recommendations array');
        }
    }

    // ri_161: Report with specific frameworks
    const reportEU = intel.generateComplianceReport('org', ['EU_AI_ACT', 'GDPR']);
    assert(reportEU.success === true, 'ri_161: Report with specific frameworks');
    assert(reportEU.frameworkAssessments.length === 2, 'ri_162: Correct framework count');

    // ri_163: Disclaimer present
    assert(report.disclaimer !== undefined, 'ri_163: Disclaimer included');

    // ri_164: Invalid org ID
    const reportInvalid = intel.generateComplianceReport(null);
    assert(reportInvalid.success === false, 'ri_164: Null org ID returns error');

    // =========================================================================
    // SECTION 10: Execute Method Tests (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 10] Execute Method');

    // ri_165: Execute scan_changes task
    const execScan = await intel.execute('scan_changes', { frameworks: ['EU_AI_ACT'] });
    assert(execScan.success === true, 'ri_165: Execute scan_changes');

    // ri_166: Execute assess_gap task
    const execGap = await intel.execute('assess_gap', { framework: 'NIST_AI_RMF' });
    assert(execGap.success === true, 'ri_166: Execute assess_gap');

    // ri_167: Execute readiness_scorecard task
    const execScorecard = await intel.execute('readiness_scorecard');
    assert(execScorecard.success === true, 'ri_167: Execute readiness_scorecard');

    // ri_168: Execute policy_recommendations task
    const execPolicy = await intel.execute('policy_recommendations', { gaps: [] });
    assert(execPolicy.success === true, 'ri_168: Execute policy_recommendations');

    // ri_169: Execute track_deadlines task
    const execDeadlines = await intel.execute('track_deadlines', { framework: 'EU_AI_ACT' });
    assert(execDeadlines.success === true, 'ri_169: Execute track_deadlines');

    // ri_170: Execute map_control task
    const execMap = await intel.execute('map_control', {
        control: 'Data_Encryption',
        framework: 'GDPR'
    });
    assert(execMap.success === true, 'ri_170: Execute map_control');

    // ri_171: Execute compliance_report task
    const execReport = await intel.execute('compliance_report', { frameworks: [] });
    assert(execReport.success === true, 'ri_171: Execute compliance_report');

    // ri_172: Unknown task
    const execUnknown = await intel.execute('unknown_task');
    assert(execUnknown.success === false, 'ri_172: Unknown task returns error');

    // ri_173: Execute with default parameters
    const execDefault = await intel.execute('assess_gap');
    assert(execDefault !== undefined, 'ri_173: Execute with defaults works');

    // =========================================================================
    // SECTION 11: Data Consistency Tests (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 11] Data Consistency');

    // ri_174: All frameworks have names
    for (const [key, fw] of Object.entries(REGULATORY_FRAMEWORKS)) {
        assert(fw.name !== undefined, `ri_174: ${key} has name`);
    }

    // ri_175: All frameworks have jurisdiction
    for (const [key, fw] of Object.entries(REGULATORY_FRAMEWORKS)) {
        assert(fw.jurisdiction !== undefined, `ri_175: ${key} has jurisdiction`);
    }

    // ri_176: All frameworks have version
    for (const [key, fw] of Object.entries(REGULATORY_FRAMEWORKS)) {
        assert(fw.version !== undefined, `ri_176: ${key} has version`);
    }

    // ri_177: All frameworks have key requirements
    for (const [key, fw] of Object.entries(REGULATORY_FRAMEWORKS)) {
        assert(fw.keyRequirements !== undefined || fw.pillars !== undefined, `ri_177: ${key} has requirements`);
    }

    // ri_178: Unique framework names
    const names = Object.values(REGULATORY_FRAMEWORKS).map(f => f.name);
    const uniqueNames = new Set(names);
    assert(names.length === uniqueNames.size, 'ri_178: All framework names unique');

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n' + '═'.repeat(70));
    console.log('TEST SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Total tests: ${passed + failed}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
        console.log('\nFAILED TESTS:');
        failures.forEach(f => console.log(`  - ${f}`));
    }

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
