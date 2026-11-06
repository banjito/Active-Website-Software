/**
 * Single-line diagram symbol checks. No database, no network.
 *
 *   node --import ./scripts/ts-alias-loader.mjs scripts/diagram-symbols-regression.ts
 */
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DiagramSymbol from "../src/components/diagrams/DiagramSymbol";
import {
  LABEL_MIN_WIDTH,
  connectSymbols,
  deleteItems,
  diffContents,
  hasChanges,
  insertIntoLine,
  moveSymbols,
  placeAsset,
  placeStandAlone,
  resizeBus,
  setSymbolLabel,
  setSymbolLabelWidth,
  snapToGrid,
} from "../src/lib/diagrams/editing";
import { assetStatusLabel, hiddenByDefault } from "../src/lib/assetStatus";
import {
  archivableAssets,
  buildArchiveSnapshot,
  copyContents,
  readArchiveSnapshot,
} from "../src/lib/diagrams/archive";
import { assetDetailRows, reportLink } from "../src/lib/diagrams/assetDetails";
import { buildSiteOverview, findLinks, placementsByAsset, type DiagramLinkRow } from "../src/lib/diagrams/links";
import {
  choiceRows,
  cleanSymbolChoices,
  isLowResolution,
  placePort,
  resizePorts,
  shapeFromDrag,
  shapeIndexAt,
  toGeometry,
  uploadProblem,
  type CustomSymbolRow,
} from "../src/lib/diagrams/customSymbols";
import { missingReason, toFlowElements } from "../src/lib/diagrams/flowElements";
import { statusByAsset, statusStyleFor } from "../src/lib/diagrams/reportStatus";
import { contentFingerprint, nextRevision } from "../src/lib/diagrams/revision";
import {
  ARCH_SIZES,
  MIN_TEXT_SIZE,
  estimateTextWidth,
  hexToRgb,
  linePath,
  planSheet,
  shapePath,
  smallestReadableSize,
  wrapText,
  type Sheet,
  type SheetInput,
} from "../src/lib/diagrams/sheet";
import { searchSymbols } from "../src/lib/diagrams/search";
import {
  BUILT_IN_VOLTAGE_COLORS,
  cleanVoltageColors,
  formatVoltage,
  levelsInUse,
  lineColor,
  linesToLabel,
  parseVoltage,
  setLineVoltage,
  symbolTints,
  voltageCss,
  voltageLevel,
  voltageSection,
} from "../src/lib/diagrams/voltage";
import { ASSET_TEMPLATE_SLUGS, assetFieldsOf, getReportAssetProfile } from "../src/lib/reportAssetProfiles";
import { builtInReadings, builtInReportDate, cleanUnit, humanizeKey, reportTypeName } from "../src/lib/trends/builtInReadings";
import { matchKey, readingNumber, type TrendEntry } from "../src/lib/trends/readings";
import { buildLineTrend, buildTrendLines, fieldsOn, firstLines, groupLines } from "../src/lib/trends/trendLines";
import { customFormReadings, isResultsSection } from "../src/lib/customForms/assetTrends";
import { rowStateKey } from "../src/lib/customForms/runtime/layout";
import type { EquipmentAsset } from "../src/lib/types/assetTracking";
import type { DiagramAsset, DiagramLineRow, DiagramSymbolRow } from "../src/lib/types/siteDiagrams";
import {
  BUILT_IN_SYMBOL_KEYS,
  BUS_DEFAULT_WIDTH,
  BUS_TAP_SPACING,
  drawnSymbolKey,
  findPort,
  getSymbolGeometry,
  placeableCustomSymbols,
  setActiveSymbols,
  symbolKeyForEquipmentType,
  type SymbolShape,
} from "../src/lib/diagrams/symbols";

let passed = 0;
const failures: string[] = [];

function check(name: string, run: () => void) {
  try {
    run();
    passed += 1;
  } catch (error) {
    failures.push(`${name}: ${(error as Error).message}`);
  }
}

const portIds = (key: string) => getSymbolGeometry(key).ports.map((port) => port.id);

