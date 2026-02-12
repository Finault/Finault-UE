/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ERROR TAXONOMY (GAP #9) - COMPREHENSIVE TEST SUITE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Test coverage for error classification, taxonomies, response formatting,
 * structured logging, and legacy code mapping.
 *
 * Runs ~150 assertions across 8 test groups:
 * 1. FINAULT_ERRORS Registry (30 tests)
 * 2. FinaultError Class (30 tests)
 * 3. classifyError() Function (35 tests)
 * 4. mapLegacyCode() Function (15 tests)
 * 5. lookupByCode() Function (10 tests)
 * 6. createLogEntry() Function (15 tests)
 * 7. buildGatewayError() Function (15 tests)
 * 8. handleApiError() Function (10+ tests)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
    FINAULT_ERRORS,
    FinaultError,
    classifyError,
    mapLegacyCode,
    lookupByCode,
    createLogEntry,
    buildGatewayError,
    handleApiError
} from '../core/error-taxonomy.js';

// ═════════════════════════════════════════════════════════════════════════════
// TEST HARNESS
// ═════════════════════════════════════════════════════════════════════════════

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
    assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

function assertExists(value, message) {
    assert(value !== null && value !== undefined, `${message} (value is ${value})`);
}

function assertIncludesAll(obj, keys, message) {
    const missing = keys.filter(k => !(k in obj));
    assert(missing.length === 0, `${message} (missing: ${missing.join(', ')})`);
}

function section(title) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`${title}`);
    console.log(`${'─'.repeat(80)}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═════════════════════════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(80)}`);
console.log('ERROR TAXONOMY (GAP #9) - COMPREHENSIVE TEST SUITE');
console.log(`${'═'.repeat(80)}`);

// ─────────────────────────────────────────────────────────────────────────────
// 1. FINAULT_ERRORS Registry (30 tests)
// ─────────────────────────────────────────────────────────────────────────────

section('1. FINAULT_ERRORS REGISTRY (30 tests)');

const expectedCodes = [
    'VALIDATION_ERROR', 'PARSE_ERROR',
    'AUTHENTICATION_ERROR', 'AUTHORIZATION_ERROR', 'TENANT_SUSPENDED',
    'RESOURCE_NOT_FOUND',
    'CONFLICT', 'INTEGRITY_VIOLATION',
    'RATE_LIMITED', 'QUOTA_EXCEEDED', 'BUDGET_EXCEEDED',
    'PROVIDER_ERROR', 'PROVIDER_TIMEOUT',
    'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE'
];

// Test 1.1: All 15 error codes exist
console.log('\n  Testing existence of all 15 error codes:');
expectedCodes.forEach(key => {
    assert(key in FINAULT_ERRORS, `Error key '${key}' exists in registry`);
});

// Test 1.2: No unexpected keys
console.log('\n  Testing registry contains only expected keys:');
const registryKeys = Object.keys(FINAULT_ERRORS);
assert(registryKeys.length === 15, `Registry has exactly 15 entries (has ${registryKeys.length})`);

// Test 1.3: All entries have required fields
console.log('\n  Testing all entries have required fields:');
expectedCodes.forEach(key => {
    const entry = FINAULT_ERRORS[key];
    assertIncludesAll(entry, ['code', 'httpStatus', 'category', 'message', 'retryable', 'description'],
        `${key} has all required fields`);
});

// Test 1.4: No duplicate codes
console.log('\n  Testing for duplicate codes:');
const codes = expectedCodes.map(k => FINAULT_ERRORS[k].code);
const uniqueCodes = new Set(codes);
assert(codes.length === uniqueCodes.size, `All ${codes.length} codes are unique`);

// Test 1.5: Correct HTTP status codes per range
console.log('\n  Testing HTTP status codes by range:');
// 1xxx: 400
[FINAULT_ERRORS.VALIDATION_ERROR, FINAULT_ERRORS.PARSE_ERROR].forEach(e => {
    assertEquals(e.httpStatus, 400, `${e.code} has status 400`);
});
// 2xxx: 401, 403
assertEquals(FINAULT_ERRORS.AUTHENTICATION_ERROR.httpStatus, 401, 'AUTHENTICATION_ERROR has status 401');
assertEquals(FINAULT_ERRORS.AUTHORIZATION_ERROR.httpStatus, 403, 'AUTHORIZATION_ERROR has status 403');
assertEquals(FINAULT_ERRORS.TENANT_SUSPENDED.httpStatus, 403, 'TENANT_SUSPENDED has status 403');
// 3xxx: 404
assertEquals(FINAULT_ERRORS.RESOURCE_NOT_FOUND.httpStatus, 404, 'RESOURCE_NOT_FOUND has status 404');
// 4xxx: 409
[FINAULT_ERRORS.CONFLICT, FINAULT_ERRORS.INTEGRITY_VIOLATION].forEach(e => {
    assertEquals(e.httpStatus, 409, `${e.code} has status 409`);
});
// 5xxx: 402, 429
assertEquals(FINAULT_ERRORS.RATE_LIMITED.httpStatus, 429, 'RATE_LIMITED has status 429');
assertEquals(FINAULT_ERRORS.QUOTA_EXCEEDED.httpStatus, 402, 'QUOTA_EXCEEDED has status 402');
assertEquals(FINAULT_ERRORS.BUDGET_EXCEEDED.httpStatus, 402, 'BUDGET_EXCEEDED has status 402');
// 6xxx: 502, 504
assertEquals(FINAULT_ERRORS.PROVIDER_ERROR.httpStatus, 502, 'PROVIDER_ERROR has status 502');
assertEquals(FINAULT_ERRORS.PROVIDER_TIMEOUT.httpStatus, 504, 'PROVIDER_TIMEOUT has status 504');
// 7xxx: 500, 503
assertEquals(FINAULT_ERRORS.INTERNAL_ERROR.httpStatus, 500, 'INTERNAL_ERROR has status 500');
assertEquals(FINAULT_ERRORS.SERVICE_UNAVAILABLE.httpStatus, 503, 'SERVICE_UNAVAILABLE has status 503');

