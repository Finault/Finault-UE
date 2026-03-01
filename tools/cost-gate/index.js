#!/usr/bin/env node

/**
 * Finault Cost Gate — GitHub Action
 *
 * Checks if a PR increases AI cost-per-request beyond a configurable threshold.
 * Posts a PR comment with the cost comparison report.
 *
 * Environment: Node.js 20, uses @actions/core and @actions/github
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * Make an HTTPS request and return parsed JSON
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
        'User-Agent': 'Finault-CostGate/1.0',
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
          reject(new Error(`Failed to parse JSON response: ${data}`));
        }
      });
    });

    request.on('error', reject);
    request.end();
  });
}

/**
 * Fetch cost data from Finault API
 */
async function fetchCostData(baseUrl, apiKey, period, features) {
  let url = `${baseUrl}/v1/analytics/cost-per-request?period=${period}`;

  if (features && features.length > 0) {
    url += `&features=${features.join(',')}`;
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
  };

  const response = await fetchJSON(url, headers);

  if (!response.data) {
    throw new Error('Invalid Finault API response: missing data field');
  }

  return response.data;
}

/**
 * Build cost comparison report
 */
function buildReport(baseline, current, thresholdPct) {
  const features = [];
  const baselineFeatures = baseline.features || [];
  const currentFeatures = current.features || [];

  // Create a map for easy lookup
  const currentMap = {};
  currentFeatures.forEach((f) => {
    currentMap[f.feature] = f;
  });

  // Compare each baseline feature with current
  baselineFeatures.forEach((baselineFeature) => {
    const currentFeature = currentMap[baselineFeature.feature];

    if (!currentFeature) {
      // Feature no longer exists
      features.push({
        feature: baselineFeature.feature,
        baseline_cost: baselineFeature.cost_per_request,
        current_cost: 0,
        change_pct: -100,
        exceeds_threshold: false,
      });
    } else {
      const baselineCost = baselineFeature.cost_per_request;
      const currentCost = currentFeature.cost_per_request;
      const changePct =
        baselineCost === 0
          ? 0
          : ((currentCost - baselineCost) / baselineCost) * 100;
      const exceeds = changePct > thresholdPct;

      features.push({
        feature: baselineFeature.feature,
        baseline_cost: baselineCost,
        current_cost: currentCost,
        change_pct: changePct,
        exceeds_threshold: exceeds,
      });
    }
  });

  // Handle new features in current
  currentFeatures.forEach((currentFeature) => {
    if (!baselineFeatures.find((f) => f.feature === currentFeature.feature)) {
      features.push({
        feature: currentFeature.feature,
        baseline_cost: 0,
        current_cost: currentFeature.cost_per_request,
        change_pct: 999, // New feature always exceeds
        exceeds_threshold: true,
      });
    }
  });

  const totalBaseline = baselineFeatures.reduce((sum, f) => sum + f.cost_per_request, 0);
  const totalCurrent = currentFeatures.reduce((sum, f) => sum + f.cost_per_request, 0);

  return {
    baseline_period: baseline.period || 'unknown',
    current_period: current.period || 'unknown',
    total_baseline: totalBaseline,
    total_current: totalCurrent,
    total_change_pct:
      totalBaseline === 0 ? 0 : ((totalCurrent - totalBaseline) / totalBaseline) * 100,
    threshold_pct: thresholdPct,
    features: features.sort((a, b) => {
      // Exceeds threshold first, then by change percent descending
      if (a.exceeds_threshold !== b.exceeds_threshold) {
        return a.exceeds_threshold ? -1 : 1;
      }
      return b.change_pct - a.change_pct;
    }),
    generated_at: new Date().toISOString(),
  };
}

/**
 * Post a comment on the PR with the cost report
 */
async function postPRComment(report, thresholdPct) {
  try {
    // Read GitHub event context
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath || !fs.existsSync(eventPath)) {
      console.log('⚠️  Not in GitHub Actions context, skipping PR comment');
      return;
    }

    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const prNumber = event.pull_request?.number;

    if (!prNumber) {
      console.log('⚠️  Could not determine PR number, skipping comment');
      return;
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.log('⚠️  GITHUB_TOKEN not set, skipping PR comment');
      return;
    }

    // Build markdown table
    const tableRows = report.features
      .map((f) => {
        const arrow =
          f.change_pct > 0 ? '📈' : f.change_pct < 0 ? '📉' : '➡️';
        const status = f.exceeds_threshold ? '❌' : '✅';
        const change = `${f.change_pct > 0 ? '+' : ''}${f.change_pct.toFixed(1)}%`;

        return `| ${arrow} ${f.feature} | $${f.baseline_cost.toFixed(6)} | $${f.current_cost.toFixed(6)} | ${change} | ${status} |`;
      })
      .join('\n');

    const totalChange = `${report.total_change_pct > 0 ? '+' : ''}${report.total_change_pct.toFixed(1)}%`;
    const hasExceeds = report.features.some((f) => f.exceeds_threshold);
    const statusEmoji = hasExceeds ? '❌' : '✅';

    const body = `## ${statusEmoji} Finault Cost Gate Report

**Threshold:** ${thresholdPct}%

### Cost Comparison

| Feature | Baseline | Current | Change | Status |
|---------|----------|---------|--------|--------|
${tableRows}

### Summary

- **Total Baseline:** $${report.total_baseline.toFixed(6)}/request
- **Total Current:** $${report.total_current.toFixed(6)}/request
- **Total Change:** ${totalChange}

${
  hasExceeds
    ? `⚠️  **Warning:** ${report.features.filter((f) => f.exceeds_threshold).length} feature(s) exceed the ${thresholdPct}% threshold.`
    : `✅ All features within acceptable range.`
}

<sub>Generated by [Finault Cost Gate](https://github.com/finault/cost-gate) at ${new Date().toISOString()}</sub>`;

    // Post comment via GitHub API
    const repo = process.env.GITHUB_REPOSITORY || 'unknown/unknown';
    const [owner, repoName] = repo.split('/');

    const commentUrl = `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`;

    const postData = JSON.stringify({ body });

    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: `/repos/${owner}/${repoName}/issues/${prNumber}/comments`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `token ${token}`,
        'User-Agent': 'Finault-CostGate/1.0',
        'Accept': 'application/vnd.github.v3+json',
      },
    };

    await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          if (response.statusCode >= 400) {
            reject(new Error(`GitHub API error (${response.statusCode}): ${data}`));
          } else {
            resolve();
          }
        });
      });

      request.on('error', reject);
      request.write(postData);
      request.end();
    });

    console.log(`✅ Posted cost report comment to PR #${prNumber}`);
  } catch (error) {
    console.warn(`⚠️  Failed to post PR comment: ${error.message}`);
  }
}

