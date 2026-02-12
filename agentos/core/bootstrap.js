/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT AGENTOS BOOTSTRAP
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Diamond Tier: Complete Agent System Initialization
 *
 * Registers all agents, initializes memory, and sets up orchestration.
 * This is the single entry point for the entire agent system.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createLogger } from './structured-logger.js';

const logger = createLogger('bootstrap');

import { AgentOrchestrator } from './agent-orchestrator.js';
import { AgentMemory, MEMORY_TYPES, IMPORTANCE } from './agent-memory.js';
import { AgentToolkit, TOOL_DEFINITIONS } from './agent-tools.js';

// Infrastructure modules (Gap #2, #4, #6, #8, #9, #10, #13, #14)
import { createNotificationRouter, NOTIFICATION_CHANNELS } from './notification-system.js';
import { createJobQueue, JOB_STATUS, SCHEDULED_JOBS } from './job-queue.js';
import { createFileProcessingPipeline } from './file-processing.js';
import { CacheManager } from './cache-strategy.js';
import { FINAULT_ERRORS } from './error-taxonomy.js';
import { describeAllMachines } from './state-machines.js';
import { PROVIDER_REGISTRY } from './provider-integrations.js';
import { API_VERSIONS } from './api-versioning.js';
import { createAgentEvaluator, createQualityGates, createTestOrchestrator, AGENT_BENCHMARKS, GOLDEN_DATASETS } from './testing-strategy.js';

// Import all agents
import { BudgetEnforcer } from '../agents/budget-enforcer.js';
import { OptimizationAgent } from '../agents/optimization-agent.js';
import { ForecastingAgent } from '../agents/forecasting-agent.js';
import { InvoiceReconciliationAgent } from '../agents/invoice-reconciliation.js';
import { ChargebackAgent } from '../agents/chargeback-agent.js';
import { PolicyAgent } from '../agents/policy-agent.js';
import { CostIntelligenceAgent } from '../agents/cost-intelligence.js';
import { FinaultPal } from '../agents/finault-pal.js';
import { AutopilotAgent } from '../agents/autopilot.js';
import { ClosePackGenerator } from '../agents/close-pack-generator.js';
import { MagicOnboarding } from '../agents/magic-onboarding.js';
import { IntelligenceAgent } from '../agents/intelligence.js';
import { CompoundLearning } from '../agents/compound-learning.js';

// Blueprint agents — gap-fill builds
import { CarbonTracker } from '../agents/carbon-tracker.js';
import { ProcurementAdvisor } from '../agents/procurement-advisor.js';
import { DisputeResolverAgent } from '../agents/dispute-resolver.js';
import { ForecastEngine } from '../agents/forecast-engine.js';
import { RegulatoryIntel } from '../agents/regulatory-intel.js';
import { AuditTrackerAgent } from '../agents/audit-tracker-agent.js';

/**
 * Agent Registry - Maps agent types to their capabilities
 */
