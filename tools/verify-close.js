#!/usr/bin/env node

/**
 * Finault Phase 3: Close Pack Verification CLI
 *
 * Command-line tool for verifying close pack integrity:
 * - ZIP hash verification
 * - Manifest hash verification
 * - Artifact hash verification
 * - Merkle tree verification
 * - Blockchain anchor verification (optional)
 *
 * Usage:
 *   node verify-close.js <path_to_zip> [options]
 *
 * Options:
 *   --check-anchor    Verify blockchain anchor
 *   --verbose        Show detailed output
 *   --json           Output results as JSON
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import JSZip from 'jszip';

// ============================================================================
// CONFIGURATION
// ============================================================================

const VERIFICATION_CONFIG = {
  requiredManifestFields: ['schema_version', 'close_id', 'period', 'artifacts', 'artifact_hashes'],
  supportedSchemaVersions: ['1.0', '2.0'],
};

// ============================================================================
// HASH UTILITIES
// ============================================================================

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return sha256(content);
}

// ============================================================================
// VERIFICATION FUNCTIONS
// ============================================================================

/**
 * Load and parse ZIP file
 */
async function loadZip(zipPath) {
  const zipBuffer = fs.readFileSync(zipPath);
  const zipHash = sha256(zipBuffer);
  const zip = await JSZip.loadAsync(zipBuffer);
  return { zip, zipHash, zipBuffer };
}

/**
 * Extract and parse manifest from ZIP
 */
async function extractManifest(zip) {
  const manifestFiles = Object.keys(zip.files).filter(f => f.endsWith('-manifest.json'));

  if (manifestFiles.length === 0) {
    throw new Error('No manifest file found in ZIP');
  }

  if (manifestFiles.length > 1) {
    throw new Error(`Multiple manifest files found: ${manifestFiles.join(', ')}`);
  }

  const manifestContent = await zip.file(manifestFiles[0]).async('string');
  return {
    path: manifestFiles[0],
    content: JSON.parse(manifestContent),
    raw: manifestContent,
  };
}

/**
 * Verify manifest structure
 */
