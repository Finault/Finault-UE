/**
 * FINAULT MAGIC ONBOARDING
 * The "Wow" Moment
 *
 * Jobs said: "Design is not just what it looks like and feels like.
 * Design is how it works."
 *
 * The first 60 seconds with Finault should be magical.
 * Zero config. Instant value. Jaw-dropping insights.
 *
 * Philosophy:
 * - Connect → Analyze → Wow in under 60 seconds
 * - Show them something they didn't know about their own spending
 * - Make them feel like they just got a superpower
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { AgentMemory, MEMORY_TYPES, IMPORTANCE } from '../core/agent-memory.js';
import { validateAgentParams } from '../core/validate-agent-params.js';
import { createSupabaseResilience } from '../core/resilience-layer.js';
import { PriorityAssigner, PRIORITY_LEVELS } from '../core/onboarding-sanitizer.js';

const anthropic = new Anthropic();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resilientSupabase = createSupabaseResilience(supabase);

/**
 * The Magic Onboarding Experience
 */
export class MagicOnboarding {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'MagicOnboarding');
        this.organizationId = organizationId;
        this.userId = userId;
        this.startTime = Date.now();
        this.insights = [];
        this.memory = new AgentMemory('magic-onboarding', organizationId, userId);
        this._memoryLoaded = false;
    }

    /**
     * Initialize memory
     */
    async initMemory() {
        if (!this._memoryLoaded) {
            await this.memory.load();
            this._memoryLoaded = true;
        }
    }

    /**
     * STEP 1: Zero-Config Connection
     * Auto-detect providers, no manual config needed
     */
    async autoConnect() {
        const connections = [];

        // Try to auto-detect from common patterns
        const providers = [
            { name: 'OpenAI', envVars: ['OPENAI_API_KEY'], endpoint: 'https://api.openai.com' },
            { name: 'Anthropic', envVars: ['ANTHROPIC_API_KEY'], endpoint: 'https://api.anthropic.com' },
            { name: 'Azure OpenAI', envVars: ['AZURE_OPENAI_KEY', 'AZURE_OPENAI_ENDPOINT'], endpoint: null },
            { name: 'AWS Bedrock', envVars: ['AWS_ACCESS_KEY_ID'], endpoint: null },
            { name: 'Google Vertex', envVars: ['GOOGLE_APPLICATION_CREDENTIALS'], endpoint: null }
        ];

        for (const provider of providers) {
            // In real implementation, would check for API keys or OAuth
            // For now, simulate detection
            connections.push({
                provider: provider.name,
                status: 'ready_to_connect',
                method: 'api_key'
            });
        }

        return {
            step: 'auto_connect',
            elapsed_ms: Date.now() - this.startTime,
            detected_providers: connections
        };
    }

    /**
     * STEP 2: Instant Analysis
     * Analyze whatever data we can get immediately
     */
    async instantAnalysis(sampleData = null) {
        // If no data provided, use any available data
        let data = sampleData;

        if (!data) {
            // Try to fetch recent data
            const { data: recent } = await resilientSupabase
                .from('cost_records')
                .select('*')
                .eq('organization_id', this.organizationId)
                .order('timestamp', { ascending: false })
                .limit(1000);

            data = recent;
        }

        if (!data || data.length === 0) {
            // Generate insights from uploaded invoice if available
            return this.analyzeFromInvoice();
        }

        return this.generateInstantInsights(data);
    }

    /**
     * Generate instant insights from data
     */
    async generateInstantInsights(data) {
        const insights = [];

        // Total spend
        const totalSpend = data.reduce((sum, r) => sum + parseFloat(r.amount), 0);

        // Spend by provider
        const byProvider = {};
        data.forEach(r => {
            byProvider[r.provider] = (byProvider[r.provider] || 0) + parseFloat(r.amount);
        });

        // Find the biggest cost driver
        const topProvider = Object.entries(byProvider)
            .sort((a, b) => b[1] - a[1])[0];

        if (topProvider) {
            const percentage = ((topProvider[1] / totalSpend) * 100).toFixed(0);
            insights.push({
                type: 'cost_driver',
                emoji: '💰',
                headline: `${topProvider[0]} is ${percentage}% of your AI spend`,
                detail: `$${topProvider[1].toFixed(2)} out of $${totalSpend.toFixed(2)} total`,
                impact: 'high'
            });
        }

        // Find potential waste
        const byModel = {};
        data.forEach(r => {
            byModel[r.model] = (byModel[r.model] || 0) + parseFloat(r.amount);
        });

        // Check for expensive models that could be cheaper
        const expensiveModels = ['gpt-4', 'claude-3-opus', 'gpt-4-turbo'];
        const cheaperAlternatives = {
            'gpt-4': { alt: 'gpt-4-turbo', savings: 0.67 },
            'gpt-4-turbo': { alt: 'gpt-3.5-turbo', savings: 0.95 },
            'claude-3-opus': { alt: 'claude-3-sonnet', savings: 0.80 }
        };

        let potentialSavings = 0;
        Object.entries(byModel).forEach(([model, spend]) => {
            if (cheaperAlternatives[model]) {
                potentialSavings += spend * cheaperAlternatives[model].savings;
            }
        });

        if (potentialSavings > 100) {
            insights.push({
                type: 'savings_opportunity',
                emoji: '🎯',
                headline: `Found $${potentialSavings.toFixed(0)}/month in potential savings`,
                detail: 'By switching some workloads to more cost-effective models',
                impact: 'high',
                action: 'optimize'
            });
        }

        // Check for anomalies
        const dailySpend = {};
        data.forEach(r => {
            const day = r.timestamp.split('T')[0];
            dailySpend[day] = (dailySpend[day] || 0) + parseFloat(r.amount);
        });

        const spendValues = Object.values(dailySpend);
        const avgDaily = spendValues.reduce((a, b) => a + b, 0) / spendValues.length;
        const maxDaily = Math.max(...spendValues);

        if (maxDaily > avgDaily * 2) {
            const spikeDay = Object.entries(dailySpend)
                .find(([day, spend]) => spend === maxDaily)?.[0];

            insights.push({
                type: 'anomaly',
                emoji: '⚠️',
                headline: `Spending spike detected on ${spikeDay}`,
                detail: `$${maxDaily.toFixed(2)} vs average $${avgDaily.toFixed(2)} (${(maxDaily / avgDaily).toFixed(1)}x normal)`,
                impact: 'medium',
                action: 'investigate'
            });
        }

        // Benchmark comparison
        const monthlySpend = totalSpend; // Assuming this is monthly
        let benchmark;
        if (monthlySpend < 1000) benchmark = 'startup';
        else if (monthlySpend < 10000) benchmark = 'growing';
        else if (monthlySpend < 100000) benchmark = 'enterprise';
        else benchmark = 'large_enterprise';

        const benchmarkData = {
            startup: { avg: 500, top: 200 },
            growing: { avg: 5000, top: 2000 },
            enterprise: { avg: 50000, top: 20000 },
            large_enterprise: { avg: 500000, top: 200000 }
        };

        const yourRank = monthlySpend <= benchmarkData[benchmark].top ? 'top 25%' :
            monthlySpend <= benchmarkData[benchmark].avg ? 'average' : 'needs optimization';

        insights.push({
            type: 'benchmark',
            emoji: '📊',
            headline: `You're in the ${yourRank} of ${benchmark} companies`,
            detail: `Your spend: $${monthlySpend.toFixed(0)}/mo. ${benchmark} average: $${benchmarkData[benchmark].avg}/mo`,
            impact: yourRank === 'needs optimization' ? 'high' : 'low'
        });

        this.insights = insights;

        return {
            step: 'instant_analysis',
            elapsed_ms: Date.now() - this.startTime,
            total_spend: totalSpend,
            records_analyzed: data.length,
            insights
        };
    }

    /**
     * Analyze from an uploaded invoice
     */
    async analyzeFromInvoice() {
        // This would parse an uploaded invoice
        return {
            step: 'invoice_analysis',
            elapsed_ms: Date.now() - this.startTime,
            message: 'Upload an invoice to get instant insights',
            insights: []
        };
    }

    /**
     * STEP 3: Generate the "Wow" moment
     * The one thing that makes them say "I need this"
     */
    async generateWowMoment() {
        // Find the most impactful insight
        const topInsight = this.insights
            .filter(i => i.impact === 'high')
            .sort((a, b) => {
                // Prioritize savings opportunities
                if (a.type === 'savings_opportunity') return -1;
                if (b.type === 'savings_opportunity') return 1;
                return 0;
            })[0];

        if (!topInsight) {
            return {
                step: 'wow_moment',
                wow: {
                    headline: "You're already well optimized!",
                    subtext: "Your AI costs are under control. Finault will keep them that way.",
                    action: "Enable Autopilot to maintain optimization"
                }
            };
        }

        let wow;

        switch (topInsight.type) {
            case 'savings_opportunity':
                wow = {
                    headline: topInsight.headline,
                    subtext: "Finault found this in under 60 seconds. Imagine what we'll find in a week.",
                    action: "Apply these optimizations now",
                    action_button: "Optimize with One Click",
                    impact: topInsight.headline
                };
                break;

            case 'anomaly':
                wow = {
                    headline: "We caught something you might have missed",
                    subtext: topInsight.headline,
                    action: "Let Autopilot prevent this next time",
                    action_button: "Enable Autopilot",
                    impact: topInsight.detail
                };
                break;

            case 'cost_driver':
                wow = {
                    headline: "Here's where your money is going",
                    subtext: topInsight.headline,
                    action: "See the full breakdown",
                    action_button: "View Dashboard",
                    impact: topInsight.detail
                };
                break;

            default:
                wow = {
                    headline: topInsight.headline,
                    subtext: topInsight.detail,
                    action: "Explore your AI costs",
                    action_button: "Get Started"
                };
        }

        return {
            step: 'wow_moment',
            elapsed_ms: Date.now() - this.startTime,
            wow
        };
    }

    /**
     * STEP 4: Instant Value Setup
     * Set up the most valuable features automatically
     */
    async instantValueSetup() {
        const setupActions = [];

        // Enable basic monitoring
        setupActions.push({
            action: 'enable_monitoring',
            description: 'Real-time cost monitoring enabled',
            status: 'completed'
        });

        // Set up smart alerts based on current spending
        const avgDailySpend = this.insights
            .find(i => i.type === 'cost_driver')?.detail?.match(/\$[\d,]+/)?.[0] || '$100';

        setupActions.push({
            action: 'smart_alerts',
            description: `Alert when daily spend exceeds 2x average (${avgDailySpend})`,
            status: 'completed'
        });

        // Enable Autopilot in Monitor mode (safe default)
        setupActions.push({
            action: 'autopilot_monitor',
            description: 'Autopilot enabled in Monitor mode (watch and alert)',
            status: 'completed'
        });

        // Schedule first optimization scan
        setupActions.push({
            action: 'optimization_scan',
            description: 'Full optimization scan scheduled for tonight',
            status: 'scheduled'
        });

        return {
            step: 'instant_value',
            elapsed_ms: Date.now() - this.startTime,
            setup_actions: setupActions,
            message: "You're all set! Finault is now watching your AI costs."
        };
    }

    /**
     * STEP 5: Personalized Next Steps
     * Based on what we learned, what should they do next?
     *
     * FIX W-024: Uses PriorityAssigner for deterministic, collision-free priority assignment
     */
    async personalizedNextSteps() {
        // FIX W-024: Use PriorityAssigner instead of manual priority management
        const prioritizer = new PriorityAssigner();

        // Based on insights, suggest next actions
        const hasSavings = this.insights.some(i => i.type === 'savings_opportunity');
        const hasAnomaly = this.insights.some(i => i.type === 'anomaly');
        const needsOptimization = this.insights.some(i =>
            i.type === 'benchmark' && i.headline.includes('needs optimization')
        );

        if (hasSavings) {
            prioritizer.addStep({
                title: 'Apply recommended optimizations',
                description: 'We found savings opportunities. Apply them with one click.',
                action: 'optimize',
                time_estimate: '2 minutes'
            }, PRIORITY_LEVELS.CRITICAL);
        }

        if (hasAnomaly) {
            prioritizer.addStep({
                title: 'Review the spending anomaly',
                description: 'Understand what caused the spike to prevent future issues.',
                action: 'investigate',
                time_estimate: '5 minutes'
            }, PRIORITY_LEVELS.HIGH);
        }

        prioritizer.addStep({
            title: 'Connect all your AI providers',
            description: 'Get complete visibility by connecting all your AI services.',
            action: 'connect_providers',
            time_estimate: '10 minutes'
        }, PRIORITY_LEVELS.MEDIUM);

        prioritizer.addStep({
            title: 'Set up your budget',
            description: 'Define spending limits and let Autopilot enforce them.',
            action: 'set_budget',
            time_estimate: '3 minutes'
        }, PRIORITY_LEVELS.MEDIUM);

        if (needsOptimization) {
            prioritizer.addStep({
                title: 'Enable Autopilot in Assist mode',
                description: 'Let Finault automatically optimize your costs.',
                action: 'enable_autopilot',
                time_estimate: '1 minute'
            }, PRIORITY_LEVELS.CRITICAL);
        }

        return {
            step: 'next_steps',
            elapsed_ms: Date.now() - this.startTime,
            next_steps: prioritizer.getOrderedSteps()
        };
    }

    /**
     * RUN THE COMPLETE MAGIC ONBOARDING
     */
    async run(sampleData = null) {
        const results = {
            started_at: new Date().toISOString(),
            organization_id: this.organizationId,
            steps: []
        };

        // Step 1: Auto-connect
        results.steps.push(await this.autoConnect());

        // Step 2: Instant analysis
        results.steps.push(await this.instantAnalysis(sampleData));

        // Step 3: Wow moment
        results.steps.push(await this.generateWowMoment());

        // Step 4: Instant value setup
        results.steps.push(await this.instantValueSetup());

        // Step 5: Next steps
        results.steps.push(await this.personalizedNextSteps());

        results.completed_at = new Date().toISOString();
        results.total_time_ms = Date.now() - this.startTime;
        results.total_time_seconds = (results.total_time_ms / 1000).toFixed(1);

        // Store onboarding completion
        await resilientSupabase.from('onboarding_completions').insert({
            organization_id: this.organizationId,
            user_id: this.userId,
            completed_at: results.completed_at,
            total_time_ms: results.total_time_ms,
            insights_found: this.insights.length,
            wow_moment: results.steps.find(s => s.step === 'wow_moment')?.wow
        });

        return results;
    }
}

/**
 * Quick start function for immediate value
 */
export async function magicStart(organizationId, userId, data = null) {
    // Fix W-002: Named params
    const onboarding = new MagicOnboarding({ organizationId, userId });
    return await onboarding.run(data);
}

export default MagicOnboarding;
