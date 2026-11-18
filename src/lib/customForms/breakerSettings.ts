/**
 * Breaker Settings: study settings pasted into a report, As-Left typed by the tech.
 *
 * The form itself holds no study values. Each report keeps its breakers at
 * formData[sectionId].breakers, so one template works for every job. Office
 * staff paste rows copied from a spreadsheet; the tech fills As-Left, and each
 * As-Left cell is checked against its setting (green match, red mismatch).
 * The check never changes the report's result.
 */

export interface BreakerSettingRow {
  id: string;
  setting: string;
  /** Set A ("Set To" on a breaker with one setting group). Stored as `normal`. */
  normal: string;
  /** Set B, the second setting group (e.g. ERMS). Stored as `erms`. */
  erms?: string;
  asLeftNormal?: string;
  asLeftErms?: string;
  /** As-Left I²t (On/Off) for a delay row whose setting carries I²t. */
  asLeftNormalI2t?: string;
  asLeftErmsI2t?: string;
}

// ---------------------------------------------------------------------------
// Trip functions: the ATS-report table layout (Function | Setting | Delay | I²t)
// ---------------------------------------------------------------------------

export type TripFunction = "lt" | "st" | "inst" | "gf";
export type TripPart = "pickup" | "delay" | "override";

export const TRIP_FUNCTIONS: { key: TripFunction; label: string }[] = [
  { key: "lt", label: "Long Time" },
  { key: "st", label: "Short Time" },
  { key: "inst", label: "Instantaneous" },
  { key: "gf", label: "Ground Fault" },
];

const SETTING_NAMES: [RegExp, TripFunction, TripPart][] = [
  [/override|^inst(antaneous)?\s+or\b/, "inst", "override"],
  [/^(lt|long\s*time)\s*(delay|d)\b|^ltd\b|^tr\b/, "lt", "delay"],
  [/^(lt|long\s*time)\s*(pickup|pu|setting)\b|^ltpu\b|^ir\b/, "lt", "pickup"],
  [/^(st|short\s*time)\s*(delay|d)\b|^std\b|^tsd\b/, "st", "delay"],
  [/^(st|short\s*time)\s*(pickup|pu|setting)\b|^stpu\b|^isd\b/, "st", "pickup"],
  [/^(gf|ground\s*fault)\s*(delay|d)\b|^gfd\b|^tg\b/, "gf", "delay"],
  [/^(gf|ground\s*fault)\s*(pickup|pu|setting)\b|^gfpu\b|^ig\b/, "gf", "pickup"],
  [/^(inst|instantaneous)\b|^ii\b/, "inst", "pickup"],
];

/** Which function and part a setting name is: "tsd" → Short Time delay. */
export function classifySetting(name: string): { fn: TripFunction; part: TripPart } | null {
  const text = String(name ?? "").toLowerCase().trim();
  const found = SETTING_NAMES.find(([pattern]) => pattern.test(text));
  return found ? { fn: found[1], part: found[2] } : null;
}

const I2T = /[,;]?\s*\(?\s*i\s*(?:²|\^?\s*2)\s*t\s*[:=]?\s*(on|off|in|out)\s*\)?/i;

/** "0.4 (I²t On)" → "0.4" + "On"; "0.4, I²t ON" → "0.4" + "On"; "0.5" → "0.5". */
export function splitI2t(value: string | undefined): { value: string; i2t?: string } {
  const text = String(value ?? "");
  const m = text.match(I2T);
  if (!m) return { value: text };
  const word = m[1].toLowerCase();
  return {
    value: text.replace(m[0], " ").replace(/\s+/g, " ").replace(/[,;\s]+$/, "").trim(),
    i2t: word[0].toUpperCase() + word.slice(1),
  };
}

export interface FunctionRow {
  fn: TripFunction;
  label: string;
  pickup?: BreakerSettingRow;
  delay?: BreakerSettingRow;
}

export interface FunctionLayout {
  rows: FunctionRow[];
  hasDelay: boolean;
  /** Any delay with I²t, per set. */
  hasI2t: { a: boolean; b: boolean };
  overrides: BreakerSettingRow[];
  /** Settings that don't belong to a trip function (e.g. "Trip rating"). */
  others: BreakerSettingRow[];
}

export type SettingSet = "a" | "b";

/** The study value, As-Left and As-Left I²t keys of a row for Set A or Set B. */
export const SET_KEYS = {
  a: { study: "normal", asLeft: "asLeftNormal", asLeftI2t: "asLeftNormalI2t" },
  b: { study: "erms", asLeft: "asLeftErms", asLeftI2t: "asLeftErmsI2t" },
} as const;

