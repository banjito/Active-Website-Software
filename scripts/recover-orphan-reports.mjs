/**
 * Re-link "orphaned" reports.
 *
 * A saved report is two rows: the data row (in its own report table) and an
 * `assets` row + `job_assets` link that make it show up on the job. If the
 * second half fails, the data is safe but invisible in the app forever.
 *
 * This script finds report rows with no asset (or an asset with no job link)
 * and rebuilds the missing half. It never touches report data and never
 * deletes anything.
 *
 * Usage:
 *   node scripts/recover-orphan-reports.mjs                    # dry run, all jobs
 *   node scripts/recover-orphan-reports.mjs --job <job-uuid>   # dry run, one job
 *   node scripts/recover-orphan-reports.mjs --apply            # actually write
 *   node scripts/recover-orphan-reports.mjs --csv out.csv      # write a report
 *
 * Reads use the anon key (report tables grant select to it); writes use the
 * service role key (which is what has insert rights on assets/job_assets).
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY || !VITE_SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const read = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
const write = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_SERVICE_ROLE_KEY);

const APP_URL = (process.env.VITE_COMPANY_PRODUCT_URL || "https://ampos.io").replace(/\/$/, "");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const JOB_ID = args[args.indexOf("--job") + 1] && args.includes("--job") ? args[args.indexOf("--job") + 1] : null;
const CSV_PATH = args.includes("--csv") ? args[args.indexOf("--csv") + 1] : null;
const numArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i === -1 ? fallback : Number(args[i + 1]);
};

// Guards that make this safe to run unattended.
//
// A report still being edited is left alone: the app is creating its asset at
// that moment, and racing it would produce two assets for one report.
const SETTLE_MINUTES = numArg("--settle-minutes", 30);
// A report with no equipment name on it cannot be filed against anything, and
// in practice these are forms someone opened and walked away from. Real lost
// work has an identifier and a full set of readings. Anything below the bar is
// reported for a human to look at rather than pushed onto the job.
const MIN_FIELDS = numArg("--min-fields", 100);

// Report tables this script knows how to repair. `identifiers` are the
// report_data fields that hold the equipment name, best first.
const TABLES = [
  {
    table: "lv_molded_case_circuit_breaker_ats25",
    slug: "lv-molded-case-circuit-breaker-ats25",
    reportName: "LV Circuit Breaker ATS 25",
    templateType: "ATS",
    dataColumn: "report_data",
    identifiers: ["breakerIdentifier", "eqptIdentifier", "identifier"],
  },
];

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function pageAll(client, table, select, apply) {
  const out = [];
  for (let from = 0; ; from += 500) {
    let q = client.schema("neta_ops").from(table).select(select).range(from, from + 499);
    q = apply ? apply(q) : q;
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 500) break;
  }
  return out;
}

// How filled-in a report is. Used only to flag likely-blank drafts in the CSV.
function filledFields(value, depth = 0) {
  if (depth > 5 || value == null) return 0;
  if (typeof value === "string") return value.trim() ? 1 : 0;
  if (typeof value === "number" || typeof value === "boolean") return 1;
  if (typeof value === "object") return Object.values(value).reduce((n, v) => n + filledFields(v, depth + 1), 0);
  return 0;
}

const rows = [];

for (const spec of TABLES) {
  const reports = await pageAll(read, spec.table, `id, job_id, user_id, created_at, updated_at, ${spec.dataColumn}`, (q) =>
    JOB_ID ? q.eq("job_id", JOB_ID) : q,
  );
  console.log(`${spec.table}: ${reports.length} report rows`);

  // Which of them already have an asset? (file_url holds ':' and '/', which a
  // PostgREST `in` filter can't take, so match the slug and index by report id.)
  const urlFor = (r) => `report:/jobs/${r.job_id}/${spec.slug}/${r.id}`;
  const assets = await pageAll(write, "assets", "id, file_url", (q) => q.like("file_url", `report:/jobs/%/${spec.slug}/%`));
  const assetByUrl = new Map(assets.map((a) => [a.file_url, a]));

  // Which of those assets are linked to their job?
  const linked = new Set();
  for (const part of chunk(assets.map((a) => a.id), 200)) {
    const { data, error } = await write.schema("neta_ops").from("job_assets").select("asset_id").in("asset_id", part);
    if (error) throw new Error(`job_assets: ${error.message}`);
    data.forEach((l) => linked.add(l.asset_id));
  }

  for (const r of reports) {
    const url = urlFor(r);
    const asset = assetByUrl.get(url);
    if (asset && linked.has(asset.id)) continue; // healthy

    const d = r[spec.dataColumn] || {};
    const identifier = spec.identifiers.map((k) => d[k]).find((v) => typeof v === "string" && v.trim())?.trim() || "";
    const touchedAt = new Date(r.updated_at || r.created_at).getTime();
    const ageMinutes = (Date.now() - touchedAt) / 60000;
    const fields = filledFields(d);
    const skipReason =
      ageMinutes < SETTLE_MINUTES
        ? `still being edited (${Math.round(ageMinutes)} min ago)`
        : !identifier
          ? "no equipment name on the report"
          : fields < MIN_FIELDS
            ? `looks like an abandoned draft (${fields} filled fields)`
            : null;
    rows.push({
      skipReason,
      spec,
      report: r,
      url,
      asset,
      problem: asset ? "asset exists but not linked to job" : "no asset row",
      name: identifier ? `${spec.reportName} - ${identifier}` : spec.reportName,
      identifier,
      substation: d.substation || "",
      technicians: d.technicians || "",
      testDate: d.date || "",
      status: d.status || "",
      serial: d.serialNumber || "",
      fields,
      link: `${APP_URL}/jobs/${r.job_id}/${spec.slug}/${r.id}`,
    });
  }
}

rows.sort((a, b) => b.fields - a.fields);
const repairable = rows.filter((r) => !r.skipReason);
const skipped = rows.filter((r) => r.skipReason);

console.log(`\nOrphans found: ${rows.length}${JOB_ID ? ` (job ${JOB_ID})` : ""}`);
repairable.forEach((r) =>
  console.log(`  ${String(r.fields).padStart(3)} fields | ${r.identifier || "(no equipment name)"} | ${r.substation} | ${r.testDate} | ${r.problem}`),
);
if (skipped.length) {
  console.log(`\nHeld back (${skipped.length}), reported but not touched:`);
  skipped.forEach((r) =>
    console.log(`  ${r.identifier || "(no equipment name)"} | ${r.skipReason}`),
  );
}

if (APPLY) {
  let repaired = 0;
  for (const r of repairable) {
    let assetId = r.asset?.id;
    if (!assetId) {
      const { data, error } = await write
        .schema("neta_ops")
        .from("assets")
        .insert({
          name: r.name,
          file_url: r.url,
          user_id: r.report.user_id ?? null,
          template_type: r.spec.templateType,
          status: "in_progress",
        })
        .select("id")
        .single();
      if (error) {
        console.error(`  FAILED asset for ${r.report.id}: ${error.message}`);
        continue;
      }
      assetId = data.id;
    }
    const { error: linkError } = await write
      .schema("neta_ops")
      .from("job_assets")
      .insert({ job_id: r.report.job_id, asset_id: assetId, user_id: r.report.user_id ?? null });
    if (linkError) {
      console.error(`  FAILED link for ${r.report.id}: ${linkError.message}`);
      continue;
    }
    r.restoredAssetId = assetId;
    repaired++;
  }
  console.log(`\nRestored ${repaired}/${repairable.length}${skipped.length ? ` (${skipped.length} held back)` : ""}`);
} else {
  console.log(`\nDry run. Nothing written. Re-run with --apply to restore ${repairable.length}.`);
}

if (CSV_PATH) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = [
    "equipment", "substation", "test_date", "technicians", "result", "serial_number",
    "filled_fields", "held_back_reason", "problem", "restored", "report_id", "job_id", "link",
  ];
  const lines = [header.join(",")];
  rows.forEach((r) =>
    lines.push(
      [
        r.identifier || "(no equipment name)", r.substation, r.testDate, r.technicians, r.status, r.serial,
        r.fields, r.skipReason || "", r.problem,
        r.skipReason ? "held back" : APPLY ? (r.restoredAssetId ? "yes" : "failed") : "dry-run",
        r.report.id, r.report.job_id, r.link,
      ].map(esc).join(","),
    ),
  );
  fs.writeFileSync(CSV_PATH, lines.join("\n") + "\n");
  console.log(`CSV written: ${CSV_PATH}`);
}
