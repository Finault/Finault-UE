/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT AGENT MEMORY SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Diamond Tier: Persistent Memory for All Agents
 *
 * Provides:
 * - Long-term memory storage in Supabase
 * - Memory retrieval with relevance scoring
 * - Automatic memory consolidation
 * - Cross-agent memory sharing (with permissions)
 * - Memory decay for old/irrelevant memories
 *
 * Memory Types:
 * - insight: Analytical discoveries about costs, patterns, etc.
 * - pattern: Recurring behaviors or trends detected
 * - preference: User/org preferences and settings
 * - outcome: Results of past actions (for learning)
 * - context: Situational context for better responses
 * - fact: Factual information about the organization
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { createSupabaseResilience } from './resilience-layer.js';
import { createMemoryTiering, MEMORY_TIERS } from './memory-tiering.js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resilientSupabase = createSupabaseResilience(supabase);

/**
 * Memory importance levels
 */
export const IMPORTANCE = {
    CRITICAL: 1.0,    // Never forget
    HIGH: 0.8,        // Important insights
    MEDIUM: 0.5,      // Useful context
    LOW: 0.3,         // Nice to have
    EPHEMERAL: 0.1    // Short-term only
};

/**
 * Memory types
 */
export const MEMORY_TYPES = {
    INSIGHT: 'insight',
    PATTERN: 'pattern',
    PREFERENCE: 'preference',
    OUTCOME: 'outcome',
    CONTEXT: 'context',
    FACT: 'fact',
    FEEDBACK: 'feedback',
    DECISION: 'decision'
};

/**
 * AgentMemory class - provides persistent memory for any agent
 */
export class AgentMemory {
    /**
     * Create a new AgentMemory instance
     * @param {string} agentId - Unique identifier for this agent
     * @param {string} orgId - Organization ID
     * @param {string} userId - Optional user ID for user-specific memories
     */
    constructor(agentId, orgId, userId = null) {
        this.agentId = agentId;
        this.orgId = orgId;
        this.userId = userId;
        this.memories = [];
        this.loaded = false;
        // W-007: Memory tiering for tier-aware decay
        this.tiering = createMemoryTiering();
    }

    /**
     * Load memories from database
     * @param {Object} options - Loading options
     * @returns {Promise<Array>} Loaded memories
     */
    async load(options = {}) {
        const {
            limit = 50,
            memoryTypes = null,
            minImportance = 0.1,
            maxAge = null // in days
        } = options;

        let query = resilientSupabase
            .from('agent_memory')
            .select('*')
            .eq('agent_id', this.agentId)
            .eq('org_id', this.orgId)
            .gte('importance', minImportance)
            .order('importance', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(limit);

        if (this.userId) {
            query = query.or(`user_id.eq.${this.userId},user_id.is.null`);
        }

        if (memoryTypes && memoryTypes.length > 0) {
            query = query.in('memory_type', memoryTypes);
        }

        if (maxAge) {
            const cutoff = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000).toISOString();
            query = query.gte('created_at', cutoff);
        }

        const { data, error } = await query;

        if (error) {
            console.error(`[AgentMemory:${this.agentId}] Error loading memories:`, error);
            return [];
        }

        this.memories = data || [];
        this.loaded = true;

        console.log(`[AgentMemory:${this.agentId}] Loaded ${this.memories.length} memories`);
        return this.memories;
    }

    /**
     * Store a new memory
     * @param {Object} memory - Memory to store
     * @returns {Promise<Object>} Stored memory
     */
    async store(memory) {
        const {
            content,
            memoryType = MEMORY_TYPES.CONTEXT,
            importance = IMPORTANCE.MEDIUM,
            context = {},
            tags = [],
            expiresAt = null
        } = memory;

        if (!content) {
            throw new Error('Memory content is required');
        }

        // W-007: Classify memory tier on insert
        const memory_tier = this.tiering.classifyTier({ importance, memory_type: memoryType });

        const memoryRecord = {
            agent_id: this.agentId,
            org_id: this.orgId,
            user_id: this.userId,
            memory_type: memoryType,
            content: content,
            importance: importance,
            context: context,
            tags: tags,
            expires_at: expiresAt,
            created_at: new Date().toISOString(),
            memory_tier,
            last_decay_date: new Date().toISOString()
        };

        const { data, error } = await resilientSupabase
            .from('agent_memory')
            .insert(memoryRecord)
            .select()
            .single();

        if (error) {
            console.error(`[AgentMemory:${this.agentId}] Error storing memory:`, error);
            throw error;
        }

        // Add to local cache
        this.memories.unshift(data);

        console.log(`[AgentMemory:${this.agentId}] Stored memory: ${memoryType} (importance: ${importance})`);
        return data;
    }

