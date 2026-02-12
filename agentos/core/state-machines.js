/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT STATE MACHINE FRAMEWORK
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Gap #14: State Machine Definitions — P0 (Before Any Customer)
 *
 * Problem: Invoice, Close Pack, and Dispute entities have status enums in the
 * database and constants in code, but NO transition validation. Any code can
 * set any status on any entity, bypassing business rules. Only anomaly-persistence.js
 * has proper transition validation.
 *
 * This module provides:
 * - Formal state machine definitions with valid transitions and guards
 * - Transition validation with detailed error messages
 * - Side-effect hooks (onEnter, onExit) for each state
 * - Audit trail integration for every transition
 * - Reusable StateMachine class that any entity can use
 *
 * State machines defined:
 * 1. INVOICE_WORKFLOW — pending → parsed → allocated → disputed → archived
 * 2. CLOSE_PACK_WORKFLOW — generated → reviewed → approved → archived
 * 3. DISPUTE_WORKFLOW — detected → evidence_gathering → draft_created → human_review → submitted → provider_acknowledged → resolved → closed
 * 4. SAVINGS_WORKFLOW — pending → approved → implemented → rejected
 * 5. BUDGET_WORKFLOW — active → paused → exceeded → completed → archived
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createLogger } from './structured-logger.js';

const logger = createLogger('state-machines');

// ─── Invoice Workflow States ─────────────────────────────────────────────────

export const INVOICE_STATUS = {
    PENDING: 'pending',
    PARSED: 'parsed',
    ALLOCATED: 'allocated',
    DISPUTED: 'disputed',
    ARCHIVED: 'archived'
};

const INVOICE_TRANSITIONS = {
    pending: ['parsed'],
    parsed: ['allocated', 'disputed'],
    allocated: ['disputed', 'archived'],
    disputed: ['parsed', 'allocated', 'archived'],   // Re-parse after dispute resolution, or re-allocate
    archived: []                                       // Terminal
};

const INVOICE_GUARDS = {
    'pending→parsed': (entity) => {
        if (!entity.provider || !entity.total_amount) {
            return { allowed: false, reason: 'Invoice must have provider and total_amount before parsing' };
        }
        return { allowed: true };
    },
    'parsed→allocated': (entity) => {
        if (!entity.line_items_count || entity.line_items_count === 0) {
            return { allowed: false, reason: 'Invoice must have at least one parsed line item before allocation' };
        }
        return { allowed: true };
    },
    'allocated→archived': (entity) => {
        if (entity.payment_status !== 'paid') {
            return { allowed: false, reason: 'Invoice must be marked as paid before archiving' };
        }
        return { allowed: true };
    }
};

// ─── Close Pack Workflow States ──────────────────────────────────────────────

export const CLOSE_PACK_STATUS = {
    GENERATED: 'generated',
    REVIEWED: 'reviewed',
    APPROVED: 'approved',
    ARCHIVED: 'archived'
};

const CLOSE_PACK_TRANSITIONS = {
    generated: ['reviewed'],
    reviewed: ['approved', 'generated'],   // Can reject back to generated for rework
    approved: ['archived'],
    archived: []                           // Terminal — sealed close pack
};

const CLOSE_PACK_GUARDS = {
    'generated→reviewed': (entity) => {
        if (!entity.attestation_hash) {
            return { allowed: false, reason: 'Close pack must have attestation hash before review' };
        }
        return { allowed: true };
    },
    'reviewed→approved': (entity, context) => {
        if (!context?.approved_by) {
            return { allowed: false, reason: 'Approval requires approved_by user identifier' };
        }
        if (context.approved_by === entity.generated_by) {
            return { allowed: false, reason: 'Close pack cannot be approved by the same person who generated it (separation of duties)' };
        }
        return { allowed: true };
    },
    'approved→archived': (entity) => {
        if (!entity.is_attested) {
            return { allowed: false, reason: 'Close pack must be attested before archiving' };
        }
        return { allowed: true };
    }
};

// ─── Dispute Workflow States ─────────────────────────────────────────────────

