const fs = require('fs');
const path = require('path');
const https = require('https');

// Model pricing table (cost per 1K input tokens, or per request for fixed-price models)
const MODEL_PRICING = {
  'gpt-4o': { input: 0.005, output: 0.015, name: 'GPT-4o' },
  'gpt-4-turbo': { input: 0.01, output: 0.03, name: 'GPT-4 Turbo' },
  'gpt-4': { input: 0.03, output: 0.06, name: 'GPT-4' },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006, name: 'GPT-4o Mini' },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015, name: 'GPT-3.5 Turbo' },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015, name: 'Claude 3.5 Sonnet' },
  'claude-3-opus': { input: 0.015, output: 0.075, name: 'Claude 3 Opus' },
  'claude-3-sonnet': { input: 0.003, output: 0.015, name: 'Claude 3 Sonnet' },
  'claude-3-haiku': { input: 0.00025, output: 0.00125, name: 'Claude 3 Haiku' },
  'gemini-pro': { input: 0.0005, output: 0.0015, name: 'Gemini Pro' },
  'gemini-1.5-pro': { input: 0.0075, output: 0.03, name: 'Gemini 1.5 Pro' },
};

// Patterns to detect AI-related code changes
const AI_PATTERNS = [
  { regex: /openai\.createChatCompletion|openai\.ChatCompletion\.create|new OpenAI/gi, provider: 'OpenAI' },
  { regex: /anthropic\.messages\.create|new Anthropic|Anthropic\(|client\.messages\.create/gi, provider: 'Anthropic' },
  { regex: /google\.generativeai|new GoogleGenerativeAI|GoogleGenerativeAI\(/gi, provider: 'Google' },
  { regex: /model\s*[=:]\s*['"](gpt-4o|gpt-4-turbo|gpt-4|gpt-3\.5-turbo|claude-3[^'"]*|gemini[^'"]*)['"]/gi, provider: 'Model' },
  { regex: /completions|chat\.completions|embeddings|text-generation|summarization/gi, provider: 'AI Endpoint' },
];

class FinaultCostCheck {
  constructor() {
    this.changes = [];
    this.totalCost = 0;
    this.threshold = parseFloat(process.env.INPUT_THRESHOLD || 100);
    this.failOnExceed = (process.env.INPUT_FAIL_ON_EXCEED || 'false').toLowerCase() === 'true';
  }

  /**
   * Parse GitHub event and extract PR diff
   */
  async getPRDiff() {
    try {
      const eventPath = process.env.GITHUB_EVENT_PATH;
      if (!eventPath || !fs.existsSync(eventPath)) {
        console.log('No GITHUB_EVENT_PATH found, attempting to use GitHub context');
        return this.getDiffFromGitHub();
      }

      const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
      return event.pull_request?.diff_url || null;
    } catch (error) {
      console.error('Error reading GitHub event:', error.message);
      return null;
    }
  }

  /**
   * Fetch PR diff from GitHub API
   */
  async getDiffFromGitHub() {
    const token = process.env.INPUT_GITHUB_TOKEN;
    const diffUrl = process.env.GITHUB_DIFF_URL || null;

    if (!diffUrl || !token) {
      throw new Error('GitHub token or diff URL not available');
    }

    return new Promise((resolve, reject) => {
      const url = new URL(diffUrl);
      const options = {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3.raw',
          'User-Agent': 'finault-cost-check',
        },
      };

      https.get(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  /**
   * Scan diff for AI-related changes
   */
  scanForChanges(diff) {
    if (!diff) return;

    const lines = diff.split('\n');
    let currentFile = '';
    let addedLines = [];
    let removedLines = [];

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        currentFile = line.split(' b/')[1] || currentFile;
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        addedLines.push({ line: line.substring(1), file: currentFile });
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        removedLines.push({ line: line.substring(1), file: currentFile });
      }
    }

    this.detectAdditions(addedLines);
    this.detectRemovals(removedLines);
    this.detectUpgrades(addedLines, removedLines);
  }

  /**
   * Detect new AI API calls
   */
  detectAdditions(lines) {
    for (const { line, file } of lines) {
      for (const pattern of AI_PATTERNS) {
        if (pattern.regex.test(line)) {
          const modelMatch = line.match(/model\s*[=:]\s*['"]([\w.-]+)['"]/i);
          const model = modelMatch ? modelMatch[1] : 'unknown';

          this.changes.push({
            type: 'addition',
            provider: pattern.provider,
            model,
            file,
            line: line.trim().substring(0, 80),
          });
        }
      }
    }
  }

  /**
   * Detect removed AI API calls
   */
  detectRemovals(lines) {
    for (const { line, file } of lines) {
      for (const pattern of AI_PATTERNS) {
        if (pattern.regex.test(line)) {
          const modelMatch = line.match(/model\s*[=:]\s*['"]([\w.-]+)['"]/i);
          const model = modelMatch ? modelMatch[1] : 'unknown';

          this.changes.push({
            type: 'removal',
            provider: pattern.provider,
            model,
            file,
            line: line.trim().substring(0, 80),
          });
        }
      }
    }
  }

  /**
   * Detect model upgrades (e.g., gpt-4o-mini -> gpt-4o)
   */
  detectUpgrades(addedLines, removedLines) {
    for (const addedItem of addedLines) {
      const addedModelMatch = addedItem.line.match(/model\s*[=:]\s*['"]([\w.-]+)['"]/i);
      if (!addedModelMatch) continue;

      for (const removedItem of removedLines) {
        if (addedItem.file !== removedItem.file) continue;

        const removedModelMatch = removedItem.line.match(/model\s*[=:]\s*['"]([\w.-]+)['"]/i);
        if (!removedModelMatch) continue;

        const oldModel = removedModelMatch[1];
        const newModel = addedModelMatch[1];

        if (oldModel !== newModel) {
          this.changes.push({
            type: 'upgrade',
            provider: 'Model',
            oldModel,
            newModel,
            file: addedItem.file,
          });
        }
      }
    }
  }

  /**
   * Calculate estimated cost impact
   */
  calculateCostImpact() {
    const costDetails = [];
    let totalMonthlyImpact = 0;

    for (const change of this.changes) {
      let costPerRequest = 0;
      let displayModel = '';

      if (change.type === 'addition') {
        const pricing = MODEL_PRICING[change.model];
        if (pricing) {
          costPerRequest = (pricing.input + pricing.output) / 2000; // avg cost per request
          displayModel = pricing.name;
        } else {
          displayModel = change.model;
          costPerRequest = 0.01; // conservative estimate
        }

        // Estimate 30 requests/month per call (conservative)
        const monthlyImpact = costPerRequest * 30;
        totalMonthlyImpact += monthlyImpact;

        costDetails.push({
          change: `Added ${change.provider} call`,
          model: displayModel,
          costPerRequest: costPerRequest.toFixed(4),
          monthlyImpact: monthlyImpact.toFixed(2),
          file: change.file,
        });
      } else if (change.type === 'removal') {
        const pricing = MODEL_PRICING[change.model];
        if (pricing) {
          costPerRequest = (pricing.input + pricing.output) / 2000;
          displayModel = pricing.name;
        } else {
          displayModel = change.model;
          costPerRequest = 0.01;
        }

        const monthlyImpact = -(costPerRequest * 30);
        totalMonthlyImpact += monthlyImpact;

        costDetails.push({
          change: `Removed ${change.provider} call`,
          model: displayModel,
          costPerRequest: costPerRequest.toFixed(4),
          monthlyImpact: monthlyImpact.toFixed(2),
          file: change.file,
        });
      } else if (change.type === 'upgrade') {
        const oldPricing = MODEL_PRICING[change.oldModel];
        const newPricing = MODEL_PRICING[change.newModel];

        const oldCost = oldPricing ? (oldPricing.input + oldPricing.output) / 2000 : 0.01;
        const newCost = newPricing ? (newPricing.input + newPricing.output) / 2000 : 0.01;
        const costDelta = newCost - oldCost;

        const monthlyImpact = costDelta * 30;
        totalMonthlyImpact += Math.abs(monthlyImpact);

        costDetails.push({
          change: 'Model upgrade',
          model: `${change.oldModel} → ${change.newModel}`,
          costPerRequest: costDelta.toFixed(4),
          monthlyImpact: monthlyImpact.toFixed(2),
          file: change.file,
        });
      }
    }

    return { costDetails, totalMonthlyImpact };
  }

  /**
   * Format cost data as Markdown table
   */
  formatAsMarkdown(costDetails, totalMonthlyImpact) {
    if (costDetails.length === 0) {
      return '## 🔍 Finault Cost Check\n\nNo AI-related changes detected in this PR.';
    }

    let markdown = '## 🔍 Finault Cost Check\n\n';
    markdown += '| Change | Model | Est. Cost/Request | Monthly Impact |\n';
    markdown += '|--------|-------|-------------------|----------------|\n';

    for (const detail of costDetails) {
      const impact = totalMonthlyImpact >= 0 ? `+$${detail.monthlyImpact}` : `$${detail.monthlyImpact}`;
      markdown += `| ${detail.change} in \`${detail.file}\` | ${detail.model} | $${detail.costPerRequest} | ${impact}/mo |\n`;
    }

    markdown += `\n**Total estimated monthly impact: ${totalMonthlyImpact >= 0 ? '+' : ''}$${totalMonthlyImpact.toFixed(2)}/mo**\n\n`;

    if (totalMonthlyImpact > this.threshold) {
      markdown += `⚠️ **Warning**: Cost increase exceeds threshold of $${this.threshold}/mo\n\n`;
    }

    markdown += '_Powered by [Finault](https://finault.ai)_';

    return markdown;
  }

  /**
   * Post comment to PR
   */
  async postPRComment(comment) {
    const token = process.env.INPUT_GITHUB_TOKEN;
    const prNumber = process.env.GITHUB_PR_NUMBER || process.env.PR_NUMBER;
    const repo = process.env.GITHUB_REPOSITORY;

    if (!token || !prNumber || !repo) {
      console.warn('Cannot post PR comment: missing token, PR number, or repository');
      return;
    }

    const [owner, repoName] = repo.split('/');
    const url = `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`;

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ body: comment });
      const options = {
        method: 'POST',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': postData.length,
          'User-Agent': 'finault-cost-check',
        },
      };

      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`GitHub API error: ${res.statusCode}`));
          }
        });
      }).on('error', reject);

      req.write(postData);
      req.end();
    });
  }

  /**
   * Main execution
   */
  async run() {
    try {
      console.log('🚀 Starting Finault Cost Check...');

      // Get PR diff
      const diff = await this.getPRDiff();
      if (!diff) {
        console.log('⚠️  No diff data found, skipping cost analysis');
        return;
      }

      // Scan for changes
      this.scanForChanges(diff);

      if (this.changes.length === 0) {
        console.log('✅ No AI-related changes detected');
        return;
      }

      // Calculate costs
      const { costDetails, totalMonthlyImpact } = this.calculateCostImpact();

      // Format and post comment
      const comment = this.formatAsMarkdown(costDetails, totalMonthlyImpact);
      await this.postPRComment(comment);

      console.log(`✅ Posted cost analysis to PR (Total impact: $${totalMonthlyImpact.toFixed(2)}/mo)`);

      // Check threshold
      if (totalMonthlyImpact > this.threshold && this.failOnExceed) {
        console.error(`❌ Cost impact ($${totalMonthlyImpact.toFixed(2)}/mo) exceeds threshold ($${this.threshold}/mo)`);
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error during cost check:', error.message);
      process.exit(1);
    }
  }
}

// Run the action
const action = new FinaultCostCheck();
action.run();