for (const key of BUILT_IN_SYMBOL_KEYS) {
  const geometry = getSymbolGeometry(key);

  check(`${key} resolves to itself`, () => assert.equal(geometry.key, key));

  check(`${key} has something to draw`, () => assert.ok(geometry.shapes.length > 0));

  check(`${key} port ids are unique`, () =>
    assert.equal(new Set(portIds(key)).size, geometry.ports.length),
  );

  check(`${key} ports sit inside the symbol`, () => {
    for (const port of geometry.ports) {
      assert.ok(port.x >= 0 && port.x <= geometry.width, `${port.id} x`);
      assert.ok(port.y >= 0 && port.y <= geometry.height, `${port.id} y`);
    }
  });

  check(`${key} has a width that keeps its center on the 10 unit grid`, () =>
    assert.equal((geometry.width / 2) % 10, 0),
  );

  check(`${key} renders with no fixed color and no rounded corners`, () => {
    const html = renderToStaticMarkup(React.createElement(DiagramSymbol, { symbolKey: key }));
    assert.ok(html.includes("currentColor"));
    assert.ok(!/\b(rx|ry)=/.test(html));
    assert.ok(!/#[0-9a-f]{3,6}\b/i.test(html));
  });
}

// Power flows top to bottom.
for (const key of ["utility", "generator"]) {
  check(`${key} is a source, so it only connects at the bottom`, () =>
    assert.deepEqual(portIds(key), ["bottom"]),
  );
}
for (const key of ["motor", "load"]) {
  check(`${key} is a load, so it only connects at the top`, () =>
    assert.deepEqual(portIds(key), ["top"]),
  );
}
for (const key of ["transformer", "breaker", "switch", "fuse", "cable", "link", "ats", "ups", "panel", "mcc", "generic"]) {
  check(`${key} connects at the top and bottom`, () => {
    assert.ok(portIds(key).includes("top"));
    assert.ok(portIds(key).includes("bottom"));
  });
}

check("a breaker has side points for ties", () => {
  assert.ok(portIds("breaker").includes("left"));
  assert.ok(portIds("breaker").includes("right"));
});

check("an ATS takes two sources", () => assert.ok(portIds("ats").includes("top-emergency")));

check("a bus has taps on both sides, plus both ends", () => {
  const ids = portIds("bus");
  for (const id of ["left", "right", "top-1", "bottom-1"]) assert.ok(ids.includes(id), id);
});

check("a bus uses its default width when none is saved", () =>
  assert.equal(getSymbolGeometry("bus").width, BUS_DEFAULT_WIDTH),
);

check("widening a bus adds taps and leaves existing taps in place", () => {
  const short = getSymbolGeometry("bus", 200);
  const long = getSymbolGeometry("bus", 400);
  assert.ok(long.ports.length > short.ports.length);
  assert.deepEqual(findPort(long, "bottom-3"), findPort(short, "bottom-3"));
  assert.equal(findPort(long, "bottom-3").x, 3 * BUS_TAP_SPACING);
});

check("no tap sits on or past the end of a bus", () => {
  const geometry = getSymbolGeometry("bus", 160);
  assert.ok(geometry.ports.filter((p) => p.id.startsWith("top-")).every((p) => p.x < 160));
});

check("a width is ignored on symbols that don't stretch", () =>
  assert.equal(getSymbolGeometry("breaker", 500).width, 60),
);

check("unknown or empty symbol keys draw the generic box", () => {
  for (const key of ["not-a-symbol", "", null, undefined, "constructor", "__proto__"]) {
    assert.equal(getSymbolGeometry(key).key, "generic");
  }
});

check("a missing port falls back to the same side", () => {
  const geometry = getSymbolGeometry("bus", 80);
  assert.deepEqual(findPort(geometry, "bottom-9"), { id: "bottom-9", x: 40, y: geometry.height });
  assert.deepEqual(findPort(geometry, "top-9"), { id: "top-9", x: 40, y: 0 });
  assert.equal(findPort(getSymbolGeometry("transformer"), "left").x, 0);
});

check("a line's default ports resolve on a bus", () => {
  const geometry = getSymbolGeometry("bus");
  assert.equal(findPort(geometry, "bottom").y, geometry.height);
  assert.equal(findPort(geometry, "top").y, 0);
});

const EXPECTED: Array<[string | null | undefined, string]> = [
  // Every seeded row in neta_ops.equipment_types.
  ["Low Voltage Circuit Breaker", "breaker"],
  ["Medium Voltage Circuit Breaker", "breaker"],
  ["Low Voltage Switch", "switch"],
  ["Medium Voltage Switch", "switch"],
  ["Switchgear", "bus"],
  ["Switchboard", "bus"],
  ["Panelboard", "panel"],
  ["Dry Type Transformer", "transformer"],
  ["Large Dry Type Transformer", "transformer"],
  ["Liquid Filled Transformer", "transformer"],
  ["Automatic Transfer Switch", "ats"],
  ["Low Voltage Cable", "cable"],
  ["Medium Voltage Cable", "cable"],
  ["Metal Enclosed Busway", "bus"],
  ["Current Transformer", "generic"],
  ["Potential Transformer", "generic"],
  ["Protective Relay", "generic"],
  ["Motor Starter", "mcc"],
  ["Motor Control Center", "mcc"],
  ["Engine Generator", "generator"],
  ["Grounding System", "generic"],
  ["UPS", "ups"],
  ["Capacitor Bank", "generic"],
  ["Surge Protective Device", "generic"],
  // Aliases and free text.
  ["LV Breaker", "breaker"],
  ["Molded Case Circuit Breaker", "breaker"],
  ["MV Switch", "switch"],
  ["Load Break Switch", "switch"],
  ["Fused Disconnect", "switch"],
  ["Medium Voltage Way Switch", "switch"],
  ["Switchgear & Switchboard Assemblies", "bus"],
  ["Switchgear Assembly", "bus"],
  ["Panelboard Assemblies", "panel"],
  ["Dry-Type Transformer", "transformer"],
  ["Oil Filled Transformer", "transformer"],
  ["Pad Mount XFMR", "transformer"],
  ["ATS", "ats"],
  ["Transfer Switch", "ats"],
  ["CT", "generic"],
  ["PT", "generic"],
  ["Voltage Potential Transformer", "generic"],
  ["Voltage Transformer", "generic"],
  ["MV Cable", "cable"],
  ["Bus Duct", "bus"],
  ["Busway", "bus"],
  ["Generator", "generator"],
  ["MCC", "mcc"],
  ["Fuse", "fuse"],
  ["Motor", "motor"],
  ["Utility", "utility"],
  ["Load Bank", "load"],
  // Case, spacing and blanks.
  ["  low-voltage circuit breaker ", "breaker"],
  ["TRANSFORMER", "transformer"],
  ["Something New", "generic"],
  ["", "generic"],
  [null, "generic"],
  [undefined, "generic"],
];

for (const [type, expected] of EXPECTED) {
  check(`"${type}" draws as ${expected}`, () =>
    assert.equal(symbolKeyForEquipmentType(type), expected),
  );
}

const asset = (identifier: string, equipment_type: string | null) => ({
  id: `asset-${identifier}`,
  identifier,
  equipment_type,
  site_id: "site",
  deleted_at: null,
});

const symbolRow = (id: string, fields: Partial<DiagramSymbolRow> = {}): DiagramSymbolRow => ({
  id,
  diagram_id: "diagram",
  asset_id: null,
  symbol_key: null,
  label: null,
  label_width: null,
  x: 0,
  y: 0,
  width: null,
  height: null,
  asset: null,
  ...fields,
});

const lineRow = (id: string, from: string, to: string, fields: Partial<DiagramLineRow> = {}): DiagramLineRow => ({
  id,
  diagram_id: "diagram",
  from_symbol_id: from,
  to_symbol_id: to,
  from_port: "bottom",
  to_port: "top",
  asset_id: null,
  voltage_volts: null,
  voltage_kind: "ac",
  label: null,
  asset: null,
  ...fields,
});

const nodeFor = (row: DiagramSymbolRow) => toFlowElements({ symbols: [row], lines: [] }).nodes[0];

check("an asset's symbol follows its equipment type", () => {
  const row = symbolRow("a", { asset_id: "x", asset: asset("SWGR-1", "Switchgear") });
  assert.equal(nodeFor(row).data.symbolKey, "bus");
});

check("a symbol's own key beats the equipment type", () => {
  const row = symbolRow("a", { asset_id: "x", symbol_key: "ups", asset: asset("X", "Switchgear") });
  assert.equal(nodeFor(row).data.symbolKey, "ups");
});

check("an asset's identifier beats a saved label, so renames show", () => {
  const row = symbolRow("a", { asset_id: "x", label: "Old name", asset: asset("New name", "UPS") });
  assert.equal(nodeFor(row).data.label, "New name");
});

check("a stand-alone item uses its own label", () => {
  const row = symbolRow("a", { symbol_key: "utility", label: "Georgia Power" });
  assert.equal(nodeFor(row).data.label, "Georgia Power");
});

check("an item whose asset was permanently deleted says so", () => {
  const node = nodeFor(symbolRow("a"));
  assert.equal(node.data.label, "Missing asset");
  assert.equal(node.data.symbolKey, "generic");
});

check("a symbol keeps its saved position", () => {
  const row = symbolRow("a", { symbol_key: "load", x: 120, y: 340 });
  assert.deepEqual(nodeFor(row).position, { x: 120, y: 340 });
});

check("a line joins the right ports", () => {
  const { edges } = toFlowElements({
    symbols: [symbolRow("a", { symbol_key: "utility" }), symbolRow("b", { symbol_key: "load" })],
    lines: [lineRow("l", "a", "b")],
  });
  const [edge] = edges;
  assert.equal(edge.source, "a");
  assert.equal(edge.target, "b");
  assert.equal(edge.sourceHandle, "bottom");
  assert.equal(edge.targetHandle, "top");
});

check("ports face the right way", () => {
  const sides = Object.fromEntries(
    nodeFor(symbolRow("a", { symbol_key: "breaker" })).data.ports.map((p) => [p.id, p.side]),
  );
  assert.deepEqual(sides, { top: "top", bottom: "bottom", left: "left", right: "right" });
});

check("a line to a port that's gone still gets a connection point", () => {
  const { nodes } = toFlowElements({
    symbols: [symbolRow("bus", { symbol_key: "bus", width: 80 }), symbolRow("b", { symbol_key: "load" })],
    lines: [lineRow("l", "bus", "b", { from_port: "bottom-9" })],
  });
  const port = nodes[0].data.ports.find((p) => p.id === "bottom-9");
  assert.ok(port);
  assert.equal(port.side, "bottom");
});

check("a port in use isn't listed twice", () => {
  const { nodes } = toFlowElements({
    symbols: [symbolRow("a", { symbol_key: "utility" }), symbolRow("b", { symbol_key: "load" })],
    lines: [lineRow("l", "a", "b")],
  });
  assert.equal(nodes[0].data.ports.filter((p) => p.id === "bottom").length, 1);
});

// Editing.
let nextId = 0;
const newId = () => `id-${(nextId += 1)}`;
const empty = { symbols: [], lines: [] };
const siteAsset = (id: string, type: string, parent: string | null = null) => ({
  ...asset(id, type),
  id,
  parent_asset_id: parent,
});
const gear = siteAsset("SWGR-1", "Switchgear");
const lineup = [
  gear,
  siteAsset("52-1", "Low Voltage Circuit Breaker", "SWGR-1"),
  siteAsset("52-2", "Low Voltage Circuit Breaker", "SWGR-1"),
  siteAsset("SW-1", "Low Voltage Switch", "SWGR-1"),
  siteAsset("CT-1", "Current Transformer", "SWGR-1"),
  siteAsset("52-9", "Low Voltage Circuit Breaker", "OTHER"),
];
const origin = { x: 500, y: 300 };

check("positions snap to the grid", () => {
  assert.equal(snapToGrid(14), 10);
  assert.equal(snapToGrid(16), 20);
});

check("a stand-alone symbol is centered on the drop point and snapped", () => {
  const { symbols } = placeStandAlone(empty, "d", "utility", { x: 104, y: 96 }, newId);
  assert.deepEqual([symbols[0].x, symbols[0].y], [70, 70]);
  assert.equal(symbols[0].asset_id, null);
  assert.equal(symbols[0].symbol_key, "utility");
});

check("an asset keeps following its equipment type, rather than saving a symbol", () => {
  const { symbols } = placeAsset(empty, "d", siteAsset("T-1", "Dry Type Transformer"), origin, [], newId);
  assert.equal(symbols[0].asset_id, "T-1");
  assert.equal(symbols[0].symbol_key, null);
});

check("an asset already on the diagram isn't placed twice", () => {
  const once = placeAsset(empty, "d", siteAsset("T-1", "UPS"), origin, [], newId);
  assert.equal(placeAsset(once, "d", siteAsset("T-1", "UPS"), origin, [], newId), once);
});

check("switchgear comes in as a bus with its breakers and switches feeding off it", () => {
  const { symbols, lines } = placeAsset(empty, "d", gear, origin, lineup, newId);
  assert.deepEqual(
    symbols.map((symbol) => symbol.asset_id),
    ["SWGR-1", "52-1", "52-2", "SW-1"],
  );
  assert.equal(lines.length, 3);
  assert.ok(lines.every((line) => line.from_symbol_id === symbols[0].id && line.to_port === "top"));
});

check("feeders sit directly under their taps, on the grid, below the bus", () => {
  const contents = placeAsset(empty, "d", gear, origin, lineup, newId);
  const [bus, ...feeders] = contents.symbols;
  const busGeometry = getSymbolGeometry("bus", bus.width);
  feeders.forEach((feeder, index) => {
    const tap = findPort(busGeometry, contents.lines[index].from_port);
    assert.equal(bus.x + tap.x, feeder.x + 30, "centered under its tap");
    assert.equal(feeder.x % 10, 0, "x on the grid");
    assert.ok(feeder.y > bus.y, "below the bus");
    assert.ok(busGeometry.ports.some((port) => port.id === contents.lines[index].from_port));
  });
});

check("a feeder already on the diagram isn't brought in again", () => {
  const placed = placeAsset(empty, "d", lineup[1], origin, lineup, newId);
  const { symbols } = placeAsset(placed, "d", gear, origin, lineup, newId);
  assert.equal(symbols.filter((symbol) => symbol.asset_id === "52-1").length, 1);
});

check("gear with no breakers is a plain bus", () => {
  const { symbols, lines } = placeAsset(empty, "d", gear, origin, [gear], newId);
  assert.equal(symbols[0].width, BUS_DEFAULT_WIDTH);
  assert.equal(lines.length, 0);
});

const twoSymbols = {
  symbols: [symbolRow("a", { symbol_key: "utility" }), symbolRow("b", { symbol_key: "load", y: 200 })],
  lines: [],
};
const link = (source: string, sourceHandle: string, target: string, targetHandle: string) =>
  connectSymbols(twoSymbols, "d", { source, sourceHandle, target, targetHandle }, newId);

check("a line stores the upstream end first, whichever end was dragged", () => {
  for (const result of [link("a", "bottom", "b", "top"), link("b", "top", "a", "bottom")]) {
    assert.ok("contents" in result);
    const [line] = result.contents.lines;
    assert.deepEqual(
      [line.from_symbol_id, line.from_port, line.to_symbol_id, line.to_port],
      ["a", "bottom", "b", "top"],
    );
  }
});

check("two tops or two bottoms can't connect", () => {
  assert.ok("error" in link("a", "top", "b", "top"));
  assert.ok("error" in link("a", "bottom", "b", "bottom"));
});

check("side points only join side points", () => {
  assert.ok("error" in link("a", "right", "b", "top"));
  assert.ok("contents" in link("a", "right", "b", "left"));
});

check("a symbol can't connect to itself", () => assert.ok("error" in link("a", "bottom", "a", "top")));

check("the same connection can't be drawn twice, in either direction", () => {
  const first = link("a", "bottom", "b", "top");
  assert.ok("contents" in first);
  const again = (source: string, sourceHandle: string, target: string, targetHandle: string) =>
    connectSymbols(first.contents, "d", { source, sourceHandle, target, targetHandle }, newId);
  assert.ok("error" in again("a", "bottom", "b", "top"));
  assert.ok("error" in again("b", "top", "a", "bottom"));
});

check("a bus can't be shortened past its last feeder", () => {
  const contents = placeAsset(empty, "d", gear, origin, lineup, newId);
  const bus = contents.symbols[0];
  const shrunk = resizeBus(contents, bus.id, 40).symbols[0];
  assert.equal(shrunk.width, 9 * BUS_TAP_SPACING);
});

check("a bus width steps by whole taps", () => {
  const contents = placeStandAlone(empty, "d", "bus", origin, newId);
  const { id } = contents.symbols[0];
  assert.equal(resizeBus(contents, id, 470).symbols[0].width, 480);
  assert.equal(resizeBus(contents, id, 10).symbols[0].width, 80);
});

check("removing a symbol takes its lines, and only its lines", () => {
  const result = link("a", "bottom", "b", "top");
  assert.ok("contents" in result);
  const next = deleteItems(result.contents, ["b"], []);
  assert.deepEqual(next.symbols.map((symbol) => symbol.id), ["a"]);
  assert.equal(next.lines.length, 0);
});

check("removing a line leaves its symbols", () => {
  const result = link("a", "bottom", "b", "top");
  assert.ok("contents" in result);
  const next = deleteItems(result.contents, [], [result.contents.lines[0].id]);
  assert.equal(next.symbols.length, 2);
  assert.equal(next.lines.length, 0);
});

check("a move to the same spot changes nothing, so it adds no undo step", () => {
  assert.equal(moveSymbols(twoSymbols, [{ id: "a", x: 2, y: 3 }]), twoSymbols);
});

check("a label is trimmed, and blank means none", () => {
  const named = setSymbolLabel(twoSymbols, "a", "  Georgia Power ");
  assert.equal(named.symbols[0].label, "Georgia Power");
  assert.equal(setSymbolLabel(named, "a", "   ").symbols[0].label, null);
  assert.equal(setSymbolLabel(named, "a", "Georgia Power"), named);
});

check("a cable with no asset is a labelled item of its own", () => {
  const { symbols } = placeStandAlone(empty, "d", "cable", origin, newId);
  assert.equal(symbols[0].asset_id, null);
  const named = setSymbolLabel({ symbols, lines: [] }, symbols[0].id, "3-1/C 500 kcmil");
  assert.equal(toFlowElements(named).nodes[0].data.label, "3-1/C 500 kcmil");
});

check("a cable with no label still gets a callout", () => {
  const { symbols } = placeStandAlone(empty, "d", "cable", origin, newId);
  assert.equal(toFlowElements({ symbols, lines: [] }).nodes[0].data.label, "Cable");
});

check("a cable asset places as a cable and shows its identifier", () => {
  const contents = placeAsset(empty, "d", siteAsset("CBL-1", "Low Voltage Cable"), origin, [], newId);
  const { data } = toFlowElements(contents).nodes[0];
  assert.equal(data.symbolKey, "cable");
  assert.equal(data.label, "CBL-1");
});

check("a cable sits in line, with a line in and a line out", () => {
  const { nodes, edges } = toFlowElements({
    symbols: [
      symbolRow("a", { symbol_key: "utility" }),
      symbolRow("c", { symbol_key: "cable", y: 100 }),
      symbolRow("b", { symbol_key: "load", y: 200 }),
    ],
    lines: [lineRow("1", "a", "c"), lineRow("2", "c", "b")],
  });
  assert.equal(edges.length, 2);
  assert.ok(nodes[1].data.ports.every((port) => port.used));
});

const run = (fields: Partial<DiagramLineRow> = {}) => ({
  symbols: [
    symbolRow("up", { symbol_key: "utility", x: 100 }),
    symbolRow("down", { symbol_key: "load", x: 100, y: 300 }),
    symbolRow("cbl", { symbol_key: "cable", x: 137, y: 150 }),
  ],
  lines: [lineRow("l", "up", "down", fields)],
});

check("a cable dropped on a line splits it in two, with the cable between", () => {
  const { lines } = insertIntoLine(run(), "d", "l", "cbl", newId);
  assert.equal(lines.length, 2);
  assert.deepEqual(
    lines.map((line) => [line.from_symbol_id, line.from_port, line.to_symbol_id, line.to_port]),
    [
      ["up", "bottom", "cbl", "top"],
      ["cbl", "bottom", "down", "top"],
    ],
  );
});

check("a cable lines up with the run it joined", () =>
  assert.equal(insertIntoLine(run(), "d", "l", "cbl", newId).symbols[2].x, 100),
);

check("both halves of a split line keep its voltage", () => {
  const { lines } = insertIntoLine(run({ voltage_volts: 13800 }), "d", "l", "cbl", newId);
  assert.deepEqual(lines.map((line) => line.voltage_volts), [13800, 13800]);
});

check("a line with a bend gives its cable the nearer run", () => {
  const bent = {
    symbols: [
      symbolRow("up", { symbol_key: "utility", x: 0 }),
      symbolRow("down", { symbol_key: "load", x: 400, y: 300 }),
      symbolRow("cbl", { symbol_key: "cable", x: 390, y: 200 }),
    ],
    lines: [lineRow("l", "up", "down")],
  };
  assert.equal(insertIntoLine(bent, "d", "l", "cbl", newId).symbols[2].x, 400);
});

check("a splitting edit saves as one changed line and one new one", () => {
  const before = run();
  const changes = diffContents(before, insertIntoLine(before, "d", "l", "cbl", newId));
  assert.deepEqual(changes.changedLines.map((line) => line.id), ["l"]);
  assert.equal(changes.addedLines.length, 1);
  assert.equal(changes.removedLineIds.length, 0);
});

check("a tie line isn't split", () => {
  const tie = run({ from_port: "right", to_port: "left" });
  assert.equal(insertIntoLine(tie, "d", "l", "cbl", newId), tie);
});

check("a line that's gone is left alone", () => {
  const contents = run();
  assert.equal(insertIntoLine(contents, "d", "nope", "cbl", newId), contents);
});

// The details panel.
const equipment = {
  id: "a",
  site_id: "s",
  identifier: "T-1",
  equipment_type: "Dry Type Transformer",
  substation: "Sub 1",
  manufacturer: "Square D",
  model: "   ",
  serial_number: null,
  nameplate_data: { kva: "1500", impedance: "", primaryVolts: "13800" },
} as unknown as EquipmentAsset;

check("details list only what's filled in", () => {
  const { details } = assetDetailRows(equipment);
  assert.deepEqual(details, [
    { label: "Substation", value: "Sub 1" },
    { label: "Manufacturer", value: "Square D" },
  ]);
});

check("nameplate data follows the equipment type", () => {
  const { nameplate } = assetDetailRows(equipment);
  assert.deepEqual(nameplate.map((row) => [row.label, row.value]), [
    ["kVA", "1500"],
    ["Primary volts", "13800"],
  ]);
});

check("an asset with no nameplate fields has none to show", () =>
  assert.deepEqual(
    assetDetailRows({ ...equipment, equipment_type: "Something New" }).nameplate,
    [],
  ),
);

check("a chosen report form decides the nameplate fields, without repeating columns", () => {
  const slug = ASSET_TEMPLATE_SLUGS[0];
  const profile = getReportAssetProfile(slug);
  assert.ok(profile);
  const field = assetFieldsOf(profile).find((row) => !row.column);
  const columnField = assetFieldsOf(profile).find((row) => row.column);
  assert.ok(field);
  const { nameplate } = assetDetailRows({
    ...equipment,
    report_template_slug: slug,
    report_data: { [field.path]: "Test value" },
  });
  assert.deepEqual(nameplate, [{ label: field.label, value: "Test value" }]);
  if (columnField) assert.ok(!nameplate.some((row) => row.label === columnField.label));
});

check("built-in and custom-form reports open as pages", () => {
  assert.deepEqual(reportLink("report:/jobs/1/panelboard-report?returnToAssets=true"), {
    kind: "app",
    path: "/jobs/1/panelboard-report?returnToAssets=true",
  });
  assert.deepEqual(reportLink("custom-form:/jobs/1/custom-form/t/i"), {
    kind: "app",
    path: "/jobs/1/custom-form/t/i",
  });
});

check("uploaded reports open as files", () =>
  assert.deepEqual(reportLink("https://files.example.com/report.pdf"), {
    kind: "file",
    url: "https://files.example.com/report.pdf",
  }),
);

check("a report with no file has nowhere to open", () => assert.equal(reportLink(null), null));

// Linked diagrams.
const sheet = (id: string, name: string) => ({
  id,
  site_id: "s",
  name,
  sort_order: 0,
  created_at: "",
  updated_at: "",
});
const mv = sheet("mv", "MV One-Line");
const lv1 = sheet("lv1", "LV One-Line 1");
const lv2 = sheet("lv2", "LV One-Line 2");
const sheets = [mv, lv1, lv2];
const onSheet = (id: string, diagram_id: string, fields: Partial<DiagramLinkRow>): DiagramLinkRow => ({
  id,
  diagram_id,
  asset_id: null,
  symbol_key: null,
  label: null,
  asset: null,
  ...fields,
});
const transformer = (id: string, diagram: string, assetId = "T-1") =>
  onSheet(id, diagram, { asset_id: assetId, asset: { identifier: assetId } });
const linkSymbol = (id: string, diagram: string, label: string | null) =>
  onSheet(id, diagram, { symbol_key: "link", label });

check("the same asset on two diagrams links both ways", () => {
  const links = findLinks([transformer("a", "mv"), transformer("b", "lv1")], sheets);
  assert.deepEqual(links.get("a"), [{ diagramId: "lv1", diagramName: "LV One-Line 1", symbolId: "b" }]);
  assert.deepEqual(links.get("b"), [{ diagramId: "mv", diagramName: "MV One-Line", symbolId: "a" }]);
});

check("an asset on one diagram has no link", () =>
  assert.equal(findLinks([transformer("a", "mv")], sheets).size, 0),
);

check("different assets don't link", () =>
  assert.equal(findLinks([transformer("a", "mv", "T-1"), transformer("b", "lv1", "T-2")], sheets).size, 0),
);

check("an asset on three diagrams lists both others, in picker order", () => {
  const links = findLinks([transformer("c", "lv2"), transformer("a", "mv"), transformer("b", "lv1")], sheets);
  assert.deepEqual(links.get("a")?.map((target) => target.diagramId), ["lv1", "lv2"]);
});

check("link symbols pair by name, ignoring case and spacing", () => {
  const links = findLinks([linkSymbol("a", "mv", "To LV-1"), linkSymbol("b", "lv1", "  to lv-1 ")], sheets);
  assert.equal(links.get("a")?.[0].symbolId, "b");
});

check("two links on the same diagram don't pair", () =>
  assert.equal(findLinks([linkSymbol("a", "mv", "A1"), linkSymbol("b", "mv", "A1")], sheets).size, 0),
);

check("an unnamed link pairs with nothing", () =>
  assert.equal(findLinks([linkSymbol("a", "mv", null), linkSymbol("b", "lv1", " ")], sheets).size, 0),
);

check("a plain symbol's label never links, even if it matches", () =>
  assert.equal(
    findLinks([onSheet("a", "mv", { symbol_key: "utility", label: "A1" }), linkSymbol("b", "lv1", "A1")], sheets).size,
    0,
  ),
);

check("a deleted diagram isn't linked to", () =>
  assert.equal(findLinks([transformer("a", "mv"), transformer("b", "gone")], sheets).get("a"), undefined),
);

check("the overview groups what two diagrams share", () => {
  const overview = buildSiteOverview(sheets, [
    transformer("a", "mv", "T-1"),
    transformer("b", "lv1", "T-1"),
    linkSymbol("c", "mv", "A1"),
    linkSymbol("d", "lv1", "A1"),
  ]);
  assert.equal(overview[0].connections.length, 1);
  assert.deepEqual(overview[0].connections[0].through, ["T-1", "A1"]);
  assert.equal(overview[1].connections[0].diagramId, "mv");
  assert.equal(overview[2].connections.length, 0);
});

check("the overview points out links with no partner", () => {
  const overview = buildSiteOverview(sheets, [linkSymbol("a", "mv", "A1"), linkSymbol("b", "lv1", "A2")]);
  assert.deepEqual(overview[0].unmatchedLinks, ["A1"]);
  assert.deepEqual(overview[1].unmatchedLinks, ["A2"]);
});

check("a link symbol still reads as a link before it's named", () => {
  const { symbols } = placeStandAlone(empty, "d", "link", origin, newId);
  assert.equal(toFlowElements({ symbols, lines: [] }).nodes[0].data.label, "Link");
});

check("the asset list knows every diagram an asset is on, in picker order", () => {
  const placements = placementsByAsset(sheets, [
    transformer("c", "lv1"),
    transformer("a", "mv"),
    linkSymbol("x", "mv", "A1"),
  ]);
  assert.deepEqual(placements.get("T-1"), [
    { diagramId: "mv", diagramName: "MV One-Line", symbolId: "a" },
    { diagramId: "lv1", diagramName: "LV One-Line 1", symbolId: "c" },
  ]);
  assert.equal(placements.size, 1);
});

check("a symbol on a deleted diagram isn't offered", () =>
  assert.equal(placementsByAsset(sheets, [transformer("a", "gone")]).size, 0),
);

// Assets that go away.
const placed = (fields: Partial<DiagramAsset> = {}) =>
  symbolRow("a", { asset_id: "T-1", asset: { ...asset("T-1", "UPS"), id: "T-1", site_id: "site", ...fields } });

check("an asset that's still at the site isn't missing", () =>
  assert.equal(missingReason(placed(), "site"), null),
);

check("a soft-deleted asset is flagged, and keeps its name and symbol", () => {
  const row = placed({ deleted_at: "2026-11-05" });
  assert.equal(missingReason(row, "site"), "deleted");
  const { data } = toFlowElements({ symbols: [row], lines: [] }, { siteId: "site" }).nodes[0];
  assert.equal(data.missing, "deleted");
  assert.equal(data.label, "T-1");
  assert.equal(data.symbolKey, "ups");
});

check("an asset moved to another site is flagged", () =>
  assert.equal(missingReason(placed({ site_id: "elsewhere" }), "site"), "moved"),
);

check("a permanently deleted asset is flagged", () =>
  assert.equal(missingReason(symbolRow("a"), "site"), "deleted"),
);

check("an asset the database can't return is flagged", () =>
  assert.equal(missingReason(symbolRow("a", { asset_id: "gone" }), "site"), "deleted"),
);

check("a stand-alone item is never missing", () =>
  assert.equal(missingReason(symbolRow("a", { symbol_key: "utility" }), "site"), null),
);

check("a missing asset keeps its lines", () => {
  const { edges } = toFlowElements(
    { symbols: [placed({ deleted_at: "x" }), symbolRow("b", { symbol_key: "load", y: 200 })], lines: [lineRow("l", "a", "b")] },
    { siteId: "site" },
  );
  assert.equal(edges.length, 1);
});

// Status colors.
const report = (status: string | null, created_at: string, equipment_asset_id = "a") => ({
  equipment_asset_id,
  status,
  created_at,
});

check("from a site, the latest report speaks for an asset", () => {
  const rows = [report("in_progress", "2026-01-01"), report("approved", "2026-06-01")];
  assert.equal(statusByAsset(rows, false).get("a"), "approved");
});

check("from a job, the least finished report speaks for an asset", () => {
  const rows = [report("approved", "2026-06-01"), report("in_progress", "2026-01-01")];
  assert.equal(statusByAsset(rows, true).get("a"), "in_progress");
});

check("an issue outranks everything on a job", () => {
  const rows = [report("sent", "2026-01-01"), report("issue", "2026-01-02"), report("in_progress", "2026-01-03")];
  assert.equal(statusByAsset(rows, true).get("a"), "issue");
});

check("archived reports don't count", () => {
  const rows = [report("archived", "2026-06-01"), report("approved", "2026-01-01")];
  assert.equal(statusByAsset(rows, false).get("a"), "approved");
  assert.equal(statusByAsset(rows, true).get("a"), "approved");
});

check("an asset with only archived reports has no status", () =>
  assert.equal(statusByAsset([report("archived", "2026-06-01")], false).has("a"), false),
);

check("a report with no status counts as in progress", () =>
  assert.equal(statusByAsset([report(null, "2026-01-01")], true).get("a"), "in_progress"),
);

check("assets are kept apart", () => {
  const rows = [report("approved", "2026-01-01", "a"), report("issue", "2026-01-01", "b")];
  const statuses = statusByAsset(rows, false);
  assert.equal(statuses.get("a"), "approved");
  assert.equal(statuses.get("b"), "issue");
});

check("every status the app uses has a color, except archived", () => {
  for (const status of ["not started", "in_progress", "ready_for_review", "approved", "sent", "issue"]) {
    assert.ok(statusStyleFor(status), status);
  }
  assert.equal(statusStyleFor("archived"), undefined);
  assert.equal(statusStyleFor(null), undefined);
});

// Search.
const found = (name: string, diagramId = "here") => ({
  symbolId: `${diagramId}-${name}`,
  diagramId,
  diagramName: diagramId,
  name,
});
const names = (query: string, items: ReturnType<typeof found>[]) =>
  searchSymbols(items, query, "here").map((item) => item.name);

check("search matches any part of a name, ignoring case", () =>
  assert.deepEqual(names("swgr", [found("MV-SWGR-1"), found("T-1")]), ["MV-SWGR-1"]),
);

check("a blank search finds nothing", () => assert.deepEqual(names("  ", [found("T-1")]), []));

check("names that start with the search come first", () =>
  assert.deepEqual(names("t-", [found("XT-1"), found("T-2")]), ["T-2", "XT-1"]),
);

check("the open diagram's matches come first", () => {
  const results = searchSymbols([found("T-1", "other"), found("T-1", "here")], "t-1", "here");
  assert.deepEqual(results.map((item) => item.diagramId), ["here", "other"]);
});

check("numbers sort the way people count", () =>
  assert.deepEqual(names("52", [found("52-10"), found("52-2")]), ["52-2", "52-10"]),
);

check("results are limited to a short list", () =>
  assert.equal(names("t", Array.from({ length: 20 }, (_, i) => found(`T-${i}`))).length, 8),
);

// Voltage.
check("each voltage lands in its level", () => {
  const levels: Array<[number | null, "ac" | "dc", string]> = [
    [230000, "ac", "above_69kv"],
    [69001, "ac", "above_69kv"],
    [69000, "ac", "above_15kv"],
    [34500, "ac", "above_15kv"],
    [15000, "ac", "above_1kv"],
    [13800, "ac", "above_1kv"],
    [4160, "ac", "above_1kv"],
    [1000, "ac", "above_240v"],
    [480, "ac", "above_240v"],
    [240, "ac", "240v_and_below"],
    [120, "ac", "240v_and_below"],
    [125, "dc", "dc"],
    [13800, "dc", "dc"],
    [null, "ac", "not_set"],
    [null, "dc", "not_set"],
  ];
  for (const [volts, kind, level] of levels) assert.equal(voltageLevel(volts, kind), level, String(volts));
});

check("voltages can be typed the way people write them", () => {
  assert.equal(parseVoltage("480"), 480);
  assert.equal(parseVoltage("480 V"), 480);
  assert.equal(parseVoltage("13.8 kV"), 13800);
  assert.equal(parseVoltage("13.8kv"), 13800);
  assert.equal(parseVoltage("4,160"), 4160);
  assert.equal(parseVoltage(".48 kV"), 480);
});

check("blank clears a voltage, and nonsense is refused", () => {
  assert.equal(parseVoltage("  "), null);
  assert.equal(parseVoltage("abc"), undefined);
  assert.equal(parseVoltage("0"), undefined);
  assert.equal(parseVoltage("-480"), undefined);
});

check("voltages read the way people write them", () => {
  assert.equal(formatVoltage(13800), "13.8 kV");
  assert.equal(formatVoltage(480), "480 V");
  assert.equal(formatVoltage(4160), "4.16 kV");
  assert.equal(formatVoltage(125, "dc"), "125 V DC");
  assert.equal(formatVoltage(null), "");
});

check("a typed voltage survives being shown and read back", () => {
  for (const volts of [480, 4160, 13800, 34500, 120, 230000]) {
    assert.equal(parseVoltage(formatVoltage(volts)), volts);
  }
});

check("saved colors keep what's valid and fill in the rest", () => {
  const colors = cleanVoltageColors({ dc: "#112233", not_set: "red", extra: "#000000" });
  assert.equal(colors.dc, "#112233");
  assert.equal(colors.not_set, BUILT_IN_VOLTAGE_COLORS.not_set);
  assert.equal(colors.above_69kv, BUILT_IN_VOLTAGE_COLORS.above_69kv);
  assert.equal("extra" in colors, false);
});

check("no saved colors means the built-in ones", () =>
  assert.deepEqual(cleanVoltageColors(null), BUILT_IN_VOLTAGE_COLORS),
);

// utility -> breaker -> transformer -> bus -> breaker, plus a feeder off the bus through a cable.
const system = {
  symbols: [
    symbolRow("util", { symbol_key: "utility" }),
    symbolRow("main", { symbol_key: "breaker" }),
    symbolRow("xf", { symbol_key: "transformer" }),
    symbolRow("bus", { symbol_key: "bus" }),
    symbolRow("fdr", { symbol_key: "breaker" }),
    symbolRow("cbl", { symbol_key: "cable" }),
    symbolRow("load", { symbol_key: "load" }),
  ],
  lines: [
    lineRow("1", "util", "main"),
    lineRow("2", "main", "xf"),
    lineRow("3", "xf", "bus"),
    lineRow("4", "bus", "fdr"),
    lineRow("5", "fdr", "cbl"),
    lineRow("6", "cbl", "load"),
  ],
};
const voltages = (contents: typeof system) => contents.lines.map((line) => line.voltage_volts);

check("a section runs through everything but a transformer", () => {
  assert.deepEqual([...voltageSection(system, "4")].sort(), ["3", "4", "5", "6"]);
  assert.deepEqual([...voltageSection(system, "1")].sort(), ["1", "2"]);
});

check("setting a voltage fills its whole section, and stops at the transformer", () => {
  const next = setLineVoltage(system, "5", 480, "ac");
  assert.deepEqual(voltages(next), [null, null, 480, 480, 480, 480]);
});

check("each side of a transformer keeps its own voltage", () => {
  const next = setLineVoltage(setLineVoltage(system, "1", 13800, "ac"), "6", 480, "ac");
  assert.deepEqual(voltages(next), [13800, 13800, 480, 480, 480, 480]);
});

check("a UPS is a section break too", () => {
  const withUps = {
    symbols: [symbolRow("a", { symbol_key: "breaker" }), symbolRow("u", { symbol_key: "ups" }), symbolRow("b", { symbol_key: "load" })],
    lines: [lineRow("1", "a", "u"), lineRow("2", "u", "b")],
  };
  assert.deepEqual([...voltageSection(withUps, "1")], ["1"]);
});

check("setting the same voltage changes nothing, so it adds no undo step", () => {
  const next = setLineVoltage(system, "5", 480, "ac");
  assert.equal(setLineVoltage(next, "4", 480, "ac"), next);
});

check("AC or DC applies to the whole section", () => {
  const next = setLineVoltage(system, "1", 125, "dc");
  assert.deepEqual(next.lines.slice(0, 2).map((line) => line.voltage_kind), ["dc", "dc"]);
  assert.equal(next.lines[2].voltage_kind, "ac");
});

check("a new line picks up the voltage of the section it joins", () => {
  const set = setLineVoltage(system, "5", 480, "ac");
  const added = { ...set, symbols: [...set.symbols, symbolRow("new", { symbol_key: "load" })] };
  const result = connectSymbols(
    added,
    "d",
    { source: "bus", sourceHandle: "bottom-3", target: "new", targetHandle: "top" },
    newId,
  );
  assert.ok("contents" in result);
  assert.equal(result.contents.lines.at(-1)?.voltage_volts, 480);
});

check("a new line off a transformer starts with no voltage", () => {
  const set = setLineVoltage(system, "1", 13800, "ac");
  const added = { ...set, symbols: [...set.symbols, symbolRow("new", { symbol_key: "load" })] };
  const result = connectSymbols(
    added,
    "d",
    { source: "xf", sourceHandle: "bottom", target: "new", targetHandle: "top" },
    newId,
  );
  assert.ok("contents" in result);
  assert.equal(result.contents.lines.at(-1)?.voltage_volts, null);
});

check("a transformer shows each side's color, and other symbols show one", () => {
  const set = setLineVoltage(setLineVoltage(system, "1", 13800, "ac"), "6", 480, "ac");
  const tints = symbolTints(set, BUILT_IN_VOLTAGE_COLORS);
  const hv = voltageCss(BUILT_IN_VOLTAGE_COLORS.above_1kv);
  const lv = voltageCss(BUILT_IN_VOLTAGE_COLORS.above_240v);
  assert.deepEqual(tints.get("xf"), { top: hv, bottom: lv });
  assert.deepEqual(tints.get("main"), { top: hv, bottom: hv });
  assert.deepEqual(tints.get("cbl"), { top: lv, bottom: lv });
});

check("a symbol at the end of a run takes its one line's color", () => {
  const set = setLineVoltage(system, "1", 13800, "ac");
  const hv = voltageCss(BUILT_IN_VOLTAGE_COLORS.above_1kv);
  assert.deepEqual(symbolTints(set, BUILT_IN_VOLTAGE_COLORS).get("util"), { top: hv, bottom: hv });
});

check("an unconnected symbol isn't tinted", () =>
  assert.equal(symbolTints({ symbols: [symbolRow("a", { symbol_key: "load" })], lines: [] }, BUILT_IN_VOLTAGE_COLORS).size, 0),
);

check("a site's colors are the ones used", () => {
  const set = setLineVoltage(system, "1", 13800, "ac");
  const colors = { ...BUILT_IN_VOLTAGE_COLORS, above_1kv: "#123456" };
  assert.equal(lineColor(set.lines[0], colors), "#123456");
});

check("each section is labelled once, and unset lines aren't labelled", () => {
  const set = setLineVoltage(system, "6", 480, "ac");
  assert.deepEqual([...linesToLabel(set)], ["3"]);
  const both = setLineVoltage(set, "1", 13800, "ac");
  assert.equal(linesToLabel(both).size, 2);
});

check("the key lists only the levels on the diagram", () => {
  const set = setLineVoltage(system, "6", 480, "ac");
  assert.deepEqual(levelsInUse(set).map((level) => level.key), ["above_240v", "not_set"]);
});

check("a transformer's lower half is marked, so it can color apart", () => {
  const shapes = getSymbolGeometry("transformer").shapes;
  assert.equal(shapes.filter((shape) => shape.part === "bottom").length, 2);
  assert.equal(shapes.filter((shape) => !shape.part).length, 2);
});

// Custom symbols.
const customRow = (fields: Partial<CustomSymbolRow> = {}): CustomSymbolRow => ({
  id: "c1",
  name: "Vacuum Breaker",
  shapes: [{ type: "line", x1: 30, y1: 0, x2: 30, y2: 60 }],
  image_data: null,
  width: 60,
  height: 60,
  ports: [
    { id: "top", x: 30, y: 0 },
    { id: "bottom", x: 30, y: 60 },
  ],
  ...fields,
});
const withSymbols = (rows: CustomSymbolRow[], choices: Record<string, string>, run: () => void) => {
  setActiveSymbols(rows.map(toGeometry), choices);
  try {
    run();
  } finally {
    setActiveSymbols([], {});
  }
};

check("a custom symbol draws wherever a built-in would", () =>
  withSymbols([customRow()], {}, () => {
    assert.equal(getSymbolGeometry("custom:c1").label, "Vacuum Breaker");
    assert.equal(findPort(getSymbolGeometry("custom:c1"), "bottom").y, 60);
  }),
);

check("an uploaded symbol draws its image", () => {
  const geometry = toGeometry(customRow({ image_data: "data:image/png;base64,AAAA", shapes: [] }));
  assert.equal(geometry.shapes[0].type, "image");
});

check("a symbol missing from the library falls back to the generic box", () =>
  assert.equal(getSymbolGeometry("custom:gone").key, "generic"),
);

check("a deleted symbol still draws, but isn't offered", () =>
  withSymbols([customRow({ deleted_at: "2026-11-05" })], {}, () => {
    assert.equal(getSymbolGeometry("custom:c1").label, "Vacuum Breaker");
    assert.equal(placeableCustomSymbols().length, 0);
  }),
);

check("a site's choice for a built-in symbol applies to everything using it", () =>
  withSymbols([customRow()], { "symbol:breaker": "custom:c1" }, () => {
    assert.equal(drawnSymbolKey("breaker", "Low Voltage Circuit Breaker"), "custom:c1");
    assert.equal(drawnSymbolKey("breaker"), "custom:c1");
    assert.equal(drawnSymbolKey("fuse"), "fuse");
  }),
);

check("an equipment type's choice beats the built-in symbol's", () =>
  withSymbols(
    [customRow(), customRow({ id: "c2" })],
    { "symbol:breaker": "custom:c1", "type:medium voltage circuit breaker": "custom:c2" },
    () => {
      assert.equal(drawnSymbolKey("breaker", "Medium Voltage Circuit Breaker"), "custom:c2");
      assert.equal(drawnSymbolKey("breaker", "medium-voltage  circuit breaker"), "custom:c2");
      assert.equal(drawnSymbolKey("breaker", "Low Voltage Circuit Breaker"), "custom:c1");
    },
  ),
);

check("custom artwork doesn't change what a symbol does", () =>
  withSymbols([customRow()], { "symbol:transformer": "custom:c1" }, () => {
    const set = setLineVoltage(system, "6", 480, "ac");
    assert.deepEqual(voltages(set), [null, null, 480, 480, 480, 480]);
    const { data } = toFlowElements(system).nodes[2];
    assert.equal(data.symbolKey, "custom:c1");
    assert.equal(data.role, "transformer");
  }),
);

check("a line keeps working when a symbol's artwork lacks its port", () =>
  withSymbols([customRow({ ports: [{ id: "top", x: 30, y: 0 }] })], { "symbol:load": "custom:c1" }, () => {
    const { nodes } = toFlowElements({
      symbols: [symbolRow("a", { symbol_key: "load" }), symbolRow("b", { symbol_key: "fuse", y: 200 })],
      lines: [lineRow("l", "a", "b")],
    });
    assert.ok(nodes[0].data.ports.some((port) => port.id === "bottom"));
  }),
);

check("connection points land on the nearest edge, named for it", () => {
  assert.deepEqual(placePort(28, 3, 60, 60, []), { id: "top", x: 30, y: 0 });
  assert.deepEqual(placePort(30, 57, 60, 60, []), { id: "bottom", x: 30, y: 60 });
  assert.deepEqual(placePort(2, 31, 60, 60, []), { id: "left", x: 0, y: 30 });
  assert.deepEqual(placePort(58, 29, 60, 60, []), { id: "right", x: 60, y: 30 });
});

check("a second point on one edge gets its own name", () => {
  const first = placePort(20, 0, 60, 60, []);
  const second = placePort(40, 0, 60, 60, [first]);
  const third = placePort(50, 0, 60, 60, [first, second]);
  assert.deepEqual([first.id, second.id, third.id], ["top", "top-2", "top-3"]);
});

check("custom connection points follow the connection rules", () =>
  withSymbols([customRow({ ports: [{ id: "top-2", x: 40, y: 0 }, { id: "bottom", x: 30, y: 60 }] })], {}, () => {
    const contents = {
      symbols: [symbolRow("a", { symbol_key: "utility" }), symbolRow("b", { symbol_key: "custom:c1", y: 200 })],
      lines: [],
    };
    const result = connectSymbols(contents, "d", { source: "a", sourceHandle: "bottom", target: "b", targetHandle: "top-2" }, newId);
    assert.ok("contents" in result);
  }),
);

check("each drawing tool makes its shape", () => {
  const from = { x: 10, y: 10 };
  const to = { x: 40, y: 50 };
  assert.deepEqual(shapeFromDrag("line", from, to), { type: "line", x1: 10, y1: 10, x2: 40, y2: 50 });
  assert.deepEqual(shapeFromDrag("rect", to, from), { type: "rect", x: 10, y: 10, width: 30, height: 40 });
  assert.deepEqual(shapeFromDrag("circle", from, to), { type: "circle", cx: 10, cy: 10, r: 50 });
  assert.equal(shapeFromDrag("arc", from, to)?.type, "path");
});

check("a click with no drag makes no shape", () => {
  for (const tool of ["line", "rect", "circle", "arc"] as const) {
    assert.equal(shapeFromDrag(tool, { x: 5, y: 5 }, { x: 5, y: 5 }), null);
  }
});

check("a flat rectangle makes no shape", () =>
  assert.equal(shapeFromDrag("rect", { x: 5, y: 5 }, { x: 40, y: 5 }), null),
);

check("resizing keeps connection point ids, so saved lines stay attached", () => {
  const ports = [
    { id: "top", x: 30, y: 0 },
    { id: "bottom", x: 30, y: 60 },
    { id: "right", x: 60, y: 30 },
  ];
  const resized = resizePorts(ports, { width: 60, height: 60 }, { width: 120, height: 80 });
  assert.deepEqual(resized, [
    { id: "top", x: 60, y: 0 },
    { id: "bottom", x: 60, y: 80 },
    { id: "right", x: 120, y: 40 },
  ]);
});

check("points stay on their edge when a symbol shrinks", () => {
  const [bottom] = resizePorts([{ id: "bottom", x: 30, y: 60 }], { width: 60, height: 60 }, { width: 40, height: 40 });
  assert.deepEqual(bottom, { id: "bottom", x: 20, y: 40 });
});

const sketch: SymbolShape[] = [
  { type: "line", x1: 30, y1: 0, x2: 30, y2: 60 },
  { type: "rect", x: 10, y: 10, width: 20, height: 20 },
  { type: "circle", cx: 45, cy: 45, r: 10 },
  { type: "path", d: "M0 50 Q10 40 20 50" },
  { type: "text", x: 50, y: 12, text: "A", size: 12 },
];

check("the eraser finds each kind of shape", () => {
  assert.equal(shapeIndexAt(sketch, { x: 31, y: 50 }), 0);
  assert.equal(shapeIndexAt(sketch, { x: 11, y: 20 }), 1);
  assert.equal(shapeIndexAt(sketch, { x: 55, y: 45 }), 2);
  assert.equal(shapeIndexAt(sketch, { x: 10, y: 45 }), 3);
  assert.equal(shapeIndexAt(sketch, { x: 50, y: 7 }), 4);
});

check("the eraser ignores empty space, including inside a shape", () => {
  assert.equal(shapeIndexAt(sketch, { x: 18, y: 20 }), -1);
  assert.equal(shapeIndexAt(sketch, { x: 45, y: 45 }), -1);
});

check("where shapes are close, the eraser takes the nearest", () =>
  assert.equal(shapeIndexAt(sketch, { x: 30, y: 8 }), 0),
);

check("where shapes are exactly as close, the eraser takes the one on top", () =>
  assert.equal(shapeIndexAt(sketch, { x: 29, y: 20 }), 1),
);

check("editing a symbol reaches diagrams without touching them", () => {
  const before = customRow();
  const after = customRow({ shapes: [{ type: "circle", cx: 30, cy: 30, r: 20 }], name: "New Name" });
  const contents = { symbols: [symbolRow("a", { symbol_key: "custom:c1" })], lines: [] };
  withSymbols([before], {}, () => assert.equal(getSymbolGeometry("custom:c1").shapes[0].type, "line"));
  withSymbols([after], {}, () => {
    assert.equal(getSymbolGeometry("custom:c1").shapes[0].type, "circle");
    assert.equal(toFlowElements(contents).nodes[0].data.symbolKey, "custom:c1");
  });
});

check("only SVG and PNG files of a sensible size are accepted", () => {
  assert.equal(uploadProblem({ name: "a.svg", type: "image/svg+xml", size: 1000 }), null);
  assert.equal(uploadProblem({ name: "a.png", type: "image/png", size: 1000 }), null);
  assert.equal(uploadProblem({ name: "A.SVG", type: "", size: 1000 }), null);
  assert.ok(uploadProblem({ name: "a.jpg", type: "image/jpeg", size: 1000 }));
  assert.ok(uploadProblem({ name: "a.exe", type: "", size: 1000 }));
  assert.ok(uploadProblem({ name: "a.png", type: "image/png", size: 400_000 }));
});

check("a small PNG is flagged, a large one isn't", () => {
  assert.equal(isLowResolution(100, 60), true);
  assert.equal(isLowResolution(600, 60), false);
});

check("every built-in symbol and equipment type gets a row", () => {
  const rows = choiceRows(["Switchgear", "Medium Voltage Cable"], symbolKeyForEquipmentType);
  assert.equal(rows.length, BUILT_IN_SYMBOL_KEYS.length + 2);
  assert.deepEqual(rows.at(-2), { choiceKey: "type:switchgear", label: "Switchgear", builtIn: "bus" });
  assert.equal(rows.at(-1)?.builtIn, "cable");
});

check("saved choices keep only real choices", () =>
  assert.deepEqual(
    cleanSymbolChoices({ "symbol:fuse": "custom:a", "type:ups": "ups", other: "x", "symbol:load": 5, "symbol:bus": "" }),
    { "symbol:fuse": "custom:a", "type:ups": "ups" },
  ),
);

check("no saved choices means built-in symbols", () => assert.deepEqual(cleanSymbolChoices(null), {}));

// Asset status and archives.
check("the three statuses read the way the plan names them", () => {
  assert.equal(assetStatusLabel("active"), "In Use");
  assert.equal(assetStatusLabel("not_in_use"), "Not In Use");
  assert.equal(assetStatusLabel("retired"), "Retired");
  assert.equal(assetStatusLabel(undefined), "");
});

check("only retired assets are hidden by default", () => {
  assert.equal(hiddenByDefault("retired"), true);
  assert.equal(hiddenByDefault("not_in_use"), false);
  assert.equal(hiddenByDefault("active"), false);
});

check("a retired asset left on a diagram is flagged", () =>
  assert.equal(missingReason(placed({ status: "retired" }), "site"), "retired"),
);

check("a not in use asset isn't flagged as a problem", () =>
  assert.equal(missingReason(placed({ status: "not_in_use" }), "site"), null),
);

check("the details panel lists status first", () =>
  assert.deepEqual(assetDetailRows({ ...equipment, status: "not_in_use" }).details[0], {
    label: "Status",
    value: "Not In Use",
  }),
);

check("an archive flags nothing, because it shows the system as it was", () => {
  const { data } = toFlowElements(
    { symbols: [placed({ status: "retired" })], lines: [] },
    { siteId: "site", archived: true },
  ).nodes[0];
  assert.equal(data.missing, null);
});

check("a copy gets new ids, with every line joining the same items", () => {
  const source = {
    symbols: [symbolRow("a", { symbol_key: "utility", x: 5 }), symbolRow("b", { symbol_key: "load", y: 200 })],
    lines: [lineRow("l", "a", "b", { voltage_volts: 480 })],
  };
  let count = 0;
  const copy = copyContents(source, "new", () => `n${(count += 1)}`);
  assert.deepEqual(copy.symbols.map((symbol) => symbol.id), ["n1", "n2"]);
  assert.ok(copy.symbols.every((symbol) => symbol.diagram_id === "new"));
  assert.equal(copy.symbols[0].x, 5);
  assert.deepEqual([copy.lines[0].from_symbol_id, copy.lines[0].to_symbol_id], ["n1", "n2"]);
  assert.equal(copy.lines[0].voltage_volts, 480);
  assert.equal(copy.lines[0].diagram_id, "new");
  assert.notEqual(copy.lines[0].id, "l");
});

check("copying leaves the original alone", () => {
  const source = { symbols: [symbolRow("a", { symbol_key: "load" })], lines: [] };
  copyContents(source, "new");
  assert.equal(source.symbols[0].id, "a");
  assert.equal(source.symbols[0].diagram_id, "diagram");
});

check("a copy saves as all new rows", () => {
  const source = {
    symbols: [symbolRow("a", { symbol_key: "utility" }), symbolRow("b", { symbol_key: "load" })],
    lines: [lineRow("l", "a", "b")],
  };
  const changes = diffContents(empty, copyContents(source, "new"));
  assert.equal(changes.addedSymbols.length, 2);
  assert.equal(changes.addedLines.length, 1);
});

check("an archive keeps the colors, choices and symbols it was drawn with", () =>
  withSymbols([customRow(), customRow({ id: "unused" })], { "symbol:load": "custom:c1" }, () => {
    const contents = { symbols: [symbolRow("a", { symbol_key: "load" })], lines: [] };
    const colors = { ...BUILT_IN_VOLTAGE_COLORS, dc: "#123456" };
    const snapshot = buildArchiveSnapshot(contents, colors, { "symbol:load": "custom:c1" }, [
      customRow(),
      customRow({ id: "unused" }),
    ]);
    assert.equal(snapshot.voltage_colors.dc, "#123456");
    assert.deepEqual(snapshot.custom_symbols.map((symbol) => symbol.id), ["c1"]);
    assert.equal(snapshot.symbol_choices["symbol:load"], "custom:c1");
  }),
);

check("a snapshot survives being saved and read back", () => {
  const snapshot = {
    voltage_colors: { ...BUILT_IN_VOLTAGE_COLORS, dc: "#123456" },
    symbol_choices: { "symbol:load": "custom:c1" },
    custom_symbols: [customRow()],
  };
  assert.deepEqual(readArchiveSnapshot(JSON.parse(JSON.stringify(snapshot))), snapshot);
});

check("a damaged snapshot still opens, with built-in colors", () => {
  const snapshot = readArchiveSnapshot(null);
  assert.deepEqual(snapshot.voltage_colors, BUILT_IN_VOLTAGE_COLORS);
  assert.deepEqual(snapshot.custom_symbols, []);
});

check("the retire list has each asset once, in order, without ones already gone", () => {
  const row = (id: string, assetId: string, fields: Partial<DiagramAsset> = {}) =>
    symbolRow(id, { asset_id: assetId, asset: { ...asset(assetId, "UPS"), id: assetId, ...fields } });
  const list = archivableAssets({
    symbols: [
      row("1", "52-10"),
      row("2", "52-2"),
      row("3", "52-2"),
      row("4", "OLD", { status: "retired" }),
      row("5", "GONE", { deleted_at: "x" }),
      symbolRow("6", { symbol_key: "utility" }),
    ],
    lines: [],
  });
  assert.deepEqual(list.map((item) => item.identifier), ["52-2", "52-10"]);
});

check("a new label stays on one line", () => {
  const { symbols } = placeStandAlone(empty, "d", "cable", origin, newId);
  assert.equal(toFlowElements({ symbols, lines: [] }).nodes[0].data.labelWidth, null);
});

check("a label's wrap width snaps to the grid and reaches the canvas", () => {
  const next = setSymbolLabelWidth(twoSymbols, "a", 124);
  assert.equal(next.symbols[0].label_width, 120);
  assert.equal(toFlowElements(next).nodes[0].data.labelWidth, 120);
});

check("a label can't be squeezed below its minimum", () =>
  assert.equal(setSymbolLabelWidth(twoSymbols, "a", 3).symbols[0].label_width, LABEL_MIN_WIDTH),
);

check("a label can go back to one line", () => {
  const wrapped = setSymbolLabelWidth(twoSymbols, "a", 120);
  assert.equal(setSymbolLabelWidth(wrapped, "a", null).symbols[0].label_width, null);
});

check("the same wrap width changes nothing, so it adds no undo step", () => {
  const wrapped = setSymbolLabelWidth(twoSymbols, "a", 120);
  assert.equal(setSymbolLabelWidth(wrapped, "a", 121), wrapped);
});

check("a wrap width is saved", () => {
  const changes = diffContents(twoSymbols, setSymbolLabelWidth(twoSymbols, "a", 120));
  assert.deepEqual(changes.changedSymbols.map((symbol) => symbol.id), ["a"]);
});

check("only points with a line are marked as used", () => {
  const { nodes } = toFlowElements({
    symbols: [symbolRow("a", { symbol_key: "breaker" }), symbolRow("b", { symbol_key: "load", y: 200 })],
    lines: [lineRow("l", "a", "b")],
  });
  const used = nodes[0].data.ports.filter((port) => port.used).map((port) => port.id);
  assert.deepEqual(used, ["bottom"]);
});

check("saving sends only what changed", () => {
  const moved = moveSymbols(twoSymbols, [{ id: "a", x: 40, y: 0 }]);
  const changes = diffContents(twoSymbols, moved);
  assert.deepEqual(changes.changedSymbols.map((symbol) => symbol.id), ["a"]);
  assert.equal(changes.addedSymbols.length + changes.removedSymbolIds.length, 0);
});

check("no edit means nothing to save", () =>
  assert.equal(hasChanges(diffContents(twoSymbols, { ...twoSymbols })), false),
);

check("an undo saves as the reverse of the edit", () => {
  const result = link("a", "bottom", "b", "top");
  assert.ok("contents" in result);
  const removed = deleteItems(result.contents, ["b"], []);
  const forward = diffContents(result.contents, removed);
  assert.deepEqual(forward.removedSymbolIds, ["b"]);
  assert.equal(forward.removedLineIds.length, 1);
  const back = diffContents(removed, result.contents);
  assert.deepEqual(back.addedSymbols.map((symbol) => symbol.id), ["b"]);
  assert.equal(back.addedLines.length, 1);
});

check("a line running upward is flagged while editing, but not while viewing", () => {
  const upside = {
    symbols: [symbolRow("a", { symbol_key: "utility", y: 300 }), symbolRow("b", { symbol_key: "load", y: 0 })],
    lines: [lineRow("l", "a", "b")],
  };
  assert.ok(toFlowElements(upside, { editing: true }).edges[0].style?.strokeDasharray);
  assert.equal(toFlowElements(upside).edges[0].style?.strokeDasharray, undefined);
});

check("a line running downward isn't flagged", () => {
  const upright = {
    symbols: [symbolRow("a", { symbol_key: "utility" }), symbolRow("b", { symbol_key: "load", y: 300 })],
    lines: [lineRow("l", "a", "b")],
  };
  assert.equal(toFlowElements(upright, { editing: true }).edges[0].style?.strokeDasharray, undefined);
});

check("a tie between side points is never flagged", () => {
  const tie = {
    symbols: [symbolRow("a", { symbol_key: "breaker", y: 300 }), symbolRow("b", { symbol_key: "breaker" })],
    lines: [lineRow("l", "a", "b", { from_port: "right", to_port: "left" })],
  };
  assert.equal(toFlowElements(tie, { editing: true }).edges[0].style?.strokeDasharray, undefined);
});

// Printing.
const sheetInput = (fields: Partial<SheetInput> = {}): SheetInput => ({
  contents: {
    symbols: [
      symbolRow("u", { symbol_key: "utility", label: "Utility", x: 0, y: 0 }),
      symbolRow("t", { symbol_key: "transformer", label: "T-1", x: 0, y: 200 }),
      symbolRow("l", { symbol_key: "load", label: "Load", x: 0, y: 400 }),
    ],
    lines: [
      lineRow("1", "u", "t", { voltage_volts: 13800 }),
      lineRow("2", "t", "l", { voltage_volts: 480 }),
    ],
  },
  options: { size: "D", orientation: "landscape", coloring: "voltage" },
  siteId: "site",
  siteName: "QTS ATL2",
  diagramId: "mv",
  diagramName: "MV One-Line",
  revision: 3,
  printedAt: "Nov 5, 2026, 3:42 PM",
  archived: false,
  sheetNumbers: new Map([["mv", 1], ["lv", 2]]),
  sheetCount: 2,
  links: new Map(),
  voltageColors: BUILT_IN_VOLTAGE_COLORS,
  statuses: new Map(),
  fadedAssetIds: new Set(),
  logos: [],
  measure: estimateTextWidth,
  ...fields,
});
const textsOf = (sheet: Sheet) =>
  sheet.steps.flatMap((step) => (step.kind === "text" ? [step.text] : []));
const pathsOf = (sheet: Sheet) => sheet.steps.filter((step) => step.kind === "path");

check("ARCH sheets are the right size in both directions", () => {
  const inches = (size: keyof typeof ARCH_SIZES, orientation: "landscape" | "portrait") => {
    const { width, height } = planSheet(sheetInput({ options: { size, orientation, coloring: "none" } }));
    return [width / 72, height / 72];
  };
  assert.deepEqual(inches("B", "landscape"), [18, 12]);
  assert.deepEqual(inches("C", "portrait"), [18, 24]);
  assert.deepEqual(inches("D", "landscape"), [36, 24]);
  assert.deepEqual(inches("E", "portrait"), [36, 48]);
});

check("the title block has the name, date and time, revision and sheet", () => {
  const texts = textsOf(planSheet(sheetInput()));
  assert.ok(texts.includes("MV One-Line"));
  assert.ok(texts.includes("Printed Nov 5, 2026, 3:42 PM"));
  assert.ok(texts.some((text) => text.includes("Rev 3") && text.includes("Sheet 1 of 2")));
});

check("with no revision tracking, the sheet prints without one", () => {
  const texts = textsOf(planSheet(sheetInput({ revision: null })));
  assert.ok(!texts.some((text) => text.includes("Rev")));
});

check("an archive says so", () =>
  assert.ok(textsOf(planSheet(sheetInput({ archived: true }))).some((text) => text.includes("ARCHIVED"))),
);

check("every label and voltage prints", () => {
  const texts = textsOf(planSheet(sheetInput()));
  for (const text of ["Utility", "T-1", "Load", "13.8 kV", "480 V"]) assert.ok(texts.includes(text), text);
});

check("voltage labels print even in black and white", () => {
  const texts = textsOf(planSheet(sheetInput({ options: { size: "D", orientation: "landscape", coloring: "none" } })));
  assert.ok(texts.includes("13.8 kV"));
});

check("the drawing stays inside the border, above the title block", () => {
  for (const orientation of ["landscape", "portrait"] as const) {
    const sheet = planSheet(sheetInput({ options: { size: "B", orientation, coloring: "voltage" } }));
    const bottomLimit = sheet.height - 36 - 144;
    for (const step of sheet.steps) {
      if (step.kind !== "text" || step.size < 8 || ["MV One-Line", "QTS ATL2"].includes(step.text)) continue;
      if (/Printed|Rev|Above|240 V/.test(step.text)) continue;
      assert.ok(step.x >= 36 && step.x <= sheet.width - 36, `${step.text} x`);
      assert.ok(step.y >= 36 && step.y <= bottomLimit, `${step.text} y ${step.y}`);
    }
  }
});

check("a bigger sheet prints bigger text, up to a limit", () => {
  const wide = Array.from({ length: 60 }, (_, i) => symbolRow(`s${i}`, { symbol_key: "load", x: i * 200, label: `L-${i}` }));
  const input = (size: keyof typeof ARCH_SIZES) =>
    sheetInput({ contents: { symbols: wide, lines: [] }, options: { size, orientation: "landscape", coloring: "none" } });
  assert.ok(planSheet(input("E")).textSize > planSheet(input("B")).textSize);
  const small = planSheet(sheetInput({ options: { size: "E", orientation: "landscape", coloring: "none" } }));
  assert.ok(small.textSize <= 24);
});

check("the export warns and points to a sheet that works", () => {
  const wide = Array.from({ length: 20 }, (_, i) => symbolRow(`s${i}`, { symbol_key: "load", x: i * 200, label: `L-${i}` }));
  const input = sheetInput({ contents: { symbols: wide, lines: [] }, options: { size: "B", orientation: "landscape", coloring: "none" } });
  assert.ok(planSheet(input).textSize < MIN_TEXT_SIZE);
  const better = smallestReadableSize(input);
  assert.ok(better && better !== "B");
});

check("a diagram too big for any sheet says so", () => {
  const huge = Array.from({ length: 400 }, (_, i) => symbolRow(`s${i}`, { symbol_key: "load", x: i * 200, label: "L" }));
  assert.equal(smallestReadableSize(sheetInput({ contents: { symbols: huge, lines: [] } })), null);
});

check("wrapped labels print on several lines", () => {
  const input = sheetInput({
    contents: {
      symbols: [symbolRow("a", { symbol_key: "load", label: "One two three four five", label_width: 50 })],
      lines: [],
    },
  });
  const texts = textsOf(planSheet(input));
  assert.ok(texts.includes("One two"));
  assert.ok(!texts.includes("One two three four five"));
});

check("text wraps at word breaks, and a long word keeps its own line", () => {
  const width = (text: string) => text.length * 10;
  assert.deepEqual(wrapText("aa bb cc", 50, width), ["aa bb", "cc"]);
  assert.deepEqual(wrapText("aaaaaaaaaaaa bb", 50, width), ["aaaaaaaaaaaa", "bb"]);
  assert.deepEqual(wrapText("aa bb", null, width), ["aa bb"]);
});

check("a cable prints in a box", () => {
  const sheet = planSheet(sheetInput({ contents: { symbols: [symbolRow("c", { symbol_key: "cable", label: "CBL-1" })], lines: [] } }));
  const boxes = sheet.steps.filter((step) => step.kind === "rect" && step.stroke && step.fill);
  assert.equal(boxes.length, 2, "the callout and the title block");
});

check("linked items print a continuation note", () => {
  const links = new Map([["t", [{ diagramId: "lv", diagramName: "LV", symbolId: "x" }]]]);
  assert.ok(textsOf(planSheet(sheetInput({ links }))).includes("Continued on Sheet 2"));
});

check("a link to a diagram with no sheet number isn't printed", () => {
  const links = new Map([["t", [{ diagramId: "other", diagramName: "X", symbolId: "x" }]]]);
  assert.ok(!textsOf(planSheet(sheetInput({ links }))).some((text) => text.startsWith("Continued")));
});

check("voltage coloring reaches lines, and each side of a transformer", () => {
  const steps = pathsOf(planSheet(sheetInput()));
  const colors = new Set(steps.flatMap((step) => (step.kind === "path" && step.stroke ? [step.stroke.join()] : [])));
  assert.ok(colors.has(hexToRgb(BUILT_IN_VOLTAGE_COLORS.above_1kv).join()));
  assert.ok(colors.has(hexToRgb(BUILT_IN_VOLTAGE_COLORS.above_240v).join()));
});

check("black and white is only black", () => {
  const steps = pathsOf(planSheet(sheetInput({ options: { size: "D", orientation: "landscape", coloring: "none" } })));
  assert.ok(steps.every((step) => step.kind === "path" && (step.stroke ?? step.fill)?.every((value) => value === 0)));
});

check("the key lists only what's on the sheet", () => {
  const texts = textsOf(planSheet(sheetInput()));
  assert.ok(texts.includes("Above 1 kV to 15 kV"));
  assert.ok(!texts.includes("DC"));
  assert.ok(!textsOf(planSheet(sheetInput({ options: { size: "D", orientation: "landscape", coloring: "none" } }))).includes("Above 1 kV to 15 kV"));
});

check("report status coloring uses the asset's status", () => {
  const contents = { symbols: [symbolRow("a", { symbol_key: "ups", asset_id: "A", asset: { ...asset("A", "UPS"), id: "A", site_id: "site" } })], lines: [] };
  const sheet = planSheet(sheetInput({ contents, options: { size: "D", orientation: "landscape", coloring: "status" }, statuses: new Map([["A", "approved"]]) }));
  assert.ok(textsOf(sheet).includes("Approved"));
  const green = hexToRgb("#16A34A").join();
  assert.ok(pathsOf(sheet).some((step) => step.kind === "path" && step.stroke?.join() === green));
});

check("logos print, as many as there are", () => {
  const logos = [{ key: "AMP", width: 200, height: 100 }, { key: "end-user", width: 300, height: 60 }];
  const placed = planSheet(sheetInput({ logos })).steps.filter((step) => step.kind === "logo");
  assert.equal(placed.length, 2);
  for (const step of placed) {
    if (step.kind === "logo") assert.ok(step.height <= 0.55 * 72 + 0.01);
  }
});

check("an empty diagram still makes a sheet", () =>
  assert.ok(textsOf(planSheet(sheetInput({ contents: { symbols: [], lines: [] } }))).includes("MV One-Line")),
);

check("every built-in shape becomes a path the PDF can draw", () => {
  for (const key of BUILT_IN_SYMBOL_KEYS) {
    for (const shape of getSymbolGeometry(key).shapes) {
      if (shape.type !== "text") assert.ok(shapePath(shape), `${key} ${shape.type}`);
    }
  }
});

check("a line runs straight when aligned, and bends halfway when not", () => {
  assert.equal(linePath({ x: 10, y: 0 }, { x: 10, y: 100 }, false), "M10 0 V100");
  assert.equal(linePath({ x: 10, y: 0 }, { x: 50, y: 100 }, false), "M10 0 V50 H50 V100");
  assert.equal(linePath({ x: 0, y: 10 }, { x: 100, y: 30 }, true), "M0 10 H50 V30 H100");
});

// Revisions.
const drawing = () => ({ symbols: [symbolRow("a", { symbol_key: "load" })], lines: [lineRow("l", "a", "a")] });

check("the same drawing gives the same fingerprint, in any order", () => {
  const two = { symbols: [symbolRow("a"), symbolRow("b")], lines: [] };
  const swapped = { symbols: [symbolRow("b"), symbolRow("a")], lines: [] };
  assert.equal(contentFingerprint(two, "X"), contentFingerprint(swapped, "X"));
});

check("anything on the sheet changes the fingerprint", () => {
  const base = contentFingerprint(drawing(), "X");
  assert.notEqual(contentFingerprint(moveSymbols(drawing(), [{ id: "a", x: 40, y: 0 }]), "X"), base);
  assert.notEqual(contentFingerprint(drawing(), "Y"), base);
  assert.notEqual(contentFingerprint(setLineVoltage(drawing(), "l", 480, "ac"), "X"), base);
});

check("the first export is Rev 1", () =>
  assert.deepEqual(nextRevision(undefined, "abc"), { revision: 1, changed: true }),
);

check("an unchanged reprint keeps its revision", () =>
  assert.deepEqual(nextRevision({ revision: 4, export_hash: "abc" }, "abc"), { revision: 4, changed: false }),
);

check("a changed diagram gets the next revision", () =>
  assert.deepEqual(nextRevision({ revision: 4, export_hash: "abc" }, "xyz"), { revision: 5, changed: true }),
);

// ── Trending ───────────────────────────────
const irOf = (row: Record<string, unknown>) => builtInReadings(row).filter((r) => r.group === "Insulation Resistance");
const readingAt = (row: Record<string, unknown>, label: string) => builtInReadings(row).find((r) => r.label === label);

const switchgearRow = {
  id: "sg1",
  job_id: "job",
  report_info: { date: "2024-03-02", customer: "ACME", temperature: { fahrenheit: "68" }, testEquipment: { megohmmeter: { serialNumber: "1234" } } },
  nameplate_data: { voltage: "480", amps: "1200" },
  visual_inspection: { "7.1.A": "Satisfactory" },
  insulation_resistance: {
    tests: [
      { busSection: "Bus 1", values: { ag: "1500", bg: ">2200", cg: "N/A", ab: "", bc: "1,800", ca: "1.2 GΩ", an: "", bn: "", cn: "" }, testVoltage: "1000", unit: "MΩ" },
      { busSection: "Bus 2", values: { ag: "900", bg: "", cg: "", ab: "", bc: "", ca: "", an: "", bn: "", cn: "" }, testVoltage: "1000", unit: "GΩ" },
    ],
    correctedTests: [{ busSection: "Bus 1", values: { ag: "1650" }, testVoltage: "1000", unit: "MΩ" }],
  },
  contact_resistance: {
    tests: [{ busSection: "Bus 1", values: { a: "22", b: "24", c: "23" }, unit: "μΩ" }],
    dielectricTests: [{ busSection: "Bus 1", values: { ag: "0.5" }, testVoltage: "2.2", unit: "mA" }],
  },
};

const dryTypeRow = {
  id: "dt1",
  report_info: {
    date: "2023-01-15",
    insulationResistance: {
      primaryToGround: {
        testVoltage: "2500",
        unit: "GΩ",
        readings: { halfMinute: "3.1", oneMinute: "3.6", tenMinute: "4.2" },
        corrected: { halfMinute: "3.3", oneMinute: "3.8", tenMinute: "4.5" },
        dielectricAbsorption: "1.16",
        polarizationIndex: "1.17",
      },
    },
    insulationResistanceTester: { serialNumber: "9876", ampId: "55" },
  },
};

const mvBreakerRow = {
  id: "mv1",
  report_data: {
    date: "2022-06-30",
    insulationResistanceMeasured: { testVoltage: "5000", poleToPoleUnits: "GΩ", poleToFrameUnits: "MΩ", lineToLoadUnits: "MΩ", poleToPoleClosedP1P2: "12", poleToFrameClosedP1: "800", lineToLoadOpenP1: "950" },
    insulationResistanceCorrected: { poleToPoleClosedP1P2: "13", poleToFrameClosedP1: "880" },
    lowResistanceOhmmeter: { serialNumber: "42", model: "DLRO" },
    contactResistanceAsFound: { p1: "30", p2: "31", p3: "32", units: "μΩ" },
    contactResistanceAsLeft: { p1: "28", units: "μΩ" },
  },
};

const lvSwitchRow = {
  id: "lv1",
  insulation_resistance: {
    testVoltage: "1000",
    units: "MΩ",
    poleToPole: { p1p2: 1200, p2p3: 1100, p3p1: "" },
    poleToFrame: { p1: 1400, p2: "OL", p3: 1300 },
    lineToLoad: { p1: 1500 },
  },
};

const buswayRow = { id: "bw1", report_info: { insulationResistance: { aToB: "1000", units: "MΩ" }, correctedInsulationResistance: { aToB: "1100" } } };

const textBlobRow = { id: "tx1", report_data: JSON.stringify({ insulationResistance: { ag: "700", unit: "Mohm" } }) };

check("reading numbers are strict", () => {
  assert.equal(readingNumber("1,800"), 1800);
  assert.equal(readingNumber(">2200"), 2200);
  assert.equal(readingNumber("1.2 GΩ"), 1.2);
  assert.equal(readingNumber(12.5), 12.5);
  assert.equal(readingNumber("1.2e3"), 1200);
  for (const junk of ["", "N/A", "OL", "3-phase", "12/14/2023", "PASS", null, undefined, true]) assert.equal(readingNumber(junk), null, String(junk));
});

check("units spell one way", () => {
  assert.equal(cleanUnit("Mohm"), "MΩ");
  assert.equal(cleanUnit("megohms"), "MΩ");
  assert.equal(cleanUnit("\u00b5\u2126"), "μΩ");
  assert.equal(cleanUnit("mΩ"), "mΩ");
  assert.equal(cleanUnit("MΩ"), "MΩ");
  assert.equal(cleanUnit("mA"), "mA");
  assert.equal(cleanUnit(""), undefined);
});

check("key names read like English", () => {
  assert.equal(humanizeKey("ag"), "A-G");
  assert.equal(humanizeKey("primaryToGround"), "Primary To Ground");
  assert.equal(humanizeKey("line_to_load"), "Line To Load");
});

check("switchgear insulation readings come out with their row, unit and corrected flag", () => {
  const ag = readingAt(switchgearRow, "Bus 1 · A-G");
  assert.equal(ag?.group, "Insulation Resistance");
  assert.equal(ag?.value, 1500);
  assert.equal(ag?.unit, "MΩ");
  assert.equal(readingAt(switchgearRow, "Bus 2 · A-G")?.unit, "GΩ");
  assert.equal(readingAt(switchgearRow, "Corrected · Bus 1 · A-G")?.value, 1650);
  assert.equal(readingAt(switchgearRow, "Bus 1 · C-A")?.unit, "GΩ");
  assert.equal(readingAt(switchgearRow, "Bus 1 · C-G"), undefined);
});

check("a test nested under another heading lands in its own group", () => {
  const groups = new Set(builtInReadings(switchgearRow).map((r) => r.group));
  assert.deepEqual([...groups].sort(), ["Contact Resistance", "Dielectric Withstand", "Insulation Resistance"]);
  assert.equal(builtInReadings(switchgearRow).find((r) => r.group === "Dielectric Withstand")?.unit, "mA");
});

check("job details, nameplate, inspections and test equipment are never read", () => {
  const all = [switchgearRow, dryTypeRow, mvBreakerRow].flatMap((row) => builtInReadings(row));
  assert.ok(all.length > 10);
  for (const reading of all) assert.ok(!/serial|amp id|fahrenheit|amps|7\.1|test voltage/i.test(reading.label), reading.label);
});

check("transformer readings keep measured and corrected apart", () => {
  assert.equal(readingAt(dryTypeRow, "Primary To Ground · Half Minute")?.value, 3.1);
  assert.equal(readingAt(dryTypeRow, "Primary To Ground · Corrected · Half Minute")?.value, 3.3);
  assert.equal(readingAt(dryTypeRow, "Primary To Ground · Polarization Index")?.value, 1.17);
  assert.equal(readingAt(dryTypeRow, "Primary To Ground · Half Minute")?.unit, "GΩ");
});

check("MV breaker readings take the unit named for their kind of test", () => {
  assert.equal(readingAt(mvBreakerRow, "Pole To Pole Closed P1 P2")?.unit, "GΩ");
  assert.equal(readingAt(mvBreakerRow, "Pole To Frame Closed P1")?.unit, "MΩ");
  assert.equal(readingAt(mvBreakerRow, "As Found · P1")?.value, 30);
  assert.equal(readingAt(mvBreakerRow, "As Left · P1")?.value, 28);
  assert.equal(irOf(mvBreakerRow).length, 5);
});

check("a corrected table with no unit of its own borrows only an unambiguous one", () => {
  assert.equal(readingAt(buswayRow, "Corrected · A To B")?.unit, "MΩ");
  assert.equal(readingAt(mvBreakerRow, "Corrected · Pole To Pole Closed P1 P2")?.unit, undefined);
});

check("flat and saved-as-text reports still read", () => {
  assert.equal(readingAt(lvSwitchRow, "Pole To Pole · P1 P2")?.value, 1200);
  assert.equal(readingAt(lvSwitchRow, "Pole To Frame · P2"), undefined);
  assert.equal(readingAt(textBlobRow, "A-G")?.unit, "MΩ");
});

check("a repeated row name in a list stays two readings", () => {
  const list = { insulationResistanceTests: [{ busSection: "Bus 1", values: { ag: "1" } }, { busSection: "Bus 1", values: { ag: "2" } }] };
  const readings = builtInReadings({ report_info: list });
  assert.equal(readings.length, 2);
  assert.equal(new Set(readings.map((r) => r.fieldKey)).size, 2);
});

check("a report's date is found wherever it's kept", () => {
  assert.deepEqual(builtInReportDate(switchgearRow), { date: "2024-03-02", fromForm: true });
  assert.deepEqual(builtInReportDate(mvBreakerRow), { date: "2022-06-30", fromForm: true });
  assert.deepEqual(builtInReportDate({ report_info: { date: "3/9/2021" } }), { date: "2021-03-09", fromForm: true });
  assert.deepEqual(builtInReportDate({ data: { reportInfo: { date: "2020-01-02" } } }), { date: "2020-01-02", fromForm: true });
  assert.deepEqual(builtInReportDate({ created_at: "2019-05-05T10:00:00Z" }), { date: "2019-05-05", fromForm: false });
});

check("report slugs read as names", () => {
  assert.equal(reportTypeName("switchgear-switchboard-assemblies-ats25"), "Switchgear Switchboard Assemblies ATS25");
  assert.equal(reportTypeName("liquid-filled-xfmr-ats25"), "Liquid Filled Transformer ATS25");
  assert.equal(reportTypeName("panelboard-report"), "Panelboard");
});

const entry = (id: string, reportType: string, date: string, readings: [string, string, number, string?][], group = "Insulation Resistance"): TrendEntry => ({
  id,
  reportType,
  reportTypeName: reportType.toUpperCase(),
  date,
  dateFromForm: true,
  path: `/x/${id}`,
  readings: readings.map(([fieldKey, label, value, unit]) => ({ fieldKey, label, value, unit, group })),
});

const mapping = (id: string, name: string, members: [string, string][], saved = true) => ({
  id,
  name,
  saved,
  members: members.map(([reportType, fieldKey]) => ({ reportType, fieldKey, reportTypeName: reportType, label: fieldKey })),
});

check("the same report type lines up field by field", () => {
  const lines = buildTrendLines([entry("1", "a", "2021-01-01", [["f", "A-G", 1]]), entry("2", "a", "2022-01-01", [["f", "A-G", 2]])], []);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].reportCount, 2);
});

