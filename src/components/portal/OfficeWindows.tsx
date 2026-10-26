import React, { useEffect, useRef, useState } from "react";

// The facade is a wall running away from the camera toward a vanishing point
// near the card's right edge, seen from below like a street-level shot.
const COLUMN = 0.25; // world units between window columns
const FLOOR = 0.06; // world units per floor
const NEAR = 0.5; // camera distance to the nearest column
const DEPTH = 6; // how far down the wall we draw before it fades out
const SPEED = 0.00005; // units per ms; a new column every ~5 seconds
const LINE_ALPHA = 0.07;
const PANE_ALPHA = 0.03;
const LIT_ALPHA = 0.18;

interface OfficeWindowsProps {
  /** Animate only while the parent element is hovered or holds focus. */
  whileParentHovered?: boolean;
  className?: string;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
// Stable pseudo-random value per window, so each one keeps its own rhythm.
const hash = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * A perspective shot along an office tower's glass facade: window columns
 * drift slowly past as if the camera were walking down the street, and a few
 * windows light up and go dark. Fills its positioned parent; draws one still
 * frame for viewers who turn on reduced motion.
 */
export default function OfficeWindows({ whileParentHovered = false, className = "" }: OfficeWindowsProps) {
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
    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const vx = width * 0.85; // vanishing point
      const vy = height * 0.82; // eye level, low so we look up the tower
      const focal = vx * NEAR; // puts the nearest column at the left edge
      const sx = (u: number) => vx - focal / (NEAR + u);
      const sy = (u: number, v: number) => vy - (focal * v) / (NEAR + u);
      const shift = t * SPEED;
      const base = -FLOOR;

      ctx.lineWidth = 1;
      for (let k = Math.ceil(shift / COLUMN) - 1; ; k++) {
        const u0 = k * COLUMN - shift;
        if (u0 > DEPTH) break;
        const u1 = u0 + COLUMN;
        const fade = clamp((DEPTH - u0) / 2);

        // Vertical mullion on this column's near edge.
        const mx = Math.round(sx(u0)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(mx, sy(u0, base));
        ctx.lineTo(mx, 0);
        ctx.strokeStyle = `rgba(255,255,255,${LINE_ALPHA * fade})`;
        ctx.stroke();

        // Floors up to where the far edge leaves the top of the card.
        const top = (vy * (NEAR + u1)) / focal;
        const gu = COLUMN * 0.12;
        const gv = FLOOR * 0.18;
        const panes = new Path2D();
        for (let j = 0; base + j * FLOOR < top; j++) {
          const v0 = base + j * FLOOR + gv;
          const v1 = base + (j + 1) * FLOOR - gv;
          const a = u0 + gu;
          const b = u1 - gu;
          const pane = new Path2D();
          pane.moveTo(sx(a), sy(a, v0));
          pane.lineTo(sx(b), sy(b, v0));
          pane.lineTo(sx(b), sy(b, v1));
          pane.lineTo(sx(a), sy(a, v1));
          pane.closePath();
          panes.addPath(pane);

          // About a third of the windows ever light, each on its own slow cycle.
          if (hash(k + 7, j + 3) < 0.35) {
            const period = 9000 + hash(j, k) * 14000;
            const lit = clamp((Math.sin((t / period) * Math.PI * 2 + hash(k, j) * Math.PI * 2) - 0.55) * 3);
            if (lit > 0) {
              ctx.fillStyle = `rgba(255,255,255,${LIT_ALPHA * lit * fade})`;
              ctx.fill(pane);
            }
          }
        }
        ctx.fillStyle = `rgba(255,255,255,${PANE_ALPHA * fade})`;
        ctx.fill(panes);
      }

      // The tower's base line, running to the vanishing point.
      ctx.beginPath();
      ctx.moveTo(sx(0), sy(0, base));
      ctx.lineTo(sx(DEPTH), sy(DEPTH, base));
      ctx.strokeStyle = `rgba(255,255,255,${LINE_ALPHA * 1.4})`;
      ctx.stroke();
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
