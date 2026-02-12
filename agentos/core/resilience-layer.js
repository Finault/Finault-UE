/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RESILIENCE LAYER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fix W-005: No Circuit Breaker on External Dependencies
 *
 * THE PROBLEM:
 *   All 13 agents make direct calls to Supabase (25+ calls) and the Anthropic
 *   API (13+ calls) with zero retry logic, zero circuit breakers, and zero
 *   graceful degradation. A single dependency blip cascades into total system
 *   failure — every agent crashes simultaneously, queued tasks are lost, and
 *   customer-facing operations go dark.
 *
 * THE SOLUTION:
 *   A unified ResilienceLayer that wraps every external call with:
 *   1. Circuit Breaker — sliding-window failure tracking, 3-state machine
 *      (CLOSED → OPEN → HALF_OPEN), prevents cascading failures
 *   2. Retry with Exponential Backoff — jittered backoff for transient errors,
 *      budget-aware to respect serverless time limits
 *   3. Graceful Degradation — fallback behaviors per agent (cached data,
 *      user-friendly messages, queued writes)
 *
 * EXISTING PATTERNS REUSED:
 *   - isTransientError() logic from agentos/core/storage-adapter.js
 *   - CircuitBreaker 3-state pattern from platform/error-monitoring.js
 *   - Stale-cache fallback pattern from platform/pricing-service.js
 *
 * Usage:
 *   import { createSupabaseResilience, createAnthropicResilience } from '../core/resilience-layer.js';
 *
 *   const resilientSupabase = createSupabaseResilience(supabase);
 *   const resilientAnthropic = createAnthropicResilience(anthropic);
 *
 *   // Now use exactly like the original clients — resilience is transparent
 *   const { data } = await resilientSupabase.from('cost_records').select('amount');
 *   const response = await resilientAnthropic.messages.create({ model: '...', ... });
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSIENT ERROR DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determines if an error is transient and worth retrying.
 *
 * Covers 19+ error patterns including DNS failures, connection resets,
 * timeouts, rate limiting (429), and server errors (5xx).
 *
 * Logic mirrors storage-adapter.js isTransientError() for consistency.
 *
 * @param {*} err - The error to check (string, Error, or any thrown value)
 * @returns {boolean}
 */
