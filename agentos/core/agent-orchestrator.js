/**
 * FINAULT AGENT ORCHESTRATOR
 * The Puppeteer - Coordinating Specialist Agents
 *
 * RESEARCH INSIGHT: "Leading organizations implement 'puppeteer' orchestrators
 * that coordinate specialist agents—a researcher agent gathers information,
 * a coder agent implements solutions, an analyst agent validates results."
 *
 * RESEARCH INSIGHT: "The agentic AI field is going through its microservices
 * revolution. Single all-purpose agents are being replaced by orchestrated
 * teams of specialized agents."
 *
 * This orchestrator provides:
 * 1. Task Decomposition - Break complex tasks into subtasks
 * 2. Agent Selection - Route to the right specialist
 * 3. Coordination Protocol - Manage agent-to-agent communication
 * 4. Effort Scaling - Right-size resources to task complexity
 * 5. Result Aggregation - Combine outputs into coherent response
 * 6. Failure Recovery - Handle agent failures gracefully
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getObservability } from './observability.js';
import { createSupabaseResilience, createAnthropicResilience } from './resilience-layer.js';
import { getEventBus } from './agent-event-bus.js';
import { safeExtractText, safeRunningAverage, safeErrorRate } from './response-normalizer.js';

const anthropic = new Anthropic();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resilientSupabase = createSupabaseResilience(supabase);
const resilientAnthropic = createAnthropicResilience(anthropic);

/**
 * Task - Represents a unit of work
 */
class Task {
    constructor(description, options = {}) {
        this.task_id = crypto.randomUUID();
        this.description = description;
        this.type = options.type || 'general';
        this.priority = options.priority || 'normal';
        this.dependencies = options.dependencies || [];
        this.assigned_agent = null;
        this.status = 'pending';
        this.result = null;
        this.error = null;
        this.retries = 0;
        this.max_retries = options.max_retries || 3;
        this.timeout_ms = options.timeout_ms || 60000;
        this.created_at = Date.now();
        this.started_at = null;
        this.completed_at = null;
    }

    start(agent) {
        this.assigned_agent = agent;
        this.status = 'running';
        this.started_at = Date.now();
    }

    complete(result) {
        this.status = 'completed';
        this.result = result;
        this.completed_at = Date.now();
    }

    fail(error) {
        this.status = 'failed';
        this.error = error.message || error;
        this.retries++;
        this.completed_at = Date.now();
    }

    canRetry() {
        return this.retries < this.max_retries;
    }
}

/**
 * Agent Orchestrator - The Conductor
 */
export class AgentOrchestrator {
    constructor(config = {}) {
        this.config = {
            maxConcurrentTasks: config.maxConcurrentTasks || 5,
            defaultTimeout: config.defaultTimeout || 60000,
            enableCheckpointing: config.enableCheckpointing ?? true,
            ...config
        };

        // Registry of available agents
        this.agents = new Map();

        // Active executions
        this.executions = new Map();

        // Observability
        this.observability = getObservability();

        // Task queue
        this.taskQueue = [];
        this.runningTasks = new Map();
    }

    /**
     * Register an agent with its capabilities
     */
    registerAgent(name, agent, capabilities) {
        this.agents.set(name, {
            name,
            agent,
            capabilities,
            busy: false,
            tasks_completed: 0,
            avg_latency: 0,
            error_rate: 0
        });

        console.log(`📝 Registered agent: ${name} with capabilities: ${capabilities.join(', ')}`);
        return this;
    }

