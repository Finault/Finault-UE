/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AGENT EVENT BUS — Inter-Agent Coordination Layer
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fix W-006: No Inter-Agent Communication or Coordination
 *
 * THE PROBLEM:
 *   All 13 agents operate in complete isolation. They read/write shared Supabase
 *   tables with zero awareness of each other's actions. This causes:
 *
 *   1. Model routing oscillation — autopilot, optimization-agent, and
 *      budget-enforcer all write model_routing_rules independently, creating
 *      infinite downgrade/upgrade cycles
 *   2. Rate limit conflicts — autopilot and budget-enforcer write rate_limits
 *      with contradictory values
 *   3. TOCTOU races — concurrent cron cycles both see < max_daily_changes,
 *      both proceed, exceeding the limit
 *   4. Stale data decisions — optimization-agent uses 30-day historical data,
 *      missing budget-enforcer's real-time throttle from 200ms ago
 *
 * THE SOLUTION:
 *   An Agent Event Bus with conflict resolution that gates write actions
 *   through a coordination protocol:
 *
 *   1. AgentEventBus — In-memory pub/sub ring buffer. Agents publish intent
 *      BEFORE writing. Subscribers react to events.
 *   2. ConflictResolver — Detects oscillation (same table toggled N times in
 *      M seconds), contradiction (two agents writing opposite values), and
 *      duplicates (same action repeated within dedup window). Resolves via
 *      priority hierarchy: governance > budget > autopilot > policy > optimization.
 *   3. EventStore — Async persistence to Supabase for audit trail. Batched
 *      writes, never blocks the coordination fast path.
 *
 *   All coordination completes within a 2-second window, safe for Cloudflare
 *   Workers' 25-second execution budget.
 *
 * Usage:
 *   import { getEventBus } from '../core/agent-event-bus.js';
 *
 *   const eventBus = getEventBus(resilientSupabase);
 *   const result = await eventBus.requestCoordination({
 *       agent: 'autopilot',
 *       action: 'minor_model_switch',
 *       target_table: 'model_routing_rules',
 *       proposed_value: { from_model: 'gpt-4', to_model: 'gpt-4-turbo' }
 *   });
 *   if (!result.allowed) return { success: false, reason: result.reason };
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_BUS_CONFIG = {
    coordinationWindowMs: 2000,    // 2s — Cloudflare Workers safe
    maxEventAge: 300000,           // 5min ring buffer retention
    oscillationThreshold: 3,       // 3 same-table writes in window = oscillation
    oscillationWindowMs: 60000,    // 1min oscillation detection window
    deduplicationWindowMs: 5000,   // 5s dedup window
    priorityMap: {
        'governance-agent': 100,
        'budget-enforcer': 80,
        'autopilot': 60,
        'policy-agent': 50,
        'optimization-agent': 40,
        'cost-intelligence': 30,
        'chargeback-agent': 30,
        'forecasting-agent': 20,
        'invoice-reconciliation': 20,
        'close-pack-generator': 20,
        'compound-learning': 20,
        'finault-pal': 10,
        'magic-onboarding': 10
    }
};


// ─────────────────────────────────────────────────────────────────────────────
// ConflictResolver — Detect oscillation, contradiction, and duplicates
// ─────────────────────────────────────────────────────────────────────────────

class ConflictResolver {
    /**
     * @param {Object} config
     * @param {number} config.oscillationThreshold - Number of writes to same table before triggering oscillation
     * @param {number} config.oscillationWindowMs - Time window for oscillation detection
     * @param {number} config.deduplicationWindowMs - Time window for duplicate detection
     * @param {Object} config.priorityMap - Agent name → priority number (higher wins)
     */
    constructor(config = {}) {
        this.oscillationThreshold = config.oscillationThreshold ?? EVENT_BUS_CONFIG.oscillationThreshold;
        this.oscillationWindowMs = config.oscillationWindowMs ?? EVENT_BUS_CONFIG.oscillationWindowMs;
        this.deduplicationWindowMs = config.deduplicationWindowMs ?? EVENT_BUS_CONFIG.deduplicationWindowMs;
        this.priorityMap = config.priorityMap ?? EVENT_BUS_CONFIG.priorityMap;
    }

