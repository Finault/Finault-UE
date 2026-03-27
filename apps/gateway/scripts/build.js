#!/usr/bin/env node

/**
 * Finault Gateway Build Script
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Bundles src/index.js and all imports into a single gateway-wired.js file
 * using esbuild for Cloudflare Workers.
 *
 * Usage: node scripts/build.js
 * Output: gateway-wired.js (overwritten)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const GATEWAY_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(GATEWAY_DIR, 'src');
const ENTRY_FILE = path.join(SRC_DIR, 'index.js');
const OUTPUT_FILE = path.join(GATEWAY_DIR, 'gateway-wired.js');

const ESBUILD_CONFIG = {
  entryPoints: [ENTRY_FILE],
  outfile: OUTPUT_FILE,
  bundle: true,
  format: 'es',
  target: 'es2022',
  platform: 'node',
  minify: true,
  sourcemap: false,
  external: ['node-fetch'], // node-fetch provided by CF Workers runtime with nodejs_compat
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  banner: {
    js: `/**
 * FINAULT GATEWAY v4.1.0 - AUTO-GENERATED DEPLOYMENT ARTIFACT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This file is auto-generated from src/ modules and should NOT be edited directly.
 * To modify the gateway, edit the source files in src/ and run the build script:
 *
 *   npm run build
 *
 * Source structure:
 *   src/index.js          - Main entry point
 *   src/config.js         - Configuration & constants
 *   src/auth.js           - Authentication middleware
 *   src/router.js         - Route dispatch
 *   src/proxy.js          - LLM provider proxying
 *   src/utils.js          - Shared utilities
 *   src/security.js       - Security utilities (CORS, PII redaction, etc)
 *   src/handlers/         - Request handlers for each feature
 *
 * Generated: ${new Date().toISOString()}
 * ═══════════════════════════════════════════════════════════════════════════════
 */\n`
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get human-readable file size
 */
const formatBytes = (bytes) => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

/**
 * Count modules in bundle (by counting import statements)
 */
const countModules = (code) => {
  const matches = code.match(/^import|^export|^const \w+ = require/gm);
  return matches ? matches.length : 0;
};

/**
 * Verify build output
 */
const verifyBuild = () => {
  if (!fs.existsSync(OUTPUT_FILE)) {
    throw new Error(`Build failed: output file not created at ${OUTPUT_FILE}`);
  }

  const stats = fs.statSync(OUTPUT_FILE);
  const content = fs.readFileSync(OUTPUT_FILE, 'utf-8');

  if (content.length === 0) {
    throw new Error('Build failed: output file is empty');
  }

  // Check for expected exports
  if (!content.includes('export default')) {
    throw new Error('Build failed: missing default export');
  }

  return { size: stats.size, content };
};

/**
 * Run esbuild
 */
const runEsBuild = () => {
  try {
    // Check if esbuild is installed
    try {
      execSync('npx esbuild --version', { stdio: 'pipe' });
    } catch {
      console.error('esbuild not found. Installing...');
      execSync('npm install --save-dev esbuild', { stdio: 'inherit' });
    }

    // Build config as JSON
    const configJson = JSON.stringify(ESBUILD_CONFIG, null, 2);
    const configFile = path.join(GATEWAY_DIR, '.esbuild-config.json');

    fs.writeFileSync(configFile, configJson);

    console.log('[BUILD] Running esbuild...');
    const command = `npx esbuild --bundle ${ENTRY_FILE} --outfile ${OUTPUT_FILE} --format=es --target=es2022 --minify --external:node-fetch`;
    execSync(command, { stdio: 'inherit', cwd: GATEWAY_DIR });

    // Clean up config file
    fs.unlinkSync(configFile);

  } catch (error) {
    throw new Error(`esbuild failed: ${error.message}`);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN BUILD PROCESS
// ═══════════════════════════════════════════════════════════════════════════════

const main = async () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('Finault Gateway Build');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  // Verify source files exist
  console.log('[BUILD] Verifying source files...');
  if (!fs.existsSync(ENTRY_FILE)) {
    console.error(`ERROR: Entry file not found: ${ENTRY_FILE}`);
    process.exit(1);
  }

  const srcFiles = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.js'));
  console.log(`  ✓ Found ${srcFiles.length} source modules`);

  // Run esbuild
  try {
    runEsBuild();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }

  // Verify output
  let buildStats;
  try {
    buildStats = verifyBuild();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }

  // Run syntax check
  console.log('[BUILD] Running syntax check...');
  try {
    execSync(`node --check ${OUTPUT_FILE}`, { stdio: 'pipe' });
    console.log('  ✓ Syntax valid');
  } catch (error) {
    console.error(`ERROR: Syntax check failed`);
    console.error(error.message);
    process.exit(1);
  }

  // Print summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('Build Summary');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Output file:       ${OUTPUT_FILE}`);
  console.log(`Bundle size:       ${formatBytes(buildStats.size)}`);
  console.log(`Gzipped size:      ~${formatBytes(buildStats.size * 0.3)} (estimated)`);
  console.log(`Source modules:    ${srcFiles.length}`);
  console.log(`Build time:        ${new Date().toLocaleTimeString()}`);
  console.log('');
  console.log('✓ Build completed successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Run tests:   npm run test');
  console.log('  2. Deploy:      npx wrangler deploy');
  console.log('');
};

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING & EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

main().catch(error => {
  console.error('');
  console.error('Build failed:');
  console.error(error);
  console.error('');
  process.exit(1);
});