check("a renamed row stays one line and takes its newest name", () => {
  const lines = buildTrendLines([entry("1", "a", "2021-01-01", [["f", "Old", 1]]), entry("2", "a", "2022-01-01", [["f", "New", 2]])], []);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].label, "New");
});

check("like fields on different report types match, whatever the punctuation or case", () => {
  assert.equal(matchKey("Insulation Resistance", "A-G"), matchKey("insulation resistance", "a g"));
  const lines = buildTrendLines([entry("1", "a", "2021-01-01", [["x", "A-G", 1]]), entry("2", "b", "2022-01-01", [["y", "a g", 2]])], []);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].members.length, 2);
});

check("unlike fields stay apart until mapped", () => {
  const entries = [entry("1", "a", "2021-01-01", [["x", "A-G", 1]]), entry("2", "b", "2022-01-01", [["y", "Phase A to Ground", 2]])];
  assert.equal(buildTrendLines(entries, []).length, 2);
  const mapped = buildTrendLines(entries, [mapping("m", "A to ground", [["a", "x"], ["b", "y"]])]);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].label, "A to ground");
  assert.equal(mapped[0].reportCount, 2);
});

check("two fields on one report type never share an automatic line", () => {
  const lines = buildTrendLines([entry("1", "a", "2021-01-01", [["x", "A-G", 1], ["y", "A-G", 2]])], []);
  assert.equal(lines.length, 2);
});