    /**
     * Run all conflict detectors against an intent and recent events.
     *
     * @param {Object} intent - The proposed action
     * @param {Array} recentEvents - Events from the ring buffer
     * @returns {Object} { hasConflict, conflicts, resolution, reason, winner }
     */
    checkConflicts(intent, recentEvents) {
        const conflicts = [];
        let worstResolution = 'allow';

        // 1. Check for duplicate actions (same agent repeating itself)
        const dupResult = this.detectDuplicateAction(intent, recentEvents);
        if (dupResult.detected) {
            conflicts.push({
                type: 'duplicate',
                reason: dupResult.reason,
                conflicting_event: dupResult.conflictingEvent
            });
            worstResolution = 'block';
        }

        // 2. Check for oscillation (table toggled too many times)
        const oscResult = this.detectOscillation(intent, recentEvents);
        if (oscResult.detected) {
            conflicts.push({
                type: 'oscillation',
                reason: oscResult.reason,
                count: oscResult.count,
                winner: oscResult.winner
            });
            worstResolution = 'block';
        }

        // 3. Check for contradiction (two agents writing opposite values)
        const contraResult = this.detectContradiction(intent, recentEvents);
        if (contraResult.detected) {
            conflicts.push({
                type: 'contradiction',
                reason: contraResult.reason,
                conflicting_agent: contraResult.conflictingAgent,
                winner: contraResult.winner
            });
            // Only block if the intent's agent is the loser
            if (contraResult.winner !== intent.agent) {
                worstResolution = 'block';
            }
        }

        return {
            hasConflict: conflicts.length > 0,
            conflicts,
            resolution: worstResolution,
            reason: conflicts.length > 0
                ? conflicts.map(c => c.reason).join('; ')
                : 'no conflicts'
        };
    }

    /**
     * Detect oscillation: same target_table written >= threshold times
     * within oscillationWindowMs, with alternating values.
     *
     * @param {Object} intent
     * @param {Array} recentEvents
     * @returns {Object} { detected, reason, count, winner }
     */
    detectOscillation(intent, recentEvents) {
        if (!intent.target_table) {
            return { detected: false };
        }

        const now = Date.now();
        const cutoff = now - this.oscillationWindowMs;

        // Filter events targeting the same table within the window
        const tableEvents = recentEvents.filter(e =>
            e.target_table === intent.target_table &&
            e.timestamp >= cutoff &&
            e.intent === 'write'
        );

        // Count including the current intent
        const totalWrites = tableEvents.length + 1;

        if (totalWrites < this.oscillationThreshold) {
            return { detected: false };
        }

        // Check for alternating values (A→B→A or A→B→A→B)
        const isAlternating = this._detectAlternatingPattern(tableEvents, intent);

        if (!isAlternating && totalWrites < this.oscillationThreshold + 2) {
            // If not clearly alternating, require higher threshold
            return { detected: false };
        }

        // Determine winner: highest-priority agent among those writing to this table
        const involvedAgents = [...new Set([
            ...tableEvents.map(e => e.agent),
            intent.agent
        ])];
        const winner = this._highestPriority(involvedAgents);

        return {
            detected: true,
            reason: `Oscillation detected on ${intent.target_table}: ${totalWrites} writes in ${this.oscillationWindowMs / 1000}s` +
                (isAlternating ? ' with alternating values' : ''),
            count: totalWrites,
            winner
        };
    }