const AGENT_REGISTRY = [
    {
        name: 'budget-enforcer',
        class: BudgetEnforcer,
        capabilities: ['budget', 'enforcement', 'throttling', 'hard_cap'],
        description: 'Enforces budget limits and prevents overspend in real-time'
    },
    {
        name: 'optimization-agent',
        class: OptimizationAgent,
        capabilities: ['optimization', 'cost_reduction', 'model_switching', 'savings'],
        description: 'Finds and implements cost optimization opportunities'
    },
    {
        name: 'forecasting-agent',
        class: ForecastingAgent,
        capabilities: ['forecasting', 'prediction', 'trend_analysis', 'budgeting'],
        description: 'Predicts future AI costs using statistical models'
    },
    {
        name: 'invoice-reconciliation',
        class: InvoiceReconciliationAgent,
        capabilities: ['reconciliation', 'invoice_matching', 'variance_analysis', 'audit'],
        description: 'Matches invoices to usage logs with cryptographic proof'
    },
    {
        name: 'chargeback-agent',
        class: ChargebackAgent,
        capabilities: ['chargeback', 'cost_allocation', 'department_billing', 'showback'],
        description: 'Allocates AI costs to cost centers and departments'
    },
    {
        name: 'policy-agent',
        class: PolicyAgent,
        capabilities: ['compliance', 'policy', 'model_restrictions', 'governance'],
        description: 'Enforces AI usage policies and model restrictions'
    },
    {
        name: 'cost-intelligence',
        class: CostIntelligenceAgent,
        capabilities: ['cost_analysis', 'anomaly_detection', 'insights', 'reporting'],
        description: 'Provides deep cost analysis and detects anomalies'
    },
    {
        name: 'finault-pal',
        class: FinaultPal,
        capabilities: ['chat', 'general', 'assistant', 'help'],
        description: 'Conversational interface for all Finault capabilities'
    },
    {
        name: 'autopilot',
        class: AutopilotAgent,
        capabilities: ['automation', 'autopilot', 'dispute_recovery', 'escalation'],
        description: 'Automated dispute recovery and cost optimization'
    },
    {
        name: 'close-pack-generator',
        class: ClosePackGenerator,
        capabilities: ['reporting', 'close_pack', 'cfo_report', 'month_end'],
        description: 'Generates CFO-ready month-end close packs'
    },
    {
        name: 'magic-onboarding',
        class: MagicOnboarding,
        capabilities: ['onboarding', 'setup', 'configuration', 'integration'],
        description: 'Automates customer onboarding and setup'
    },
    {
        name: 'intelligence',
        class: IntelligenceAgent,
        capabilities: ['analysis', 'insights', 'intelligence', 'recommendations'],
        description: 'Provides strategic AI cost intelligence'
    },
    {
        name: 'compound-learning',
        class: CompoundLearning,
        capabilities: ['learning', 'improvement', 'pattern_recognition', 'memory'],
        description: 'Learns from outcomes and improves over time'
    },
    // ═══════════════════════════════════════════════════════════════
    // Blueprint gap-fill agents (Architecture Blueprint spec)
    // ═══════════════════════════════════════════════════════════════
    {
        name: 'carbon-tracker',
        class: CarbonTracker,
        capabilities: ['sustainability', 'carbon_tracking', 'esg_reporting', 'green_routing'],
        description: 'Maps AI compute to CO2e emissions for ESG reporting and green routing'
    },
    {
        name: 'procurement-advisor',
        class: ProcurementAdvisor,
        capabilities: ['procurement', 'contract_analysis', 'vendor_scoring', 'rate_negotiation'],
        description: 'Analyzes vendor contracts and identifies savings opportunities'
    },
    {
        name: 'dispute-resolver',
        class: DisputeResolverAgent,
        capabilities: ['dispute', 'billing_dispute', 'evidence_gathering', 'credit_recovery'],
        description: 'Builds evidence packets for billing disputes and tracks resolution'
    },
    {
        name: 'forecast-engine',
        class: ForecastEngine,
        capabilities: ['monte_carlo', 'scenario_planning', 'capacity_modeling', 'roi_analysis'],
        description: 'Monte Carlo simulation and scenario-based cost forecasting'
    },
    {
        name: 'regulatory-intel',
        class: RegulatoryIntel,
        capabilities: ['regulatory', 'compliance_scanning', 'framework_tracking', 'policy_recommendation'],
        description: 'Monitors regulatory frameworks and assesses compliance gaps'
    },
    {
        name: 'audit-tracker',
        class: AuditTrackerAgent,
        capabilities: ['audit', 'audit_trail', 'merkle_seal', 'compliance_bundle', 'retention'],
        description: 'Hash-chained audit log with Merkle sealing and compliance bundles'
    }
];

/**
 * Workflow Definitions
 */