check("a mapping pulls in like fields but beats an automatic match on the same report type", () => {
  const entries = [
    entry("1", "a", "2021-01-01", [["x", "A-G", 1], ["z", "Other", 9]]),
    entry("2", "b", "2022-01-01", [["y", "A-G", 2]]),
    entry("3", "c", "2023-01-01", [["w", "A-G", 3]]),
  ];
  const lines = buildTrendLines(entries, [mapping("m", "Mine", [["a", "z"], ["b", "y"]])]);
  const mine = lines.find((line) => line.mappingId === "m")!;
  assert.deepEqual(mine.members.map((m) => m.fieldKey).sort(), ["w", "y", "z"]);
  assert.ok(lines.some((line) => line.members.length === 1 && line.members[0].fieldKey === "x"));
});

check("a field belongs to the first mapping that names it", () => {
  const entries = [entry("1", "a", "2021-01-01", [["x", "A-G", 1]]), entry("2", "b", "2022-01-01", [["y", "B-G", 2]])];
  const lines = buildTrendLines(entries, [mapping("t", "Now", [["a", "x"], ["b", "y"]], false), mapping("s", "Saved", [["a", "x"], ["b", "y"]])]);
  assert.deepEqual(lines.map((line) => line.label), ["Now"]);
});

check("a mapping for report types not on this asset adds nothing", () => {
  const lines = buildTrendLines([entry("1", "a", "2021-01-01", [["x", "A-G", 1]])], [mapping("m", "Elsewhere", [["q", "x"], ["r", "y"]])]);
  assert.deepEqual(lines.map((line) => line.label), ["A-G"]);
});

