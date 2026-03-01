#!/usr/bin/env node

/**
 * Finault CLI
 *
 * Standalone Node.js CLI tool for managing Finault costs and analytics.
 * No external dependencies — uses built-in https module.
 *
 * Usage:
 *   finault costs --customer acme --last 7d
 *   finault margin --feature chat --trend
 *   finault simulate --model gpt-4o-mini --feature summarization
 *   finault health
 *   finault trajectory --customer acme
 *   finault status
 *   finault --help
 */

const https = require('https');
const fs = require('fs');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// Configuration
const apiKey = process.env.FINAULT_API_KEY;
const baseUrl = process.env.FINAULT_BASE_URL || 'https://api.finault.ai';

/**
 * HTTP request helper
 */
function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Finault-CLI/1.0',
        ...headers,
      },
    };

    const request = https.request(options, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        if (response.statusCode >= 400) {
          reject(new Error(`API error (${response.statusCode}): ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON response`));
        }
      });
    });

    request.on('error', reject);
    request.end();
  });
}

/**
 * Color helper
 */
function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Status indicator
 */
function getStatusIndicator(value, thresholds = { critical: 80, warning: 50 }) {
  if (value >= thresholds.critical) {
    return colorize('●', 'red');
  } else if (value >= thresholds.warning) {
    return colorize('●', 'yellow');
  }
  return colorize('●', 'green');
}

/**
 * Print help
 */
function printHelp(command = null) {
  if (!command) {
    console.log(`
${colorize('Finault CLI', 'bold')} — AI Cost & Analytics Management

${colorize('USAGE:', 'bold')}
  finault <command> [options]

${colorize('COMMANDS:', 'bold')}
  costs       Cost breakdown by feature/customer
  margin      Margin analysis and trends
  simulate    Model switch impact simulation
  health      Customer health overview
  trajectory  Cost trajectory prediction
  status      Connection status and quick stats
  help        Show this help message

${colorize('GLOBAL OPTIONS:', 'bold')}
  --help      Show help for a specific command
  --format    Output format (table, json) [default: table]

${colorize('ENVIRONMENT:', 'bold')}
  FINAULT_API_KEY     Your Finault API key (required)
  FINAULT_BASE_URL    API base URL [default: https://api.finault.ai]

${colorize('EXAMPLES:', 'bold')}
  finault costs --customer acme --last 7d
  finault margin --feature chat --trend
  finault simulate --model gpt-4o-mini --feature summarization
  finault health
  finault status

${colorize('For more info:', 'bold')} finault <command> --help
`);
  } else {
    // Command-specific help
    const helps = {
      costs: `
${colorize('finault costs', 'bold')} — Cost breakdown

${colorize('USAGE:', 'bold')}
  finault costs [options]

${colorize('OPTIONS:', 'bold')}
  --customer <name>   Filter by customer name
  --last <period>     Time period (1d, 7d, 30d) [default: 7d]
  --feature <name>    Filter by feature name
  --format <fmt>      Output format (table, json) [default: table]

${colorize('EXAMPLES:', 'bold')}
  finault costs --customer acme --last 7d
  finault costs --feature chat --last 30d
  finault costs --format json
`,
      margin: `
${colorize('finault margin', 'bold')} — Margin analysis

${colorize('USAGE:', 'bold')}
  finault margin [options]

${colorize('OPTIONS:', 'bold')}
  --feature <name>    Feature to analyze
  --trend             Show trend over time
  --period <days>     Analysis period [default: 30]
  --format <fmt>      Output format (table, json) [default: table]

${colorize('EXAMPLES:', 'bold')}
  finault margin --feature chat --trend
  finault margin --feature summarize --period 60
`,
      simulate: `
${colorize('finault simulate', 'bold')} — Model switch simulation

${colorize('USAGE:', 'bold')}
  finault simulate [options]

${colorize('OPTIONS:', 'bold')}
  --model <name>      Target model (gpt-4o-mini, gpt-4-turbo, etc.)
  --feature <name>    Feature to simulate
  --volume <num>      Request volume estimate [default: 1000]
  --format <fmt>      Output format (table, json) [default: table]

${colorize('EXAMPLES:', 'bold')}
  finault simulate --model gpt-4o-mini --feature summarization
  finault simulate --model gpt-4-turbo --feature chat --volume 5000
`,
      health: `
${colorize('finault health', 'bold')} — Customer health overview

${colorize('USAGE:', 'bold')}
  finault health [options]

${colorize('OPTIONS:', 'bold')}
  --customer <name>   Filter by customer name
  --format <fmt>      Output format (table, json) [default: table]

${colorize('EXAMPLES:', 'bold')}
  finault health
  finault health --customer acme
`,
      trajectory: `
${colorize('finault trajectory', 'bold')} — Cost trajectory prediction

${colorize('USAGE:', 'bold')}
  finault trajectory [options]

${colorize('OPTIONS:', 'bold')}
  --customer <name>   Customer to analyze (required)
  --horizon <days>    Forecast horizon [default: 90]
  --format <fmt>      Output format (table, json) [default: table]

${colorize('EXAMPLES:', 'bold')}
  finault trajectory --customer acme
  finault trajectory --customer acme --horizon 180
`,
      status: `
${colorize('finault status', 'bold')} — Connection and stats

${colorize('USAGE:', 'bold')}
  finault status

Shows API connection status and quick statistics.
`,
    };

    console.log(helps[command] || `Unknown command: ${command}`);
  }
}

