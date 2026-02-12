'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  FileText,
  Check,
  X,
  Loader2,
  AlertTriangle,
  ChevronRight,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { Confetti } from '@/components/ui/Confetti';
import { useConfetti } from '@/hooks/useConfetti';
import { useFinaultStore } from '@/lib/store';
import { api } from '@/lib/api';
import {
  cn,
  formatCurrency,
  formatFileSize,
  getProviderDisplayName,
  getModelDisplayName,
} from '@/lib/utils';
import type { ParseResult } from '@/types';

type UploadStep = 'upload' | 'parsing' | 'review' | 'allocating' | 'complete';

export default function UploadPage() {
  const router = useRouter();
  const { sidebarOpen, setCurrentInvoice, setIsProcessing } = useFinaultStore();
  const confetti = useConfetti();
  // Stable ref — prevents useEffect re-triggers from confetti object changing each render
  const fireConfetti = confetti.fire;

  const [step, setStep] = useState<UploadStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setError(null);
    setStep('parsing');
    setIsProcessing(true);

    try {
      const result = await api.parseInvoice(uploadedFile);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to parse invoice');
      }

      setParseResult(result);
      setCurrentInvoice(result);
      setStep('review');
      toast.success('Invoice parsed successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse invoice';
      setError(message);
      setStep('upload');
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  }, [setCurrentInvoice, setIsProcessing]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv', '.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const handleAllocate = async () => {
    if (!parseResult) return;

    setStep('allocating');
    setIsProcessing(true);

    try {
      const result = await api.allocateCosts(parseResult.lineItems);

      // Update parse result with allocated items
      setParseResult({
        ...parseResult,
        lineItems: result.allocatedItems,
      });

      setStep('complete');
      toast.success(`Allocated ${result.summary.allocationRate} of costs`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to allocate costs';
      toast.error(message);
      setStep('review');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (step === 'complete') {
      // Small delay so the user sees the transition first
      const timer = setTimeout(() => fireConfetti('medium'), 300);
      return () => clearTimeout(timer);
    }
  }, [step, fireConfetti]);

  const handleGenerateClosePack = () => {
    router.push('/close-pack');
  };

  const reset = () => {
    setFile(null);
    setParseResult(null);
    setError(null);
    setStep('upload');
    setCurrentInvoice(null);
  };

  return (
    <div className="flex h-screen bg-[hsl(var(--background))]">
      <Confetti active={confetti.active} intensity={confetti.intensity} onComplete={confetti.reset} />
      <Sidebar />

      <div className={cn(
        'flex-1 flex flex-col overflow-hidden transition-all duration-300',
        sidebarOpen ? 'ml-64' : 'ml-20'
      )}>
        <Header 
          title="Upload Invoice" 
          subtitle="Parse and allocate AI provider invoices"
        />
        
        <main className="flex-1 overflow-auto p-6">
          {/* Progress Steps */}
          <div className="max-w-3xl mx-auto mb-8">
            <div className="flex items-center justify-between">
              {['Upload', 'Parse', 'Review', 'Allocate', 'Complete'].map((label, index) => {
                const stepIndex = ['upload', 'parsing', 'review', 'allocating', 'complete'].indexOf(step);
                const isActive = index <= stepIndex;
                const isCurrent = index === stepIndex;

                return (
                  <div key={label} className="flex items-center">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                        'transition-colors',
                        isActive
                          ? 'bg-[hsl(var(--primary))] text-white'
                          : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]',
                        isCurrent && 'ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-[hsl(var(--background))]'
                      )}
                      style={step === 'complete' ? { transitionDelay: `${index * 100}ms` } : undefined}
                    >
                      {index < stepIndex ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span className={cn(
                      'ml-2 text-sm',
                      isActive ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'
                    )}>
                      {label}
                    </span>
                    {index < 4 && (
                      <ChevronRight className="w-4 h-4 mx-4 text-[hsl(var(--muted-foreground))]" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="max-w-3xl mx-auto">
            <AnimatePresence mode="wait">
              {/* Upload Step */}
              {step === 'upload' && (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <div
                    {...getRootProps()}
                    className={cn(
                      'card p-12 border-2 border-dashed cursor-pointer',
                      'transition-all duration-200',
                      isDragActive
                        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5'
                        : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50'
                    )}
                  >
                    <input {...getInputProps()} />
                    
                    <div className="text-center">
                      <div className={cn(
                        'w-16 h-16 rounded-full mx-auto mb-4',
                        'flex items-center justify-center',
                        'bg-[hsl(var(--secondary))]',
                        isDragActive && 'bg-[hsl(var(--primary))]/10'
                      )}>
                        <Upload className={cn(
                          'w-8 h-8',
                          isDragActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'
                        )} />
                      </div>
                      
                      <h3 className="text-lg font-semibold mb-2">
                        {isDragActive ? 'Drop your invoice here' : 'Upload AI Provider Invoice'}
                      </h3>
                      
                      <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
                        Drag and drop your CSV file, or click to browse
                      </p>
                      
                      <div className="flex items-center justify-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                        <span>Supported:</span>
                        <span className="badge-neutral">CSV</span>
                        <span className="badge-neutral">Excel</span>
                        <span className="text-[hsl(var(--muted-foreground))]">Up to 10MB</span>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="mt-4 p-4 rounded-lg bg-critical-500/10 border border-critical-500/20">
                      <div className="flex items-center gap-2 text-critical-500">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm font-medium">{error}</span>
                      </div>
                    </div>
                  )}

                  <div className="mt-8 grid grid-cols-3 gap-4">
                    {['OpenAI', 'Anthropic', 'Azure OpenAI', 'Vertex AI', 'AWS Bedrock', 'Cohere'].map((provider) => (
                      <div
                        key={provider}
                        className="p-3 rounded-lg bg-[hsl(var(--secondary))] text-center"
                      >
                        <span className="text-sm text-[hsl(var(--muted-foreground))]">
                          {provider}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Parsing Step */}
              {step === 'parsing' && (
                <motion.div
                  key="parsing"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="card p-12 text-center"
                >
                  <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-[hsl(var(--secondary))]">
                    <Loader2 className="w-8 h-8 text-[hsl(var(--primary))] animate-spin" />
                  </div>
                  
                  <h3 className="text-lg font-semibold mb-2">
                    Parsing Invoice
                  </h3>
                  
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    Detecting provider and extracting line items...
                  </p>
                  
                  {file && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                      <FileText className="w-4 h-4" />
                      <span>{file.name}</span>
                      <span>({formatFileSize(file.size)})</span>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Review Step */}
              {(step === 'review' || step === 'allocating') && parseResult && (
                <motion.div
                  key="review"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <div className="card overflow-hidden">
                    <div className="p-6 border-b border-[hsl(var(--border))]">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold">
                            Invoice Parsed Successfully
                          </h3>
                          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                            Provider: {getProviderDisplayName(parseResult.provider)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-semibold text-[hsl(var(--primary))]">
                            {formatCurrency(parseResult.totalAmount)}
                          </p>
                          <p className="text-sm text-[hsl(var(--muted-foreground))]">
                            {parseResult.lineItems.length} line items
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Model Breakdown */}
                    <div className="p-6 border-b border-[hsl(var(--border))]">
                      <h4 className="text-sm font-medium mb-4">Cost by Model</h4>
                      <div className="space-y-3">
                        {Object.entries(parseResult.modelBreakdown)
                          .sort((a, b) => b[1].cost - a[1].cost)
                          .slice(0, 5)
                          .map(([model, data]) => (
                            <div key={model} className="flex items-center justify-between">
                              <span className="text-sm">{getModelDisplayName(model)}</span>
                              <span className="text-sm font-medium tabular-nums">
                                {formatCurrency(data.cost)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="p-6 bg-[hsl(var(--secondary))]">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={reset}
                          className="btn-ghost"
                        >
                          <X className="w-4 h-4" />
                          Start Over
                        </button>
                        
                        <button
                          onClick={handleAllocate}
                          disabled={step === 'allocating'}
                          className="btn-primary"
                        >
                          {step === 'allocating' ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Allocating...
                            </>
                          ) : (
                            <>
                              Allocate Costs
                              <ChevronRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Complete Step */}
              {step === 'complete' && parseResult && (
                <motion.div
                  key="complete"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="card p-8 text-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.2 }}
                    className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-accent-500/10"
                  >
                    <Check className="w-8 h-8 text-accent-500" />
                  </motion.div>

                  <h3 className="text-lg font-semibold mb-2">
                    Invoice Processed
                  </h3>

                  <p className="text-sm text-[hsl(var(--muted-foreground))] mb-2">
                    {parseResult.lineItems.length} line items allocated across{' '}
                    {new Set(parseResult.lineItems.map(i => i.costCenter).filter(Boolean)).size} cost centers
                  </p>

                  <p className="text-xs text-accent-500/80 mb-6">
                    Your costs are now tracked and allocated. No more billing surprises.
                  </p>

                  <div className="mb-8 py-6 border-y border-[hsl(var(--border))]">
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">Total Amount</p>
                    <AnimatedCounter
                      value={parseResult.totalAmount}
                      prefix="$"
                      duration={1500}
                      reveal
                      decimals={2}
                      className="text-2xl font-semibold text-[hsl(var(--primary))]"
                    />
                  </div>

                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={reset}
                      className="btn-secondary"
                    >
                      Upload Another
                    </button>

                    <button
                      onClick={handleGenerateClosePack}
                      className="btn-primary"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Generate Close Pack
                    </button>
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
