/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATA RESIDENCY CONFIGURATION & ROUTING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages data residency across US/EU/APAC data planes with compliance framework
 * support (GDPR, CCPA, PDPA) and cross-border data transfer validation.
 *
 * FEATURES:
 * - DATA_REGIONS: 3 data planes with regional endpoints
 * - DataResidencyManager: Org-level region management and endpoint routing
 * - CrossBorderPolicy: EU-US Data Privacy Framework, SCCs, full localization
 * - RegionRouter: API request routing to correct data plane
 * - getComplianceFrameworks(): Region-specific compliance rules
 * - validateCrossBorderTransfer(): Privacy-aware transfer validation
 * - generateDataResidencyReport(): Compliance certification
 */

/**
 * Data region definitions with endpoints and compliance frameworks
 */
export const DATA_REGIONS = {
    US: {
        name: 'US Data Plane',
        region: 'us-east-1',
        regions: ['us-east-1', 'us-west-2'],
        supabaseEndpoint: 'https://us-supabase.finault.io',
        supabaseUrl: 'https://us-supabase.finault.io',
        awsRegion: 'us-east-1',
        cdnEndpoint: 'https://cdn-us.finault.io',
        storageEndpoint: 's3://finault-us/',
        complianceFrameworks: ['CCPA', 'HIPAA', 'SOC2'],
        dataResidencyRequired: true,
        allowedTransferDestinations: ['US'],
        description: 'United States data plane (AWS us-east-1/us-west-2)'
    },
    EU: {
        name: 'EU Data Plane',
        region: 'eu-west-1',
        regions: ['eu-west-1', 'eu-central-1'],
        supabaseEndpoint: 'https://eu-supabase.finault.io',
        supabaseUrl: 'https://eu-supabase.finault.io',
        awsRegion: 'eu-west-1',
        cdnEndpoint: 'https://cdn-eu.finault.io',
        storageEndpoint: 's3://finault-eu/',
        complianceFrameworks: ['GDPR', 'NIS2', 'DPA'],
        dataResidencyRequired: true,
        allowedTransferDestinations: ['EU'],
        description: 'European Union data plane (AWS eu-west-1/eu-central-1)'
    },
    APAC: {
        name: 'APAC Data Plane',
        region: 'ap-southeast-1',
        regions: ['ap-southeast-1', 'ap-northeast-1'],
        supabaseEndpoint: 'https://apac-supabase.finault.io',
        supabaseUrl: 'https://apac-supabase.finault.io',
        awsRegion: 'ap-southeast-1',
        cdnEndpoint: 'https://cdn-apac.finault.io',
        storageEndpoint: 's3://finault-apac/',
        complianceFrameworks: ['PDPA', 'PIPEDA', 'PIPL'],
        dataResidencyRequired: true,
        allowedTransferDestinations: ['APAC'],
        description: 'Asia-Pacific data plane (AWS ap-southeast-1/ap-northeast-1)'
    }
};

/**
 * Compliance framework definitions
 */
