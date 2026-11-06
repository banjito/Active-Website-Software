/**
 * The edits a diagram can take, as plain functions from one version of its contents to the
 * next. Undo and autosave both rest on this: undo goes back to an earlier version, and
 * saving writes the difference between two versions.
 */

import type {
  DiagramAsset,
  DiagramContents,
  DiagramLineRow,
  DiagramSymbolRow,
} from "@/lib/types/siteDiagrams";
import { drawnKeyFor } from "@/lib/diagrams/flowElements";
import { inheritedVoltage } from "@/lib/diagrams/voltage";
import {
  BUS_DEFAULT_WIDTH,
  BUS_TAP_SPACING,
  drawnSymbolKey,
  findPort,
  getSymbolGeometry,
  symbolKeyForEquipmentType,
} from "@/lib/diagrams/symbols";

/** Symbols snap to this. Every port on a symbol's center line lands on it too. */
export const GRID = 10;
export const snapToGrid = (value: number) => Math.round(value / GRID) * GRID;

export const BUS_MIN_WIDTH = BUS_TAP_SPACING * 2;

/** About one short word, so a label can't be squeezed into a column of single letters. */
export const LABEL_MIN_WIDTH = 40;

/** Feeders sit three taps apart, with two taps of bus left at each end. */
const FEEDER_TAP_SPACING = 3;
const FEEDER_END_TAPS = 2;
/** How far below its bus a feeder is placed. */
const FEEDER_DROP = 60;

/** The sub-assets that feed off a bus. CTs, relays and the like are placed by hand. */
const FEEDER_SYMBOLS = new Set<string>(["breaker", "switch"]);

export type SiteAsset = DiagramAsset & {
  parent_asset_id?: string | null;
  replaced_by_asset_id?: string | null;
};

type NewId = () => string;
const randomId: NewId = () => crypto.randomUUID();

const toDiagramAsset = (asset: SiteAsset): DiagramAsset => ({
  id: asset.id,
  identifier: asset.identifier,
  equipment_type: asset.equipment_type,
  site_id: asset.site_id,
  deleted_at: asset.deleted_at,
  status: asset.status,
});

const blankSymbol = (id: string, diagramId: string, x: number, y: number): DiagramSymbolRow => ({
  id,
  diagram_id: diagramId,
  asset_id: null,
  symbol_key: null,
  label: null,
  label_width: null,
  x,
  y,
  width: null,
  height: null,
  asset: null,
});

const blankLine = (
  id: string,
  diagramId: string,
  fromSymbol: string,
  fromPort: string,
  toSymbol: string,
  toPort: string,
): DiagramLineRow => ({
  id,
  diagram_id: diagramId,
  from_symbol_id: fromSymbol,
  to_symbol_id: toSymbol,
  from_port: fromPort,
  to_port: toPort,
  asset_id: null,
  voltage_volts: null,
  voltage_kind: "ac",
  label: null,
  asset: null,
});

const isTopPort = (port: string) => port.startsWith("top");
const isBottomPort = (port: string) => port.startsWith("bottom");
const isSidePort = (port: string) => port.startsWith("left") || port.startsWith("right");

/** The top left corner that centers a symbol on a point. */
function cornerFor(key: string, width: number | null, center: { x: number; y: number }) {
  const geometry = getSymbolGeometry(key, width);
  return {
    x: snapToGrid(center.x - geometry.width / 2),
    y: snapToGrid(center.y - geometry.height / 2),
  };
}

/** A symbol with no asset, such as a utility source. */
export function placeStandAlone(
  contents: DiagramContents,
  diagramId: string,
  symbolKey: string,
  center: { x: number; y: number },
  newId: NewId = randomId,
): DiagramContents {
  const { x, y } = cornerFor(symbolKey, null, center);
  return {
    ...contents,
    symbols: [...contents.symbols, { ...blankSymbol(newId(), diagramId, x, y), symbol_key: symbolKey }],
  };
}