export function functionLayout(block: BreakerBlock): FunctionLayout {
  const slots = new Map<TripFunction, FunctionRow>();
  const overrides: BreakerSettingRow[] = [];
  const others: BreakerSettingRow[] = [];
  for (const row of block.rows) {
    const kind = classifySetting(row.setting);
    if (!kind) {
      others.push(row);
      continue;
    }
    if (kind.part === "override") {
      overrides.push(row);
      continue;
    }
    const label = TRIP_FUNCTIONS.find((f) => f.key === kind.fn)!.label;
    const slot = slots.get(kind.fn) ?? { fn: kind.fn, label };
    const part = kind.part as "pickup" | "delay";
    if (slot[part]) others.push(row);
    else slot[part] = row;
    slots.set(kind.fn, slot);
  }
  const rows = TRIP_FUNCTIONS.map((f) => slots.get(f.key)).filter((r): r is FunctionRow => !!r);
  const i2tIn = (set: SettingSet) =>
    rows.some((r) => r.delay && !!splitI2t(r.delay[SET_KEYS[set].study]).i2t);
  return {
    rows,
    hasDelay: rows.some((r) => r.delay),
    hasI2t: { a: i2tIn("a"), b: block.erms && i2tIn("b") },
    overrides,
    others,
  };
}

/**
 * Every As-Left check on a breaker: [study value, As-Left]. A delay with I²t
 * is two checks (the delay, and I²t). Overrides are fixed, so not checked.
 */
export function asLeftChecks(block: BreakerBlock): [string | undefined, string | undefined][] {
  const checks: [string | undefined, string | undefined][] = [];
  const sets: SettingSet[] = block.erms ? ["a", "b"] : ["a"];
  for (const row of block.rows) {
    const kind = classifySetting(row.setting);
    if (kind?.part === "override") continue;
    for (const set of sets) {
      const keys = SET_KEYS[set];
      const study = row[keys.study];
      const split: { value?: string; i2t?: string } = kind?.part === "delay" ? splitI2t(study) : { value: study };
      checks.push([split.value, row[keys.asLeft]]);
      if (split.i2t) checks.push([split.i2t, row[keys.asLeftI2t]]);
    }
  }
  return checks;
}

/** A box the tech fills, e.g. "Ckt #" or "Sensor reads (A)". */
export interface BreakerInput {
  id: string;
  label: string;
  value?: string;
}

/** The mini-nameplate shown at the top of each breaker. */
export const NAMEPLATE_FIELDS = [
  { key: "title", label: "Breaker Identifier" },
  { key: "equipment", label: "Equipment Identifier" },
  { key: "equipmentSection", label: "Equipment Section" },
  { key: "breakerType", label: "Breaker Type" },
  { key: "tripUnitType", label: "Trip Unit Type" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "model", label: "Model" },
  { key: "frame", label: "Frame (A)" },
  { key: "sensor", label: "Sensor (A)" },
  { key: "plug", label: "Plug (A)" },
] as const;

export type NameplateKey = (typeof NAMEPLATE_FIELDS)[number]["key"];

export interface BreakerBlock {
  id: string;
  /** Heading the block sits under, e.g. "Section 5" or "DP-P1.A1-1 — Feeders". */
  group?: string;
  /** Breaker Identifier, e.g. "CB DIESEL GENSET" or "52G — Generator Input". */
  title: string;
  /** Equipment Identifier: the gear it sits in (SKM "BusConnectedName"). */
  equipment?: string;
  /** Section of that equipment, e.g. "Section 1": a second sort level when grouping. */
  equipmentSection?: string;
  /** e.g. "Static Trip", "Thermal Mag". */
  breakerType?: string;
  /** e.g. "Micrologic 6.0X". */
  tripUnitType?: string;
  manufacturer?: string;
  model?: string;
  frame?: string;
  sensor?: string;
  plug?: string;
  studyId?: string;
  /** Free-text breaker line from the entry-form layout, e.g. "MTZ3-H 5000AF / 5000 A sensor, …". */
  breaker?: string;
  /** Two setting groups (Set A and Set B) instead of one. Stored as `erms`. */
  erms: boolean;
  rows: BreakerSettingRow[];
  notes: string[];
  inputs?: BreakerInput[];
}

export const BREAKERS_KEY = "breakers";
/** formData[sectionId].groupBy: "equipment" shows breakers under their Equipment Identifier. */
export const GROUP_BY_KEY = "groupBy";

export function readBreakers(sectionData: unknown): BreakerBlock[] {
  const list = (sectionData as Record<string, unknown> | undefined)?.[BREAKERS_KEY];
  return Array.isArray(list) ? (list as BreakerBlock[]) : [];
}

export function readGroupBy(sectionData: unknown): "equipment" | null {
  return (sectionData as Record<string, unknown> | undefined)?.[GROUP_BY_KEY] === "equipment" ? "equipment" : null;
}

export const NO_EQUIPMENT = "No Equipment Identifier";
export const NO_SECTION = "No Equipment Section";

export interface SectionGroup {
  /** "" when no breaker in the equipment has a section (no sub-headings). */
  section: string;
  breakers: BreakerBlock[];
}

