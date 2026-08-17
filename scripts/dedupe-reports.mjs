/**
 * Find (and optionally hide) reports that auto-save duplicated.
 *
 * Auto-save used to INSERT a new report row every time it lost track of the one
 * it had already created, so a single panel could land on a job five or six
 * times over. The app-side fix stops new duplicates; this script deals with the
 * ones already in the database.
 *
 * What a duplicate looks like: several report rows on the same job, of the same
 * type, created within minutes of each other, whose equipment names are
 * *prefixes of each other* -- "S", "SWBD", "SWBD-RPP", "SWBD-RPP-9A-4" -- because
 * each queued save wrote whatever had been typed so far. Matching on identical
 * names alone would miss most of them.
 *
 * A row is only ever treated as a duplicate when all three hold:
 *
 *   1. its equipment name is empty, or a prefix of another row's name
 *   2. it was created within --window minutes of that row
 *   3. every filled-in value on it also appears, identical, on that row
 *
 * Rule 3 is the one that matters: a row carrying any reading the keeper does not
 * have is never removed. Those are printed as "needs a look" and left alone.
 *
 * On top of that, a pair where *neither* report names its equipment is held back
 * unless you pass --include-unnamed. Identical readings prove nothing there:
 * breakers on one panel genuinely test alike, so with no name on either report
 * there is nothing saying they are the same device rather than two of them.
 *
 * Removing means deleting the `job_assets` link, which is exactly what the app's
 * own delete-report button does: the report row and its asset stay in the
 * database, the report just stops appearing on the job. Every removal is written
 * to a manifest that --undo replays.
 *
 * Usage:
 *   node scripts/dedupe-reports.mjs                          # dry run, all jobs
 *   node scripts/dedupe-reports.mjs --job <job-uuid>         # dry run, one job
 *   node scripts/dedupe-reports.mjs --csv out.csv            # write the detail
 *   node scripts/dedupe-reports.mjs --apply                  # actually unlink
 *   node scripts/dedupe-reports.mjs --undo manifest.json     # put them back
 *
 * Reading report tables needs a staff session: service_role has no grant on them
 * and anon is filtered by RLS, so neither key in .env can see them. Easiest is
 * to borrow the session out of your browser with --access-token (the error text
 * tells you how); --email/--password and --use-renderer also work. Assets and
 * job links use the service role key from .env.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i === -1 || i === args.length - 1 ? fallback : args[i + 1];
};
const num = (name, fallback) => {
  const v = value(name);
  return v == null ? fallback : Number(v);
};

const APPLY = flag("--apply");
const JOB_ID = value("--job");
const CSV_PATH = value("--csv");
const UNDO_PATH = value("--undo");
/** How far apart two saves can be and still be the same panel being typed. */
const WINDOW_MINUTES = num("--window", 60);
/** Reports touched this recently are left alone; someone may be in them now. */
const SETTLE_MINUTES = num("--settle-minutes", 30);
/**
 * Also sweep pairs where neither report names its equipment. Held back by
 * default: identical readings are normal across breakers on one panel, so
 * without a name there is nothing that says these are the same device.
 */
const INCLUDE_UNNAMED = flag("--include-unnamed");
const MANIFEST_PATH = value(
  "--manifest",
  path.join(ROOT, "duplicate-reports-removed.json"),
);

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY || !VITE_SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

/** Assets, job links, and the deletes: the service role owns all of these. */
const write = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------- undo

if (UNDO_PATH) {
  const manifest = JSON.parse(fs.readFileSync(UNDO_PATH, "utf8"));
  console.log(`Restoring ${manifest.removed.length} report(s) to their jobs...`);
  let restored = 0;
  for (const r of manifest.removed) {
    const { error } = await write
      .schema("neta_ops")
      .from("job_assets")
      .insert({ job_id: r.job_id, asset_id: r.asset_id, user_id: r.user_id ?? null });
    if (error && !/duplicate key/i.test(error.message)) {
      console.error(`  FAILED ${r.identifier || r.report_id}: ${error.message}`);
      continue;
    }
    restored++;
  }
  console.log(`Restored ${restored}.`);
  process.exit(0);
}

// ---------------------------------------------------------------- staff session

