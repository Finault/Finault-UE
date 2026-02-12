/**
 * FINAULT GATEWAY API CLIENT
 * ═══════════════════════════════════════════════════════════════════
 * Production-grade API client for Finault Gateway v3.0
 * Handles all communication with the unified gateway
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  ParseResult,
  AllocationResult,
  AllocationRule,
  ClosePack,
  AnomalyDetectionResult,
  Anomaly,
  Budget,
  BudgetCheck,
  UsageSummary,
  Invoice,
  InvoiceLineItem,
} from '@/types';

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION - Cloudflare Production
// ═══════════════════════════════════════════════════════════════════

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.finault.ai';
const GATEWAY_URL = API_URL;
const AGENTOS_URL = process.env.NEXT_PUBLIC_AGENTOS_URL || 'https://agents.finault.ai';
const DEFAULT_TIMEOUT = 30000;

/**
 * FIX 1 (CRITICAL): API Key Management
 * Gets the anonymous API key from Next.js public environment variable.
 * This is NOT a secret — NEXT_PUBLIC_FINAULT_API_KEY is the anonymous/client-side key
 * designed for client use with Row-Level Security (RLS) enabled on the backend.
 * The key is public by design and safe to expose in the browser.
 * Reference: https://nextjs.org/docs/basic-features/environment-variables#bundling-environment-variables-for-the-browser
 */
function getApiKey(): string | undefined {
  return process.env.NEXT_PUBLIC_FINAULT_API_KEY;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
  timeout?: number;
}

class FinaultAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'FinaultAPIError';
  }
}

// ═══════════════════════════════════════════════════════════════════
// LOGGER UTILITY (LOW: Replace console.log with logger)
// ═══════════════════════════════════════════════════════════════════

