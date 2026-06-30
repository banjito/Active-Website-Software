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

/** Total length of a firework show, in milliseconds. */
const SHOW_MS = 6000;

/**
 * Full-screen, non-interactive canvas that paints a celebratory fireworks
 * show each time `trigger` changes, complete with a darkening vignette and
 * gradient light-booms that flash in sync with each burst. Purely decorative.
 */
export function FireworksOverlay({ trigger }: FireworksOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const boomRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  // Preload and decode the pop sound once so playback is instant on click.
  useEffect(() => {
    let cancelled = false;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    fetch("/firework.m4a")
      .then((res) => res.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        if (!cancelled) audioBufferRef.current = decoded;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      ctx.close().catch(() => {});
    };
  }, []);

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

  // Spawn a new show whenever the trigger changes (skip initial mount at 0).
  useEffect(() => {
    if (trigger === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Honor users who prefer reduced motion.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    // Pop off a couple of firework sounds to go with the show. hehe
    // Plays from a preloaded/decoded buffer so there's no fetch-and-decode lag.
    const playPop = () => {
      const ctx = audioCtxRef.current;
      const buffer = audioBufferRef.current;
      if (!ctx || !buffer) return;
      // The click that triggered us is enough to resume a suspended context.
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      source.connect(gain).connect(ctx.destination);
      source.start();
    };
    playPop();
    const popTimeouts = [setTimeout(playPop, 450), setTimeout(playPop, 1000)];

    const spawnBurst = (cx: number, cy: number, color: string) => {
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

    // A short-lived radial glow centered on the burst — the "light boom".
    const boomTimeouts: ReturnType<typeof setTimeout>[] = [];
    const spawnBoom = (cx: number, cy: number, color: string) => {
      const container = boomRef.current;
      if (!container) return;
      const xPct = (cx / canvas.width) * 100;
      const yPct = (cy / canvas.height) * 100;
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.inset = "0";
      el.style.mixBlendMode = "screen";
      el.style.opacity = "0";
      el.style.transition = "opacity 120ms ease-out";
      el.style.background = `radial-gradient(circle at ${xPct}% ${yPct}%, ${color}cc 0%, ${color}55 10%, ${color}00 32%)`;
      container.appendChild(el);
      // Flash in on the next frame, then fade out and remove.
      requestAnimationFrame(() => {
        el.style.opacity = "0.9";
      });
      boomTimeouts.push(
        setTimeout(() => {
          el.style.transition = "opacity 700ms ease-in";
          el.style.opacity = "0";
        }, 130),
        setTimeout(() => el.remove(), 950),
      );
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
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      spawnBurst(cx, cy, color);
      spawnBoom(cx, cy, color);
      // Restart the loop in case it had already drained and stopped.
      kickLoop();
    };

    // Bring up the vignette so the booms read against a darker backdrop.
    const vignette = vignetteRef.current;
    if (vignette) {
      vignette.style.transition = "opacity 400ms ease-out";
      vignette.style.opacity = "1";
    }

    // Fire bursts across the upper portion of the screen for the full show.
    // The first one is spawned synchronously so the animation loop never starts
    // empty (which would make it halt immediately); the rest are staggered out
    // to ~1.2s before the end so the last particles fade right around SHOW_MS.
    randomBurst();
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    while (t < SHOW_MS - 1200) {
      t += 240 + Math.random() * 220;
      timeouts.push(setTimeout(randomBurst, t));
    }

    // Fade the vignette back out as the show winds down.
    const vignetteOut = setTimeout(() => {
      if (vignette) {
        vignette.style.transition = "opacity 900ms ease-in";
        vignette.style.opacity = "0";
      }
    }, SHOW_MS - 900);

    return () => {
      timeouts.forEach(clearTimeout);
      popTimeouts.forEach(clearTimeout);
      boomTimeouts.forEach(clearTimeout);
      clearTimeout(vignetteOut);
      if (boomRef.current) boomRef.current.replaceChildren();
      if (vignetteRef.current) vignetteRef.current.style.opacity = "0";
    };
  }, [trigger]);

  // Cancel any in-flight animation on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      {/* Darkening vignette — sits behind the canvas to deepen the night sky. */}
      <div
        ref={vignetteRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[198] opacity-0 [background:radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.6)_100%)]"
      />
      {/* Container for transient gradient light-booms. */}
      <div
        ref={boomRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[199]"
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[200]"
      />
    </>
  );
}
