'use client';

import { useEffect, useRef, useCallback } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  decay: number;
  shape: 'rect' | 'circle';
}

export type ConfettiIntensity = 'small' | 'medium' | 'large';

interface ConfettiProps {
  /** When true, fires the confetti animation */
  active: boolean;
  /** Intensity of the burst */
  intensity?: ConfettiIntensity;
  /** Callback when animation completes */
  onComplete?: () => void;
  /** Origin point as fraction of viewport (0-1) */
  originX?: number;
  originY?: number;
}

// Finault brand colors for confetti
const CONFETTI_COLORS = [
  '#22c55e', // green-500
  '#16a34a', // green-600
  '#4ade80', // green-400
  '#86efac', // green-300
  '#ffffff', // white
  '#fbbf24', // amber-400 (gold accent)
  '#15803d', // green-700
];

const INTENSITY_CONFIG: Record<ConfettiIntensity, { count: number; spread: number; velocity: number }> = {
  small: { count: 30, spread: 40, velocity: 8 },
  medium: { count: 60, spread: 60, velocity: 12 },
  large: { count: 120, spread: 80, velocity: 16 },
};

/**
 * Confetti — Canvas-based celebration effect.
 *
 * Green-themed confetti burst for Finault milestones.
 * No external dependencies — pure canvas API.
 */
export function Confetti({
  active,
  intensity = 'medium',
  onComplete,
  originX = 0.5,
  originY = 0.5,
}: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const hasFireRef = useRef(false);

  const createParticles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const config = INTENSITY_CONFIG[intensity];
    const cx = canvas.width * originX;
    const cy = canvas.height * originY;

    const particles: Particle[] = [];

    for (let i = 0; i < config.count; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const velocity = config.velocity * (0.5 + Math.random() * 0.5);
      const spread = config.spread;

      particles.push({
        x: cx + (Math.random() - 0.5) * spread,
        y: cy + (Math.random() - 0.5) * spread * 0.5,
        vx: Math.cos(angle) * velocity * (0.5 + Math.random()),
        vy: Math.sin(angle) * velocity * (0.5 + Math.random()) - velocity * 0.8,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 4 + Math.random() * 6,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        opacity: 1,
        decay: 0.008 + Math.random() * 0.008,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      });
    }

    particlesRef.current = particles;
  }, [intensity, originX, originY]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let alive = false;

    for (const p of particlesRef.current) {
      if (p.opacity <= 0) continue;
      alive = true;

      // Physics
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.3; // gravity
      p.vx *= 0.99; // air resistance
      p.rotation += p.rotationSpeed;
      p.opacity -= p.decay;

      if (p.opacity <= 0) continue;

      // Draw
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    if (alive) {
      rafRef.current = requestAnimationFrame(animate);
    } else {
      // Animation complete
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onComplete?.();
    }
  }, [onComplete]);

  useEffect(() => {
    if (!active || hasFireRef.current) return;

    // Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion) {
      onComplete?.();
      return;
    }

    hasFireRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size canvas to viewport
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    createParticles();
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [active, createParticles, animate, onComplete]);

  // Reset when active goes false
  useEffect(() => {
    if (!active) {
      hasFireRef.current = false;
    }
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[9999] pointer-events-none"
      style={{ width: '100vw', height: '100vh' }}
    />
  );
}
