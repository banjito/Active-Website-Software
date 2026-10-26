import React, { useEffect, useRef, useState } from "react";

const DEG = Math.PI / 180;
const TURN_MS = 40000; // one full spin
const PITCH = 0.5; // radians; tips the north pole toward the viewer
const ROLL = 23.4 * DEG; // Earth's axial tilt
const FRONT_ALPHA = 0.24;
const BACK_ALPHA = 0.06;
const RIM_ALPHA = 0.3;

interface WireGlobeProps {
  /** Animate only while the parent element is hovered or holds focus. */
  whileParentHovered?: boolean;
  className?: string;
}

/**
 * A slowly spinning wireframe globe tucked into the parent's top-right corner
 * and cropped by its edges, like a news broadcast graphic. Fills its
 * positioned parent; draws one still frame for viewers who turn on reduced
 * motion.
 */
export default function WireGlobe({ whileParentHovered = false, className = "" }: WireGlobeProps) {
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
    const cosP = Math.cos(PITCH);
    const sinP = Math.sin(PITCH);
    const cosR = Math.cos(ROLL);
    const sinR = Math.sin(ROLL);
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const radius = height * 1.5;
      const cx = width - height * 0.35;
      const cy = height * 0.3;
      const spin = (t / TURN_MS) * Math.PI * 2;

      const project = (lat: number, lon: number): [number, number, number] => {
        const phi = lat * DEG;
        const lambda = lon * DEG + spin;
        const x = Math.cos(phi) * Math.sin(lambda);
        const y = Math.sin(phi);
        const z = Math.cos(phi) * Math.cos(lambda);
        const y1 = y * cosP - z * sinP;
        const z1 = y * sinP + z * cosP;
        return [cx + radius * (x * cosR - y1 * sinR), cy - radius * (x * sinR + y1 * cosR), z1];
      };

      // Split every grid segment into the near or far side of the sphere.
      const front = new Path2D();
      const back = new Path2D();
      const addLine = (points: [number, number, number][]) => {
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1];
          const b = points[i];
          const path = a[2] + b[2] > 0 ? front : back;
          path.moveTo(a[0], a[1]);
          path.lineTo(b[0], b[1]);
        }
      };
      for (let lat = -80; lat <= 80; lat += 20) {
        const points: [number, number, number][] = [];
        for (let lon = 0; lon <= 360; lon += 5) points.push(project(lat, lon));
        addLine(points);
      }
      for (let lon = 0; lon < 360; lon += 20) {
        const points: [number, number, number][] = [];
        for (let lat = -90; lat <= 90; lat += 5) points.push(project(lat, lon));
        addLine(points);
      }

      const shade = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, 0, cx, cy, radius);
      shade.addColorStop(0, "rgba(255,255,255,0.07)");
      shade.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = shade;
      ctx.fill();

      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(255,255,255,${BACK_ALPHA})`;
      ctx.stroke(back);
      ctx.strokeStyle = `rgba(255,255,255,${FRONT_ALPHA})`;
      ctx.stroke(front);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${RIM_ALPHA})`;
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
