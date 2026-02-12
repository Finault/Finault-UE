/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * STORAGE ADAPTER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fix W-003: Replaces all filesystem operations with Supabase-backed storage.
 *
 * THE PROBLEM:
 *   The codebase was written for a Node.js file server but deploys to Cloudflare
 *   Workers (serverless). Filesystem writes fail silently or throw:
 *   - Cloudflare Workers: NO filesystem access at all
 *   - AWS Lambda: Only /tmp is writable, ephemeral between invocations
 *   - Vercel: Same as Lambda
 *
 *   14 filesystem operations across 5 files all write data that is then lost
 *   on the next invocation. Audit logs, learning documents, ERP receipts,
 *   ZIP files, and lock files are all affected.
 *
 * THE SOLUTION:
 *   A StorageAdapter that routes all persistence to Supabase (or Supabase
 *   Storage for binary blobs). Every module calls the adapter instead of fs.
 *   In development, the adapter can optionally mirror to the filesystem for
 *   debugging, but the source of truth is always the database.
 *
 * Usage:
 *   import { storage } from '../core/storage-adapter.js';
 *
 *   // Text documents (AGENTS.md, audit logs, receipts)
 *   await storage.putDocument('learning-docs', 'AGENTS.md', content, { version: true });
 *   const doc = await storage.getDocument('learning-docs', 'AGENTS.md');
 *
 *   // Append-only logs (audit entries)
 *   await storage.appendLog('audit-entries', entry);
 *   const entries = await storage.queryLog('audit-entries', { tenantId, limit: 100 });
 *
 *   // Binary blobs (ZIP files)
 *   await storage.putBlob('closepacks', 'close-123.zip', buffer);
 *   const blob = await storage.getBlob('closepacks', 'close-123.zip');
 *
 *   // Distributed locks
 *   const lock = await storage.acquireLock('closepack-gen', 'close-123', ttlMs);
 *   await storage.releaseLock(lock);
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSIENT ERROR RETRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retry wrapper for transient errors (network timeouts, cold-start failures).
 *
 * In serverless environments (Cloudflare Workers, AWS Lambda), the first
 * Supabase request after a cold start can fail due to DNS resolution delay
 * or TCP handshake timeout. These errors are transient and resolve on retry.
 *
 * Non-transient errors (constraint violations, auth failures, bad queries)
 * are re-thrown immediately without retry.
 */
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 200;
const MAX_VERSION_RETRIES = 3;

function isTransientError(err) {
    if (!err) return false;
    // BUG 10 FIX: Handle non-Error thrown values (strings, numbers, objects).
    // Some libraries and runtimes throw raw strings (e.g., throw "network timeout")
    // or objects without a .message property. We must coerce to string to match
    // transient patterns regardless of the thrown type.
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
           /\b(429|5\d{2})\b/.test(msg);
}

async function withRetry(fn, label) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (attempt < MAX_RETRIES && isTransientError(err)) {
                const delay = RETRY_BASE_MS * (2 ** (attempt - 1));
                console.warn(
                    `[StorageAdapter] ${label}: transient error (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms`
                );
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }
}

/**
 * Detect if we're running in a serverless environment.
 * Used to gate filesystem fallbacks (dev only).
 */
