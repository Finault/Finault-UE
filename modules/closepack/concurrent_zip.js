/**
 * Finault Concurrent-Safe ZIP Writer
 *
 * Provides atomic ZIP file generation with locking to prevent
 * race conditions during concurrent Close Pack generation.
 *
 * Key invariants:
 * - Atomic writes via temp file + rename
 * - File locking for concurrent access
 * - Deterministic output (lexicographic sorting, fixed precision)
 * - Checksum verification
 */

import crypto from 'crypto';
import JSZip from 'jszip';
import { storage } from '../../agentos/core/storage-adapter.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOCK_TIMEOUT_MS = 30000;  // 30 seconds
const LOCK_RETRY_INTERVAL_MS = 100;


// ============================================================================
// CONCURRENT ZIP WRITER
// ============================================================================

/**
 * Concurrent-safe ZIP writer for Close Pack generation.
 * Uses distributed locks (Supabase) and blob storage instead of filesystem.
 */
export class ConcurrentZipWriter {
  constructor(options = {}) {
    this.options = {
      lockTimeout: options.lockTimeout || LOCK_TIMEOUT_MS,
      checksumAlgorithm: options.checksumAlgorithm || 'sha256',
      compression: options.compression || 'DEFLATE',
      compressionLevel: options.compressionLevel || 6,
    };
  }

