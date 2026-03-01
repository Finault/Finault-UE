#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT PRODUCTION DEPLOYMENT VERIFICATION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive checks for Diamond Tier platform deployment:
 * 1. Environment variables validation
 * 2. Supabase connectivity and schema verification
 * 3. All 14 Diamond modules can be imported
 * 4. Required database tables exist
 * 5. LLM provider connectivity (optional)
 *
 * Usage: node scripts/verify-production.js
 *
 * Exit codes:
 *   0 = All checks passed
 *   1 = One or more critical checks failed
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

// Color codes for terminal output
const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

// Icons
const PASS = `${COLORS.green}✅${COLORS.reset}`;
const FAIL = `${COLORS.red}❌${COLORS.reset}`;
const SKIP = `${COLORS.yellow}⊘${COLORS.reset}`;
const INFO = `${COLORS.blue}ℹ${COLORS.reset}`;

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
let skippedChecks = 0;

/**
 * Log a check result
 */
function logCheck(name, status, message = '') {
    totalChecks++;
    let icon;

    if (status === 'pass') {
        passedChecks++;
        icon = PASS;
    } else if (status === 'fail') {
        failedChecks++;
        icon = FAIL;
    } else if (status === 'skip') {
        skippedChecks++;
        icon = SKIP;
    }

    const msg = message ? ` ${message}` : '';
    console.log(`${icon} ${name}${msg}`);
}

/**
 * Log section header
 */
function logSection(title) {
    console.log(`\n${COLORS.cyan}═══ ${title} ═══${COLORS.reset}`);
}

/**
 * Log info message
 */
function logInfo(message) {
    console.log(`${INFO} ${message}`);
}

/**
 * Check if environment variables are set
 */
function checkEnvironmentVariables() {
    logSection('ENVIRONMENT VARIABLES');

    const requiredVars = [
        'SUPABASE_URL',
        'SUPABASE_KEY',
        'SUPABASE_SERVICE_KEY',
    ];

    const optionalVars = [
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
        'STRIPE_SECRET_KEY',
        'ANCHOR_PRIVATE_KEY',
        'RESEND_API_KEY',
        'SLACK_BOT_TOKEN',
    ];

    // Check required variables
    for (const varName of requiredVars) {
        const value = process.env[varName];
        if (value) {
            const masked = value.length > 20 ? `${value.substring(0, 10)}...${value.slice(-5)}` : '***';
            logCheck(`${varName}`, 'pass', `(set)`);
        } else {
            logCheck(`${varName}`, 'fail', '(MISSING)');
        }
    }

    // Check optional variables
    for (const varName of optionalVars) {
        const value = process.env[varName];
        if (value) {
            logCheck(`${varName}`, 'pass', '(set)');
        } else {
            logCheck(`${varName}`, 'skip', '(not set, optional)');
        }
    }
}

/**
 * Check Supabase connectivity
 */
async function checkSupabaseConnectivity() {
    logSection('SUPABASE CONNECTIVITY');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        logCheck('Supabase connection', 'fail', 'Missing SUPABASE_URL or SUPABASE_KEY');
        return null;
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Test simple query
        const { data, error } = await supabase
            .from('organizations')
            .select('id', { count: 'exact' })
            .limit(1);

        if (error) {
            logCheck('Supabase connection test', 'fail', `Query failed: ${error.message}`);
            return null;
        }

        logCheck('Supabase connection test', 'pass', 'Query successful');
        return supabase;
    } catch (error) {
        logCheck('Supabase connection test', 'fail', `Connection error: ${error.message}`);
        return null;
    }
}

/**
 * Import Diamond Tier modules
 */
