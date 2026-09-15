/**
 * One-time Talent Pool import from the HR recruiting workbook.
 *
 * Plan: documentation/Feature Documentation/TALENT_POOL_PLAN.md (section 5)
 * Needs: database/migrations/talent_pool.sql applied first.
 *
 *   node --import ./scripts/ts-alias-loader.mjs scripts/talent-pool-import.ts <command> [options]
 *
 * Commands
 *   plan     --workbook <xlsx> --sheets Sheet1,Sheet2,Sheet3 --out <manifest.json> [--previous <manifest.json>]
 *            Reads the workbook and existing prospects, writes a review manifest. No writes to the database.
 *            --previous carries review decisions forward (and turns merge decisions into real merges).
 *   approve  --manifest <manifest.json> --by "<reviewer name>"
 *            Records approval and fingerprints the operations. Any later edit voids the approval.
 *   apply    --manifest <manifest.json> --workbook <xlsx> --operator-email <email> [--apply]
 *            Without --apply: validates and reports what would happen (dry run, no writes).
 *            With --apply: applies each operation in its own transaction. Safe to re-run or resume.
 *
 * Manifests and results contain contact data. They must live outside the repo.
 *
 * Review a manifest by editing, per operation:
 *   review.decision   "create" | "skip" | "approved" | "merge_into:<prospect uuid>" | "merge_with_op:<op_id>"
 *                     merge_* decisions need another `plan --previous` pass before approval.
 *   field_overrides   { "last_name": "Smith", ... } applied over `fields`
 *   overwrite_fields  ["job_title", ...] for merges: replace populated values (default fills blanks only)
 *   promote           for advanced-stage rows: fill last_name, email, position_applied, source,
 *                     or set existing_candidate_id to link an application listed in candidate_matches
 *
 * Reads VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_ROLE_KEY from .env.
 */
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  blankToNull,
  groupByIdentity,
  mapSheetStatus,
  mapSource,
  nameKey,
  normalizeEmail,
  normalizeLinkedin,
  normalizePhone,
  splitName,
} from "../src/lib/talentPool/normalize";
import type { CandidateStage, MatchSubject, ProspectSource } from "../src/lib/talentPool/normalize";

const FORMAT = "talent-pool-import/v1";
const REPO_ROOT = path.resolve(process.cwd());
const SHEET_PRIORITY = ["Sheet1", "Sheet2", "Sheet3"];
const FIELD_KEYS = [
  "first_name", "last_name", "email", "phone", "linkedin_url", "job_title",
  "current_org", "location", "source", "status", "availability", "needs_follow_up",
] as const;
type FieldKey = (typeof FIELD_KEYS)[number];
type Fields = Partial<Record<FieldKey, string | boolean | null>>;

// ---------------------------------------------------------------------------
// CLI plumbing
// ---------------------------------------------------------------------------
const [command, ...rest] = process.argv.slice(2);
const args = new Map<string, string | true>();
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (!a.startsWith("--")) continue;
  const next = rest[i + 1];
  if (next && !next.startsWith("--")) {
    args.set(a.slice(2), next);
    i++;
  } else {
    args.set(a.slice(2), true);
  }
}
const arg = (name: string): string | undefined => {
  const v = args.get(name);
  return typeof v === "string" ? v : undefined;
};
const requireArg = (name: string): string => {
  const v = arg(name);
  if (!v) die(`Missing --${name}`);
  return v!;
};

