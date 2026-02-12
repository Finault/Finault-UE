/**
 * FINAULT ENTERPRISE - TYPE DEFINITIONS
 * ═══════════════════════════════════════════════════════════════════
 * Production-grade TypeScript types for AI cost governance
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
// AUTHENTICATION & USER
// ═══════════════════════════════════════════════════════════════════

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  organization_id?: string;
  role: UserRole;
  subscription_tier: SubscriptionTier;
  created_at: string;
  last_login?: string;
}

export type UserRole = 'admin' | 'finance' | 'analyst' | 'viewer';
export type SubscriptionTier = 'free' | 'pro' | 'business' | 'enterprise';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  settings: OrganizationSettings;
  created_at: string;
}

export interface OrganizationSettings {
  default_currency: string;
  fiscal_year_start: number; // 1-12
  employee_count?: number;
  erp_system?: ERPSystem;
  sso_enabled?: boolean;
  sso_provider?: 'saml' | 'oidc';
}

export type ERPSystem = 'quickbooks_online' | 'quickbooks_desktop' | 'netsuite' | 'xero' | 'sage' | 'sap';

// ═══════════════════════════════════════════════════════════════════
// INVOICE & PARSING
// ═══════════════════════════════════════════════════════════════════

export interface Invoice {
  id: string;
  organization_id: string;
  provider: AIProvider;
  invoice_id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  currency: string;
  line_items: InvoiceLineItem[];
  model_breakdown: Record<string, ModelBreakdown>;
  status: InvoiceStatus;
  raw_hash: string;
  created_at: string;
  processed_at?: string;
}

export type AIProvider = 
  | 'openai' 
  | 'anthropic' 
  | 'azure-openai' 
  | 'vertex-ai' 
  | 'aws-bedrock' 
  | 'cohere' 
  | 'mistral'
  | 'together';

export type InvoiceStatus = 'pending' | 'processing' | 'processed' | 'allocated' | 'closed' | 'error';

export interface InvoiceLineItem {
  id?: string;
  date: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  amount: number;
  project?: string;
  costCenter?: string;
  costCenterName?: string;
  confidence?: number;
  ruleId?: string;
  ruleName?: string;
}

export interface ModelBreakdown {
  cost: number;
  inputTokens: number;
  outputTokens: number;
  count: number;
  percentage?: number;
}

export interface ParseResult {
  success: boolean;
  provider: AIProvider;
  invoiceId: string;
  periodStart?: string;
  periodEnd?: string;
  totalAmount: number;
  currency: string;
  lineItems: InvoiceLineItem[];
  modelBreakdown: Record<string, ModelBreakdown>;
  error?: string;
  metadata?: {
    rowCount: number;
    parsedAt: string;
  };
}

// ═══════════════════════════════════════════════════════════════════
// ALLOCATION RULES
// ═══════════════════════════════════════════════════════════════════

export interface AllocationRule {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  type: AllocationRuleType;
  pattern: string;
  cost_center: string;
  cost_center_name: string;
  priority: number;
  is_active: boolean;
  version: number;
  created_by: string;
  created_at: string;
  updated_at?: string;
  approved_by?: string;
  approved_at?: string;
}

export type AllocationRuleType = 
  | 'exact' 
  | 'prefix' 
  | 'suffix' 
  | 'regex' 
  | 'model' 
  | 'percentage' 
  | 'time_based' 
  | 'conditional';

export interface AllocationResult {
  success: boolean;
  allocatedItems: AllocatedLineItem[];
  summary: AllocationSummary;
}

export interface AllocatedLineItem extends InvoiceLineItem {
  costCenter?: string;
  costCenterName?: string;
  confidence: number;
  ruleName?: string;
  ruleId?: string;
}

export interface AllocationSummary {
  byCostCenter: Record<string, { cost: number; count: number }>;
  totalAllocated: number;
  totalUnallocated: number;
  allocationRate: string;
}

// ═══════════════════════════════════════════════════════════════════
// CLOSE PACK
// ═══════════════════════════════════════════════════════════════════

export interface ClosePack {
  metadata: ClosePackMetadata;
  summary: ClosePackSummary;
  byModel: ClosePackModelBreakdown[];
  byCostCenter: ClosePackCostCenterBreakdown[];
  journalEntry: JournalEntry;
  emailHtml: string;
}

export interface ClosePackMetadata {
  certId: string;
  period: {
    start: string;
    end: string;
    month: string;
    monthNum: number;
    year: number;
  };
  generatedAt: string;
  companyName: string;
  version: string;
}

export interface ClosePackSummary {
  totalSpend: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  modelCount: number;
  costCenterCount: number;
  providerCount?: number;
}

export interface ClosePackModelBreakdown {
  model: string;
  cost: number;
  percentage: number;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ClosePackCostCenterBreakdown {
  costCenter: string;
  cost: number;
  percentage: number;
  primaryModel?: string;
}

export interface JournalEntry {
  journalNumber: string;
  entries: JournalEntryLine[];
  totals: {
    debits: number;
    credits: number;
    balanced: boolean;
  };
  csv: string;
}

export interface JournalEntryLine {
  line: number;
  account: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
  costCenter: string;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

// ═══════════════════════════════════════════════════════════════════
// ANOMALY DETECTION
// ═══════════════════════════════════════════════════════════════════

export interface Anomaly {
  id?: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  date?: string;
  value?: number;
  expectedValue?: number;
  deviation?: number;
  description: string;
  detected_at?: string;
  acknowledged?: boolean;
  acknowledged_by?: string;
  metadata?: Record<string, any>;
}

export type AnomalyType = 
  | 'cost_spike' 
  | 'cost_drop' 
  | 'volume_spike' 
  | 'unusual_model' 
  | 'off_hours' 
  | 'budget_threshold' 
  | 'rate_anomaly';

export type AnomalySeverity = 'critical' | 'high' | 'medium' | 'low';

export interface AnomalyDetectionResult {
  success: boolean;
  anomalies: Anomaly[];
  summary: {
    total: number;
    bySeverity: Record<AnomalySeverity, number>;
  };
}

// ═══════════════════════════════════════════════════════════════════
// BUDGETS
// ═══════════════════════════════════════════════════════════════════

export interface Budget {
  id: string;
  organization_id: string;
  name: string;
  cost_center?: string;
  limit_amount: number;
  current_spend: number;
  period: BudgetPeriod;
  type: BudgetType;
  alert_threshold: number;
  status: BudgetStatus;
  created_at: string;
  updated_at?: string;
}

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type BudgetType = 'soft' | 'hard';
export type BudgetStatus = 'ok' | 'warning' | 'exceeded';

export interface BudgetCheck {
  allowed: boolean;
  currentSpend: number;
  limit: number;
  projectedSpend?: number;
  remaining: number;
  type: BudgetType;
  status: BudgetStatus;
  message?: string;
}

// ═══════════════════════════════════════════════════════════════════
// USAGE & ANALYTICS
// ═══════════════════════════════════════════════════════════════════

export interface UsageRecord {
  id: string;
  organization_id: string;
  finault_key?: string;
  cost_center: string;
  project?: string;
  budget_id?: string;
  provider?: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms?: number;
  timestamp: string;
}

export interface UsageSummary {
  period: string;
  cost_center?: string;
  total_cost: number;
  total_requests: number;
  by_model: Record<string, { cost: number; requests: number }>;
  by_day?: Record<string, number>;
}

export interface DashboardMetrics {
  totalSpend: number;
  previousPeriodSpend: number;
  changePercent: number;
  totalRequests: number;
  avgCostPerRequest: number;
  topModel: string;
  topCostCenter: string;
  allocationRate: number;
  anomalyCount: number;
  budgetUtilization: number;
}

// ═══════════════════════════════════════════════════════════════════
// GATEWAY CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

export interface GatewayConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export interface APIResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    requestId: string;
    latency: number;
  };
}

// ═══════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════

export interface AuditLogEntry {
  id: string;
  organization_id: string;
  user_id?: string;
  action: string;
  details: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  read: boolean;
  created_at: string;
  action_url?: string;
}

export type NotificationType = 
  | 'anomaly_detected'
  | 'budget_warning'
  | 'budget_exceeded'
  | 'close_pack_ready'
  | 'invoice_processed'
  | 'rule_updated'
  | 'system';
