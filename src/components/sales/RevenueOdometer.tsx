import React, { useEffect, useRef, useState } from "react";

// Sample numbers only; nothing here reads real sales data.
const START_VALUE = 1284350;
const DIGITS = 7;
const LAYOUT: (string | number)[] = ["$", 0, ",", 1, 2, 3, ",", 4, 5, 6];
const SPIN_MS = 900;
const STAGGER_MS = 80;
const DEAL_EVERY_MS = 2400;
const FIRST_DEAL_MS = 700;
const POP_MS = 1600;
const FONT_STACK = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const DIGIT_ALPHA = 0.24;
const ROLLING_ALPHA = 0.3;
const COMMA_ALPHA = 0.18;
const RULE_ALPHA = 0.1;
const POP_ALPHA = 0.55;

interface Column {
  from: number;
  steps: number;
  t: number;
  dur: number;
}

interface Pop {
  amount: number;
  age: number;
}

interface RevenueOdometerProps {
  /** Animate only while the parent element is hovered or holds focus. */
  whileParentHovered?: boolean;
  className?: string;
}

const white = (a: number) => `rgba(255,255,255,${Math.max(0, a)})`;
const clamp = (v: number) => Math.min(1, Math.max(0, v));

function digitsOf(value: number): number[] {
  return String(Math.floor(value)).padStart(DIGITS, "0").slice(-DIGITS).split("").map(Number);
}

function settled(value: number): Column[] {
  return digitsOf(value).map((d) => ({ from: d, steps: 0, t: 1, dur: 1 }));
}

/**
 * A faint white dollar counter. Every couple of seconds a deal lands, the
 * digits roll like a slot machine to the new total, and the deal amount
 * floats up. Fills its positioned parent; shows a still total for viewers
 * who turn on reduced motion.
 */
export default function RevenueOdometer({ whileParentHovered = false, className = "" }: RevenueOdometerProps) {
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
    let frame = 0;
    let last = 0;
    // Each hover starts from the same total, with the first deal close behind.
    let value = START_VALUE;
    let timer = FIRST_DEAL_MS;
    let columns = settled(value);
    let pops: Pop[] = [];

    const landDeal = () => {
      const amount = 2000 + Math.floor(Math.random() * 46000);
      const before = digitsOf(value);
      value += amount;
      if (value > 9_500_000) value = 1_200_000 + Math.floor(Math.random() * 100_000);
      const after = digitsOf(value);
      // Low digits spin an extra full turn; columns to the right finish last.
      columns = after.map((d, i) => ({
        from: before[i],
        steps: ((d - before[i] + 10) % 10) + (i >= DIGITS - 3 ? 10 : 0),
        t: 0,
        dur: SPIN_MS + i * STAGGER_MS,
      }));
      pops.push({ amount, age: 0 });
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const size = Math.round(Math.min(height * 0.44, width * 0.085));
      const lineH = size * 1.05;
      ctx.font = `500 ${size}px ${FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const cellW = ctx.measureText("0").width;
      const right = width * 0.95;
      const left = right - cellW * LAYOUT.length;
      const cy = height * 0.62;

      LAYOUT.forEach((slot, j) => {
        const x = left + cellW * (j + 0.5);
        if (typeof slot === "string") {
          ctx.fillStyle = white(COMMA_ALPHA);
          ctx.fillText(slot, x, cy);
          return;
        }
        const col = columns[slot];
        const k = 1 - Math.pow(1 - clamp(col.t / col.dur), 3);
        const pos = col.from + col.steps * k;
        const digit = Math.floor(pos) % 10;
        const frac = pos - Math.floor(pos);
        const rolling = frac > 0.001;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - cellW / 2, cy - lineH / 2, cellW, lineH);
        ctx.clip();
        ctx.fillStyle = white(rolling ? ROLLING_ALPHA : DIGIT_ALPHA);
        ctx.fillText(String(digit), x, cy - frac * lineH);
        if (rolling) ctx.fillText(String((digit + 1) % 10), x, cy + (1 - frac) * lineH);
        ctx.restore();
      });

      ctx.fillStyle = white(RULE_ALPHA);
      ctx.fillRect(left, Math.round(cy + lineH / 2) + 2, right - left, 1);

      ctx.font = `500 9px ${FONT_STACK}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      for (const pop of pops) {
        const k = pop.age / POP_MS;
        ctx.fillStyle = white(POP_ALPHA * (1 - k));
        ctx.fillText(`+$${pop.amount.toLocaleString("en-US")}`, right, cy - lineH / 2 - 4 - k * 14);
      }
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const step = (now: number) => {
      const dt = last ? Math.min(50, now - last) : 16;
      last = now;
      timer -= dt;
      if (timer <= 0) {
        landDeal();
        timer = DEAL_EVERY_MS;
      }
      columns.forEach((c) => {
        c.t = Math.min(c.dur, c.t + dt);
      });
      pops.forEach((p) => {
        p.age += dt;
      });
      pops = pops.filter((p) => p.age < POP_MS);
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
