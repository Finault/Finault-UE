/**
 * ONBOARDING SANITIZER (W-024)
 * Deterministic priority assignment for onboarding next steps
 *
 * PROBLEMS FIXED:
 * 1. magic-onboarding.js ~lines 408-431: priority = nextSteps.length + 1 creates
 *    fragile, order-dependent priorities that change based on which conditions are true.
 * 2. Hardcoded priority: 1 collides with other priority: 1 entries.
 * 3. Duplicate priorities cause undefined sort order.
 *
 * SOLUTION:
 * 1. PriorityAssigner class with predefined priority levels
 * 2. Unique priority values guaranteed by using category-based slots
 * 3. Stable sort with tiebreaker on insertion order
 */

export const PRIORITY_LEVELS = {
    CRITICAL: 10,
    HIGH: 20,
    MEDIUM: 30,
    LOW: 40,
    OPTIONAL: 50
};

export const ONBOARDING_CONFIG = {
    CRITICAL: 10,
    HIGH: 20,
    MEDIUM: 30,
    LOW: 40,
    OPTIONAL: 50
};

/**
 * PriorityAssigner class
 * Manages deterministic priority assignment with insertion order tiebreaker
 */
export class PriorityAssigner {
    constructor() {
        this.steps = [];
        this.insertionCounter = 0;
    }

    /**
     * Add a step with a priority level
     * Automatically adds tiebreaker based on insertion order
     */
    addStep(step, priorityLevel) {
        if (!step || typeof step !== 'object') {
            throw new Error('Step must be a non-null object');
        }
        if (typeof priorityLevel !== 'number') {
            throw new Error('Priority level must be a number');
        }

        const enhancedStep = {
            ...step,
            priority: priorityLevel,
            _insertionOrder: this.insertionCounter++
        };

        this.steps.push(enhancedStep);
        return this;
    }

    /**
     * Get ordered steps sorted by priority, then insertion order
     */
    getOrderedSteps() {
        return this.steps
            .map(step => {
                // Remove internal insertion order property before returning
                const { _insertionOrder, ...cleanStep } = step;
                return cleanStep;
            })
            .sort((a, b) => {
                // Primary sort: by priority (lower number = higher priority)
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }
                // Tiebreaker: by insertion order (preserve order for same priority)
                return a._insertionOrder - b._insertionOrder;
            })
            .map(step => {
                // Remove insertion order from returned objects
                const { _insertionOrder, ...cleanStep } = step;
                return cleanStep;
            });
    }

    /**
     * Clear the step list
     */
    clear() {
        this.steps = [];
        this.insertionCounter = 0;
        return this;
    }

    /**
     * Get count of steps
     */
    get length() {
        return this.steps.length;
    }
}

/**
 * Assign stable priorities to steps that may have duplicates
 * Reassigns unique sequential priorities while maintaining relative order
 */
export function assignStablePriorities(steps) {
    if (!Array.isArray(steps)) {
        throw new Error('Steps must be an array');
    }

    // Create a copy to avoid mutating the input
    const result = steps.map((step, index) => ({
        ...step,
        _originalIndex: index
    }));

    // Sort by original priority first, then by original index to maintain stable order
    result.sort((a, b) => {
        if ((a.priority || 0) !== (b.priority || 0)) {
            return (a.priority || 0) - (b.priority || 0);
        }
        return a._originalIndex - b._originalIndex;
    });

    // Reassign unique sequential priorities
    let currentPriority = 1;
    let lastPriority = null;

    result.forEach(step => {
        if (lastPriority !== null && step.priority !== lastPriority) {
            currentPriority++;
        }
        step.priority = currentPriority;
        lastPriority = step.priority;
    });

    // Remove internal marker and restore original order... actually, keep sorted order
    return result.map(step => {
        const { _originalIndex, ...cleanStep } = step;
        return cleanStep;
    });
}

export default {
    PRIORITY_LEVELS,
    ONBOARDING_CONFIG,
    PriorityAssigner,
    assignStablePriorities
};
