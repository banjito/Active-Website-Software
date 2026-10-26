import React, { useEffect, useRef, useState } from "react";

type Vec3 = [number, number, number];
type Face = "front" | "back" | "left" | "right" | "top" | "bottom";

// A three-section switchgear lineup, in model units (one section = 1 wide).
const HALF_W = 1.5;
const HEIGHT = 2.3;
const HALF_D = 0.6;
const DIST = 7; // camera distance
const PITCH = 0.28; // radians; camera slightly above, looking down
const SCALE = 6; // focal length in card heights; draws the lineup about twice the card's height
const SWAY_MS = 14000; // one turntable sway
const SEEN_ALPHA = 0.22;
const HIDDEN_ALPHA = 0.08;
const DETAIL_ALPHA = 0.14;

const NORMALS: Record<Face, Vec3> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 1, 0],
  bottom: [0, -1, 0],
};

// The 12 box edges, each with the two faces it borders.
const EDGES: [Vec3, Vec3, Face, Face][] = [];
for (const y of [0, HEIGHT]) {
  for (const z of [-HALF_D, HALF_D]) {
    EDGES.push([[-HALF_W, y, z], [HALF_W, y, z], y ? "top" : "bottom", z > 0 ? "front" : "back"]);
  }
}
for (const x of [-HALF_W, HALF_W]) {
  for (const z of [-HALF_D, HALF_D]) {
    EDGES.push([[x, 0, z], [x, HEIGHT, z], x > 0 ? "right" : "left", z > 0 ? "front" : "back"]);
  }
  for (const y of [0, HEIGHT]) {
    EDGES.push([[x, y, -HALF_D], [x, y, HALF_D], x > 0 ? "right" : "left", y ? "top" : "bottom"]);
  }
}

interface SwitchgearWireframeProps {
  /** Animate only while the parent element is hovered or holds focus. */
  whileParentHovered?: boolean;
  className?: string;
}

/**
 * A switchgear lineup drawn as a blueprint, far larger than the card so only
 * part of it shows, swaying on a slow turntable. Hidden edges are dashed like
 * a drawing. Fills its positioned parent; draws one still frame for viewers
 * who turn on reduced motion.
 */
export default function SwitchgearWireframe({ whileParentHovered = false, className = "" }: SwitchgearWireframeProps) {
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
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const yaw = -0.55 + 0.32 * Math.sin((t / SWAY_MS) * Math.PI * 2);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const focal = height * SCALE;
      const cx = width * 0.6;
      const cy = height * 0.55;

      const project = (x: number, y: number, z: number): [number, number] => {
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        const y1 = y - HEIGHT / 2;
        const y2 = y1 * cosP - z1 * sinP;
        const z2 = y1 * sinP + z1 * cosP;
        const s = focal / (DIST - z2);
        return [cx + x1 * s, cy - y2 * s];
      };
      const segment = (path: Path2D, a: Vec3, b: Vec3) => {
        const [ax, ay] = project(a[0], a[1], a[2]);
        const [bx, by] = project(b[0], b[1], b[2]);
        path.moveTo(ax, ay);
        path.lineTo(bx, by);
      };

      // A face shows when its turned normal points toward the camera.
      const shows = {} as Record<Face, boolean>;
      for (const face of Object.keys(NORMALS) as Face[]) {
        const [nx, ny, nz] = NORMALS[face];
        shows[face] = ny * sinP + (-nx * sinY + nz * cosY) * cosP > 0;
      }

      const seen = new Path2D();
      const hidden = new Path2D();
      for (const [a, b, f1, f2] of EDGES) segment(shows[f1] || shows[f2] ? seen : hidden, a, b);

      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = `rgba(255,255,255,${HIDDEN_ALPHA})`;
      ctx.stroke(hidden);
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(255,255,255,${SEEN_ALPHA})`;
      ctx.stroke(seen);

      // Front details: section splits, two breaker cells each, meter windows,
      // door handles and top vents.
      if (shows.front) {
        const detail = new Path2D();
        const z = HALF_D;
        const line = (x1: number, y1: number, x2: number, y2: number) => segment(detail, [x1, y1, z], [x2, y2, z]);
        const rect = (x1: number, y1: number, x2: number, y2: number) => {
          line(x1, y1, x2, y1);
          line(x2, y1, x2, y2);
          line(x2, y2, x1, y2);
          line(x1, y2, x1, y1);
        };
        for (let i = 0; i < 3; i++) {
          const a = -HALF_W + i;
          const b = a + 1;
          if (i) line(a, 0, a, HEIGHT);
          rect(a + 0.08, 0.1, b - 0.08, 1.15);
          rect(a + 0.08, 1.25, b - 0.08, 1.95);
          rect(a + 0.4, 1.55, a + 0.6, 1.75);
          rect(a + 0.4, 0.55, a + 0.6, 0.75);
          line(b - 0.18, 0.5, b - 0.18, 0.75);
          line(b - 0.18, 1.5, b - 0.18, 1.7);
          for (let v = 0; v < 3; v++) line(a + 0.2, 2.05 + v * 0.07, b - 0.2, 2.05 + v * 0.07);
        }
        ctx.strokeStyle = `rgba(255,255,255,${DETAIL_ALPHA})`;
        ctx.stroke(detail);
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
