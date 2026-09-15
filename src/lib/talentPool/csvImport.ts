/**
 * CSV import for the Talent Pool page.
 *
 * Parses and validates rows with the same normalization rules as the one-time
 * workbook import, then classifies them against existing prospects with
 * findDuplicates. Nothing here writes; TalentPoolImportDialog creates the
 * ready rows through prospectsService.
 */
import { ImportFormatError, parseCsv } from "@/lib/employeeIdImport";
import {
  blankToNull,
  findDuplicates,
  mapSource,
  nameKey,
  normalizeEmail,
  normalizeLinkedin,
  normalizePhone,
  splitName,
} from "./normalize";
import type { ProspectSource, ProspectStatus } from "./normalize";

export { ImportFormatError };

export const MAX_IMPORT_ROWS = 2000;

type EditableStatus = Exclude<ProspectStatus, "promoted">;

export interface CsvProspectFields {
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  job_title: string | null;
  current_org: string | null;
  location: string | null;
  source: ProspectSource;
  status: EditableStatus;
  availability: string | null;
  needs_follow_up: boolean;
  owner_id: string | null;
}

export type CsvRowStatus =
  | "ready"
  | "invalid" // missing or malformed data; fix the file
  | "duplicate_in_file" // same email or LinkedIn as an earlier row
  | "exists" // email/LinkedIn already belongs to a prospect
  | "conflict" // identifiers point at different prospects
  | "possible_duplicate"; // same name as a prospect, nothing else matches

export interface CsvImportRow {
  lineNumber: number;
  /** Chosen at preview time so re-running a partly failed import cannot duplicate. */
  id: string;
  noteId: string;
  displayName: string;
  contact: string;
  fields: CsvProspectFields;
  note: string | null;
  status: CsvRowStatus;
  /** Why the row is skipped; empty when ready. */
  detail: string;
  /** Imported anyway, but a person should look. */
  warnings: string[];
}

export interface ImportMember {
  user_id: string;
  name: string;
  email: string;
}

export interface ExistingProspect {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  linkedin_url: string | null;
  status: ProspectStatus;
}

export const EXAMPLE_TALENT_POOL_CSV = `first_name,last_name,email,phone,linkedin_url,job_title,current_org,location,source,status,availability,needs_follow_up,owner_email,notes
Jordan,Rivera,jordan.rivera@example.com,555-201-4477,https://www.linkedin.com/in/jordan-rivera-example,Relay Technician,Example Power Services,"Houston, TX",LinkedIn,Interested,2 wk on 1 wk off,yes,,Open to travel. NETA Level III.
Casey,Nguyen,casey.nguyen@example.com,(555) 318-9020,,Field Service Engineer,Sample Electric Co,"Denver, CO",Referral,New,,no,,"Referred by a current tech; call after 3pm"
Morgan,Blake,,555.412.7788,linkedin.com/in/morgan-blake-example,Apprentice Technician,,"Phoenix, AZ",Indeed,Contacted,Immediately,,,
`;

/** "First Name", "first_name", and "first-name" all become "first name". */
const words = (value: string) =>
  value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

const HEADER_ALIASES: Record<string, string> = {
  "first name": "first_name",
  first: "first_name",
  firstname: "first_name",
  "given name": "first_name",
  "last name": "last_name",
  last: "last_name",
  lastname: "last_name",
  surname: "last_name",
  "family name": "last_name",
  name: "full_name",
  "full name": "full_name",
  email: "email",
  "email address": "email",
  "e mail": "email",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  cell: "phone",
  linkedin: "linkedin_url",
  "linkedin url": "linkedin_url",
  "linkedin profile": "linkedin_url",
  "job title": "job_title",
  title: "job_title",
  "current title": "job_title",
  position: "job_title",
  "current org": "current_org",
  company: "current_org",
  "current company": "current_org",
  organization: "current_org",
  employer: "current_org",
  location: "location",
  source: "source",
  status: "status",
  availability: "availability",
  "needs follow up": "needs_follow_up",
  "follow up": "needs_follow_up",
  owner: "owner",
  "owner email": "owner",
  "assigned to": "owner",
  notes: "notes",
  note: "notes",
  comments: "notes",
};

const LENGTH_LIMITS: Array<[keyof CsvProspectFields, string, number]> = [
  ["first_name", "First name", 100],
  ["last_name", "Last name", 100],
  ["job_title", "Title", 255],
  ["current_org", "Company", 255],
  ["location", "Location", 255],
  ["availability", "Availability", 500],
];

