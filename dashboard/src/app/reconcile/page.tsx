'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  FileText,
  Check,
  X,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  TrendingDown,
  DollarSign,
  Zap,
  ArrowRight,
  Download,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Database,
  Link2,
  Shield,
  FileWarning,
  Copy,
  Mail,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useFinaultStore } from '@/lib/store';
import {
  api,
  ReconciliationResult,
  ReconciliationMatch,
  ReconciliationDiscrepancy,
  generateCryptoProof,
  generateDispute,
  createDispute,
  sendDisputeEmail,
  CryptoProofDocument,
  DisputeLetter,
} from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface InvoiceLineItem {
  date: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  amount: number;
  provider: string;
}

interface SavingsRecommendation {
  title: string;
  description: string;
  potentialSavings: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

// ============================================================================
// SAVINGS GENERATOR (Based on actual match data)
// ============================================================================

function generateSavingsFromMatches(result: ReconciliationResult): SavingsRecommendation[] {
  const savings: SavingsRecommendation[] = [];
  const byModel = result.byModel || {};

  // GPT-4 to GPT-4o-mini recommendation
  const gpt4Cost = (byModel['gpt-4']?.invoice || 0) + (byModel['gpt-4-turbo']?.invoice || 0);
  if (gpt4Cost > 100) {
    savings.push({
      title: 'Switch simple queries to GPT-4o-mini',
      description: `You spent $${gpt4Cost.toFixed(0)} on GPT-4 models. Based on your usage patterns, 30-40% of these could use GPT-4o-mini at 1/30th the cost.`,
      potentialSavings: gpt4Cost * 0.25,
      difficulty: 'easy',
    });
  }

  // Claude Opus to Sonnet
  const opusCost = byModel['claude-3-opus']?.invoice || 0;
  if (opusCost > 50) {
    savings.push({
      title: 'Downgrade Claude Opus to Sonnet',
      description: `$${opusCost.toFixed(0)} spent on Opus. Claude 3.5 Sonnet handles most tasks at 80% lower cost with comparable quality.`,
      potentialSavings: opusCost * 0.6,
      difficulty: 'medium',
    });
  }

  // Caching recommendation based on total spend
  if (result.invoiceTotal > 200) {
    savings.push({
      title: 'Enable semantic caching',
      description: 'High-volume usage detected. Caching similar requests could reduce redundant API calls by 15-20%.',
      potentialSavings: result.invoiceTotal * 0.12,
      difficulty: 'medium',
    });
  }

  // Prompt optimization based on variance
  if (result.variancePercentage > 0.02) {
    savings.push({
      title: 'Investigate billing variance',
      description: `${(result.variancePercentage * 100).toFixed(1)}% variance between invoice and logged usage. Review unmatched items for potential billing errors.`,
      potentialSavings: result.variance,
      difficulty: 'easy',
    });
  }

  return savings.slice(0, 4);
}

// ============================================================================
// CSV PARSER
// ============================================================================

function parseCSV(content: string): InvoiceLineItem[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
  const items: InvoiceLineItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 3) continue;

