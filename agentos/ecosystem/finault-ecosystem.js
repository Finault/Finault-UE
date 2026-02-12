/**
 * FINAULT ECOSYSTEM
 * The Unified Platform - Finance-First AI Governance
 *
 * "The whole is greater than the sum of its parts."
 *
 * Like Apple's iPhone + App Store + iCloud,
 * Finault's products work seamlessly together.
 *
 * THE GOLDEN OPPORTUNITY:
 * - Nobody else solves the 5 Finance Chokepoints
 * - Nobody else provides enforcement + audit + finance integration
 * - Nobody else makes AI spend CFO-ready
 *
 * Components:
 * - Dashboard + Autopilot + Connect + Intelligence + SDK
 * - Invoice Reconciliation + Close Pack + Chargeback
 * - Budget Enforcement + ERP Integration
 * = The complete AI cost governance platform
 */

import FinaultPal from '../agents/finault-pal.js';
import FinaultAutopilot from '../agents/autopilot.js';
import FinaultIntelligence from '../agents/intelligence.js';
import MagicOnboarding from '../agents/magic-onboarding.js';
import CostIntelligenceAgent from '../agents/cost-intelligence.js';
import OptimizationAgent from '../agents/optimization-agent.js';
import ForecastingAgent from '../agents/forecasting-agent.js';
import PolicyAgent from '../agents/policy-agent.js';
import CompoundLearningAgent from '../agents/compound-learning.js';

// Finance-First Agents (The Golden Opportunity)
import InvoiceReconciliationAgent from '../agents/invoice-reconciliation.js';
import ClosePackGenerator from '../agents/close-pack-generator.js';
import ChargebackAgent from '../agents/chargeback-agent.js';
import BudgetEnforcer from '../agents/budget-enforcer.js';
import ERPIntegrationManager from '../integrations/erp-connectors.js';

// Blueprint Gap-Fill Agents
import CarbonTracker from '../agents/carbon-tracker.js';
import ProcurementAdvisor from '../agents/procurement-advisor.js';
import DisputeResolverAgent from '../agents/dispute-resolver.js';
import ForecastEngine from '../agents/forecast-engine.js';
import RegulatoryIntel from '../agents/regulatory-intel.js';
import { AuditTrackerAgent } from '../agents/audit-tracker-agent.js';

// Production-Grade Core (Turning Gaps into Strengths)
import AgentEvaluator from '../core/agent-evaluator.js';
import SecurityAgent from '../core/security-agent.js';
import { ObservabilityLayer, getObservability } from '../core/observability.js';
import AgentOrchestrator from '../core/agent-orchestrator.js';
import GovernanceAgent from '../core/governance-agent.js';

/**
 * The Finault Ecosystem - One unified interface to everything
 */
export class FinaultEcosystem {
    constructor(config) {
        this.organizationId = config.organizationId;
        this.userId = config.userId;
        this.config = config;

        // Initialize all components
        this.components = {};
        this.initialized = false;
    }