    /**
     * Store an insight (discovery about costs/patterns)
     */
    async storeInsight(content, importance = IMPORTANCE.HIGH, context = {}) {
        return this.store({
            content,
            memoryType: MEMORY_TYPES.INSIGHT,
            importance,
            context
        });
    }

    /**
     * Store a pattern (recurring behavior detected)
     */
    async storePattern(content, importance = IMPORTANCE.HIGH, context = {}) {
        return this.store({
            content,
            memoryType: MEMORY_TYPES.PATTERN,
            importance,
            context
        });
    }

    /**
     * Store a preference (user/org settings)
     */
    async storePreference(content, importance = IMPORTANCE.MEDIUM, context = {}) {
        return this.store({
            content,
            memoryType: MEMORY_TYPES.PREFERENCE,
            importance,
            context
        });
    }

    /**
     * Store an outcome (result of an action for learning)
     */
    async storeOutcome(content, importance = IMPORTANCE.HIGH, context = {}) {
        return this.store({
            content,
            memoryType: MEMORY_TYPES.OUTCOME,
            importance,
            context
        });
    }

    /**
     * Store a decision (record of choices made)
     */
    async storeDecision(content, importance = IMPORTANCE.MEDIUM, context = {}) {
        return this.store({
            content,
            memoryType: MEMORY_TYPES.DECISION,
            importance,
            context
        });
    }

    /**
     * Recall memories by query
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Matching memories
     */
    async recall(query, options = {}) {
        const { limit = 10, memoryTypes = null } = options;

        // Simple keyword matching for now
        // TODO: Implement semantic search with embeddings
        const keywords = query.toLowerCase().split(/\s+/);

        let filtered = this.memories;

        if (memoryTypes) {
            filtered = filtered.filter(m => memoryTypes.includes(m.memory_type));
        }

        // Score by keyword matches and importance
        const scored = filtered.map(m => {
            const content = m.content.toLowerCase();
            const matchScore = keywords.filter(k => content.includes(k)).length / keywords.length;
            const totalScore = matchScore * 0.6 + m.importance * 0.4;
            return { ...m, score: totalScore };
        });

        // Sort by score and return top results
        const results = scored
            .filter(m => m.score > 0.1)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        // W-007: Reinforce recalled memories (boost importance on access)
        // Pass 21 fixes: update last_decay_date, track daily reinforcement count
        const today = new Date().toISOString().split('T')[0];
        for (const memory of results) {
            try {
                // Track daily reinforcement count for maxReinforcementPerDay cap
                if (!memory._reinforcementCountToday) {
                    const lastReinforceDay = memory.last_reinforcement_date
                        ? new Date(memory.last_reinforcement_date).toISOString().split('T')[0]
                        : null;
                    memory._reinforcementCountToday = (lastReinforceDay === today)
                        ? (memory.reinforcement_count_today || 0)
                        : 0;
                }

                const newImportance = this.tiering.reinforceOnRecall(memory);
                if (newImportance !== memory.importance) {
                    const nowISO = new Date().toISOString();
                    memory._reinforcementCountToday = (memory._reinforcementCountToday || 0) + 1;
                    await resilientSupabase
                        .from('agent_memory')
                        .update({
                            importance: newImportance,
                            last_decay_date: nowISO,
                            last_reinforcement_date: nowISO,
                            reinforcement_count_today: memory._reinforcementCountToday
                        })
                        .eq('id', memory.id);
                    memory.importance = newImportance;
                    memory.last_decay_date = nowISO;
                }
            } catch (reinforceErr) {
                console.error(`[AgentMemory:${this.agentId}] Reinforcement failed:`, reinforceErr.message);
            }
        }

        return results;
    }

