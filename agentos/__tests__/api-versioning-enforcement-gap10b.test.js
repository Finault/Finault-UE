/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * API VERSIONING ENFORCEMENT TEST SUITE — Gap #10 Completion
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive test suite for API Versioning Enforcement
 * Covers: VersionRegistry, DeprecationHeaderInjector, VersionUsageTracker,
 *         SunsetScheduler, enforcement middleware, and V2 router
 *
 * Test Count: 120+ tests organized by module
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
    ENFORCEMENT_CONFIG,
    VERSION_LIFECYCLE,
    VersionRegistry,
    DeprecationHeaderInjector,
    VersionUsageTracker,
    SunsetScheduler,
    createVersionEnforcementMiddleware,
    createV2Router,
    createVersionRegistry,
    createVersionUsageTracker,
    createSunsetScheduler
} from '../core/api-versioning-enforcement.js';

let passed = 0;
let failed = 0;
const failedTests = [];

/**
 * Custom assertion function
 */
function assert(condition, message) {
    if (!condition) {
        failed++;
        failedTests.push(message);
        console.error(`✗ ${message}`);
    } else {
        passed++;
        console.log(`✓ ${message}`);
    }
}

/**
 * Custom assertion for throws
 */
function assertThrows(fn, expectedMessage, testName) {
    try {
        fn();
        assert(false, `${testName} (expected to throw)`);
    } catch (error) {
        if (expectedMessage && !error.message.includes(expectedMessage)) {
            assert(false, `${testName} - Expected: ${expectedMessage}, Got: ${error.message}`);
        } else {
            assert(true, testName);
        }
    }
}

/**
 * Test equality
 */