export const DISPUTE_STATUS = {
    DETECTED: 'detected',
    EVIDENCE_GATHERING: 'evidence_gathering',
    DRAFT_CREATED: 'draft_created',
    HUMAN_REVIEW: 'human_review',
    SUBMITTED: 'submitted',
    PROVIDER_ACKNOWLEDGED: 'provider_acknowledged',
    RESOLVED: 'resolved',
    CLOSED: 'closed'
};

const DISPUTE_TRANSITIONS = {
    detected: ['evidence_gathering', 'closed'],         // Can close immediately if false positive
    evidence_gathering: ['draft_created', 'closed'],    // Evidence insufficient → close
    draft_created: ['human_review'],
    human_review: ['submitted', 'draft_created'],       // Reviewer can request draft revision
    submitted: ['provider_acknowledged', 'resolved'],   // Some providers resolve without ack
    provider_acknowledged: ['resolved'],
    resolved: ['closed'],
    closed: []                                          // Terminal
};

const DISPUTE_GUARDS = {
    'draft_created→human_review': (entity) => {
        if (!entity.evidence_packet || Object.keys(entity.evidence_packet).length === 0) {
            return { allowed: false, reason: 'Dispute must have evidence packet before human review' };
        }
        return { allowed: true };
    },
    'human_review→submitted': (entity, context) => {
        if (!context?.approved_by) {
            return { allowed: false, reason: 'Submission requires human approval (approved_by)' };
        }
        return { allowed: true };
    },
    'resolved→closed': (entity) => {
        if (entity.resolution_amount === undefined || entity.resolution_amount === null) {
            return { allowed: false, reason: 'Dispute must have resolution amount before closing' };
        }
        return { allowed: true };
    }
};

// ─── Savings Recommendation Workflow States ──────────────────────────────────

export const SAVINGS_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    IMPLEMENTED: 'implemented',
    REJECTED: 'rejected'
};

const SAVINGS_TRANSITIONS = {
    pending: ['approved', 'rejected'],
    approved: ['implemented', 'rejected'],    // Can still reject after approval
    implemented: [],                           // Terminal — savings are live
    rejected: ['pending']                      // Can reopen for reconsideration
};

const SAVINGS_GUARDS = {
    'pending→approved': (entity, context) => {
        if (!context?.approved_by) {
            return { allowed: false, reason: 'Savings approval requires approved_by user identifier' };
        }
        if (!entity.estimated_monthly_savings || entity.estimated_monthly_savings <= 0) {
            return { allowed: false, reason: 'Cannot approve recommendation with no estimated savings' };
        }
        return { allowed: true };
    },
    'approved→implemented': (entity) => {
        if (!entity.implementation_details) {
            return { allowed: false, reason: 'Implementation details required before marking as implemented' };
        }
        return { allowed: true };
    }
};

// ─── Budget Workflow States ──────────────────────────────────────────────────

export const BUDGET_STATUS = {
    ACTIVE: 'active',
    PAUSED: 'paused',
    EXCEEDED: 'exceeded',
    COMPLETED: 'completed',
    ARCHIVED: 'archived'
};

const BUDGET_TRANSITIONS = {
    active: ['paused', 'exceeded', 'completed'],
    paused: ['active', 'archived'],
    exceeded: ['active', 'archived'],           // Can resume after budget increase
    completed: ['archived'],
    archived: []                                // Terminal
};

// ─── State Machine Class ─────────────────────────────────────────────────────

export class StateMachine {
    /**
     * @param {Object} config
     * @param {string} config.name - Machine name for error messages
     * @param {Object} config.transitions - Map of state → allowed next states
     * @param {Object} [config.guards] - Map of 'from→to' → guard function
     * @param {Object} [config.onEnter] - Map of state → function(entity, context)
     * @param {Object} [config.onExit] - Map of state → function(entity, context)
     */
    constructor({ name, transitions, guards = {}, onEnter = {}, onExit = {}, auditTrail = null }) {
        if (!name || typeof name !== 'string') {
            throw new Error('StateMachine requires a name');
        }
        if (!transitions || typeof transitions !== 'object') {
            throw new Error('StateMachine requires transitions map');
        }
        this.name = name;
        this.transitions = transitions;
        this.guards = guards;
        this.onEnter = onEnter;
        this.onExit = onExit;
        this.states = Object.keys(transitions);
        this.auditTrail = auditTrail; // Optional: { log(entry) } for persisting transitions
        this.transitionLog = [];       // In-memory audit trail for debugging
    }

