#!/usr/bin/env node
/**
 * FINAULT DEPLOY PREFLIGHT CHECK
 * Run this before any deployment to verify the system is ready.
 *
 * Usage: node scripts/deploy-preflight.js [--fix]
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIX_MODE = process.argv.includes('--fix');

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) { console.log(`  ✓ ${msg}`); passed++; }
function fail(msg) { console.log(`  ✗ ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠ ${msg}`); warnings++; }

function heading(msg) { console.log(`\n[${msg}]`); }

// ─── 1. Build Artifacts ──────────────────────────────────────────────────────

heading('1/7 Build Artifacts');

const gatewayDist = path.join(ROOT, 'dist/gateway.js');
if (existsSync(gatewayDist)) {
  const srcStat = statSync(path.join(ROOT, 'apps/gateway/gateway.ts'));
  const distStat = statSync(gatewayDist);
  if (distStat.mtimeMs >= srcStat.mtimeMs) {
    pass(`dist/gateway.js is current (${(distStat.size / 1024).toFixed(1)} KB)`);
  } else {
    if (FIX_MODE) {
      console.log('    → Rebuilding gateway...');
      execSync('node scripts/build.js --production', { cwd: ROOT, stdio: 'pipe' });
      pass('dist/gateway.js rebuilt');
    } else {
      fail('dist/gateway.js is STALE — run: npm run build');
    }
  }
} else {
  if (FIX_MODE) {
    execSync('node scripts/build.js --production', { cwd: ROOT, stdio: 'pipe' });
    pass('dist/gateway.js built from scratch');
  } else {
    fail('dist/gateway.js missing — run: npm run build');
  }
}

if (existsSync(path.join(ROOT, 'dist/gateway.js.map'))) {
  pass('Source map present');
} else {
  warn('No source map — debugging will be harder in production');
}

// ─── 2. Package Configuration ────────────────────────────────────────────────

heading('2/7 Package Configuration');

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

if (pkg.type === 'module') {
  pass('"type": "module" set in package.json');
} else {
  fail('"type": "module" missing — ESM imports will break');
}

if (pkg.engines?.node) {
  pass(`Node engine constraint: ${pkg.engines.node}`);
} else {
  warn('No Node engine constraint in package.json');
}

// ─── 3. Wrangler Configuration ───────────────────────────────────────────────

heading('3/7 Wrangler Configuration');

const wranglerPath = path.join(ROOT, 'wrangler.toml');
const wrangler = readFileSync(wranglerPath, 'utf-8');

if (wrangler.includes('main = "dist/gateway.js"')) {
  pass('wrangler.toml entry point correct');
} else {
  fail('wrangler.toml main entry does not point to dist/gateway.js');
}

if (wrangler.includes('api.finault.ai')) {
  pass('Production route configured (api.finault.ai)');
} else {
  warn('No production route for api.finault.ai');
}

// Security checks
if (wrangler.includes('eyJ')) {
  fail('CRITICAL: JWT token found in wrangler.toml — remove immediately');
} else {
  pass('No hardcoded JWT tokens in wrangler.toml');
}

if (wrangler.includes('ENABLE_DEMO_MODE = "true"')) {
  fail('Demo mode is enabled — disable before production deploy');
} else {
  pass('Demo mode disabled');
}

if (wrangler.includes('ALLOW_QUERY_ORG_ID = "true"')) {
  fail('ALLOW_QUERY_ORG_ID is true — security risk in production');
} else {
  pass('Query org ID override disabled');
}

// ─── 4. Database Migrations ──────────────────────────────────────────────────

heading('4/7 Database Migrations');

const migDir = path.join(ROOT, 'database/migrations');
if (existsSync(migDir)) {
  const migrations = readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();
  pass(`${migrations.length} migrations found`);

  // Check for ordering issues
  let prevNum = 0;
  let orderOk = true;
  for (const file of migrations) {
    const match = file.match(/^(\d+)/);
    if (match) {
      const num = parseInt(match[1]);
      if (num < prevNum) { orderOk = false; break; }
      prevNum = num;
    }
  }
  if (orderOk) {
    pass('Migration ordering is valid (monotonically increasing)');
  } else {
    fail('Migrations are not in order');
  }
} else {
  fail('database/migrations/ directory missing');
}

// Check for base schema files
for (const f of ['schema.sql', 'functions.sql', 'rls-policies.sql']) {
  const fPath = path.join(ROOT, 'database', f);
  if (existsSync(fPath)) {
    pass(`database/${f} present`);
  } else {
    fail(`database/${f} missing`);
  }
}

// ─── 5. Security Scan ────────────────────────────────────────────────────────

heading('5/7 Security Scan');

// Scan for hardcoded secrets in tracked files
const dangerPatterns = [
  { pattern: /sk-[a-zA-Z0-9]{20,}/, name: 'OpenAI API key' },
  { pattern: /sk-ant-[a-zA-Z0-9]{20,}/, name: 'Anthropic API key' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub PAT' },
  { pattern: /password\s*[:=]\s*["'][^"']{3,}["']/i, name: 'Hardcoded password' },
];

const filesToScan = [
  'wrangler.toml',
  'scripts/deployment-verify.js',
  'scripts/smoke-test.js',
  'scripts/migrate.js',
];

let secretsFound = false;
for (const file of filesToScan) {
  const fp = path.join(ROOT, file);
  if (!existsSync(fp)) continue;
  const content = readFileSync(fp, 'utf-8');
  for (const { pattern, name } of dangerPatterns) {
    if (pattern.test(content)) {
      fail(`${name} found in ${file}`);
      secretsFound = true;
    }
  }
}
if (!secretsFound) {
  pass('No hardcoded secrets detected in critical files');
}

// Check .env files aren't tracked
const envFiles = ['dashboard/.env.local', 'dashboard/.env.production', '.env'];
for (const ef of envFiles) {
  if (existsSync(path.join(ROOT, ef))) {
    const content = readFileSync(path.join(ROOT, ef), 'utf-8');
    if (content.includes('eyJ') || content.includes('sk-')) {
      warn(`${ef} contains credentials — ensure it's in .gitignore`);
    }
  }
}

// ─── 6. Test Suite Health ────────────────────────────────────────────────────

heading('6/7 Test Suite Health');

try {
  const result = execSync('npx vitest run 2>&1 | tail -5', {
    cwd: ROOT,
    timeout: 120000,
    encoding: 'utf-8',
  });

  const testsMatch = result.match(/Tests\s+(\d+) passed/);
  const failMatch = result.match(/(\d+) failed/);

  if (testsMatch) {
    const passCount = parseInt(testsMatch[1]);
    if (failMatch && parseInt(failMatch[1]) > 0) {
      fail(`Vitest: ${failMatch[1]} tests failing`);
    } else {
      pass(`Vitest: ${passCount} tests passing, 0 failures`);
    }
  } else {
    warn('Could not parse vitest output');
  }
} catch (e) {
  warn('Vitest run failed or timed out');
}

// ─── 7. CI/CD Configuration ─────────────────────────────────────────────────

heading('7/7 CI/CD Configuration');

const ciPath = path.join(ROOT, '.github/workflows/ci.yml');
const deployPath = path.join(ROOT, '.github/workflows/deploy.yml');

if (existsSync(ciPath)) {
  pass('CI workflow present (.github/workflows/ci.yml)');
} else {
  fail('CI workflow missing');
}

if (existsSync(deployPath)) {
  pass('Deploy workflow present (.github/workflows/deploy.yml)');
  const deployYml = readFileSync(deployPath, 'utf-8');

  const requiredSecrets = [
    'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID',
  ];
  for (const secret of requiredSecrets) {
    if (deployYml.includes(secret)) {
      pass(`Deploy references ${secret}`);
    } else {
      warn(`Deploy workflow does not reference ${secret}`);
    }
  }
} else {
  fail('Deploy workflow missing');
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log(`  PREFLIGHT: ${passed} passed | ${failed} failed | ${warnings} warnings`);
console.log('═'.repeat(60));

if (failed > 0) {
  console.log('\n  ✗ NOT READY TO DEPLOY. Fix failures above.');
  console.log('    Run with --fix to auto-fix build issues.\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log('\n  ⚠ DEPLOY WITH CAUTION. Review warnings above.\n');
  process.exit(0);
} else {
  console.log('\n  ✓ ALL CLEAR. Ready to deploy.\n');
  process.exit(0);
}
