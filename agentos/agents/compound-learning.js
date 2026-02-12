/**
 * COMPOUND LEARNING AGENT
 * Self-improving agent that learns from every interaction
 *
 * Inspired by "Compound Engineering" - the agent reviews its own work,
 * extracts learnings, updates its instructions, and continuously improves.
 *
 * This is what makes Finault truly autonomous.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { validateAgentParams } from '../core/validate-agent-params.js';
import { storage } from '../core/storage-adapter.js';
import { createSupabaseResilience, createAnthropicResilience } from '../core/resilience-layer.js';
import { parseFormattedNumber, ensureNumeric, safeReduceNumeric, safeAccuracyRate } from '../core/learning-sanitizer.js';

const anthropic = new Anthropic();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resilientSupabase = createSupabaseResilience(supabase);
const resilientAnthropic = createAnthropicResilience(anthropic);

const AGENT_CONFIG = {
    id: 'compound-learning',
    name: 'Compound Learning Agent',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192
};

/**
 * Learning categories for Finault
 */
const LEARNING_CATEGORIES = {
    cost_patterns: 'Patterns in AI cost data (spikes, trends, correlations)',
    optimization_strategies: 'What optimization strategies work best',
    user_preferences: 'How users like to interact, their priorities',
    integration_gotchas: 'Issues with specific providers, ERPs, or data formats',
    forecasting_accuracy: 'How accurate were predictions vs actuals',
    anomaly_signatures: 'Signatures of real anomalies vs false positives',
    report_preferences: 'What executives actually want to see in reports'
};