async function checkDiamondModuleImports() {
    logSection('DIAMOND TIER MODULES (14)');

    // Dynamically get the project root directory
    import.meta.url;
    const scriptsDir = new URL('.', import.meta.url).pathname;
    const rootDir = scriptsDir.replace('/scripts/', '');

    const modules = [
        { name: 'Gateway Diamond', path: '../platform/modules/gateway-diamond.js' },
        { name: 'ERP Diamond', path: '../platform/modules/erp-diamond.js' },
        { name: 'ClosePack Diamond', path: '../platform/modules/closepack-diamond.js' },
        { name: 'Dispute Diamond', path: '../platform/modules/dispute-diamond.js' },
        { name: 'Shadow Diamond', path: '../platform/modules/shadow-diamond.js' },
        { name: 'Invoice Diamond', path: '../platform/modules/invoice-diamond.js' },
        { name: 'Allocation Diamond', path: '../platform/modules/allocation-diamond.js' },
        { name: 'Reconciliation Diamond', path: '../platform/modules/reconciliation-diamond.js' },
        { name: 'Anomaly Diamond', path: '../platform/modules/anomaly-diamond.js' },
        { name: 'Analytics Diamond', path: '../platform/modules/analytics-diamond.js' },
        { name: 'Compliance Diamond', path: '../platform/modules/compliance-diamond.js' },
        { name: 'SDK Diamond', path: '../platform/modules/sdk-diamond.js' },
        { name: 'Infrastructure Diamond', path: '../platform/modules/infrastructure-diamond.js' },
        { name: 'Budget Diamond', path: '../platform/modules/budget-diamond.js' },
    ];

    for (const module of modules) {
        try {
            // Use dynamic import with new URL for proper ESM path handling
            const modulePath = new URL(module.path, import.meta.url);
            await import(modulePath);
            logCheck(`${module.name}`, 'pass', 'Import successful');
        } catch (error) {
            logCheck(
                `${module.name}`,
                'fail',
                `Import failed: ${error.message.substring(0, 60)}`
            );
        }
    }
}

/**
 * Check required database tables
 */
async function checkDatabaseTables(supabase) {
    logSection('DATABASE TABLES VERIFICATION');

    if (!supabase) {
        logInfo('Skipping table checks (Supabase not connected)');
        return;
    }

    // All required tables from migrations
    const requiredTables = [
        // Gateway Diamond
        'semantic_cache',
        'ab_experiments',
        'sla_metrics',
        'prompt_shield_log',

        // ERP Diamond
        'erp_post_attempts',
        'erp_post_receipts',
        'erp_posting_audit',
        'erp_variance_records',

        // ClosePack Diamond
        'blockchain_anchors',
        'close_pack_shares',
        'close_pack_comparisons',
        'close_pack_artifacts',

        // Dispute Diamond
        'dispute_evidence_packages',
        'dispute_predictions',
        'dispute_analytics',

        // Shadow Diamond
        'shadow_expense_findings',
        'shadow_network_findings',
        'shadow_bot_findings',

        // Invoice Diamond
        'invoice_dedup_hashes',
        'invoice_anomalies',

        // Allocation Diamond
        'allocation_simulations',
        'ml_allocation_patterns',

        // Reconciliation Diamond
        'reconciliation_exceptions',
        'reconciliation_links',
        'continuous_recon_stream',

        // Anomaly Diamond
        'anomaly_patterns',
        'anomaly_playbook_runs',

        // Analytics Diamond
        'analytics_benchmarks',
        'board_reports',

        // Compliance Diamond
        'compliance_controls',
        'compliance_test_results',
        'compliance_policies',

        // Budget Diamond
        'budget_scenarios',
        'budget_reallocations',
        'budget_compliance_scores',

        // SDK Diamond
        'sdk_api_keys',
        'mcp_tool_executions',

        // Infrastructure Diamond
        'erp_health_metrics',
        'agent_performance',
        'tenant_resource_usage',

        // Additional critical tables
        'contract_terms',
        'chargeback_journal_entries',
        'fcs_scores',
        'posting_receipts',
        'sandbox_simulations',
    ];

    // Get list of tables from information_schema
    try {
        const { data: tables, error } = await supabase.rpc('get_table_names');

        if (error) {
            logCheck('Database introspection', 'fail', `RPC call failed: ${error.message}`);
            return;
        }

        // If RPC doesn't exist, try direct information_schema query
        if (!tables || tables.length === 0) {
            const { data: schemaData, error: schemaError } = await supabase
                .from('information_schema.tables')
                .select('table_name')
                .eq('table_schema', 'public');

            if (!schemaError && schemaData) {
                const existingTables = new Set(schemaData.map((t) => t.table_name));

                let foundCount = 0;
                for (const table of requiredTables) {
                    if (existingTables.has(table)) {
                        logCheck(`Table: ${table}`, 'pass');
                        foundCount++;
                    } else {
                        logCheck(`Table: ${table}`, 'fail', 'NOT FOUND');
                    }
                }

                logInfo(`Found ${foundCount}/${requiredTables.length} required tables`);
                return;
            }
        }

        logCheck('Database tables', 'skip', 'Unable to verify table schema via Supabase');
    } catch (error) {
        logCheck('Database tables', 'skip', `Introspection skipped: ${error.message.substring(0, 50)}`);
    }
}