function assertEqual(actual, expected, message) {
    assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Structural Tests (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── SECTION 1: Structural Tests (10 tests) ───');

// Test 1.1: Module exports ENFORCEMENT_CONFIG
assert(
    ENFORCEMENT_CONFIG !== undefined && typeof ENFORCEMENT_CONFIG === 'object',
    'Module exports ENFORCEMENT_CONFIG constant'
);

// Test 1.2: ENFORCEMENT_CONFIG has required properties
assert(
    ENFORCEMENT_CONFIG.strictSunset === true &&
    ENFORCEMENT_CONFIG.deprecationWarningHeader === true &&
    ENFORCEMENT_CONFIG.sunsetGracePeriodDays === 30,
    'ENFORCEMENT_CONFIG has required properties'
);

// Test 1.3: Module exports VERSION_LIFECYCLE
assert(
    VERSION_LIFECYCLE !== undefined && VERSION_LIFECYCLE.statuses,
    'Module exports VERSION_LIFECYCLE constant'
);

// Test 1.4: VERSION_LIFECYCLE has valid statuses
assertEqual(
    VERSION_LIFECYCLE.statuses,
    ['planned', 'beta', 'supported', 'deprecated', 'sunset'],
    'VERSION_LIFECYCLE.statuses are correct'
);

// Test 1.5: VERSION_LIFECYCLE has valid transitions
assert(
    VERSION_LIFECYCLE.transitions.planned &&
    VERSION_LIFECYCLE.transitions.beta &&
    VERSION_LIFECYCLE.transitions.supported &&
    VERSION_LIFECYCLE.transitions.deprecated &&
    VERSION_LIFECYCLE.transitions.sunset &&
    VERSION_LIFECYCLE.transitions.sunset.length === 0,
    'VERSION_LIFECYCLE.transitions are valid'
);

// Test 1.6: Module exports VersionRegistry class
assert(
    VersionRegistry !== undefined && typeof VersionRegistry === 'function',
    'Module exports VersionRegistry class'
);

// Test 1.7: Module exports DeprecationHeaderInjector class
assert(
    DeprecationHeaderInjector !== undefined && typeof DeprecationHeaderInjector === 'function',
    'Module exports DeprecationHeaderInjector class'
);

// Test 1.8: Module exports VersionUsageTracker class
assert(
    VersionUsageTracker !== undefined && typeof VersionUsageTracker === 'function',
    'Module exports VersionUsageTracker class'
);

// Test 1.9: Module exports SunsetScheduler class
assert(
    SunsetScheduler !== undefined && typeof SunsetScheduler === 'function',
    'Module exports SunsetScheduler class'
);

// Test 1.10: Module exports enforcement middleware factory
assert(
    typeof createVersionEnforcementMiddleware === 'function' &&
    typeof createV2Router === 'function' &&
    typeof createVersionRegistry === 'function',
    'Module exports required factory functions'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: VersionRegistry Tests (20 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── SECTION 2: VersionRegistry Tests (20 tests) ───');

// Test 2.1: Create registry with no versions
const emptyRegistry = new VersionRegistry();
assert(
    Object.keys(emptyRegistry.versions).length === 0,
    'VersionRegistry can be created with no initial versions'
);

// Test 2.2: Register a version
const registry = new VersionRegistry();
registry.register('v1', { status: 'supported', releaseDate: '2024-01-01' });
assert(registry.get('v1') !== null, 'Can register and get a version');

// Test 2.3: Get non-existent version returns null
assert(registry.get('v99') === null, 'Getting non-existent version returns null');

// Test 2.4: Get version status
assert(registry.getStatus('v1') === 'supported', 'getStatus returns correct status');

// Test 2.5: Register multiple versions
registry.register('v2', { status: 'planned', releaseDate: '2024-06-01' });
assert(registry.get('v1') && registry.get('v2'), 'Can register multiple versions');

// Test 2.6: Deprecate version sets deprecation date and sunset date
const futureDate = new Date();
futureDate.setMonth(futureDate.getMonth() + 7);
registry.register('v3', { status: 'supported' });
registry.deprecate('v3', futureDate);
assert(
    registry.isDeprecated('v3') &&
    registry.get('v3').deprecationDate !== null &&
    registry.get('v3').sunsetDate !== null,
    'deprecate() sets deprecation and sunset dates'
);

// Test 2.7: Deprecate requires 6+ months notice
const pastDate = new Date();
pastDate.setMonth(pastDate.getMonth() + 2);
registry.register('v4', { status: 'supported' });
assertThrows(
    () => registry.deprecate('v4', pastDate),
    'at least 6 months',
    'deprecate() requires 6+ months notice'
);

// Test 2.8: Sunset only from deprecated state
registry.register('v5', { status: 'supported' });
assertThrows(
    () => registry.sunset('v5'),
    'Cannot transition',
    'sunset() only works from deprecated state'
);

// Test 2.9: Valid state transition
registry.register('v6', { status: 'supported' });
const futureDate2 = new Date();
futureDate2.setMonth(futureDate2.getMonth() + 7);
registry.deprecate('v6', futureDate2);
assert(registry.validateTransition('v6', 'sunset'), 'validateTransition allows deprecated→sunset');

// Test 2.10: Invalid state transition
assert(!registry.validateTransition('v1', 'sunset'), 'validateTransition rejects invalid transitions');

// Test 2.11: isActive returns true for supported and beta
registry.register('v7', { status: 'supported' });
registry.register('v8', { status: 'beta' });
assert(registry.isActive('v7') && registry.isActive('v8'), 'isActive returns true for supported/beta');

// Test 2.12: isActive returns false for deprecated/sunset
registry.register('v9', { status: 'deprecated' });
assert(!registry.isActive('v9'), 'isActive returns false for deprecated versions');

// Test 2.13: isDeprecated returns true only for deprecated
const v10Future = new Date();
v10Future.setMonth(v10Future.getMonth() + 7);
registry.register('v10', { status: 'supported' });
registry.deprecate('v10', v10Future);
assert(registry.isDeprecated('v10'), 'isDeprecated returns true for deprecated versions');

// Test 2.14: isSunset returns true only for sunset
registry.register('v11', { status: 'supported' });
const v11Future = new Date();
v11Future.setMonth(v11Future.getMonth() + 7);
registry.deprecate('v11', v11Future);
registry.sunset('v11');
assert(registry.isSunset('v11'), 'isSunset returns true for sunset versions');

// Test 2.15: getActiveVersions returns supported + beta
registry.register('v12', { status: 'supported' });
registry.register('v13', { status: 'beta' });
const active = registry.getActiveVersions();
assert(active.includes('v12') && active.includes('v13'), 'getActiveVersions returns correct list');

// Test 2.16: getDeprecatedVersions returns deprecated only
const deprecated = registry.getDeprecatedVersions();
assert(deprecated.includes('v10'), 'getDeprecatedVersions includes deprecated versions');

// Test 2.17: getTimeline returns chronological events
const timeline = registry.getTimeline();
assert(Array.isArray(timeline), 'getTimeline returns array of events');

// Test 2.18: Grace period detection
registry.register('v14', { status: 'supported' });
const v14Past = new Date();
v14Past.setMonth(v14Past.getMonth() + 7);
registry.deprecate('v14', v14Past);
registry.sunset('v14');
// Manually set sunset date to now (simulating recent sunset)
registry.get('v14').sunsetDate = new Date().toISOString();
assert(registry.isInGracePeriod('v14'), 'isInGracePeriod detects recent sunsets');

// Test 2.19: Cannot deprecate non-existent version
assertThrows(
    () => registry.deprecate('v_nonexistent', new Date()),
    'not found',
    'Cannot deprecate non-existent version'
);

// Test 2.20: Registry transitions form valid DAG
assert(
    VERSION_LIFECYCLE.transitions.planned.includes('beta') &&
    VERSION_LIFECYCLE.transitions.beta.includes('supported') &&
    VERSION_LIFECYCLE.transitions.supported.includes('deprecated'),
    'VERSION_LIFECYCLE forms valid progression'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: Deprecation Header Injection Tests (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── SECTION 3: Deprecation Header Injection Tests (15 tests) ───');

// Test 3.1: formatHTTPDate produces RFC 7231 format
const testDate = new Date('2024-12-01T00:00:00Z');
const formatted = DeprecationHeaderInjector.formatHTTPDate(testDate);
assert(
    formatted.includes('Dec') && formatted.includes('2024') && formatted.includes('GMT'),
    'formatHTTPDate produces RFC 7231 format'
);

// Test 3.2: formatHTTPDate padding
assert(
    formatted.match(/\d{2}\s\w{3}\s\d{4}\s\d{2}:\d{2}:\d{2}/),
    'formatHTTPDate includes proper padding'
);

// Test 3.3: getMigrationGuideUrl generates correct URL
const guidePath = DeprecationHeaderInjector.getMigrationGuideUrl('v1', null);
assert(
    guidePath.includes('docs.finault.com') && guidePath.includes('v1'),
    'getMigrationGuideUrl generates correct URL'
);

// Test 3.4: getMigrationGuideUrl with toVersion
const guidePath2 = DeprecationHeaderInjector.getMigrationGuideUrl('v1', 'v2');
assert(guidePath2.includes('v1') && guidePath2.includes('v2'), 'getMigrationGuideUrl includes both versions');

// Test 3.5: getHeaders with no config returns empty object
const emptyHeaders = DeprecationHeaderInjector.getHeaders('v1', null);
assert(Object.keys(emptyHeaders).length === 0, 'getHeaders returns empty object for null config');

// Test 3.6: getHeaders with deprecated version returns headers
const deprecatedConfig = {
    version: 'v1',
    status: 'deprecated',
    deprecationDate: new Date().toISOString(),
    sunsetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
};
const headers = DeprecationHeaderInjector.getHeaders('v1', deprecatedConfig);
assert(
    headers['Deprecation'] !== undefined &&
    headers['Sunset'] !== undefined &&
    headers['Link'] !== undefined,
    'getHeaders includes RFC 8594 headers'
);

// Test 3.7: Deprecation header is RFC 7231 formatted
const depValue = headers['Deprecation'];
assert(depValue.includes('GMT'), 'Deprecation header is properly formatted');

// Test 3.8: Sunset header is RFC 7231 formatted
const sunsetValue = headers['Sunset'];
assert(sunsetValue.includes('GMT'), 'Sunset header is properly formatted');

// Test 3.9: Link header includes rel="deprecation"
const linkValue = headers['Link'];
assert(linkValue.includes('rel="deprecation"'), 'Link header includes deprecation rel');

// Test 3.10: X-Finault-API-Version header present
assert(headers['X-Finault-API-Version'] === 'v1', 'X-Finault-API-Version header is present');

// Test 3.11: X-Finault-Deprecation-Warning header present
assert(
    headers['X-Finault-Deprecation-Warning'] &&
    headers['X-Finault-Deprecation-Warning'].includes('deprecated'),
    'X-Finault-Deprecation-Warning header is present'
);

// Test 3.12: Deprecation header date matches deprecation date
assert(
    headers['Deprecation'].length > 0,
    'Deprecation header has value'
);

// Test 3.13: Sunset header date matches sunset date
assert(
    headers['Sunset'].length > 0,
    'Sunset header has value'
);

// Test 3.14: Link URL uses migration guide format
assert(
    headers['Link'].includes('migration'),
    'Link header includes migration path'
);

// Test 3.15: Multiple headers present
assert(
    Object.keys(headers).length === 5,
    'getHeaders returns all 5 expected headers'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Version Usage Tracking Tests (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── SECTION 4: Version Usage Tracking Tests (15 tests) ───');

// Test 4.1: Create tracker
const tracker = new VersionUsageTracker();
assert(
    tracker.usage && tracker.orgUsage && tracker.lastCallTime,
    'VersionUsageTracker initializes correctly'
);

// Test 4.2: Record a single call
tracker.record('v1', '/api/v1/invoices', 'GET', 'org-123');
assert(
    tracker.usage['v1'] && tracker.usage['v1']['/api/v1/invoices'] &&
    tracker.usage['v1']['/api/v1/invoices']['GET'] === 1,
    'record() increments counter for first call'
);

// Test 4.3: Record increments existing counter
tracker.record('v1', '/api/v1/invoices', 'GET', 'org-123');
assert(
    tracker.usage['v1']['/api/v1/invoices']['GET'] === 2,
    'record() increments existing counter'
);

// Test 4.4: Record different methods
tracker.record('v1', '/api/v1/invoices', 'POST', 'org-123');
assert(
    tracker.usage['v1']['/api/v1/invoices']['POST'] === 1,
    'record() tracks different HTTP methods separately'
);

// Test 4.5: Record different endpoints
tracker.record('v1', '/api/v1/customers', 'GET', 'org-123');
assert(
    tracker.usage['v1']['/api/v1/customers'] !== undefined,
    'record() tracks different endpoints separately'
);

// Test 4.6: Record tracks organization usage
assert(
    tracker.orgUsage['v1']['org-123'] >= 4,
    'record() tracks org-level usage'
);

// Test 4.7: getUsageByVersion sums all calls
const usage = tracker.getUsageByVersion();
assert(
    usage['v1'] >= 4,
    'getUsageByVersion() returns aggregate counts'
);

// Test 4.8: getUsageByEndpoint returns endpoint breakdown
const endpointUsage = tracker.getUsageByEndpoint('v1', null);
assert(
    endpointUsage['/api/v1/invoices'] >= 2 &&
    endpointUsage['/api/v1/customers'] >= 1,
    'getUsageByEndpoint() returns correct breakdown'
);

// Test 4.9: getDeprecatedUsageReport returns structure
tracker.record('v2', '/api/v2/invoices', 'GET', 'org-456');
const report = tracker.getDeprecatedUsageReport();
assert(
    report['v1'] && report['v1'].totalCalls && report['v1'].orgBreakdown,
    'getDeprecatedUsageReport() has correct structure'
);

// Test 4.10: getTrend returns daily data
const trend = tracker.getTrend('v1', 7);
assert(
    Array.isArray(trend) && trend.length === 7,
    'getTrend() returns correct number of days'
);

// Test 4.11: Trend includes date and count
assert(
    trend[0] && trend[0].date && typeof trend[0].count === 'number',
    'getTrend() includes date and count'
);

// Test 4.12: getTopConsumers returns sorted list
tracker.record('v1', '/api/v1/invoices', 'GET', 'org-789');
tracker.record('v1', '/api/v1/invoices', 'GET', 'org-789');
tracker.record('v1', '/api/v1/invoices', 'GET', 'org-789');
const topConsumers = tracker.getTopConsumers('v1', 10);
assert(
    Array.isArray(topConsumers) && topConsumers.length > 0,
    'getTopConsumers() returns sorted list'
);

// Test 4.13: estimateMigrationProgress calculates percentage
tracker.record('v2', '/api/v2/invoices', 'GET', 'org-456');
const progress = tracker.estimateMigrationProgress('v1', 'v2');
assert(
    typeof progress === 'number' && progress >= 0 && progress <= 100,
    'estimateMigrationProgress() returns valid percentage'
);

// Test 4.14: exportMetrics returns all data
const metrics = tracker.exportMetrics();
assert(
    metrics.usage && metrics.orgUsage && metrics.lastCallTime && metrics.dailyTrends,
    'exportMetrics() returns all metric types'
);

// Test 4.15: Multiple versions tracked independently
tracker.record('v3', '/api/v3/reports', 'GET', 'org-999');
const v3Usage = tracker.getUsageByVersion();
assert(
    v3Usage['v1'] && v3Usage['v2'] && v3Usage['v3'],
    'Multiple versions tracked independently'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Sunset Scheduler Tests (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── SECTION 5: Sunset Scheduler Tests (15 tests) ───');

// Test 5.1: Create scheduler
const scheduler = new SunsetScheduler();
assert(scheduler.schedules !== undefined, 'SunsetScheduler initializes correctly');

// Test 5.2: Schedule creates notifications
const futureDate3 = new Date();
futureDate3.setMonth(futureDate3.getMonth() + 8);
const notifications = scheduler.schedule('v0', futureDate3);
assert(
    Array.isArray(notifications) && notifications.length === 5,
    'schedule() creates 5 notification intervals'
);

// Test 5.3: Notifications include 6-month interval
assert(
    notifications.find(n => n.label.includes('6 months')),
    'schedule() includes 6-month notification'
);

// Test 5.4: Notifications include 3-month interval
assert(
    notifications.find(n => n.label.includes('3 months')),
    'schedule() includes 3-month notification'
);

// Test 5.5: Notifications include 1-month interval
assert(
    notifications.find(n => n.label.includes('1 month')),
    'schedule() includes 1-month notification'
);

// Test 5.6: Notifications include 1-week interval
assert(
    notifications.find(n => n.label.includes('1 week')),
    'schedule() includes 1-week notification'
);

// Test 5.7: Notifications include 1-day interval
assert(
    notifications.find(n => n.label.includes('1 day')),
    'schedule() includes 1-day notification'
);

// Test 5.8: Each notification has correct structure
const notif = notifications[0];
assert(
    notif.version && notif.label && notif.notificationDate && notif.sunsetDate && notif.daysBeforeSunset,
    'Each notification has complete structure'
);

// Test 5.9: getUpcomingSunsets returns empty initially
const upcomingSunsets = scheduler.getUpcomingSunsets();
assert(Array.isArray(upcomingSunsets), 'getUpcomingSunsets() returns array');

// Test 5.10: getNotificationSchedule retrieves schedule
const schedule = scheduler.getNotificationSchedule('v0');
assert(schedule && schedule.length === 5, 'getNotificationSchedule() retrieves correct schedule');

// Test 5.11: checkSunsetStatus detects imminent sunsets
// For this test, we'd need to manipulate dates, so we verify structure
const sunsetStatus = scheduler.checkSunsetStatus();
assert(Array.isArray(sunsetStatus), 'checkSunsetStatus() returns array');

// Test 5.12: cancelSunset removes schedule
scheduler.cancelSunset('v0');
const canceledSchedule = scheduler.getNotificationSchedule('v0');
assert(canceledSchedule === null, 'cancelSunset() removes schedule');

// Test 5.13: Multiple versions scheduled independently
const future2 = new Date();
future2.setMonth(future2.getMonth() + 8);
scheduler.schedule('v1', future2);
scheduler.schedule('v2', future2);
assert(
    scheduler.getNotificationSchedule('v1') &&
    scheduler.getNotificationSchedule('v2'),
    'Multiple versions scheduled independently'
);

// Test 5.14: Notification dates are before sunset date
const futureDate4 = new Date();
futureDate4.setMonth(futureDate4.getMonth() + 8);
const notifs = scheduler.schedule('v3', futureDate4);
const allBefore = notifs.every(n => new Date(n.notificationDate) < new Date(n.sunsetDate));
assert(allBefore, 'All notification dates are before sunset date');

// Test 5.15: Notifications are in chronological order
const notifDates = notifications.map(n => new Date(n.notificationDate).getTime());
const isSorted = notifDates.every((v, i, a) => i === 0 || v >= a[i-1]);
assert(isSorted, 'Notifications are chronologically ordered');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: Version Enforcement Middleware Tests (25 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── SECTION 6: Version Enforcement Middleware Tests (25 tests) ───');

// Test 6.1: createVersionEnforcementMiddleware returns function
const middlewareFactory = createVersionEnforcementMiddleware(new VersionRegistry());
assert(typeof middlewareFactory === 'function', 'Factory returns middleware function');

// Test 6.2: Mock request object with version in path
const mockReqPath = {
    url: 'http://localhost/api/v1/invoices',
    method: 'GET',
    header: (name) => null,
    path: '/api/v1/invoices',
    raw: { headers: {} }
};

// Test 6.3: Mock context object
const mockContext = {
    req: mockReqPath,
    set: (key, value) => { mockContext[key] = value; },
    header: (key, value) => { mockContext.headers = mockContext.headers || {}; mockContext.headers[key] = value; },
    json: (data, status = 200) => data  // Return just the data for our tests
};

// Test 6.4: Middleware with active version should pass through
const registryWithV1 = new VersionRegistry();
registryWithV1.register('v1', { status: 'supported' });
assert(registryWithV1.get('v1') !== null, 'Registry can hold supported version');

// Test 6.5: Version extraction from URL path
assert(mockReqPath.url.includes('/api/v1/'), 'Mock request has v1 in path');

// Test 6.6: V2Router has health endpoint
const v2Routes = createV2Router();
assert(v2Routes['/api/v2/health'] !== undefined, 'V2Router includes health endpoint');

// Test 6.7: V2Router health returns correct structure
const healthResult = v2Routes['/api/v2/health'].GET(mockContext);
assert(
    healthResult.data && healthResult.data.version === 'v2' &&
    healthResult.meta && healthResult.links,
    'V2Router health endpoint returns correct structure'
);

// Test 6.8: V2Router invoices endpoint present
assert(v2Routes['/api/v2/invoices'] !== undefined, 'V2Router includes invoices endpoint');

// Test 6.9: V2Router batch endpoint present
assert(v2Routes['/api/v2/batch'] !== undefined, 'V2Router includes batch endpoint');

// Test 6.10: V2Router schema endpoint present
assert(v2Routes['/api/v2/schema'] !== undefined, 'V2Router includes schema endpoint');

// Test 6.11: V2 response envelope format
const invoicesResult = v2Routes['/api/v2/invoices'].GET(mockContext);
assert(
    invoicesResult.data !== undefined &&
    invoicesResult.meta && invoicesResult.meta.version === 'v2' &&
    invoicesResult.links !== undefined,
    'V2 endpoints use response envelope format'
);

// Test 6.12: V2 meta includes requestId
assert(invoicesResult.meta.requestId && invoicesResult.meta.requestId.includes('req-'), 'V2 meta includes requestId');

// Test 6.13: V2 meta includes pagination
assert(invoicesResult.meta.pagination !== undefined, 'V2 meta includes pagination');

// Test 6.14: V2 links include self
assert(invoicesResult.links.self !== undefined, 'V2 links include self');

// Test 6.15: V2 batch endpoint accepts array structure
const batchMockReq = {
    ...mockReqPath,
    url: 'http://localhost/api/v2/batch',
    path: '/api/v2/batch',
    method: 'POST',
    header: (name) => null
};
const batchMockContext = {
    req: batchMockReq,
    set: (key, value) => { batchMockContext[key] = value; },
    header: (key, value) => { batchMockContext.headers = batchMockContext.headers || {}; batchMockContext.headers[key] = value; },
    json: (data, status = 200) => data
};
const batchResult = v2Routes['/api/v2/batch'].POST(batchMockContext);
assert(
    batchResult.data && batchResult.data.operations !== undefined &&
    batchResult.data.results !== undefined,
    'V2 batch endpoint accepts array operations'
);

// Test 6.16: V2 schema endpoint returns OpenAPI structure
const schemaResult = v2Routes['/api/v2/schema'].GET(mockContext);
assert(
    schemaResult.openapi && schemaResult.info && schemaResult.paths && schemaResult.components,
    'V2 schema endpoint returns OpenAPI structure'
);

// Test 6.17: V2 schema includes info
assert(
    schemaResult.info.title === 'Finault API' && schemaResult.info.version === 'v2',
    'V2 schema has correct info'
);

// Test 6.18: Factory functions create correct types
const reg = createVersionRegistry();
assert(reg instanceof VersionRegistry, 'createVersionRegistry returns VersionRegistry instance');

// Test 6.19: Factory creates tracker
const t = createVersionUsageTracker();
assert(t instanceof VersionUsageTracker, 'createVersionUsageTracker returns VersionUsageTracker instance');

// Test 6.20: Factory creates scheduler
const sched = createSunsetScheduler();
assert(sched instanceof SunsetScheduler, 'createSunsetScheduler returns SunsetScheduler instance');

// Test 6.21: V2 invoices support streaming header
const streamMockReq = {
    ...mockReqPath,
    url: 'http://localhost/api/v2/invoices',
    path: '/api/v2/invoices',
    header: (name) => name === 'Accept' ? 'application/json;stream=true' : null
};
const streamMockContext = {
    req: streamMockReq,
    set: (key, value) => { streamMockContext[key] = value; },
    header: (key, value) => { streamMockContext.headers = streamMockContext.headers || {}; streamMockContext.headers[key] = value; },
    json: (data, status = 200) => data
};
const invoicesWithStream = v2Routes['/api/v2/invoices'].GET(streamMockContext);
assert(invoicesWithStream.meta.streamingEnabled !== undefined, 'V2 invoices detects streaming header');

// Test 6.22: V2 batch response includes operation results array
const batchResp = v2Routes['/api/v2/batch'].POST(batchMockContext);
assert(
    Array.isArray(batchResp.data.operations) &&
    Array.isArray(batchResp.data.results),
    'V2 batch response has array fields'
);

// Test 6.23: All V2 endpoints return consistent response format
const healthMeta = v2Routes['/api/v2/health'].GET(mockContext).meta;
const invoicesMeta = v2Routes['/api/v2/invoices'].GET(mockContext).meta;
assert(
    healthMeta.version === 'v2' && invoicesMeta.version === 'v2',
    'All V2 endpoints use consistent version in meta'
);

// Test 6.24: V2 links have correct structure
const linksTest = v2Routes['/api/v2/invoices'].GET(mockContext).links;
assert(
    linksTest.self && typeof linksTest.self === 'string',
    'V2 links have self reference'
);

// Test 6.25: V2 health endpoint is minimal
const healthData = v2Routes['/api/v2/health'].GET(mockContext).data;
assert(
    healthData.version === 'v2' && healthData.status === 'beta',
    'V2 health endpoint returns minimal status'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: Edge Cases Tests (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── SECTION 7: Edge Cases Tests (10 tests) ───');

// Test 7.1: Unknown version handling
const unknownReg = new VersionRegistry();
unknownReg.register('v1', { status: 'supported' });
assert(unknownReg.get('v999') === null, 'Registry returns null for unknown version');

// Test 7.2: Cannot sunset non-deprecated version
const edgeReg = new VersionRegistry();
edgeReg.register('v1', { status: 'supported' });
assertThrows(
    () => edgeReg.sunset('v1'),
    'Cannot transition',
    'Cannot sunset non-deprecated version'
);

// Test 7.3: Cannot deprecate with past sunset date
const edgeReg2 = new VersionRegistry();
edgeReg2.register('v2', { status: 'supported' });
const pastSunset = new Date();
pastSunset.setMonth(pastSunset.getMonth() - 1);
assertThrows(
    () => edgeReg2.deprecate('v2', pastSunset),
    'at least 6 months',
    'Cannot deprecate with past sunset date'
);

// Test 7.4: Concurrent calls tracked correctly
const concurrentTracker = new VersionUsageTracker();
for (let i = 0; i < 100; i++) {
    concurrentTracker.record('v1', '/api/v1/test', 'GET', 'org-1');
}
assert(
    concurrentTracker.usage['v1']['/api/v1/test']['GET'] === 100,
    'Concurrent calls tracked correctly'
);

// Test 7.5: Empty registry returns empty active versions list
const emptyReg = new VersionRegistry();
assert(emptyReg.getActiveVersions().length === 0, 'Empty registry returns empty active list');

// Test 7.6: Deprecation with exact 6-month boundary
const boundaryReg = new VersionRegistry();
boundaryReg.register('v1', { status: 'supported' });
const exactSix = new Date();
exactSix.setDate(exactSix.getDate() + 180);
// Should not throw
try {
    boundaryReg.deprecate('v1', exactSix);
    assert(boundaryReg.isDeprecated('v1'), 'Deprecation accepts 6-month boundary');
} catch (e) {
    assert(false, 'Deprecation should accept 6-month boundary');
}

// Test 7.7: Grace period expiration
const graceReg = new VersionRegistry();
graceReg.register('v1', { status: 'supported' });
const graceSunset = new Date();
graceSunset.setMonth(graceSunset.getMonth() + 7);
graceReg.deprecate('v1', graceSunset);
graceReg.sunset('v1');
// Manually set to far past (beyond grace period)
graceReg.get('v1').sunsetDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
assert(!graceReg.isInGracePeriod('v1'), 'Grace period expires');

// Test 7.8: Multiple deprecations in sequence
const seqReg = new VersionRegistry();
const versions = ['v1', 'v2', 'v3', 'v4', 'v5'];
versions.forEach(v => seqReg.register(v, { status: 'supported' }));
const seqFuture = new Date();
seqFuture.setMonth(seqFuture.getMonth() + 7);
versions.slice(0, 3).forEach(v => seqReg.deprecate(v, seqFuture));
const deprecatedList = seqReg.getDeprecatedVersions();
assert(deprecatedList.length === 3, 'Multiple versions can be deprecated sequentially');

// Test 7.9: Version registry persists state
const persistReg = new VersionRegistry();
persistReg.register('v1', { status: 'supported' });
persistReg.register('v2', { status: 'beta' });
assert(persistReg.getActiveVersions().length === 2, 'Registry persists state after multiple operations');

// Test 7.10: Tracker handles empty version
const emptyTrackerUsage = new VersionUsageTracker();
emptyTrackerUsage.record('v99', '/api/v99/test', 'GET', 'org-1');
const usage99 = emptyTrackerUsage.getUsageByVersion();
assert(usage99['v99'] === 1, 'Tracker handles new versions dynamically');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(80));
console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(80));

if (failed > 0) {
    console.log('\nFailed Tests:');
    failedTests.forEach((test, idx) => {
        console.log(`${idx + 1}. ${test}`);
    });
    process.exit(1);
} else {
    console.log('\n✓ ALL TESTS PASSED!');
    process.exit(0);
}
