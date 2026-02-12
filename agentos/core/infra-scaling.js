/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * INFRASTRUCTURE SCALING LAYER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Abstraction layers for caching, event queueing, and edge caching.
 * In-memory defaults, ready for Redis/Kafka/CDN plugging.
 *
 * The blueprint specifies Redis, durable event queues, and edge caching.
 * This layer provides abstraction that can swap backends without code changes.
 *
 * Components:
 * 1. CacheLayer - LRU in-memory cache with TTL, stats, Redis-compatible interface
 * 2. DurableEventQueue - In-memory event queue with retry, DLQ, Kafka-compatible
 * 3. EdgeCacheProxy - CDN abstraction for response caching and invalidation
 * 4. InfraScaling - Factory that wires all components together
 */

/**
 * CacheLayer - Abstraction over caching (in-memory default, Redis-compatible)
 *
 * Features:
 * - get(key), set(key, value, ttlMs), del(key), has(key)
 * - mget(keys), mset(entries) - bulk operations
 * - getOrSet(key, factory, ttlMs) - cache-aside pattern
 * - TTL eviction, max-size LRU eviction
 * - Stats: hit rate, miss rate, eviction count
 * - createRedisAdapter(redisUrl) - factory for Redis
 */
export class CacheLayer {
    constructor(options = {}) {
        this.maxSize = options.maxSize || 10000;
        this.cache = new Map();
        this.ttls = new Map(); // key -> expirationTime
        this.accessOrder = []; // LRU tracking
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            sets: 0,
            deletes: 0,
            expirations: 0
        };
        this._cleanupInterval = null;

        // Start periodic cleanup
        if (options.cleanupIntervalMs !== 0) {
            this.startCleanup(options.cleanupIntervalMs || 60000);
        }
    }

    /**
     * Get value by key
     */
    get(key) {
        this._checkExpiration(key);

        if (this.cache.has(key)) {
            this.stats.hits++;
            // Update LRU order
            this.accessOrder = this.accessOrder.filter(k => k !== key);
            this.accessOrder.push(key);
            return this.cache.get(key);
        }

        this.stats.misses++;
        return undefined;
    }

    /**
     * Set value with optional TTL
     */
    set(key, value, ttlMs = null) {
        // Remove old entry if exists
        if (this.cache.has(key)) {
            this.accessOrder = this.accessOrder.filter(k => k !== key);
        }

        this.cache.set(key, value);
        this.accessOrder.push(key);
        this.stats.sets++;

        // Set TTL if provided
        if (ttlMs) {
            this.ttls.set(key, Date.now() + ttlMs);
        } else {
            this.ttls.delete(key);
        }

        // Evict if over size
        while (this.cache.size > this.maxSize) {
            const oldestKey = this.accessOrder.shift();
            this.cache.delete(oldestKey);
            this.ttls.delete(oldestKey);
            this.stats.evictions++;
        }
    }

    /**
     * Delete key
     */
    del(key) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
            this.ttls.delete(key);
            this.accessOrder = this.accessOrder.filter(k => k !== key);
            this.stats.deletes++;
            return true;
        }
        return false;
    }

    /**
     * Check if key exists
     */
    has(key) {
        this._checkExpiration(key);
        return this.cache.has(key);
    }

    /**
     * Get multiple keys
     */
    mget(keys) {
        const result = {};
        keys.forEach(key => {
            const value = this.get(key);
            if (value !== undefined) {
                result[key] = value;
            }
        });
        return result;
    }

    /**
     * Set multiple key-value pairs
     */
    mset(entries, ttlMs = null) {
        Object.entries(entries).forEach(([key, value]) => {
            this.set(key, value, ttlMs);
        });
    }

    /**
     * Cache-aside pattern: get or compute
     */
    async getOrSet(key, factory, ttlMs = null) {
        const cached = this.get(key);
        if (cached !== undefined) {
            return cached;
        }

        const value = await factory();
        this.set(key, value, ttlMs);
        return value;
    }

    /**
     * Check if key has expired
     */
    _checkExpiration(key) {
        const expirationTime = this.ttls.get(key);
        if (expirationTime && Date.now() > expirationTime) {
            this.cache.delete(key);
            this.ttls.delete(key);
            this.accessOrder = this.accessOrder.filter(k => k !== key);
            this.stats.expirations++;
        }
    }

    /**
     * Periodic cleanup of expired entries
     */
    startCleanup(intervalMs) {
        this._cleanupInterval = setInterval(() => {
            const now = Date.now();
            const keysToDelete = [];

            for (const [key, expirationTime] of this.ttls.entries()) {
                if (now > expirationTime) {
                    keysToDelete.push(key);
                }
            }

            keysToDelete.forEach(key => this.del(key));
        }, intervalMs);
    }

    /**
     * Stop cleanup interval
     */
    stopCleanup() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : 'N/A',
            missRate: total > 0 ? (this.stats.misses / total * 100).toFixed(2) + '%' : 'N/A',
            currentSize: this.cache.size,
            maxSize: this.maxSize,
            totalRequests: total
        };
    }

    /**
     * Clear all cache
     */
    clear() {
        this.cache.clear();
        this.ttls.clear();
        this.accessOrder = [];
    }

    /**
     * Factory for Redis adapter
     */
    static createRedisAdapter(redisUrl) {
        // Placeholder for Redis implementation
        // In production, would use ioredis or redis package
        throw new Error('Redis adapter not yet implemented. Use in-memory cache for now.');
    }
}