// --use-renderer borrows the PDF renderer's service account out of .env, so a
// password never has to go on the command line.
const useRenderer = flag("--use-renderer");
const accessToken = value("--access-token", process.env.AMPOS_ACCESS_TOKEN);
const email = useRenderer
  ? process.env.RENDERER_EMAIL
  : value("--email", process.env.AMPOS_EMAIL);
const password = useRenderer
  ? process.env.RENDERER_PASSWORD
  : value("--password", process.env.AMPOS_PASSWORD);

if (!accessToken && !(email && password)) {
  console.error(
    "Reading report tables needs a staff session. Pick one:\n\n" +
      "  --access-token <jwt>   borrow the session from your browser (see below)\n" +
      "  --email / --password   sign in here (or AMPOS_EMAIL / AMPOS_PASSWORD)\n" +
      "  --use-renderer         sign in as RENDERER_EMAIL from .env\n\n" +
      "To get a token: sign in to the app, open DevTools > Console, and run\n\n" +
      "  (() => { for (const [k, raw] of Object.entries(localStorage)) {\n" +
      "      let v = raw; if (typeof v !== 'string') continue;\n" +
      "      if (v.startsWith('base64-')) { try { v = atob(v.slice(7)); } catch { continue; } }\n" +
      "      if (!v.includes('access_token')) continue;\n" +
      "      try { const o = JSON.parse(v); const t = o.access_token || o.currentSession?.access_token;\n" +
      "        if (t) return t; } catch {}\n" +
      "    } return 'NO SESSION FOUND'; })()\n\n" +
      "then  export AMPOS_ACCESS_TOKEN='<the long ey... string>'\n" +
      "(the app keeps its session under a custom storage key, so scan rather than\n" +
      " guess the key name -- see storageKey in src/lib/supabase.ts)",
  );
  process.exit(1);
}

// A token from the browser is handed to PostgREST as-is; signing in here gets
// one the same way the app does. Either way `read` acts as that staff user.
const read = accessToken
  ? createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

if (accessToken) {
  const { data, error } = await read.auth.getUser(accessToken);
  if (error || !data?.user) {
    console.error(
      `That access token was not accepted: ${error?.message || "no user on it"}.\n` +
        "Tokens last about an hour; sign in to the app again and copy a fresh one.",
    );
    process.exit(1);
  }
  console.log(`Using the browser session of ${data.user.email}`);
} else {
  const { error } = await read.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(`Could not sign in as ${email}: ${error.message}`);
    process.exit(1);
  }
  console.log(`Signed in as ${email}`);
}


// ---------------------------------------------------------------- slug -> table

/**
 * Read the app's own slug -> table map rather than keeping a second copy that
 * drifts out of date. The literal is plain "slug": "table" pairs.
 */
function loadSlugToTable() {
  const src = fs.readFileSync(path.join(ROOT, "src/lib/reportEvaluations.ts"), "utf8");
  const body = src.slice(
    src.indexOf("REPORT_SLUG_TO_TABLE"),
    src.indexOf("SLUG_FALLBACK_TABLES"),
  );
  const map = {};
  for (const m of body.matchAll(/"([a-z0-9][a-z0-9-]*)":\s*\n?\s*"([a-z0-9_]+)"/g)) {
    map[m[1]] = m[2];
  }
  if (Object.keys(map).length < 40) {
    throw new Error(`Only parsed ${Object.keys(map).length} slug->table entries; the map's shape changed.`);
  }
  return map;
}
const SLUG_TO_TABLE = loadSlugToTable();

// ---------------------------------------------------------------- helpers

const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

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

/** Columns that say when a row was written, not what is on the report. */
const META_COLUMNS = new Set(["id", "job_id", "user_id", "created_at", "updated_at"]);

/** Field names that hold the equipment name, best first. */
const IDENTIFIER_KEYS = [
  "identifier",
  "breakerIdentifier",
  "eqptIdentifier",
  "equipmentIdentifier",
  "eqptLocation",
  "equipmentLocation",
];

/** First non-empty identifier field found anywhere in the row. */
function equipmentName(row) {
  for (const key of IDENTIFIER_KEYS) {
    const found = findKey(row, key);
    if (found) return found;
  }
  return "";
}

function findKey(value, key, depth = 0) {
  if (depth > 6 || value == null || typeof value !== "object") return "";
  if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  for (const v of Object.values(value)) {
    const found = findKey(v, key, depth + 1);
    if (found) return found;
  }
  return "";
}

