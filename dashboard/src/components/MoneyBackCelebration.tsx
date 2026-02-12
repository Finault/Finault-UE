'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Sparkles,
  DollarSign,
  PartyPopper,
  Share2,
  Download,
  X,
  Star,
  Zap,
  TrendingUp,
} from 'lucide-react';

// ============================================================================
// SPACE APPLE: Money Back Celebration
// Jobs: "This is the moment they remember forever"
// Musk: "This turns customers into evangelists"
// ============================================================================

interface MoneyBackCelebrationProps {
  amount: number;
  provider: string;
  disputeId: string;
  verificationId?: string;
  onClose: () => void;
  onShare?: () => void;
}

// Confetti particle component
function ConfettiParticle({ delay, color }: { delay: number; color: string }) {
  const randomX = Math.random() * 100;
  const randomRotate = Math.random() * 360;
  const randomDuration = 2 + Math.random() * 2;

  return (
    <motion.div
      className="absolute w-3 h-3 rounded-sm"
      style={{
        left: `${randomX}%`,
        backgroundColor: color,
        top: '-20px',
      }}
      initial={{ y: -20, rotate: 0, opacity: 1 }}
      animate={{
        y: '100vh',
        rotate: randomRotate + 720,
        opacity: [1, 1, 0],
      }}
      transition={{
        duration: randomDuration,
        delay: delay,
        ease: 'linear',
      }}
    />
  );
}

// Money falling animation
function FallingMoney({ delay }: { delay: number }) {
  const randomX = Math.random() * 100;
  const randomDuration = 3 + Math.random() * 2;

  return (
    <motion.div
      className="absolute text-2xl"
      style={{ left: `${randomX}%`, top: '-40px' }}
      initial={{ y: -40, rotate: 0, opacity: 1 }}
      animate={{
        y: '100vh',
        rotate: [0, 15, -15, 0],
        opacity: [1, 1, 0.5, 0],
      }}
      transition={{
        duration: randomDuration,
        delay: delay,
        ease: 'linear',
      }}
    >
      💵
    </motion.div>
  );
}

// Format currency with animation
function AnimatedCurrency({ amount }: { amount: number }) {
  const [displayAmount, setDisplayAmount] = useState(0);

  useEffect(() => {
    const duration = 2000; // 2 seconds
    const steps = 60;
    const increment = amount / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= amount) {
        setDisplayAmount(amount);
        clearInterval(timer);
      } else {
        setDisplayAmount(current);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [amount]);

  return (
    <span className="tabular-nums">
      ${displayAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

export function MoneyBackCelebration({
  amount,
  provider,
  disputeId,
  verificationId,
  onClose,
  onShare,
}: MoneyBackCelebrationProps) {
  const [showConfetti, setShowConfetti] = useState(true);

  // Generate confetti colors
  const confettiColors = [
    '#22c55e', // green
    '#10b981', // emerald
    '#14b8a6', // teal
    '#f59e0b', // amber
    '#eab308', // yellow
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#ec4899', // pink
  ];

  // Stop confetti after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center"
        onClick={onClose}
      >
        {/* Backdrop with blur */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

        {/* Confetti layer */}
        {showConfetti && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Confetti particles */}
            {Array.from({ length: 100 }).map((_, i) => (
              <ConfettiParticle
                key={`confetti-${i}`}
                delay={Math.random() * 2}
                color={confettiColors[i % confettiColors.length]}
              />
            ))}
            {/* Falling money */}
            {Array.from({ length: 20 }).map((_, i) => (
              <FallingMoney key={`money-${i}`} delay={Math.random() * 3} />
            ))}
          </div>
        )}

        {/* Main celebration card */}
        <motion.div
          initial={{ scale: 0.5, y: 100 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.5, y: 100 }}
          transition={{ type: 'spring', damping: 15 }}
          className="relative z-10 max-w-lg w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Trophy burst animation */}
          <motion.div
            className="absolute -top-20 left-1/2 transform -translate-x-1/2"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.3, type: 'spring' }}
          >
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-2xl">
                <Trophy className="w-12 h-12 text-white" />
              </div>
              {/* Sparkle effects */}
              <motion.div
                className="absolute -top-2 -right-2"
                animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Sparkles className="w-8 h-8 text-yellow-300" />
              </motion.div>
              <motion.div
                className="absolute -bottom-1 -left-3"
                animate={{ rotate: -360, scale: [1, 1.3, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
              >
                <Star className="w-6 h-6 text-yellow-400" />
              </motion.div>
            </div>
          </motion.div>

          {/* Card content */}
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden pt-12">
            {/* Header */}
            <div className="text-center px-8 pt-8 pb-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <p className="text-green-600 font-semibold text-lg mb-2 flex items-center justify-center gap-2">
                  <PartyPopper className="w-5 h-5" />
                  Money Recovered!
                  <PartyPopper className="w-5 h-5 transform scale-x-[-1]" />
                </p>
                <div className="text-6xl font-bold text-gray-900 mb-3">
                  <AnimatedCurrency amount={amount} />
                </div>
                <p className="text-gray-500">
                  Successfully recovered from <span className="font-semibold capitalize">{provider}</span>
                </p>
              </motion.div>
            </div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="px-8 py-6 bg-gradient-to-r from-green-50 to-emerald-50"
            >
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                    <Zap className="w-4 h-4" />
                    <span className="text-sm font-medium">Status</span>
                  </div>
                  <p className="font-bold text-gray-900">Resolved</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm font-medium">Recovery</span>
                  </div>
                  <p className="font-bold text-gray-900">100%</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-sm font-medium">ROI</span>
                  </div>
                  <p className="font-bold text-gray-900">{Math.round(amount / 29)}x</p>
                </div>
              </div>
            </motion.div>

            {/* Verification badge */}
            {verificationId && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
                className="px-8 py-4 border-t border-gray-100"
              >
                <div className="flex items-center justify-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Blockchain Verified</p>
                    <p className="text-gray-500 font-mono text-xs">{verificationId}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="p-6 bg-gray-50 border-t border-gray-100"
            >
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={onShare}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25"
                >
                  <Share2 className="w-5 h-5" />
                  Share Win
                </button>
                <button
                  onClick={onClose}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-white text-gray-700 rounded-xl font-medium hover:bg-gray-100 transition-all border border-gray-200"
                >
                  <Download className="w-5 h-5" />
                  Download
                </button>
              </div>
            </motion.div>

            {/* Fun footer message */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-center"
            >
              <p className="text-white text-sm font-medium">
                🎉 You just saved more than most companies spend on coffee this month!
              </p>
            </motion.div>
          </div>

          {/* Close button */}
          <motion.button
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================================================
// Quick celebration toast for smaller wins
// ============================================================================

interface QuickCelebrationProps {
  amount: number;
  message?: string;
}

export function QuickCelebration({ amount, message }: QuickCelebrationProps) {
  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl"
    >
      <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
        <Trophy className="w-6 h-6" />
      </div>
      <div>
        <p className="font-bold text-lg">
          +${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </p>
        <p className="text-green-100 text-sm">
          {message || 'Recovered!'}
        </p>
      </div>
      <Sparkles className="w-6 h-6 text-yellow-300 animate-pulse" />
    </motion.div>
  );
}
