/**
 * Pull the results out of a built-in report.
 *
 * About fifty report types each store their readings in their own shape, in
 * different database columns. Rather than a hand-written reader per report,
 * this walks the saved data and keeps numbers found under a known results
 * heading (insulation resistance first). Job details, nameplate data, visual
 * inspections and test equipment are never read.
 */

import { readingNumber, type Reading } from "@/lib/trends/readings";

const GROUP_RULES: { name: string; match: RegExp }[] = [
  { name: "Insulation Resistance", match: /insulation_?(resistance)?|dielectric_?absorption|polarization_?index|temperature_?corrected/i },
  { name: "Contact Resistance", match: /(contact|pole|bus|low)_?resistance/i },
  { name: "Winding Resistance", match: /winding_?resistance/i },
  { name: "Fuse Resistance", match: /fuse_?resistance/i },
  { name: "Dielectric Withstand", match: /dielectric_?(withstand)?|withstand(_?test)?/i },
  { name: "Turns Ratio", match: /turns_?ratio/i },
  { name: "Power Factor", match: /power_?factor/i },
  { name: "Primary Injection", match: /primary_?injection/i },
  { name: "Secondary Injection", match: /secondary_?injection/i },
  { name: "Contact Timing", match: /contact_?timing/i },
];

/** Whole branches that aren't results. Test sets share words with the tests they run. */
const NOT_RESULTS =
  /tester|test_?set|ohmmeter|megger|equipment|instrument|nameplate|visual|mechanical|inspection|comment|notes?$|serial|amp_?id|calibration|manufacturer|catalog|customer|address|technician|signature|photo|attachment|^temp(erature)?$/i;

/** Single values next to a reading that describe the test rather than report it. */
const NOT_A_READING =
  /^(test_?voltage|applied_?voltage|voltage|kv|duration|tcf|correction_?factor|temperature|temp|humidity)$|units?$|date$|(^id|_id|[a-z]Id)$/i;

/** Filler words that say nothing about which reading this is. */
const FILLER = /^(readings?|values?|tests?|results?|data|measured|rows?|items?|electrical_?tests?)$/i;

/** What names a row in a list of tests, most specific first. */
const ROW_NAMES = ["busSection", "section", "position", "circuit", "circuitNumber", "cktNumber", "ckt", "identifier", "designation", "winding", "phase", "pole", "tap", "testName", "test", "label", "name", "description", "location"];

const PHASE_PAIR = /^[abcn][abcng]$/i;

