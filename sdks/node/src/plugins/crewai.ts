/**
 * Finault CrewAI Plugin
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CrewAI tool wrapper that intercepts all tool calls and agent executions,
 * routing them through Finault verification. Provides cost tracking and
 * attestation for multi-agent workflows.
 *
 * Usage:
 * ```typescript
 * import { FinaultCrewAITool } from '@finault/sdk/plugins/crewai';
 * import { Finault } from '@finault/sdk';
 *
 * const finault = new Finault({ apiKey: 'fk_...' });
 * const tool = new FinaultCrewAITool(finault);
 *
 * // Wrap existing tools
 * agent.tools = agent.tools.map(t => tool.wrap(t));
 * ```
 */

export interface ToolExecutionContext {
  tool_id: string;
  tool_name: string;
  agent_id?: string;
  agent_name?: string;
  task_id?: string;
  input: Record<string, any>;
  timestamp: string;
}

export interface ToolExecutionResult {
  tool_id: string;
  output: any;
  tokens_estimated: number;
  cost_usd: number;
  duration_ms: number;
}

export interface AgentExecutionContext {
  agent_id: string;
  agent_name: string;
  task_id?: string;
  task_description?: string;
  tools_used: string[];
  total_cost: number;
  total_tokens: number;
}

export interface FinaultCrewAIConfig {
  finaultClient: any;
  enableCostTracking?: boolean;
  enableAttestation?: boolean;
  aggregateByAgent?: boolean;
  debug?: boolean;
}

/**
 * Finault CrewAI Tool Wrapper
 */
export class FinaultCrewAITool {
  private finaultClient: any;
  private enableCostTracking: boolean;
  private enableAttestation: boolean;
  private aggregateByAgent: boolean;
  private debug: boolean;
  private executionMetrics: Map<string, ToolExecutionResult[]> = new Map();
  private agentMetrics: Map<string, AgentExecutionContext> = new Map();

  constructor(config: FinaultCrewAIConfig) {
    this.finaultClient = config.finaultClient;
    this.enableCostTracking = config.enableCostTracking !== false;
    this.enableAttestation = config.enableAttestation !== false;
    this.aggregateByAgent = config.aggregateByAgent !== false;
    this.debug = config.debug || false;
  }

  /**
   * Wrap a CrewAI tool to intercept execution
   */
  wrap(tool: any): any {
    const originalExecute = tool.execute?.bind(tool) || tool._execute?.bind(tool);

    if (!originalExecute) {
      console.warn('[FinaultCrewAI] Tool has no execute method:', tool.name);
      return tool;
    }

    const self = this;
    const wrappedExecute = async function (input: any, ...args: any[]) {
      return self.executeWithFinault(
        tool,
        input,
        originalExecute,
        args
      );
    };

    // Replace the execute method
    tool.execute = wrappedExecute;
    if (tool._execute) {
      tool._execute = wrappedExecute;
    }

    return tool;
  }

