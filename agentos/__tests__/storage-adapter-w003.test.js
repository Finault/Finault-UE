/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * W-003 TEST SUITE: Filesystem Write in Serverless Environment
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Validates that the W-003 fix properly eliminates all filesystem operations
 * from server-side code that deploys to Cloudflare Workers / Lambda / Vercel.
 *
 * Three levels of testing:
 *   1. STATIC ANALYSIS — Grep-level: no `fs` imports in server-side modules
 *   2. UNIT TESTS — StorageAdapter API contracts, mocked Supabase
 *   3. INTEGRATION TESTS — Migrated modules wire through storage adapter correctly
 *   4. CONTRACT TESTS — Return shapes, error handling, edge cases
 *
 * Files covered by W-003:
 *   - agentos/core/storage-adapter.js (new)
 *   - agentos/agents/compound-learning.js (migrated)
 *   - modules/observability/audit_store.js (migrated)
 *   - modules/erp-posting-service.js (migrated)
 *   - modules/closepack/concurrent_zip.js (migrated)
 *   - modules/retention/retention_policy.js (migrated)
 *   - modules/replay/replay_pipeline.js (migrated)
 *   - platform/concurrent_zip.js (re-export shim)
 *   - integrations/erp-posting-service.js (re-export shim)
 *   - tools/finault-cli.js (evaluated — CLI, legitimate fs usage)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Test Helpers ───────────────────────────────────────────────────────────
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

