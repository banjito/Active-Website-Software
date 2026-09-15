/**
 * Talent Pool normalization and duplicate matching.
 *
 * Pure functions with no imports so the page, the service, and the one-time
 * import script (scripts/talent-pool-import.ts) share one set of rules. The
 * database enforces the same email/LinkedIn canonical forms in
 * common.recruiting_prospects_before_write(); keep the two in sync.
 */

export type ProspectStatus =
  | "new"
  | "contacted"
  | "interested"
  | "future_roles"
  | "not_interested"
  | "promoted";

export type ProspectSource = "linkedin" | "indeed" | "referral" | "other";

export type CandidateStage =
  | "screening"
  | "interview"
  | "offer"
  | "offer_sent"
  | "offer_accepted"
  | "hired";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function blankToNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function normalizeEmail(raw: unknown): string | null {
  const text = blankToNull(raw);
  if (!text) return null;
  const email = text.replace(/^mailto:/i, "").toLowerCase();
  return EMAIL_RE.test(email) && email.length <= 255 ? email : null;
}

/** Canonical https://www.linkedin.com/in/<slug>, or null when not a profile link. */
export function normalizeLinkedin(raw: unknown): string | null {
  let text = blankToNull(raw);
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  text = text.replace(/[?#].*$/, "");
  const match = text.match(/^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/\s]+)\/?.*$/i);
  if (!match || !match[1]) return null;
  return `https://www.linkedin.com/in/${match[1].toLowerCase()}`;
}

export function looksLikeLinkedin(raw: unknown): boolean {
  const text = blankToNull(raw);
  return !!text && /linkedin\.com\//i.test(text);
}

export interface PhoneResult {
  value: string | null;
  /** Set when the value was kept as-is or dropped and a person should look. */
  flag?: string;
}

function formatNanp(digits: string): string | null {
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return null;
  // Area code and exchange cannot start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(ten)) return null;
  return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/**
 * Phones from spreadsheets arrive as text or as numbers (3.608886757E9).
 * Only an exact North American number is reformatted; international numbers
 * and extensions are preserved; anything else is flagged, never guessed at.
 */
export function normalizePhone(raw: unknown): PhoneResult {
  if (raw === null || raw === undefined || raw === "") return { value: null };

  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) {
      return { value: null, flag: `Phone ${raw} is not a whole number` };
    }
    const formatted = formatNanp(raw.toFixed(0));
    return formatted
      ? { value: formatted }
      : { value: raw.toFixed(0), flag: `Phone ${raw.toFixed(0)} is not a valid North American number` };
  }

  const text = String(raw).trim();
  if (!text) return { value: null };
  if (/e\+?\d+$/i.test(text) && /^\d+(\.\d+)?e\+?\d+$/i.test(text)) {
    const n = Number(text);
    return normalizePhone(n);
  }
  if (/\b(ext|x)\.?\s*\d+/i.test(text)) return { value: text.slice(0, 50) };
  if (text.startsWith("+") && !text.startsWith("+1")) return { value: text.slice(0, 50) };

  const digits = text.replace(/\D/g, "");
  const formatted = formatNanp(digits);
  if (formatted) return { value: formatted };
  return { value: text.slice(0, 50), flag: `Phone "${text}" kept as entered; check it` };
}

export interface NameParts {
  first_name: string | null;
  last_name: string | null;
  flags: string[];
}

/** Suggests a first/last split. Never invents a surname. */
export function splitName(raw: unknown): NameParts {
  const flags: string[] = [];
  let text = blankToNull(raw);
  if (!text) return { first_name: null, last_name: null, flags: ["Name is blank"] };

  text = text.replace(/\s+/g, " ");
  if (text.includes(",")) {
    flags.push(`Name "${text}" contains a comma; check for credentials or "Last, First" order`);
    text = text.split(",")[0].trim();
  }
  const parts = text.split(" ").filter(Boolean);
  if (parts.length === 1) {
    flags.push(`Single name "${text}"; a last name is needed before promotion`);
    return { first_name: parts[0], last_name: null, flags };
  }
  if (parts.length > 2) {
    flags.push(`Name "${text}" has ${parts.length} parts; check the first/last split`);
  }
  return { first_name: parts[0], last_name: parts.slice(1).join(" "), flags };
}

export function nameKey(first: unknown, last: unknown): string | null {
  const f = blankToNull(first)?.toLowerCase().replace(/[^a-z]/g, "");
  const l = blankToNull(last)?.toLowerCase().replace(/[^a-z]/g, "");
  if (!f || !l) return null;
  return `${f} ${l}`;
}

export interface SourceResult {
  source: ProspectSource;
  linkedin_url: string | null;
  original: string | null;
}

export function mapSource(raw: unknown): SourceResult {
  const original = blankToNull(raw);
  if (!original) return { source: "other", linkedin_url: null, original };
  if (looksLikeLinkedin(original)) {
    return { source: "linkedin", linkedin_url: normalizeLinkedin(original), original };
  }
  const lower = original.toLowerCase();
  if (lower.includes("linkedin")) return { source: "linkedin", linkedin_url: null, original };
  if (lower.includes("indeed")) return { source: "indeed", linkedin_url: null, original };
  if (lower.includes("referr")) return { source: "referral", linkedin_url: null, original };
  return { source: "other", linkedin_url: null, original };
}

export interface SheetStatusResult {
  known: boolean;
  status: Exclude<ProspectStatus, "promoted">;
  /** Present for historical advanced stages that need a reviewed promotion. */
  candidateStage?: CandidateStage;
}

