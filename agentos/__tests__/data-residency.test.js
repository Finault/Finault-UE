/**
 * TEST SUITE: data-residency.test.js
 * Comprehensive tests for data residency configuration and routing module
 *
 * Tests:
 * - DATA_REGIONS constants and structure
 * - DataResidencyManager org-level region management
 * - Immutable region locking after first assignment
 * - Endpoint retrieval (storage, CDN, S3, AWS)
 * - Cross-border transfer validation
 * - Compliance framework lookup and enforcement
 * - Data residency certification reports
 * - CrossBorderPolicy EU-US DPF, SCC, localization compliance
 * - Transfer approval workflow
 * - RegionRouter API request routing
 * - Region mismatch detection
 * - createDataResidencySystem factory function
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DATA_REGIONS,
    COMPLIANCE_FRAMEWORKS,
    DataResidencyManager,
    CrossBorderPolicy,
    RegionRouter,
    createDataResidencySystem
} from '../core/data-residency.js';

// ═══════════════════════════════════════════════════════════════════════════
// DATA_REGIONS CONSTANT TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('DATA_REGIONS: Region Definitions', () => {
    it('dres_001: DATA_REGIONS contains US, EU, APAC', () => {
        assert(DATA_REGIONS.US);
        assert(DATA_REGIONS.EU);
        assert(DATA_REGIONS.APAC);
    });

    it('dres_002: Each region has required endpoints', () => {
        Object.values(DATA_REGIONS).forEach(region => {
            assert(region.name);
            assert(region.region);
            assert(region.supabaseEndpoint);
            assert(region.awsRegion);
            assert(region.cdnEndpoint);
            assert(region.storageEndpoint);
        });
    });

    it('dres_003: US region has correct configuration', () => {
        assert.strictEqual(DATA_REGIONS.US.name, 'US Data Plane');
        assert(DATA_REGIONS.US.regions.includes('us-east-1'));
        assert(DATA_REGIONS.US.regions.includes('us-west-2'));
        assert(DATA_REGIONS.US.awsRegion, 'us-east-1');
    });

    it('dres_004: EU region has correct configuration', () => {
        assert.strictEqual(DATA_REGIONS.EU.name, 'EU Data Plane');
        assert(DATA_REGIONS.EU.regions.includes('eu-west-1'));
        assert(DATA_REGIONS.EU.regions.includes('eu-central-1'));
        assert(DATA_REGIONS.EU.awsRegion, 'eu-west-1');
    });

    it('dres_005: APAC region has correct configuration', () => {
        assert.strictEqual(DATA_REGIONS.APAC.name, 'APAC Data Plane');
        assert(DATA_REGIONS.APAC.regions.includes('ap-southeast-1'));
        assert(DATA_REGIONS.APAC.regions.includes('ap-northeast-1'));
        assert(DATA_REGIONS.APAC.awsRegion, 'ap-southeast-1');
    });

    it('dres_006: Each region defines compliance frameworks', () => {
        Object.values(DATA_REGIONS).forEach(region => {
            assert(Array.isArray(region.complianceFrameworks));
            assert(region.complianceFrameworks.length > 0);
        });
    });

    it('dres_007: US region has correct compliance frameworks', () => {
        const frameworks = DATA_REGIONS.US.complianceFrameworks;
        assert(frameworks.includes('CCPA'));
        assert(frameworks.includes('HIPAA') || frameworks.includes('SOC2'));
    });

    it('dres_008: EU region has GDPR compliance', () => {
        assert(DATA_REGIONS.EU.complianceFrameworks.includes('GDPR'));
    });

    it('dres_009: APAC region has PDPA compliance', () => {
        assert(DATA_REGIONS.APAC.complianceFrameworks.includes('PDPA'));
    });

    it('dres_010: All regions require data residency', () => {
        Object.values(DATA_REGIONS).forEach(region => {
            assert.strictEqual(region.dataResidencyRequired, true);
        });
    });

    it('dres_011: Transfer destinations are restricted by region', () => {
        assert.deepStrictEqual(DATA_REGIONS.US.allowedTransferDestinations, ['US']);
        assert.deepStrictEqual(DATA_REGIONS.EU.allowedTransferDestinations, ['EU']);
        assert.deepStrictEqual(DATA_REGIONS.APAC.allowedTransferDestinations, ['APAC']);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPLIANCE_FRAMEWORKS CONSTANT TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('COMPLIANCE_FRAMEWORKS: Framework Definitions', () => {
    it('dres_012: All framework names defined', () => {
        const frameworks = ['GDPR', 'CCPA', 'PDPA', 'HIPAA', 'SOC2', 'NIS2', 'DPA', 'PIPEDA', 'PIPL'];
        frameworks.forEach(fw => {
            assert(COMPLIANCE_FRAMEWORKS[fw], `${fw} not defined`);
        });
    });

    it('dres_013: Each framework has required fields', () => {
        Object.values(COMPLIANCE_FRAMEWORKS).forEach(fw => {
            assert(fw.name);
            assert(fw.region);
            assert(Array.isArray(fw.requirements));
            assert(fw.maxDataRetention);
            assert(fw.dataTransferMechanism);
        });
    });

    it('dres_014: GDPR has EU region', () => {
        assert.strictEqual(COMPLIANCE_FRAMEWORKS.GDPR.region, 'EU');
    });

    it('dres_015: CCPA has US region', () => {
        assert.strictEqual(COMPLIANCE_FRAMEWORKS.CCPA.region, 'US');
    });

    it('dres_016: PDPA has APAC region', () => {
        assert.strictEqual(COMPLIANCE_FRAMEWORKS.PDPA.region, 'APAC');
    });

    it('dres_017: GDPR has appropriate requirements', () => {
        const reqs = COMPLIANCE_FRAMEWORKS.GDPR.requirements;
        assert(reqs.some(r => r.includes('EU')));
        assert(reqs.some(r => r.includes('deletion')));
    });

    it('dres_018: CCPA allows opt-out', () => {
        const reqs = COMPLIANCE_FRAMEWORKS.CCPA.requirements;
        assert(reqs.some(r => r.includes('opt-out')));
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// DATARESIDENCYMANAGER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('DataResidencyManager: Initialization', () => {
    it('dres_019: Constructor initializes empty mappings', () => {
        const manager = new DataResidencyManager();
        assert.strictEqual(manager.orgRegions.size, 0);
        assert.strictEqual(manager.orgRegionLocks.size, 0);
    });

    it('dres_020: Constructor accepts config', () => {
        const manager = new DataResidencyManager({ customConfig: 'value' });
        assert.strictEqual(manager.config.customConfig, 'value');
    });
});

describe('DataResidencyManager: Region Assignment', () => {
    it('dres_021: setRegionForOrg() sets region for org', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');
        assert.strictEqual(manager.getRegionForOrg('org-1'), 'US');
    });

    it('dres_022: setRegionForOrg() rejects invalid regions', () => {
        const manager = new DataResidencyManager();
        assert.throws(() => {
            manager.setRegionForOrg('org-1', 'INVALID');
        }, /Invalid region/);
    });

    it('dres_023: getRegionForOrg() returns null for unconfigured org', () => {
        const manager = new DataResidencyManager();
        assert.strictEqual(manager.getRegionForOrg('org-unknown'), null);
    });

    it('dres_024: setRegionForOrg() locks region after first assignment', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');

        assert.throws(() => {
            manager.setRegionForOrg('org-1', 'EU');
        }, /locked/);
    });

    it('dres_025: setRegionForOrg() returns true on success', () => {
        const manager = new DataResidencyManager();
        const result = manager.setRegionForOrg('org-1', 'US');
        assert.strictEqual(result, true);
    });

    it('dres_026: Multiple orgs can have different regions', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');
        manager.setRegionForOrg('org-2', 'EU');
        manager.setRegionForOrg('org-3', 'APAC');

        assert.strictEqual(manager.getRegionForOrg('org-1'), 'US');
        assert.strictEqual(manager.getRegionForOrg('org-2'), 'EU');
        assert.strictEqual(manager.getRegionForOrg('org-3'), 'APAC');
    });
});

describe('DataResidencyManager: Region Reset', () => {
    it('dres_027: resetOrgRegion() removes region assignment', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');
        manager.resetOrgRegion('org-1');

        assert.strictEqual(manager.getRegionForOrg('org-1'), null);
    });

    it('dres_028: resetOrgRegion() unlocks region for reassignment', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');
        manager.resetOrgRegion('org-1');

        // Should not throw now
        manager.setRegionForOrg('org-1', 'EU');
        assert.strictEqual(manager.getRegionForOrg('org-1'), 'EU');
    });

    it('dres_029: resetOrgRegion() returns true', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');
        const result = manager.resetOrgRegion('org-1');
        assert.strictEqual(result, true);
    });
});

describe('DataResidencyManager: Endpoint Retrieval', () => {
    it('dres_030: getStorageEndpoint() returns Supabase endpoint', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');

        const endpoint = manager.getStorageEndpoint('org-1');
        assert.strictEqual(endpoint, DATA_REGIONS.US.supabaseEndpoint);
    });

    it('dres_031: getStorageEndpoint() returns null for unconfigured org', () => {
        const manager = new DataResidencyManager();
        assert.strictEqual(manager.getStorageEndpoint('org-unknown'), null);
    });

    it('dres_032: getCDNEndpoint() returns CDN endpoint', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'EU');

        const endpoint = manager.getCDNEndpoint('org-1');
        assert.strictEqual(endpoint, DATA_REGIONS.EU.cdnEndpoint);
    });

    it('dres_033: getStorageBucketEndpoint() returns S3 endpoint', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'APAC');

        const endpoint = manager.getStorageBucketEndpoint('org-1');
        assert.strictEqual(endpoint, DATA_REGIONS.APAC.storageEndpoint);
    });

    it('dres_034: getAWSRegion() returns AWS region code', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');

        const region = manager.getAWSRegion('org-1');
        assert.strictEqual(region, 'us-east-1');
    });

    it('dres_035: Endpoints differ by region', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-us', 'US');
        manager.setRegionForOrg('org-eu', 'EU');

        const usEndpoint = manager.getStorageEndpoint('org-us');
        const euEndpoint = manager.getStorageEndpoint('org-eu');

        assert.notStrictEqual(usEndpoint, euEndpoint);
    });
});

describe('DataResidencyManager: Cross-Border Validation', () => {
    it('dres_036: validateCrossBorderTransfer() same region returns allowed', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');
        manager.setRegionForOrg('org-2', 'US');

        const result = manager.validateCrossBorderTransfer('org-1', 'org-2');
        assert.strictEqual(result.allowed, true);
        assert.strictEqual(result.sourceRegion, 'US');
        assert.strictEqual(result.destRegion, 'US');
    });

    it('dres_037: validateCrossBorderTransfer() cross-region returns not allowed', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-us', 'US');
        manager.setRegionForOrg('org-eu', 'EU');

        const result = manager.validateCrossBorderTransfer('org-us', 'org-eu');
        assert.strictEqual(result.allowed, false);
    });

    it('dres_038: validateCrossBorderTransfer() returns applicable frameworks', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');
        manager.setRegionForOrg('org-2', 'US');

        const result = manager.validateCrossBorderTransfer('org-1', 'org-2');
        assert(result.sourceFrameworks);
        assert(result.destFrameworks);
    });

    it('dres_039: validateCrossBorderTransfer() unconfigured org returns error', () => {
        const manager = new DataResidencyManager();
        const result = manager.validateCrossBorderTransfer('org-unknown', 'org-2');

        assert.strictEqual(result.allowed, false);
        assert(result.reason.includes('not configured'));
    });

    it('dres_040: validateCrossBorderTransfer() EU to EU allowed', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'EU');
        manager.setRegionForOrg('org-2', 'EU');

        const result = manager.validateCrossBorderTransfer('org-1', 'org-2');
        assert.strictEqual(result.allowed, true);
    });

    it('dres_041: validateCrossBorderTransfer() APAC to APAC allowed', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'APAC');
        manager.setRegionForOrg('org-2', 'APAC');

        const result = manager.validateCrossBorderTransfer('org-1', 'org-2');
        assert.strictEqual(result.allowed, true);
    });
});

describe('DataResidencyManager: Compliance Frameworks', () => {
    it('dres_042: getComplianceFrameworks() returns frameworks for region', () => {
        const manager = new DataResidencyManager();
        const frameworks = manager.getComplianceFrameworks('US');

        assert(frameworks.CCPA);
        assert(frameworks.HIPAA || frameworks.SOC2);
    });

    it('dres_043: getComplianceFrameworks() EU returns GDPR', () => {
        const manager = new DataResidencyManager();
        const frameworks = manager.getComplianceFrameworks('EU');

        assert(frameworks.GDPR);
    });

    it('dres_044: getComplianceFrameworks() APAC returns PDPA', () => {
        const manager = new DataResidencyManager();
        const frameworks = manager.getComplianceFrameworks('APAC');

        assert(frameworks.PDPA);
    });

    it('dres_045: getComplianceFrameworks() invalid region returns empty', () => {
        const manager = new DataResidencyManager();
        const frameworks = manager.getComplianceFrameworks('INVALID');

        assert.deepStrictEqual(frameworks, {});
    });

    it('dres_046: Framework objects have requirements', () => {
        const manager = new DataResidencyManager();
        const frameworks = manager.getComplianceFrameworks('US');

        Object.values(frameworks).forEach(fw => {
            assert(Array.isArray(fw.requirements));
            assert(fw.requirements.length > 0);
        });
    });
});

describe('DataResidencyManager: Residency Reports', () => {
    it('dres_047: generateDataResidencyReport() creates compliance report', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');

        const report = manager.generateDataResidencyReport('org-1');
        assert.strictEqual(report.compliant, true);
        assert.strictEqual(report.region, 'US');
    });

    it('dres_048: Report includes region configuration', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'EU');

        const report = manager.generateDataResidencyReport('org-1');
        assert(report.regionConfig);
        assert(report.regionConfig.awsRegions);
        assert(report.regionConfig.storageEndpoint);
    });

    it('dres_049: Report includes applicable frameworks', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');

        const report = manager.generateDataResidencyReport('org-1');
        assert(Array.isArray(report.applicableFrameworks));
        assert(report.applicableFrameworks.length > 0);
    });

    it('dres_050: Report includes transfer restrictions', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');

        const report = manager.generateDataResidencyReport('org-1');
        assert.deepStrictEqual(report.allowedTransferDestinations, ['US']);
    });

    it('dres_051: Report for unconfigured org shows non-compliant', () => {
        const manager = new DataResidencyManager();
        const report = manager.generateDataResidencyReport('org-unknown');

        assert.strictEqual(report.compliant, false);
        assert(report.reason);
        assert(report.reason.includes('configured'));
    });

    it('dres_052: Report includes timestamp', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');

        const report = manager.generateDataResidencyReport('org-1');
        assert(report.report_date);
    });
});

describe('DataResidencyManager: Admin Functions', () => {
    it('dres_053: getAllOrgRegionMappings() returns all assignments', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');
        manager.setRegionForOrg('org-2', 'EU');

        const mappings = manager.getAllOrgRegionMappings();
        assert.strictEqual(mappings['org-1'].region, 'US');
        assert.strictEqual(mappings['org-2'].region, 'EU');
    });

    it('dres_054: getAllOrgRegionMappings() includes lock status', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');

        const mappings = manager.getAllOrgRegionMappings();
        assert.strictEqual(mappings['org-1'].locked, true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// CROSSBORDERPOLICY TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('CrossBorderPolicy: EU-US DPF Compliance', () => {
    it('dres_055: checkEUUSDPFCompliance() returns not allowed', () => {
        const policy = new CrossBorderPolicy();
        const result = policy.checkEUUSDPFCompliance('org-eu', 'org-us');

        assert.strictEqual(result.allowed, false);
        assert(result.reason.includes('suspended'));
    });

    it('dres_056: checkEUUSDPFCompliance() recommends SCC', () => {
        const policy = new CrossBorderPolicy();
        const result = policy.checkEUUSDPFCompliance('org-eu', 'org-us');

        assert.strictEqual(result.requiredAlternative, 'STANDARD_CONTRACTUAL_CLAUSES');
    });
});

describe('CrossBorderPolicy: Standard Contractual Clauses', () => {
    it('dres_057: checkStandardContractualClauses() allows transfer', () => {
        const policy = new CrossBorderPolicy();
        const result = policy.checkStandardContractualClauses({
            sourceRegion: 'EU',
            destRegion: 'US'
        });

        assert.strictEqual(result.allowed, true);
        assert.strictEqual(result.framework, 'Standard Contractual Clauses');
    });

    it('dres_058: SCC requires supplementary measures for US transfers', () => {
        const policy = new CrossBorderPolicy();
        const result = policy.checkStandardContractualClauses({
            sourceRegion: 'EU',
            destRegion: 'US'
        });

        assert(result.safeguardsRequired.some(s => s.includes('Supplementary')));
    });

    it('dres_059: SCC increases safeguards for sensitive data', () => {
        const policy = new CrossBorderPolicy();
        const result = policy.checkStandardContractualClauses({
            sourceRegion: 'EU',
            destRegion: 'US',
            sensitiveData: true
        });

        assert(result.safeguardsRequired.length > 0);
        assert(result.safeguardsRequired.some(s => s.includes('Enhanced')));
    });

    it('dres_060: SCC includes approval requirement', () => {
        const policy = new CrossBorderPolicy();
        const result = policy.checkStandardContractualClauses({
            sourceRegion: 'EU',
            destRegion: 'US'
        });

        assert.strictEqual(result.transferApprovalRequired, true);
    });
});

describe('CrossBorderPolicy: Full Localization Mode', () => {
    it('dres_061: checkFullLocalization() disallows cross-region transfers', () => {
        const policy = new CrossBorderPolicy();
        const result = policy.checkFullLocalization({
            sourceRegion: 'US',
            destRegion: 'EU'
        });

        assert.strictEqual(result.allowed, false);
        assert.strictEqual(result.enforcement, 'strict');
    });

    it('dres_062: Localization mode references original data plane', () => {
        const policy = new CrossBorderPolicy();
        const result = policy.checkFullLocalization({
            sourceRegion: 'EU',
            destRegion: 'US'
        });

        assert(result.reason.includes('remain within original'));
    });
});

describe('CrossBorderPolicy: Transfer Approvals', () => {
    it('dres_063: requestTransferApproval() generates approval ID', () => {
        const policy = new CrossBorderPolicy();
        const result = policy.requestTransferApproval({
            sourceOrg: 'org-1',
            destOrg: 'org-2',
            sourceRegion: 'EU',
            destRegion: 'EU',
            policyMode: 'SCC'
        });

        assert(result.approvalId);
        assert(result.approvalId.startsWith('xfr_'));
    });

    it('dres_064: requestTransferApproval() SCC mode checks compliance', () => {
        const policy = new CrossBorderPolicy();
        const result = policy.requestTransferApproval({
            sourceOrg: 'org-1',
            destOrg: 'org-2',
            sourceRegion: 'EU',
            destRegion: 'EU',
            policyMode: 'SCC'
        });

        assert.strictEqual(result.status, 'APPROVED');
    });

    it('dres_065: requestTransferApproval() localization mode rejects', () => {
        const policy = new CrossBorderPolicy();
        const result = policy.requestTransferApproval({
            sourceOrg: 'org-1',
            destOrg: 'org-2',
            sourceRegion: 'US',
            destRegion: 'EU',
            policyMode: 'LOCALIZATION'
        });

        assert.strictEqual(result.status, 'REJECTED');
    });

    it('dres_066: checkApprovalStatus() returns approval status', () => {
        const policy = new CrossBorderPolicy();
        const approval = policy.requestTransferApproval({
            sourceOrg: 'org-1',
            destOrg: 'org-2',
            sourceRegion: 'EU',
            destRegion: 'EU'
        });

        const status = policy.checkApprovalStatus(approval.approvalId);
        assert.strictEqual(status.valid, true);
        assert.strictEqual(status.status, 'APPROVED');
    });

    it('dres_067: checkApprovalStatus() invalid ID returns invalid', () => {
        const policy = new CrossBorderPolicy();
        const status = policy.checkApprovalStatus('invalid-id');

        assert.strictEqual(status.valid, false);
    });

    it('dres_068: Approval expires after 1 year', () => {
        const policy = new CrossBorderPolicy();
        const approval = policy.requestTransferApproval({
            sourceOrg: 'org-1',
            destOrg: 'org-2',
            sourceRegion: 'EU',
            destRegion: 'EU'
        });

        const status = policy.checkApprovalStatus(approval.approvalId);
        const nowPlus2Years = Date.now() + (2 * 365 * 24 * 60 * 60 * 1000);
        assert(status.expiresAt < nowPlus2Years);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// REGIONROUTER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('RegionRouter: Routing Configuration', () => {
    it('dres_069: getRouting() returns routable config for configured org', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');
        const router = new RegionRouter(manager);

        const routing = router.getRouting('org-1');
        assert.strictEqual(routing.routable, true);
        assert.strictEqual(routing.region, 'US');
    });

    it('dres_070: getRouting() returns not routable for unconfigured org', () => {
        const manager = new DataResidencyManager();
        const router = new RegionRouter(manager);

        const routing = router.getRouting('org-unknown');
        assert.strictEqual(routing.routable, false);
    });

    it('dres_071: getRouting() constructs full URL', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');
        const router = new RegionRouter(manager);

        const routing = router.getRouting('org-1', '/api/agents/run');
        assert(routing.fullUrl.includes('/api/agents/run'));
    });

    it('dres_072: getRouting() includes correct headers', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'EU');
        const router = new RegionRouter(manager);

        const routing = router.getRouting('org-1');
        assert.strictEqual(routing.headers['x-finault-region'], 'EU');
        assert.strictEqual(routing.headers['x-finault-org'], 'org-1');
    });

    it('dres_073: getRouting() includes AWS region', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'APAC');
        const router = new RegionRouter(manager);

        const routing = router.getRouting('org-1');
        assert.strictEqual(routing.awsRegion, 'ap-southeast-1');
    });

    it('dres_074: Routing differs by region', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-us', 'US');
        manager.setRegionForOrg('org-eu', 'EU');
        const router = new RegionRouter(manager);

        const usRouting = router.getRouting('org-us');
        const euRouting = router.getRouting('org-eu');

        assert.notStrictEqual(usRouting.baseUrl, euRouting.baseUrl);
    });
});

describe('RegionRouter: Request Routing', () => {
    it('dres_075: routeRequest() creates complete routed request', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');
        const router = new RegionRouter(manager);

        const routed = router.routeRequest('org-1', 'POST', '/api/agents/run', { model: 'claude-3' });
        assert.strictEqual(routed.method, 'POST');
        assert(routed.body);
        assert(routed.timestamp);
    });

    it('dres_076: routeRequest() throws for unconfigured org', () => {
        const manager = new DataResidencyManager();
        const router = new RegionRouter(manager);

        assert.throws(() => {
            router.routeRequest('org-unknown', 'POST', '/api/test');
        }, /Cannot route/);
    });

    it('dres_077: routeRequest() includes region and org headers', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'EU');
        const router = new RegionRouter(manager);

        const routed = router.routeRequest('org-1', 'GET', '/api/status');
        assert(routed.headers['x-finault-region']);
        assert(routed.headers['x-finault-org']);
    });
});

describe('RegionRouter: Request Validation', () => {
    it('dres_078: validateRequestRegion() returns valid for matching region', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');
        const router = new RegionRouter(manager);

        const validation = router.validateRequestRegion('org-1', 'US');
        assert.strictEqual(validation.valid, true);
    });

    it('dres_079: validateRequestRegion() returns invalid for mismatched region', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');
        const router = new RegionRouter(manager);

        const validation = router.validateRequestRegion('org-1', 'EU');
        assert.strictEqual(validation.valid, false);
    });

    it('dres_080: validateRequestRegion() invalid org returns error', () => {
        const manager = new DataResidencyManager();
        const router = new RegionRouter(manager);

        const validation = router.validateRequestRegion('org-unknown', 'US');
        assert.strictEqual(validation.valid, false);
    });

    it('dres_081: validateRequestRegion() includes reason for mismatch', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');
        const router = new RegionRouter(manager);

        const validation = router.validateRequestRegion('org-1', 'EU');
        assert(validation.reason.includes('mismatch'));
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('createDataResidencySystem(): Factory Function', () => {
    it('dres_082: Factory creates complete system', () => {
        const system = createDataResidencySystem();
        assert(system.manager);
        assert(system.policy);
        assert(system.router);
        assert(system.config);
    });

    it('dres_083: Factory manager is DataResidencyManager', () => {
        const system = createDataResidencySystem();
        assert(system.manager instanceof DataResidencyManager);
    });

    it('dres_084: Factory policy is CrossBorderPolicy', () => {
        const system = createDataResidencySystem();
        assert(system.policy instanceof CrossBorderPolicy);
    });

    it('dres_085: Factory router is RegionRouter', () => {
        const system = createDataResidencySystem();
        assert(system.router instanceof RegionRouter);
    });

    it('dres_086: Factory passes config to manager', () => {
        const system = createDataResidencySystem({ customKey: 'customValue' });
        assert.strictEqual(system.config.customKey, 'customValue');
    });

    it('dres_087: Components work together', () => {
        const system = createDataResidencySystem();
        system.manager.setRegionForOrg('org-1', 'US');

        const routing = system.router.getRouting('org-1');
        assert.strictEqual(routing.routable, true);

        const report = system.manager.generateDataResidencyReport('org-1');
        assert.strictEqual(report.compliant, true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Integration: Multi-Region Organization', () => {
    it('dres_088: Complete org onboarding flow', () => {
        const system = createDataResidencySystem();

        // Assign region
        system.manager.setRegionForOrg('org-acme', 'US');

        // Retrieve endpoints
        const storageEndpoint = system.manager.getStorageEndpoint('org-acme');
        assert(storageEndpoint.includes('supabase'));

        // Generate compliance report
        const report = system.manager.generateDataResidencyReport('org-acme');
        assert.strictEqual(report.compliant, true);

        // Route a request
        const routing = system.router.getRouting('org-acme', '/api/agents');
        assert.strictEqual(routing.routable, true);
    });

    it('dres_089: Multi-region data governance', () => {
        const system = createDataResidencySystem();

        // Setup multi-region orgs
        system.manager.setRegionForOrg('org-us', 'US');
        system.manager.setRegionForOrg('org-eu', 'EU');
        system.manager.setRegionForOrg('org-apac', 'APAC');

        // Validate all configured correctly
        assert.strictEqual(system.manager.getRegionForOrg('org-us'), 'US');
        assert.strictEqual(system.manager.getRegionForOrg('org-eu'), 'EU');
        assert.strictEqual(system.manager.getRegionForOrg('org-apac'), 'APAC');

        // Each has correct frameworks
        const usFrameworks = system.manager.getComplianceFrameworks('US');
        const euFrameworks = system.manager.getComplianceFrameworks('EU');
        const apacFrameworks = system.manager.getComplianceFrameworks('APAC');

        assert(usFrameworks.CCPA);
        assert(euFrameworks.GDPR);
        assert(apacFrameworks.PDPA);
    });

    it('dres_090: Cross-border restrictions enforced', () => {
        const system = createDataResidencySystem();

        system.manager.setRegionForOrg('org-us', 'US');
        system.manager.setRegionForOrg('org-eu', 'EU');

        // US to EU not allowed
        const result = system.manager.validateCrossBorderTransfer('org-us', 'org-eu');
        assert.strictEqual(result.allowed, false);

        // Approving within region is allowed
        const approval = system.policy.requestTransferApproval({
            sourceOrg: 'org-us',
            destOrg: 'org-us',
            sourceRegion: 'US',
            destRegion: 'US'
        });
        assert.strictEqual(approval.status, 'APPROVED');
    });

    it('dres_091: Admin sees full data residency landscape', () => {
        const system = createDataResidencySystem();

        system.manager.setRegionForOrg('org-1', 'US');
        system.manager.setRegionForOrg('org-2', 'EU');
        system.manager.setRegionForOrg('org-3', 'APAC');

        const mappings = system.manager.getAllOrgRegionMappings();
        assert.strictEqual(Object.keys(mappings).length, 3);
        assert.strictEqual(mappings['org-1'].region, 'US');
        assert.strictEqual(mappings['org-2'].region, 'EU');
        assert.strictEqual(mappings['org-3'].region, 'APAC');
    });
});

describe('Edge Cases & Error Handling', () => {
    it('dres_092: Cannot reconfigure locked region', () => {
        const manager = new DataResidencyManager();
        manager.setRegionForOrg('org-1', 'US');

        assert.throws(() => {
            manager.setRegionForOrg('org-1', 'EU');
        });

        // But can reset and reconfigure
        manager.resetOrgRegion('org-1');
        manager.setRegionForOrg('org-1', 'EU');
        assert.strictEqual(manager.getRegionForOrg('org-1'), 'EU');
    });

    it('dres_093: Empty org mappings handled gracefully', () => {
        const manager = new DataResidencyManager();
        const mappings = manager.getAllOrgRegionMappings();
        assert.deepStrictEqual(mappings, {});
    });

    it('dres_094: Invalid region codes rejected', () => {
        const manager = new DataResidencyManager();
        const invalidRegions = ['UK', 'CHINA', 'CANADA', 'us', 'eu'];

        invalidRegions.forEach(region => {
            assert.throws(() => {
                manager.setRegionForOrg('org-test', region);
            });
        });
    });

    it('dres_095: Router handles missing config gracefully', () => {
        const manager = new DataResidencyManager();
        const router = new RegionRouter(manager);

        const routing = router.getRouting('org-unknown');
        assert.strictEqual(routing.routable, false);
        assert(routing.reason);
    });
});