// Test 1.6: Correct category assignments
console.log('\n  Testing category assignments:');
assertEquals(FINAULT_ERRORS.VALIDATION_ERROR.category, 'validation', 'VALIDATION_ERROR category');
assertEquals(FINAULT_ERRORS.AUTHENTICATION_ERROR.category, 'authentication', 'AUTHENTICATION_ERROR category');
assertEquals(FINAULT_ERRORS.AUTHORIZATION_ERROR.category, 'authorization', 'AUTHORIZATION_ERROR category');
assertEquals(FINAULT_ERRORS.RESOURCE_NOT_FOUND.category, 'resource', 'RESOURCE_NOT_FOUND category');
assertEquals(FINAULT_ERRORS.CONFLICT.category, 'conflict', 'CONFLICT category');
assertEquals(FINAULT_ERRORS.RATE_LIMITED.category, 'rate_limit', 'RATE_LIMITED category');
assertEquals(FINAULT_ERRORS.PROVIDER_ERROR.category, 'provider', 'PROVIDER_ERROR category');
assertEquals(FINAULT_ERRORS.INTERNAL_ERROR.category, 'internal', 'INTERNAL_ERROR category');

// Test 1.7: Retryable flags are correct
console.log('\n  Testing retryable flags:');
// Non-retryable
[FINAULT_ERRORS.VALIDATION_ERROR, FINAULT_ERRORS.AUTHENTICATION_ERROR,
 FINAULT_ERRORS.AUTHORIZATION_ERROR, FINAULT_ERRORS.RESOURCE_NOT_FOUND,
 FINAULT_ERRORS.CONFLICT, FINAULT_ERRORS.INTEGRITY_VIOLATION,
 FINAULT_ERRORS.QUOTA_EXCEEDED, FINAULT_ERRORS.BUDGET_EXCEEDED].forEach(e => {
    assert(e.retryable === false, `${e.code} is not retryable`);
});
// Retryable
[FINAULT_ERRORS.RATE_LIMITED, FINAULT_ERRORS.PROVIDER_ERROR,
 FINAULT_ERRORS.PROVIDER_TIMEOUT, FINAULT_ERRORS.INTERNAL_ERROR,
 FINAULT_ERRORS.SERVICE_UNAVAILABLE].forEach(e => {
    assert(e.retryable === true, `${e.code} is retryable`);
});