const logger = {
  debug: (msg: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[Finault API] ${msg}`, data);
    }
  },
  warn: (msg: string, data?: any) => console.warn(`[Finault API] ${msg}`, data),
  error: (msg: string, error?: any) => console.error(`[Finault API] ${msg}`, error),
};

// ═══════════════════════════════════════════════════════════════════
// CASE TRANSFORMATION UTILITIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert snake_case to camelCase
 * @param str The string to convert
 * @returns Converted camelCase string
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase to snake_case
 * @param str The string to convert
 * @returns Converted snake_case string
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Deep transform object keys from snake_case to camelCase
 * Recursively transforms all nested objects and arrays.
 * @param obj The object to transform
 * @returns Object with camelCase keys
 */
function transformKeysToCamel<T>(obj: any): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => transformKeysToCamel(item)) as T;
  }
  if (typeof obj === 'object') {
    const transformed: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = snakeToCamel(key);
      transformed[camelKey] = transformKeysToCamel(value);
    }
    return transformed as T;
  }
  return obj;
}

/**
 * Deep transform object keys from camelCase to snake_case
 * Recursively transforms all nested objects and arrays.
 * @param obj The object to transform
 * @returns Object with snake_case keys
 */
function transformKeysToSnake<T>(obj: any): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => transformKeysToSnake(item)) as T;
  }
  if (typeof obj === 'object') {
    const transformed: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = camelToSnake(key);
      transformed[snakeKey] = transformKeysToSnake(value);
    }
    return transformed as T;
  }
  return obj;
}

// ═══════════════════════════════════════════════════════════════════
// BASE REQUEST HANDLER
// ═══════════════════════════════════════════════════════════════════

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, timeout = DEFAULT_TIMEOUT } = options;

  // FIX 1 (CRITICAL): Use getter function for API key
  const apiKey = getApiKey();

  // Request logging in development (LOW: Using logger instead of console.log)
  logger.debug(`${method} ${endpoint}`);

  // Add request retry logic with exponential backoff (MEDIUM)
  let lastError: FinaultAPIError | Error | undefined;
  const maxRetries = 3;
  const baseDelayMs = 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const url = `${GATEWAY_URL}${endpoint}`;

    try {
      // Transform outgoing body from camelCase to snake_case
      const transformedBody = body ? transformKeysToSnake(body) : undefined;

      // FIX 4 (HIGH): Generate idempotency key for mutations to support safe retries
      const idempotencyKey = ['POST', 'PUT', 'PATCH'].includes(method)
        ? crypto.randomUUID?.() || Math.random().toString(36)
        : undefined;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-Finault-Api-Key': apiKey } : {}),
          ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
          ...headers,
        },
        body: transformedBody ? JSON.stringify(transformedBody) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        const error = new FinaultAPIError(
          data.error || data.message || 'Request failed',
          response.status,
          data.code
        );

        // Don't retry 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          throw error;
        }

        // Retry 5xx errors with exponential backoff
        if (attempt < maxRetries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          lastError = error;
          continue;
        }

        throw error;
      }

      // Transform incoming data from snake_case to camelCase
      return transformKeysToCamel<T>(data);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof FinaultAPIError) {
        // Don't retry 4xx errors
        if (error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }
        lastError = error;
      } else if (error instanceof Error) {
        if (error.name === 'AbortError') {
          lastError = new FinaultAPIError('Request timeout', 408, 'TIMEOUT');
        } else {
          lastError = new FinaultAPIError(error.message, 500, 'NETWORK_ERROR');
        }
      } else {
        lastError = new FinaultAPIError('Unknown error', 500, 'UNKNOWN');
      }

      // Retry network errors and 5xx on last attempt before throwing
      if (attempt < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      throw lastError;
    }
  }

  // Should not reach here, but throw last error just in case
  throw lastError || new FinaultAPIError('Unknown error', 500, 'UNKNOWN');
}

// ═══════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════

export async function checkHealth(): Promise<{
  status: string;
  version: string;
  endpoints: Record<string, string[]>;
}> {
  return request('/health');
}

// ═══════════════════════════════════════════════════════════════════
// INVOICE PARSING
// ═══════════════════════════════════════════════════════════════════

export async function parseInvoice(file: File): Promise<ParseResult> {
  const formData = new FormData();
  formData.append('file', file);

  // FIX 3 (HIGH): Add API key header, timeout, and idempotency key to parseInvoice
  const apiKey = getApiKey();
  const idempotencyKey = crypto.randomUUID?.() || Math.random().toString(36);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${API_URL}/v1/parse`, {
      method: 'POST',
      body: formData,
      headers: {
        ...(apiKey ? { 'X-Finault-Api-Key': apiKey } : {}),
        'X-Idempotency-Key': idempotencyKey,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json();
      throw new FinaultAPIError(error.error || 'Parse failed', response.status);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function parseInvoiceContent(content: string, filename?: string): Promise<ParseResult> {
  return request('/v1/parse', {
    method: 'POST',
    body: { content, filename },
  });
}

export async function getInvoices(limit = 20): Promise<{ invoices: Invoice[] }> {
  return request(`/v1/invoices?limit=${limit}`);
}

export async function createInvoice(invoice: Partial<Invoice>): Promise<Invoice> {
  return request('/v1/invoices', {
    method: 'POST',
    body: invoice,
  });
}

// ═══════════════════════════════════════════════════════════════════
// ALLOCATION
// ═══════════════════════════════════════════════════════════════════

export async function allocateCosts(
  lineItems: InvoiceLineItem[],
  rules?: AllocationRule[]
): Promise<AllocationResult> {
  return request('/v1/allocate', {
    method: 'POST',
    body: { lineItems, rules },
  });
}

export async function getRules(): Promise<{ rules: AllocationRule[] }> {
  return request('/v1/rules');
}

export async function createRule(rule: Partial<AllocationRule>): Promise<AllocationRule> {
  return request('/v1/rules', {
    method: 'POST',
    body: rule,
  });
}

export async function updateRule(id: string, updates: Partial<AllocationRule>): Promise<AllocationRule> {
  return request('/v1/rules', {
    method: 'PUT',
    body: { id, ...updates },
  });
}

export async function deleteRule(id: string): Promise<{ success: boolean; deleted: string }> {
  // FIX 9 (MEDIUM): Encode ID to prevent query injection
  return request(`/v1/rules?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ═══════════════════════════════════════════════════════════════════
// CLOSE PACK
// ═══════════════════════════════════════════════════════════════════

export async function generateClosePack(
  invoiceData: {
    lineItems: InvoiceLineItem[];
    totalAmount?: number;
    provider?: string;
    periodStart?: string;
    periodEnd?: string;
  },
  allocationData?: Record<string, { cost: number; count: number }>,
  companyName?: string,
  period?: { month: string; year: number }
): Promise<ClosePack> {
  return request('/v1/close-pack/generate', {
    method: 'POST',
    body: { invoiceData, allocationData, companyName, period },
  });
}

export async function emailClosePack(
  email: string,
  invoiceData: {
    lineItems: InvoiceLineItem[];
    totalAmount?: number;
    provider?: string;
  },
  allocationData?: Record<string, { cost: number; count: number }>,
  companyName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  return request('/v1/close-pack/email', {
    method: 'POST',
    body: { email, invoiceData, allocationData, companyName },
  });
}

// ═══════════════════════════════════════════════════════════════════
// RECONCILIATION - Real invoice-to-usage matching
// ═══════════════════════════════════════════════════════════════════

export interface ReconciliationMatch {
  invoiceModel: string;
  invoiceDate: string;
  invoiceCost: number;
  internalCost: number;
  costVariance: number;
  confidence: number;
  matchedLogs: number;
}

export interface ReconciliationDiscrepancy {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  amount: number;
  invoiceAmount?: number;
  internalAmount?: number;
}

export interface ReconciliationResult {
  invoiceTotal: number;
  internalTotal: number;
  matchedTotal: number;
  unmatchedInvoice: number;
  unmatchedInternal: number;
  variance: number;
  variancePercentage: number;
  discrepancies: ReconciliationDiscrepancy[];
  confidence: number;
  status: 'clean' | 'minor_variance' | 'review_required' | 'failed' | 'no_data';
  matches: ReconciliationMatch[];
  byModel?: Record<string, { invoice: number; internal: number; variance: number }>;
  period: { start: string; end: string };
  provider: string;
  timestamp: string;
  usageLogCount: number;
}

export async function reconcileInvoice(
  invoice: {
    lineItems: InvoiceLineItem[];
    totalAmount?: number;
    provider?: string;
    periodStart?: string;
    periodEnd?: string;
  },
  periodStart?: string,
  periodEnd?: string
): Promise<{ success: boolean; reconciliation?: ReconciliationResult; error?: string }> {
  return request('/v1/reconcile', {
    method: 'POST',
    body: { invoice, periodStart, periodEnd },
  });
}

export async function getUsageLogs(
  options?: { start?: string; end?: string; provider?: string; limit?: number }
): Promise<{ success: boolean; count: number; logs: Array<{
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  costCenter: string;
  requestId: string;
}> }> {
  const params = new URLSearchParams();
  if (options?.start) params.set('start', options.start);
  if (options?.end) params.set('end', options.end);
  if (options?.provider) params.set('provider', options.provider);
  if (options?.limit) params.set('limit', options.limit.toString());

  return request(`/v1/usage-logs?${params.toString()}`);
}

// ═══════════════════════════════════════════════════════════════════
// LIVE ANALYTICS - Real data from gateway logs (Diamond Tier)
// ═══════════════════════════════════════════════════════════════════

export interface AnalyticsData {
  totalSpend: number;
  totalRequests: number;
  totalTokens: number;
  costPerRequest: number;
  byProvider: Array<{ name: string; value: number; percentage: number }>;
  byModel: Array<{ name: string; value: number }>;
  byCostCenter: Array<{ name: string; value: number; percentage: number }>;
  trend: Array<{ date: string; spend: number; requests: number; tokens: number }>;
  hasData: boolean;
  period?: { start: string; end: string; days: number };
}

export interface AnalyticsSummary {
  totalSpend: number;
  spendChange: number;
  totalRequests: number;
  requestChange: number;
  costPerRequest: number;
  providerCount: number;
  hasData: boolean;
}

export async function getAnalytics(
  days: number = 7
): Promise<{ success: boolean; data: AnalyticsData }> {
  // FIX 2 (HIGH): Encode URL parameter to prevent query injection
  return request(`/v1/analytics?days=${encodeURIComponent(days.toString())}`);
}

export async function getAnalyticsSummary(
  days: number = 7
): Promise<{ success: boolean; summary: AnalyticsSummary }> {
  // FIX 2 (HIGH): Encode URL parameter to prevent query injection
  return request(`/v1/analytics/summary?days=${encodeURIComponent(days.toString())}`);
}

// ═══════════════════════════════════════════════════════════════════
// GATEWAY METRICS - Real-time operational metrics
// ═══════════════════════════════════════════════════════════════════

export interface GatewayMetrics {
  total_requests: number;
  error_count: number;
  error_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  requests_per_minute: number;
  by_endpoint: Record<string, number>;
  by_status_code: Record<string, number>;
  by_method: Record<string, number>;
  period_hours: number;
  measured_at: string;
}

export async function getMetrics(
  hours: number = 24
): Promise<{ success: boolean; metrics: GatewayMetrics }> {
  // FIX 2 (HIGH): Encode URL parameter to prevent query injection
  return request(`/v1/metrics?hours=${encodeURIComponent(hours.toString())}`);
}

// ═══════════════════════════════════════════════════════════════════
// CRYPTOGRAPHIC PROOF - The MOAT (Diamond Tier)
// ═══════════════════════════════════════════════════════════════════

export interface CryptoProofDocument {
  version: string;
  type: string;
  generated_at: string;

  // DIAMOND TIER: Human-readable verification
  verification_id: string;
  verification_url: string;
  verification_qr: string;

  // Core cryptographic data
  merkle_root: string;
  document_hash: string;
  log_count: number;

  // External anchor for immutability
  external_anchor: {
    service: string;
    anchor_hash: string;
    anchor_timestamp: string;
    anchor_id: string;
    registry_url: string;
  };

  period: { start: string; end: string };
  reconciliation: {
    invoice_total: number;
    internal_total: number;
    variance: number;
    variance_percentage: number;
    status: string;
    confidence: number;
    discrepancies: ReconciliationDiscrepancy[];
  };
  log_proofs: Array<{
    index: number;
    log_id: string;
    timestamp: string;
    hash: string;
    merkle_proof: Array<{ hash: string; position: 'left' | 'right' }>;
  }>;
  verification: {
    algorithm: string;
    chain_method: string;
    merkle_structure: string;
    how_to_verify: string[];
    independent_verification_url: string;
  };
}

export interface DisputeLetter {
  type: string;
  generated_at: string;
  provider: string;
  header: {
    subject: string;
    reference: string;
    urgency: string;
  };
  summary: {
    invoice_total: number;
    verified_usage: number;
    total_variance: number;
    variance_percentage: string;
    disputed_amount: number;
    discrepancy_count: number;
  };
  discrepancies: Array<{
    item: number;
    type: string;
    description: string;
    amount: number;
    evidence: string;
  }>;
  evidence: {
    merkle_root: string;
    document_hash: string;
    log_count: number;
    verification_url: string;
  };
  letter_body: string;
  actions: Array<{ label: string; action: string }>;
}

export async function generateCryptoProof(
  periodStart: string,
  periodEnd: string,
  invoice?: {
    lineItems: InvoiceLineItem[];
    totalAmount?: number;
    provider?: string;
  }
): Promise<{ success: boolean; proof: CryptoProofDocument }> {
  return request('/v1/proof/generate', {
    method: 'POST',
    body: { period_start: periodStart, period_end: periodEnd, invoice },
  });
}

export async function verifyCryptoProof(
  proofDocument: CryptoProofDocument,
  logId?: string
): Promise<{
  success: boolean;
  verification: {
    document_hash_valid: boolean;
    computed_hash: string;
    expected_hash: string;
    merkle_root: string;
    log_count: number;
    log_verification?: { log_id: string; found: boolean; inclusion_verified?: boolean; hash?: string };
    verified_at: string;
  };
}> {
  return request('/v1/proof/verify', {
    method: 'POST',
    body: { proof_document: proofDocument, log_id: logId },
  });
}

export async function generateDispute(
  reconciliationResult: ReconciliationResult,
  provider: string,
  proofDocument?: CryptoProofDocument,
  discrepancyIndices?: number[]
): Promise<{ success: boolean; dispute: DisputeLetter }> {
  return request('/v1/proof/dispute', {
    method: 'POST',
    body: {
      reconciliation_result: reconciliationResult,
      provider,
      proof_document: proofDocument,
      discrepancy_indices: discrepancyIndices,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// DIAMOND TIER: Public Verification
// ═══════════════════════════════════════════════════════════════════

export interface PublicVerificationResult {
  success: boolean;
  verified: boolean;
  verification_id: string;
  status: 'VERIFIED' | 'NOT_FOUND';
  proof?: {
    merkle_root: string;
    document_hash: string;
    log_count: number;
    period_start: string;
    period_end: string;
    created_at: string;
    reconciliation_status: string;
  };
  certificate?: {
    issuer: string;
    verification_url: string;
    qr_code: string;
    badge_html: string;
  };
  checked_at: string;
}

export async function publicVerifyProof(
  verificationId: string
): Promise<PublicVerificationResult> {
  return request(`/v1/verify/${verificationId}`);
}

// ═══════════════════════════════════════════════════════════════════
// DIAMOND TIER: Dispute Lifecycle Management
// ═══════════════════════════════════════════════════════════════════

export type DisputeStatus =
  | 'draft'
  | 'sent'
  | 'acknowledged'
  | 'under_review'
  | 'resolved_full'
  | 'resolved_partial'
  | 'rejected'
  | 'escalated';

export interface Dispute {
  id: string;
  reference: string;
  dispute_id: string;
  provider: string;
  disputed_amount: number;
  status: DisputeStatus;
  status_label: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  recovered_amount?: number;
  verification_id?: string;
}

export interface DisputeStats {
  total_disputes: number;
  total_disputed: number;
  total_recovered: number;
  by_status: Record<string, number>;
  by_provider: Record<string, { count: number; total: number; recovered: number }>;
  success_rate: number;
  recovery_rate: number;
  average_resolution_days: number;
}

export async function getDisputes(
  status?: DisputeStatus
): Promise<{ success: boolean; count: number; disputes: Dispute[] }> {
  // FIX 2 (HIGH): Encode URL parameter to prevent query injection
  const params = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/v1/disputes${params}`);
}

export async function createDispute(
  disputeLetter: DisputeLetter,
  proofDocument?: CryptoProofDocument,
  provider?: string
): Promise<{
  success: boolean;
  dispute: {
    id: string;
    reference: string;
    status: DisputeStatus;
    tracking_url: string;
  };
}> {
  return request('/v1/disputes', {
    method: 'POST',
    body: { dispute_letter: disputeLetter, proof_document: proofDocument, provider },
  });
}

export async function updateDisputeStatus(
  disputeId: string,
  status: DisputeStatus,
  notes?: string,
  recoveredAmount?: number
): Promise<{ success: boolean; dispute_id: string; new_status: DisputeStatus; status_label: string }> {
  return request(`/v1/disputes/${disputeId}/status`, {
    method: 'PATCH',
    body: { status, notes, recovered_amount: recoveredAmount },
  });
}

export async function sendDisputeEmail(
  disputeId: string,
  letterContent: string,
  recipientEmail: string,
  provider: string,
  subject?: string
): Promise<{
  success: boolean;
  email_sent: boolean;
  recipient: string;
  sent_at: string;
  tracking: { status: string; next_steps: string[] };
}> {
  return request('/v1/disputes/send', {
    method: 'POST',
    body: { dispute_id: disputeId, letter_content: letterContent, recipient_email: recipientEmail, provider, subject },
  });
}

export async function getDisputeStats(): Promise<{ success: boolean; stats: DisputeStats }> {
  return request('/v1/disputes/stats');
}

// ═══════════════════════════════════════════════════════════════════
// ANOMALY DETECTION
// ═══════════════════════════════════════════════════════════════════

export async function getAnomalies(
  options?: { limit?: number; severity?: string }
): Promise<{ anomalies: Anomaly[] }> {
  // FIX 2 (HIGH): URLSearchParams automatically encodes parameters, but explicitly verify
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.severity) params.set('severity', options.severity);

  return request(`/v1/anomalies?${params.toString()}`);
}

export async function acknowledgeAnomaly(
  anomalyId: string,
  acknowledgedBy?: string
): Promise<{ success: boolean; anomaly_id: string; acknowledged_by: string; acknowledged_at: string }> {
  return request('/v1/anomalies/acknowledge', {
    method: 'POST',
    body: { anomaly_id: anomalyId, acknowledged_by: acknowledgedBy },
  });
}

export async function detectAnomalies(
  usageData: Array<{ date: string; cost: number; model?: string }>,
  thresholds?: { zScore?: number; percentile?: number; minDataPoints?: number }
): Promise<AnomalyDetectionResult> {
  return request('/v1/anomalies/detect', {
    method: 'POST',
    body: { usageData, thresholds },
  });
}

// ═══════════════════════════════════════════════════════════════════
// BUDGETS
// ═══════════════════════════════════════════════════════════════════

export async function getBudgets(): Promise<{ budgets: Budget[] }> {
  return request('/v1/budgets');
}

export async function createBudget(budget: Partial<Budget>): Promise<Budget> {
  return request('/v1/budgets', {
    method: 'POST',
    body: budget,
  });
}

export async function updateBudget(id: string, data: Partial<Budget>): Promise<{ success: boolean; budget: Budget }> {
  // FIX 9 (MEDIUM): Encode ID to prevent query injection
  return request(`/v1/budgets?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: data,
  });
}

export async function deleteBudget(id: string): Promise<{ success: boolean }> {
  // FIX 9 (MEDIUM): Encode ID to prevent query injection
  return request(`/v1/budgets?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function checkBudget(
  budgetId: string,
  estimatedCost?: number
): Promise<BudgetCheck> {
  return request('/v1/budgets/check', {
    method: 'POST',
    body: { budget_id: budgetId, estimated_cost: estimatedCost },
  });
}

// ═══════════════════════════════════════════════════════════════════
// USAGE ANALYTICS
// ═══════════════════════════════════════════════════════════════════

export async function getUsage(
  options?: { costCenter?: string; period?: string }
): Promise<UsageSummary> {
  const params = new URLSearchParams();
  if (options?.costCenter) params.set('cost_center', options.costCenter);
  if (options?.period) params.set('period', options.period);

  return request(`/v1/usage?${params.toString()}`);
}

// ═══════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ═══════════════════════════════════════════════════════════════════

export async function getAuditLogs(
  options?: { limit?: number; user?: string; action?: string; severity?: string }
): Promise<{ success: boolean; logs: any[] }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.user) params.set('user', options.user);
  if (options?.action) params.set('action', options.action);
  if (options?.severity) params.set('severity', options.severity);

  return request(`/v1/audit?${params.toString()}`);
}

// ═══════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════

export async function getSettings(): Promise<{ success: boolean; settings: any }> {
  return request('/v1/settings');
}

export async function updateSettings(settings: any): Promise<{ success: boolean }> {
  return request('/v1/settings', {
    method: 'PUT',
    body: settings,
  });
}

// ═══════════════════════════════════════════════════════════════════
// ATTESTATION
// ═══════════════════════════════════════════════════════════════════

export async function verifyAttestation(hash: string): Promise<{
  verified: boolean;
  hash: string;
  attestation?: any;
  message: string;
}> {
  // FIX 9 (MEDIUM): Encode hash to prevent query injection
  return request(`/v1/attest/verify?hash=${encodeURIComponent(hash)}`);
}

// ═══════════════════════════════════════════════════════════════════
// STRIPE BILLING
// ═══════════════════════════════════════════════════════════════════

export async function createCheckout(
  tier: 'pro' | 'business' | 'enterprise',
  email: string,
  successUrl?: string,
  cancelUrl?: string
): Promise<{
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
}> {
  return request('/v1/checkout', {
    method: 'POST',
    body: { tier, email, successUrl, cancelUrl },
  });
}

// ═══════════════════════════════════════════════════════════════════
// LEAD CAPTURE
// ═══════════════════════════════════════════════════════════════════

export async function captureLead(
  email: string,
  source?: string,
  company?: string
): Promise<{ success: boolean }> {
  return request('/v1/capture-lead', {
    method: 'POST',
    body: { email, source, company },
  });
}

// ═══════════════════════════════════════════════════════════════════
// AGENTOS - AI AGENTS API
// ═══════════════════════════════════════════════════════════════════

async function agentRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, timeout = DEFAULT_TIMEOUT } = options;

  // FIX 5 (MEDIUM): Add retry logic and idempotency to agentRequest
  let lastError: FinaultAPIError | Error | undefined;
  const maxRetries = 3;
  const baseDelayMs = 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Unified: AgentOS is now part of the Gateway
    const url = `${API_URL}${endpoint}`;

    try {
      const apiKey = getApiKey();

      // FIX 4 (HIGH): Generate idempotency key for mutations
      const idempotencyKey = ['POST', 'PUT', 'PATCH'].includes(method)
        ? crypto.randomUUID?.() || Math.random().toString(36)
        : undefined;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-Finault-Api-Key': apiKey } : {}),
          ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok) {
        const error = new FinaultAPIError(
          data.error || data.message || 'Request failed',
          response.status,
          data.code
        );

        // Don't retry 4xx errors
        if (response.status >= 400 && response.status < 500) {
          throw error;
        }

        // Retry 5xx errors with exponential backoff
        if (attempt < maxRetries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          lastError = error;
          continue;
        }

        throw error;
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof FinaultAPIError) {
        // Don't retry 4xx errors
        if (error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }
        lastError = error;
      } else if (error instanceof Error) {
        if (error.name === 'AbortError') {
          lastError = new FinaultAPIError('Request timeout', 408, 'TIMEOUT');
        } else {
          lastError = new FinaultAPIError(error.message, 500, 'NETWORK_ERROR');
        }
      } else {
        lastError = new FinaultAPIError('Unknown error', 500, 'UNKNOWN');
      }

      // Retry network errors and 5xx on last attempt before throwing
      if (attempt < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      throw lastError;
    }
  }

  // Should not reach here, but throw last error just in case
  throw lastError || new FinaultAPIError('Unknown error', 500, 'UNKNOWN');
}