export interface EquipmentGroup {
  equipment: string;
  sections: SectionGroup[];
  /** Every breaker of the equipment, in shown order. */
  breakers: BreakerBlock[];
}

/** Natural order ("2" before "10"), with the "no value" bucket last. */
function bucketsInOrder(blocks: BreakerBlock[], keyOf: (b: BreakerBlock) => string, none: string) {
  const buckets = new Map<string, BreakerBlock[]>();
  for (const block of blocks) {
    const key = keyOf(block) || none;
    buckets.set(key, [...(buckets.get(key) ?? []), block]);
  }
  return [...buckets.entries()].sort(([a], [b]) => {
    if (a === none) return 1;
    if (b === none) return -1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
}

/**
 * Breakers under their Equipment Identifier, then under their Equipment
 * Section. Both in natural order ("SEC 2" before "SEC 10"); breakers keep
 * their order inside each; blanks come last.
 */
export function groupByEquipment(blocks: BreakerBlock[]): EquipmentGroup[] {
  return bucketsInOrder(blocks, (b) => b.equipment?.trim() ?? "", NO_EQUIPMENT).map(([equipment, inEquipment]) => {
    const hasSections = inEquipment.some((b) => b.equipmentSection?.trim());
    const sections: SectionGroup[] = hasSections
      ? bucketsInOrder(inEquipment, (b) => b.equipmentSection?.trim() ?? "", NO_SECTION).map(([section, breakers]) => ({
          section,
          breakers,
        }))
      : [{ section: "", breakers: inEquipment }];
    return { equipment, sections, breakers: sections.flatMap((s) => s.breakers) };
  });
}

let idCounter = 0;
export function newBreakerId(prefix = "b"): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function emptyBreaker(erms = false): BreakerBlock {
  return {
    id: newBreakerId("brk"),
    title: "New breaker",
    erms,
    rows: ["Ir", "tr", "Isd", "tsd", "Ii", "Ig", "tg"].map((setting) => ({
      id: newBreakerId("row"),
      setting,
      normal: "",
      ...(erms ? { erms: "" } : {}),
    })),
    notes: [],
  };
}

// ---------------------------------------------------------------------------
// As-Left check
// ---------------------------------------------------------------------------

export type SettingMatch = "match" | "mismatch" | "none";

/**
 * Text reduced to what has to agree. Ignores capitals, spaces, commas,
 * brackets, the amps in brackets "(4000 A)", "REV", "Plug", "A" after a
 * number, I²t written as I2t / I^2 T, and number formatting (0.0 = 0, .4 = 0.4).
 * Two numbers stay apart: "1; 0.98" never equals "10.98".
 */
export function normalizeSetting(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/²/g, "2")
    .replace(/i\s*\^?\s*2\s*t/g, "i2t")
    .replace(/\^/g, "")
    .replace(/\(\s*[\d.,]+\s*(?:amps?|a)\s*\)/g, " ")
    .replace(/[()[\]]/g, " ")
    .replace(/\brev\b/g, " ")
    .replace(/\bplug\b/g, " ")
    .replace(/(\d)\s*(?:amps?|a)\b/g, "$1")
    .replace(/\d*\.?\d+/g, (n) => {
      const value = Number.parseFloat(n);
      return Number.isFinite(value) ? String(value) : n;
    })
    .replace(/(\d)[\s,;:]+(?=[\d.])/g, "$1|")
    .replace(/[\s,;:]+/g, "");
}

/**
 * One SKM settings line split into the setting and its value:
 * "LTPU (lo x Ir x S) 1; 0.98 (2940A)" → "LTPU (lo x Ir x S)" + "1; 0.98 (2940A)",
 * "INST OR Fixed (2277A)" → "INST OR" + "Fixed (2277A)", "tsd 0.0 (I^2 T Off)" → "tsd" + "0.0 (I^2 T Off)".
 */
export function splitSettingLine(line: string): { setting: string; value: string } {
  const text = String(line ?? "").replace(/\s+/g, " ").trim();
  const first = text.match(/^\S+/)?.[0] ?? "";
  let name = first;
  let rest = text.slice(first.length).trim();
  // More ALL-CAPS words belong to the name ("INST OR"), when a value still follows.
  for (let m = rest.match(/^([A-Z]{2,})\s+(\S.*)$/); m; m = rest.match(/^([A-Z]{2,})\s+(\S.*)$/)) {
    name += ` ${m[1]}`;
    rest = m[2];
  }
  // A bracket straight after the name describes it ("(lo x Ir x S)"), when a value still follows.
  const descriptor = rest.match(/^(\([^)]*\))\s+(\S.*)$/);
  if (descriptor) {
    name += ` ${descriptor[1]}`;
    rest = descriptor[2];
  }
  return { setting: name, value: rest };
}

/** Settings with nothing to compare against: blank, N/A, or "Verify …". */
export function isCheckableSetting(setting: string | undefined): boolean {
  const text = String(setting ?? "").trim();
  if (!text || /^(n\/?a|-+|—)$/i.test(text)) return false;
  if (/^verify\b/i.test(text)) return false;
  return normalizeSetting(text) !== "";
}

