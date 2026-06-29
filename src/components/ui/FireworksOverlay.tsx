import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FireworksOverlayProps {
  /** Bumping this value triggers a new burst of fireworks. */
  trigger: number;
}

const COLORS = [
  "#f26722", // ampOS orange
  "#ffffff",
  "#bb0000", // flag red
  "#353fa3", // flag blue
  "#ffd700",
  "#00e0ff",
  "#ff5ec7",
];

/**
 * Full-screen, non-interactive canvas that paints a celebratory fireworks
 * burst each time `trigger` changes. Purely decorative.
 */
export function FireworksOverlay({ trigger }: FireworksOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);

  // Keep the canvas sized to the viewport.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Spawn a new burst whenever the trigger changes (skip initial mount at 0).
  useEffect(() => {
    if (trigger === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Honor users who prefer reduced motion.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const spawnBurst = (cx: number, cy: number) => {
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const count = 60 + Math.floor(Math.random() * 40);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
        const speed = 2 + Math.random() * 4;
        particlesRef.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 60 + Math.random() * 40,
          color: Math.random() > 0.85 ? "#ffffff" : color,
          size: 1.5 + Math.random() * 2,
        });
      }
    };

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += 1;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // gravity
        p.vx *= 0.99; // drag
        p.vy *= 0.99;
        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        if (alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (particles.length > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    const kickLoop = () => {
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const randomBurst = () => {
      const cx = canvas.width * (0.15 + Math.random() * 0.7);
      const cy = canvas.height * (0.15 + Math.random() * 0.4);
      spawnBurst(cx, cy);
      // Restart the loop in case it had already drained and stopped.
      kickLoop();
    };

    // Fire several bursts across the upper portion of the screen. The first one
    // is spawned synchronously so the animation loop never starts empty (which
    // would make it halt immediately); the rest are staggered.
    randomBurst();
    const burstCount = 5;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    for (let b = 1; b < burstCount; b++) {
      timeouts.push(setTimeout(randomBurst, b * 220));
    }

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [trigger]);

  // Cancel any in-flight animation on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[200]"
    />
  );
}