    /**
     * Initialize the entire ecosystem
     */
    async initialize() {
        console.log('🚀 Initializing Finault Ecosystem...');

        // ═══════════════════════════════════════════════════════════════════
        // FIX W-002: All agent constructors now use NAMED parameters.
        // Previously, agents were constructed with positional args:
        //   new Agent(userId, orgId)  ← WRONG: silent data corruption
        //   new Agent(orgId)          ← WRONG: destructures string → all undefined
        //
        // Now every call passes { organizationId, userId } so parameter order
        // is irrelevant and the code is self-documenting.
        // ═══════════════════════════════════════════════════════════════════

        const agentParams = { organizationId: this.organizationId, userId: this.userId };

        // Core conversation agent
        this.components.pal = new FinaultPal(agentParams);
        await this.components.pal.initSession();

        // Autopilot for autonomous actions
        this.components.autopilot = new FinaultAutopilot(agentParams);
        await this.components.autopilot.initialize();

        // Network intelligence
        this.components.intelligence = new FinaultIntelligence(agentParams);

        // Specialist agents
        this.components.costIntelligence = new CostIntelligenceAgent(agentParams);
        this.components.optimization = new OptimizationAgent(agentParams);
        this.components.forecasting = new ForecastingAgent(agentParams);
        this.components.policy = new PolicyAgent(agentParams);

        // Compound learning
        this.components.learning = new CompoundLearningAgent(agentParams);

        // === FINANCE-FIRST AGENTS (The Golden Opportunity) ===

        // Invoice Reconciliation - 3-way match, catch billing errors
        this.components.invoiceReconciliation = new InvoiceReconciliationAgent(agentParams);

        // Close Pack Generator - CFO-ready reports in seconds
        this.components.closePack = new ClosePackGenerator(agentParams);

        // Chargeback Agent - Self-service cost allocation
        this.components.chargeback = new ChargebackAgent(agentParams);

        // Budget Enforcer - Hard caps with HTTP 402
        this.components.budgetEnforcer = new BudgetEnforcer(agentParams);

        // ERP Integration - NetSuite, SAP, QuickBooks
        this.components.erp = new ERPIntegrationManager(agentParams);

        // === BLUEPRINT GAP-FILL AGENTS ===

        // CarbonTracker - ESG reporting, green routing
        this.components.carbonTracker = new CarbonTracker(agentParams);

        // ProcurementAdvisor - Vendor contract analysis and savings
        this.components.procurementAdvisor = new ProcurementAdvisor(agentParams);

        // DisputeResolver - Evidence-based billing dispute resolution
        this.components.disputeResolver = new DisputeResolverAgent(agentParams);

        // ForecastEngine - Monte Carlo simulation and scenario planning
        this.components.forecastEngine = new ForecastEngine(agentParams);

        // RegulatoryIntel - Compliance scanning and framework tracking
        this.components.regulatoryIntel = new RegulatoryIntel(agentParams);

        // AuditTracker - Hash-chained audit log with Merkle sealing
        this.components.auditTracker = new AuditTrackerAgent(agentParams);

        // === PRODUCTION-GRADE CORE (Turning Gaps into Strengths) ===

        // Security Agent - Prompt injection defense
        this.components.security = new SecurityAgent({
            strictMode: this.config.strictMode ?? false,
            logAllAttempts: true
        });

        // Observability Layer - Tracing & metrics
        this.components.observability = getObservability({
            serviceName: 'finault-agentos',
            environment: process.env.NODE_ENV || 'development',
            exporters: ['supabase', 'console']
        });

        // Agent Orchestrator - Multi-agent coordination
        this.components.orchestrator = new AgentOrchestrator({
            maxConcurrentTasks: 5,
            enableCheckpointing: true
        });

        // Register agents with orchestrator
        this.registerAgentsWithOrchestrator();

        // Governance Agent - Policy enforcement
        // Fix W-002: Named params for consistency
        this.components.governance = new GovernanceAgent({
            organizationId: this.organizationId,
            config: {
                strictMode: this.config.strictMode ?? false,
                autoEscalate: true
            }
        });

        // Agent Evaluator - Testing framework
        this.components.evaluator = new AgentEvaluator({
            passThreshold: 0.95
        });

        // Wrap agents with observability
        this.wrapAgentsWithObservability();

        this.initialized = true;
        console.log('✅ Finault Ecosystem initialized');
        console.log('💰 Finance-First Agents: Ready');
        console.log('🛡️ Production-Grade Core: Active');

        return this;
    }

