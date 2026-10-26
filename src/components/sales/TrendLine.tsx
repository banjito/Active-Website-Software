import React, { useEffect, useRef, useState } from "react";

// One loop: draw the line, hold with a ping at the head, fade out.
const DRAW_MS = 6000;
const HOLD_MS = 1800;
const FADE_MS = 1200;
const LOOP_MS = DRAW_MS + HOLD_MS + FADE_MS;
const SAMPLES = 140;
const GRID_ALPHA = 0.045;
const LINE_ALPHA = 0.4;
const FILL_ALPHA = 0.09;
const HEAD_ALPHA = 0.7;
const PING_ALPHA = 0.32;

interface Curve {
  y0: number;
  y1: number;
  p1: number;
  p2: number;
  a1: number;
  a2: number;
}

interface TrendLineProps {
  /** Animate only while the parent element is hovered or holds focus. */
  whileParentHovered?: boolean;
  className?: string;
}

function newCurve(): Curve {
  return {
    y0: 0.8 + Math.random() * 0.07,
    y1: 0.26 + Math.random() * 0.1,
    p1: Math.random(),
    p2: Math.random(),
    a1: 0.04 + Math.random() * 0.03,
    a2: 0.015 + Math.random() * 0.015,
  };
}

/**
 * A faint white sales chart that draws itself upward across a colored card,
 * holds, fades, and redraws with a new shape. Fills its positioned parent;
 * draws one finished line for viewers who turn on reduced motion.
 */
export default function TrendLine({ whileParentHovered = false, className = "" }: TrendLineProps) {
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
    // Each hover starts a fresh line from the left edge.
    let t = reduceMotion ? DRAW_MS : 0;
    let curve = newCurve();

    const yAt = (u: number) =>
      height *
      (curve.y0 +
        (curve.y1 - curve.y0) * u +
        curve.a1 * Math.sin(Math.PI * 2 * (1.4 * u + curve.p1)) +
        curve.a2 * Math.sin(Math.PI * 2 * (3.3 * u + curve.p2)));

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      let progress = 1;
      let alpha = 1;
      let ping = -1;
      if (t < DRAW_MS) progress = t / DRAW_MS;
      else if (t < DRAW_MS + HOLD_MS) ping = reduceMotion ? -1 : (t - DRAW_MS) / HOLD_MS;
      else alpha = 1 - (t - DRAW_MS - HOLD_MS) / FADE_MS;

      ctx.strokeStyle = `rgba(255,255,255,${GRID_ALPHA})`;
      ctx.lineWidth = 1;
      for (const g of [0.32, 0.56, 0.8]) {
        const y = Math.round(height * g) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      ctx.globalAlpha = Math.max(0, alpha);
      const right = width * 0.93;
      const count = Math.max(2, Math.ceil(SAMPLES * progress));
      const points: [number, number][] = [];
      for (let i = 0; i <= count; i++) {
        const u = (progress * i) / count;
        points.push([right * u, yAt(u)]);
      }
      const [headX, headY] = points[points.length - 1];
      const tracePath = () => {
        ctx.beginPath();
        points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      };

      const fill = ctx.createLinearGradient(0, height * 0.2, 0, height);
      fill.addColorStop(0, `rgba(255,255,255,${FILL_ALPHA})`);
      fill.addColorStop(1, "rgba(255,255,255,0)");
      tracePath();
      ctx.lineTo(headX, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();

      tracePath();
      ctx.strokeStyle = `rgba(255,255,255,${LINE_ALPHA})`;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.stroke();

      // Square head marker and ping, matching the app's square corners.
      ctx.fillStyle = `rgba(255,255,255,${HEAD_ALPHA})`;
      ctx.fillRect(headX - 2.5, headY - 2.5, 5, 5);
      if (ping >= 0) {
        const size = 5 + ping * 20;
        ctx.strokeStyle = `rgba(255,255,255,${PING_ALPHA * (1 - ping)})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(headX - size / 2, headY - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
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
      t += last ? Math.min(50, now - last) : 16;
      last = now;
      if (t >= LOOP_MS) {
        t = 0;
        curve = newCurve();
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
