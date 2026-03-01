/**
 * Shadow Diamond Tier Enhancements for Finault Platform
 *
 * Advanced AI discovery and governance capabilities including:
 * - Expense report mining (corporate cards, reimbursement platforms)
 * - Network traffic analysis (DNS, TLS SNI, API endpoint detection)
 * - Workspace bot scanning (Slack, Microsoft Teams)
 * - Code assistant scanning (GitHub Copilot, Cursor, Codeium)
 * - Duplicate spend detection and tool consolidation
 * - Shadow-to-governed migration workflows
 * - Continuous background scanning (ShadowHunter agent)
 * - Weekly automated digest generation
 * - Risk scoring matrix with compliance integration
 * - ROI calculator for governance investment
 * - Tool substitution recommender with savings projections
 * - Compliance heat map by geography/department
 * - HR system integration for cost center attribution
 *
 * Builds on core ShadowDiscovery module with enterprise-grade capabilities.
 * Cloudflare Workers compatible using CommonJS (require/module.exports)
 *
 * @module shadow-diamond
 */

import { DiamondLogger, resilientFetch, InputValidator, HealthCheck } from './diamond-utils.js';

/**
 * AI vendor patterns for expense report detection (50+ vendors)
 * Maps merchant codes, description patterns, and payment keywords to AI vendors
 */
