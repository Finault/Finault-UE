'use client';

import React, { useCallback, useState } from 'react';
import { useFinault } from '../contexts/FinaultContext';
import { InvoiceParseResult, finaultAPI } from '../api/finault-api';

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'uploading' | 'parsing' | 'complete' | 'error';
  error?: string;
}

export function InvoiceUploader() {
  const { userId, invoiceParser } = useFinault();
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!userId) {
        alert('User not authenticated');
        return;
      }

      // Validate file
      if (!file.type.includes('application/pdf') && !file.type.includes('image')) {
        alert('Please upload a PDF or image file');
        return;
      }

      setSelectedFile(file);
      const uploadId = `${Date.now()}_${file.name}`;

      // Add to uploads list
      setUploads((prev) => [
        ...prev,
        {
          fileName: file.name,
          progress: 0,
          status: 'uploading',
        },
      ]);

      try {
        // Upload file
        await invoiceParser.uploadInvoice(file, userId);

        // Update progress
        setUploads((prev) =>
          prev.map((u) =>
            u.fileName === file.name ? { ...u, progress: 50, status: 'parsing' } : u
          )
        );

        // Parse invoice
        await invoiceParser.parseInvoice(file, userId);

        // Complete
        setUploads((prev) =>
          prev.map((u) =>
            u.fileName === file.name ? { ...u, progress: 100, status: 'complete' } : u
          )
        );

        // Auto-remove successful upload after 3 seconds
        setTimeout(() => {
          setUploads((prev) => prev.filter((u) => u.fileName !== file.name));
        }, 3000);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        setUploads((prev) =>
          prev.map((u) =>
            u.fileName === file.name
              ? { ...u, progress: 0, status: 'error', error: errorMsg }
              : u
          )
        );
      }
    },
    [userId, invoiceParser]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-12 transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
        }`}
      >
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="mt-2 text-sm font-medium text-gray-900">
            Drop your invoice here, or
            <label className="ml-1 text-blue-600 hover:text-blue-700 cursor-pointer">
              click to browse
              <input
                type="file"
                onChange={handleFileInput}
                accept=".pdf,image/*"
                className="hidden"
              />
            </label>
          </p>
          <p className="mt-1 text-xs text-gray-500">PDF or image up to 10MB</p>
        </div>
      </div>

      {/* Upload Progress */}
      {uploads.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-900">Upload Progress</h3>
          {uploads.map((upload) => (
            <UploadProgressItem key={upload.fileName} upload={upload} />
          ))}
        </div>
      )}

      {/* Parse Results */}
      {invoiceParser.parseResult && selectedFile && (
        <ParseResultsDisplay result={invoiceParser.parseResult} fileName={selectedFile.name} />
      )}

      {/* Error Message */}
      {invoiceParser.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-medium text-red-800">Error</p>
          <p className="text-sm text-red-700 mt-1">{invoiceParser.error}</p>
          <button
            onClick={invoiceParser.clearError}
            className="mt-2 text-xs text-red-600 hover:text-red-700 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function UploadProgressItem({ upload }: { upload: UploadProgress }) {
  const getStatusIcon = () => {
    switch (upload.status) {
      case 'complete':
        return '✓';
      case 'error':
        return '✕';
      default:
        return '⏳';
    }
  };

  const getStatusColor = () => {
    switch (upload.status) {
      case 'complete':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-blue-500';
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${getStatusColor()}`}>
            {getStatusIcon()}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">{upload.fileName}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {upload.status === 'uploading' && 'Uploading...'}
              {upload.status === 'parsing' && 'Parsing invoice...'}
              {upload.status === 'complete' && 'Processing complete'}
              {upload.status === 'error' && `Error: ${upload.error}`}
            </p>
          </div>
        </div>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${getStatusColor()}`}
          style={{ width: `${upload.progress}%` }}
        ></div>
      </div>
    </div>
  );
}

function ParseResultsDisplay({
  result,
  fileName,
}: {
  result: InvoiceParseResult;
  fileName: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-green-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 bg-green-50 border-b border-green-200 flex items-center justify-between hover:bg-green-100 transition-colors"
      >
        <div className="text-left">
          <p className="text-sm font-medium text-gray-900">Parse Results</p>
          <p className="text-xs text-gray-600 mt-1">{fileName}</p>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      </button>

      {expanded && (
        <div className="p-6 space-y-4">
          {/* Key Details */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <DetailField
              label="Invoice Number"
              value={result.invoiceNumber}
            />
            <DetailField
              label="Invoice Date"
              value={finaultAPI.formatDate(result.invoiceDate)}
            />
            <DetailField
              label="Due Date"
              value={finaultAPI.formatDate(result.dueDate)}
            />
            <DetailField
              label="Vendor"
              value={result.vendorName}
            />
            <DetailField
              label="Currency"
              value={result.currency}
            />
            <DetailField
              label="Confidence"
              value={`${Math.round(result.confidence * 100)}%`}
              highlight={result.confidence > 0.9}
            />
          </div>

          {/* Amount Summary */}
          <div className="border-t pt-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium text-gray-900">
                  {finaultAPI.formatCurrency(result.totalAmount - result.taxAmount)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tax</span>
                <span className="font-medium text-gray-900">
                  {finaultAPI.formatCurrency(result.taxAmount)}
                </span>
              </div>
              <div className="flex justify-between text-lg border-t pt-2">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="font-bold text-green-600">
                  {finaultAPI.formatCurrency(result.totalAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Line Items */}
          {result.lineItems.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Line Items</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600">
                        Description
                      </th>
                      <th className="px-2 py-2 text-center text-xs font-semibold text-gray-600">
                        Qty
                      </th>
                      <th className="px-2 py-2 text-right text-xs font-semibold text-gray-600">
                        Unit Price
                      </th>
                      <th className="px-2 py-2 text-right text-xs font-semibold text-gray-600">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lineItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="px-2 py-2 text-gray-900">{item.description}</td>
                        <td className="px-2 py-2 text-center text-gray-600">{item.quantity}</td>
                        <td className="px-2 py-2 text-right text-gray-600">
                          {finaultAPI.formatCurrency(item.unitPrice)}
                        </td>
                        <td className="px-2 py-2 text-right font-medium text-gray-900">
                          {finaultAPI.formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailField({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`p-3 rounded ${highlight ? 'bg-green-50' : 'bg-gray-50'}`}>
      <p className="text-xs text-gray-600">{label}</p>
      <p className={`text-sm font-medium mt-1 ${highlight ? 'text-green-700' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}
