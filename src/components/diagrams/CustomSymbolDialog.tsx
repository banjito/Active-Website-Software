import React, { useEffect, useRef, useState } from "react";
import { Circle, CircleDot, Eraser, Minus, Spline, Square, Type, Undo2 } from "lucide-react";
import DiagramSymbol from "@/components/diagrams/DiagramSymbol";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  DRAW_GRID,
  SYMBOL_SIZES,
  customSymbolKey,
  defaultPorts,
  isLowResolution,
  placePort,
  resizePorts,
  shapeFromDrag,
  shapeIndexAt,
  type CustomSymbolRow,
  type DrawTool,
} from "@/lib/diagrams/customSymbols";
import { prepareUpload } from "@/lib/diagrams/symbolUpload";
import type { SymbolPort, SymbolShape } from "@/lib/diagrams/symbols";

/** How much bigger the drawing area is than the symbol. */
const SCALE = 4;
const PORT_TOUCH_DISTANCE = 6;

type Tool = DrawTool | "text" | "point" | "eraser";

const TOOLS: Array<{ tool: Tool; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { tool: "line", label: "Line", Icon: Minus },
  { tool: "rect", label: "Rectangle", Icon: Square },
  { tool: "circle", label: "Circle", Icon: Circle },
  { tool: "arc", label: "Arc", Icon: Spline },
  { tool: "text", label: "Text", Icon: Type },
  { tool: "eraser", label: "Erase a shape", Icon: Eraser },
  { tool: "point", label: "Connection point", Icon: CircleDot },
];

export type NewCustomSymbol = Omit<CustomSymbolRow, "id" | "deleted_at">;

interface CustomSymbolDialogProps {
  open: boolean;
  mode: "draw" | "upload";
  /** The symbol being changed. Without it, this makes a new one. */
  existing?: CustomSymbolRow | null;
  saving: boolean;
  error: string | null;
  onSave: (symbol: NewCustomSymbol) => void;
  onClose: () => void;
}

const snap = (value: number) => Math.round(value / DRAW_GRID) * DRAW_GRID;

const isDrawTool = (tool: Tool): tool is DrawTool =>
  tool === "line" || tool === "rect" || tool === "circle" || tool === "arc";