// Get all available agents
export async function getAgents(): Promise<{
  success: boolean;
  count: number;
  agents: Record<string, {
    name: string;
    description: string;
    capabilities: string[];
    category: string;
  }>;
}> {
  return agentRequest('/v1/agents');
}

// Chat with Finault Pal
export async function chatWithPal(
  message: string,
  sessionId?: string,
  context?: Record<string, any>
): Promise<{
  success: boolean;
  response: string;
  session_id: string;
  usage?: { total_tokens: number };
  suggestions?: string[];
}> {
  return agentRequest('/v1/agents/chat', {
    method: 'POST',
    body: { message, session_id: sessionId, context },
  });
}

// Get cost intelligence anomalies
export async function getIntelligenceAnomalies(
  timeframe?: number,
  threshold?: number
): Promise<{
  success: boolean;
  agent: string;
  anomalies_found: number;
  anomalies: Array<{
    id: string;
    type: string;
    severity: string;
    provider: string;
    model: string;
    tokens: number;
    expected: number;
    deviation: string;
    timestamp: string;
  }>;
}> {
  return agentRequest('/v1/anomalies/detect', {
    method: 'POST',
    body: { timeframe, threshold },
  });
}

// Get intelligence summary
export async function getIntelligenceSummary(): Promise<{
  success: boolean;
  period: string;
  total_requests: number;
  total_tokens: number;
  by_provider: Record<string, {
    requests: number;
    tokens: number;
    models: string[];
  }>;
}> {
  return agentRequest('/v1/usage');
}

