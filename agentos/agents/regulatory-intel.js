/**
 * REGULATORY INTELLIGENCE AGENT
 * Specialist agent for monitoring AI regulations and compliance mapping
 *
 * Capabilities:
 * - Monitor evolving AI regulations (EU AI Act, NIST AI RMF, SOX 404, GDPR, SOC 2)
 * - Map compliance gaps to current controls
 * - Generate compliance readiness scorecards
 * - Recommend policy updates to close gaps
 * - Track regulatory deadlines
 * - Map controls to specific requirements
 * - Generate formal compliance reports
 *
 * Autonomy: 3/5 - Autonomous monitoring/gap analysis; human legal review for policy changes
 */

import { AgentMemory, MEMORY_TYPES, IMPORTANCE } from '../core/agent-memory.js';
import { validateAgentParams } from '../core/validate-agent-params.js';

const AGENT_CONFIG = {
    id: 'regulatory-intel',
    name: 'Regulatory Intelligence',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096
};

/**
 * Regulatory Framework Database
 */
const REGULATORY_FRAMEWORKS = {
    'EU_AI_ACT': {
        name: 'EU Artificial Intelligence Act',
        jurisdiction: 'European Union',
        effectiveDate: '2024-01-01',
        version: '2024.1',
        lastUpdated: '2024-01-01',
        riskCategories: {
            prohibited: ['Social scoring', 'Real-time biometric identification'],
            highRisk: ['Hiring decisions', 'Credit scoring', 'Law enforcement', 'Fundamental rights'],
            limitedRisk: ['Chatbots', 'Deepfakes', 'Video synthesis'],
            minimal: ['Spam filters', 'Game playing', 'Recommended systems']
        },
        keyRequirements: {
            'Art_5_Prohibited': 'Prohibits high-risk AI applications',
            'Art_6_HighRisk': 'High-risk AI systems require compliance',
            'Art_12_Logging': 'Automatic logging of high-risk AI decisions (1 year)',
            'Art_13_Transparency': 'Clear disclosure when interacting with AI',
            'Art_14_HumanOversight': 'Human intervention capability required',
            'Art_15_Accuracy': 'High-risk systems must have high accuracy',
            'Art_22_RightToExplanation': 'Users can request explanation of decisions',
            'Art_24_QualityMgmt': 'Quality management system required'
        },
        deadlines: {
            'Immediate': '2024-01-01',
            'Phase-in': '2025-12-31',
            'Full Compliance': '2026-12-31'
        }
    },
    'NIST_AI_RMF': {
        name: 'NIST AI Risk Management Framework',
        jurisdiction: 'United States',
        effectiveDate: '2023-01-26',
        version: '2023.1',
        lastUpdated: '2024-01-01',
        pillars: {
            'Govern': 'AI risk governance and accountability',
            'Map': 'Characterize and document AI systems',
            'Measure': 'Measure AI performance and impacts',
            'Manage': 'Active monitoring and risk response'
        },
        keyRequirements: {
            'Govern_1': 'Establish AI governance structure',
            'Govern_2': 'Document AI use cases and risk tolerance',
            'Map_1': 'Characterize AI system capabilities',
            'Map_2': 'Document potential harms',
            'Measure_1': 'Establish performance metrics',
            'Measure_2': 'Monitor for bias and fairness',
            'Manage_1': 'Implement risk response plans',
            'Manage_2': 'Continuous monitoring and evaluation'
        },
        deadlines: {
            'Recommended': 'Immediate',
            'Best Practice': '2025-12-31'
        }
    },
    'SOX_404': {
        name: 'Sarbanes-Oxley Act Section 404',
        jurisdiction: 'United States',
        effectiveDate: '2004-11-30',
        version: '2004.1',
        lastUpdated: '2022-01-01',
        framework: 'COSO Internal Control Framework',
        applicability: 'Public companies and large accelerated filers',
        keyRequirements: {
            'Sec_404a': 'Management assessment of internal controls',
            'Sec_404b': 'Auditor attestation of internal controls',
            'Control_Env': 'Establish control environment',
            'Risk_Assess': 'Conduct risk assessment',
            'Control_Activ': 'Design and implement control activities',
            'Info_Comm': 'Information and communication systems',
            'Monitor': 'Monitoring of controls'
        },
        deadlines: {
            'Annual Assessment': 'Annual',
            'Auditor Review': 'Annual'
        }
    },
    'GDPR': {
        name: 'General Data Protection Regulation',
        jurisdiction: 'European Union',
        effectiveDate: '2018-05-25',
        version: '2016.679',
        lastUpdated: '2024-01-01',
        articles: {
            'Art_5': 'Principles relating to processing of personal data',
            'Art_6': 'Lawfulness of processing',
            'Art_17': 'Right to erasure (Right to be forgotten)',
            'Art_20': 'Right to data portability',
            'Art_22': 'Rights related to automated decision making',
            'Art_33': 'Notification of a personal data breach',
            'Art_35': 'Data protection impact assessment'
        },
        keyRequirements: {
            'Lawful_Basis': 'Establish lawful basis for processing',
            'Transparency': 'Transparent privacy notices',
            'DataMinim': 'Collect only necessary data',
            'Retention': 'Delete data per retention policy',
            'RightToErasure': 'Implement right to be forgotten',
            'RightToPortability': 'Enable data portability',
            'DPA': 'Data Protection Impact Assessment',
            'BreachNotif': 'Notify authorities within 72 hours'
        },
        deadlines: {
            'Immediate': 'Ongoing compliance',
            'BreachNotification': '72 hours'
        }
    },
    'SOC_2': {
        name: 'System and Organization Controls 2',
        jurisdiction: 'International (AICPA)',
        effectiveDate: '2023-12-31',
        version: '2023.1',
        lastUpdated: '2024-01-01',
        trustCriteria: {
            'Security': 'Protection against unauthorized access',
            'Availability': 'System is available when needed',
            'Processing_Integrity': 'System processes complete, accurate data',
            'Confidentiality': 'Information is protected from disclosure',
            'Privacy': 'Personal information is protected'
        },
        keyRequirements: {
            'CC1': 'Control environment',
            'CC2': 'Communication and information',
            'CC3': 'Risk assessment',
            'CC4': 'Control activities',
            'CC5': 'Monitoring',
            'CC6': 'Logical access controls',
            'CC7': 'System monitoring',
            'CC8': 'Incident management',
            'CC9': 'Service provider management'
        },
        deadlines: {
            'Annual': 'Annual audit and certification',
            'ReportValidity': '1 year from issuance'
        }
    }
};

