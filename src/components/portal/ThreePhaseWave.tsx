import React, { useEffect, useRef, useState } from "react";

const CYCLE_MS = 7000; // one full wave cycle
const WAVELENGTH = 0.34; // share of the card width per wave
const AMPLITUDE = 0.27; // share of the card height
const PHASE_ALPHAS = [0.25, 0.16, 0.09]; // phases A, B, C
const GRID_ALPHA = 0.03;
const AXIS_ALPHA = 0.05;

interface ThreePhaseWaveProps {
  /** Animate only while the parent element is hovered or holds focus. */
  whileParentHovered?: boolean;
  className?: string;
}

/**
 * Three-phase power: three faint white sine waves 120 degrees apart, rolling
 * slowly across a 10 by 8 oscilloscope grid. Fills its positioned parent;
 * draws one still frame for viewers who turn on reduced motion.
 */
export default function ThreePhaseWave({ whileParentHovered = false, className = "" }: ThreePhaseWaveProps) {
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
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 10; i++) {
        const x = Math.round((i * width) / 10) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let j = 1; j < 8; j++) {
        const y = Math.round((j * height) / 8) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.strokeStyle = `rgba(255,255,255,${GRID_ALPHA})`;
      ctx.stroke();

      const mid = height * 0.54;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(mid) + 0.5);
      ctx.lineTo(width, Math.round(mid) + 0.5);
      ctx.strokeStyle = `rgba(255,255,255,${AXIS_ALPHA})`;
      ctx.stroke();

      const k = (Math.PI * 2) / (width * WAVELENGTH);
      const omega = (Math.PI * 2) / CYCLE_MS;
      const amp = height * AMPLITUDE;
      ctx.lineWidth = 1.5;
      PHASE_ALPHAS.forEach((alpha, i) => {
        ctx.beginPath();
        for (let x = 0; x <= width + 3; x += 3) {
          const y = mid - amp * Math.sin(k * x - omega * t + (i * Math.PI * 2) / 3);
          if (x) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.stroke();
      });
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
