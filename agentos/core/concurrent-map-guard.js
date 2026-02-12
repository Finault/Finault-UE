/**
 * CONCURRENT MAP GUARD (W-019)
 * Bounded Map with LRU eviction for security event tracking
 *
 * PROBLEMS FIXED:
 * 1. security-agent.js ~lines 403-429: _startEventCleanup() only WARNS when
 *    securityEvents Map exceeds maxSecurityEvents but does NOT evict entries.
 *    Under sustained attack, the Map grows unbounded, consuming memory.
 * 2. No eviction policy — stale entries accumulate until next cleanup cycle.
 *
 * SOLUTION:
 * 1. BoundedExpiringMap class with max size and TTL-based expiry
 * 2. Automatic LRU eviction when max size is exceeded
 * 3. pruneExpired() method for cleanup that also enforces size limit
 */

/**
 * Configuration defaults for concurrent map guard
 */
export const CONCURRENT_MAP_CONFIG = {
    defaultMaxSize: 10000,
    defaultTtlMs: 300000, // 5 minutes
    cleanupIntervalMs: 60000, // 1 minute
    allowEvictionCallback: true
};

/**
 * BoundedExpiringMap - A Map with automatic TTL-based expiry and LRU eviction
 *
 * Features:
 * - TTL-based expiration of entries
 * - Automatic LRU eviction when max size exceeded
 * - Access time tracking for LRU ordering
 * - Optional eviction callback
 * - Safe iterator methods that skip expired entries
 */
export class BoundedExpiringMap {
    /**
     * @param {Object} options
     * @param {number} options.maxSize - Maximum number of entries (default: 10000)
     * @param {number} options.ttlMs - Time-to-live in milliseconds (default: 300000)
     * @param {Function} options.onEvict - Callback when entry is evicted: (key, value, reason) => void
     */
    constructor(options = {}) {
        this.maxSize = options.maxSize ?? CONCURRENT_MAP_CONFIG.defaultMaxSize;
        this.ttlMs = options.ttlMs ?? CONCURRENT_MAP_CONFIG.defaultTtlMs;
        this.onEvict = options.onEvict || (() => {});

        // Internal storage: key -> { value, createdAt, lastAccessedAt }
        this.data = new Map();
    }

    /**
     * Set a value in the map
     * If at capacity and entry is new, evicts oldest entry first
     *
     * @param {*} key
     * @param {*} value
     */
    set(key, value) {
        const now = Date.now();

        // Update existing entry (doesn't change size)
        if (this.data.has(key)) {
            const entry = this.data.get(key);
            entry.value = value;
            entry.lastAccessedAt = now;
            return;
        }

        // For new entries, evict if at capacity (before adding)
        if (this.data.size >= this.maxSize && this.maxSize > 0) {
            this._evictOldest();
        }

        // Add new entry
        // Note: Don't set lastAccessedAt initially; let get() set it on first access
        // This way, entries that are set but never accessed have no lastAccessedAt
        this.data.set(key, {
            value: value,
            createdAt: now
        });

        // For maxSize of 0, we need to evict what we just added
        if (this.maxSize === 0 && this.data.has(key)) {
            this.data.delete(key);
        }
    }

    /**
     * Get a value from the map
     * Updates access time for LRU tracking
     *
     * @param {*} key
     * @returns {*} The value, or undefined if missing or expired
     */
    get(key) {
        const entry = this.data.get(key);

        // Entry doesn't exist
        if (!entry) {
            return undefined;
        }

        // Check if expired
        if (this._isExpired(entry)) {
            this.data.delete(key);
            return undefined;
        }

        // Update access time for LRU
        entry.lastAccessedAt = Date.now();
        return entry.value;
    }

    /**
     * Get with a default value
     *
     * @param {*} key
     * @param {*} defaultValue
     * @returns {*} The value, or defaultValue if missing or expired
     */
    getOrDefault(key, defaultValue) {
        const value = this.get(key);
        return value !== undefined ? value : defaultValue;
    }

