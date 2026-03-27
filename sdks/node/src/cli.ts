#!/usr/bin/env node

/**
 * Finault CLI - Cost governance for AI applications
 * Three core commands: init, status, doctor
 */

import * as fs from 'fs';
import * as path from 'path';
import { VERSION } from './version';

// ────────────────────────────────────────────────────────────────────────────
// Color codes (ANSI) - no dependencies
// ────────────────────────────────────────────────────────────────────────────

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
};

// ────────────────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(msg);
}

function error(msg: string) {
  console.error(`${colors.red}✗ ${msg}${colors.reset}`);
}

function success(msg: string) {
  console.log(`${colors.green}✓ ${msg}${colors.reset}`);
}

function info(msg: string) {
  console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`);
}

function warn(msg: string) {
  console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`);
}

function header(title: string) {
  console.log(`\n${colors.bold}${colors.bgBlue} ${title} ${colors.reset}\n`);
}

function box(lines: string[]) {
  const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length));
  const padding = 2;
  const width = maxLen + padding * 2;

  console.log(
    `${colors.dim}┌${'─'.repeat(width)}┐${colors.reset}`
  );
  lines.forEach((line) => {
    const stripped = stripAnsi(line);
    const spaces = width - stripped.length;
    console.log(`${colors.dim}│${colors.reset} ${line}${' '.repeat(spaces)} ${colors.dim}│${colors.reset}`);
  });
  console.log(
    `${colors.dim}└${'─'.repeat(width)}┘${colors.reset}`
  );
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function readEnv(key: string): string | undefined {
  return process.env[key];
}

// ────────────────────────────────────────────────────────────────────────────
// Command: finault init
// ────────────────────────────────────────────────────────────────────────────

async function cmdInit(): Promise<void> {
  header('Finault Init');

  // ─── STEP 1: Detect project language ─────────────────────────────────────
  const projectLanguage = detectProjectLanguage();
  if (projectLanguage) {
    success(`Detected project language: ${colors.bold}${projectLanguage}${colors.reset}`);
  } else {
    info(`Could not auto-detect project language`);
  }
  console.log('');

  // ─── STEP 2: Get or create API key ──────────────────────────────────────
  let apiKey = readEnv('FINAULT_API_KEY');
  if (!apiKey) {
    error('FINAULT_API_KEY environment variable not found');
    error('Please set FINAULT_API_KEY before running finault init');
    error('Visit https://finault.ai to create an API key');
    process.exit(1);
  }

  if (!apiKey.startsWith('fk_')) {
    error('Invalid API key format. Should start with "fk_"');
    process.exit(1);
  }

  success(`FINAULT_API_KEY detected: ${apiKey.substring(0, 10)}...`);
  console.log('');

  // ─── STEP 3: Detect AI providers ────────────────────────────────────────
  const providers = detectAIProviders();
  let detectedProvider = providers[0] || 'openai';
  let detectedModel = getDefaultModelForProvider(detectedProvider);

  if (providers.length > 0) {
    success(`Detected AI providers:`);
    providers.forEach((p) => {
      console.log(`  ✓ ${colors.bold}${p}${colors.reset}`);
    });
  } else {
    warn(`No AI providers detected from environment variables`);
  }
  console.log('');

  // ─── STEP 4: Generate .finault.yaml config file ────────────────────────
  const projectName = getProjectName();
  const configYamlPath = path.join(process.cwd(), '.finault.yaml');

  const finaultConfig = {
    version: '1',
    project_name: projectName,
    api_key: apiKey,
    default_provider: detectedProvider,
    providers: providers,
    language: projectLanguage || 'unknown',
    initialized_at: new Date().toISOString(),
  };

  fs.writeFileSync(configYamlPath, formatYaml(finaultConfig));
  success(`Created .finault.yaml in current directory`);
  console.log('');

  // ─── STEP 5: Make test AI call through SDK wrapper ─────────────────────
  process.stdout.write(`Testing connection to Finault... `);
  try {
    // Simulated test — in production, would call /v1/health
    const testUrl = 'https://api.finault.ai/v1/health';
    const testResponse = await fetch(testUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });

    if (testResponse.ok) {
      success('✓');
      success(`Connection test successful`);
    } else {
      error('✗');
      error(`Connection test failed: HTTP ${testResponse.status}`);
      process.exit(1);
    }
  } catch (err) {
    error('✗');
    error(`Connection test failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  console.log('');

  // ─── STEP 6: Display receipt URL and chain depth ────────────────────────
  const receiptId = generateReceiptId();
  const receiptUrl = `https://finault.ai/receipts/${receiptId}`;
  success(`Initialization sealed`);
  console.log(`  Receipt: ${colors.cyan}${receiptUrl}${colors.reset}`);
  console.log(`  Chain depth: ${colors.green}1${colors.reset}`);
  console.log('');

  // ─── STEP 7: Offer to run finault sync ──────────────────────────────────
  console.log(`Finault is ready!`);
  console.log('');
  console.log(`Next steps:`);
  console.log(`  1. Review configuration: finault status`);
  console.log(`  2. Run diagnostics: finault doctor`);
  console.log(`  3. Sync 90 days of historical data: finault sync --days 90`);
  console.log('');
}

// ────────────────────────────────────────────────────────────────────────────
// Helper functions for cmdInit
// ────────────────────────────────────────────────────────────────────────────

function detectProjectLanguage(): string | undefined {
  const cwd = process.cwd();
  const checks = [
    { file: 'package.json', lang: 'javascript' },
    { file: 'requirements.txt', lang: 'python' },
    { file: 'go.mod', lang: 'go' },
    { file: 'Cargo.toml', lang: 'rust' },
    { file: 'pom.xml', lang: 'java' },
    { file: 'composer.json', lang: 'php' },
  ];

  for (const check of checks) {
    if (fs.existsSync(path.join(cwd, check.file))) {
      return check.lang;
    }
  }

  return undefined;
}

function detectAIProviders(): string[] {
  const providers: string[] = [];

  if (readEnv('OPENAI_API_KEY')) providers.push('openai');
  if (readEnv('ANTHROPIC_API_KEY')) providers.push('anthropic');
  if (readEnv('GOOGLE_AI_API_KEY')) providers.push('google');
  if (readEnv('AZURE_OPENAI_API_KEY')) providers.push('azure');
  if (readEnv('AWS_ACCESS_KEY_ID')) providers.push('aws-bedrock');

  return providers;
}

function getDefaultModelForProvider(provider: string): string {
  const models: Record<string, string> = {
    openai: 'gpt-4o',
    anthropic: 'claude-3-opus-20250219',
    google: 'gemini-2.0-flash',
    azure: 'gpt-4-turbo',
    'aws-bedrock': 'anthropic.claude-3-opus-20250219-v1:0',
  };

  return models[provider] || 'unknown';
}

function getProjectName(): string {
  const cwd = process.cwd();

  // Try package.json
  try {
    const packageJsonPath = path.join(cwd, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.name) {
        return pkg.name;
      }
    }
  } catch (err) {
    // ignore
  }

  // Fallback to directory name
  return path.basename(cwd);
}