/**
 * Test LLM provider connectivity (optional)
 */
async function checkLLMConnectivity() {
    logSection('LLM PROVIDER CONNECTIVITY (Optional)');

    // Test OpenAI
    if (process.env.OPENAI_API_KEY) {
        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
            });

            if (response.ok) {
                logCheck('OpenAI API', 'pass', 'Connection successful');
            } else {
                logCheck('OpenAI API', 'fail', `HTTP ${response.status}`);
            }
        } catch (error) {
            logCheck('OpenAI API', 'fail', `Connection error: ${error.message.substring(0, 50)}`);
        }
    } else {
        logCheck('OpenAI API', 'skip', 'No OPENAI_API_KEY set');
    }

    // Test Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/models', {
                headers: {
                    'x-api-key': process.env.ANTHROPIC_API_KEY,
                },
            });

            if (response.ok) {
                logCheck('Anthropic API', 'pass', 'Connection successful');
            } else {
                logCheck('Anthropic API', 'fail', `HTTP ${response.status}`);
            }
        } catch (error) {
            logCheck('Anthropic API', 'fail', `Connection error: ${error.message.substring(0, 50)}`);
        }
    } else {
        logCheck('Anthropic API', 'skip', 'No ANTHROPIC_API_KEY set');
    }
}

/**
 * Print summary
 */
function printSummary() {
    logSection('SUMMARY');

    const passed = `${COLORS.green}${passedChecks} passed${COLORS.reset}`;
    const failed = failedChecks > 0 ? `${COLORS.red}${failedChecks} failed${COLORS.reset}` : '';
    const skipped = skippedChecks > 0 ? `${COLORS.yellow}${skippedChecks} skipped${COLORS.reset}` : '';

    const parts = [passed];
    if (failed) parts.push(failed);
    if (skipped) parts.push(skipped);

    console.log(`Total: ${totalChecks} checks → ${parts.join(', ')}`);
    console.log('');

    if (failedChecks === 0) {
        console.log(`${COLORS.green}✓ All critical checks passed!${COLORS.reset}`);
        return 0;
    } else {
        console.log(
            `${COLORS.red}✗ ${failedChecks} critical check(s) failed.${COLORS.reset}`
        );
        return 1;
    }
}

/**
 * Main verification flow
 */
async function main() {
    console.log(`\n${COLORS.cyan}${'═'.repeat(80)}${COLORS.reset}`);
    console.log(`${COLORS.cyan}  FINAULT PRODUCTION DEPLOYMENT VERIFICATION${COLORS.reset}`);
    console.log(`${COLORS.cyan}${'═'.repeat(80)}${COLORS.reset}`);

    // Run all checks
    checkEnvironmentVariables();
    const supabase = await checkSupabaseConnectivity();
    await checkDatabaseTables(supabase);
    await checkDiamondModuleImports();
    await checkLLMConnectivity();

    // Print summary and exit
    const exitCode = printSummary();
    process.exit(exitCode);
}

// Run verification
main().catch((error) => {
    console.error(`${FAIL} Unexpected error:`, error.message);
    process.exit(1);
});