    /**
     * Build context string from memories for LLM prompt
     * @param {Object} options - Context building options
     * @returns {string} Formatted memory context
     */
    buildContext(options = {}) {
        const { maxMemories = 15, memoryTypes = null } = options;

        let filtered = this.memories;

        if (memoryTypes) {
            filtered = filtered.filter(m => memoryTypes.includes(m.memory_type));
        }

        const topMemories = filtered.slice(0, maxMemories);

        if (topMemories.length === 0) {
            return 'No relevant memories stored yet.';
        }

        // Group by type
        const grouped = {};
        topMemories.forEach(m => {
            if (!grouped[m.memory_type]) {
                grouped[m.memory_type] = [];
            }
            grouped[m.memory_type].push(m.content);
        });

        // Format for LLM
        let context = '';
        const typeLabels = {
            insight: '💡 Key Insights',
            pattern: '📊 Patterns Detected',
            preference: '⚙️ Preferences',
            outcome: '✅ Past Outcomes',
            context: '📝 Context',
            fact: '📌 Facts',
            feedback: '💬 Feedback Received',
            decision: '🎯 Past Decisions'
        };

        for (const [type, memories] of Object.entries(grouped)) {
            const label = typeLabels[type] || type;
            context += `\n${label}:\n`;
            memories.forEach(m => {
                context += `  • ${m}\n`;
            });
        }

        return context.trim();
    }

    /**
     * Forget a specific memory
     * @param {string} memoryId - ID of memory to forget
     */
    async forget(memoryId) {
        const { error } = await resilientSupabase
            .from('agent_memory')
            .delete()
            .eq('id', memoryId)
            .eq('agent_id', this.agentId);

        if (error) {
            console.error(`[AgentMemory:${this.agentId}] Error forgetting memory:`, error);
            throw error;
        }

        this.memories = this.memories.filter(m => m.id !== memoryId);
    }

    /**
     * Decay old memories (reduce importance over time)
     * Should be called periodically (e.g., daily)
     */
    async decayMemories() {
        // W-007: Tier-aware decay replaces flat 0.98 rate.
        // WORKING: 5%/day, EPISODIC: 0.5%/day, CRYSTALLIZED: no decay.
        const { data: memories } = await resilientSupabase
            .from('agent_memory')
            .select('id, importance, memory_type, memory_tier, created_at, last_decay_date, validation_count')
            .eq('agent_id', this.agentId)
            .eq('org_id', this.orgId);

        if (!memories || memories.length === 0) return;

        const updates = [];
        const deletes = [];

        for (const mem of memories) {
            // Classify tier (use stored tier or compute from current state)
            const tier = mem.memory_tier || this.tiering.classifyTier(mem);

            // Crystallized memories never decay
            if (tier === 'crystallized') {
                // Still update tier field if not set
                if (!mem.memory_tier) {
                    updates.push({ id: mem.id, memory_tier: tier });
                }
                continue;
            }

            // Pass 22: Check graduation BEFORE decay (use original importance).
            // A memory at importance=0.8 should graduate before decay drops it to 0.796.
            if (tier === 'episodic') {
                const validationCount = mem.validation_count || 0;
                if (this.tiering.checkGraduation(mem, validationCount)) {
                    updates.push({
                        id: mem.id,
                        importance: mem.importance, // Keep original importance for graduated memory
                        memory_tier: 'crystallized',
                        last_decay_date: new Date().toISOString()
                    });
                    continue; // Skip decay and deletion — graduated to permanent
                }
            }

            // Compute tier-specific decay (only for non-graduating memories)
            const newImportance = this.tiering.computeDecay(mem, tier);

            // Check deletion criteria
            if (this.tiering.shouldDelete({ ...mem, importance: newImportance }, tier)) {
                deletes.push(mem.id);
            } else if (newImportance !== mem.importance || !mem.memory_tier) {
                updates.push({
                    id: mem.id,
                    importance: newImportance,
                    memory_tier: tier,
                    last_decay_date: new Date().toISOString()
                });
            }
        }

        // Batch updates
        for (const update of updates) {
            const { id, ...fields } = update;
            await resilientSupabase
                .from('agent_memory')
                .update(fields)
                .eq('id', id);
        }

        // Batch deletes
        for (const delId of deletes) {
            await resilientSupabase
                .from('agent_memory')
                .delete()
                .eq('id', delId);
        }
    }

