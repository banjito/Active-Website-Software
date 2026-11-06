/**
 * Decide which fields are "the same reading" across reports, then chart them.
 *
 * Same report type: same field. Different report types: fields whose group and
 * label read alike. Anything else needs a mapping, which a person makes in the
 * Trends window. A mapping always beats an automatic match.
 */

import { convertReading } from "@/lib/customForms/unitResolution";
import { matchKey, type Reading, type TrendEntry } from "@/lib/trends/readings";

export interface FieldRef {
  reportType: string;
  fieldKey: string;
}

export interface MappingMember extends FieldRef {
  reportTypeName: string;
  label: string;
}

/** "These fields are one reading." */
export interface TrendMapping {
  id: string;
  name: string;
  members: MappingMember[];
  /** False for a comparison that only lasts while the window is open. */
  saved: boolean;
}

/** One selectable line on the chart. */
export interface TrendLine {
  key: string;
  group: string;
  label: string;
  members: FieldRef[];
  /** How many reports have a value for this line. */
  reportCount: number;
  mappingId?: string;
}

export interface FieldInfo extends FieldRef {
  reportTypeName: string;
  group: string;
  label: string;
}

const refKey = (ref: FieldRef) => `${ref.reportType}\u0000${ref.fieldKey}`;

const byDate = (entries: TrendEntry[]) => [...entries].sort((a, b) => a.date.localeCompare(b.date));

/** Every field on these reports. Row names can change, so the newest report names each one. */
export function fieldsOn(entries: TrendEntry[]): FieldInfo[] {
  const fields = new Map<string, FieldInfo>();
  for (const entry of byDate(entries)) {
    for (const reading of entry.readings) {
      const ref = { reportType: entry.reportType, fieldKey: reading.fieldKey };
      const key = refKey(ref);
      const field = { ...ref, reportTypeName: entry.reportTypeName, group: reading.group, label: reading.label };
      // Re-set so a field keeps its first position but takes its newest name.
      if (fields.has(key)) Object.assign(fields.get(key)!, field);
      else fields.set(key, field);
    }
  }
  return [...fields.values()];
}

/** Which fields auto-match. Two fields on one report type are never the same reading. */
function likeFields(fields: FieldInfo[]): Map<string, FieldInfo[]> {
  const like = new Map<string, FieldInfo[]>();
  for (const field of fields) {
    const base = matchKey(field.group, field.label);
    let key = base;
    let copy = 1;
    while (like.get(key)?.some((other) => other.reportType === field.reportType)) key = `${base}#${++copy}`;
    like.set(key, [...(like.get(key) ?? []), field]);
  }
  return like;
}

export function buildTrendLines(entries: TrendEntry[], mappings: TrendMapping[]): TrendLine[] {
  const fields = fieldsOn(entries);
  const known = new Map(fields.map((field) => [refKey(field), field]));
  const like = likeFields(fields);
  const lineOf = new Map<string, FieldInfo[]>();
  for (const members of like.values()) for (const field of members) lineOf.set(refKey(field), members);

  const taken = new Set<string>();
  const lines: Omit<TrendLine, "reportCount">[] = [];

  for (const mapping of mappings) {
    const chosen: FieldInfo[] = [];
    for (const member of mapping.members) {
      const field = known.get(refKey(member));
      if (!field || taken.has(refKey(field)) || chosen.some((c) => c.reportType === field.reportType)) continue;
      chosen.push(field);
    }
    if (!chosen.length) continue;
    // Fields already alike come along, unless the mapping named another field on that report type.
    const types = new Set(chosen.map((field) => field.reportType));
    const members = [...chosen];
    for (const field of chosen) {
      for (const other of lineOf.get(refKey(field)) ?? []) {
        if (types.has(other.reportType) || taken.has(refKey(other))) continue;
        types.add(other.reportType);
        members.push(other);
      }
    }
    members.forEach((field) => taken.add(refKey(field)));
    lines.push({
      key: `map:${mapping.id}`,
      group: chosen[0].group,
      label: mapping.name,
      members: members.map(({ reportType, fieldKey }) => ({ reportType, fieldKey })),
      mappingId: mapping.id,
    });
  }

  for (const [key, members] of like) {
    const free = members.filter((field) => !taken.has(refKey(field)));
    if (!free.length) continue;
    lines.push({
      key: `auto:${key}`,
      group: free[0].group,
      label: free[0].label,
      members: free.map(({ reportType, fieldKey }) => ({ reportType, fieldKey })),
    });
  }

  return lines.map((line) => ({
    ...line,
    reportCount: entries.filter((entry) => readingOn(entry, line)).length,
  }));
}