/**
 * Every filled-in value on a report, as path -> value. Two rows can then be
 * compared leaf by leaf instead of by a whole-object equality that any stray
 * timestamp would break.
 */
function leaves(value, prefix = "", out = new Map(), depth = 0, key = "") {
  // The equipment name is deliberately not compared. It is the field that
  // differs by definition between a half-typed save and the finished one
  // ("SWBD" vs "SWBD-RPP-9A-2"), so comparing it would veto every match it is
  // supposed to prove. Whether two rows are the same equipment is decided by
  // the prefix rule instead; this map answers the separate question of whether
  // one row's *readings* are all present on the other.
  if (IDENTIFIER_KEYS.includes(key)) return out;
  if (depth > 8 || value == null) return out;
  if (typeof value === "string") {
    const t = value.trim();
    // "Select One" is the untouched state of every visual-inspection dropdown.
    if (t && t !== "Select One") out.set(prefix, t);
    return out;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    out.set(prefix, String(value));
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (depth === 0 && META_COLUMNS.has(k)) continue;
      leaves(v, prefix ? `${prefix}.${k}` : k, out, depth + 1, k);
    }
  }
  return out;
}

/** Is everything on `row` also on `keeper`, with the same value? */
function isSubsetOf(row, keeper) {
  for (const [path, v] of row.leaves) {
    if (keeper.leaves.get(path) !== v) return false;
  }
  return true;
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
/** "SWBD" vs "SWBD-RPP-9A-4": one is what the other looked like mid-typing. */
const isPrefixName = (shortName, longName) =>
  !shortName || norm(longName).startsWith(norm(shortName));

const minutesBetween = (a, b) => Math.abs(new Date(a) - new Date(b)) / 60000;
const minutesAgo = (t) => (Date.now() - new Date(t)) / 60000;

// ---------------------------------------------------------------- gather

console.log("Loading report assets...");
const assets = await pageAll(write, "assets", "id, name, file_url, status, user_id, created_at", (q) =>
  q.like("file_url", "report:/jobs/%"),
);

const links = new Set();
for (const part of chunk(assets.map((a) => a.id), 200)) {
  const { data, error } = await write
    .schema("neta_ops")
    .from("job_assets")
    .select("asset_id")
    .in("asset_id", part);
  if (error) throw new Error(`job_assets: ${error.message}`);
  data.forEach((l) => links.add(l.asset_id));
}

/** Parse `report:/jobs/<job>/<slug>/<reportId>` (some slugs add a folder segment). */
function parseUrl(fileUrl) {
  const m = /^report:\/jobs\/([^/]+)\/([^/?#]+)\/(.+?)(?:\?|#|$)/.exec(fileUrl || "");
  if (!m) return null;
  const reportId = m[3].split("/").pop();
  return { jobId: m[1], slug: m[2], reportId };
}

const bySlug = new Map();
for (const a of assets) {
  const parsed = parseUrl(a.file_url);
  if (!parsed) continue;
  if (JOB_ID && parsed.jobId !== JOB_ID) continue;
  // An asset already off the job cannot be a duplicate showing on it.
  if (!links.has(a.id)) continue;
  if (!bySlug.has(parsed.slug)) bySlug.set(parsed.slug, []);
  bySlug.get(parsed.slug).push({ asset: a, ...parsed });
}

// ---------------------------------------------------------------- cluster

const duplicates = [];
const needsALook = [];
const unreadable = [];

for (const [slug, entries] of [...bySlug].sort()) {
  const table = SLUG_TO_TABLE[slug];
  if (!table) {
    unreadable.push(`${slug}: no table mapped (${entries.length} reports)`);
    continue;
  }

  const ids = [...new Set(entries.map((e) => e.reportId))];
  const rowsById = new Map();
  let failed = null;
  for (const part of chunk(ids, 100)) {
    const { data, error } = await read.schema("neta_ops").from(table).select("*").in("id", part);
    if (error) {
      failed = error.message;
      break;
    }
    data.forEach((r) => rowsById.set(r.id, r));
  }
  if (failed) {
    unreadable.push(`${slug} (${table}): ${failed}`);
    continue;
  }

  // RLS hides rows by returning fewer of them, not by erroring. Without this a
  // session that cannot see a report type would sail through and report "no
  // duplicates found", which is the one wrong answer that matters here.
  const missing = ids.filter((id) => !rowsById.has(id)).length;
  if (missing) {
    unreadable.push(
      `${slug} (${table}): ${missing} of ${ids.length} report rows were not returned` +
        `${missing === ids.length ? " (no access at all)" : " (partly hidden by row-level security)"}`,
    );
    if (missing === ids.length) continue;
  }

  const rows = entries
    .map((e) => {
      const row = rowsById.get(e.reportId);
      if (!row) return null;
      return {
        ...e,
        row,
        name: equipmentName(row),
        leaves: leaves(row),
        touchedAt: row.updated_at || row.created_at,
        createdAt: row.created_at,
      };
    })
    .filter(Boolean);

  // Duplicates only ever compete within one job.
  const byJob = new Map();
  for (const r of rows) {
    if (!byJob.has(r.jobId)) byJob.set(r.jobId, []);
    byJob.get(r.jobId).push(r);
  }

  for (const [jobId, jobRows] of byJob) {
    if (jobRows.length < 2) continue;

    // Longest equipment name first. Within a chain of half-typed saves every
    // name is a prefix of the finished one, so the longest name is the report
    // the technician actually completed. Ranking by field count instead would
    // crown a mid-typing snapshot ("SWBD") whenever it happened to carry more
    // filled fields than the finished report, and then delete the real one.
    const ranked = [...jobRows].sort(
      (a, b) =>
        b.name.length - a.name.length ||
        b.leaves.size - a.leaves.size ||
        new Date(b.touchedAt) - new Date(a.touchedAt),
    );

    const claimed = new Set();
    for (const keeper of ranked) {
      if (claimed.has(keeper.reportId)) continue;
      for (const other of ranked) {
        if (other === keeper || claimed.has(other.reportId)) continue;
        if (!isPrefixName(other.name, keeper.name)) continue;
        if (minutesBetween(other.createdAt, keeper.createdAt) > WINDOW_MINUTES) continue;

        const record = { slug, table, jobId, keeper, other };
        if (!isSubsetOf(other, keeper)) {
          needsALook.push({ ...record, reason: "has readings the keeper does not" });
          continue;
        }
        if (minutesAgo(other.touchedAt) < SETTLE_MINUTES) {
          needsALook.push({ ...record, reason: "edited in the last 30 minutes" });
          continue;
        }

        // How sure are we that these are the same piece of equipment?
        //
        //   high   both name the equipment, and the names agree
        //   medium the keeper names the equipment, the duplicate never got one
        //   low    neither names anything. Identical readings are not proof
        //          here: breakers on one panel genuinely test alike, so this is
        //          the one tier a human has to agree with first.
        const confidence = other.name && keeper.name ? "high" : keeper.name ? "medium" : "low";
        if (confidence === "low" && !INCLUDE_UNNAMED) {
          needsALook.push({
            ...record,
            reason: "identical, but neither report names the equipment",
          });
          continue;
        }
        claimed.add(other.reportId);
        duplicates.push({ ...record, confidence });
      }
      claimed.add(keeper.reportId);
    }
  }
}

// ---------------------------------------------------------------- report

const byType = new Map();
for (const d of duplicates) byType.set(d.slug, (byType.get(d.slug) || 0) + 1);
const byConfidence = new Map();
for (const d of duplicates) byConfidence.set(d.confidence, (byConfidence.get(d.confidence) || 0) + 1);

console.log(`\nDuplicate reports found: ${duplicates.length}${JOB_ID ? ` (job ${JOB_ID})` : ""}`);
for (const [slug, n] of [...byType].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${slug}`);
}
const CONFIDENCE_NOTE = {
  high: "both name the equipment and the names agree",
  medium: "the keeper names the equipment, the duplicate never got a name",
  low: "neither names the equipment (only with --include-unnamed)",
};
console.log("  how sure:");
for (const level of ["high", "medium", "low"]) {
  const n = byConfidence.get(level);
  if (n) console.log(`  ${String(n).padStart(5)}  ${level} -- ${CONFIDENCE_NOTE[level]}`);
}

if (duplicates.length) {
  console.log("\nA sample of what would be removed (keeper -> duplicate):");
  for (const d of duplicates.slice(0, 25)) {
    console.log(
      `  ${d.confidence.padEnd(6)} ${(d.keeper.name || "(no name)").padEnd(22)} ${String(d.keeper.leaves.size).padStart(4)} fields` +
        `   <-  ${(d.other.name || "(no name)").padEnd(22)} ${String(d.other.leaves.size).padStart(4)} fields` +
        `   ${d.other.createdAt.slice(0, 16).replace("T", " ")}`,
    );
  }
  if (duplicates.length > 25) console.log(`  ...and ${duplicates.length - 25} more (use --csv for all of them)`);
}

if (needsALook.length) {
  // Counted by report, not by pair: one report gets compared against every
  // keeper in its job, so pair counts read far scarier than the truth.
  const byReport = new Map();
  for (const n of needsALook) {
    if (!byReport.has(n.other.reportId)) byReport.set(n.other.reportId, n.reason);
  }
  console.log(`\nLeft alone for a human to judge: ${byReport.size} report(s)`);
  const reasons = new Map();
  for (const reason of byReport.values()) reasons.set(reason, (reasons.get(reason) || 0) + 1);
  for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${reason}`);
  }
}

if (unreadable.length) {
  console.log(`\nNot fully checked -- this account could not read everything:`);
  unreadable.forEach((u) => console.log(`  ${u}`));
  console.log(`  Duplicates in these report types were NOT looked for.`);
} else {
  console.log(`\nEvery report type was readable, so this pass covered all of them.`);
}

if (CSV_PATH) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const APP_URL = (process.env.VITE_COMPANY_PRODUCT_URL || "https://ampos.io").replace(/\/$/, "");
  const link = (d, side) => `${APP_URL}/jobs/${d.jobId}/${d.slug}/${d[side].reportId}`;
  const lines = [
    [
      "verdict", "confidence", "report_type", "job_id",
      "duplicate_name", "duplicate_fields", "duplicate_created", "duplicate_url",
      "keeper_name", "keeper_fields", "keeper_url", "reason",
    ].join(","),
  ];
  // The two URLs are the point of this file: open them side by side and you can
  // see for yourself whether they are one panel or two before anything is run.
  const add = (verdict, d) =>
    lines.push(
      [
        verdict, d.confidence ?? "", d.slug, d.jobId,
        d.other.name, d.other.leaves.size, d.other.createdAt, link(d, "other"),
        d.keeper.name, d.keeper.leaves.size, link(d, "keeper"),
        d.reason ?? "",
      ].map(esc).join(","),
    );
  duplicates.forEach((d) => add("remove", d));
  needsALook.forEach((d) => add("needs-a-look", d));
  fs.writeFileSync(CSV_PATH, lines.join("\n"));
  console.log(`\nWrote ${CSV_PATH}`);
}

