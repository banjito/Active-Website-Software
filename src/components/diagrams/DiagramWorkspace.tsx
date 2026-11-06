import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  useNodesInitialized,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { Info, Trash2, WrapText } from "lucide-react";
import { toast } from "react-hot-toast";
import DiagramAddPanel, {
  CABLE_DRAG_TYPE,
  DRAG_TYPE,
  type DiagramAddItem,
} from "@/components/diagrams/DiagramAddPanel";
import DiagramCanvas from "@/components/diagrams/DiagramCanvas";
import DiagramSearch from "@/components/diagrams/DiagramSearch";
import DiagramColorKey, { type ColorKeyItem } from "@/components/diagrams/DiagramColorKey";
import DiagramDetailsPanel, {
  symbolTypeName,
  type DiagramDetailsActions,
} from "@/components/diagrams/DiagramDetailsPanel";
import { DiagramNodeActions } from "@/components/diagrams/DiagramSymbolNode";
import DiagramTaskbar, { type DiagramTaskbarProps } from "@/components/diagrams/DiagramTaskbar";
import { useDiagramEditor } from "@/components/diagrams/useDiagramEditor";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  connectSymbols,
  deleteItems,
  insertIntoLine,
  moveSymbols,
  placeAsset,
  placeStandAlone,
  resizeBus,
  setSymbolLabel,
  setSymbolLabelWidth,
  type DiagramChanges,
  type SiteAsset,
} from "@/lib/diagrams/editing";
import {
  drawnKeyFor,
  missingReason,
  symbolKeyFor,
  toFlowElements,
  type DiagramNode,
} from "@/lib/diagrams/flowElements";
import { findLinks, type DiagramLinkRow, type DiagramLinkTarget } from "@/lib/diagrams/links";
import { STATUS_STYLES, statusStyleFor } from "@/lib/diagrams/reportStatus";
import type { DiagramSearchItem } from "@/lib/diagrams/search";
import { getSymbolGeometry } from "@/lib/diagrams/symbols";
import {
  formatVoltage,
  levelsInUse,
  lineColor,
  linesToLabel,
  parseVoltage,
  setLineVoltage,
  symbolTints,
  voltageCss,
  type VoltageColors,
} from "@/lib/diagrams/voltage";
import type { EquipmentAsset } from "@/lib/types/assetTracking";
import type { DiagramAsset, DiagramContents, SiteDiagram } from "@/lib/types/siteDiagrams";

const SELECTED_LINE_COLOR = "#f26722";
const OPEN_SYMBOL_CLASS = "outline outline-2 outline-brand";

export type DiagramColorMode = "off" | "voltage" | "status";

const COLOR_MODE_OPTIONS = [
  { value: "off", label: "No color" },
  { value: "voltage", label: "Voltage" },
  { value: "status", label: "Report status" },
];

/** What the page needs from the open diagram. */
export interface DiagramWorkspaceHandle {
  flush: () => Promise<void>;
  refreshAsset: (asset: DiagramAsset) => void;
  swapAsset: (oldAssetId: string, asset: DiagramAsset) => void;
  getContents: () => DiagramContents;
}

type TaskbarBase = Omit<DiagramTaskbarProps, "canZoom" | "editTools" | "viewTools" | "children">;

interface DiagramWorkspaceProps {
  siteId: string;
  diagramId: string;
  initial: DiagramContents;
  siteAssets: SiteAsset[];
  taskbar: TaskbarBase;
  onSave: (changes: DiagramChanges) => Promise<void>;
  details: DiagramDetailsActions;
  workspaceRef: React.MutableRefObject<DiagramWorkspaceHandle | null>;
  /** Linkable symbols on every diagram at the site, as last saved. */
  linkRows: DiagramLinkRow[];
  onJump: (target: DiagramLinkTarget) => void;
  /** The symbol to open centered on, after following a link here. */
  focusSymbolId: string | null;
  voltageColors: VoltageColors;
  colorMode: DiagramColorMode;
  onColorModeChange: (mode: DiagramColorMode) => void;
  /** Read-only, and shown as the system was, with nothing flagged or dimmed. */
  archived: boolean;
  /** Offered on an archive, to start a new diagram from it. */
  onCopyArchive?: () => void;
}

