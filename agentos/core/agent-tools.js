/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT AGENT TOOLS SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Diamond Tier: Unified Tool Execution for All Agents
 *
 * Provides:
 * - Tool definitions for Claude tool_use
 * - Unified tool execution
 * - Automatic tool result handling
 * - Tool use loop management
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, executeTool } from '../tools/finault-tools.js';
import { createAnthropicResilience } from './resilience-layer.js';

const anthropic = new Anthropic();
const resilientAnthropic = createAnthropicResilience(anthropic);

/**
 * AgentToolkit class - provides tool execution capabilities
 */
export class AgentToolkit {
    constructor(agentId, organizationId, userId = null) {
        this.agentId = agentId;
        this.organizationId = organizationId;
        this.userId = userId;
    }

    /**
     * Get all available tool definitions
     */
    getToolDefinitions() {
        return TOOL_DEFINITIONS;
    }

    /**
     * Execute a single tool
     */
    async execute(toolName, params) {
        console.log(`[AgentToolkit:${this.agentId}] Executing tool: ${toolName}`);
        return await executeTool(toolName, this.organizationId, this.userId, params);
    }

    /**
     * Run a Claude request with tool support
     * Handles the full tool use loop automatically
     */
    async runWithTools(options) {
        const {
            model = 'claude-sonnet-4-20250514',
            maxTokens = 4096,
            system,
            messages,
            tools = this.getToolDefinitions(),
            maxToolRounds = 10
        } = options;

        let messageHistory = [...messages];
        let rounds = 0;

        // Initial request
        let response = await resilientAnthropic.messages.create({
            model,
            max_tokens: maxTokens,
            system,
            tools,
            messages: messageHistory
        });

        // Handle tool use loop
        while (response.stop_reason === 'tool_use' && rounds < maxToolRounds) {
            rounds++;
            console.log(`[AgentToolkit:${this.agentId}] Tool use round ${rounds}`);

            const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
            const toolResults = [];

            // Execute all tools
            for (const toolUse of toolUseBlocks) {
                console.log(`[AgentToolkit:${this.agentId}] Executing: ${toolUse.name}`);
                const result = await this.execute(toolUse.name, toolUse.input);
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: JSON.stringify(result)
                });
            }

            // Add assistant response and tool results to history
            messageHistory.push({
                role: 'assistant',
                content: response.content
            });
            messageHistory.push({
                role: 'user',
                content: toolResults
            });

            // Continue with tool results
            response = await resilientAnthropic.messages.create({
                model,
                max_tokens: maxTokens,
                system,
                tools,
                messages: messageHistory
            });
        }

        // Extract final text response
        const textContent = response.content.find(block => block.type === 'text');
        return {
            text: textContent?.text || '',
            fullResponse: response,
            toolRounds: rounds
        };
    }
}

/**
 * Create an AgentToolkit instance
 */
export function createToolkit(agentId, organizationId, userId = null) {
    return new AgentToolkit(agentId, organizationId, userId);
}

/**
 * Tool execution mixin for adding tool capabilities to existing agent classes
 */
export function withTools(BaseClass) {
    return class extends BaseClass {
        constructor(...args) {
            super(...args);
            this._toolkit = null;
        }

        /**
         * Initialize tools for this agent
         */
        initTools(agentId, organizationId, userId = null) {
            this._toolkit = new AgentToolkit(agentId, organizationId, userId);
            return this._toolkit;
        }

        /**
         * Get the toolkit instance
         */
        get toolkit() {
            return this._toolkit;
        }

        /**
         * Execute a tool
         */
        async useTool(toolName, params) {
            if (!this._toolkit) {
                throw new Error('Toolkit not initialized. Call initTools() first.');
            }
            return this._toolkit.execute(toolName, params);
        }

        /**
         * Run a request with automatic tool handling
         */
        async runWithTools(options) {
            if (!this._toolkit) {
                throw new Error('Toolkit not initialized. Call initTools() first.');
            }
            return this._toolkit.runWithTools(options);
        }

        /**
         * Get available tool definitions
         */
        getAvailableTools() {
            return TOOL_DEFINITIONS;
        }
    };
}

export { TOOL_DEFINITIONS };
export default AgentToolkit;