    /**
     * Get all valid next states from current state
     * @param {string} currentState
     * @returns {string[]}
     */
    getValidTransitions(currentState) {
        const normalized = String(currentState).toLowerCase();
        if (!this.transitions[normalized]) {
            return [];
        }
        return [...this.transitions[normalized]];
    }

    /**
     * Check if a state is terminal (no outgoing transitions)
     * @param {string} state
     * @returns {boolean}
     */
    isTerminal(state) {
        const normalized = String(state).toLowerCase();
        const targets = this.transitions[normalized];
        return Array.isArray(targets) && targets.length === 0;
    }

    /**
     * Check if a state is valid in this machine
     * @param {string} state
     * @returns {boolean}
     */
    isValidState(state) {
        return this.states.includes(String(state).toLowerCase());
    }

    /**
     * Validate and execute a state transition
     * @param {Object} entity - The entity being transitioned (must have .status)
     * @param {string} targetState - The desired new state
     * @param {Object} [context] - Additional context (e.g., who triggered, why)
     * @returns {{ success: boolean, previousState: string, newState: string, error?: string }}
     */
    transition(entity, targetState, context = {}) {
        const currentState = String(entity.status || entity.state || '').toLowerCase();
        const target = String(targetState).toLowerCase();

        // Validate current state exists
        if (!this.isValidState(currentState)) {
            return {
                success: false,
                previousState: currentState,
                newState: currentState,
                error: `[${this.name}] Unknown current state: '${currentState}'. Valid states: ${this.states.join(', ')}`
            };
        }

        // Validate target state exists
        if (!this.isValidState(target)) {
            return {
                success: false,
                previousState: currentState,
                newState: currentState,
                error: `[${this.name}] Unknown target state: '${target}'. Valid states: ${this.states.join(', ')}`
            };
        }

        // Check transition is allowed
        const allowed = this.transitions[currentState];
        if (!allowed || !allowed.includes(target)) {
            return {
                success: false,
                previousState: currentState,
                newState: currentState,
                error: `[${this.name}] Invalid transition: '${currentState}' → '${target}'. Allowed: ${(allowed || []).join(', ') || 'none (terminal state)'}`
            };
        }

        // Run guard if defined
        const guardKey = `${currentState}→${target}`;
        if (this.guards[guardKey]) {
            const guardResult = this.guards[guardKey](entity, context);
            if (!guardResult.allowed) {
                logger.warn('State transition guard rejected', {
                    machine: this.name,
                    fromState: currentState,
                    toState: target,
                    reason: guardResult.reason,
                    entityId: entity.id || entity._id
                });
                return {
                    success: false,
                    previousState: currentState,
                    newState: currentState,
                    error: `[${this.name}] Guard rejected '${currentState}' → '${target}': ${guardResult.reason}`
                };
            }
        }

        // Execute onExit hook
        if (this.onExit[currentState]) {
            this.onExit[currentState](entity, context);
        }

        // Perform transition
        const previousState = currentState;
        if ('status' in entity) {
            entity.status = target;
        } else if ('state' in entity) {
            entity.state = target;
        }

        // Execute onEnter hook
        if (this.onEnter[target]) {
            this.onEnter[target](entity, context);
        }

        // ── Audit Trail ─────────────────────────────────────────────────
        const auditEntry = {
            machine: this.name,
            entityId: entity.id || entity._id || context.entityId || null,
            previousState,
            newState: target,
            triggeredBy: context.triggered_by || context.approved_by || 'system',
            reason: context.reason || null,
            timestamp: new Date().toISOString(),
            correlationId: context.correlationId || context.requestId || null,
            orgId: context.org_id || null,
            metadata: context.metadata || null
        };

        // Always push to in-memory log (capped at 1000 for memory safety)
        this.transitionLog.push(auditEntry);
        if (this.transitionLog.length > 1000) {
            this.transitionLog.splice(0, this.transitionLog.length - 1000);
        }

        // Persist to external audit trail if provided
        if (this.auditTrail && typeof this.auditTrail.log === 'function') {
            try {
                this.auditTrail.log(auditEntry);
            } catch (_auditErr) {
                // Audit failures must never break transitions
            }
        }

        logger.info('State transition successful', {
            machine: this.name,
            previousState,
            newState: target,
            entityId: entity.id || entity._id,
            triggeredBy: auditEntry.triggeredBy
        });

        return {
            success: true,
            previousState,
            newState: target,
            timestamp: auditEntry.timestamp,
            triggeredBy: auditEntry.triggeredBy,
            auditEntry
        };
    }