/** Sheet1 STATUS column, per the plan's mapping table. */
export function mapSheetStatus(raw: unknown): SheetStatusResult {
  const text = blankToNull(raw)?.toUpperCase().replace(/\s+/g, " ");
  if (!text) return { known: true, status: "new" };
  switch (text) {
    case "INTERESTED":
      return { known: true, status: "interested" };
    case "NOT INTERESTED":
      return { known: true, status: "not_interested" };
    case "CAN BE CONSIDERED FOR FUTURE ROLES":
      return { known: true, status: "future_roles" };
    case "CONTACTED BY DIONNE":
    case "EXISTING CONTACT DETAILS":
      return { known: true, status: "contacted" };
    case "INTERVIEW SCHEDULED":
      return { known: true, status: "new", candidateStage: "interview" };
    case "OFFERED":
      return { known: true, status: "new", candidateStage: "offer" };
    case "TERMS SENT":
      return { known: true, status: "new", candidateStage: "offer_sent" };
    case "HIRED":
      return { known: true, status: "new", candidateStage: "hired" };
    default:
      return { known: false, status: "new" };
  }
}

// ---------------------------------------------------------------------------
// Duplicate matching
// ---------------------------------------------------------------------------

export interface MatchSubject {
  key: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  linkedin_url: string | null;
}

export interface DuplicateReport {
  /** Strong identifier matches one record and nothing populated disagrees. */
  confident: Array<{ key: string; id: string; via: Array<"email" | "linkedin"> }>;
  /** Same name only. Never merged without a person confirming. */
  possible: Array<{ key: string; ids: string[] }>;
  /** Identifiers point at different records, or disagree with the match. */
  conflicts: Array<{ key: string; ids: string[]; reason: string }>;
}

/**
 * Compares incoming rows against existing records. Email and LinkedIn are
 * checked together: a match is confident only when every populated strong
 * identifier agrees.
 */
export function findDuplicates(rows: MatchSubject[], existing: Array<MatchSubject & { key: string }>): DuplicateReport {
  const byEmail = new Map<string, MatchSubject>();
  const byLinkedin = new Map<string, MatchSubject>();
  const byName = new Map<string, MatchSubject[]>();
  for (const record of existing) {
    if (record.email) byEmail.set(record.email.toLowerCase(), record);
    if (record.linkedin_url) byLinkedin.set(record.linkedin_url, record);
    const nk = nameKey(record.first_name, record.last_name);
    if (nk) byName.set(nk, [...(byName.get(nk) ?? []), record]);
  }

  const report: DuplicateReport = { confident: [], possible: [], conflicts: [] };
  for (const row of rows) {
    const emailHit = row.email ? byEmail.get(row.email.toLowerCase()) : undefined;
    const linkedinHit = row.linkedin_url ? byLinkedin.get(row.linkedin_url) : undefined;

    if (emailHit && linkedinHit && emailHit.key !== linkedinHit.key) {
      report.conflicts.push({
        key: row.key,
        ids: [emailHit.key, linkedinHit.key],
        reason: "Email matches one record and LinkedIn matches another",
      });
      continue;
    }

    const hit = emailHit ?? linkedinHit;
    if (hit) {
      const disagreements: string[] = [];
      if (row.email && hit.email && row.email.toLowerCase() !== hit.email.toLowerCase()) disagreements.push("email");
      if (row.linkedin_url && hit.linkedin_url && row.linkedin_url !== hit.linkedin_url) disagreements.push("LinkedIn");
      if (disagreements.length) {
        report.conflicts.push({
          key: row.key,
          ids: [hit.key],
          reason: `Matched on one identifier but the ${disagreements.join(" and ")} differs`,
        });
        continue;
      }
      const via: Array<"email" | "linkedin"> = [];
      if (emailHit) via.push("email");
      if (linkedinHit) via.push("linkedin");
      report.confident.push({ key: row.key, id: hit.key, via });
      continue;
    }

    const nk = nameKey(row.first_name, row.last_name);
    const sameName = nk ? byName.get(nk) : undefined;
    if (sameName?.length) {
      report.possible.push({ key: row.key, ids: sameName.map((r) => r.key) });
    }
  }
  return report;
}

export interface IdentityGroup<T extends MatchSubject> {
  members: T[];
  /** Set when members disagree on email or LinkedIn; needs review. */
  conflict?: string;
}

/**
 * Groups rows that share an email or LinkedIn URL (transitively). Groups whose
 * members carry different emails or LinkedIn URLs are flagged, not merged.
 * Name-only overlaps are not grouped; use findDuplicates for those.
 */
export function groupByIdentity<T extends MatchSubject>(rows: T[]): IdentityGroup<T>[] {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const seen = new Map<string, number>();
  rows.forEach((row, i) => {
    for (const id of [row.email ? `e:${row.email.toLowerCase()}` : null, row.linkedin_url ? `l:${row.linkedin_url}` : null]) {
      if (!id) continue;
      const prior = seen.get(id);
      if (prior === undefined) seen.set(id, i);
      else union(prior, i);
    }
  });

  const groups = new Map<number, T[]>();
  rows.forEach((row, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), row]);
  });

  return [...groups.values()].map((members) => {
    const emails = new Set(members.map((m) => m.email?.toLowerCase()).filter(Boolean));
    const linkedins = new Set(members.map((m) => m.linkedin_url).filter(Boolean));
    const problems: string[] = [];
    if (emails.size > 1) problems.push(`${emails.size} different emails`);
    if (linkedins.size > 1) problems.push(`${linkedins.size} different LinkedIn URLs`);
    return problems.length ? { members, conflict: `Linked rows carry ${problems.join(" and ")}` } : { members };
  });
}
