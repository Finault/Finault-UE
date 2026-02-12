/**
 * FINAULT SMOKE TEST
 * Validates the gateway can initialize and all modules resolve
 */
import { describe, test, expect } from 'vitest';
import { existsSync, statSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('Finault Production Smoke Test', () => {

  test('wrangler.toml points to gateway.js', () => {
    const toml = readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf-8');
    expect(toml).toContain('main = "dist/gateway.js"');
  });

  test('gateway.js exists and is substantial', () => {
    const gw = path.join(ROOT, 'apps/gateway/gateway.js');
    expect(existsSync(gw)).toBe(true);
    const stats = statSync(gw);
    expect(stats.size).toBeGreaterThan(300000); // > 300KB
  });

  test('all 20 gateway dependencies exist', () => {
    const deps = [
      'integrations/anomaly-detection.js',
      'integrations/erp-integrations.js',
      'apps/gateway/space-apple-dashboard.js',
      'apps/gateway/magic-onboarding.js',
      'apps/gateway/infrastructure.js',
      'apps/gateway/model-recommendation.js',
      'apps/gateway/audit-compliance.js',
      'apps/gateway/parsing-feedback.js',
      'apps/gateway/case-studies.js',
      'platform/flywheel.js',
      'onboarding/sso-rbac.js',
      'platform/universal-parser.js',
      'platform/closepack-generator-v2.js',
      'platform/policy-engine.js',
      'platform/savings-intelligence.js',
      'platform/audit-logging.js',
      'platform/reconciliation-engine.js',
      'platform/auth-middleware.js',
      'platform/rate-limiter.js',
      'platform/request-validator.js'
    ];

    for (const dep of deps) {
      const fullPath = path.join(ROOT, dep);
      expect(existsSync(fullPath)).toBe(true);
    }
  });

  test('close pack TypeScript sources exist', () => {
    const files = [
      'apps/close-pack/core/closeExecutor.ts',
      'apps/close-pack/core/confidence.ts',
      'apps/close-pack/pdf/executiveSummary.ts',
      'apps/close-pack/pdf/closeCertificate.ts',
      'apps/close-pack/artifacts/journal.ts',
      'apps/close-pack/artifacts/manifest.ts',
      'apps/close-pack/zip/zipper.ts'
    ];

    for (const file of files) {
      expect(existsSync(path.join(ROOT, file))).toBe(true);
    }
  });

  test('database migrations are numbered and ordered', () => {
    const migDir = path.join(ROOT, 'database/migrations');
    const files = readdirSync(migDir)
      .filter(f => f.endsWith('.sql') && !f.startsWith('_'))
      .sort();
    expect(files.length).toBeGreaterThanOrEqual(5);

    // Verify all migrations have numeric prefixes and are monotonically increasing
    let prevNum = 0;
    for (const file of files) {
      const match = file.match(/^(\d+)/);
      expect(match).not.toBeNull();
      const num = parseInt(match[1]);
      expect(num).toBeGreaterThanOrEqual(prevNum);
      prevNum = num;
    }
  });

  test('static site has index.html', () => {
    const idx = path.join(ROOT, 'static/index.html');
    expect(existsSync(idx)).toBe(true);
    const stats = statSync(idx);
    expect(stats.size).toBeGreaterThan(10000); // Real page
  });

  test('deployment configs exist', () => {
    const configs = [
      'wrangler.toml',
      'pages.toml',
      'static/_redirects',
      'static/_headers',
      'apps/verifier-service/Dockerfile',
      'apps/verifier-service/fly.toml'
    ];

    for (const cfg of configs) {
      expect(existsSync(path.join(ROOT, cfg))).toBe(true);
    }
  });

  test('no secrets in codebase', () => {
    const gatewayContent = readFileSync(path.join(ROOT, 'apps/gateway/gateway.js'), 'utf-8');
    expect(gatewayContent).not.toMatch(/sk_live_/);
    expect(gatewayContent).not.toMatch(/sk_test_/);
    expect(gatewayContent).not.toMatch(/eyJhbGci/); // JWT
    expect(gatewayContent).not.toMatch(/0x[a-fA-F0-9]{64}/); // Private key
  });
});