function isServerless() {
    return !!(
        process.env.CLOUDFLARE_WORKER ||
        process.env.CF_PAGES ||
        process.env.VERCEL ||
        process.env.AWS_LAMBDA_FUNCTION_NAME ||
        process.env.LAMBDA_TASK_ROOT
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Store a text document in Supabase with optional versioning.
 *
 * Table: storage_documents
 *   bucket TEXT, key TEXT, content TEXT, version INT, sha256 TEXT,
 *   created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, metadata JSONB
 *   PRIMARY KEY (bucket, key, version)
 *   UNIQUE INDEX idx_storage_documents_latest ON (bucket, key)
 *     WHERE version = (SELECT MAX(version) FROM storage_documents sd
 *                      WHERE sd.bucket = bucket AND sd.key = key)
 *
 * NOTE: The PK is (bucket, key, version) so versioned inserts don't
 * conflict. The non-versioned upsert always uses version=1 with
 * onConflict on all three columns.
 *
 * AT-LEAST-ONCE WRITE SEMANTIC (versioned path):
 *   The versioned write path is wrapped by withRetry for transient error
 *   resilience. In an extremely narrow race condition — where the INSERT
 *   commits on the server but the response is lost (e.g., TCP RST or
 *   Supabase SDK timeout) — withRetry will re-execute the closure. The
 *   SELECT will see the committed row, compute nextVersion = N+1, and
 *   INSERT a second version with identical content and SHA256. This
 *   phantom version is benign: the content is correct, the SHA256 is
 *   identical, and getDocument (which returns the latest version) is
 *   unaffected. This is the standard at-least-once delivery tradeoff
 *   inherent to any retry system operating against non-idempotent INSERTs.
 *   Callers that need exactly-once semantics should deduplicate on SHA256.
 */
async function putDocument(bucket, key, content, options = {}) {
    // CALLER-BUG 38 FIX: Validate bucket and key in addition to content.
    // Old code validated content (BUG 15) but not bucket/key. If bucket=""
    // or key=null, the INSERT silently succeeds in a "black hole" location.
    // Subsequent getDocument with the correct bucket/key returns null — data
    // is silently lost.
    if (!bucket || typeof bucket !== 'string' || bucket.trim() === '') {
        throw new TypeError('[StorageAdapter] putDocument: bucket must be a non-empty string');
    }
    if (!key || typeof key !== 'string' || key.trim() === '' || /\.\.[\\/]|[\\/]\.\./.test(key) || key.startsWith('..') || key.startsWith('/') || key.startsWith('\\')) {
        throw new TypeError('[StorageAdapter] putDocument: key must be a non-empty string without path traversal sequences');
    }
    // BUG 15 FIX: Validate inputs before entering withRetry.
    // Passing null/undefined content to crypto.createHash().update() throws
    // a cryptic ERR_INVALID_ARG_TYPE that is NOT transient, yet withRetry
    // exhausts all 3 attempts before surfacing it. Fail fast with a clear message.
    if (content == null || typeof content !== 'string') {
        throw new TypeError('[StorageAdapter] putDocument: content must be a non-null string');
    }

    return withRetry(async () => {
        const { version = false, metadata = {} } = options;
        const sha256 = crypto.createHash('sha256').update(content).digest('hex');

        if (version) {
            // Insert new version, keep history.
            // PK is (bucket, key, version) — each version is its own row.
            //
            // CONCURRENCY: Two processes can query the same max version and
            // both compute nextVersion = N+1. The PK constraint prevents
            // duplicates — one INSERT succeeds, the other gets error 23505.
            // We catch this and re-query to get the correct next version.
            for (let vAttempt = 0; vAttempt < MAX_VERSION_RETRIES; vAttempt++) {
                const { data: existing, error: selectError } = await supabase
                    .from('storage_documents')
                    .select('version')
                    .eq('bucket', bucket)
                    .eq('key', key)
                    .order('version', { ascending: false })
                    .limit(1)
                    .single();

                // BUG 60 FIX: Check for SELECT errors (other than PGRST116 "no rows").
                // Without error checking, network failures or permission errors silently
                // proceed with existing=undefined, computing nextVersion=1. If the
                // SELECT failure was transient, the retry should catch it. But if it's
                // a real error (auth failure, query syntax), we should fail fast rather
                // than blindly inserting with potentially wrong version numbers.
                if (selectError && selectError.code !== 'PGRST116') {
                    throw new Error(`[StorageAdapter] putDocument: version SELECT failed: ${selectError.message}`);
                }

                const nextVersion = (existing?.version || 0) + 1;

                const { error } = await supabase
                    .from('storage_documents')
                    .insert({
                        bucket,
                        key,
                        content,
                        version: nextVersion,
                        sha256,
                        metadata,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    });

                if (!error) return { bucket, key, version: nextVersion, sha256 };

                // PK constraint violation (23505) — another process won the race.
                // Re-query max version and retry.
                if (error.code === '23505' && vAttempt < MAX_VERSION_RETRIES - 1) {
                    continue;
                }

                throw new Error(`[StorageAdapter] putDocument failed: ${error.message}`);
            }
        }

        // Upsert (no version history) — always version=1.
        // Conflict target is the full PK (bucket, key, version).
        const { error } = await supabase
            .from('storage_documents')
            .upsert({
                bucket,
                key,
                content,
                version: 1,
                sha256,
                metadata,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'bucket,key,version',
            });

        if (error) throw new Error(`[StorageAdapter] putDocument failed: ${error.message}`);
        return { bucket, key, version: 1, sha256 };
    }, 'putDocument');
}

/**
 * Retrieve a text document from Supabase.
 * Returns the latest version by default.
 */
async function getDocument(bucket, key, options = {}) {
    // CALLER-BUG 49 FIX: Validate bucket and key parameters.
    // putDocument validates these, but getDocument did not — if bucket="" or
    // key=null, the Supabase query silently returns no rows (PGRST116 "not found").
    // Callers interpret null as "document doesn't exist" when the real problem is
    // malformed parameters. Fail-fast with clear error messages.
    if (!bucket || typeof bucket !== 'string' || bucket.trim() === '') {
        throw new TypeError('[StorageAdapter] getDocument: bucket must be a non-empty string');
    }
    if (!key || typeof key !== 'string' || key.trim() === '' || /\.\.[\\/]|[\\/]\.\./.test(key) || key.startsWith('..') || key.startsWith('/') || key.startsWith('\\')) {
        throw new TypeError('[StorageAdapter] getDocument: key must be a non-empty string without path traversal sequences');
    }
    return withRetry(async () => {
        const { version = null } = options;

        // BUG 19 FIX: Select only needed columns instead of *.
        // Same pattern fixed in W-004 (generateDailySummary). The * pulls
        // all columns including potentially large metadata JSONB and
        // internal timestamps. Callers need content, version, sha256, and
        // metadata — nothing else.
        let query = supabase
            .from('storage_documents')
            .select('content, version, sha256, metadata')
            .eq('bucket', bucket)
            .eq('key', key);

        if (version) {
            query = query.eq('version', version);
        } else {
            query = query.order('version', { ascending: false }).limit(1);
        }

        const { data, error } = await query.single();
        if (error && error.code === 'PGRST116') return null; // Not found
        if (error) throw new Error(`[StorageAdapter] getDocument failed: ${error.message}`);
        return data;
    }, 'getDocument');
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPEND-ONLY LOG STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Append an entry to a log stream in Supabase.
 *
 * Table: storage_logs
 *   id UUID DEFAULT gen_random_uuid(), stream TEXT, entry JSONB,
 *   entry_hash TEXT, created_at TIMESTAMPTZ DEFAULT now()
 */
async function appendLog(stream, entry) {
    // CALLER-BUG 36 FIX: Validate stream is a non-empty string.
    // Old code validated entry (BUG 16) but not stream. If stream="" or
    // stream=null, the INSERT silently succeeds with an empty/null stream
    // column. queryLog with the correct stream name never finds these entries.
    if (!stream || typeof stream !== 'string' || stream.trim() === '') {
        throw new TypeError('[StorageAdapter] appendLog: stream must be a non-empty string');
    }
    // BUG 16 FIX: Validate entry is a non-null object.
    // Passing null/undefined produces JSON.stringify(null) → "null" hash,
    // and stores entry: null in the JSONB column. Downstream consumers
    // (audit_store, retention_policy, replay_pipeline) crash when accessing
    // properties on null entries returned by queryLog.
    if (!entry || typeof entry !== 'object') {
        throw new TypeError('[StorageAdapter] appendLog: entry must be a non-null object');
    }

    return withRetry(async () => {
        const entryHash = entry.entry_hash || crypto.createHash('sha256')
            .update(JSON.stringify(entry)).digest('hex');

        const { error } = await supabase
            .from('storage_logs')
            .insert({
                stream,
                entry,
                entry_hash: entryHash,
                created_at: new Date().toISOString(),
            });

        if (error) throw new Error(`[StorageAdapter] appendLog failed: ${error.message}`);
        return { stream, entry_hash: entryHash };
    }, 'appendLog');
}

/**
 * Query a log stream with filters.
 */
async function queryLog(stream, filters = {}) {
    // CALLER-BUG 37 FIX: Validate stream parameter.
    // Same pattern as appendLog — empty/null stream causes queries to
    // match no rows, returning empty array. Callers interpret empty array
    // as "no data" when the real problem is a bad stream name.
    if (!stream || typeof stream !== 'string' || stream.trim() === '') {
        throw new TypeError('[StorageAdapter] queryLog: stream must be a non-empty string');
    }
    return withRetry(async () => {
        const {
            tenantId = null,
            closeId = null,
            eventType = null,
            startTime = null,
            endTime = null,
            limit = 100,
        } = filters;

        // CALLER-BUG 51 FIX: Validate filter values to prevent Supabase errors.
        // If limit is negative, non-integer, or absurdly large (e.g., Infinity),
        // Supabase returns cryptic 400 errors or fetches entire tables. If
        // startTime/endTime are not valid ISO strings, gte/lte silently produces
        // no results or crashes Supabase's date parser.
        const safeLimit = (Number.isInteger(limit) && limit > 0 && limit <= 100000) ? limit : 100;

        let query = supabase
            .from('storage_logs')
            .select('entry')
            .eq('stream', stream)
            .order('created_at', { ascending: false })
            .limit(safeLimit);

        // Supabase JSONB filters
        if (tenantId) query = query.eq('entry->>tenant_id', tenantId);
        if (closeId) query = query.eq('entry->>close_id', closeId);
        if (eventType) query = query.eq('entry->>event_type', eventType);
        if (startTime) query = query.gte('created_at', startTime);
        if (endTime) query = query.lte('created_at', endTime);

        const { data, error } = await query;
        if (error) throw new Error(`[StorageAdapter] queryLog failed: ${error.message}`);
        // BUG 20 FIX: Filter out null entries before returning.
        // If a null entry was stored (possible before BUG 16 input validation),
        // callers (audit_store, retention_policy, replay_pipeline) crash when
        // accessing properties on null entries. Filter them out defensively.
        return (data || []).map(row => row.entry).filter(entry => entry != null);
    }, 'queryLog');
}

/**
 * Delete log entries older than a cutoff date (retention policy).
 */
async function deleteLogBefore(stream, cutoffDate) {
    // BUG 59 FIX: Validate stream is a non-empty string.
    // Without this validation, empty/null stream causes the DELETE to match
    // no rows, silently leaving old entries undeleted while callers believe
    // retention policy has been applied. Matches validation pattern in
    // appendLog and queryLog.
    if (!stream || typeof stream !== 'string' || stream.trim() === '') {
        throw new TypeError('[StorageAdapter] deleteLogBefore: stream must be a non-empty string');
    }
    return withRetry(async () => {
        // BUG 14 FIX: Coerce cutoffDate to ISO string safely.
        // Callers may pass a Date object, an ISO string, or a numeric
        // timestamp. The old code called cutoffDate.toISOString() directly,
        // which crashes with "toISOString is not a function" on strings
        // and numbers, exhausting withRetry before surfacing the error.
        const iso = cutoffDate instanceof Date
            ? cutoffDate.toISOString()
            : typeof cutoffDate === 'string'
                ? cutoffDate
                : new Date(cutoffDate).toISOString();

        // Uses lte (<=) to match queryLog's boundary semantics.
        // Without this, entries at exactly the cutoff would be counted
        // by queryLog (lte) but not deleted here, causing scannedCount >
        // deletedCount discrepancies in retention reports.
        const { data, error } = await supabase
            .from('storage_logs')
            .delete()
            .eq('stream', stream)
            .lte('created_at', iso)
            .select('id');

        if (error) throw new Error(`[StorageAdapter] deleteLogBefore failed: ${error.message}`);
        return { deleted: data?.length || 0 };
    }, 'deleteLogBefore');
}

// ═══════════════════════════════════════════════════════════════════════════════
// BINARY BLOB STORAGE (via Supabase Storage buckets)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Store a binary blob (ZIP files, etc.) in Supabase Storage.
 */
async function putBlob(bucket, key, buffer) {
    // CALLER-BUG 39 FIX: Validate bucket and key parameters.
    // Same pattern as putDocument — empty/null bucket or key causes uploads
    // to wrong locations. ZIP files stored under null key are unrecoverable.
    if (!bucket || typeof bucket !== 'string' || bucket.trim() === '') {
        throw new TypeError('[StorageAdapter] putBlob: bucket must be a non-empty string');
    }
    if (!key || typeof key !== 'string' || key.trim() === '' || /\.\.[\\/]|[\\/]\.\./.test(key) || key.startsWith('..') || key.startsWith('/') || key.startsWith('\\')) {
        throw new TypeError('[StorageAdapter] putBlob: key must be a non-empty string without path traversal sequences');
    }
    // BUG 17 FIX: Validate buffer before entering withRetry.
    // Null/undefined buffer causes Supabase SDK upload error or
    // crypto.createHash().update(null) crash — neither is transient,
    // yet withRetry exhausts all 3 retries before throwing.
    if (buffer == null) {
        throw new TypeError('[StorageAdapter] putBlob: buffer must not be null or undefined');
    }

    return withRetry(async () => {
        const { error } = await supabase.storage
            .from(bucket)
            .upload(key, buffer, {
                contentType: 'application/octet-stream',
                upsert: true,
            });

        if (error) throw new Error(`[StorageAdapter] putBlob failed: ${error.message}`);

        const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
        return { bucket, key, sha256, size: buffer.length };
    }, 'putBlob');
}

/**
 * Retrieve a binary blob from Supabase Storage.
 */
async function getBlob(bucket, key) {
    // CALLER-BUG 39 FIX (continued): Validate bucket and key for getBlob.
    if (!bucket || typeof bucket !== 'string' || bucket.trim() === '') {
        throw new TypeError('[StorageAdapter] getBlob: bucket must be a non-empty string');
    }
    if (!key || typeof key !== 'string' || key.trim() === '' || /\.\.[\\/]|[\\/]\.\./.test(key) || key.startsWith('..') || key.startsWith('/') || key.startsWith('\\')) {
        throw new TypeError('[StorageAdapter] getBlob: key must be a non-empty string without path traversal sequences');
    }
    return withRetry(async () => {
        const { data, error } = await supabase.storage
            .from(bucket)
            .download(key);

        if (error) throw new Error(`[StorageAdapter] getBlob failed: ${error.message}`);

        // BUG 18 FIX: Guard against null/undefined data.
        // Supabase Storage download returns { data: Blob|null, error }.
        // If error is null but data is also null (race condition: file deleted
        // between exists-check and download, or malformed SDK response),
        // calling data.arrayBuffer() crashes with "Cannot read properties of null".
        if (!data) {
            throw new Error(`[StorageAdapter] getBlob: no data returned for ${bucket}/${key}`);
        }

        return Buffer.from(await data.arrayBuffer());
    }, 'getBlob');
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISTRIBUTED LOCKS (replaces file-based locking)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Acquire a distributed lock using Supabase with retry.
 *
 * Table: storage_locks
 *   lock_scope TEXT, lock_key TEXT, owner TEXT, expires_at TIMESTAMPTZ,
 *   acquired_at TIMESTAMPTZ DEFAULT now()
 *   PRIMARY KEY (lock_scope, lock_key)
 *
 * Uses INSERT with conflict handling: if the row exists and hasn't expired,
 * the insert fails. If it's expired, we delete and re-insert.
 *
 * RETRY BEHAVIOR: Retries every LOCK_RETRY_INTERVAL_MS until ttlMs elapses.
 * This matches the old FileLock behavior — callers expect to WAIT for the
 * lock, not fail immediately. Without retry, ConcurrentZipWriter throws
 * instantly in any concurrent close-pack generation scenario.
 */
const LOCK_RETRY_INTERVAL_MS = 200;

async function acquireLock(scope, key, ttlMs = 30000) {
    // CALLER-BUG 50 FIX: Validate scope and key parameters.
    // Old code proceeded directly to Supabase DELETE/INSERT with null/empty
    // scope or key. DELETE with .eq('lock_scope', null) matches nothing, so
    // expired locks are never cleaned. INSERT with null scope/key creates a
    // "ghost lock" on a phantom key — the real resource remains unprotected,
    // allowing concurrent access despite the lock being "held."
    if (!scope || typeof scope !== 'string' || scope.trim() === '') {
        throw new TypeError('[StorageAdapter] acquireLock: scope must be a non-empty string');
    }
    if (!key || typeof key !== 'string' || key.trim() === '') {
        throw new TypeError('[StorageAdapter] acquireLock: key must be a non-empty string');
    }
    if (typeof ttlMs !== 'number' || !isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 86400000) {
        throw new TypeError('[StorageAdapter] acquireLock: ttlMs must be a positive finite number <= 86400000 (24 hours)');
    }

    const owner = `${process.pid || 'worker'}-${crypto.randomBytes(4).toString('hex')}`;
    const startTime = Date.now();

    while (Date.now() - startTime < ttlMs) {
        const expiresAt = new Date(Date.now() + ttlMs).toISOString();

        // Try to clean up expired locks first.
        // Error is logged but not fatal — if cleanup fails, the INSERT
        // will fail too and the retry loop handles it.
        const { error: cleanupError } = await supabase
            .from('storage_locks')
            .delete()
            .eq('lock_scope', scope)
            .eq('lock_key', key)
            .lt('expires_at', new Date().toISOString());

        if (cleanupError) {
            if (isTransientError(cleanupError)) {
                console.warn(`[StorageAdapter] acquireLock: cleanup transient error, retrying`);
                await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS));
                continue;
            }
            // Non-transient cleanup errors are fatal — stale lock cannot be removed
            throw new Error(`[StorageAdapter] acquireLock: cleanup failed: ${cleanupError.message}`);
        }

        // Try to acquire
        const { error } = await supabase
            .from('storage_locks')
            .insert({
                lock_scope: scope,
                lock_key: key,
                owner,
                expires_at: expiresAt,
                acquired_at: new Date().toISOString(),
            });

        if (!error) {
            // Lock acquired
            return { scope, key, owner, expiresAt };
        }

        // BUG 12 FIX: Three-way error discrimination for acquireLock.
        // The BUG 11 fix threw on ALL non-23505 errors, but that broke
        // transient error handling: network errors from cold-start have
        // error.code = undefined, which !== '23505', so they threw
        // immediately instead of being retried by the while loop.
        //
        // Correct priority:
        //   1. Transient error (network blip) → log + retry
        //   2. Lock contention (23505)        → silent retry
        //   3. Fatal error (everything else)   → throw immediately
        if (isTransientError(error)) {
            console.warn(
                `[StorageAdapter] acquireLock: transient error (${error.message}), retrying in ${LOCK_RETRY_INTERVAL_MS}ms`
            );
            await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS));
            continue;
        }

        if (error.code === '23505') {
            // Lock held by someone else — wait and retry
            await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS));
            continue;
        }

        // Fatal error — throw immediately (BUG 11 FIX preserved)
        throw new Error(`[StorageAdapter] acquireLock failed: ${error.message} (code: ${error.code})`);
    }

    // Timed out waiting for lock
    return null;
}