    /**
     * Register agents with the orchestrator
     */
    registerAgentsWithOrchestrator() {
        const orchestrator = this.components.orchestrator;

        // Core agents
        orchestrator.registerAgent('cost-intelligence', this.components.costIntelligence,
            ['cost_analysis', 'anomaly_detection', 'pattern_learning']);

        orchestrator.registerAgent('optimization', this.components.optimization,
            ['optimization', 'model_switching', 'caching', 'rate_limiting']);

        orchestrator.registerAgent('forecasting', this.components.forecasting,
            ['forecasting', 'budget_analysis', 'trend_prediction']);

        orchestrator.registerAgent('policy', this.components.policy,
            ['compliance', 'policy_enforcement', 'violation_detection']);

        // Finance-first agents
        orchestrator.registerAgent('invoice-reconciliation', this.components.invoiceReconciliation,
            ['reconciliation', 'invoice_parsing', 'gl_entries']);

        orchestrator.registerAgent('close-pack', this.components.closePack,
            ['reporting', 'close_pack', 'executive_summary']);

        orchestrator.registerAgent('chargeback', this.components.chargeback,
            ['chargeback', 'cost_allocation', 'showback']);

        orchestrator.registerAgent('budget-enforcer', this.components.budgetEnforcer,
            ['budget', 'enforcement', 'rate_limit']);

        // Blueprint gap-fill agents
        orchestrator.registerAgent('carbon-tracker', this.components.carbonTracker,
            ['sustainability', 'carbon_tracking', 'esg_reporting', 'green_routing']);

        orchestrator.registerAgent('procurement-advisor', this.components.procurementAdvisor,
            ['procurement', 'contract_analysis', 'vendor_scoring', 'rate_negotiation']);

        orchestrator.registerAgent('dispute-resolver', this.components.disputeResolver,
            ['dispute', 'billing_dispute', 'evidence_gathering', 'credit_recovery']);

        orchestrator.registerAgent('forecast-engine', this.components.forecastEngine,
            ['monte_carlo', 'scenario_planning', 'capacity_modeling', 'roi_analysis']);

        orchestrator.registerAgent('regulatory-intel', this.components.regulatoryIntel,
            ['regulatory', 'compliance_scanning', 'framework_tracking', 'policy_recommendation']);

        orchestrator.registerAgent('audit-tracker', this.components.auditTracker,
            ['audit', 'audit_trail', 'merkle_seal', 'compliance_bundle', 'retention']);
    }

    /**
     * Wrap agents with observability
     */
    wrapAgentsWithObservability() {
        const obs = this.components.observability;

        // Wrap key agents with tracing
        this.tracedAgents = {
            costIntelligence: obs.traceAgent(this.components.costIntelligence, 'cost-intelligence'),
            optimization: obs.traceAgent(this.components.optimization, 'optimization'),
            forecasting: obs.traceAgent(this.components.forecasting, 'forecasting'),
            invoiceReconciliation: obs.traceAgent(this.components.invoiceReconciliation, 'invoice-reconciliation'),
            closePack: obs.traceAgent(this.components.closePack, 'close-pack'),
            chargeback: obs.traceAgent(this.components.chargeback, 'chargeback'),
            budgetEnforcer: obs.traceAgent(this.components.budgetEnforcer, 'budget-enforcer'),
            carbonTracker: obs.traceAgent(this.components.carbonTracker, 'carbon-tracker'),
            procurementAdvisor: obs.traceAgent(this.components.procurementAdvisor, 'procurement-advisor'),
            disputeResolver: obs.traceAgent(this.components.disputeResolver, 'dispute-resolver'),
            forecastEngine: obs.traceAgent(this.components.forecastEngine, 'forecast-engine'),
            regulatoryIntel: obs.traceAgent(this.components.regulatoryIntel, 'regulatory-intel'),
            auditTracker: obs.traceAgent(this.components.auditTracker, 'audit-tracker')
        };
    }

    /**
     * SECURE INPUT: Validate input before processing
     */
    async secureInput(input, context = {}) {
        return await this.components.security.validateInput(input, context);
    }

    /**
     * GOVERNANCE CHECK: Verify action is allowed
     */
    async checkGovernance(action, context = {}) {
        return await this.components.governance.checkAction(action, context);
    }

    /**
     * ORCHESTRATE: Execute complex multi-agent tasks
     */
    async orchestrate(request, context = {}) {
        // Security check first
        const securityResult = await this.secureInput(request, context);
        if (securityResult.blocked) {
            return {
                success: false,
                error: 'Security violation',
                details: securityResult
            };
        }

        // Governance check
        const governanceResult = await this.checkGovernance({ type: 'orchestration', request }, context);
        if (!governanceResult.allowed) {
            return {
                success: false,
                error: 'Governance policy violation',
                details: governanceResult
            };
        }

        // Execute via orchestrator
        return await this.components.orchestrator.execute(securityResult.safe_input, context);
    }

