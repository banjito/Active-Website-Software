import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

/**
 * Hover/focus label for an icon-only control.
 *
 * The native `title` attribute was doing this job and doing it badly: it waits about a
 * second, renders in the OS style rather than the app's, and clips at the window edge —
 * which is exactly where the row action buttons sit. This appears straight away, flips
 * side when it would run off, and is dismissed by Escape.
 *
 * Text only, and short. Anything that needs a heading, a list or a link belongs in a
 * popover — a tooltip can't be selected, tabbed into, or read by a touch user.
 */

export interface TooltipProps {
  /** The label. Keep it to a phrase; there's no room for a sentence with punctuation. */
  content: React.ReactNode;
  /** The control being described. Must forward its ref — Radix clones onto this element. */
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Milliseconds before it appears. 0 for a toolbar, where the pointer is already aimed. */
  delayDuration?: number;
}

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  delayDuration = 150,
}: TooltipProps) {
  if (!content) return children;

  return (
    // Provider per tooltip rather than one at the app root: these are scattered through
    // pages that mount independently, and Radix is happy to nest providers. The shared
    // "skipDelayDuration" grouping isn't worth wiring a root provider for.
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={8}
            className="z-[100] max-w-xs rounded-none border border-brand/40 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-900 shadow-md dark:border-brand/50 dark:bg-dark-150 dark:text-white"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-white dark:fill-dark-150" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export default Tooltip;
