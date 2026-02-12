'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Share2,
  Twitter,
  Linkedin,
  Mail,
  Link2,
  Check,
  Download,
  Sparkles,
  DollarSign,
  Shield,
  Copy,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import { toPng } from 'html-to-image';

// ============================================================================
// ULTIMATE DIAMOND: SUCCESS SHARING CARD
// "Finault recovered $X" with viral social share buttons
// This turns every customer win into marketing
// ============================================================================

interface SuccessShareCardProps {
  amount: number;
  provider?: string;
  verificationId?: string;
  period?: string;
  companyName?: string;
  onClose?: () => void;
}

// Format currency
function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format large currency for display
function formatLargeCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Social share URLs
function getShareUrls(amount: number, provider?: string, verificationId?: string) {
  const recoveryText = `Just recovered ${formatCurrency(amount)} in AI overcharges using @FinaultAI! 🎉`;
  const hashtags = 'AIcosts,FinOps,CostOptimization';
  const url = verificationId
    ? `https://finault.ai/verify/${verificationId}`
    : 'https://finault.ai';

  return {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      `${recoveryText}\n\nCryptographically verified proof of savings. Check it out:`
    )}&url=${encodeURIComponent(url)}&hashtags=${hashtags}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
      url
    )}&title=${encodeURIComponent('Recovered AI Overcharges')}&summary=${encodeURIComponent(
      recoveryText
    )}`,
    email: `mailto:?subject=${encodeURIComponent(
      `I just recovered ${formatCurrency(amount)} in AI costs!`
    )}&body=${encodeURIComponent(
      `Hey!\n\nJust wanted to share that I recovered ${formatLargeCurrency(amount)} in AI overcharges using Finault.\n\n${
        verificationId
          ? `The recovery is cryptographically verified and anchored to the blockchain. You can verify it here: ${url}`
          : ''
      }\n\nIf you're spending money on AI APIs, you should definitely check them out: https://finault.ai`
    )}`,
  };
}

export function SuccessShareCard({
  amount,
  provider,
  verificationId,
  period,
  companyName,
  onClose,
}: SuccessShareCardProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const shareUrls = getShareUrls(amount, provider, verificationId);
  const verificationUrl = verificationId
    ? `https://finault.ai/verify/${verificationId}`
    : null;

  // Copy verification link
  const copyLink = async () => {
    if (verificationUrl) {
      await navigator.clipboard.writeText(verificationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Download card as image
  const downloadCard = async () => {
    if (!cardRef.current) return;

    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });

      const link = document.createElement('a');
      link.download = `finault-recovery-${verificationId || Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Failed to download card:', error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 50 }}
        animate={{ y: 0 }}
        className="relative max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Main Card (for download) */}
        <div
          ref={cardRef}
          className="bg-white rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* Header with gradient */}
          <div className="relative bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600 px-8 py-10 text-white overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-1/2 -left-1/4 w-3/4 h-full bg-black/10 rounded-full blur-3xl" />
              {/* Sparkle effects */}
              <Sparkles className="absolute top-4 right-4 w-8 h-8 text-yellow-300 animate-pulse" />
              <Sparkles className="absolute bottom-8 right-12 w-5 h-5 text-yellow-200 animate-pulse delay-100" />
            </div>

            <div className="relative">
              {/* Trophy */}
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm">
                  <Trophy className="w-8 h-8 text-yellow-300" />
                </div>
                <div>
                  <p className="text-green-100 text-sm font-medium">Revenue Recovered</p>
                  <p className="text-white text-sm">
                    {provider && <span className="capitalize">{provider}</span>}
                    {period && <span className="text-green-200"> • {period}</span>}
                  </p>
                </div>
              </div>

              {/* Amount */}
              <div className="text-5xl font-bold tracking-tight mb-2">
                {formatLargeCurrency(amount)}
              </div>

              {/* Company name if provided */}
              {companyName && (
                <p className="text-green-100 text-sm">
                  Recovered by {companyName}
                </p>
              )}
            </div>
          </div>

          {/* Verification badge */}
          {verificationId && (
            <div className="px-8 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-t border-blue-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Cryptographically Verified & Blockchain Anchored
                  </p>
                  <p className="text-xs text-gray-500 font-mono">
                    {verificationId}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-8 py-4 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">Finault</p>
                <p className="text-xs text-gray-500">AI Cost Governance</p>
              </div>
            </div>
            <p className="text-xs text-gray-400">finault.ai</p>
          </div>
        </div>

        {/* Share buttons (not in downloaded image) */}
        <div className="mt-4 bg-white rounded-xl shadow-lg p-4">
          <p className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            Share your success
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* Twitter */}
            <a
              href={shareUrls.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-3 bg-[#1DA1F2] text-white rounded-lg font-medium hover:bg-[#1a8cd8] transition-colors"
            >
              <Twitter className="w-5 h-5" />
              Twitter
            </a>

            {/* LinkedIn */}
            <a
              href={shareUrls.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-3 bg-[#0A66C2] text-white rounded-lg font-medium hover:bg-[#094d92] transition-colors"
            >
              <Linkedin className="w-5 h-5" />
              LinkedIn
            </a>

            {/* Email */}
            <a
              href={shareUrls.email}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
            >
              <Mail className="w-5 h-5" />
              Email
            </a>

            {/* Copy Link */}
            <button
              onClick={copyLink}
              disabled={!verificationUrl}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5 text-green-600" />
                  <span className="text-green-600">Copied!</span>
                </>
              ) : (
                <>
                  <Link2 className="w-5 h-5" />
                  Copy Link
                </>
              )}
            </button>
          </div>

          {/* Download button */}
          <button
            onClick={downloadCard}
            disabled={downloading}
            className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50"
          >
            {downloading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Download className="w-5 h-5" />
                </motion.div>
                Generating...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Download Card Image
              </>
            )}
          </button>
        </div>

        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute -top-12 right-0 text-white/80 hover:text-white transition-colors"
          >
            <span className="text-sm">Press ESC or click outside to close</span>
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

// ============================================================================
// MINI SUCCESS BADGE (for inline display)
// ============================================================================

interface SuccessBadgeProps {
  amount: number;
  onClick?: () => void;
}

export function SuccessBadge({ amount, onClick }: SuccessBadgeProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-full font-medium shadow-lg hover:shadow-xl transition-shadow"
    >
      <Trophy className="w-4 h-4 text-yellow-300" />
      <span>Recovered {formatCurrency(amount)}</span>
      <Share2 className="w-4 h-4 ml-1" />
    </motion.button>
  );
}

// ============================================================================
// LEADERBOARD ENTRY (for showing on public pages)
// ============================================================================

interface LeaderboardEntryProps {
  rank: number;
  companyName?: string;
  amount: number;
  verificationId?: string;
  date?: string;
}

export function LeaderboardEntry({
  rank,
  companyName,
  amount,
  verificationId,
  date,
}: LeaderboardEntryProps) {
  const isTop3 = rank <= 3;
  const medalColors = ['text-yellow-500', 'text-gray-400', 'text-amber-600'];

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.1 }}
      className={`flex items-center gap-4 p-4 rounded-xl ${
        isTop3 ? 'bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200' : 'bg-white border border-gray-200'
      }`}
    >
      {/* Rank */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
        isTop3 ? 'bg-gradient-to-br from-yellow-400 to-orange-500' : 'bg-gray-100'
      }`}>
        {isTop3 ? (
          <Trophy className={`w-5 h-5 ${medalColors[rank - 1] || 'text-white'}`} />
        ) : (
          <span className="text-gray-600 font-bold">{rank}</span>
        )}
      </div>

      {/* Company */}
      <div className="flex-1">
        <p className="font-medium text-gray-900">
          {companyName || 'Anonymous Company'}
        </p>
        {date && <p className="text-sm text-gray-500">{date}</p>}
      </div>

      {/* Amount */}
      <div className="text-right">
        <p className="text-xl font-bold text-green-600">{formatCurrency(amount)}</p>
        {verificationId && (
          <a
            href={`/verify/${verificationId}`}
            className="text-xs text-blue-500 hover:underline flex items-center gap-1 justify-end"
          >
            Verified <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </motion.div>
  );
}
