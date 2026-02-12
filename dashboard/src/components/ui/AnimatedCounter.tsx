'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedCounterProps {
  /** Target value to count to */
  value: number;
  /** Duration of the animation in ms */
  duration?: number;
  /** Optional prefix (e.g., "$") */
  prefix?: string;
  /** Optional suffix (e.g., "/mo", "%") */
  suffix?: string;
  /** Custom formatter function — receives the current number, returns display string */
  formatter?: (value: number) => string;
  /** Enable blur → sharp reveal effect */
  reveal?: boolean;
  /** Callback when animation completes */
  onComplete?: () => void;
  /** Delay before animation starts (ms) */
  delay?: number;
  /** Additional className */
  className?: string;
  /** Number of decimal places */
  decimals?: number;
}

/**
 * AnimatedCounter — Dramatic number reveal component.
 *
 * Counts from 0 to a target value with ease-out-cubic easing.
 * Optional blur-to-sharp reveal effect for maximum impact.
 * Respects prefers-reduced-motion.
 */
export function AnimatedCounter({
  value,
  duration = 2000,
  prefix = '',
  suffix = '',
  formatter,
  reveal = false,
  onComplete,
  delay = 0,
  className,
  decimals = 0,
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const hasAnimated = useRef(false);

  // Ease-out cubic for natural deceleration
  const easeOutCubic = (t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  };

  const animate = useCallback(
    (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      const currentValue = easedProgress * value;

      setDisplayValue(currentValue);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
        setIsAnimating(false);
        setIsComplete(true);
        onComplete?.();
      }
    },
    [value, duration, onComplete]
  );

  useEffect(() => {
    // Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion || hasAnimated.current) {
      setDisplayValue(value);
      setIsComplete(true);
      onComplete?.();
      return;
    }

    // Start animation after delay
    const timer = setTimeout(() => {
      hasAnimated.current = true;
      setIsAnimating(true);
      startTimeRef.current = null;
      rafRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timer);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, delay, animate, onComplete]);

  // Update display when value changes after initial animation
  useEffect(() => {
    if (hasAnimated.current && isComplete) {
      setDisplayValue(value);
    }
  }, [value, isComplete]);

  // Format the displayed number
  const formattedValue = formatter
    ? formatter(displayValue)
    : decimals > 0
      ? displayValue.toFixed(decimals)
      : Math.round(displayValue).toLocaleString();

  // Compute blur amount for reveal effect
  const blurAmount = reveal && isAnimating
    ? Math.max(0, 8 * (1 - displayValue / (value || 1)))
    : 0;

  return (
    <span
      className={cn(
        'inline-block tabular-nums transition-[filter] duration-100',
        className
      )}
      style={
        reveal && isAnimating
          ? { filter: `blur(${blurAmount}px)` }
          : undefined
      }
    >
      {prefix}
      {formattedValue}
      {suffix}
    </span>
  );
}