    /**
     * CORE: Execute a complex task
     */
    async execute(request, context = {}) {
        const executionId = crypto.randomUUID();
        const trace = this.observability.startTrace('orchestrator.execute');

        console.log(`🎭 Starting orchestration ${executionId}`);

        // W-006 COORDINATION: Initialize event bus and inject into context
        // so agents dispatched by the orchestrator share the coordination layer.
        const eventBus = getEventBus(resilientSupabase);
        const contextWithBus = { ...context, eventBus };

        const execution = {
            execution_id: executionId,
            request,
            context: contextWithBus,
            status: 'planning',
            tasks: [],
            results: {},
            started_at: Date.now(),
            checkpoints: []
        };

        this.executions.set(executionId, execution);

        try {
            // Step 1: Analyze and plan
            const planSpan = trace.startSpan('planning');
            const plan = await this.planExecution(request, context);
            execution.plan = plan;
            execution.tasks = plan.tasks;
            planSpan.end();

            // Step 2: Execute tasks
            execution.status = 'executing';
            const executeSpan = trace.startSpan('executing');

            // Execute in dependency order
            const taskResults = await this.executeTasks(execution);
            execution.results = taskResults;
            executeSpan.end();

            // Step 3: Aggregate results
            const aggregateSpan = trace.startSpan('aggregating');
            execution.status = 'aggregating';
            const finalResult = await this.aggregateResults(request, taskResults, context);
            aggregateSpan.end();

            execution.status = 'completed';
            execution.final_result = finalResult;
            execution.completed_at = Date.now();
            execution.duration_ms = execution.completed_at - execution.started_at;

            await this.observability.endTrace(trace, 'ok');

            // Store execution record
            await this.storeExecution(execution);

            return {
                success: true,
                execution_id: executionId,
                result: finalResult,
                tasks_executed: execution.tasks.length,
                duration_ms: execution.duration_ms
            };

        } catch (error) {
            execution.status = 'failed';
            execution.error = error.message;
            execution.completed_at = Date.now();

            await this.observability.endTrace(trace, 'error');
            await this.storeExecution(execution);

            throw error;
        }
    }