const ruleFor = (key: string) => GROUP_RULES.find((rule) => rule.match.test(key));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Some reports keep a whole section as saved JSON text. */
function unpacked(value: unknown): unknown {
  if (typeof value !== "string" || !/^\s*[[{]/.test(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** primaryToGround → "Primary To Ground"; ag → "A-G". */
export function humanizeKey(key: string): string {
  if (PHASE_PAIR.test(key)) return `${key[0]}-${key[1]}`.toUpperCase();
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/** The part of a heading worth keeping once its group is known, e.g. "As Found". */
function headingWords(key: string, rule: { match: RegExp } | undefined): string | null {
  if (/correct/i.test(key)) return "Corrected";
  const rest = (rule ? key.replace(rule.match, "") : key).replace(/_?tests?$/i, "").replace(/^_+|_+$/g, "");
  return !rest || FILLER.test(rest) ? null : humanizeKey(rest);
}

/** Readings are all stored one way internally, so spellings have to agree for conversion. */
export function cleanUnit(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.trim().replace(/Ω/g, "Ω").replace(/µ/g, "μ");
  if (!text) return undefined;
  const ohms = text.match(/^(.*?)\s*(?:ohms?|Ω)$/i);
  if (!ohms) return text;
  const prefix = ohms[1];
  if (/^(mega?|M)$/.test(prefix) || /^mega$/i.test(prefix)) return "MΩ";
  if (/^giga$|^G$/i.test(prefix)) return "GΩ";
  if (/^kilo$|^k$/i.test(prefix)) return "kΩ";
  if (/^milli$|^m$/.test(prefix) || /^milli$/i.test(prefix)) return "mΩ";
  if (/^micro$|^[uμ]$/i.test(prefix)) return "μΩ";
  return prefix ? text : "Ω";
}

/** A unit typed into the cell itself, e.g. "1000 MΩ". */
function typedUnit(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const match = raw.trim().match(/\d\s*([a-zA-ZμµΩΩ°%]+)$/);
  return match ? cleanUnit(match[1]) : undefined;
}

/** Unit fields beside these readings: "" applies to all, others to keys starting with it. */
function unitsBeside(node: Record<string, unknown>): Map<string, string> {
  const units = new Map<string, string>();
  for (const [key, value] of Object.entries(node)) {
    const prefix = key.match(/^(.*?)_?units?$/i);
    const unit = prefix ? cleanUnit(value) : undefined;
    if (prefix && unit) units.set(prefix[1].toLowerCase(), unit);
  }
  return units;
}

function unitFor(key: string, units: Map<string, string>): string | undefined {
  const lower = key.toLowerCase();
  let best: string | undefined;
  let length = 0;
  for (const [prefix, unit] of units) {
    if (prefix && lower.startsWith(prefix) && prefix.length > length) {
      best = unit;
      length = prefix.length;
    }
  }
  return best;
}

/** Every unit recorded under each group, for readings with none beside them. */
function unitsByGroup(root: unknown): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const visit = (raw: unknown, group: string | undefined, depth: number) => {
    const node = unpacked(raw);
    if (depth > 12) return;
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, group, depth + 1));
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (NOT_RESULTS.test(key)) continue;
      const here = ruleFor(key)?.name ?? group;
      const unit = /units?$/i.test(key) ? cleanUnit(value) : undefined;
      if (unit && here) {
        if (!found.has(here)) found.set(here, new Set());
        found.get(here)!.add(unit);
      }
      visit(value, here, depth + 1);
    }
  };
  visit(root, undefined, 0);
  return found;
}

interface Place {
  group?: string;
  /** Words for the label. */
  words: string[];
  /** The same place written stably, for fieldKey. */
  path: string[];
  unit?: string;
}

function rowName(item: unknown): { name: string; key: string } | null {
  if (!isRecord(item)) return null;
  for (const key of ROW_NAMES) {
    const value = item[key];
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = String(value).trim();
    if (!text) continue;
    return { name: /^\d+$/.test(text) ? `${humanizeKey(key)} ${text}` : text, key: text };
  }
  return null;
}

/** Every result saved on a built-in report row. */
export function builtInReadings(row: Record<string, unknown>): Reading[] {
  const found = new Map<string, Reading>();
  const groupUnits = unitsByGroup(row);

  const keep = (place: Place, name: string, keyPart: string, raw: unknown, unit: string | undefined) => {
    if (!place.group) return;
    const value = readingNumber(raw);
    if (value === null) return;
    const onlyUnit = groupUnits.get(place.group);
    const base = `${place.group}/${[...place.path, keyPart].join("/")}`.toLowerCase();
    // A list can repeat a row name; the copies are still separate readings.
    let fieldKey = base;
    let copy = 1;
    while (found.has(fieldKey)) fieldKey = `${base}#${++copy}`;
    const words = [...place.words, name].join(" · ");
    found.set(fieldKey, {
      fieldKey,
      group: place.group,
      label: copy > 1 ? `${words} (${copy})` : words,
      value,
      unit: typedUnit(raw) ?? unit ?? place.unit ?? (onlyUnit?.size === 1 ? [...onlyUnit][0] : undefined),
    });
  };

  const walk = (raw: unknown, place: Place, depth: number) => {
    const node = unpacked(raw);
    if (depth > 12) return;
    if (Array.isArray(node)) {
      node.forEach((item, i) => {
        const named = rowName(item);
        const name = named?.name ?? `Row ${i + 1}`;
        const key = named?.key ?? String(i);
        if (isRecord(item) || Array.isArray(item)) {
          walk(item, { ...place, words: [...place.words, name], path: [...place.path, key] }, depth + 1);
        } else {
          keep(place, `#${i + 1}`, String(i), item, undefined);
        }
      });
      return;
    }
    if (!isRecord(node)) return;

    const units = unitsBeside(node);
    const here: Place = { ...place, unit: units.get("") ?? place.unit };
    for (const [key, entry] of Object.entries(node)) {
      if (NOT_RESULTS.test(key)) continue;
      const value = unpacked(entry);
      const rule = ruleFor(key);
      if (isRecord(value) || Array.isArray(value)) {
        const group = rule?.name ?? here.group;
        const fresh = group !== here.group;
        const words = group ? headingWords(key, rule) : null;
        walk(
          value,
          {
            group,
            words: fresh ? (words ? [words] : []) : words ? [...here.words, words] : here.words,
            path: fresh ? (words ? [key] : []) : words ? [...here.path, key] : here.path,
            unit: unitFor(key, units) ?? (fresh ? undefined : here.unit),
          },
          depth + 1,
        );
      } else if (!NOT_A_READING.test(key) && !ROW_NAMES.includes(key)) {
        const leaf = here.group ? here : { ...here, group: rule?.name };
        keep(leaf, humanizeKey(key), key, value, unitFor(key, units));
      }
    }
  };

  walk(row, { words: [], path: [] }, 0);
  return [...found.values()];
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!us) return null;
  const year = us[3].length === 2 ? `20${us[3]}` : us[3];
  return `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
}

/** A built-in report's test date, wherever that report keeps it; else when it was created. */
export function builtInReportDate(row: Record<string, unknown>): { date: string; fromForm: boolean } {
  const places: unknown[] = [row.report_info, row.report_data, row.data, row];
  for (const raw of [...places]) {
    const place = unpacked(raw);
    if (isRecord(place)) places.push(place.reportInfo, place.report_info);
  }
  for (const raw of places) {
    const place = unpacked(raw);
    if (!isRecord(place)) continue;
    for (const key of ["date", "testDate", "test_date", "reportDate"]) {
      const date = isoDate(place[key]);
      if (date) return { date, fromForm: true };
    }
  }
  return { date: String(row.created_at ?? "").slice(0, 10), fromForm: false };
}

/** "switchgear-switchboard-assemblies-ats25" → "Switchgear Switchboard Assemblies ATS25". */
export function reportTypeName(slug: string): string {
  return slug
    .split("-")
    .filter((word) => word && word !== "report")
    .map((word) => {
      if (/^(ats|mts|mv|lv|vlf|ct|pt|vfi)\d*$/i.test(word)) return word.toUpperCase();
      if (/^xfmr$/i.test(word)) return "Transformer";
      return word[0].toUpperCase() + word.slice(1);
    })
    .join(" ");
}
