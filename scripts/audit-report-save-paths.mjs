#!/usr/bin/env node
/**
 * Static audit for the duplicate-report-row bug.
 *
 * The bug: a save path that INSERTs a new row whenever it cannot see an
 * existing report id. Every way the id gets lost -- a re-mount, a stale
 * closure, two saves racing, an id written only with history.replaceState
 * where react-router's useParams cannot see it -- produces another copy of
 * the same report on the job.
 *
 * The fix pattern lives in src/components/reports/common/reportIdentity.ts:
 * recover the id from the address bar, mint it client-side before the request
 * goes out, and upsert on it.
 *
 * Usage:  node scripts/audit-report-save-paths.mjs [--all]
 *         --all  also list files that pass, not just the ones with findings
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = [
  "src/components/reports",
  "src/components/customForms",
  "src/components/jobs",
  "electron/renderer",
];

const walk = (dir) => {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
};

const linesOf = (src, re) => {
  const hits = [];
  src.split("\n").forEach((line, i) => {
    if (re.test(line)) hits.push(i + 1);
  });
  return hits;
};

// Tables that hold a report/form row. Asset bookkeeping rows (assets,
// job_assets) are supposed to be plain inserts, so they are excluded.
const REPORT_TABLE = /(_reports?|_forms?|_permits?|form_instances|_analysis)$/;
const NOT_REPORT = /^(assets|job_assets|jobs|customers|users|profiles)$/;

/**
 * Every supabase call chain in the file, as { table, op, line }. Matches
 * `.from("x")` and the first write operation that follows it.
 */
const chains = (src) => {
  const out = [];
  const re = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)([\s\S]{0,500}?)\.(insert|upsert|update)\(/g;
  let m;
  while ((m = re.exec(src))) {
    out.push({
      table: m[1],
      op: m[3],
      line: src.slice(0, m.index).split("\n").length,
    });
  }
  return out;
};

const reportWrites = (src) =>
  chains(src).filter(
    (c) => REPORT_TABLE.test(c.table) && !NOT_REPORT.test(c.table),
  );

/** Does this file save on a timer, or only when the user clicks Save? */
const autoSaves = (src) => /setIsAutoSaving\(\s*true|autoSaveTimerRef/.test(src);

const CHECKS = [
  {
    id: "old-guard",
    severity: "high",
    test: (src) => /\b(creatingRef|pendingSaveRef)\b/.test(src),
    lines: (src) => linesOf(src, /\b(creatingRef|pendingSaveRef)\b/),
    why: "Uses the superseded creatingRef/pendingSaveRef guard. It only blocks a second insert within one mounted component; a re-mount defeats it.",
  },
  {
    id: "insert-without-upsert",
    // Unattended on a timer is the original bug. Manual-save-only files can
    // still duplicate, but only on a double-click or a re-mount then save.
    severity: (src) => (autoSaves(src) ? "high" : "medium"),
    test: (src) => {
      const w = reportWrites(src);
      return w.some((c) => c.op === "insert") && !w.some((c) => c.op === "upsert");
    },
    lines: (src) => reportWrites(src).filter((c) => c.op === "insert").map((c) => c.line),
    why: "Creates the report row with .insert() and never upserts, so a save that runs without a known id adds another copy instead of overwriting.",
  },
  {
    id: "id-not-recoverable",
    severity: "high",
    test: (src) =>
      /history\.replaceState/.test(src) &&
      !/reportIdentity|reportIdFromUrl|numericReportIdFromUrl/.test(src),
    lines: (src) => linesOf(src, /history\.replaceState/),
    why: "Writes the new id with history.replaceState, which useParams cannot see, and never reads it back off the address bar. A re-mount comes up with no id and inserts again.",
  },
  {
    id: "autosave-without-identity",
    severity: "high",
    test: (src) =>
      /setIsAutoSaving\(\s*true|autoSaveTimerRef/.test(src) &&
      !/reportIdentity|reportIdFromUrl|newReportId|numericReportIdFromUrl/.test(src),
    lines: (src) => linesOf(src, /setIsAutoSaving\(\s*true|autoSaveTimerRef/),
    why: "Auto-saves on a timer but never recovers or mints an id, so a save firing before the first insert returns has nothing to key on.",
  },
  {
    id: "no-single-flight",
    severity: "medium",
    test: (src) =>
      /setIsAutoSaving\(\s*true|autoSaveTimerRef/.test(src) &&
      !/savingRef|saveAgainRef|createInFlightRef/.test(src),
    lines: (src) => linesOf(src, /setIsAutoSaving\(\s*true|autoSaveTimerRef/),
    why: "Auto-saves with no single-flight guard, so two timers can have two writes in flight at once.",
  },
  {
    id: "upsert-without-onconflict",
    severity: "medium",
    test: (src) =>
      reportWrites(src).some((c) => c.op === "upsert") && !/onConflict/.test(src),
    lines: (src) => reportWrites(src).filter((c) => c.op === "upsert").map((c) => c.line),
    why: "Upserts the report row without an onConflict target.",
  },
];

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
const findings = [];
let scanned = 0;
const clean = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  if (!reportWrites(src).length) continue;
  scanned++;
  const rel = relative(ROOT, file);
  const hits = [];
  for (const c of CHECKS) {
    if (!c.test(src)) continue;
    const severity =
      typeof c.severity === "function" ? c.severity(src) : c.severity;
    hits.push({ ...c, severity, at: c.lines(src).slice(0, 4) });
  }
  if (hits.length) findings.push({ rel, hits, auto: autoSaves(src) });
  else clean.push(rel);
}

const RANK = { high: 0, medium: 1 };
findings.sort(
  (a, b) =>
    RANK[a.hits[0].severity] - RANK[b.hits[0].severity] ||
    b.hits.length - a.hits.length ||
    a.rel.localeCompare(b.rel),
);

console.log(`\nScanned ${scanned} files that write to a report-shaped table.`);
console.log(`${findings.length} with findings, ${clean.length} clean.\n`);

for (const f of findings) {
  console.log(`${f.rel}  ${f.auto ? "[auto-saves]" : "[manual save only]"}`);
  for (const h of f.hits) {
    console.log(`  [${h.severity}] ${h.id}  (lines ${h.at.join(", ")})`);
    console.log(`      ${h.why}`);
  }
  console.log("");
}

if (process.argv.includes("--all") && clean.length) {
  console.log("Clean:");
  for (const c of clean) console.log(`  ${c}`);
  console.log("");
}

process.exitCode = findings.some((f) => f.hits.some((h) => h.severity === "high")) ? 1 : 0;