// ---------------------------------------------------------------- apply

if (!APPLY) {
  console.log(`\nDry run. Nothing was changed. Re-run with --apply to remove the ${duplicates.length} duplicate(s).`);
  console.log(`Removing only deletes the job link; the report and its asset stay, and --undo puts it back.`);
  if (!INCLUDE_UNNAMED) {
    console.log(`Pairs where neither report names its equipment were held back. Add --include-unnamed to sweep those too.`);
  }
  process.exit(0);
}

const removed = [];
for (const d of duplicates) {
  const { error } = await write
    .schema("neta_ops")
    .from("job_assets")
    .delete()
    .eq("job_id", d.jobId)
    .eq("asset_id", d.other.asset.id);
  if (error) {
    console.error(`  FAILED ${d.other.reportId}: ${error.message}`);
    continue;
  }
  removed.push({
    job_id: d.jobId,
    asset_id: d.other.asset.id,
    user_id: d.other.asset.user_id ?? null,
    report_id: d.other.reportId,
    report_table: d.table,
    slug: d.slug,
    identifier: d.other.name,
    kept_report_id: d.keeper.reportId,
  });
}

fs.writeFileSync(
  MANIFEST_PATH,
  JSON.stringify({ removedAt: new Date().toISOString(), removed }, null, 2),
);

console.log(`\nRemoved ${removed.length} duplicate report(s) from their jobs.`);
console.log(`Report rows and assets were left in place; only the job link was deleted.`);
console.log(`Manifest: ${MANIFEST_PATH}`);
console.log(`Undo:     node scripts/dedupe-reports.mjs --undo ${MANIFEST_PATH}`);