/**
 * Print formatted table
 */
function printTable(headers, rows) {
  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxWidth = Math.max(h.length, ...rows.map((r) => String(r[i]).length));
    return maxWidth + 2;
  });

  // Header
  const headerLine = headers
    .map((h, i) => h.padEnd(colWidths[i]))
    .join('│');
  console.log(colorize(headerLine, 'bold'));
  console.log(
    colorize(
      colWidths.map((w) => '─'.repeat(w)).join('┼'),
      'gray'
    )
  );

  // Rows
  rows.forEach((row) => {
    console.log(row.map((cell, i) => String(cell).padEnd(colWidths[i])).join('│'));
  });
}

/**
 * Command: costs
 */
async function cmdCosts(args) {
  const customer = getArg(args, 'customer');
  const period = getArg(args, 'last') || '7d';
  const feature = getArg(args, 'feature');
  const format = getArg(args, 'format') || 'table';

  try {
    let url = `${baseUrl}/v1/analytics/costs?period=${period}`;
    if (customer) url += `&customer=${encodeURIComponent(customer)}`;
    if (feature) url += `&feature=${encodeURIComponent(feature)}`;

    const headers = { 'Authorization': `Bearer ${apiKey}` };
    const response = await fetchJSON(url, headers);

    if (format === 'json') {
      console.log(JSON.stringify(response, null, 2));
      return;
    }

    const costs = response.data || [];

    if (costs.length === 0) {
      console.log(
        colorize('No cost data found for the specified criteria.', 'yellow')
      );
      return;
    }

    console.log(
      `\n${colorize('Cost Breakdown', 'bold')} (${period})\n`
    );

    const headers_arr = ['Feature', 'Requests', 'Total Cost', 'Avg Cost/Req'];
    const rows = costs.map((c) => [
      c.feature || 'unknown',
      formatNumber(c.request_count),
      `$${formatCurrency(c.total_cost)}`,
      `$${formatCurrency(c.cost_per_request)}`,
    ]);

    printTable(headers_arr, rows);

    const totalCost = costs.reduce((sum, c) => sum + c.total_cost, 0);
    const totalRequests = costs.reduce((sum, c) => sum + c.request_count, 0);

    console.log(`\n${colorize('Summary:', 'bold')}`);
    console.log(`  Total Cost:      $${formatCurrency(totalCost)}`);
    console.log(`  Total Requests:  ${formatNumber(totalRequests)}`);
    console.log(
      `  Avg Cost/Req:    $${formatCurrency(totalRequests > 0 ? totalCost / totalRequests : 0)}`
    );
    console.log();
  } catch (error) {
    console.error(colorize(`Error: ${error.message}`, 'red'));
    process.exit(1);
  }
}

/**
 * Command: margin
 */
