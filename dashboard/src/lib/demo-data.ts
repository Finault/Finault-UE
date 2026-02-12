/**
 * DEMO DATA FOR FINAULT DASHBOARD
 * ═══════════════════════════════════════════════════════════════════
 * All demo/fake data is centralized here and gated by NEXT_PUBLIC_DEMO_MODE
 * This file should only be used during development or demo mode.
 * ═══════════════════════════════════════════════════════════════════
 */

export const DEMO_MODE_ENABLED = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

// ═══════════════════════════════════════════════════════════════════
// SPEND CHART DATA
// ═══════════════════════════════════════════════════════════════════

interface SpendChartDataPoint {
  date: string;
  spend: number;
  budget: number;
}

/**
 * Seeded random for consistent demo values
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Generate deterministic demo data for spend chart
 */
export function generateDemoSpendData(baseDate: Date): SpendChartDataPoint[] {
  const data: SpendChartDataPoint[] = [];

  for (let i = 29; i >= 0; i--) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - i);

    // Use deterministic "random" based on day number
    const seed = i * 1000 + date.getDate();
    const randomFactor = seededRandom(seed);

    const baseSpend = 1500 + randomFactor * 500;
    const weekendMultiplier = [0, 6].includes(date.getDay()) ? 0.4 : 1;

    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      spend: Math.round(baseSpend * weekendMultiplier),
      budget: 2000,
    });
  }

  return data;
}

// ═══════════════════════════════════════════════════════════════════
// MODEL BREAKDOWN DATA
// ═══════════════════════════════════════════════════════════════════

export interface ModelBreakdownItem {
  model: string;
  cost: number;
  percentage: number;
  provider: string;
}

export const DEMO_MODEL_DATA: ModelBreakdownItem[] = [
  { model: 'gpt-4o', cost: 18432.50, percentage: 38.5, provider: 'openai' },
  { model: 'claude-3.5-sonnet', cost: 12847.30, percentage: 26.9, provider: 'anthropic' },
  { model: 'gpt-4o-mini', cost: 8234.15, percentage: 17.2, provider: 'openai' },
  { model: 'claude-3.5-haiku', cost: 4521.80, percentage: 9.5, provider: 'anthropic' },
  { model: 'gemini-1.5-pro', cost: 2387.70, percentage: 5.0, provider: 'vertex-ai' },
  { model: 'other', cost: 1400.00, percentage: 2.9, provider: 'other' },
];

// ═══════════════════════════════════════════════════════════════════
// RECENT ACTIVITY DATA
// ═══════════════════════════════════════════════════════════════════

import { FileText, GitBranch, Download, AlertTriangle, Check } from 'lucide-react';

export interface ActivityItemBase {
  id: string;
  type: string;
  title: string;
  description: string;
  icon: typeof FileText;
  color: string;
  bgColor: string;
}

export const DEMO_ACTIVITY_ITEMS_BASE: ActivityItemBase[] = [
  {
    id: '1',
    type: 'invoice_processed',
    title: 'OpenAI invoice processed',
    description: 'December 2025 invoice allocated to 12 cost centers',
    icon: FileText,
    color: 'text-accent-500',
    bgColor: 'bg-accent-500/10',
  },
  {
    id: '2',
    type: 'rule_created',
    title: 'New allocation rule created',
    description: 'Prefix rule for ML-* projects → R&D',
    icon: GitBranch,
    color: 'text-finault-400',
    bgColor: 'bg-finault-400/10',
  },
  {
    id: '3',
    type: 'close_pack_generated',
    title: 'Close Pack generated',
    description: 'November 2025 Close Pack ready for download',
    icon: Download,
    color: 'text-accent-500',
    bgColor: 'bg-accent-500/10',
  },
  {
    id: '4',
    type: 'anomaly_resolved',
    title: 'Anomaly resolved',
    description: 'Cost spike in Marketing acknowledged',
    icon: Check,
    color: 'text-accent-500',
    bgColor: 'bg-accent-500/10',
  },
  {
    id: '5',
    type: 'budget_alert',
    title: 'Budget alert triggered',
    description: 'Engineering team at 85% of monthly budget',
    icon: AlertTriangle,
    color: 'text-warning-500',
    bgColor: 'bg-warning-500/10',
  },
];

// Time offsets in milliseconds for demo data
export const ACTIVITY_TIME_OFFSETS = [0, 3600000, 7200000, 86400000, 172800000];

// ═══════════════════════════════════════════════════════════════════
// ANOMALY ALERTS DATA
// ═══════════════════════════════════════════════════════════════════

export interface AnomalyAlertBase {
  id: string;
  type: 'cost_spike' | 'unusual_model' | 'off_hours';
  severity: 'high' | 'medium' | 'low';
  description: string;
  value?: number;
  expectedValue?: number;
}

export const DEMO_ANOMALIES_BASE: AnomalyAlertBase[] = [
  {
    id: '1',
    type: 'cost_spike',
    severity: 'high',
    description: 'Engineering team spend 156% above average',
    value: 4523.50,
    expectedValue: 1765.00,
  },
  {
    id: '2',
    type: 'unusual_model',
    severity: 'medium',
    description: 'First usage of GPT-4-turbo-preview detected',
  },
  {
    id: '3',
    type: 'off_hours',
    severity: 'low',
    description: '23 requests between 2-5 AM from Marketing API key',
  },
];

// Time offsets for anomaly demo data
export const ANOMALY_TIME_OFFSETS = [0, 3600000, 86400000];

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD METRICS DATA
// ═══════════════════════════════════════════════════════════════════

export interface DemoMetrics {
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

export const DEMO_METRICS: DemoMetrics = {
  totalSpend: 47823.45,
  previousPeriodSpend: 41567.23,
  changePercent: 15,
  totalRequests: 1247832,
  avgCostPerRequest: 0.038,
  topModel: 'gpt-4o',
  topCostCenter: 'Engineering',
  allocationRate: 94.2,
  anomalyCount: 3,
  budgetUtilization: 72,
};
