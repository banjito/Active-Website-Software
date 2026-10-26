import React, { useEffect, useRef, useState } from "react";

// C&E Design constellation settings (match cedsi.com's hero).
const DEFAULT_DENSITY = 0.00011; // nodes per px²; the design system caps it at 0.0002
const LINK_DIST = 120; // px; lines fade to nothing at this distance
const SPEED = 0.18; // px per frame
const LINK_ALPHA = 0.22;

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
}

interface ConstellationProps {
  /** Animate only while the parent element is hovered or holds focus. */
  whileParentHovered?: boolean;
  density?: number;
  className?: string;
}

/**
 * White points drifting over a dark band, joined to near neighbors by
 * hairlines. Fills its positioned parent; draws one still frame for viewers
 * who turn on reduced motion.
 */
export default function Constellation({
  whileParentHovered = false,
  density = DEFAULT_DENSITY,
  className = "",
}: ConstellationProps) {
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
    let nodes: Node[] = [];

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if (d >= LINK_DIST) continue;
          ctx.strokeStyle = `rgba(255,255,255,${LINK_ALPHA * (1 - d / LINK_DIST)})`;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
      for (const n of nodes) {
        ctx.fillStyle = `rgba(255,255,255,${n.alpha})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodes = Array.from({ length: Math.round(width * height * density) }, () => {
        const angle = Math.random() * Math.PI * 2;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * SPEED,
          vy: Math.sin(angle) * SPEED,
          alpha: 0.35 + Math.random() * 0.45,
        };
      });
      draw();
    };

    const step = () => {
      for (const n of nodes) {
        n.x = (n.x + n.vx + width) % width;
        n.y = (n.y + n.vy + height) % height;
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
  }, [running, density]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