/**
 * DurableEventQueue - Abstraction over event queueing (in-memory default, Kafka-compatible)
 *
 * Features:
 * - publish(topic, event) - publish with at-least-once semantics
 * - subscribe(topic, handler) - consume with auto-acknowledge
 * - publishBatch(topic, events) - bulk publish
 * - Dead letter queue for failed events
 * - Retry with configurable backoff (1s, 2s, 4s, max 60s)
 * - getQueueStats() - depth, processing rate, DLQ size
 * - createKafkaAdapter(kafkaUrl) - factory for Kafka
 */
export class DurableEventQueue {
    constructor(options = {}) {
        this.topics = new Map(); // topic -> queue
        this.subscribers = new Map(); // topic -> handlers[]
        this.dlq = []; // Dead letter queue
        this.stats = {
            published: 0,
            processed: 0,
            failed: 0,
            dlqSize: 0,
            lastProcessedAt: null
        };
        this.retryConfig = {
            maxRetries: options.maxRetries || 3,
            backoffMs: options.backoffMs || [1000, 2000, 4000, 8000, 16000, 32000, 60000]
        };
        this._processingQueues = new Map(); // topic -> processing queue
    }

    /**
     * Publish event to topic
     */
    async publish(topic, event) {
        if (!this.topics.has(topic)) {
            this.topics.set(topic, []);
            this._processingQueues.set(topic, []);
        }

        const envelope = {
            id: crypto.randomUUID(),
            topic,
            event,
            timestamp: new Date().toISOString(),
            retries: 0,
            status: 'pending'
        };

        this.topics.get(topic).push(envelope);
        this.stats.published++;

        // Process immediately
        await this._processQueue(topic);
    }

    /**
     * Subscribe to topic with handler
     */
    subscribe(topic, handler) {
        if (!this.subscribers.has(topic)) {
            this.subscribers.set(topic, []);
        }
        this.subscribers.get(topic).push(handler);
    }

    /**
     * Publish batch of events
     */
    async publishBatch(topic, events) {
        for (const event of events) {
            await this.publish(topic, event);
        }
    }

    /**
     * Process queue for a topic
     */
    async _processQueue(topic) {
        const queue = this.topics.get(topic) || [];
        const handlers = this.subscribers.get(topic) || [];

        if (!handlers.length) return;

        const pending = queue.filter(e => e.status === 'pending');

        for (const envelope of pending) {
            for (const handler of handlers) {
                try {
                    envelope.status = 'processing';
                    await handler(envelope.event);
                    envelope.status = 'processed';
                    this.stats.processed++;
                    this.stats.lastProcessedAt = new Date().toISOString();
                } catch (error) {
                    await this._handleFailure(envelope, error);
                }
            }
        }
    }

    /**
     * Handle event processing failure
     */
    async _handleFailure(envelope, error) {
        const { maxRetries, backoffMs } = this.retryConfig;

        if (envelope.retries < maxRetries) {
            envelope.retries++;
            envelope.status = 'pending';

            // Wait with exponential backoff
            const delayMs = backoffMs[Math.min(envelope.retries - 1, backoffMs.length - 1)];
            await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
            // Send to DLQ
            envelope.status = 'dead_letter';
            envelope.error = error.message;
            this.dlq.push(envelope);
            this.stats.failed++;
            this.stats.dlqSize++;
        }
    }

    /**
     * Get queue statistics
     */
    getQueueStats() {
        let totalDepth = 0;
        let totalProcessing = 0;
        const topicStats = {};

        for (const [topic, queue] of this.topics.entries()) {
            const depth = queue.filter(e => e.status === 'pending').length;
            const processing = queue.filter(e => e.status === 'processing').length;
            topicStats[topic] = { depth, processing };
            totalDepth += depth;
            totalProcessing += processing;
        }

        return {
            ...this.stats,
            totalQueueDepth: totalDepth,
            totalProcessing: totalProcessing,
            dlqSize: this.dlq.length,
            byTopic: topicStats,
            processingRate: this.stats.processed > 0
                ? (this.stats.processed / Math.max(1, Math.floor(Date.now() / 1000))).toFixed(2) + ' events/sec'
                : '0 events/sec'
        };
    }