    /**
     * Check if a key exists and is not expired
     *
     * @param {*} key
     * @returns {boolean}
     */
    has(key) {
        const entry = this.data.get(key);

        if (!entry) {
            return false;
        }

        if (this._isExpired(entry)) {
            this.data.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Delete an entry
     *
     * @param {*} key
     * @returns {boolean} True if entry existed and was deleted
     */
    delete(key) {
        return this.data.delete(key);
    }

    /**
     * Remove all expired entries AND enforce max size by evicting oldest
     * This is the main cleanup method to be called periodically
     */
    pruneExpired() {
        const now = Date.now();
        let removed = 0;

        // First pass: remove all expired entries
        const expiredKeys = [];
        for (const [key, entry] of this.data.entries()) {
            if (this._isExpired(entry)) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            const entry = this.data.get(key);
            this.data.delete(key);
            // Call onEvict for expired entries too
            this.onEvict(key, entry.value, 'expiry');
            removed++;
        }

        // Second pass: if still over max size, evict oldest entries
        while (this.data.size > this.maxSize) {
            this._evictOldest();
            removed++;
        }

        return removed;
    }

    /**
     * Get the number of non-expired entries
     */
    get size() {
        // Clean up expired entries and return count
        let count = 0;
        for (const [key, entry] of this.data.entries()) {
            if (!this._isExpired(entry)) {
                count++;
            }
        }
        return count;
    }

    /**
     * Get all keys (non-expired only)
     */
    *keys() {
        for (const [key, entry] of this.data.entries()) {
            if (!this._isExpired(entry)) {
                yield key;
            }
        }
    }

    /**
     * Get all values (non-expired only)
     */
    *values() {
        for (const entry of this.data.values()) {
            if (!this._isExpired(entry)) {
                yield entry.value;
            }
        }
    }

    /**
     * Get all entries (non-expired only)
     */
    *entries() {
        for (const [key, entry] of this.data.entries()) {
            if (!this._isExpired(entry)) {
                yield [key, entry.value];
            }
        }
    }

    /**
     * Check if an entry is expired
     * @private
     */
    _isExpired(entry) {
        return Date.now() - entry.createdAt > this.ttlMs;
    }

    /**
     * Evict the oldest entry (least recently accessed)
     * @private
     */
    _evictOldest() {
        // If map is empty, nothing to evict
        if (this.data.size === 0) {
            return;
        }

        let oldestKey = null;
        let oldestWasAccessed = true; // Start by preferring unacc accessed entries
        let oldestAccessTime = Date.now() + 1; // Start with future time

        for (const [key, entry] of this.data.entries()) {
            const wasAccessed = entry.lastAccessedAt !== undefined;
            const accessTime = wasAccessed ? entry.lastAccessedAt : entry.createdAt;

            // Prefer evicting entries that were never accessed
            // Otherwise, evict the least recently accessed one
            if (!wasAccessed && oldestWasAccessed) {
                // This entry was never accessed, and the current oldest was accessed
                // Prefer to evict this one
                oldestKey = key;
                oldestWasAccessed = false;
                oldestAccessTime = accessTime;
            } else if (wasAccessed === oldestWasAccessed && accessTime < oldestAccessTime) {
                // Same access status, choose the one with older access time
                oldestAccessTime = accessTime;
                oldestKey = key;
            }
        }

        if (oldestKey !== null) {
            const entry = this.data.get(oldestKey);
            this.data.delete(oldestKey);
            this.onEvict(oldestKey, entry.value, 'lru_eviction');
        }
    }
}

/**
 * Safe bulk removal from a Map using a predicate
 * Collects keys first, then deletes to avoid iteration edge cases
 *
 * @param {Map} map - The map to prune
 * @param {Function} predicate - Function returning true for entries to remove
 * @returns {number} Number of entries removed
 */
export function pruneMapByPredicate(map, predicate) {
    const keysToRemove = [];

    for (const [key, value] of map.entries()) {
        if (predicate(key, value)) {
            keysToRemove.push(key);
        }
    }

    let removed = 0;
    for (const key of keysToRemove) {
        if (map.delete(key)) {
            removed++;
        }
    }

    return removed;
}