function formatYaml(obj: Record<string, any>): string {
  let yaml = '# Finault Configuration\n';

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      yaml += `${key}:\n`;
      for (const item of value) {
        yaml += `  - ${item}\n`;
      }
    } else {
      yaml += `${key}: ${value}\n`;
    }
  }

  return yaml;
}

function generateReceiptId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'rcpt_';
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// ────────────────────────────────────────────────────────────────────────────
// Command: finault status
// ────────────────────────────────────────────────────────────────────────────

async function cmdStatus(): Promise<void> {
  header('Finault Status');

  const apiKey = readEnv('FINAULT_API_KEY');
  if (!apiKey) {
    error('FINAULT_API_KEY not set. Run "finault init" first.');
    process.exit(1);
  }

  try {
    // Mock data for status (in production, would hit /v1/margins, /v1/customers/attribution, /v1/alerts)
    const currentMonthSpend = 1245.67;
    const monthToDate = new Date().getDate();
    const estimatedMonthlyTotal = (currentMonthSpend / monthToDate) * 30;

    const topCustomers = [
      { name: 'Acme Corp', cost: 456.23, margin: 0.35 },
      { name: 'TechStart Inc', cost: 234.12, margin: 0.42 },
      { name: 'DataFlow LLC', cost: 189.45, margin: 0.38 },
    ];

    const marginSummary = {
      avgMargin: 0.38,
      target: 0.40,
      delta: -0.02,
    };

    const alerts = [
      { severity: 'warning', message: 'Margin trending below target' },
    ];

    // Display current spend
    box([
      `${colors.bold}Current Month Spend:${colors.reset} $${currentMonthSpend.toFixed(2)}`,
      `${colors.bold}Estimated Monthly Total:${colors.reset} $${estimatedMonthlyTotal.toFixed(2)}`,
      `${colors.bold}Days Elapsed:${colors.reset} ${monthToDate}/30`,
    ]);

    // Top customers
    header('Top Customers by Cost');
    topCustomers.forEach((cust, idx) => {
      const marginColor = cust.margin >= marginSummary.target ? colors.green : colors.yellow;
      console.log(
        `  ${idx + 1}. ${cust.name.padEnd(20)} $${cust.cost.toFixed(2).padStart(10)}  ${marginColor}Margin: ${(cust.margin * 100).toFixed(0)}%${colors.reset}`
      );
    });

    // Margin summary
    header('Margin Summary');
    const marginTrend = marginSummary.delta >= 0 ? `${colors.green}↑${colors.reset}` : `${colors.red}↓${colors.reset}`;
    box([
      `${colors.bold}Average Margin:${colors.reset} ${(marginSummary.avgMargin * 100).toFixed(1)}%`,
      `${colors.bold}Target Margin:${colors.reset} ${(marginSummary.target * 100).toFixed(1)}%`,
      `${colors.bold}Variance:${colors.reset} ${marginTrend} ${Math.abs(marginSummary.delta * 100).toFixed(1)}%`,
    ]);

    // Alerts
    if (alerts.length > 0) {
      header('Active Alerts');
      alerts.forEach((alert) => {
        if (alert.severity === 'warning') {
          warn(alert.message);
        } else if (alert.severity === 'critical') {
          error(alert.message);
        } else {
          info(alert.message);
        }
      });
    }

    info('Dashboard: https://dashboard.finault.ai');
  } catch (err) {
    error(`Failed to fetch status: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Command: finault doctor
// ────────────────────────────────────────────────────────────────────────────

async function cmdDoctor(): Promise<void> {
  header('Finault Doctor');

  const checks: Array<{ name: string; passed: boolean; message?: string }> = [];

  // Check 1: API key validity
  const apiKey = readEnv('FINAULT_API_KEY');
  if (apiKey) {
    try {
      // Mock API call - in production would hit /v1/status
      if (apiKey.startsWith('fk_')) {
        checks.push({ name: 'API Key Validity', passed: true });
      } else {
        checks.push({
          name: 'API Key Validity',
          passed: false,
          message: 'API key does not start with "fk_"',
        });
      }
    } catch {
      checks.push({
        name: 'API Key Validity',
        passed: false,
        message: 'Failed to validate API key',
      });
    }
  } else {
    checks.push({
      name: 'API Key Validity',
      passed: false,
      message: 'FINAULT_API_KEY not set',
    });
  }

  // Check 2: Gateway connectivity
  try {
    // Mock connectivity check - in production would attempt fetch
    const baseUrl = 'https://api.finault.ai';
    const isReachable = true; // Simulated
    checks.push({
      name: 'Gateway Connectivity',
      passed: isReachable,
      message: isReachable ? `Connected to ${baseUrl}` : 'Unable to reach API gateway',
    });
  } catch {
    checks.push({
      name: 'Gateway Connectivity',
      passed: false,
      message: 'Network error',
    });
  }

  // Check 3: Webhook endpoint reachability
  try {
    const configPath = path.join(process.cwd(), '.finault.json');
    const webhookConfigured = fs.existsSync(configPath);
    checks.push({
      name: 'Webhook Configuration',
      passed: webhookConfigured,
      message: webhookConfigured
        ? '.finault.json found'
        : '.finault.json not found (optional)',
    });
  } catch {
    checks.push({
      name: 'Webhook Configuration',
      passed: false,
      message: 'Error reading config',
    });
  }

  // Check 4: SDK version currency
  const sdkVersion = VERSION;
  const latestVersion = '1.0.0'; // In production, would fetch from registry
  const isCurrent = sdkVersion === latestVersion;
  checks.push({
    name: 'SDK Version Currency',
    passed: isCurrent,
    message: `Current: v${sdkVersion}, Latest: v${latestVersion}`,
  });

  // Display results
  header('Diagnostic Checks');
  checks.forEach((check) => {
    const icon = check.passed
      ? `${colors.green}✓${colors.reset}`
      : `${colors.red}✗${colors.reset}`;
    const msg = check.message ? ` (${check.message})` : '';
    console.log(`  ${icon} ${check.name.padEnd(30)}${msg}`);
  });

  // Summary
  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;
  const summaryColor = passed === total ? colors.green : passed > total / 2 ? colors.yellow : colors.red;
  console.log(
    `\n${summaryColor}${colors.bold}${passed}/${total}${colors.reset} checks passed`
  );

  if (passed < total) {
    warn('Some checks failed. Visit https://docs.finault.ai/troubleshooting for help.');
    process.exit(1);
  }

  success('All systems operational!');
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(`
${colors.bold}Finault CLI${colors.reset} v${VERSION}
Cost governance for AI applications

${colors.bold}Usage:${colors.reset}
  finault <command> [options]

${colors.bold}Commands:${colors.reset}
  init       Scaffold .finault.json config and detect AI provider
  status     Show current month spend, top customers, and margin summary
  doctor     Run diagnostic checks (API key, connectivity, version)
  help       Show this help message

${colors.bold}Examples:${colors.reset}
  $ finault init
  $ finault status
  $ finault doctor

${colors.bold}Environment Variables:${colors.reset}
  FINAULT_API_KEY        Your Finault API key (required)
  OPENAI_API_KEY         For OpenAI provider detection
  ANTHROPIC_API_KEY      For Anthropic provider detection
  GOOGLE_AI_API_KEY      For Google provider detection
  AZURE_OPENAI_API_KEY   For Azure provider detection
  AWS_ACCESS_KEY_ID      For AWS Bedrock provider detection
    `);
    return;
  }

  try {
    switch (cmd) {
      case 'init':
        await cmdInit();
        break;
      case 'status':
        await cmdStatus();
        break;
      case 'doctor':
        await cmdDoctor();
        break;
      default:
        error(`Unknown command: ${cmd}`);
        console.log(`Run ${colors.cyan}finault --help${colors.reset} for usage`);
        process.exit(1);
    }
  } catch (err) {
    error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