function die(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function sha256(data: crypto.BinaryLike) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** Deterministic UUID from a seed, so re-planning the same workbook keeps ids. */
function stableUuid(seed: string) {
  const h = sha256(seed);
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as any)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertOutsideRepo(file: string) {
  const resolved = path.resolve(file);
  if (resolved === REPO_ROOT || resolved.startsWith(REPO_ROOT + path.sep)) {
    die(`${file} is inside the repository. Manifests contain contact data; keep them outside git (for example ~/talent-pool-import/).`);
  }
}

function writePrivate(file: string, data: unknown) {
  assertOutsideRepo(file);
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function supabaseTarget() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die("Missing VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(url, key!, { db: { schema: "common" }, auth: { persistSession: false } });
  return { client, target: new URL(url).host };
}

// ---------------------------------------------------------------------------
// Workbook parsing
// ---------------------------------------------------------------------------
interface SourceRow extends MatchSubject {
  sheet: string;
  row: number;
  name_original: string | null;
  fields: Fields;
  source_original: string | null;
  status_original: string | null;
  candidate_stage?: CandidateStage;
  notes: Array<{ author: string; column: string; body: string }>;
  flags: string[];
  blockers: string[];
}

const normHeader = (h: unknown) =>
  String(h ?? "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const ALIASES: Record<string, string[]> = {
  name: ["name", "full name", "candidate", "candidate name"],
  first: ["first name", "first"],
  last: ["last name", "last", "surname"],
  email: ["email", "email address", "e mail", "emails"],
  phone: ["phone", "phone number", "mobile", "cell", "phone numbers"],
  linkedin: ["linkedin", "linkedin url", "linkedin profile", "profile url", "linkedin profile url"],
  title: ["title", "current title", "job title", "headline", "position"],
  org: ["current org", "current organization", "organization", "company", "current company", "employer", "current employer"],
  location: ["location", "city", "city state"],
  country: ["country"],
  source: ["source"],
  status: ["status"],
  action: ["action taken"],
  availability: ["availability"],
};

function mapColumns(header: unknown[]) {
  const cols: Record<string, number[]> = {};
  header.forEach((h, i) => {
    const n = normHeader(h);
    if (!n) return;
    for (const [key, aliases] of Object.entries(ALIASES)) {
      if (aliases.includes(n)) (cols[key] ??= []).push(i);
    }
    if (n.includes("dionne") && n.includes("note")) (cols.notes_dionne ??= []).push(i);
    if (n.includes("harra") && n.includes("note")) (cols.notes_harra ??= []).push(i);
  });
  return cols;
}

const colLetter = (i: number) => XLSX.utils.encode_col(i);

function parseSheet(wb: XLSX.WorkBook, sheet: string) {
  const ws = wb.Sheets[sheet];
  if (!ws) die(`Sheet "${sheet}" not found. Available: ${wb.SheetNames.join(", ")}`);
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });

  const headerIndex = grid.slice(0, 5).findIndex((r) => {
    const c = mapColumns(r);
    return c.name || (c.first && c.last);
  });
  if (headerIndex < 0) die(`${sheet}: no NAME (or First/Last Name) header in the first 5 rows`);
  const header = grid[headerIndex];
  const cols = mapColumns(header);
  const mapping = Object.fromEntries(
    Object.entries(cols).map(([k, idx]) => [k, idx.map((i) => `${String(header[i]).trim()} (${colLetter(i)})`)]),
  );
  const unmapped = header
    .map((h, i) => (blankToNull(h) && !Object.values(cols).some((idx) => idx.includes(i)) ? `${String(h).trim()} (${colLetter(i)})` : null))
    .filter(Boolean);

  const cell = (r: unknown[], key: string, n = 0) => {
    const idx = cols[key]?.[n];
    return idx === undefined ? null : r[idx];
  };

  const rows: SourceRow[] = [];
  grid.slice(headerIndex + 1).forEach((r, offset) => {
    const rowNumber = headerIndex + offset + 2; // 1-based, header row is headerIndex+1
    if (!r.some((v) => blankToNull(v))) return;

    const flags: string[] = [];
    const blockers: string[] = [];

    let first: string | null;
    let last: string | null;
    let nameOriginal = blankToNull(cell(r, "name"));
    if (nameOriginal) {
      const split = splitName(nameOriginal);
      first = split.first_name;
      last = split.last_name;
      flags.push(...split.flags);
    } else {
      first = blankToNull(cell(r, "first"));
      last = blankToNull(cell(r, "last"));
      nameOriginal = [first, last].filter(Boolean).join(" ") || null;
    }
    if (!first) {
      blockers.push("No name");
    }

    // Two EMAIL columns on Sheet1: first valid wins when they agree.
    const emailCells = (cols.email ?? []).map((i) => ({ col: colLetter(i), raw: blankToNull(r[i]) })).filter((e) => e.raw);
    const validEmails = new Map<string, string>();
    for (const e of emailCells) {
      const normalized = normalizeEmail(e.raw);
      if (normalized) {
        if (!validEmails.has(normalized)) validEmails.set(normalized, e.col);
      } else {
        flags.push(`Email in column ${e.col} is not a valid address and was left out`);
      }
    }
    if (validEmails.size > 1) {
      blockers.push(`Different emails in columns ${[...validEmails.values()].join(" and ")}`);
    }
    const email = validEmails.size ? [...validEmails.keys()][0] : null;

    const linkedinRaw = blankToNull(cell(r, "linkedin"));
    let linkedin = normalizeLinkedin(linkedinRaw);
    if (linkedinRaw && !linkedin) flags.push("LinkedIn value is not a profile URL and was left out");

    const src = mapSource(cell(r, "source"));
    if (src.linkedin_url) {
      if (linkedin && linkedin !== src.linkedin_url) {
        blockers.push("SOURCE holds a LinkedIn URL that differs from the LinkedIn column");
      } else {
        linkedin = src.linkedin_url;
        flags.push("LinkedIn URL moved from SOURCE");
      }
    }

    const phone = normalizePhone(cell(r, "phone"));
    if (phone.flag) flags.push(phone.flag);

    const statusOriginal = blankToNull(cell(r, "status"));
    const status = mapSheetStatus(statusOriginal);
    if (!status.known) blockers.push(`Unknown STATUS "${statusOriginal}"`);

    const action = blankToNull(cell(r, "action"))?.toUpperCase() ?? "";
    const needsFollowUp = action.replace(/\s+/g, " ") === "NEEDS TO FOLLOW UP";
    if (action && !needsFollowUp) flags.push(`ACTION TAKEN "${action}" not mapped`);

    const notes: SourceRow["notes"] = [];
    for (const [key, author] of [["notes_dionne", "Dionne"], ["notes_harra", "Harra"]] as const) {
      for (const i of cols[key] ?? []) {
        const body = blankToNull(r[i]);
        if (body) notes.push({ author, column: colLetter(i), body: body.slice(0, 10000) });
      }
    }

    rows.push({
      key: `${sheet}!${rowNumber}`,
      sheet,
      row: rowNumber,
      name_original: nameOriginal,
      first_name: first,
      last_name: last,
      email,
      linkedin_url: linkedin,
      fields: {
        first_name: first,
        last_name: last,
        email,
        phone: phone.value,
        linkedin_url: linkedin,
        job_title: blankToNull(cell(r, "title"))?.slice(0, 255) ?? null,
        current_org: blankToNull(cell(r, "org"))?.slice(0, 255) ?? null,
        location: (blankToNull(cell(r, "location")) ?? blankToNull(cell(r, "country")))?.slice(0, 255) ?? null,
        source: src.source,
        status: status.status,
        availability: blankToNull(cell(r, "availability"))?.slice(0, 500) ?? null,
        needs_follow_up: needsFollowUp,
      },
      source_original: src.original,
      status_original: statusOriginal,
      candidate_stage: status.candidateStage,
      notes,
      flags,
      blockers,
    });
  });

  return { rows, mapping, unmapped, headerRow: headerIndex + 1 };
}

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------
interface ExistingProspect {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  linkedin_url: string | null;
  status: string;
  updated_at: string;
  import_refs: any[];
  [k: string]: any;
}

