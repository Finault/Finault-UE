/**
 * FINAULT PAL
 * Personal AI Cost Governance Co-Pilot
 *
 * "The Apple of AI Cost Governance"
 *
 * This is the main conversational agent that serves as the user's
 * intelligent assistant for all AI cost management needs.
 *
 * Capabilities:
 * - Natural language interface to all Finault capabilities
 * - Remembers context, preferences, and history
 * - Orchestrates specialist agents as needed
 * - Learns from every interaction
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseResilience, createAnthropicResilience } from '../core/resilience-layer.js';
import { MessageStore } from '../core/message-store.js';

// Initialize clients
const anthropic = new Anthropic();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resilientSupabase = createSupabaseResilience(supabase);
const resilientAnthropic = createAnthropicResilience(anthropic);

import { validateAgentParams } from '../core/validate-agent-params.js';

// Agent configuration
const AGENT_CONFIG = {
    id: 'finault-pal',
    name: 'Finault Pal',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    temperature: 0.7
};

// System prompt - The soul of Finault Pal
const SYSTEM_PROMPT = `You are Finault Pal, the AI-powered cost governance co-pilot.

## Your Identity
You are the "Apple of AI Cost Governance" - making complex cost management feel effortless.
You combine the precision of a CFO with the approachability of a helpful colleague.

## Your Capabilities
You have access to powerful tools that let you:
1. **Parse & Analyze** - Process any AI invoice or bill from any provider
2. **Detect Anomalies** - Find unusual spending patterns automatically
3. **Allocate Costs** - Distribute costs across teams, projects, cost centers
4. **Optimize Spending** - Find and implement cost savings
5. **Forecast Costs** - Predict future spending with high accuracy
6. **Generate Reports** - Create executive-ready Close Pack reports
7. **Enforce Policies** - Monitor and enforce cost governance policies
8. **Integrate Systems** - Connect with ERPs, billing systems, and more

## Your Personality
- **Confident but not arrogant** - You know your stuff, but explain simply
- **Proactive** - Don't just answer, anticipate follow-up needs
- **Action-oriented** - Always offer to DO things, not just explain
- **Precise** - Use exact numbers, never vague approximations
- **Empathetic** - Understand the stress of managing costs

## Your Conversation Style
- Start with the answer, then provide details
- Offer actionable next steps with clear options
- Use formatting sparingly - only when it adds clarity
- Never say "I can't" without offering an alternative
- Remember past conversations and reference them naturally

## Your Memory
You remember:
- User preferences and communication style
- Past questions and their context
- Optimizations previously discussed or applied
- Patterns in their spending behavior
- Their organization's specific terminology

## The "Jobs Test"
Before every response, ask yourself:
"Would Steve Jobs find this delightfully simple and useful?"
If not, simplify until it is.

## Example Interactions

User: "Why did my costs spike?"
Good: "Your costs jumped 34% last week, driven by three factors:
1. GPT-4 usage tripled on the Analytics project
2. A batch job ran without rate limiting
3. New team members weren't using the approved models

I can fix all three right now. Want me to apply rate limits and model policies?"

User: "Optimize my spending"
Good: "I found $52,000/month in savings across your accounts:

[Lists specific, actionable optimizations with confidence levels]

Should I apply these now, or walk you through each one first?"

## Current Context
{context}

## User's Memory
{memory}

Remember: You're not just an assistant - you're their AI cost governance partner.
Make them feel like they have a superpower.`;

/**
 * Finault Pal Agent Class
 */