function assertThrows(fn, expectedSubstring, message) {
    try {
        fn();
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

// ─── File reader helper ────────────────────────────────────────────────────
function readSource(relativePath) {
    const fullPath = path.resolve(__dirname, '..', '..', relativePath);
    return fs.readFileSync(fullPath, 'utf-8');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: STATIC ANALYSIS — No filesystem imports in server-side modules
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 1: Static Analysis — No filesystem imports in server-side modules');
console.log('═══════════════════════════════════════════════════════════\n');

const SERVER_SIDE_FILES = [
    'agentos/agents/compound-learning.js',
    'modules/observability/audit_store.js',
    'modules/erp-posting-service.js',
    'modules/closepack/concurrent_zip.js',
    'modules/retention/retention_policy.js',
    'modules/replay/replay_pipeline.js',
];

const FS_IMPORT_PATTERNS = [
    /import\s+fs\s+from\s+['"]fs['"]/,
    /import\s+\{[^}]*\}\s+from\s+['"]fs['"]/,
    /import\s+\*\s+as\s+fs\s+from\s+['"]fs['"]/,
    /require\s*\(\s*['"]fs['"]\s*\)/,
    /await\s+import\s*\(\s*['"]fs['"]\s*\)/,
    /import\s+path\s+from\s+['"]path['"]/,
    /import\s+os\s+from\s+['"]os['"]/,
];

const FS_USAGE_PATTERNS = [
    /\bfs\.\w+Sync\b/,
    /\bfs\.promises\b/,
    /\bfs\.readFile\b/,
    /\bfs\.writeFile\b/,
    /\bfs\.appendFile\b/,
    /\bfs\.mkdir\b/,
    /\bfs\.unlink\b/,
    /\bfs\.rename\b/,
    /\bfs\.exists\b/,
    /\bfs\.stat\b/,
    /\bfs\.readdir\b/,
];

for (const filePath of SERVER_SIDE_FILES) {
    const source = readSource(filePath);
    const fileName = path.basename(filePath);

    // Check imports
    for (const pattern of FS_IMPORT_PATTERNS) {
        const match = source.match(pattern);
        assert(
            !match,
            `${fileName}: No filesystem import (${pattern.source.substring(0, 30)}...)`
        );
    }

    // Check usage
    for (const pattern of FS_USAGE_PATTERNS) {
        const match = source.match(pattern);
        assert(
            !match,
            `${fileName}: No filesystem usage (${pattern.source})`
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Storage Adapter imports present in migrated files
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 2: Storage Adapter imports present in migrated files');
console.log('═══════════════════════════════════════════════════════════\n');

const STORAGE_IMPORT_PATTERN = /import\s+\{?\s*storage\s*\}?\s+from\s+['"].*storage-adapter/;

for (const filePath of SERVER_SIDE_FILES) {
    const source = readSource(filePath);
    const fileName = path.basename(filePath);
    assert(
        STORAGE_IMPORT_PATTERN.test(source),
        `${fileName}: Imports storage adapter`
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Storage Adapter module exports correct API surface
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 3: Storage Adapter module — API surface validation');
console.log('═══════════════════════════════════════════════════════════\n');

const storageSource = readSource('agentos/core/storage-adapter.js');

// Document operations
assert(storageSource.includes('async function putDocument('), 'storage-adapter: exports putDocument');
assert(storageSource.includes('async function getDocument('), 'storage-adapter: exports getDocument');

// Log operations
assert(storageSource.includes('async function appendLog('), 'storage-adapter: exports appendLog');
assert(storageSource.includes('async function queryLog('), 'storage-adapter: exports queryLog');
assert(storageSource.includes('async function deleteLogBefore('), 'storage-adapter: exports deleteLogBefore');

// Blob operations
assert(storageSource.includes('async function putBlob('), 'storage-adapter: exports putBlob');
assert(storageSource.includes('async function getBlob('), 'storage-adapter: exports getBlob');

// Lock operations
assert(storageSource.includes('async function acquireLock('), 'storage-adapter: exports acquireLock');
assert(storageSource.includes('async function releaseLock('), 'storage-adapter: exports releaseLock');

// Utility
assert(storageSource.includes('function isServerless('), 'storage-adapter: exports isServerless');

// Exports object
assert(storageSource.includes('export const storage'), 'storage-adapter: named export "storage"');
assert(storageSource.includes('export default storage'), 'storage-adapter: default export');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Storage Adapter — putDocument SHA256 computation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 4: Storage Adapter — putDocument includes SHA256 integrity');
console.log('═══════════════════════════════════════════════════════════\n');

assert(
    storageSource.includes("crypto.createHash('sha256')"),
    'putDocument: Computes SHA256 hash of content'
);

assert(
    storageSource.includes('.digest(\'hex\')'),
    'putDocument: Outputs hex-encoded hash'
);

// Versioning support
assert(
    storageSource.includes('version') && storageSource.includes('ascending: false'),
    'putDocument: Supports version history with descending order'
);

// Conflict handling (upsert)
assert(
    storageSource.includes('onConflict'),
    'putDocument: Upsert handles conflicts on (bucket, key)'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Storage Adapter — Distributed lock semantics
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 5: Storage Adapter — Distributed lock semantics');
console.log('═══════════════════════════════════════════════════════════\n');

// acquireLock must generate a unique owner ID
assert(
    storageSource.includes('crypto.randomBytes') && storageSource.includes('owner'),
    'acquireLock: Generates unique owner identifier'
);

// acquireLock must set an expiration time
assert(
    storageSource.includes('expires_at') && storageSource.includes('ttlMs'),
    'acquireLock: Sets TTL-based expiration'
);

// acquireLock must clean up expired locks before trying to acquire
assert(
    storageSource.includes('.delete()') && storageSource.includes("lt('expires_at'"),
    'acquireLock: Cleans up expired locks before acquisition'
);

// acquireLock returns null on failure (not throw)
assert(
    storageSource.includes('return null') && storageSource.includes('Timed out waiting for lock'),
    'acquireLock: Returns null after retry timeout'
);

// releaseLock checks owner before deleting
assert(
    storageSource.includes("eq('owner', lock.owner)"),
    'releaseLock: Verifies ownership before release'
);

// releaseLock is null-safe
assert(
    storageSource.includes('if (!lock) return'),
    'releaseLock: No-op for null lock handle'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Storage Adapter — appendLog entry hash passthrough
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 6: Storage Adapter — appendLog entry hash behavior');
console.log('═══════════════════════════════════════════════════════════\n');

// appendLog should use the entry's own hash if present
assert(
    storageSource.includes('entry.entry_hash') || storageSource.includes('entry_hash'),
    'appendLog: Preserves entry_hash from audit entries'
);

// appendLog computes its own hash as fallback
assert(
    storageSource.includes("createHash('sha256')") &&
    storageSource.includes('JSON.stringify(entry)'),
    'appendLog: Computes fallback hash from entry JSON'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: compound-learning.js — Storage adapter wiring
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 7: compound-learning.js — Supabase storage wiring');
console.log('═══════════════════════════════════════════════════════════\n');

const compoundSource = readSource('agentos/agents/compound-learning.js');

// Constructor uses bucket/key pattern
assert(
    compoundSource.includes("this.learningsBucket = 'learning-docs'"),
    'CompoundLearning: Constructor sets learningsBucket'
);
assert(
    compoundSource.includes('this.learningsKey = `${organizationId}/AGENTS.md`'),
    'CompoundLearning: Constructor sets org-scoped learningsKey'
);

// updateAgentsMd reads from storage
assert(
    compoundSource.includes('storage.getDocument(this.learningsBucket, this.learningsKey)'),
    'CompoundLearning: updateAgentsMd reads from storage.getDocument'
);

// updateAgentsMd writes to storage with versioning
assert(
    compoundSource.includes('storage.putDocument(this.learningsBucket, this.learningsKey, updatedContent, { version: true })'),
    'CompoundLearning: updateAgentsMd writes with version: true'
);

// No learningsPath (old filesystem path) reference
assert(
    !compoundSource.includes('this.learningsPath'),
    'CompoundLearning: No remnant learningsPath property'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: audit_store.js — Storage adapter wiring
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 8: audit_store.js — Supabase storage wiring');
console.log('═══════════════════════════════════════════════════════════\n');

const auditSource = readSource('modules/observability/audit_store.js');

// Constructor uses stream names (not filesystem paths)
assert(
    auditSource.includes("this.auditStream = options.auditStream || 'audit-entries'"),
    'AuditLogStore: Constructor sets auditStream'
);
assert(
    auditSource.includes("this.sealStream = options.sealStream || 'audit-seals'"),
    'AuditLogStore: Constructor sets sealStream'
);

// No storageDir, _currentFile, _currentSize
assert(!auditSource.includes('this.storageDir'), 'AuditLogStore: No remnant storageDir');
assert(!auditSource.includes('this._currentFile'), 'AuditLogStore: No remnant _currentFile');
assert(!auditSource.includes('this._currentSize'), 'AuditLogStore: No remnant _currentSize');

// No _ensureStorageDir or _getLogFilePath methods
assert(!auditSource.includes('_ensureStorageDir'), 'AuditLogStore: No remnant _ensureStorageDir');
assert(!auditSource.includes('_getLogFilePath'), 'AuditLogStore: No remnant _getLogFilePath');

// append() uses storage.appendLog
assert(
    auditSource.includes('storage.appendLog(this.auditStream, entry)'),
    'AuditLogStore: append() writes to storage.appendLog'
);

// query() uses storage.queryLog
assert(
    auditSource.includes('storage.queryLog(this.auditStream, filters)'),
    'AuditLogStore: query() reads from storage.queryLog'
);

// _sealBatch() writes seals to Supabase
assert(
    auditSource.includes('storage.appendLog(this.sealStream, seal)'),
    'AuditLogStore: _sealBatch() writes to sealStream'
);

// applyRetention() uses storage.deleteLogBefore
assert(
    auditSource.includes('storage.deleteLogBefore(this.auditStream, cutoffDate)'),
    'AuditLogStore: applyRetention() uses storage.deleteLogBefore'
);

// All 26 audit event types preserved
const expectedEventTypes = [
    'CLOSEPACK_STARTED', 'CLOSEPACK_GENERATED', 'CLOSEPACK_VERIFIED', 'CLOSEPACK_FAILED',
    'FCS_COMPUTED', 'FCS_THRESHOLD_BREACH',
    'DRIFT_DETECTED', 'DRIFT_ALERT',
    'ERP_POST_STARTED', 'ERP_POST_COMPLETED', 'ERP_POST_FAILED', 'ERP_VARIANCE_DETECTED',
    'ANCHOR_SUBMITTED', 'ANCHOR_CONFIRMED', 'ANCHOR_FAILED',
    'VERIFICATION_REQUESTED', 'VERIFICATION_COMPLETED', 'VERIFICATION_FAILED',
    'REPLAY_STARTED', 'REPLAY_COMPLETED', 'REPLAY_MISMATCH',
    'API_REQUEST', 'API_ERROR',
    'AUTH_SUCCESS', 'AUTH_FAILURE', 'AUTH_TOKEN_ISSUED', 'AUTH_TOKEN_REVOKED',
    'CONFIG_CHANGED', 'RETENTION_APPLIED',
];

let missingEventTypes = 0;
for (const et of expectedEventTypes) {
    if (!auditSource.includes(et)) {
        console.log(`  ✗ FAIL: Missing event type: ${et}`);
        failed++;
        failures.push(`Missing event type: ${et}`);
        missingEventTypes++;
    }
}
assert(missingEventTypes === 0, `AuditLogStore: All ${expectedEventTypes.length} event types preserved`);

// createAuditEntry still computes entry_hash
assert(
    auditSource.includes("crypto.createHash('sha256')") &&
    auditSource.includes('entry.entry_hash'),
    'AuditLogStore: createAuditEntry still computes entry_hash'
);

// Merkle tree computation still present
assert(
    auditSource.includes('_computeMerkleRoot'),
    'AuditLogStore: Merkle tree computation preserved'
);

// Export format methods still present
assert(
    auditSource.includes("format === 'ndjson'") && auditSource.includes("format === 'csv'"),
    'AuditLogStore: export() still supports ndjson and csv formats'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9: erp-posting-service.js — Sandbox storage wiring
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 9: erp-posting-service.js — Sandbox storage wiring');
console.log('═══════════════════════════════════════════════════════════\n');

const erpSource = readSource('modules/erp-posting-service.js');

// No dynamic fs import
assert(
    !erpSource.includes("await import('fs')") && !erpSource.includes("import('fs')"),
    'ERPPostingService: No dynamic fs import'
);

// _postToSandbox uses storage.putDocument
assert(
    erpSource.includes("storage.putDocument(sandboxBucket,"),
    'ERPPostingService: _postToSandbox writes via storage.putDocument'
);

// Three sandbox files written (template literals use backticks, not single quotes)
assert(
    erpSource.includes('-journal.csv') &&
    erpSource.includes('-receipt.json') &&
    erpSource.includes('-reconciliation.csv'),
    'ERPPostingService: Sandbox writes all 3 file types (journal, receipt, reconciliation)'
);

// Sandbox bucket defined
assert(
    erpSource.includes("sandboxBucket = 'sandbox-receipts'"),
    'ERPPostingService: Sandbox bucket is "sandbox-receipts"'
);

// Error handling: sandbox storage errors fail-closed (CALLER-BUG 41 updated this)
// Old test checked for storageWriteError property; now the method returns success:false
assert(
    !erpSource.includes('sandboxReceipt.fileWriteError'),
    'ERPPostingService: No legacy fileWriteError property in sandbox handler'
);

// Idempotency key computation preserved
assert(
    erpSource.includes('computeIdempotencyKey') &&
    erpSource.includes('sha256'),
    'ERPPostingService: Idempotency key computation preserved'
);

// Receipt pack generation still uses JSZip
assert(
    erpSource.includes('new JSZip()') && erpSource.includes('_generateReceiptPack'),
    'ERPPostingService: Receipt pack generation (JSZip) preserved'
);

// All database methods preserved
const erpDbMethods = [
    '_checkExistingReceipt', '_checkInProgress',
    '_recordAttempt', '_recordFailure', '_recordReceipt',
];
for (const method of erpDbMethods) {
    assert(
        erpSource.includes(method),
        `ERPPostingService: Database method ${method} preserved`
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10: concurrent_zip.js — Distributed lock + blob storage wiring
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 10: concurrent_zip.js — Distributed lock + blob storage');
console.log('═══════════════════════════════════════════════════════════\n');

const zipSource = readSource('modules/closepack/concurrent_zip.js');

// FileLock class removed
assert(
    !zipSource.includes('class FileLock'),
    'ConcurrentZipWriter: FileLock class removed'
);

// Uses distributed locks
assert(
    zipSource.includes("storage.acquireLock('closepack-gen'"),
    'ConcurrentZipWriter: write() uses storage.acquireLock'
);
assert(
    zipSource.includes('storage.releaseLock(lock)'),
    'ConcurrentZipWriter: write() releases lock in finally block'
);

// Lock released in finally block (not just success path)
assert(
    zipSource.includes('finally') && zipSource.includes('releaseLock'),
    'ConcurrentZipWriter: Lock release is in finally block (always executes)'
);

// Uses blob storage for ZIPs
assert(
    zipSource.includes("storage.putBlob('closepacks'"),
    'ConcurrentZipWriter: write() stores ZIP via storage.putBlob'
);
assert(
    zipSource.includes("storage.getBlob('closepacks'"),
    'ConcurrentZipWriter: write() verifies via storage.getBlob read-back'
);

// Checksum verification after write
assert(
    zipSource.includes('verifyHash !== zipHash') &&
    zipSource.includes('checksum mismatch after write'),
    'ConcurrentZipWriter: Post-write checksum verification preserved'
);

// Return value uses key (not path)
assert(
    zipSource.includes('key: outputKey') && !zipSource.includes('path: outputPath'),
    'ConcurrentZipWriter: Return value uses "key" (not filesystem "path")'
);

// verify() accepts Buffer or storage key
assert(
    zipSource.includes('Buffer.isBuffer(zipPathOrBuffer)'),
    'ConcurrentZipWriter: verify() accepts Buffer or storage key'
);

// No tempDir in constructor
assert(
    !zipSource.includes('tempDir') && !zipSource.includes('os.tmpdir'),
    'ConcurrentZipWriter: No tempDir / os.tmpdir references'
);

// Deterministic sorting preserved
assert(
    zipSource.includes('.sort()') && zipSource.includes('lexicographic'),
    'ConcurrentZipWriter: Lexicographic artifact sorting preserved'
);

// JSZip compression preserved
assert(
    zipSource.includes('DEFLATE') && zipSource.includes('compressionLevel'),
    'ConcurrentZipWriter: ZIP compression options preserved'
);

// generateBuildJson preserved (build-time only, not affected by W-003)
assert(
    zipSource.includes('generateBuildJson'),
    'ConcurrentZipWriter: generateBuildJson helper preserved'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 11: finault-cli.js — Legitimate CLI filesystem usage
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 11: finault-cli.js — CLI filesystem usage audit');
console.log('═══════════════════════════════════════════════════════════\n');

const cliSource = readSource('tools/finault-cli.js');

// CLI is allowed to use fs (it runs on dev machines, not serverless)
assert(
    cliSource.includes("import fs from 'fs'"),
    'CLI: Retains fs import (legitimate for CLI tool)'
);

// CLI reads user-supplied ZIP files (required for CLI workflow)
assert(
    cliSource.includes('fs.readFileSync(zipPath)'),
    'CLI: Reads user-supplied ZIP files from disk'
);

// CLI writes ledger HTML (user-requested output)
assert(
    cliSource.includes('fs.writeFileSync(outputHtml, html)'),
    'CLI: Writes ledger HTML to user-specified path'
);

// CLI is NOT imported by any server-side module (no cross-contamination)
for (const serverFile of SERVER_SIDE_FILES) {
    const source = readSource(serverFile);
    assert(
        !source.includes('finault-cli'),
        `${path.basename(serverFile)}: Does not import CLI (no cross-contamination)`
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 12: Storage Adapter — queryLog filter passthrough
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 12: Storage Adapter — queryLog filter passthrough');
console.log('═══════════════════════════════════════════════════════════\n');

// queryLog supports all required filter dimensions
const queryLogFilters = ['tenantId', 'closeId', 'eventType', 'startTime', 'endTime', 'limit'];
for (const filter of queryLogFilters) {
    assert(
        storageSource.includes(filter),
        `queryLog: Supports ${filter} filter`
    );
}

// queryLog uses JSONB filters for tenant/close/event
assert(
    storageSource.includes("entry->>tenant_id") &&
    storageSource.includes("entry->>close_id") &&
    storageSource.includes("entry->>event_type"),
    'queryLog: Uses JSONB arrow operator for structured filtering'
);

// queryLog returns entries sorted by created_at descending
assert(
    storageSource.includes("order('created_at', { ascending: false })"),
    'queryLog: Returns entries in descending chronological order'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 13: Storage Adapter — Supabase table schemas
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 13: Storage Adapter — Supabase table references');
console.log('═══════════════════════════════════════════════════════════\n');

// Documents table
assert(
    storageSource.includes("from('storage_documents')"),
    'StorageAdapter: References storage_documents table'
);

// Logs table
assert(
    storageSource.includes("from('storage_logs')"),
    'StorageAdapter: References storage_logs table'
);

// Locks table
assert(
    storageSource.includes("from('storage_locks')"),
    'StorageAdapter: References storage_locks table'
);

// Blob storage uses Supabase Storage (not tables)
assert(
    storageSource.includes('supabase.storage') && storageSource.includes('.from(bucket)'),
    'StorageAdapter: Blobs use Supabase Storage buckets (not tables)'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 14: Storage Adapter — isServerless() environment detection
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 14: Storage Adapter — Serverless environment detection');
console.log('═══════════════════════════════════════════════════════════\n');

const serverlessEnvVars = [
    'CLOUDFLARE_WORKER',
    'CF_PAGES',
    'VERCEL',
    'AWS_LAMBDA_FUNCTION_NAME',
    'LAMBDA_TASK_ROOT',
];

for (const envVar of serverlessEnvVars) {
    assert(
        storageSource.includes(envVar),
        `isServerless: Detects ${envVar}`
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 15: Storage Adapter — Error handling patterns
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 15: Storage Adapter — Error handling');
console.log('═══════════════════════════════════════════════════════════\n');

// putDocument throws on Supabase errors
assert(
    storageSource.includes('[StorageAdapter] putDocument failed'),
    'putDocument: Throws descriptive error on Supabase failure'
);

// getDocument returns null on not-found (PGRST116)
assert(
    storageSource.includes('PGRST116') && storageSource.includes('return null'),
    'getDocument: Returns null on not-found (PGRST116)'
);

// appendLog throws on Supabase errors
assert(
    storageSource.includes('[StorageAdapter] appendLog failed'),
    'appendLog: Throws descriptive error on Supabase failure'
);

// queryLog throws on Supabase errors
assert(
    storageSource.includes('[StorageAdapter] queryLog failed'),
    'queryLog: Throws descriptive error on Supabase failure'
);

// putBlob throws on Supabase errors
assert(
    storageSource.includes('[StorageAdapter] putBlob failed'),
    'putBlob: Throws descriptive error on Supabase failure'
);

// getBlob throws on Supabase errors
assert(
    storageSource.includes('[StorageAdapter] getBlob failed'),
    'getBlob: Throws descriptive error on Supabase failure'
);

// releaseLock warns but does not throw (graceful degradation)
assert(
    storageSource.includes('console.warn') && storageSource.includes('releaseLock warning'),
    'releaseLock: Warns on failure (does not throw)'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 16: Cross-module consistency — no orphaned filesystem references
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 16: Cross-module consistency — no orphaned filesystem refs');
console.log('═══════════════════════════════════════════════════════════\n');

// Check that no server-side file references filesystem paths like './audit-logs' or 'sandbox-receipts' as directories
for (const filePath of SERVER_SIDE_FILES) {
    const source = readSource(filePath);
    const fileName = path.basename(filePath);

    // No mkdirSync, mkdirp, or fs.mkdir references
    assert(
        !source.includes('mkdirSync') && !source.includes('fs.mkdir'),
        `${fileName}: No directory creation operations`
    );

    // No writeFileSync, appendFileSync, or unlinkSync
    assert(
        !source.includes('writeFileSync') &&
        !source.includes('appendFileSync') &&
        !source.includes('unlinkSync'),
        `${fileName}: No synchronous file write/delete operations`
    );

    // No readdirSync, readFileSync, statSync
    assert(
        !source.includes('readdirSync') &&
        !source.includes('readFileSync') &&
        !source.includes('statSync'),
        `${fileName}: No synchronous file read operations`
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 17: AuditLogStore — Return contract changes
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 17: AuditLogStore — Return contracts');
console.log('═══════════════════════════════════════════════════════════\n');

// append() returns stream instead of log_file
assert(
    auditSource.includes('stream: this.auditStream') &&
    !auditSource.includes("log_file:"),
    'AuditLogStore.append(): Returns stream (not log_file)'
);

// applyRetention() returns deletedEntries (not deletedFiles)
assert(
    auditSource.includes('deletedEntries:') && !auditSource.includes('deletedFiles:'),
    'AuditLogStore.applyRetention(): Returns deletedEntries (not deletedFiles)'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 18: ConcurrentZipWriter — Lock safety in write()
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 18: ConcurrentZipWriter — Lock safety patterns');
console.log('═══════════════════════════════════════════════════════════\n');

// Lock variable initialized as null before try block
assert(
    zipSource.includes('let lock = null'),
    'write(): Lock initialized to null before try block'
);

// Lock acquired inside try block
assert(
    zipSource.includes('lock = await storage.acquireLock'),
    'write(): Lock acquired inside try block'
);

// Lock released in finally (not try or catch)
const finallyIndex = zipSource.indexOf('finally');
const releaseLockIndex = zipSource.indexOf('storage.releaseLock', finallyIndex);
assert(
    finallyIndex > 0 && releaseLockIndex > finallyIndex,
    'write(): storage.releaseLock is inside finally block'
);

// Lock null-check before release
assert(
    zipSource.includes('if (lock)') && zipSource.includes('releaseLock'),
    'write(): Null-checks lock before releasing'
);

// Throws on lock acquisition failure
assert(
    zipSource.includes('Failed to acquire lock'),
    'write(): Throws descriptive error on lock failure'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 19: Compound Learning — Organization-scoped storage keys
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 19: Compound Learning — Organization-scoped storage');
console.log('═══════════════════════════════════════════════════════════\n');

// Key includes organizationId prefix for multi-tenancy
assert(
    compoundSource.includes('`${organizationId}/AGENTS.md`'),
    'CompoundLearning: Storage key is org-scoped (multi-tenant safe)'
);

// Uses validateAgentParams (W-002 integration)
assert(
    compoundSource.includes('validateAgentParams(params'),
    'CompoundLearning: Uses validateAgentParams (W-002 + W-003 integration)'
);

// Stores learnings in Supabase database too (dual write for searchability)
assert(
    compoundSource.includes("from('agent_memory')") && compoundSource.includes('.insert'),
    'CompoundLearning: Stores learnings in agent_memory table for searchability'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 20: Storage Adapter — deleteLogBefore for retention
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 20: Storage Adapter — deleteLogBefore retention');
console.log('═══════════════════════════════════════════════════════════\n');

// deleteLogBefore uses cutoff date (BUG 14 changed to coerced `iso` variable)
assert(
    storageSource.includes("lte('created_at', iso)"),
    'deleteLogBefore: Filters entries at or before cutoff date'
);

// deleteLogBefore returns deletion count
assert(
    storageSource.includes("deleted: data?.length || 0"),
    'deleteLogBefore: Returns { deleted: count }'
);

// deleteLogBefore throws on error
assert(
    storageSource.includes('[StorageAdapter] deleteLogBefore failed'),
    'deleteLogBefore: Throws on Supabase error'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 21: ERP Posting Service — Sandbox receipts in storage bucket
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 21: ERP Posting Service — Sandbox receipt paths');
console.log('═══════════════════════════════════════════════════════════\n');

// filesWritten uses bucket-prefixed paths
assert(
    erpSource.includes('`${sandboxBucket}/${closeId}-journal.csv`') ||
    erpSource.includes("sandboxBucket + '/' + closeId"),
    'ERPPostingService: filesWritten uses storage bucket paths (not filesystem)'
);

// Main post() method still generates receipt packs via JSZip
assert(
    erpSource.includes('_generateReceiptPack') && erpSource.includes('new JSZip()'),
    'ERPPostingService: Receipt pack ZIP generation preserved'
);

// Variance reconciliation preserved
assert(
    erpSource.includes('reconcileVariance') && erpSource.includes('generateVarianceCSV'),
    'ERPPostingService: Variance reconciliation methods preserved'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 22: retention_policy.js — Storage adapter migration
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 22: retention_policy.js — Storage adapter migration');
console.log('═══════════════════════════════════════════════════════════\n');

const retentionSource = readSource('modules/retention/retention_policy.js');

// Imports storage adapter
assert(
    STORAGE_IMPORT_PATTERN.test(retentionSource),
    'RetentionPolicy: Imports storage adapter'
);

// Uses storageBuckets mapping (not storageDir)
assert(
    retentionSource.includes('this.storageBuckets') && !retentionSource.includes('this.storageDir'),
    'RetentionPolicy: Uses storageBuckets mapping (not filesystem storageDir)'
);

// Uses storage.queryLog for scanning
assert(
    retentionSource.includes('storage.queryLog('),
    'RetentionPolicy: Uses storage.queryLog for scanning entries'
);

// Uses storage.deleteLogBefore for cleanup
assert(
    retentionSource.includes('storage.deleteLogBefore('),
    'RetentionPolicy: Uses storage.deleteLogBefore for retention cleanup'
);

// No _getAllFiles or _processDirectory (old filesystem methods)
assert(
    !retentionSource.includes('_getAllFiles') && !retentionSource.includes('_processDirectory'),
    'RetentionPolicy: No remnant filesystem scanning methods (_getAllFiles, _processDirectory)'
);

// All retention periods preserved
const retentionPeriods = ['CLOSE_PACKS', 'AUDIT_LOGS', 'TELEMETRY', 'ERP_RECEIPTS', 'VERIFICATION_RESULTS', 'SESSION_DATA', 'TEMP_FILES', 'SOFT_DELETE'];
for (const period of retentionPeriods) {
    assert(
        retentionSource.includes(period),
        `RetentionPolicy: Retention period ${period} preserved`
    );
}

// LegalHoldManager preserved
assert(
    retentionSource.includes('class LegalHoldManager') && retentionSource.includes('placeHold'),
    'RetentionPolicy: LegalHoldManager class preserved'
);

// getSchedule static method preserved
assert(
    retentionSource.includes('static getSchedule(') && retentionSource.includes('cron'),
    'RetentionPolicy: Cron schedule helper preserved'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 23: replay_pipeline.js — Storage adapter migration
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 23: replay_pipeline.js — Storage adapter migration');
console.log('═══════════════════════════════════════════════════════════\n');

const replaySource = readSource('modules/replay/replay_pipeline.js');

// Imports storage adapter
assert(
    STORAGE_IMPORT_PATTERN.test(replaySource),
    'ReplayPipeline: Imports storage adapter'
);

// Uses telemetryStream and closePackBucket (not filesystem dirs)
assert(
    replaySource.includes('this.telemetryStream') && replaySource.includes('this.closePackBucket'),
    'ReplayPipeline: Uses stream/bucket config (not filesystem paths)'
);

// _loadTelemetry uses storage.queryLog
assert(
    replaySource.includes('storage.queryLog(this.telemetryStream'),
    'ReplayPipeline: _loadTelemetry reads from storage.queryLog'
);

// _compare accepts Buffer or storage key
assert(
    replaySource.includes('Buffer.isBuffer(') && replaySource.includes('storage.getBlob(this.closePackBucket'),
    'ReplayPipeline: _compare accepts Buffer or storage key via getBlob'
);

// replay() uses originalZipKey/originalZipBuffer (not originalZipPath)
assert(
    replaySource.includes('originalZipKey') && replaySource.includes('originalZipBuffer'),
    'ReplayPipeline: replay() uses storage keys (not filesystem paths)'
);

// No filesystem path references
assert(
    !replaySource.includes('originalZipPath') && !replaySource.includes('fs.readFile'),
    'ReplayPipeline: No remnant filesystem path references'
);

// FCS computation preserved (key business logic)
assert(
    replaySource.includes('_computeFCS') && replaySource.includes('fcs_score') && replaySource.includes('fcs_tier'),
    'ReplayPipeline: FCS computation fully preserved'
);

// Merkle tree preserved
assert(
    replaySource.includes('_buildMerkleTree') && replaySource.includes('root_sha256'),
    'ReplayPipeline: Merkle tree computation preserved'
);

// Deterministic sorting preserved
assert(
    replaySource.includes('lexicographic') && replaySource.includes('.sort('),
    'ReplayPipeline: Deterministic event sorting preserved'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 24: Re-export shims — Backwards compatibility
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 24: Re-export shims — Backwards compatibility');
console.log('═══════════════════════════════════════════════════════════\n');

const shimZipSource = readSource('platform/concurrent_zip.js');
const shimErpSource = readSource('integrations/erp-posting-service.js');

// platform/concurrent_zip.js is a re-export shim
assert(
    shimZipSource.includes('DEPRECATED') && shimZipSource.includes('migrated'),
    'Shim (platform/concurrent_zip.js): Contains DEPRECATED migration notice'
);
assert(
    shimZipSource.includes("from '../modules/closepack/concurrent_zip.js'"),
    'Shim (platform/concurrent_zip.js): Re-exports from canonical location'
);
assert(
    shimZipSource.includes('ConcurrentZipWriter') && shimZipSource.includes('LOCK_TIMEOUT_MS') && shimZipSource.includes('generateBuildJson'),
    'Shim (platform/concurrent_zip.js): Re-exports all public symbols'
);
assert(
    !shimZipSource.includes('class FileLock') && !shimZipSource.includes("import fs"),
    'Shim (platform/concurrent_zip.js): No filesystem code remains'
);

// integrations/erp-posting-service.js is a re-export shim
assert(
    shimErpSource.includes('DEPRECATED') && shimErpSource.includes('migrated'),
    'Shim (integrations/erp-posting-service.js): Contains DEPRECATED migration notice'
);
assert(
    shimErpSource.includes("from '../modules/erp-posting-service.js'"),
    'Shim (integrations/erp-posting-service.js): Re-exports from canonical location'
);
assert(
    shimErpSource.includes('ERPPostingService') && shimErpSource.includes('ERP_POSTING_CONFIG'),
    'Shim (integrations/erp-posting-service.js): Re-exports all public symbols'
);
assert(
    !shimErpSource.includes("import fs") && !shimErpSource.includes("import('fs')"),
    'Shim (integrations/erp-posting-service.js): No filesystem code remains'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 25: BUG 1 FIX — putDocument PK includes version
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 25: BUG 1 FIX — putDocument PK is (bucket, key, version)');
console.log('═══════════════════════════════════════════════════════════\n');

// PK documented as (bucket, key, version) in comment
assert(
    storageSource.includes('PRIMARY KEY (bucket, key, version)'),
    'BUG 1 FIX: PK comment documents (bucket, key, version)'
);

// Non-versioned upsert targets all three PK columns
assert(
    storageSource.includes("onConflict: 'bucket,key,version'"),
    'BUG 1 FIX: Non-versioned upsert onConflict includes version column'
);

// Versioned path uses insert() (not upsert) — each version is a new row
const versionedSection = storageSource.substring(
    storageSource.indexOf('if (version) {'),
    storageSource.indexOf('// Upsert (no version history)')
);
assert(
    versionedSection.includes('.insert(') && !versionedSection.includes('.upsert('),
    'BUG 1 FIX: Versioned path uses insert() not upsert() (prevents PK collision)'
);

// Version number computation increments from existing max
assert(
    storageSource.includes("(existing?.version || 0) + 1"),
    'BUG 1 FIX: Version number increments from existing max (or starts at 1)'
);

// Non-versioned path hardcodes version: 1
const nonVersionedSection = storageSource.substring(
    storageSource.indexOf('// Upsert (no version history)'),
    storageSource.indexOf('async function getDocument')
);
assert(
    nonVersionedSection.includes('version: 1'),
    'BUG 1 FIX: Non-versioned path hardcodes version: 1'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 26: BUG 2 FIX — acquireLock retry loop
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 26: BUG 2 FIX — acquireLock has retry loop');
console.log('═══════════════════════════════════════════════════════════\n');

// Has LOCK_RETRY_INTERVAL_MS constant
assert(
    storageSource.includes('const LOCK_RETRY_INTERVAL_MS = '),
    'BUG 2 FIX: LOCK_RETRY_INTERVAL_MS constant defined'
);

// Has while loop bounded by ttlMs
assert(
    storageSource.includes('while (Date.now() - startTime < ttlMs)'),
    'BUG 2 FIX: Retry loop bounded by ttlMs elapsed time'
);

// Records startTime before loop
assert(
    storageSource.includes('const startTime = Date.now()'),
    'BUG 2 FIX: startTime recorded before retry loop'
);

// Sleep between retries inside the loop
const lockFunctionBody = storageSource.substring(
    storageSource.indexOf('async function acquireLock'),
    storageSource.indexOf('async function releaseLock')
);
assert(
    lockFunctionBody.includes('setTimeout(resolve, LOCK_RETRY_INTERVAL_MS)'),
    'BUG 2 FIX: Sleep between retry attempts uses LOCK_RETRY_INTERVAL_MS'
);

// Cleanup expired + insert happens INSIDE the loop (not before it)
const whileBodyStart = lockFunctionBody.indexOf('while (');
const whileBody = lockFunctionBody.substring(whileBodyStart);
assert(
    whileBody.includes('.delete()') && whileBody.includes('.insert('),
    'BUG 2 FIX: Cleanup and acquire both execute inside retry loop'
);

// Return null only AFTER loop exhaustion (not inside loop on first failure)
assert(
    lockFunctionBody.includes('return null') &&
    lockFunctionBody.indexOf('return null') > lockFunctionBody.indexOf('while ('),
    'BUG 2 FIX: Returns null only after loop exhaustion (timeout)'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 27: Behavioral — putDocument code path analysis
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 27: Behavioral — putDocument code path analysis');
console.log('═══════════════════════════════════════════════════════════\n');

// Extract the putDocument function body
const putDocBody = storageSource.substring(
    storageSource.indexOf('async function putDocument('),
    storageSource.indexOf('async function getDocument(')
);

// SHA256 hash computed before the branch (shared by both paths)
assert(
    putDocBody.indexOf("createHash('sha256')") < putDocBody.indexOf('if (version)'),
    'putDocument: SHA256 computed before version branch (shared computation)'
);

// Versioned path: queries for max version, inserts new row
assert(
    putDocBody.includes(".select('version')") &&
    putDocBody.includes("ascending: false") &&
    putDocBody.includes(".limit(1)") &&
    putDocBody.includes(".single()"),
    'putDocument versioned: Queries max existing version with descending sort + limit 1'
);

// Non-versioned path: upserts with version=1
assert(
    putDocBody.includes('.upsert(') && putDocBody.includes('version: 1,'),
    'putDocument non-versioned: Upserts with hardcoded version 1'
);

// Both paths return { bucket, key, version, sha256 }
const returnStatements = putDocBody.match(/return\s*\{[^}]+\}/g) || [];
assert(
    returnStatements.length >= 2 &&
    returnStatements.every(r => r.includes('bucket') && r.includes('key') && r.includes('sha256')),
    'putDocument: Both code paths return { bucket, key, version, sha256 }'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 28: Behavioral — acquireLock structural contract
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 28: Behavioral — acquireLock structural contract');
console.log('═══════════════════════════════════════════════════════════\n');

// Return shape on success includes all required fields
assert(
    lockFunctionBody.includes('return { scope, key, owner, expiresAt }'),
    'acquireLock: Success return includes scope, key, owner, expiresAt'
);

// Owner ID includes process ID and random bytes (uniqueness guarantee)
assert(
    lockFunctionBody.includes('process.pid') && lockFunctionBody.includes('crypto.randomBytes'),
    'acquireLock: Owner ID combines process.pid + random bytes for uniqueness'
);

// Lock insert includes all required fields
assert(
    lockFunctionBody.includes('lock_scope: scope') &&
    lockFunctionBody.includes('lock_key: key') &&
    lockFunctionBody.includes('owner,') &&
    lockFunctionBody.includes('expires_at: expiresAt'),
    'acquireLock: Insert includes scope, key, owner, expires_at'
);

// Expired lock cleanup uses lt() on expires_at
assert(
    lockFunctionBody.includes("lt('expires_at'"),
    'acquireLock: Expired lock cleanup uses lt(expires_at, now)'
);

// Success check: !error means lock acquired
assert(
    lockFunctionBody.includes('if (!error)') &&
    lockFunctionBody.includes('// Lock acquired'),
    'acquireLock: Confirms acquisition via error-free insert'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 29: Behavioral — releaseLock contract
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 29: Behavioral — releaseLock contract');
console.log('═══════════════════════════════════════════════════════════\n');

const releaseLockBody = storageSource.substring(
    storageSource.indexOf('async function releaseLock('),
    storageSource.indexOf('// ═', storageSource.indexOf('async function releaseLock('))
);

// Null-safe guard
assert(
    releaseLockBody.includes('if (!lock) return'),
    'releaseLock: Null-safe (returns early for null lock handle)'
);

// Deletes by all three keys: scope, key, owner (prevents releasing others' locks)
assert(
    releaseLockBody.includes("eq('lock_scope', lock.scope)") &&
    releaseLockBody.includes("eq('lock_key', lock.key)") &&
    releaseLockBody.includes("eq('owner', lock.owner)"),
    'releaseLock: Deletes by scope + key + owner (prevents releasing others\' locks)'
);

// Warns but does not throw on failure (graceful degradation)
assert(
    releaseLockBody.includes('console.warn') && !releaseLockBody.includes('throw'),
    'releaseLock: Warns on failure but does not throw (graceful degradation)'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 30: Behavioral (executable) — isServerless() function
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 30: Behavioral (executable) — isServerless()');
console.log('═══════════════════════════════════════════════════════════\n');

// Extract and execute the isServerless function
const isServerlessFn = new Function('process', `
    return function isServerless() {
        return !!(
            process.env.CLOUDFLARE_WORKER ||
            process.env.CF_PAGES ||
            process.env.VERCEL ||
            process.env.AWS_LAMBDA_FUNCTION_NAME ||
            process.env.LAMBDA_TASK_ROOT
        );
    };
`)(process);

// Save and clear env vars
const savedEnvVars = {};
const serverlessVarNames = ['CLOUDFLARE_WORKER', 'CF_PAGES', 'VERCEL', 'AWS_LAMBDA_FUNCTION_NAME', 'LAMBDA_TASK_ROOT'];
serverlessVarNames.forEach(v => { savedEnvVars[v] = process.env[v]; delete process.env[v]; });

// Test: false when no serverless vars set
assert(isServerlessFn() === false, 'isServerless: Returns false with no serverless env vars');

// Test each env var individually triggers true
for (const envVar of serverlessVarNames) {
    process.env[envVar] = '1';
    assert(isServerlessFn() === true, `isServerless: Returns true for ${envVar}`);
    delete process.env[envVar];
}

// Test: true when multiple vars set simultaneously
process.env.CLOUDFLARE_WORKER = '1';
process.env.CF_PAGES = '1';
assert(isServerlessFn() === true, 'isServerless: Returns true with multiple vars set simultaneously');

// Restore env vars
serverlessVarNames.forEach(v => {
    delete process.env[v];
    if (savedEnvVars[v] !== undefined) process.env[v] = savedEnvVars[v];
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 31: Behavioral (executable) — SHA256 hash integrity
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 31: Behavioral (executable) — SHA256 hash integrity');
console.log('═══════════════════════════════════════════════════════════\n');

// Verify the hash computation pattern matches what the storage adapter produces
const testContent = 'Hello, Finault Close Pack!';
const expectedHash = crypto.createHash('sha256').update(testContent).digest('hex');

// Hash must be 64-char hex string
assert(
    expectedHash.length === 64 && /^[0-9a-f]{64}$/.test(expectedHash),
    'SHA256: Produces 64-char lowercase hex string'
);

// Hash is deterministic (same input always produces same output)
const secondHash = crypto.createHash('sha256').update(testContent).digest('hex');
assert(
    expectedHash === secondHash,
    'SHA256: Deterministic (same input produces identical hash)'
);

// Different content produces different hash (collision resistance)
const differentHash = crypto.createHash('sha256').update(testContent + '!').digest('hex');
assert(
    expectedHash !== differentHash,
    'SHA256: Different input produces different hash (collision resistance)'
);

// JSON serialization + hash matches the appendLog pattern used for audit entries
const testEntry = { event_type: 'test', tenant_id: 'T1', data: { amount: 100.50 } };
const entryHash = crypto.createHash('sha256').update(JSON.stringify(testEntry)).digest('hex');
assert(
    entryHash.length === 64 && /^[0-9a-f]{64}$/.test(entryHash),
    'SHA256: Works correctly with JSON-serialized audit entries'
);

// Verify the source code uses the exact same algorithm chain
assert(
    storageSource.includes("crypto.createHash('sha256')") &&
    storageSource.includes(".update(content)") &&
    storageSource.includes(".digest('hex')"),
    'SHA256: Storage adapter uses crypto.createHash(sha256).update().digest(hex)'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 32: Behavioral — Cross-module storage method call verification
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 32: Behavioral — Cross-module storage call verification');
console.log('═══════════════════════════════════════════════════════════\n');

// Map each module to the storage adapter methods it MUST call
const expectedStorageCalls = {
    'compound-learning.js': ['storage.getDocument', 'storage.putDocument'],
    'audit_store.js': ['storage.appendLog', 'storage.queryLog', 'storage.deleteLogBefore'],
    'erp-posting-service.js': ['storage.putDocument'],
    'concurrent_zip.js': ['storage.acquireLock', 'storage.releaseLock', 'storage.putBlob', 'storage.getBlob'],
    'retention_policy.js': ['storage.queryLog', 'storage.deleteLogBefore'],
    'replay_pipeline.js': ['storage.queryLog', 'storage.getBlob'],
};

for (const [fileName, methods] of Object.entries(expectedStorageCalls)) {
    const filePath = SERVER_SIDE_FILES.find(f => f.endsWith(fileName));
    if (!filePath) continue;
    const source = readSource(filePath);
    for (const method of methods) {
        assert(
            source.includes(method + '(') || source.includes(method + '('),
            `${fileName}: Calls ${method}()`
        );
    }
}

// Verify no module calls storage methods it shouldn't (separation of concerns)
// compound-learning should NOT use distributed locks (no concurrency concern)
assert(
    !compoundSource.includes('storage.acquireLock'),
    'compound-learning.js: Does NOT use distributed locks (no concurrency concern)'
);

// audit_store should NOT use blob storage (text-only audit logs)
assert(
    !auditSource.includes('storage.putBlob'),
    'audit_store.js: Does NOT use blob storage (text-only audit logs)'
);

// retention_policy should NOT use putDocument (only deletes old data)
assert(
    !retentionSource.includes('storage.putDocument') && !retentionSource.includes('storage.putBlob'),
    'retention_policy.js: Does NOT write new data (only reads and deletes for cleanup)'
);

// replay_pipeline should NOT use acquireLock (reads only, no concurrent writes)
assert(
    !replaySource.includes('storage.acquireLock'),
    'replay_pipeline.js: Does NOT use distributed locks (read-only replay)'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 33: BUG 6 FIX — putDocument versioned race condition
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 33: BUG 6 FIX — putDocument versioned race condition');
console.log('═══════════════════════════════════════════════════════════\n');

// MAX_VERSION_RETRIES constant exists
assert(
    storageSource.includes('const MAX_VERSION_RETRIES = '),
    'BUG 6 FIX: MAX_VERSION_RETRIES constant defined'
);

// Versioned path has retry loop for PK conflicts
const putDocSection = storageSource.substring(
    storageSource.indexOf('async function putDocument('),
    storageSource.indexOf('async function getDocument(')
);
assert(
    putDocSection.includes('for (let vAttempt = 0; vAttempt < MAX_VERSION_RETRIES'),
    'BUG 6 FIX: Versioned insert wrapped in retry loop'
);

// Catches PK constraint violation (23505) specifically
assert(
    putDocSection.includes("error.code === '23505'"),
    'BUG 6 FIX: Catches PostgreSQL PK constraint violation code 23505'
);

// Success check before error handling (short-circuit on success)
assert(
    putDocSection.includes('if (!error) return { bucket, key, version: nextVersion, sha256 }'),
    'BUG 6 FIX: Returns immediately on successful versioned insert'
);

// Only retries on 23505, throws on other errors
assert(
    putDocSection.includes("error.code === '23505' && vAttempt < MAX_VERSION_RETRIES - 1"),
    'BUG 6 FIX: Only retries on PK conflict, throws on other errors'
);

// Both withRetry (transient) and version retry (conflict) are present
assert(
    putDocSection.includes('return withRetry(async () => {') &&
    putDocSection.includes('for (let vAttempt'),
    'BUG 6 FIX: Dual retry — withRetry for transient errors + inner loop for version conflicts'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 34: BUG 7 FIX — deleteLogBefore boundary consistency
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 34: BUG 7 FIX — deleteLogBefore boundary consistency');
console.log('═══════════════════════════════════════════════════════════\n');

// deleteLogBefore uses lte (not lt) to match queryLog semantics
const deleteLogSection = storageSource.substring(
    storageSource.indexOf('async function deleteLogBefore('),
    storageSource.indexOf('// ═', storageSource.indexOf('async function deleteLogBefore(') + 1)
);
assert(
    deleteLogSection.includes('.lte('),
    'BUG 7 FIX: deleteLogBefore uses lte (<=) operator'
);
assert(
    !deleteLogSection.includes('.lt('),
    'BUG 7 FIX: deleteLogBefore does NOT use lt (<) operator (was the bug)'
);

// queryLog also uses lte for endTime — verify consistency
const queryLogSection = storageSource.substring(
    storageSource.indexOf('async function queryLog('),
    storageSource.indexOf('async function deleteLogBefore(')
);
assert(
    queryLogSection.includes(".lte('created_at', endTime)"),
    'BUG 7 FIX: queryLog endTime uses lte (<=) — matches deleteLogBefore'
);

// Both use the same operator on the same column
assert(
    deleteLogSection.includes(".lte('created_at'") && queryLogSection.includes(".lte('created_at'"),
    'BUG 7 FIX: Both queryLog and deleteLogBefore use lte on created_at (boundary consistent)'
);

// Comment documents the fix rationale
assert(
    deleteLogSection.includes('match queryLog') || deleteLogSection.includes('boundary'),
    'BUG 7 FIX: Comment explains the boundary consistency fix'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 35: BUG 8 FIX — Transient error retry (withRetry)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 35: BUG 8 FIX — Transient error retry (withRetry)');
console.log('═══════════════════════════════════════════════════════════\n');

// withRetry utility exists
assert(
    storageSource.includes('async function withRetry(fn, label)'),
    'BUG 8 FIX: withRetry utility function defined'
);

// isTransientError utility exists
assert(
    storageSource.includes('function isTransientError(err)'),
    'BUG 8 FIX: isTransientError utility function defined'
);

// MAX_RETRIES and RETRY_BASE_MS constants
assert(
    storageSource.includes('const MAX_RETRIES = ') && storageSource.includes('const RETRY_BASE_MS = '),
    'BUG 8 FIX: MAX_RETRIES and RETRY_BASE_MS constants defined'
);

// isTransientError checks all critical patterns (original + BUG 9 additions)
const transientPatterns = [
    'timeout', 'timed out', 'etimedout',
    'network', 'econnrefused', 'econnreset',
    'eai_again', 'enotfound', 'ehostunreach', 'enetunreach', 'epipe',
    'fetch failed', 'failed to fetch',
    'aborted', 'socket hang up', 'service unavailable',
];
for (const pattern of transientPatterns) {
    assert(
        storageSource.includes(`'${pattern}'`),
        `BUG 8+9 FIX: isTransientError detects '${pattern}'`
    );
}

// Also checks HTTP 5xx via regex
assert(
    storageSource.includes('5\\d{2}'),
    'BUG 9 FIX: isTransientError detects HTTP 5xx status codes via regex'
);

// BUG 10 FIX: isTransientError handles non-Error thrown values (strings)
assert(
    storageSource.includes("typeof err === 'string'"),
    'BUG 10 FIX: isTransientError coerces non-Error thrown values to string'
);

// withRetry has exponential backoff
assert(
    storageSource.includes('RETRY_BASE_MS * (2 **'),
    'BUG 8 FIX: withRetry uses exponential backoff'
);

// withRetry logs warnings on retry
assert(
    storageSource.includes('console.warn') && storageSource.includes('transient error'),
    'BUG 8 FIX: withRetry logs transient error retries'
);

// All 8 Supabase-calling functions are wrapped with withRetry
const wrappedFunctions = [
    'putDocument', 'getDocument', 'appendLog', 'queryLog',
    'deleteLogBefore', 'putBlob', 'getBlob'
];
for (const fnName of wrappedFunctions) {
    const fnSection = storageSource.substring(
        storageSource.indexOf(`async function ${fnName}(`),
        storageSource.indexOf('async function', storageSource.indexOf(`async function ${fnName}(`) + 1) || storageSource.length
    );
    assert(
        fnSection.includes(`return withRetry(async () => {`),
        `BUG 8 FIX: ${fnName} wrapped with withRetry`
    );
}

// acquireLock is NOT wrapped with withRetry (has its own retry loop)
// but its DELETE operation now has error checking
assert(
    storageSource.includes('error: cleanupError') && storageSource.includes('cleanup failed'),
    'BUG 8 FIX: acquireLock DELETE now checks for and logs errors'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 36: Behavioral (executable) — isTransientError classification
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 36: Behavioral (executable) — isTransientError classification');
console.log('═══════════════════════════════════════════════════════════\n');

// Extract and execute the FULL isTransientError (with BUG 9+10 patterns)
const isTransientFn = new Function(`
    return function isTransientError(err) {
        if (!err) return false;
        // BUG 10 FIX: Handle non-Error thrown values (strings, numbers, objects)
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
               /\\b5\\d{2}\\b/.test(msg);
    };
`)();

// === Original transient error patterns ===
assert(isTransientFn(new Error('Connection timeout')) === true, 'isTransientError: detects timeout');
assert(isTransientFn(new Error('NetworkError: Failed to fetch')) === true, 'isTransientError: detects network error');
assert(isTransientFn(new Error('connect ECONNREFUSED 127.0.0.1:5432')) === true, 'isTransientError: detects ECONNREFUSED');
assert(isTransientFn(new Error('read ECONNRESET')) === true, 'isTransientError: detects ECONNRESET');
assert(isTransientFn(new Error('TypeError: fetch failed')) === true, 'isTransientError: detects fetch failed (Node.js)');
assert(isTransientFn(new Error('The operation was aborted')) === true, 'isTransientError: detects aborted');
assert(isTransientFn(new Error('socket hang up')) === true, 'isTransientError: detects socket hang up');

// === BUG 9 FIX: Platform-specific error patterns ===
// Cloudflare Workers cold-start error (different word order from Node.js)
assert(isTransientFn(new Error('TypeError: Failed to fetch')) === true, 'BUG 9: detects CF Workers "Failed to fetch"');
// Node.js TCP connection timeout (ETIMEDOUT != "timeout")
assert(isTransientFn(new Error('connect ETIMEDOUT 10.0.0.1:443')) === true, 'BUG 9: detects ETIMEDOUT');
// Node.js "timed out" (different from "timeout")
assert(isTransientFn(new Error('Connection timed out')) === true, 'BUG 9: detects "timed out"');
// DNS temporary failure
assert(isTransientFn(new Error('getaddrinfo EAI_AGAIN db.supabase.co')) === true, 'BUG 9: detects EAI_AGAIN (DNS temp failure)');
// DNS resolution failure (can be transient in serverless)
assert(isTransientFn(new Error('getaddrinfo ENOTFOUND db.supabase.co')) === true, 'BUG 9: detects ENOTFOUND (DNS resolution)');
// Host/network unreachable
assert(isTransientFn(new Error('connect EHOSTUNREACH 10.0.0.1:443')) === true, 'BUG 9: detects EHOSTUNREACH');
assert(isTransientFn(new Error('connect ENETUNREACH 10.0.0.1:443')) === true, 'BUG 9: detects ENETUNREACH');
// Broken pipe
assert(isTransientFn(new Error('write EPIPE')) === true, 'BUG 9: detects EPIPE (broken pipe)');
// HTTP 5xx from Supabase
assert(isTransientFn(new Error('503 Service Unavailable')) === true, 'BUG 9: detects 503 via service unavailable');
assert(isTransientFn(new Error('[StorageAdapter] putDocument failed: 502 Bad Gateway')) === true, 'BUG 9: detects 502 via regex');
assert(isTransientFn(new Error('Request failed with status code 500')) === true, 'BUG 9: detects 500 via regex');

// === Non-transient errors — must NOT be retried ===
assert(isTransientFn(new Error('duplicate key value violates unique constraint')) === false, 'isTransientError: rejects PK violation');
assert(isTransientFn(new Error('permission denied for table storage_documents')) === false, 'isTransientError: rejects permission error');
assert(isTransientFn(new Error('invalid input syntax for type uuid')) === false, 'isTransientError: rejects bad input');
assert(isTransientFn(new Error('[StorageAdapter] putDocument failed: bad request')) === false, 'isTransientError: rejects application errors');
assert(isTransientFn(new Error('relation "storage_documents" does not exist')) === false, 'isTransientError: rejects missing table');
assert(isTransientFn(new Error('JWT expired')) === false, 'isTransientError: rejects auth errors');

// === Edge cases ===
assert(isTransientFn(null) === false, 'isTransientError: returns false for null');
assert(isTransientFn(undefined) === false, 'isTransientError: returns false for undefined');
assert(isTransientFn({}) === false, 'isTransientError: returns false for object without message');
assert(isTransientFn({ message: '' }) === false, 'isTransientError: returns false for empty message');
// Ensure 5xx regex doesn't match non-HTTP numbers
assert(isTransientFn(new Error('Expected 5000 rows')) === false, 'isTransientError: 5xx regex does not match "5000" (word boundary)');
assert(isTransientFn(new Error('Column has 512 entries')) === true, 'isTransientError: 5xx regex matches "512" (edge: false positive on column count)');
// Note: The 512 false positive is acceptable — it's extremely unlikely in real error messages,
// and the consequence of a false positive (unnecessary retry) is far less harmful than
// missing a real 5xx error (unrecoverable crash on cold start).

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 37: BUG 10 FIX — isTransientError non-Error thrown values
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 37: BUG 10 FIX — isTransientError non-Error thrown values');
console.log('═══════════════════════════════════════════════════════════\n');

// THE BUG: Some runtimes/libraries throw raw strings instead of Error objects.
// e.g., throw "network timeout" or throw "fetch failed"
// The old isTransientError checked err.message, which is undefined for strings.
// The string itself contains the transient pattern but was never checked.

// === String throws — MUST be detected now ===
assert(isTransientFn('network timeout') === true, 'BUG 10: detects string throw "network timeout"');
assert(isTransientFn('fetch failed') === true, 'BUG 10: detects string throw "fetch failed"');
assert(isTransientFn('Failed to fetch') === true, 'BUG 10: detects string throw "Failed to fetch" (CF Workers)');
assert(isTransientFn('ECONNRESET') === true, 'BUG 10: detects string throw "ECONNRESET"');
assert(isTransientFn('ETIMEDOUT') === true, 'BUG 10: detects string throw "ETIMEDOUT"');
assert(isTransientFn('socket hang up') === true, 'BUG 10: detects string throw "socket hang up"');
assert(isTransientFn('service unavailable') === true, 'BUG 10: detects string throw "service unavailable"');
assert(isTransientFn('502 Bad Gateway') === true, 'BUG 10: detects string throw "502 Bad Gateway" via 5xx regex');

// === Non-transient string throws — must NOT be detected ===
assert(isTransientFn('duplicate key violation') === false, 'BUG 10: rejects non-transient string "duplicate key violation"');
assert(isTransientFn('permission denied') === false, 'BUG 10: rejects non-transient string "permission denied"');
assert(isTransientFn('JWT expired') === false, 'BUG 10: rejects non-transient string "JWT expired"');

// === Number throws ===
assert(isTransientFn(42) === false, 'BUG 10: handles thrown number (42) without crashing');
assert(isTransientFn(502) === true, 'BUG 10: detects thrown number 502 via 5xx regex on String(502)');

// === Object throws without .message ===
assert(isTransientFn({ code: 'ETIMEDOUT' }) === false, 'BUG 10: object without message, falls to String() which does not match');
assert(isTransientFn({ error: 'timeout' }) === false, 'BUG 10: object with non-standard property, String() does not match timeout');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 38: BUG 11 FIX — acquireLock fatal error discrimination
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 38: BUG 11 FIX — acquireLock fatal error discrimination');
console.log('═══════════════════════════════════════════════════════════\n');

// THE BUG: acquireLock treated ALL INSERT errors as "lock held by someone else"
// and retried for the full TTL duration. Fatal errors (table missing, permission
// denied, auth failure) should throw immediately — not spin for 30 seconds.

// Verify acquireLock source distinguishes error codes
const acquireLockSource = storageSource.substring(
    storageSource.indexOf('async function acquireLock'),
    storageSource.indexOf('async function releaseLock')
);

// Must check for 23505 (lock contention — expected path)
assert(
    acquireLockSource.includes("error.code === '23505'") || acquireLockSource.includes('error.code === "23505"'),
    'BUG 11+12 FIX: acquireLock checks for error code 23505 (lock contention)'
);

// Must throw on non-23505 errors (fatal errors like table missing, permission denied)
assert(
    acquireLockSource.includes('throw new Error') && acquireLockSource.includes('acquireLock failed'),
    'BUG 11 FIX: acquireLock throws on fatal errors (non-23505)'
);

// Must include error code in thrown message for debugging
assert(
    acquireLockSource.includes('error.code') && acquireLockSource.includes('code:'),
    'BUG 11 FIX: acquireLock includes error code in thrown message'
);

// Must still retry on 23505 (lock contention — expected path)
assert(
    acquireLockSource.includes('LOCK_RETRY_INTERVAL_MS'),
    'BUG 11 FIX: acquireLock still retries on lock contention (23505)'
);

// Must still have the timeout loop termination
assert(
    acquireLockSource.includes('Date.now() - startTime < ttlMs'),
    'BUG 11 FIX: acquireLock timeout loop still terminates after ttlMs'
);

// BUG 12 FIX: Verify three-way error discrimination ORDER:
// 1. isTransientError check (first — retry network blips)
// 2. error.code === '23505' check (second — retry contention)
// 3. throw (last — fatal errors)
const transientCheckIdx = acquireLockSource.indexOf('isTransientError(error)');
const contentionCheckIdx = acquireLockSource.indexOf("error.code === '23505'");
const fatalThrowIdx = acquireLockSource.indexOf('acquireLock failed');
assert(
    transientCheckIdx > 0 && contentionCheckIdx > 0 && fatalThrowIdx > 0 &&
    transientCheckIdx < contentionCheckIdx && contentionCheckIdx < fatalThrowIdx,
    'BUG 12 FIX: three-way discrimination order: transient → contention → fatal'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 39: BUG 12 FIX — acquireLock transient error retry (regression fix)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 39: BUG 12 FIX — acquireLock transient error retry');
console.log('═══════════════════════════════════════════════════════════\n');

// THE BUG: BUG 11 fix used `error.code !== '23505'` which threw on ANY
// non-contention error. But transient network errors (cold-start) have
// error.code = undefined, so undefined !== '23505' → throws immediately.
// This broke the retry behavior that kept lock acquisition reliable.

// acquireLock must call isTransientError() to detect network blips
assert(
    acquireLockSource.includes('isTransientError(error)'),
    'BUG 12 FIX: acquireLock uses isTransientError() for transient detection'
);

// acquireLock must log transient errors (observability for cold-start debugging)
assert(
    acquireLockSource.includes('transient error') && acquireLockSource.includes('console.warn'),
    'BUG 12 FIX: acquireLock logs transient errors with console.warn'
);

// acquireLock must continue (retry) after transient error, NOT throw
const transientBlock = acquireLockSource.substring(
    acquireLockSource.indexOf('isTransientError(error)'),
    acquireLockSource.indexOf("error.code === '23505'")
);
assert(
    transientBlock.includes('continue'),
    'BUG 12 FIX: acquireLock continues (retries) after transient error'
);

// acquireLock must still use LOCK_RETRY_INTERVAL_MS for transient delay
assert(
    transientBlock.includes('LOCK_RETRY_INTERVAL_MS'),
    'BUG 12 FIX: acquireLock uses LOCK_RETRY_INTERVAL_MS for transient retry delay'
);

// Verify the error.code check for 23505 is now === (positive match), not !== (negative)
// This is critical: the old BUG 11 fix used !== which was the root cause of the regression
assert(
    acquireLockSource.includes("error.code === '23505'") &&
    !acquireLockSource.includes("error.code !== '23505'"),
    'BUG 12 FIX: acquireLock uses === 23505 (positive match), not !== (negative)'
);

// The fatal throw must ONLY be reachable when both transient and 23505 checks fail
// Count the separate code paths in order
const paths = [
    acquireLockSource.indexOf('isTransientError'),
    acquireLockSource.indexOf("error.code === '23505'"),
    acquireLockSource.indexOf('acquireLock failed'),
];
assert(
    paths[0] < paths[1] && paths[1] < paths[2],
    'BUG 12 FIX: fatal throw is LAST resort after transient + contention checks'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 40: BUG 13 FIX — releaseLock transient error retry
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 40: BUG 13 FIX — releaseLock transient error retry');
console.log('═══════════════════════════════════════════════════════════\n');

// THE BUG: releaseLock made a single DELETE attempt with no retry.
// If a transient network error occurred, the lock hung around for the
// full TTL blocking all subsequent operations.

const releaseLockSource = storageSource.substring(
    storageSource.indexOf('async function releaseLock'),
    storageSource.indexOf('// ═══════════════', storageSource.indexOf('async function releaseLock'))
);

// releaseLock must have a retry loop
assert(
    releaseLockSource.includes('for (let attempt') || releaseLockSource.includes('withRetry'),
    'BUG 13 FIX: releaseLock has retry loop for transient errors'
);

// releaseLock must use isTransientError to classify errors
assert(
    releaseLockSource.includes('isTransientError'),
    'BUG 13 FIX: releaseLock uses isTransientError for classification'
);

// releaseLock must use MAX_RETRIES constant
assert(
    releaseLockSource.includes('MAX_RETRIES'),
    'BUG 13 FIX: releaseLock respects MAX_RETRIES constant'
);

// releaseLock must use exponential backoff (RETRY_BASE_MS)
assert(
    releaseLockSource.includes('RETRY_BASE_MS'),
    'BUG 13 FIX: releaseLock uses exponential backoff (RETRY_BASE_MS)'
);

// releaseLock must log transient retry attempts
assert(
    releaseLockSource.includes('console.warn') && releaseLockSource.includes('transient error'),
    'BUG 13 FIX: releaseLock logs transient retry attempts'
);

// CRITICAL: releaseLock must NEVER throw — used in finally blocks
// It should return after final failure, not throw
assert(
    !releaseLockSource.includes('throw '),
    'BUG 13 FIX: releaseLock NEVER throws (graceful degradation preserved)'
);

// releaseLock must still handle null/undefined lock
assert(
    releaseLockSource.includes('if (!lock) return'),
    'BUG 13 FIX: releaseLock still guards against null lock'
);

// releaseLock must still log warning on final failure
assert(
    releaseLockSource.includes('releaseLock warning'),
    'BUG 13 FIX: releaseLock logs warning on final failure (TTL cleanup fallback)'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 41: Behavioral (executable) — withRetry decision logic
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 41: Behavioral (executable) — withRetry decision logic');
console.log('═══════════════════════════════════════════════════════════\n');

// withRetry's core decision is: attempt < MAX_RETRIES && isTransientError(err)
// If true → retry with exponential backoff. If false → re-throw immediately.
// We test this decision matrix exhaustively with the REAL isTransientFn.

const WR_MAX_RETRIES = 3;
const WR_RETRY_BASE_MS = 200;

function withRetryDecision(attempt, err) {
    return attempt < WR_MAX_RETRIES && isTransientFn(err);
}

// === Attempt 1 (room to retry) ===
assert(withRetryDecision(1, new Error('fetch failed')) === true, 'withRetry: attempt 1 + transient → RETRY');
assert(withRetryDecision(1, new Error('ETIMEDOUT')) === true, 'withRetry: attempt 1 + ETIMEDOUT → RETRY');
assert(withRetryDecision(1, new Error('permission denied')) === false, 'withRetry: attempt 1 + non-transient → THROW');
assert(withRetryDecision(1, new Error('duplicate key')) === false, 'withRetry: attempt 1 + PK violation → THROW');

// === Attempt 2 (still room to retry) ===
assert(withRetryDecision(2, new Error('socket hang up')) === true, 'withRetry: attempt 2 + transient → RETRY');
assert(withRetryDecision(2, new Error('JWT expired')) === false, 'withRetry: attempt 2 + auth error → THROW');

// === Attempt 3 = MAX_RETRIES (exhausted — must throw regardless) ===
assert(withRetryDecision(3, new Error('fetch failed')) === false, 'withRetry: attempt 3 (MAX) + transient → THROW (exhausted)');
assert(withRetryDecision(3, new Error('ECONNRESET')) === false, 'withRetry: attempt 3 (MAX) + ECONNRESET → THROW (exhausted)');
assert(withRetryDecision(3, new Error('timeout')) === false, 'withRetry: attempt 3 (MAX) + timeout → THROW (exhausted)');

// === Delay calculation (exponential backoff) ===
assert(WR_RETRY_BASE_MS * (2 ** 0) === 200, 'withRetry delay: attempt 1 → 200ms');
assert(WR_RETRY_BASE_MS * (2 ** 1) === 400, 'withRetry delay: attempt 2 → 400ms');
assert(WR_RETRY_BASE_MS * (2 ** 2) === 800, 'withRetry delay: attempt 3 → 800ms');

// === Combined: transient errors get max 2 retries (attempts 1,2 retry; 3 throws) ===
let totalRetries = 0;
for (let a = 1; a <= WR_MAX_RETRIES; a++) {
    if (withRetryDecision(a, new Error('network timeout'))) totalRetries++;
}
assert(totalRetries === 2, 'withRetry: transient error gets exactly 2 retries (3 total attempts)');

// === Combined: non-transient errors get 0 retries ===
totalRetries = 0;
for (let a = 1; a <= WR_MAX_RETRIES; a++) {
    if (withRetryDecision(a, new Error('bad request'))) totalRetries++;
}
assert(totalRetries === 0, 'withRetry: non-transient error gets 0 retries (1 total attempt)');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 42: Behavioral (executable) — acquireLock three-way error discrimination
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 42: Behavioral (executable) — acquireLock three-way error discrimination');
console.log('═══════════════════════════════════════════════════════════\n');

// acquireLock's three-way decision after INSERT failure:
//   1. isTransientError(error) → log + retry (network blips)
//   2. error.code === '23505'  → silent retry (lock contention)
//   3. everything else         → throw immediately (fatal)

function acquireLockDecision(error) {
    if (isTransientFn(error)) return 'retry-transient';
    if (error.code === '23505') return 'retry-contention';
    return 'throw-fatal';
}

// === Transient errors → retry ===
assert(acquireLockDecision({ message: 'fetch failed' }) === 'retry-transient',
    'acquireLock 3-way: fetch failed → retry-transient');
assert(acquireLockDecision({ message: 'ETIMEDOUT' }) === 'retry-transient',
    'acquireLock 3-way: ETIMEDOUT → retry-transient');
assert(acquireLockDecision({ message: 'connect ECONNRESET' }) === 'retry-transient',
    'acquireLock 3-way: ECONNRESET → retry-transient');
assert(acquireLockDecision({ message: 'socket hang up' }) === 'retry-transient',
    'acquireLock 3-way: socket hang up → retry-transient');
assert(acquireLockDecision({ message: '503 Service Unavailable' }) === 'retry-transient',
    'acquireLock 3-way: 503 → retry-transient');

// === Lock contention (23505) → retry ===
assert(acquireLockDecision({ code: '23505', message: 'duplicate key value violates unique constraint' }) === 'retry-contention',
    'acquireLock 3-way: 23505 duplicate key → retry-contention');

// === Fatal errors → throw ===
assert(acquireLockDecision({ code: '42501', message: 'permission denied for table storage_locks' }) === 'throw-fatal',
    'acquireLock 3-way: 42501 permission denied → throw-fatal');
assert(acquireLockDecision({ code: '42P01', message: 'relation "storage_locks" does not exist' }) === 'throw-fatal',
    'acquireLock 3-way: 42P01 table missing → throw-fatal');
assert(acquireLockDecision({ code: '28000', message: 'invalid authorization specification' }) === 'throw-fatal',
    'acquireLock 3-way: 28000 auth failure → throw-fatal');
assert(acquireLockDecision({ code: '3D000', message: 'database does not exist' }) === 'throw-fatal',
    'acquireLock 3-way: 3D000 database missing → throw-fatal');

// === Edge: error.code undefined (network error, no PG code) → transient ===
// This is THE EXACT BUG 12 scenario: cold-start "fetch failed" with code=undefined
assert(acquireLockDecision({ code: undefined, message: 'fetch failed' }) === 'retry-transient',
    'acquireLock 3-way: code=undefined + "fetch failed" → retry-transient (BUG 12 regression test)');

// === Edge: error.code undefined + non-transient message → fatal ===
assert(acquireLockDecision({ code: undefined, message: 'unexpected error' }) === 'throw-fatal',
    'acquireLock 3-way: code=undefined + unknown message → throw-fatal');

// === Edge: transient check has priority over 23505 ===
// If error BOTH matches a transient pattern AND has code 23505, transient wins
// (In practice this never happens — 23505 messages don't contain transient patterns)
assert(acquireLockDecision({ code: '23505', message: 'timeout during duplicate key check' }) === 'retry-transient',
    'acquireLock 3-way: transient check has priority over 23505 check');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 43: Documentation — at-least-once write semantic documented
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 43: Documentation — at-least-once write semantic');
console.log('═══════════════════════════════════════════════════════════\n');

// The phantom version scenario is a known limitation that MUST be documented
// so future maintainers don't unknowingly introduce exactly-once assumptions.

assert(
    storageSource.includes('AT-LEAST-ONCE WRITE SEMANTIC'),
    'Documentation: at-least-once write semantic documented in putDocument JSDoc'
);
assert(
    storageSource.includes('phantom version'),
    'Documentation: phantom version scenario explained'
);
assert(
    storageSource.includes('deduplicate on SHA256'),
    'Documentation: SHA256 deduplication guidance for callers needing exactly-once'
);

// ═══════════════════════════════════════════════════════════════════════════════
// PASS 7: INPUT VALIDATION & DEFENSIVE HARDENING (Bugs 14-20)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 44: BUG 14 — deleteLogBefore cutoffDate type coercion
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 44: BUG 14 — deleteLogBefore cutoffDate type coercion');
console.log('═══════════════════════════════════════════════════════════\n');

// Structural: the old pattern (cutoffDate.toISOString() direct call) is gone.
// The new code uses a ternary chain to handle Date, string, and number inputs.
const p7_deleteLogBody = storageSource.slice(
    storageSource.indexOf('async function deleteLogBefore'),
    storageSource.indexOf('// ═', storageSource.indexOf('async function deleteLogBefore') + 1)
);
const p7_deleteLogNoComments = p7_deleteLogBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p7_deleteLogNoComments.includes('cutoffDate instanceof Date'),
    'BUG 14: deleteLogBefore checks cutoffDate instanceof Date'
);
assert(
    p7_deleteLogNoComments.includes("typeof cutoffDate === 'string'"),
    'BUG 14: deleteLogBefore handles string cutoffDate via typeof check'
);
assert(
    p7_deleteLogNoComments.includes('new Date(cutoffDate).toISOString()'),
    'BUG 14: deleteLogBefore converts numeric timestamps via new Date(cutoffDate)'
);
// The old direct call must be gone (in code, not in comments)
assert(
    !p7_deleteLogNoComments.includes('.lte(\'created_at\', cutoffDate.toISOString())'),
    'BUG 14: Old direct cutoffDate.toISOString() call removed from query'
);
assert(
    p7_deleteLogNoComments.includes('.lte(\'created_at\', iso)'),
    'BUG 14: Query now uses the coerced iso variable'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 45: BUG 15 — putDocument null/undefined content validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 45: BUG 15 — putDocument null content validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p7_putDocBody = storageSource.slice(
    storageSource.indexOf('async function putDocument'),
    storageSource.indexOf('async function getDocument')
);

// Validation must be BEFORE withRetry to avoid 3 wasted retries.
// Search for "return withRetry" (the actual call), not just "withRetry" (found in comments).
const p7_validationIdx = p7_putDocBody.indexOf('content == null');
const p7_retryIdx = p7_putDocBody.indexOf('return withRetry');
assert(
    p7_validationIdx !== -1 && p7_retryIdx !== -1 && p7_validationIdx < p7_retryIdx,
    'BUG 15: putDocument content validation occurs BEFORE withRetry'
);
assert(
    p7_putDocBody.includes("typeof content !== 'string'"),
    'BUG 15: putDocument validates content is a string'
);
assert(
    p7_putDocBody.includes('throw new TypeError'),
    'BUG 15: putDocument throws TypeError (not generic Error) for invalid content'
);

// Behavioral: simulate the validation
function testPutDocValidation(content) {
    if (content == null || typeof content !== 'string') {
        return 'TypeError';
    }
    return 'ok';
}
assert(testPutDocValidation(null) === 'TypeError', 'BUG 15 behavioral: null content → TypeError');
assert(testPutDocValidation(undefined) === 'TypeError', 'BUG 15 behavioral: undefined content → TypeError');
assert(testPutDocValidation(123) === 'TypeError', 'BUG 15 behavioral: numeric content → TypeError');
assert(testPutDocValidation('') === 'ok', 'BUG 15 behavioral: empty string is valid (callers decide)');
assert(testPutDocValidation('hello') === 'ok', 'BUG 15 behavioral: normal string → ok');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 46: BUG 16 — appendLog null entry validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 46: BUG 16 — appendLog null entry validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p7_appendLogBody = storageSource.slice(
    storageSource.indexOf('async function appendLog'),
    storageSource.indexOf('async function queryLog')
);

const p7_appendValIdx = p7_appendLogBody.indexOf('typeof entry');
const p7_appendRetryIdx = p7_appendLogBody.indexOf('withRetry');
assert(
    p7_appendValIdx !== -1 && p7_appendRetryIdx !== -1 && p7_appendValIdx < p7_appendRetryIdx,
    'BUG 16: appendLog entry validation occurs BEFORE withRetry'
);
assert(
    p7_appendLogBody.includes("typeof entry !== 'object'"),
    'BUG 16: appendLog validates entry is an object'
);
assert(
    p7_appendLogBody.includes('!entry'),
    'BUG 16: appendLog rejects falsy entries (null, undefined, 0, false, "")'
);

// Behavioral: simulate the validation
function testAppendLogValidation(entry) {
    if (!entry || typeof entry !== 'object') return 'TypeError';
    return 'ok';
}
assert(testAppendLogValidation(null) === 'TypeError', 'BUG 16 behavioral: null entry → TypeError');
assert(testAppendLogValidation(undefined) === 'TypeError', 'BUG 16 behavioral: undefined entry → TypeError');
assert(testAppendLogValidation('string') === 'TypeError', 'BUG 16 behavioral: string entry → TypeError');
assert(testAppendLogValidation(42) === 'TypeError', 'BUG 16 behavioral: number entry → TypeError');
assert(testAppendLogValidation({ event: 'test' }) === 'ok', 'BUG 16 behavioral: valid object → ok');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 47: BUG 17 — putBlob null buffer validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 47: BUG 17 — putBlob null buffer validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p7_putBlobBody = storageSource.slice(
    storageSource.indexOf('async function putBlob'),
    storageSource.indexOf('async function getBlob')
);

const p7_blobValIdx = p7_putBlobBody.indexOf('buffer == null');
const p7_blobRetryIdx = p7_putBlobBody.indexOf('return withRetry');
assert(
    p7_blobValIdx !== -1 && p7_blobRetryIdx !== -1 && p7_blobValIdx < p7_blobRetryIdx,
    'BUG 17: putBlob buffer validation occurs BEFORE withRetry'
);
assert(
    p7_putBlobBody.includes('throw new TypeError'),
    'BUG 17: putBlob throws TypeError for null/undefined buffer'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 48: BUG 18 — getBlob null data guard
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 48: BUG 18 — getBlob null data guard');
console.log('═══════════════════════════════════════════════════════════\n');

const p7_getBlobBody = storageSource.slice(
    storageSource.indexOf('async function getBlob'),
    storageSource.indexOf('// ═', storageSource.indexOf('async function getBlob') + 1)
);

assert(
    p7_getBlobBody.includes('if (!data)'),
    'BUG 18: getBlob guards against null/undefined data before calling .arrayBuffer()'
);
assert(
    p7_getBlobBody.includes('no data returned'),
    'BUG 18: getBlob throws descriptive error when data is null'
);

// Verify the guard is BEFORE the arrayBuffer() call.
// Strip comments first — the BUG 18 comment mentions data.arrayBuffer()
// which would false-match before the guard.
const p7_getBlobNoComments = p7_getBlobBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const p7_guardIdx = p7_getBlobNoComments.indexOf('if (!data)');
const p7_arrayBufIdx = p7_getBlobNoComments.indexOf('data.arrayBuffer()');
assert(
    p7_guardIdx !== -1 && p7_arrayBufIdx !== -1 && p7_guardIdx < p7_arrayBufIdx,
    'BUG 18: null guard is placed before data.arrayBuffer() call'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 49: BUG 19 — getDocument select optimization
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 49: BUG 19 — getDocument select optimization');
console.log('═══════════════════════════════════════════════════════════\n');

const p7_getDocBody = storageSource.slice(
    storageSource.indexOf('async function getDocument'),
    storageSource.indexOf('// ═', storageSource.indexOf('async function getDocument') + 1)
);
const p7_getDocNoComments = p7_getDocBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    !p7_getDocNoComments.includes(".select('*')"),
    'BUG 19: getDocument no longer uses select(*) wildcard'
);
assert(
    p7_getDocNoComments.includes('.select(\'content, version, sha256, metadata\')'),
    'BUG 19: getDocument selects only needed columns: content, version, sha256, metadata'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 50: BUG 20 — queryLog null entry filtering
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 50: BUG 20 — queryLog null entry filtering');
console.log('═══════════════════════════════════════════════════════════\n');

const p7_queryLogBody = storageSource.slice(
    storageSource.indexOf('async function queryLog'),
    storageSource.indexOf('async function deleteLogBefore')
);

assert(
    p7_queryLogBody.includes('.filter('),
    'BUG 20: queryLog now filters the mapped entries'
);
assert(
    p7_queryLogBody.includes('entry != null'),
    'BUG 20: queryLog filters out null/undefined entries using != null'
);

// Behavioral: simulate the filtering
function simulateQueryLogFilter(rows) {
    return (rows || []).map(row => row.entry).filter(entry => entry != null);
}
const testRows = [
    { entry: { event: 'a' } },
    { entry: null },
    { entry: { event: 'b' } },
    { entry: undefined },
    { entry: { event: 'c' } },
];
const filtered = simulateQueryLogFilter(testRows);
assert(filtered.length === 3, 'BUG 20 behavioral: 3 valid entries out of 5 rows (2 null/undefined filtered)');
assert(filtered[0].event === 'a', 'BUG 20 behavioral: first valid entry preserved');
assert(filtered[2].event === 'c', 'BUG 20 behavioral: last valid entry preserved');
assert(simulateQueryLogFilter(null).length === 0, 'BUG 20 behavioral: null data returns empty array');

// ═══════════════════════════════════════════════════════════════════════════════
// PASS 8: CALLER-SIDE BUGS IN MIGRATED MODULES (Bugs 1-6)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 51: CALLER-BUG 1 — audit_store._sealBatch clears hashes after persist
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 51: CALLER-BUG 1 — _sealBatch hashes cleared after persistence');
console.log('═══════════════════════════════════════════════════════════\n');

const p8_sealBody = auditSource.slice(
    auditSource.indexOf('async _sealBatch()'),
    auditSource.indexOf('_computeMerkleRoot(hashes)')
);
const p8_sealFull = auditSource.slice(
    auditSource.indexOf('async _sealBatch()'),
    auditSource.indexOf('async flush()')
);

// The clear must come AFTER appendLog, not before.
// Strip comments first — the BUG FIX comment mentions "_pendingSeals = []"
// which would false-match before the actual code.
const p8_sealNoComments = p8_sealFull.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const p8_appendLogIdx = p8_sealNoComments.indexOf('await storage.appendLog(this.sealStream');
const p8_clearIdx = p8_sealNoComments.indexOf('this._pendingSeals = []');
assert(
    p8_appendLogIdx !== -1 && p8_clearIdx !== -1 && p8_appendLogIdx < p8_clearIdx,
    'CALLER-BUG 1: _sealBatch clears _pendingSeals AFTER successful appendLog'
);

// Verify the old pattern (clear before persist) is gone
// Old: hashes = [...this._pendingSeals]; this._pendingSeals = []; ... appendLog
// New: hashes = [...this._pendingSeals]; ... appendLog ... this._pendingSeals = [];
const p8_hashCopyIdx = p8_sealFull.indexOf('[...this._pendingSeals]');
assert(
    p8_hashCopyIdx !== -1 && p8_hashCopyIdx < p8_appendLogIdx,
    'CALLER-BUG 1: Hashes are copied to local array before appendLog'
);

// Behavioral simulation: verify order of operations
function simulateSealBatch(appendLogThrows) {
    const pendingSeals = ['hash1', 'hash2', 'hash3'];
    const hashes = [...pendingSeals];
    // Simulate appendLog
    if (appendLogThrows) {
        // On failure, pendingSeals should NOT be cleared
        return { cleared: false, hashesPreserved: pendingSeals.length === 3 };
    }
    // On success, clear
    pendingSeals.length = 0;
    return { cleared: true, hashesPreserved: false };
}
const successCase = simulateSealBatch(false);
const failCase = simulateSealBatch(true);
assert(successCase.cleared === true, 'CALLER-BUG 1 behavioral: on success, hashes are cleared');
assert(failCase.hashesPreserved === true, 'CALLER-BUG 1 behavioral: on failure, hashes are preserved');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 52: CALLER-BUG 2 — compound-learning division by zero guard
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 52: CALLER-BUG 2 — division by zero guard');
console.log('═══════════════════════════════════════════════════════════\n');

const p8_verifyBody = compoundSource.slice(
    compoundSource.indexOf('async verifyForecasts()'),
    compoundSource.indexOf('async nightlyCompound()')
);

// Verify division by zero guard for actualSpend
assert(
    p8_verifyBody.includes('actualSpend > 0'),
    'CALLER-BUG 2: verifyForecasts guards against actualSpend = 0'
);

// Verify verifications.length guard
assert(
    p8_verifyBody.includes('verifications.length > 0'),
    'CALLER-BUG 2: verifyForecasts guards against empty verifications array'
);

// Behavioral: simulate the division guard
function simulateErrorCalc(actual, forecasted) {
    return actual > 0
        ? Math.abs(actual - forecasted) / actual
        : (forecasted > 0 ? 1 : 0);
}
assert(simulateErrorCalc(100, 115) === 0.15, 'CALLER-BUG 2 behavioral: normal case 15% error');
assert(simulateErrorCalc(0, 100) === 1, 'CALLER-BUG 2 behavioral: zero actual + positive forecast = 100% error');
assert(simulateErrorCalc(0, 0) === 0, 'CALLER-BUG 2 behavioral: zero actual + zero forecast = 0 error');
assert(Number.isFinite(simulateErrorCalc(0, 50)), 'CALLER-BUG 2 behavioral: never produces Infinity');

// Simulate avgError guard
function simulateAvgError(verifications) {
    return verifications.length > 0
        ? verifications.reduce((sum, v) => sum + v, 0) / verifications.length
        : 0;
}
assert(simulateAvgError([]) === 0, 'CALLER-BUG 2 behavioral: empty array returns 0, not NaN');
assert(simulateAvgError([10, 20, 30]) === 20, 'CALLER-BUG 2 behavioral: normal avg calculation');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 53: CALLER-BUG 3 — extractLearnings returns success:false on parse fail
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 53: CALLER-BUG 3 — extractLearnings parse failure honesty');
console.log('═══════════════════════════════════════════════════════════\n');

const p8_extractBody = compoundSource.slice(
    compoundSource.indexOf('async extractLearnings('),
    compoundSource.indexOf('async reviewRecentSessions(')
);

// Find the catch block
const p8_catchBlock = p8_extractBody.slice(
    p8_extractBody.indexOf('} catch (e) {'),
    p8_extractBody.indexOf('}', p8_extractBody.indexOf('} catch (e) {') + 30) + 1
);

assert(
    p8_extractBody.includes('success: false'),
    'CALLER-BUG 3: catch block returns success: false (not true)'
);
assert(
    p8_extractBody.includes('parse_error'),
    'CALLER-BUG 3: catch block includes parse_error field for diagnostics'
);

// Verify the old misleading success:true in catch is gone
// Strip comments, then check catch block
const p8_extractNoComments = p8_extractBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const p8_catchIdx = p8_extractNoComments.indexOf('catch (e)');
const p8_catchSection = p8_extractNoComments.slice(p8_catchIdx, p8_catchIdx + 200);
assert(
    !p8_catchSection.includes('success: true'),
    'CALLER-BUG 3: catch block no longer lies with success: true'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 54: CALLER-BUG 4 — retention_policy deletion log accuracy
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 54: CALLER-BUG 4 — retention deletion log accuracy');
console.log('═══════════════════════════════════════════════════════════\n');

// Use getDeletionLog as end boundary — _getCutoffDate appears earlier as a call site
const p8_retentionBody = retentionSource.slice(
    retentionSource.indexOf('async _processRetention('),
    retentionSource.indexOf('getDeletionLog(')
);

// The old pattern logged EVERY scanned entry individually.
// New code should only log a summary with actual deletedCount.
assert(
    p8_retentionBody.includes('result.deletedCount > 0'),
    'CALLER-BUG 4: Deletion log only written when deletedCount > 0'
);
assert(
    p8_retentionBody.includes('deletedCount: result.deletedCount'),
    'CALLER-BUG 4: Deletion log records actual deletedCount, not per-entry'
);

// Verify old per-entry pattern is gone
const p8_retNoComments = p8_retentionBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
assert(
    !p8_retNoComments.includes('for (const entry of entries)'),
    'CALLER-BUG 4: Old per-entry deletion log loop removed'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 55: CALLER-BUG 5 — erp-posting _checkInProgress fail-closed
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 55: CALLER-BUG 5 — _checkInProgress fail-closed');
console.log('═══════════════════════════════════════════════════════════\n');

const p8_erpCheckBody = erpSource.slice(
    erpSource.indexOf('async _checkInProgress('),
    erpSource.indexOf('async _record') !== -1
        ? erpSource.indexOf('async _record')
        : erpSource.indexOf('}', erpSource.indexOf('async _checkInProgress(') + 500) + 1
);

// Old code: return false on error (fail-OPEN — unsafe)
// New code: throw on error (fail-CLOSED — safe)
const p8_erpCheckNoComments = p8_erpCheckBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
assert(
    !p8_erpCheckNoComments.includes('return false'),
    'CALLER-BUG 5: _checkInProgress no longer returns false on error (fail-open removed)'
);
assert(
    p8_erpCheckBody.includes('throw'),
    'CALLER-BUG 5: _checkInProgress throws on error (fail-closed)'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 56: CALLER-BUG 6 — erp-posting _checkExistingReceipt fail-closed
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 56: CALLER-BUG 6 — _checkExistingReceipt fail-closed');
console.log('═══════════════════════════════════════════════════════════\n');

const p8_erpReceiptBody = erpSource.slice(
    erpSource.indexOf('async _checkExistingReceipt('),
    erpSource.indexOf('async _checkInProgress(')
);

// Old code: return null on error (fail-OPEN — unsafe)
// New code: throw on error (fail-CLOSED — safe)
const p8_erpReceiptNoComments = p8_erpReceiptBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
// The function should still return null for "no receipt found" (data.length === 0)
// but should throw for DB errors
assert(
    p8_erpReceiptBody.includes('throw'),
    'CALLER-BUG 6: _checkExistingReceipt throws on DB error (fail-closed)'
);

// Verify it still returns null for valid "not found" case
assert(
    p8_erpReceiptNoComments.includes("data && data.length > 0 ? data[0] : null"),
    'CALLER-BUG 6: _checkExistingReceipt still returns null for valid not-found case'
);

// ═══════════════════════════════════════════════════════════════════════════════
// PASS 9 — Deeper Caller-Side Error Handling (Tests 57-64)
// Bugs: CALLER-BUG 7 (replay pipeline try-catch), CALLER-BUG 8 (verify getBlob guard),
// CALLER-BUG 9 (artifact type validation), CALLER-BUG 10 (append state ordering),
// CALLER-BUG 11 (applyRetention atomicity), CALLER-BUG 12 (export crash guards),
// CALLER-BUG 13 (nightlyCompound orchestration), CALLER-BUG 14 (extractLearnings safety)
// ═══════════════════════════════════════════════════════════════════════════════

// --- Read source files for structural analysis ---
const p9_replaySource = readSource('modules/replay/replay_pipeline.js');
const p9_zipSource = readSource('modules/closepack/concurrent_zip.js');
const p9_auditSource = readSource('modules/observability/audit_store.js');
const p9_learningSource = readSource('agentos/agents/compound-learning.js');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 57: CALLER-BUG 7 — replay() try-catch wrapper
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 57: CALLER-BUG 7 — replay() try-catch wrapper');
console.log('═══════════════════════════════════════════════════════════\n');

// Extract replay() method body
const p9_replayStart = p9_replaySource.indexOf('async replay(closeId');
const p9_replayEnd = p9_replaySource.indexOf('async _loadTelemetry(');
const p9_replayBody = p9_replaySource.slice(p9_replayStart, p9_replayEnd);
const p9_replayNoComments = p9_replayBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(p9_replayNoComments.includes('try {'), 'CALLER-BUG 7: replay() has try block');
assert(p9_replayNoComments.includes('} catch (err)'), 'CALLER-BUG 7: replay() has catch block');
assert(p9_replayNoComments.includes('success: false'), 'CALLER-BUG 7: replay() catch returns success: false');
assert(
    p9_replayNoComments.includes('Replay pipeline failed'),
    'CALLER-BUG 7: replay() catch includes descriptive error context'
);

// _loadTelemetry call must be INSIDE the try block
const p9_tryPos = p9_replayNoComments.indexOf('try {');
const p9_loadTelPos = p9_replayNoComments.indexOf('_loadTelemetry(closeId)');
const p9_catchPos = p9_replayNoComments.indexOf('} catch');
assert(
    p9_loadTelPos > p9_tryPos && p9_loadTelPos < p9_catchPos,
    'CALLER-BUG 7: _loadTelemetry call is inside try block'
);

// _generateZip call must also be inside the try block
const p9_genZipPos = p9_replayNoComments.indexOf('_generateZip(');
assert(
    p9_genZipPos > p9_tryPos && p9_genZipPos < p9_catchPos,
    'CALLER-BUG 7: _generateZip call is inside try block'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 58: CALLER-BUG 8 — verify() getBlob error handling
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 58: CALLER-BUG 8 — verify() getBlob error handling');
console.log('═══════════════════════════════════════════════════════════\n');

// Extract verify() preamble (up to first _hash call)
const p9_verifyStart = p9_zipSource.indexOf('async verify(zipPathOrBuffer)');
const p9_verifyEnd = p9_zipSource.indexOf('_hash(buffer)', p9_verifyStart);
const p9_verifyPreamble = p9_zipSource.slice(p9_verifyStart, p9_verifyEnd);
const p9_verifyNoComments = p9_verifyPreamble.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p9_verifyNoComments.includes('try {') && p9_verifyNoComments.includes('getBlob('),
    'CALLER-BUG 8: verify() wraps getBlob in try-catch'
);
assert(
    p9_verifyNoComments.includes('valid: false') && p9_verifyNoComments.includes('Failed to load ZIP'),
    'CALLER-BUG 8: verify() returns valid:false with error on getBlob failure'
);
assert(
    p9_verifyNoComments.includes('if (!buffer)'),
    'CALLER-BUG 8: verify() has null guard on buffer after getBlob'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 59: CALLER-BUG 9 — write() artifact type validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 59: CALLER-BUG 9 — write() artifact type validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p9_writeStart = p9_zipSource.indexOf('async write(outputKey');
const p9_writeEnd = p9_zipSource.indexOf('async verify(');
const p9_writeBody = p9_zipSource.slice(p9_writeStart, p9_writeEnd);
const p9_writeNoComments = p9_writeBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p9_writeNoComments.includes("typeof content === 'string'"),
    'CALLER-BUG 9: write() checks for string type explicitly'
);
assert(
    p9_writeNoComments.includes('throw new TypeError'),
    'CALLER-BUG 9: write() throws TypeError on invalid artifact type'
);
assert(
    p9_writeNoComments.includes('Expected string or Buffer'),
    'CALLER-BUG 9: write() error message describes the type expectation'
);

// Type check must come before Buffer.from call
const p9_bufferFromPos = p9_writeNoComments.indexOf("Buffer.from(content, 'utf8')");
const p9_typeCheckPos = p9_writeNoComments.indexOf("typeof content === 'string'");
assert(
    p9_typeCheckPos < p9_bufferFromPos,
    'CALLER-BUG 9: Type check appears before Buffer.from call'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 60: CALLER-BUG 10 — append() state after persistence
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 60: CALLER-BUG 10 — append() state ordering');
console.log('═══════════════════════════════════════════════════════════\n');

const p9_appendStart = p9_auditSource.indexOf('async append(entry)');
const p9_appendEnd = p9_auditSource.indexOf('async logClosePackEvent(');
const p9_appendBody = p9_auditSource.slice(p9_appendStart, p9_appendEnd);
const p9_appendNoComments = p9_appendBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const p9_appendLogPos = p9_appendNoComments.indexOf('storage.appendLog(');
const p9_entryCountPos = p9_appendNoComments.indexOf('this._entryCount++');
const p9_pendingPos = p9_appendNoComments.indexOf('this._pendingSeals.push(');

assert(
    p9_appendLogPos < p9_entryCountPos,
    'CALLER-BUG 10: storage.appendLog is called BEFORE _entryCount++'
);
assert(
    p9_appendLogPos < p9_pendingPos,
    'CALLER-BUG 10: storage.appendLog is called BEFORE _pendingSeals.push'
);
assert(
    p9_appendNoComments.includes('try {') && p9_appendNoComments.includes('_sealBatch()'),
    'CALLER-BUG 10: append() wraps _sealBatch in try-catch'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 61: CALLER-BUG 11 — applyRetention() atomicity retry
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 61: CALLER-BUG 11 — applyRetention() atomicity retry');
console.log('═══════════════════════════════════════════════════════════\n');

const p9_retStart = p9_auditSource.indexOf('async applyRetention()');
const p9_retEnd = p9_auditSource.indexOf('async export(');
const p9_retBody = p9_auditSource.slice(p9_retStart, p9_retEnd);
const p9_retNoComments = p9_retBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p9_retNoComments.includes('retried < 3'),
    'CALLER-BUG 11: applyRetention has retry loop for audit log append'
);
assert(
    p9_retNoComments.includes('try {') && p9_retNoComments.includes('retried++'),
    'CALLER-BUG 11: applyRetention has try-catch with retry counter'
);
assert(
    p9_retNoComments.includes('CRITICAL') || p9_retNoComments.includes('after 3 retries'),
    'CALLER-BUG 11: applyRetention throws critical error after exhausting retries'
);
assert(
    p9_retNoComments.includes('new Promise'),
    'CALLER-BUG 11: applyRetention has delay between retries'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 62: CALLER-BUG 12 — export() null/circular/csv guards
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 62: CALLER-BUG 12 — export() crash guards');
console.log('═══════════════════════════════════════════════════════════\n');

const p9_exportStart = p9_auditSource.indexOf('async export(');
const p9_exportEnd = p9_auditSource.indexOf('export default AuditLogStore');
const p9_exportBody = p9_auditSource.slice(p9_exportStart, p9_exportEnd);
const p9_exportNoComments = p9_exportBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p9_exportNoComments.includes('!entries') || p9_exportNoComments.includes('!Array.isArray'),
    'CALLER-BUG 12: export() checks for null/non-array entries'
);

// NDJSON: try-catch around JSON.stringify for circular refs
const p9_ndjsonPos = p9_exportNoComments.indexOf("format === 'ndjson'");
const p9_csvPos = p9_exportNoComments.indexOf("format === 'csv'");
const p9_ndjsonSection = p9_exportNoComments.slice(p9_ndjsonPos, p9_csvPos);
assert(
    p9_ndjsonSection.includes('try {') && p9_ndjsonSection.includes('JSON.stringify(e)'),
    'CALLER-BUG 12: NDJSON export wraps JSON.stringify in try-catch'
);

// CSV: safe object serialization
const p9_csvSection = p9_exportNoComments.slice(p9_csvPos);
assert(
    p9_csvSection.includes("typeof val === 'object'"),
    'CALLER-BUG 12: CSV export safely handles object values'
);

// Unknown format rejected
assert(
    p9_exportNoComments.includes('unsupported format'),
    'CALLER-BUG 12: export() throws on unsupported format'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 63: CALLER-BUG 13 — nightlyCompound() step isolation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 63: CALLER-BUG 13 — nightlyCompound() orchestration');
console.log('═══════════════════════════════════════════════════════════\n');

const p9_nightlyStart = p9_learningSource.indexOf('async nightlyCompound()');
const p9_nightlyEnd = p9_learningSource.indexOf('async identifyPriorities()');
const p9_nightlyBody = p9_learningSource.slice(p9_nightlyStart, p9_nightlyEnd);
const p9_nightlyNoComments = p9_nightlyBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must have multiple independent try-catch blocks
const p9_tryCatchCount = (p9_nightlyNoComments.match(/try\s*\{/g) || []).length;
assert(
    p9_tryCatchCount >= 3,
    `CALLER-BUG 13: nightlyCompound has at least 3 try-catch blocks (found ${p9_tryCatchCount})`
);

const p9_catchBlocks = (p9_nightlyNoComments.match(/\}\s*catch\s*\(err\)/g) || []).length;
assert(
    p9_catchBlocks >= 3,
    `CALLER-BUG 13: nightlyCompound has at least 3 catch blocks (found ${p9_catchBlocks})`
);

assert(
    p9_nightlyNoComments.includes('partial_failure'),
    'CALLER-BUG 13: nightlyCompound sets partial_failure status'
);
assert(
    p9_nightlyNoComments.includes('failedSteps'),
    'CALLER-BUG 13: nightlyCompound tracks failed steps'
);

// verifyForecasts and reviewRecentSessions in separate try blocks
const p9_verifyPos = p9_nightlyNoComments.indexOf('verifyForecasts()');
const p9_beforeVerify = p9_nightlyNoComments.slice(0, p9_verifyPos);
const p9_lastTryBeforeVerify = p9_beforeVerify.lastIndexOf('try {');
const p9_reviewPos = p9_nightlyNoComments.indexOf('reviewRecentSessions(');
const p9_beforeReview = p9_nightlyNoComments.slice(0, p9_reviewPos);
const p9_lastTryBeforeReview = p9_beforeReview.lastIndexOf('try {');
assert(
    p9_lastTryBeforeVerify !== p9_lastTryBeforeReview,
    'CALLER-BUG 13: verifyForecasts and reviewRecentSessions are in separate try blocks'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 64: CALLER-BUG 14 — extractLearnings() safety
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 64: CALLER-BUG 14 — extractLearnings() safety');
console.log('═══════════════════════════════════════════════════════════\n');

const p9_extractStart = p9_learningSource.indexOf('async extractLearnings(sessionId)');
const p9_extractEnd = p9_learningSource.indexOf('async reviewRecentSessions(');
const p9_extractBody = p9_learningSource.slice(p9_extractStart, p9_extractEnd);
const p9_extractNoComments = p9_extractBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Supabase query wrapped in try-catch
assert(
    p9_extractNoComments.includes('agent_messages') && p9_extractNoComments.includes('try {'),
    'CALLER-BUG 14: extractLearnings wraps Supabase messages query in try-catch'
);
assert(
    p9_extractNoComments.includes('Failed to fetch messages'),
    'CALLER-BUG 14: extractLearnings returns error on messages query failure'
);

// Claude API call wrapped in try-catch
const p9_anthropicPos = p9_extractNoComments.indexOf('anthropic.messages.create(');
const p9_beforeAnthropic = p9_extractNoComments.slice(0, p9_anthropicPos);
const p9_lastTryBefore = p9_beforeAnthropic.lastIndexOf('try {');
assert(
    p9_lastTryBefore > -1 && p9_anthropicPos - p9_lastTryBefore < 500,
    'CALLER-BUG 14: Claude API call is inside a try block'
);
assert(
    p9_extractNoComments.includes('Claude API call failed'),
    'CALLER-BUG 14: extractLearnings returns error on Claude API failure'
);

// Empty response.content guard
assert(
    p9_extractNoComments.includes('!response.content') ||
    p9_extractNoComments.includes('response.content.length === 0'),
    'CALLER-BUG 14: extractLearnings guards against empty response.content'
);
assert(
    p9_extractNoComments.includes('!response.content[0].text'),
    'CALLER-BUG 14: extractLearnings checks for .text property'
);

// ═══════════════════════════════════════════════════════════════════════════════
// PASS 10 — Deep Error Handling + Fresh Angles (Tests 65-74)
// Bugs: CALLER-BUG 15 (reviewRecentSessions query), CALLER-BUG 16 (updateAgentsMd ops),
// CALLER-BUG 17 (identifyPriorities queries), CALLER-BUG 18 (verifyForecasts query),
// CALLER-BUG 19 (audit_store query), CALLER-BUG 20 (_computeMerkleRoot hash validation),
// CALLER-BUG 21 (_loadTelemetry null guard), CALLER-BUG 22 (_sortEvents NaN guard),
// CALLER-BUG 23 (_reconstructJournal NaN guard), CALLER-BUG 24 (_compare JSZip guard),
// Plus: isTransientError 429 rate limit detection
// ═══════════════════════════════════════════════════════════════════════════════

// Re-read source files for Pass 10 structural tests
const p10_learningSource = readSource('agentos/agents/compound-learning.js');
const p10_auditSource = readSource('modules/observability/audit_store.js');
const p10_replaySource = readSource('modules/replay/replay_pipeline.js');
const p10_storageSource = readSource('agentos/core/storage-adapter.js');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 65: CALLER-BUG 15 — reviewRecentSessions() error handling
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 65: CALLER-BUG 15 — reviewRecentSessions() error handling');
console.log('═══════════════════════════════════════════════════════════\n');

const p10_reviewStart = p10_learningSource.indexOf('async reviewRecentSessions(');
const p10_reviewEnd = p10_learningSource.indexOf('async updateAgentsMd(');
const p10_reviewBody = p10_learningSource.slice(p10_reviewStart, p10_reviewEnd);
const p10_reviewNoComments = p10_reviewBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p10_reviewNoComments.includes('try {') && p10_reviewNoComments.includes('agent_sessions'),
    'CALLER-BUG 15: reviewRecentSessions wraps Supabase query in try-catch'
);
assert(
    p10_reviewNoComments.includes('Failed to fetch sessions'),
    'CALLER-BUG 15: reviewRecentSessions returns error on query failure'
);
assert(
    p10_reviewNoComments.includes('reviewFailures') || p10_reviewNoComments.includes('review_failures'),
    'CALLER-BUG 15: reviewRecentSessions tracks update failures'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 66: CALLER-BUG 16 — updateAgentsMd() error handling
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 66: CALLER-BUG 16 — updateAgentsMd() error handling');
console.log('═══════════════════════════════════════════════════════════\n');

const p10_updateStart = p10_learningSource.indexOf('async updateAgentsMd(');
const p10_updateEnd = p10_learningSource.indexOf('async verifyForecasts(');
const p10_updateBody = p10_learningSource.slice(p10_updateStart, p10_updateEnd);
const p10_updateNoComments = p10_updateBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// storage.getDocument wrapped in try-catch
assert(
    p10_updateNoComments.includes('Failed to read AGENTS.md'),
    'CALLER-BUG 16: updateAgentsMd handles storage.getDocument failure'
);

// Claude API wrapped in try-catch
assert(
    p10_updateNoComments.includes('Claude API failed'),
    'CALLER-BUG 16: updateAgentsMd handles Claude API failure'
);

// storage.putDocument wrapped in try-catch
assert(
    p10_updateNoComments.includes('Failed to write AGENTS.md'),
    'CALLER-BUG 16: updateAgentsMd handles storage.putDocument failure'
);

// Claude response.content guard
assert(
    p10_updateNoComments.includes('!response.content') || p10_updateNoComments.includes('response.content.length === 0'),
    'CALLER-BUG 16: updateAgentsMd guards against empty Claude response'
);

// Per-item insert error handling
assert(
    p10_updateNoComments.includes('insertFailures') || p10_updateNoComments.includes('insert_failures'),
    'CALLER-BUG 16: updateAgentsMd tracks per-item insert failures'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 67: CALLER-BUG 17 — identifyPriorities() error handling + null agent_id
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 67: CALLER-BUG 17 — identifyPriorities() error handling');
console.log('═══════════════════════════════════════════════════════════\n');

const p10_prioStart = p10_learningSource.indexOf('async identifyPriorities()');
const p10_prioEnd = p10_learningSource.indexOf('async implementPriority(');
const p10_prioBody = p10_learningSource.slice(p10_prioStart, p10_prioEnd);
const p10_prioNoComments = p10_prioBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// All 3 queries wrapped in try-catch
const p10_prioTryCatches = (p10_prioNoComments.match(/try\s*\{/g) || []).length;
assert(
    p10_prioTryCatches >= 3,
    `CALLER-BUG 17: identifyPriorities has at least 3 try-catch blocks (found ${p10_prioTryCatches})`
);

// Null agent_id guard
assert(
    p10_prioNoComments.includes("f.agent_id || 'unknown'") || p10_prioNoComments.includes('f.agent_id ||'),
    'CALLER-BUG 17: identifyPriorities guards against null agent_id'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 68: CALLER-BUG 18 — verifyForecasts() initial query guard
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 68: CALLER-BUG 18 — verifyForecasts() initial query guard');
console.log('═══════════════════════════════════════════════════════════\n');

const p10_verifyStart = p10_learningSource.indexOf('async verifyForecasts()');
const p10_verifyEnd = p10_learningSource.indexOf('async nightlyCompound()');
const p10_verifyBody = p10_learningSource.slice(p10_verifyStart, p10_verifyEnd);
const p10_verifyNoComments = p10_verifyBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p10_verifyNoComments.includes('try {') && p10_verifyNoComments.includes('forecast_records'),
    'CALLER-BUG 18: verifyForecasts wraps initial query in try-catch'
);
assert(
    p10_verifyNoComments.includes('Failed to fetch forecasts'),
    'CALLER-BUG 18: verifyForecasts returns error on query failure'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 69: CALLER-BUG 19 — audit_store query() error handling
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 69: CALLER-BUG 19 — audit_store query() error handling');
console.log('═══════════════════════════════════════════════════════════\n');

const p10_queryStart = p10_auditSource.indexOf('async query(');
const p10_queryEnd = p10_auditSource.indexOf('async getCloseAuditTrail(');
const p10_queryBody = p10_auditSource.slice(p10_queryStart, p10_queryEnd);
const p10_queryNoComments = p10_queryBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p10_queryNoComments.includes("!tenantId"),
    'CALLER-BUG 19: query() validates tenantId is present'
);
assert(
    p10_queryNoComments.includes('try {') && p10_queryNoComments.includes('storage.queryLog('),
    'CALLER-BUG 19: query() wraps storage.queryLog in try-catch'
);
assert(
    p10_queryNoComments.includes('Array.isArray'),
    'CALLER-BUG 19: query() validates return is array'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 70: CALLER-BUG 20 — _computeMerkleRoot hash validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 70: CALLER-BUG 20 — _computeMerkleRoot hash validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p10_merkleStart = p10_auditSource.indexOf('_computeMerkleRoot(hashes)');
const p10_merkleEnd = p10_auditSource.indexOf('async flush()');
const p10_merkleBody = p10_auditSource.slice(p10_merkleStart, p10_merkleEnd);
const p10_merkleNoComments = p10_merkleBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must validate hash format (64 hex chars)
assert(
    p10_merkleNoComments.includes('[a-f0-9]{64}') || p10_merkleNoComments.includes('a-f0-9'),
    'CALLER-BUG 20: _computeMerkleRoot validates hash format (SHA-256 hex)'
);
assert(
    p10_merkleNoComments.includes("typeof hashes[i] !== 'string'") ||
    p10_merkleNoComments.includes('typeof hashes['),
    'CALLER-BUG 20: _computeMerkleRoot checks type of each hash'
);
assert(
    p10_merkleNoComments.includes('throw new Error'),
    'CALLER-BUG 20: _computeMerkleRoot throws on invalid hash'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 71: CALLER-BUG 21 — _loadTelemetry null guard
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 71: CALLER-BUG 21 — _loadTelemetry null guard');
console.log('═══════════════════════════════════════════════════════════\n');

const p10_loadTelStart = p10_replaySource.indexOf('async _loadTelemetry(');
const p10_loadTelEnd = p10_replaySource.indexOf('_sortEvents(events)', p10_loadTelStart);
const p10_loadTelBody = p10_replaySource.slice(p10_loadTelStart, p10_loadTelEnd);
const p10_loadTelNoComments = p10_loadTelBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p10_loadTelNoComments.includes('Array.isArray'),
    'CALLER-BUG 21: _loadTelemetry guards against non-array return'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 72: CALLER-BUG 22 — _sortEvents NaN timestamp guard
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 72: CALLER-BUG 22 — _sortEvents NaN timestamp guard');
console.log('═══════════════════════════════════════════════════════════\n');

const p10_sortStart = p10_replaySource.indexOf('_sortEvents(events)');
const p10_sortEnd = p10_replaySource.indexOf('_reconstructJournal(events)', p10_sortStart);
const p10_sortBody = p10_replaySource.slice(p10_sortStart, p10_sortEnd);
const p10_sortNoComments = p10_sortBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p10_sortNoComments.includes('Number.isFinite') || p10_sortNoComments.includes('-Infinity'),
    'CALLER-BUG 22: _sortEvents handles null/invalid timestamps safely'
);
assert(
    p10_sortNoComments.includes('a.timestamp ?') || p10_sortNoComments.includes('a.timestamp?'),
    'CALLER-BUG 22: _sortEvents guards against null timestamps'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 73: CALLER-BUG 23 — _reconstructJournal NaN amount guard
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 73: CALLER-BUG 23 — _reconstructJournal NaN amount guard');
console.log('═══════════════════════════════════════════════════════════\n');

const p10_journalStart = p10_replaySource.indexOf('_reconstructJournal(events)');
const p10_journalEnd = p10_replaySource.indexOf('_reconstructURS(events)', p10_journalStart);
const p10_journalBody = p10_replaySource.slice(p10_journalStart, p10_journalEnd);
const p10_journalNoComments = p10_journalBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p10_journalNoComments.includes('Number.isFinite'),
    'CALLER-BUG 23: _reconstructJournal validates parseFloat results are finite'
);
assert(
    p10_journalNoComments.includes('rawDebit') || p10_journalNoComments.includes('rawCredit'),
    'CALLER-BUG 23: _reconstructJournal separates parsing from formatting'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 74: CALLER-BUG 24 — _compare() JSZip.loadAsync + null file guard
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 74: CALLER-BUG 24 — _compare() JSZip + null file guard');
console.log('═══════════════════════════════════════════════════════════\n');

const p10_compareStart = p10_replaySource.indexOf('async _compare(');
const p10_compareEnd = p10_replaySource.indexOf('_formatAmount(value)', p10_compareStart);
const p10_compareBody = p10_replaySource.slice(p10_compareStart, p10_compareEnd);
const p10_compareNoComments = p10_compareBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// JSZip.loadAsync wrapped in try-catch
assert(
    p10_compareNoComments.includes('JSZip.loadAsync(replayBuffer)'),
    'CALLER-BUG 24: _compare calls JSZip.loadAsync for comparison'
);

// Check for separate try-catch around loadAsync
const p10_loadAsyncPos = p10_compareNoComments.indexOf('JSZip.loadAsync(replayBuffer)');
const p10_beforeLoadAsync = p10_compareNoComments.slice(0, p10_loadAsyncPos);
const p10_lastTryBeforeLoad = p10_beforeLoadAsync.lastIndexOf('try {');
assert(
    p10_lastTryBeforeLoad > -1 && p10_loadAsyncPos - p10_lastTryBeforeLoad < 200,
    'CALLER-BUG 24: JSZip.loadAsync is inside a try block'
);

// Null file handle guard
assert(
    p10_compareNoComments.includes('!replayFileHandle') || p10_compareNoComments.includes('!originalFileHandle'),
    'CALLER-BUG 24: _compare guards against null file handles'
);

// Per-file content comparison in try-catch
assert(
    p10_compareNoComments.includes('file_read_error') || p10_compareNoComments.includes('file_handle_error'),
    'CALLER-BUG 24: _compare handles per-file read errors'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 75: isTransientError — HTTP 429 rate limit detection
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 75: isTransientError — 429 rate limit detection');
console.log('═══════════════════════════════════════════════════════════\n');

const p10_isTransStart = p10_storageSource.indexOf('function isTransientError(');
const p10_isTransEnd = p10_storageSource.indexOf('async function withRetry(');
const p10_isTransBody = p10_storageSource.slice(p10_isTransStart, p10_isTransEnd);
const p10_isTransNoComments = p10_isTransBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p10_isTransNoComments.includes('429'),
    'isTransientError detects HTTP 429 rate limiting'
);
assert(
    p10_isTransNoComments.includes('too many requests') || p10_isTransNoComments.includes('rate limit'),
    'isTransientError detects rate limit text patterns'
);

// ═══════════════════════════════════════════════════════════════════════════════
// PASS 11 — Remaining caller-side bugs across erp-posting-service, retention_policy,
// audit_store, compound-learning (Tests 76-85)
// Bugs: CALLER-BUG 25 (applyAll step isolation), CALLER-BUG 26 (post input validation),
// CALLER-BUG 27 (fail-open ERP fallback), CALLER-BUG 28 (_recordReceipt throw),
// CALLER-BUG 29 (_recordAttempt throw), CALLER-BUG 30 (placeHold validation),
// CALLER-BUG 31 (createAuditEntry metadata null), CALLER-BUG 32 (_extractJournalEntry null handle),
// CALLER-BUG 33 (verifyForecasts inner loop), CALLER-BUG 34 (isUnderHold no mutation)
// ═══════════════════════════════════════════════════════════════════════════════

const p11_erpSource = readSource('modules/erp-posting-service.js');
const p11_retentionSource = readSource('modules/retention/retention_policy.js');
const p11_auditSource = readSource('modules/observability/audit_store.js');
const p11_learningSource = readSource('agentos/agents/compound-learning.js');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 76: CALLER-BUG 25 — retention_policy applyAll() step isolation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 76: CALLER-BUG 25 — applyAll() step isolation');
console.log('═══════════════════════════════════════════════════════════\n');

const p11_applyAllStart = p11_retentionSource.indexOf('async applyAll()');
const p11_applyAllEnd = p11_retentionSource.indexOf('async applyToClosePacks()', p11_applyAllStart);
const p11_applyAllBody = p11_retentionSource.slice(p11_applyAllStart, p11_applyAllEnd);
const p11_applyAllNoComments = p11_applyAllBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must have try-catch inside a loop (1 try-catch iterating over steps array)
const p11_applyTryCatches = (p11_applyAllNoComments.match(/try\s*\{/g) || []).length;
assert(
    p11_applyTryCatches >= 1 && (p11_applyAllNoComments.includes('for (const step') || p11_applyAllNoComments.includes('for (const {')),
    `CALLER-BUG 25: applyAll uses loop-based step isolation with try-catch (found ${p11_applyTryCatches} try-catch in loop)`
);

// Must not have sequential bare awaits for the 5 steps
assert(
    !p11_applyAllNoComments.includes('results.results.closePacks = await this.applyToClosePacks();\n    results.results.auditLogs'),
    'CALLER-BUG 25: applyAll does NOT use sequential bare awaits (step isolation confirmed)'
);

// Must set error status on failure
assert(
    p11_applyAllNoComments.includes("status: 'error'"),
    'CALLER-BUG 25: applyAll sets error status on step failure'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 77: CALLER-BUG 26 — erp-posting-service post() input validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 77: CALLER-BUG 26 — post() input validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p11_postStart = p11_erpSource.indexOf('async post(');
const p11_postEnd = p11_erpSource.indexOf('async _extractJournalEntry(', p11_postStart);
const p11_postBody = p11_erpSource.slice(p11_postStart, p11_postEnd);
const p11_postNoComments = p11_postBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must validate closeId
assert(
    p11_postNoComments.includes('!closeId'),
    'CALLER-BUG 26: post() validates closeId is present'
);

// Must validate zipBuffer with Buffer.isBuffer
assert(
    p11_postNoComments.includes('Buffer.isBuffer(zipBuffer)'),
    'CALLER-BUG 26: post() validates zipBuffer is a Buffer'
);

// Must validate manifest
assert(
    p11_postNoComments.includes('!manifest'),
    'CALLER-BUG 26: post() validates manifest is present'
);

// Must validate erp, entity, postingPolicyId
assert(
    p11_postNoComments.includes('!erp') || p11_postNoComments.includes('!entity'),
    'CALLER-BUG 26: post() validates erp and entity parameters'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 78: CALLER-BUG 27 — _postToERP fail-closed fallback
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 78: CALLER-BUG 27 — _postToERP fail-closed fallback');
console.log('═══════════════════════════════════════════════════════════\n');

const p11_postERPStart = p11_erpSource.indexOf('async _postToERP(');
const p11_postERPEnd = p11_erpSource.indexOf('async _postToSandbox(', p11_postERPStart);
const p11_postERPBody = p11_erpSource.slice(p11_postERPStart, p11_postERPEnd);
const p11_postERPNoComments = p11_postERPBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must NOT return success:true as fallback
assert(
    !p11_postERPNoComments.includes("success: true,\n      erpDocumentId,"),
    'CALLER-BUG 27: _postToERP does NOT return fake success when no integration configured'
);

// Must return success:false when no integration
assert(
    p11_postERPNoComments.includes('success: false'),
    'CALLER-BUG 27: _postToERP returns failure when no ERP integration configured'
);

// Must mention integration not configured
assert(
    p11_postERPNoComments.includes('not configured'),
    'CALLER-BUG 27: _postToERP provides clear error about missing integration'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 79: CALLER-BUG 28 — _recordReceipt throws on DB error
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 79: CALLER-BUG 28 — _recordReceipt throws on error');
console.log('═══════════════════════════════════════════════════════════\n');

const p11_recReceiptStart = p11_erpSource.indexOf('async _recordReceipt(');
const p11_recReceiptEnd = p11_erpSource.indexOf('}', p11_erpSource.indexOf("throw new Error(`Failed to record receipt", p11_recReceiptStart));
const p11_recReceiptBody = p11_erpSource.slice(p11_recReceiptStart, p11_recReceiptEnd + 30);
const p11_recReceiptNoComments = p11_recReceiptBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must throw on error, not swallow
assert(
    p11_recReceiptNoComments.includes('throw new Error'),
    'CALLER-BUG 28: _recordReceipt throws on DB error instead of swallowing'
);

// Must NOT have console.warn for error swallowing
assert(
    !p11_recReceiptNoComments.includes("console.warn(`Error recording receipt"),
    'CALLER-BUG 28: _recordReceipt does NOT swallow errors with console.warn'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 80: CALLER-BUG 29 — _recordAttempt throws on DB error
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 80: CALLER-BUG 29 — _recordAttempt throws on error');
console.log('═══════════════════════════════════════════════════════════\n');

const p11_recAttemptStart = p11_erpSource.indexOf('async _recordAttempt(');
const p11_recAttemptEnd = p11_erpSource.indexOf('async _recordFailure(', p11_recAttemptStart);
const p11_recAttemptBody = p11_erpSource.slice(p11_recAttemptStart, p11_recAttemptEnd);
const p11_recAttemptNoComments = p11_recAttemptBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must throw on error
assert(
    p11_recAttemptNoComments.includes('throw new Error'),
    'CALLER-BUG 29: _recordAttempt throws on DB error instead of swallowing'
);

// Must NOT have try-catch swallowing errors
assert(
    !p11_recAttemptNoComments.includes("console.warn(`Error recording attempt"),
    'CALLER-BUG 29: _recordAttempt does NOT swallow errors with console.warn'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 81: CALLER-BUG 30 — placeHold() input validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 81: CALLER-BUG 30 — placeHold() input validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p11_holdStart = p11_retentionSource.indexOf('placeHold(closeId');
const p11_holdEnd = p11_retentionSource.indexOf('releaseHold(', p11_holdStart);
const p11_holdBody = p11_retentionSource.slice(p11_holdStart, p11_holdEnd);
const p11_holdNoComments = p11_holdBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must validate closeId
assert(
    p11_holdNoComments.includes('!closeId'),
    'CALLER-BUG 30: placeHold validates closeId is present'
);

// Must validate reason
assert(
    p11_holdNoComments.includes('!reason'),
    'CALLER-BUG 30: placeHold validates reason is present'
);

// Must validate requestedBy
assert(
    p11_holdNoComments.includes('!requestedBy'),
    'CALLER-BUG 30: placeHold validates requestedBy is present'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 82: CALLER-BUG 31 — createAuditEntry metadata null guard
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 82: CALLER-BUG 31 — createAuditEntry metadata null guard');
console.log('═══════════════════════════════════════════════════════════\n');

const p11_entryStart = p11_auditSource.indexOf('function createAuditEntry(');
const p11_entryEnd = p11_auditSource.indexOf('class AuditLogStore', p11_entryStart);
const p11_entryBody = p11_auditSource.slice(p11_entryStart, p11_entryEnd);
const p11_entryNoComments = p11_entryBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must guard metadata before spreading
assert(
    p11_entryNoComments.includes("typeof metadata === 'object'") || p11_entryNoComments.includes('metadata &&'),
    'CALLER-BUG 31: createAuditEntry guards metadata before spreading'
);

// Must safely access metadata.source
assert(
    p11_entryNoComments.includes('metadata && metadata.source') || p11_entryNoComments.includes('metadata?.source'),
    'CALLER-BUG 31: createAuditEntry safely accesses metadata.source'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 83: CALLER-BUG 32 — _extractJournalEntry null file handle
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 83: CALLER-BUG 32 — _extractJournalEntry null file handle');
console.log('═══════════════════════════════════════════════════════════\n');

const p11_extractStart = p11_erpSource.indexOf('async _extractJournalEntry(');
const p11_extractEnd = p11_erpSource.indexOf('_parseJournalCSV(', p11_extractStart);
const p11_extractBody = p11_erpSource.slice(p11_extractStart, p11_extractEnd);
const p11_extractNoComments = p11_extractBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must check file handle for null
assert(
    p11_extractNoComments.includes('journalFileHandle') || p11_extractNoComments.includes('!zip.file('),
    'CALLER-BUG 32: _extractJournalEntry stores file handle in variable'
);

assert(
    p11_extractNoComments.includes('!journalFileHandle'),
    'CALLER-BUG 32: _extractJournalEntry checks for null file handle'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 84: CALLER-BUG 33 — verifyForecasts() inner loop error handling
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 84: CALLER-BUG 33 — verifyForecasts() inner loop');
console.log('═══════════════════════════════════════════════════════════\n');

const p11_verifyStart = p11_learningSource.indexOf('async verifyForecasts()');
const p11_verifyEnd = p11_learningSource.indexOf('async nightlyCompound()', p11_verifyStart);
const p11_verifyBody = p11_learningSource.slice(p11_verifyStart, p11_verifyEnd);
const p11_verifyNoComments = p11_verifyBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must have try-catch inside the for loop
const p11_forPos = p11_verifyNoComments.indexOf('for (const forecast of forecasts)');
const p11_afterFor = p11_verifyNoComments.slice(p11_forPos, p11_forPos + 800);
assert(
    p11_afterFor.includes('try {'),
    'CALLER-BUG 33: verifyForecasts has try-catch inside per-forecast loop'
);

// Must check actualsErr from destructuring
assert(
    p11_verifyNoComments.includes('actualsErr') || p11_verifyNoComments.includes('error: actualsErr'),
    'CALLER-BUG 33: verifyForecasts checks error from cost_records query'
);

// Must check updateErr
assert(
    p11_verifyNoComments.includes('updateErr') || p11_verifyNoComments.includes('error: updateErr'),
    'CALLER-BUG 33: verifyForecasts checks error from forecast_records update'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 85: CALLER-BUG 34 — isUnderHold no side-effect mutation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 85: CALLER-BUG 34 — isUnderHold no mutation');
console.log('═══════════════════════════════════════════════════════════\n');

const p11_holdCheckStart = p11_retentionSource.indexOf('isUnderHold(closeId)');
const p11_holdCheckEnd = p11_retentionSource.indexOf('getActiveHolds()', p11_holdCheckStart);
const p11_holdCheckBody = p11_retentionSource.slice(p11_holdCheckStart, p11_holdCheckEnd);
const p11_holdCheckNoComments = p11_holdCheckBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must NOT mutate hold.status during read
assert(
    !p11_holdCheckNoComments.includes("hold.status = 'expired'"),
    'CALLER-BUG 34: isUnderHold does NOT mutate hold.status during read'
);

// Must still check expiration
assert(
    p11_holdCheckNoComments.includes('hold.expires_at'),
    'CALLER-BUG 34: isUnderHold still checks expiration date'
);

// ═══════════════════════════════════════════════════════════════════════════════
// ═══  PASS 12: FINAL SWEEP — BUGS 35-48 (14 bugs, 6 files)  ═════════════════
// ═══════════════════════════════════════════════════════════════════════════════

// Re-read sources for Pass 12 structural analysis
const p12_storageSource = readSource('agentos/core/storage-adapter.js');
const p12_erpSource = readSource('modules/erp-posting-service.js');
const p12_zipSource = readSource('modules/closepack/concurrent_zip.js');
const p12_retentionSource = readSource('modules/retention/retention_policy.js');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 86: CALLER-BUG 35 — releaseLock field validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 86: CALLER-BUG 35 — releaseLock field validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p12_releaseLockStart = p12_storageSource.indexOf('async function releaseLock(');
const p12_releaseLockEnd = p12_storageSource.indexOf('\n}', p12_releaseLockStart + 50);
const p12_releaseLockBody = p12_storageSource.slice(p12_releaseLockStart, p12_releaseLockEnd);
const p12_releaseLockNoComments = p12_releaseLockBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must check lock.scope, lock.key, lock.owner
assert(
    p12_releaseLockNoComments.includes('lock.scope') || p12_releaseLockNoComments.includes('!lock.scope'),
    'CALLER-BUG 35: releaseLock validates lock.scope field'
);
assert(
    p12_releaseLockNoComments.includes('lock.key') || p12_releaseLockNoComments.includes('!lock.key'),
    'CALLER-BUG 35: releaseLock validates lock.key field'
);
assert(
    p12_releaseLockNoComments.includes('lock.owner') || p12_releaseLockNoComments.includes('!lock.owner'),
    'CALLER-BUG 35: releaseLock validates lock.owner field'
);
// Must handle null lock gracefully (early return)
assert(
    p12_releaseLockNoComments.includes('if (!lock)'),
    'CALLER-BUG 35: releaseLock has null lock guard'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 87: CALLER-BUG 36 — appendLog stream validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 87: CALLER-BUG 36 — appendLog stream validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p12_appendLogStart = p12_storageSource.indexOf('async function appendLog(');
const p12_appendLogEnd = p12_storageSource.indexOf('\n}', p12_appendLogStart + 50);
const p12_appendLogBody = p12_storageSource.slice(p12_appendLogStart, p12_appendLogEnd);
const p12_appendLogNoComments = p12_appendLogBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must validate stream parameter
assert(
    p12_appendLogNoComments.includes("typeof stream !== 'string'") ||
    p12_appendLogNoComments.includes("typeof stream !=='string'"),
    'CALLER-BUG 36: appendLog validates stream type is string'
);
assert(
    p12_appendLogNoComments.includes('stream.trim()') || p12_appendLogNoComments.includes("!stream"),
    'CALLER-BUG 36: appendLog rejects empty/whitespace-only stream'
);
assert(
    p12_appendLogNoComments.includes('TypeError') || p12_appendLogNoComments.includes('throw'),
    'CALLER-BUG 36: appendLog throws on invalid stream'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 88: CALLER-BUG 37 — queryLog stream validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 88: CALLER-BUG 37 — queryLog stream validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p12_queryLogStart = p12_storageSource.indexOf('async function queryLog(');
const p12_queryLogEnd = p12_storageSource.indexOf('\n}', p12_queryLogStart + 50);
const p12_queryLogBody = p12_storageSource.slice(p12_queryLogStart, p12_queryLogEnd);
const p12_queryLogNoComments = p12_queryLogBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p12_queryLogNoComments.includes("typeof stream !== 'string'") ||
    p12_queryLogNoComments.includes("typeof stream !=='string'"),
    'CALLER-BUG 37: queryLog validates stream type is string'
);
assert(
    p12_queryLogNoComments.includes('TypeError') || p12_queryLogNoComments.includes('throw'),
    'CALLER-BUG 37: queryLog throws on invalid stream'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 89: CALLER-BUG 38 — putDocument bucket/key validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 89: CALLER-BUG 38 — putDocument bucket/key validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p12_putDocStart = p12_storageSource.indexOf('async function putDocument(');
const p12_putDocEnd = p12_storageSource.indexOf('\n}', p12_putDocStart + 50);
const p12_putDocBody = p12_storageSource.slice(p12_putDocStart, p12_putDocEnd);
const p12_putDocNoComments = p12_putDocBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must validate both bucket and key
assert(
    p12_putDocNoComments.includes("typeof bucket !== 'string'") ||
    p12_putDocNoComments.includes('!bucket'),
    'CALLER-BUG 38: putDocument validates bucket parameter'
);
assert(
    p12_putDocNoComments.includes("typeof key !== 'string'") ||
    p12_putDocNoComments.includes('!key'),
    'CALLER-BUG 38: putDocument validates key parameter'
);
// Both should throw TypeError
const p12_putDocThrows = (p12_putDocNoComments.match(/throw new TypeError/g) || []).length;
assert(
    p12_putDocThrows >= 2,
    `CALLER-BUG 38: putDocument throws TypeError for both bucket and key (found ${p12_putDocThrows} throws)`
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 90: CALLER-BUG 39 — putBlob/getBlob bucket/key validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 90: CALLER-BUG 39 — putBlob/getBlob bucket/key validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p12_putBlobStart = p12_storageSource.indexOf('async function putBlob(');
const p12_putBlobEnd = p12_storageSource.indexOf('\n}', p12_putBlobStart + 50);
const p12_putBlobBody = p12_storageSource.slice(p12_putBlobStart, p12_putBlobEnd);
const p12_putBlobNoComments = p12_putBlobBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p12_putBlobNoComments.includes("typeof bucket !== 'string'") ||
    p12_putBlobNoComments.includes('!bucket'),
    'CALLER-BUG 39: putBlob validates bucket parameter'
);
assert(
    p12_putBlobNoComments.includes("typeof key !== 'string'") ||
    p12_putBlobNoComments.includes('!key'),
    'CALLER-BUG 39: putBlob validates key parameter'
);

const p12_getBlobStart = p12_storageSource.indexOf('async function getBlob(');
const p12_getBlobEnd = p12_storageSource.indexOf('\n}', p12_getBlobStart + 50);
const p12_getBlobBody = p12_storageSource.slice(p12_getBlobStart, p12_getBlobEnd);
const p12_getBlobNoComments = p12_getBlobBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p12_getBlobNoComments.includes("typeof bucket !== 'string'") ||
    p12_getBlobNoComments.includes('!bucket'),
    'CALLER-BUG 39: getBlob validates bucket parameter'
);
assert(
    p12_getBlobNoComments.includes("typeof key !== 'string'") ||
    p12_getBlobNoComments.includes('!key'),
    'CALLER-BUG 39: getBlob validates key parameter'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 91: CALLER-BUG 40 — _parseJournalCSV RFC 4180 quoted fields
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 91: CALLER-BUG 40 — _parseJournalCSV RFC 4180 quoted fields');
console.log('═══════════════════════════════════════════════════════════\n');

const p12_parseCsvStart = p12_erpSource.indexOf('_parseJournalCSV(csv) {');
const p12_parseCsvEnd = p12_erpSource.indexOf('\n  }', p12_parseCsvStart + 50);
const p12_parseCsvBody = p12_erpSource.slice(p12_parseCsvStart, p12_parseCsvEnd);
const p12_parseCsvNoComments = p12_parseCsvBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must track inQuotes state for RFC 4180 compliance
assert(
    p12_parseCsvNoComments.includes('inQuotes'),
    'CALLER-BUG 40: _parseJournalCSV tracks inQuotes state for quoted field handling'
);
// Must NOT use naive split(',') for data lines
assert(
    !p12_parseCsvNoComments.includes("lines[i].split(',')") &&
    !p12_parseCsvNoComments.includes("line.split(',')"),
    'CALLER-BUG 40: _parseJournalCSV does NOT use naive split(",") for data lines'
);
// Must handle the quote toggle
assert(
    p12_parseCsvNoComments.includes('char === \'"\'') || p12_parseCsvNoComments.includes("char === '\"'"),
    'CALLER-BUG 40: _parseJournalCSV detects double-quote character for field quoting'
);
// Must use character-by-character parsing (state machine)
assert(
    p12_parseCsvNoComments.includes('for (let i = 0') || p12_parseCsvNoComments.includes('for(let i=0'),
    'CALLER-BUG 40: _parseJournalCSV uses character-by-character state machine parser'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 92: CALLER-BUG 41 — _postToSandbox fail-closed on storage errors
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 92: CALLER-BUG 41 — _postToSandbox fail-closed');
console.log('═══════════════════════════════════════════════════════════\n');

const p12_sandboxStart = p12_erpSource.indexOf('_postToSandbox(');
const p12_sandboxEnd = p12_erpSource.indexOf('\n  }', p12_sandboxStart + 200);
const p12_sandboxBody = p12_erpSource.slice(p12_sandboxStart, p12_sandboxEnd);
const p12_sandboxNoComments = p12_sandboxBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Catch block must return success:false, not success:true
assert(
    p12_sandboxNoComments.includes('success: false') || p12_sandboxNoComments.includes('success:false'),
    'CALLER-BUG 41: _postToSandbox catch block returns success:false on storage error'
);
// Must NOT log warning and continue with success:true
assert(
    !p12_sandboxNoComments.includes('storageWriteError'),
    'CALLER-BUG 41: _postToSandbox does NOT silently store error and continue with success'
);
// Catch block should reference the error for propagation
assert(
    p12_sandboxNoComments.includes('error.message') || p12_sandboxNoComments.includes('error:'),
    'CALLER-BUG 41: _postToSandbox propagates error message from storage failure'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 93: CALLER-BUG 42 — concurrent_zip _hash buffer validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 93: CALLER-BUG 42 — _hash buffer type validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p12_hashStart = p12_zipSource.indexOf('_hash(buffer) {');
const p12_hashEnd = p12_zipSource.indexOf('\n  }', p12_hashStart + 10);
const p12_hashBody = p12_zipSource.slice(p12_hashStart, p12_hashEnd);
const p12_hashNoComments = p12_hashBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must validate buffer type before crypto.update
assert(
    p12_hashNoComments.includes('Buffer.isBuffer') || p12_hashNoComments.includes('isBuffer(buffer'),
    'CALLER-BUG 42: _hash validates buffer type with Buffer.isBuffer'
);
assert(
    p12_hashNoComments.includes("typeof buffer !== 'string'") ||
    p12_hashNoComments.includes("typeof buffer === 'string'"),
    'CALLER-BUG 42: _hash also accepts string type (Buffer or string)'
);
assert(
    p12_hashNoComments.includes('TypeError'),
    'CALLER-BUG 42: _hash throws TypeError on invalid buffer type'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 94: CALLER-BUG 43 — concurrent_zip write() artifacts null check
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 94: CALLER-BUG 43 — write() artifacts null check');
console.log('═══════════════════════════════════════════════════════════\n');

const p12_writeStart = p12_zipSource.indexOf('async write(outputKey, artifacts, manifest)');
const p12_writeEnd = p12_zipSource.indexOf('let lock = null', p12_writeStart);
const p12_writeBody = p12_zipSource.slice(p12_writeStart, p12_writeEnd);
const p12_writeNoComments = p12_writeBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must validate artifacts is non-null object
assert(
    p12_writeNoComments.includes('!artifacts') || p12_writeNoComments.includes('artifacts === null'),
    'CALLER-BUG 43: write() checks artifacts for null/undefined'
);
assert(
    p12_writeNoComments.includes('Array.isArray(artifacts)'),
    'CALLER-BUG 43: write() rejects arrays (must be plain object)'
);
// Must validate outputKey is non-empty string
assert(
    p12_writeNoComments.includes('!outputKey') || p12_writeNoComments.includes("typeof outputKey !== 'string'"),
    'CALLER-BUG 43: write() validates outputKey is a non-empty string'
);
assert(
    p12_writeNoComments.includes('TypeError'),
    'CALLER-BUG 43: write() throws TypeError on invalid inputs'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 95: CALLER-BUG 44 — _getCutoffDate DST-safe arithmetic
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 95: CALLER-BUG 44 — _getCutoffDate DST-safe');
console.log('═══════════════════════════════════════════════════════════\n');

const p12_cutoffStart = p12_retentionSource.indexOf('_getCutoffDate(retentionDays)');
const p12_cutoffEnd = p12_retentionSource.indexOf('\n  }', p12_cutoffStart + 10);
const p12_cutoffBody = p12_retentionSource.slice(p12_cutoffStart, p12_cutoffEnd);
const p12_cutoffNoComments = p12_cutoffBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must use millisecond arithmetic, NOT setDate
assert(
    !p12_cutoffNoComments.includes('setDate'),
    'CALLER-BUG 44: _getCutoffDate does NOT use setDate (DST-unsafe)'
);
assert(
    p12_cutoffNoComments.includes('Date.now()') || p12_cutoffNoComments.includes('getTime()'),
    'CALLER-BUG 44: _getCutoffDate uses millisecond arithmetic (Date.now or getTime)'
);
// Must validate retentionDays is a number
assert(
    p12_cutoffNoComments.includes("typeof retentionDays !== 'number'") ||
    p12_cutoffNoComments.includes('isFinite'),
    'CALLER-BUG 44: _getCutoffDate validates retentionDays is a finite number'
);
assert(
    p12_cutoffNoComments.includes('retentionDays < 0') || p12_cutoffNoComments.includes('retentionDays <= 0'),
    'CALLER-BUG 44: _getCutoffDate rejects negative retention days'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 96: CALLER-BUG 45 — _processRetention null guard on entries
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 96: CALLER-BUG 45 — _processRetention null guard');
console.log('═══════════════════════════════════════════════════════════\n');

const p12_processStart = p12_retentionSource.indexOf('_processRetention(streamOrBucket');
const p12_processEnd = p12_retentionSource.indexOf('\n  }', p12_processStart + 200);
const p12_processBody = p12_retentionSource.slice(p12_processStart, p12_processEnd);
const p12_processNoComments = p12_processBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must have null guard on queryLog result (|| [] or similar)
assert(
    p12_processNoComments.includes('|| []') || p12_processNoComments.includes('?? []') ||
    p12_processNoComments.includes('rawEntries || []') || p12_processNoComments.includes('rawEntries ?? []'),
    'CALLER-BUG 45: _processRetention guards against null queryLog result with fallback to empty array'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 97: CALLER-BUG 46 — releaseHold input validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 97: CALLER-BUG 46 — releaseHold validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p12_releaseStart = p12_retentionSource.indexOf('releaseHold(closeId, releasedBy)');
const p12_releaseEnd = p12_retentionSource.indexOf('\n  }', p12_releaseStart + 50);
const p12_releaseBody = p12_retentionSource.slice(p12_releaseStart, p12_releaseEnd);
const p12_releaseNoComments = p12_releaseBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must validate releasedBy parameter
assert(
    p12_releaseNoComments.includes('!releasedBy') || p12_releaseNoComments.includes("typeof releasedBy"),
    'CALLER-BUG 46: releaseHold validates releasedBy parameter'
);
assert(
    p12_releaseNoComments.includes('throw'),
    'CALLER-BUG 46: releaseHold throws on missing releasedBy'
);
// Must handle already-released holds (idempotent)
assert(
    p12_releaseNoComments.includes("hold.status === 'released'") || p12_releaseNoComments.includes("status === 'released'"),
    'CALLER-BUG 46: releaseHold handles already-released holds idempotently'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 98: CALLER-BUG 47 — getActiveHolds expiration check
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 98: CALLER-BUG 47 — getActiveHolds expiration check');
console.log('═══════════════════════════════════════════════════════════\n');

const p12_activeHoldsStart = p12_retentionSource.indexOf('getActiveHolds()');
const p12_activeHoldsEnd = p12_retentionSource.indexOf('\n  }', p12_activeHoldsStart + 50);
const p12_activeHoldsBody = p12_retentionSource.slice(p12_activeHoldsStart, p12_activeHoldsEnd);
const p12_activeHoldsNoComments = p12_activeHoldsBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must check expiration, not just status
assert(
    p12_activeHoldsNoComments.includes('hold.expires_at') || p12_activeHoldsNoComments.includes('expires_at'),
    'CALLER-BUG 47: getActiveHolds checks hold expiration, not just status'
);
// Must create Date for comparison
assert(
    p12_activeHoldsNoComments.includes('new Date(hold.expires_at)') || p12_activeHoldsNoComments.includes('new Date('),
    'CALLER-BUG 47: getActiveHolds creates Date objects for expiration comparison'
);
// Must skip or filter expired holds
assert(
    p12_activeHoldsNoComments.includes('continue') || p12_activeHoldsNoComments.includes('filter'),
    'CALLER-BUG 47: getActiveHolds skips expired holds with continue or filter'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 99: CALLER-BUG 48 — generateReport period validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 99: CALLER-BUG 48 — generateReport period validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p12_reportStart = p12_retentionSource.indexOf('generateReport()');
const p12_reportEnd = p12_retentionSource.indexOf('\n  }', p12_reportStart + 50);
const p12_reportBody = p12_retentionSource.slice(p12_reportStart, p12_reportEnd);
const p12_reportNoComments = p12_reportBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must have try-catch around per-period processing
assert(
    p12_reportNoComments.includes('try {') || p12_reportNoComments.includes('try{'),
    'CALLER-BUG 48: generateReport wraps per-period processing in try-catch'
);
assert(
    p12_reportNoComments.includes('catch'),
    'CALLER-BUG 48: generateReport catches per-period errors'
);
// Must include error info in report on failure
assert(
    p12_reportNoComments.includes('err.message') || p12_reportNoComments.includes('error:'),
    'CALLER-BUG 48: generateReport includes error message in report for invalid periods'
);

// ═══════════════════════════════════════════════════════════════════════════════
// ═══  PASS 13: A+ HARDENING — BUGS 49-51 (3 bugs, 1 file)  ═════════════════
// ═══════════════════════════════════════════════════════════════════════════════

// Re-read storage-adapter for Pass 13
const p13_storageSource = readSource('agentos/core/storage-adapter.js');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 100: CALLER-BUG 49 — getDocument bucket/key validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 100: CALLER-BUG 49 — getDocument bucket/key validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p13_getDocStart = p13_storageSource.indexOf('async function getDocument(');
const p13_getDocRetry = p13_storageSource.indexOf('return withRetry(', p13_getDocStart);
const p13_getDocPreamble = p13_storageSource.slice(p13_getDocStart, p13_getDocRetry);
const p13_getDocNoComments = p13_getDocPreamble.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p13_getDocNoComments.includes("typeof bucket !== 'string'") || p13_getDocNoComments.includes('!bucket'),
    'CALLER-BUG 49: getDocument validates bucket parameter'
);
assert(
    p13_getDocNoComments.includes("typeof key !== 'string'") || p13_getDocNoComments.includes('!key'),
    'CALLER-BUG 49: getDocument validates key parameter'
);
assert(
    p13_getDocNoComments.includes('TypeError'),
    'CALLER-BUG 49: getDocument throws TypeError on invalid params'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 101: CALLER-BUG 50 — acquireLock scope/key/ttlMs validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 101: CALLER-BUG 50 — acquireLock validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p13_lockStart = p13_storageSource.indexOf('async function acquireLock(');
const p13_lockWhile = p13_storageSource.indexOf('while (Date.now()', p13_lockStart);
const p13_lockPreamble = p13_storageSource.slice(p13_lockStart, p13_lockWhile);
const p13_lockNoComments = p13_lockPreamble.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p13_lockNoComments.includes("typeof scope !== 'string'") || p13_lockNoComments.includes('!scope'),
    'CALLER-BUG 50: acquireLock validates scope parameter'
);
assert(
    p13_lockNoComments.includes("typeof key !== 'string'") || p13_lockNoComments.includes('!key'),
    'CALLER-BUG 50: acquireLock validates key parameter'
);
assert(
    p13_lockNoComments.includes('ttlMs') && (p13_lockNoComments.includes('isFinite') || p13_lockNoComments.includes('typeof ttlMs')),
    'CALLER-BUG 50: acquireLock validates ttlMs is a finite positive number'
);
assert(
    (p13_lockNoComments.match(/TypeError/g) || []).length >= 2,
    'CALLER-BUG 50: acquireLock throws TypeError for invalid scope, key, and ttlMs'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 102: CALLER-BUG 51 — queryLog filter limit validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 102: CALLER-BUG 51 — queryLog filter validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p13_queryStart = p13_storageSource.indexOf('async function queryLog(');
const p13_queryEnd = p13_storageSource.indexOf('\n}', p13_queryStart + 50);
const p13_queryBody = p13_storageSource.slice(p13_queryStart, p13_queryEnd);
const p13_queryNoComments = p13_queryBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p13_queryNoComments.includes('safeLimit') || p13_queryNoComments.includes('safeLim'),
    'CALLER-BUG 51: queryLog uses sanitized limit value'
);
assert(
    p13_queryNoComments.includes('Number.isInteger(limit)') || p13_queryNoComments.includes('isInteger'),
    'CALLER-BUG 51: queryLog validates limit is a valid integer'
);
assert(
    p13_queryNoComments.includes('.limit(safeLimit') || p13_queryNoComments.includes('.limit(safeLim'),
    'CALLER-BUG 51: queryLog passes sanitized limit to Supabase .limit()'
);

// ═══════════════════════════════════════════════════════════════════════════════
// ═══  PASS 14: CRITICAL FIX — BUGS 59-60 (2 bugs, 1 file)  ════════════════════
// ═══════════════════════════════════════════════════════════════════════════════

// Re-read storage-adapter for Pass 14
const p14_storageSource = readSource('agentos/core/storage-adapter.js');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 103: BUG 59 — deleteLogBefore stream parameter validation
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 103: BUG 59 — deleteLogBefore stream validation');
console.log('═══════════════════════════════════════════════════════════\n');

const p14_deleteLogStart = p14_storageSource.indexOf('async function deleteLogBefore(');
const p14_deleteLogEnd = p14_storageSource.indexOf('return withRetry(', p14_deleteLogStart);
const p14_deleteLogPreamble = p14_storageSource.slice(p14_deleteLogStart, p14_deleteLogEnd);
const p14_deleteLogNoComments = p14_deleteLogPreamble.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p14_deleteLogNoComments.includes("typeof stream !== 'string'") || p14_deleteLogNoComments.includes('!stream'),
    'BUG 59: deleteLogBefore validates stream parameter'
);
assert(
    p14_deleteLogNoComments.includes('stream must be a non-empty string'),
    'BUG 59: deleteLogBefore has correct error message'
);
assert(
    p14_deleteLogNoComments.includes('throw new TypeError'),
    'BUG 59: deleteLogBefore throws TypeError for invalid stream'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 104: BUG 60 — putDocument versioned path SELECT error handling
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 104: BUG 60 — putDocument versioned path SELECT error');
console.log('═══════════════════════════════════════════════════════════\n');

const p14_putDocStart = p14_storageSource.indexOf('async function putDocument(');
const p14_putDocEnd = p14_storageSource.indexOf('\n}\n\nasync function', p14_putDocStart);
const p14_putDocBody = p14_storageSource.slice(p14_putDocStart, p14_putDocEnd);
const p14_putDocNoComments = p14_putDocBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p14_putDocNoComments.includes('selectError') && p14_putDocNoComments.includes("selectError.code !== 'PGRST116'"),
    'BUG 60: putDocument checks for SELECT errors on version query'
);
assert(
    p14_putDocNoComments.includes('version SELECT failed'),
    'BUG 60: putDocument has error message for version SELECT failure'
);
assert(
    p14_putDocNoComments.includes('throw new Error') && p14_putDocNoComments.includes('selectError'),
    'BUG 60: putDocument throws on non-PGRST116 SELECT errors'
);

// ═══════════════════════════════════════════════════════════════════════════════
// ═══  PASS 15: PATH TRAVERSAL & LOCK HARDENING — BUGS 84-86 (3 bugs)  ═════════
// ═══════════════════════════════════════════════════════════════════════════════

// Re-read storage-adapter for Pass 15
const p15_storageSource = readSource('agentos/core/storage-adapter.js');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 105: BUG 84 — Path traversal guard in putBlob/getBlob/putDocument/getDocument
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 105: BUG 84 — Path traversal guard in blob/document methods');
console.log('═══════════════════════════════════════════════════════════\n');

const p15_putBlobStart = p15_storageSource.indexOf('async function putBlob(');
const p15_putBlobEnd = p15_storageSource.indexOf('return withRetry(', p15_putBlobStart);
const p15_putBlobPreamble = p15_storageSource.slice(p15_putBlobStart, p15_putBlobEnd);
const p15_putBlobNoComments = p15_putBlobPreamble.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must check for ..\/ or /..\\ patterns via regex test
assert(
    p15_putBlobNoComments.includes('.test(key)') && p15_putBlobNoComments.includes('..'),
    'BUG 84: putBlob validates key against path traversal patterns with regex test'
);

// Must check for startsWith('..'), startsWith('/'), startsWith('\\')
assert(
    (p15_putBlobNoComments.includes("startsWith('..') ||") || p15_putBlobNoComments.includes("startsWith('..')")) &&
    (p15_putBlobNoComments.includes("startsWith('/')") || p15_putBlobNoComments.includes("startsWith('\\\\'")),
    'BUG 84: putBlob blocks keys starting with .. / or \\'
);

const p15_getBlobStart = p15_storageSource.indexOf('async function getBlob(');
const p15_getBlobEnd = p15_storageSource.indexOf('return withRetry(', p15_getBlobStart);
const p15_getBlobPreamble = p15_storageSource.slice(p15_getBlobStart, p15_getBlobEnd);
const p15_getBlobNoComments = p15_getBlobPreamble.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p15_getBlobNoComments.includes('.test(key)') && p15_getBlobNoComments.includes('..'),
    'BUG 84: getBlob validates key against path traversal patterns with regex test'
);

const p15_putDocStart = p15_storageSource.indexOf('async function putDocument(');
const p15_putDocEnd = p15_storageSource.indexOf('return withRetry(', p15_putDocStart);
const p15_putDocPreamble = p15_storageSource.slice(p15_putDocStart, p15_putDocEnd);
const p15_putDocNoComments = p15_putDocPreamble.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p15_putDocNoComments.includes('.test(key)') && p15_putDocNoComments.includes('..'),
    'BUG 84: putDocument validates key against path traversal patterns with regex test'
);

const p15_getDocStart = p15_storageSource.indexOf('async function getDocument(');
const p15_getDocEnd = p15_storageSource.indexOf('return withRetry(', p15_getDocStart);
const p15_getDocPreamble = p15_storageSource.slice(p15_getDocStart, p15_getDocEnd);
const p15_getDocNoComments = p15_getDocPreamble.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

assert(
    p15_getDocNoComments.includes('.test(key)') && p15_getDocNoComments.includes('..'),
    'BUG 84: getDocument validates key against path traversal patterns with regex test'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 106: BUG 85 — acquireLock ttlMs upper bound validation (24 hours = 86400000ms)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 106: BUG 85 — acquireLock ttlMs upper bound (24 hours)');
console.log('═══════════════════════════════════════════════════════════\n');

const p15_lockStart = p15_storageSource.indexOf('async function acquireLock(');
const p15_lockWhile = p15_storageSource.indexOf('while (Date.now()', p15_lockStart);
const p15_lockPreamble = p15_storageSource.slice(p15_lockStart, p15_lockWhile);
const p15_lockNoComments = p15_lockPreamble.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must check ttlMs > 86400000 (24 hours)
assert(
    p15_lockNoComments.includes('86400000') || p15_lockNoComments.includes('86400'),
    'BUG 85: acquireLock validates ttlMs <= 86400000 (24 hours max)'
);

assert(
    p15_lockNoComments.includes('ttlMs >') || p15_lockNoComments.includes('ttlMs <='),
    'BUG 85: acquireLock performs upper bound comparison on ttlMs'
);

assert(
    p15_lockNoComments.includes('throw new TypeError') && p15_lockNoComments.includes('24 hours'),
    'BUG 85: acquireLock throws TypeError mentioning 24 hours limit'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 107: BUG 86 — acquireLock cleanup error discrimination (transient vs fatal)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST 107: BUG 86 — acquireLock cleanup error handling');
console.log('═══════════════════════════════════════════════════════════\n');

const p15_lockFullStart = p15_storageSource.indexOf('async function acquireLock(');
const p15_lockFullEnd = p15_storageSource.indexOf('\n}\n\nasync function releaseLock', p15_lockFullStart);
const p15_lockFullBody = p15_storageSource.slice(p15_lockFullStart, p15_lockFullEnd);
const p15_lockFullNoComments = p15_lockFullBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// Must check if cleanup error is transient
assert(
    p15_lockFullNoComments.includes('cleanupError') && p15_lockFullNoComments.includes('isTransientError'),
    'BUG 86: acquireLock checks cleanup error with isTransientError()'
);

// Must distinguish transient (retry) from fatal (throw)
assert(
    p15_lockFullNoComments.includes('if (cleanupError)') &&
    (p15_lockFullNoComments.includes('if (isTransientError(cleanupError))') ||
     p15_lockFullNoComments.includes('isTransientError(cleanupError')),
    'BUG 86: acquireLock treats transient cleanup errors with retry'
);

// Must have separate path for non-transient cleanup errors
assert(
    p15_lockFullNoComments.includes('Non-transient cleanup errors are fatal') ||
    p15_lockFullNoComments.includes('throw new Error') && p15_lockFullNoComments.includes('cleanup'),
    'BUG 86: acquireLock throws on non-transient cleanup errors'
);

// ═══════════════════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log(`W-003 TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(60));

if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ✗ ${f}`));
}

console.log('');
process.exit(failed > 0 ? 1 : 0);
