/**
 * FINAULT E2E TEST FIXTURES
 * ═══════════════════════════════════════════════════════════════════
 * Deterministic API response mocks for every gateway endpoint.
 * These match the exact shape the dashboard API client expects.
 * ═══════════════════════════════════════════════════════════════════
 */

import { Page, Route } from '@playwright/test';

// ── Gateway base URL the dashboard hits ──────────────────────────
const API_BASE = 'https://api.finault.ai';

// ── Health ────────────────────────────────────────────────────────
export const healthResponse = {
  status: 'healthy',
  version: '4.0.0-diamond',
  endpoints: {
    core: ['/v1/parse', '/v1/allocate', '/v1/reconcile', '/v1/close-pack/generate'],
    diamond: ['/v1/disputes', '/v1/anomalies', '/v1/budgets', '/v1/analytics'],
  },
};

// ── Dashboard metrics (used by useDashboardMetrics hook) ─────────
export const analyticsResponse = {
  success: true,
  data: {
    total_spend: 47_832.50,
    total_requests: 1_284_500,
    total_tokens: 892_000_000,
    cost_per_request: 0.0372,
    by_provider: [
      { name: 'OpenAI', value: 28_300, percentage: 59.2 },
      { name: 'Anthropic', value: 14_200, percentage: 29.7 },
      { name: 'Google', value: 5_332.50, percentage: 11.1 },
    ],
    by_model: [
      { name: 'gpt-4-turbo', value: 18_400 },
      { name: 'claude-3-opus', value: 12_100 },
      { name: 'gemini-1.5-pro', value: 5_332.50 },
    ],
    by_cost_center: [
      { name: 'Engineering', value: 22_000, percentage: 46.0 },
      { name: 'Product', value: 15_832.50, percentage: 33.1 },
      { name: 'Research', value: 10_000, percentage: 20.9 },
    ],
    trend: Array.from({ length: 7 }, (_, i) => ({
      date: `2026-02-${String(6 + i).padStart(2, '0')}`,
      spend: 6_000 + i * 500,
      requests: 180_000 + i * 5_000,
      tokens: 125_000_000 + i * 3_000_000,
    })),
    has_data: true,
    period: { start: '2026-02-06', end: '2026-02-12', days: 7 },
  },
};

export const analyticsSummaryResponse = {
  success: true,
  summary: {
    total_spend: 47_832.50,
    spend_change: -8.2,
    total_requests: 1_284_500,
    request_change: 12.5,
    cost_per_request: 0.0372,
    provider_count: 3,
    has_data: true,
  },
};

// ── Anomalies ────────────────────────────────────────────────────
export const anomaliesResponse = {
  anomalies: [
    {
      id: 'anom-001',
      type: 'cost_spike',
      severity: 'high',
      title: 'GPT-4 cost spike detected',
      description: 'GPT-4 spend increased 340% compared to 7-day average',
      provider: 'OpenAI',
      model: 'gpt-4-turbo',
      detected_at: '2026-02-11T14:30:00Z',
      status: 'active',
      impact_amount: 4_200,
      cost_center: 'Engineering',
    },
    {
      id: 'anom-002',
      type: 'usage_pattern',
      severity: 'medium',
      title: 'Unusual after-hours usage',
      description: 'API calls between 2-5 AM increased 500%',
      provider: 'Anthropic',
      model: 'claude-3-opus',
      detected_at: '2026-02-10T08:00:00Z',
      status: 'active',
      impact_amount: 1_800,
      cost_center: 'Research',
    },
    {
      id: 'anom-003',
      type: 'token_waste',
      severity: 'low',
      title: 'High token-to-output ratio',
      description: 'System prompts consuming 80% of context for minimal output',
      provider: 'Google',
      model: 'gemini-1.5-pro',
      detected_at: '2026-02-09T16:45:00Z',
      status: 'acknowledged',
      impact_amount: 650,
      cost_center: 'Product',
    },
  ],
};

