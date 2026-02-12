/**
 * FINAULT UTILITY FUNCTIONS
 * ═══════════════════════════════════════════════════════════════════
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ═══════════════════════════════════════════════════════════════════
// CLASS NAME UTILITY
// ═══════════════════════════════════════════════════════════════════

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ═══════════════════════════════════════════════════════════════════
// CURRENCY FORMATTING
// ═══════════════════════════════════════════════════════════════════

export function formatCurrency(
  amount: number | undefined | null,
  currency: string = 'USD',
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(amount ?? 0);
}

export function formatCompactCurrency(amount: number | undefined | null, currency: string = 'USD'): string {
  const val = amount ?? 0;
  if (val >= 1_000_000) {
    return `$${(val / 1_000_000).toFixed(1)}M`;
  }
  if (val >= 1_000) {
    return `$${(val / 1_000).toFixed(1)}K`;
  }
  return formatCurrency(val, currency);
}

// ═══════════════════════════════════════════════════════════════════
// NUMBER FORMATTING
// ═══════════════════════════════════════════════════════════════════

export function formatNumber(num: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatCompactNumber(num: number | undefined | null): string {
  const val = num ?? 0;
  if (val >= 1_000_000_000) {
    return `${(val / 1_000_000_000).toFixed(1)}B`;
  }
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(1)}M`;
  }
  if (val >= 1_000) {
    return `${(val / 1_000).toFixed(1)}K`;
  }
  return val.toString();
}

export function formatPercentage(value: number | undefined | null, decimals: number = 1): string {
  return `${(value ?? 0).toFixed(decimals)}%`;
}

export function formatChange(current: number | undefined | null, previous: number | undefined | null): {
  value: number;
  formatted: string;
  direction: 'up' | 'down' | 'flat';
} {
  const curr = current ?? 0;
  const prev = previous ?? 0;
  if (prev === 0) {
    return { value: 0, formatted: '0%', direction: 'flat' };
  }

  const change = ((curr - prev) / prev) * 100;
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

  return {
    value: change,
    formatted: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
    direction,
  };
}

// ═══════════════════════════════════════════════════════════════════
// DATE FORMATTING
// ═══════════════════════════════════════════════════════════════════

export function formatDate(date: string | Date, format: 'short' | 'long' | 'full' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  const formatOptions: Record<string, Intl.DateTimeFormatOptions> = {
    short: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { month: 'long', day: 'numeric', year: 'numeric' },
    full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  };

  return new Intl.DateTimeFormat('en-US', formatOptions[format]).format(d);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return formatDate(d, 'short');
}

export function getMonthName(monthNum: number): string {
  const date = new Date(2000, monthNum - 1, 1);
  return date.toLocaleString('en-US', { month: 'long' });
}

// ═══════════════════════════════════════════════════════════════════
// FILE UTILITIES
// ═══════════════════════════════════════════════════════════════════

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getFileExtension(filename: string): string {
  return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2);
}

export function downloadFile(content: string, filename: string, type: string = 'text/csv') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════
// STRING UTILITIES
// ═══════════════════════════════════════════════════════════════════

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length - 3) + '...';
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ═══════════════════════════════════════════════════════════════════
// CRYPTO UTILITIES
// ═══════════════════════════════════════════════════════════════════

export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ═══════════════════════════════════════════════════════════════════
// VALIDATION UTILITIES
// ═══════════════════════════════════════════════════════════════════

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ═══════════════════════════════════════════════════════════════════
// COLOR UTILITIES
// ═══════════════════════════════════════════════════════════════════

export function getSeverityColor(severity: 'critical' | 'high' | 'medium' | 'low'): string {
  const colors = {
    critical: 'text-critical-500',
    high: 'text-warning-500',
    medium: 'text-warning-400',
    low: 'text-accent-500',
  };
  return colors[severity];
}

export function getSeverityBgColor(severity: 'critical' | 'high' | 'medium' | 'low'): string {
  const colors = {
    critical: 'bg-critical-500/10',
    high: 'bg-warning-500/10',
    medium: 'bg-warning-400/10',
    low: 'bg-accent-500/10',
  };
  return colors[severity];
}

export function getStatusColor(status: 'ok' | 'warning' | 'exceeded' | 'error'): string {
  const colors = {
    ok: 'text-accent-500',
    warning: 'text-warning-500',
    exceeded: 'text-critical-500',
    error: 'text-critical-500',
  };
  return colors[status];
}

// ═══════════════════════════════════════════════════════════════════
// MODEL UTILITIES
// ═══════════════════════════════════════════════════════════════════

export function getModelDisplayName(model: string): string {
  const displayNames: Record<string, string> = {
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gpt-3.5-turbo': 'GPT-3.5 Turbo',
    'o1': 'o1',
    'o1-mini': 'o1 Mini',
    'claude-3-opus': 'Claude 3 Opus',
    'claude-3.5-sonnet': 'Claude 3.5 Sonnet',
    'claude-3.5-haiku': 'Claude 3.5 Haiku',
    'claude-3-haiku': 'Claude 3 Haiku',
    'gemini-1.5-pro': 'Gemini 1.5 Pro',
    'gemini-1.5-flash': 'Gemini 1.5 Flash',
  };
  return displayNames[model] || model;
}

export function getProviderDisplayName(provider: string): string {
  const displayNames: Record<string, string> = {
    'openai': 'OpenAI',
    'anthropic': 'Anthropic',
    'azure-openai': 'Azure OpenAI',
    'vertex-ai': 'Google Vertex AI',
    'aws-bedrock': 'AWS Bedrock',
    'cohere': 'Cohere',
    'mistral': 'Mistral AI',
    'together': 'Together AI',
  };
  return displayNames[provider] || provider;
}

export function getProviderColor(provider: string): string {
  const colors: Record<string, string> = {
    'openai': '#10a37f',
    'anthropic': '#d4a574',
    'azure-openai': '#0078d4',
    'vertex-ai': '#4285f4',
    'aws-bedrock': '#ff9900',
    'cohere': '#39594d',
    'mistral': '#f24e1e',
  };
  return colors[provider] || '#6b7280';
}