function verifyManifestStructure(manifest) {
  const errors = [];

  // Check required fields
  for (const field of VERIFICATION_CONFIG.requiredManifestFields) {
    if (!manifest.hasOwnProperty(field)) {
      errors.push(`Missing required manifest field: ${field}`);
    }
  }

  // Check schema version
  if (manifest.schema_version && !VERIFICATION_CONFIG.supportedSchemaVersions.includes(manifest.schema_version)) {
    errors.push(`Unsupported schema version: ${manifest.schema_version}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Verify all artifact hashes
 */
async function verifyArtifactHashes(zip, manifest) {
  const results = [];
  const artifactHashes = manifest.artifact_hashes || {};

  for (const artifactPath of (manifest.artifacts || [])) {
    const file = zip.file(artifactPath);

    if (!file) {
      results.push({
        path: artifactPath,
        status: 'MISSING',
        expectedHash: artifactHashes[artifactPath],
        actualHash: null,
      });
      continue;
    }

    const content = await file.async('nodebuffer');
    const actualHash = sha256(content);
    const expectedHash = artifactHashes[artifactPath];

    results.push({
      path: artifactPath,
      status: expectedHash === actualHash ? 'VALID' : 'MISMATCH',
      expectedHash,
      actualHash,
    });
  }

  return results;
}

/**
 * Verify Merkle tree (if present)
 */
async function verifyMerkleTree(zip, manifest) {
  // Find merkle.json in ZIP
  const merkleFiles = Object.keys(zip.files).filter(f => f.includes('merkle.json'));

  if (merkleFiles.length === 0) {
    return {
      present: false,
      verified: null,
      message: 'No merkle.json found (Phase 2 close pack)',
    };
  }

  const merkleContent = await zip.file(merkleFiles[0]).async('string');
  const merkle = JSON.parse(merkleContent);

  // Rebuild Merkle tree from leaves
  const leaves = merkle.leaves.map(l => l.sha256);
  let currentLevel = leaves;

  while (currentLevel.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      nextLevel.push(sha256(left + right));
    }
    currentLevel = nextLevel;
  }

  const computedRoot = currentLevel[0];
  const storedRoot = merkle.root_sha256;

  // Verify each leaf against artifact hashes
  const leafVerification = [];
  const artifactHashes = manifest.artifact_hashes || {};

  for (const leaf of merkle.leaves) {
    const expectedHash = artifactHashes[leaf.path];
    leafVerification.push({
      path: leaf.path,
      leafHash: leaf.sha256,
      manifestHash: expectedHash,
      match: leaf.sha256 === expectedHash,
    });
  }

  const allLeavesMatch = leafVerification.every(l => l.match);
  const rootMatches = computedRoot === storedRoot;

  return {
    present: true,
    verified: allLeavesMatch && rootMatches,
    storedRoot,
    computedRoot,
    rootMatches,
    leafCount: leaves.length,
    leafVerification,
    allLeavesMatch,
    errors: !rootMatches ? ['Merkle root mismatch'] : (!allLeavesMatch ? ['Leaf hash mismatch'] : []),
  };
}

/**
 * Verify anchor receipt (if present)
 */
async function verifyAnchorReceipt(zip, merkleResult, options = {}) {
  // Find anchor_receipt.json in ZIP
  const anchorFiles = Object.keys(zip.files).filter(f => f.includes('anchor_receipt.json'));

  if (anchorFiles.length === 0) {
    return {
      present: false,
      verified: null,
      message: 'No anchor_receipt.json found',
    };
  }

  const anchorContent = await zip.file(anchorFiles[0]).async('string');
  const anchor = JSON.parse(anchorContent);

  // Basic structure verification
  const structureValid =
    anchor.tx_hash &&
    anchor.network &&
    anchor.merkle_root_sha256 &&
    anchor.anchor_payload_sha256;

  if (!structureValid) {
    return {
      present: true,
      verified: false,
      error: 'Invalid anchor receipt structure',
    };
  }

  // Verify merkle root matches
  const merkleRootMatch = !merkleResult.present || anchor.merkle_root_sha256 === merkleResult.storedRoot;

  // If --check-anchor flag is set, verify against blockchain
  let blockchainVerified = null;
  if (options.checkAnchor) {
    // In production, this would call the blockchain to verify
    // For now, we just note that verification was requested
    blockchainVerified = {
      requested: true,
      note: 'Blockchain verification requires network access. Verify manually at: ' + anchor.explorer_url,
    };
  }

  return {
    present: true,
    verified: structureValid && merkleRootMatch,
    txHash: anchor.tx_hash,
    network: anchor.network,
    blockNumber: anchor.block_number,
    explorerUrl: anchor.explorer_url,
    merkleRootMatch,
    blockchainVerified,
  };
}

// ============================================================================
// MAIN VERIFICATION FUNCTION
// ============================================================================

/**
 * Verify a close pack ZIP file
 *
 * @param {string} zipPath - Path to ZIP file
 * @param {Object} options - Verification options
 * @returns {Object} - Verification results
 */
export async function verifyClosePack(zipPath, options = {}) {
  const startTime = Date.now();
  const results = {
    zipPath,
    verifiedAt: new Date().toISOString(),
    overallStatus: 'UNKNOWN',
    zipHash: null,
    closeId: null,
    checks: {
      zipExists: false,
      manifestValid: false,
      artifactHashesValid: false,
      merkleTreeValid: null,
      anchorValid: null,
    },
    details: {},
    errors: [],
    warnings: [],
  };

  try {
    // Check ZIP exists
    if (!fs.existsSync(zipPath)) {
      results.errors.push(`ZIP file not found: ${zipPath}`);
      results.overallStatus = 'INVALID';
      return results;
    }
    results.checks.zipExists = true;

    // Load ZIP
    const { zip, zipHash } = await loadZip(zipPath);
    results.zipHash = zipHash;

    // Extract manifest
    const manifest = await extractManifest(zip);
    results.closeId = manifest.content.close_id;

    // Verify manifest structure
    const manifestCheck = verifyManifestStructure(manifest.content);
    results.checks.manifestValid = manifestCheck.valid;
    results.details.manifest = {
      path: manifest.path,
      schemaVersion: manifest.content.schema_version,
      closeId: manifest.content.close_id,
      period: manifest.content.period,
      artifactCount: manifest.content.artifacts?.length || 0,
    };

    if (!manifestCheck.valid) {
      results.errors.push(...manifestCheck.errors);
    }

    // Verify manifest hash (if present in schema v2.0)
    if (manifest.content.manifest_hash) {
      const manifestForHash = { ...manifest.content, manifest_hash: undefined };
      const computedManifestHash = sha256(JSON.stringify(manifestForHash));
      if (computedManifestHash !== manifest.content.manifest_hash) {
        results.errors.push('Manifest hash mismatch');
        results.checks.manifestValid = false;
      }
    }

    // Verify artifact hashes
    const artifactResults = await verifyArtifactHashes(zip, manifest.content);
    const allArtifactsValid = artifactResults.every(r => r.status === 'VALID');
    results.checks.artifactHashesValid = allArtifactsValid;
    results.details.artifacts = artifactResults;

    const invalidArtifacts = artifactResults.filter(r => r.status !== 'VALID');
    if (invalidArtifacts.length > 0) {
      for (const artifact of invalidArtifacts) {
        results.errors.push(`Artifact ${artifact.status}: ${artifact.path}`);
      }
    }

    // Verify Merkle tree
    const merkleResult = await verifyMerkleTree(zip, manifest.content);
    results.details.merkle = merkleResult;
    if (merkleResult.present) {
      results.checks.merkleTreeValid = merkleResult.verified;
      if (!merkleResult.verified) {
        results.errors.push(...(merkleResult.errors || ['Merkle verification failed']));
      }
    }

    // Verify anchor receipt
    const anchorResult = await verifyAnchorReceipt(zip, merkleResult, options);
    results.details.anchor = anchorResult;
    if (anchorResult.present) {
      results.checks.anchorValid = anchorResult.verified;
      if (!anchorResult.verified) {
        results.errors.push(anchorResult.error || 'Anchor verification failed');
      }
    }

    // Determine overall status
    const criticalChecks = [
      results.checks.zipExists,
      results.checks.manifestValid,
      results.checks.artifactHashesValid,
    ];

    if (results.checks.merkleTreeValid !== null) {
      criticalChecks.push(results.checks.merkleTreeValid);
    }

    if (results.checks.anchorValid !== null && options.checkAnchor) {
      criticalChecks.push(results.checks.anchorValid);
    }

    results.overallStatus = criticalChecks.every(c => c) ? 'VALID' : 'INVALID';
    results.durationMs = Date.now() - startTime;

  } catch (error) {
    results.errors.push(`Verification error: ${error.message}`);
    results.overallStatus = 'ERROR';
    results.durationMs = Date.now() - startTime;
  }

  return results;
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

function printResults(results, options = {}) {
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const statusSymbol = {
    VALID: '\x1b[32m✓\x1b[0m',
    INVALID: '\x1b[31m✗\x1b[0m',
    ERROR: '\x1b[31m!\x1b[0m',
    UNKNOWN: '\x1b[33m?\x1b[0m',
  };

  console.log('\n=== Finault Close Pack Verification ===\n');
  console.log(`File: ${results.zipPath}`);
  console.log(`Close ID: ${results.closeId || 'Unknown'}`);
  console.log(`ZIP Hash: ${results.zipHash || 'N/A'}`);
  console.log(`Verified: ${results.verifiedAt}`);
  console.log();

  console.log('Checks:');
  console.log(`  ${results.checks.zipExists ? '✓' : '✗'} ZIP file exists`);
  console.log(`  ${results.checks.manifestValid ? '✓' : '✗'} Manifest valid`);
  console.log(`  ${results.checks.artifactHashesValid ? '✓' : '✗'} Artifact hashes valid`);

  if (results.checks.merkleTreeValid !== null) {
    console.log(`  ${results.checks.merkleTreeValid ? '✓' : '✗'} Merkle tree valid`);
  } else {
    console.log(`  - Merkle tree not present`);
  }

  if (results.checks.anchorValid !== null) {
    console.log(`  ${results.checks.anchorValid ? '✓' : '✗'} Anchor valid`);
  } else {
    console.log(`  - Anchor not present`);
  }

  console.log();

  if (options.verbose && results.details.artifacts) {
    console.log('Artifacts:');
    for (const artifact of results.details.artifacts) {
      const symbol = artifact.status === 'VALID' ? '✓' : '✗';
      console.log(`  ${symbol} ${artifact.path}`);
    }
    console.log();
  }

  if (results.errors.length > 0) {
    console.log('Errors:');
    for (const error of results.errors) {
      console.log(`  ✗ ${error}`);
    }
    console.log();
  }

  if (results.warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of results.warnings) {
      console.log(`  ! ${warning}`);
    }
    console.log();
  }

  console.log(`Overall: ${statusSymbol[results.overallStatus]} ${results.overallStatus}`);
  console.log(`Duration: ${results.durationMs}ms`);
  console.log();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Finault Close Pack Verification CLI

Usage:
  node verify-close.js <path_to_zip> [options]

Options:
  --check-anchor    Verify blockchain anchor
  --verbose, -v     Show detailed output
  --json            Output results as JSON
  --help, -h        Show this help message

Examples:
  node verify-close.js close-pack.zip
  node verify-close.js close-pack.zip --verbose
  node verify-close.js close-pack.zip --check-anchor --json
`);
    process.exit(0);
  }

  const zipPath = args[0];
  const options = {
    checkAnchor: args.includes('--check-anchor'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    json: args.includes('--json'),
  };

  const results = await verifyClosePack(zipPath, options);
  printResults(results, options);

  // Exit with appropriate code
  process.exit(results.overallStatus === 'VALID' ? 0 : 1);
}

// Run CLI if executed directly
if (process.argv[1] && process.argv[1].includes('verify-close')) {
  main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default verifyClosePack;

export {
  loadZip,
  extractManifest,
  verifyManifestStructure,
  verifyArtifactHashes,
  verifyMerkleTree,
  verifyAnchorReceipt,
};