async function fetchAll<T>(client: SupabaseClient, table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(select).order("id").range(from, from + 999);
    if (error) die(`Reading ${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

function mergeFields(members: SourceRow[]): { fields: Fields; flags: string[] } {
  const ordered = [...members].sort(
    (a, b) => SHEET_PRIORITY.indexOf(a.sheet) - SHEET_PRIORITY.indexOf(b.sheet) || a.row - b.row,
  );
  const fields: Fields = {};
  const flags: string[] = [];
  for (const key of FIELD_KEYS) {
    for (const m of ordered) {
      const v = m.fields[key];
      const blank = v === null || v === undefined || v === "" || v === false || (key === "source" && v === "other") || (key === "status" && v === "new");
      if (!blank) {
        if (fields[key] === undefined) fields[key] = v;
        else if (key !== "source" && fields[key] !== v && typeof v === "string") {
          flags.push(`${key} differs between rows; kept "${fields[key]}" from ${ordered[0].key} priority, other value "${v}" from ${m.key}`);
        }
      }
    }
    if (fields[key] === undefined) {
      fields[key] = key === "source" ? "other" : key === "status" ? "new" : key === "needs_follow_up" ? false : null;
    }
  }
  return { fields, flags };
}

async function plan() {
  const workbookPath = requireArg("workbook");
  const outPath = requireArg("out");
  assertOutsideRepo(outPath);
  const sheets = (arg("sheets") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!sheets.length) die("Pass --sheets with the tabs HR approved, e.g. --sheets Sheet1");

  const previous = arg("previous") ? JSON.parse(fs.readFileSync(requireArg("previous"), "utf8")) : null;
  const buffer = fs.readFileSync(workbookPath);
  const checksum = sha256(buffer);
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });

  const { client, target } = supabaseTarget();
  const manifestId = previous?.workbook?.sha256 === checksum && previous?.target === target
    ? previous.manifest_id
    : crypto.randomUUID();

  const rows: SourceRow[] = [];
  const columnMapping: Record<string, unknown> = {};
  const rowCounts: Record<string, number> = {};
  for (const sheet of sheets) {
    const parsed = parseSheet(wb, sheet);
    rows.push(...parsed.rows);
    rowCounts[sheet] = parsed.rows.length;
    columnMapping[sheet] = { header_row: parsed.headerRow, mapped: parsed.mapping, unmapped: parsed.unmapped };
  }
  console.log(`Workbook ${path.basename(workbookPath)} sha256 ${checksum.slice(0, 12)}…`);
  console.table(rowCounts);

  // In-workbook grouping, plus reviewer-approved merge_with_op unions.
  const extraUnions: Array<[string, string]> = [];
  const previousOps = new Map<string, any>((previous?.operations ?? []).map((o: any) => [o.op_id, o]));
  for (const op of previousOps.values()) {
    const m = /^merge_with_op:(.+)$/.exec(op.review?.decision ?? "");
    if (m && previousOps.has(m[1])) {
      extraUnions.push([op.sources[0].key, previousOps.get(m[1]).sources[0].key]);
    }
  }
  let groups = groupByIdentity(rows);
  if (extraUnions.length) {
    const groupOf = new Map<string, number>();
    groups.forEach((g, i) => g.members.forEach((m) => groupOf.set(m.key, i)));
    const parent = groups.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (const [a, b] of extraUnions) {
      const ga = groupOf.get(a);
      const gb = groupOf.get(b);
      if (ga !== undefined && gb !== undefined) parent[find(gb)] = find(ga);
    }
    const merged = new Map<number, SourceRow[]>();
    groups.forEach((g, i) => merged.set(find(i), [...(merged.get(find(i)) ?? []), ...g.members]));
    groups = [...merged.values()].map((members) => groupByIdentity(members).length === 1
      ? groupByIdentity(members)[0]
      : { members, conflict: undefined });
  }

  const existing = await fetchAll<ExistingProspect>(
    client, "recruiting_prospects",
    "id, first_name, last_name, email, phone, linkedin_url, job_title, current_org, location, source, status, availability, needs_follow_up, updated_at, import_refs",
  );
  const existingById = new Map(existing.map((p) => [p.id, p]));
  const byEmail = new Map(existing.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]));
  const byLinkedin = new Map(existing.filter((p) => p.linkedin_url).map((p) => [p.linkedin_url!, p]));
  const byName = new Map<string, ExistingProspect[]>();
  for (const p of existing) {
    const nk = nameKey(p.first_name, p.last_name);
    if (nk) byName.set(nk, [...(byName.get(nk) ?? []), p]);
  }
  const priorImportRow = new Map<string, string>();
  for (const p of existing) {
    for (const ref of p.import_refs ?? []) priorImportRow.set(`${ref.sheet}!${ref.row}|${ref.name ?? ""}`, p.id);
  }

  // Name keys across groups, for possible in-workbook duplicates.
  const groupNameKeys = groups.map((g) => new Set(g.members.map((m) => nameKey(m.first_name, m.last_name)).filter(Boolean) as string[]));

  const operations: any[] = [];
  const candidateEmails = new Set<string>();

  groups.forEach((group, gi) => {
    const members = [...group.members].sort(
      (a, b) => SHEET_PRIORITY.indexOf(a.sheet) - SHEET_PRIORITY.indexOf(b.sheet) || a.row - b.row,
    );
    const anchor = members[0];
    const { fields, flags: mergeFlags } = mergeFields(members);
    const reasons: string[] = [];
    const flags = [...new Set([...members.flatMap((m) => m.flags.map((f) => `${m.key}: ${f}`)), ...mergeFlags])];
    for (const m of members) for (const b of m.blockers) reasons.push(`${m.key}: ${b}`);
    if (group.conflict) reasons.push(group.conflict);

    const importRefs = members.map((m) => ({
      workbook_sha256: checksum,
      sheet: m.sheet,
      row: m.row,
      name: m.name_original,
      status: m.status_original,
      source: m.source_original,
    }));

    const activities = members.flatMap((m) =>
      m.notes.map((n) => ({
        id: stableUuid(`${checksum}|activity|${m.key}|${n.column}`),
        type: "note",
        body: n.body,
        occurred_at: null,
        original_author: n.author,
        import_ref: { workbook_sha256: checksum, sheet: m.sheet, row: m.row, column: n.column },
      })),
    );

    // Existing-prospect matching: all strong identifiers together.
    const emails = [...new Set(members.map((m) => m.email).filter(Boolean) as string[])];
    const linkedins = [...new Set(members.map((m) => m.linkedin_url).filter(Boolean) as string[])];
    const hits = new Map<string, Set<string>>();
    for (const e of emails) {
      const p = byEmail.get(e);
      if (p) hits.set(p.id, new Set([...(hits.get(p.id) ?? []), "email"]));
    }
    for (const l of linkedins) {
      const p = byLinkedin.get(l);
      if (p) hits.set(p.id, new Set([...(hits.get(p.id) ?? []), "linkedin"]));
    }

    let kind: "create" | "merge" = "create";
    let prospectId = stableUuid(`${checksum}|prospect|${anchor.key}`);
    let expectedUpdatedAt: string | null = null;
    let fillFields: string[] = [];
    const possibleMatches: any[] = [];

    for (const m of members) {
      const prior = priorImportRow.get(`${m.sheet}!${m.row}|${m.name_original ?? ""}`);
      if (prior && prior !== prospectId) {
        possibleMatches.push({ prospect_id: prior, why: `${m.key} was imported before, possibly from an earlier workbook version` });
      }
    }

    if (hits.size > 1) {
      reasons.push(`Identifiers match ${hits.size} different existing prospects`);
      for (const [id, via] of hits) possibleMatches.push({ prospect_id: id, why: `matches ${[...via].join(" + ")}` });
    } else if (hits.size === 1) {
      const [id] = hits.keys();
      const target = existingById.get(id)!;
      const disagree: string[] = [];
      if (target.email && emails.length && !emails.includes(target.email)) disagree.push("email");
      if (target.linkedin_url && linkedins.length && !linkedins.includes(target.linkedin_url)) disagree.push("LinkedIn");
      if (disagree.length) {
        reasons.push(`Matches existing prospect ${id} but the ${disagree.join(" and ")} differs`);
        possibleMatches.push({ prospect_id: id, why: `conflicting ${disagree.join(" and ")}` });
      } else if (target.status === "promoted") {
        reasons.push(`Matches existing prospect ${id}, which is already in the pipeline; it will not be modified`);
      } else {
        kind = "merge";
        prospectId = id;
        expectedUpdatedAt = target.updated_at;
        fillFields = FIELD_KEYS.filter((k) => k !== "status");
      }
    } else {
      for (const nk of groupNameKeys[gi]) {
        for (const p of byName.get(nk) ?? []) {
          possibleMatches.push({ prospect_id: p.id, why: "same name as an existing prospect" });
        }
      }
    }
    if (kind === "create") {
      groups.forEach((_, gj) => {
        if (gj === gi) return;
        for (const nk of groupNameKeys[gi]) {
          if (groupNameKeys[gj].has(nk)) {
            const other = [...groups[gj].members].sort(
              (a, b) => SHEET_PRIORITY.indexOf(a.sheet) - SHEET_PRIORITY.indexOf(b.sheet) || a.row - b.row,
            )[0];
            possibleMatches.push({ op_id: stableUuid(`${checksum}|prospect|${other.key}`), why: `same name as ${other.key} in this workbook` });
          }
        }
      });
    }
    if (possibleMatches.length && !reasons.length) {
      reasons.push("Possible duplicate by name or earlier import; confirm create, skip, or merge");
    }

    // Historical advanced stages need a reviewed promotion.
    const stage = members.map((m) => m.candidate_stage).find(Boolean);
    const stages = new Set(members.map((m) => m.candidate_stage).filter(Boolean));
    let promote: any = null;
    if (stages.size > 1) reasons.push("Rows disagree on the advanced stage");
    if (stage) {
      reasons.push(`Historical stage "${stage}": complete promote fields and review candidate_matches`);
      if (fields.email) candidateEmails.add(String(fields.email));
      const srcLabel: Record<ProspectSource, string> = { linkedin: "LinkedIn", indeed: "Indeed", referral: "Referral", other: "" };
      promote = {
        initial_status: stage,
        first_name: fields.first_name,
        last_name: fields.last_name,
        email: fields.email,
        position_applied: null,
        source: srcLabel[(fields.source as ProspectSource) ?? "other"] || null,
        existing_candidate_id: null,
      };
    }

    const opId = kind === "merge" ? stableUuid(`${checksum}|merge|${anchor.key}`) : prospectId;
    const prev = previousOps.get(opId);
    let review: any = reasons.length ? { reasons, decision: null } : null;
    let fieldOverrides = {};
    let overwriteFields: string[] = [];
    if (prev) {
      fieldOverrides = prev.field_overrides ?? {};
      overwriteFields = prev.overwrite_fields ?? [];
      if (prev.promote && promote) promote = { ...promote, ...prev.promote, initial_status: stage };
      const decision: string | null = prev.review?.decision ?? null;
      const mergeInto = decision && /^merge_into:(.+)$/.exec(decision);
      if (mergeInto) {
        const target = existingById.get(mergeInto[1]);
        if (!target) reasons.push(`merge_into target ${mergeInto[1]} does not exist`);
        else if (target.status === "promoted") reasons.push(`merge_into target ${mergeInto[1]} is in the pipeline`);
        else {
          kind = "merge";
          prospectId = target.id;
          expectedUpdatedAt = target.updated_at;
          fillFields = FIELD_KEYS.filter((k) => k !== "status");
          review = { reasons, decision: "approved", carried: decision };
        }
      } else if (decision && !decision.startsWith("merge_with_op:") && review) {
        review.decision = decision;
      }
    }

    operations.push({
      op_id: opId,
      kind,
      prospect_id: prospectId,
      expected_updated_at: expectedUpdatedAt,
      sources: members.map((m) => ({ key: m.key, name: m.name_original })),
      fields,
      field_overrides: fieldOverrides,
      fill_fields: fillFields,
      overwrite_fields: overwriteFields,
      import_refs: importRefs,
      activities,
      promote,
      candidate_matches: [] as any[],
      possible_matches: possibleMatches,
      flags,
      review,
    });
  });

  // Existing applications for advanced-stage rows.
  if (candidateEmails.size) {
    const { data, error } = await client
      .from("candidates")
      .select("id, first_name, last_name, email, position_applied, status, applied_date")
      .in("email", [...candidateEmails]);
    if (error) die(`Reading candidates: ${error.message}`);
    for (const op of operations) {
      if (!op.promote?.email) continue;
      op.candidate_matches = (data ?? []).filter((c: any) => c.email?.toLowerCase() === op.promote.email);
    }
  }
  const manifest = {
    format: FORMAT,
    manifest_id: manifestId,
    created_at: new Date().toISOString(),
    target,
    workbook: { file_name: path.basename(workbookPath), sha256: checksum },
    sheets,
    row_counts: rowCounts,
    column_mapping: columnMapping,
    approval: { approved: false, approved_by: null, approved_at: null, operations_sha256: null },
    summary: summarize(operations),
    operations,
  };
  writePrivate(outPath, manifest);
  console.log("\nColumn mapping (check before approving):");
  console.log(JSON.stringify(columnMapping, null, 2));
  console.table(manifest.summary);
  console.log(`\nManifest written to ${outPath}. Review, then run: approve --manifest ${outPath} --by "<name>"`);
}

function summarize(operations: any[]) {
  const s = { operations: operations.length, create: 0, merge: 0, needs_review: 0, promote: 0, notes: 0 };
  for (const op of operations) {
    s[op.kind as "create" | "merge"]++;
    if (op.review && !op.review.decision) s.needs_review++;
    if (op.promote) s.promote++;
    s.notes += op.activities.length;
  }
  return s;
}

// ---------------------------------------------------------------------------
// approve
// ---------------------------------------------------------------------------
function approve() {
  const manifestPath = requireArg("manifest");
  const by = requireArg("by");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.format !== FORMAT) die("Not a Talent Pool import manifest");
  const pendingMerges = manifest.operations.filter((o: any) => /^merge_(into|with_op):/.test(o.review?.decision ?? ""));
  if (pendingMerges.length) {
    die(`${pendingMerges.length} merge decisions need another pass: plan --previous ${manifestPath} --out <new manifest>`);
  }
  manifest.approval = {
    approved: true,
    approved_by: by,
    approved_at: new Date().toISOString(),
    operations_sha256: sha256(stableJson(manifest.operations)),
  };
  writePrivate(manifestPath, manifest);
  console.log(`Approved by ${by}. Unresolved review items will be reported as blocked and not applied.`);
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------
type Outcome = "created" | "merged" | "unchanged" | "skipped" | "blocked" | "failed";

function prepare(op: any): { payload?: any; outcome?: Outcome; reason?: string } {
  const decision: string | null = op.review?.decision ?? null;
  if (decision === "skip") return { outcome: "skipped", reason: "Reviewer chose skip" };
  if (op.review && !decision) return { outcome: "blocked", reason: op.review.reasons.join("; ") };
  if (decision && !["create", "approved"].includes(decision)) {
    return { outcome: "blocked", reason: `Unsupported decision "${decision}"` };
  }
  if (decision === "create" && op.kind !== "create") {
    return { outcome: "blocked", reason: 'Decision "create" on a merge operation; re-plan instead' };
  }

  const fields = { ...op.fields };
  for (const [k, v] of Object.entries(op.field_overrides ?? {})) {
    if (!(FIELD_KEYS as readonly string[]).includes(k)) return { outcome: "blocked", reason: `field_overrides.${k} is not an importable field` };
    fields[k] = v;
  }
  if (fields.email) {
    const e = normalizeEmail(fields.email);
    if (!e) return { outcome: "blocked", reason: "Email override is invalid" };
    fields.email = e;
  }
  if (fields.linkedin_url) {
    const l = normalizeLinkedin(fields.linkedin_url);
    if (!l) return { outcome: "blocked", reason: "LinkedIn override is invalid" };
    fields.linkedin_url = l;
  }
  if (!blankToNull(fields.first_name)) return { outcome: "blocked", reason: "First name is required" };
  if (fields.status === "promoted") return { outcome: "blocked", reason: "Status cannot be set to promoted" };

  let promote = null;
  if (op.promote) {
    const p = op.promote;
    if (!p.existing_candidate_id) {
      const missing = ["first_name", "last_name", "email", "position_applied", "source"].filter((k) => !blankToNull(p[k]));
      if (missing.length) return { outcome: "blocked", reason: `Promotion is missing ${missing.join(", ")}` };
      if (!normalizeEmail(p.email)) return { outcome: "blocked", reason: "Promotion email is invalid" };
    }
    promote = {
      ...p,
      email: p.email ? normalizeEmail(p.email) : null,
      acknowledged_candidate_ids: (op.candidate_matches ?? []).map((c: any) => c.id),
    };
  }

  return {
    payload: {
      op_id: op.op_id,
      kind: op.kind,
      prospect_id: op.prospect_id,
      expected_updated_at: op.expected_updated_at,
      fields,
      fill_fields: op.fill_fields ?? [],
      overwrite_fields: op.overwrite_fields ?? [],
      import_refs: op.import_refs,
      activities: op.activities,
      promote,
    },
  };
}

async function apply() {
  const manifestPath = requireArg("manifest");
  const workbookPath = requireArg("workbook");
  const operatorEmail = requireArg("operator-email").toLowerCase();
  const doApply = args.get("apply") === true;
  assertOutsideRepo(manifestPath);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.format !== FORMAT) die("Not a Talent Pool import manifest");
  if (sha256(fs.readFileSync(workbookPath)) !== manifest.workbook.sha256) {
    die("Workbook does not match the reviewed manifest. A changed workbook needs a new plan and review.");
  }
  const { client, target } = supabaseTarget();
  if (manifest.target !== target) die(`Manifest was planned for ${manifest.target}, but .env points at ${target}.`);
  if (!manifest.approval?.approved) die("Manifest is not approved. Run approve first.");
  if (manifest.approval.operations_sha256 !== sha256(stableJson(manifest.operations))) {
    die("Operations changed after approval. Review and approve again.");
  }

  const { data: operator, error: operatorError } = await client
    .from("profiles").select("id").ilike("email", operatorEmail).maybeSingle();
  if (operatorError || !operator) die(`No profile for operator ${operatorEmail}`);

  const prepared = manifest.operations.map((op: any) => ({ op, ...prepare(op) }));
  const needsPromotion = prepared.some((p: any) => p.payload?.promote);
  if (needsPromotion) {
    const { data: enabled, error } = await client.rpc("talent_pool_promotion_enabled");
    if (error) die(`Checking promotion prerequisite: ${error.message}`);
    if (!enabled) {
      for (const p of prepared) {
        if (p.payload?.promote) {
          p.outcome = "blocked";
          p.reason = "Promotion is disabled until candidate records are access-protected";
          delete p.payload;
        }
      }
    }
  }

  const resultsPath = `${manifestPath}.results.json`;
  const results: any = fs.existsSync(resultsPath)
    ? JSON.parse(fs.readFileSync(resultsPath, "utf8"))
    : { manifest_id: manifest.manifest_id, runs: [], operations: {} };

  if (!doApply) {
    const totals: Record<string, number> = { would_apply: 0, skipped: 0, blocked: 0, already_applied: 0 };
    for (const p of prepared) {
      if (p.payload) {
        if (["created", "merged", "unchanged"].includes(results.operations[p.op.op_id]?.result)) totals.already_applied++;
        else totals.would_apply++;
      } else totals[p.outcome as string]++;
    }
    console.log("Dry run. Nothing was written.");
    console.table(totals);
    for (const p of prepared.filter((x: any) => x.outcome === "blocked").slice(0, 50)) {
      console.log(`  blocked ${p.op.op_id} (${p.op.sources.map((s: any) => s.key).join(", ")}): ${p.reason}`);
    }
    console.log("\nRe-run with --apply to write.");
    return;
  }

  const runId = crypto.randomUUID();
  const { data: claimed, error: claimError } = await client.rpc("talent_pool_import_claim", {
    p_manifest_id: manifest.manifest_id, p_run_id: runId, p_target: target,
  });
  if (claimError) die(`Claiming manifest: ${claimError.message}`);
  if (!claimed) die("Another apply of this manifest is running. Wait for it to finish (or 10 minutes after it stopped).");

  results.runs.push({ run_id: runId, operator: operatorEmail, started_at: new Date().toISOString() });
  writePrivate(resultsPath, results);

  const totals: Record<Outcome, number> = { created: 0, merged: 0, unchanged: 0, skipped: 0, blocked: 0, failed: 0 };
  try {
    let i = 0;
    for (const p of prepared) {
      i++;
      let outcome: Outcome;
      let reason: string | undefined;
      let candidateId: string | undefined;
      if (!p.payload) {
        outcome = p.outcome;
        reason = p.reason;
      } else {
        const { data, error } = await client.rpc("talent_pool_import_apply", {
          p_operator: operator!.id, p_manifest_id: manifest.manifest_id, p_run_id: runId, op: p.payload,
        });
        if (error) {
          outcome = "failed";
          reason = error.message;
        } else {
          outcome = data.result;
          reason = data.reason;
          candidateId = data.candidate_id;
        }
      }
      totals[outcome]++;
      results.operations[p.op.op_id] = { result: outcome, reason, candidate_id: candidateId, run_id: runId, at: new Date().toISOString() };
      if (i % 25 === 0 || outcome === "failed") {
        writePrivate(resultsPath, results);
        process.stdout.write(`\r${i}/${prepared.length}`);
      }
    }
  } finally {
    results.runs[results.runs.length - 1].finished_at = new Date().toISOString();
    results.runs[results.runs.length - 1].totals = totals;
    writePrivate(resultsPath, results);
    await client.rpc("talent_pool_import_release", { p_manifest_id: manifest.manifest_id, p_run_id: runId });
  }

  console.log("\n");
  console.table(totals);
  console.log(`Row-level results: ${resultsPath}`);
  if (totals.failed) {
    console.error(`${totals.failed} operations FAILED. Fix the cause and re-run the same command to resume.`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
switch (command) {
  case "plan":
    await plan();
    break;
  case "approve":
    approve();
    break;
  case "apply":
    await apply();
    break;
  default:
    console.log("usage: node --import ./scripts/ts-alias-loader.mjs scripts/talent-pool-import.ts <plan|approve|apply> [options]");
    console.log("See the header of scripts/talent-pool-import.ts for options.");
    process.exit(command ? 1 : 0);
}