/** Draw a symbol, or upload one, and mark where lines attach. */
export default function CustomSymbolDialog({
  open,
  mode,
  existing = null,
  saving,
  error,
  onSave,
  onClose,
}: CustomSymbolDialogProps) {
  const canvas = useRef<SVGSVGElement>(null);
  const [name, setName] = useState("");
  const [width, setWidth] = useState(60);
  const [height, setHeight] = useState(60);
  const [shapes, setShapes] = useState<SymbolShape[]>([]);
  const [ports, setPorts] = useState<SymbolPort[]>(defaultPorts(60, 60));
  const [tool, setTool] = useState<Tool>(mode === "draw" ? "line" : "point");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? "");
    setWidth(existing?.width ?? 60);
    setHeight(existing?.height ?? 60);
    setShapes(existing?.shapes ?? []);
    setPorts(existing?.ports ?? defaultPorts(60, 60));
    setTool(mode === "draw" ? "line" : "point");
    setText("");
    setImage(existing?.image_data ?? null);
    setNotice(null);
  }, [open, mode, existing]);

  const resize = (nextWidth: number, nextHeight: number) => {
    setPorts(resizePorts(ports, { width, height }, { width: nextWidth, height: nextHeight }));
    setWidth(nextWidth);
    setHeight(nextHeight);
  };

  const pointAt = (event: React.PointerEvent) => {
    const box = canvas.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: (event.clientX - box.left) / SCALE, y: (event.clientY - box.top) / SCALE };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    const point = pointAt(event);

    if (tool === "point") {
      const touched = ports.find(
        (port) => Math.hypot(port.x - point.x, port.y - point.y) < PORT_TOUCH_DISTANCE,
      );
      setPorts(
        touched
          ? ports.filter((port) => port !== touched)
          : [...ports, placePort(point.x, point.y, width, height, ports)],
      );
      return;
    }

    if (tool === "eraser") {
      const index = shapeIndexAt(shapes, point);
      if (index !== -1) setShapes(shapes.filter((_, position) => position !== index));
      return;
    }

    const snapped = { x: snap(point.x), y: snap(point.y) };
    if (tool === "text") {
      if (!text.trim()) return;
      setShapes([...shapes, { type: "text", x: snapped.x, y: snapped.y, text: text.trim(), size: 14 }]);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(snapped);
    setDragEnd(snapped);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragStart) return;
    const point = pointAt(event);
    setDragEnd({ x: snap(point.x), y: snap(point.y) });
  };

  const onPointerUp = () => {
    if (dragStart && dragEnd && isDrawTool(tool)) {
      const shape = shapeFromDrag(tool, dragStart, dragEnd);
      if (shape) setShapes([...shapes, shape]);
    }
    setDragStart(null);
    setDragEnd(null);
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const prepared = await prepareUpload(file);
      setImage(prepared.dataUrl);
      setNotice(
        prepared.pixelWidth && isLowResolution(prepared.pixelWidth, width)
          ? "This PNG is small, so it will look blurry on large printed sheets. An SVG stays sharp."
          : null,
      );
    } catch (uploadError) {
      setImage(null);
      setNotice((uploadError as Error).message);
    }
  };

  const preview = dragStart && dragEnd && isDrawTool(tool) ? shapeFromDrag(tool, dragStart, dragEnd) : null;
  const drawn = preview ? [...shapes, preview] : shapes;
  const hasArtwork = mode === "draw" ? shapes.length > 0 : !!image;
  const canSave = !!name.trim() && hasArtwork && ports.length > 0 && !saving;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="left-1/2 top-1/2 max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? `Edit ${existing.name}` : mode === "draw" ? "Draw a symbol" : "Upload a symbol"}
          </DialogTitle>
          <DialogDescription>
            Orange squares are where lines attach. Use the connection point tool to add or remove
            them.
            {existing && " Saving updates every diagram that uses this symbol."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_6rem_6rem] items-end gap-2">
          <Input
            label="Name"
            placeholder="e.g. Vacuum Breaker"
            value={name}
            error={error ?? undefined}
            onChange={(event) => setName(event.target.value)}
          />
          <Select
            label="Width"
            value={String(width)}
            onChange={(event) => resize(Number(event.target.value), height)}
            options={SYMBOL_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
          />
          <Select
            label="Height"
            value={String(height)}
            onChange={(event) => resize(width, Number(event.target.value))}
            options={SYMBOL_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
          />
        </div>

        {mode === "upload" && (
          <input
            type="file"
            aria-label="Symbol file"
            accept=".svg,.png,image/svg+xml,image/png"
            className="text-sm"
            onChange={(event) => void onFile(event)}
          />
        )}

        {notice && <p className="text-sm text-amber-700 dark:text-amber-400">{notice}</p>}

        <div className="flex flex-wrap items-center gap-1">
          {TOOLS.filter((item) => mode === "draw" || item.tool === "point").map(({ tool: option, label, Icon }) => (
            <Button
              key={option}
              type="button"
              size="icon"
              variant={tool === option ? "secondary" : "ghost"}
              aria-label={label}
              aria-pressed={tool === option}
              title={label}
              onClick={() => setTool(option)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
          {mode === "draw" && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Undo last shape"
              title="Undo last shape"
              disabled={shapes.length === 0}
              onClick={() => setShapes(shapes.slice(0, -1))}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          )}
          {tool === "text" && (
            <div className="ml-2 w-40 [&>div]:mb-0">
              <Input
                aria-label="Text to place"
                placeholder="Type, then click"
                className="!py-1.5 !text-sm"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <svg
            ref={canvas}
            role="application"
            aria-label="Drawing area"
            width={width * SCALE}
            height={height * SCALE}
            viewBox={`0 0 ${width} ${height}`}
            className="cursor-crosshair touch-none overflow-visible border border-neutral-300 bg-white text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <foreignObject width={width} height={height} className="pointer-events-none">
              <DrawingPreview shapes={drawn} image={image} width={width} height={height} />
            </foreignObject>
            {ports.map((port) => (
              <rect
                key={port.id}
                data-port={port.id}
                x={port.x - 2}
                y={port.y - 2}
                width={4}
                height={4}
                fill="#f26722"
              />
            ))}
          </svg>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() =>
              onSave({
                name: name.trim(),
                shapes: mode === "draw" ? shapes : [],
                image_data: mode === "upload" ? image : null,
                width,
                height,
                ports,
              })
            }
          >
            {existing ? "Save changes" : "Save to library"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Draws through the real symbol component, so what's shown here is what diagrams will show. */
function DrawingPreview({
  shapes,
  image,
  width,
  height,
}: {
  shapes: SymbolShape[];
  image: string | null;
  width: number;
  height: number;
}) {
  return (
    <DiagramSymbol
      symbolKey={customSymbolKey("preview")}
      geometry={{
        key: customSymbolKey("preview"),
        label: "Preview",
        width,
        height,
        shapes: image ? [{ type: "image", x: 0, y: 0, width, height, href: image }] : shapes,
        ports: [],
      }}
      className="block text-neutral-900 dark:text-neutral-100"
    />
  );
}