// ── Budgets ──────────────────────────────────────────────────────
export const budgetsResponse = {
  budgets: [
    {
      id: 'budget-001',
      name: 'Engineering AI Budget',
      amount: 50_000,
      spent: 22_000,
      period: 'monthly',
      status: 'active',
      owner: 'engineering@finault.ai',
      cost_center: 'Engineering',
      alert_threshold: 80,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'budget-002',
      name: 'Product Team Budget',
      amount: 25_000,
      spent: 15_832.50,
      period: 'monthly',
      status: 'warning',
      owner: 'product@finault.ai',
      cost_center: 'Product',
      alert_threshold: 75,
      created_at: '2026-01-15T00:00:00Z',
    },
    {
      id: 'budget-003',
      name: 'Research Budget',
      amount: 15_000,
      spent: 10_000,
      period: 'monthly',
      status: 'active',
      owner: 'research@finault.ai',
      cost_center: 'Research',
      alert_threshold: 80,
      created_at: '2026-02-01T00:00:00Z',
    },
  ],
};

// ── Invoices ────────────────────────────────────────────────────
export const invoicesResponse = {
  invoices: [
    {
      id: 'inv-001',
      provider: 'OpenAI',
      total_amount: 12_450.00,
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      status: 'reconciled',
      created_at: '2026-02-03T10:00:00Z',
      line_items: [
        { model: 'gpt-4-turbo', quantity: 500_000, unit: 'tokens', unit_price: 0.01, total: 5_000, description: 'GPT-4 Turbo input' },
        { model: 'gpt-4-turbo', quantity: 150_000, unit: 'tokens', unit_price: 0.03, total: 4_500, description: 'GPT-4 Turbo output' },
        { model: 'gpt-3.5-turbo', quantity: 5_900_000, unit: 'tokens', unit_price: 0.0005, total: 2_950, description: 'GPT-3.5 Turbo' },
      ],
    },
  ],
};

// ── Parse result (upload flow) ──────────────────────────────────
export const parseResultResponse = {
  success: true,
  provider: 'OpenAI',
  confidence: 0.94,
  total_amount: 8_742.50,
  currency: 'USD',
  period_start: '2026-02-01',
  period_end: '2026-02-28',
  line_items: [
    { model: 'gpt-4-turbo', quantity: 350_000, unit: 'tokens', unit_price: 0.01, total: 3_500, description: 'GPT-4 Turbo input tokens' },
    { model: 'gpt-4-turbo', quantity: 120_000, unit: 'tokens', unit_price: 0.03, total: 3_600, description: 'GPT-4 Turbo output tokens' },
    { model: 'dall-e-3', quantity: 500, unit: 'images', unit_price: 0.04, total: 20, description: 'DALL-E 3 images' },
    { model: 'whisper-1', quantity: 1_500, unit: 'minutes', unit_price: 1.082, total: 1_622.50, description: 'Whisper transcription' },
  ],
  metadata: { invoice_number: 'INV-2026-0212', billing_entity: 'OpenAI Inc.' },
};

// ── Allocation result ───────────────────────────────────────────
export const allocationResultResponse = {
  success: true,
  allocations: {
    Engineering: { cost: 4_200, count: 3, percentage: 48.1 },
    Product: { cost: 2_920, count: 2, percentage: 33.4 },
    Research: { cost: 1_622.50, count: 1, percentage: 18.5 },
  },
  total_allocated: 8_742.50,
  unallocated: 0,
};

// ── Rules ────────────────────────────────────────────────────────
export const rulesResponse = {
  rules: [
    { id: 'rule-001', name: 'GPT-4 → Engineering', model_pattern: 'gpt-4*', cost_center: 'Engineering', percentage: 100, priority: 1, is_active: true },
    { id: 'rule-002', name: 'Claude → Product', model_pattern: 'claude-*', cost_center: 'Product', percentage: 100, priority: 2, is_active: true },
    { id: 'rule-003', name: 'Whisper → Research', model_pattern: 'whisper-*', cost_center: 'Research', percentage: 100, priority: 3, is_active: true },
  ],
};