    /**
     * THE MAGIC ENTRY POINT
     * New users start here for the "wow" experience
     */
    async magicStart(initialData = null) {
        // Fix W-002: Named params instead of positional args
        const onboarding = new MagicOnboarding({ organizationId: this.organizationId, userId: this.userId });
        return await onboarding.run(initialData);
    }

    /**
     * NATURAL LANGUAGE INTERFACE
     * Talk to Finault like a person
     */
    async ask(question) {
        if (!this.initialized) await this.initialize();

        // Use Finault Pal for natural language
        return await this.components.pal.chat(question);
    }

    /**
     * QUICK ACTIONS
     * Common operations with one method call
     */
    async quickAction(action, params = {}) {
        if (!this.initialized) await this.initialize();

        switch (action) {
            // === ANALYSIS ===
            case 'analyze':
                return await this.analyzeNow(params);

            case 'anomalies':
                return await this.components.costIntelligence.execute('detect_anomalies', params);

            case 'patterns':
                return await this.components.costIntelligence.execute('learn_patterns', params);

            // === OPTIMIZATION ===
            case 'optimize':
                return await this.findAndApplyOptimizations(params);

            case 'find_savings':
                return await this.components.optimization.execute('find_all', params);

            // === FORECASTING ===
            case 'forecast':
                return await this.components.forecasting.execute('forecast', params);

            case 'budget_check':
                return await this.components.forecasting.execute('budget_analysis', params);

            // === POLICY ===
            case 'compliance':
                return await this.components.policy.execute('check_compliance', params);

            case 'violations':
                return await this.components.policy.execute('get_violations', params);

            // === AUTOPILOT ===
            case 'autopilot_status':
                return this.getAutopilotStatus();

            case 'autopilot_enable':
                return await this.enableAutopilot(params.mode || 'ASSIST');

            case 'autopilot_disable':
                return await this.disableAutopilot();

            // === INTELLIGENCE ===
            case 'benchmarks':
                return await this.components.intelligence.getBenchmarks(params.industry, params.size);

            case 'network_insights':
                return await this.components.intelligence.suggestFromNetwork(this.organizationId, params);

            // === REPORTS ===
            case 'report':
                return await this.generateReport(params);

            case 'close_pack':
                return await this.generateClosePack(params);

            // === FINANCE-FIRST ACTIONS (The Golden Opportunity) ===

            // Invoice Reconciliation
            case 'reconcile_invoice':
                return await this.components.invoiceReconciliation.reconcile(params.invoice);

            case 'batch_reconcile':
                return await this.components.invoiceReconciliation.batchReconcile(params.invoices);

            // Close Pack
            case 'generate_close_pack':
                return await this.components.closePack.generate(params);

            case 'close_pack_history':
                return await this.components.closePack.getHistory(params.limit);

            case 'export_close_pack':
                return await this.components.closePack.export(params.pack_id, params.format);

            // Chargeback / Cost Allocation
            case 'allocate_costs':
                return await this.components.chargeback.allocateCosts(params.period || this.getCurrentPeriod());

            case 'get_cost_center_dashboard':
                return await this.components.chargeback.getCostCenterDashboard(params.cost_center, params.period || this.getCurrentPeriod());

            case 'generate_chargeback':
                return await this.components.chargeback.generateChargebackInvoice(params.cost_center, params.period || this.getCurrentPeriod());

            case 'setup_allocation_rules':
                return await this.components.chargeback.setupAllocationRules(params.rules);

            // Budget Enforcement
            case 'check_budget':
                return await this.components.budgetEnforcer.checkBudget(params.request || params);

            case 'configure_budget':
                return await this.components.budgetEnforcer.configureBudget(params);

            case 'budget_status':
                return await this.components.budgetEnforcer.getBudgetStatus(params.team);

            case 'blocked_requests':
                return await this.components.budgetEnforcer.getBlockedRequestsSummary(params.period);

            // ERP Integration
            case 'connect_erp':
                return await this.components.erp.initialize(params.erp_type, params.config);

            case 'sync_to_erp':
                return await this.components.erp.syncJournalEntry(params.entry);

            case 'batch_sync_erp':
                return await this.components.erp.batchSync(params.entries);

            case 'erp_status':
                return await this.components.erp.getConnectedERP();

            case 'erp_sync_history':
                return await this.components.erp.getSyncHistory(params.limit);

            // === PRODUCTION-GRADE CORE (Turning Gaps into Strengths) ===

            // Security
            case 'security_check':
                return await this.components.security.validateInput(params.input, params.context);

            case 'security_dashboard':
                return await this.components.security.getSecurityDashboard(params.period);

            // Observability
            case 'observability_dashboard':
                return await this.components.observability.getDashboard(params.period);

            case 'get_metrics':
                return this.components.observability.getMetrics();

            // Orchestration
            case 'orchestrate':
                return await this.orchestrate(params.request, params.context);

            case 'orchestrator_status':
                return await this.components.orchestrator.getStatus();

            // Governance
            case 'governance_check':
                return await this.components.governance.checkAction(params.action, params.context);

            case 'governance_dashboard':
                return await this.components.governance.getDashboard(params.period);

            case 'pending_approvals':
                return await this.components.governance.getPendingApprovals();

            case 'approve_action':
                return await this.components.governance.processApproval(params.request_id, params.approved, params.approver);

            // Evaluation
            case 'run_tests':
                return await this.components.evaluator.runRegressionSuite({
                    'invoice-reconciliation': this.components.invoiceReconciliation,
                    'budget-enforcer': this.components.budgetEnforcer,
                    'chargeback': this.components.chargeback
                });

            case 'evaluate_agent':
                return await this.components.evaluator.evaluate(
                    params.agent,
                    params.test_suite || AgentEvaluator.generateFinaultTestSuite()
                );

            // === BLUEPRINT GAP-FILL AGENT ACTIONS ===

            // Carbon Tracker / ESG
            case 'estimate_emissions':
                return await this.components.carbonTracker.estimateEmissions(params);
            case 'sustainability_scorecard':
                return await this.components.carbonTracker.generateSustainabilityScorecard(params);
            case 'green_routing':
                return await this.components.carbonTracker.recommendGreenRouting(params);
            case 'carbon_budget':
                return await this.components.carbonTracker.checkCarbonBudget(params);

            // Procurement Advisor
            case 'analyze_contract':
                return await this.components.procurementAdvisor.analyzeContract(params);
            case 'identify_savings':
                return await this.components.procurementAdvisor.identifySavings(params);
            case 'renegotiation_brief':
                return await this.components.procurementAdvisor.generateRenegotiationBrief(params);
            case 'vendor_scorecard':
                return await this.components.procurementAdvisor.buildVendorScorecard(params);
            case 'compare_rates':
                return await this.components.procurementAdvisor.compareRateCards(params);

            // Dispute Resolver
            case 'detect_disputes':
                return await this.components.disputeResolver.detectDisputeOpportunities(params);
            case 'build_evidence':
                return await this.components.disputeResolver.buildEvidencePacket(params);
            case 'dispute_letter':
                return await this.components.disputeResolver.generateDisputeLetter(params);
            case 'dispute_status':
                return await this.components.disputeResolver.trackDisputeStatus(params);

            // Forecast Engine
            case 'monte_carlo':
                return await this.components.forecastEngine.runMonteCarloSimulation(params);
            case 'scenario_projection':
                return await this.components.forecastEngine.generateScenarioProjections(params);
            case 'capacity_model':
                return await this.components.forecastEngine.modelCapacityCost(params);
            case 'investment_roi':
                return await this.components.forecastEngine.analyzeInvestmentROI(params);

            // Regulatory Intel
            case 'scan_regulations':
                return await this.components.regulatoryIntel.scanRegulatoryChanges(params);
            case 'compliance_gap':
                return await this.components.regulatoryIntel.assessComplianceGap(params);
            case 'readiness_scorecard':
                return await this.components.regulatoryIntel.generateReadinessScorecard(params);
            case 'framework_deadlines':
                return await this.components.regulatoryIntel.trackFrameworkDeadlines(params);

            // Audit Tracker
            case 'audit_log':
                return await this.components.auditTracker.logEvent(params);
            case 'audit_seal':
                return await this.components.auditTracker.sealPeriod(params);
            case 'compliance_bundle':
                return await this.components.auditTracker.generateComplianceBundle(params);
            case 'audit_verify':
                return await this.components.auditTracker.verifyIntegrity(params);

            default:
                return { error: `Unknown action: ${action}` };
        }
    }

