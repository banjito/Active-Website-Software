import React, { useEffect, useRef, useState } from "react";

const CELL = 12; // px between dots
const DOT = 3; // px
const GLYPHS = "0123456789#%&$@*+=<>/?!{}[]";
const FONT = '500 9px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const FLICKER_MS = 90; // how often a glyph changes
const FADE_MS = 180; // dot to glyph crossfade
const DOT_ALPHA = 0.1;
const GLYPH_ALPHA = 0.3; // plus up to 0.25 of random flicker

interface Cell {
  col: number;
  row: number;
  x: number;
  y: number;
  start: number;
  end: number;
  seed: number;
}

interface GlyphGlitchProps {
  /** Animate only while the parent element is hovered or holds focus. */
  whileParentHovered?: boolean;
  className?: string;
}

// Stable pseudo-random value, so each cell flickers on its own pattern.
const hash = (a: number, b: number) => {
  const x = Math.sin(a * 91.7 + b * 47.3) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * A calm grid of faint dots where clumps briefly flicker into random numbers
 * and symbols, like a bug popping up, then settle back into dots. Fills its
 * positioned parent; draws one still frame for viewers who turn on reduced
 * motion.
 */
export default function GlyphGlitch({ whileParentHovered = false, className = "" }: GlyphGlitchProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(!whileParentHovered);

  useEffect(() => {
    const parent = canvasRef.current?.parentElement;
    if (!whileParentHovered || !parent) return;
    const start = () => setRunning(true);
    const stop = () => setRunning(false);
    parent.addEventListener("mouseenter", start);
    parent.addEventListener("mouseleave", stop);
    parent.addEventListener("focusin", start);
    parent.addEventListener("focusout", stop);
    return () => {
      parent.removeEventListener("mouseenter", start);
      parent.removeEventListener("mouseleave", stop);
      parent.removeEventListener("focusin", start);
      parent.removeEventListener("focusout", stop);
    };
  }, [whileParentHovered]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!running || !canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let frame = 0;
    let last = 0;
    let clock = 0;
    let nextClump = 300;
    let cells: Cell[] = [];

    // Turn a rough circle of cells into glyphs, thinning out toward its edge.
    const clump = (delay = 0) => {
      const cc = Math.floor(Math.random() * cols);
      const cr = Math.floor(Math.random() * rows);
      const radius = 2.2 + Math.random() * 1.4;
      for (const c of cells) {
        const d = Math.hypot(c.col - cc, c.row - cr);
        if (d > radius || Math.random() > 0.9 - d * 0.1 || c.end > clock) continue;
        c.start = clock + delay + Math.random() * 250;
        c.end = c.start + 900 + Math.random() * 600;
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.font = FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tick = Math.floor(clock / FLICKER_MS);
      for (const c of cells) {
        const on = clock >= c.start && clock < c.end;
        const k = on ? Math.min(1, (clock - c.start) / FADE_MS, (c.end - clock) / FADE_MS) : 0;
        if (k < 1) {
          ctx.fillStyle = `rgba(255,255,255,${DOT_ALPHA * (1 - k)})`;
          ctx.fillRect(c.x - DOT / 2, c.y - DOT / 2, DOT, DOT);
        }
        if (k > 0) {
          const glyph = GLYPHS[Math.floor(hash(c.seed, tick) * GLYPHS.length)];
          ctx.fillStyle = `rgba(255,255,255,${(GLYPH_ALPHA + 0.25 * hash(c.seed + 3, tick)) * k})`;
          ctx.fillText(glyph, c.x, c.y + 0.5);
        }
      }
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.floor(width / CELL);
      rows = Math.floor(height / CELL);
      const offsetX = (width - (cols - 1) * CELL) / 2;
      const offsetY = (height - (rows - 1) * CELL) / 2;
      cells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          cells.push({ col: c, row: r, x: offsetX + c * CELL, y: offsetY + r * CELL, start: -1, end: -1, seed: Math.random() * 1000 });
        }
      }
      if (reduceMotion) {
        clump(-400);
        clump(-600);
      }
      draw();
    };

    const step = (now: number) => {
      const dt = last ? Math.min(50, now - last) : 16;
      last = now;
      clock += dt;
      nextClump -= dt;
      if (nextClump <= 0) {
        clump();
        nextClump = 1000 + Math.random() * 600;
      }
      draw();
      frame = requestAnimationFrame(step);
    };

    resize();
    if (!reduceMotion) frame = requestAnimationFrame(step);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // Stopping keeps the last frame on the canvas, so it can fade out.
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [running]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
