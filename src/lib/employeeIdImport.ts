/**
 * CSV parsing + matching for bulk employee ID assignment.
 *
 * Kept out of the page component so the matching rules are testable and the
 * page stays about rendering. Nothing here writes to the database; the caller
 * decides what to do with the resolved rows.
 */

export interface ImportProfile {
  id: string;
  full_name?: string;
  email?: string;
  employee_number?: string;
}

export type ImportStatus =
  | "ready" // matched exactly one profile, safe to write
  | "unchanged" // matched, already has this exact ID
  | "no_match" // nobody in the system with that email/name
  | "ambiguous" // more than one profile matches the name
  | "duplicate_in_file" // the same ID appears on two CSV rows
  | "taken" // ID already belongs to a different employee
  | "invalid"; // row is unusable (no ID, or no way to identify a person)

export interface ImportRow {
  lineNumber: number;
  employeeNumber: string;
  /** Whatever the CSV gave us to identify the person, for display. */
  identifier: string;
  status: ImportStatus;
  profileId?: string;
  profileName?: string;
  /** Plain-English explanation, shown in the preview table. */
  detail: string;
}

export const EXAMPLE_EMPLOYEE_ID_CSV = `employee_id,email,first_name,last_name
1001,brian.rodgers@ampqes.com,Brian,Rodgers
1002,,John,Lyons
0034,kyle.young@ampqes.com,Kyle,Young
S0002,,Richard,Perry
`;

/** Collapses whitespace and lowercases, so " Kelly  Lawton " matches "kelly lawton". */
const normalizeName = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

const normalizeEmail = (value: string) => value.trim().toLowerCase();

/**
 * Minimal RFC-4180 CSV reader: handles quoted fields, escaped quotes,
 * embedded commas/newlines, CRLF, and a leading BOM.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // Swallow the \n of a \r\n pair.
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  // Trailing field/row when the file doesn't end in a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop rows that are entirely empty (blank lines).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Header aliases, so people don't have to match our spelling exactly. */
const HEADER_ALIASES: Record<string, string> = {
  employee_id: "employee_id",
  "employee id": "employee_id",
  employeeid: "employee_id",
  employee_number: "employee_id",
  "employee number": "employee_id",
  id: "employee_id",
  badge: "employee_id",
  "badge number": "employee_id",
  email: "email",
  "email address": "email",
  first_name: "first_name",
  "first name": "first_name",
  first: "first_name",
  last_name: "last_name",
  "last name": "last_name",
  last: "last_name",
  full_name: "full_name",
  "full name": "full_name",
  name: "full_name",
};

export class ImportFormatError extends Error {}

/**
 * Turns raw CSV text into resolved rows against the current profile list.
 * Throws ImportFormatError if the file has no usable header.
 */
export function buildImportRows(
  text: string,
  profiles: ImportProfile[],
): ImportRow[] {
  const table = parseCsv(text);
  if (table.length === 0) {
    throw new ImportFormatError("The file is empty.");
  }

  const headers = table[0].map(
    (h) => HEADER_ALIASES[h.trim().toLowerCase()] || h.trim().toLowerCase(),
  );

  if (!headers.includes("employee_id")) {
    throw new ImportFormatError(
      'No "employee_id" column found. The first row must be a header row, e.g. employee_id,email,first_name,last_name',
    );
  }

  const hasIdentifier =
    headers.includes("email") ||
    headers.includes("full_name") ||
    (headers.includes("first_name") && headers.includes("last_name"));

  if (!hasIdentifier) {
    throw new ImportFormatError(
      'Need a way to identify each person: add an "email" column, or "first_name" and "last_name".',
    );
  }

  const cell = (row: string[], key: string) => {
    const idx = headers.indexOf(key);
    return idx === -1 ? "" : (row[idx] ?? "").trim();
  };

  // Lookups built once.
  const byEmail = new Map<string, ImportProfile[]>();
  const byName = new Map<string, ImportProfile[]>();
  for (const p of profiles) {
    if (p.email) {
      const key = normalizeEmail(p.email);
      byEmail.set(key, [...(byEmail.get(key) || []), p]);
    }
    if (p.full_name) {
      const key = normalizeName(p.full_name);
      byName.set(key, [...(byName.get(key) || []), p]);
    }
  }

  const seenIds = new Map<string, number>();
  const rows: ImportRow[] = [];

  for (let i = 1; i < table.length; i++) {
    const raw = table[i];
    const lineNumber = i + 1;

    const employeeNumber = cell(raw, "employee_id");
    const email = cell(raw, "email");
    const fullName =
      cell(raw, "full_name") ||
      [cell(raw, "first_name"), cell(raw, "last_name")]
        .filter(Boolean)
        .join(" ");
    const identifier = email || fullName || "(blank)";

    const push = (status: ImportStatus, detail: string, p?: ImportProfile) =>
      rows.push({
        lineNumber,
        employeeNumber,
        identifier,
        status,
        profileId: p?.id,
        profileName: p?.full_name || p?.email,
        detail,
      });

    if (!employeeNumber) {
      push("invalid", "No employee ID on this row.");
      continue;
    }
    if (!email && !fullName) {
      push("invalid", "No email or name to match on.");
      continue;
    }

    // Same ID twice in one file: keep the first, flag the rest.
    const firstSeen = seenIds.get(employeeNumber);
    if (firstSeen !== undefined) {
      push(
        "duplicate_in_file",
        `Same ID is already used on line ${firstSeen} of this file.`,
      );
      continue;
    }
    seenIds.set(employeeNumber, lineNumber);

    // Email is the reliable key, so try it first and only fall back to name.
    const matches = email
      ? byEmail.get(normalizeEmail(email)) || []
      : byName.get(normalizeName(fullName)) || [];

    if (matches.length === 0) {
      push(
        "no_match",
        email
          ? "No employee with this email address."
          : "No employee with this name.",
      );
      continue;
    }
    if (matches.length > 1) {
      push(
        "ambiguous",
        `${matches.length} employees share this name. Use an email column for these.`,
      );
      continue;
    }

    const match = matches[0];

    if (match.employee_number === employeeNumber) {
      push("unchanged", "Already has this ID.", match);
      continue;
    }

    // Would collide with the unique index.
    const owner = profiles.find(
      (p) => p.employee_number === employeeNumber && p.id !== match.id,
    );
    if (owner) {
      push(
        "taken",
        `ID already belongs to ${owner.full_name || owner.email}.`,
        match,
      );
      continue;
    }

    push(
      "ready",
      match.employee_number
        ? `Will change from ${match.employee_number} to ${employeeNumber}.`
        : "Will be assigned.",
      match,
    );
  }

  return rows;
}

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  ready: "Ready",
  unchanged: "No change",
  no_match: "Not found",
  ambiguous: "Ambiguous",
  duplicate_in_file: "Duplicate in file",
  taken: "ID taken",
  invalid: "Invalid row",
};