check("insulation resistance leads the list and the first view", () => {
  const entries = [
    entry("1", "a", "2021-01-01", [["c", "P1", 1]], "Contact Resistance"),
    entry("2", "a", "2022-01-01", [["i", "A-G", 1], ["j", "B-G", 1]]),
    entry("3", "a", "2023-01-01", [["i", "A-G", 2]]),
  ];
  const lines = buildTrendLines(entries, []);
  assert.equal(groupLines(lines)[0].group, "Insulation Resistance");
  assert.deepEqual(firstLines(lines), [lines.find((line) => line.label === "A-G")!.key]);
  assert.deepEqual(firstLines([]), []);
});

check("the trend runs oldest first and converts units", () => {
  const entries = [entry("2", "a", "2022-01-01", [["f", "A-G", 2, "GΩ"]]), entry("1", "a", "2021-01-01", [["f", "A-G", 1500, "MΩ"]])];
  const lines = buildTrendLines(entries, []);
  const trend = buildLineTrend(entries, lines, "MΩ");
  assert.deepEqual(trend.points.map((p) => p.s_0), [1500, 2000]);
});

check("mixed units on a line land on its usual unit without being asked", () => {
  const entries = [
    entry("1", "a", "2021-01-01", [["f", "A-G", 1500, "MΩ"]]),
    entry("2", "a", "2022-01-01", [["f", "A-G", 1800, "MΩ"]]),
    entry("3", "a", "2023-01-01", [["f", "A-G", 2, "GΩ"]]),
  ];
  const trend = buildLineTrend(entries, buildTrendLines(entries, []));
  assert.deepEqual(trend.points.map((p) => p.s_0), [1500, 1800, 2000]);
  assert.equal(trend.series[0].label, "A-G (MΩ)");
});