/**
 * An asset. Gear comes in as a bus with its breakers already feeding off it, because that's
 * how a line-up is drawn and placing them one at a time is most of the work on a one-line.
 */
export function placeAsset(
  contents: DiagramContents,
  diagramId: string,
  asset: SiteAsset,
  center: { x: number; y: number },
  siteAssets: SiteAsset[],
  newId: NewId = randomId,
): DiagramContents {
  const onDiagram = new Set(contents.symbols.map((symbol) => symbol.asset_id));
  if (onDiagram.has(asset.id)) return contents;

  const symbolKey = symbolKeyForEquipmentType(asset.equipment_type);
  const feeders =
    symbolKey === "bus"
      ? siteAssets.filter(
          (child) =>
            child.parent_asset_id === asset.id &&
            !onDiagram.has(child.id) &&
            FEEDER_SYMBOLS.has(symbolKeyForEquipmentType(child.equipment_type)),
        )
      : [];

  const busWidth =
    symbolKey !== "bus"
      ? null
      : feeders.length > 0
        ? BUS_TAP_SPACING * (FEEDER_TAP_SPACING * (feeders.length - 1) + FEEDER_END_TAPS * 2)
        : BUS_DEFAULT_WIDTH;

  const { x, y } = cornerFor(drawnSymbolKey(symbolKey, asset.equipment_type), busWidth, center);
  const placed: DiagramSymbolRow = {
    ...blankSymbol(newId(), diagramId, x, y),
    asset_id: asset.id,
    asset: toDiagramAsset(asset),
    width: busWidth,
  };

  const symbols = [placed];
  const lines: DiagramLineRow[] = [];
  feeders.forEach((feeder, index) => {
    const tap = FEEDER_END_TAPS + FEEDER_TAP_SPACING * index;
    const geometry = getSymbolGeometry(
      drawnSymbolKey(symbolKeyForEquipmentType(feeder.equipment_type), feeder.equipment_type),
    );
    const row: DiagramSymbolRow = {
      ...blankSymbol(newId(), diagramId, x + BUS_TAP_SPACING * tap - geometry.width / 2, y + FEEDER_DROP),
      asset_id: feeder.id,
      asset: toDiagramAsset(feeder),
    };
    symbols.push(row);
    lines.push(blankLine(newId(), diagramId, placed.id, `bottom-${tap}`, row.id, "top"));
  });

  return {
    symbols: [...contents.symbols, ...symbols],
    lines: [...contents.lines, ...lines],
  };
}

export function moveSymbols(
  contents: DiagramContents,
  moves: Array<{ id: string; x: number; y: number }>,
): DiagramContents {
  const byId = new Map(moves.map((move) => [move.id, move]));
  let changed = false;
  const symbols = contents.symbols.map((symbol) => {
    const move = byId.get(symbol.id);
    if (!move) return symbol;
    const x = snapToGrid(move.x);
    const y = snapToGrid(move.y);
    if (x === symbol.x && y === symbol.y) return symbol;
    changed = true;
    return { ...symbol, x, y };
  });
  return changed ? { ...contents, symbols } : contents;
}

/** The highest tap in use, so a bus can't be shortened out from under its feeders. */
function busMinWidth(contents: DiagramContents, symbolId: string): number {
  let highestTap = 0;
  for (const line of contents.lines) {
    const ports = [
      line.from_symbol_id === symbolId ? line.from_port : "",
      line.to_symbol_id === symbolId ? line.to_port : "",
    ];
    for (const port of ports) {
      const tap = Number(/^(?:top|bottom)-(\d+)$/.exec(port)?.[1] ?? 0);
      highestTap = Math.max(highestTap, tap);
    }
  }
  return Math.max(BUS_MIN_WIDTH, (highestTap + 1) * BUS_TAP_SPACING);
}