  /**
   * Execute tool with Finault verification
   */
  private async executeWithFinault(
    tool: any,
    input: any,
    originalExecute: Function,
    args: any[]
  ): Promise<any> {
    const startTime = Date.now();
    const toolId = tool.name || 'unknown-tool';

    try {
      if (this.debug) {
        console.log('[FinaultCrewAI] Tool Start:', {
          tool_id: toolId,
          input_keys: Object.keys(input || {})
        });
      }

      // Execute the original tool
      const result = await originalExecute(input, ...args);

      const endTime = Date.now();
      const durationMs = endTime - startTime;

      // Estimate tokens and cost
      const inputTokens = this.estimateTokens(JSON.stringify(input));
      const outputTokens = this.estimateTokens(JSON.stringify(result));
      const totalTokens = inputTokens + outputTokens;

      // Calculate cost (using rough estimates)
      const costUsd = (totalTokens / 1000) * 0.002; // Rough average

      const execution: ToolExecutionResult = {
        tool_id: toolId,
        output: result,
        tokens_estimated: totalTokens,
        cost_usd: costUsd,
        duration_ms: durationMs
      };

      // Store metrics
      if (!this.executionMetrics.has(toolId)) {
        this.executionMetrics.set(toolId, []);
      }
      this.executionMetrics.get(toolId)!.push(execution);

      if (this.debug) {
        console.log('[FinaultCrewAI] Tool End:', {
          tool_id: toolId,
          tokens: totalTokens,
          cost: costUsd,
          duration_ms: durationMs
        });
      }

      // Call Finault verification
      if (this.enableAttestation) {
        const verifyResult = await this.finaultClient.verify?.({
          model: `crewai-tool:${toolId}`,
          provider: 'internal',
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          latency_ms: durationMs,
          metadata: {
            tool_name: toolId,
            tool_category: 'crewai_tool'
          }
        });

        if (verifyResult?.success) {
          execution.cost_usd = verifyResult.cost?.total || costUsd;

          if (this.debug) {
            console.log('[FinaultCrewAI] Attestation Created:', {
              tool_id: toolId,
              verification_id: verifyResult.verification_id
            });
          }
        }
      }

      return result;
    } catch (error) {
      if (this.debug) {
        console.error('[FinaultCrewAI] Tool Error:', {
          tool_id: toolId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      throw error;
    }
  }

  /**
   * Track agent execution
   */
  trackAgentExecution(agentContext: AgentExecutionContext): void {
    this.agentMetrics.set(agentContext.agent_id, agentContext);

    if (this.debug) {
      console.log('[FinaultCrewAI] Agent Execution Tracked:', {
        agent_id: agentContext.agent_id,
        agent_name: agentContext.agent_name,
        tools_used: agentContext.tools_used.length,
        total_cost: agentContext.total_cost,
        total_tokens: agentContext.total_tokens
      });
    }
  }

  /**
   * Get tool metrics
   */
  getToolMetrics(toolId: string): ToolExecutionResult[] | undefined {
    return this.executionMetrics.get(toolId);
  }

  /**
   * Get all tool metrics
   */
  getAllToolMetrics(): Record<string, ToolExecutionResult[]> {
    const result: Record<string, ToolExecutionResult[]> = {};
    this.executionMetrics.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Get agent metrics
   */
  getAgentMetrics(agentId: string): AgentExecutionContext | undefined {
    return this.agentMetrics.get(agentId);
  }

  /**
   * Get all agent metrics
   */
  getAllAgentMetrics(): Record<string, AgentExecutionContext> {
    const result: Record<string, AgentExecutionContext> = {};
    this.agentMetrics.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Generate cost report
   */
  generateCostReport(): {
    total_cost: number;
    total_tokens: number;
    tools_invoked: number;
    average_cost_per_tool: number;
    tools: Record<string, { executions: number; total_cost: number }>;
  } {
    let totalCost = 0;
    let totalTokens = 0;
    const toolStats: Record<string, { executions: number; total_cost: number }> = {};

    this.executionMetrics.forEach((executions, toolId) => {
      const toolTotal = executions.reduce((sum, e) => sum + e.cost_usd, 0);
      const toolTokens = executions.reduce((sum, e) => sum + e.tokens_estimated, 0);

      totalCost += toolTotal;
      totalTokens += toolTokens;

      toolStats[toolId] = {
        executions: executions.length,
        total_cost: toolTotal
      };
    });

    return {
      total_cost: totalCost,
      total_tokens: totalTokens,
      tools_invoked: this.executionMetrics.size,
      average_cost_per_tool: this.executionMetrics.size > 0 ? totalCost / this.executionMetrics.size : 0,
      tools: toolStats
    };
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.executionMetrics.clear();
    this.agentMetrics.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Estimate tokens from text
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * CrewAI Agent Instrumentation
 * Higher-level wrapper for tracking entire agent executions
 */
export class FinaultCrewAIAgent {
  private toolWrapper: FinaultCrewAITool;
  private agentId: string;
  private agentName: string;

  constructor(
    finaultClient: any,
    agentId: string,
    agentName: string,
    config?: Partial<FinaultCrewAIConfig>
  ) {
    this.toolWrapper = new FinaultCrewAITool({
      finaultClient,
      ...config
    });
    this.agentId = agentId;
    this.agentName = agentName;
  }

  /**
   * Wrap all agent tools
   */
  wrapTools(tools: any[]): any[] {
    return tools.map(tool => this.toolWrapper.wrap(tool));
  }

  /**
   * Record agent execution completion
   */
  recordExecution(context: Omit<AgentExecutionContext, 'agent_id' | 'agent_name'>): void {
    this.toolWrapper.trackAgentExecution({
      ...context,
      agent_id: this.agentId,
      agent_name: this.agentName
    });
  }

  /**
   * Get tool wrapper for direct access
   */
  getToolWrapper(): FinaultCrewAITool {
    return this.toolWrapper;
  }

  /**
   * Get execution summary
   */
  getExecutionSummary() {
    return {
      agent_id: this.agentId,
      agent_name: this.agentName,
      metrics: this.toolWrapper.generateCostReport()
    };
  }
}

/**
 * Factory function
 */
export function createFinaultCrewAITool(
  finaultClient: any,
  config?: Partial<FinaultCrewAIConfig>
): FinaultCrewAITool {
  return new FinaultCrewAITool({
    finaultClient,
    ...config
  });
}

export default FinaultCrewAITool;
