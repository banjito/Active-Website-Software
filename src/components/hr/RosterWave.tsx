import React, { useEffect, useRef, useState } from "react";

const CELL = 14; // px between squares
const SQUARE = 4; // px; a new hire grows to 5
const BASE_ALPHA = 0.05;
const WAVE_ALPHA = 0.16;
const HIRE_ALPHA = 0.6;
const WAVE_SPEED = 0.0008; // radians per ms, about an 8 second sweep
const HIRE_RISE_MS = 350;
const HIRE_LIFE_MS = 2600;

interface Hire {
  c: number;
  r: number;
  age: number;
}

interface RosterWaveProps {
  /** Animate only while the parent element is hovered or holds focus. */
  whileParentHovered?: boolean;
  className?: string;
}

const ease = (v: number) => v * v * (3 - 2 * v);

/**
 * A grid of faint white squares, one per person, with a slow light passing
 * across and the odd square glowing brighter like a new hire. Fills its
 * positioned parent; draws one still frame for viewers who turn on reduced
 * motion.
 */
export default function RosterWave({ whileParentHovered = false, className = "" }: RosterWaveProps) {
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
    let offsetX = 0;
    let offsetY = 0;
    let frame = 0;
    let last = 0;
    let t = 0;
    let nextHire = 400;
    let hires: Hire[] = [];

    const addHire = (age = 0) =>
      hires.push({
        c: Math.floor(Math.random() * cols),
        r: Math.floor(Math.random() * rows),
        age,
      });

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const lit = new Map<number, number>();
      for (const h of hires) {
        const glow =
          h.age < HIRE_RISE_MS
            ? ease(h.age / HIRE_RISE_MS)
            : 1 - ease((h.age - HIRE_RISE_MS) / (HIRE_LIFE_MS - HIRE_RISE_MS));
        lit.set(h.r * cols + h.c, glow);
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wave = Math.pow(0.5 + 0.5 * Math.cos(c * 0.32 + r * 0.22 - t * WAVE_SPEED), 3);
          const hire = lit.get(r * cols + c) || 0;
          const size = hire > 0.2 ? SQUARE + 1 : SQUARE;
          ctx.fillStyle = `rgba(255,255,255,${Math.max(BASE_ALPHA + WAVE_ALPHA * wave, HIRE_ALPHA * hire)})`;
          ctx.fillRect(offsetX + c * CELL - size / 2, offsetY + r * CELL - size / 2, size, size);
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
      offsetX = (width - (cols - 1) * CELL) / 2;
      offsetY = (height - (rows - 1) * CELL) / 2;
      hires = [];
      if (reduceMotion) for (let i = 0; i < 3; i++) addHire(HIRE_RISE_MS);
      draw();
    };

    const step = (now: number) => {
      const dt = last ? Math.min(50, now - last) : 16;
      last = now;
      t += dt;
      nextHire -= dt;
      if (nextHire <= 0) {
        addHire();
        nextHire = 700 + Math.random() * 700;
      }
      for (const h of hires) h.age += dt;
      hires = hires.filter((h) => h.age < HIRE_LIFE_MS);
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
