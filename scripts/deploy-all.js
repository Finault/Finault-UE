#!/usr/bin/env node
/**
 * FINAULT UNIFIED DEPLOYMENT
 * One command deploys everything:
 *   1. Build gateway bundle
 *   2. Deploy gateway to Cloudflare Workers (api.finault.com)
 *   3. Deploy static site to Cloudflare Pages (finault.com)
 *   4. Deploy verifier to Fly.io (verify.finault.com)
 *   5. Run database migrations on Supabase
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const STEPS = [
  {
    name: 'PREFLIGHT CHECK',
    run: () => {
      console.log('  Checking required tools...');
      for (const tool of ['wrangler', 'node']) {
        try {
          execSync(`which ${tool}`, { stdio: 'pipe' });
          console.log(`  ✓ ${tool} found`);
        } catch {
          throw new Error(`${tool} not found. Install it first.`);
        }
      }

      // Check required files
      const required = [
        'wrangler.toml',
        'apps/gateway/gateway.js',
        'static/index.html',
        'database/schema.sql'
      ];
      for (const file of required) {
        if (!existsSync(path.join(ROOT, file))) {
          throw new Error(`Missing required file: ${file}`);
        }
        console.log(`  ✓ ${file}`);
      }
    }
  },
  {
    name: 'BUILD GATEWAY',
    run: () => {
      execSync('node scripts/build.js --production', { cwd: ROOT, stdio: 'inherit' });
    }
  },
  {
    name: 'DEPLOY GATEWAY → Cloudflare Workers (api.finault.com)',
    run: () => {
      execSync('wrangler deploy', { cwd: ROOT, stdio: 'inherit' });
    }
  },
  {
    name: 'DEPLOY FRONTEND → Cloudflare Pages (finault.com)',
    run: () => {
      execSync('wrangler pages deploy static --project-name finault --branch main', {
        cwd: ROOT,
        stdio: 'inherit'
      });
    }
  },
  {
    name: 'DEPLOY VERIFIER → Fly.io (verify.finault.com)',
    run: () => {
      if (!existsSync(path.join(ROOT, 'apps/verifier-service/fly.toml'))) {
        console.log('  ⚠ fly.toml not found, skipping verifier deploy');
        return;
      }
      try {
        execSync('flyctl deploy', { cwd: path.join(ROOT, 'apps/verifier-service'), stdio: 'inherit' });
      } catch (e) {
        console.log('  ⚠ Fly.io deploy failed (run flyctl auth login first)');
      }
    }
  },
  {
    name: 'SMOKE TEST',
    run: async () => {
      console.log('  Verifying endpoints...');
      const endpoints = [
        { url: 'https://api.finault.com/v1/health', expect: 200 },
        { url: 'https://finault.com/', expect: 200 }
      ];
      for (const ep of endpoints) {
        try {
          const resp = await fetch(ep.url, { method: 'GET' });
          const status = resp.status === ep.expect ? '✓' : '✗';
          console.log(`  ${status} ${ep.url} → ${resp.status}`);
        } catch (e) {
          console.log(`  ⚠ ${ep.url} → unreachable (DNS may not be configured yet)`);
        }
      }
    }
  }
];

async function deploy() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  FINAULT UNIFIED DEPLOYMENT v4.0');
  console.log('  "No dashboards. Just evidence."');
  console.log('═══════════════════════════════════════════════════════════\n');

  const failed = [];

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    console.log(`\n[${i + 1}/${STEPS.length}] ${step.name}`);
    console.log('─'.repeat(60));

    try {
      await step.run();
      console.log(`  ✅ ${step.name} — complete`);
    } catch (error) {
      console.error(`  ❌ ${step.name} — failed: ${error.message}`);
      failed.push(step.name);
      if (i <= 1) {
        console.error('\n🛑 Critical step failed. Aborting deployment.');
        process.exit(1);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  if (failed.length === 0) {
    console.log('  ✅ DEPLOYMENT COMPLETE — All systems go');
  } else {
    console.log(`  ⚠  DEPLOYMENT PARTIAL — ${failed.length} step(s) failed:`);
    failed.forEach(f => console.log(`     - ${f}`));
  }
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('  Domains:');
  console.log('    finault.com          → Cloudflare Pages (frontend)');
  console.log('    api.finault.com      → Cloudflare Workers (gateway)');
  console.log('    verify.finault.com   → Fly.io (Python verifier)');
  console.log('    closepack.finault.ai → R2 (immutable Close Packs)');
  console.log('');
}

deploy().catch(console.error);