    /**
     * Plan the execution - decompose into tasks
     */
    async planExecution(request, context) {
        // Use LLM to plan the execution
        const response = await resilientAnthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: `You are a task planning agent for Finault, an AI cost governance platform.

Available agents and their capabilities:
${this.getAgentCapabilitiesPrompt()}

Given a user request, decompose it into tasks that can be executed by the available agents.
Consider dependencies between tasks.
Scale effort appropriately:
- Simple queries: 1 agent, 1-3 tool calls
- Comparisons: 2-4 agents
- Complex analysis: 5+ agents with clear responsibilities

Return JSON:
{
  "complexity": "simple" | "medium" | "complex",
  "tasks": [
    {
      "description": "what the task does",
      "type": "cost_analysis" | "reconciliation" | "optimization" | "forecasting" | "compliance" | "chargeback" | "reporting" | "budget",
      "agent": "agent name",
      "dependencies": ["task_id of dependency"],
      "priority": "high" | "normal" | "low",
      "estimated_duration_ms": number
    }
  ],
  "reasoning": "why this plan"
}`,
            messages: [{
                role: 'user',
                content: `Plan execution for: ${request}

Context: ${JSON.stringify(context)}`
            }]
        });

        const planText = safeExtractText(response);
        try {
            const plan = JSON.parse(planText);

            // Convert to Task objects
            plan.tasks = plan.tasks.map((t, i) => {
                const task = new Task(t.description, {
                    type: t.type,
                    priority: t.priority,
                    dependencies: t.dependencies || []
                });
                task.planned_agent = t.agent;
                task.estimated_duration = t.estimated_duration_ms;
                return task;
            });

            return plan;
        } catch {
            // Fallback to simple single-task plan
            return {
                complexity: 'simple',
                tasks: [new Task(request, { type: 'general' })],
                reasoning: 'Could not parse plan, falling back to simple execution'
            };
        }
    }

    /**
     * Get agent capabilities for prompt
     */
    getAgentCapabilitiesPrompt() {
        let prompt = '';
        for (const [name, info] of this.agents) {
            prompt += `- ${name}: ${info.capabilities.join(', ')}\n`;
        }
        return prompt || 'No agents registered';
    }

    /**
     * Execute tasks in dependency order
     */
    async executeTasks(execution) {
        const results = {};
        const completed = new Set();

        while (completed.size < execution.tasks.length) {
            // Find tasks ready to run (dependencies satisfied)
            const readyTasks = execution.tasks.filter(task =>
                task.status === 'pending' &&
                task.dependencies.every(dep => completed.has(dep))
            );

            if (readyTasks.length === 0) {
                // Check for deadlock
                const pending = execution.tasks.filter(t => t.status === 'pending');
                if (pending.length > 0) {
                    throw new Error('Deadlock detected: circular dependencies');
                }
                break;
            }

            // Execute ready tasks in parallel (up to concurrency limit)
            const batch = readyTasks.slice(0, this.config.maxConcurrentTasks);

            const batchResults = await Promise.allSettled(
                batch.map(task => this.executeTask(task, execution))
            );

            // Process results
            for (let i = 0; i < batch.length; i++) {
                const task = batch[i];
                const result = batchResults[i];

                if (result.status === 'fulfilled') {
                    task.complete(result.value);
                    results[task.task_id] = result.value;
                    completed.add(task.task_id);

                    // Checkpoint
                    if (this.config.enableCheckpointing) {
                        await this.checkpoint(execution, task);
                    }

                } else {
                    task.fail(result.reason);

                    // Retry if possible
                    if (task.canRetry()) {
                        task.status = 'pending';
                        console.log(`🔄 Retrying task ${task.task_id} (attempt ${task.retries})`);
                    } else {
                        throw new Error(`Task failed after ${task.retries} retries: ${task.error}`);
                    }
                }
            }
        }

        return results;
    }

    /**
     * Execute a single task
     */
    async executeTask(task, execution) {
        // Select the best agent
        const agent = this.selectAgent(task);

        if (!agent) {
            throw new Error(`No agent available for task type: ${task.type}`);
        }

        task.start(agent.name);
        this.runningTasks.set(task.task_id, task);

        console.log(`▶️ Task ${task.task_id.substring(0, 8)} -> ${agent.name}: ${task.description}`);

        try {
            // Apply timeout
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Task timeout')), task.timeout_ms)
            );

            // Execute
            const executePromise = this.invokeAgent(agent, task, execution);

            const result = await Promise.race([executePromise, timeoutPromise]);

            // Update agent stats
            this.updateAgentStats(agent, task, true);

            return result;

        } catch (error) {
            this.updateAgentStats(agent, task, false);
            throw error;

        } finally {
            this.runningTasks.delete(task.task_id);
        }
    }

    /**
     * Select best agent for task
     */
    selectAgent(task) {
        const candidates = [];

        for (const [name, info] of this.agents) {
            // Check if agent has required capability
            const hasCapability = info.capabilities.some(cap =>
                cap.includes(task.type) || task.type.includes(cap) || cap === 'general'
            );

            if (hasCapability && !info.busy) {
                candidates.push({
                    ...info,
                    score: this.scoreAgent(info, task)
                });
            }
        }

        if (candidates.length === 0) return null;

        // Select highest scoring agent
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0];
    }

    /**
     * Score an agent for a task
     */
    scoreAgent(agent, task) {
        let score = 0;

        // Prefer agents with exact capability match
        if (agent.capabilities.includes(task.type)) {
            score += 10;
        }

        // Prefer agents with lower error rate
        score -= agent.error_rate * 5;

        // Prefer agents with lower latency
        score -= agent.avg_latency / 10000;

        // Prefer agents with more experience
        score += Math.min(agent.tasks_completed / 100, 1);

        // Prefer planned agent if specified
        if (task.planned_agent === agent.name) {
            score += 5;
        }

        return score;
    }

    /**
     * Invoke an agent
     */
    async invokeAgent(agent, task, execution) {
        // Prepare context with results from dependencies
        const dependencyResults = {};
        for (const depId of task.dependencies) {
            dependencyResults[depId] = execution.results[depId];
        }

        // Build the request
        const request = {
            task_id: task.task_id,
            description: task.description,
            type: task.type,
            dependencies: dependencyResults,
            context: execution.context
        };

        // Call the agent
        const agentInstance = agent.agent;

        // Check if agent has execute method
        if (typeof agentInstance.execute === 'function') {
            return await agentInstance.execute(task.type, request);
        }

        // Try specific method based on type
        const methodMap = {
            'cost_analysis': 'analyze',
            'reconciliation': 'reconcile',
            'optimization': 'optimize',
            'forecasting': 'forecast',
            'compliance': 'checkCompliance',
            'chargeback': 'allocateCosts',
            'reporting': 'generateReport',
            'budget': 'checkBudget'
        };

        const method = methodMap[task.type];
        if (method && typeof agentInstance[method] === 'function') {
            return await agentInstance[method](request);
        }

        // Fallback to chat if available
        if (typeof agentInstance.chat === 'function') {
            return await agentInstance.chat(task.description);
        }

        throw new Error(`Agent ${agent.name} cannot handle task type ${task.type}`);
    }

    /**
     * Update agent statistics
     */
    updateAgentStats(agent, task, success) {
        const duration = Date.now() - task.started_at;

        // Update average latency
        agent.avg_latency = safeRunningAverage(agent.avg_latency, agent.tasks_completed, duration);

        agent.tasks_completed++;

        // Update error rate
        agent.error_rate = safeErrorRate(agent.error_rate, agent.tasks_completed - 1, !success);
    }

    /**
     * Checkpoint execution state
     */
    async checkpoint(execution, completedTask) {
        const checkpoint = {
            timestamp: Date.now(),
            task_id: completedTask.task_id,
            tasks_completed: execution.tasks.filter(t => t.status === 'completed').length,
            tasks_total: execution.tasks.length,
            results_snapshot: { ...execution.results }
        };

        execution.checkpoints.push(checkpoint);

        // Store to database for recovery
        await resilientSupabase.from('orchestration_checkpoints').insert({
            execution_id: execution.execution_id,
            checkpoint_number: execution.checkpoints.length,
            state: checkpoint
        });
    }

    /**
     * Recover from checkpoint
     */
    async recoverFromCheckpoint(executionId) {
        const { data } = await resilientSupabase
            .from('orchestration_checkpoints')
            .select('*')
            .eq('execution_id', executionId)
            .order('checkpoint_number', { ascending: false })
            .limit(1);

        if (!data?.length) {
            throw new Error('No checkpoint found');
        }

        return data[0].state;
    }

    /**
     * Aggregate results from all tasks
     */
    async aggregateResults(request, taskResults, context) {
        // If only one result, return it directly
        const results = Object.values(taskResults);
        if (results.length === 1) {
            return results[0];
        }

        // Use LLM to synthesize results
        const response = await resilientAnthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: `You are a result aggregator for Finault.
Synthesize the results from multiple agents into a coherent response.
Be concise but comprehensive. Include key findings from each task.`,
            messages: [{
                role: 'user',
                content: `Original request: ${request}

Task results:
${Object.entries(taskResults).map(([id, result]) =>
    `Task ${id}:\n${JSON.stringify(result, null, 2)}`
).join('\n\n')}

Synthesize these results into a comprehensive response.`
            }]
        });

        return {
            synthesized: true,
            summary: safeExtractText(response),
            task_count: results.length,
            individual_results: taskResults
        };
    }

    /**
     * Store execution record
     */
    async storeExecution(execution) {
        await resilientSupabase.from('orchestrations').insert({
            execution_id: execution.execution_id,
            request: execution.request,
            status: execution.status,
            complexity: execution.plan?.complexity,
            task_count: execution.tasks.length,
            duration_ms: execution.duration_ms,
            error: execution.error,
            created_at: new Date(execution.started_at).toISOString(),
            completed_at: execution.completed_at
                ? new Date(execution.completed_at).toISOString()
                : null
        });
    }

    /**
     * Get orchestration status
     */
    async getStatus() {
        const { data: recent } = await resilientSupabase
            .from('orchestrations')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        return {
            agents: Array.from(this.agents.entries()).map(([name, info]) => ({
                name,
                capabilities: info.capabilities,
                busy: info.busy,
                tasks_completed: info.tasks_completed,
                avg_latency: Math.round(info.avg_latency),
                error_rate: (info.error_rate * 100).toFixed(1) + '%'
            })),
            active_executions: Array.from(this.executions.entries())
                .filter(([_, e]) => e.status !== 'completed' && e.status !== 'failed')
                .map(([id, e]) => ({
                    execution_id: id,
                    status: e.status,
                    tasks_completed: e.tasks.filter(t => t.status === 'completed').length,
                    tasks_total: e.tasks.length
                })),
            running_tasks: Array.from(this.runningTasks.values()).map(t => ({
                task_id: t.task_id.substring(0, 8),
                description: t.description.substring(0, 50),
                agent: t.assigned_agent,
                duration_ms: Date.now() - t.started_at
            })),
            recent_orchestrations: recent
        };
    }
}

export default AgentOrchestrator;