async function cmdMargin(args) {
  const feature = getArg(args, 'feature');
  const showTrend = hasArg(args, 'trend');
  const period = getArg(args, 'period') || '30';
  const format = getArg(args, 'format') || 'table';

  if (!feature) {
    console.error(
      colorize('Error: --feature is required for margin command', 'red')
    );
    process.exit(1);
  }

  try {
    let url = `${baseUrl}/v1/analytics/margin?feature=${encodeURIComponent(feature)}&period=${period}`;
    if (showTrend) url += '&include_trend=true';

    const headers = { 'Authorization': `Bearer ${apiKey}` };
    const response = await fetchJSON(url, headers);

    if (format === 'json') {
      console.log(JSON.stringify(response, null, 2));
      return;
    }

    const data = response.data || {};

    console.log(`\n${colorize('Margin Analysis', 'bold')} — ${feature}\n`);

    const status = getStatusIndicator(data.margin_pct || 0, {
      critical: 20,
      warning: 35,
    });

    console.log(`  ${status} Margin:              ${(data.margin_pct || 0).toFixed(1)}%`);
    console.log(`    Revenue/Request:      $${formatCurrency(data.revenue_per_request || 0)}`);
    console.log(`    Cost/Request:         $${formatCurrency(data.cost_per_request || 0)}`);
    console.log(`    Gross Profit/Request: $${formatCurrency(data.profit_per_request || 0)}`);

    if (showTrend && data.trend) {
      console.log(`\n${colorize('30-Day Trend:', 'bold')}\n`);

      const trend = data.trend;
      const headers_arr = ['Date', 'Margin %', 'Cost/Req', 'Status'];
      const rows = trend.map((t) => {
        const status = getStatusIndicator(t.margin_pct, {
          critical: 20,
          warning: 35,
        });
        return [
          t.date,
          `${t.margin_pct.toFixed(1)}%`,
          `$${formatCurrency(t.cost_per_request)}`,
          status,
        ];
      });

      printTable(headers_arr, rows);
    }

    console.log();
  } catch (error) {
    console.error(colorize(`Error: ${error.message}`, 'red'));
    process.exit(1);
  }
}

/**
 * Command: simulate
 */
async function cmdSimulate(args) {
  const model = getArg(args, 'model');
  const feature = getArg(args, 'feature');
  const volume = parseInt(getArg(args, 'volume') || '1000');
  const format = getArg(args, 'format') || 'table';

  if (!model) {
    console.error(
      colorize('Error: --model is required for simulate command', 'red')
    );
    process.exit(1);
  }

  try {
    let url = `${baseUrl}/v1/analytics/simulate?model=${encodeURIComponent(model)}&volume=${volume}`;
    if (feature) url += `&feature=${encodeURIComponent(feature)}`;

    const headers = { 'Authorization': `Bearer ${apiKey}` };
    const response = await fetchJSON(url, headers);

    if (format === 'json') {
      console.log(JSON.stringify(response, null, 2));
      return;
    }

    const simulation = response.data || {};

    console.log(`\n${colorize('Model Switch Simulation', 'bold')}\n`);
    console.log(`  Current Model: ${simulation.current_model || 'unknown'}`);
    console.log(`  Target Model:  ${model}`);
    console.log(`  Volume:        ${formatNumber(volume)} requests\n`);

    console.log(`${colorize('Cost Impact:', 'bold')}`);

    const currentCost = simulation.current_total_cost || 0;
    const targetCost = simulation.target_total_cost || 0;
    const savingsPct =
      currentCost > 0
        ? (((currentCost - targetCost) / currentCost) * 100).toFixed(1)
        : 0;
    const savings = currentCost - targetCost;

    console.log(`  Current Total: $${formatCurrency(currentCost)}`);
    console.log(`  Target Total:  $${formatCurrency(targetCost)}`);

    if (savings > 0) {
      console.log(
        colorize(`  Savings:       -$${formatCurrency(savings)} (${savingsPct}%)`, 'green')
      );
    } else if (savings < 0) {
      console.log(
        colorize(
          `  Increase:      +$${formatCurrency(Math.abs(savings))} (${Math.abs(savingsPct)}%)`,
          'yellow'
        )
      );
    } else {
      console.log(`  No change`);
    }

    if (simulation.breakdown && simulation.breakdown.length > 0) {
      console.log(`\n${colorize('Breakdown by Feature:', 'bold')}\n`);
      const headers_arr = ['Feature', 'Current Cost', 'Target Cost', 'Change'];
      const rows = simulation.breakdown.map((b) => {
        const change =
          b.current_cost > 0
            ? (((b.target_cost - b.current_cost) / b.current_cost) * 100).toFixed(1)
            : 0;
        const changeStr = `${change >= 0 ? '+' : ''}${change}%`;
        return [
          b.feature,
          `$${formatCurrency(b.current_cost)}`,
          `$${formatCurrency(b.target_cost)}`,
          changeStr,
        ];
      });
      printTable(headers_arr, rows);
    }

    console.log();
  } catch (error) {
    console.error(colorize(`Error: ${error.message}`, 'red'));
    process.exit(1);
  }
}