export class CompoundLearningAgent {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'CompoundLearningAgent');
        this.organizationId = organizationId;
        this.userId = userId;
        // Fix W-003: AGENTS.md is now stored in Supabase, not the filesystem.
        // The storage adapter handles versioning and persistence across serverless invocations.
        this.learningsBucket = 'learning-docs';
        this.learningsKey = `${organizationId}/AGENTS.md`;
    }

    /**
     * Extract learnings from a completed session
     */
    // CALLER-BUG 14 FIX: (a) Wrap Supabase queries in try-catch — if agent_messages
    // query throws (Supabase down, network error), the exception propagated uncaught
    // through reviewRecentSessions → nightlyCompound, killing the entire nightly run.
    // (b) Guard against empty response.content array from Claude — accessing
    // response.content[0].text on an empty array throws TypeError that wasn't caught
    // by the JSON.parse try-catch (it's before the try block).
    async extractLearnings(sessionId) {
        // Get session messages
        let messages;
        try {
            const result = await supabase
                .from('agent_messages')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true });
            if (result.error) throw new Error(result.error.message);
            messages = result.data;
        } catch (e) {
            return { success: false, sessionId, error: `Failed to fetch messages: ${e.message}` };
        }

        if (!messages || messages.length === 0) {
            return { success: false, sessionId, error: 'No messages found' };
        }

        // Get any feedback on this session (non-critical — default to empty on failure)
        let feedback = [];
        try {
            const result = await supabase
                .from('agent_feedback')
                .select('*')
                .eq('session_id', sessionId);
            if (!result.error) feedback = result.data || [];
        } catch (e) {
            console.warn(`[CompoundLearning] Failed to fetch feedback for session ${sessionId}: ${e.message}`);
        }

        // Build context for analysis
        const conversation = messages.map(m =>
            `[${m.role}]: ${m.content}`
        ).join('\n\n');

        const feedbackSummary = feedback && feedback.length > 0
            ? `\n\nUser Feedback:\n${feedback.map(f => `- ${f.feedback_type}: ${f.feedback_content || 'no details'}`).join('\n')}`
            : '';

        // Use Claude to extract learnings
        let response;
        try {
            response = await resilientAnthropic.messages.create({
                model: AGENT_CONFIG.model,
                max_tokens: 2048,
                system: `You are analyzing a Finault agent session to extract learnings that will improve future performance.

Finault is an AI cost governance platform. We want to learn from every interaction to get better.

Categories of learnings:
${Object.entries(LEARNING_CATEGORIES).map(([key, desc]) => `- ${key}: ${desc}`).join('\n')}

For each learning, assess:
1. Category it belongs to
2. The specific insight
3. Confidence (low/medium/high)
4. Action to take (update instructions, add pattern, etc.)

Output JSON format:
{
  "learnings": [
    {
      "category": "category_key",
      "insight": "The specific thing we learned",
      "confidence": "high",
      "action": "What to do with this learning",
      "context": "Brief context about when this applies"
    }
  ],
  "session_quality": "good/fair/poor",
  "improvement_suggestions": ["suggestion1", "suggestion2"]
}`,
                messages: [{
                    role: 'user',
                    content: `Analyze this Finault session and extract learnings:\n\n${conversation}${feedbackSummary}`
                }]
            });
        } catch (e) {
            return { success: false, sessionId, learnings: [], error: `Claude API call failed: ${e.message}` };
        }

        // Guard against empty content array
        if (!response.content || response.content.length === 0 || !response.content[0].text) {
            return {
                success: false,
                sessionId,
                learnings: [],
                error: 'Claude returned empty content array',
            };
        }

        try {
            const analysis = JSON.parse(response.content[0].text);
            return {
                success: true,
                sessionId,
                ...analysis
            };
        } catch (e) {
            // CALLER-BUG 3 FIX: Return success:false when JSON parsing fails.
            return {
                success: false,
                sessionId,
                learnings: [],
                raw_analysis: response.content[0].text,
                parse_error: e.message,
            };
        }
    }

    /**
     * Review all sessions from the last N hours
     */
    // CALLER-BUG 15 FIX: Wrap Supabase session query in try-catch, and handle
    // partial update failures when marking sessions as reviewed. Old code: if
    // the initial query throws (Supabase down), exception propagated uncaught.
    // If marking session 4 as reviewed fails, sessions 5-N never processed,
    // and sessions 1-3 already marked → next run re-processes 4-N but skips 1-3.
    async reviewRecentSessions(hoursBack = 24) {
        const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

        // Get sessions that haven't been reviewed
        let sessions;
        try {
            const { data, error } = await supabase
                .from('agent_sessions')
                .select('*')
                .gte('last_activity', cutoff)
                .is('reviewed_at', null);
            if (error) throw new Error(error.message);
            sessions = data;
        } catch (e) {
            return { success: false, error: `Failed to fetch sessions: ${e.message}`, learnings: [] };
        }

        if (!sessions || sessions.length === 0) {
            return { success: true, message: 'No sessions to review', learnings: [] };
        }

        const allLearnings = [];
        const reviewFailures = [];

        for (const session of sessions) {
            const result = await this.extractLearnings(session.id);

            if (result.success && result.learnings) {
                allLearnings.push(...result.learnings.map(l => ({
                    ...l,
                    session_id: session.id,
                    agent_id: session.agent_id
                })));
            }

            // Mark session as reviewed — with error handling
            try {
                const { error } = await supabase
                    .from('agent_sessions')
                    .update({ reviewed_at: new Date().toISOString() })
                    .eq('id', session.id);
                if (error) throw new Error(error.message);
            } catch (e) {
                reviewFailures.push({ session_id: session.id, error: e.message });
            }
        }

        return {
            success: reviewFailures.length === 0,
            sessions_reviewed: sessions.length - reviewFailures.length,
            learnings: allLearnings,
            ...(reviewFailures.length > 0 && { review_failures: reviewFailures })
        };
    }

    /**
     * Consolidate learnings into AGENTS.md
     */
    // CALLER-BUG 16 FIX: Wrap all 3 async operations in try-catch blocks.
    // Old code: (1) storage.getDocument throws → exception kills nightlyCompound,
    // (2) anthropic.messages.create throws or returns empty content → response.content[0].text
    // crashes with TypeError, (3) Supabase insert loop fails partway → AGENTS.md updated
    // but only N of M learnings persisted, with zero visibility into the partial failure.
    async updateAgentsMd(learnings) {
        if (!learnings || learnings.length === 0) {
            return { success: true, message: 'No learnings to consolidate' };
        }

        // Read current AGENTS.md from Supabase storage
        let currentContent = '';
        try {
            const existingDoc = await storage.getDocument(this.learningsBucket, this.learningsKey);
            if (existingDoc) {
                currentContent = existingDoc.content;
            } else {
                currentContent = `# Finault Agent Learnings

This file is automatically updated by the Compound Learning Agent.
It contains learnings extracted from agent sessions to improve future performance.

## Categories

${Object.entries(LEARNING_CATEGORIES).map(([key, desc]) => `### ${key}\n${desc}\n`).join('\n')}
`;
            }
        } catch (e) {
            return { success: false, error: `Failed to read AGENTS.md: ${e.message}` };
        }

        // Group learnings by category
        const byCategory = {};
        learnings.forEach(l => {
            if (!byCategory[l.category]) {
                byCategory[l.category] = [];
            }
            byCategory[l.category].push(l);
        });

        // Use Claude to integrate new learnings
        let updatedContent;
        try {
            const response = await resilientAnthropic.messages.create({
                model: AGENT_CONFIG.model,
                max_tokens: 4096,
                system: `You are updating the Finault AGENTS.md file with new learnings.

Rules:
1. Preserve existing learnings unless they conflict with new ones
2. Deduplicate similar learnings
3. Prioritize high-confidence learnings
4. Keep entries concise but actionable
5. Use bullet points under each category
6. Add timestamps for traceability

Format each learning as:
- [DATE] INSIGHT (Confidence: X) - ACTION`,
                messages: [{
                    role: 'user',
                    content: `Current AGENTS.md:\n\n${currentContent}\n\nNew learnings to integrate:\n\n${JSON.stringify(byCategory, null, 2)}\n\nGenerate the updated AGENTS.md content.`
                }]
            });

            if (!response.content || response.content.length === 0 || !response.content[0].text) {
                return { success: false, error: 'Claude returned empty content for AGENTS.md update' };
            }
            updatedContent = response.content[0].text;
        } catch (e) {
            return { success: false, error: `Claude API failed for AGENTS.md update: ${e.message}` };
        }

        // Write updated AGENTS.md to Supabase storage (versioned for audit trail)
        try {
            await storage.putDocument(this.learningsBucket, this.learningsKey, updatedContent, { version: true });
        } catch (e) {
            return { success: false, error: `Failed to write AGENTS.md: ${e.message}` };
        }

        // Also store in database — per-item error handling for partial failures
        const insertFailures = [];
        for (const learning of learnings) {
            try {
                const { error } = await resilientSupabase.from('agent_memory').insert({
                    user_id: this.organizationId,
                    agent_id: 'compound-learning',
                    memory_type: 'pattern',
                    content: JSON.stringify(learning),
                    importance: learning.confidence === 'high' ? 0.9 : learning.confidence === 'medium' ? 0.7 : 0.5
                });
                if (error) throw new Error(error.message);
            } catch (e) {
                insertFailures.push({ insight: learning.insight, error: e.message });
            }
        }

        return {
            success: insertFailures.length === 0,
            learnings_integrated: learnings.length - insertFailures.length,
            categories_updated: Object.keys(byCategory),
            ...(insertFailures.length > 0 && { insert_failures: insertFailures })
        };
    }

    /**
     * Verify forecasting accuracy (learn from predictions)
     */
    // CALLER-BUG 18 FIX: Wrap initial Supabase query in try-catch. Old code: if
    // the query throws, exception propagates uncaught → nightly step 3 fails silently.
    async verifyForecasts() {
        // Get forecasts made 30+ days ago
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        let forecasts;
        try {
            const { data, error } = await supabase
                .from('forecast_records')
                .select('*')
                .eq('organization_id', this.organizationId)
                .lte('created_at', cutoff)
                .is('verified', null);
            if (error) throw new Error(error.message);
            forecasts = data;
        } catch (e) {
            return { success: false, error: `Failed to fetch forecasts: ${e.message}` };
        }

        if (!forecasts || forecasts.length === 0) {
            return { success: true, message: 'No forecasts to verify' };
        }

        const verifications = [];

        // CALLER-BUG 33 FIX: Wrap per-forecast processing in try-catch.
        // Old code: if the cost_records query or forecast_records update throws
        // (network error, auth failure), the exception propagates uncaught,
        // the loop terminates, and remaining forecasts are never verified.
        // The function returns success=true with partial results — callers
        // don't know some forecasts were skipped.
        for (const forecast of forecasts) {
            try {
                // Get actual spend for the forecasted period
                const { data: actuals, error: actualsErr } = await supabase
                    .from('cost_records')
                    .select('amount')
                    .eq('organization_id', this.organizationId)
                    .gte('timestamp', forecast.period_start)
                    .lte('timestamp', forecast.period_end);

                if (actualsErr) throw new Error(actualsErr.message);
                if (!actuals) continue;

                const actualSpend = actuals.reduce((sum, r) => sum + parseFormattedNumber(r.amount, 0), 0);
                const forecastedSpend = ensureNumeric(forecast.predicted_amount, 0);
                // CALLER-BUG 2 FIX: Guard against division by zero.
                // If actualSpend is 0 (no cost records found), dividing produces
                // Infinity which corrupts error_pct, accuracy metrics, and the
                // forecast_records table's error_percentage column.
                const error = actualSpend > 0
                    ? Math.abs(actualSpend - forecastedSpend) / actualSpend
                    : (forecastedSpend > 0 ? 1 : 0);

                verifications.push({
                    forecast_id: forecast.id,
                    predicted: forecastedSpend,
                    actual: actualSpend,
                    error_pct: (error * 100).toFixed(1) + '%',
                    accurate: error < 0.15 // Within 15% is considered accurate
                });

                // Update forecast with verification
                const { error: updateErr } = await supabase
                    .from('forecast_records')
                    .update({
                        verified: true,
                        actual_amount: actualSpend,
                        error_percentage: error
                    })
                    .eq('id', forecast.id);
                if (updateErr) throw new Error(updateErr.message);
            } catch (e) {
                verifications.push({
                    forecast_id: forecast.id,
                    error: `Verification failed: ${e.message}`,
                    accurate: false
                });
            }
        }

        // Extract learnings from verification
        // CALLER-BUG 2 FIX (continued): Guard against empty verifications array.
        // If all forecasts were skipped (!actuals), verifications is empty and
        // dividing by verifications.length produces NaN, corrupting the return value.
        const avgError = verifications.length > 0
            ? safeReduceNumeric(verifications, v => parseFormattedNumber(v.error_pct, 0), 0).avg
            : 0;
        const accuracyRate = verifications.length > 0
            ? safeAccuracyRate(verifications, v => v.accurate, 0)
            : 0;

        return {
            success: true,
            forecasts_verified: verifications.length,
            average_error: avgError.toFixed(1) + '%',
            accuracy_rate: (accuracyRate * 100).toFixed(0) + '%',
            verifications
        };
    }

    /**
     * Run the nightly compound loop
     */
    // CALLER-BUG 13 FIX: Wrap each step in independent try-catch blocks.
    // Old code had NO error handling — if step 1 (reviewRecentSessions) threw,
    // steps 2-4 never executed. The entire nightly run died silently: forecasts
    // never verified, priorities never identified, '✅ Nightly compound complete!'
    // never printed. Operators had zero visibility that 3/4 steps were skipped.
    async nightlyCompound() {
        console.log('🌙 Starting nightly compound learning loop...');

        const results = {
            started_at: new Date().toISOString(),
            steps: []
        };

        // Step 1: Review recent sessions
        let reviewResult = { success: false };
        console.log('📚 Reviewing recent sessions...');
        try {
            reviewResult = await this.reviewRecentSessions(24);
            results.steps.push({ step: 'review_sessions', result: reviewResult });
        } catch (err) {
            console.error('Review sessions failed:', err.message);
            results.steps.push({ step: 'review_sessions', result: { success: false, error: err.message } });
        }

        // Step 2: Update AGENTS.md with new learnings
        if (reviewResult.learnings && reviewResult.learnings.length > 0) {
            console.log(`📝 Consolidating ${reviewResult.learnings.length} learnings...`);
            try {
                const updateResult = await this.updateAgentsMd(reviewResult.learnings);
                results.steps.push({ step: 'update_agents_md', result: updateResult });
            } catch (err) {
                console.error('Update AGENTS.md failed:', err.message);
                results.steps.push({ step: 'update_agents_md', result: { success: false, error: err.message } });
            }
        }

        // Step 3: Verify past forecasts
        console.log('🔍 Verifying forecast accuracy...');
        try {
            const verifyResult = await this.verifyForecasts();
            results.steps.push({ step: 'verify_forecasts', result: verifyResult });
        } catch (err) {
            console.error('Verify forecasts failed:', err.message);
            results.steps.push({ step: 'verify_forecasts', result: { success: false, error: err.message } });
        }

        // Step 4: Identify priority improvements
        console.log('🎯 Identifying priority improvements...');
        try {
            const priorities = await this.identifyPriorities();
            results.steps.push({ step: 'identify_priorities', result: priorities });
        } catch (err) {
            console.error('Identify priorities failed:', err.message);
            results.steps.push({ step: 'identify_priorities', result: { success: false, error: err.message } });
        }

        results.completed_at = new Date().toISOString();

        // Report overall status
        const failedSteps = results.steps.filter(s => !s.result.success);
        if (failedSteps.length > 0) {
            console.warn(`⚠️ Nightly compound completed with ${failedSteps.length}/${results.steps.length} failures`);
            results.status = 'partial_failure';
        } else {
            console.log('✅ Nightly compound complete!');
            results.status = 'success';
        }

        return results;
    }

    /**
     * Identify priority improvements for autonomous implementation
     */
    // CALLER-BUG 17 FIX: Wrap all 3 Supabase queries in try-catch. Guard null agent_id.
    // Old code: any query throw killed the entire nightly run. Null agent_id in feedback
    // used undefined as object key → priorities described "null" agent, confusing operators.
    async identifyPriorities() {
        // Get recent negative feedback
        let negativeFeedback = [];
        try {
            const { data, error } = await supabase
                .from('agent_feedback')
                .select('*')
                .in('feedback_type', ['thumbs_down', 'correction'])
                .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
            if (error) throw new Error(error.message);
            negativeFeedback = data || [];
        } catch (e) {
            console.error(`Failed to fetch negative feedback: ${e.message}`);
        }

        // Get optimization opportunities not yet applied
        let pendingOpts = [];
        try {
            const { data, error } = await supabase
                .from('optimization_actions')
                .select('*')
                .eq('organization_id', this.organizationId)
                .eq('status', 'suggested')
                .gt('estimated_savings_monthly', 1000)
                .order('estimated_savings_monthly', { ascending: false })
                .limit(5);
            if (error) throw new Error(error.message);
            pendingOpts = data || [];
        } catch (e) {
            console.error(`Failed to fetch optimization actions: ${e.message}`);
        }

        // Get policy violations
        let violations = [];
        try {
            const { data, error } = await supabase
                .from('policy_violations')
                .select('*')
                .eq('organization_id', this.organizationId)
                .eq('resolved', false);
            if (error) throw new Error(error.message);
            violations = data || [];
        } catch (e) {
            console.error(`Failed to fetch policy violations: ${e.message}`);
        }

        const priorities = [];

        // Priority 1: Fix things that got negative feedback
        if (negativeFeedback && negativeFeedback.length > 0) {
            const feedbackByAgent = {};
            negativeFeedback.forEach(f => {
                const agentId = f.agent_id || 'unknown';
                feedbackByAgent[agentId] = (feedbackByAgent[agentId] || 0) + 1;
            });

            const worstAgent = Object.entries(feedbackByAgent)
                .sort((a, b) => b[1] - a[1])[0];

            if (worstAgent) {
                priorities.push({
                    priority: 1,
                    type: 'fix_feedback',
                    description: `Investigate and fix issues with ${worstAgent[0]} (${worstAgent[1]} negative feedback this week)`,
                    impact: 'high'
                });
            }
        }

        // Priority 2: High-value optimizations waiting for approval
        if (pendingOpts && pendingOpts.length > 0) {
            const totalSavings = pendingOpts.reduce((sum, o) => sum + o.estimated_savings_monthly, 0);
            priorities.push({
                priority: 2,
                type: 'apply_optimizations',
                description: `${pendingOpts.length} optimizations pending with $${totalSavings.toFixed(0)}/month potential savings`,
                impact: 'high',
                items: pendingOpts.map(o => o.id)
            });
        }

        // Priority 3: Unresolved policy violations
        if (violations && violations.length > 0) {
            priorities.push({
                priority: 3,
                type: 'resolve_violations',
                description: `${violations.length} policy violations need resolution`,
                impact: 'medium',
                items: violations.map(v => v.id)
            });
        }

        return {
            success: true,
            priorities,
            total_items: priorities.length
        };
    }

    /**
     * Autonomous implementation of a priority item
     */
    async implementPriority(priorityItem) {
        // This would integrate with the auto-compound system
        // to actually implement fixes autonomously

        switch (priorityItem.type) {
            case 'fix_feedback':
                // Analyze feedback patterns and suggest fixes
                return {
                    status: 'analyzed',
                    recommendations: [
                        'Review and update agent prompts',
                        'Add more context to knowledge base',
                        'Improve error handling'
                    ]
                };

            case 'apply_optimizations':
                // Queue optimizations for user approval notification
                return {
                    status: 'queued',
                    message: 'Optimizations queued for user approval',
                    items: priorityItem.items
                };

            case 'resolve_violations':
                // Generate resolution recommendations
                return {
                    status: 'recommendations_generated',
                    message: 'Resolution recommendations generated for review'
                };

            default:
                return { status: 'unknown_type' };
        }
    }
}

export default CompoundLearningAgent;