    /**
     * Detect contradiction: two different agents writing to the same table
     * within the coordination window with different proposed_value.
     *
     * @param {Object} intent
     * @param {Array} recentEvents
     * @returns {Object} { detected, reason, conflictingAgent, winner }
     */
    detectContradiction(intent, recentEvents) {
        if (!intent.target_table) {
            return { detected: false };
        }

        const now = Date.now();
        const cutoff = now - this.oscillationWindowMs;

        // Find recent writes to the same table by OTHER agents
        const conflicting = recentEvents.filter(e =>
            e.target_table === intent.target_table &&
            e.agent !== intent.agent &&
            e.intent === 'write' &&
            e.timestamp >= cutoff
        );

        if (conflicting.length === 0) {
            return { detected: false };
        }

        // Check if any have a different proposed_value
        for (const event of conflicting) {
            if (this._valuesConflict(intent.proposed_value, event.proposed_value)) {
                const winner = this._highestPriority([intent.agent, event.agent]);
                return {
                    detected: true,
                    reason: `Contradiction: ${intent.agent} and ${event.agent} writing different values to ${intent.target_table}`,
                    conflictingAgent: event.agent,
                    winner
                };
            }
        }

        return { detected: false };
    }

    /**
     * Detect duplicate: same agent, same action, same table, similar payload
     * within deduplicationWindowMs.
     *
     * @param {Object} intent
     * @param {Array} recentEvents
     * @returns {Object} { detected, reason, conflictingEvent }
     */
    detectDuplicateAction(intent, recentEvents) {
        const now = Date.now();
        const cutoff = now - this.deduplicationWindowMs;

        const duplicates = recentEvents.filter(e =>
            e.agent === intent.agent &&
            e.action === intent.action &&
            e.target_table === intent.target_table &&
            e.timestamp >= cutoff &&
            this._payloadsSimilar(intent.proposed_value, e.proposed_value)
        );

        if (duplicates.length > 0) {
            return {
                detected: true,
                reason: `Duplicate action: ${intent.agent}/${intent.action} on ${intent.target_table} already executed ${duplicates.length > 1 ? duplicates.length + ' times' : ''} within ${this.deduplicationWindowMs / 1000}s`,
                conflictingEvent: duplicates[duplicates.length - 1]
            };
        }

        return { detected: false };
    }

    /**
     * Resolve conflict by agent priority.
     *
     * @param {string[]} agents - Array of agent names
     * @returns {Object} { winner, reason }
     */
    resolveByPriority(agents) {
        if (!agents || agents.length === 0) {
            return { winner: null, reason: 'no agents' };
        }

        let winner = agents[0];
        let winnerPriority = this._getPriority(agents[0]);

        for (let i = 1; i < agents.length; i++) {
            const priority = this._getPriority(agents[i]);
            if (priority > winnerPriority) {
                winner = agents[i];
                winnerPriority = priority;
            }
        }

        return {
            winner,
            reason: `${winner} has priority ${winnerPriority} (highest among ${agents.join(', ')})`
        };
    }

    // ── Private helpers ──

    _getPriority(agent) {
        return this.priorityMap[agent] ?? 0;
    }

    _highestPriority(agents) {
        return this.resolveByPriority(agents).winner;
    }

    /**
     * Check if two proposed values conflict (are different in a meaningful way).
     */
    _valuesConflict(a, b) {
        if (a === undefined || b === undefined) return false;
        if (a === null || b === null) return a !== b;

        // Primitive comparison
        if (typeof a !== 'object' || typeof b !== 'object') {
            return a !== b;
        }

        // Object: compare JSON representation
        return JSON.stringify(a) !== JSON.stringify(b);
    }

    /**
     * Check if two payloads are similar enough to be considered duplicates.
     */
    _payloadsSimilar(a, b) {
        if (a === undefined && b === undefined) return true;
        if (a === null && b === null) return true;
        if (a === undefined || b === undefined) return false;
        if (a === null || b === null) return false;

        // Primitive comparison
        if (typeof a !== 'object' || typeof b !== 'object') {
            return a === b;
        }

        // Object: compare JSON
        return JSON.stringify(a) === JSON.stringify(b);
    }