const STATUS_WORDS: Record<string, EditableStatus> = {
  new: "new",
  contacted: "contacted",
  interested: "interested",
  "future roles": "future_roles",
  "future role": "future_roles",
  "not interested": "not_interested",
};
const PIPELINE_WORDS = new Set(["promoted", "in pipeline"]);
const SOURCE_WORDS = new Set<string>(["linkedin", "indeed", "referral", "other"]);
const TRUE_WORDS = new Set(["yes", "y", "true", "1", "x"]);
const FALSE_WORDS = new Set(["no", "n", "false", "0"]);

/**
 * Turns CSV text into validated rows, flagging duplicates within the file.
 * Throws ImportFormatError when the file has no usable header.
 */
export function parseProspectCsv(text: string, members: ImportMember[]): CsvImportRow[] {
  const table = parseCsv(text);
  if (table.length === 0) throw new ImportFormatError("The file is empty.");

  const headers = table[0].map((h) => HEADER_ALIASES[words(h)] ?? words(h));
  if (!headers.includes("first_name") && !headers.includes("full_name")) {
    throw new ImportFormatError(
      'No name column found. The first row must be a header row with "first_name" (and usually "last_name"), or a single "name" column.',
    );
  }
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    throw new ImportFormatError(
      `This file has ${table.length - 1} rows. Import at most ${MAX_IMPORT_ROWS} at a time; split the file into parts.`,
    );
  }

  const cell = (row: string[], key: string) => {
    const idx = headers.indexOf(key);
    return idx === -1 ? "" : (row[idx] ?? "").trim();
  };

  // Owners match on email, or on name when only one member has it.
  const membersByKey = new Map<string, ImportMember>();
  const nameCounts = new Map<string, number>();
  for (const m of members) {
    const key = m.name?.trim().toLowerCase();
    if (key) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  for (const m of members) {
    const key = m.name?.trim().toLowerCase();
    if (key && nameCounts.get(key) === 1) membersByKey.set(key, m);
    if (m.email) membersByKey.set(m.email.toLowerCase(), m);
  }

  const lineByEmail = new Map<string, number>();
  const lineByLinkedin = new Map<string, number>();
  const rows: CsvImportRow[] = [];

  for (let i = 1; i < table.length; i++) {
    const raw = table[i];
    const lineNumber = i + 1;
    const problems: string[] = [];
    const warnings: string[] = [];

    let first = blankToNull(cell(raw, "first_name"));
    let last = blankToNull(cell(raw, "last_name"));
    const full = cell(raw, "full_name");
    if (!first && full) {
      const parts = splitName(full);
      first = parts.first_name;
      last = last ?? parts.last_name;
      warnings.push(...parts.flags);
    }

    const emailRaw = cell(raw, "email");
    const email = normalizeEmail(emailRaw);
    if (emailRaw && !email) problems.push(`"${emailRaw}" is not a valid email`);

    const sourceRaw = cell(raw, "source");
    const mappedSource = mapSource(sourceRaw);
    const source = SOURCE_WORDS.has(words(sourceRaw))
      ? (words(sourceRaw) as ProspectSource)
      : mappedSource.source;

    const linkedinRaw = cell(raw, "linkedin_url");
    let linkedin_url = mappedSource.linkedin_url;
    if (linkedinRaw) {
      linkedin_url = normalizeLinkedin(linkedinRaw);
      if (!linkedin_url) problems.push("LinkedIn must be a profile link (linkedin.com/in/...)");
    }

    const phone = normalizePhone(cell(raw, "phone"));
    if (phone.flag) warnings.push(phone.flag);

    const statusRaw = cell(raw, "status");
    let status: EditableStatus = "new";
    if (statusRaw) {
      const key = words(statusRaw);
      if (STATUS_WORDS[key]) status = STATUS_WORDS[key];
      else if (PIPELINE_WORDS.has(key))
        problems.push('"In pipeline" is set by Promote to Candidate; import with another status first');
      else warnings.push(`Status "${statusRaw}" not recognized; imported as New`);
    }

    const followRaw = cell(raw, "needs_follow_up");
    const needs_follow_up = TRUE_WORDS.has(words(followRaw));
    if (followRaw && !needs_follow_up && !FALSE_WORDS.has(words(followRaw))) {
      warnings.push(`Follow-up "${followRaw}" not recognized; left off`);
    }

    const ownerRaw = cell(raw, "owner");
    let owner_id: string | null = null;
    if (ownerRaw) {
      const member = membersByKey.get(ownerRaw.toLowerCase());
      if (member) owner_id = member.user_id;
      else warnings.push(`Owner "${ownerRaw}" is not a Talent Pool member; left unassigned`);
    }

    const fields: CsvProspectFields = {
      first_name: first ?? "",
      last_name: last,
      email,
      phone: phone.value,
      linkedin_url,
      job_title: blankToNull(cell(raw, "job_title")),
      current_org: blankToNull(cell(raw, "current_org")),
      location: blankToNull(cell(raw, "location")),
      source,
      status,
      availability: blankToNull(cell(raw, "availability")),
      needs_follow_up,
      owner_id,
    };

    if (!fields.first_name) problems.push("No first name");
    for (const [key, label, max] of LENGTH_LIMITS) {
      const value = fields[key];
      if (typeof value === "string" && value.length > max) {
        problems.push(`${label} is longer than ${max} characters`);
      }
    }
    const note = blankToNull(cell(raw, "notes"));
    if (note && note.length > 10000) problems.push("Notes are longer than 10000 characters");

    const base = {
      lineNumber,
      id: crypto.randomUUID(),
      noteId: crypto.randomUUID(),
      displayName: [first, last].filter(Boolean).join(" ") || "(no name)",
      contact: email ?? linkedin_url ?? phone.value ?? "",
      fields,
      note,
      warnings,
    };

    if (problems.length) {
      rows.push({ ...base, status: "invalid", detail: problems.join("; ") });
      continue;
    }

    const emailLine = email ? lineByEmail.get(email) : undefined;
    const linkedinLine = linkedin_url ? lineByLinkedin.get(linkedin_url) : undefined;
    if (emailLine !== undefined || linkedinLine !== undefined) {
      rows.push({
        ...base,
        status: "duplicate_in_file",
        detail:
          emailLine !== undefined
            ? `Same email as line ${emailLine}`
            : `Same LinkedIn as line ${linkedinLine}`,
      });
      continue;
    }
    if (email) lineByEmail.set(email, lineNumber);
    if (linkedin_url) lineByLinkedin.set(linkedin_url, lineNumber);

    rows.push({ ...base, status: "ready", detail: "" });
  }

  return rows;
}