    /**
     * Check if a transition would be valid (dry run, no side effects)
     * @param {Object} entity
     * @param {string} targetState
     * @param {Object} [context]
     * @returns {{ valid: boolean, error?: string }}
     */
    canTransition(entity, targetState, context = {}) {
        const currentState = String(entity.status || entity.state || '').toLowerCase();
        const target = String(targetState).toLowerCase();

        if (!this.isValidState(currentState)) {
            return { valid: false, error: `Unknown current state: '${currentState}'` };
        }
        if (!this.isValidState(target)) {
            return { valid: false, error: `Unknown target state: '${target}'` };
        }

        const allowed = this.transitions[currentState];
        if (!allowed || !allowed.includes(target)) {
            return { valid: false, error: `Transition '${currentState}' → '${target}' not allowed` };
        }

        const guardKey = `${currentState}→${target}`;
        if (this.guards[guardKey]) {
            const guardResult = this.guards[guardKey](entity, context);
            if (!guardResult.allowed) {
                return { valid: false, error: guardResult.reason };
            }
        }

        return { valid: true };
    }

    /**
     * Get the in-memory audit trail
     * @param {Object} [filter] - Optional filter { entityId, state, since }
     * @returns {Object[]}
     */
    getAuditLog(filter = {}) {
        let entries = [...this.transitionLog];
        if (filter.entityId) {
            entries = entries.filter(e => e.entityId === filter.entityId);
        }
        if (filter.state) {
            entries = entries.filter(e => e.newState === filter.state || e.previousState === filter.state);
        }
        if (filter.since) {
            const sinceTime = new Date(filter.since).getTime();
            entries = entries.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
        }
        return entries;
    }

    /**
     * Clear the in-memory audit log
     */
    clearAuditLog() {
        this.transitionLog = [];
    }

    /**
     * Get machine definition for documentation/API exposure
     * @returns {Object}
     */
    describe() {
        return {
            name: this.name,
            states: this.states,
            transitions: { ...this.transitions },
            terminalStates: this.states.filter(s => this.isTerminal(s)),
            guardedTransitions: Object.keys(this.guards)
        };
    }
}

// ─── Pre-built State Machine Instances ───────────────────────────────────────

export const INVOICE_MACHINE = new StateMachine({
    name: 'InvoiceWorkflow',
    transitions: INVOICE_TRANSITIONS,
    guards: INVOICE_GUARDS,
    onEnter: {
        parsed: (entity) => {
            entity.parsed_at = new Date().toISOString();
        },
        allocated: (entity) => {
            entity.allocated_at = new Date().toISOString();
        },
        archived: (entity) => {
            entity.archived_at = new Date().toISOString();
        }
    }
});

export const CLOSE_PACK_MACHINE = new StateMachine({
    name: 'ClosePackWorkflow',
    transitions: CLOSE_PACK_TRANSITIONS,
    guards: CLOSE_PACK_GUARDS,
    onEnter: {
        reviewed: (entity) => {
            entity.reviewed_at = new Date().toISOString();
        },
        approved: (entity, context) => {
            entity.approved_at = new Date().toISOString();
            entity.approved_by = context?.approved_by;
        },
        archived: (entity) => {
            entity.archived_at = new Date().toISOString();
        }
    }
});