export function settingMatch(setting: string | undefined, asLeft: string | undefined): SettingMatch {
  if (!String(asLeft ?? "").trim() || !isCheckableSetting(setting)) return "none";
  return normalizeSetting(setting!) === normalizeSetting(asLeft!) ? "match" : "mismatch";
}

export interface BreakerProgress {
  breakers: number;
  cells: number;
  entered: number;
  mismatched: number;
}

export function breakerProgress(blocks: BreakerBlock[]): BreakerProgress {
  const progress: BreakerProgress = { breakers: blocks.length, cells: 0, entered: 0, mismatched: 0 };
  for (const block of blocks) {
    for (const [setting, asLeft] of asLeftChecks(block)) {
      progress.cells += 1;
      if (String(asLeft ?? "").trim()) progress.entered += 1;
      if (settingMatch(setting, asLeft) === "mismatch") progress.mismatched += 1;
    }
  }
  return progress;
}

// ---------------------------------------------------------------------------
// Paste
// ---------------------------------------------------------------------------

/** Rows of cells from text copied out of a spreadsheet (tab separated, Excel quoting). */
export function parseClipboardGrid(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = String(text ?? "").replace(/\r*\n|\r/g, "\n");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.replace(/\s+/g, " ").trim()));
}

export interface PasteResult {
  breakers: BreakerBlock[];
  /** Which layout was recognised. */
  layout: "skm" | "sheet" | "blocks" | "list" | null;
  error?: string;
}

const BULLET = /^[•·*\-–]\s*/;
const STUDY_ID = /^study\s*id\s*:?\s*/i;
const BREAKER_LINE = /^breaker\s*:\s*/i;
const BLANK_RUN = /_{3,}/;

const nonEmpty = (row: string[] | undefined) => (row ?? []).filter((c) => c !== "");
const firstText = (row: string[] | undefined) => nonEmpty(row)[0] ?? "";
const cleanGroup = (text: string) => text.replace(/\s*\(cont\.?\)\s*/gi, " ").replace(/\s+/g, " ").trim();

function isHeading(row: string[] | undefined): boolean {
  const cells = nonEmpty(row);
  if (cells.length !== 1) return false;
  const text = cells[0];
  return (
    !BULLET.test(text) &&
    !/^\d+\.\s/.test(text) &&
    !/^notes?$/i.test(text) &&
    !STUDY_ID.test(text) &&
    !BREAKER_LINE.test(text) &&
    text.length <= 90
  );
}

