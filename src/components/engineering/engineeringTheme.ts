import type React from "react";

/**
 * C&E Design palette for the Engineering portal (navy and midnight, square
 * corners). Full class strings so Tailwind keeps them; the orange accent
 * stays the instance `brand` color.
 */
export const ce = {
  page: "bg-white text-[#1b0f56] dark:bg-[#0c0a34] dark:text-[#f4f5f8]",
  surface: "bg-white dark:bg-[#0c0a34]",
  surfaceAlt: "bg-[#f4f3f8] dark:bg-[#151244]",
  hoverAlt: "hover:bg-[#f4f3f8] dark:hover:bg-[#151244]",
  ink: "text-[#1b0f56] dark:text-[#f4f5f8]",
  muted: "text-[#4d4870] dark:text-[#c4c8d2]",
  accentInk: "text-[#b2440e] dark:text-[#f8894f]",
  border: "border-[#dcd9e8] dark:border-[#2c2766]",
  borderStrong: "border-[#8f8aae] dark:border-[#5e58a0]",
  segmentOff: "bg-[#dcd9e8] dark:bg-[#2c2766]",
  marker: "bg-[#1b0f56] dark:bg-[#a9a0ea]",
  shadow:
    "shadow-[0_1px_2px_rgba(27,15,86,0.08),0_4px_12px_rgba(27,15,86,0.06)] dark:shadow-none",
  eyebrow: "text-xs font-semibold uppercase tracking-[0.14em]",
  spark: "bg-gradient-to-r from-brand to-[#c19d65]",
  field:
    "h-10 rounded-none border bg-white text-sm text-[#1b0f56] placeholder:text-[#4d4870] border-[#8f8aae] dark:bg-[#0c0a34] dark:text-[#f4f5f8] dark:placeholder:text-[#c4c8d2] dark:border-[#5e58a0] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
  ghostButton:
    "inline-flex items-center justify-center gap-2 rounded-none border border-[#8f8aae] bg-transparent text-sm font-semibold text-[#1b0f56] hover:bg-[#f4f3f8] dark:border-[#5e58a0] dark:text-[#f4f5f8] dark:hover:bg-[#151244] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
  primaryButton:
    "inline-flex items-center justify-center gap-2 rounded-none bg-brand text-sm font-semibold text-[#1b0f56] hover:bg-brand-dark disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
};

/** Filter chip: `on` is the selected state. */
export const chipClass = (on: boolean) =>
  `inline-flex h-10 items-center gap-2 rounded-none border px-3.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
    on
      ? "border-[#1b0f56] bg-[#1b0f56] text-white dark:border-[#f4f5f8] dark:bg-[#f4f5f8] dark:text-[#0c0a34]"
      : "border-[#8f8aae] bg-transparent text-[#4d4870] hover:bg-[#f4f3f8] hover:text-[#1b0f56] dark:border-[#5e58a0] dark:text-[#c4c8d2] dark:hover:bg-[#151244] dark:hover:text-[#f4f5f8]"
  }`;

/** The 40px blueprint grid over midnight that deepens into navy (title bands). */
export const blueprintStyle: React.CSSProperties = {
  backgroundColor: "#0c0a34",
  backgroundImage:
    "linear-gradient(#14114e 1px, transparent 1px), linear-gradient(90deg, #14114e 1px, transparent 1px), linear-gradient(180deg, #0c0a34 0%, #0c0a34 50%, #1b0f56 100%)",
  backgroundSize: "40px 40px, 40px 40px, 100% 100%",
};