check("each line keeps its own scale, so contact resistance isn't flattened by insulation", () => {
  const entries = [entry("1", "a", "2021-01-01", [["f", "A-G", 1500, "MΩ"], ["g", "P1", 22, "μΩ"]])];
  const trend = buildLineTrend(entries, buildTrendLines(entries, []));
  assert.deepEqual([trend.points[0].s_0, trend.points[0].s_1], [1500, 22]);
});

check("converting leaves no float dust", () => {
  const entries = [entry("1", "a", "2021-01-01", [["f", "A-G", 1.1, "GΩ"]])];
  assert.equal(buildLineTrend(entries, buildTrendLines(entries, []), "MΩ").points[0].s_0, 1100);
});

check("a value in the wrong kind of unit is left out, not drawn on the wrong scale", () => {
  const entries = [entry("1", "a", "2021-01-01", [["f", "A-G", 5, "kV"]]), entry("2", "a", "2022-01-01", [["f", "A-G", 7, "MΩ"]])];
  const trend = buildLineTrend(entries, buildTrendLines(entries, []), "MΩ");
  assert.deepEqual(trend.points.map((p) => p.s_0), [7]);
  assert.equal(trend.leftOut, 1);
});

check("the same label from two groups is told apart on the chart", () => {
  const entries = [entry("1", "a", "2021-01-01", [["f", "P1", 1]]), entry("2", "a", "2021-01-01", [["g", "P1", 2]], "Contact Resistance")];
  const trend = buildLineTrend(entries, buildTrendLines(entries, []));
  assert.deepEqual(trend.series.map((s) => s.label), ["Insulation Resistance: P1", "Contact Resistance: P1"]);
});

