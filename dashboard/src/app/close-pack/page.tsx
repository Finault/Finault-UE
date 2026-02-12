'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  FileText,
  Calendar,
  Shield,
  Clock,
  ArrowRight,
  File,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useFinaultStore } from '@/lib/store';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'invoice' | 'urs';
type Status = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

interface UploadedFile {
  file: File;
  id: string;
}

const CLOSEPACK_URL = 'https://closepack.finault.ai';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <FileText className="w-4 h-4 text-critical-500" />;
  if (ext === 'csv') return <FileSpreadsheet className="w-4 h-4 text-accent-500" />;
  if (ext === 'xlsx' || ext === 'xls') return <FileSpreadsheet className="w-4 h-4 text-blue-500" />;
  if (ext === 'json') return <File className="w-4 h-4 text-yellow-500" />;
  return <File className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
// Invoice Close Tab
// ---------------------------------------------------------------------------

function InvoiceCloseTab() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>('close-pack.zip');
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const onDrop = useCallback((accepted: File[]) => {
    const newFiles = accepted.map((f) => ({ file: f, id: generateId() }));
    setFiles((prev) => [...prev, ...newFiles]);
    setError(null);
    setStatus('idle');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/pdf': ['.pdf'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/json': ['.json'],
      'text/plain': ['.txt'],
    },
    maxSize: 25 * 1024 * 1024,
  });

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleGenerate() {
    if (files.length === 0) return;

    setStatus('uploading');
    setError(null);
    setDownloadUrl(null);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f.file));

      setStatus('processing');

      const res = await fetch(`${CLOSEPACK_URL}/closepack?t=${Date.now()}`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        throw new Error(`Close Pack generation failed (${res.status}): ${text}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Use filename from Content-Disposition header (worker returns hash-based name)
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]+)/);
      setDownloadName(filenameMatch ? filenameMatch[1] : 'close-pack.zip');
      setDownloadUrl(url);
      setStatus('complete');
    } catch (err: any) {
      console.error('Close pack error:', err);
      setError(err.message || 'Failed to generate close pack');
      setStatus('error');
    }
  }

  function handleDownload() {
    if (downloadUrl && downloadRef.current) {
      downloadRef.current.click();
    }
  }

  function handleReset() {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setFiles([]);
    setStatus('idle');
    setError(null);
    setDownloadUrl(null);
  }

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div className="flex items-start gap-4 p-4 rounded-lg bg-[hsl(var(--secondary))]">
        <Shield className="w-5 h-5 text-accent-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">
            Invoice Close Pack
          </p>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Upload your AI provider invoices (PDF, CSV, XLSX, JSON, or TXT).
            Finault generates your complete close pack — journal entries,
            allocation schedules, executive summary, and audit-ready documentation.
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer',
          isDragActive
            ? 'border-accent-500 bg-accent-500/5'
            : 'border-[hsl(var(--border))] hover:border-accent-500/50 hover:bg-[hsl(var(--secondary))]/50',
          status === 'processing' && 'pointer-events-none opacity-50'
        )}
      >
        <input {...getInputProps()} />
        <Upload className={cn(
          'w-10 h-10 mx-auto mb-3',
          isDragActive ? 'text-accent-500' : 'text-[hsl(var(--muted-foreground))]'
        )} />
        {isDragActive ? (
          <p className="text-accent-500 font-medium">Drop invoices here</p>
        ) : (
          <>
            <p className="font-medium text-[hsl(var(--foreground))]">
              Drag & drop invoices, or click to browse
            </p>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              PDF, CSV, XLSX, XLS, JSON, TXT — up to 25 MB
            </p>
          </>
        )}
      </div>

      {/* File list */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {files.map((f) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {fileIcon(f.file.name)}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.file.name}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {humanFileSize(f.file.size)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(f.id);
                  }}
                  className="p-1 rounded hover:bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                  disabled={status === 'processing'}
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-start gap-3 p-4 rounded-lg bg-critical-500/10 border border-critical-500/20"
          >
            <AlertCircle className="w-5 h-5 text-critical-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-critical-500">Generation Failed</p>
              <p className="text-sm text-critical-400 mt-0.5">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success */}
      <AnimatePresence>
        {status === 'complete' && downloadUrl && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-lg bg-accent-500/10 border border-accent-500/20"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-accent-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-accent-500">Close Pack Ready</p>
                <p className="text-sm text-accent-400 mt-0.5">
                  Your close pack has been generated with all audit-ready documentation.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {status === 'complete' && downloadUrl ? (
          <>
            <a ref={downloadRef} href={downloadUrl} download={downloadName} className="hidden" />
            <button
              onClick={handleDownload}
              className="btn-primary flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium"
            >
              <Download className="w-4 h-4" />
              Download Close Pack
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2.5 rounded-lg font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
            >
              Generate Another
            </button>
          </>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={files.length === 0 || status === 'processing' || status === 'uploading'}
            className={cn(
              'flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all',
              files.length > 0 && status !== 'processing'
                ? 'btn-primary'
                : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] cursor-not-allowed'
            )}
          >
            {status === 'processing' || status === 'uploading' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating Close Pack...
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                Generate Close Pack
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage Reconciliation Tab
// ---------------------------------------------------------------------------

function UsageReconciliationTab() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [periodStart, setPeriodStart] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>('reconciliation-pack.zip');
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const onDrop = useCallback((accepted: File[]) => {
    const newFiles = accepted.map((f) => ({ file: f, id: generateId() }));
    setFiles((prev) => [...prev, ...newFiles]);
    setError(null);
    setStatus('idle');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxSize: 25 * 1024 * 1024,
  });

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  // Set sensible defaults for period dates
  function getDefaultPeriodStart(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }

  function getDefaultPeriodEnd(): string {
    const d = new Date();
    d.setDate(0); // last day of previous month
    return d.toISOString().slice(0, 10);
  }

  async function handleReconcile() {
    if (files.length === 0) return;

    const start = periodStart || getDefaultPeriodStart();
    const end = periodEnd || getDefaultPeriodEnd();

    setStatus('uploading');
    setError(null);
    setDownloadUrl(null);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('file', f.file));
      formData.append('period_start', start);
      formData.append('period_end', end);

      setStatus('processing');

      const res = await fetch(`${CLOSEPACK_URL}/reconcilepack?t=${Date.now()}`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        throw new Error(`Reconciliation failed (${res.status}): ${text}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Use filename from Content-Disposition header (worker returns hash-based name)
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]+)/);
      setDownloadName(filenameMatch ? filenameMatch[1] : 'reconciliation-pack.zip');
      setDownloadUrl(url);
      setStatus('complete');
    } catch (err: any) {
      console.error('Reconciliation error:', err);
      setError(err.message || 'Failed to run reconciliation');
      setStatus('error');
    }
  }

  function handleDownload() {
    if (downloadUrl && downloadRef.current) {
      downloadRef.current.click();
    }
  }

  function handleReset() {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setFiles([]);
    setPeriodStart('');
    setPeriodEnd('');
    setStatus('idle');
    setError(null);
    setDownloadUrl(null);
  }

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div className="flex items-start gap-4 p-4 rounded-lg bg-[hsl(var(--secondary))]">
        <Clock className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">
            Usage Reconciliation Statement
          </p>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Upload your AI usage logs (CSV) and specify the billing period.
            Finault reconciles your actual usage against provider invoices —
            identifying variances, duplicate charges, and potential savings.
          </p>
        </div>
      </div>

      {/* Period selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
            Period Start
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              placeholder={getDefaultPeriodStart()}
              className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
            />
          </div>
          {!periodStart && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Defaults to {getDefaultPeriodStart()}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
            Period End
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              placeholder={getDefaultPeriodEnd()}
              className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
            />
          </div>
          {!periodEnd && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Defaults to {getDefaultPeriodEnd()}
            </p>
          )}
        </div>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer',
          isDragActive
            ? 'border-blue-500 bg-blue-500/5'
            : 'border-[hsl(var(--border))] hover:border-blue-500/50 hover:bg-[hsl(var(--secondary))]/50',
          status === 'processing' && 'pointer-events-none opacity-50'
        )}
      >
        <input {...getInputProps()} />
        <Upload className={cn(
          'w-10 h-10 mx-auto mb-3',
          isDragActive ? 'text-blue-500' : 'text-[hsl(var(--muted-foreground))]'
        )} />
        {isDragActive ? (
          <p className="text-blue-500 font-medium">Drop usage logs here</p>
        ) : (
          <>
            <p className="font-medium text-[hsl(var(--foreground))]">
              Drag & drop usage logs, or click to browse
            </p>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              CSV files — up to 25 MB
            </p>
          </>
        )}
      </div>

      {/* File list */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {files.map((f) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileSpreadsheet className="w-4 h-4 text-accent-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.file.name}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {humanFileSize(f.file.size)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(f.id);
                  }}
                  className="p-1 rounded hover:bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                  disabled={status === 'processing'}
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-start gap-3 p-4 rounded-lg bg-critical-500/10 border border-critical-500/20"
          >
            <AlertCircle className="w-5 h-5 text-critical-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-critical-500">Reconciliation Failed</p>
              <p className="text-sm text-critical-400 mt-0.5">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success */}
      <AnimatePresence>
        {status === 'complete' && downloadUrl && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-lg bg-accent-500/10 border border-accent-500/20"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-accent-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-accent-500">Reconciliation Complete</p>
                <p className="text-sm text-accent-400 mt-0.5">
                  Your usage reconciliation statement is ready with variance analysis and savings recommendations.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {status === 'complete' && downloadUrl ? (
          <>
            <a ref={downloadRef} href={downloadUrl} download={downloadName} className="hidden" />
            <button
              onClick={handleDownload}
              className="btn-primary flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium"
            >
              <Download className="w-4 h-4" />
              Download Reconciliation Pack
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2.5 rounded-lg font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
            >
              Reconcile Another
            </button>
          </>
        ) : (
          <button
            onClick={handleReconcile}
            disabled={files.length === 0 || status === 'processing' || status === 'uploading'}
            className={cn(
              'flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all',
              files.length > 0 && status !== 'processing'
                ? 'btn-primary'
                : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] cursor-not-allowed'
            )}
          >
            {status === 'processing' || status === 'uploading' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running Reconciliation...
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                Run Reconciliation
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ClosePackPage() {
  const [activeTab, setActiveTab] = useState<Tab>('invoice');
  const { sidebarOpen } = useFinaultStore();

  return (
    <div className="flex h-screen bg-[hsl(var(--background))]">
      <Sidebar />

      <div
        className={cn(
          'flex-1 flex flex-col overflow-hidden transition-all duration-300',
          sidebarOpen ? 'ml-64' : 'ml-20'
        )}
      >
        <Header
          title="Close Pack"
          subtitle="Generate audit-ready close documentation"
        />

        <main className="flex-1 overflow-auto p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="max-w-4xl mx-auto"
          >
            {/* Tab navigation */}
            <div className="flex gap-1 p-1 mb-6 bg-[hsl(var(--secondary))] rounded-lg w-fit">
              <button
                onClick={() => setActiveTab('invoice')}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition-all',
                  activeTab === 'invoice'
                    ? 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                )}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Invoice Close
              </button>
              <button
                onClick={() => setActiveTab('urs')}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition-all',
                  activeTab === 'urs'
                    ? 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                )}
              >
                <Clock className="w-4 h-4" />
                Usage Reconciliation
              </button>
            </div>

            {/* Tab content */}
            <div className="card p-6">
              <AnimatePresence mode="wait">
                {activeTab === 'invoice' ? (
                  <motion.div
                    key="invoice"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <InvoiceCloseTab />
                  </motion.div>
                ) : (
                  <motion.div
                    key="urs"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <UsageReconciliationTab />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