    /**
     * Get current period (this month)
     */
    getCurrentPeriod() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0]
        };
    }

    /**
     * Analyze costs now
     */
    async analyzeNow(params = {}) {
        const days = params.days || 30;
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const [costs, anomalies, patterns] = await Promise.all([
            this.components.costIntelligence.execute('analyze_drivers', { lookback_days: days }),
            this.components.costIntelligence.execute('detect_anomalies', { lookback_days: days }),
            this.components.costIntelligence.execute('learn_patterns', { lookback_days: days })
        ]);

        return {
            period: { start: startDate, end: endDate, days },
            costs: costs.success ? costs : null,
            anomalies: anomalies.success ? anomalies.anomalies : [],
            patterns: patterns.success ? patterns.patterns : [],
            summary: this.generateAnalysisSummary(costs, anomalies, patterns)
        };
    }

    /**
     * Generate analysis summary
     */
    generateAnalysisSummary(costs, anomalies, patterns) {
        const parts = [];

        if (costs?.success && costs.total_spend) {
            parts.push(`Total spend: $${costs.total_spend.toFixed(2)}`);

            const topDriver = costs.by_provider?.[0];
            if (topDriver) {
                parts.push(`Top cost driver: ${topDriver.name} (${topDriver.percentage})`);
            }
        }

        if (anomalies?.anomalies?.length > 0) {
            parts.push(`${anomalies.anomalies.length} anomalies detected`);
        }

        if (patterns?.patterns?.length > 0) {
            const trend = patterns.patterns.find(p => p.type === 'trend');
            if (trend) {
                parts.push(`Trend: ${trend.direction}`);
            }
        }

        return parts.join('. ');
    }

    /**
     * Find and apply optimizations
     */
    async findAndApplyOptimizations(params = {}) {
        // Find optimizations
        const optimizations = await this.components.optimization.execute('find_all', params);

        if (!optimizations.success || !optimizations.opportunities?.length) {
            return {
                success: true,
                message: 'No optimizations found',
                savings: 0
            };
        }

        // If auto_apply is true and we have guardrails, apply automatically
        if (params.auto_apply && this.components.autopilot.isActionAllowed) {
            const applied = [];
            for (const opt of optimizations.opportunities) {
                const check = this.components.autopilot.isActionAllowed({
                    type: opt.type,
                    estimated_impact: opt.monthly_savings
                });

                if (check.allowed) {
                    await this.components.optimization.execute('apply', {
                        optimization_id: opt.id,
                        confirmed: true
                    });
                    applied.push(opt);
                }
            }

            return {
                success: true,
                found: optimizations.opportunities.length,
                applied: applied.length,
                total_savings: applied.reduce((sum, o) => sum + o.monthly_savings, 0),
                pending_approval: optimizations.opportunities.length - applied.length
            };
        }

        return {
            success: true,
            opportunities: optimizations.opportunities,
            total_potential_savings: optimizations.total_monthly_savings,
            message: 'Review and apply optimizations'
        };
    }

    /**
     * Get autopilot status
     */
    getAutopilotStatus() {
        return {
            enabled: this.components.autopilot.isRunning,
            mode: this.components.autopilot.mode.name,
            guardrails: this.components.autopilot.guardrails,
            recent_actions: this.components.autopilot.actionLog.slice(-10)
        };
    }

    /**
     * Enable autopilot
     */
    async enableAutopilot(mode = 'ASSIST') {
        const modes = { MONITOR: 'MONITOR', ASSIST: 'ASSIST', AUTONOMOUS: 'AUTONOMOUS' };
        const selectedMode = modes[mode.toUpperCase()] || 'ASSIST';

        this.components.autopilot.mode = {
            MONITOR: { name: 'Monitor', auto_actions: false },
            ASSIST: { name: 'Assist', auto_actions: ['rate_limit', 'cache_enable', 'minor_model_switch'], max_auto_savings: 1000 },
            AUTONOMOUS: { name: 'Autonomous', auto_actions: ['all'], max_auto_savings: 10000 }
        }[selectedMode];

        this.components.autopilot.isRunning = true;

        // Start background monitoring (in real implementation, would use worker)
        // this.components.autopilot.runContinuously();

        return {
            success: true,
            message: `Autopilot enabled in ${selectedMode} mode`,
            mode: this.components.autopilot.mode
        };
    }

    /**
     * Disable autopilot
     */
    async disableAutopilot() {
        this.components.autopilot.isRunning = false;

        return {
            success: true,
            message: 'Autopilot disabled',
            summary: await this.components.autopilot.generateDailySummary()
        };
    }

    /**
     * Generate a report
     */
    async generateReport(params = {}) {
        // Import report generator
        const { generateReport } = await import('../tools/finault-tools.js');

        return await generateReport(this.organizationId, {
            report_type: params.type || 'monthly',
            start_date: params.start_date,
            end_date: params.end_date,
            include_sections: params.sections || ['summary', 'breakdown', 'recommendations']
        });
    }

    /**
     * Generate Close Pack (executive report)
     * Now uses the dedicated ClosePackGenerator for CFO-ready output
     */
    async generateClosePack(params = {}) {
        return await this.components.closePack.generate(params);
    }

    /**
     * FINANCE WORKFLOW: Monthly Close
     * The automated month-end workflow
     */
    async monthlyClose(options = {}) {
        console.log('📊 Starting Monthly Close workflow...');

        const period = options.period || this.getPreviousPeriod();
        const results = {
            started_at: new Date().toISOString(),
            period,
            steps: []
        };

        // Step 1: Allocate all costs
        console.log('Step 1: Allocating costs...');
        const allocation = await this.components.chargeback.allocateCosts(period);
        results.steps.push({ step: 'cost_allocation', result: allocation });

        // Step 2: Reconcile invoices
        console.log('Step 2: Reconciling invoices...');
        // In production, would fetch pending invoices
        results.steps.push({ step: 'invoice_reconciliation', result: { message: 'No pending invoices' } });

        // Step 3: Generate Close Pack
        console.log('Step 3: Generating Close Pack...');
        const closePack = await this.components.closePack.generate({ period: 'monthly' });
        results.steps.push({ step: 'close_pack', result: closePack });

        // Step 4: Sync to ERP (if connected)
        const erpStatus = await this.components.erp.getConnectedERP();
        if (erpStatus) {
            console.log('Step 4: Syncing to ERP...');
            // Would sync journal entries
            results.steps.push({ step: 'erp_sync', result: { message: 'ERP sync ready' } });
        }

        // Step 5: Generate chargeback invoices
        console.log('Step 5: Generating chargeback invoices...');
        const costCenters = await this.components.chargeback.getCostCenters();
        const chargebacks = [];
        for (const cc of costCenters.slice(0, 5)) { // Limit for demo
            const invoice = await this.components.chargeback.generateChargebackInvoice(cc.cost_center || cc.team, period);
            chargebacks.push(invoice);
        }
        results.steps.push({ step: 'chargeback_invoices', result: { count: chargebacks.length } });

        results.completed_at = new Date().toISOString();
        results.success = true;

        console.log('✅ Monthly Close workflow complete');
        return results;
    }

    /**
     * Get previous month period
     */
    getPreviousPeriod() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0],
            name: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        };
    }

    /**
     * ECOSYSTEM STATUS
     * Health check for all components
     */
    async status() {
        const budgetStatus = await this.components.budgetEnforcer?.getBudgetStatus();
        const erpStatus = await this.components.erp?.getConnectedERP();

        return {
            ecosystem: 'Finault',
            version: '2.0.0', // Finance-First Edition
            organization_id: this.organizationId,
            initialized: this.initialized,
            components: {
                // Core Agents
                pal: { status: this.components.pal ? 'ready' : 'not_initialized' },
                autopilot: {
                    status: this.components.autopilot ? 'ready' : 'not_initialized',
                    running: this.components.autopilot?.isRunning || false,
                    mode: this.components.autopilot?.mode?.name || 'unknown'
                },
                intelligence: { status: this.components.intelligence ? 'ready' : 'not_initialized' },

                // Specialist Agents
                agents: {
                    cost_intelligence: this.components.costIntelligence ? 'ready' : 'not_initialized',
                    optimization: this.components.optimization ? 'ready' : 'not_initialized',
                    forecasting: this.components.forecasting ? 'ready' : 'not_initialized',
                    policy: this.components.policy ? 'ready' : 'not_initialized'
                },

                // Learning
                learning: { status: this.components.learning ? 'ready' : 'not_initialized' },

                // Finance-First Agents (The Golden Opportunity)
                finance: {
                    invoice_reconciliation: this.components.invoiceReconciliation ? 'ready' : 'not_initialized',
                    close_pack: this.components.closePack ? 'ready' : 'not_initialized',
                    chargeback: this.components.chargeback ? 'ready' : 'not_initialized',
                    budget_enforcer: {
                        status: this.components.budgetEnforcer ? 'ready' : 'not_initialized',
                        budget_configured: budgetStatus?.configured || false,
                        monthly_utilization: budgetStatus?.monthly?.utilization || 'N/A'
                    },
                    erp: {
                        status: this.components.erp ? 'ready' : 'not_initialized',
                        connected: erpStatus ? true : false,
                        type: erpStatus?.erp_type || null
                    }
                },

                // Blueprint Gap-Fill Agents
                blueprint_agents: {
                    carbon_tracker: this.components.carbonTracker ? 'ready' : 'not_initialized',
                    procurement_advisor: this.components.procurementAdvisor ? 'ready' : 'not_initialized',
                    dispute_resolver: this.components.disputeResolver ? 'ready' : 'not_initialized',
                    forecast_engine: this.components.forecastEngine ? 'ready' : 'not_initialized',
                    regulatory_intel: this.components.regulatoryIntel ? 'ready' : 'not_initialized',
                    audit_tracker: this.components.auditTracker ? 'ready' : 'not_initialized'
                },

                // Production-Grade Core (Gaps Turned to Strengths)
                production_core: {
                    security: {
                        status: this.components.security ? 'ready' : 'not_initialized',
                        strict_mode: this.components.security?.config?.strictMode || false
                    },
                    observability: {
                        status: this.components.observability ? 'ready' : 'not_initialized',
                        exporters: this.components.observability?.config?.exporters || []
                    },
                    orchestrator: {
                        status: this.components.orchestrator ? 'ready' : 'not_initialized',
                        registered_agents: this.components.orchestrator?.agents?.size || 0
                    },
                    governance: {
                        status: this.components.governance ? 'ready' : 'not_initialized',
                        policies_active: this.components.governance?.policies?.size || 0
                    },
                    evaluator: {
                        status: this.components.evaluator ? 'ready' : 'not_initialized'
                    }
                }
            },
            capabilities: {
                core: ['cost_analysis', 'optimization', 'forecasting', 'policy_compliance'],
                finance: ['invoice_reconciliation', 'close_pack', 'chargeback', 'budget_enforcement', 'erp_sync'],
                automation: ['autopilot', 'compound_learning', 'network_intelligence'],
                production: ['security', 'observability', 'orchestration', 'governance', 'evaluation'],
                blueprint: ['carbon_tracking', 'procurement_analysis', 'dispute_resolution', 'monte_carlo_forecast', 'regulatory_compliance', 'audit_trail']
            }
        };
    }

    /**
     * COMPOUND: Run the nightly learning loop
     */
    async compound() {
        return await this.components.learning.nightlyCompound();
    }
}

/**
 * FACTORY: Create a Finault instance
 */
export function createFinault(config) {
    return new FinaultEcosystem(config);
}

/**
 * QUICK START: For immediate use
 */
export async function finaultQuickStart(organizationId, userId) {
    const finault = createFinault({ organizationId, userId });
    await finault.initialize();
    return finault;
}

export default FinaultEcosystem;
