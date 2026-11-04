import { REPORT_NAMES } from "@/components/reports/reportMappings";
import { WRAPPED_YEAR } from "./wrappedDrop";

const MIN_REPORTS = 10;
const MIN_ISSUES_AND_IDEAS = 3;
const MIN_ESTIMATES = 5;
const LONGEST_IDEA = 80;

export interface WrappedData {
  firstName: string;
  year: number;
  reports: number;
  lastYearReports: number;
  status: { sent: number; inProgress: number; approvedOrReady: number; other: number };
  typesUsed: number;
  typesTotal: number;
  topType: { title: string; name: string; count: number } | null;
  /** January first. Stops at the current month while the year is still going. */
  months: number[];
  bestDay: { count: number; label: string } | null;
  jobs: number;
  customers: number;
  mostOnOneJob: number;
  issues: number;
  ideas: number;
  fixed: number;
  shippedIdea: string | null;
  teamReports: number;
  /** Quotes are the opportunities the estimates sit on. Won means the quote was awarded. */
  estimates: { made: number; quotes: number; customers: number; won: number };
  /** Lowercase. Empty until the updated SQL is run. */
  email: string;
  /** Set by getsBigfootSlide once the email is checked */
  bigfoot: boolean;
}

// Who gets the Bigfoot slide, kept as a SHA-256 of their email so the code doesn't name them
const BIGFOOT_EMAIL_HASH = "4f7706114aa90318bbc2d8c71ec0d22dea59fa202979f4ca1c39de80835c1bb4";

export async function getsBigfootSlide(email: string) {
  if (!email || !globalThis.crypto?.subtle) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex === BIGFOOT_EMAIL_HASH;
}

const FUN_TITLES: [RegExp, string][] = [
  [/breaker|mccb/i, "The Breaker Whisperer."],
  [/transformer|xfmr/i, "The Transformer Tamer."],
  [/switchgear|switchboard|panelboard/i, "The Switchgear Sage."],
  [/cable|vlf|tan delta/i, "The Cable Wrangler."],
  [/relay/i, "The Relay Ace."],
  [/ground/i, "Ground Control."],
  [/busway/i, "The Busway Boss."],
  [/switch/i, "The Switch Master."],
  [/hazard|permit/i, "The Safety Captain."],
];

/** Takes "7.1.2 Panelboard Assemblies Test Sheet ATS 25" down to "Panelboard Assemblies ATS 25". */
export function shortReportName(name: string) {
  return name
    .replace(/^[\d.]+-?\s*/, "")
    .replace(/\s*(Inspection & )?Test (Sheet|Report)/i, "")
    .trim();
}

export function funTitle(name: string) {
  return FUN_TITLES.find(([pattern]) => pattern.test(name))?.[1] ?? "The Specialist.";
}

/** Dates come back as YYYY-MM-DD, so this reads them without shifting a day by time zone. */
function dayLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function shorten(text: string) {
  return text.length > LONGEST_IDEA ? `${text.slice(0, LONGEST_IDEA).trimEnd()}...` : text;
}

export function toWrappedData(row: any, now = new Date()): WrappedData {
  const stillGoing = now.getFullYear() === WRAPPED_YEAR;
  const fullName = row.top_type
    ? (REPORT_NAMES[row.top_type.key] ?? row.top_type.name ?? "")
    : "";
  const name = shortReportName(fullName);

  return {
    firstName: row.first_name ?? "",
    year: WRAPPED_YEAR,
    reports: row.reports,
    lastYearReports: row.last_year_reports,
    status: {
      sent: row.sent,
      inProgress: row.in_progress,
      approvedOrReady: row.approved_or_ready,
      other: row.other,
    },
    typesUsed: row.types_used,
    typesTotal: row.types_total,
    topType: row.top_type ? { title: funTitle(name), name, count: row.top_type.count } : null,
    months: row.months.slice(0, stillGoing ? now.getMonth() + 1 : 12),
    bestDay: row.best_day
      ? { count: row.best_day.count, label: dayLabel(row.best_day.date) }
      : null,
    jobs: row.jobs,
    customers: row.customers,
    mostOnOneJob: row.most_on_one_job ?? 0,
    issues: row.issues,
    ideas: row.ideas,
    fixed: row.fixed,
    shippedIdea: row.shipped_idea ? shorten(row.shipped_idea) : null,
    teamReports: row.team_reports,
    // Zero until the updated SQL is run
    estimates: {
      made: row.estimates ?? 0,
      quotes: row.estimate_quotes ?? 0,
      customers: row.estimate_customers ?? 0,
      won: row.estimate_wins ?? 0,
    },
    email: (row.email ?? "").trim().toLowerCase(),
    bigfoot: false,
  };
}

export function isWrappedEligible(data: WrappedData) {
  return (
    data.reports >= MIN_REPORTS ||
    data.issues + data.ideas >= MIN_ISSUES_AND_IDEAS ||
    data.estimates.made >= MIN_ESTIMATES ||
    data.bigfoot
  );
}
