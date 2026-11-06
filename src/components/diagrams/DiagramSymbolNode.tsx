import React, { createContext, memo, useContext, useEffect, useRef, useState } from "react";
import {
  Handle,
  NodeResizeControl,
  Position,
  ResizeControlVariant,
  useStore,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react";
import { Link2 } from "lucide-react";
import DiagramSymbol from "@/components/diagrams/DiagramSymbol";
import DiagramSymbolLabel from "@/components/diagrams/DiagramSymbolLabel";
import { BUS_MIN_WIDTH } from "@/lib/diagrams/editing";
import type { DiagramNode, MissingReason, PortSide } from "@/lib/diagrams/flowElements";
import type { DiagramLinkTarget } from "@/lib/diagrams/links";
import type { SymbolTint } from "@/lib/diagrams/voltage";
import { getSymbolGeometry } from "@/lib/diagrams/symbols";

const POSITIONS: Record<PortSide, Position> = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
};

const LABEL_GAP = 4;

const MISSING_TAGS: Record<MissingReason, string> = {
  deleted: "Asset deleted",
  moved: "Moved to another site",
  retired: "Retired",
};

/** What a node needs from the diagram around it. */
export const DiagramNodeActions = createContext<{
  onBusResized: (symbolId: string, width: number) => void;
  onLabelResized: (symbolId: string, width: number) => void;
  links: Map<string, DiagramLinkTarget[]>;
  onJump: (target: DiagramLinkTarget) => void;
  /** Color classes for symbols being colored by report status. */
  statusClasses: Map<string, string>;
  /** Symbols whose asset isn't on the job this was opened from. */
  dimmed: Set<string>;
  /** Symbol colors while coloring by voltage. */
  tints: Map<string, SymbolTint>;
}>({
  onBusResized: () => {},
  onLabelResized: () => {},
  links: new Map(),
  onJump: () => {},
  statusClasses: new Map(),
  dimmed: new Set(),
  tints: new Map(),
});

