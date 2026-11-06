import React from "react";
import { getSymbolGeometry, type SymbolGeometry, type SymbolShape } from "@/lib/diagrams/symbols";
import type { SymbolTint } from "@/lib/diagrams/voltage";

interface DiagramSymbolProps {
  /** Built-in symbol key. Unknown or empty keys draw the generic box. */
  symbolKey?: string | null;
  /** Only used by symbols that stretch, such as a bus. */
  width?: number | null;
  /** Overrides the color, which otherwise follows light and dark mode. */
  className?: string;
  /** Colors the upstream and downstream halves, for voltage coloring. */
  tint?: SymbolTint;
  /** Draws this instead of looking the key up, for a symbol not in the active set. */
  geometry?: SymbolGeometry;
}

function renderShape(shape: SymbolShape, index: number) {
  switch (shape.type) {
    case "line":
      return <line key={index} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />;
    case "rect":
      return (
        <rect
          key={index}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          fill={shape.filled ? "currentColor" : "none"}
          stroke={shape.filled ? "none" : undefined}
        />
      );
    case "circle":
      return (
        <circle
          key={index}
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          fill={shape.filled ? "currentColor" : "none"}
          stroke={shape.filled ? "none" : undefined}
        />
      );
    case "path":
      return (
        <path
          key={index}
          d={shape.d}
          fill={shape.filled ? "currentColor" : "none"}
          stroke={shape.filled ? "none" : undefined}
        />
      );
    case "image":
      return (
        <image
          key={index}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          href={shape.href}
          preserveAspectRatio="xMidYMid meet"
        />
      );
    case "text":
      return (
        <text
          key={index}
          x={shape.x}
          y={shape.y}
          fontSize={shape.size}
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight={700}
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
        >
          {shape.text}
        </text>
      );
  }
}

/** One single-line diagram symbol, drawn at its natural size. */
export default function DiagramSymbol({
  symbolKey,
  width,
  className = "text-neutral-900 dark:text-neutral-100",
  tint,
  geometry: given,
}: DiagramSymbolProps) {
  const geometry = given ?? getSymbolGeometry(symbolKey, width);

  return (
    <svg
      width={geometry.width}
      height={geometry.height}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      role="img"
      aria-label={geometry.label}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="miter"
    >
      {geometry.shapes.map((shape, index) => {
        const color = shape.part === "bottom" ? tint?.bottom : tint?.top;
        return (
          <g key={index} style={color ? { color } : undefined}>
            {renderShape(shape, index)}
          </g>
        );
      })}
    </svg>
  );
}