const WORKFLOWS = {
    'month-end-close': {
        name: 'Month-End Close',
        description: 'Complete month-end close process with all required documents',
        steps: [
            { agent: 'invoice-reconciliation', action: 'reconcile', approval: false },
            { agent: 'chargeback-agent', action: 'allocate', approval: false },
            { agent: 'forecasting-agent', action: 'forecast', approval: false },
            { agent: 'close-pack-generator', action: 'generate', approval: true, approver: 'finance' }
        ],
        requiredApprovals: ['finance'],
        timeout: 3600000 // 1 hour
    },
    'dispute-recovery': {
        name: 'Dispute Recovery',
        description: 'Automated invoice dispute and recovery process',
        steps: [
            { agent: 'invoice-reconciliation', action: 'findDiscrepancies', approval: false },
            { agent: 'autopilot', action: 'generateDispute', approval: true, approver: 'finance' },
            { agent: 'autopilot', action: 'sendDispute', approval: true, approver: 'finance' },
            { agent: 'autopilot', action: 'trackRecovery', approval: false }
        ],
        requiredApprovals: ['finance'],
        timeout: 864000000 // 10 days
    },
    'cost-optimization': {
        name: 'Cost Optimization',
        description: 'Find and implement cost savings',
        steps: [
            { agent: 'optimization-agent', action: 'findOpportunities', approval: false },
            { agent: 'cost-intelligence', action: 'validateSavings', approval: false },
            { agent: 'optimization-agent', action: 'implementOptimization', approval: true, approver: 'engineering' }
        ],
        requiredApprovals: ['engineering'],
        timeout: 86400000 // 24 hours
    },
    'budget-breach': {
        name: 'Budget Breach Response',
        description: 'Handle budget limit breaches',
        steps: [
            { agent: 'budget-enforcer', action: 'analyze', approval: false },
            { agent: 'cost-intelligence', action: 'findCause', approval: false },
            { agent: 'optimization-agent', action: 'suggestMitigation', approval: false },
            { agent: 'autopilot', action: 'notify', approval: false }
        ],
        requiredApprovals: [],
        timeout: 300000 // 5 minutes (urgent)
    },
    // ═══════════════════════════════════════════════════════════════
    // Blueprint gap-fill workflows
    // ═══════════════════════════════════════════════════════════════
    'vendor-renegotiation': {
        name: 'Vendor Re-negotiation',
        description: 'Analyze contracts and build renegotiation briefs',
        steps: [
            { agent: 'procurement-advisor', action: 'analyzeContract', approval: false },
            { agent: 'procurement-advisor', action: 'identifySavings', approval: false },
            { agent: 'procurement-advisor', action: 'generateRenegotiationBrief', approval: true, approver: 'finance' }
        ],
        requiredApprovals: ['finance'],
        timeout: 86400000 // 24 hours
    },
    'billing-dispute': {
        name: 'Billing Dispute',
        description: 'Detect disputes, build evidence, and track resolution',
        steps: [
            { agent: 'dispute-resolver', action: 'detectDisputeOpportunities', approval: false },
            { agent: 'dispute-resolver', action: 'buildEvidencePacket', approval: false },
            { agent: 'dispute-resolver', action: 'generateDisputeLetter', approval: true, approver: 'finance' },
            { agent: 'audit-tracker', action: 'logEvent', approval: false }
        ],
        requiredApprovals: ['finance'],
        timeout: 864000000 // 10 days
    },
    'regulatory-compliance-check': {
        name: 'Regulatory Compliance Check',
        description: 'Scan regulations, assess gaps, and recommend policy updates',
        steps: [
            { agent: 'regulatory-intel', action: 'scanRegulatoryChanges', approval: false },
            { agent: 'regulatory-intel', action: 'assessComplianceGap', approval: false },
            { agent: 'regulatory-intel', action: 'recommendPolicyUpdates', approval: true, approver: 'compliance' },
            { agent: 'audit-tracker', action: 'logEvent', approval: false }
        ],
        requiredApprovals: ['compliance'],
        timeout: 604800000 // 7 days
    },
    'esg-sustainability-report': {
        name: 'ESG Sustainability Report',
        description: 'Generate sustainability scorecard for AI operations',
        steps: [
            { agent: 'carbon-tracker', action: 'estimateEmissions', approval: false },
            { agent: 'carbon-tracker', action: 'generateSustainabilityScorecard', approval: false },
            { agent: 'carbon-tracker', action: 'recommendGreenRouting', approval: true, approver: 'engineering' }
        ],
        requiredApprovals: ['engineering'],
        timeout: 86400000 // 24 hours
    }
};

/**
 * AgentOS - The complete agent operating system
 */
export class AgentOS {
    constructor(organizationId, userId = null) {
        this.organizationId = organizationId;
        this.userId = userId;

        // Core components
        this.orchestrator = new AgentOrchestrator();
        this.agents = new Map();
        this.workflows = new Map();

        // Shared memory
        this.sharedMemory = new AgentMemory('agentos-shared', organizationId);

        // Infrastructure services (Gap #2, #4, #6, #8)
        this.notifications = createNotificationRouter();
        this.jobQueue = createJobQueue();
        this.fileProcessor = createFileProcessingPipeline();
        this.cache = new CacheManager({ metricsEnabled: true });
        this.evaluator = createAgentEvaluator();
        this.qualityGates = createQualityGates();
        this.testOrchestrator = createTestOrchestrator();

        // Initialize state
        this.initialized = false;
    }

    /**
     * Initialize the entire agent system
     */
    async initialize() {
        if (this.initialized) return this;

        console.log('🚀 AgentOS Initializing...');

        logger.info('AgentOS initialization started', {
            organizationId: this.organizationId,
            userId: this.userId,
            agentCount: AGENT_REGISTRY.length
        });

        // Load shared memory
        await this.sharedMemory.load();
        console.log('💾 Shared memory loaded');

        // Register all agents
        let successCount = 0;
        let failureCount = 0;

        for (const agentDef of AGENT_REGISTRY) {
            try {
                // Instantiate agent
                const agentInstance = new agentDef.class({ organizationId: this.organizationId, userId: this.userId, config: {} });

                // Initialize agent memory if available
                if (typeof agentInstance.initMemory === 'function') {
                    await agentInstance.initMemory();
                }

                // Store agent instance
                this.agents.set(agentDef.name, agentInstance);

                // Register with orchestrator
                this.orchestrator.registerAgent(
                    agentDef.name,
                    agentInstance,
                    agentDef.capabilities
                );

                console.log(`✅ Agent registered: ${agentDef.name}`);
                successCount++;
            } catch (error) {
                console.error(`❌ Failed to register agent ${agentDef.name}:`, error.message);
                logger.error('Failed to initialize agent', {
                    agentName: agentDef.name,
                    errorMessage: error.message,
                    organizationId: this.organizationId
                });
                failureCount++;
            }
        }

        // Register workflows
        for (const [id, workflow] of Object.entries(WORKFLOWS)) {
            this.workflows.set(id, workflow);
        }
        console.log(`📋 Registered ${this.workflows.size} workflows`);

        this.initialized = true;
        console.log('🎉 AgentOS Initialized Successfully!');

        logger.info('AgentOS initialization completed', {
            organizationId: this.organizationId,
            agentsLoaded: successCount,
            agentsFailed: failureCount,
            workflowsLoaded: this.workflows.size,
            status: failureCount === 0 ? 'success' : 'partial'
        });

        return this;
    }