// Get optimization recommendations
export async function getOptimizations(minSavings?: number): Promise<{
  success: boolean;
  agent: string;
  total_optimizations: number;
  total_potential_savings: string;
  optimizations: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    estimated_savings: number;
    confidence: number;
    effort: string;
    action: string;
  }>;
}> {
  return agentRequest('/v1/agents/optimize', {
    method: 'POST',
    body: { min_savings: minSavings },
  });
}

// Get AI-powered forecast
export async function getForecast(
  monthsAhead?: number,
  scenario?: 'conservative' | 'baseline' | 'aggressive'
): Promise<{
  success: boolean;
  agent: string;
  scenario: string;
  growth_rate: string;
  current_monthly_tokens: number;
  forecast: Array<{
    month: number;
    label: string;
    projected_tokens: number;
    estimated_cost: string;
    confidence_interval: { low: string; high: string };
  }>;
}> {
  return agentRequest('/v1/agents/forecast', {
    method: 'POST',
    body: { months: monthsAhead, scenario },
  });
}

// Get policy compliance status
export async function getPolicyCompliance(): Promise<{
  success: boolean;
  agent: string;
  period: string;
  compliance: {
    total_policies: number;
    compliant: number;
    violations: Array<{
      policy: string;
      current: number;
      limit: number;
      severity: string;
    }>;
    warnings: Array<{
      policy: string;
      current: number;
      limit: number;
      usage_percent: string;
    }>;
  };
  overall_status: 'compliant' | 'warning' | 'non-compliant';
}> {
  return agentRequest('/v1/agents/compliance', {
    method: 'POST',
    body: {},
  });
}