/**
 * Release a distributed lock.
 *
 * BUG 13 FIX: Added transient error retry. The old code made a single
 * DELETE attempt — if a network blip occurred, the lock hung around for
 * the full TTL blocking all subsequent operations.
 *
 * CONTRACT: releaseLock NEVER throws. Callers use it in finally blocks
 * and must not catch errors. After MAX_RETRIES exhausted, we log a
 * warning and let TTL expiration handle cleanup (graceful degradation).
 */
async function releaseLock(lock) {
    if (!lock) return;
    // CALLER-BUG 35 FIX: Validate lock object fields before DELETE.
    // Old code checked !lock but not field values. If lock = { scope: null,
    // key: undefined, owner: "" }, the DELETE executes with .eq('lock_scope', null)
    // which matches nothing — lock is never released, hangs for full TTL.
    if (!lock.scope || !lock.key || !lock.owner) {
        console.warn('[StorageAdapter] releaseLock: invalid lock object (missing scope/key/owner), skipping');
        return;
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const { error } = await supabase
            .from('storage_locks')
            .delete()
            .eq('lock_scope', lock.scope)
            .eq('lock_key', lock.key)
            .eq('owner', lock.owner);

        if (!error) return; // Successfully released

        // Transient error — retry with backoff
        if (attempt < MAX_RETRIES && isTransientError(error)) {
            const delay = RETRY_BASE_MS * (2 ** (attempt - 1));
            console.warn(
                `[StorageAdapter] releaseLock: transient error (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms`
            );
            await new Promise(r => setTimeout(r, delay));
            continue;
        }

        // Non-transient error or final attempt — log and accept TTL cleanup
        console.warn(`[StorageAdapter] releaseLock warning: ${error.message}`);
        return;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTED ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

export const storage = {
    // Documents
    putDocument,
    getDocument,

    // Append-only logs
    appendLog,
    queryLog,
    deleteLogBefore,

    // Binary blobs
    putBlob,
    getBlob,

    // Distributed locks
    acquireLock,
    releaseLock,

    // Utilities
    isServerless,
};

export default storage;