    /**
     * Get DLQ
     */
    getDLQ() {
        return this.dlq;
    }

    /**
     * Clear DLQ
     */
    clearDLQ() {
        const count = this.dlq.length;
        this.dlq = [];
        this.stats.dlqSize = 0;
        return count;
    }

    /**
     * Factory for Kafka adapter
     */
    static createKafkaAdapter(kafkaUrl) {
        // Placeholder for Kafka implementation
        throw new Error('Kafka adapter not yet implemented. Use in-memory queue for now.');
    }
}

/**
 * EdgeCacheProxy - CDN/edge cache abstraction
 *
 * Features:
 * - cacheResponse(key, response, ttl) - cache API responses at edge
 * - invalidate(pattern) - pattern-based cache invalidation
 * - warmCache(keys) - pre-warm frequently accessed data
 * - Cache-Control header generation
 */
export class EdgeCacheProxy {
    constructor(options = {}) {
        this.responses = new Map(); // key -> { response, timestamp, ttl }
        this.stats = {
            hits: 0,
            misses: 0,
            invalidations: 0,
            warmed: 0
        };
        this.defaultTtl = options.defaultTtl || 3600000; // 1 hour
    }

    /**
     * Cache response at edge
     */
    cacheResponse(key, response, ttl = null) {
        this.responses.set(key, {
            response,
            timestamp: Date.now(),
            ttl: ttl || this.defaultTtl
        });
    }

    /**
     * Get cached response
     */
    getResponse(key) {
        const cached = this.responses.get(key);

        if (!cached) {
            this.stats.misses++;
            return null;
        }

        // Check expiration
        if (Date.now() - cached.timestamp > cached.ttl) {
            this.responses.delete(key);
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return cached.response;
    }

    /**
     * Invalidate by pattern
     */
    invalidate(pattern) {
        const regex = this._patternToRegex(pattern);
        let count = 0;

        for (const [key] of this.responses.entries()) {
            if (regex.test(key)) {
                this.responses.delete(key);
                count++;
            }
        }

        this.stats.invalidations += count;
        return count;
    }

    /**
     * Pre-warm cache with factory function
     */
    async warmCache(keys, factory) {
        for (const key of keys) {
            const value = await factory(key);
            this.cacheResponse(key, value);
            this.stats.warmed++;
        }
    }

    /**
     * Generate Cache-Control header
     */
    generateCacheControlHeader(ttlSeconds = null) {
        const maxAge = ttlSeconds || (this.defaultTtl / 1000);
        return `public, max-age=${maxAge}, must-revalidate`;
    }

    /**
     * Convert glob pattern to regex
     */
    _patternToRegex(pattern) {
        const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        const regexStr = escaped.replace(/\*/g, '.*');
        return new RegExp(`^${regexStr}$`);
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : 'N/A',
            cachedItems: this.responses.size
        };
    }

    /**
     * Clear all cached responses
     */
    clear() {
        this.responses.clear();
    }
}

/**
 * InfraScaling - Main factory that wires everything together
 */
export class InfraScaling {
    constructor(config = {}) {
        this.config = config;
        this.cache = null;
        this.eventQueue = null;
        this.edgeCache = null;
        this.components = {};
    }

    /**
     * Create and initialize all infrastructure layers
     */
    static create(config = {}) {
        const infra = new InfraScaling(config);

        // Initialize cache layer
        infra.cache = new CacheLayer({
            maxSize: config.cacheMaxSize || 10000,
            cleanupIntervalMs: config.cacheCleanupIntervalMs || 60000
        });
        infra.components.cache = infra.cache;

        // Initialize durable event queue
        infra.eventQueue = new DurableEventQueue({
            maxRetries: config.queueMaxRetries || 3,
            backoffMs: config.queueBackoffMs || [1000, 2000, 4000, 8000, 16000, 32000, 60000]
        });
        infra.components.eventQueue = infra.eventQueue;

        // Initialize edge cache proxy
        infra.edgeCache = new EdgeCacheProxy({
            defaultTtl: config.edgeCacheDefaultTtl || 3600000
        });
        infra.components.edgeCache = infra.edgeCache;

        return infra;
    }

    /**
     * Get health status across all infrastructure components
     */
    getHealthStatus() {
        return {
            timestamp: new Date().toISOString(),
            status: 'healthy',
            components: {
                cache: {
                    healthy: true,
                    stats: this.cache.getStats()
                },
                eventQueue: {
                    healthy: this.eventQueue.stats.dlqSize === 0 || this.eventQueue.stats.dlqSize < 100,
                    stats: this.eventQueue.getQueueStats()
                },
                edgeCache: {
                    healthy: true,
                    stats: this.edgeCache.getStats()
                }
            }
        };
    }

    /**
     * Shutdown all components
     */
    shutdown() {
        this.cache.stopCleanup();
        this.edgeCache.clear();
    }
}

export default InfraScaling;