// ── Reconciliation ──────────────────────────────────────────────
export const reconciliationResponse = {
  success: true,
  reconciliation: {
    invoice_total: 12_450.00,
    internal_total: 12_180.00,
    matched_total: 11_900.00,
    unmatched_invoice: 550.00,
    unmatched_internal: 280.00,
    variance: 270.00,
    variance_percentage: 2.17,
    confidence: 0.92,
    status: 'minor_variance',
    matches: [
      { invoice_model: 'gpt-4-turbo', invoice_date: '2026-01-15', invoice_cost: 5_000, internal_cost: 4_850, cost_variance: 150, confidence: 0.95, matched_logs: 342 },
      { invoice_model: 'gpt-4-turbo', invoice_date: '2026-01-20', invoice_cost: 4_500, internal_cost: 4_500, cost_variance: 0, confidence: 0.99, matched_logs: 128 },
    ],
    discrepancies: [
      { type: 'rate_mismatch', severity: 'low', description: 'Token pricing differs by 3%', amount: 150, invoice_amount: 5_000, internal_amount: 4_850 },
    ],
    period: { start: '2026-01-01', end: '2026-01-31' },
    provider: 'OpenAI',
    timestamp: '2026-02-12T10:00:00Z',
    usage_log_count: 470,
  },
};

// ── Close Pack ──────────────────────────────────────────────────
export const closePackResponse = {
  success: true,
  close_pack: {
    id: 'cp-2026-02',
    period: { month: 'February', year: 2026 },
    company: 'Finault Inc.',
    generated_at: '2026-02-12T10:00:00Z',
    total_spend: 47_832.50,
    verification_id: 'VER-2026-02-ABC123',
    verification_url: 'https://verify.finault.ai/VER-2026-02-ABC123',
    merkle_root: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    status: 'complete',
    sections: ['summary', 'allocations', 'reconciliation', 'anomalies', 'proof'],
  },
};

// ── Disputes ────────────────────────────────────────────────────
export const disputesResponse = {
  success: true,
  count: 2,
  disputes: [
    {
      id: 'disp-001',
      reference: 'DISP-2026-001',
      dispute_id: 'disp-001',
      provider: 'OpenAI',
      disputed_amount: 4_200,
      status: 'sent',
      status_label: 'Sent to Provider',
      created_at: '2026-02-05T10:00:00Z',
      updated_at: '2026-02-05T10:05:00Z',
      verification_id: 'VER-2026-02-ABC123',
    },
    {
      id: 'disp-002',
      reference: 'DISP-2026-002',
      dispute_id: 'disp-002',
      provider: 'Google',
      disputed_amount: 1_100,
      status: 'resolved_full',
      status_label: 'Resolved (Full Credit)',
      created_at: '2026-01-20T14:00:00Z',
      updated_at: '2026-02-01T09:00:00Z',
      resolved_at: '2026-02-01T09:00:00Z',
      recovered_amount: 1_100,
    },
  ],
};

export const disputeStatsResponse = {
  success: true,
  stats: {
    total_disputes: 5,
    total_disputed: 12_500,
    total_recovered: 6_300,
    by_status: { draft: 1, sent: 2, resolved_full: 1, resolved_partial: 1 },
    by_provider: {
      OpenAI: { count: 3, total: 8_400, recovered: 4_200 },
      Google: { count: 2, total: 4_100, recovered: 2_100 },
    },
    success_rate: 0.40,
    recovery_rate: 0.504,
    average_resolution_days: 11,
  },
};