/** One symbol on the canvas, with its label and its connection points. */
function DiagramSymbolNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const { symbolKey, role, label, ports, editing, missing } = data;
  // Only the built-in bus stretches. Custom artwork for a bus keeps its own size.
  const isBus = symbolKey === "bus";
  const isCable = role === "cable";
  /** True while a line is being drawn, when every point on the diagram is a possible end. */
  const connecting = useStore((state) => state.connection.inProgress);
  /** A bus follows the pointer while it's stretched, then takes its saved width. */
  const [stretchWidth, setStretchWidth] = useState<number | null>(null);
  const width = stretchWidth ?? data.width;
  const geometry = getSymbolGeometry(symbolKey, width);
  const { onBusResized, onLabelResized, links, onJump, statusClasses, dimmed, tints } =
    useContext(DiagramNodeActions);
  const targets = links.get(id) ?? [];

  // Connection points move and appear as a bus stretches, and the library has to re-read them.
  // Never on first render: symbols reporting in one at a time makes the library fit the view
  // to the first few, instead of to the whole diagram.
  const updateNodeInternals = useUpdateNodeInternals();
  const shape = `${ports.length}:${geometry.width}`;
  const lastShape = useRef(shape);
  useEffect(() => {
    if (lastShape.current === shape) return;
    lastShape.current = shape;
    updateNodeInternals(id);
  }, [id, shape, updateNodeInternals]);

  return (
    <div
      className={`group relative ${editing ? "" : "cursor-pointer"} ${dimmed.has(id) ? "opacity-30" : ""} ${
        selected
          ? "outline outline-1 outline-offset-4 outline-brand"
          : missing
            ? "outline-dashed outline-2 outline-offset-1 outline-amber-600"
            : ""
      }`}
      style={{ width: geometry.width, height: geometry.height }}
    >
      <DiagramSymbol
        symbolKey={symbolKey}
        width={width}
        tint={tints.get(id)}
        className={`block ${statusClasses.get(id) ?? "text-neutral-900 dark:text-neutral-100"} ${
          missing ? "opacity-40" : ""
        }`}
      />

      {/* A bus is only a few pixels tall, so it gets extra height to grab it by. */}
      {editing && isBus && <div className="absolute inset-x-0 -inset-y-2" />}

      {/* A bus has feeders above and below, so its name sits at the left end instead.
          A cable's name is a boxed callout, so it stands out from the equipment around it. */}
      {label && (
        <DiagramSymbolLabel
          text={label}
          width={data.labelWidth}
          boxed={isCable}
          adjustable={editing && !!selected}
          onResized={(labelWidth) => onLabelResized(id, labelWidth)}
          placement={
            isBus
              ? { left: 0, bottom: geometry.height + LABEL_GAP }
              : {
                  left: geometry.width + (isCable ? 0 : LABEL_GAP),
                  top: "50%",
                  transform: "translateY(-50%)",
                }
          }
        />
      )}

      {/* To the left of the symbol, because its label is on the right. */}
      {(targets.length > 0 || missing || (editing && role === "link")) && (
        <div
          className="absolute flex flex-col items-end gap-0.5"
          style={{ right: geometry.width + LABEL_GAP, top: "50%", transform: "translateY(-50%)" }}
        >
          {targets.map((target) => (
            <button
              key={target.diagramId}
              type="button"
              title={`Go to ${target.diagramName}`}
              className="nodrag nopan flex max-w-[7.5rem] items-center gap-1 border border-brand bg-white px-1 text-[10px] leading-4 text-brand hover:bg-brand hover:text-white dark:bg-neutral-900"
              onClick={(event) => {
                event.stopPropagation();
                onJump(target);
              }}
            >
              <Link2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{target.diagramName}</span>
            </button>
          ))}
          {missing && (
            <span className="whitespace-nowrap border border-amber-600 bg-white px-1 text-[10px] leading-4 text-amber-700 dark:bg-neutral-900 dark:text-amber-400">
              {MISSING_TAGS[missing]}
            </span>
          )}
          {editing && role === "link" && targets.length === 0 && (
            <span
              title="Give a link on another diagram the same name"
              className="whitespace-nowrap border border-amber-600 bg-white px-1 text-[10px] leading-4 text-amber-700 dark:bg-neutral-900 dark:text-amber-400"
            >
              No match
            </span>
          )}
        </div>
      )}

      {/* Every port is a source because the canvas runs in loose mode, which lets either
          end of a line attach to it. The handle stays 1px so lines end exactly on the port;
          the square inside it is what the user sees and grabs while editing.

          Points with no line stay out of the way until they're needed: hovering or selecting
          a symbol shows its own, and drawing a line shows them all. Selecting covers tablets,
          which have no hover. */}
      {ports.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={POSITIONS[port.side]}
          isConnectable={editing}
          style={{
            left: port.x,
            top: port.y,
            right: "auto",
            bottom: "auto",
            width: 1,
            height: 1,
            minWidth: 0,
            minHeight: 0,
            border: 0,
            borderRadius: 0,
            background: "transparent",
            transform: "translate(-50%, -50%)",
          }}
        >
          {editing && (
            <span
              className={`absolute left-1/2 top-1/2 block h-2 w-2 -translate-x-1/2 -translate-y-1/2 bg-brand ${
                port.used || connecting || selected ? "" : "opacity-0 group-hover:opacity-100"
              }`}
            />
          )}
        </Handle>
      ))}

      {editing && selected && isBus && (
        <NodeResizeControl
          variant={ResizeControlVariant.Handle}
          position="right"
          minWidth={BUS_MIN_WIDTH}
          minHeight={geometry.height}
          maxHeight={geometry.height}
          onResize={(_, params) => setStretchWidth(params.width)}
          onResizeEnd={(_, params) => {
            setStretchWidth(null);
            onBusResized(id, params.width);
          }}
          style={{ width: 10, height: 18, borderRadius: 0, border: 0, background: "#f26722" }}
        />
      )}
    </div>
  );
}

export default memo(DiagramSymbolNode);