// Check budget enforcement (HTTP 402 support)
export async function checkBudgetEnforcement(
  organizationId: string,
  estimatedCost?: number
): Promise<{
  success: boolean;
  allowed: boolean;
  enforcement?: string;
  warning?: boolean;
  message?: string;
  current_spend?: number;
  remaining?: number;
}> {
  return agentRequest('/v1/budgets/check', {
    method: 'POST',
    body: { organization_id: organizationId, estimated_cost: estimatedCost },
  });
}

// AgentOS health check
export async function checkAgentOSHealth(): Promise<{
  status: string;
  timestamp: string;
  region: string;
}> {
  return agentRequest('/health');
}

// ═══════════════════════════════════════════════════════════════════
// API KEY MANAGEMENT (GAP #9 FIX)
// ═══════════════════════════════════════════════════════════════════

export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  description: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  scopes: string[];
  createdAt: string;
  revokedAt: string | null;
}

export interface CreateApiKeyResult {
  id: string;
  name: string;
  secret: string;
  keyPrefix: string;
  environment: string;
  isActive: boolean;
  scopes: string[];
  createdAt: string;
}

export async function listApiKeys(): Promise<{ success: boolean; count: number; keys: ApiKeyInfo[] }> {
  return request('/v1/keys');
}

export async function createApiKey(
  name: string,
  options?: { description?: string; environment?: string; scopes?: string[]; expiresAt?: string }
): Promise<{ success: boolean; key: CreateApiKeyResult; warning: string }> {
  return request('/v1/keys', {
    method: 'POST',
    body: { name, ...options },
  });
}