// ── Gateway metrics ─────────────────────────────────────────────
export const metricsResponse = {
  success: true,
  metrics: {
    total_requests: 48_200,
    error_count: 145,
    error_rate: 0.3,
    avg_latency_ms: 82,
    p95_latency_ms: 245,
    requests_per_minute: 33.5,
    by_endpoint: { '/v1/parse': 12_000, '/v1/allocate': 8_500, '/v1/analytics': 15_200, '/v1/reconcile': 4_500 },
    by_status_code: { '200': 47_500, '400': 95, '500': 50, '408': 55 },
    by_method: { GET: 28_000, POST: 18_200, PUT: 1_500, DELETE: 500 },
    period_hours: 24,
    measured_at: '2026-02-12T12:00:00Z',
  },
};

// ── Settings ────────────────────────────────────────────────────
export const settingsResponse = {
  success: true,
  settings: {
    theme: 'dark',
    currency: 'USD',
    timezone: 'America/New_York',
    notifications: { email: true, slack: true, anomaly_alerts: true, budget_alerts: true },
    api_rate_limit: 1000,
    data_retention_days: 365,
  },
};

// ── Audit logs ──────────────────────────────────────────────────
export const auditLogsResponse = {
  success: true,
  logs: [
    { id: 'log-001', action: 'invoice.parsed', user: 'bernie@finault.ai', timestamp: '2026-02-12T10:30:00Z', details: 'OpenAI invoice parsed ($8,742.50)', severity: 'info' },
    { id: 'log-002', action: 'budget.warning', user: 'system', timestamp: '2026-02-12T09:00:00Z', details: 'Product Team Budget at 63% utilization', severity: 'warning' },
    { id: 'log-003', action: 'anomaly.detected', user: 'system', timestamp: '2026-02-11T14:30:00Z', details: 'GPT-4 cost spike: +340% vs 7-day avg', severity: 'high' },
  ],
};

// ── Usage ────────────────────────────────────────────────────────
export const usageResponse = {
  success: true,
  period: '2026-02',
  total_requests: 1_284_500,
  total_tokens: 892_000_000,
  total_cost: 47_832.50,
  by_provider: {
    OpenAI: { requests: 750_000, tokens: 520_000_000, models: ['gpt-4-turbo', 'gpt-3.5-turbo', 'dall-e-3'] },
    Anthropic: { requests: 380_000, tokens: 280_000_000, models: ['claude-3-opus', 'claude-3-sonnet'] },
    Google: { requests: 154_500, tokens: 92_000_000, models: ['gemini-1.5-pro'] },
  },
};

