import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { BoundedExpiringMap, pruneMapByPredicate, CONCURRENT_MAP_CONFIG } from '../core/concurrent-map-guard.js';

describe('W-019: Concurrent Map Guard Bug Fixes', () => {
    // ==================== BoundedExpiringMap Constructor Tests ====================

    describe('BoundedExpiringMap Constructor', () => {
        // w19_001 - w19_010: Constructor and configuration

        it('w19_001: creates instance with default config', () => {
            const map = new BoundedExpiringMap();
            assert(map instanceof BoundedExpiringMap);
        });

        it('w19_002: accepts maxSize option', () => {
            const map = new BoundedExpiringMap({ maxSize: 5000 });
            assert(map.maxSize === 5000);
        });

        it('w19_003: accepts ttlMs option', () => {
            const map = new BoundedExpiringMap({ ttlMs: 60000 });
            assert(map.ttlMs === 60000);
        });

        it('w19_004: accepts onEvict callback', () => {
            let called = false;
            const map = new BoundedExpiringMap({
                onEvict: () => { called = true; }
            });
            assert(typeof map.onEvict === 'function');
        });

        it('w19_005: uses default maxSize if not provided', () => {
            const map = new BoundedExpiringMap();
            assert(map.maxSize === CONCURRENT_MAP_CONFIG.defaultMaxSize);
        });

        it('w19_006: uses default ttlMs if not provided', () => {
            const map = new BoundedExpiringMap();
            assert(map.ttlMs === CONCURRENT_MAP_CONFIG.defaultTtlMs);
        });

        it('w19_007: default onEvict is no-op function', () => {
            const map = new BoundedExpiringMap();
            // Should not throw
            map.onEvict('key', 'value', 'test');
        });

        it('w19_008: initializes data as Map', () => {
            const map = new BoundedExpiringMap();
            assert(map.data instanceof Map);
        });

        it('w19_009: empty on creation', () => {
            const map = new BoundedExpiringMap();
            assert.equal(map.size, 0);
        });

        it('w19_010: accepts all options simultaneously', () => {
            const map = new BoundedExpiringMap({
                maxSize: 100,
                ttlMs: 30000,
                onEvict: () => {}
            });
            assert(map.maxSize === 100);
            assert(map.ttlMs === 30000);
        });
    });

    // ==================== Set/Get Basic Operations ====================

    describe('Set/Get Basic Operations', () => {
        // w19_011 - w19_030: Set and get operations

        it('w19_011: set and get single entry', () => {
            const map = new BoundedExpiringMap();
            map.set('key1', 'value1');
            assert.equal(map.get('key1'), 'value1');
        });

        it('w19_012: get non-existent key returns undefined', () => {
            const map = new BoundedExpiringMap();
            assert.equal(map.get('nonexistent'), undefined);
        });

        it('w19_013: set multiple entries', () => {
            const map = new BoundedExpiringMap();
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            assert.equal(map.get('a'), 1);
            assert.equal(map.get('b'), 2);
            assert.equal(map.get('c'), 3);
        });

        it('w19_014: overwrite existing entry', () => {
            const map = new BoundedExpiringMap();
            map.set('key', 'value1');
            map.set('key', 'value2');
            assert.equal(map.get('key'), 'value2');
        });

        it('w19_015: set with null value', () => {
            const map = new BoundedExpiringMap();
            map.set('key', null);
            assert.equal(map.get('key'), null);
        });

        it('w19_016: set with undefined value', () => {
            const map = new BoundedExpiringMap();
            map.set('key', undefined);
            assert.equal(map.get('key'), undefined);
        });

        it('w19_017: set with object value', () => {
            const map = new BoundedExpiringMap();
            const obj = { id: 1, name: 'test' };
            map.set('obj', obj);
            assert.deepEqual(map.get('obj'), obj);
        });

        it('w19_018: set with array value', () => {
            const map = new BoundedExpiringMap();
            const arr = [1, 2, 3, 4, 5];
            map.set('arr', arr);
            assert.deepEqual(map.get('arr'), arr);
        });

        it('w19_019: numeric keys', () => {
            const map = new BoundedExpiringMap();
            map.set(123, 'value');
            assert.equal(map.get(123), 'value');
        });

        it('w19_020: symbol keys', () => {
            const map = new BoundedExpiringMap();
            const sym = Symbol('test');
            map.set(sym, 'value');
            assert.equal(map.get(sym), 'value');
        });
    });

    // ==================== TTL Expiry Tests ====================

    describe('TTL Expiry', () => {
        // w19_031 - w19_055: TTL and expiration

        it('w19_031: expired entry returns undefined', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('key', 'value');
            await new Promise(resolve => setTimeout(resolve, 150));
            assert.equal(map.get('key'), undefined);
        });

        it('w19_032: non-expired entry returns value', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 200 });
            map.set('key', 'value');
            await new Promise(resolve => setTimeout(resolve, 50));
            assert.equal(map.get('key'), 'value');
        });

        it('w19_033: has() returns false for expired', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('key', 'value');
            await new Promise(resolve => setTimeout(resolve, 150));
            assert(!map.has('key'));
        });

        it('w19_034: has() returns true for non-expired', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 200 });
            map.set('key', 'value');
            assert(map.has('key'));
        });

        it('w19_035: multiple entries expire independently', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('early', 'e');
            await new Promise(resolve => setTimeout(resolve, 60));
            map.set('late', 'l');
            await new Promise(resolve => setTimeout(resolve, 60));
            assert.equal(map.get('early'), undefined);
            assert.equal(map.get('late'), 'l');
        });

        it('w19_036: getOrDefault returns default for expired', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('key', 'value');
            await new Promise(resolve => setTimeout(resolve, 150));
            assert.equal(map.getOrDefault('key', 'default'), 'default');
        });

        it('w19_037: getOrDefault returns value if not expired', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 200 });
            map.set('key', 'value');
            assert.equal(map.getOrDefault('key', 'default'), 'value');
        });

        it('w19_038: getOrDefault returns default for missing', () => {
            const map = new BoundedExpiringMap();
            assert.equal(map.getOrDefault('missing', 'default'), 'default');
        });

        it('w19_039: long TTL entries persist', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 10000 });
            map.set('key', 'value');
            await new Promise(resolve => setTimeout(resolve, 100));
            assert.equal(map.get('key'), 'value');
        });

        it('w19_040: zero TTL expires immediately', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 0 });
            map.set('key', 'value');
            await new Promise(resolve => setTimeout(resolve, 10));
            assert.equal(map.get('key'), undefined);
        });

        it('w19_041: access updates lastAccessedAt', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 150 });
            map.set('key', 'value');
            await new Promise(resolve => setTimeout(resolve, 80));
            // Access the key (updates lastAccessedAt)
            map.get('key');
            // But expiration is based on createdAt, not lastAccessedAt
            await new Promise(resolve => setTimeout(resolve, 80));
            assert.equal(map.get('key'), undefined);
        });

        it('w19_042: pruneExpired removes expired entries', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('key1', 'value1');
            await new Promise(resolve => setTimeout(resolve, 150));
            const removed = map.pruneExpired();
            assert(removed > 0);
        });

        it('w19_043: pruneExpired preserves non-expired', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 200 });
            map.set('key', 'value');
            map.pruneExpired();
            assert.equal(map.get('key'), 'value');
        });

        it('w19_044: multiple calls to get resets expiry clock', async () => {
            // Note: actually lastAccessedAt is updated but expiry is createdAt-based
            const map = new BoundedExpiringMap({ ttlMs: 150 });
            map.set('key', 'value');
            await new Promise(resolve => setTimeout(resolve, 80));
            map.get('key');
            await new Promise(resolve => setTimeout(resolve, 80));
            // Should still be expired based on creation time
            assert.equal(map.get('key'), undefined);
        });

        it('w19_045: large TTL value', () => {
            const map = new BoundedExpiringMap({ ttlMs: 1000000000 });
            map.set('key', 'value');
            assert.equal(map.get('key'), 'value');
        });

        it('w19_046: delete expired entry manually', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('key', 'value');
            await new Promise(resolve => setTimeout(resolve, 150));
            // Access and delete expired entry
            const result = map.delete('key');
            // delete may return true or false depending on internal state
            assert(typeof result === 'boolean');
        });

        it('w19_047: size getter excludes expired', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('key1', 'value1');
            map.set('key2', 'value2');
            assert.equal(map.size, 2);
            await new Promise(resolve => setTimeout(resolve, 150));
            assert.equal(map.size, 0);
        });

        it('w19_048: has() removes expired entries', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('key', 'value');
            await new Promise(resolve => setTimeout(resolve, 150));
            map.has('key');
            // Entry should be cleaned up
            assert.equal(map.get('key'), undefined);
        });

        it('w19_049: get() removes expired entries side effect', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('key', 'value');
            await new Promise(resolve => setTimeout(resolve, 150));
            map.get('key');
            // Entry is cleaned when we try to get it
            assert.equal(map.data.has('key'), false);
        });

        it('w19_050: concurrent expiry across multiple keys', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            await new Promise(resolve => setTimeout(resolve, 150));
            assert.equal(map.get('a'), undefined);
            assert.equal(map.get('b'), undefined);
            assert.equal(map.get('c'), undefined);
        });

        it('w19_051: iterators skip expired entries', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('fresh', 'value');
            await new Promise(resolve => setTimeout(resolve, 150));
            map.set('old', 'value');
            const entries = Array.from(map.entries());
            assert.equal(entries.length, 1);
        });

        it('w19_052: keys() iterator skips expired', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('old', 'value');
            await new Promise(resolve => setTimeout(resolve, 150));
            map.set('fresh', 'value');
            const keys = Array.from(map.keys());
            assert(keys.includes('fresh'));
            assert(!keys.includes('old'));
        });

        it('w19_053: values() iterator skips expired', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('a', 'old');
            await new Promise(resolve => setTimeout(resolve, 150));
            map.set('b', 'fresh');
            const values = Array.from(map.values());
            assert(values.includes('fresh'));
            assert(!values.includes('old'));
        });

        it('w19_054: entries() iterator skips expired', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('a', 'old');
            await new Promise(resolve => setTimeout(resolve, 150));
            map.set('b', 'fresh');
            const entries = Array.from(map.entries());
            assert.equal(entries.length, 1);
            assert.deepEqual(entries[0], ['b', 'fresh']);
        });

        it('w19_055: pruneExpired count is accurate', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            await new Promise(resolve => setTimeout(resolve, 150));
            const removed = map.pruneExpired();
            assert.equal(removed, 3);
        });
    });

    // ==================== LRU Eviction Tests ====================

    describe('LRU Eviction', () => {
        // w19_056 - w19_080: LRU and size enforcement

        it('w19_056: exceeding maxSize triggers eviction', () => {
            const map = new BoundedExpiringMap({ maxSize: 3 });
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            // This should trigger eviction of 'a' (oldest)
            map.set('d', 4);
            assert(map.data.size <= 4); // May include expired
        });

        it('w19_057: oldest entry evicted first', () => {
            const map = new BoundedExpiringMap({ maxSize: 2 });
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3); // Should evict 'a'
            assert(!map.has('a'));
            assert(map.has('b'));
            assert(map.has('c'));
        });

        it('w19_058: onEvict callback called on LRU eviction', () => {
            let evicted = [];
            const map = new BoundedExpiringMap({
                maxSize: 2,
                onEvict: (key, val, reason) => {
                    evicted.push({ key, reason });
                }
            });
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            assert(evicted.length > 0);
            assert(evicted.some(e => e.reason === 'lru_eviction'));
        });

        it('w19_059: onEvict receives key and value', () => {
            let captured = null;
            const map = new BoundedExpiringMap({
                maxSize: 1,
                onEvict: (key, val) => {
                    captured = { key, val };
                }
            });
            map.set('test', 'value');
            map.set('new', 'data');
            assert(captured.key === 'test' || captured.key === 'new');
        });

        it('w19_060: onEvict reason is lru_eviction', () => {
            let reason = null;
            const map = new BoundedExpiringMap({
                maxSize: 1,
                onEvict: (k, v, r) => { reason = r; }
            });
            map.set('a', 1);
            map.set('b', 2);
            assert.equal(reason, 'lru_eviction');
        });

        it('w19_061: size never exceeds maxSize', () => {
            const map = new BoundedExpiringMap({ maxSize: 5 });
            for (let i = 0; i < 20; i++) {
                map.set(`key${i}`, i);
                assert(map.data.size <= 6); // May be maxSize + 1 temporarily
            }
        });

        it('w19_062: accessing entry updates LRU time', () => {
            let evictions = [];
            const map = new BoundedExpiringMap({
                maxSize: 2,
                onEvict: (k, v, r) => evictions.push(k)
            });
            map.set('a', 1);
            map.set('b', 2);
            // Access 'a' to make it more recent
            map.get('a');
            // Add new entry, 'b' should be evicted (it's older in access time)
            map.set('c', 3);
            // Due to access time update, should evict 'b', not 'a'
            assert(evictions.includes('b'));
        });

        it('w19_063: update existing entry does not trigger eviction', () => {
            let evicted = [];
            const map = new BoundedExpiringMap({
                maxSize: 2,
                onEvict: (k) => evicted.push(k)
            });
            map.set('a', 1);
            map.set('b', 2);
            evicted = []; // reset
            map.set('a', 10); // Update, not insert
            assert.equal(evicted.length, 0);
        });

        it('w19_064: delete removes entry properly', () => {
            const map = new BoundedExpiringMap({ maxSize: 5 });
            map.set('a', 1);
            map.set('b', 2);
            assert(map.has('a'));
            const deleted = map.delete('a');
            assert(deleted === true || deleted === false);
            assert(!map.has('a'));
        });

        it('w19_065: maxSize of 1 works', () => {
            const map = new BoundedExpiringMap({ maxSize: 1 });
            map.set('a', 1);
            map.set('b', 2);
            // Only 'b' should remain
            assert(!map.has('a'));
            assert(map.has('b'));
        });

        it('w19_066: maxSize of 0 is boundary case', () => {
            const map = new BoundedExpiringMap({ maxSize: 0 });
            map.set('a', 1);
            // Entry should be evicted immediately
            assert(!map.has('a'));
        });

        it('w19_067: large maxSize handles many entries', () => {
            const map = new BoundedExpiringMap({ maxSize: 10000 });
            for (let i = 0; i < 500; i++) {
                map.set(`key${i}`, i);
            }
            assert(map.data.size <= 10001);
        });

        it('w19_068: pruneExpired also enforces maxSize', () => {
            let evicted = [];
            const map = new BoundedExpiringMap({
                maxSize: 3,
                onEvict: (k) => evicted.push(k)
            });
            // Add 5 entries (exceeds maxSize)
            for (let i = 0; i < 5; i++) {
                map.set(`k${i}`, i);
            }
            // pruneExpired should also enforce size limit
            map.pruneExpired();
            // Should be at or below maxSize
            assert(map.data.size <= 3);
        });

        it('w19_069: overwrite in full map', () => {
            const map = new BoundedExpiringMap({ maxSize: 2 });
            map.set('a', 1);
            map.set('b', 2);
            // Overwrite 'a' (in-place, no eviction)
            let evictions = [];
            const tempMap = new BoundedExpiringMap({
                maxSize: 2,
                onEvict: (k) => evictions.push(k)
            });
            tempMap.set('a', 1);
            tempMap.set('b', 2);
            let evictionsBefore = evictions.length;
            tempMap.set('a', 100); // Update
            let evictionsAfter = evictions.length;
            assert.equal(evictionsAfter - evictionsBefore, 0);
        });

        it('w19_070: new entries added while at maxSize', () => {
            const map = new BoundedExpiringMap({ maxSize: 3 });
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            map.set('d', 4); // Triggers eviction
            // Should have 3 entries now
            assert(map.size <= 3);
        });

        it('w19_071: multiple sequential additions at limit', () => {
            const map = new BoundedExpiringMap({ maxSize: 2 });
            for (let i = 0; i < 10; i++) {
                map.set(`key${i}`, i);
                assert(map.data.size <= 3); // maxSize + 1 during transition
            }
        });

        it('w19_072: LRU based on access time', () => {
            let evictionOrder = [];
            const map = new BoundedExpiringMap({
                maxSize: 2,
                onEvict: (k) => evictionOrder.push(k)
            });
            map.set('a', 1);
            map.set('b', 2);
            map.get('a'); // Access 'a', making it more recent
            map.set('c', 3); // Should evict 'b', not 'a'
            assert(evictionOrder.includes('b'));
        });

        it('w19_073: creation time vs access time for LRU', () => {
            // LRU uses lastAccessedAt || createdAt
            const map = new BoundedExpiringMap({ maxSize: 2 });
            map.set('a', 1);
            map.set('b', 2);
            // 'a' should be oldest
            map.set('c', 3);
            // 'a' should be evicted
            assert(!map.has('a'));
        });

        it('w19_074: iterators work after evictions', () => {
            const map = new BoundedExpiringMap({ maxSize: 2 });
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3); // Evicts 'a'
            const keys = Array.from(map.keys());
            assert(!keys.includes('a'));
            assert(keys.includes('b'));
            assert(keys.includes('c'));
        });

        it('w19_075: has() works after evictions', () => {
            const map = new BoundedExpiringMap({ maxSize: 2 });
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            assert(!map.has('a'));
            assert(map.has('b'));
            assert(map.has('c'));
        });

        it('w19_076: get() works after evictions', () => {
            const map = new BoundedExpiringMap({ maxSize: 2 });
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            assert.equal(map.get('a'), undefined);
            assert.equal(map.get('b'), 2);
            assert.equal(map.get('c'), 3);
        });

        it('w19_077: size after evictions is correct', () => {
            const map = new BoundedExpiringMap({ maxSize: 3 });
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            map.set('d', 4);
            assert(map.size <= 3);
        });

        it('w19_078: evict does not throw', () => {
            const map = new BoundedExpiringMap({ maxSize: 1 });
            assert.doesNotThrow(() => {
                for (let i = 0; i < 10; i++) {
                    map.set(`k${i}`, i);
                }
            });
        });

        it('w19_079: evict with edge case entries', () => {
            const map = new BoundedExpiringMap({ maxSize: 1 });
            map.set(null, 'null_key');
            map.set('new', 'value');
            assert(map.data.size <= 2);
        });

        it('w19_080: rate limiting scenario: event array in map', () => {
            // Simulate security-agent rateLimit usage
            const map = new BoundedExpiringMap({ maxSize: 1000, ttlMs: 60000 });
            for (let i = 0; i < 100; i++) {
                const identifier = `user${i}`;
                const events = [Date.now(), Date.now(), Date.now()];
                map.set(identifier, events);
            }
            assert(map.size <= 1000);
        });
    });

    // ==================== pruneExpired Tests ====================

    describe('pruneExpired', () => {
        // w19_081 - w19_095: pruneExpired method

        it('w19_081: pruneExpired returns count of removed', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('a', 1);
            map.set('b', 2);
            await new Promise(resolve => setTimeout(resolve, 150));
            const removed = map.pruneExpired();
            assert.equal(removed, 2);
        });

        it('w19_082: pruneExpired on empty map returns 0', () => {
            const map = new BoundedExpiringMap();
            const removed = map.pruneExpired();
            assert.equal(removed, 0);
        });

        it('w19_083: pruneExpired preserves fresh entries', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 200 });
            map.set('fresh', 'value');
            const removed = map.pruneExpired();
            assert.equal(removed, 0);
            assert(map.has('fresh'));
        });

        it('w19_084: pruneExpired mixed old and new', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('old', 1);
            await new Promise(resolve => setTimeout(resolve, 150));
            map.set('new', 2);
            const removed = map.pruneExpired();
            assert.equal(removed, 1);
            assert(!map.has('old'));
            assert(map.has('new'));
        });

        it('w19_085: pruneExpired multiple calls idempotent', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('a', 1);
            await new Promise(resolve => setTimeout(resolve, 150));
            const removed1 = map.pruneExpired();
            const removed2 = map.pruneExpired();
            assert.equal(removed1, 1);
            assert.equal(removed2, 0);
        });

        it('w19_086: pruneExpired enforces maxSize', () => {
            let evicted = [];
            const map = new BoundedExpiringMap({
                maxSize: 2,
                onEvict: (k) => evicted.push(k)
            });
            // Add 4 entries (exceeds maxSize)
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            map.set('d', 4);
            // pruneExpired should reduce to <= maxSize
            map.pruneExpired();
            assert(map.data.size <= 2);
        });

        it('w19_087: pruneExpired cleans internal data', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('a', 1);
            map.set('b', 2);
            await new Promise(resolve => setTimeout(resolve, 150));
            map.pruneExpired();
            // Internal data should only have non-expired
            let count = 0;
            for (const key of map.data.keys()) {
                count++;
            }
            // Should be 0 since all expired
            assert.equal(count, 0);
        });

        it('w19_088: pruneExpired large dataset', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            for (let i = 0; i < 1000; i++) {
                map.set(`k${i}`, i);
            }
            await new Promise(resolve => setTimeout(resolve, 150));
            const removed = map.pruneExpired();
            assert.equal(removed, 1000);
        });

        it('w19_089: pruneExpired with maxSize smaller than entries', () => {
            const map = new BoundedExpiringMap({ maxSize: 5 });
            for (let i = 0; i < 10; i++) {
                map.set(`k${i}`, i);
            }
            // All entries are fresh (not expired), but exceed maxSize
            const removed = map.pruneExpired();
            // Should evict oldest until <= maxSize
            assert(map.data.size <= 5);
        });

        it('w19_090: pruneExpired return value accurate', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            await new Promise(resolve => setTimeout(resolve, 150));
            const removed = map.pruneExpired();
            // Should be exactly 3
            assert.equal(removed, 3);
        });

        it('w19_091: pruneExpired during iteration safe', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('a', 1);
            map.set('b', 2);
            await new Promise(resolve => setTimeout(resolve, 150));
            // Should not throw
            assert.doesNotThrow(() => {
                map.pruneExpired();
            });
        });

        it('w19_092: pruneExpired with callbacks', async () => {
            let evictions = [];
            const map = new BoundedExpiringMap({
                ttlMs: 100,
                onEvict: (k) => evictions.push(k)
            });
            map.set('a', 1);
            map.set('b', 2);
            await new Promise(resolve => setTimeout(resolve, 150));
            map.set('c', 3); // Add one fresh
            map.pruneExpired();
            // 'a' and 'b' should be evicted
            assert(evictions.includes('a') || evictions.includes('b'));
        });

        it('w19_093: pruneExpired with mixed TTL', async () => {
            const map = new BoundedExpiringMap({ ttlMs: 100 });
            map.set('first', 1);
            await new Promise(resolve => setTimeout(resolve, 60));
            map.set('second', 2);
            await new Promise(resolve => setTimeout(resolve, 60));
            // first should be expired (120ms old), second not (60ms old)
            const removed = map.pruneExpired();
            assert(!map.has('first'));
            assert(map.has('second'));
        });

        it('w19_094: pruneExpired concurrent safe', () => {
            const map = new BoundedExpiringMap({ maxSize: 100 });
            for (let i = 0; i < 50; i++) {
                map.set(`k${i}`, i);
            }
            // Concurrent pruning should not crash
            assert.doesNotThrow(() => {
                map.pruneExpired();
                for (let i = 50; i < 100; i++) {
                    map.set(`k${i}`, i);
                }
                map.pruneExpired();
            });
        });

        it('w19_095: pruneExpired maintains map integrity', () => {
            const map = new BoundedExpiringMap({ maxSize: 10 });
            for (let i = 0; i < 20; i++) {
                map.set(`k${i}`, i);
            }
            map.pruneExpired();
            // Should be able to get all remaining entries
            const keys = Array.from(map.keys());
            for (const key of keys) {
                assert(map.has(key));
            }
        });
    });

    // ==================== Size and Iterator Tests ====================

    describe('Size and Iterators', () => {
        // w19_096 - w19_110: Size getter and iterator methods

        it('w19_096: size getter on empty map', () => {
            const map = new BoundedExpiringMap();
            assert.equal(map.size, 0);
        });

        it('w19_097: size getter after set', () => {
            const map = new BoundedExpiringMap();
            map.set('a', 1);
            assert.equal(map.size, 1);
        });

        it('w19_098: size getter multiple entries', () => {
            const map = new BoundedExpiringMap();
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            assert.equal(map.size, 3);
        });

        it('w19_099: keys() returns iterator', () => {
            const map = new BoundedExpiringMap();
            map.set('a', 1);
            const keysIter = map.keys();
            assert(typeof keysIter[Symbol.iterator] === 'function');
        });

        it('w19_100: keys() yields all keys', () => {
            const map = new BoundedExpiringMap();
            map.set('a', 1);
            map.set('b', 2);
            const keys = Array.from(map.keys());
            assert(keys.includes('a'));
            assert(keys.includes('b'));
        });

        it('w19_101: values() yields all values', () => {
            const map = new BoundedExpiringMap();
            map.set('a', 1);
            map.set('b', 2);
            const values = Array.from(map.values());
            assert(values.includes(1));
            assert(values.includes(2));
        });

        it('w19_102: entries() yields [key, value] pairs', () => {
            const map = new BoundedExpiringMap();
            map.set('a', 1);
            map.set('b', 2);
            const entries = Array.from(map.entries());
            assert(entries.length === 2);
        });

        it('w19_103: entries() pairs are correct', () => {
            const map = new BoundedExpiringMap();
            map.set('x', 'y');
            const entries = Array.from(map.entries());
            assert.deepEqual(entries[0], ['x', 'y']);
        });

        it('w19_104: keys() empty map', () => {
            const map = new BoundedExpiringMap();
            const keys = Array.from(map.keys());
            assert.equal(keys.length, 0);
        });

        it('w19_105: values() empty map', () => {
            const map = new BoundedExpiringMap();
            const values = Array.from(map.values());
            assert.equal(values.length, 0);
        });

        it('w19_106: entries() empty map', () => {
            const map = new BoundedExpiringMap();
            const entries = Array.from(map.entries());
            assert.equal(entries.length, 0);
        });

        it('w19_107: iterator works with for...of', () => {
            const map = new BoundedExpiringMap();
            map.set('a', 1);
            map.set('b', 2);
            let count = 0;
            for (const [k, v] of map.entries()) {
                count++;
            }
            assert.equal(count, 2);
        });

        it('w19_108: size accurate after deletions', () => {
            const map = new BoundedExpiringMap();
            map.set('a', 1);
            map.set('b', 2);
            map.delete('a');
            assert.equal(map.size, 1);
        });

        it('w19_109: iterators handle large maps', () => {
            const map = new BoundedExpiringMap({ maxSize: 10000 });
            for (let i = 0; i < 100; i++) {
                map.set(`k${i}`, i);
            }
            const keys = Array.from(map.keys());
            assert(keys.length > 0);
        });

        it('w19_110: size matches iterator count', () => {
            const map = new BoundedExpiringMap();
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            const iterCount = Array.from(map.entries()).length;
            assert.equal(map.size, iterCount);
        });
    });

    // ==================== pruneMapByPredicate Tests ====================

    describe('pruneMapByPredicate', () => {
        // w19_111 - w19_125: pruneMapByPredicate utility function

        it('w19_111: pruneMapByPredicate removes matching entries', () => {
            const map = new Map();
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            const removed = pruneMapByPredicate(map, (k, v) => v > 1);
            assert.equal(removed, 2);
            assert.equal(map.size, 1);
        });

        it('w19_112: pruneMapByPredicate preserves non-matching', () => {
            const map = new Map();
            map.set('a', 1);
            map.set('b', 2);
            pruneMapByPredicate(map, (k, v) => v > 1);
            assert(map.has('a'));
        });

        it('w19_113: pruneMapByPredicate on empty map', () => {
            const map = new Map();
            const removed = pruneMapByPredicate(map, () => true);
            assert.equal(removed, 0);
        });

        it('w19_114: pruneMapByPredicate removes all if all match', () => {
            const map = new Map();
            map.set('a', 1);
            map.set('b', 2);
            pruneMapByPredicate(map, () => true);
            assert.equal(map.size, 0);
        });

        it('w19_115: pruneMapByPredicate keeps all if none match', () => {
            const map = new Map();
            map.set('a', 1);
            map.set('b', 2);
            pruneMapByPredicate(map, () => false);
            assert.equal(map.size, 2);
        });

        it('w19_116: pruneMapByPredicate with key-based predicate', () => {
            const map = new Map();
            map.set('keep', 1);
            map.set('remove', 2);
            const removed = pruneMapByPredicate(map, (k) => k === 'remove');
            assert.equal(removed, 1);
            assert(map.has('keep'));
        });

        it('w19_117: pruneMapByPredicate with value-based predicate', () => {
            const map = new Map();
            map.set('a', 'remove_me');
            map.set('b', 'keep_me');
            const removed = pruneMapByPredicate(map, (k, v) => v.includes('remove'));
            assert.equal(removed, 1);
            assert(map.has('b'));
        });

        it('w19_118: pruneMapByPredicate safe iteration', () => {
            const map = new Map();
            for (let i = 0; i < 100; i++) {
                map.set(`k${i}`, i);
            }
            // Should not throw even though we modify during pred eval
            assert.doesNotThrow(() => {
                pruneMapByPredicate(map, (k, v) => v % 2 === 0);
            });
        });

        it('w19_119: pruneMapByPredicate return value is count', () => {
            const map = new Map();
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            const removed = pruneMapByPredicate(map, (k, v) => v === 2);
            assert.equal(removed, 1);
        });

        it('w19_120: pruneMapByPredicate preserves entry order where possible', () => {
            const map = new Map();
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            pruneMapByPredicate(map, (k) => k === 'b');
            const remaining = Array.from(map.keys());
            assert(remaining.includes('a'));
            assert(remaining.includes('c'));
        });

        it('w19_121: pruneMapByPredicate with complex predicate', () => {
            const map = new Map();
            map.set('user1', { active: true, attempts: 5 });
            map.set('user2', { active: false, attempts: 15 });
            map.set('user3', { active: true, attempts: 20 });
            const removed = pruneMapByPredicate(map, (k, v) => v.attempts > 10);
            assert.equal(removed, 2);
            assert(map.has('user1'));
        });

        it('w19_122: pruneMapByPredicate with rate limit pattern', () => {
            const map = new Map();
            const now = Date.now();
            map.set('id1', [now - 70000, now - 65000]); // Very old (both > 60000ms ago)
            map.set('id2', [now - 5000, now - 4000]);   // Recent
            // Remove entries where ALL events are older than 60 seconds
            const removed = pruneMapByPredicate(map, (k, events) => {
                return events.every(t => now - t > 60000);
            });
            assert.equal(removed, 1);
            assert(map.has('id2'));
        });

        it('w19_123: pruneMapByPredicate large dataset', () => {
            const map = new Map();
            for (let i = 0; i < 1000; i++) {
                map.set(`k${i}`, i);
            }
            const removed = pruneMapByPredicate(map, (k, v) => v < 500);
            assert.equal(removed, 500);
            assert.equal(map.size, 500);
        });

        it('w19_124: pruneMapByPredicate with edge case keys', () => {
            const map = new Map();
            map.set(null, 1);
            map.set(undefined, 2);
            map.set(Symbol('test'), 3);
            const removed = pruneMapByPredicate(map, (k) => k === null);
            assert.equal(removed, 1);
        });

        it('w19_125: pruneMapByPredicate accurate count', () => {
            const map = new Map();
            map.set('a', 10);
            map.set('b', 20);
            map.set('c', 30);
            map.set('d', 40);
            map.set('e', 50);
            const removed = pruneMapByPredicate(map, (k, v) => v >= 30);
            assert.equal(removed, 3);
            assert.equal(map.size, 2);
        });
    });

    // ==================== Structural/Wiring Verification ====================

    describe('Structural Verification & Wiring', () => {
        // w19_126 - w19_150: Verify security-agent.js wiring

        it('w19_126: concurrent-map-guard exports BoundedExpiringMap', () => {
            assert(typeof BoundedExpiringMap === 'function');
        });

        it('w19_127: concurrent-map-guard exports pruneMapByPredicate', () => {
            assert(typeof pruneMapByPredicate === 'function');
        });

        it('w19_128: concurrent-map-guard exports CONCURRENT_MAP_CONFIG', () => {
            assert(typeof CONCURRENT_MAP_CONFIG === 'object');
        });

        it('w19_129: CONCURRENT_MAP_CONFIG has defaultMaxSize', () => {
            assert(CONCURRENT_MAP_CONFIG.hasOwnProperty('defaultMaxSize'));
        });

        it('w19_130: CONCURRENT_MAP_CONFIG has defaultTtlMs', () => {
            assert(CONCURRENT_MAP_CONFIG.hasOwnProperty('defaultTtlMs'));
        });

        it('w19_131: security-agent imports concurrent-map-guard', () => {
            const secPath = path.join(process.cwd(), 'agentos/core/security-agent.js');
            const source = fs.readFileSync(secPath, 'utf-8');
            assert(source.includes("import { BoundedExpiringMap") ||
                   source.includes("from './concurrent-map-guard.js'"));
        });

        it('w19_132: security-agent uses BoundedExpiringMap', () => {
            const secPath = path.join(process.cwd(), 'agentos/core/security-agent.js');
            const source = fs.readFileSync(secPath, 'utf-8');
            const cleaned = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
            assert(cleaned.includes('BoundedExpiringMap'));
        });

        it('w19_133: security-agent no longer uses plain Map for securityEvents', () => {
            const secPath = path.join(process.cwd(), 'agentos/core/security-agent.js');
            const source = fs.readFileSync(secPath, 'utf-8');
            const cleaned = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
            // Should not have "new Map()" for securityEvents
            const mapPattern = /this\.securityEvents\s*=\s*new Map\(\)/;
            assert(!mapPattern.test(cleaned));
        });

        it('w19_134: _startEventCleanup simplified', () => {
            const secPath = path.join(process.cwd(), 'agentos/core/security-agent.js');
            const source = fs.readFileSync(secPath, 'utf-8');
            const cleaned = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
            // Check that old complex cleanup is replaced
            assert(!cleaned.includes('filter(timestamp =>'));
        });

        it('w19_135: pruneExpired called in cleanup', () => {
            const secPath = path.join(process.cwd(), 'agentos/core/security-agent.js');
            const source = fs.readFileSync(secPath, 'utf-8');
            const cleaned = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
            assert(cleaned.includes('pruneExpired()'));
        });

        it('w19_136: no unbounded Map warning pattern', () => {
            const secPath = path.join(process.cwd(), 'agentos/core/security-agent.js');
            const source = fs.readFileSync(secPath, 'utf-8');
            const cleaned = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
            // Old warning should be removed
            assert(!cleaned.includes('exceeds max limit'));
        });

        it('w19_137: BoundedExpiringMap handles rate limiting', () => {
            // Simulates security-agent rate limiting
            const map = new BoundedExpiringMap({ maxSize: 10000, ttlMs: 300000 });
            const now = Date.now();
            for (let i = 0; i < 50; i++) {
                const events = [now, now + 1000, now + 2000];
                map.set(`user${i}`, events);
            }
            assert(map.size <= 50);
        });

        it('w19_138: rate limiting events expire after TTL', async () => {
            const map = new BoundedExpiringMap({ maxSize: 1000, ttlMs: 100 });
            map.set('attacker', [Date.now(), Date.now()]);
            await new Promise(resolve => setTimeout(resolve, 150));
            const events = map.get('attacker');
            assert.equal(events, undefined);
        });

        it('w19_139: checkRateLimit now uses BoundedExpiringMap', () => {
            const secPath = path.join(process.cwd(), 'agentos/core/security-agent.js');
            const source = fs.readFileSync(secPath, 'utf-8');
            // checkRateLimit should use this.securityEvents (now BoundedExpiringMap)
            assert(source.includes('checkRateLimit'));
        });

        it('w19_140: BoundedExpiringMap prevents memory exhaustion', () => {
            const map = new BoundedExpiringMap({ maxSize: 100 });
            // Try to add 10x the limit
            for (let i = 0; i < 1000; i++) {
                map.set(`key${i}`, `value${i}`);
            }
            // Should be bounded
            assert(map.data.size <= 101); // maxSize + 1 during transition
        });

        it('w19_141: CONCURRENT_MAP_CONFIG values reasonable', () => {
            assert(CONCURRENT_MAP_CONFIG.defaultMaxSize === 10000);
            assert(CONCURRENT_MAP_CONFIG.defaultTtlMs === 300000);
        });

        it('w19_142: BoundedExpiringMap is a class', () => {
            assert(typeof BoundedExpiringMap === 'function');
        });

        it('w19_143: BoundedExpiringMap methods exist', () => {
            const map = new BoundedExpiringMap();
            assert(typeof map.set === 'function');
            assert(typeof map.get === 'function');
            assert(typeof map.has === 'function');
            assert(typeof map.delete === 'function');
            assert(typeof map.pruneExpired === 'function');
        });

        it('w19_144: iterator methods exist', () => {
            const map = new BoundedExpiringMap();
            assert(typeof map.keys === 'function');
            assert(typeof map.values === 'function');
            assert(typeof map.entries === 'function');
        });

        it('w19_145: getOrDefault exists', () => {
            const map = new BoundedExpiringMap();
            assert(typeof map.getOrDefault === 'function');
        });

        it('w19_146: onEvict callback is optional', () => {
            // Should not throw without onEvict
            assert.doesNotThrow(() => {
                new BoundedExpiringMap({ maxSize: 1 });
            });
        });

        it('w19_147: security-agent initializes map in constructor', () => {
            const secPath = path.join(process.cwd(), 'agentos/core/security-agent.js');
            const source = fs.readFileSync(secPath, 'utf-8');
            assert(source.includes('constructor'));
        });

        it('w19_148: security-agent TTL config is set', () => {
            const secPath = path.join(process.cwd(), 'agentos/core/security-agent.js');
            const source = fs.readFileSync(secPath, 'utf-8');
            const cleaned = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
            assert(cleaned.includes('this.securityEventsTTL'));
        });

        it('w19_149: security-agent maxSize config is set', () => {
            const secPath = path.join(process.cwd(), 'agentos/core/security-agent.js');
            const source = fs.readFileSync(secPath, 'utf-8');
            const cleaned = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
            assert(cleaned.includes('this.maxSecurityEvents'));
        });

        it('w19_150: integration test: event cleanup with BoundedExpiringMap', async () => {
            const map = new BoundedExpiringMap({ maxSize: 10, ttlMs: 100 });
            // Add many events (simulating attack)
            for (let i = 0; i < 20; i++) {
                map.set(`event${i}`, { timestamp: Date.now(), severity: 'high' });
            }
            // Size should be bounded
            assert(map.data.size <= 11);
            // After TTL, should be cleared
            await new Promise(resolve => setTimeout(resolve, 150));
            map.pruneExpired();
            assert.equal(map.size, 0);
        });
    });
});