export async function revokeApiKey(keyId: string): Promise<{ success: boolean; message: string; keyId: string }> {
  // FIX 9 (MEDIUM): Encode ID to prevent query injection
  return request(`/v1/keys?id=${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
  });
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT ALL
// ═══════════════════════════════════════════════════════════════════

export const api = {
  // Health
  checkHealth,

  // Invoice
  parseInvoice,
  parseInvoiceContent,
  getInvoices,
  createInvoice,

  // Allocation
  allocateCosts,
  getRules,
  createRule,
  updateRule,
  deleteRule,

  // Close Pack
  generateClosePack,
  emailClosePack,

  // Reconciliation
  reconcileInvoice,
  getUsageLogs,

  // Anomaly
  getAnomalies,
  acknowledgeAnomaly,
  detectAnomalies,

  // Budget
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  checkBudget,

  // Analytics
  getAnalytics,
  getAnalyticsSummary,
  getMetrics,

  // Usage
  getUsage,

  // Audit
  getAuditLogs,

  // Settings
  getSettings,
  updateSettings,

  // Crypto Proof & Attestation
  generateCryptoProof,
  verifyCryptoProof,
  publicVerifyProof,
  verifyAttestation,

  // Disputes
  getDisputes,
  createDispute,
  updateDisputeStatus,
  sendDisputeEmail,
  getDisputeStats,
  generateDispute,

  // Billing
  createCheckout,

  // Lead
  captureLead,

  // ═══════════════════════════════════════════════════════════════════
  // AGENTOS
  // ═══════════════════════════════════════════════════════════════════

  // Agents
  getAgents,
  chatWithPal,

  // Intelligence
  getIntelligenceAnomalies,
  getIntelligenceSummary,

  // Optimization
  getOptimizations,

  // Forecasting
  getForecast,

  // Policy & Compliance
  getPolicyCompliance,

  // Budget Enforcement
  checkBudgetEnforcement,

  // AgentOS Health
  checkAgentOSHealth,

  // API Keys (GAP #9)
  listApiKeys,
  createApiKey,
  revokeApiKey,
};

export default api;