export const COMPLIANCE_FRAMEWORKS = {
    GDPR: {
        name: 'General Data Protection Regulation',
        region: 'EU',
        requirements: [
            'Data subject consent required',
            'Data residency within EU',
            'Right to be forgotten (deletion)',
            'Data protection impact assessment',
            'Data protection officer designation',
            'Cross-border transfer requires legal mechanism'
        ],
        maxDataRetention: '6 years',
        dataTransferMechanism: 'Standard Contractual Clauses'
    },
    CCPA: {
        name: 'California Consumer Privacy Act',
        region: 'US',
        requirements: [
            'Consumer rights to access, delete, opt-out',
            'Data collection notice required',
            'Sale of personal data prohibited without consent',
            'Third-party vendor contracts required',
            'Annual privacy audits'
        ],
        maxDataRetention: '3 years',
        dataTransferMechanism: 'Data Processing Agreement'
    },
    PDPA: {
        name: 'Personal Data Protection Act',
        region: 'APAC',
        requirements: [
            'Personal data must be processed lawfully',
            'Consent for collection and use',
            'Data subject notification required',
            'Limited retention period',
            'Cross-border transfer approval required'
        ],
        maxDataRetention: '2 years',
        dataTransferMechanism: 'Data Transfer Agreement'
    },
    HIPAA: {
        name: 'Health Insurance Portability and Accountability Act',
        region: 'US',
        requirements: [
            'PHI encryption at rest and in transit',
            'Access controls and audit logs',
            'Breach notification within 60 days',
            'Business Associate Agreement required',
            'Annual risk assessment'
        ],
        maxDataRetention: '6 years',
        dataTransferMechanism: 'Business Associate Agreement'
    },
    SOC2: {
        name: 'Service Organization Control 2',
        region: 'US',
        requirements: [
            'Security and availability controls',
            'Data integrity and confidentiality',
            'Privacy controls',
            'Annual audit required',
            'Incident response procedures'
        ],
        maxDataRetention: '7 years',
        dataTransferMechanism: 'Data Processing Agreement'
    },
    NIS2: {
        name: 'Network and Information Systems Directive 2',
        region: 'EU',
        requirements: [
            'Cybersecurity risk management',
            'Supply chain security',
            'Incident reporting (24 hours)',
            'Crisis management procedures',
            'Basic security measures'
        ],
        maxDataRetention: '5 years',
        dataTransferMechanism: 'Data Processing Agreement'
    },
    DPA: {
        name: 'UK Data Protection Act 2018',
        region: 'EU',
        requirements: [
            'GDPR implementation in UK law',
            'UK data controller designation',
            'Data residency within UK (post-Brexit)',
            'Standard Contractual Clauses for transfers'
        ],
        maxDataRetention: '6 years',
        dataTransferMechanism: 'Standard Contractual Clauses'
    },
    PIPEDA: {
        name: 'Personal Information Protection and Electronic Documents Act',
        region: 'APAC',
        requirements: [
            'Consent for data collection and use',
            'Access to personal information',
            'Accuracy and retention management',
            'Safeguards implementation',
            'Privacy breach notification'
        ],
        maxDataRetention: '3 years',
        dataTransferMechanism: 'Data Processing Agreement'
    },
    PIPL: {
        name: 'Personal Information Protection Law',
        region: 'APAC',
        requirements: [
            'Data security impact assessment',
            'Data minimization principle',
            'Legitimate purpose required',
            'Sensitive data encryption',
            'Cross-border data transfer approval'
        ],
        maxDataRetention: '1 year',
        dataTransferMechanism: 'Data Transfer Agreement'
    }
};

/**
 * DataResidencyManager: Manages org-level region configuration and routing
 */
export class DataResidencyManager {
    constructor(config = {}) {
        this.config = config;
        // org_id -> region mapping
        this.orgRegions = new Map();
        // org_id -> lock status (locked after first assignment)
        this.orgRegionLocks = new Map();
    }

    /**
     * Get data region for an organization
     *
     * @param {string} orgId - Organization ID
     * @returns {string|null} Region code (US, EU, APAC) or null
     */
    getRegionForOrg(orgId) {
        return this.orgRegions.get(orgId) || null;
    }

    /**
     * Set data region for an organization
     *
     * Regions are immutable after first assignment to prevent accidental
     * data residency changes. Must call resetOrgRegion() explicitly.
     *
     * @param {string} orgId - Organization ID
     * @param {string} region - Region code (US, EU, APAC)
     * @throws {Error} If region is invalid or org region already locked
     * @returns {boolean} Success
     */
    setRegionForOrg(orgId, region) {
        // Validate region
        if (!DATA_REGIONS[region]) {
            throw new Error(`Invalid region: ${region}. Must be US, EU, or APAC`);
        }

        // Check if org region is locked
        if (this.orgRegionLocks.has(orgId)) {
            throw new Error(`Region for org ${orgId} is locked. Cannot change after initial assignment.`);
        }

        this.orgRegions.set(orgId, region);
        this.orgRegionLocks.set(orgId, true);

        return true;
    }

    /**
     * Explicitly reset org region (requires admin privileges conceptually)
     *
     * @param {string} orgId - Organization ID
     * @returns {boolean} Success
     */
    resetOrgRegion(orgId) {
        this.orgRegions.delete(orgId);
        this.orgRegionLocks.delete(orgId);
        return true;
    }

    /**
     * Get storage endpoint for an organization
     *
     * @param {string} orgId - Organization ID
     * @returns {string|null} Storage endpoint URL or null if region not set
     */
    getStorageEndpoint(orgId) {
        const region = this.getRegionForOrg(orgId);
        if (!region) return null;
        return DATA_REGIONS[region].supabaseEndpoint;
    }

    /**
     * Get CDN endpoint for an organization
     *
     * @param {string} orgId - Organization ID
     * @returns {string|null} CDN endpoint URL or null if region not set
     */
    getCDNEndpoint(orgId) {
        const region = this.getRegionForOrg(orgId);
        if (!region) return null;
        return DATA_REGIONS[region].cdnEndpoint;
    }