check("a report with no usable date stays off the chart", () => {
  const entries = [entry("1", "a", "", [["f", "A-G", 1]])];
  assert.equal(buildLineTrend(entries, buildTrendLines(entries, [])).points.length, 0);
  assert.equal(fieldsOn(entries).length, 1);
});

const irTable: any = {
  id: "ir",
  componentType: "insulation-test",
  title: "Insulation Resistance",
  order: 0,
  showInPrint: true,
  rows: 2,
  columns: [
    { id: "name", label: "Circuit", field: { id: "name", type: "text", cellBehavior: "static", staticValue: "1" } },
    { id: "volts", label: "Test Voltage", field: { id: "volts", type: "number" } },
    { id: "ag", label: "A-G", field: { id: "ag", type: "number" } },
  ],
};

check("only results tables trend, and the form builder can overrule", () => {
  assert.equal(isResultsSection(irTable), true);
  assert.equal(isResultsSection({ ...irTable, columns: [] }), false);
  assert.equal(isResultsSection({ ...irTable, componentType: "visual-inspection" }), false);
  assert.equal(isResultsSection({ ...irTable, componentType: "nameplate-data" }), false);
  assert.equal(isResultsSection({ ...irTable, componentType: "test-equipment" }), false);
  assert.equal(isResultsSection({ ...irTable, componentType: "job-info" }), false);
  assert.equal(isResultsSection({ ...irTable, componentType: "custom-table", title: "Visual and Mechanical Inspection" }), false);
  assert.equal(isResultsSection({ ...irTable, componentType: "custom-table", title: "Megger readings" }), true);
  assert.equal(isResultsSection({ ...irTable, componentType: "nameplate-data", trendResults: true }), true);
  assert.equal(isResultsSection({ ...irTable, trendResults: false }), false);
});

check("custom forms give up results, not labels or test conditions", () => {
  const visual = { ...irTable, id: "vi", componentType: "visual-inspection", title: "Visual" };
  const data: any = {
    [rowStateKey("ir", 0)]: { ag: "1500", volts: "1000" },
    [rowStateKey("ir", 1)]: { ag: "1600" },
    [rowStateKey("vi", 0)]: { ag: "1" },
  };
  const readings = customFormReadings({ sections: [irTable, visual] } as any, data);
  assert.deepEqual(readings.map((r) => [r.fieldKey, r.value]), [["ir:ag:0", 1500], ["ir:ag:1", 1600]]);
});

if (failures.length) {
  console.error(`${failures.length} failed, ${passed} passed`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`${passed} checks passed`);
