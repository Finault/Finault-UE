/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DISTRIBUTED LOCK MANAGER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Provides distributed locking for coordinating work across multiple job queue
 * workers in a multi-instance Finault deployment. Prevents duplicate scheduled
 * job execution and ensures exclusive access to critical resources.
 *
 * Uses Compare-And-Swap (CAS) semantics:
 * - Lock acquisition: SET lock:{key} = {lockId} NX EX {ttl}
 * - Lock release: Only releases if lockId still matches (ownership verification)
 * - Lock renewal: Extend TTL if still owner
 *
 * Adapter interface:
 * {
 *   acquireLock(key, lockId, ttlMs) -> boolean
 *   releaseLock(key, lockId) -> boolean
 *   renewLock(key, lockId, ttlMs) -> boolean
 *   isLocked(key) -> { locked: boolean, ownerLockId?: string }
 * }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';

export class DistributedLockManager {
    /**
     * @param {Object} adapter - Persistence adapter with lock operations
     * @param {Function} adapter.acquireLock - SET NX EX semantics
     * @param {Function} adapter.releaseLock - Delete with CAS semantics
     * @param {Function} adapter.renewLock - Extend TTL if owner
     * @param {Function} adapter.isLocked - Check lock status
     */
    constructor(adapter = null) {
        this.adapter = adapter;
        // Fallback: in-memory locks for testing/demo without adapter
        this.inMemoryLocks = new Map(); // key -> { lockId, expiresAt }
    }

    /**
     * Acquire a distributed lock
     * @param {string} key - Lock key (e.g., "scheduled:job:123")
     * @param {number} [ttlMs=60000] - Time-to-live in milliseconds
     * @returns {Promise<{acquired: boolean, lockId?: string, expiresAt?: string}>}
     */
    async acquireLock(key, ttlMs = 60000) {
        if (!key) throw new Error('Lock key is required');

        const lockId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + ttlMs).toISOString();

        // Try persistence adapter first
        if (this.adapter && typeof this.adapter.acquireLock === 'function') {
            try {
                const acquired = await this.adapter.acquireLock(key, lockId, ttlMs);
                if (acquired) {
                    return { acquired: true, lockId, expiresAt };
                }
                return { acquired: false };
            } catch (err) {
                // Fall through to in-memory
                console.log('[DistributedLockManager] Adapter lock failed, using in-memory', {
                    key,
                    error: err.message
                });
            }
        }

