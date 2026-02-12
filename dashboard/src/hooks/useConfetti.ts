'use client';

import { useState, useCallback, useRef } from 'react';
import type { ConfettiIntensity } from '@/components/ui/Confetti';

interface UseConfettiReturn {
  /** Whether confetti is currently active */
  active: boolean;
  /** Current intensity */
  intensity: ConfettiIntensity;
  /** Fire confetti with a given intensity */
  fire: (intensity?: ConfettiIntensity) => void;
  /** Reset (called automatically on completion) */
  reset: () => void;
}

/**
 * useConfetti — Hook for managing confetti celebration state.
 *
 * Usage:
 *   const confetti = useConfetti();
 *   confetti.fire('medium'); // in event handler
 *
 *   <Confetti
 *     active={confetti.active}
 *     intensity={confetti.intensity}
 *     onComplete={confetti.reset}
 *   />
 */
export function useConfetti(): UseConfettiReturn {
  const [active, setActive] = useState(false);
  const [intensity, setIntensity] = useState<ConfettiIntensity>('medium');
  const cooldownRef = useRef(false);

  const fire = useCallback((level: ConfettiIntensity = 'medium') => {
    // Prevent rapid re-firing
    if (cooldownRef.current) return;
    cooldownRef.current = true;

    setIntensity(level);
    setActive(true);

    // Reset cooldown after animation would complete
    setTimeout(() => {
      cooldownRef.current = false;
    }, 3000);
  }, []);

  const reset = useCallback(() => {
    setActive(false);
  }, []);

  return { active, intensity, fire, reset };
}
