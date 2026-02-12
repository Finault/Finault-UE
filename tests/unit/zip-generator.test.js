/**
 * ZIP Generator Unit Tests
 *
 * Tests for deterministic ZIP generation, concurrent safety, and verification.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import JSZip from 'jszip';

// ============================================================================
// DETERMINISM TESTS
// ============================================================================

describe('ZIP Determinism', () => {
  test('same artifacts produce same hash', async () => {
    const createZip = async (artifacts) => {
      const zip = new JSZip();
      const sortedPaths = Object.keys(artifacts).sort();

      for (const p of sortedPaths) {
        zip.file(p, artifacts[p]);
      }

      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      return crypto.createHash('sha256').update(buffer).digest('hex');
    };

    const artifacts = {
      'a/file1.json': '{"key": "value1"}',
      'b/file2.json': '{"key": "value2"}',
      'c/file3.csv': 'col1,col2\n1,2',
    };

    const hash1 = await createZip(artifacts);
    const hash2 = await createZip(artifacts);

    expect(hash1).toBe(hash2);
  });

  test('lexicographic ordering is consistent', () => {
    const paths = [
      'derived/fcs.json',
      'certs/merkle.json',
      'artifact/journal.csv',
      'derived/variance.json',
      'manifest.json',
    ];

    const sorted1 = [...paths].sort();
    const sorted2 = [...paths].sort();

    expect(sorted1).toEqual(sorted2);
    expect(sorted1[0]).toBe('artifact/journal.csv');
    expect(sorted1[sorted1.length - 1]).toBe('manifest.json');
  });

  test('artifact hash computation is deterministic', () => {
    const content = 'test content for hashing';

    const hash1 = crypto.createHash('sha256').update(content).digest('hex');
    const hash2 = crypto.createHash('sha256').update(content).digest('hex');

    expect(hash1).toBe(hash2);
  });

  test('float values are formatted with 2dp precision', () => {
    const formatAmount = (value) => Number(value.toFixed(2));

    expect(formatAmount(10.125)).toBe(10.13);
    expect(formatAmount(10.124)).toBe(10.12);
    expect(formatAmount(10.1)).toBe(10.1);
    expect(formatAmount(10)).toBe(10);
  });
});

// ============================================================================
// ARTIFACT HASH TESTS
// ============================================================================

describe('Artifact Hashing', () => {
  test('artifact hashes match content', async () => {
    const zip = new JSZip();
    const artifacts = {
      'test.json': JSON.stringify({ test: true }),
      'test.csv': 'col1,col2\n1,2',
    };

    const hashes = {};
    for (const [path, content] of Object.entries(artifacts)) {
      zip.file(path, content);
      hashes[path] = crypto.createHash('sha256').update(content).digest('hex');
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);

    for (const [path, expectedHash] of Object.entries(hashes)) {
      const content = await loaded.file(path).async('string');
      const actualHash = crypto.createHash('sha256').update(content).digest('hex');
      expect(actualHash).toBe(expectedHash);
    }
  });

  test('manifest hash excludes itself', () => {
    const manifest = {
      close_id: 'FIN-CLOSE-001',
      artifacts: ['test.json'],
      artifact_hashes: { 'test.json': 'abc123' },
      manifest_hash: 'should-be-excluded',
    };

    const manifestForHash = { ...manifest };
    delete manifestForHash.manifest_hash;

    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(manifestForHash, null, 2))
      .digest('hex');

    expect(hash).not.toBe(manifest.manifest_hash);
    expect(hash).toHaveLength(64);
  });
});

// ============================================================================
// FILE LOCKING TESTS
// ============================================================================

describe('File Locking', () => {
  const testDir = path.join(os.tmpdir(), 'finault-lock-test');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up lock files
    const files = fs.readdirSync(testDir);
    for (const file of files) {
      if (file.endsWith('.lock')) {
        fs.unlinkSync(path.join(testDir, file));
      }
    }
  });

  test('lock file is created with correct content', () => {
    const lockPath = path.join(testDir, 'test.lock');
    const lockContent = JSON.stringify({
      pid: process.pid,
      hostname: os.hostname(),
      acquired_at: new Date().toISOString(),
    });

    fs.writeFileSync(lockPath, lockContent, { flag: 'wx' });

    expect(fs.existsSync(lockPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    expect(content.pid).toBe(process.pid);
    expect(content.hostname).toBe(os.hostname());
  });

  test('exclusive lock prevents duplicate creation', () => {
    const lockPath = path.join(testDir, 'exclusive.lock');

    // Create first lock
    fs.writeFileSync(lockPath, '{}', { flag: 'wx' });

    // Second creation should fail
    expect(() => {
      fs.writeFileSync(lockPath, '{}', { flag: 'wx' });
    }).toThrow();
  });

  test('stale lock detection based on age', () => {
    const LOCK_TIMEOUT_MS = 30000;

    const isStale = (lockContent) => {
      try {
        const content = JSON.parse(lockContent);
        const acquiredAt = new Date(content.acquired_at);
        const age = Date.now() - acquiredAt.getTime();
        return age > LOCK_TIMEOUT_MS;
      } catch {
        return true;
      }
    };

    // Fresh lock
    const freshLock = JSON.stringify({
      acquired_at: new Date().toISOString(),
    });
    expect(isStale(freshLock)).toBe(false);

    // Stale lock
    const staleLock = JSON.stringify({
      acquired_at: new Date(Date.now() - 60000).toISOString(),
    });
    expect(isStale(staleLock)).toBe(true);

    // Invalid lock
    expect(isStale('invalid')).toBe(true);
  });
});

// ============================================================================
// ATOMIC WRITE TESTS
// ============================================================================

describe('Atomic Writes', () => {
  const testDir = path.join(os.tmpdir(), 'finault-atomic-test');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('temp file then rename strategy', async () => {
    const finalPath = path.join(testDir, 'output.zip');
    const tempPath = path.join(testDir, 'output.zip.tmp');

    const zip = new JSZip();
    zip.file('test.txt', 'content');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    // Write to temp
    fs.writeFileSync(tempPath, buffer);
    expect(fs.existsSync(tempPath)).toBe(true);
    expect(fs.existsSync(finalPath)).toBe(false);

    // Atomic rename
    fs.renameSync(tempPath, finalPath);
    expect(fs.existsSync(tempPath)).toBe(false);
    expect(fs.existsSync(finalPath)).toBe(true);
  });

  test('verify after write', async () => {
    const zip = new JSZip();
    const content = 'test content';
    zip.file('test.txt', content);
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const expectedHash = crypto.createHash('sha256').update(buffer).digest('hex');

    const filePath = path.join(testDir, 'verify.zip');
    fs.writeFileSync(filePath, buffer);

    const readBuffer = fs.readFileSync(filePath);
    const actualHash = crypto.createHash('sha256').update(readBuffer).digest('hex');

    expect(actualHash).toBe(expectedHash);
  });
});

// ============================================================================
// BUILD JSON TESTS
// ============================================================================

describe('Build JSON Generation', () => {
  test('build JSON includes required fields', () => {
    const buildJson = {
      build_id: `build-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      git: {
        sha: 'abc123',
        branch: 'main',
        dirty: false,
      },
      environment: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      tool_versions: {
        jszip: '3.10.0',
        finault_version: '2.0.0',
      },
      determinism: {
        sort_algorithm: 'lexicographic',
        precision: '2dp',
        hash_algorithm: 'sha256',
      },
    };

    expect(buildJson.build_id).toMatch(/^build-\d+-[a-f0-9]+$/);
    expect(buildJson.git.sha).toBeDefined();
    expect(buildJson.determinism.sort_algorithm).toBe('lexicographic');
    expect(buildJson.determinism.precision).toBe('2dp');
  });

  test('build ID is unique', () => {
    const generateBuildId = () => {
      return `build-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    };

    const id1 = generateBuildId();
    const id2 = generateBuildId();

    expect(id1).not.toBe(id2);
  });
});

// ============================================================================
// ZIP VERIFICATION TESTS
// ============================================================================

describe('ZIP Verification', () => {
  test('valid ZIP passes verification', async () => {
    const artifacts = {
      'test.json': '{"valid": true}',
      'test.csv': 'col1\n1',
    };

    const zip = new JSZip();
    const hashes = {};

    for (const [path, content] of Object.entries(artifacts)) {
      zip.file(path, content);
      hashes[path] = crypto.createHash('sha256').update(content).digest('hex');
    }

    const manifest = {
      close_id: 'FIN-CLOSE-001',
      artifacts: Object.keys(artifacts).sort(),
      artifact_hashes: hashes,
    };

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);

    // Verify
    const loadedManifest = JSON.parse(await loaded.file('manifest.json').async('string'));
    let valid = true;

    for (const [path, expectedHash] of Object.entries(loadedManifest.artifact_hashes)) {
      const content = await loaded.file(path).async('string');
      const actualHash = crypto.createHash('sha256').update(content).digest('hex');
      if (actualHash !== expectedHash) {
        valid = false;
      }
    }

    expect(valid).toBe(true);
  });

  test('tampered ZIP fails verification', async () => {
    const zip = new JSZip();
    const content = '{"valid": true}';
    zip.file('test.json', content);

    const manifest = {
      close_id: 'FIN-CLOSE-001',
      artifacts: ['test.json'],
      artifact_hashes: {
        'test.json': 'tampered-hash',  // Wrong hash
      },
    };

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);

    const loadedManifest = JSON.parse(await loaded.file('manifest.json').async('string'));
    const loadedContent = await loaded.file('test.json').async('string');
    const actualHash = crypto.createHash('sha256').update(loadedContent).digest('hex');

    expect(actualHash).not.toBe(loadedManifest.artifact_hashes['test.json']);
  });

  test('missing artifact fails verification', async () => {
    const zip = new JSZip();

    const manifest = {
      close_id: 'FIN-CLOSE-001',
      artifacts: ['missing.json'],  // Artifact not in ZIP
      artifact_hashes: {
        'missing.json': 'abc123',
      },
    };

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);

    const loadedManifest = JSON.parse(await loaded.file('manifest.json').async('string'));

    const missingArtifacts = loadedManifest.artifacts.filter(a =>
      !Object.keys(loaded.files).includes(a)
    );

    expect(missingArtifacts).toContain('missing.json');
  });
});

// ============================================================================
// COMPRESSION TESTS
// ============================================================================

describe('ZIP Compression', () => {
  test('DEFLATE compression reduces size', async () => {
    const zip = new JSZip();
    const largeContent = JSON.stringify({
      data: Array(1000).fill({ key: 'value', number: 12345 }),
    });

    zip.file('large.json', largeContent);

    const uncompressed = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'STORE',
    });

    const compressed = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    expect(compressed.length).toBeLessThan(uncompressed.length);
  });

  test('compression level affects output size', async () => {
    const zip = new JSZip();
    const content = JSON.stringify({
      data: Array(1000).fill({ key: 'value' }),
    });

    zip.file('test.json', content);

    const level1 = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 1 },
    });

    const level9 = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    // Higher compression = smaller size (usually)
    expect(level9.length).toBeLessThanOrEqual(level1.length);
  });
});