// ── API Keys ────────────────────────────────────────────────────
export const apiKeysResponse = {
  success: true,
  count: 2,
  keys: [
    {
      id: 'key-001',
      name: 'Production API Key',
      key_prefix: 'fnlt_prod_',
      description: 'Main production key',
      is_active: true,
      last_used_at: '2026-02-12T11:00:00Z',
      expires_at: null,
      scopes: ['read', 'write', 'admin'],
      created_at: '2026-01-01T00:00:00Z',
      revoked_at: null,
    },
    {
      id: 'key-002',
      name: 'Staging Key',
      key_prefix: 'fnlt_stag_',
      description: 'Staging environment',
      is_active: true,
      last_used_at: '2026-02-10T15:00:00Z',
      expires_at: '2026-06-01T00:00:00Z',
      scopes: ['read', 'write'],
      created_at: '2026-01-15T00:00:00Z',
      revoked_at: null,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// ROUTE INTERCEPTOR — Mocks all gateway API calls
// ═══════════════════════════════════════════════════════════════════

export async function mockAllApiRoutes(page: Page): Promise<void> {
  // Health
  await page.route(`${API_BASE}/health`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(healthResponse) })
  );

  // Analytics (dashboard metrics)
  await page.route(`${API_BASE}/v1/analytics?*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyticsResponse) })
  );
  await page.route(`${API_BASE}/v1/analytics/summary?*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyticsSummaryResponse) })
  );

  // Anomalies
  await page.route(`${API_BASE}/v1/anomalies?*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(anomaliesResponse) })
  );
  await page.route(`${API_BASE}/v1/anomalies`, route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(anomaliesResponse) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  // Budgets
  await page.route(`${API_BASE}/v1/budgets`, route => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(budgetsResponse) });
    }
    if (method === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: 'budget-new', name: 'New Budget', amount: 10_000, spent: 0, period: 'monthly', status: 'active',
      }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route(`${API_BASE}/v1/budgets?*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, budget: budgetsResponse.budgets[0] }) })
  );
  await page.route(`${API_BASE}/v1/budgets/check`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, allowed: true, remaining: 28_000 }) })
  );

  // Invoices
  await page.route(`${API_BASE}/v1/invoices?*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(invoicesResponse) })
  );
  await page.route(`${API_BASE}/v1/invoices`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(invoicesResponse.invoices[0]) })
  );

  // Parse (upload)
  await page.route(`${API_BASE}/v1/parse`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(parseResultResponse) })
  );

  // Allocation
  await page.route(`${API_BASE}/v1/allocate`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(allocationResultResponse) })
  );

  // Rules
  await page.route(`${API_BASE}/v1/rules`, route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rulesResponse) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, ...rulesResponse.rules[0] }) });
  });
  await page.route(`${API_BASE}/v1/rules?*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, deleted: 'rule-001' }) })
  );

  // Reconciliation
  await page.route(`${API_BASE}/v1/reconcile`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reconciliationResponse) })
  );
  await page.route(`${API_BASE}/v1/usage-logs*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, count: 470, logs: [] }) })
  );

  // Close Pack
  await page.route(`${API_BASE}/v1/close-pack/generate`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(closePackResponse) })
  );
  await page.route(`${API_BASE}/v1/close-pack/email`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message_id: 'msg-001' }) })
  );

  // Disputes
  await page.route(`${API_BASE}/v1/disputes/stats`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(disputeStatsResponse) })
  );
  await page.route(`${API_BASE}/v1/disputes`, route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(disputesResponse) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      success: true, dispute: { id: 'disp-new', reference: 'DISP-2026-003', status: 'draft', tracking_url: '/disputes/disp-new' },
    }) });
  });
  await page.route(`${API_BASE}/v1/disputes?*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(disputesResponse) })
  );

  // Gateway metrics
  await page.route(`${API_BASE}/v1/metrics?*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(metricsResponse) })
  );
  await page.route(`${API_BASE}/v1/metrics`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(metricsResponse) })
  );

  // Settings
  await page.route(`${API_BASE}/v1/settings`, route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settingsResponse) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  // Audit logs
  await page.route(`${API_BASE}/v1/audit*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(auditLogsResponse) })
  );

  // Usage
  await page.route(`${API_BASE}/v1/usage?*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(usageResponse) })
  );
  await page.route(`${API_BASE}/v1/usage`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(usageResponse) })
  );

  // API Keys
  await page.route(`${API_BASE}/v1/keys`, route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiKeysResponse) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      success: true, key: { id: 'key-new', name: 'New Key', secret: 'fnlt_live_abc123...', key_prefix: 'fnlt_live_', environment: 'production', is_active: true, scopes: ['read'], created_at: '2026-02-12T12:00:00Z' },
      warning: 'Save this key — it will not be shown again.',
    }) });
  });
  await page.route(`${API_BASE}/v1/keys?*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Key revoked', key_id: 'key-001' }) })
  );

  // Proof & verification
  await page.route(`${API_BASE}/v1/proof/*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  );

  // Agents
  await page.route(`${API_BASE}/v1/agents`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, count: 19, agents: {} }) })
  );
  await page.route(`${API_BASE}/v1/agents/*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, response: 'I can help with that.', session_id: 'sess-001' }) })
  );

  // Catch-all for any unmatched API calls — return 200 with empty success
  await page.route(`${API_BASE}/**`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  );
}