/**
 * Command: health
 */
async function cmdHealth(args) {
  const customer = getArg(args, 'customer');
  const format = getArg(args, 'format') || 'table';

  try {
    let url = `${baseUrl}/v1/analytics/health`;
    if (customer) url += `?customer=${encodeURIComponent(customer)}`;

    const headers = { 'Authorization': `Bearer ${apiKey}` };
    const response = await fetchJSON(url, headers);

    if (format === 'json') {
      console.log(JSON.stringify(response, null, 2));
      return;
    }

    const customers = response.data || [];

    if (customers.length === 0) {
      console.log(
        colorize('No customer health data found.', 'yellow')
      );
      return;
    }

    console.log(`\n${colorize('Customer Health Overview', 'bold')}\n`);

    const headers_arr = ['Customer', 'Status', 'Cost Trend', 'Margin', 'Alerts'];
    const rows = customers.map((c) => {
      const status = getStatusIndicator(c.health_score || 0, {
        critical: 30,
        warning: 60,
      });
      const trend = (c.cost_trend_pct || 0) > 0 ? '↑' : '↓';
      const margin = `${(c.margin_pct || 0).toFixed(1)}%`;
      const alertCount = c.active_alerts || 0;
      const alerts =
        alertCount > 0 ? colorize(`${alertCount} alert(s)`, 'yellow') : '-';

      return [c.name || 'unknown', status, `${trend}${Math.abs(c.cost_trend_pct || 0).toFixed(1)}%`, margin, alerts];
    });

    printTable(headers_arr, rows);
    console.log();
  } catch (error) {
    console.error(colorize(`Error: ${error.message}`, 'red'));
    process.exit(1);
  }
}

/**
 * Command: trajectory
 */
async function cmdTrajectory(args) {
  const customer = getArg(args, 'customer');
  const horizon = getArg(args, 'horizon') || '90';
  const format = getArg(args, 'format') || 'table';

  if (!customer) {
    console.error(
      colorize('Error: --customer is required for trajectory command', 'red')
    );
    process.exit(1);
  }

  try {
    const url = `${baseUrl}/v1/analytics/trajectory?customer=${encodeURIComponent(customer)}&horizon=${horizon}`;

    const headers = { 'Authorization': `Bearer ${apiKey}` };
    const response = await fetchJSON(url, headers);

    if (format === 'json') {
      console.log(JSON.stringify(response, null, 2));
      return;
    }

    const trajectory = response.data || {};

    console.log(
      `\n${colorize('Cost Trajectory', 'bold')} — ${customer} (${horizon} days)\n`
    );

    console.log(`${colorize('Forecast Summary:', 'bold')}`);
    console.log(
      `  Current Monthly: $${formatCurrency(trajectory.current_monthly_cost || 0)}`
    );
    console.log(
      `  Projected:       $${formatCurrency(trajectory.projected_monthly_cost || 0)}`
    );

    const change = (trajectory.projected_monthly_cost || 0) - (trajectory.current_monthly_cost || 0);
    if (change > 0) {
      console.log(
        colorize(
          `  Expected Growth: +$${formatCurrency(change)}`,
          'yellow'
        )
      );
    } else if (change < 0) {
      console.log(
        colorize(
          `  Expected Savings: -$${formatCurrency(Math.abs(change))}`,
          'green'
        )
      );
    }

    if (trajectory.predictions && trajectory.predictions.length > 0) {
      console.log(`\n${colorize('Weekly Projection:', 'bold')}\n`);
      const headers_arr = ['Week', 'Projected Cost', 'Confidence'];
      const rows = trajectory.predictions.map((p) => {
        const confidence = `${Math.round((p.confidence || 0) * 100)}%`;
        return [p.week, `$${formatCurrency(p.cost)}`, confidence];
      });
      printTable(headers_arr, rows);
    }

    console.log();
  } catch (error) {
    console.error(colorize(`Error: ${error.message}`, 'red'));
    process.exit(1);
  }
}