    /**
     * Get S3 storage endpoint for an organization
     *
     * @param {string} orgId - Organization ID
     * @returns {string|null} S3 endpoint or null if region not set
     */
    getStorageBucketEndpoint(orgId) {
        const region = this.getRegionForOrg(orgId);
        if (!region) return null;
        return DATA_REGIONS[region].storageEndpoint;
    }

    /**
     * Get AWS region for an organization
     *
     * @param {string} orgId - Organization ID
     * @returns {string|null} AWS region code or null
     */
    getAWSRegion(orgId) {
        const region = this.getRegionForOrg(orgId);
        if (!region) return null;
        return DATA_REGIONS[region].awsRegion;
    }

    /**
     * Validate cross-border data transfer between organizations
     *
     * Checks if data transfer between two orgs is allowed under
     * applicable privacy frameworks and residency requirements.
     *
     * @param {string} sourceOrgId - Source organization ID
     * @param {string} destOrgId - Destination organization ID
     * @returns {Object} Validation result with allowed, reason, frameworks
     */
    validateCrossBorderTransfer(sourceOrgId, destOrgId) {
        const sourceRegion = this.getRegionForOrg(sourceOrgId);
        const destRegion = this.getRegionForOrg(destOrgId);

        if (!sourceRegion || !destRegion) {
            return {
                allowed: false,
                reason: 'Source or destination org region not configured',
                sourceRegion,
                destRegion
            };
        }

        const sourceRegionConfig = DATA_REGIONS[sourceRegion];
        const destRegionConfig = DATA_REGIONS[destRegion];

        // Check if destination is in allowed transfer list
        const allowed = sourceRegionConfig.allowedTransferDestinations.includes(destRegion);

        if (!allowed) {
            return {
                allowed: false,
                reason: `Transfer from ${sourceRegion} to ${destRegion} not allowed by residency policy`,
                sourceRegion,
                destRegion,
                allowedDestinations: sourceRegionConfig.allowedTransferDestinations
            };
        }

        // Get applicable frameworks for both regions
        const sourceFrameworks = this.getComplianceFrameworks(sourceRegion);
        const destFrameworks = this.getComplianceFrameworks(destRegion);

        return {
            allowed: true,
            reason: 'Cross-border transfer allowed within same data plane',
            sourceRegion,
            destRegion,
            sourceFrameworks,
            destFrameworks,
            transferMechanism: this.getTransferMechanism(sourceRegion, destRegion)
        };
    }

    /**
     * Get applicable compliance frameworks for a region
     *
     * @param {string} region - Region code (US, EU, APAC)
     * @returns {Object} Framework definitions for the region
     */
    getComplianceFrameworks(region) {
        if (!DATA_REGIONS[region]) {
            return {};
        }

        const frameworks = {};
        DATA_REGIONS[region].complianceFrameworks.forEach(fwName => {
            if (COMPLIANCE_FRAMEWORKS[fwName]) {
                frameworks[fwName] = COMPLIANCE_FRAMEWORKS[fwName];
            }
        });

        return frameworks;
    }

    /**
     * Get data transfer mechanism for cross-border transfers
     *
     * @param {string} sourceRegion - Source region
     * @param {string} destRegion - Destination region
     * @returns {string|null} Transfer mechanism name
     */
    getTransferMechanism(sourceRegion, destRegion) {
        // Same region = no transfer needed
        if (sourceRegion === destRegion) {
            return 'LOCAL';
        }

        // EU to EU = same mechanism
        if (sourceRegion === 'EU' && destRegion === 'EU') {
            return 'STANDARD_CONTRACTUAL_CLAUSES';
        }

        // US to US = DPA only
        if (sourceRegion === 'US' && destRegion === 'US') {
            return 'DATA_PROCESSING_AGREEMENT';
        }

        // APAC to APAC = DTA
        if (sourceRegion === 'APAC' && destRegion === 'APAC') {
            return 'DATA_TRANSFER_AGREEMENT';
        }

        // Cross-plane = not allowed
        return null;
    }

