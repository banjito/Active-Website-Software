import React from "react";

export interface ColorKeyItem {
  label: string;
  /** A Tailwind class, for colors with their own dark mode shade. */
  swatchClass?: string;
  /** A CSS color, for colors chosen by the user. */
  color?: string;
}

/** What the colors mean. Only on screen while coloring is on. */
export default function DiagramColorKey({ title, items }: { title: string; items: ColorKeyItem[] }) {
  if (items.length === 0) return null;

  return (
    <div
      aria-label={title}
      className="absolute bottom-3 left-3 z-10 border border-neutral-200 bg-white p-2 text-xs shadow-md dark:border-neutral-700 dark:bg-neutral-800"
    >
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 py-0.5">
          <span
            className={`h-3 w-3 ${item.swatchClass ?? ""}`}
            style={item.color ? { backgroundColor: item.color } : undefined}
          />
          {item.label}
        </div>
      ))}
    </div>
  );
}