/** "Feeder – FWU-103-01   Ckt # ______" → title plus a "Ckt #" box. */
function splitBlanks(text: string): { text: string; labels: string[] } {
  const labels: string[] = [];
  const cleaned = text
    // The label is at most two words right before the blank ("Ckt #").
    .replace(/([A-Za-z#][\w#./-]*(?: [\w#./-]+)?)\s*_{3,}/g, (_m, label: string) => {
      labels.push(label.trim());
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { text: cleaned, labels };
}

type ColumnRole = "setting" | "normal" | "erms" | "asLeftNormal" | "asLeftErms";

function headerRoles(header: string[]): Map<number, ColumnRole> {
  const roles = new Map<number, ColumnRole>();
  header.forEach((raw, index) => {
    const label = raw.toLowerCase().replace(/\s+/g, " ").trim();
    if (!label) return;
    if (/^setting$/.test(label)) roles.set(index, "setting");
    else if (/^as[- ]?left( normal| set a)?$/.test(label)) roles.set(index, "asLeftNormal");
    else if (/^as[- ]?left (erms|set b)$/.test(label)) roles.set(index, "asLeftErms");
    else if (/^(set a|normal|set to|value|setting value)$/.test(label)) roles.set(index, "normal");
    else if (/^(set b|erms)$/.test(label)) roles.set(index, "erms");
  });
  return roles;
}

/**
 * The layout of the PMDC-style entry form: a title row, "Study ID: …",
 * "Breaker: …", a "Setting | Normal | ERMS | As-Left …" header, setting rows,
 * then "Notes" and bullet lines. Headings between blocks become the group.
 */
function parseBlocks(grid: string[][]): BreakerBlock[] {
  const studyRows = grid
    .map((row, index) => (STUDY_ID.test(firstText(row)) ? index : -1))
    .filter((index) => index >= 0);
  const blocks: BreakerBlock[] = [];
  let group = "";
  let prevEnd = -1;

  for (const studyIndex of studyRows) {
    if (studyIndex <= prevEnd) continue;
    // Title: the nearest filled row above the Study ID line.
    let titleIndex = studyIndex - 1;
    while (titleIndex > prevEnd && !firstText(grid[titleIndex])) titleIndex -= 1;
    const titleText = titleIndex > prevEnd ? nonEmpty(grid[titleIndex]).join(" ") : "";
    for (let i = prevEnd + 1; i < titleIndex; i += 1) {
      if (isHeading(grid[i])) group = cleanGroup(firstText(grid[i]));
    }

    const inputs: BreakerInput[] = [];
    const title = splitBlanks(titleText);
    title.labels.forEach((label) => inputs.push({ id: newBreakerId("in"), label }));

    const studyId = firstText(grid[studyIndex]).replace(STUDY_ID, "").trim();
    if (BLANK_RUN.test(studyId)) inputs.push({ id: newBreakerId("in"), label: "Complete the Study ID" });

    // Lines between Study ID and the Setting header: Breaker, then fill-in boxes.
    let breaker = "";
    let cursor = studyIndex + 1;
    let headerIndex = -1;
    for (; cursor < grid.length; cursor += 1) {
      const text = firstText(grid[cursor]);
      if (!text) continue;
      if (/^setting$/i.test(text)) {
        headerIndex = cursor;
        break;
      }
      if (STUDY_ID.test(text)) break;
      if (BREAKER_LINE.test(text) && !breaker) breaker = text.replace(BREAKER_LINE, "").trim();
      else if (cursor - studyIndex <= 4) {
        inputs.push({ id: newBreakerId("in"), label: text.replace(/[:\s_]+$/, "").trim() });
      } else break;
    }
    if (headerIndex < 0) continue;

    const roles = headerRoles(grid[headerIndex]);
    const erms = [...roles.values()].includes("erms");
    const rows: BreakerSettingRow[] = [];
    cursor = headerIndex + 1;
    for (; cursor < grid.length; cursor += 1) {
      const row = grid[cursor];
      const text = row[0] ?? "";
      if (!text || /^notes?$/i.test(text) || STUDY_ID.test(text) || nonEmpty(row).length < 2) break;
      const setting: BreakerSettingRow = { id: newBreakerId("row"), setting: text, normal: "" };
      roles.forEach((role, index) => {
        if (role === "setting") return;
        const value = row[index] ?? "";
        if (role === "erms") setting.erms = value;
        else if (role === "normal") setting.normal = value;
        else if (value) setting[role] = value;
      });
      if (erms && setting.erms == null) setting.erms = "";
      rows.push(setting);
    }

    const notes: string[] = [];
    let end = cursor - 1;
    if (/^notes?$/i.test(firstText(grid[cursor]))) {
      end = cursor;
      for (cursor += 1; cursor < grid.length; cursor += 1) {
        const text = firstText(grid[cursor]);
        if (!text || nonEmpty(grid[cursor]).length !== 1) break;
        if (!BULLET.test(text) && notes.length > 0) break;
        notes.push(text.replace(BULLET, "").trim());
        end = cursor;
      }
    }
    prevEnd = end;

    blocks.push({
      id: newBreakerId("brk"),
      ...(group ? { group } : {}),
      title: title.text || "Breaker",
      ...(studyId ? { studyId } : {}),
      ...(breaker ? { breaker } : {}),
      erms,
      rows,
      notes,
      ...(inputs.length ? { inputs } : {}),
    });
  }
  return blocks;
}

type ListRole =
  | "group"
  | NameplateKey
  | "studyId"
  | "setting"
  | "normal"
  | "erms"
  | "note";

/** Column headings the list layout understands (case and spacing don't matter). */
const LIST_HEADINGS: [RegExp, ListRole][] = [
  [/^(group|location)$/, "group"],
  [/^(breaker identifier|breaker id|breaker|device|name)$/, "title"],
  [/^(equipment identifier|equipment id|equipment|bus|busconnectedname)$/, "equipment"],
  [/^(equipment section|section)$/, "equipmentSection"],
  [/^(breaker type|type|trip type)$/, "breakerType"],
  [/^(trip unit type|trip unit)$/, "tripUnitType"],
  [/^(manufacturer|mfr|make)$/, "manufacturer"],
  [/^(model|frame\/model)$/, "model"],
  [/^frame( \(a\))?$/, "frame"],
  [/^sensor( \(a\))?$/, "sensor"],
  [/^plug( \(a\))?$/, "plug"],
  [/^study ?id$/, "studyId"],
  [/^setting$/, "setting"],
  [/^(set a|normal|set to|value|setting value)$/, "normal"],
  [/^(set b|erms)$/, "erms"],
  [/^notes?$/, "note"],
];

/** Columns of the blank sheet, per setting group, named as the report's tables name them. */
const SHEET_FUNCTIONS: { name: string; parts: string[] }[] = [
  { name: "Long Time", parts: ["Setting", "Setting (A)", "Delay"] },
  { name: "Short Time", parts: ["Setting", "Setting (A)", "Delay", "I²t"] },
  { name: "Instantaneous", parts: ["Setting", "Setting (A)"] },
  { name: "Ground Fault", parts: ["Setting", "Setting (A)", "Delay", "I²t"] },
];

/**
 * The blank sheet offered for download (CSV): one row per breaker, headed
 * with the report's own words: the nameplate labels, then
 * "Set A Long Time Setting", "Set A Long Time Setting (A)", … "Set B …", Notes.
 */
export const LIST_TEMPLATE_HEADINGS = [
  ...NAMEPLATE_FIELDS.map((f) => f.label),
  ...["Set A", "Set B"].flatMap((set) =>
    SHEET_FUNCTIONS.flatMap((f) => f.parts.map((part) => `${set} ${f.name} ${part}`)),
  ),
  "Notes",
];

/** Identity columns of the one-row-per-breaker sheet. */
const WIDE_IDENTITY: [RegExp, NameplateKey | "group" | "studyId" | "note"][] = [
  [/^(breaker|breaker identifier|breaker id|name)$/, "title"],
  [/^(bus|equipment identifier|equipment|busconnectedname)$/, "equipment"],
  [/^(equipment section|section)$/, "equipmentSection"],
  [/^(manufacturer|mfr|make)$/, "manufacturer"],
  [/^model$/, "model"],
  [/^(breaker type|trip type|type)$/, "breakerType"],
  [/^(trip unit type|trip unit)$/, "tripUnitType"],
  [/^frame( \(a\))?$/, "frame"],
  [/^sensor( \(a\))?$/, "sensor"],
  [/^plug( \(a\))?$/, "plug"],
  [/^(group|location)$/, "group"],
  [/^study ?id$/, "studyId"],
  [/^notes?$/, "note"],
];

/**
 * A setting column: "Set A Long Time Setting (A)", "Set B Short Time I²t",
 * and the study provider's older words, "Phase LT Pickup", "ERMS ST Delay",
 * "GF Pickup (A)". The function is required, so a list's plain "Setting"
 * column is never read as one. Override columns are recognised and skipped:
 * an instantaneous override can't be set.
 */
const WIDE_SETTING =
  /^(?:(phase|erms|set a|set b)\s+)?(lt|st|inst|gf|long time|short time|instantaneous|ground fault)\s+(pickup|setting|delay|override|i²t|i2t)( \(a\))?$/;
/** Columns for the second setting group (Set B). */
const SECOND_SET = new Set(["erms", "set b"]);
const FUNCTION_WORDS: Record<string, string> = {
  lt: "lt",
  "long time": "lt",
  st: "st",
  "short time": "st",
  inst: "inst",
  instantaneous: "inst",
  gf: "gf",
  "ground fault": "gf",
};

/** Settings rows, in the order a trip unit lists them. */
const WIDE_ROWS: { band: string; part: string; label: string }[] = [
  { band: "lt", part: "pickup", label: "Long Time Setting" },
  { band: "lt", part: "delay", label: "Long Time Delay" },
  { band: "st", part: "pickup", label: "Short Time Setting" },
  { band: "st", part: "delay", label: "Short Time Delay" },
  { band: "inst", part: "pickup", label: "Instantaneous Setting" },
  { band: "gf", part: "pickup", label: "Ground Fault Setting" },
  { band: "gf", part: "delay", label: "Ground Fault Delay" },
];

/** "0.875" + "3500" → "0.875 (3500 A)". */
function wideValue(dial: string, amps: string): string {
  // A dial already in amps ("880A") with the same amps: say it once.
  const dialAmps = dial.match(/^([\d.]+)\s*a?$/i);
  if (dialAmps && amps && Number.parseFloat(dialAmps[1]) === Number.parseFloat(amps)) return `${amps} A`;
  if (dial && amps) return `${dial} (${amps} A)`;
  if (dial) return dial;
  if (amps) return `${amps} A`;
  return "";
}

/** A delay and its I²t column as one value: "0.4" + "on" → "0.4 (I²t On)". */
function withI2t(delay: string, i2t: string): string {
  const word = i2t.trim();
  if (!word) return delay;
  const shown = `I²t ${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`;
  return delay ? `${delay} (${shown})` : shown;
}

/**
 * One row per breaker: the nameplate columns, then per set and function its
 * Setting, Setting (A), Delay and I²t. Ground fault left blank under Set B
 * takes Set A's, since it is usually one setting for both.
 */
function parseWide(grid: string[][]): BreakerBlock[] | null {
  const label = (raw: string) => raw.toLowerCase().replace(/\s+/g, " ").trim();
  const headerIndex = grid.findIndex((row) => {
    const labels = row.map(label);
    return (
      labels.some((l) => /^(breaker|breaker identifier|breaker id|name)$/.test(l)) &&
      labels.some((l) => WIDE_SETTING.test(l))
    );
  });
  if (headerIndex < 0) return null;

  const identity = new Map<number, (typeof WIDE_IDENTITY)[number][1]>();
  const settings = new Map<number, { second: boolean; band: string; part: string; amps: boolean }>();
  grid[headerIndex].forEach((raw, index) => {
    const l = label(raw);
    const setting = l.match(WIDE_SETTING);
    if (setting) {
      const [, mode, fn, word, amps] = setting;
      if (word === "override") return;
      const part = word === "setting" || word === "pickup" ? "pickup" : word === "delay" ? "delay" : "i2t";
      settings.set(index, { second: SECOND_SET.has(mode ?? ""), band: FUNCTION_WORDS[fn], part, amps: !!amps });
      return;
    }
    const found = WIDE_IDENTITY.find(([pattern]) => pattern.test(l));
    if (found) identity.set(index, found[1]);
  });

  const blocks: BreakerBlock[] = [];
  for (const row of grid.slice(headerIndex + 1)) {
    const block: BreakerBlock = { id: newBreakerId("brk"), title: "", erms: false, rows: [], notes: [] };
    identity.forEach((key, index) => {
      const value = row[index] ?? "";
      if (!value) return;
      if (key === "note") block.notes.push(value);
      else block[key] = value;
    });
    if (!block.title) continue;

    // values[band-part][normal|erms] = { dial, amps }
    const values = new Map<string, Record<"normal" | "erms", { dial: string; amps: string }>>();
    settings.forEach(({ second, band, part, amps }, index) => {
      const value = row[index] ?? "";
      if (!value) return;
      const key = `${band}-${part}`;
      const entry = values.get(key) ?? { normal: { dial: "", amps: "" }, erms: { dial: "", amps: "" } };
      values.set(key, entry);
      const target = second ? entry.erms : entry.normal;
      if (amps) target.amps = value;
      else target.dial = value;
      if (second) block.erms = true;
    });

    for (const { band, part, label: name } of WIDE_ROWS) {
      const entry = values.get(`${band}-${part}`);
      const i2t = part === "delay" ? values.get(`${band}-i2t`) : undefined;
      if (!entry && !i2t) continue;
      const value = (which: "normal" | "erms") => {
        const base = entry ? wideValue(entry[which].dial, entry[which].amps) : "";
        return i2t ? withI2t(base, i2t[which].dial) : base;
      };
      const normal = value("normal");
      let erms = value("erms");
      if (band === "gf" && !erms) erms = normal;
      if (!normal && !erms) continue;
      block.rows.push({ id: newBreakerId("row"), setting: name, normal, erms });
    }
    if (!block.erms) block.rows.forEach((r) => delete r.erms);
    blocks.push(block);
  }
  return blocks;
}

const NAMEPLATE_KEYS = NAMEPLATE_FIELDS.map((f) => f.key).filter((k) => k !== "title");

/**
 * One row per setting with headings, e.g.
 * Breaker Identifier | Equipment Identifier | Breaker Type | Manufacturer | Model |
 * Frame (A) | Sensor (A) | Plug (A) | Setting | Normal | ERMS | Notes.
 * Rows with the same Breaker Identifier (in a run) make one block.
 */
function parseList(grid: string[][]): BreakerBlock[] | null {
  const headerIndex = grid.findIndex((row) => {
    const labels = row.map((c) => c.toLowerCase());
    return (
      labels.includes("setting") &&
      labels.some((l) => /^(breaker identifier|breaker id|breaker|device|name)$/.test(l))
    );
  });
  if (headerIndex < 0) return null;
  const roles = new Map<number, ListRole>();
  grid[headerIndex].forEach((raw, index) => {
    const label = raw.toLowerCase().replace(/\s+/g, " ").trim();
    const found = LIST_HEADINGS.find(([pattern]) => pattern.test(label));
    if (found) roles.set(index, found[1]);
  });

  const blocks: BreakerBlock[] = [];
  let current: BreakerBlock | null = null;
  for (const row of grid.slice(headerIndex + 1)) {
    if (!nonEmpty(row).length) continue;
    const get = (role: ListRole) => {
      for (const [index, r] of roles) if (r === role) return row[index] ?? "";
      return "";
    };
    const title = get("title");
    const group = cleanGroup(get("group"));
    if (title && (!current || current.title !== title || (group && current.group !== group))) {
      current = {
        id: newBreakerId("brk"),
        ...(group ? { group } : {}),
        title,
        erms: false,
        rows: [],
        notes: [],
      };
      blocks.push(current);
    }
    if (!current) continue;
    if (!current.studyId && get("studyId")) current.studyId = get("studyId");
    for (const key of NAMEPLATE_KEYS) {
      if (!current[key] && get(key)) current[key] = get(key);
    }
    const note = get("note");
    if (note && !current.notes.includes(note)) current.notes.push(note);
    const setting = get("setting");
    if (!setting) continue;
    const erms = get("erms");
    if (erms) current.erms = true;
    current.rows.push({ id: newBreakerId("row"), setting, normal: get("normal"), erms });
  }
  for (const block of blocks) {
    if (!block.erms) block.rows.forEach((row) => delete row.erms);
  }
  return blocks;
}

/**
 * The SKM "LV Breakers" report: Name/Type | BusConnectedName | Description |
 * Frame/Model | Frame/Sensor/Plug | Settings. A breaker's first row has its
 * name, bus, manufacturer and model; the next Name/Type cell is the breaker
 * type; the Frame/Sensor/Plug cells run frame, sensor, plug; each Settings
 * cell is one setting and its value.
 */
function parseSkm(grid: string[][]): BreakerBlock[] | null {
  const isHeader = (row: string[]) => {
    const labels = row.map((c) => c.toLowerCase());
    return (
      labels.some((l) => /\bsettings?\b/.test(l)) &&
      labels.some((l) => /frame\/sensor\/plug|busconnectedname/.test(l))
    );
  };
  const headerIndex = grid.findIndex(isHeader);
  if (headerIndex < 0) return null;
  const header = grid[headerIndex].map((c) => c.toLowerCase());
  const col = (pattern: RegExp) => header.findIndex((l) => pattern.test(l));
  const at = {
    name: col(/name\/type|^name\b|lv breakers/),
    bus: col(/busconnectedname/),
    description: col(/description/),
    model: col(/frame\/model/),
    fsp: col(/frame\/sensor\/plug/),
    settings: col(/\bsettings?\b/),
  };
  if (at.settings < 0) return null;
  const cell = (row: string[], index: number) => (index >= 0 ? row[index] ?? "" : "");

  const blocks: BreakerBlock[] = [];
  let current: BreakerBlock | null = null;
  let ratings: string[] = [];
  const finish = () => {
    if (current) {
      // "3000.0A" → "3000": the headings already say (A).
      const amps = (text?: string) =>
        text && /^[\d.]+\s*a$/i.test(text) ? String(Number.parseFloat(text)) : text;
      [current.frame, current.sensor, current.plug] = [amps(ratings[0]), amps(ratings[1]), amps(ratings[2])];
      for (const key of ["frame", "sensor", "plug"] as const) if (!current[key]) delete current[key];
    }
    current = null;
    ratings = [];
  };

  for (const row of grid.slice(headerIndex + 1)) {
    // Headings repeated on each page of the report.
    if (isHeader(row) || /^(lv breakers|name\/type)$/i.test(cell(row, at.name))) continue;
    if (!nonEmpty(row).length) {
      finish();
      continue;
    }
    const name = cell(row, at.name);
    const identity = [cell(row, at.bus), cell(row, at.description), cell(row, at.model)].some(Boolean);
    if (name && (identity || !current)) {
      finish();
      current = {
        id: newBreakerId("brk"),
        title: name,
        erms: false,
        rows: [],
        notes: [],
        ...(cell(row, at.bus) ? { equipment: cell(row, at.bus) } : {}),
        ...(cell(row, at.description) ? { manufacturer: cell(row, at.description) } : {}),
        ...(cell(row, at.model) ? { model: cell(row, at.model) } : {}),
      };
      blocks.push(current);
    } else if (name && current && !current.breakerType) {
      current.breakerType = name;
    }
    if (!current) continue;
    const block: BreakerBlock = current;
    const rating = cell(row, at.fsp);
    if (rating) ratings.push(rating);
    const settingText = cell(row, at.settings);
    if (settingText) {
      const { setting, value } = splitSettingLine(settingText);
      block.rows.push({ id: newBreakerId("row"), setting, normal: value });
    }
  }
  finish();
  return blocks;
}

/** An instantaneous override is fixed by the breaker, not set, so it is left out. */
function withoutOverrides(result: PasteResult): PasteResult {
  for (const block of result.breakers) {
    block.rows = block.rows.filter((row) => classifySetting(row.setting)?.part !== "override");
  }
  return result;
}

export function parseBreakerPaste(text: string): PasteResult {
  return withoutOverrides(readPaste(text));
}

function readPaste(text: string): PasteResult {
  const grid = parseClipboardGrid(text);
  if (!grid.some((row) => nonEmpty(row).length)) {
    return { breakers: [], layout: null, error: "Nothing to read. Copy cells from the spreadsheet, then paste." };
  }
  const skm = parseSkm(grid);
  if (skm && skm.length) return { breakers: skm, layout: "skm" };
  const wide = parseWide(grid);
  if (wide && wide.length) return { breakers: wide, layout: "sheet" };
  const list = parseList(grid);
  if (list && list.length) return { breakers: list, layout: "list" };
  const blocks = parseBlocks(grid);
  if (blocks.length) return { breakers: blocks, layout: "blocks" };
  return {
    breakers: [],
    layout: null,
    error:
      "No breakers found. Copy the heading row too. Paste one of: the breaker settings sheet (one row per breaker: " +
      "Breaker, Bus, Manufacturer, Model, Trip Type, Frame/Sensor/Plug (A), Phase/ERMS/GF Pickup and Delay columns); " +
      "the SKM LV Breakers table (Name/Type … Settings); or a list with headings Breaker Identifier | Setting | Normal.",
  };
}