    /**
     * Get the 'remember' tool definition for Claude
     * @returns {Object} Tool definition
     */
    static getRememberToolDefinition() {
        return {
            name: 'remember',
            description: 'Store important information in long-term memory for future reference. Use this to remember insights, patterns, preferences, outcomes, and key facts.',
            input_schema: {
                type: 'object',
                properties: {
                    content: {
                        type: 'string',
                        description: 'The information to remember'
                    },
                    memory_type: {
                        type: 'string',
                        enum: Object.values(MEMORY_TYPES),
                        description: 'Type of memory: insight (discovery), pattern (recurring behavior), preference (user setting), outcome (action result), context, fact, feedback, decision'
                    },
                    importance: {
                        type: 'number',
                        description: 'How important is this? 0.1 (ephemeral) to 1.0 (critical/never forget)',
                        minimum: 0.1,
                        maximum: 1.0,
                        default: 0.5
                    }
                },
                required: ['content', 'memory_type']
            }
        };
    }

    /**
     * Get the 'recall' tool definition for Claude
     * @returns {Object} Tool definition
     */
    static getRecallToolDefinition() {
        return {
            name: 'recall',
            description: 'Search your memories for relevant past information. Use this to recall insights, patterns, or context from previous interactions.',
            input_schema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'What to search for in memories'
                    },
                    memory_types: {
                        type: 'array',
                        items: { type: 'string', enum: Object.values(MEMORY_TYPES) },
                        description: 'Optional: filter by memory types'
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of memories to return',
                        default: 5
                    }
                },
                required: ['query']
            }
        };
    }
}

/**
 * Create an AgentMemory instance
 * Factory function for easy instantiation
 */
export function createAgentMemory(agentId, orgId, userId = null) {
    return new AgentMemory(agentId, orgId, userId);
}

/**
 * Memory mixin for adding memory capabilities to existing agent classes
 * @param {Class} BaseClass - The agent class to extend
 * @returns {Class} Extended class with memory capabilities
 */
export function withMemory(BaseClass) {
    return class extends BaseClass {
        constructor(...args) {
            super(...args);
            this._memory = null;
        }

        /**
         * Initialize memory for this agent
         * @param {string} agentId - Agent identifier
         * @param {string} orgId - Organization ID
         * @param {string} userId - Optional user ID
         */
        async initMemory(agentId, orgId, userId = null) {
            this._memory = new AgentMemory(agentId, orgId, userId);
            await this._memory.load();
            return this._memory;
        }

        /**
         * Get the memory instance
         */
        get memory() {
            return this._memory;
        }

        /**
         * Store a memory
         */
        async remember(content, memoryType, importance = IMPORTANCE.MEDIUM) {
            if (!this._memory) {
                throw new Error('Memory not initialized. Call initMemory() first.');
            }
            return this._memory.store({ content, memoryType, importance });
        }

        /**
         * Recall memories
         */
        async recall(query, options = {}) {
            if (!this._memory) {
                throw new Error('Memory not initialized. Call initMemory() first.');
            }
            return this._memory.recall(query, options);
        }

        /**
         * Get memory context for prompts
         */
        getMemoryContext(options = {}) {
            if (!this._memory) {
                return 'No memories loaded.';
            }
            return this._memory.buildContext(options);
        }

        /**
         * Get memory-related tools for Claude
         */
        getMemoryTools() {
            return [
                AgentMemory.getRememberToolDefinition(),
                AgentMemory.getRecallToolDefinition()
            ];
        }
    };
}

export default AgentMemory;