        // Fallback: in-memory lock
        return this._acquireInMemoryLock(key, lockId, ttlMs, expiresAt);
    }

    /**
     * Release a lock (only if lockId matches — CAS semantics)
     * @param {string} key - Lock key
     * @param {string} lockId - Lock ID (must match to release)
     * @returns {Promise<{released: boolean}>}
     */
    async releaseLock(key, lockId) {
        if (!key || !lockId) throw new Error('Lock key and lockId are required');

        // Try persistence adapter first
        if (this.adapter && typeof this.adapter.releaseLock === 'function') {
            try {
                const released = await this.adapter.releaseLock(key, lockId);
                if (released) {
                    return { released: true };
                }
                return { released: false }; // lockId didn't match
            } catch (err) {
                console.log('[DistributedLockManager] Adapter release failed, using in-memory', {
                    key,
                    error: err.message
                });
            }
        }

        // Fallback: in-memory lock
        return this._releaseInMemoryLock(key, lockId);
    }

    /**
     * Renew a lock (extend TTL if still owner)
     * @param {string} key - Lock key
     * @param {string} lockId - Lock ID (must match)
     * @param {number} [ttlMs=60000] - New TTL in milliseconds
     * @returns {Promise<{renewed: boolean, expiresAt?: string}>}
     */
    async renewLock(key, lockId, ttlMs = 60000) {
        if (!key || !lockId) throw new Error('Lock key and lockId are required');

        const expiresAt = new Date(Date.now() + ttlMs).toISOString();

        // Try persistence adapter first
        if (this.adapter && typeof this.adapter.renewLock === 'function') {
            try {
                const renewed = await this.adapter.renewLock(key, lockId, ttlMs);
                if (renewed) {
                    return { renewed: true, expiresAt };
                }
                return { renewed: false };
            } catch (err) {
                console.log('[DistributedLockManager] Adapter renew failed, using in-memory', {
                    key,
                    error: err.message
                });
            }
        }

        // Fallback: in-memory lock
        return this._renewInMemoryLock(key, lockId, expiresAt);
    }

    /**
     * Execute a function while holding a lock
     * @param {string} key - Lock key
     * @param {Function} fn - async function to execute
     * @param {Object} [options={}] - Configuration
     * @param {number} [options.ttlMs=60000] - Lock TTL
     * @param {number} [options.retries=0] - Retry attempts if lock acquisition fails
     * @param {number} [options.retryDelayMs=100] - Delay between retries
     * @param {Function} [options.onLockFailed] - Callback if lock acquisition fails
     * @returns {Promise<*>} Result of fn() or null if lock could not be acquired
     */
    async withLock(key, fn, options = {}) {
        const {
            ttlMs = 60000,
            retries = 0,
            retryDelayMs = 100,
            onLockFailed = null
        } = options;

        let lockId = null;
        let lastError = null;

        // Try to acquire lock with retries
        for (let attempt = 0; attempt <= retries; attempt++) {
            const { acquired, lockId: lid } = await this.acquireLock(key, ttlMs);
            if (acquired) {
                lockId = lid;
                break;
            }

            if (attempt < retries) {
                await this._delay(retryDelayMs);
            } else {
                lastError = new Error(`Failed to acquire lock after ${retries + 1} attempts`);
            }
        }

        if (!lockId) {
            if (onLockFailed) {
                await onLockFailed(lastError);
            }
            return null;
        }

        try {
            // Execute function while holding lock
            const result = await fn();

            return result;
        } finally {
            // Always release lock
            await this.releaseLock(key, lockId);
        }
    }

    /**
     * Check if a key is locked
     * @param {string} key - Lock key
     * @returns {Promise<{locked: boolean, ownerLockId?: string, expiresAt?: string}>}
     */
    async isLocked(key) {
        if (!key) throw new Error('Lock key is required');

        // Try persistence adapter first
        if (this.adapter && typeof this.adapter.isLocked === 'function') {
            try {
                const result = await this.adapter.isLocked(key);
                return result;
            } catch (err) {
                console.log('[DistributedLockManager] Adapter isLocked failed, using in-memory', {
                    key,
                    error: err.message
                });
            }
        }

        // Fallback: in-memory check
        return this._isInMemoryLocked(key);
    }

    // ─── In-Memory Fallback Implementation ───────────────────────────────────────

    _acquireInMemoryLock(key, lockId, ttlMs, expiresAt) {
        const now = Date.now();
        const existingLock = this.inMemoryLocks.get(key);

        // Check if existing lock is still valid
        if (existingLock && new Date(existingLock.expiresAt).getTime() > now) {
            return { acquired: false };
        }

        // Acquire new lock
        this.inMemoryLocks.set(key, {
            lockId,
            expiresAt,
            acquiredAt: new Date().toISOString()
        });

        return { acquired: true, lockId, expiresAt };
    }

    _releaseInMemoryLock(key, lockId) {
        const existingLock = this.inMemoryLocks.get(key);

        // CAS: only release if lockId matches (ownership check)
        if (existingLock && existingLock.lockId === lockId) {
            this.inMemoryLocks.delete(key);
            return { released: true };
        }

        return { released: false };
    }

    _renewInMemoryLock(key, lockId, expiresAt) {
        const existingLock = this.inMemoryLocks.get(key);

        // CAS: only renew if lockId matches
        if (existingLock && existingLock.lockId === lockId) {
            existingLock.expiresAt = expiresAt;
            return { renewed: true, expiresAt };
        }

        return { renewed: false };
    }

    _isInMemoryLocked(key) {
        const existingLock = this.inMemoryLocks.get(key);

        if (!existingLock) {
            return { locked: false };
        }

        const now = Date.now();
        const lockExpireTime = new Date(existingLock.expiresAt).getTime();

        if (lockExpireTime > now) {
            return {
                locked: true,
                ownerLockId: existingLock.lockId,
                expiresAt: existingLock.expiresAt
            };
        }

        // Lock expired, clean it up
        this.inMemoryLocks.delete(key);
        return { locked: false };
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default DistributedLockManager;