export const DISPUTE_MACHINE = new StateMachine({
    name: 'DisputeWorkflow',
    transitions: DISPUTE_TRANSITIONS,
    guards: DISPUTE_GUARDS,
    onEnter: {
        evidence_gathering: (entity) => {
            entity.evidence_started_at = new Date().toISOString();
        },
        submitted: (entity, context) => {
            entity.submitted_at = new Date().toISOString();
            entity.submitted_by = context?.approved_by;
        },
        resolved: (entity) => {
            entity.resolved_at = new Date().toISOString();
        },
        closed: (entity) => {
            entity.closed_at = new Date().toISOString();
        }
    }
});

export const SAVINGS_MACHINE = new StateMachine({
    name: 'SavingsWorkflow',
    transitions: SAVINGS_TRANSITIONS,
    guards: SAVINGS_GUARDS,
    onEnter: {
        approved: (entity, context) => {
            entity.approved_at = new Date().toISOString();
            entity.approved_by_id = context?.approved_by;
        },
        implemented: (entity) => {
            entity.implemented_at = new Date().toISOString();
        },
        rejected: (entity, context) => {
            entity.rejected_at = new Date().toISOString();
            entity.rejection_reason = context?.reason || 'No reason provided';
        }
    }
});

export const BUDGET_MACHINE = new StateMachine({
    name: 'BudgetWorkflow',
    transitions: BUDGET_TRANSITIONS,
    onEnter: {
        paused: (entity, context) => {
            entity.paused_at = new Date().toISOString();
            entity.pause_reason = context?.reason;
        },
        exceeded: (entity) => {
            entity.exceeded_at = new Date().toISOString();
        },
        completed: (entity) => {
            entity.completed_at = new Date().toISOString();
        },
        archived: (entity) => {
            entity.archived_at = new Date().toISOString();
        }
    }
});

// ─── Convenience: Get machine by entity type ─────────────────────────────────

const MACHINE_REGISTRY = {
    invoice: INVOICE_MACHINE,
    close_pack: CLOSE_PACK_MACHINE,
    dispute: DISPUTE_MACHINE,
    savings_recommendation: SAVINGS_MACHINE,
    budget: BUDGET_MACHINE
};

/**
 * Get the state machine for a given entity type
 * @param {string} entityType - 'invoice' | 'close_pack' | 'dispute' | 'savings_recommendation' | 'budget'
 * @returns {StateMachine|null}
 */
export function getMachine(entityType) {
    return MACHINE_REGISTRY[entityType] || null;
}

/**
 * Validate a transition for any registered entity type
 * @param {string} entityType
 * @param {Object} entity
 * @param {string} targetState
 * @param {Object} [context]
 * @returns {{ success: boolean, previousState: string, newState: string, error?: string }}
 */
export function transitionEntity(entityType, entity, targetState, context = {}) {
    const machine = getMachine(entityType);
    if (!machine) {
        return {
            success: false,
            previousState: entity.status || 'unknown',
            newState: entity.status || 'unknown',
            error: `No state machine registered for entity type: '${entityType}'. Valid types: ${Object.keys(MACHINE_REGISTRY).join(', ')}`
        };
    }
    return machine.transition(entity, targetState, context);
}

/**
 * Describe all registered state machines
 * @returns {Object}
 */
export function describeAllMachines() {
    const result = {};
    for (const [type, machine] of Object.entries(MACHINE_REGISTRY)) {
        result[type] = machine.describe();
    }
    return result;
}

export default {
    // Classes
    StateMachine,
    // Instances
    INVOICE_MACHINE,
    CLOSE_PACK_MACHINE,
    DISPUTE_MACHINE,
    SAVINGS_MACHINE,
    BUDGET_MACHINE,
    // Status constants
    INVOICE_STATUS,
    CLOSE_PACK_STATUS,
    DISPUTE_STATUS,
    SAVINGS_STATUS,
    BUDGET_STATUS,
    // Utilities
    getMachine,
    transitionEntity,
    describeAllMachines
};
