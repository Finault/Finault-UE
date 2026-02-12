import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CacheLayer, DurableEventQueue, EdgeCacheProxy, InfraScaling } from '../core/infra-scaling.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(message);
        console.log(`  ✗ FAIL: ${message}`);
    }
}

function assertEquals(actual, expected, message) {
    assert(actual === expected, `${message} (got ${actual}, expected ${expected})`);
}

function assertArrayEquals(actual, expected, message) {
    assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}`);
}

async function assertAsyncThrows(fn, expectedSubstring, message) {
    try {
        await fn();
        console.log(`  ✗ FAIL: ${message} (did NOT throw)`);
        failed++;
        failures.push(message);
    } catch (e) {
        if (expectedSubstring && !e.message.includes(expectedSubstring)) {
            console.log(`  ✗ FAIL: ${message} (threw "${e.message}" but expected "${expectedSubstring}")`);
            failed++;
            failures.push(message);
        } else {
            console.log(`  ✓ ${message}`);
            passed++;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE LAYER TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n📦 CACHE LAYER TESTS\n');

console.log('Basic Operations:');
{
    const cache = new CacheLayer({ maxSize: 100 });

    // set and get
    cache.set('key1', 'value1');
    assertEquals(cache.get('key1'), 'value1', 'set/get basic value');

    // get non-existent
    assertEquals(cache.get('nonexistent'), undefined, 'get non-existent returns undefined');

    // has
    assert(cache.has('key1'), 'has returns true for existing key');
    assert(!cache.has('nonexistent'), 'has returns false for non-existent key');

    // del
    assert(cache.del('key1'), 'del returns true on successful delete');
    assertEquals(cache.get('key1'), undefined, 'value gone after delete');
    assert(!cache.del('nonexistent'), 'del returns false for non-existent key');
}

console.log('\nTTL Expiration:');
{
    const cache = new CacheLayer({ maxSize: 100, cleanupIntervalMs: 0 });

    cache.set('ttl-key', 'value', 100); // 100ms TTL
    assert(cache.has('ttl-key'), 'key exists immediately after set');

    // Force expiration check
    setTimeout(() => {
        assert(!cache.has('ttl-key'), 'key expires after TTL');
    }, 150);
}

console.log('\nLRU Eviction:');
{
    const cache = new CacheLayer({ maxSize: 3 });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    assertEquals(cache.cache.size, 3, 'cache at max capacity');

    cache.set('d', 4); // Should evict 'a' (oldest)
    assertEquals(cache.cache.size, 3, 'cache maintains max size after eviction');
    assert(!cache.has('a'), 'oldest key evicted');
    assert(cache.has('d'), 'new key added');
    assertEquals(cache.stats.evictions, 1, 'eviction counter incremented');
}

console.log('\nBulk Operations:');
{
    const cache = new CacheLayer({ maxSize: 100 });

    // mset
    cache.mset({ 'k1': 'v1', 'k2': 'v2', 'k3': 'v3' });
    assertEquals(cache.cache.size, 3, 'mset sets multiple keys');

    // mget
    const result = cache.mget(['k1', 'k2', 'k4']);
    assertEquals(result['k1'], 'v1', 'mget retrieves k1');
    assertEquals(result['k2'], 'v2', 'mget retrieves k2');
    assert(!('k4' in result), 'mget excludes non-existent keys');
}

console.log('\nCache-Aside Pattern:');
{
    const cache = new CacheLayer({ maxSize: 100 });
    let factoryCalls = 0;

    const factory = async () => {
        factoryCalls++;
        return 'computed-value';
    };

    (async () => {
        const result1 = await cache.getOrSet('factory-key', factory, 5000);
        assertEquals(result1, 'computed-value', 'getOrSet calls factory on miss');
        assertEquals(factoryCalls, 1, 'factory called once');

        const result2 = await cache.getOrSet('factory-key', factory, 5000);
        assertEquals(result2, 'computed-value', 'getOrSet returns cached value on hit');
        assertEquals(factoryCalls, 1, 'factory not called again');
    })();
}

console.log('\nStatistics:');
{
    const cache = new CacheLayer({ maxSize: 100 });

    cache.set('k', 'v');
    cache.get('k'); // hit
    cache.get('nonexistent'); // miss
    cache.del('k');

    const stats = cache.getStats();
    assertEquals(stats.hits, 1, 'hits recorded');
    assertEquals(stats.misses, 1, 'misses recorded');
    assertEquals(stats.sets, 1, 'sets recorded');
    assertEquals(stats.deletes, 1, 'deletes recorded');
    assert(stats.hitRate.includes('50'), 'hit rate calculated');
}

console.log('\nClear Cache:');
{
    const cache = new CacheLayer({ maxSize: 100 });
    cache.set('k1', 'v1');
    cache.set('k2', 'v2');
    assertEquals(cache.cache.size, 2, 'cache has 2 items');

    cache.clear();
    assertEquals(cache.cache.size, 0, 'cache cleared');
    assertEquals(cache.accessOrder.length, 0, 'access order cleared');
}

console.log('\nCleanup Interval:');
{
    const cache = new CacheLayer({ maxSize: 100, cleanupIntervalMs: 100 });
    assert(cache._cleanupInterval !== null, 'cleanup interval started');

    cache.stopCleanup();
    assert(cache._cleanupInterval === null, 'cleanup interval stopped');
}

// ═══════════════════════════════════════════════════════════════════════════
// DURABLE EVENT QUEUE TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n📬 DURABLE EVENT QUEUE TESTS\n');

console.log('Basic Publish:');
{
    const queue = new DurableEventQueue();

    (async () => {
        await queue.publish('topic1', { msg: 'hello' });
        assertEquals(queue.stats.published, 1, 'publish increments counter');
        assert(queue.topics.has('topic1'), 'topic created');
    })();
}

console.log('\nSubscription and Processing:');
{
    const queue = new DurableEventQueue();
    let processed = [];

    queue.subscribe('events', (event) => {
        processed.push(event);
    });

    (async () => {
        await queue.publish('events', { data: 'test' });

        // Give processing time
        await new Promise(resolve => setTimeout(resolve, 100));

        assert(processed.length > 0, 'subscriber received event');
        assertEquals(processed[0].data, 'test', 'event data correct');
    })();
}

console.log('\nBatch Publishing:');
{
    const queue = new DurableEventQueue();

    (async () => {
        const events = [{ id: 1 }, { id: 2 }, { id: 3 }];
        await queue.publishBatch('batch-topic', events);

        assertEquals(queue.stats.published, 3, 'batch publish increments counter for each');
        assertEquals(queue.topics.get('batch-topic').length, 3, 'all events queued');
    })();
}

console.log('\nQueue Statistics:');
{
    const queue = new DurableEventQueue();

    (async () => {
        await queue.publish('stat-test', { val: 1 });
        await queue.publish('stat-test', { val: 2 });

        const stats = queue.getQueueStats();
        assert(stats.published >= 2, 'published count in stats');
        assert(stats.byTopic['stat-test'], 'topic in stats');
    })();
}

console.log('\nDead Letter Queue:');
{
    const queue = new DurableEventQueue({ maxRetries: 0 });
    let handler_called = false;

    queue.subscribe('dlq-test', (event) => {
        if (!handler_called) {
            handler_called = true;
            throw new Error('Intentional failure');
        }
    });

    (async () => {
        await queue.publish('dlq-test', { test: 'data' });

        await new Promise(resolve => setTimeout(resolve, 200));

        assertEquals(queue.dlq.length, 1, 'failed event in DLQ');
        assert(queue.dlq[0].error, 'error captured');
    })();
}

console.log('\nRetry with Backoff:');
{
    const queue = new DurableEventQueue({ maxRetries: 2, backoffMs: [100, 100] });
    let attempts = 0;

    queue.subscribe('retry-test', (event) => {
        attempts++;
        throw new Error('Transient error');
    });

    (async () => {
        await queue.publish('retry-test', { data: 'retry' });

        await new Promise(resolve => setTimeout(resolve, 300));

        assert(attempts >= 2, 'retried on failure');
    })();
}

console.log('\nMultiple Topics:');
{
    const queue = new DurableEventQueue();

    (async () => {
        await queue.publish('topic-a', { val: 'a' });
        await queue.publish('topic-b', { val: 'b' });
        await queue.publish('topic-c', { val: 'c' });

        assertEquals(queue.topics.size, 3, 'three topics created');
    })();
}

console.log('\nClear DLQ:');
{
    const queue = new DurableEventQueue({ maxRetries: 0 });

    queue.subscribe('clear-dlq-test', () => {
        throw new Error('fail');
    });

    (async () => {
        await queue.publish('clear-dlq-test', { data: 'test' });
        await new Promise(resolve => setTimeout(resolve, 100));

        const count = queue.clearDLQ();
        assert(count > 0, 'clearDLQ returns count');
        assertEquals(queue.dlq.length, 0, 'DLQ empty after clear');
    })();
}

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CACHE PROXY TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n🌐 EDGE CACHE PROXY TESTS\n');

console.log('Cache Response:');
{
    const edge = new EdgeCacheProxy({ defaultTtl: 60000 });

    const response = { status: 200, body: 'data' };
    edge.cacheResponse('key1', response, 10000);

    const cached = edge.getResponse('key1');
    assertEquals(JSON.stringify(cached), JSON.stringify(response), 'response cached and retrieved');
}

console.log('\nCache Expiration:');
{
    const edge = new EdgeCacheProxy({ defaultTtl: 100 });

    const response = { status: 200 };
    edge.cacheResponse('expiring', response, 100);

    const cached1 = edge.getResponse('expiring');
    assert(cached1 !== null, 'response available immediately');

    setTimeout(() => {
        const cached2 = edge.getResponse('expiring');
        assert(cached2 === null, 'expired response returns null');
    }, 150);
}

console.log('\nPattern-Based Invalidation:');
{
    const edge = new EdgeCacheProxy();

    edge.cacheResponse('user/123/profile', { name: 'Alice' });
    edge.cacheResponse('user/123/settings', { theme: 'dark' });
    edge.cacheResponse('user/456/profile', { name: 'Bob' });

    const count = edge.invalidate('user/123/*');
    assertEquals(count, 2, 'invalidate by pattern removes matching keys');

    assert(edge.getResponse('user/456/profile') !== null, 'non-matching keys preserved');
}

console.log('\nCache Control Headers:');
{
    const edge = new EdgeCacheProxy({ defaultTtl: 7200000 }); // 2 hours

    const header = edge.generateCacheControlHeader();
    assert(header.includes('max-age=7200'), 'cache control header generated');
    assert(header.includes('public'), 'public flag set');

    const customHeader = edge.generateCacheControlHeader(300);
    assert(customHeader.includes('max-age=300'), 'custom TTL in header');
}

console.log('\nCache Warm:');
{
    const edge = new EdgeCacheProxy();
    let warmCount = 0;

    const factory = async (key) => {
        warmCount++;
        return { data: key };
    };

    (async () => {
        const keys = ['key1', 'key2', 'key3'];
        await edge.warmCache(keys, factory);

        assertEquals(warmCount, 3, 'factory called for each key');
        assert(edge.getResponse('key1') !== null, 'warmed key available');
    })();
}

console.log('\nEdge Cache Stats:');
{
    const edge = new EdgeCacheProxy();

    edge.cacheResponse('hit-key', { data: 'value' });
    edge.getResponse('hit-key'); // hit
    edge.getResponse('miss-key'); // miss

    const stats = edge.getStats();
    assertEquals(stats.hits, 1, 'hits counted');
    assertEquals(stats.misses, 1, 'misses counted');
    assert(stats.hitRate.includes('50'), 'hit rate calculated');
}

console.log('\nClear Edge Cache:');
{
    const edge = new EdgeCacheProxy();

    edge.cacheResponse('k1', { data: '1' });
    edge.cacheResponse('k2', { data: '2' });
    assertEquals(edge.responses.size, 2, 'two items cached');

    edge.clear();
    assertEquals(edge.responses.size, 0, 'cache cleared');
}

// ═══════════════════════════════════════════════════════════════════════════
// INFRA SCALING INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n⚙️ INFRA SCALING INTEGRATION TESTS\n');

console.log('Factory Creation:');
{
    const infra = InfraScaling.create({
        cacheMaxSize: 1000,
        cacheCleanupIntervalMs: 60000,
        queueMaxRetries: 3,
        edgeCacheDefaultTtl: 3600000
    });

    assert(infra.cache instanceof CacheLayer, 'cache layer created');
    assert(infra.eventQueue instanceof DurableEventQueue, 'event queue created');
    assert(infra.edgeCache instanceof EdgeCacheProxy, 'edge cache created');
}

console.log('\nHealth Status:');
{
    const infra = InfraScaling.create();

    const health = infra.getHealthStatus();
    assertEquals(health.status, 'healthy', 'overall status healthy');
    assert(health.components.cache.healthy, 'cache healthy');
    assert(health.components.eventQueue.healthy, 'event queue healthy');
    assert(health.components.edgeCache.healthy, 'edge cache healthy');
    assert(health.timestamp, 'timestamp present');
}

console.log('\nIntegrated Workflow:');
{
    const infra = InfraScaling.create();

    (async () => {
        // Cache a computation
        const result = await infra.cache.getOrSet('expensive-key', async () => {
            return { result: 'computed' };
        }, 5000);

        assertEquals(result.result, 'computed', 'cache-aside pattern works');

        // Publish event
        infra.eventQueue.subscribe('workflow', (event) => {
            infra.edgeCache.cacheResponse(event.key, event.data);
        });

        await infra.eventQueue.publish('workflow', {
            key: 'cached-event',
            data: { status: 'success' }
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        const cachedEvent = infra.edgeCache.getResponse('cached-event');
        assert(cachedEvent !== null, 'event cache updated by handler');
    })();
}

console.log('\nShutdown:');
{
    const infra = InfraScaling.create();

    assert(infra.cache._cleanupInterval !== null, 'cleanup running');
    infra.shutdown();
    assert(infra.cache._cleanupInterval === null, 'cleanup stopped');
}

console.log('\nRedis Adapter Factory:');
{
    assertAsyncThrows(
        () => CacheLayer.createRedisAdapter('redis://localhost'),
        'Redis adapter',
        'Redis adapter factory throws with helpful message'
    );
}

console.log('\nKafka Adapter Factory:');
{
    assertAsyncThrows(
        () => DurableEventQueue.createKafkaAdapter('kafka://localhost'),
        'Kafka adapter',
        'Kafka adapter factory throws with helpful message'
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n🔧 EDGE CASES\n');

console.log('Empty Operations:');
{
    const cache = new CacheLayer();
    const empty = cache.mget([]);
    assertEquals(JSON.stringify(empty), '{}', 'mget empty array returns empty object');
}

console.log('\nNegative TTL:');
{
    const cache = new CacheLayer({ maxSize: 100, cleanupIntervalMs: 0 });
    cache.set('neg-ttl', 'value', -1000);
    assert(!cache.has('neg-ttl'), 'negative TTL immediately expires');
}

console.log('\nVery Large Cache:');
{
    const cache = new CacheLayer({ maxSize: 10000 });
    for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, `value${i}`);
    }
    assertEquals(cache.cache.size, 100, 'large cache stores many items');
}

console.log('\nMultiple Subscriptions Same Topic:');
{
    const queue = new DurableEventQueue();
    let count1 = 0, count2 = 0;

    queue.subscribe('multi', () => { count1++; });
    queue.subscribe('multi', () => { count2++; });

    (async () => {
        await queue.publish('multi', { val: 1 });
        await new Promise(resolve => setTimeout(resolve, 100));

        assert(count1 > 0 && count2 > 0, 'both subscribers called');
    })();
}

console.log('\nPattern Matching Edge Cases:');
{
    const edge = new EdgeCacheProxy();

    edge.cacheResponse('api/v1/users', { data: [] });
    edge.cacheResponse('api/v1/posts', { data: [] });
    edge.cacheResponse('api/v2/users', { data: [] });

    const v1Count = edge.invalidate('api/v1/*');
    assertEquals(v1Count, 2, 'wildcard pattern matches correctly');

    const v2Count = edge.invalidate('api/v2/*');
    assertEquals(v2Count, 1, 'another pattern match');
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(70));
console.log(`\n✅ PASSED: ${passed}`);
console.log(`❌ FAILED: ${failed}`);
console.log(`📊 TOTAL:  ${passed + failed}\n`);

if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach((f, i) => {
        console.log(`  ${i + 1}. ${f}`);
    });
    console.log();
}

process.exit(failed > 0 ? 1 : 0);