  /**
   * Generate a Close Pack ZIP atomically.
   *
   * @param {string} outputKey - Storage key for the ZIP (e.g., 'closepacks/FIN-CL-2024-01.zip')
   * @param {Object} artifacts - Map of artifact paths to content
   * @param {Object} manifest - Manifest object to include
   * @returns {Promise<Object>} - Result with key, sha256, size
   */
  // CALLER-BUG 43 FIX: Validate artifacts parameter before processing.
  // Old code calls Object.keys(artifacts) at line 66 with no null check.
  // If artifacts is null/undefined, TypeError: "Cannot convert undefined or
  // null to object" crashes the write, but AFTER lock acquisition — the lock
  // is released in finally, but the error is confusing and wasteful.
  async write(outputKey, artifacts, manifest) {
    if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) {
      throw new TypeError('[ConcurrentZipWriter] write: artifacts must be a non-null object mapping paths to content');
    }
    if (!outputKey || typeof outputKey !== 'string') {
      throw new TypeError('[ConcurrentZipWriter] write: outputKey must be a non-empty string');
    }
    let lock = null;
    try {
      // Acquire distributed lock
      lock = await storage.acquireLock('closepack-gen', outputKey, this.options.lockTimeout);
      if (!lock) {
        throw new Error(`Failed to acquire lock for ${outputKey} within ${this.options.lockTimeout}ms`);
      }

      // Create ZIP in memory first for determinism
      const zip = new JSZip();
      const hashes = {};

      // Sort artifact paths lexicographically for determinism
      const sortedPaths = Object.keys(artifacts).sort();

      // CALLER-BUG 9 FIX: Validate artifact content types before Buffer coercion.
      // Old code used Buffer.from(content) which silently accepts numbers, booleans,
      // arrays, etc. — producing wrong byte representations. E.g., Buffer.from(123)
      // creates a 123-byte buffer of zeroes, not the string "123". The ZIP would
      // contain corrupted data but the hash would match (both computed from the
      // wrong buffer), creating a false sense of correctness.
      for (const artifactPath of sortedPaths) {
        const content = artifacts[artifactPath];
        let contentBuffer;
        if (Buffer.isBuffer(content)) {
          contentBuffer = content;
        } else if (typeof content === 'string') {
          contentBuffer = Buffer.from(content, 'utf8');
        } else {
          throw new TypeError(
            `Artifact "${artifactPath}" has invalid type ${typeof content}. Expected string or Buffer.`
          );
        }

        zip.file(artifactPath, contentBuffer);
        hashes[artifactPath] = this._hash(contentBuffer);
      }

      // Update manifest with artifact hashes
      const finalManifest = {
        ...manifest,
        artifacts: sortedPaths,
        artifact_hashes: hashes,
        generated_at: new Date().toISOString(),
      };

      // Compute manifest hash
      const manifestJson = JSON.stringify(finalManifest, null, 2);
      finalManifest.manifest_hash = this._hash(Buffer.from(manifestJson));

      // Add manifest to ZIP
      const finalManifestJson = JSON.stringify(finalManifest, null, 2);
      zip.file('manifest.json', finalManifestJson);

      // Generate ZIP buffer
      const compressionType = this.options.compression === 'DEFLATE' ? 'DEFLATE' : 'STORE';
      const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: compressionType,
        compressionOptions: { level: this.options.compressionLevel },
      });

      // Compute ZIP checksum
      const zipHash = this._hash(zipBuffer);

      // Store ZIP in blob storage
      const storeResult = await storage.putBlob('closepacks', outputKey, zipBuffer);

      // Verify by reading back
      const verifyBuffer = await storage.getBlob('closepacks', outputKey);
      const verifyHash = this._hash(verifyBuffer);

      if (verifyHash !== zipHash) {
        throw new Error('ZIP verification failed: checksum mismatch after write');
      }

      return {
        success: true,
        key: outputKey,
        sha256: zipHash,
        size: zipBuffer.length,
        artifact_count: sortedPaths.length,
        manifest: finalManifest,
      };

    } finally {
      if (lock) {
        await storage.releaseLock(lock);
      }
    }
  }

  /**
   * Verify an existing ZIP file.
   * Accepts either a storage key (string) or a buffer directly.
   *
   * @param {string|Buffer} zipPathOrBuffer - Storage key or buffer to verify
   * @returns {Promise<Object>} - Verification result
   */
  // CALLER-BUG 8 FIX: Wrap getBlob in try-catch and add null guard.
  // Old code had no error handling around storage.getBlob — if the blob
  // didn't exist or Supabase threw, the exception propagated as an unhandled
  // rejection. Additionally, _hash(buffer) would crash on null/undefined.
  async verify(zipPathOrBuffer) {
    let buffer;
    if (Buffer.isBuffer(zipPathOrBuffer)) {
      buffer = zipPathOrBuffer;
    } else {
      // Treat as storage key
      try {
        buffer = await storage.getBlob('closepacks', zipPathOrBuffer);
      } catch (err) {
        return { valid: false, error: `Failed to load ZIP from storage: ${err.message}` };
      }
      if (!buffer) {
        return { valid: false, error: `ZIP file not found: ${zipPathOrBuffer}` };
      }
    }

    const hash = this._hash(buffer);

    try {
      const zip = await JSZip.loadAsync(buffer);
      const files = Object.keys(zip.files);

      // Find and parse manifest
      const manifestFile = files.find(f => f === 'manifest.json' || f.endsWith('-manifest.json'));
      if (!manifestFile) {
        return { valid: false, error: 'No manifest found' };
      }

      const manifest = JSON.parse(await zip.file(manifestFile).async('string'));

      // Verify artifact hashes
      const failures = [];
      for (const [path, expectedHash] of Object.entries(manifest.artifact_hashes || {})) {
        if (!files.includes(path)) {
          failures.push({ path, error: 'missing' });
          continue;
        }

        const content = await zip.file(path).async('nodebuffer');
        const actualHash = this._hash(content);

        if (actualHash !== expectedHash) {
          failures.push({ path, expected: expectedHash, actual: actualHash });
        }
      }

      return {
        valid: failures.length === 0,
        zip_sha256: hash,
        manifest,
        failures,
      };

    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  /**
   * Compute hash of buffer.
   */
  // CALLER-BUG 42 FIX: Validate buffer type before crypto.update().
  // Old code passed buffer directly to .update() with no type check.
  // If buffer is null, undefined, number, or object, .update() throws
  // cryptic "The first argument must be of type string or Buffer" error.
  // This method is called from write(), verify(), and _hash() in 6+ places.
  _hash(buffer) {
    if (!Buffer.isBuffer(buffer) && typeof buffer !== 'string') {
      throw new TypeError(`[ConcurrentZipWriter] _hash: expected Buffer or string, got ${typeof buffer}`);
    }
    return crypto.createHash(this.options.checksumAlgorithm).update(buffer).digest('hex');
  }
}

// ============================================================================
// BUILD HASH GENERATOR
// ============================================================================

/**
 * Generate build.json with reproducible build information.
 */
export function generateBuildJson(options = {}) {
  const gitSha = options.gitSha || process.env.GIT_SHA || getGitSha();
  const gitBranch = options.gitBranch || process.env.GIT_BRANCH || getGitBranch();

  return {
    build_id: `build-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    git: {
      sha: gitSha,
      branch: gitBranch,
      dirty: isGitDirty(),
    },
    environment: {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    tool_versions: {
      jszip: getPackageVersion('jszip'),
      finault_version: options.version || '2.0.0',
    },
    determinism: {
      sort_algorithm: 'lexicographic',
      precision: '2dp',
      hash_algorithm: 'sha256',
    },
  };
}

function getGitSha() {
  try {
    const { execSync } = require('child_process');
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getGitBranch() {
  try {
    const { execSync } = require('child_process');
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function isGitDirty() {
  try {
    const { execSync } = require('child_process');
    const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
    return status.length > 0;
  } catch {
    return true;
  }
}

function getPackageVersion(packageName) {
  try {
    const pkg = require(`${packageName}/package.json`);
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default ConcurrentZipWriter;

export {
  LOCK_TIMEOUT_MS,
};
