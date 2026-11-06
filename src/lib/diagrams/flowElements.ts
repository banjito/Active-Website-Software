/**
 * Turns saved diagram rows into what the diagram library draws.
 *
 * Kept apart from the components so the rules can be checked without a browser.
 */

import type { Edge, Node } from "@xyflow/react";
import type { DiagramContents, DiagramLineRow, DiagramSymbolRow } from "@/lib/types/siteDiagrams";
import {
  drawnSymbolKey,
  findPort,
  getSymbolGeometry,
  symbolKeyForEquipmentType,
  type SymbolGeometry,
  type SymbolPort,
} from "@/lib/diagrams/symbols";

export type PortSide = "top" | "bottom" | "left" | "right";

export interface DiagramNodePort extends SymbolPort {
  side: PortSide;
  /** Whether a line is attached. Points with no line stay hidden until they're needed. */
  used: boolean;
}

/** Why a symbol's asset can't be found where it should be. */
export type MissingReason = "deleted" | "moved" | "retired";

export type DiagramNodeData = {
  /** What it's drawn with. */
  symbolKey: string;
  /** What it does, which custom artwork never changes. */
  role: string;
  width: number | null;
  label: string;
  labelWidth: number | null;
  ports: DiagramNodePort[];
  editing: boolean;
  missing: MissingReason | null;
};

export type DiagramNode = Node<DiagramNodeData, "diagramSymbol">;

/** An item whose asset was permanently deleted has neither an asset nor a symbol of its own. */
const MISSING_ASSET_LABEL = "Missing asset";

/** A cable has to be easy to spot, and a link has to say what it is, even before naming. */
const DEFAULT_LABELS: Record<string, string> = { cable: "Cable", link: "Link" };

/** Not a brand color on purpose: this one means "something here needs fixing". */
const UPWARD_LINE_COLOR = "#d97706";

/** Which way a line leaves a port, so its first bend heads away from the symbol. */
function portSide(port: SymbolPort, geometry: SymbolGeometry): PortSide {
  if (port.y <= 0) return "top";
  if (port.y >= geometry.height) return "bottom";
  return port.x <= geometry.width / 2 ? "left" : "right";
}

/** A symbol's own key wins. Otherwise it follows the asset's equipment type. */
export function symbolKeyFor(symbol: DiagramSymbolRow): string {
  return symbol.symbol_key ?? symbolKeyForEquipmentType(symbol.asset?.equipment_type);
}

/** The artwork for a symbol at this site. */
export function drawnKeyFor(symbol: DiagramSymbolRow): string {
  return drawnSymbolKey(symbolKeyFor(symbol), symbol.asset?.equipment_type);
}

/** The asset's identifier always wins, so a rename shows up on every diagram. */
function labelFor(symbol: DiagramSymbolRow): string {
  if (symbol.asset) return symbol.asset.identifier;
  if (!symbol.asset_id && !symbol.symbol_key) return MISSING_ASSET_LABEL;
  return symbol.label ?? DEFAULT_LABELS[symbol.symbol_key ?? ""] ?? "";
}

/**
 * Symbols stay on the diagram when their asset goes away, so a gap in the one-line is flagged
 * rather than silently appearing. A stand-alone item never had an asset, so it can't be missing.
 */
export function missingReason(symbol: DiagramSymbolRow, siteId: string | null): MissingReason | null {
  if (!symbol.asset_id && symbol.symbol_key) return null;
  if (!symbol.asset || symbol.asset.deleted_at) return "deleted";
  if (siteId && symbol.asset.site_id !== siteId) return "moved";
  return symbol.asset.status === "retired" ? "retired" : null;
}

/** Power flows top to bottom, so a line whose load sits above its source is drawn wrong. */
function runsUpward(line: DiagramLineRow, symbolsById: Map<string, DiagramSymbolRow>): boolean {
  if (!line.from_port.startsWith("bottom")) return false;
  const from = symbolsById.get(line.from_symbol_id);
  const to = symbolsById.get(line.to_symbol_id);
  if (!from || !to) return false;
  const fromGeometry = getSymbolGeometry(drawnKeyFor(from), from.width);
  const toGeometry = getSymbolGeometry(drawnKeyFor(to), to.width);
  return (
    to.y + findPort(toGeometry, line.to_port).y < from.y + findPort(fromGeometry, line.from_port).y
  );
}

export function toFlowElements(
  { symbols, lines }: DiagramContents,
  {
    editing = false,
    siteId = null,
    archived = false,
  }: { editing?: boolean; siteId?: string | null; archived?: boolean } = {},
): {
  nodes: DiagramNode[];
  edges: Edge[];
} {
  // A saved line can name a port its symbol no longer has, such as a tap past the end of a
  // shortened bus. Those are added back, or the library would silently drop the line.
  const portsInUse = new Map<string, Set<string>>();
  const usePort = (symbolId: string, portId: string) => {
    if (!portsInUse.has(symbolId)) portsInUse.set(symbolId, new Set());
    portsInUse.get(symbolId)?.add(portId);
  };
  for (const line of lines) {
    usePort(line.from_symbol_id, line.from_port);
    usePort(line.to_symbol_id, line.to_port);
  }

  const nodes = symbols.map((symbol): DiagramNode => {
    const symbolKey = drawnKeyFor(symbol);
    const geometry = getSymbolGeometry(symbolKey, symbol.width);
    const known = new Set(geometry.ports.map((port) => port.id));
    const inUse = portsInUse.get(symbol.id) ?? new Set<string>();
    const fallbacks = [...inUse].filter((id) => !known.has(id)).map((id) => findPort(geometry, id));

    return {
      id: symbol.id,
      type: "diagramSymbol",
      position: { x: symbol.x, y: symbol.y },
      data: {
        symbolKey,
        role: symbolKeyFor(symbol),
        width: symbol.width,
        label: labelFor(symbol),
        labelWidth: symbol.label_width,
        ports: [...geometry.ports, ...fallbacks].map((port) => ({
          ...port,
          side: portSide(port, geometry),
          used: inUse.has(port.id),
        })),
        editing,
        // An archive shows the system as it was, so what happened since isn't a problem.
        missing: archived ? null : missingReason(symbol, siteId),
      },
    };
  });

  const symbolsById = new Map(symbols.map((symbol) => [symbol.id, symbol]));

  const edges = lines.map((line): Edge => {
    const warn = editing && runsUpward(line, symbolsById);
    return {
      id: line.id,
      source: line.from_symbol_id,
      target: line.to_symbol_id,
      sourceHandle: line.from_port,
      targetHandle: line.to_port,
      type: "step",
      // The square cap runs each end slightly into its symbol, which closes a hairline gap.
      style: warn
        ? { stroke: UPWARD_LINE_COLOR, strokeWidth: 2, strokeDasharray: "6 4" }
        : { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "square" },
    };
  });

  return { nodes, edges };
}