/** Widths step by one tap, so a bus always ends a whole tap past its last feeder. */
export function resizeBus(contents: DiagramContents, symbolId: string, width: number): DiagramContents {
  const stepped = Math.round(width / BUS_TAP_SPACING) * BUS_TAP_SPACING;
  const next = Math.max(stepped, busMinWidth(contents, symbolId));
  return {
    ...contents,
    symbols: contents.symbols.map((symbol) =>
      symbol.id === symbolId ? { ...symbol, width: next } : symbol,
    ),
  };
}

export function setSymbolLabel(contents: DiagramContents, symbolId: string, label: string): DiagramContents {
  const next = label.trim() || null;
  const symbol = contents.symbols.find((row) => row.id === symbolId);
  if (!symbol || symbol.label === next) return contents;
  return {
    ...contents,
    symbols: contents.symbols.map((row) => (row.id === symbolId ? { ...row, label: next } : row)),
  };
}

/** Sets where a label wraps. Null puts it back on one line. */
export function setSymbolLabelWidth(
  contents: DiagramContents,
  symbolId: string,
  width: number | null,
): DiagramContents {
  const next = width === null ? null : Math.max(LABEL_MIN_WIDTH, snapToGrid(width));
  const symbol = contents.symbols.find((row) => row.id === symbolId);
  if (!symbol || symbol.label_width === next) return contents;
  return {
    ...contents,
    symbols: contents.symbols.map((row) => (row.id === symbolId ? { ...row, label_width: next } : row)),
  };
}

/**
 * Puts a symbol into an existing line, so one line becomes two with the symbol between them.
 * The upstream half keeps the original line, and with it the line's voltage and label.
 *
 * Only for lines that run bottom to top. A tie runs side to side, which a symbol with a top
 * and a bottom can't sit in, so those are left alone.
 */
export function insertIntoLine(
  contents: DiagramContents,
  diagramId: string,
  lineId: string,
  symbolId: string,
  newId: NewId = randomId,
): DiagramContents {
  const line = contents.lines.find((row) => row.id === lineId);
  const symbol = contents.symbols.find((row) => row.id === symbolId);
  const from = contents.symbols.find((row) => row.id === line?.from_symbol_id);
  const to = contents.symbols.find((row) => row.id === line?.to_symbol_id);
  if (!line || !symbol || !from || !to) return contents;
  if (!isBottomPort(line.from_port) || !isTopPort(line.to_port)) return contents;

  const portX = (row: DiagramSymbolRow, port: string) =>
    row.x + findPort(getSymbolGeometry(drawnKeyFor(row), row.width), port).x;
  const fromX = portX(from, line.from_port);
  const toX = portX(to, line.to_port);

  // A line with a bend has two upright runs, so the symbol joins the nearer one.
  const halfWidth = getSymbolGeometry(drawnKeyFor(symbol), symbol.width).width / 2;
  const center = symbol.x + halfWidth;
  const runX = Math.abs(center - fromX) <= Math.abs(center - toX) ? fromX : toX;

  return {
    symbols: contents.symbols.map((row) =>
      row.id === symbolId ? { ...row, x: snapToGrid(runX - halfWidth) } : row,
    ),
    lines: [
      ...contents.lines.map((row) =>
        row.id === lineId ? { ...row, to_symbol_id: symbolId, to_port: "top" } : row,
      ),
      {
        ...line,
        id: newId(),
        from_symbol_id: symbolId,
        from_port: "bottom",
      },
    ],
  };
}

/** Removing a symbol takes its lines with it, as the database does. */
export function deleteItems(
  contents: DiagramContents,
  symbolIds: string[],
  lineIds: string[],
): DiagramContents {
  const symbols = new Set(symbolIds);
  const lines = new Set(lineIds);
  return {
    symbols: contents.symbols.filter((symbol) => !symbols.has(symbol.id)),
    lines: contents.lines.filter(
      (line) =>
        !lines.has(line.id) && !symbols.has(line.from_symbol_id) && !symbols.has(line.to_symbol_id),
    ),
  };
}