function isTransientError(err) {
    if (!err) return false;
    const msg = (typeof err === 'string' ? err : (err.message || String(err))).toLowerCase();
    return msg.includes('timeout') ||
           msg.includes('timed out') ||
           msg.includes('etimedout') ||
           msg.includes('network') ||
           msg.includes('econnrefused') ||
           msg.includes('econnreset') ||
           msg.includes('eai_again') ||
           msg.includes('enotfound') ||
           msg.includes('ehostunreach') ||
           msg.includes('enetunreach') ||
           msg.includes('epipe') ||
           msg.includes('fetch failed') ||
           msg.includes('failed to fetch') ||
           msg.includes('aborted') ||
           msg.includes('socket hang up') ||
           msg.includes('service unavailable') ||
           msg.includes('too many requests') ||
           msg.includes('rate limit') ||
           /\b(408|429|5\d{2})\b/.test(msg);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sliding-window circuit breaker with 3-state machine.
 *
 * States:
 *   CLOSED   — Normal operation. Failures accumulate in a sliding window.
 *   OPEN     — Too many failures. All requests short-circuit immediately.
 *   HALF_OPEN — Cooldown expired. Lets a limited number of probe requests
 *              through to test recovery.
 *
 * Unlike the cumulative-counter approach in error-monitoring.js, this uses
 * a time-windowed failure array that discards old entries, preventing a
 * slow trickle of errors from eventually tripping the breaker.
 */
class CircuitBreaker {
    /**
     * @param {string} name - Identifier for this breaker (e.g., 'supabase', 'anthropic')
     * @param {Object} opts
     * @param {number} opts.failureThreshold - Failures within windowMs to trip OPEN (default 5)
     * @param {number} opts.windowMs - Sliding window duration in ms (default 60000)
     * @param {number} opts.cooldownMs - Time in OPEN before transitioning to HALF_OPEN (default 60000)
     * @param {number} opts.halfOpenMax - Successful probes needed to return to CLOSED (default 2)
     * @param {Function} opts.onStateChange - Callback when state transitions: (name, oldState, newState) => void
     */
    constructor(name, opts = {}) {
        if (!name || typeof name !== 'string') {
            throw new Error('CircuitBreaker: name must be a non-empty string');
        }
        this.name = name;
        this.state = 'CLOSED';
        // BUG 107: Validate options with Number.isFinite to reject NaN/Infinity
        const safeInt = (v, fallback) => (Number.isFinite(v) ? Math.max(1, Math.floor(v)) : fallback);
        const safeMs = (v, fallback, min = 1000) => (Number.isFinite(v) ? Math.max(min, v) : fallback);
        this.failureThreshold = safeInt(opts.failureThreshold, 5);
        this.windowMs = safeMs(opts.windowMs, 60000);
        this.cooldownMs = safeMs(opts.cooldownMs, 60000);
        this.halfOpenMax = safeInt(opts.halfOpenMax, 2);
        this.onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : null;

        // Sliding window of failure timestamps
        // BUG 108: Cap array size at failureThreshold * 10 to prevent unbounded growth
        this._maxFailures = this.failureThreshold * 10;
        this._failures = [];
        this._openedAt = null;
        this._halfOpenSuccesses = 0;
        // BUG 109: Atomic probe lock prevents concurrent HALF_OPEN probes
        this._probeInFlight = false;
    }

    /**
     * Prune failure timestamps outside the sliding window.
     */
    _pruneWindow() {
        const cutoff = Date.now() - this.windowMs;
        while (this._failures.length > 0 && this._failures[0] <= cutoff) {
            this._failures.shift();
        }
        // BUG 108: Hard cap to prevent unbounded growth
        while (this._failures.length > this._maxFailures) {
            this._failures.shift();
        }
    }

    /**
     * Transition to a new state, invoking callback if registered.
     */
    _transition(newState) {
        if (this.state === newState) return;
        const oldState = this.state;
        this.state = newState;
        if (this.onStateChange) {
            try {
                this.onStateChange(this.name, oldState, newState);
            } catch (_) {
                // Callback errors must not break the breaker
            }
        }
    }

    /**
     * Record a successful call.
     */
    recordSuccess() {
        if (this.state === 'HALF_OPEN') {
            this._probeInFlight = false; // BUG 109: Release probe lock
            this._halfOpenSuccesses++;
            if (this._halfOpenSuccesses >= this.halfOpenMax) {
                this._transition('CLOSED');
                this._failures = [];
                this._halfOpenSuccesses = 0;
                this._openedAt = null;
            }
        } else if (this.state === 'CLOSED') {
            // Success in CLOSED state — no action needed, window self-prunes
        }
    }

    /**
     * Record a failed call.
     */
    recordFailure() {
        const now = Date.now();

        if (this.state === 'HALF_OPEN') {
            // Any failure in HALF_OPEN immediately reopens the circuit
            this._probeInFlight = false; // BUG 109: Release probe lock
            this._transition('OPEN');
            this._openedAt = now;
            this._halfOpenSuccesses = 0;
            return;
        }

        if (this.state === 'CLOSED') {
            this._failures.push(now);
            this._pruneWindow();
            if (this._failures.length >= this.failureThreshold) {
                this._transition('OPEN');
                this._openedAt = now;
            }
        }
        // In OPEN state, failures don't accumulate (requests aren't reaching the dependency)
    }

    /**
     * Check if the circuit allows a request through.
     * @returns {boolean}
     */
    isAllowed() {
        if (this.state === 'CLOSED') {
            return true;
        }

        if (this.state === 'OPEN') {
            const elapsed = Date.now() - this._openedAt;
            if (elapsed >= this.cooldownMs) {
                // BUG 109: Atomic probe lock — only one concurrent probe in HALF_OPEN
                if (this._probeInFlight) {
                    return false; // Another probe is already testing recovery
                }
                this._probeInFlight = true;
                this._transition('HALF_OPEN');
                this._halfOpenSuccesses = 0;
                return true;
            }
            return false;
        }

        // HALF_OPEN — allow probe requests (controlled by _probeInFlight)
        if (this._probeInFlight) {
            return false; // Only one probe at a time
        }
        this._probeInFlight = true;
        return true;
    }

    /**
     * Execute a function through the circuit breaker.
     *
     * @param {Function} fn - Async function to execute
     * @returns {Promise<*>} Result of fn
     * @throws {Error} 'CIRCUIT_OPEN' if breaker is open, or the original error
     */
    async execute(fn) {
        if (!this.isAllowed()) {
            const err = new Error(`Circuit breaker '${this.name}' is OPEN — request rejected`);
            err.code = 'CIRCUIT_OPEN';
            err.circuitBreaker = this.name;
            throw err;
        }

        try {
            const result = await fn();
            this.recordSuccess();
            return result;
        } catch (err) {
            if (isTransientError(err)) {
                this.recordFailure();
            }
            throw err;
        }
    }

    /**
     * Get circuit breaker status for monitoring.
     */
    getStatus() {
        this._pruneWindow();
        return {
            name: this.name,
            state: this.state,
            failuresInWindow: this._failures.length,
            failureThreshold: this.failureThreshold,
            openedAt: this._openedAt,
            halfOpenSuccesses: this._halfOpenSuccesses
        };
    }

    /**
     * Reset the circuit breaker to CLOSED state.
     */
    reset() {
        this._transition('CLOSED');
        this._failures = [];
        this._openedAt = null;
        this._halfOpenSuccesses = 0;
        this._probeInFlight = false; // BUG 109: Release probe lock on reset
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RETRY POLICY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retry policy with exponential backoff and jitter.
 *
 * Generalises the withRetry() pattern from storage-adapter.js with:
 * - Configurable base delay, max delay, max retries
 * - ±25% random jitter to prevent thundering herd
 * - Budget-aware: stops retrying if remaining time is insufficient
 * - Only retries transient errors (uses isTransientError)
 */
class RetryPolicy {
    /**
     * @param {Object} opts
     * @param {number} opts.maxRetries - Maximum retry attempts (default 3)
     * @param {number} opts.baseDelayMs - Base delay for exponential backoff (default 200)
     * @param {number} opts.maxDelayMs - Maximum delay cap (default 5000)
     * @param {number} opts.budgetMs - Total time budget; 0 = unlimited (default 0)
     */
    constructor(opts = {}) {
        // BUG 112: Validate with Number.isFinite to reject NaN/Infinity
        const safe = (v, fallback) => (Number.isFinite(v) ? v : fallback);
        this.maxRetries = Math.max(0, Math.floor(safe(opts.maxRetries, 3)));
        this.baseDelayMs = Math.max(10, safe(opts.baseDelayMs, 200));
        this.maxDelayMs = Math.max(this.baseDelayMs, safe(opts.maxDelayMs, 5000));
        this.budgetMs = Math.max(0, safe(opts.budgetMs, 0));
    }

    /**
     * Calculate delay for a given attempt with ±25% jitter.
     * @param {number} attempt - Zero-based attempt index
     * @returns {number} Delay in ms
     */
    getDelay(attempt) {
        // BUG 111: Cap exponent to prevent Math.pow overflow to Infinity
        const safeAttempt = Math.min(attempt, 30);
        const exponential = this.baseDelayMs * Math.pow(2, safeAttempt);
        const capped = Math.min(exponential, this.maxDelayMs);
        // ±25% jitter
        const jitter = capped * (0.75 + Math.random() * 0.5);
        return Math.round(jitter);
    }

    /**
     * Execute a function with retry logic.
     *
     * @param {Function} fn - Async function to execute
     * @param {string} [label] - Label for logging
     * @returns {Promise<*>} Result of fn
     * @throws The last error if all retries exhausted
     */
    async execute(fn, label = 'operation') {
        const startTime = Date.now();

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                return await fn();
            } catch (err) {
                const isLastAttempt = attempt >= this.maxRetries;
                const isRetryable = isTransientError(err);

                if (isLastAttempt || !isRetryable) {
                    throw err;
                }

                const delay = this.getDelay(attempt);

                // Budget check: don't retry if we'll exceed the time budget
                if (this.budgetMs > 0) {
                    const elapsed = Date.now() - startTime;
                    if (elapsed + delay > this.budgetMs) {
                        throw err;
                    }
                }

                console.warn(
                    `[ResilienceLayer] ${label}: transient error (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${delay}ms — ${err.message || err}`
                );
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESILIENCE LAYER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Orchestrates circuit breaker + retry + fallback for a single external call.
 *
 * Execution flow:
 *   1. Check circuit breaker — if OPEN, invoke fallback immediately
 *   2. Apply timeout wrapper (AbortController)
 *   3. Execute fn through retry policy (which only retries transient errors)
 *   4. On success: record success with circuit breaker
 *   5. On failure: record failure, invoke fallback if available
 */
class ResilienceLayer {
    /**
     * @param {Object} opts
     * @param {CircuitBreaker} opts.circuitBreaker
     * @param {RetryPolicy} opts.retryPolicy
     * @param {number} opts.timeoutMs - Per-call timeout in ms (default 15000)
     */
    constructor(opts = {}) {
        if (!opts.circuitBreaker || !(opts.circuitBreaker instanceof CircuitBreaker)) {
            throw new Error('ResilienceLayer: circuitBreaker must be a CircuitBreaker instance');
        }
        if (!opts.retryPolicy || !(opts.retryPolicy instanceof RetryPolicy)) {
            throw new Error('ResilienceLayer: retryPolicy must be a RetryPolicy instance');
        }
        this.circuitBreaker = opts.circuitBreaker;
        this.retryPolicy = opts.retryPolicy;
        this.timeoutMs = Math.max(1000, opts.timeoutMs ?? 15000);
    }

    /**
     * Execute a function with full resilience protection.
     *
     * @param {Function} fn - Async function to execute
     * @param {Object} [opts]
     * @param {string} [opts.name] - Operation name for logging
     * @param {Function} [opts.fallback] - Fallback function if all retries fail and circuit opens
     * @returns {Promise<*>}
     */
    async execute(fn, opts = {}) {
        const name = opts.name || 'unknown';
        const fallback = typeof opts.fallback === 'function' ? opts.fallback : null;

        // 1. Circuit breaker check
        if (!this.circuitBreaker.isAllowed()) {
            console.warn(
                `[ResilienceLayer] ${name}: circuit '${this.circuitBreaker.name}' is OPEN — using fallback`
            );
            if (fallback) {
                // BUG 115: Catch fallback errors at circuit-open path too
                try {
                    return await fallback();
                } catch (fallbackErr) {
                    console.error(
                        `[ResilienceLayer] ${name}: fallback failed — ${fallbackErr.message || fallbackErr}`
                    );
                    // Fall through to throw CIRCUIT_OPEN
                }
            }
            const err = new Error(`Circuit breaker '${this.circuitBreaker.name}' is OPEN — ${name} rejected`);
            err.code = 'CIRCUIT_OPEN';
            err.circuitBreaker = this.circuitBreaker.name;
            throw err;
        }

        // 2. Wrap fn with timeout using Promise.race (BUG 110: fixes async promise antipattern)
        const timeoutMs = this.timeoutMs;
        const timedFn = () => {
            let timer;
            const timeoutPromise = new Promise((_, reject) => {
                timer = setTimeout(() => {
                    reject(new Error(`${name}: timed out after ${timeoutMs}ms`));
                }, timeoutMs);
            });
            const fnPromise = Promise.resolve().then(() => fn());
            return Promise.race([fnPromise, timeoutPromise]).finally(() => {
                clearTimeout(timer);
            });
        };

        // 3. Execute through retry policy
        try {
            const result = await this.retryPolicy.execute(timedFn, name);
            this.circuitBreaker.recordSuccess();
            return result;
        } catch (err) {
            if (isTransientError(err)) {
                this.circuitBreaker.recordFailure();
            }

            // 4. Fallback on final failure
            // BUG 115: Catch fallback errors to prevent masking the original error
            if (fallback) {
                console.warn(
                    `[ResilienceLayer] ${name}: all retries exhausted, using fallback — ${err.message || err}`
                );
                try {
                    return await fallback();
                } catch (fallbackErr) {
                    console.error(
                        `[ResilienceLayer] ${name}: fallback also failed — ${fallbackErr.message || fallbackErr}`
                    );
                    throw err; // Throw original error, not fallback error
                }
            }
            throw err;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED CIRCUIT BREAKER INSTANCES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Global circuit breaker registry — one breaker per dependency type shared
 * across all agents. This ensures that if Supabase is failing for one agent,
 * ALL agents trip their Supabase breaker together.
 *
 * SERVERLESS NOTE (BUG 116): In Cloudflare Workers, each request runs in a
 * fresh isolate — the in-memory registry resets between invocations. This means
 * circuit breaker state does NOT persist across requests. The retry policy and
 * timeout protection remain fully effective per-request. For persistent circuit
 * breaking across requests, a future enhancement would use Cloudflare KV or
 * Durable Objects to store breaker state. The per-request retry + timeout still
 * provides substantial protection against cascading failures within a single
 * request lifecycle.
 */
const _breakerRegistry = new Map();

function getCircuitBreaker(name, opts = {}) {
    if (!_breakerRegistry.has(name)) {
        _breakerRegistry.set(name, new CircuitBreaker(name, opts));
    }
    return _breakerRegistry.get(name);
}

/**
 * Resets all circuit breakers and clears the registry.
 * Intended for test cleanup — do not call in production code.
 * @returns {void}
 */
function resetAllBreakers() {
    for (const breaker of _breakerRegistry.values()) {
        breaker.reset();
    }
    _breakerRegistry.clear();
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const SUPABASE_CONFIG = {
    circuitBreaker: { failureThreshold: 5, windowMs: 60000, cooldownMs: 60000, halfOpenMax: 2 },
    retry: { maxRetries: 3, baseDelayMs: 200, maxDelayMs: 3000, budgetMs: 25000 },
    timeoutMs: 10000
};

const ANTHROPIC_CONFIG = {
    circuitBreaker: { failureThreshold: 3, windowMs: 120000, cooldownMs: 120000, halfOpenMax: 2 },
    retry: { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 5000, budgetMs: 25000 },
    timeoutMs: 20000
};

const FETCH_CONFIG = {
    circuitBreaker: { failureThreshold: 5, windowMs: 60000, cooldownMs: 30000, halfOpenMax: 2 },
    retry: { maxRetries: 2, baseDelayMs: 300, maxDelayMs: 3000, budgetMs: 25000 },
    timeoutMs: 15000
};

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY: RESILIENT SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a resilient Supabase client that transparently wraps .from() calls
 * with circuit breaker + retry + timeout.
 *
 * The returned proxy looks and behaves exactly like the original Supabase client,
 * but every terminal query method (.select, .insert, .update, .delete, .upsert)
 * is wrapped through the ResilienceLayer.
 *
 * @param {Object} supabaseClient - Original Supabase client
 * @param {Object} [opts] - Override default SUPABASE_CONFIG
 * @returns {Object} Proxied Supabase client with resilience
 */
function createSupabaseResilience(supabaseClient, opts = {}) {
    if (!supabaseClient || typeof supabaseClient.from !== 'function') {
        throw new Error('createSupabaseResilience: supabaseClient must have a .from() method');
    }

    const config = {
        circuitBreaker: { ...SUPABASE_CONFIG.circuitBreaker, ...opts.circuitBreaker },
        retry: { ...SUPABASE_CONFIG.retry, ...opts.retry },
        timeoutMs: opts.timeoutMs ?? SUPABASE_CONFIG.timeoutMs
    };

    const breaker = getCircuitBreaker('supabase', config.circuitBreaker);
    const retryPolicy = new RetryPolicy(config.retry);
    const resilience = new ResilienceLayer({
        circuitBreaker: breaker,
        retryPolicy,
        timeoutMs: config.timeoutMs
    });

    /**
     * Wrap a query builder so that its terminal execution goes through resilience.
     * The Supabase PostgREST client uses a promise-based builder pattern:
     * supabase.from('table').select('*').eq('id', 1) returns a thenable.
     *
     * We intercept the .then() to wrap the actual HTTP call with resilience.
     */
    function wrapQueryBuilder(builder, tableName, operationType) {
        return new Proxy(builder, {
            get(target, prop) {
                const val = target[prop];

                // Intercept .then() — this is where the actual HTTP request fires
                if (prop === 'then') {
                    return function wrappedThen(onFulfill, onReject) {
                        const executionPromise = resilience.execute(
                            () => {
                                // Create a fresh promise from the builder
                                return new Promise((resolve, reject) => {
                                    // Call the original .then on the builder
                                    Function.prototype.call.call(
                                        Reflect.get(target, 'then', target),
                                        target,
                                        resolve,
                                        reject
                                    );
                                });
                            },
                            { name: `supabase.from('${tableName}').${operationType}` }
                        );
                        return executionPromise.then(onFulfill, onReject);
                    };
                }

                if (typeof val === 'function') {
                    return function (...args) {
                        const result = val.apply(target, args);
                        // If this returns a thenable (another builder), wrap it too
                        if (result && typeof result === 'object' && typeof result.then === 'function') {
                            return wrapQueryBuilder(result, tableName, operationType || prop);
                        }
                        return result;
                    };
                }
                return val;
            }
        });
    }

    // Proxy the supabase client — intercept .from() and .rpc()
    return new Proxy(supabaseClient, {
        get(target, prop) {
            if (prop === 'from') {
                return function wrappedFrom(tableName) {
                    const builder = target.from(tableName);
                    return wrapQueryBuilder(builder, tableName, null);
                };
            }
            // BUG 106: Wrap .rpc() calls through resilience layer
            if (prop === 'rpc') {
                return function wrappedRpc(fnName, params, options) {
                    return resilience.execute(
                        () => target.rpc(fnName, params, options),
                        { name: `supabase.rpc('${fnName}')` }
                    );
                };
            }
            // Pass through everything else (auth, storage, etc.)
            return target[prop];
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY: RESILIENT ANTHROPIC CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a resilient Anthropic client that transparently wraps
 * .messages.create() with circuit breaker + retry + timeout.
 *
 * @param {Object} anthropicClient - Original Anthropic SDK client
 * @param {Object} [opts] - Override default ANTHROPIC_CONFIG
 * @returns {Object} Proxied Anthropic client with resilience
 */
function createAnthropicResilience(anthropicClient, opts = {}) {
    if (!anthropicClient) {
        throw new Error('createAnthropicResilience: anthropicClient is required');
    }

    const config = {
        circuitBreaker: { ...ANTHROPIC_CONFIG.circuitBreaker, ...opts.circuitBreaker },
        retry: { ...ANTHROPIC_CONFIG.retry, ...opts.retry },
        timeoutMs: opts.timeoutMs ?? ANTHROPIC_CONFIG.timeoutMs
    };

    const breaker = getCircuitBreaker('anthropic', config.circuitBreaker);
    const retryPolicy = new RetryPolicy(config.retry);
    const resilience = new ResilienceLayer({
        circuitBreaker: breaker,
        retryPolicy,
        timeoutMs: config.timeoutMs
    });

    // BUG 113: Guard against undefined anthropicClient.messages
    if (!anthropicClient.messages || typeof anthropicClient.messages.create !== 'function') {
        throw new Error('createAnthropicResilience: anthropicClient must have a .messages.create() method');
    }

    // Proxy anthropic.messages to wrap .create() and .stream()
    const messagesProxy = new Proxy(anthropicClient.messages, {
        get(target, prop) {
            if (prop === 'create') {
                return async function wrappedCreate(params) {
                    return resilience.execute(
                        () => target.create.call(target, params),
                        { name: `anthropic.messages.create(model=${params?.model || 'unknown'})` }
                    );
                };
            }
            if (prop === 'stream') {
                return async function wrappedStream(params) {
                    return resilience.execute(
                        () => target.stream.call(target, params),
                        { name: `anthropic.messages.stream(model=${params?.model || 'unknown'})` }
                    );
                };
            }
            return target[prop];
        }
    });

    // Proxy the anthropic client to return our wrapped messages
    return new Proxy(anthropicClient, {
        get(target, prop) {
            if (prop === 'messages') {
                return messagesProxy;
            }
            return target[prop];
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY: RESILIENT FETCH WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a resilient fetch function that wraps native fetch() with circuit
 * breaker, retry, and timeout protection. Use for any bare HTTP calls to
 * external services (webhooks, AI gateways, third-party APIs).
 *
 * @param {string} serviceName — human-readable name for logging (e.g. 'slack-webhook', 'ai-gateway')
 * @param {object} [config] — optional config overrides (defaults to FETCH_CONFIG)
 * @returns {function} resilientFetch(url, options) — drop-in replacement for fetch()
 */
function createFetchResilience(serviceName, config = FETCH_CONFIG) {
    if (!serviceName || typeof serviceName !== 'string') {
        throw new Error('createFetchResilience: serviceName is required');
    }

    const breaker = getCircuitBreaker(`fetch:${serviceName}`, config.circuitBreaker);
    const retryPolicy = new RetryPolicy(config.retry);
    const resilience = new ResilienceLayer({
        circuitBreaker: breaker,
        retryPolicy,
        timeoutMs: config.timeoutMs
    });

    return async function resilientFetch(url, options) {
        return resilience.execute(
            () => fetch(url, options),
            { name: `fetch:${serviceName}(${typeof url === 'string' ? url.split('?')[0] : 'request'})` }
        );
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
    isTransientError,
    CircuitBreaker,
    RetryPolicy,
    ResilienceLayer,
    getCircuitBreaker,
    resetAllBreakers,
    createSupabaseResilience,
    createAnthropicResilience,
    createFetchResilience,
    SUPABASE_CONFIG,
    ANTHROPIC_CONFIG,
    FETCH_CONFIG
};