    /**
     * Detect alternating value pattern in event sequence.
     * e.g., A→B→A→B or gpt-4→gpt-4-turbo→gpt-4
     */
    _detectAlternatingPattern(events, intent) {
        if (events.length < 2) return false;

        // Sort by timestamp ascending
        const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

        // Add the current intent at the end
        const sequence = [
            ...sorted.map(e => JSON.stringify(e.proposed_value)),
            JSON.stringify(intent.proposed_value)
        ];

        // Check for A→B→A pattern: at least one reversal
        for (let i = 2; i < sequence.length; i++) {
            if (sequence[i] === sequence[i - 2] && sequence[i] !== sequence[i - 1]) {
                return true;
            }
        }

        return false;
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// EventStore — Persistent audit trail to Supabase
// ─────────────────────────────────────────────────────────────────────────────

class EventStore {
    /**
     * @param {Object} supabase - Resilient Supabase client
     * @param {Object} config
     * @param {string} config.tableName - Table name for persistence
     * @param {number} config.batchSize - Flush buffer when this many events queued
     * @param {number} config.flushIntervalMs - Auto-flush interval
     */
    constructor(supabase, config = {}) {
        this.supabase = supabase;
        this.tableName = config.tableName ?? 'agent_coordination_events';
        this.batchSize = config.batchSize ?? 10;
        this.flushIntervalMs = config.flushIntervalMs ?? 1000;
        this.buffer = [];
        this._flushTimer = null;
        this._flushing = false;
    }

    /**
     * Record an event to the buffer. Auto-flushes when batchSize reached.
     *
     * @param {Object} event - Event to persist
     */
    record(event) {
        this.buffer.push({
            event_id: event.event_id,
            organization_id: event.organization_id || null,
            agent: event.agent,
            action: event.action,
            target_table: event.target_table || null,
            payload: event.proposed_value || event.payload || null,
            resolution: event.resolution || null,
            conflicts: event.conflicts || null,
            created_at: new Date(event.timestamp).toISOString()
        });

        if (this.buffer.length >= this.batchSize) {
            this.flush().catch(err =>
                console.error('[EventStore] Auto-flush error:', err.message)
            );
        }

        // Schedule timer flush if not already scheduled
        if (!this._flushTimer && this.flushIntervalMs > 0) {
            this._flushTimer = setTimeout(() => {
                this._flushTimer = null;
                this.flush().catch(err =>
                    console.error('[EventStore] Timer-flush error:', err.message)
                );
            }, this.flushIntervalMs);
        }
    }

    /**
     * Flush buffered events to Supabase.
     */
    async flush() {
        if (this.buffer.length === 0 || this._flushing) return;

        this._flushing = true;
        const batch = this.buffer.splice(0);

        try {
            if (this.supabase) {
                await this.supabase
                    .from(this.tableName)
                    .insert(batch);
            }
        } catch (error) {
            // Never crash on persistence failure — this is the slow path.
            // Log and drop. The in-memory ring buffer is the source of truth
            // for real-time coordination.
            console.error('[EventStore] Flush failed:', error.message,
                `| Dropped ${batch.length} events`);
        } finally {
            this._flushing = false;
        }
    }

    /**
     * Query persisted events from Supabase.
     *
     * @param {Object} filter - { agent?, target_table?, since?, until? }
     * @param {Object} options - { limit? }
     * @returns {Array} Matching events
     */
    async query(filter = {}, options = {}) {
        if (!this.supabase) return [];

        try {
            let query = this.supabase
                .from(this.tableName)
                .select('*');

            if (filter.agent) {
                query = query.eq('agent', filter.agent);
            }
            if (filter.target_table) {
                query = query.eq('target_table', filter.target_table);
            }
            if (filter.since) {
                query = query.gte('created_at', new Date(filter.since).toISOString());
            }
            if (filter.until) {
                query = query.lte('created_at', new Date(filter.until).toISOString());
            }
            if (options.limit) {
                query = query.limit(options.limit);
            }

            query = query.order('created_at', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('[EventStore] Query failed:', error.message);
            return [];
        }
    }

    /**
     * Destroy the store — clears buffer and cancels timers.
     * @internal test-only
     */
    destroy() {
        this.buffer = [];
        if (this._flushTimer) {
            clearTimeout(this._flushTimer);
            this._flushTimer = null;
        }
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// AgentEventBus — Publish/Subscribe + Coordination Gating
// ─────────────────────────────────────────────────────────────────────────────

class AgentEventBus {
    /**
     * @param {Object} supabase - Resilient Supabase client (for EventStore)
     * @param {Object} config - Merged with EVENT_BUS_CONFIG defaults
     */
    constructor(supabase, config = {}) {
        const mergedConfig = { ...EVENT_BUS_CONFIG, ...config };

        this.coordinationWindowMs = mergedConfig.coordinationWindowMs;
        this.maxEventAge = mergedConfig.maxEventAge;

        // In-memory ring buffer for real-time coordination (fast path)
        this.events = [];

        // Subscriptions: Map<subscriptionId, { pattern, handler }>
        this.subscriptions = new Map();
        this._nextSubId = 1;

        // Conflict resolver
        this.conflictResolver = new ConflictResolver(mergedConfig);

        // Persistent event store (slow path — async, non-blocking)
        this.eventStore = new EventStore(supabase, {
            tableName: mergedConfig.tableName ?? 'agent_coordination_events',
            batchSize: mergedConfig.batchSize ?? 10,
            flushIntervalMs: mergedConfig.flushIntervalMs ?? 1000
        });
    }

    /**
     * Publish an event to the bus.
     *
     * @param {Object} event
     * @param {string} event.agent - Agent name (e.g., 'autopilot')
     * @param {string} event.action - Action type (e.g., 'minor_model_switch')
     * @param {string} [event.target_table] - Target Supabase table
     * @param {*} [event.proposed_value] - The value being written
     * @param {*} [event.payload] - Additional data
     * @param {string} [event.intent] - 'write' or 'read' (default: 'write')
     * @returns {Object} { event_id, timestamp }
     */
    publish(event) {
        const enriched = {
            ...event,
            event_id: event.event_id || crypto.randomUUID(),
            timestamp: event.timestamp || Date.now(),
            intent: event.intent || 'write'
        };

        // Add to ring buffer
        this.events.push(enriched);

        // Prune expired events
        this._pruneEvents();

        // Notify subscribers (fire-and-forget, never block)
        this._notifySubscribers(enriched);

        // Persist to event store (async, non-blocking)
        this.eventStore.record(enriched);

        return {
            event_id: enriched.event_id,
            timestamp: enriched.timestamp
        };
    }

    /**
     * Subscribe to events matching a pattern.
     *
     * @param {Object} pattern - Filter: { agent?, action?, target_table? }
     * @param {Function} handler - async (event) => void
     * @returns {number} subscription_id
     */
    subscribe(pattern, handler) {
        const id = this._nextSubId++;
        this.subscriptions.set(id, { pattern, handler });
        return id;
    }

    /**
     * Remove a subscription.
     *
     * @param {number} subscriptionId
     */
    unsubscribe(subscriptionId) {
        this.subscriptions.delete(subscriptionId);
    }

    /**
     * Request coordination before performing a write action.
     * This is the GATING call — agents call this BEFORE writing to Supabase.
     *
     * @param {Object} intent
     * @param {string} intent.agent - Agent requesting coordination
     * @param {string} intent.action - Action type
     * @param {string} intent.target_table - Target table
     * @param {*} intent.proposed_value - Proposed write value
     * @param {Object} [intent.context] - Additional context
     * @returns {Object} { allowed, reason, conflicts, resolution }
     */
    async requestCoordination(intent) {
        if (!intent || !intent.agent) {
            throw new Error('requestCoordination: intent.agent is required');
        }

        // Get recent events for conflict checking
        const recentEvents = this.getRecentEvents(
            { target_table: intent.target_table },
            this.conflictResolver.oscillationWindowMs
        );

        // Run conflict detection
        const result = this.conflictResolver.checkConflicts(intent, recentEvents);

        // Determine final resolution
        const eventId = crypto.randomUUID();
        const timestamp = Date.now();
        let allowed;
        let resolution;

        if (!result.hasConflict) {
            allowed = true;
            resolution = 'allowed';
        } else if (result.resolution === 'block') {
            // Check if the intent agent is the priority winner
            const winners = result.conflicts
                .filter(c => c.winner)
                .map(c => c.winner);

            if (winners.length > 0 && winners.every(w => w === intent.agent)) {
                // This agent IS the winner — allow despite conflict
                allowed = true;
                resolution = 'allowed_as_winner';
            } else {
                allowed = false;
                resolution = result.conflicts.map(c => c.type + '_blocked').join(',');
            }
        } else {
            allowed = true;
            resolution = result.resolution;
        }

        // Publish the coordination event (records intent + resolution)
        this.publish({
            event_id: eventId,
            agent: intent.agent,
            action: intent.action,
            target_table: intent.target_table,
            proposed_value: intent.proposed_value,
            intent: 'write',
            timestamp,
            resolution,
            conflicts: result.conflicts.length > 0 ? result.conflicts : null,
            context: intent.context
        });

        return {
            allowed,
            reason: result.reason,
            conflicts: result.conflicts,
            resolution,
            event_id: eventId
        };
    }

    /**
     * Get recent events matching a filter within a time window.
     *
     * @param {Object} filter - { agent?, action?, target_table? }
     * @param {number} windowMs - Time window in milliseconds
     * @returns {Array} Matching events
     */
    getRecentEvents(filter = {}, windowMs = this.maxEventAge) {
        const cutoff = Date.now() - windowMs;

        return this.events.filter(event => {
            if (event.timestamp < cutoff) return false;
            if (filter.agent && event.agent !== filter.agent) return false;
            if (filter.action && event.action !== filter.action) return false;
            if (filter.target_table && event.target_table !== filter.target_table) return false;
            return true;
        });
    }

    /**
     * Reset all state. Test-only.
     * @internal
     */
    reset() {
        this.events = [];
        this.subscriptions.clear();
        this._nextSubId = 1;
        this.eventStore.destroy();
    }

    // ── Private helpers ──

    /**
     * Remove events older than maxEventAge.
     */
    _pruneEvents() {
        const cutoff = Date.now() - this.maxEventAge;
        // Find first event that's within window
        let firstValid = 0;
        while (firstValid < this.events.length && this.events[firstValid].timestamp < cutoff) {
            firstValid++;
        }
        if (firstValid > 0) {
            this.events = this.events.slice(firstValid);
        }
    }

    /**
     * Notify matching subscribers. Fire-and-forget.
     */
    _notifySubscribers(event) {
        for (const [, sub] of this.subscriptions) {
            const p = sub.pattern;
            const matches =
                (!p.agent || p.agent === event.agent) &&
                (!p.action || p.action === event.action) &&
                (!p.target_table || p.target_table === event.target_table);

            if (matches) {
                // Fire and forget — never block the bus
                Promise.resolve().then(() => sub.handler(event)).catch(err =>
                    console.error(`[EventBus] Subscriber error:`, err.message)
                );
            }
        }
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// Singleton factory
// ─────────────────────────────────────────────────────────────────────────────

let _busInstance = null;

/**
 * Get or create the singleton AgentEventBus instance.
 *
 * @param {Object} supabase - Resilient Supabase client
 * @param {Object} [config] - Override default EVENT_BUS_CONFIG
 * @returns {AgentEventBus}
 */
function getEventBus(supabase, config = EVENT_BUS_CONFIG) {
    if (!_busInstance) {
        _busInstance = new AgentEventBus(supabase, config);
    }
    return _busInstance;
}

/**
 * Reset the singleton. Test-only — allows fresh instance creation.
 * @internal
 */
function resetEventBus() {
    if (_busInstance) {
        _busInstance.reset();
    }
    _busInstance = null;
}


// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export {
    AgentEventBus,
    ConflictResolver,
    EventStore,
    getEventBus,
    resetEventBus,
    EVENT_BUS_CONFIG
};