/** The line under a point on screen, if any. */
function lineAt(x: number, y: number): string | null {
  for (const element of document.elementsFromPoint(x, y)) {
    const line = element.closest(".react-flow__edge");
    if (line) return line.getAttribute("data-id");
  }
  return null;
}

/** A typed label saves when the field is left, so one rename is one undo step. */
function LabelField({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (label: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <div className="w-56">
      <Input
        aria-label="Label"
        placeholder={placeholder}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </div>
  );
}

/** Typing a voltage fills the whole section, so it saves when the field is left. */
function VoltageField({
  volts,
  kind,
  onCommit,
}: {
  volts: number | null;
  kind: "ac" | "dc";
  onCommit: (volts: number | null, kind: "ac" | "dc") => void;
}) {
  const [draft, setDraft] = useState(formatVoltage(volts));
  useEffect(() => setDraft(formatVoltage(volts)), [volts]);

  const commit = () => {
    const parsed = parseVoltage(draft);
    if (parsed === undefined) {
      toast.error("Enter a voltage like 480 or 13.8 kV.");
      setDraft(formatVoltage(volts));
      return;
    }
    onCommit(parsed, kind);
  };

  return (
    <>
      <div className="w-36 [&>div]:mb-0">
        <Input
          aria-label="Voltage"
          placeholder="Voltage"
          className="!py-1.5 !text-sm"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </div>
      <div className="w-20">
        <Select
          aria-label="AC or DC"
          size="sm"
          value={kind}
          onChange={(event) => onCommit(volts, event.target.value as "ac" | "dc")}
          options={[
            { value: "ac", label: "AC" },
            { value: "dc", label: "DC" },
          ]}
        />
      </div>
    </>
  );
}

/** One open diagram. Remounted per diagram, so each starts fitted to the window. */
export default function DiagramWorkspace({
  siteId,
  diagramId,
  initial,
  siteAssets,
  taskbar,
  onSave,
  details,
  workspaceRef,
  linkRows,
  onJump,
  focusSymbolId,
  voltageColors,
  colorMode,
  onColorModeChange,
  archived,
  onCopyArchive,
}: DiagramWorkspaceProps) {
  const { editing } = taskbar;
  const editor = useDiagramEditor(initial, onSave);
  const { contents, apply, undo, redo, flush, refreshAsset, swapAsset, getContents } = editor;
  const { screenToFlowPosition, deleteElements, setCenter } = useReactFlow();
  const nodesReady = useNodesInitialized();

  const [addPanelOpen, setAddPanelOpen] = useState(false);
  /** The line a dragged cable would join if it were dropped now. */
  const [dropLineId, setDropLineId] = useState<string | null>(null);
  /** The symbol whose details are showing. */
  const [openSymbolId, setOpenSymbolId] = useState<string | null>(null);
  /** The symbol a link led to, marked until the user clicks away. */
  const [arrivedAt, setArrivedAt] = useState(focusSymbolId);
  const centered = useRef(false);
  const [coloring, setColoring] = useState(false);
  /** Null until they've been loaded. */
  const [statuses, setStatuses] = useState<Map<string, string> | null>(null);
  const [nodes, setNodes] = useState<DiagramNode[]>(
    () => toFlowElements(initial, { editing, siteId, archived }).nodes,
  );
  const [edges, setEdges] = useState<Edge[]>(
    () => toFlowElements(initial, { editing, siteId, archived }).edges,
  );
  const rendered = useRef({ contents: initial, editing });

  useEffect(() => {
    workspaceRef.current = { flush, refreshAsset, swapAsset, getContents };
    return () => {
      workspaceRef.current = null;
    };
  }, [flush, refreshAsset, swapAsset, getContents, workspaceRef]);

  const placedAssetIds = useMemo(
    () => contents.symbols.flatMap((symbol) => (symbol.asset_id ? [symbol.asset_id] : [])),
    [contents.symbols],
  );
  const placedKey = placedAssetIds.join(",");

  // Loaded only when asked for, and again when assets are added while it's on.
  const { loadStatuses } = details;
  useEffect(() => {
    if (colorMode !== "status") return;
    let cancelled = false;
    loadStatuses(placedKey ? placedKey.split(",") : [])
      .then((loaded) => {
        if (!cancelled) setStatuses(loaded);
      })
      .catch((error) => {
        console.error("Failed to load report statuses:", error);
        if (cancelled) return;
        toast.error("Report status couldn't be loaded.");
        onColorModeChange("off");
      });
    return () => {
      cancelled = true;
    };
  }, [colorMode, placedKey, loadStatuses, onColorModeChange]);

  // Waits for the symbols to be measured, or there's nothing to center on yet.
  const focusSymbol = initial.symbols.find((symbol) => symbol.id === focusSymbolId);
  useEffect(() => {
    if (!focusSymbol || !nodesReady || centered.current) return;
    centered.current = true;
    const { width, height } = getSymbolGeometry(drawnKeyFor(focusSymbol), focusSymbol.width);
    void setCenter(focusSymbol.x + width / 2, focusSymbol.y + height / 2, { zoom: 1 });
  }, [focusSymbol, nodesReady, setCenter]);

  // Esc closes the panel, unless a dialog opened from it is on top and takes the key first.
  useEffect(() => {
    if (!openSymbolId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[role="dialog"]')) setOpenSymbolId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSymbolId]);

  // Saved rows are the truth. What the library adds to a node, such as its measured size and
  // whether it's selected, is carried over so an edit doesn't make everything redraw.
  // Nothing has changed on opening, so that first run is skipped.
  useEffect(() => {
    if (rendered.current.contents === contents && rendered.current.editing === editing) return;
    rendered.current = { contents, editing };

    const next = toFlowElements(contents, { editing, siteId, archived });
    setNodes((current) => {
      const byId = new Map(current.map((node) => [node.id, node]));
      return next.nodes.map((node) => {
        const existing = byId.get(node.id);
        if (!existing) return node;
        return {
          ...existing,
          position: node.position,
          data: node.data,
          // Stretching a bus leaves its raw size here. The saved width replaces it.
          width: undefined,
          height: undefined,
          selected: editing && existing.selected,
        };
      });
    });
    setEdges((current) => {
      const selected = new Set(current.filter((edge) => editing && edge.selected).map((edge) => edge.id));
      return next.edges.map((edge) => ({ ...edge, selected: selected.has(edge.id) }));
    });
  }, [contents, editing, siteId, archived]);

  useEffect(() => {
    if (!editing) setAddPanelOpen(false);
  }, [editing]);

  // Undo and redo from the keyboard, unless the user is typing in a field.
  useEffect(() => {
    if (!editing) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, undo, redo]);

  const onNodesChange = useCallback(
    (changes: NodeChange<DiagramNode>[]) => setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((current) => applyEdgeChanges(changes, current)),
    [],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      let problem: string | null = null;
      apply((current) => {
        const result = connectSymbols(current, diagramId, connection);
        if ("error" in result) {
          problem = result.error;
          return current;
        }
        return result.contents;
      });
      if (problem) toast.error(problem);
    },
    [apply, diagramId],
  );

  /** `lineId` is the line a cable was dropped on, which it then joins. */
  const addAt = useCallback(
    (item: DiagramAddItem, center: { x: number; y: number }, lineId?: string | null) => {
      const asset = item.kind === "asset" ? siteAssets.find((row) => row.id === item.assetId) : null;
      if (item.kind === "asset" && !asset) return;

      apply((current) => {
        const placed = asset
          ? placeAsset(current, diagramId, asset, center, siteAssets)
          : placeStandAlone(current, diagramId, (item as { symbolKey: string }).symbolKey, center);
        if (placed === current || !lineId) return placed;
        return insertIntoLine(placed, diagramId, lineId, placed.symbols[placed.symbols.length - 1].id);
      });
    },
    [apply, diagramId, siteAssets],
  );

  const addToMiddle = (item: DiagramAddItem) =>
    addAt(item, screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));

  const onDragOver = (event: React.DragEvent) => {
    const { types } = event.dataTransfer;
    if (!types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropLineId(types.includes(CABLE_DRAG_TYPE) ? lineAt(event.clientX, event.clientY) : null);
  };

  const onDrop = (event: React.DragEvent) => {
    const raw = event.dataTransfer.getData(DRAG_TYPE);
    setDropLineId(null);
    if (!raw) return;
    event.preventDefault();
    const isCable = event.dataTransfer.types.includes(CABLE_DRAG_TYPE);
    addAt(
      JSON.parse(raw),
      screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      isCable ? lineAt(event.clientX, event.clientY) : null,
    );
  };

  // Saved rows for the other diagrams, and this one as it stands, so a link appears the moment
  // an asset is placed or a link is named.
  const links = useMemo(() => {
    if (archived) return new Map<string, DiagramLinkTarget[]>();
    const here = contents.symbols.map((symbol): DiagramLinkRow => ({
      id: symbol.id,
      diagram_id: diagramId,
      asset_id: symbol.asset_id,
      symbol_key: symbol.symbol_key,
      label: symbol.label,
      asset: symbol.asset,
    }));
    return findLinks([...linkRows.filter((row) => row.diagram_id !== diagramId), ...here], taskbar.diagrams);
  }, [contents.symbols, diagramId, linkRows, taskbar.diagrams, archived]);

  const statusClasses = useMemo(() => {
    const classes = new Map<string, string>();
    if (colorMode !== "status" || !statuses) return classes;
    for (const symbol of contents.symbols) {
      const style = statusStyleFor(symbol.asset_id ? statuses.get(symbol.asset_id) : null);
      if (style) classes.set(symbol.id, style.symbolClass);
    }
    return classes;
  }, [colorMode, statuses, contents.symbols]);

  const tints = useMemo(
    () => (colorMode === "voltage" ? symbolTints(contents, voltageColors) : new Map()),
    [colorMode, contents, voltageColors],
  );

  const { jobAssetIds } = details;
  const dimmed = useMemo(
    () =>
      new Set(
        archived
          ? []
          : contents.symbols
              .filter(
                (symbol) =>
                  symbol.asset?.status === "not_in_use" ||
                  (jobAssetIds && symbol.asset_id && !jobAssetIds.has(symbol.asset_id)),
              )
              .map((symbol) => symbol.id),
      ),
    [contents.symbols, jobAssetIds, archived],
  );

  const searchItems = useMemo(() => {
    const nameOf = (id: string) => taskbar.diagrams.find((row) => row.id === id)?.name ?? "";
    const here = contents.symbols.map((symbol): DiagramSearchItem => ({
      symbolId: symbol.id,
      diagramId,
      diagramName: nameOf(diagramId),
      name: symbol.asset?.identifier ?? symbol.label ?? "",
    }));
    const elsewhere = linkRows
      .filter((row) => row.diagram_id !== diagramId)
      .map((row): DiagramSearchItem => ({
        symbolId: row.id,
        diagramId: row.diagram_id,
        diagramName: nameOf(row.diagram_id),
        name: row.asset?.identifier ?? row.label ?? "",
      }));
    return [...here, ...elsewhere].filter((item) => item.name);
  }, [contents.symbols, diagramId, linkRows, taskbar.diagrams]);

  const goToSearchResult = (item: DiagramSearchItem) => {
    if (item.diagramId !== diagramId) {
      onJump({ diagramId: item.diagramId, diagramName: item.diagramName, symbolId: item.symbolId });
      return;
    }
    const symbol = contents.symbols.find((row) => row.id === item.symbolId);
    if (!symbol) return;
    const { width, height } = getSymbolGeometry(drawnKeyFor(symbol), symbol.width);
    void setCenter(symbol.x + width / 2, symbol.y + height / 2, { zoom: 1, duration: 300 });
    setArrivedAt(symbol.id);
  };

  const nodeActions = useMemo(
    () => ({
      links,
      onJump,
      statusClasses,
      dimmed,
      tints,
      onBusResized: (symbolId: string, width: number) => {
        apply((current) => resizeBus(current, symbolId, width));
        // The library keeps the raw stretched size, even when the saved width didn't change.
        setNodes((current) =>
          current.map((node) =>
            node.id === symbolId ? { ...node, width: undefined, height: undefined } : node,
          ),
        );
      },
      onLabelResized: (symbolId: string, width: number) =>
        apply((current) => setSymbolLabelWidth(current, symbolId, width)),
    }),
    [apply, links, onJump, statusClasses, dimmed, tints],
  );

  const placeable = useMemo(() => {
    const onDiagram = new Set(contents.symbols.map((symbol) => symbol.asset_id));
    return siteAssets.filter((asset) => !onDiagram.has(asset.id) && asset.status !== "retired");
  }, [contents.symbols, siteAssets]);

  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedEdges = edges.filter((edge) => edge.selected);
  const selectedCount = selectedNodes.length + selectedEdges.length;
  const onlySymbol =
    selectedCount === 1 && selectedNodes.length === 1
      ? contents.symbols.find((symbol) => symbol.id === selectedNodes[0].id)
      : undefined;

  const onlyLine =
    selectedCount === 1 && selectedEdges.length === 1
      ? contents.lines.find((line) => line.id === selectedEdges[0].id)
      : undefined;

  const openSymbol = contents.symbols.find((symbol) => symbol.id === openSymbolId);

  const shownNodes = useMemo(
    () =>
      nodes.map((node) =>
        node.id === openSymbolId || node.id === arrivedAt
          ? { ...node, className: OPEN_SYMBOL_CLASS }
          : node,
      ),
    [nodes, openSymbolId, arrivedAt],
  );

  const shownEdges = useMemo(() => {
    const byVoltage = colorMode === "voltage";
    const labelled = byVoltage ? linesToLabel(contents) : new Set<string>();
    const lines = new Map(contents.lines.map((line) => [line.id, line]));

    return edges.map((edge): Edge => {
      const line = lines.get(edge.id);
      const highlighted = edge.selected || edge.id === dropLineId;
      // The warning for an upward line stays, because it means there's something to fix.
      const stroke = highlighted
        ? SELECTED_LINE_COLOR
        : byVoltage && line && !edge.style?.strokeDasharray
          ? voltageCss(lineColor(line, voltageColors))
          : edge.style?.stroke;

      return {
        ...edge,
        style: { ...edge.style, stroke },
        ...(line && labelled.has(line.id)
          ? {
              label: formatVoltage(line.voltage_volts, line.voltage_kind),
              labelStyle: { fill: "currentColor", fontSize: 11, fontWeight: 600 },
              labelBgStyle: { fill: "var(--diagram-canvas, white)" },
              labelBgPadding: [4, 2] as [number, number],
            }
          : {}),
      };
    });
  }, [edges, dropLineId, colorMode, contents, voltageColors]);

  const colorKey = useMemo((): ColorKeyItem[] => {
    if (colorMode === "voltage") {
      return levelsInUse(contents).map((level) => ({
        label: level.label,
        color: voltageCss(voltageColors[level.key]),
      }));
    }
    if (colorMode === "status" && statuses) {
      const shown = new Set(placedAssetIds.flatMap((id) => statuses.get(id) ?? []));
      const items: ColorKeyItem[] = STATUS_STYLES.filter((style) => shown.has(style.status));
      return placedAssetIds.some((id) => !statuses.has(id))
        ? [...items, { label: "No report", swatchClass: "bg-neutral-900 dark:bg-neutral-100" }]
        : items;
    }
    return [];
  }, [colorMode, contents, voltageColors, statuses, placedAssetIds]);

  return (
    <DiagramNodeActions.Provider value={nodeActions}>
      <div
        className="h-full w-full"
        onDragOver={onDragOver}
        onDragLeave={() => setDropLineId(null)}
        onDrop={onDrop}
      >
        <DiagramCanvas
          nodes={shownNodes}
          edges={shownEdges}
          editing={editing}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          // While editing, a click selects. The panel only follows along once it's open.
          onSymbolClick={(symbolId) => {
            if (!editing || openSymbolId) setOpenSymbolId(symbolId);
          }}
          onBackgroundClick={() => {
            setOpenSymbolId(null);
            setArrivedAt(null);
          }}
          fitOnOpen={!focusSymbol}
          onDelete={({ nodes: gone, edges: goneEdges }) =>
            apply((current) =>
              deleteItems(
                current,
                gone.map((node) => node.id),
                goneEdges.map((edge) => edge.id),
              ),
            )
          }
          onMoved={(moved) =>
            apply((current) =>
              moveSymbols(
                current,
                moved.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })),
              ),
            )
          }
        />
      </div>

      {contents.symbols.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-neutral-500 dark:text-neutral-400">
          {editing ? "Click Add to bring in assets and symbols." : "This diagram is empty."}
        </p>
      )}

      <DiagramColorKey
        title={colorMode === "voltage" ? "Voltage key" : "Report status key"}
        items={colorKey}
      />

      <DiagramTaskbar
        {...taskbar}
        canZoom={contents.symbols.length > 0}
        viewTools={
          <>
            {archived && onCopyArchive && (
              <Button type="button" variant="outline" size="sm" onClick={onCopyArchive}>
                Copy to new diagram
              </Button>
            )}
            <DiagramSearch items={searchItems} activeDiagramId={diagramId} onPick={goToSearchResult} />
            <div className="w-36">
              <Select
                aria-label="Color by"
                size="sm"
                value={colorMode}
                onChange={(event) => onColorModeChange(event.target.value as DiagramColorMode)}
                options={COLOR_MODE_OPTIONS}
              />
            </div>
          </>
        }
        editTools={{
          status: editor.status,
          canUndo: editor.canUndo,
          canRedo: editor.canRedo,
          addPanelOpen,
          onUndo: undo,
          onRedo: redo,
          onRetrySave: () => void flush(),
          onToggleAddPanel: () => setAddPanelOpen((isOpen) => !isOpen),
        }}
      >
        {selectedCount > 0 && (
          <>
            {onlySymbol && !onlySymbol.asset && (
              <LabelField
                key={onlySymbol.id}
                value={onlySymbol.label ?? ""}
                placeholder={
                  onlySymbol.symbol_key === "link" ? "Same name as on the other diagram" : "Label"
                }
                onCommit={(label) => apply((current) => setSymbolLabel(current, onlySymbol.id, label))}
              />
            )}
            {onlyLine && (
              <VoltageField
                key={onlyLine.id}
                volts={onlyLine.voltage_volts}
                kind={onlyLine.voltage_kind}
                onCommit={(volts, kind) =>
                  apply((current) => setLineVoltage(current, onlyLine.id, volts, kind))
                }
              />
            )}
            {onlySymbol && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leftIcon={<Info className="h-4 w-4" />}
                onClick={() => setOpenSymbolId(onlySymbol.id)}
              >
                Details
              </Button>
            )}
            {onlySymbol?.label_width && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leftIcon={<WrapText className="h-4 w-4" />}
                onClick={() => apply((current) => setSymbolLabelWidth(current, onlySymbol.id, null))}
              >
                Unwrap label
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() =>
                void deleteElements({
                  nodes: selectedNodes.map((node) => ({ id: node.id })),
                  edges: selectedEdges.map((edge) => ({ id: edge.id })),
                })
              }
            >
              Remove from diagram
            </Button>
          </>
        )}
      </DiagramTaskbar>

      {openSymbol && (
        <DiagramDetailsPanel
          symbol={openSymbol}
          asset={
            (siteAssets.find((asset) => asset.id === openSymbol.asset_id) as
              | EquipmentAsset
              | undefined) ?? null
          }
          symbolName={openSymbol.label ?? symbolTypeName(symbolKeyFor(openSymbol))}
          missing={archived ? null : missingReason(openSymbol, siteId)}
          replacedBy={
            siteAssets.find(
              (asset) =>
                asset.id ===
                siteAssets.find((row) => row.id === openSymbol.asset_id)?.replaced_by_asset_id,
            )?.identifier ?? null
          }
          replaces={
            siteAssets.find(
              (asset) => openSymbol.asset_id && asset.replaced_by_asset_id === openSymbol.asset_id,
            )?.identifier ?? null
          }
          actions={details}
          onClose={() => setOpenSymbolId(null)}
        />
      )}

      {editing && addPanelOpen && (
        <DiagramAddPanel assets={placeable} onAdd={addToMiddle} onClose={() => setAddPanelOpen(false)} />
      )}
    </DiagramNodeActions.Provider>
  );
}