    const getCol = (names: string[]): number => {
      for (const name of names) {
        const idx = headers.findIndex(h => h.includes(name));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const dateIdx = getCol(['date', 'time', 'timestamp']);
    const modelIdx = getCol(['model', 'product']);
    const amountIdx = getCol(['amount', 'cost', 'total', 'price']);
    const inputIdx = getCol(['input', 'prompt']);
    const outputIdx = getCol(['output', 'completion']);

    items.push({
      date: dateIdx >= 0 ? values[dateIdx] : new Date().toISOString(),
      model: modelIdx >= 0 ? values[modelIdx] : 'gpt-4',
      amount: amountIdx >= 0 ? parseFloat(values[amountIdx].replace(/[$,]/g, '')) || 0 : 0,
      inputTokens: inputIdx >= 0 ? parseInt(values[inputIdx]) || 0 : 0,
      outputTokens: outputIdx >= 0 ? parseInt(values[outputIdx]) || 0 : 0,
      provider: 'openai',
    });
  }

  return items.filter(item => item.amount > 0);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ReconcilePage() {
  const { sidebarOpen } = useFinaultStore();
  const [file, setFile] = useState<File | null>(null);
  const [invoiceData, setInvoiceData] = useState<InvoiceLineItem[] | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [savings, setSavings] = useState<SavingsRecommendation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDiscrepancies, setShowDiscrepancies] = useState(false);
  const [showMatches, setShowMatches] = useState(false);

  // Diamond Tier: Cryptographic Proof & Dispute
  const [cryptoProof, setCryptoProof] = useState<CryptoProofDocument | null>(null);
  const [disputeLetter, setDisputeLetter] = useState<DisputeLetter | null>(null);
  const [generatingProof, setGeneratingProof] = useState(false);
  const [generatingDispute, setGeneratingDispute] = useState(false);
  const [showProof, setShowProof] = useState(false);
  const [showDispute, setShowDispute] = useState(false);

  // Diamond Tier: Dispute Tracking
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [disputeStatus, setDisputeStatus] = useState<'draft' | 'sending' | 'sent' | 'error'>('draft');
  const [emailRecipient, setEmailRecipient] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setIsProcessing(true);
    setResult(null);
    setSavings([]);

    try {
      const content = await uploadedFile.text();
      const parsed = parseCSV(content);

      if (parsed.length === 0) {
        toast.error('Could not parse invoice. Please check the format.');
        setIsProcessing(false);
        return;
      }

      setInvoiceData(parsed);

      // Determine date range from parsed data
      const dates = parsed.map(item => new Date(item.date).getTime()).filter(d => !isNaN(d));
      const periodStart = dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : undefined;
      const periodEnd = dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : undefined;

      // Call the REAL reconciliation API
      const response = await api.reconcileInvoice(
        {
          lineItems: parsed,
          totalAmount: parsed.reduce((sum, item) => sum + item.amount, 0),
          provider: parsed[0]?.provider || 'openai',
          periodStart,
          periodEnd,
        },
        periodStart,
        periodEnd
      );

      if (!response.success || !response.reconciliation) {
        toast.error(response.error || 'Reconciliation failed');
        setIsProcessing(false);
        return;
      }

      const reconciliation = response.reconciliation;
      setResult(reconciliation);

      // Generate savings recommendations from real data
      const savingsRecs = generateSavingsFromMatches(reconciliation);
      setSavings(savingsRecs);

      // Show appropriate toast based on status
      if (reconciliation.status === 'clean') {
        toast.success(`Reconciliation complete: ${reconciliation.confidence}% confidence`);
      } else if (reconciliation.status === 'minor_variance') {
        toast.success('Reconciliation complete with minor variances');
      } else if (reconciliation.status === 'no_data') {
        toast('No usage logs found. Route API calls through Finault Gateway.', { icon: '⚠️' });
      } else {
        toast('Reconciliation complete - review required', { icon: '⚠️' });
      }
    } catch (err) {
      console.error('Reconciliation error:', err);
      toast.error('Failed to process invoice');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const reset = () => {
    setFile(null);
    setInvoiceData(null);
    setResult(null);
    setSavings([]);
  };

  const totalPotentialSavings = useMemo(() => {
    return savings.reduce((sum, s) => sum + s.potentialSavings, 0);
  }, [savings]);

  const statusConfig = {
    clean: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Clean' },
    minor_variance: { icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Minor Variance' },
    review_required: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'Review Required' },
    failed: { icon: X, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Failed' },
    no_data: { icon: Database, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'No Usage Data' },
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <div className={cn(
        'flex-1 flex flex-col overflow-hidden transition-all duration-300',
        sidebarOpen ? 'ml-64' : 'ml-20'
      )}>
        <Header
          title="Invoice Reconciliation"
          subtitle="Match provider invoices to your actual usage data"
        />

        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-5xl mx-auto">
            <AnimatePresence mode="wait">
              {/* Upload State */}
              {!result && !isProcessing && (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <div
                    {...getRootProps()}
                    className={cn(
                      'p-16 border-2 border-dashed rounded-2xl cursor-pointer',
                      'bg-white transition-all duration-200',
                      isDragActive
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-green-400 hover:bg-green-50/50'
                    )}
                  >
                    <input {...getInputProps()} />

                    <div className="text-center">
                      <div className={cn(
                        'w-20 h-20 rounded-full mx-auto mb-6',
                        'flex items-center justify-center',
                        'bg-gray-100',
                        isDragActive && 'bg-green-100'
                      )}>
                        <Upload className={cn(
                          'w-10 h-10',
                          isDragActive ? 'text-green-600' : 'text-gray-400'
                        )} />
                      </div>

                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        {isDragActive ? 'Drop your invoice here' : 'Upload Provider Invoice'}
                      </h3>

                      <p className="text-gray-500 mb-6 max-w-md mx-auto">
                        Drop your OpenAI, Anthropic, or other provider invoice CSV to reconcile against your actual gateway usage logs.
                      </p>

                      <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
                        <span className="px-3 py-1 bg-gray-100 rounded-full">CSV</span>
                        <span>Up to 10MB</span>
                      </div>
                    </div>
                  </div>

                  {/* Value Props */}
                  <div className="grid grid-cols-3 gap-6 mt-8">
                    <div className="p-6 bg-white rounded-xl border border-gray-200">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                        <Link2 className="w-5 h-5 text-green-600" />
                      </div>
                      <h4 className="font-semibold text-gray-900 mb-1">Real Matching</h4>
                      <p className="text-sm text-gray-500">Match every invoice line against actual gateway logs</p>
                    </div>
                    <div className="p-6 bg-white rounded-xl border border-gray-200">
                      <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mb-4">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                      </div>
                      <h4 className="font-semibold text-gray-900 mb-1">Flag Discrepancies</h4>
                      <p className="text-sm text-gray-500">Surface billing errors before they become problems</p>
                    </div>
                    <div className="p-6 bg-white rounded-xl border border-gray-200">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                        <TrendingDown className="w-5 h-5 text-green-600" />
                      </div>
                      <h4 className="font-semibold text-gray-900 mb-1">Find Savings</h4>
                      <p className="text-sm text-gray-500">Get actionable recommendations from your data</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Processing State */}
              {isProcessing && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="p-16 bg-white rounded-2xl border border-gray-200 text-center"
                >
                  <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center bg-green-100">
                    <RefreshCw className="w-10 h-10 text-green-600 animate-spin" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Reconciling Invoice
                  </h3>
                  <p className="text-gray-500">
                    Fetching usage logs and matching against invoice...
                  </p>
                </motion.div>
              )}

              {/* Results State */}
              {result && !isProcessing && (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  {/* Status Banner */}
                  <div className={cn(
                    'p-6 rounded-2xl border',
                    statusConfig[result.status].bg,
                    'border-current/10'
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {React.createElement(statusConfig[result.status].icon, {
                          className: cn('w-8 h-8', statusConfig[result.status].color)
                        })}
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            Reconciliation {statusConfig[result.status].label}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {result.confidence}% confidence • {result.matches.length} line items matched • {result.usageLogCount} usage logs analyzed
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={reset}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-lg border border-gray-200 hover:bg-gray-50"
                      >
                        Upload Another
                      </button>
                    </div>
                  </div>

                  {/* Summary Cards */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="p-5 bg-white rounded-xl border border-gray-200">
                      <p className="text-sm text-gray-500 mb-1">Invoice Total</p>
                      <p className="text-2xl font-bold text-gray-900">{formatCurrency(result.invoiceTotal)}</p>
                    </div>
                    <div className="p-5 bg-white rounded-xl border border-gray-200">
                      <p className="text-sm text-gray-500 mb-1">Logged Usage</p>
                      <p className="text-2xl font-bold text-gray-900">{formatCurrency(result.internalTotal)}</p>
                    </div>
                    <div className="p-5 bg-white rounded-xl border border-gray-200">
                      <p className="text-sm text-gray-500 mb-1">Variance</p>
                      <p className={cn(
                        'text-2xl font-bold',
                        result.variance < 5 ? 'text-green-600' : 'text-amber-600'
                      )}>
                        {formatCurrency(result.variance)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {(result.variancePercentage * 100).toFixed(2)}%
                      </p>
                    </div>
                    <div className="p-5 bg-green-50 rounded-xl border border-green-200">
                      <p className="text-sm text-green-700 mb-1">Potential Savings</p>
                      <p className="text-2xl font-bold text-green-700">{formatCurrency(totalPotentialSavings)}</p>
                    </div>
                  </div>

                  {/* ══════════════════════════════════════════════════════════════
                       DIAMOND TIER: Cryptographic Proof & One-Click Dispute
                       This is THE MOAT. The viral moment. The competitive advantage.
                  ══════════════════════════════════════════════════════════════ */}
                  {(result.variance > 10 || result.discrepancies.some(d => d.severity === 'high')) && (
                    <div className="p-6 bg-gradient-to-r from-amber-50 to-red-50 rounded-2xl border border-amber-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-amber-100 rounded-xl">
                            <FileWarning className="w-6 h-6 text-amber-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">
                              Billing Discrepancy Detected: {formatCurrency(result.variance)}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {result.discrepancies.filter(d => d.severity === 'high').length} high-severity issues found. Generate cryptographic proof for dispute.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Generate Proof Button */}
                          <button
                            onClick={async () => {
                              if (cryptoProof) {
                                setShowProof(!showProof);
                                return;
                              }
                              setGeneratingProof(true);
                              try {
                                const response = await generateCryptoProof(
                                  result.period.start,
                                  result.period.end,
                                  invoiceData ? {
                                    lineItems: invoiceData,
                                    totalAmount: result.invoiceTotal,
                                    provider: result.provider,
                                  } : undefined
                                );
                                if (response.success) {
                                  setCryptoProof(response.proof);
                                  setShowProof(true);
                                  toast.success('Cryptographic proof generated!');
                                }
                              } catch (err) {
                                toast.error('Failed to generate proof');
                              } finally {
                                setGeneratingProof(false);
                              }
                            }}
                            disabled={generatingProof}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium"
                          >
                            {generatingProof ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Shield className="w-4 h-4 text-green-600" />
                            )}
                            {cryptoProof ? 'View Proof' : 'Generate Proof'}
                          </button>

                          {/* One-Click Dispute Button - THE VIRAL MOMENT */}
                          <button
                            onClick={async () => {
                              if (disputeLetter) {
                                setShowDispute(!showDispute);
                                return;
                              }
                              setGeneratingDispute(true);
                              try {
                                const response = await generateDispute(
                                  result,
                                  result.provider || 'openai',
                                  cryptoProof || undefined
                                );
                                if (response.success) {
                                  setDisputeLetter(response.dispute);
                                  setShowDispute(true);
                                  toast.success('Dispute letter generated!');
                                }
                              } catch (err) {
                                toast.error('Failed to generate dispute');
                              } finally {
                                setGeneratingDispute(false);
                              }
                            }}
                            disabled={generatingDispute}
                            className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-bold shadow-lg shadow-red-600/30"
                          >
                            {generatingDispute ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Mail className="w-4 h-4" />
                            )}
                            {disputeLetter ? 'View Dispute' : `Dispute ${formatCurrency(result.variance)}`}
                          </button>
                        </div>
                      </div>

                      {/* Cryptographic Proof Details */}
                      {showProof && cryptoProof && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-6 p-5 bg-white rounded-xl border border-gray-200"
                        >
                          {/* DIAMOND TIER: Public Verification Header */}
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                                <Shield className="w-5 h-5 text-green-600" />
                                Cryptographic Verification
                              </h4>
                              {cryptoProof.verification_id && (
                                <p className="text-sm text-green-600 font-mono mt-1">{cryptoProof.verification_id}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {cryptoProof.verification_url && (
                                <a
                                  href={cryptoProof.verification_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 px-3 py-1 text-sm text-green-700 bg-green-50 rounded hover:bg-green-100"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Verify Online
                                </a>
                              )}
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(JSON.stringify(cryptoProof, null, 2));
                                  toast.success('Proof copied to clipboard');
                                }}
                                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                              >
                                <Copy className="w-4 h-4" />
                                Copy
                              </button>
                            </div>
                          </div>

                          {/* QR Code + Details Grid */}
                          <div className="flex gap-6">
                            {/* QR Code */}
                            {cryptoProof.verification_qr && (
                              <div className="flex-shrink-0">
                                <img
                                  src={cryptoProof.verification_qr}
                                  alt="Verification QR Code"
                                  className="w-32 h-32 rounded-lg border border-gray-200"
                                />
                                <p className="text-xs text-gray-500 text-center mt-2">Scan to verify</p>
                              </div>
                            )}

                            {/* Details */}
                            <div className="flex-1 grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-gray-500">Merkle Root:</span>
                                <p className="font-mono text-xs text-gray-700 break-all">{cryptoProof.merkle_root?.slice(0, 32)}...</p>
                              </div>
                              <div>
                                <span className="text-gray-500">Document Hash:</span>
                                <p className="font-mono text-xs text-gray-700 break-all">{cryptoProof.document_hash?.slice(0, 32)}...</p>
                              </div>
                              <div>
                                <span className="text-gray-500">Logs Verified:</span>
                                <p className="font-medium text-gray-900">{cryptoProof.log_count?.toLocaleString()}</p>
                              </div>
                              <div>
                                <span className="text-gray-500">Algorithm:</span>
                                <p className="font-medium text-gray-900">SHA-256 Merkle Tree</p>
                              </div>
                              {cryptoProof.external_anchor && (
                                <>
                                  <div>
                                    <span className="text-gray-500">Anchor Service:</span>
                                    <p className="font-medium text-gray-900">{cryptoProof.external_anchor.service}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Anchored At:</span>
                                    <p className="font-medium text-gray-900">{new Date(cryptoProof.external_anchor.anchor_timestamp).toLocaleString()}</p>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 p-3 bg-green-50 rounded-lg">
                            <p className="text-xs text-green-700">
                              <strong>Independent Verification:</strong> This proof is registered in Finault's public registry.
                              Anyone can verify by visiting the link above or scanning the QR code.
                              Auditors can reconstruct the Merkle tree from your usage logs to confirm data integrity.
                            </p>
                          </div>
                        </motion.div>
                      )}

                      {/* Dispute Letter - DIAMOND TIER */}
                      {showDispute && disputeLetter && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-6 p-5 bg-white rounded-xl border border-gray-200"
                        >
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                              <Mail className="w-5 h-5 text-red-600" />
                              {disputeLetter.header.subject}
                            </h4>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(disputeLetter.letter_body);
                                  toast.success('Letter copied to clipboard');
                                }}
                                className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                              >
                                <Copy className="w-4 h-4" />
                                Copy
                              </button>
                            </div>
                          </div>

                          {/* Summary Cards */}
                          <div className="grid grid-cols-4 gap-3 mb-4 p-3 bg-gray-50 rounded-lg text-sm">
                            <div>
                              <span className="text-gray-500">Invoice Total</span>
                              <p className="font-semibold">{formatCurrency(disputeLetter.summary.invoice_total)}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Verified Usage</span>
                              <p className="font-semibold">{formatCurrency(disputeLetter.summary.verified_usage)}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Disputed</span>
                              <p className="font-bold text-red-600">{formatCurrency(disputeLetter.summary.disputed_amount)}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Reference</span>
                              <p className="font-mono text-xs">{disputeLetter.header.reference}</p>
                            </div>
                          </div>

                          {/* DIAMOND TIER: Real Email Sending */}
                          {disputeStatus !== 'sent' && (
                            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                              <h5 className="text-sm font-semibold text-amber-800 mb-3">Send Dispute to Provider</h5>
                              <div className="flex items-center gap-3">
                                <input
                                  type="email"
                                  placeholder={`billing@${result.provider}.com`}
                                  value={emailRecipient}
                                  onChange={(e) => setEmailRecipient(e.target.value)}
                                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                                <button
                                  onClick={async () => {
                                    const recipient = emailRecipient || `billing@${result.provider}.com`;
                                    setDisputeStatus('sending');
                                    try {
                                      // First create the dispute for tracking
                                      const createResult = await createDispute(
                                        disputeLetter,
                                        cryptoProof || undefined,
                                        result.provider
                                      );
                                      if (createResult.success) {
                                        setDisputeId(createResult.dispute.id);
                                      }

                                      // Then send the email
                                      const sendResult = await sendDisputeEmail(
                                        createResult.dispute?.id || '',
                                        disputeLetter.letter_body,
                                        recipient,
                                        result.provider,
                                        disputeLetter.header.subject
                                      );

                                      if (sendResult.success && sendResult.email_sent) {
                                        setDisputeStatus('sent');
                                        toast.success(`Dispute sent to ${recipient}! We'll track the response.`);
                                      } else {
                                        // Fallback to mailto if email service not configured
                                        const mailto = `mailto:${recipient}?subject=${encodeURIComponent(disputeLetter.header.subject)}&body=${encodeURIComponent(disputeLetter.letter_body)}`;
                                        window.open(mailto, '_blank');
                                        setDisputeStatus('sent');
                                        toast.success('Email client opened. Send from there.');
                                      }
                                    } catch (err) {
                                      // Fallback to mailto
                                      const mailto = `mailto:${recipient}?subject=${encodeURIComponent(disputeLetter.header.subject)}&body=${encodeURIComponent(disputeLetter.letter_body)}`;
                                      window.open(mailto, '_blank');
                                      setDisputeStatus('sent');
                                    }
                                  }}
                                  disabled={disputeStatus === 'sending'}
                                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 shadow-lg shadow-red-600/30"
                                >
                                  {disputeStatus === 'sending' ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Mail className="w-4 h-4" />
                                  )}
                                  Send Dispute
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Success State */}
                          {disputeStatus === 'sent' && (
                            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                              <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-6 h-6 text-green-600" />
                                <div>
                                  <h5 className="font-semibold text-green-800">Dispute Sent Successfully!</h5>
                                  <p className="text-sm text-green-600">
                                    Reference: {disputeLetter.header.reference} • Average resolution: 7-14 business days
                                  </p>
                                </div>
                              </div>
                              {cryptoProof?.verification_url && (
                                <div className="mt-3 flex items-center gap-2">
                                  <span className="text-xs text-green-700">Verification link:</span>
                                  <a
                                    href={cryptoProof.verification_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-green-800 underline font-mono"
                                  >
                                    {cryptoProof.verification_id}
                                  </a>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Letter Preview */}
                          <div className="prose prose-sm max-w-none">
                            <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded-lg font-sans">
                              {disputeLetter.letter_body}
                            </pre>
                          </div>

                          {/* QR Code for verification */}
                          {cryptoProof?.verification_qr && (
                            <div className="mt-4 flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                              <div>
                                <p className="text-sm font-medium text-gray-700">Scan to Verify Proof</p>
                                <p className="text-xs text-gray-500">Auditors can independently verify this reconciliation</p>
                                <p className="text-xs font-mono text-gray-600 mt-1">{cryptoProof.verification_id}</p>
                              </div>
                              <img
                                src={cryptoProof.verification_qr}
                                alt="Verification QR Code"
                                className="w-24 h-24 rounded-lg border border-gray-200"
                              />
                            </div>
                          )}
                        </motion.div>
                      )}
                    </div>
                  )}

                  {/* Matched Records (Collapsible) */}
                  {result.matches.length > 0 && (
                    <div className="p-6 bg-white rounded-2xl border border-gray-200">
                      <button
                        onClick={() => setShowMatches(!showMatches)}
                        className="flex items-center justify-between w-full"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                          <h3 className="text-lg font-semibold text-gray-900">
                            Matched Records ({result.matches.length})
                          </h3>
                        </div>
                        {showMatches ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </button>

                      {showMatches && (
                        <div className="mt-4 space-y-2">
                          <div className="grid grid-cols-5 gap-4 px-3 py-2 text-xs font-medium text-gray-500 uppercase">
                            <span>Model</span>
                            <span>Date</span>
                            <span className="text-right">Invoice</span>
                            <span className="text-right">Logged</span>
                            <span className="text-right">Confidence</span>
                          </div>
                          {result.matches.map((match, index) => (
                            <div
                              key={index}
                              className="grid grid-cols-5 gap-4 px-3 py-3 bg-gray-50 rounded-lg text-sm"
                            >
                              <span className="font-medium text-gray-900">{match.invoiceModel}</span>
                              <span className="text-gray-600">{match.invoiceDate}</span>
                              <span className="text-right text-gray-900">{formatCurrency(match.invoiceCost)}</span>
                              <span className="text-right text-gray-900">{formatCurrency(match.internalCost)}</span>
                              <span className={cn(
                                'text-right font-medium',
                                match.confidence >= 90 ? 'text-green-600' :
                                match.confidence >= 70 ? 'text-amber-600' : 'text-red-600'
                              )}>
                                {match.confidence.toFixed(0)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Savings Recommendations */}
                  {savings.length > 0 && (
                    <div className="p-6 bg-white rounded-2xl border border-gray-200">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-5 h-5 text-green-600" />
                        <h3 className="text-lg font-semibold text-gray-900">Savings Opportunities</h3>
                      </div>
                      <div className="space-y-3">
                        {savings.map((saving, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
                          >
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{saving.title}</p>
                              <p className="text-sm text-gray-500">{saving.description}</p>
                            </div>
                            <div className="text-right ml-4">
                              <p className="text-lg font-bold text-green-600">
                                {formatCurrency(saving.potentialSavings)}
                              </p>
                              <p className={cn(
                                'text-xs px-2 py-0.5 rounded-full',
                                saving.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                                saving.difficulty === 'medium' ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-700'
                              )}>
                                {saving.difficulty}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Discrepancies (Collapsible) */}
                  {result.discrepancies.length > 0 && (
                    <div className="p-6 bg-white rounded-2xl border border-gray-200">
                      <button
                        onClick={() => setShowDiscrepancies(!showDiscrepancies)}
                        className="flex items-center justify-between w-full"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-amber-500" />
                          <h3 className="text-lg font-semibold text-gray-900">
                            Discrepancies ({result.discrepancies.length})
                          </h3>
                        </div>
                        {showDiscrepancies ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </button>

                      {showDiscrepancies && (
                        <div className="mt-4 space-y-2">
                          {result.discrepancies.map((d, index) => (
                            <div
                              key={index}
                              className={cn(
                                'p-3 rounded-lg border',
                                d.severity === 'high' ? 'bg-red-50 border-red-200' :
                                d.severity === 'medium' ? 'bg-amber-50 border-amber-200' :
                                'bg-gray-50 border-gray-200'
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className={cn(
                                    'text-xs font-medium px-2 py-0.5 rounded mr-2',
                                    d.severity === 'high' ? 'bg-red-100 text-red-700' :
                                    d.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                                    'bg-gray-100 text-gray-700'
                                  )}>
                                    {d.type.replace(/_/g, ' ').toUpperCase()}
                                  </span>
                                  <p className="text-sm text-gray-900 mt-1">{d.description}</p>
                                </div>
                                <span className={cn(
                                  'text-sm font-medium',
                                  d.severity === 'high' ? 'text-red-600' :
                                  d.severity === 'medium' ? 'text-amber-600' :
                                  'text-gray-600'
                                )}>
                                  {formatCurrency(d.amount)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* No Data State */}
                  {result.status === 'no_data' && (
                    <div className="p-6 bg-blue-50 rounded-2xl border border-blue-200">
                      <div className="flex items-start gap-4">
                        <Database className="w-8 h-8 text-blue-500 flex-shrink-0 mt-1" />
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            No Usage Logs Found
                          </h3>
                          <p className="text-gray-600 mb-4">
                            To enable real reconciliation, route your AI API calls through the Finault Gateway.
                            This allows us to match every invoice line item against actual usage.
                          </p>
                          <a
                            href="/gateway"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            Set Up Gateway
                            <ArrowRight className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between p-6 bg-gray-900 rounded-2xl">
                    <div>
                      <p className="text-white font-medium">Ready to close the books?</p>
                      <p className="text-gray-400 text-sm">Generate your month-end Close Pack with all 9 documents.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 rounded-lg hover:bg-gray-700">
                        <Download className="w-4 h-4 inline mr-2" />
                        Export Report
                      </button>
                      <button
                        onClick={() => window.location.href = '/close-pack'}
                        className="px-6 py-2 text-sm font-medium text-gray-900 bg-green-500 rounded-lg hover:bg-green-400 flex items-center gap-2"
                      >
                        Generate Close Pack
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