    /**
     * Generate data residency compliance report for an organization
     *
     * @param {string} orgId - Organization ID
     * @returns {Object} Compliance certification report
     */
    generateDataResidencyReport(orgId) {
        const region = this.getRegionForOrg(orgId);

        if (!region) {
            return {
                orgId,
                compliant: false,
                reason: 'No data region configured for organization',
                report_date: new Date().toISOString()
            };
        }

        const regionConfig = DATA_REGIONS[region];
        const frameworks = this.getComplianceFrameworks(region);

        return {
            orgId,
            region,
            compliant: true,
            regionConfig: {
                name: regionConfig.name,
                description: regionConfig.description,
                awsRegions: regionConfig.regions,
                storageEndpoint: regionConfig.supabaseEndpoint,
                cdnEndpoint: regionConfig.cdnEndpoint
            },
            applicableFrameworks: Object.entries(frameworks).map(([code, fw]) => ({
                code,
                name: fw.name,
                requirements: fw.requirements,
                maxDataRetention: fw.maxDataRetention,
                dataTransferMechanism: fw.dataTransferMechanism
            })),
            dataResidencyRequirement: regionConfig.dataResidencyRequired,
            allowedTransferDestinations: regionConfig.allowedTransferDestinations,
            report_date: new Date().toISOString(),
            report_version: '1.0'
        };
    }

    /**
     * Get all org to region mappings (admin use)
     *
     * @returns {Object} Org ID to region mapping
     */
    getAllOrgRegionMappings() {
        const mappings = {};
        this.orgRegions.forEach((region, orgId) => {
            mappings[orgId] = {
                region,
                locked: this.orgRegionLocks.get(orgId) || false
            };
        });
        return mappings;
    }
}

/**
 * CrossBorderPolicy: Implements data privacy framework compliance for transfers
 *
 * Encodes specific compliance rules for cross-border data movements:
 * - EU-US Data Privacy Framework (EU-DPF)
 * - Standard Contractual Clauses (SCCs)
 * - Full localization mode (strict residency)
 */
export class CrossBorderPolicy {
    constructor(config = {}) {
        this.config = config;
        // Transfer approval cache: transferId -> approval status
        this.transferApprovals = new Map();
    }

    /**
     * Check if transfer is allowed under EU-US Data Privacy Framework
     *
     * @param {string} sourceOrg - Source org ID
     * @param {string} destOrg - Destination org ID
     * @returns {Object} Framework compliance check result
     */
    checkEUUSDPFCompliance(sourceOrg, destOrg) {
        // EU-DPF requires: US org certified by US Department of Commerce
        // Adequacy decision by EU Commission for US
        return {
            framework: 'EU-US DPF',
            allowed: false,
            reason: 'EU-US DPF suspended in 2023. Use Standard Contractual Clauses instead.',
            requiredAlternative: 'STANDARD_CONTRACTUAL_CLAUSES'
        };
    }

    /**
     * Check if transfer is allowed under Standard Contractual Clauses
     *
     * @param {Object} transferRequest - Transfer details
     * @returns {Object} SCC compliance check result
     */
    checkStandardContractualClauses(transferRequest) {
        const {
            sourceRegion = 'EU',
            destRegion = 'US',
            dataCategories = [],
            sensitiveData = false,
            purposeLimitation = null
        } = transferRequest;

        // SCCs require specific safeguards
        const safeguardsRequired = [];

        if (destRegion === 'US') {
            safeguardsRequired.push(
                'Supplementary measures (encryption, access controls)',
                'US government surveillance data protection',
                'Adequate safeguards attestation'
            );
        }

        if (sensitiveData) {
            safeguardsRequired.push(
                'Enhanced security controls',
                'Data minimization',
                'Purpose limitation enforcement'
            );
        }

        return {
            framework: 'Standard Contractual Clauses',
            allowed: true,
            sourceRegion,
            destRegion,
            dataCategories,
            sensitiveData,
            safeguardsRequired,
            transferApprovalRequired: true,
            approvalValidity: '1 year'
        };
    }

    /**
     * Check full localization mode (no cross-border transfers allowed)
     *
     * @param {Object} transferRequest - Transfer details
     * @returns {Object} Localization mode result
     */
    checkFullLocalization(transferRequest) {
        return {
            framework: 'Full Localization',
            allowed: false,
            reason: 'Full localization mode: all data must remain within original data plane',
            sourceRegion: transferRequest.sourceRegion,
            destRegion: transferRequest.destRegion,
            enforcement: 'strict'
        };
    }