/** What to look up in the database for the rows still marked ready. */
export function identityLookup(rows: CsvImportRow[]) {
  const ready = rows.filter((r) => r.status === "ready");
  const unique = (values: Array<string | null>) =>
    [...new Set(values.filter((v): v is string => !!v))];
  return {
    emails: unique(ready.map((r) => r.fields.email)),
    linkedinUrls: unique(ready.map((r) => r.fields.linkedin_url)),
    nameKeys: unique(ready.map((r) => nameKey(r.fields.first_name, r.fields.last_name))),
  };
}

/** Marks ready rows that match existing prospects. See findDuplicates for the rules. */
export function classifyAgainstExisting(
  rows: CsvImportRow[],
  existing: ExistingProspect[],
): CsvImportRow[] {
  const ready = rows.filter((r) => r.status === "ready");
  if (ready.length === 0 || existing.length === 0) return rows;

  const byId = new Map(existing.map((p) => [p.id, p]));
  const describe = (id: string) => {
    const p = byId.get(id);
    if (!p) return "an existing prospect";
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
    return p.status === "promoted" ? `${name} (in pipeline)` : name;
  };

  const report = findDuplicates(
    ready.map((r) => ({
      key: String(r.lineNumber),
      first_name: r.fields.first_name,
      last_name: r.fields.last_name,
      email: r.fields.email,
      linkedin_url: r.fields.linkedin_url,
    })),
    existing.map((p) => ({
      key: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      linkedin_url: p.linkedin_url,
    })),
  );

  const outcome = new Map<string, Pick<CsvImportRow, "status" | "detail">>();
  for (const hit of report.confident) {
    const via = hit.via.map((v) => (v === "email" ? "email" : "LinkedIn")).join(" and ");
    outcome.set(hit.key, {
      status: "exists",
      detail: `Already in the Talent Pool as ${describe(hit.id)} (same ${via})`,
    });
  }
  for (const hit of report.conflicts) {
    outcome.set(hit.key, {
      status: "conflict",
      detail: `${hit.reason}: ${hit.ids.map(describe).join(", ")}`,
    });
  }
  for (const hit of report.possible) {
    outcome.set(hit.key, {
      status: "possible_duplicate",
      detail: `Same name as ${hit.ids.map(describe).join(", ")}`,
    });
  }

  return rows.map((r) => {
    const o = r.status === "ready" ? outcome.get(String(r.lineNumber)) : undefined;
    return o ? { ...r, ...o } : r;
  });
}

export const CSV_ROW_STATUS_LABELS: Record<CsvRowStatus, string> = {
  ready: "Ready",
  invalid: "Invalid",
  duplicate_in_file: "Duplicate in file",
  exists: "Already in pool",
  conflict: "Conflict",
  possible_duplicate: "Possible duplicate",
};