export interface NewConnection {
  source: string;
  sourceHandle: string | null | undefined;
  target: string;
  targetHandle: string | null | undefined;
}

/**
 * Lines run from the bottom of one symbol to the top of another, so "from" is always the
 * upstream end, whichever end the user started dragging from. Side points are for ties and
 * only join other side points.
 */
export function connectSymbols(
  contents: DiagramContents,
  diagramId: string,
  connection: NewConnection,
  newId: NewId = randomId,
): { contents: DiagramContents } | { error: string } {
  const a = { symbol: connection.source, port: connection.sourceHandle ?? "" };
  const b = { symbol: connection.target, port: connection.targetHandle ?? "" };

  if (a.symbol === b.symbol) return { error: "A symbol can't connect to itself." };

  let from = a;
  let to = b;
  if (isTopPort(a.port) && isBottomPort(b.port)) {
    from = b;
    to = a;
  } else if (!(isBottomPort(a.port) && isTopPort(b.port)) && !(isSidePort(a.port) && isSidePort(b.port))) {
    return {
      error:
        isSidePort(a.port) || isSidePort(b.port)
          ? "Side points only connect to other side points."
          : "Connect the bottom of one symbol to the top of another.",
    };
  }

  const alreadyConnected = contents.lines.some(
    (line) =>
      (line.from_symbol_id === from.symbol &&
        line.from_port === from.port &&
        line.to_symbol_id === to.symbol &&
        line.to_port === to.port) ||
      (line.from_symbol_id === to.symbol &&
        line.from_port === to.port &&
        line.to_symbol_id === from.symbol &&
        line.to_port === from.port),
  );
  if (alreadyConnected) return { error: "Those points are already connected." };

  return {
    contents: {
      ...contents,
      lines: [
        ...contents.lines,
        {
          ...blankLine(newId(), diagramId, from.symbol, from.port, to.symbol, to.port),
          ...inheritedVoltage(contents, from.symbol, to.symbol),
        },
      ],
    },
  };
}

const SYMBOL_FIELDS = [
  "asset_id",
  "symbol_key",
  "label",
  "label_width",
  "x",
  "y",
  "width",
  "height",
] as const;
const LINE_FIELDS = [
  "from_symbol_id",
  "to_symbol_id",
  "from_port",
  "to_port",
  "asset_id",
  "voltage_volts",
  "voltage_kind",
  "label",
] as const;

export interface DiagramChanges {
  addedSymbols: DiagramSymbolRow[];
  changedSymbols: DiagramSymbolRow[];
  removedSymbolIds: string[];
  addedLines: DiagramLineRow[];
  changedLines: DiagramLineRow[];
  removedLineIds: string[];
}

function compareRows<Row extends { id: string }>(
  before: Row[],
  after: Row[],
  fields: ReadonlyArray<keyof Row>,
) {
  const beforeById = new Map(before.map((row) => [row.id, row]));
  const afterIds = new Set(after.map((row) => row.id));
  const added: Row[] = [];
  const changed: Row[] = [];
  for (const row of after) {
    const old = beforeById.get(row.id);
    if (!old) added.push(row);
    else if (fields.some((field) => old[field] !== row[field])) changed.push(row);
  }
  return { added, changed, removed: before.filter((row) => !afterIds.has(row.id)).map((row) => row.id) };
}

/** What has to be written to get the database from one version to the next. */
export function diffContents(before: DiagramContents, after: DiagramContents): DiagramChanges {
  const symbols = compareRows(before.symbols, after.symbols, SYMBOL_FIELDS);
  const lines = compareRows(before.lines, after.lines, LINE_FIELDS);
  return {
    addedSymbols: symbols.added,
    changedSymbols: symbols.changed,
    removedSymbolIds: symbols.removed,
    addedLines: lines.added,
    changedLines: lines.changed,
    removedLineIds: lines.removed,
  };
}

export const hasChanges = (changes: DiagramChanges) =>
  Object.values(changes).some((rows) => rows.length > 0);