/**
 * RegulatoryIntel Agent
 */
export class RegulatoryIntel {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'RegulatoryIntel');
        this.userId = userId;
        this.organizationId = organizationId;
        this.memory = new AgentMemory(AGENT_CONFIG.id, organizationId, userId);
        this._memoryLoaded = false;
        this.frameworks = REGULATORY_FRAMEWORKS;
    }

    async initMemory() {
        if (!this._memoryLoaded) {
            await this.memory.load({
                memoryTypes: [MEMORY_TYPES.INSIGHT, MEMORY_TYPES.PATTERN],
                maxAge: 90
            });
            this._memoryLoaded = true;
        }
    }

    /**
     * Scan for regulatory changes across frameworks
     *
     * @param {Array} frameworkNames - Frameworks to scan
     * @returns {Object} Detected changes and updates
     */
    scanRegulatoryChanges(frameworkNames = []) {
        const results = {
            scannedAt: new Date().toISOString(),
            frameworksScanned: [],
            changes: [],
            updatesAvailable: 0
        };

        const frameworksToScan = frameworkNames.length > 0 ? frameworkNames : Object.keys(this.frameworks);

        for (const fwName of frameworksToScan) {
            if (!this.frameworks[fwName]) continue;

            const fw = this.frameworks[fwName];
            results.frameworksScanned.push({
                name: fw.name,
                currentVersion: fw.version,
                lastUpdated: fw.lastUpdated
            });

            // Simulate change detection
            // In production, would compare against regulatory feed
            const daysSinceUpdate = Math.floor((Date.now() - new Date(fw.lastUpdated).getTime()) / (1000 * 60 * 60 * 24));

            if (daysSinceUpdate > 90) {
                results.changes.push({
                    framework: fw.name,
                    severity: 'info',
                    message: `Framework last updated ${daysSinceUpdate} days ago - recommend review`,
                    requiredAction: 'Review latest regulatory updates'
                });
                results.updatesAvailable++;
            }
        }

        return {
            success: true,
            ...results
        };
    }

    /**
     * Assess compliance gap between org controls and framework requirements
     *
     * @param {string} orgId - Organization ID
     * @param {string} framework - Framework name
     * @returns {Object} Gap analysis
     */
    assessComplianceGap(orgId, framework) {
        if (!orgId || !framework || !this.frameworks[framework]) {
            return { success: false, error: 'Invalid parameters' };
        }

        const fw = this.frameworks[framework];

        // Placeholder: Simulate org controls
        const currentControls = {
            'Data_Encryption': { implemented: true, coverage: 0.95 },
            'Access_Controls': { implemented: true, coverage: 0.85 },
            'Audit_Logging': { implemented: true, coverage: 0.70 },
            'Incident_Response': { implemented: false, coverage: 0 },
            'Training_Program': { implemented: true, coverage: 0.60 },
            'Data_Classification': { implemented: false, coverage: 0 }
        };

        const gaps = [];
        const coverageByControl = {};

        for (const [controlName, controlInfo] of Object.entries(currentControls)) {
            coverageByControl[controlName] = {
                implemented: controlInfo.implemented,
                coverage: (controlInfo.coverage * 100).toFixed(0) + '%'
            };

            if (!controlInfo.implemented) {
                gaps.push({
                    control: controlName,
                    severity: 'high',
                    gap: 'Not implemented',
                    requiredByFramework: framework,
                    estimatedRemediationDays: 30
                });
            } else if (controlInfo.coverage < 0.9) {
                gaps.push({
                    control: controlName,
                    severity: 'medium',
                    gap: `Coverage only ${(controlInfo.coverage * 100).toFixed(0)}%`,
                    requiredByFramework: framework,
                    estimatedRemediationDays: 14
                });
            }
        }

        const implementationRate = Object.values(currentControls).filter(c => c.implemented).length / Object.keys(currentControls).length;

        return {
            success: true,
            framework: fw.name,
            organization: orgId,
            assessmentDate: new Date().toISOString(),
            gapSummary: {
                totalGaps: gaps.length,
                criticalGaps: gaps.filter(g => g.severity === 'critical').length,
                highGaps: gaps.filter(g => g.severity === 'high').length,
                mediumGaps: gaps.filter(g => g.severity === 'medium').length
            },
            gaps,
            controlsCoverage: coverageByControl,
            overallImplementationRate: (implementationRate * 100).toFixed(1) + '%',
            readinessLevel: implementationRate > 0.8 ? 'Advanced' : implementationRate > 0.6 ? 'Intermediate' : 'Initial'
        };
    }

    /**
     * Generate compliance readiness scorecard
     *
     * @param {string} orgId - Organization ID
     * @returns {Object} Readiness scorecard
     */
    generateReadinessScorecard(orgId) {
        if (!orgId) {
            return { success: false, error: 'Invalid organization ID' };
        }

        const scorecard = {
            organization: orgId,
            generatedAt: new Date().toISOString(),
            frameworks: []
        };

        for (const [fwKey, fw] of Object.entries(this.frameworks)) {
            // Simulate readiness assessment
            const readinessScores = {
                'EU_AI_ACT': 0.65,
                'NIST_AI_RMF': 0.75,
                'SOX_404': 0.85,
                'GDPR': 0.72,
                'SOC_2': 0.68
            };

            const score = readinessScores[fwKey] || 0.5;
            const scorePercentage = Math.round(score * 100);

            scorecard.frameworks.push({
                framework: fw.name,
                jurisdiction: fw.jurisdiction,
                version: fw.version,
                readinessScore: scorePercentage + '%',
                readinessLevel: scorePercentage >= 85 ? 'Ready' : scorePercentage >= 70 ? 'Mostly Ready' : scorePercentage >= 50 ? 'Partial' : 'Not Ready',
                keyGaps: [
                    { area: 'Documentation', status: 'Incomplete' },
                    { area: 'Training', status: 'In Progress' }
                ],
                estimatedTimeToFull: scorePercentage >= 85 ? '< 1 month' : '2-3 months',
                nextSteps: [
                    'Complete gap remediation',
                    'Implement remaining controls',
                    'Schedule compliance audit'
                ]
            });
        }

        const overallScore = Math.round(
            scorecard.frameworks.reduce((sum, f) => sum + parseInt(f.readinessScore), 0) / scorecard.frameworks.length
        );

        return {
            success: true,
            ...scorecard,
            overallReadinessScore: overallScore + '%',
            overallStatus: overallScore >= 80 ? 'Well-Prepared' : overallScore >= 70 ? 'On Track' : 'Needs Attention'
        };
    }

    /**
     * Recommend policy updates to close compliance gaps
     *
     * @param {Array} gaps - Identified compliance gaps
     * @returns {Object} Policy recommendations
     */
    recommendPolicyUpdates(gaps = []) {
        if (!Array.isArray(gaps)) {
            return { success: false, error: 'Invalid parameters' };
        }

        const recommendations = {
            policiesRecommended: [],
            prioritizedActions: [],
            estimatedImplementationCost: 0
        };

        // Map gaps to policy updates
        const policyMap = {
            'Incident_Response': {
                policy: 'Incident Response and Management Policy',
                purpose: 'Define procedures for detecting, responding, and recovering from security incidents',
                keyElements: [
                    'Incident detection and escalation',
                    'Response team roles and responsibilities',
                    'Communication and notification procedures',
                    'Post-incident review and improvement'
                ],
                estimatedDays: 30,
                estimatedCost: 5000
            },
            'Data_Classification': {
                policy: 'Data Classification and Handling Policy',
                purpose: 'Establish framework for classifying data by sensitivity and protection requirements',
                keyElements: [
                    'Data classification levels',
                    'Handling and storage requirements per level',
                    'Access controls and encryption',
                    'Retention and disposal procedures'
                ],
                estimatedDays: 14,
                estimatedCost: 2500
            },
            'Audit_Logging': {
                policy: 'Audit Logging and Monitoring Policy',
                purpose: 'Define requirements for logging, monitoring, and reviewing system access and changes',
                keyElements: [
                    'Logging scope and requirements',
                    'Log retention and archival',
                    'Monitoring and alerting rules',
                    'Log review and analysis procedures'
                ],
                estimatedDays: 21,
                estimatedCost: 3500
            }
        };

        for (const gap of gaps) {
            if (policyMap[gap.control]) {
                const policy = policyMap[gap.control];
                recommendations.policiesRecommended.push({
                    ...policy,
                    priority: gap.severity === 'critical' ? 'P0' : gap.severity === 'high' ? 'P1' : 'P2',
                    targetControl: gap.control
                });

                recommendations.prioritizedActions.push({
                    action: `Develop ${gap.control} policy`,
                    priority: gap.severity === 'critical' ? 'P0' : gap.severity === 'high' ? 'P1' : 'P2',
                    dueDate: new Date(Date.now() + policy.estimatedDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    estimatedDays: policy.estimatedDays
                });

                recommendations.estimatedImplementationCost += policy.estimatedCost;
            }
        }

        // Sort by priority
        recommendations.prioritizedActions.sort((a, b) => a.priority.localeCompare(b.priority));

        return {
            success: true,
            ...recommendations,
            totalEstimatedDays: recommendations.prioritizedActions.reduce((sum, a) => sum + a.estimatedDays, 0),
            requiresLegalReview: true
        };
    }

    /**
     * Track regulatory framework deadlines
     *
     * @param {string} framework - Framework name
     * @returns {Object} Deadline tracking
     */
    trackFrameworkDeadlines(framework) {
        if (!framework || !this.frameworks[framework]) {
            return { success: false, error: 'Invalid framework' };
        }

        const fw = this.frameworks[framework];
        const deadlines = [];

        for (const [deadlineName, deadlineDate] of Object.entries(fw.deadlines || {})) {
            // Skip non-date deadlines
            if (!deadlineDate || typeof deadlineDate !== 'string' || deadlineDate === 'Immediate' || deadlineDate === 'Ongoing compliance' || deadlineDate === 'Annual') {
                continue;
            }

            const deadline = new Date(deadlineDate);
            const today = new Date();

            // Skip invalid dates
            if (isNaN(deadline.getTime())) {
                continue;
            }

            const daysUntil = Math.floor((deadline - today) / (1000 * 60 * 60 * 24));

            deadlines.push({
                milestone: deadlineName,
                deadline: deadline.toISOString().split('T')[0],
                daysRemaining: Math.max(daysUntil, 0),
                status: daysUntil < 0 ? 'Overdue' : daysUntil < 30 ? 'Urgent' : daysUntil < 90 ? 'Soon' : 'On Track',
                action: daysUntil < 30 ? 'Immediate action required' : daysUntil < 90 ? 'Begin implementation' : 'Planning phase'
            });
        }

        return {
            success: true,
            framework: fw.name,
            deadlines: deadlines.sort((a, b) => a.daysRemaining - b.daysRemaining)
        };
    }

    /**
     * Map a specific control to regulatory requirements
     *
     * @param {string} control - Control name
     * @param {string} framework - Framework name
     * @returns {Object} Control-to-requirement mapping
     */
    mapControlToRequirement(control, framework) {
        if (!control || !framework || !this.frameworks[framework]) {
            return { success: false, error: 'Invalid parameters' };
        }

        const fw = this.frameworks[framework];

        // Simulate control mapping
        const controlMapping = {
            'Data_Encryption': [
                { framework: 'EU_AI_ACT', requirement: 'Art_5_Prohibited', purpose: 'Protect personal data in high-risk AI' },
                { framework: 'GDPR', requirement: 'Art_5', purpose: 'Integrity and confidentiality of personal data' },
                { framework: 'SOC_2', requirement: 'CC6', purpose: 'Logical access controls and encryption' }
            ],
            'Access_Controls': [
                { framework: 'EU_AI_ACT', requirement: 'Art_14_HumanOversight', purpose: 'Human oversight of AI systems' },
                { framework: 'SOX_404', requirement: 'Control_Env', purpose: 'Access control environment' },
                { framework: 'SOC_2', requirement: 'CC6', purpose: 'Logical access controls' }
            ]
        };

        const mapping = controlMapping[control] || [];
        const frameworkRequirements = mapping.filter(m => m.framework === framework);

        return {
            success: true,
            control,
            framework: fw.name,
            mappedRequirements: frameworkRequirements,
            implementationEvidenceTypes: [
                'Policy documentation',
                'Configuration records',
                'Access logs',
                'Testing results',
                'Audit reports'
            ],
            complianceStatus: frameworkRequirements.length > 0 ? 'Mapped' : 'Requires Analysis'
        };
    }

    /**
     * Generate formal compliance report
     *
     * @param {string} orgId - Organization ID
     * @param {Array} frameworks - Frameworks to report on
     * @returns {Object} Formal compliance report
     */
    generateComplianceReport(orgId, frameworks = []) {
        if (!orgId) {
            return { success: false, error: 'Invalid organization ID' };
        }

        const report = {
            reportId: `COMP-${Date.now()}`,
            organization: orgId,
            generatedAt: new Date().toISOString(),
            reportingPeriod: 'Current Quarter',
            executiveSummary: {
                overallStatus: 'Partially Compliant',
                frameworksCovered: 0,
                complianceScore: 0,
                actionItemsOpen: 0,
                riskLevel: 'Medium'
            },
            frameworkAssessments: []
        };

        const frameworksToReport = frameworks.length > 0 ? frameworks : Object.keys(this.frameworks);
        let totalScore = 0;

        for (const fwName of frameworksToReport) {
            if (!this.frameworks[fwName]) continue;

            const fw = this.frameworks[fwName];
            const assessmentScore = Math.round(Math.random() * 40 + 50); // Simulate 50-90 score

            report.frameworkAssessments.push({
                framework: fw.name,
                jurisdiction: fw.jurisdiction,
                version: fw.version,
                complianceScore: assessmentScore + '%',
                status: assessmentScore >= 80 ? 'Compliant' : assessmentScore >= 70 ? 'Substantially Compliant' : 'Non-Compliant',
                findings: {
                    strengths: [
                        'Strong access controls',
                        'Comprehensive audit logging'
                    ],
                    gaps: [
                        'Incomplete documentation',
                        'Training gaps in compliance procedures'
                    ]
                },
                recommendations: [
                    'Update compliance documentation',
                    'Enhance employee training program',
                    'Implement automated monitoring'
                ]
            });

            totalScore += assessmentScore;
            report.executiveSummary.frameworksCovered++;
        }

        if (report.executiveSummary.frameworksCovered > 0) {
            report.executiveSummary.complianceScore = Math.round(totalScore / report.executiveSummary.frameworksCovered) + '%';
        }

        report.executiveSummary.actionItemsOpen = report.frameworkAssessments.reduce(
            (sum, fa) => sum + (fa.recommendations || []).length,
            0
        );

        return {
            success: true,
            ...report,
            disclaimer: 'This report is for internal use and should be reviewed by legal counsel'
        };
    }

    /**
     * Main execution method
     */
    async execute(task, parameters = {}) {
        let result;

        switch (task) {
            case 'scan_changes':
                result = this.scanRegulatoryChanges(parameters.frameworks || []);
                break;

            case 'assess_gap':
                result = this.assessComplianceGap(
                    this.organizationId,
                    parameters.framework || 'EU_AI_ACT'
                );
                break;

            case 'readiness_scorecard':
                result = this.generateReadinessScorecard(this.organizationId);
                break;

            case 'policy_recommendations':
                result = this.recommendPolicyUpdates(parameters.gaps || []);
                break;

            case 'track_deadlines':
                result = this.trackFrameworkDeadlines(parameters.framework || 'EU_AI_ACT');
                break;

            case 'map_control':
                result = this.mapControlToRequirement(
                    parameters.control,
                    parameters.framework
                );
                break;

            case 'compliance_report':
                result = this.generateComplianceReport(
                    this.organizationId,
                    parameters.frameworks || []
                );
                break;

            default:
                result = { success: false, error: `Unknown task: ${task}` };
        }

        return result;
    }
}

export default RegulatoryIntel;
export { REGULATORY_FRAMEWORKS };