/**
 * Set GitHub Actions output
 */
function setOutput(name, value) {
  try {
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile && fs.existsSync(outputFile)) {
      fs.appendFileSync(outputFile, `${name}=${value}\n`);
    } else {
      console.log(`::set-output name=${name}::${value}`);
    }
  } catch (e) {
    console.log(`::set-output name=${name}::${value}`);
  }
}

/**
 * Main execution
 */
async function run() {
  try {
    // Get inputs from environment variables
    // GitHub Actions converts input names to uppercase with hyphens replaced by underscores
    const apiKey =
      process.env.INPUT_FINAULT_API_KEY ||
      process.env['INPUT_FINAULT-API-KEY'];
    const baseUrl =
      process.env.INPUT_FINAULT_BASE_URL ||
      process.env['INPUT_FINAULT-BASE-URL'] ||
      'https://api.finault.ai';
    const thresholdPct = parseFloat(
      process.env.INPUT_THRESHOLD_PCT ||
        process.env['INPUT_THRESHOLD-PCT'] ||
        '50'
    );
    const featuresInput = process.env.INPUT_FEATURES || '';
    const features = featuresInput
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    const failOnIncrease =
      (process.env.INPUT_FAIL_ON_INCREASE ||
        process.env['INPUT_FAIL-ON-INCREASE'] ||
        'true') === 'true';
    const period = process.env.INPUT_PERIOD || '7d';

    if (!apiKey) {
      throw new Error('finault-api-key input is required');
    }

    console.log(
      `\n🔍 Finault Cost Gate — checking cost impact (threshold: ${thresholdPct}%)\n`
    );

    // Fetch baseline costs (historical period)
    console.log(`📊 Fetching baseline costs for period: ${period}`);
    const baseline = await fetchCostData(baseUrl, apiKey, period, features);
    console.log(
      `   Found ${baseline.features ? baseline.features.length : 0} feature(s)`
    );

    // Fetch current costs (most recent)
    console.log('📊 Fetching current costs...');
    const current = await fetchCostData(baseUrl, apiKey, '1d', features);
    console.log(
      `   Found ${current.features ? current.features.length : 0} feature(s)`
    );

    // Build comparison report
    const report = buildReport(baseline, current, thresholdPct);

    // Display results
    console.log('\n📈 Cost Comparison Report:');
    console.log('─'.repeat(75));

    let hasIncrease = false;
    let maxIncrease = 0;

    for (const item of report.features) {
      const arrow =
        item.change_pct > 0 ? '📈' : item.change_pct < 0 ? '📉' : '➡️';
      const status = item.exceeds_threshold ? '❌ EXCEEDS' : '✅ OK';
      const changeStr = `${item.change_pct > 0 ? '+' : ''}${item.change_pct.toFixed(1)}%`;

      console.log(
        `${arrow} ${item.feature.padEnd(20)} | $${item.baseline_cost
          .toFixed(6)
          .padStart(10)} → $${item.current_cost
          .toFixed(6)
          .padStart(10)} | ${changeStr.padStart(7)} | ${status}`
      );

      if (item.exceeds_threshold) hasIncrease = true;
      if (item.change_pct > maxIncrease) maxIncrease = item.change_pct;
    }

    console.log('─'.repeat(75));
    console.log(
      `Total baseline: $${report.total_baseline.toFixed(6)}/request`
    );
    console.log(
      `Total current:  $${report.total_current.toFixed(6)}/request`
    );
    console.log(
      `Total change:   ${report.total_change_pct > 0 ? '+' : ''}${report.total_change_pct.toFixed(1)}%`
    );
    console.log('─'.repeat(75));

    // Set outputs (GitHub Actions format)
    setOutput('cost-report', JSON.stringify(report));
    setOutput('has-increase', hasIncrease.toString());
    setOutput('max-increase-pct', maxIncrease.toFixed(1));

    // Post PR comment if in GitHub Actions context
    if (process.env.GITHUB_EVENT_PATH) {
      await postPRComment(report, thresholdPct);
    }

    // Determine exit code
    if (hasIncrease && failOnIncrease) {
      const exceedingCount = report.features.filter(
        (f) => f.exceeds_threshold
      ).length;
      console.error(
        `\n❌ Cost gate failed: ${exceedingCount} feature(s) exceed ${thresholdPct}% threshold`
      );
      process.exit(1);
    }

    console.log('\n✅ Cost gate passed\n');
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

run();
