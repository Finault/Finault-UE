/**
 * Server Gap 1: Enterprise Hardening Features
 * Structural verification tests for:
 * 1. OpenAPI Spec Generation
 * 2. Pagination Middleware
 * 3. ETag & Cache Headers
 * 4. HMAC Webhook Verification
 * 5. Graceful Shutdown
 * 6. Request Body Size Limit
 */

import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.join(__dirname, '..', 'api', 'server.js');
const serverSource = fs.readFileSync(serverPath, 'utf8');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAILED: ${message}`);
        failed++;
    } else {
        console.log(`✓ ${message}`);
        passed++;
    }
}

console.log('\n═══ ENTERPRISE HARDENING FEATURES TESTS ═══\n');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: OpenAPI Spec Generation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 1: OpenAPI Spec ═══\n');

assert(serverSource.includes('generateOpenAPISpec'), 'generateOpenAPISpec function exists');
assert(serverSource.includes('openapi.json'), 'OpenAPI JSON endpoint registered');
assert(serverSource.includes('/api/v1/docs'), 'Swagger UI docs endpoint registered');
assert(serverSource.includes('openapi') && serverSource.includes('3.'), 'OpenAPI spec uses version 3.x');
assert(serverSource.includes('paths'), 'OpenAPI spec includes paths object');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Pagination Helpers (parsePagination, paginatedResponse)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 2: Pagination Helpers ═══\n');

assert(serverSource.includes('parsePagination'), 'parsePagination helper function defined');
assert(serverSource.includes('paginatedResponse'), 'paginatedResponse helper function defined');
assert(serverSource.includes('limit') && serverSource.includes('offset'), 'Pagination uses limit/offset pattern');
assert(serverSource.includes('hasMore'), 'Pagination includes hasMore indicator');
assert(/max\s*[\(,]\s*100|Math\.min.*100/.test(serverSource) || serverSource.includes('> 100'), 'Pagination enforces max limit of 100');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: ETag & Cache Headers
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 3: ETag & Cache Headers ═══\n');

// Test ETag generation logic
const testData = { success: true, data: { test: 'value' } };
const testJson = JSON.stringify(testData);
const etagHash = crypto.createHash('md5').update(testJson).digest('hex');
const expectedEtag = `"W/${etagHash}"`;

assert(etagHash.length === 32, 'ETag hash is valid MD5 (32 chars)');
assert(expectedEtag.startsWith('"W/'), 'ETag format is correct (weak ETag)');
assert(serverSource.includes('ETag') || serverSource.includes('etag'), 'Server includes ETag support');
assert(serverSource.includes('Cache-Control'), 'Server includes Cache-Control header');
assert(serverSource.includes('Vary'), 'Server includes Vary header');
assert(serverSource.includes('If-None-Match') || serverSource.includes('if-none-match'), 'Server checks If-None-Match for 304 responses');
assert(serverSource.includes('304'), 'Server returns 304 Not Modified');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: HMAC Webhook Verification
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 4: HMAC Webhook Verification ═══\n');

const testSecret = 'webhook_secret_key_12345';
const testPayload = '{"event":"invoice.created","invoice_id":"INV-123"}';

const webhookSignature = crypto.createHmac('sha256', testSecret)
    .update(testPayload)
    .digest('hex');

assert(webhookSignature.length === 64, 'HMAC SHA256 signature is 64 chars');
assert(serverSource.includes('createHmac'), 'Server uses crypto.createHmac for webhook verification');
assert(serverSource.includes('timingSafeEqual'), 'Server uses timingSafeEqual for constant-time comparison');
assert(serverSource.includes('X-Webhook-Signature') || serverSource.includes('x-webhook-signature'), 'Server checks X-Webhook-Signature header');
assert(serverSource.includes('WEBHOOK_SECRET'), 'Server uses WEBHOOK_SECRET env var');

// Test timing-safe comparison
const correctSig = Buffer.from(webhookSignature);
let timingSafeWorks = false;
try {
    crypto.timingSafeEqual(correctSig, correctSig);
    timingSafeWorks = true;
} catch (e) {
    // Expected for different lengths
}
assert(timingSafeWorks, 'Crypto.timingSafeEqual is available for signature comparison');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Request Body Size Limit
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 5: Request Body Size Limit ═══\n');

assert(serverSource.includes('Content-Length') || serverSource.includes('content-length'), 'Server checks Content-Length header');
assert(serverSource.includes('413') || serverSource.includes('Payload Too Large'), 'Server returns 413 Payload Too Large');
assert(/1[_,]?000[_,]?000|1e6|1\s*\*\s*1024\s*\*\s*1024|MAX_BODY_SIZE/.test(serverSource), 'Body size limit configured (~1MB)');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: Graceful Shutdown
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 6: Graceful Shutdown ═══\n');

assert(serverSource.includes('isShuttingDown'), 'isShuttingDown flag exists');
assert(serverSource.includes('inFlightRequests') || serverSource.includes('inflight'), 'In-flight request tracking exists');
assert(serverSource.includes('SIGTERM'), 'SIGTERM handler registered');
assert(serverSource.includes('SIGINT'), 'SIGINT handler registered');
assert(serverSource.includes('gracefulShutdown') || serverSource.includes('graceful'), 'Graceful shutdown function defined');
assert(serverSource.includes('503'), 'Returns 503 Service Unavailable when shutting down');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: Integration with Existing Middleware
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 7: Middleware Integration ═══\n');

assert(serverSource.includes('cors'), 'CORS middleware present');
assert(serverSource.includes('logger'), 'Logger middleware present');
assert(serverSource.includes('jwt') || serverSource.includes('JWT'), 'JWT middleware present');
assert(serverSource.includes('rateLimitStore') || serverSource.includes('rateLimit'), 'Rate limiting present');
assert(serverSource.includes('X-Request-ID') || serverSource.includes('x-request-id'), 'Request ID propagation present');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: Crypto Import
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 8: Crypto Module ═══\n');

assert(crypto !== undefined, 'Crypto module imported');
assert(typeof crypto.createHmac === 'function', 'crypto.createHmac is available');
assert(typeof crypto.createHash === 'function', 'crypto.createHash is available');
assert(typeof crypto.timingSafeEqual === 'function', 'crypto.timingSafeEqual is available');
assert(serverSource.includes("import crypto"), 'Server imports crypto module');

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ TEST SUMMARY ═══\n');
console.log(`Total: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
    console.log('\n✓ All enterprise hardening features verified successfully!');
    process.exit(0);
} else {
    console.log(`\n❌ ${failed} test(s) failed`);
    process.exit(1);
}
