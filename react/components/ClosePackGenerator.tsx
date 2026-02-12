'use client';

import React, { useCallback, useState } from 'react';
import { useFinault } from '../contexts/FinaultContext';
import { ClosePack, ClosePackDocument, finaultAPI } from '../api/finault-api';

type PeriodType = 'monthly' | 'quarterly' | 'yearly' | 'custom';

interface CertificationForm {
  certifiedBy: string;
  statement: string;
}

export function ClosePackGenerator() {
  const { userId, closePack } = useFinault();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('monthly');
  const [customPeriod, setCustomPeriod] = useState('');
  const [generating, setGenerating] = useState(false);
  const [selectedClosePack, setSelectedClosePack] = useState<ClosePack | null>(null);
  const [certifyingId, setCertifyingId] = useState<string | null>(null);

  // Load close packs on mount
  React.useEffect(() => {
    if (userId) {
      closePack.getClosePacks(userId).catch((err) => {
        console.error('Failed to load close packs:', err);
      });
    }
  }, [userId, closePack]);

  const handleGenerateClosePack = useCallback(async () => {
    if (!userId) return;

    setGenerating(true);
    try {
      const period =
        selectedPeriod === 'custom'
          ? customPeriod
          : `${new Date().getFullYear()}_${selectedPeriod}`;

      const pack = await closePack.generateClosePack(userId, period);
      setSelectedClosePack(pack);
      setGenerating(false);
    } catch (error) {
      console.error('Failed to generate close pack:', error);
      setGenerating(false);
    }
  }, [userId, selectedPeriod, customPeriod, closePack]);

  const handleDownload = useCallback(
    async (closePackId: string) => {
      try {
        const result = await closePack.downloadClosePack(closePackId);
        if (result?.downloadUrl) {
          window.open(result.downloadUrl, '_blank');
        }
      } catch (error) {
        console.error('Failed to download close pack:', error);
      }
    },
    [closePack]
  );

  return (
    <div className="space-y-6">
      {/* Generate Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Generate Close Pack</h2>
        </div>
        <div className="p-6 space-y-4">
          {/* Period Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Period
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'yearly', label: 'Yearly' },
                { value: 'custom', label: 'Custom' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() =>
                    setSelectedPeriod(option.value as PeriodType)
                  }
                  className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                    selectedPeriod === option.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Period */}
          {selectedPeriod === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Period Name (e.g., "Q1_2024")
              </label>
              <input
                type="text"
                value={customPeriod}
                onChange={(e) => setCustomPeriod(e.target.value)}
                placeholder="Q1_2024"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerateClosePack}
            disabled={
              generating || (selectedPeriod === 'custom' && !customPeriod)
            }
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? 'Generating...' : 'Generate Close Pack'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {closePack.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-medium text-red-800">Error</p>
          <p className="text-sm text-red-700 mt-1">{closePack.error}</p>
          <button
            onClick={closePack.clearError}
            className="mt-2 text-xs text-red-600 hover:text-red-700 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Generated Close Pack Details */}
      {selectedClosePack && (
        <ClosePackDetails
          closePack={selectedClosePack}
          onDownload={handleDownload}
          onCertify={(data) => {
            setCertifyingId(selectedClosePack.id);
          }}
        />
      )}

      {/* Close Pack List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Previous Close Packs</h2>
        </div>
        <div className="p-6">
          {closePack.closePacks.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No close packs generated yet</p>
          ) : (
            <div className="space-y-3">
              {closePack.closePacks.map((pack) => (
                <ClosePackListItem
                  key={pack.id}
                  pack={pack}
                  onDownload={handleDownload}
                  onSelect={() => setSelectedClosePack(pack)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Certification Form */}
      {certifyingId && selectedClosePack && (
        <CertificationModal
          closePackId={certifyingId}
          onClose={() => setCertifyingId(null)}
          onSubmit={async (data) => {
            try {
              await closePack.certifyClosePack(
                certifyingId,
                data.certifiedBy,
                data.statement
              );
              setCertifyingId(null);
              setSelectedClosePack(null);
            } catch (error) {
              console.error('Failed to certify close pack:', error);
            }
          }}
        />
      )}
    </div>
  );
}

function ClosePackDetails({
  closePack: pack,
  onDownload,
  onCertify,
}: {
  closePack: ClosePack;
  onDownload: (id: string) => void;
  onCertify: (data: CertificationForm) => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="bg-blue-50 border-b border-blue-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Close Pack</h3>
            <p className="text-sm text-gray-600 mt-1">Period: {pack.period}</p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              pack.status === 'finalized'
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}
          >
            {pack.status}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Documents */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Documents</h4>
          {pack.documents.length === 0 ? (
            <p className="text-sm text-gray-500">No documents available</p>
          ) : (
            <div className="space-y-2">
              {pack.documents.map((doc) => (
                <DocumentListItem
                  key={doc.id}
                  document={doc}
                  onDownload={() => {
                    if (doc.url) {
                      window.open(doc.url, '_blank');
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Attestation */}
        <div className="border-t pt-6">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Attestation</h4>
          {pack.attestation ? (
            <AttestationDisplay attestation={pack.attestation} />
          ) : (
            <button
              onClick={() => onCertify({ certifiedBy: '', statement: '' })}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Add Certification
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t">
          <button
            onClick={() => onDownload(pack.id)}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Download Close Pack
          </button>
          {pack.status === 'draft' && (
            <button
              onClick={() => onCertify({ certifiedBy: '', statement: '' })}
              className="flex-1 bg-gray-200 text-gray-900 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
            >
              Certify
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ClosePackListItem({
  pack,
  onDownload,
  onSelect,
}: {
  pack: ClosePack;
  onDownload: (id: string) => void;
  onSelect: () => void;
}) {
  return (
    <div className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900">{pack.period}</h4>
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                pack.status === 'finalized'
                  ? 'bg-green-100 text-green-800'
                  : pack.status === 'draft'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
              }`}
            >
              {pack.status}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Generated {finaultAPI.formatDate(pack.generatedAt)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {pack.documents.length} documents
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSelect}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            View
          </button>
          <button
            onClick={() => onDownload(pack.id)}
            className="text-sm text-gray-600 hover:text-gray-700 font-medium"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentListItem({
  document,
  onDownload,
}: {
  document: ClosePackDocument;
  onDownload: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{document.name}</p>
        <p className="text-xs text-gray-500 mt-1">
          {document.type} • Generated {finaultAPI.formatDate(document.generatedAt)}
        </p>
      </div>
      <button
        onClick={onDownload}
        className="ml-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
      >
        Download
      </button>
    </div>
  );
}

function AttestationDisplay({
  attestation,
}: {
  attestation: { certifiedBy: string; certifiedAt: string; statement: string };
}) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-600">Certified By</p>
          <p className="text-sm font-medium text-gray-900 mt-1">{attestation.certifiedBy}</p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Certified At</p>
          <p className="text-sm font-medium text-gray-900 mt-1">
            {finaultAPI.formatDate(attestation.certifiedAt)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Statement</p>
          <p className="text-sm text-gray-900 mt-1 italic">"{attestation.statement}"</p>
        </div>
      </div>
    </div>
  );
}

function CertificationModal({
  closePackId,
  onClose,
  onSubmit,
}: {
  closePackId: string;
  onClose: () => void;
  onSubmit: (data: CertificationForm) => Promise<void>;
}) {
  const [form, setForm] = useState<CertificationForm>({
    certifiedBy: '',
    statement: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Certify Close Pack</h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Certified By
            </label>
            <input
              type="text"
              value={form.certifiedBy}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, certifiedBy: e.target.value }))
              }
              placeholder="Your name or title"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Certification Statement
            </label>
            <textarea
              value={form.statement}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, statement: e.target.value }))
              }
              placeholder="Enter your certification statement..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-900 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !form.certifiedBy || !form.statement}
              className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {submitting ? 'Certifying...' : 'Certify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