// Test 1.8: Retryable errors have retry strategies
console.log('\n  Testing retry strategies for retryable errors:');
[FINAULT_ERRORS.RATE_LIMITED, FINAULT_ERRORS.PROVIDER_ERROR,
 FINAULT_ERRORS.PROVIDER_TIMEOUT, FINAULT_ERRORS.INTERNAL_ERROR,
 FINAULT_ERRORS.SERVICE_UNAVAILABLE].forEach(e => {
    assert(e.retryStrategy && typeof e.retryStrategy === 'string',
        `${e.code} has non-empty retryStrategy`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. FinaultError Class (30 tests)
// ─────────────────────────────────────────────────────────────────────────────

section('2. FINAULTERROR CLASS (30 tests)');

console.log('\n  Testing constructor with valid error key:');
const err1 = new FinaultError('VALIDATION_ERROR');
assert(err1 instanceof FinaultError, 'Creates FinaultError instance');
assert(err1 instanceof Error, 'FinaultError extends Error');
assertEquals(err1.name, 'FinaultError', 'name property is FinaultError');
assertEquals(err1.code, 'FINAULT-1001', 'code property set correctly');
assertEquals(err1.httpStatus, 400, 'httpStatus property set correctly');
assertEquals(err1.category, 'validation', 'category property set correctly');
assertEquals(err1.retryable, false, 'retryable property set correctly');

console.log('\n  Testing constructor with detail message:');
const err2 = new FinaultError('VALIDATION_ERROR', 'Missing required field: name');
assertEquals(err2.detail, 'Missing required field: name', 'detail property set from constructor');
assertEquals(err2.message, 'Missing required field: name', 'message property matches detail');

console.log('\n  Testing constructor with context:');
const ctx = { service: 'api', org_id: 'org_123' };
const err3 = new FinaultError('AUTHENTICATION_ERROR', 'Invalid token', ctx);
assertEquals(err3.context, ctx, 'context property preserved');
assertEquals(err3.context.service, 'api', 'context fields accessible');

console.log('\n  Testing default message when no detail provided:');
const err4 = new FinaultError('INTERNAL_ERROR');
assertEquals(err4.message, 'Internal error', 'Uses def.message when detail not provided');

console.log('\n  Testing timestamp generation:');
const err5 = new FinaultError('PROVIDER_ERROR');
assertExists(err5.timestamp, 'timestamp property exists');
assert(err5.timestamp.endsWith('Z'), 'timestamp is ISO string');
assert(!isNaN(Date.parse(err5.timestamp)), 'timestamp is valid ISO date');

console.log('\n  Testing constructor with unknown key throws:');
let unknownKeyError = false;
try {
    new FinaultError('UNKNOWN_ERROR_KEY');
} catch (e) {
    unknownKeyError = true;
    assert(e.message.includes('Unknown FINAULT error key'), 'Throws for unknown key');
}
assert(unknownKeyError, 'Constructor throws for unknown error key');

console.log('\n  Testing toResponse() without requestId:');
const err6 = new FinaultError('VALIDATION_ERROR', 'Invalid format');
const resp1 = err6.toResponse();
assertIncludesAll(resp1, ['success', 'error'], 'Response has success and error fields');
assertEquals(resp1.success, false, 'success is false');
assertIncludesAll(resp1.error, ['code', 'message', 'category', 'retryable'], 'error has required fields');
assertEquals(resp1.error.code, 'FINAULT-1001', 'error.code set correctly');
assertEquals(resp1.error.retryable, false, 'error.retryable set correctly');
assert(!('requestId' in resp1.error), 'requestId not included when not provided');

console.log('\n  Testing toResponse() with requestId:');
const resp2 = err6.toResponse('req_abc123');
assertEquals(resp2.error.requestId, 'req_abc123', 'requestId included in response');

console.log('\n  Testing toResponse() includes retryStrategy for retryable errors:');
const err7 = new FinaultError('RATE_LIMITED', 'You have exceeded the rate limit');
const resp3 = err7.toResponse();
assert('retryStrategy' in resp3.error, 'retryStrategy included for retryable error');
assert(typeof resp3.error.retryStrategy === 'string', 'retryStrategy is a string');

console.log('\n  Testing toResponse() excludes retryStrategy for non-retryable errors:');
const err8 = new FinaultError('AUTHENTICATION_ERROR', 'Invalid API key');
const resp4 = err8.toResponse();
assert(!('retryStrategy' in resp4.error), 'retryStrategy not included for non-retryable error');

console.log('\n  Testing toLogEntry() without traceContext:');
const err9 = new FinaultError('PROVIDER_ERROR', 'Provider unavailable', { service: 'reconciliation' });
const log1 = err9.toLogEntry();
assertIncludesAll(log1, ['timestamp', 'level', 'service', 'error_code', 'message', 'context', 'stack'],
    'Log entry has required fields');
assertEquals(log1.error_code, 'FINAULT-6001', 'error_code set correctly');
assertEquals(log1.message, 'Provider unavailable', 'message set from detail');
assertEquals(log1.service, 'reconciliation', 'service from context');
assert(log1.trace_id === null, 'trace_id is null when not provided');

console.log('\n  Testing toLogEntry() with traceContext:');
const trace = { trace_id: 'trace_xyz', span_id: 'span_abc', org_id: 'org_456', user_id: 'user_789' };
const log2 = err9.toLogEntry(trace);
assertEquals(log2.trace_id, 'trace_xyz', 'trace_id from context');
assertEquals(log2.span_id, 'span_abc', 'span_id from context');
assertEquals(log2.org_id, 'org_456', 'org_id from context');
assertEquals(log2.user_id, 'user_789', 'user_id from context');

console.log('\n  Testing toLogEntry() level based on HTTP status:');
const err5xx = new FinaultError('INTERNAL_ERROR'); // 500
const log5xx = err5xx.toLogEntry();
assertEquals(log5xx.level, 'error', 'Level is error for 5xx status');

const err4xx = new FinaultError('VALIDATION_ERROR'); // 400
const log4xx = err4xx.toLogEntry();
assertEquals(log4xx.level, 'warn', 'Level is warn for 4xx status');

console.log('\n  Testing all error codes produce valid FinaultError instances:');
expectedCodes.forEach(key => {
    const e = new FinaultError(key);
    assert(e instanceof FinaultError, `FinaultError created for ${key}`);
    assertEquals(e.name, 'FinaultError', `${key} error has correct name`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. classifyError() Function (35 tests)
// ─────────────────────────────────────────────────────────────────────────────

section('3. CLASSIFYERROR() FUNCTION (35 tests)');

console.log('\n  Testing FinaultError passed unchanged:');
const originalError = new FinaultError('VALIDATION_ERROR', 'Test error');
const classified1 = classifyError(originalError);
assert(classified1 === originalError, 'FinaultError returned unchanged');

console.log('\n  Testing HTTP status-based classification (400):');
const err400 = { status: 400, message: 'Bad request' };
const classified400 = classifyError(err400);
assertEquals(classified400.code, 'FINAULT-1001', '400 classified as VALIDATION_ERROR');
assertEquals(classified400.message, 'Bad request', 'Message preserved');

console.log('\n  Testing HTTP status-based classification (401):');
const err401 = { status: 401, message: 'Unauthorized' };
const classified401 = classifyError(err401);
assertEquals(classified401.code, 'FINAULT-2001', '401 classified as AUTHENTICATION_ERROR');

console.log('\n  Testing HTTP status-based classification (403):');
const err403 = { status: 403, message: 'Forbidden' };
const classified403 = classifyError(err403);
assertEquals(classified403.code, 'FINAULT-2002', '403 classified as AUTHORIZATION_ERROR');

console.log('\n  Testing HTTP status-based classification (404):');
const err404 = { status: 404, message: 'Not found' };
const classified404 = classifyError(err404);
assertEquals(classified404.code, 'FINAULT-3001', '404 classified as RESOURCE_NOT_FOUND');

console.log('\n  Testing HTTP status-based classification (409):');
const err409 = { status: 409, message: 'Conflict' };
const classified409 = classifyError(err409);
assertEquals(classified409.code, 'FINAULT-4001', '409 classified as CONFLICT');

console.log('\n  Testing HTTP status-based classification (429):');
const err429 = { status: 429, message: 'Too many requests' };
const classified429 = classifyError(err429);
assertEquals(classified429.code, 'FINAULT-5001', '429 classified as RATE_LIMITED');

console.log('\n  Testing HTTP status-based classification (502):');
const err502 = { status: 502, message: 'Bad gateway' };
const classified502 = classifyError(err502);
assertEquals(classified502.code, 'FINAULT-6001', '502 classified as PROVIDER_ERROR');

console.log('\n  Testing HTTP status-based classification (503):');
const err503 = { status: 503, message: 'Service unavailable' };
const classified503 = classifyError(err503);
assertEquals(classified503.code, 'FINAULT-7002', '503 classified as SERVICE_UNAVAILABLE');

console.log('\n  Testing HTTP status-based classification (504):');
const err504 = { status: 504, message: 'Gateway timeout' };
const classified504 = classifyError(err504);
assertEquals(classified504.code, 'FINAULT-6002', '504 classified as PROVIDER_TIMEOUT');

console.log('\n  Testing alternative status properties (statusCode):');
const errStatusCode = { statusCode: 400, message: 'Bad request' };
const classifiedStatusCode = classifyError(errStatusCode);
assertEquals(classifiedStatusCode.code, 'FINAULT-1001', 'statusCode property recognized');

console.log('\n  Testing alternative status properties (response.status):');
const errResponseStatus = { response: { status: 401 }, message: 'Unauthorized' };
const classifiedResponseStatus = classifyError(errResponseStatus);
assertEquals(classifiedResponseStatus.code, 'FINAULT-2001', 'response.status property recognized');

console.log('\n  Testing message-based classification (timeout):');
const timeoutErr = new Error('Request timeout');
const classifiedTimeout = classifyError(timeoutErr);
assertEquals(classifiedTimeout.code, 'FINAULT-6002', 'timeout message classified as PROVIDER_TIMEOUT');

console.log('\n  Testing message-based classification (timed out):');
const timedOutErr = new Error('Socket timed out');
const classifiedTimedOut = classifyError(timedOutErr);
assertEquals(classifiedTimedOut.code, 'FINAULT-6002', 'timed out message classified as PROVIDER_TIMEOUT');

console.log('\n  Testing message-based classification (ETIMEDOUT):');
const etimedOutErr = new Error('ETIMEDOUT');
const classifiedEtimedOut = classifyError(etimedOutErr);
assertEquals(classifiedEtimedOut.code, 'FINAULT-6002', 'ETIMEDOUT message classified as PROVIDER_TIMEOUT');

console.log('\n  Testing message-based classification (rate limit):');
const rateLimitErr = new Error('Rate limit exceeded');
const classifiedRateLimit = classifyError(rateLimitErr);
assertEquals(classifiedRateLimit.code, 'FINAULT-5001', 'rate limit message classified as RATE_LIMITED');

console.log('\n  Testing message-based classification (too many requests):');
const tooManyErr = new Error('Too many requests');
const classifiedTooMany = classifyError(tooManyErr);
assertEquals(classifiedTooMany.code, 'FINAULT-5001', 'too many requests message classified as RATE_LIMITED');

console.log('\n  Testing message-based classification (unauthorized):');
const unauthorizedErr = new Error('Unauthorized access');
const classifiedUnauthorized = classifyError(unauthorizedErr);
assertEquals(classifiedUnauthorized.code, 'FINAULT-2001', 'unauthorized message classified as AUTHENTICATION_ERROR');

console.log('\n  Testing message-based classification (forbidden):');
const forbiddenErr = new Error('Forbidden');
const classifiedForbidden = classifyError(forbiddenErr);
assertEquals(classifiedForbidden.code, 'FINAULT-2002', 'forbidden message classified as AUTHORIZATION_ERROR');

console.log('\n  Testing message-based classification (not found):');
const notFoundErr = new Error('Invoice not found');
const classifiedNotFound = classifyError(notFoundErr);
assertEquals(classifiedNotFound.code, 'FINAULT-3001', 'not found message classified as RESOURCE_NOT_FOUND');

console.log('\n  Testing message-based classification (validation):');
const validationErr = new Error('Validation failed: missing field');
const classifiedValidation = classifyError(validationErr);
assertEquals(classifiedValidation.code, 'FINAULT-1001', 'validation message classified as VALIDATION_ERROR');

console.log('\n  Testing message-based classification (budget):');
const budgetErr = new Error('Budget exceeded');
const classifiedBudget = classifyError(budgetErr);
assertEquals(classifiedBudget.code, 'FINAULT-5003', 'budget message classified as BUDGET_EXCEEDED');

console.log('\n  Testing message-based classification (quota):');
const quotaErr = new Error('Quota limit reached');
const classifiedQuota = classifyError(quotaErr);
assertEquals(classifiedQuota.code, 'FINAULT-5002', 'quota message classified as QUOTA_EXCEEDED');

console.log('\n  Testing message-based classification (conflict):');
const conflictErr = new Error('Reconciliation already exists');
const classifiedConflict = classifyError(conflictErr);
assertEquals(classifiedConflict.code, 'FINAULT-4001', 'conflict message classified as CONFLICT');

console.log('\n  Testing message-based classification (sealed):');
const sealedErr = new Error('Close pack is sealed and immutable');
const classifiedSealed = classifyError(sealedErr);
assertEquals(classifiedSealed.code, 'FINAULT-4002', 'sealed message classified as INTEGRITY_VIOLATION');

console.log('\n  Testing message-based classification (integrity):');
const integrityErr = new Error('Integrity check failed');
const classifiedIntegrity = classifyError(integrityErr);
assertEquals(classifiedIntegrity.code, 'FINAULT-4002', 'integrity message classified as INTEGRITY_VIOLATION');

console.log('\n  Testing default to INTERNAL_ERROR for unknown errors:');
const unknownErr = new Error('Something weird happened');
const classifiedUnknown = classifyError(unknownErr);
assertEquals(classifiedUnknown.code, 'FINAULT-7001', 'Unknown error defaults to INTERNAL_ERROR');

console.log('\n  Testing context preservation through classification:');
const ctxErr = new Error('Some error');
const ctx2 = { service: 'test', org_id: 'org_999' };
const classifiedWithCtx = classifyError(ctxErr, ctx2);
assertEquals(classifiedWithCtx.context.service, 'test', 'Context service preserved');
assertEquals(classifiedWithCtx.context.org_id, 'org_999', 'Context org_id preserved');

console.log('\n  Testing null error handling:');
const nullClassified = classifyError(null);
assertEquals(nullClassified.code, 'FINAULT-7001', 'null error defaults to INTERNAL_ERROR');

console.log('\n  Testing undefined error handling:');
const undefinedClassified = classifyError(undefined);
assertEquals(undefinedClassified.code, 'FINAULT-7001', 'undefined error defaults to INTERNAL_ERROR');

console.log('\n  Testing string error handling:');
const stringClassified = classifyError('A string error occurred');
assertEquals(stringClassified.code, 'FINAULT-7001', 'String error defaults to INTERNAL_ERROR');

// ─────────────────────────────────────────────────────────────────────────────
// 4. mapLegacyCode() Function (15 tests)
// ─────────────────────────────────────────────────────────────────────────────

section('4. MAPLEGACYCODE() FUNCTION (15 tests)');

console.log('\n  Testing legacy authentication codes:');
const legacyAuthMissing = mapLegacyCode('AUTH_MISSING_KEY');
assertEquals(legacyAuthMissing.code, 'FINAULT-2001', 'AUTH_MISSING_KEY maps to FINAULT-2001');

const legacyAuthInvalid = mapLegacyCode('AUTH_INVALID_PREFIX');
assertEquals(legacyAuthInvalid.code, 'FINAULT-2001', 'AUTH_INVALID_PREFIX maps to FINAULT-2001');

const legacyAuthRevoked = mapLegacyCode('AUTH_KEY_REVOKED');
assertEquals(legacyAuthRevoked.code, 'FINAULT-2001', 'AUTH_KEY_REVOKED maps to FINAULT-2001');

const legacyAuthExpired = mapLegacyCode('AUTH_KEY_EXPIRED');
assertEquals(legacyAuthExpired.code, 'FINAULT-2001', 'AUTH_KEY_EXPIRED maps to FINAULT-2001');

console.log('\n  Testing legacy rate limit code:');
const legacyRateLimit = mapLegacyCode('RATE_LIMIT_EXCEEDED');
assertEquals(legacyRateLimit.code, 'FINAULT-5001', 'RATE_LIMIT_EXCEEDED maps to FINAULT-5001');

console.log('\n  Testing legacy validation codes:');
const legacyValidation = mapLegacyCode('VALIDATION_ERROR');
assertEquals(legacyValidation.code, 'FINAULT-1001', 'VALIDATION_ERROR maps to FINAULT-1001');

const legacyPayloadTooLarge = mapLegacyCode('VALIDATION_PAYLOAD_TOO_LARGE');
assertEquals(legacyPayloadTooLarge.code, 'FINAULT-1001', 'VALIDATION_PAYLOAD_TOO_LARGE maps to FINAULT-1001');

const legacyInvalidModel = mapLegacyCode('VALIDATION_INVALID_MODEL');
assertEquals(legacyInvalidModel.code, 'FINAULT-1001', 'VALIDATION_INVALID_MODEL maps to FINAULT-1001');

console.log('\n  Testing legacy budget code:');
const legacyBudget = mapLegacyCode('BUDGET_EXCEEDED');
assertEquals(legacyBudget.code, 'FINAULT-5003', 'BUDGET_EXCEEDED maps to FINAULT-5003');

console.log('\n  Testing legacy provider codes:');
const legacyProvider = mapLegacyCode('PROVIDER_ERROR');
assertEquals(legacyProvider.code, 'FINAULT-6001', 'PROVIDER_ERROR maps to FINAULT-6001');

const legacyProviderTimeout = mapLegacyCode('PROVIDER_TIMEOUT');
assertEquals(legacyProviderTimeout.code, 'FINAULT-6002', 'PROVIDER_TIMEOUT maps to FINAULT-6002');

console.log('\n  Testing legacy resource code:');
const legacyEndpointNotFound = mapLegacyCode('ENDPOINT_NOT_FOUND');
assertEquals(legacyEndpointNotFound.code, 'FINAULT-3001', 'ENDPOINT_NOT_FOUND maps to FINAULT-3001');

console.log('\n  Testing legacy gateway error code:');
const legacyGateway = mapLegacyCode('GATEWAY_ERROR');
assertEquals(legacyGateway.code, 'FINAULT-7001', 'GATEWAY_ERROR maps to FINAULT-7001');

console.log('\n  Testing unknown legacy code defaults to INTERNAL_ERROR:');
const legacyUnknown = mapLegacyCode('UNKNOWN_LEGACY_CODE');
assertEquals(legacyUnknown.code, 'FINAULT-7001', 'Unknown legacy code defaults to FINAULT-7001');

// ─────────────────────────────────────────────────────────────────────────────
// 5. lookupByCode() Function (10 tests)
// ─────────────────────────────────────────────────────────────────────────────

section('5. LOOKUPBYCODE() FUNCTION (10 tests)');

console.log('\n  Testing lookup of all FINAULT code ranges:');
const lookup1001 = lookupByCode('FINAULT-1001');
assertExists(lookup1001, 'FINAULT-1001 lookup returns value');
assertEquals(lookup1001.code, 'FINAULT-1001', 'Lookup result has correct code');

const lookup2001 = lookupByCode('FINAULT-2001');
assertExists(lookup2001, 'FINAULT-2001 lookup returns value');

const lookup3001 = lookupByCode('FINAULT-3001');
assertExists(lookup3001, 'FINAULT-3001 lookup returns value');

const lookup4001 = lookupByCode('FINAULT-4001');
assertExists(lookup4001, 'FINAULT-4001 lookup returns value');

const lookup5001 = lookupByCode('FINAULT-5001');
assertExists(lookup5001, 'FINAULT-5001 lookup returns value');

const lookup6001 = lookupByCode('FINAULT-6001');
assertExists(lookup6001, 'FINAULT-6001 lookup returns value');

const lookup7001 = lookupByCode('FINAULT-7001');
assertExists(lookup7001, 'FINAULT-7001 lookup returns value');

console.log('\n  Testing lookup of non-existent code:');
const lookupInvalid = lookupByCode('FINAULT-9999');
assert(lookupInvalid === null, 'Non-existent code returns null');

console.log('\n  Testing lookup returns correct key field:');
const lookupWithKey = lookupByCode('FINAULT-1001');
assertEquals(lookupWithKey.key, 'VALIDATION_ERROR', 'Lookup result includes key field');

// ─────────────────────────────────────────────────────────────────────────────
// 6. createLogEntry() Function (15 tests)
// ─────────────────────────────────────────────────────────────────────────────

section('6. CREATELOGENTRY() FUNCTION (15 tests)');

console.log('\n  Testing log entry structure:');
const logEntry = createLogEntry('info', 'test-service', 'Operation completed');
assertIncludesAll(logEntry, ['timestamp', 'level', 'service', 'trace_id', 'span_id', 'org_id', 'user_id', 'message', 'context'],
    'Log entry has all required fields');

console.log('\n  Testing log entry field values:');
assertEquals(logEntry.level, 'info', 'level field set correctly');
assertEquals(logEntry.service, 'test-service', 'service field set correctly');
assertEquals(logEntry.message, 'Operation completed', 'message field set correctly');
assert(logEntry.timestamp.endsWith('Z'), 'timestamp is ISO string');

console.log('\n  Testing log entry trace context with provided values:');
const trace2 = { trace_id: 'trace_123', span_id: 'span_456' };
const logEntry2 = createLogEntry('debug', 'service-2', 'Debug message', {}, trace2);
assertEquals(logEntry2.trace_id, 'trace_123', 'trace_id from provided traceContext');
assertEquals(logEntry2.span_id, 'span_456', 'span_id from provided traceContext');

console.log('\n  Testing log entry trace context with null values:');
const logEntry3 = createLogEntry('warn', 'service-3', 'Warning message');
assert(logEntry3.trace_id === null, 'trace_id is null when not provided');
assert(logEntry3.span_id === null, 'span_id is null when not provided');
assert(logEntry3.org_id === null, 'org_id is null when not provided');
assert(logEntry3.user_id === null, 'user_id is null when not provided');

console.log('\n  Testing log entry with context data:');
const ctxData = { request_id: 'req_001', operation: 'reconcile' };
const logEntry4 = createLogEntry('info', 'service-4', 'Processing', ctxData);
assertEquals(logEntry4.context, ctxData, 'context field contains provided context');

console.log('\n  Testing log entry duration_ms field:');
const ctxWithDuration = { duration_ms: 1234 };
const logEntry5 = createLogEntry('info', 'service-5', 'Completed', ctxWithDuration);
assertEquals(logEntry5.duration_ms, 1234, 'duration_ms from context');

console.log('\n  Testing log entry duration_ms null when not provided:');
const logEntry6 = createLogEntry('info', 'service-6', 'Message', {});
assert(logEntry6.duration_ms === null, 'duration_ms is null when not in context');

console.log('\n  Testing all log levels:');
['debug', 'info', 'warn', 'error', 'fatal'].forEach(lvl => {
    const le = createLogEntry(lvl, 'service', 'msg');
    assertEquals(le.level, lvl, `Log level ${lvl} set correctly`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. buildGatewayError() Function (15 tests)
// ─────────────────────────────────────────────────────────────────────────────

section('7. BUILDGATEWAYERROR() FUNCTION (15 tests)');

console.log('\n  Testing response structure:');
const gwErr = buildGatewayError('VALIDATION_ERROR', 'Invalid field', 'req_123');
assertIncludesAll(gwErr, ['body', 'status', 'headers'], 'Response has required top-level fields');

console.log('\n  Testing response body structure:');
assertEquals(gwErr.body.success, false, 'success is false');
assertIncludesAll(gwErr.body.error, ['code', 'legacyCode', 'message', 'category', 'retryable', 'requestId'],
    'error object has all required fields');

console.log('\n  Testing legacy code preservation:');
assertEquals(gwErr.body.error.legacyCode, 'VALIDATION_ERROR', 'Legacy code preserved in response');
assertEquals(gwErr.body.error.code, 'FINAULT-1001', 'FINAULT code mapped correctly');

console.log('\n  Testing request ID in response:');
assertEquals(gwErr.body.error.requestId, 'req_123', 'requestId included in response');

console.log('\n  Testing HTTP status mapping:');
assertEquals(gwErr.status, 400, 'HTTP status set correctly');

console.log('\n  Testing Retry-After header for rate limit:');
const rateLimitGwErr = buildGatewayError('RATE_LIMIT_EXCEEDED', 'Too many requests', 'req_456');
assert('Retry-After' in rateLimitGwErr.headers, 'Retry-After header added for rate limit');
assertEquals(rateLimitGwErr.headers['Retry-After'], '60', 'Retry-After header set to 60');

console.log('\n  Testing Retry-After header not overridden:');
const existingHeaders = { 'Retry-After': '120' };
const rateLimitGwErr2 = buildGatewayError('RATE_LIMIT_EXCEEDED', 'Too many requests', 'req_789', existingHeaders);
assertEquals(rateLimitGwErr2.headers['Retry-After'], '120', 'Existing Retry-After header not overridden');

console.log('\n  Testing other legacy codes map correctly:');
const providerGwErr = buildGatewayError('PROVIDER_ERROR', 'Provider failed', 'req_provider');
assertEquals(providerGwErr.body.error.code, 'FINAULT-6001', 'PROVIDER_ERROR maps to FINAULT-6001');
assertEquals(providerGwErr.status, 502, 'Provider error status 502');

console.log('\n  Testing authentication error mapping:');
const authGwErr = buildGatewayError('AUTH_MISSING_KEY', 'Missing API key', 'req_auth');
assertEquals(authGwErr.body.error.code, 'FINAULT-2001', 'AUTH_MISSING_KEY maps to FINAULT-2001');
assertEquals(authGwErr.status, 401, 'Authentication error status 401');

console.log('\n  Testing unknown legacy code defaults to INTERNAL_ERROR:');
const unknownGwErr = buildGatewayError('UNKNOWN_CODE', 'Unknown error', 'req_unknown');
assertEquals(unknownGwErr.body.error.code, 'FINAULT-7001', 'Unknown code maps to FINAULT-7001');
assertEquals(unknownGwErr.status, 500, 'Unknown code status 500');

console.log('\n  Testing all major legacy codes produce correct status:');
const legacyTests = [
    ['VALIDATION_ERROR', 400],
    ['AUTH_MISSING_KEY', 401],
    ['RATE_LIMIT_EXCEEDED', 429],
    ['BUDGET_EXCEEDED', 402],
    ['PROVIDER_TIMEOUT', 504],
    ['GATEWAY_ERROR', 500]
];
legacyTests.forEach(([code, expectedStatus]) => {
    const res = buildGatewayError(code, 'Test', 'req_test');
    assertEquals(res.status, expectedStatus, `${code} produces status ${expectedStatus}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. handleApiError() Function (10+ tests)
// ─────────────────────────────────────────────────────────────────────────────

section('8. HANDLEAPIERROR() FUNCTION (10+ tests)');

console.log('\n  Testing with mock Hono context (basic error):');
// Create a simple mock context that mimics Hono
const mockCtx = {
    get: (key) => {
        const values = {
            'requestId': 'req_mock_001',
            'jwtPayload': { org: 'org_mock', sub: 'user_mock' }
        };
        return values[key];
    },
    json: (body, status) => {
        return { _body: body, _status: status, _isResponse: true };
    }
};

const error = new Error('Test error');
const response = handleApiError(mockCtx, error, { service: 'test-service' });

console.log('\n  Testing response is returned:');
assert(response._isResponse === true, 'handleApiError returns response');

console.log('\n  Testing response includes requestId:');
assert(response._body.error.requestId, 'Response includes requestId');

console.log('\n  Testing response has correct structure:');
assertIncludesAll(response._body, ['success', 'error'], 'Response has success and error fields');
assertEquals(response._body.success, false, 'success is false');

console.log('\n  Testing error classification in response:');
assert(response._body.error.code.startsWith('FINAULT-'), 'Error code is FINAULT format');

console.log('\n  Testing HTTP status set correctly:');
assert(typeof response._status === 'number', 'HTTP status is number');

console.log('\n  Testing context propagation:');
// The context.service should be used if provided
const response2 = handleApiError(mockCtx, error, { service: 'custom-service' });
// We can't directly verify service in response, but we can check it was called without error
assert(response2._isResponse === true, 'Response created with custom service context');

console.log('\n  Testing with native Error:');
const nativeError = new Error('Native error message');
const response3 = handleApiError(mockCtx, nativeError);
assert(response3._body.error.code, 'Native error gets classified');

console.log('\n  Testing with HTTP error object:');
const httpError = { status: 401, message: 'Unauthorized' };
const response4 = handleApiError(mockCtx, httpError);
assertEquals(response4._body.error.code, 'FINAULT-2001', '401 error classified as AUTHENTICATION_ERROR');

console.log('\n  Testing log entry is created (via console.error call):');
// This is harder to test directly, but we can verify no error is thrown
let logCreated = false;
const originalLog = console.error;
console.error = () => { logCreated = true; };
handleApiError(mockCtx, new Error('Test'));
console.error = originalLog;
assert(logCreated, 'Structured log entry created');

// ═════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(80)}`);
console.log('TEST SUMMARY');
console.log(`${'═'.repeat(80)}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log('FAILURES:');
    console.log(`${'─'.repeat(80)}`);
    failures.forEach((msg, i) => {
        console.log(`${i + 1}. ${msg}`);
    });
    process.exit(1);
} else {
    console.log(`\n✓ ALL TESTS PASSED`);
    process.exit(0);
}
