import React, { useEffect, useRef, useState } from "react";

const BANDS = 9; // a nine-banded armadillo's movable bands
const PLATE_H = 6; // px; one scute
const PLATE_GAP = 2;
const SWEEP_MS = 2600; // beam crossing the card
const PAUSE_MS = 2200; // dark gap before the next glint
const LOOP_MS = SWEEP_MS + PAUSE_MS;
const BEAM_ANGLE = 18 * (Math.PI / 180); // lean from vertical
const BEAM_WIDTH = 22; // px; falloff of the glint on the scutes
const PLATE_ALPHA = 0.04;
const EDGE_ALPHA = 0.07;
const GLINT_FILL = 0.22;
const GLINT_EDGE = 0.35;
const BEAM_ALPHA = 0.05;

interface Plate {
  x: number;
  y: number;
  w: number;
  facet: number;
}

interface ScuteShimmerProps {
  /** Animate only while the parent element is hovered or holds focus. */
  whileParentHovered?: boolean;
  className?: string;
}

const ease = (v: number) => v * v * (3 - 2 * v);

/**
 * Nine bowed armadillo bands built from small square scutes, with a beam of
 * light sweeping across that glints off each plate as it passes. Fills its
 * positioned parent; draws one still glint for viewers who turn on reduced
 * motion.
 */
export default function ScuteShimmer({ whileParentHovered = false, className = "" }: ScuteShimmerProps) {
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
    const tan = Math.tan(BEAM_ANGLE);
    const cos = Math.cos(BEAM_ANGLE);
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    // Each hover starts with a glint, so the beam crosses right away.
    let t = 0;
    let plates: Plate[] = [];

    const layout = () => {
      plates = [];
      const bandW = width / BANDS;
      const pitch = PLATE_H + PLATE_GAP;
      const bow = bandW * 0.18;
      for (let b = 0; b < BANDS; b++) {
        // Stagger alternate bands by half a plate, like overlapping rows.
        for (let y = -pitch + (b % 2) * (pitch / 2); y < height; y += pitch) {
          const u = (y + PLATE_H / 2 - height / 2) / (height / 2);
          plates.push({
            x: Math.round(b * bandW + 2 + bow * (1 - u * u)),
            y: Math.round(y),
            w: Math.max(4, Math.round(bandW - 5)),
            facet: 0.55 + Math.random() * 0.45,
          });
        }
      }
    };

    const beamX = () => {
      if (reduceMotion) return width * 0.62;
      const f = Math.min(1, t / SWEEP_MS);
      return -0.3 * width + ease(f) * 1.6 * width;
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const bx = beamX();
      const lit = reduceMotion || t < SWEEP_MS;

      if (lit) {
        // The beam itself: a faint band of light across the whole card.
        const nx = cos;
        const ny = -Math.sin(BEAM_ANGLE);
        const mid = height / 2;
        const beam = ctx.createLinearGradient(bx - nx * 60, mid - ny * 60, bx + nx * 60, mid + ny * 60);
        beam.addColorStop(0, "rgba(255,255,255,0)");
        beam.addColorStop(0.5, `rgba(255,255,255,${BEAM_ALPHA})`);
        beam.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = beam;
        ctx.fillRect(0, 0, width, height);
      }

      for (const p of plates) {
        const cx = p.x + p.w / 2;
        const cy = p.y + PLATE_H / 2;
        const d = (cx - (bx + (cy - height / 2) * tan)) * cos;
        const glint = lit ? Math.exp(-((d / BEAM_WIDTH) ** 2)) * p.facet : 0;
        ctx.fillStyle = `rgba(255,255,255,${PLATE_ALPHA + GLINT_FILL * glint})`;
        ctx.fillRect(p.x, p.y, p.w, PLATE_H);
        // Top edge of each scute catches the light first.
        ctx.fillStyle = `rgba(255,255,255,${EDGE_ALPHA + GLINT_EDGE * glint})`;
        ctx.fillRect(p.x, p.y, p.w, 1);
      }
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout();
      draw();
    };

    const step = (now: number) => {
      t = (t + (last ? Math.min(50, now - last) : 16)) % LOOP_MS;
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
