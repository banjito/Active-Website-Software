/**
 * Canvas field of monospace characters that keep swapping and recolouring.
 * Adapted from React Bits "Letter Glitch" (reactbits.dev/backgrounds/letter-glitch).
 *
 * Changes from the original: TypeScript, colours kept as RGB numbers (the
 * original turned them into "rgb()" strings it could no longer parse, so
 * fades stopped after one step), sized to its parent with ResizeObserver,
 * paused while off screen, in a background tab, or while `active` is false
 * (hover-only cards), a configurable vignette colour for light themes, and a
 * still frame when the user prefers reduced motion.
 */
import React, { useEffect, useRef } from "react";

export type RGB = [number, number, number];

interface LetterGlitchProps {
  /** Letter colours. */
  colors: RGB[];
  /** Background behind the letters. */
  background?: string;
  /** Animate only while true (e.g. while the card is hovered). */
  active?: boolean;
  /** Colour the edges fade to; match the card so the field blends in. */
  vignette?: string;
  /** Milliseconds between glitch steps. */
  glitchSpeed?: number;
  /** Fade colours instead of snapping. */
  smooth?: boolean;
  outerVignette?: boolean;
  centerVignette?: boolean;
  characters?: string;
  className?: string;
}

const FONT_SIZE = 16;
const CHAR_WIDTH = 10;
const CHAR_HEIGHT = 20;

interface Letter {
  char: string;
  color: RGB;
  from: RGB;
  to: RGB;
  progress: number;
}

export function LetterGlitch({
  colors,
  background = "#000",
  active = true,
  vignette = "rgba(0, 0, 0, 1)",
  glitchSpeed = 50,
  smooth = true,
  outerVignette = true,
  centerVignette = false,
  characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789",
  className = "",
}: LetterGlitchProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Latest colours without restarting the animation when the array identity changes.
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !parent || !ctx) return;

    const chars = Array.from(characters);
    const randomChar = () => chars[Math.floor(Math.random() * chars.length)];
    const randomColor = (): RGB => {
      const list = colorsRef.current.length ? colorsRef.current : [[255, 255, 255] as RGB];
      return list[Math.floor(Math.random() * list.length)];
    };

    let letters: Letter[] = [];
    let columns = 0;
    let width = 0;
    let height = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.font = `${FONT_SIZE}px monospace`;
      ctx.textBaseline = "top";
      letters.forEach((letter, index) => {
        const [r, g, b] = letter.color;
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillText(letter.char, (index % columns) * CHAR_WIDTH, Math.floor(index / columns) * CHAR_HEIGHT);
      });
    };

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = Math.ceil(width / CHAR_WIDTH);
      const rows = Math.ceil(height / CHAR_HEIGHT);
      letters = Array.from({ length: columns * rows }, () => {
        const color = randomColor();
        return { char: randomChar(), color, from: color, to: color, progress: 1 };
      });
      draw();
    };

    const glitch = () => {
      const count = Math.max(1, Math.floor(letters.length * 0.05));
      for (let i = 0; i < count; i++) {
        const letter = letters[Math.floor(Math.random() * letters.length)];
        if (!letter) continue;
        letter.char = randomChar();
        letter.to = randomColor();
        if (smooth) {
          letter.from = letter.color;
          letter.progress = 0;
        } else {
          letter.color = letter.to;
          letter.progress = 1;
        }
      }
    };

    const fade = () => {
      for (const letter of letters) {
        if (letter.progress >= 1) continue;
        letter.progress = Math.min(1, letter.progress + 0.05);
        const t = letter.progress;
        letter.color = [
          Math.round(letter.from[0] + (letter.to[0] - letter.from[0]) * t),
          Math.round(letter.from[1] + (letter.to[1] - letter.from[1]) * t),
          Math.round(letter.from[2] + (letter.to[2] - letter.from[2]) * t),
        ];
      }
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(parent);

    // Reduced motion: the first frame stays as a still pattern.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return () => resizeObserver.disconnect();

    let frame = 0;
    let visible = true;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!visible || document.hidden || !activeRef.current) return;
      if (now - last >= glitchSpeed) {
        glitch();
        last = now;
      }
      if (smooth) fade();
      draw();
    };
    frame = requestAnimationFrame(tick);

    // No work while scrolled out of view.
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    intersection.observe(parent);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
    };
  }, [characters, glitchSpeed, smooth]);

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`} style={{ background }}>
      <canvas ref={canvasRef} className="block h-full w-full" />
      {outerVignette && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: `radial-gradient(circle, transparent 60%, ${vignette} 100%)` }}
        />
      )}
      {centerVignette && (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,_rgba(0,0,0,0.8)_0%,_rgba(0,0,0,0)_60%)]" />
      )}
    </div>
  );
}