export class FinaultPal {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'FinaultPal');
        this.userId = userId;
        this.organizationId = organizationId;
        this.sessionId = null;
        // FIX W-025: Use MessageStore for consistent message history management
        this.messageStore = new MessageStore({ maxMessages: 100 });
        this.memory = [];
        this.state = {};
    }

    /**
     * Initialize or resume a session
     */
    async initSession(sessionId = null) {
        try {
            if (sessionId) {
                // Resume existing session
                // BUG 98: Narrow select('*') to specific columns
                const { data: session, error: sessionError } = await supabase
                    .from('agent_sessions')
                    .select('id, user_id, agent_id, agent_name, metadata, created_at')
                    .eq('id', sessionId)
                    .single();

                if (sessionError) {
                    console.error('[FinaultPal] Failed to load session:', sessionError.message);
                } else if (session) {
                    this.sessionId = session.id;

                    // Load message history
                    // BUG 98: Narrow select('*') to specific columns
                    const { data: messages, error: messagesError } = await supabase
                        .from('agent_messages')
                        .select('id, role, content, tool_calls, created_at')
                        .eq('session_id', sessionId)
                        .order('created_at', { ascending: true });

                    if (messagesError) {
                        console.error('[FinaultPal] Failed to load messages:', messagesError.message);
                    }
                    // FIX W-025: Load messages into MessageStore
                    if (messages) {
                        messages.forEach(msg => {
                            this.messageStore.addMessage(msg.role, msg.content);
                        });
                    }
                }
            }

            if (!this.sessionId) {
                // Create new session
                const { data: session, error: createError } = await supabase
                    .from('agent_sessions')
                    .insert({
                        user_id: this.userId,
                        agent_id: AGENT_CONFIG.id,
                        agent_name: AGENT_CONFIG.name,
                        metadata: { organization_id: this.organizationId }
                    })
                    .select()
                    .single();

                if (createError) {
                    console.error('[FinaultPal] Failed to create session:', createError.message);
                } else if (session?.id) {
                    this.sessionId = session.id;
                }
            }

            // Load user's memory
            await this.loadMemory();

            // Load agent state
            await this.loadState();

            return this.sessionId;
        } catch (error) {
            console.error('[FinaultPal] initSession failed:', error.message);
            // Initialize with defaults so the agent can still function
            this.sessionId = sessionId || `fallback-${Date.now()}`;
            // FIX W-025: Use MessageStore instead of messageHistory
            this.messageStore = new MessageStore({ maxMessages: 100 });
        }
    }

    /**
     * Load relevant memories for context
     */
    async loadMemory() {
        try {
            // BUG 96: Destructure error + narrow select('*') to specific columns
            const { data: memories, error: memoryError } = await supabase
                .from('agent_memory')
                .select('id, memory_type, content, importance, created_at')
                .eq('user_id', this.userId)
                .eq('agent_id', AGENT_CONFIG.id)
                .order('importance', { ascending: false })
                .limit(20);

            if (memoryError) {
                console.error('[FinaultPal] loadMemory: Supabase query failed:', memoryError.message);
                this.memory = [];
                return;
            }
            this.memory = memories || [];
        } catch (error) {
            console.error('[FinaultPal] loadMemory failed:', error.message);
            this.memory = [];
        }
    }

    /**
     * Load agent state
     */
    async loadState() {
        try {
            // BUG 97: Destructure error to catch silent Supabase failures
            const { data: state, error: stateError } = await supabase
                .from('agent_state')
                .select('state')
                .eq('user_id', this.userId)
                .eq('agent_id', AGENT_CONFIG.id)
                .single();

            if (stateError && stateError.code !== 'PGRST116') {
                console.error('[FinaultPal] loadState: Supabase query failed:', stateError.message);
                this.state = {};
                return;
            }
            this.state = state?.state || {};
        } catch (error) {
            console.error('[FinaultPal] loadState failed:', error.message);
            this.state = {};
        }
    }

    /**
     * Build context for the system prompt
     */
    buildContext() {
        const context = {
            organization_id: this.organizationId,
            session_started: new Date().toISOString(),
            recent_activity: this.state.recent_activity || 'No recent activity',
            pending_optimizations: this.state.pending_optimizations || [],
            active_alerts: this.state.active_alerts || []
        };

        return JSON.stringify(context, null, 2);
    }

    /**
     * Build memory context
     */
    buildMemoryContext() {
        if (this.memory.length === 0) {
            return 'No memories stored yet. This appears to be a new user.';
        }

        return this.memory.map(m =>
            `[${m.memory_type}] ${m.content}`
        ).join('\n');
    }

    /**
     * Define available tools
     */
    getTools() {
        return [
            {
                name: 'analyze_costs',
                description: 'Analyze AI costs for a specific time period. Returns spending breakdown by provider, model, project, and team.',
                input_schema: {
                    type: 'object',
                    properties: {
                        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
                        group_by: { type: 'string', enum: ['provider', 'model', 'project', 'team', 'day'], description: 'How to group results' }
                    },
                    required: ['start_date', 'end_date']
                }
            },
            {
                name: 'detect_anomalies',
                description: 'Detect spending anomalies using statistical analysis (Z-score, IQR, EWMA, CUSUM)',
                input_schema: {
                    type: 'object',
                    properties: {
                        lookback_days: { type: 'number', description: 'Days to analyze', default: 30 },
                        sensitivity: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' }
                    }
                }
            },
            {
                name: 'find_optimizations',
                description: 'Find cost optimization opportunities across all spending',
                input_schema: {
                    type: 'object',
                    properties: {
                        min_savings: { type: 'number', description: 'Minimum monthly savings to consider ($)' },
                        categories: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Categories to analyze: model_switch, caching, rate_limiting, reserved_capacity, consolidation'
                        }
                    }
                }
            },
            {
                name: 'apply_optimization',
                description: 'Apply a specific optimization (requires user confirmation)',
                input_schema: {
                    type: 'object',
                    properties: {
                        optimization_id: { type: 'string', description: 'ID of optimization to apply' },
                        confirmed: { type: 'boolean', description: 'User has confirmed this action' }
                    },
                    required: ['optimization_id', 'confirmed']
                }
            },
            {
                name: 'forecast_costs',
                description: 'Predict future costs based on historical patterns',
                input_schema: {
                    type: 'object',
                    properties: {
                        months_ahead: { type: 'number', description: 'Months to forecast', default: 3 },
                        scenario: { type: 'string', enum: ['baseline', 'growth', 'optimized'], default: 'baseline' }
                    }
                }
            },
            {
                name: 'generate_report',
                description: 'Generate a Close Pack executive report',
                input_schema: {
                    type: 'object',
                    properties: {
                        report_type: { type: 'string', enum: ['monthly', 'quarterly', 'annual', 'custom'] },
                        start_date: { type: 'string' },
                        end_date: { type: 'string' },
                        include_sections: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Sections: summary, breakdown, anomalies, optimizations, forecast, recommendations'
                        }
                    },
                    required: ['report_type']
                }
            },
            {
                name: 'allocate_costs',
                description: 'Allocate costs according to policy rules',
                input_schema: {
                    type: 'object',
                    properties: {
                        period: { type: 'string', description: 'Period to allocate (YYYY-MM)' },
                        policy_id: { type: 'string', description: 'Allocation policy to use' },
                        preview: { type: 'boolean', description: 'Preview only, dont apply', default: true }
                    },
                    required: ['period']
                }
            },
            {
                name: 'check_policies',
                description: 'Check for policy violations and compliance status',
                input_schema: {
                    type: 'object',
                    properties: {
                        policy_types: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Types: budget, model_usage, rate_limit, approval_required'
                        }
                    }
                }
            },
            {
                name: 'search_knowledge',
                description: 'Search the knowledge base for AI pricing, best practices, or benchmarks',
                input_schema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Search query' },
                        knowledge_type: { type: 'string', enum: ['pricing', 'best_practice', 'benchmark', 'all'], default: 'all' }
                    },
                    required: ['query']
                }
            },
            {
                name: 'remember',
                description: 'Store important information in long-term memory',
                input_schema: {
                    type: 'object',
                    properties: {
                        content: { type: 'string', description: 'What to remember' },
                        memory_type: { type: 'string', enum: ['fact', 'preference', 'pattern', 'context'] },
                        importance: { type: 'number', description: '0-1 importance score', default: 0.5 }
                    },
                    required: ['content', 'memory_type']
                }
            },
            {
                name: 'delegate_to_specialist',
                description: 'Delegate a task to a specialist agent',
                input_schema: {
                    type: 'object',
                    properties: {
                        agent: {
                            type: 'string',
                            enum: ['cost_intelligence', 'optimization', 'forecasting', 'policy'],
                            description: 'Which specialist agent to use'
                        },
                        task: { type: 'string', description: 'Task description' },
                        parameters: { type: 'object', description: 'Task parameters' }
                    },
                    required: ['agent', 'task']
                }
            }
        ];
    }

    /**
     * Execute a tool call
     */
    async executeTool(name, input) {
        console.log(`Executing tool: ${name}`, input);

        // Import the tool implementations
        const tools = await import('../tools/finault-tools.js');

        switch (name) {
            case 'analyze_costs':
                return await tools.analyzeCosts(this.organizationId, input);

            case 'detect_anomalies':
                return await tools.detectAnomalies(this.organizationId, input);

            case 'find_optimizations':
                return await tools.findOptimizations(this.organizationId, input);

            case 'apply_optimization':
                return await tools.applyOptimization(this.organizationId, this.userId, input);

            case 'forecast_costs':
                return await tools.forecastCosts(this.organizationId, input);

            case 'generate_report':
                return await tools.generateReport(this.organizationId, input);

            case 'allocate_costs':
                return await tools.allocateCosts(this.organizationId, input);

            case 'check_policies':
                return await tools.checkPolicies(this.organizationId, input);

            case 'search_knowledge':
                return await tools.searchKnowledge(input);

            case 'remember':
                return await this.storeMemory(input);

            case 'delegate_to_specialist':
                return await this.delegateToSpecialist(input);

            default:
                return { error: `Unknown tool: ${name}` };
        }
    }

    /**
     * Store a memory
     */
    async storeMemory(input) {
        // Input validation
        const VALID_MEMORY_TYPES = ['insight', 'preference', 'correction', 'context'];
        if (!input.content || typeof input.content !== 'string' || input.content.trim() === '') {
            return { error: 'storeMemory: content must be a non-empty string' };
        }
        if (input.memory_type && !VALID_MEMORY_TYPES.includes(input.memory_type)) {
            return { error: `storeMemory: invalid memory_type. Must be one of: ${VALID_MEMORY_TYPES.join(', ')}` };
        }

        const { data, error } = await supabase
            .from('agent_memory')
            .insert({
                user_id: this.userId,
                agent_id: AGENT_CONFIG.id,
                memory_type: input.memory_type,
                content: input.content,
                importance: input.importance || 0.5,
                source_session_id: this.sessionId
            })
            .select()
            .single();

        if (error) {
            return { error: error.message };
        }

        if (!data?.id) {
            return { error: 'Failed to store memory: no ID returned' };
        }

        return { success: true, memory_id: data.id };
    }

    /**
     * Delegate to a specialist agent
     */
    async delegateToSpecialist(input) {
        const { agent, task, parameters } = input;

        // Input validation
        const VALID_AGENTS = ['cost_intelligence', 'optimization', 'forecasting', 'policy'];
        if (!agent || !VALID_AGENTS.includes(agent)) {
            return { error: `Invalid agent: ${agent}. Must be one of: ${VALID_AGENTS.join(', ')}` };
        }
        if (!task || typeof task !== 'string' || task.trim() === '') {
            return { error: 'delegateToSpecialist: task must be a non-empty string' };
        }
        if (parameters !== undefined && parameters !== null && typeof parameters !== 'object') {
            return { error: 'delegateToSpecialist: parameters must be an object or null' };
        }

        // Dynamic import of specialist agent
        const agents = {
            cost_intelligence: '../agents/cost-intelligence.js',
            optimization: '../agents/optimization-agent.js',
            forecasting: '../agents/forecasting-agent.js',
            policy: '../agents/policy-agent.js'
        };

        try {
            const module = await import(agents[agent]);
            // FIX W-002: Agent Constructor Mismatch
            // Use named params object instead of positional arguments to match constructor signature
            // and ensure consistent behavior across all agent instantiations
            const specialist = new module.default({ userId: this.userId, organizationId: this.organizationId });
            return await specialist.execute(task, parameters);
        } catch (error) {
            return { error: `Failed to delegate to ${agent}: ${error.message}` };
        }
    }

    /**
     * Send a message and get a response
     */
    async chat(userMessage) {
        // BUG 100: Input validation on userMessage
        if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
            return { error: 'chat: userMessage must be a non-empty string' };
        }
        if (userMessage.length > 100000) {
            return { error: 'chat: userMessage exceeds maximum length (100000 characters)' };
        }
        const startTime = Date.now();

        // FIX W-025: Store user message in MessageStore
        this.messageStore.addUserMessage(userMessage);

        // Also store in database
        const { error: userMessageError } = await resilientSupabase.from('agent_messages').insert({
            session_id: this.sessionId,
            role: 'user',
            content: userMessage
        });
        if (userMessageError) {
            console.error('[FinaultPal] Failed to store user message:', userMessageError.message);
        }

        // Build the system prompt with context
        const systemPrompt = SYSTEM_PROMPT
            .replace('{context}', this.buildContext())
            .replace('{memory}', this.buildMemoryContext());

        // FIX W-025: Get message history from MessageStore
        const messageHistory = this.messageStore.getMessages().map(m => ({
            role: m.role,
            content: m.content
        }));

        // Call Claude with tools
        let response = await resilientAnthropic.messages.create({
            model: AGENT_CONFIG.model,
            max_tokens: AGENT_CONFIG.maxTokens,
            system: systemPrompt,
            tools: this.getTools(),
            messages: messageHistory
        });

        // Handle tool use loop
        while (response.stop_reason === 'tool_use') {
            const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
            const toolResults = [];

            for (const toolUse of toolUseBlocks) {
                const result = await this.executeTool(toolUse.name, toolUse.input);
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: JSON.stringify(result)
                });
            }

            // Continue conversation with tool results
            messageHistory.push({ role: 'assistant', content: response.content });
            messageHistory.push({ role: 'user', content: toolResults });

            response = await resilientAnthropic.messages.create({
                model: AGENT_CONFIG.model,
                max_tokens: AGENT_CONFIG.maxTokens,
                system: systemPrompt,
                tools: this.getTools(),
                messages: messageHistory
            });
        }

        // Extract final text response
        const assistantMessage = response.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('\n');

        const latency = Date.now() - startTime;

        // FIX W-025: Store in MessageStore and DB
        this.messageStore.addAssistantMessage(assistantMessage);

        // Store assistant response
        const { error: assistantMessageError } = await resilientSupabase.from('agent_messages').insert({
            session_id: this.sessionId,
            role: 'assistant',
            content: assistantMessage,
            tokens_used: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
            model_used: AGENT_CONFIG.model,
            latency_ms: latency
        });
        if (assistantMessageError) {
            console.error('[FinaultPal] Failed to store assistant message:', assistantMessageError.message);
        }

        // Update session activity
        const { error: sessionUpdateError } = await supabase
            .from('agent_sessions')
            .update({ last_activity: new Date().toISOString() })
            .eq('id', this.sessionId);
        if (sessionUpdateError) {
            console.error('[FinaultPal] Failed to update session activity:', sessionUpdateError.message);
        }

        // Update metrics
        const { error: metricsError } = await resilientSupabase.rpc('update_agent_metrics', {
            p_agent_id: AGENT_CONFIG.id,
            p_messages: 2, // user + assistant
            p_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
        });
        if (metricsError) {
            console.error('[FinaultPal] Failed to update metrics:', metricsError.message);
        }

        return {
            message: assistantMessage,
            sessionId: this.sessionId,
            latency,
            tokensUsed: response.usage
        };
    }

    /**
     * Process feedback
     */
    async processFeedback(messageId, feedbackType, content = null) {
        // BUG 99: Input validation
        if (!messageId || typeof messageId !== 'string') {
            return { error: 'processFeedback: messageId must be a non-empty string' };
        }
        const VALID_FEEDBACK_TYPES = ['thumbs_up', 'thumbs_down', 'correction', 'comment'];
        if (!feedbackType || !VALID_FEEDBACK_TYPES.includes(feedbackType)) {
            return { error: `processFeedback: feedbackType must be one of: ${VALID_FEEDBACK_TYPES.join(', ')}` };
        }

        // BUG 99: Check Supabase insert error
        const { error: feedbackError } = await resilientSupabase.from('agent_feedback').insert({
            session_id: this.sessionId,
            message_id: messageId,
            user_id: this.userId,
            agent_id: AGENT_CONFIG.id,
            feedback_type: feedbackType,
            feedback_content: content
        });

        if (feedbackError) {
            console.error('[FinaultPal] processFeedback: insert failed:', feedbackError.message);
            return { error: feedbackError.message };
        }

        // If negative feedback, learn from it
        // BUG 99: Fixed memory_type from 'feedback' to valid 'correction' type
        if (feedbackType === 'thumbs_down' || feedbackType === 'correction') {
            await this.storeMemory({
                content: `User provided negative feedback: ${content || 'No details provided'}`,
                memory_type: 'correction',
                importance: 0.8
            });
        }

        return { success: true };
    }
}

// Export singleton factory — Fix W-002: Named params
export function createFinaultPal(userId, organizationId) {
    return new FinaultPal({ organizationId, userId });
}

export default FinaultPal;