/**
 * Command: status
 */
async function cmdStatus(args) {
  try {
    const url = `${baseUrl}/v1/health`;
    const headers = { 'Authorization': `Bearer ${apiKey}` };
    const response = await fetchJSON(url, headers);

    const health = response.data || {};

    console.log(`\n${colorize('Finault API Status', 'bold')}\n`);

    const apiStatus = health.api_healthy ? 'UP' : 'DOWN';
    const apiColor = health.api_healthy ? 'green' : 'red';
    const dbStatus = health.database_healthy ? 'UP' : 'DOWN';
    const dbColor = health.database_healthy ? 'green' : 'red';

    console.log(`  API:      ${colorize(apiStatus, apiColor)}`);
    console.log(`  Database: ${colorize(dbStatus, dbColor)}`);
    console.log(`  Uptime:   ${health.uptime_hours || 'unknown'} hours`);

    if (health.stats) {
      console.log(`\n${colorize('Quick Statistics:', 'bold')}`);
      console.log(
        `  Total Requests:  ${formatNumber(health.stats.total_requests || 0)}`
      );
      console.log(
        `  Total Spend:     $${formatCurrency(health.stats.total_spend || 0)}`
      );
      console.log(
        `  Active Customers: ${health.stats.active_customers || 0}`
      );
      console.log(
        `  Avg Cost/Req:    $${formatCurrency(health.stats.avg_cost_per_request || 0)}`
      );
    }

    console.log();
  } catch (error) {
    console.error(
      colorize(
        `Error: Unable to reach Finault API. Check your credentials and try again.`,
        'red'
      )
    );
    process.exit(1);
  }
}

/**
 * Helper: Get argument value
 */
function getArg(args, name) {
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && index < args.length - 1) {
    return args[index + 1];
  }
  return null;
}

/**
 * Helper: Check if argument exists
 */
function hasArg(args, name) {
  return args.includes(`--${name}`);
}

/**
 * Helper: Format number with commas
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Helper: Format currency
 */
function formatCurrency(num) {
  if (num >= 1) {
    return formatNumber(Math.round(num * 100) / 100);
  }
  return (Math.round(num * 1000000) / 1000000).toFixed(6);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || hasArg(args, 'help')) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];

  if (!apiKey) {
    console.error(
      colorize(
        'Error: FINAULT_API_KEY environment variable is not set',
        'red'
      )
    );
    process.exit(1);
  }

  try {
    switch (command) {
      case 'costs':
        await cmdCosts(args.slice(1));
        break;
      case 'margin':
        await cmdMargin(args.slice(1));
        break;
      case 'simulate':
        await cmdSimulate(args.slice(1));
        break;
      case 'health':
        await cmdHealth(args.slice(1));
        break;
      case 'trajectory':
        await cmdTrajectory(args.slice(1));
        break;
      case 'status':
        await cmdStatus(args.slice(1));
        break;
      case 'help':
        if (args.length > 1) {
          printHelp(args[1]);
        } else {
          printHelp();
        }
        break;
      default:
        console.error(colorize(`Unknown command: ${command}`, 'red'));
        console.error(`Run ${colorize('finault --help', 'cyan')} for usage information.`);
        process.exit(1);
    }
  } catch (error) {
    console.error(colorize(`Error: ${error.message}`, 'red'));
    process.exit(1);
  }
}

main();
