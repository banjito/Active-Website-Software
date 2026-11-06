import React, { useRef, useState } from "react";
import { useStoreApi } from "@xyflow/react";
import { LABEL_MIN_WIDTH } from "@/lib/diagrams/editing";

interface DiagramSymbolLabelProps {
  text: string;
  /** Saved wrap width. Null keeps the label on one line. */
  width: number | null;
  boxed: boolean;
  /** Where the label sits against its symbol. */
  placement: React.CSSProperties;
  /** Shows the outline and the handle that sets the wrap width. */
  adjustable: boolean;
  onResized: (width: number) => void;
}

/**
 * A symbol's name. Absolutely placed, so a long name can't change the symbol's size or its
 * connection points.
 */
export default function DiagramSymbolLabel({
  text,
  width,
  boxed,
  placement,
  adjustable,
  onResized,
}: DiagramSymbolLabelProps) {
  const store = useStoreApi();
  const label = useRef<HTMLSpanElement>(null);
  /** The label follows the pointer while it's being resized, then takes its saved width. */
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const shownWidth = dragWidth ?? width;

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();

    // The diagram can be zoomed, so screen pixels have to be turned into diagram units.
    const zoom = store.getState().transform[2];
    const startX = event.clientX;
    const startWidth = (label.current?.getBoundingClientRect().width ?? 0) / zoom;
    let latest: number | null = null;

    const move = (moveEvent: PointerEvent) => {
      latest = Math.max(LABEL_MIN_WIDTH, startWidth + (moveEvent.clientX - startX) / zoom);
      setDragWidth(latest);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      if (latest !== null) onResized(latest);
      setDragWidth(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  };

  return (
    <span
      ref={label}
      className={`absolute text-xs font-medium leading-tight text-neutral-800 dark:text-neutral-200 ${
        boxed
          ? "border border-neutral-900 bg-white px-1.5 py-0.5 dark:border-neutral-100 dark:bg-neutral-900"
          : ""
      } ${adjustable ? "outline-dashed outline-1 outline-offset-1 outline-brand" : ""}`}
      style={{
        ...placement,
        width: shownWidth ?? undefined,
        whiteSpace: shownWidth ? "normal" : "nowrap",
        overflowWrap: "anywhere",
      }}
    >
      {text}
      {adjustable && (
        <span
          role="separator"
          aria-label="Drag to set where this label wraps"
          title="Drag to wrap this label"
          onPointerDown={startResize}
          className="nodrag nopan absolute -right-2 top-1/2 h-4 w-2 -translate-y-1/2 cursor-ew-resize touch-none bg-brand"
        />
      )}
    </span>
  );
}