function readingOn(entry: TrendEntry, line: Pick<TrendLine, "members">): Reading | undefined {
  const member = line.members.find((m) => m.reportType === entry.reportType);
  return member && entry.readings.find((reading) => reading.fieldKey === member.fieldKey);
}

/** Lines by group, insulation resistance first: those are the values most often trended. */
export function groupLines(lines: TrendLine[]): { group: string; lines: TrendLine[] }[] {
  const groups = new Map<string, TrendLine[]>();
  for (const line of lines) groups.set(line.group, [...(groups.get(line.group) ?? []), line]);
  const list = [...groups].map(([group, members]) => ({ group, lines: members }));
  const rank = (group: string) => (/insulation/i.test(group) ? 0 : 1);
  return list.map((item, i) => ({ item, i })).sort((a, b) => rank(a.item.group) - rank(b.item.group) || a.i - b.i).map(({ item }) => item);
}

/** What to show first: the top group's lines, the ones with history leading. */
export function firstLines(lines: TrendLine[], limit = 4): string[] {
  const top = groupLines(lines)[0]?.lines ?? [];
  const most = Math.max(0, ...top.map((line) => line.reportCount));
  return top.filter((line) => line.reportCount === most).slice(0, limit).map((line) => line.key);
}

export interface LinePoint {
  instanceId: string;
  t: number;
  date: string;
  [seriesKey: string]: number | string | null;
}

/** The unit most of a line's readings use. The earliest wins a tie. */
function usualUnit(entries: TrendEntry[], line: TrendLine): string | undefined {
  const counts = new Map<string, number>();
  for (const entry of byDate(entries)) {
    const unit = readingOn(entry, line)?.unit;
    if (unit) counts.set(unit, (counts.get(unit) ?? 0) + 1);
  }
  let best: string | undefined;
  for (const [unit, count] of counts) if (best === undefined || count > counts.get(best)!) best = unit;
  return best;
}

/** Conversion leaves float dust, e.g. 1650.0000000000002. */
const tidy = (value: number) => Number(value.toPrecision(10));

/**
 * One point per report (oldest first), one value per line. Each line sits on one
 * scale: the unit asked for, else its own usual unit, so 1500 MΩ then 2 GΩ reads
 * as a rise. A value that can't convert is counted in `leftOut`, never drawn on
 * the wrong scale.
 */
export function buildLineTrend(entries: TrendEntry[], lines: TrendLine[], unit?: string): {
  series: { key: string; label: string }[];
  points: LinePoint[];
  leftOut: number;
} {
  const repeated = (line: TrendLine) => lines.filter((other) => other.label === line.label).length > 1;
  const scales = lines.map((line) => unit ?? usualUnit(entries, line));
  const series = lines.map((line, i) => {
    const name = repeated(line) ? `${line.group}: ${line.label}` : line.label;
    return { key: `s_${i}`, label: !unit && scales[i] ? `${name} (${scales[i]})` : name };
  });

  const points: LinePoint[] = [];
  let leftOut = 0;
  for (const entry of byDate(entries)) {
    const t = Date.parse(`${entry.date}T00:00:00`);
    if (!Number.isFinite(t)) continue;
    const point: LinePoint = { instanceId: entry.id, t, date: entry.date };
    let any = false;
    lines.forEach((line, i) => {
      const reading = readingOn(entry, line);
      const scale = scales[i];
      const value = !reading ? null : scale ? convertReading(reading.value, reading.unit, scale) : reading.value;
      if (reading && value === null) leftOut += 1;
      point[`s_${i}`] = value === null ? null : tidy(value);
      if (value !== null) any = true;
    });
    if (any) points.push(point);
  }
  return { series, points, leftOut };
}