    /**
     * Request transfer approval
     *
     * @param {Object} transferRequest - Transfer details
     * @returns {string} Transfer approval ID
     */
    requestTransferApproval(transferRequest) {
        const {
            sourceOrg,
            destOrg,
            sourceRegion,
            destRegion,
            policyMode = 'SCC'
        } = transferRequest;

        // Generate approval ID
        const approvalId = `xfr_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

        // Determine compliance check based on policy mode
        let complianceCheck;
        switch (policyMode) {
            case 'EUDPF':
                complianceCheck = this.checkEUUSDPFCompliance(sourceOrg, destOrg);
                break;
            case 'SCC':
                complianceCheck = this.checkStandardContractualClauses(transferRequest);
                break;
            case 'LOCALIZATION':
                complianceCheck = this.checkFullLocalization(transferRequest);
                break;
            default:
                complianceCheck = this.checkStandardContractualClauses(transferRequest);
        }

        this.transferApprovals.set(approvalId, {
            status: complianceCheck.allowed ? 'APPROVED' : 'REJECTED',
            transferRequest,
            complianceCheck,
            requestTime: Date.now(),
            expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000) // 1 year
        });

        return {
            approvalId,
            status: complianceCheck.allowed ? 'APPROVED' : 'REJECTED',
            complianceCheck
        };
    }

    /**
     * Check transfer approval status
     *
     * @param {string} approvalId - Approval ID
     * @returns {Object} Approval status
     */
    checkApprovalStatus(approvalId) {
        const approval = this.transferApprovals.get(approvalId);
        if (!approval) {
            return { valid: false, reason: 'Approval not found' };
        }

        const now = Date.now();
        const expired = now > approval.expiresAt;

        return {
            valid: !expired,
            status: approval.status,
            expiresAt: approval.expiresAt,
            expired
        };
    }
}

/**
 * RegionRouter: Routes API requests to correct data plane endpoint
 *
 * Determines and routes requests to appropriate regional endpoints
 * based on org configuration.
 */
export class RegionRouter {
    constructor(manager) {
        this.manager = manager;
    }

    /**
     * Get routing configuration for an API request
     *
     * @param {string} orgId - Organization ID
     * @param {string} apiPath - API path (e.g., /api/agents/run)
     * @returns {Object} Routing configuration
     */
    getRouting(orgId, apiPath = '') {
        const region = this.manager.getRegionForOrg(orgId);

        if (!region) {
            return {
                routable: false,
                reason: 'Organization region not configured'
            };
        }

        const regionConfig = DATA_REGIONS[region];

        return {
            routable: true,
            region,
            baseUrl: regionConfig.supabaseEndpoint,
            fullUrl: `${regionConfig.supabaseEndpoint}${apiPath}`,
            awsRegion: regionConfig.awsRegion,
            headers: {
                'x-finault-region': region,
                'x-finault-org': orgId
            }
        };
    }

    /**
     * Route a request to correct regional endpoint
     *
     * @param {string} orgId - Organization ID
     * @param {string} method - HTTP method
     * @param {string} path - Request path
     * @param {Object} body - Request body
     * @returns {Object} Complete routed request
     */
    routeRequest(orgId, method, path, body = null) {
        const routing = this.getRouting(orgId, path);

        if (!routing.routable) {
            throw new Error(`Cannot route request: ${routing.reason}`);
        }

        return {
            ...routing,
            method,
            body,
            timestamp: Date.now()
        };
    }

    /**
     * Validate that a request targets the correct region
     *
     * @param {string} orgId - Organization ID
     * @param {string} targetRegion - Target region from request
     * @returns {Object} Validation result
     */
    validateRequestRegion(orgId, targetRegion) {
        const configuredRegion = this.manager.getRegionForOrg(orgId);

        if (!configuredRegion) {
            return { valid: false, reason: 'Org region not configured' };
        }

        const matches = configuredRegion === targetRegion;
        return {
            valid: matches,
            configuredRegion,
            targetRegion,
            reason: matches ? null : `Request region mismatch: ${targetRegion} vs ${configuredRegion}`
        };
    }
}

/**
 * Factory function to create a complete data residency system
 *
 * @param {Object} config - Configuration object
 * @returns {Object} Data residency system with manager, policy, and router
 */
export function createDataResidencySystem(config = {}) {
    const manager = new DataResidencyManager(config);
    const policy = new CrossBorderPolicy(config);
    const router = new RegionRouter(manager);

    return {
        manager,
        policy,
        router,
        config
    };
}

export default {
    DATA_REGIONS,
    COMPLIANCE_FRAMEWORKS,
    DataResidencyManager,
    CrossBorderPolicy,
    RegionRouter,
    createDataResidencySystem
};