    /**
     * Get an agent by name
     */
    getAgent(name) {
        return this.agents.get(name);
    }

    /**
     * Execute an orchestrated request
     */
    async execute(request, context = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        return this.orchestrator.execute(request, {
            ...context,
            organizationId: this.organizationId,
            userId: this.userId
        });
    }

    /**
     * Run a predefined workflow
     */
    async runWorkflow(workflowId, params = {}, approvals = {}) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Unknown workflow: ${workflowId}`);
        }

        console.log(`🔄 Starting workflow: ${workflow.name}`);

        const results = [];
        let currentStep = 0;

        for (const step of workflow.steps) {
            currentStep++;
            console.log(`  Step ${currentStep}/${workflow.steps.length}: ${step.agent}.${step.action}`);

            // Check if approval is needed
            if (step.approval && step.approver) {
                if (!approvals[step.approver]) {
                    console.log(`  ⏸️ Waiting for ${step.approver} approval`);
                    return {
                        status: 'pending_approval',
                        workflow: workflowId,
                        step: currentStep,
                        approvalRequired: step.approver,
                        completedSteps: results
                    };
                }
            }

            // Get the agent
            const agent = this.agents.get(step.agent);
            if (!agent) {
                throw new Error(`Agent not found: ${step.agent}`);
            }

            // Execute the step
            try {
                const method = agent[step.action];
                if (typeof method !== 'function') {
                    throw new Error(`Agent ${step.agent} has no method ${step.action}`);
                }

                const stepResult = await method.call(agent, {
                    ...params,
                    previousResults: results
                });

                results.push({
                    step: currentStep,
                    agent: step.agent,
                    action: step.action,
                    success: true,
                    result: stepResult
                });

                console.log(`  ✅ Step ${currentStep} completed`);
            } catch (error) {
                console.error(`  ❌ Step ${currentStep} failed:`, error.message);
                results.push({
                    step: currentStep,
                    agent: step.agent,
                    action: step.action,
                    success: false,
                    error: error.message
                });

                // Stop workflow on failure
                return {
                    status: 'failed',
                    workflow: workflowId,
                    failedAt: currentStep,
                    error: error.message,
                    completedSteps: results
                };
            }
        }

        // Store outcome in shared memory
        await this.sharedMemory.storeOutcome(
            `Workflow "${workflow.name}" completed successfully`,
            IMPORTANCE.HIGH,
            { workflowId, results }
        );

        return {
            status: 'completed',
            workflow: workflowId,
            results
        };
    }

    /**
     * Chat with an agent
     */
    async chat(message, agentName = 'finault-pal') {
        const agent = this.agents.get(agentName);
        if (!agent) {
            throw new Error(`Agent not found: ${agentName}`);
        }

        if (typeof agent.chat === 'function') {
            return agent.chat(message);
        }

        // Fallback to orchestrator
        return this.execute(message);
    }

    /**
     * Get system status
     */
    getStatus() {
        return {
            initialized: this.initialized,
            organizationId: this.organizationId,
            agentCount: this.agents.size,
            workflowCount: this.workflows.size,
            agents: Array.from(this.agents.keys()),
            workflows: Array.from(this.workflows.keys())
        };
    }
}

/**
 * Create an AgentOS instance
 */
export function createAgentOS(organizationId, userId = null) {
    return new AgentOS(organizationId, userId);
}

/**
 * Singleton for default instance
 */
let defaultInstance = null;

export function getAgentOS(organizationId, userId = null) {
    if (!defaultInstance) {
        defaultInstance = new AgentOS(organizationId, userId);
    }
    return defaultInstance;
}

export {
    AGENT_REGISTRY,
    WORKFLOWS,
    AgentMemory,
    AgentToolkit,
    TOOL_DEFINITIONS,
    MEMORY_TYPES,
    IMPORTANCE
};

export default AgentOS;