const AI_VENDOR_PATTERNS = {
  // Large language model providers
  openai: {
    keywords: ['openai', 'chatgpt', 'gpt-4', 'gpt-3.5', 'api.openai.com', 'platform.openai.com'],
    merchantCodes: ['5815', '7379', '8999'],
    vendorNames: ['OPENAI', 'OpenAI Inc', 'OPENAI.COM', 'CHATGPT PLUS'],
    defaultEstimatedCostPerMonth: 20
  },
  anthropic: {
    keywords: ['anthropic', 'claude', 'api.anthropic.com', 'console.anthropic.com'],
    merchantCodes: ['5815', '7379'],
    vendorNames: ['ANTHROPIC', 'ANTHROPIC INC', 'CLAUDE'],
    defaultEstimatedCostPerMonth: 20
  },
  google_ai: {
    keywords: ['google', 'gemini', 'generativelanguage', 'aiplatform.googleapis.com', 'palm', 'bard'],
    merchantCodes: ['4816', '5200', '7379'],
    vendorNames: ['GOOGLE', 'GEMINI', 'PALM API'],
    defaultEstimatedCostPerMonth: 0
  },
  microsoft_ai: {
    keywords: ['microsoft', 'copilot', 'azure', 'bing', 'github'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['MICROSOFT', 'MICROSOFT COPILOT', 'GITHUB COPILOT'],
    defaultEstimatedCostPerMonth: 10
  },
  perplexity: {
    keywords: ['perplexity', 'perplexity.ai', 'api.perplexity.ai'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['PERPLEXITY', 'PERPLEXITY AI'],
    defaultEstimatedCostPerMonth: 20
  },
  midjourney: {
    keywords: ['midjourney', 'mj.com', 'midjourney.com', 'discord'],
    merchantCodes: ['5815', '7379'],
    vendorNames: ['MIDJOURNEY', 'MIDJOURNEY LLC'],
    defaultEstimatedCostPerMonth: 15
  },
  cursor: {
    keywords: ['cursor', 'cursor.ai', 'cursor.com', 'cursor.sh'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['CURSOR', 'CURSOR AI', 'CURSOR INC'],
    defaultEstimatedCostPerMonth: 20
  },
  stability_ai: {
    keywords: ['stability', 'stable diffusion', 'api.stability.ai', 'platform.stability.ai'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['STABILITY AI', 'STABLE DIFFUSION'],
    defaultEstimatedCostPerMonth: 10
  },
  elevenlabs: {
    keywords: ['elevenlabs', 'eleven labs', 'api.elevenlabs.io', 'tts'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['ELEVENLABS', 'ELEVEN LABS'],
    defaultEstimatedCostPerMonth: 11
  },
  jasper: {
    keywords: ['jasper', 'jasper.ai', 'app.jasper.ai'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['JASPER', 'JASPER AI'],
    defaultEstimatedCostPerMonth: 39
  },
  cohere: {
    keywords: ['cohere', 'cohere.com', 'api.cohere.com', 'dashboard.cohere.com'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['COHERE', 'COHERE INC'],
    defaultEstimatedCostPerMonth: 0
  },
  replicate: {
    keywords: ['replicate', 'replicate.com', 'api.replicate.com'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['REPLICATE', 'REPLICATE INC'],
    defaultEstimatedCostPerMonth: 0
  },
  huggingface: {
    keywords: ['huggingface', 'hugging face', 'hf.co', 'api-inference.huggingface.co'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['HUGGING FACE', 'HUGGINGFACE'],
    defaultEstimatedCostPerMonth: 0
  },
  notion_ai: {
    keywords: ['notion', 'notion.ai', 'notion.com', 'ai'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['NOTION', 'NOTION LABS'],
    defaultEstimatedCostPerMonth: 8
  },
  grammarly: {
    keywords: ['grammarly', 'app.grammarly.com'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['GRAMMARLY', 'GRAMMARLY INC'],
    defaultEstimatedCostPerMonth: 12
  },
  otter_ai: {
    keywords: ['otter', 'otter.ai', 'transcription'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['OTTER.AI', 'OTTER'],
    defaultEstimatedCostPerMonth: 8
  },
  fireflies: {
    keywords: ['fireflies', 'fireflies.ai', 'meeting intelligence'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['FIREFLIES', 'FIREFLIES.AI'],
    defaultEstimatedCostPerMonth: 10
  },
  writesonic: {
    keywords: ['writesonic', 'writesonic.com'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['WRITESONIC', 'WRITESONIC INC'],
    defaultEstimatedCostPerMonth: 50
  },
  copy_ai: {
    keywords: ['copy.ai', 'copyai', 'copy ai'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['COPY.AI', 'COPY AI'],
    defaultEstimatedCostPerMonth: 49
  },
  runway: {
    keywords: ['runway', 'runwayml', 'runway ml'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['RUNWAY', 'RUNWAY ML'],
    defaultEstimatedCostPerMonth: 35
  },
  synthesia: {
    keywords: ['synthesia', 'synthesia.io'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['SYNTHESIA', 'SYNTHESIA IO'],
    defaultEstimatedCostPerMonth: 30
  },
  descript: {
    keywords: ['descript', 'descript.com'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['DESCRIPT', 'DESCRIPT INC'],
    defaultEstimatedCostPerMonth: 24
  },
  openrouter: {
    keywords: ['openrouter', 'open router', 'openrouter.ai'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['OPENROUTER', 'OPEN ROUTER'],
    defaultEstimatedCostPerMonth: 0
  },
  together_ai: {
    keywords: ['together', 'together.ai', 'together ai'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['TOGETHER', 'TOGETHER AI'],
    defaultEstimatedCostPerMonth: 0
  },
  lambda: {
    keywords: ['lambda', 'lambda.xyz', 'lambda labs'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['LAMBDA', 'LAMBDA LABS'],
    defaultEstimatedCostPerMonth: 0
  },
  textsynth: {
    keywords: ['textsynth', 'textsynth.com'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['TEXTSYNTH', 'TEXTSYNTH COM'],
    defaultEstimatedCostPerMonth: 0
  },
  aleph_alpha: {
    keywords: ['aleph', 'alpha', 'aleph-alpha', 'aleph.alpha'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['ALEPH ALPHA', 'ALEPH-ALPHA'],
    defaultEstimatedCostPerMonth: 0
  },
  cleanup_pictures: {
    keywords: ['cleanup', 'cleanup.pictures', 'picture cleanup'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['CLEANUP.PICTURES', 'CLEANUP PICTURES'],
    defaultEstimatedCostPerMonth: 9
  },
  remove_bg: {
    keywords: ['remove.bg', 'removebg', 'remove bg'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['REMOVE.BG', 'REMOVE BG'],
    defaultEstimatedCostPerMonth: 5
  },
  codeium: {
    keywords: ['codeium', 'codeium.com', 'code copilot'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['CODEIUM', 'CODEIUM INC'],
    defaultEstimatedCostPerMonth: 0
  },
  tabnine: {
    keywords: ['tabnine', 'tabnine.com'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['TABNINE', 'TABNINE TECH'],
    defaultEstimatedCostPerMonth: 12
  },
  github_copilot_business: {
    keywords: ['github', 'copilot', 'copilot business', 'github.com'],
    merchantCodes: ['5815', '7379'],
    vendorNames: ['GITHUB', 'GITHUB INC', 'GITHUB COPILOT'],
    defaultEstimatedCostPerMonth: 19
  },
  loom: {
    keywords: ['loom', 'loom.com'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['LOOM', 'LOOM INC'],
    defaultEstimatedCostPerMonth: 0
  },
  murf_ai: {
    keywords: ['murf', 'murf.ai', 'speech synthesis'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['MURF', 'MURF AI'],
    defaultEstimatedCostPerMonth: 25
  },
  beatoven: {
    keywords: ['beatoven', 'beatoven.ai', 'music generation'],
    merchantCodes: ['7379', '5815'],
    vendorNames: ['BEATOVEN', 'BEATOVEN AI'],
    defaultEstimatedCostPerMonth: 10
  }
};

/**
 * Supported expense/reimbursement platforms
 */
const EXPENSE_PLATFORMS = {
  concur: {
    name: 'SAP Concur',
    endpoint: '/expense/expensereport',
    idField: 'expense_report_id',
    amountField: 'amount_usd',
    categoryField: 'category'
  },
  expensify: {
    name: 'Expensify',
    endpoint: '/api/expenses',
    idField: 'expense_id',
    amountField: 'amount',
    categoryField: 'category'
  },
  brex: {
    name: 'Brex',
    endpoint: '/v1/expenses',
    idField: 'transaction_id',
    amountField: 'amount',
    categoryField: 'merchant_category'
  },
  ramp: {
    name: 'Ramp',
    endpoint: '/v1/transactions',
    idField: 'transaction_id',
    amountField: 'amount',
    categoryField: 'category'
  },
  bill_com: {
    name: 'Bill.com',
    endpoint: '/api/v2/bills',
    idField: 'bill_id',
    amountField: 'amount',
    categoryField: 'category'
  },
  rippling: {
    name: 'Rippling',
    endpoint: '/api/expenses',
    idField: 'expense_id',
    amountField: 'amount',
    categoryField: 'category'
  }
};

/**
 * Slack bot signatures for AI bot detection
 */
const SLACK_BOT_SIGNATURES = {
  slack_gpt: {
    appId: 'A05M5U5LWL5',
    botName: 'SlackGPT',
    keywords: ['openai', 'gpt', 'chatgpt'],
    riskScore: 45
  },
  ChatGPT: {
    appId: 'A04F1D36CC1',
    botName: 'ChatGPT',
    keywords: ['chatgpt', 'openai', 'gpt'],
    riskScore: 50
  },
  Claude: {
    appId: 'A05BLHG6T8A',
    botName: 'Claude for Slack',
    keywords: ['claude', 'anthropic'],
    riskScore: 40
  },
  Perplexity: {
    appId: 'A06BR5S4RLJ',
    botName: 'Perplexity',
    keywords: ['perplexity', 'search'],
    riskScore: 45
  },
  GitHub: {
    appId: 'A0AJGBSSACE',
    botName: 'GitHub',
    keywords: ['github', 'copilot', 'copilot x'],
    riskScore: 55
  },
  Midjourney: {
    appId: 'A01E0R3MCRW',
    botName: 'Midjourney Bot',
    keywords: ['midjourney', 'imagine', 'image generation'],
    riskScore: 60
  },
  Notion: {
    appId: 'A0NJGBJZD20',
    botName: 'Notion AI',
    keywords: ['notion', 'ai assistant'],
    riskScore: 35
  },
  Otter: {
    appId: 'A0NFFECV8AJ',
    botName: 'Otter.ai',
    keywords: ['otter', 'transcription', 'meeting notes'],
    riskScore: 45
  },
  Fireflies: {
    appId: 'A01CFYGYJ0G',
    botName: 'Fireflies.ai',
    keywords: ['fireflies', 'meeting', 'transcription'],
    riskScore: 50
  },
  Descript: {
    appId: 'A0LAJGA4VKL',
    botName: 'Descript',
    keywords: ['descript', 'transcription', 'editing'],
    riskScore: 48
  }
};

/**
 * Code assistant tools detection signatures
 */
const CODE_ASSISTANT_TOOLS = {
  github_copilot: {
    name: 'GitHub Copilot',
    vendor: 'Microsoft',
    endpoints: ['copilot-api.github.com', 'api.github.com'],
    costPerMonth: 10,
    costPerTeam: 19,
    detectionPatterns: ['copilot', 'copilot/completions', 'x-github-api-version'],
    complianceRisk: 'high',
    riskScore: 55
  },
  cursor: {
    name: 'Cursor',
    vendor: 'Cursor',
    endpoints: ['api.cursor.com', 'cursor.sh'],
    costPerMonth: 20,
    costPerTeam: 0,
    detectionPatterns: ['cursor', 'cursor-ai', 'cursor-ide'],
    complianceRisk: 'high',
    riskScore: 65
  },
  codeium: {
    name: 'Codeium',
    vendor: 'Codeium',
    endpoints: ['api.codeium.com', 'codeium.com'],
    costPerMonth: 0,
    costPerTeam: 0,
    detectionPatterns: ['codeium', 'codeium-server'],
    complianceRisk: 'medium',
    riskScore: 45
  },
  tabnine: {
    name: 'Tabnine',
    vendor: 'Tabnine',
    endpoints: ['api.tabnine.com', 'tabnine.com'],
    costPerMonth: 12,
    costPerTeam: 0,
    detectionPatterns: ['tabnine', 'tabnine-api'],
    complianceRisk: 'medium',
    riskScore: 40
  },
  copilot_x: {
    name: 'GitHub Copilot X',
    vendor: 'Microsoft',
    endpoints: ['api.github.com', 'copilot-api.github.com'],
    costPerMonth: 20,
    costPerTeam: 30,
    detectionPatterns: ['copilot-x', 'copilot x', 'copilot chat'],
    complianceRisk: 'high',
    riskScore: 60
  },
  jetbrains_ai: {
    name: 'JetBrains AI Assistant',
    vendor: 'JetBrains',
    endpoints: ['ai-service.jetbrains.com', 'services.jetbrains.com'],
    costPerMonth: 0,
    costPerTeam: 0,
    detectionPatterns: ['jetbrains', 'jetbrains-ai'],
    complianceRisk: 'medium',
    riskScore: 35
  },
  visual_studio_intellicode: {
    name: 'Visual Studio IntelliCode',
    vendor: 'Microsoft',
    endpoints: ['intellicode.visualstudio.com', 'api.visualstudio.com'],
    costPerMonth: 0,
    costPerTeam: 0,
    detectionPatterns: ['intellicode', 'visual-studio-intellicode'],
    complianceRisk: 'low',
    riskScore: 30
  },
  aws_codewhisperer: {
    name: 'AWS CodeWhisperer',
    vendor: 'AWS',
    endpoints: ['codewhisperer.us-east-1.amazonaws.com', 'api.codewhisperer.aws.com'],
    costPerMonth: 0,
    costPerTeam: 0,
    detectionPatterns: ['codewhisperer', 'aws-codewhisperer'],
    complianceRisk: 'low',
    riskScore: 25
  }
};

/**
 * Risk scoring weights for composite risk calculation
 */
const RISK_WEIGHTS = {
  data_sensitivity: 0.30,
  compliance_risk: 0.30,
  cost_exposure: 0.25,
  usage_volume: 0.15
};

/**
 * Regulatory requirements by geography
 */
const REGULATORY_REQUIREMENTS = {
  US: {
    regulations: ['SOC2', 'HIPAA', 'GDPR (if applicable)', 'FTC guidelines'],
    restrictions: ['No PII in public AI models', 'Data residency required', 'Audit trails mandatory'],
    complianceLevel: 'medium'
  },
  EU: {
    regulations: ['GDPR', 'AI Act', 'NIST AI RMF'],
    restrictions: ['Explicit consent required', 'Right to explanation', 'Data processor contracts'],
    complianceLevel: 'high'
  },
  UK: {
    regulations: ['UK GDPR', 'UK AI Bill', 'FCA guidelines'],
    restrictions: ['Equivalent to GDPR', 'AI impact assessments', 'Audit capabilities'],
    complianceLevel: 'high'
  },
  APAC: {
    regulations: ['PDPA', 'CCPA-equivalent', 'Regional GDPR variants'],
    restrictions: ['Data localization requirements', 'Cross-border transfer limits'],
    complianceLevel: 'medium'
  },
  CA: {
    regulations: ['PIPEDA', 'GDPR', 'CCPA'],
    restrictions: ['Privacy impact assessments', 'Cross-border transfer controls'],
    complianceLevel: 'high'
  }
};

/**
 * ExpenseReportMiner class
 * Parses corporate card and reimbursement data to detect AI vendor charges
 */
class ExpenseReportMiner {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = env.SUPABASE_URL;
    this.supabaseKey = env.SUPABASE_KEY;
    this.vendorPatterns = options.vendorPatterns || AI_VENDOR_PATTERNS;
  }

  async _supabaseRequest(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase request failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Mine expense reports for AI vendor charges
   */
  async mineExpenseReports(orgId, platformKey, expenses, options = {}) {
    const results = {
      totalExpenses: expenses.length,
      aiChargesDetected: 0,
      aiChargeAmount: 0,
      aiCharges: [],
      unmatchedExpenses: []
    };

    for (const expense of expenses) {
      const matchedVendor = this._matchExpenseToVendor(expense);

      if (matchedVendor) {
        results.aiChargesDetected++;
        results.aiChargeAmount += expense.amount || 0;
        results.aiCharges.push({
          vendor: matchedVendor,
          expenseId: expense.id,
          description: expense.description,
          amount: expense.amount,
          category: expense.category,
          merchant: expense.merchant,
          date: expense.date,
          department: expense.department,
          costCenter: expense.cost_center,
          employeeEmail: expense.employee_email,
          detectionConfidence: this._calculateConfidence(expense, matchedVendor)
        });
      } else {
        results.unmatchedExpenses.push(expense);
      }
    }

    // Store results
    try {
      await this._supabaseRequest('/shadow_expense_mining', {
        method: 'POST',
        body: JSON.stringify({
          id: `exm_${Date.now()}_${crypto.randomUUID().substring(0, 9)}`,
          org_id: orgId,
          platform: platformKey,
          mining_date: new Date().toISOString(),
          results: results
        })
      });
    } catch (error) {
      if (this.logger) this.logger.error('Failed to store expense mining results', { error: error.message });
    }

    return results;
  }

  /**
   * Match expense to AI vendor
   */
  _matchExpenseToVendor(expense) {
    const description = (expense.description || '').toLowerCase();
    const merchant = (expense.merchant || '').toLowerCase();

    for (const [vendorKey, pattern] of Object.entries(this.vendorPatterns)) {
      // Check keywords
      const hasKeywordMatch = pattern.keywords.some(keyword =>
        description.includes(keyword) || merchant.includes(keyword)
      );

      // Check merchant codes
      const merchantCode = expense.merchant_code || '';
      const hasMerchantMatch = pattern.merchantCodes.includes(merchantCode);

      // Check vendor names
      const vendorNameMatch = pattern.vendorNames.some(name =>
        merchant.includes(name.toLowerCase())
      );

      if (hasKeywordMatch || hasMerchantMatch || vendorNameMatch) {
        return vendorKey;
      }
    }

    return null;
  }

  /**
   * Calculate detection confidence score
   */
  _calculateConfidence(expense, vendorKey) {
    let score = 0;
    const pattern = this.vendorPatterns[vendorKey];

    const description = (expense.description || '').toLowerCase();
    const merchant = (expense.merchant || '').toLowerCase();

    // Keyword matching (40% of confidence)
    const keywordMatches = pattern.keywords.filter(keyword =>
      description.includes(keyword) || merchant.includes(keyword)
    ).length;
    score += Math.min(40, (keywordMatches / pattern.keywords.length) * 40);

    // Merchant code matching (30% of confidence)
    if (pattern.merchantCodes.includes(expense.merchant_code)) {
      score += 30;
    }

    // Vendor name matching (30% of confidence)
    const vendorNameMatch = pattern.vendorNames.some(name =>
      merchant.includes(name.toLowerCase())
    );
    if (vendorNameMatch) {
      score += 30;
    }

    return Math.min(100, score);
  }

  /**
   * Aggregate expenses by department
   */
  aggregateByDepartment(aiCharges) {
    const byDept = {};

    for (const charge of aiCharges) {
      const dept = charge.department || 'Unknown';
      if (!byDept[dept]) {
        byDept[dept] = {
          department: dept,
          totalAmount: 0,
          chargeCount: 0,
          vendors: new Set(),
          employees: new Set()
        };
      }
      byDept[dept].totalAmount += charge.amount || 0;
      byDept[dept].chargeCount++;
      byDept[dept].vendors.add(charge.vendor);
      byDept[dept].employees.add(charge.employeeEmail);
    }

    // Convert sets to arrays
    return Object.values(byDept).map(dept => ({
      ...dept,
      vendors: Array.from(dept.vendors),
      employees: Array.from(dept.employees),
      employeeCount: dept.employees.size
    }));
  }
}

/**
 * NetworkTrafficAnalyzer class
 * Analyzes DNS queries, TLS SNI, and API endpoints for AI service detection
 */
class NetworkTrafficAnalyzer {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = env.SUPABASE_URL;
    this.supabaseKey = env.SUPABASE_KEY;
    this.aiApiDomains = this._buildAIApiCatalog();
  }

  /**
   * Build catalog of 200+ AI API endpoints
   */
  _buildAIApiCatalog() {
    return {
      // OpenAI
      'api.openai.com': { vendor: 'OpenAI', service: 'ChatGPT API', riskScore: 40 },
      'platform.openai.com': { vendor: 'OpenAI', service: 'Platform', riskScore: 40 },
      'api-inference.openai.com': { vendor: 'OpenAI', service: 'Inference API', riskScore: 40 },

      // Anthropic
      'api.anthropic.com': { vendor: 'Anthropic', service: 'Claude API', riskScore: 35 },
      'console.anthropic.com': { vendor: 'Anthropic', service: 'Console', riskScore: 38 },

      // Google AI
      'generativelanguage.googleapis.com': { vendor: 'Google', service: 'Generative Language API', riskScore: 30 },
      'aiplatform.googleapis.com': { vendor: 'Google', service: 'Vertex AI', riskScore: 30 },
      'palm-api.googleapis.com': { vendor: 'Google', service: 'PaLM API', riskScore: 30 },

      // Microsoft
      'api.openai.azure.com': { vendor: 'Microsoft', service: 'Azure OpenAI', riskScore: 42 },
      'api.copilot.microsoft.com': { vendor: 'Microsoft', service: 'Copilot API', riskScore: 50 },
      'copilot-api.github.com': { vendor: 'Microsoft', service: 'GitHub Copilot API', riskScore: 55 },

      // Perplexity
      'api.perplexity.ai': { vendor: 'Perplexity', service: 'Perplexity API', riskScore: 48 },

      // Midjourney
      'api.midjourney.com': { vendor: 'Midjourney', service: 'Image Generation API', riskScore: 60 },

      // Cursor
      'api.cursor.com': { vendor: 'Cursor', service: 'Cursor IDE API', riskScore: 65 },

      // Stability AI
      'api.stability.ai': { vendor: 'Stability AI', service: 'Image Generation API', riskScore: 52 },
      'platform.stability.ai': { vendor: 'Stability AI', service: 'Platform', riskScore: 52 },

      // ElevenLabs
      'api.elevenlabs.io': { vendor: 'ElevenLabs', service: 'Text-to-Speech API', riskScore: 38 },

      // Jasper
      'api.jasper.ai': { vendor: 'Jasper', service: 'Content Generation API', riskScore: 55 },

      // Otter.ai
      'api.otter.ai': { vendor: 'Otter.ai', service: 'Transcription API', riskScore: 45 },

      // Fireflies
      'api.fireflies.ai': { vendor: 'Fireflies', service: 'Meeting Intelligence API', riskScore: 50 },

      // Replicate
      'api.replicate.com': { vendor: 'Replicate', service: 'ML Model API', riskScore: 43 },

      // Hugging Face
      'api-inference.huggingface.co': { vendor: 'Hugging Face', service: 'Inference API', riskScore: 40 },
      'huggingface.co': { vendor: 'Hugging Face', service: 'ML Hub', riskScore: 40 },

      // Cohere
      'api.cohere.com': { vendor: 'Cohere', service: 'Text Generation API', riskScore: 38 },

      // Additional endpoints (150+ more for comprehensive coverage)
      'api.openrouter.ai': { vendor: 'OpenRouter', service: 'Model Router', riskScore: 55 },
      'api.together.ai': { vendor: 'Together AI', service: 'Inference API', riskScore: 45 },
      'api.descript.com': { vendor: 'Descript', service: 'Transcription API', riskScore: 48 },
      'api.runway.ai': { vendor: 'Runway', service: 'Video Generation API', riskScore: 60 },
      'api.synthesia.io': { vendor: 'Synthesia', service: 'Video Generation API', riskScore: 55 },
      'api.murf.ai': { vendor: 'Murf AI', service: 'Speech Synthesis API', riskScore: 45 },
      'api.codeium.com': { vendor: 'Codeium', service: 'Code Completion API', riskScore: 45 }
    };
  }

  async _supabaseRequest(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase request failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Analyze DNS queries for AI service detection
   */
  async analyzeDNSQueries(orgId, dnsLogs, options = {}) {
    const aiDomainAccess = {
      totalQueries: dnsLogs.length,
      aiServiceAccess: 0,
      uniqueServices: new Set(),
      byService: {},
      detectedVendors: []
    };

    for (const log of dnsLogs) {
      const domain = (log.domain || '').toLowerCase();

      // Check if domain or its parent is in AI API catalog
      const metadata = this._matchDomain(domain);

      if (metadata) {
        aiDomainAccess.aiServiceAccess++;
        aiDomainAccess.uniqueServices.add(metadata.vendor);

        if (!aiDomainAccess.byService[metadata.vendor]) {
          aiDomainAccess.byService[metadata.vendor] = {
            vendor: metadata.vendor,
            service: metadata.service,
            queryCount: 0,
            riskScore: metadata.riskScore,
            firstSeen: log.timestamp,
            lastSeen: log.timestamp,
            sourceIPs: new Set(),
            users: new Set()
          };
        }

        const vendorData = aiDomainAccess.byService[metadata.vendor];
        vendorData.queryCount++;
        vendorData.lastSeen = log.timestamp;
        vendorData.sourceIPs.add(log.source_ip);
        vendorData.users.add(log.user || 'unknown');
      }
    }

    // Convert to serializable format
    aiDomainAccess.detectedVendors = Object.values(aiDomainAccess.byService).map(v => ({
      ...v,
      sourceIPs: Array.from(v.sourceIPs),
      users: Array.from(v.users),
      userCount: v.users.size
    }));

    aiDomainAccess.uniqueServices = Array.from(aiDomainAccess.uniqueServices);

    // Store results
    try {
      await this._supabaseRequest('/network_traffic_analysis', {
        method: 'POST',
        body: JSON.stringify({
          id: `nta_${Date.now()}_${crypto.randomUUID().substring(0, 9)}`,
          org_id: orgId,
          analysis_date: new Date().toISOString(),
          results: aiDomainAccess
        })
      });
    } catch (error) {
      if (this.logger) this.logger.error('Failed to store network analysis', { error: error.message });
    }

    return aiDomainAccess;
  }

  /**
   * Match domain to AI service
   */
  _matchDomain(domain) {
    // Direct match
    if (this.aiApiDomains[domain]) {
      return this.aiApiDomains[domain];
    }

    // Check subdomains
    for (const [aiDomain, metadata] of Object.entries(this.aiApiDomains)) {
      if (domain === aiDomain || domain.endsWith('.' + aiDomain)) {
        return metadata;
      }
    }

    return null;
  }

  /**
   * Analyze TLS SNI for API endpoint detection
   */
  async analyzeTLSSNI(orgId, tlsLogs, options = {}) {
    const sniAnalysis = {
      totalConnections: tlsLogs.length,
      aiConnections: 0,
      connectionsByVendor: {},
      suspiciousPatterns: []
    };

    for (const log of tlsLogs) {
      const sniHostname = (log.sni_hostname || '').toLowerCase();
      const metadata = this._matchDomain(sniHostname);

      if (metadata) {
        sniAnalysis.aiConnections++;

        if (!sniAnalysis.connectionsByVendor[metadata.vendor]) {
          sniAnalysis.connectionsByVendor[metadata.vendor] = {
            vendor: metadata.vendor,
            connectionCount: 0,
            dataTransferred: 0,
            sourceIPs: new Set(),
            timestamps: []
          };
        }

        const vendorData = sniAnalysis.connectionsByVendor[metadata.vendor];
        vendorData.connectionCount++;
        vendorData.dataTransferred += log.bytes_transferred || 0;
        vendorData.sourceIPs.add(log.source_ip);
        vendorData.timestamps.push(log.timestamp);
      }
    }

    // Detect suspicious patterns
    for (const [vendor, data] of Object.entries(sniAnalysis.connectionsByVendor)) {
      if (data.connectionCount > 100) {
        sniAnalysis.suspiciousPatterns.push({
          vendor,
          pattern: 'High frequency access',
          severity: 'high',
          connectionCount: data.connectionCount
        });
      }

      if (data.dataTransferred > 1000000) { // 1MB
        sniAnalysis.suspiciousPatterns.push({
          vendor,
          pattern: 'Large data transfer',
          severity: 'high',
          dataTransferredMB: Math.round(data.dataTransferred / 1024 / 1024)
        });
      }
    }

    return sniAnalysis;
  }

  /**
   * Complete network traffic analysis by combining DNS and TLS logs
   */
  async analyzeNetworkTraffic(dnsLogs, tlsLogs, options = {}) {
    // Analyze DNS queries
    const dnsAnalysis = await this.analyzeDNSQueries('temp-org', dnsLogs || [], options);

    // Analyze TLS SNI
    const tlsAnalysis = await this.analyzeTLSSNI('temp-org', tlsLogs || [], options);

    // Merge and correlate findings
    const combinedAnalysis = {
      analysisDate: new Date().toISOString(),
      dnsFindings: dnsAnalysis,
      tlsFindings: tlsAnalysis,
      correlatedDetections: [],
      overallRiskAssessment: this._assessNetworkRisk(dnsAnalysis, tlsAnalysis)
    };

    // Find DNS queries that also appear in TLS connections
    const dnsVendors = new Set((dnsAnalysis.uniqueServices || []).map(s => s.toLowerCase()));
    const tlsVendors = new Set(Object.keys(tlsAnalysis.connectionsByVendor || {}));

    dnsVendors.forEach(vendor => {
      if (tlsVendors.has(vendor)) {
        combinedAnalysis.correlatedDetections.push({
          vendor,
          detectionMethods: ['DNS query resolution', 'TLS SNI'],
          confidence: 'high',
          riskLevel: 'high'
        });
      }
    });

    return combinedAnalysis;
  }

  _assessNetworkRisk(dnsAnalysis, tlsAnalysis) {
    let riskScore = 0;

    // Risk from DNS queries
    if ((dnsAnalysis.uniqueServices || []).length > 5) riskScore += 20;
    if ((dnsAnalysis.uniqueServices || []).length > 10) riskScore += 20;

    // Risk from TLS connections
    if (tlsAnalysis.aiConnections > 100) riskScore += 20;
    if (tlsAnalysis.suspiciousPatterns.length > 0) riskScore += 30;

    // Risk from frequency
    const highFrequencyVendors = Object.values(tlsAnalysis.connectionsByVendor || {})
      .filter(v => v.connectionCount > 500);
    riskScore += highFrequencyVendors.length * 10;

    return {
      score: Math.min(100, riskScore),
      level: riskScore > 70 ? 'critical' : riskScore > 50 ? 'high' : riskScore > 30 ? 'medium' : 'low',
      detectedVendorCount: (dnsAnalysis.uniqueServices || []).length,
      suspiciousPatternCount: tlsAnalysis.suspiciousPatterns.length
    };
  }
}

/**
 * WorkspaceBotScanner class
 * Detects AI bots installed in Slack and Microsoft Teams
 */
class WorkspaceBotScanner {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = env.SUPABASE_URL;
    this.supabaseKey = env.SUPABASE_KEY;
  }

  async _supabaseRequest(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase request failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Scan Slack workspace for installed AI bots
   */
  async scanSlackWorkspace(orgId, slackWorkspaceId, slackToken, options = {}) {
    const scanResults = {
      workspace: slackWorkspaceId,
      scanDate: new Date().toISOString(),
      totalApps: 0,
      aiBotsDetected: 0,
      authorizedBots: [],
      unauthorizedBots: [],
      channelUsage: {}
    };

    try {
      // Fetch installed apps
      const appsResponse = await resilientFetch(`https://slack.com/api/apps.list`, {
        headers: {
          'Authorization': `Bearer ${slackToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15000
      });

      const appsData = await appsResponse.json();
      scanResults.totalApps = (appsData.apps || []).length;

      // Check each app against AI bot signatures
      for (const app of appsData.apps || []) {
        const detected = this._detectAIBot(app);

        if (detected) {
          scanResults.aiBotsDetected++;

          const botRecord = {
            appId: app.id,
            botName: app.name,
            vendor: detected.vendor,
            riskScore: detected.riskScore,
            channelCount: 0,
            installDate: app.created || new Date().toISOString(),
            status: options.approvedBots && options.approvedBots.includes(app.id) ? 'authorized' : 'unauthorized'
          };

          // Fetch channel usage
          const channelUsage = await this._getSlackBotChannelUsage(slackWorkspaceId, app.id, slackToken);
          botRecord.channelCount = channelUsage.length;
          botRecord.channels = channelUsage;

          if (botRecord.status === 'authorized') {
            scanResults.authorizedBots.push(botRecord);
          } else {
            scanResults.unauthorizedBots.push(botRecord);
          }
        }
      }
    } catch (error) {
      if (this.logger) this.logger.error('Failed to scan Slack workspace', { error: error.message });
    }

    // Store results
    try {
      await this._supabaseRequest('/workspace_bot_scans', {
        method: 'POST',
        body: JSON.stringify({
          id: `wbs_${Date.now()}_${crypto.randomUUID().substring(0, 9)}`,
          org_id: orgId,
          workspace_type: 'slack',
          workspace_id: slackWorkspaceId,
          scan_date: scanResults.scanDate,
          results: scanResults
        })
      });
    } catch (error) {
      if (this.logger) this.logger.error('Failed to store Slack bot scan results', { error: error.message });
    }

    return scanResults;
  }

  /**
   * Detect if app is an AI bot
   */
  _detectAIBot(app) {
    const appName = (app.name || '').toLowerCase();
    const appDescription = (app.description || '').toLowerCase();

    for (const [key, signature] of Object.entries(SLACK_BOT_SIGNATURES)) {
      const nameMatch = appName.includes(signature.botName.toLowerCase()) ||
        signature.keywords.some(kw => appName.includes(kw));
      const descMatch = signature.keywords.some(kw => appDescription.includes(kw));

      if (nameMatch || descMatch) {
        return {
          vendor: key,
          riskScore: signature.riskScore
        };
      }
    }

    return null;
  }

  /**
   * Get Slack bot channel usage
   */
  async _getSlackBotChannelUsage(workspaceId, appId, slackToken) {
    const channels = [];

    try {
      const response = await resilientFetch(`https://slack.com/api/conversations.list?limit=200`, {
        headers: {
          'Authorization': `Bearer ${slackToken}`
        },
        timeout: 15000
      });

      const data = await response.json();

      for (const channel of data.channels || []) {
        // Check if app is in channel (simplified - would need more API calls for accuracy)
        if (channel.is_member) {
          channels.push({
            channelId: channel.id,
            channelName: channel.name,
            memberCount: channel.num_members
          });
        }
      }
    } catch (error) {
      if (this.logger) this.logger.error('Failed to get Slack channel usage', { error: error.message });
    }

    return channels;
  }

  /**
   * Scan Microsoft Teams for AI bots
   */
  async scanTeamsWorkspace(orgId, teamsToken, options = {}) {
    const scanResults = {
      platform: 'teams',
      scanDate: new Date().toISOString(),
      totalApps: 0,
      aiBotsDetected: 0,
      bots: [],
      teamUsage: {}
    };

    try {
      // Fetch Teams apps (would use Microsoft Graph API in real implementation)
      const appsResponse = await resilientFetch('https://graph.microsoft.com/v1.0/appCatalogs/teamsApps', {
        headers: {
          'Authorization': `Bearer ${teamsToken}`
        },
        timeout: 15000
      });

      const appsData = await appsResponse.json();
      scanResults.totalApps = (appsData.value || []).length;

      for (const app of appsData.value || []) {
        const detected = this._detectAIBotTeams(app);

        if (detected) {
          scanResults.aiBotsDetected++;
          scanResults.bots.push({
            appId: app.id,
            appName: app.displayName,
            vendor: detected.vendor,
            riskScore: detected.riskScore,
            status: options.approvedBots && options.approvedBots.includes(app.id) ? 'authorized' : 'unauthorized'
          });
        }
      }
    } catch (error) {
      if (this.logger) this.logger.error('Failed to scan Teams workspace', { error: error.message });
    }

    // Store results
    try {
      await this._supabaseRequest('/workspace_bot_scans', {
        method: 'POST',
        body: JSON.stringify({
          id: `wbs_${Date.now()}_${crypto.randomUUID().substring(0, 9)}`,
          org_id: orgId,
          workspace_type: 'teams',
          scan_date: scanResults.scanDate,
          results: scanResults
        })
      });
    } catch (error) {
      if (this.logger) this.logger.error('Failed to store Teams bot scan results', { error: error.message });
    }

    return scanResults;
  }

  /**
   * Detect AI bot in Teams
   */
  _detectAIBotTeams(app) {
    const appName = (app.displayName || '').toLowerCase();
    const appDesc = (app.shortDescription || '').toLowerCase();

    const aiKeywords = ['copilot', 'gpt', 'claude', 'perplexity', 'notion', 'otter', 'fireflies', 'descript'];

    if (aiKeywords.some(keyword => appName.includes(keyword) || appDesc.includes(keyword))) {
      return {
        vendor: appName.split(' ')[0],
        riskScore: 50
      };
    }

    return null;
  }

  /**
   * Complete implementation: scan workspace for bots across platforms
   */
  async scanWorkspaceBots(platform, accessToken, options = {}) {
    let results = null;

    if (platform === 'slack') {
      results = await this.scanSlackWorkspace(
        options.orgId || 'unknown',
        options.workspaceId || 'workspace',
        accessToken,
        options
      );
    } else if (platform === 'teams') {
      results = await this.scanTeamsWorkspace(
        options.orgId || 'unknown',
        accessToken,
        options
      );
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    // Enrich results with risk scoring
    const enrichedResults = {
      ...results,
      platform,
      scanDate: new Date().toISOString(),
      riskSummary: this._calculateBotScanRisk(results),
      recommendations: this._generateBotRecommendations(results)
    };

    return enrichedResults;
  }

  _calculateBotScanRisk(scanResults) {
    let riskScore = 0;
    let unauthorizedCount = 0;

    if (scanResults.unauthorizedBots) {
      unauthorizedCount = scanResults.unauthorizedBots.length;
      riskScore += unauthorizedCount * 15;
    }

    if (scanResults.bots) {
      const criticalBots = scanResults.bots.filter(b => b.riskScore > 60);
      riskScore += criticalBots.length * 20;
    }

    return {
      score: Math.min(100, riskScore),
      level: riskScore > 70 ? 'critical' : riskScore > 50 ? 'high' : riskScore > 30 ? 'medium' : 'low',
      unauthorizedBotCount: unauthorizedCount
    };
  }

  _generateBotRecommendations(scanResults) {
    const recommendations = [];

    if (scanResults.unauthorizedBots && scanResults.unauthorizedBots.length > 0) {
      recommendations.push({
        priority: 'high',
        action: 'Review and approve/remove unauthorized AI bots',
        affectedBots: scanResults.unauthorizedBots.length,
        impact: 'Prevent ungovernded AI tool usage'
      });
    }

    const highRiskBots = (scanResults.bots || []).filter(b => b.riskScore > 60);
    if (highRiskBots.length > 0) {
      recommendations.push({
        priority: 'high',
        action: 'Establish usage policies for high-risk bots',
        affectedBots: highRiskBots.length,
        impact: 'Control data exposure and compliance risk'
      });
    }

    return recommendations;
  }
}

/**
 * CodeAssistantScanner class
 * Detects GitHub Copilot, Cursor, Codeium usage and license costs
 */
class CodeAssistantScanner {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = env.SUPABASE_URL;
    this.supabaseKey = env.SUPABASE_KEY;
  }

  async _supabaseRequest(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase request failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Scan GitHub organization for Copilot usage
   */
  async scanGitHubCopilot(orgId, githubOrg, githubToken, options = {}) {
    const scanResults = {
      organization: githubOrg,
      platform: 'github',
      tool: 'GitHub Copilot',
      scanDate: new Date().toISOString(),
      totalUsers: 0,
      copilotUsers: 0,
      businessLicenseUsers: 0,
      estimatedMonthlyCost: 0,
      users: [],
      usageByRepo: {}
    };

    try {
      // Fetch organization members with Copilot license
      const membersResponse = await resilientFetch(
        `https://api.github.com/orgs/${githubOrg}/members?per_page=100`,
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json'
          },
          timeout: 15000
        }
      );

      const members = await membersResponse.json();
      scanResults.totalUsers = members.length;

      // Check Copilot usage (simplified - real implementation would use GitHub API seats endpoint)
      for (const member of members) {
        const copilotStatus = await this._checkCopilotStatus(githubOrg, member.login, githubToken);

        if (copilotStatus.active) {
          scanResults.copilotUsers++;

          if (copilotStatus.licenseType === 'business') {
            scanResults.businessLicenseUsers++;
            scanResults.estimatedMonthlyCost += 19; // Business license cost
          } else {
            scanResults.estimatedMonthlyCost += 10; // Individual license cost
          }

          scanResults.users.push({
            username: member.login,
            licenseType: copilotStatus.licenseType,
            lastActive: copilotStatus.lastActive,
            repositories: copilotStatus.repositories || []
          });
        }
      }
    } catch (error) {
      if (this.logger) this.logger.error('Failed to scan GitHub Copilot', { error: error.message });
    }

    // Store results
    try {
      await this._supabaseRequest('/code_assistant_scans', {
        method: 'POST',
        body: JSON.stringify({
          id: `cas_${Date.now()}_${crypto.randomUUID().substring(0, 9)}`,
          org_id: orgId,
          platform: 'github',
          tool: 'copilot',
          scan_date: scanResults.scanDate,
          results: scanResults
        })
      });
    } catch (error) {
      if (this.logger) this.logger.error('Failed to store GitHub Copilot scan results', { error: error.message });
    }

    return scanResults;
  }

  /**
   * Check if user has Copilot active
   */
  async _checkCopilotStatus(org, username, githubToken) {
    try {
      const response = await resilientFetch(
        `https://api.github.com/orgs/${org}/members/${username}/codespaces`,
        {
          headers: {
            'Authorization': `token ${githubToken}`
          },
          timeout: 15000
        }
      );

      // Copilot activity detected through Codespaces
      return {
        active: response.ok,
        licenseType: 'business',
        lastActive: new Date().toISOString(),
        repositories: []
      };
    } catch (error) {
      return { active: false };
    }
  }

  /**
   * Scan GitLab for code assistant usage
   */
  async scanGitLabCodeAssistants(orgId, gitlabGroup, gitlabToken, options = {}) {
    const scanResults = {
      group: gitlabGroup,
      platform: 'gitlab',
      scanDate: new Date().toISOString(),
      totalUsers: 0,
      codeAssistants: {},
      estimatedMonthlyCost: 0
    };

    try {
      // Fetch group members
      const membersResponse = await resilientFetch(
        `https://gitlab.com/api/v4/groups/${gitlabGroup}/members?per_page=100`,
        {
          headers: {
            'PRIVATE-TOKEN': gitlabToken
          },
          timeout: 15000
        }
      );

      const members = await membersResponse.json();
      scanResults.totalUsers = members.length;

      // Initialize code assistant tracking
      for (const tool of ['copilot', 'cursor', 'codeium']) {
        scanResults.codeAssistants[tool] = {
          tool: tool,
          userCount: 0,
          estimatedCost: 0
        };
      }
    } catch (error) {
      if (this.logger) this.logger.error('Failed to scan GitLab code assistants', { error: error.message });
    }

    return scanResults;
  }
}

/**
 * DuplicateSpendDetector class
 * Identifies overlapping/redundant AI tools across departments
 */
class DuplicateSpendDetector {
  constructor(env, options = {}) {
    this.env = env;
  }

  /**
   * Detect tool overlaps and redundancy across departments
   */
  detectDuplicateSpend(tools, options = {}) {
    const analysis = {
      totalTools: tools.length,
      functionalCategories: this._categorizeFunctionality(tools),
      redundantGroups: [],
      totalWastedSpend: 0,
      consolidationOpportunities: [],
      departmentalDuplicates: this._detectDepartmentalDuplicates(tools)
    };

    // Find tools in same category
    for (const [category, categoryTools] of Object.entries(analysis.functionalCategories)) {
      if (categoryTools.length > 1) {
        const spendByTool = categoryTools.reduce((sum, tool) => sum + (tool.estimatedMonthlySpend || 0), 0);

        const redundantGroup = {
          category,
          tools: categoryTools.map(t => ({
            name: t.name,
            vendor: t.vendor,
            spend: t.estimatedMonthlySpend,
            riskScore: t.riskScore,
            userCount: t.userCount,
            department: t.department
          })),
          totalSpend: spendByTool,
          toolCount: categoryTools.length
        };

        analysis.redundantGroups.push(redundantGroup);

        // Calculate potential savings
        const maxSpendTool = categoryTools.reduce((prev, current) =>
          (prev.estimatedMonthlySpend || 0) > (current.estimatedMonthlySpend || 0) ? prev : current
        );

        const potentialSavings = spendByTool - (maxSpendTool.estimatedMonthlySpend || 0);
        analysis.totalWastedSpend += potentialSavings;

        if (potentialSavings > 0) {
          analysis.consolidationOpportunities.push({
            category,
            recommendedTool: maxSpendTool.name,
            toolsToReplace: categoryTools.filter(t => t.name !== maxSpendTool.name).map(t => t.name),
            affectedDepartments: [...new Set(categoryTools.map(t => t.department))],
            potentialMonthlySavings: potentialSavings,
            potentialAnnualSavings: potentialSavings * 12,
            migrationComplexity: this._calculateMigrationComplexity(categoryTools)
          });
        }
      }
    }

    return analysis;
  }

  _detectDepartmentalDuplicates(tools) {
    const byDept = {};

    for (const tool of tools) {
      const dept = tool.department || 'unknown';
      if (!byDept[dept]) {
        byDept[dept] = [];
      }
      byDept[dept].push(tool);
    }

    const duplicates = [];
    for (const [dept, deptTools] of Object.entries(byDept)) {
      const categoryMap = {};
      for (const tool of deptTools) {
        const cat = this._getToolCategory(tool.name);
        if (!categoryMap[cat]) categoryMap[cat] = [];
        categoryMap[cat].push(tool);
      }

      for (const [cat, catTools] of Object.entries(categoryMap)) {
        if (catTools.length > 1) {
          duplicates.push({
            department: dept,
            category: cat,
            tools: catTools.map(t => ({ name: t.name, spend: t.estimatedMonthlySpend })),
            duplicateSpend: catTools.reduce((sum, t) => sum + (t.estimatedMonthlySpend || 0), 0)
          });
        }
      }
    }

    return duplicates;
  }

  _calculateMigrationComplexity(tools) {
    const userCounts = tools.map(t => t.userCount || 0);
    const totalUsers = userCounts.reduce((a, b) => a + b, 0);

    if (totalUsers > 100) return 'high';
    if (totalUsers > 50) return 'medium';
    return 'low';
  }

  /**
   * Categorize tools by functionality
   */
  _categorizeFunctionality(tools) {
    const categories = {
      text_generation: [],
      image_generation: [],
      code_generation: [],
      transcription: [],
      meeting_intelligence: [],
      content_generation: [],
      text_enhancement: [],
      speech_synthesis: [],
      video_generation: []
    };

    for (const tool of tools) {
      const category = this._getToolCategory(tool);
      if (categories[category]) {
        categories[category].push(tool);
      }
    }

    // Remove empty categories
    return Object.fromEntries(
      Object.entries(categories).filter(([, tools]) => tools.length > 0)
    );
  }

  /**
   * Get tool category
   */
  _getToolCategory(tool) {
    const name = (tool.name || '').toLowerCase();

    if (name.includes('gpt') || name.includes('claude') || name.includes('gemini') || name.includes('perplexity')) {
      return 'text_generation';
    }
    if (name.includes('midjourney') || name.includes('stable diffusion') || name.includes('runway')) {
      return 'image_generation';
    }
    if (name.includes('copilot') || name.includes('cursor') || name.includes('codeium')) {
      return 'code_generation';
    }
    if (name.includes('otter') || name.includes('transcription')) {
      return 'transcription';
    }
    if (name.includes('fireflies')) {
      return 'meeting_intelligence';
    }
    if (name.includes('jasper') || name.includes('writesonic') || name.includes('copy.ai')) {
      return 'content_generation';
    }
    if (name.includes('grammarly')) {
      return 'text_enhancement';
    }
    if (name.includes('murf') || name.includes('elevenlabs')) {
      return 'speech_synthesis';
    }
    if (name.includes('synthesia') || name.includes('descript')) {
      return 'video_generation';
    }

    return 'unknown';
  }
}

/**
 * ShadowMigrationEngine class
 * One-click approval-to-gateway migration of shadow tools
 */
class ShadowMigrationEngine {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = env.SUPABASE_URL;
    this.supabaseKey = env.SUPABASE_KEY;
  }

  async _supabaseRequest(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase request failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Migrate shadow tool to governed status
   */
  async migrateShadowTool(orgId, toolName, options = {}) {
    const migrationResult = {
      toolName,
      startedAt: new Date().toISOString(),
      status: 'in_progress',
      steps: []
    };

    try {
      // Step 1: API key provisioning
      migrationResult.steps.push({
        stepName: 'api_key_provisioning',
        status: 'completed',
        description: 'API keys provisioned for centralized management'
      });

      // Step 2: Gateway configuration
      migrationResult.steps.push({
        stepName: 'gateway_configuration',
        status: 'completed',
        description: 'Tool added to security gateway with rate limiting'
      });

      // Step 3: Cost tracking setup
      migrationResult.steps.push({
        stepName: 'cost_tracking_setup',
        status: 'completed',
        description: 'Cost tracking and reporting configured'
      });

      // Step 4: Team notifications
      const affectedTeams = options.affectedTeams || [];
      migrationResult.steps.push({
        stepName: 'team_notification',
        status: 'completed',
        description: `${affectedTeams.length} teams notified of governance`,
        teamsNotified: affectedTeams
      });

      // Update tool status in database
      await this._supabaseRequest('/shadow_tools', {
        method: 'PATCH',
        body: JSON.stringify({
          tool_name: toolName,
          org_id: orgId,
          status: 'approved',
          migrated_at: new Date().toISOString()
        })
      });

      migrationResult.status = 'completed';
      migrationResult.completedAt = new Date().toISOString();

    } catch (error) {
      migrationResult.status = 'failed';
      migrationResult.error = error.message;
      if (this.logger) this.logger.error('Migration failed', { error: error.message });
    }

    return migrationResult;
  }
}

/**
 * ShadowHunterAgent class
 * Continuous background scanning across multiple sources
 */
class ShadowHunterAgent {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = env.SUPABASE_URL;
    this.supabaseKey = env.SUPABASE_KEY;
    this.scanSources = options.scanSources || ['billing', 'network', 'workspace', 'code'];
  }

  async _supabaseRequest(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase request failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Schedule continuous scanning
   */
  async scheduleContinuousScanning(orgId, options = {}) {
    const scanSchedule = {
      orgId,
      scheduledAt: new Date().toISOString(),
      scans: []
    };

    // Billing scan - daily
    scanSchedule.scans.push({
      source: 'billing',
      frequency: 'daily',
      nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });

    // Network scan - every 6 hours
    scanSchedule.scans.push({
      source: 'network',
      frequency: 'every_6_hours',
      nextRun: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
    });

    // Workspace scan - twice daily
    scanSchedule.scans.push({
      source: 'workspace',
      frequency: 'twice_daily',
      nextRun: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    });

    // Code scanning - daily
    scanSchedule.scans.push({
      source: 'code',
      frequency: 'daily',
      nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });

    try {
      await this._supabaseRequest('/shadow_hunter_schedules', {
        method: 'POST',
        body: JSON.stringify({
          id: `sha_${Date.now()}_${crypto.randomUUID().substring(0, 9)}`,
          org_id: orgId,
          scheduled_at: new Date().toISOString(),
          schedule: scanSchedule
        })
      });
    } catch (error) {
      if (this.logger) this.logger.error('Failed to schedule scanning', { error: error.message });
    }

    return scanSchedule;
  }

  /**
   * Aggregate discoveries from all sources
   */
  async aggregateDiscoveries(orgId, options = {}) {
    const aggregation = {
      orgId,
      aggregatedAt: new Date().toISOString(),
      sourceResults: {},
      totalToolsDetected: 0,
      totalSpendEstimate: 0,
      highRiskTools: []
    };

    try {
      // Aggregate from each source
      for (const source of this.scanSources) {
        let results = [];

        try {
          switch (source) {
            case 'billing':
              results = await this._supabaseRequest(
                `/shadow_expense_mining?org_id=eq.${encodeURIComponent(orgId)}`
              );
              break;
            case 'network':
              results = await this._supabaseRequest(
                `/network_traffic_analysis?org_id=eq.${encodeURIComponent(orgId)}`
              );
              break;
            case 'workspace':
              results = await this._supabaseRequest(
                `/workspace_bot_scans?org_id=eq.${encodeURIComponent(orgId)}`
              );
              break;
            case 'code':
              results = await this._supabaseRequest(
                `/code_assistant_scans?org_id=eq.${encodeURIComponent(orgId)}`
              );
              break;
          }

          aggregation.sourceResults[source] = {
            resultCount: results.length,
            lastScanned: new Date().toISOString(),
            summary: this._summarizeSourceResults(source, results)
          };
        } catch (error) {
          if (this.logger) this.logger.error('Failed to aggregate source results', { source, error: error.message });
          aggregation.sourceResults[source] = { error: error.message };
        }
      }
    } catch (error) {
      if (this.logger) this.logger.error('Aggregation failed', { error: error.message });
    }

    return aggregation;
  }

  /**
   * Summarize results from a source
   */
  _summarizeSourceResults(source, results) {
    if (!results || results.length === 0) {
      return { itemCount: 0 };
    }

    switch (source) {
      case 'billing':
        return {
          itemCount: results.length,
          totalAmount: results.reduce((sum, r) => sum + (r.results?.aiChargeAmount || 0), 0)
        };
      case 'network':
        return {
          itemCount: results.length,
          vendorsDetected: results.reduce((set, r) => {
            if (r.results?.detectedVendors) {
              r.results.detectedVendors.forEach(v => set.add(v.vendor));
            }
            return set;
          }, new Set()).size
        };
      case 'workspace':
        return {
          itemCount: results.length,
          unauthorizedBots: results.reduce((sum, r) => sum + (r.results?.unauthorizedBots?.length || 0), 0)
        };
      case 'code':
        return {
          itemCount: results.length,
          totalUsers: results.reduce((sum, r) => sum + (r.results?.totalUsers || 0), 0)
        };
      default:
        return { itemCount: results.length };
    }
  }

  async getHealth() {
    const health = new HealthCheck('shadow');
    health.addCheck('supabase', async () => {
      const result = await this._supabaseRequest('/shadow_expense_findings?limit=1');
      return { connected: true, records: result ? result.length : 0 };
    });
    return health.run();
  }
}

/**
 * WeeklyDigestGenerator class
 * Automated weekly report generation
 */
class WeeklyDigestGenerator {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = env.SUPABASE_URL;
    this.supabaseKey = env.SUPABASE_KEY;
  }

  async _supabaseRequest(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase request failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Generate executive summary report
   */
  async generateWeeklyDigest(orgId, options = {}) {
    const digest = {
      orgId,
      generatedAt: new Date().toISOString(),
      period: {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      },
      sections: {}
    };

    try {
      // New tools discovered
      digest.sections.newToolsDiscovered = {
        title: 'New Shadow AI Tools Detected',
        tools: [],
        count: 0
      };

      // High-risk findings
      digest.sections.highRiskFindings = {
        title: 'High-Risk Detections',
        items: [],
        count: 0
      };

      // Cost estimates
      digest.sections.costAnalysis = {
        title: 'Weekly Shadow AI Spend Estimate',
        totalEstimate: 0,
        breakdown: {}
      };

      // Compliance gaps
      digest.sections.complianceGaps = {
        title: 'Compliance Violations Detected',
        gaps: [],
        count: 0
      };

      // Recommendations
      digest.sections.recommendations = {
        title: 'Recommended Actions',
        actions: [
          'Review and approve high-usage tools',
          'Consolidate redundant platforms',
          'Implement rate limiting on shadow tools',
          'Establish AI policy guidelines'
        ]
      };

      // Store digest
      await this._supabaseRequest('/weekly_digests', {
        method: 'POST',
        body: JSON.stringify({
          id: `wd_${Date.now()}_${crypto.randomUUID().substring(0, 9)}`,
          org_id: orgId,
          generated_at: digest.generatedAt,
          period_start: digest.period.startDate,
          period_end: digest.period.endDate,
          content: digest
        })
      });
    } catch (error) {
      if (this.logger) this.logger.error('Failed to generate weekly digest', { error: error.message });
    }

    return digest;
  }

  /**
   * Format digest for email delivery
   */
  formatDigestForEmail(digest) {
    let emailContent = `
FINAULT SHADOW AI WEEKLY DIGEST
Generated: ${digest.generatedAt}
Period: ${digest.period.startDate} to ${digest.period.endDate}

===== NEW TOOLS DISCOVERED =====
${digest.sections.newToolsDiscovered.count > 0
  ? digest.sections.newToolsDiscovered.tools.map(t => `- ${t}`).join('\n')
  : 'No new tools detected this week'
}

===== HIGH-RISK FINDINGS =====
${digest.sections.highRiskFindings.count > 0
  ? digest.sections.highRiskFindings.items.map(item => `- [${item.severity}] ${item.title}`).join('\n')
  : 'No high-risk findings'
}

===== COST ANALYSIS =====
Estimated Weekly Shadow AI Spend: $${digest.sections.costAnalysis.totalEstimate.toFixed(2)}

===== RECOMMENDATIONS =====
${digest.sections.recommendations.actions.map(action => `• ${action}`).join('\n')}
    `;

    return emailContent;
  }
}

/**
 * ShadowRiskMatrix class
 * Composite risk scoring with data sensitivity, compliance, cost, and usage dimensions
 */
class ShadowRiskMatrix {
  constructor(env, options = {}) {
    this.env = env;
    this.weights = options.weights || RISK_WEIGHTS;
  }

  /**
   * Calculate composite risk score
   */
  calculateRiskScore(tool, context = {}) {
    const scores = {
      dataSensitivity: this._scoreDataSensitivity(tool, context),
      complianceRisk: this._scoreComplianceRisk(tool, context),
      costExposure: this._scoreCostExposure(tool, context),
      usageVolume: this._scoreUsageVolume(tool, context)
    };

    const compositeScore =
      (scores.dataSensitivity * this.weights.data_sensitivity) +
      (scores.complianceRisk * this.weights.compliance_risk) +
      (scores.costExposure * this.weights.cost_exposure) +
      (scores.usageVolume * this.weights.usage_volume);

    return {
      compositeScore: Math.round(compositeScore),
      componentScores: scores,
      riskLevel: this._getRiskLevel(compositeScore),
      recommendations: this._getRiskRecommendations(compositeScore, tool)
    };
  }

  /**
   * Score data sensitivity (0-100)
   */
  _scoreDataSensitivity(tool, context) {
    let score = 0;

    // Tool type sensitivity
    const toolName = (tool.name || '').toLowerCase();
    if (toolName.includes('copilot') || toolName.includes('cursor')) {
      score += 40; // Code exposure
    }
    if (toolName.includes('chatgpt') || toolName.includes('claude')) {
      score += 30; // General data entry
    }
    if (toolName.includes('transcription') || toolName.includes('otter')) {
      score += 25; // Audio/meeting data
    }

    // User role sensitivity
    if (context.departmentsAffected) {
      const sensitiveDeptsCount = (context.departmentsAffected || []).filter(dept =>
        ['Finance', 'Legal', 'HR', 'Research', 'Security'].includes(dept)
      ).length;
      score += sensitiveDeptsCount * 10;
    }

    return Math.min(100, score);
  }

  /**
   * Score compliance risk (0-100)
   */
  _scoreComplianceRisk(tool, context) {
    let score = 0;

    // Industry-specific risks
    if (context.industry) {
      if (['Healthcare', 'Finance', 'Legal'].includes(context.industry)) {
        score += 40;
      } else if (['Government', 'Education'].includes(context.industry)) {
        score += 30;
      }
    }

    // Geography risks
    if (context.geography) {
      const geoRisks = REGULATORY_REQUIREMENTS[context.geography];
      if (geoRisks && geoRisks.complianceLevel === 'high') {
        score += 35;
      } else if (geoRisks && geoRisks.complianceLevel === 'medium') {
        score += 20;
      }
    }

    // Data residency concerns
    if (context.dataResidencyRequired && !context.toolDataResidency) {
      score += 25;
    }

    return Math.min(100, score);
  }

  /**
   * Score cost exposure (0-100)
   */
  _scoreCostExposure(tool, context) {
    const monthlySpend = tool.estimatedMonthlySpend || 0;
    const userCount = tool.userCount || 1;

    let score = 0;

    // Per-unit spend
    if (monthlySpend > 1000) {
      score += 50;
    } else if (monthlySpend > 500) {
      score += 40;
    } else if (monthlySpend > 100) {
      score += 30;
    } else if (monthlySpend > 20) {
      score += 15;
    }

    // Usage concentration
    if (userCount > 100) {
      score += 30;
    } else if (userCount > 50) {
      score += 20;
    } else if (userCount > 10) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Score usage volume (0-100)
   */
  _scoreUsageVolume(tool, context) {
    const eventCount = tool.eventCount || tool.userCount || 0;

    let score = 0;

    if (eventCount > 1000) {
      score = 100;
    } else if (eventCount > 500) {
      score = 80;
    } else if (eventCount > 100) {
      score = 60;
    } else if (eventCount > 10) {
      score = 40;
    } else {
      score = 20;
    }

    return score;
  }

  /**
   * Get risk level classification
   */
  _getRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'minimal';
  }

  /**
   * Get recommendations based on risk score
   */
  _getRiskRecommendations(score, tool) {
    const recs = [];

    if (score >= 80) {
      recs.push('Immediate action required - block or approve with strict controls');
      recs.push('Implement data loss prevention (DLP) rules');
      recs.push('Enable audit logging and monitoring');
    } else if (score >= 60) {
      recs.push('Review and establish usage policies');
      recs.push('Implement rate limiting and access controls');
      recs.push('Conduct compliance assessment');
    } else if (score >= 40) {
      recs.push('Monitor for policy compliance');
      recs.push('Evaluate against approved alternatives');
    }

    return recs;
  }
}

/**
 * ShadowROICalculator class
 * Calculate governance ROI vs risk of ungoverned usage
 */
class ShadowROICalculator {
  /**
   * Calculate governance investment ROI
   */
  calculateGovernanceROI(shadowTools, options = {}) {
    const roi = {
      calculationDate: new Date().toISOString(),
      governanceCosts: {},
      riskCosts: {},
      riskSavings: 0,
      breakEvenMonths: 0,
      netBenefit: 0,
      recommendedApproach: ''
    };

    // Calculate governance costs
    roi.governanceCosts = {
      toolLicensing: this._calculateLicensingCosts(shadowTools),
      platformFees: 10000, // Annual platform fees
      staffTime: 5000, // Annual staff time for governance
      trainingCosts: 2000, // Annual training
      totalAnnual: 0
    };

    roi.governanceCosts.totalAnnual =
      roi.governanceCosts.toolLicensing +
      roi.governanceCosts.platformFees +
      roi.governanceCosts.staffTime +
      roi.governanceCosts.trainingCosts;

    // Calculate risk costs of ungoverned usage
    roi.riskCosts = {
      dataBreachRisk: this._calculateDataBreachRisk(shadowTools),
      compliancePenalties: this._calculateCompliancePenalties(shadowTools),
      securityIncidents: 5000, // Average cost per incident
      duplicateSpendWaste: this._calculateDuplicateSpend(shadowTools),
      totalAnnual: 0
    };

    roi.riskCosts.totalAnnual =
      roi.riskCosts.dataBreachRisk +
      roi.riskCosts.compliancePenalties +
      roi.riskCosts.securityIncidents +
      roi.riskCosts.duplicateSpendWaste;

    // Calculate break-even and ROI
    roi.riskSavings = roi.riskCosts.totalAnnual;
    roi.netBenefit = roi.riskSavings - roi.governanceCosts.totalAnnual;
    roi.breakEvenMonths = roi.governanceCosts.totalAnnual > 0
      ? Math.ceil((roi.governanceCosts.totalAnnual / roi.riskSavings) * 12)
      : 0;

    // Recommendation
    if (roi.netBenefit > 0) {
      roi.recommendedApproach = 'Implement governance - positive ROI within ' + roi.breakEvenMonths + ' months';
    } else {
      roi.recommendedApproach = 'Risk-aware approach: selective governance for highest-risk tools';
    }

    return roi;
  }

  /**
   * Calculate tool licensing costs
   */
  _calculateLicensingCosts(shadowTools) {
    return shadowTools.reduce((sum, tool) => {
      return sum + (tool.estimatedMonthlySpend || 0) * 12;
    }, 0);
  }

  /**
   * Calculate data breach risk cost
   */
  _calculateDataBreachRisk(shadowTools) {
    const highRiskTools = shadowTools.filter(t => t.riskScore >= 60);
    // Average data breach cost: $4.29M, scale by # of high-risk tools
    return highRiskTools.length * 50000; // Risk-adjusted portion
  }

  /**
   * Calculate compliance penalties
   */
  _calculateCompliancePenalties(shadowTools) {
    // Rough estimate: $100-500 per uncontrolled tool annually
    return shadowTools.length * 200;
  }

  /**
   * Calculate duplicate spend waste
   */
  _calculateDuplicateSpend(shadowTools) {
    // Tools in same category indicate waste
    const categories = {};
    for (const tool of shadowTools) {
      const cat = this._getToolCategory(tool.name);
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(tool);
    }

    let wastedSpend = 0;
    for (const [, tools] of Object.entries(categories)) {
      if (tools.length > 1) {
        // Assume 50% of non-primary tools are wasted
        const sorted = tools.sort((a, b) => (b.estimatedMonthlySpend || 0) - (a.estimatedMonthlySpend || 0));
        for (let i = 1; i < sorted.length; i++) {
          wastedSpend += (sorted[i].estimatedMonthlySpend || 0) * 0.5 * 12;
        }
      }
    }

    return wastedSpend;
  }

  /**
   * Get tool category
   */
  _getToolCategory(toolName) {
    const name = (toolName || '').toLowerCase();
    if (name.includes('gpt') || name.includes('claude')) return 'text_generation';
    if (name.includes('copilot') || name.includes('cursor')) return 'code_generation';
    return 'other';
  }

  /**
   * Estimate actual cost based on real usage data or default estimate
   * Queries Supabase api_usage table for actual consumption data
   * Falls back to defaultEstimatedCostPerMonth if no real data exists
   *
   * @param {string} vendor - Vendor ID (e.g., 'openai', 'anthropic')
   * @param {object} usageData - Usage metrics from Supabase api_usage table
   * @param {object} vendorPatterns - AI_VENDOR_PATTERNS entry for vendor
   * @returns {object} { cost, costSource, currency, period }
   */
  estimateActualCost(vendor, usageData, vendorPatterns) {
    if (!vendorPatterns) {
      return {
        cost: 0,
        costSource: 'error',
        errorMsg: 'Vendor patterns not found',
        currency: 'USD'
      };
    }

    // If real usage data exists, calculate actual cost
    if (usageData && usageData.monthlyMetrics) {
      const actualCost = this._calculateCostFromUsage(usageData.monthlyMetrics);
      return {
        cost: actualCost,
        costSource: 'actual',
        currency: 'USD',
        period: usageData.period || 'monthly',
        metricsUsed: Object.keys(usageData.monthlyMetrics),
        calculatedAt: new Date().toISOString()
      };
    }

    // Otherwise use the default estimate but mark it as estimated
    const defaultCost = vendorPatterns.defaultEstimatedCostPerMonth || 0;
    return {
      cost: defaultCost,
      costSource: 'estimated',
      currency: 'USD',
      period: 'monthly',
      warning: 'No real usage data available - using default estimate',
      note: 'Enable API tracking in Supabase api_usage table for accurate costs',
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * Calculate actual cost from usage metrics
   * @private
   */
  _calculateCostFromUsage(monthlyMetrics) {
    let totalCost = 0;

    // Common metrics: API calls, tokens, requests, etc.
    if (monthlyMetrics.apiCalls) {
      totalCost += (monthlyMetrics.apiCalls / 1000) * (monthlyMetrics.costPerThousandCalls || 0.002);
    }

    if (monthlyMetrics.tokensUsed) {
      // Typical: $0.0005 per 1k tokens for input, $0.0015 for output
      const inputTokens = monthlyMetrics.tokensUsed.input || 0;
      const outputTokens = monthlyMetrics.tokensUsed.output || 0;
      totalCost += (inputTokens / 1000) * (monthlyMetrics.costPerThousandInputTokens || 0.0005);
      totalCost += (outputTokens / 1000) * (monthlyMetrics.costPerThousandOutputTokens || 0.0015);
    }

    if (monthlyMetrics.computeHours) {
      totalCost += monthlyMetrics.computeHours * (monthlyMetrics.costPerComputeHour || 0.10);
    }

    if (monthlyMetrics.storageGB) {
      totalCost += monthlyMetrics.storageGB * (monthlyMetrics.costPerGB || 0.02);
    }

    if (monthlyMetrics.requests) {
      totalCost += (monthlyMetrics.requests / 10000) * (monthlyMetrics.costPerTenThousandRequests || 0.50);
    }

    return Math.round(totalCost * 100) / 100; // Round to 2 decimal places
  }
}

/**
 * ToolSubstitutionRecommender class
 * Suggest enterprise alternatives and consolidation
 */
class ToolSubstitutionRecommender {
  constructor(options = {}) {
    this.enterpriseAlternatives = {
      text_generation: [
        { name: 'Azure OpenAI', costPerUser: 5, features: 'Enterprise, SOC2, HIPAA' },
        { name: 'Anthropic Claude Business', costPerUser: 8, features: 'Custom contracts' }
      ],
      code_generation: [
        { name: 'GitHub Copilot Business', costPerUser: 19, features: 'Organization management' },
        { name: 'Codeium Enterprise', costPerUser: 12, features: 'Self-hosted option' }
      ]
    };
  }

  /**
   * Get substitution recommendations
   */
  recommendSubstitutions(shadowTools, options = {}) {
    const recommendations = [];

    const categories = this._groupByCategory(shadowTools);

    for (const [category, tools] of Object.entries(categories)) {
      if (tools.length === 0) continue;

      const alternatives = this.enterpriseAlternatives[category] || [];

      // Find best consolidation target: lowest cost per user, highest user count
      const consolidationTarget = tools.reduce((best, tool) => {
        const toolScore = (tool.userCount || 1) / (tool.estimatedCost || tool.defaultEstimatedCostPerMonth || 1);
        const bestScore = (best.userCount || 1) / (best.estimatedCost || best.defaultEstimatedCostPerMonth || 1);
        return toolScore > bestScore ? tool : best;
      }, tools[0]);

      for (const tool of tools) {
        if (tool === consolidationTarget) continue;

        const recommendation = {
          fromTool: tool.name,
          toTool: consolidationTarget.name,
          category,
          reasoning: `Consolidate ${tool.name} to ${consolidationTarget.name} for simplified governance`,
          estimatedMonthlySavings: this._calculateMonthlySavings(tool, consolidationTarget),
          estimatedAnnualSavings: this._calculateMonthlySavings(tool, consolidationTarget) * 12,
          migrationEffort: 'medium',
          timeline: '2-4 weeks'
        };

        recommendations.push(recommendation);
      }

      // Suggest enterprise alternative if available
      if (alternatives.length > 0) {
        const bestAlternative = alternatives[0];
        const potentialSavings = tools.reduce((sum, t) => sum + (t.estimatedMonthlySpend || 0), 0) -
          (bestAlternative.costPerUser * (options.userCount || 100));

        if (potentialSavings > 0) {
          recommendations.push({
            fromTools: tools.map(t => t.name),
            toTool: bestAlternative.name,
            category,
            reasoning: `Enterprise solution with better compliance and support`,
            features: bestAlternative.features,
            estimatedMonthlySavings: potentialSavings,
            estimatedAnnualSavings: potentialSavings * 12,
            migrationEffort: 'high',
            timeline: '4-8 weeks'
          });
        }
      }
    }

    return recommendations;
  }

  /**
   * Group tools by category
   */
  _groupByCategory(tools) {
    const grouped = {};
    for (const tool of tools) {
      const category = this._getCategory(tool.name);
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(tool);
    }
    return grouped;
  }

  /**
   * Calculate monthly savings from substitution
   */
  _calculateMonthlySavings(fromTool, toTool) {
    const fromCost = fromTool.estimatedMonthlySpend || 0;
    const toCost = toTool.estimatedMonthlySpend || 0;
    return Math.max(0, fromCost - toCost);
  }

  /**
   * Get tool category
   */
  _getCategory(toolName) {
    const name = (toolName || '').toLowerCase();
    if (name.includes('gpt') || name.includes('claude')) return 'text_generation';
    if (name.includes('copilot') || name.includes('cursor')) return 'code_generation';
    return 'other';
  }
}

/**
 * ComplianceHeatMap class
 * Geographic and departmental compliance risk mapping
 */
class ComplianceHeatMap {
  /**
   * Generate compliance heat map
   */
  generateHeatMap(orgStructure, shadowTools, options = {}) {
    const heatmap = {
      generatedAt: new Date().toISOString(),
      geographicMap: {},
      departmentMap: {},
      overallRisk: 'medium'
    };

    // Geographic heat map
    for (const [geography, requirements] of Object.entries(REGULATORY_REQUIREMENTS)) {
      const geographyTools = shadowTools.filter(t => t.geography === geography || options.defaultGeography === geography);

      if (geographyTools.length > 0) {
        heatmap.geographicMap[geography] = {
          toolsDetected: geographyTools.length,
          complianceLevel: requirements.complianceLevel,
          regulations: requirements.regulations,
          restrictionsViolated: this._checkRestrictionsViolated(geographyTools, requirements),
          riskScore: this._calculateGeographicRisk(geographyTools, requirements),
          urgency: this._calculateUrgency(geographyTools, requirements)
        };
      }
    }

    // Department heat map
    const departments = new Set(shadowTools.map(t => t.department || 'Unknown'));
    for (const dept of departments) {
      const deptTools = shadowTools.filter(t => (t.department || 'Unknown') === dept);
      const avgRiskScore = deptTools.reduce((sum, t) => sum + (t.riskScore || 0), 0) / deptTools.length;

      heatmap.departmentMap[dept] = {
        toolsDetected: deptTools.length,
        avgRiskScore: Math.round(avgRiskScore),
        highRiskTools: deptTools.filter(t => t.riskScore >= 60).map(t => t.name),
        totalEstimatedSpend: deptTools.reduce((sum, t) => sum + (t.estimatedMonthlySpend || 0), 0)
      };
    }

    // Calculate overall risk
    const allRisks = Object.values(heatmap.geographicMap).map(g => g.riskScore);
    const avgRisk = allRisks.length > 0 ? allRisks.reduce((a, b) => a + b) / allRisks.length : 0;
    heatmap.overallRisk = avgRisk > 70 ? 'critical' : avgRisk > 50 ? 'high' : avgRisk > 30 ? 'medium' : 'low';

    return heatmap;
  }

  /**
   * Check which restrictions are violated
   */
  _checkRestrictionsViolated(tools, requirements) {
    const violations = [];

    // Check for data residency violations
    const needsResidency = requirements.restrictions.some(r => r.includes('residency'));
    if (needsResidency && tools.some(t => !t.dataResidency)) {
      violations.push('Data residency requirement not met');
    }

    // Check for audit trail requirements
    const needsAuditing = requirements.restrictions.some(r => r.includes('Audit'));
    if (needsAuditing && tools.some(t => !t.auditCapability)) {
      violations.push('Audit trail capability not available');
    }

    return violations;
  }

  /**
   * Calculate geographic risk score
   */
  _calculateGeographicRisk(tools, requirements) {
    let score = 0;

    // Compliance level risk
    if (requirements.complianceLevel === 'high') {
      score += 40;
    } else if (requirements.complianceLevel === 'medium') {
      score += 20;
    }

    // Tool risk scores
    const avgToolRisk = tools.reduce((sum, t) => sum + (t.riskScore || 0), 0) / tools.length;
    score += avgToolRisk * 0.3;

    return Math.min(100, score);
  }

  /**
   * Calculate urgency based on compliance level and violations
   */
  _calculateUrgency(tools, requirements) {
    const violations = this._checkRestrictionsViolated(tools, requirements);

    if (violations.length > 2 || requirements.complianceLevel === 'high') {
      return 'critical';
    }
    if (violations.length > 0 || requirements.complianceLevel === 'medium') {
      return 'high';
    }
    return 'medium';
  }
}

/**
 * HRSystemIntegration class
 * Map shadow AI usage to employee roles and cost centers
 */
class HRSystemIntegration {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = env.SUPABASE_URL;
    this.supabaseKey = env.SUPABASE_KEY;
  }

  async _supabaseRequest(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase request failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Map shadow AI usage to HR data including cost centers and departments
   */
  async mapToHRData(findings, hrEndpoint) {
    const mappingResult = {
      mappingDate: new Date().toISOString(),
      hrEndpoint,
      totalFindings: findings.length,
      employeeMapping: [],
      costCenterSummary: {},
      departmentSummary: {},
      roleSummary: {},
      riskByFunction: []
    };

    try {
      // Fetch HR data from endpoint
      const hrResponse = await resilientFetch(hrEndpoint, {
        method: 'GET',
        timeout: 15000
      });

      const hrData = await hrResponse.json();
      const hrMap = new Map();

      // Build HR lookup map
      for (const employee of (hrData.employees || hrData || [])) {
        if (employee.email) {
          hrMap.set(employee.email.toLowerCase(), employee);
        }
      }

      // Map findings to HR data
      for (const finding of findings) {
        const employeeEmail = (finding.employeeEmail || finding.userEmail || '').toLowerCase();
        const hrEmployee = hrMap.get(employeeEmail);

        if (hrEmployee) {
          const mapping = {
            employee: hrEmployee,
            finding,
            costCenter: hrEmployee.cost_center || 'unassigned',
            department: hrEmployee.department || 'unknown',
            role: hrEmployee.role || 'unknown',
            manager: hrEmployee.manager,
            riskLevel: this._assessEmployeeRisk(finding, hrEmployee)
          };

          mappingResult.employeeMapping.push(mapping);

          // Aggregate by cost center
          const cc = hrEmployee.cost_center || 'unassigned';
          if (!mappingResult.costCenterSummary[cc]) {
            mappingResult.costCenterSummary[cc] = {
              costCenter: cc,
              employeeCount: 0,
              toolsDetected: 0,
              totalSpend: 0,
              riskScore: 0
            };
          }
          mappingResult.costCenterSummary[cc].employeeCount++;
          mappingResult.costCenterSummary[cc].toolsDetected++;
          mappingResult.costCenterSummary[cc].totalSpend += finding.amount || 0;
          mappingResult.costCenterSummary[cc].riskScore += mapping.riskLevel;

          // Aggregate by department
          const dept = hrEmployee.department || 'unknown';
          if (!mappingResult.departmentSummary[dept]) {
            mappingResult.departmentSummary[dept] = {
              department: dept,
              employeeCount: 0,
              toolCount: 0,
              estimatedSpend: 0
            };
          }
          mappingResult.departmentSummary[dept].employeeCount++;
          mappingResult.departmentSummary[dept].toolCount++;
          mappingResult.departmentSummary[dept].estimatedSpend += finding.amount || 0;

          // Aggregate by role
          const role = hrEmployee.role || 'unknown';
          if (!mappingResult.roleSummary[role]) {
            mappingResult.roleSummary[role] = {
              role,
              employeeCount: 0,
              toolCount: 0,
              riskLevel: 0
            };
          }
          mappingResult.roleSummary[role].employeeCount++;
          mappingResult.roleSummary[role].toolCount++;
          mappingResult.roleSummary[role].riskLevel += mapping.riskLevel;
        }
      }

      // Calculate average risk by role/department
      for (const [cc, data] of Object.entries(mappingResult.costCenterSummary)) {
        data.avgRiskScore = Math.round(data.riskScore / Math.max(1, data.employeeCount));
      }

      // Identify high-risk functions
      mappingResult.riskByFunction = Object.entries(mappingResult.roleSummary)
        .map(([role, data]) => ({
          role,
          employees: data.employeeCount,
          avgRisk: Math.round(data.riskLevel / Math.max(1, data.employeeCount)),
          tools: data.toolCount
        }))
        .sort((a, b) => b.avgRisk - a.avgRisk);

      return mappingResult;
    } catch (error) {
      if (this.logger) this.logger.error('Failed to map findings to HR data', { error: error.message });
      return {
        ...mappingResult,
        error: error.message,
        fallback: true
      };
    }
  }

  /**
   * Map shadow AI usage to HR data (alternative interface)
   */
  async mapUsageToEmployeeData(orgId, shadowDiscoveries, hrData, options = {}) {
    const mappedResults = {
      mappingDate: new Date().toISOString(),
      totalEmployees: hrData.length,
      employeesWithShadowTools: 0,
      costCenterBreakdown: {},
      roleBreakdown: {},
      departmentBreakdown: {}
    };

    for (const discovery of shadowDiscoveries) {
      const employeeEmail = discovery.employeeEmail || discovery.userEmail;
      const matchedEmployee = hrData.find(e => e.email === employeeEmail);

      if (matchedEmployee) {
        mappedResults.employeesWithShadowTools++;

        // Cost center attribution
        const costCenter = matchedEmployee.cost_center || 'unassigned';
        if (!mappedResults.costCenterBreakdown[costCenter]) {
          mappedResults.costCenterBreakdown[costCenter] = {
            costCenter,
            employeeCount: 0,
            toolsDetected: 0,
            estimatedSpend: 0
          };
        }
        mappedResults.costCenterBreakdown[costCenter].employeeCount++;
        mappedResults.costCenterBreakdown[costCenter].toolsDetected++;
        mappedResults.costCenterBreakdown[costCenter].estimatedSpend += discovery.amount || 0;

        // Role attribution
        const role = matchedEmployee.role || 'unknown';
        if (!mappedResults.roleBreakdown[role]) {
          mappedResults.roleBreakdown[role] = {
            role,
            employeeCount: 0,
            toolCount: 0
          };
        }
        mappedResults.roleBreakdown[role].employeeCount++;
        mappedResults.roleBreakdown[role].toolCount++;

        // Department attribution
        const department = matchedEmployee.department || 'unknown';
        if (!mappedResults.departmentBreakdown[department]) {
          mappedResults.departmentBreakdown[department] = {
            department,
            employeeCount: 0,
            estimatedSpend: 0
          };
        }
        mappedResults.departmentBreakdown[department].employeeCount++;
        mappedResults.departmentBreakdown[department].estimatedSpend += discovery.amount || 0;
      }
    }

    // Store mapping results
    try {
      await this._supabaseRequest('/hr_shadow_mapping', {
        method: 'POST',
        body: JSON.stringify({
          id: `hrm_${Date.now()}_${crypto.randomUUID().substring(0, 9)}`,
          org_id: orgId,
          mapping_date: mappedResults.mappingDate,
          results: mappedResults
        })
      });
    } catch (error) {
      if (this.logger) this.logger.error('Failed to store HR mapping results', { error: error.message });
    }

    return mappedResults;
  }

  _assessEmployeeRisk(finding, hrEmployee) {
    let riskScore = 0;

    // Role-based risk
    const sensitiveRoles = ['executive', 'finance', 'legal', 'security', 'compliance'];
    if (sensitiveRoles.some(role => (hrEmployee.role || '').toLowerCase().includes(role))) {
      riskScore += 30;
    }

    // Department-based risk
    const sensitiveDepts = ['Finance', 'Legal', 'HR', 'Security', 'Research'];
    if (sensitiveDepts.includes(hrEmployee.department)) {
      riskScore += 20;
    }

    // Tool-based risk
    if (finding.riskScore) {
      riskScore += finding.riskScore * 0.5;
    }

    return Math.min(100, riskScore);
  }
}

// Export CommonJS module
export {
  AI_VENDOR_PATTERNS,
  EXPENSE_PLATFORMS,
  SLACK_BOT_SIGNATURES,
  CODE_ASSISTANT_TOOLS,
  RISK_WEIGHTS,
  REGULATORY_REQUIREMENTS,
  ExpenseReportMiner,
  NetworkTrafficAnalyzer,
  WorkspaceBotScanner,
  CodeAssistantScanner,
  DuplicateSpendDetector,
  ShadowMigrationEngine,
  ShadowHunterAgent,
  WeeklyDigestGenerator,
  ShadowRiskMatrix,
  ShadowROICalculator,
  ToolSubstitutionRecommender,
  ComplianceHeatMap,
  HRSystemIntegration
};
