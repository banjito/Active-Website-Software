import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Briefcase,
  ClipboardList,
  FileSignature,
  FolderOpen,
  Megaphone,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { jobRequisitionsService } from "@/services/hr/jobRequisitionsService";
import { candidatesService } from "@/services/hr/candidatesService";
import { offersService } from "@/services/hr/offersService";

/**
 * Warm, low-chrome palette for this page only. The neutrals are deliberately
 * off-white/cream rather than the app's flat white — that warmth is what makes
 * the page read as approachable. Brand accents always go through the `brand`
 * token so white-label instances recolor correctly.
 */
const CANVAS = "bg-[#F7F4F0] dark:bg-[#171614]";
const SURFACE = "bg-white dark:bg-dark-150";
const HAIRLINE = "border-[#E7E1DA] dark:border-white/10";
const DIVIDER = "border-[#F0EAE4] dark:border-white/[0.07]";
const INK = "text-[#23201D] dark:text-white";
const MUTED = "text-[#6E655D] dark:text-white/65";
const FAINT = "text-[#948B83] dark:text-white/45";

type ProfileRow = {
  id: string;
  full_name?: string | null;
  job_title?: string | null;
  department?: string | null;
  hire_date?: string | null;
  employment_status?: string | null;
  hidden?: boolean | null;
};

type AnnouncementRow = {
  id: string;
  title: string;
  excerpt: string | null;
  author_name: string | null;
  category: string | null;
  published_at: string | null;
  created_at: string;
};

type UpcomingStart = {
  key: string;
  name: string;
  role: string;
  date: Date;
};

type TodoItem = {
  key: string;
  label: string;
  detail: string;
  to: string;
  tone: "urgent" | "warm" | "calm";
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight today, so "upcoming" includes someone starting later the same day. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  // Date-only strings parse as UTC and can slip a day west of Greenwich.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export const HrDashboard: React.FC = () => {
  const { user } = useAuth();

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [requisitions, setRequisitions] = useState<
    Awaited<ReturnType<typeof jobRequisitionsService.getAll>>
  >([]);
  const [candidates, setCandidates] = useState<
    Awaited<ReturnType<typeof candidatesService.getAll>>
  >([]);
  const [offers, setOffers] = useState<
    Awaited<ReturnType<typeof offersService.getAll>>
  >([]);
  const [announcement, setAnnouncement] = useState<AnnouncementRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // allSettled on purpose: a reader without rights to one HR table should
      // still get the rest of the dashboard rather than an empty page.
      const [profilesRes, reqRes, candRes, offerRes, annRes] =
        await Promise.allSettled([
          supabase
            .schema("common")
            .from("profiles")
            .select(
              "id, full_name, job_title, department, hire_date, employment_status, hidden",
            ),
          jobRequisitionsService.getAll(),
          candidatesService.getAll(),
          offersService.getAll(),
          supabase
            .schema("common")
            .from("announcements")
            .select(
              "id, title, excerpt, author_name, category, published_at, created_at",
            )
            .eq("is_published", true)
            .order("is_pinned", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1),
        ]);

      if (cancelled) return;

      if (profilesRes.status === "fulfilled" && profilesRes.value.data) {
        setProfiles(profilesRes.value.data as unknown as ProfileRow[]);
      }
      if (reqRes.status === "fulfilled") setRequisitions(reqRes.value);
      if (candRes.status === "fulfilled") setCandidates(candRes.value);
      if (offerRes.status === "fulfilled") setOffers(offerRes.value);
      if (annRes.status === "fulfilled") {
        const latest = annRes.value.data?.[0];
        if (latest) setAnnouncement(latest as unknown as AnnouncementRow);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const today = startOfToday();
    const visible = profiles.filter((p) => !p.hidden);
    const active = visible.filter(
      (p) => (p.employment_status || "active").toLowerCase() === "active",
    );
    const departments = new Set(
      active.map((p) => (p.department || "").trim()).filter(Boolean),
    );

    const recentHires = active.filter((p) => {
      const d = parseDate(p.hire_date);
      return !!d && d <= today && today.getTime() - d.getTime() <= 30 * DAY_MS;
    });

    const openRequisitions = requisitions.filter(
      (r) => r.status === "posted" || r.status === "approved",
    );
    const requisitionsPendingApproval = requisitions.filter(
      (r) => r.status === "pending_approval",
    );
    const draftRequisitions = requisitions.filter((r) => r.status === "draft");

    const inPipeline = candidates.filter(
      (c) => c.status !== "hired" && c.status !== "rejected",
    );
    const newCandidates = inPipeline.filter((c) => c.status === "new");
    const interviewing = inPipeline.filter(
      (c) => c.status === "interview" || c.status === "screening",
    );

    const offersPendingApproval = offers.filter(
      (o) => o.status === "pending_approval",
    );
    const offersAwaitingSignature = offers.filter(
      (o) => o.status === "sent" && o.signature_status === "pending",
    );

    // Upcoming starts come from two places — an accepted offer with a start
    // date, and a profile whose hire date is still in the future. Merge them
    // and de-duplicate by name so a new hire who exists in both shows once.
    const upcoming = new Map<string, UpcomingStart>();
    for (const o of offers) {
      if (o.status !== "accepted") continue;
      const d = parseDate(o.start_date);
      if (!d || d < today) continue;
      const name = o.candidate
        ? `${o.candidate.first_name} ${o.candidate.last_name}`.trim()
        : o.position_title;
      upcoming.set(name.toLowerCase(), {
        key: `offer-${o.id}`,
        name,
        role: o.position_title || o.department || "New hire",
        date: d,
      });
    }
    for (const p of visible) {
      const d = parseDate(p.hire_date);
      if (!d || d <= today) continue;
      const name = (p.full_name || "").trim();
      if (!name || upcoming.has(name.toLowerCase())) continue;
      upcoming.set(name.toLowerCase(), {
        key: `profile-${p.id}`,
        name,
        role: p.job_title || p.department || "New hire",
        date: d,
      });
    }
    const upcomingStarts = [...upcoming.values()].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );

    return {
      activeCount: active.length,
      totalProfiles: visible.length,
      departmentCount: departments.size,
      recentHireCount: recentHires.length,
      openRequisitionCount: openRequisitions.length,
      requisitionsPendingApprovalCount: requisitionsPendingApproval.length,
      draftRequisitionCount: draftRequisitions.length,
      pipelineCount: inPipeline.length,
      newCandidateCount: newCandidates.length,
      interviewingCount: interviewing.length,
      offersPendingApprovalCount: offersPendingApproval.length,
      offersAwaitingSignatureCount: offersAwaitingSignature.length,
      upcomingStarts,
    };
  }, [profiles, requisitions, candidates, offers]);

  const todos = useMemo<TodoItem[]>(() => {
    const items: TodoItem[] = [];
    if (stats.requisitionsPendingApprovalCount > 0) {
      items.push({
        key: "req-approvals",
        label: `Approve ${stats.requisitionsPendingApprovalCount} job ${plural(
          stats.requisitionsPendingApprovalCount,
          "requisition",
          "requisitions",
        )}`,
        detail: "Waiting on a sign-off before they can be posted",
        to: "/hr/recruiting/requisition-approvals",
        tone: "urgent",
      });
    }
    if (stats.offersPendingApprovalCount > 0) {
      items.push({
        key: "offer-approvals",
        label: `Review ${stats.offersPendingApprovalCount} ${plural(
          stats.offersPendingApprovalCount,
          "offer",
          "offers",
        )}`,
        detail: "Offer letters queued for approval",
        to: "/hr/offers/offer-approvals",
        tone: "urgent",
      });
    }
    if (stats.offersAwaitingSignatureCount > 0) {
      items.push({
        key: "offer-signatures",
        label: `${stats.offersAwaitingSignatureCount} ${plural(
          stats.offersAwaitingSignatureCount,
          "offer is",
          "offers are",
        )} awaiting signature`,
        detail: "Sent, but not signed yet",
        to: "/hr/offers/e-signatures",
        tone: "warm",
      });
    }
    if (stats.newCandidateCount > 0) {
      items.push({
        key: "new-candidates",
        label: `Screen ${stats.newCandidateCount} new ${plural(
          stats.newCandidateCount,
          "candidate",
          "candidates",
        )}`,
        detail: "Applied and not yet reviewed",
        to: "/hr/recruiting/candidate-tracking",
        tone: "warm",
      });
    }
    if (stats.upcomingStarts.length > 0) {
      items.push({
        key: "onboarding-prep",
        label: `Prep onboarding for ${stats.upcomingStarts.length} ${plural(
          stats.upcomingStarts.length,
          "new hire",
          "new hires",
        )}`,
        detail: "Packets, checklists, and welcome notes",
        to: "/hr/onboarding/tracking",
        tone: "calm",
      });
    }
    return items.slice(0, 5);
  }, [stats]);

  const firstName = (user?.user_metadata?.name || "")
    .trim()
    .split(/\s+/)[0];

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const summary = useMemo(() => {
    const clauses: string[] = [];
    if (stats.upcomingStarts.length > 0) {
      clauses.push(
        `${stats.upcomingStarts.length} ${plural(
          stats.upcomingStarts.length,
          "person starts",
          "people start",
        )} soon`,
      );
    }
    if (stats.openRequisitionCount > 0) {
      clauses.push(
        `${stats.openRequisitionCount} ${plural(
          stats.openRequisitionCount,
          "role is",
          "roles are",
        )} open`,
      );
    }
    if (stats.newCandidateCount > 0) {
      clauses.push(
        `${stats.newCandidateCount} new ${plural(
          stats.newCandidateCount,
          "candidate is",
          "candidates are",
        )} waiting on a first look`,
      );
    }
    if (clauses.length === 0) {
      return "Nothing is waiting on you right now. Here's where things stand across the team.";
    }
    const joined =
      clauses.length === 1
        ? clauses[0]
        : `${clauses.slice(0, -1).join(", ")} and ${clauses[clauses.length - 1]}`;
    return `${joined[0].toUpperCase()}${joined.slice(1)}. Here's where things stand across the team.`;
  }, [stats]);

  const tools = [
    {
      to: "/hr/recruiting/candidate-tracking",
      icon: Briefcase,
      title: "Recruiting",
      blurb: "Requisitions, candidates, and hiring — all in one pipeline.",
      note:
        stats.pipelineCount > 0
          ? `${stats.pipelineCount} ${plural(stats.pipelineCount, "candidate", "candidates")} in the pipeline`
          : "No one in the pipeline yet",
      accent: true,
    },
    {
      to: "/hr/onboarding/tracking",
      icon: ClipboardList,
      title: "Onboarding",
      blurb: "New hire packets, checklists, and welcome notes.",
      note:
        stats.upcomingStarts.length > 0
          ? `${stats.upcomingStarts.length} ${plural(stats.upcomingStarts.length, "start", "starts")} coming up`
          : "Nobody starting this month",
      accent: stats.upcomingStarts.length > 0,
    },
    {
      to: "/hr/data/employee-profiles",
      icon: Users,
      title: "Employee Data",
      blurb: "Profiles, job history, compensation, and the org chart.",
      note: `${stats.activeCount} active ${plural(stats.activeCount, "profile", "profiles")}`,
      accent: false,
    },
    {
      to: "/hr/offers/offer-letters",
      icon: FileSignature,
      title: "Offers",
      blurb: "Offer letters, approvals, and e-signatures.",
      note:
        stats.offersAwaitingSignatureCount > 0
          ? `${stats.offersAwaitingSignatureCount} awaiting signature`
          : "Nothing out for signature",
      accent: stats.offersAwaitingSignatureCount > 0,
    },
    {
      to: "/hr/employee-files",
      icon: FolderOpen,
      title: "Employee Files",
      blurb: "Document storage with full version history.",
      note: "Everything filed in one place",
      accent: false,
    },
    {
      to: "/hr/analytics/custom-reports",
      icon: BarChart3,
      title: "Reports",
      blurb: "Custom reports and data exports across HR.",
      note: "Build a report from any HR table",
      accent: false,
    },
  ];

  const toneBar: Record<TodoItem["tone"], string> = {
    urgent: "bg-brand",
    warm: "bg-brand/50",
    calm: "bg-[#C3BAB2] dark:bg-white/25",
  };

  return (
    <div className={`-m-6 min-h-[calc(100vh-4rem)] ${CANVAS} ${INK}`}>
      <div className="mx-auto max-w-[1400px] px-6 pb-16 pt-8 md:px-10">
        {/* Masthead */}
        <div
          className={`flex flex-wrap items-end justify-between gap-8 border-b pb-7 ${HAIRLINE}`}
        >
          <div className="min-w-[300px] flex-1">
            <div className="text-[11.5px] font-bold uppercase tracking-[0.11em] text-brand">
              {todayLabel}
            </div>
            <h1 className="mt-2 font-serif text-[38px] font-normal leading-[1.05] tracking-[-0.02em] md:text-[46px]">
              {greeting()}
              {firstName ? `, ${firstName}` : ""}.
            </h1>
            <p className={`mt-2.5 max-w-[62ch] text-[15.5px] leading-relaxed ${MUTED}`}>
              {loading ? "Pulling together today's numbers…" : summary}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Link
              to="/hr/recruiting/job-requisitions"
              className={`inline-flex items-center gap-2 border px-4 py-2.5 text-sm font-semibold transition-colors ${HAIRLINE} ${SURFACE} text-[#3B352F] hover:bg-[#FCFAF8] dark:text-white dark:hover:bg-white/5`}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New requisition
            </Link>
            <Link
              to="/hr/handbook"
              className="inline-flex items-center gap-2 bg-brand px-[18px] py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              <BookOpen className="h-4 w-4" aria-hidden />
              Employee Handbook
            </Link>
          </div>
        </div>

        {/* Stat strip — one continuous rule rather than four floating cards */}
        <div
          className={`mt-7 grid grid-cols-1 gap-px border bg-[#E7E1DA] dark:bg-white/10 ${HAIRLINE} sm:grid-cols-2 xl:grid-cols-4`}
        >
          <StatCell
            icon={Users}
            label="Active employees"
            value={stats.activeCount}
            delta={
              stats.recentHireCount > 0
                ? { text: `+${stats.recentHireCount}`, tone: "good" as const }
                : undefined
            }
            note={
              stats.departmentCount > 0
                ? `across ${stats.departmentCount} ${plural(stats.departmentCount, "department", "departments")}`
                : `${stats.totalProfiles} ${plural(stats.totalProfiles, "profile", "profiles")} on file`
            }
            loading={loading}
          />
          <StatCell
            icon={Briefcase}
            label="Open positions"
            value={stats.openRequisitionCount}
            delta={
              stats.requisitionsPendingApprovalCount > 0
                ? {
                    text: `${stats.requisitionsPendingApprovalCount} pending`,
                    tone: "brand" as const,
                  }
                : undefined
            }
            note={
              stats.draftRequisitionCount > 0
                ? `${stats.draftRequisitionCount} still in draft`
                : "approved and posted"
            }
            loading={loading}
          />
          <StatCell
            icon={UserPlus}
            label="New hires"
            value={stats.recentHireCount}
            delta={{ text: "last 30 days", tone: "muted" as const }}
            note={
              stats.upcomingStarts.length > 0
                ? `${stats.upcomingStarts.length} more starting soon`
                : "no upcoming starts"
            }
            loading={loading}
          />
          <StatCell
            icon={ClipboardList}
            label="In the pipeline"
            value={stats.pipelineCount}
            delta={
              stats.newCandidateCount > 0
                ? { text: `${stats.newCandidateCount} new`, tone: "brand" as const }
                : undefined
            }
            note={
              stats.interviewingCount > 0
                ? `${stats.interviewingCount} in screening or interviews`
                : "candidates not yet hired or rejected"
            }
            loading={loading}
          />
        </div>

        {/* Body */}
        <div className="mt-8 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <section>
            <div className="flex items-baseline justify-between">
              <Link
                to="/hr/data/org-chart"
                className="text-[13.5px] font-semibold text-brand hover:opacity-80"
              >
                See the org chart →
              </Link>
            </div>

            <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {tools.map((tool) => (
                <Link
                  key={tool.to}
                  to={tool.to}
                  className={`group block border border-t-[3px] p-5 transition-colors ${HAIRLINE} ${SURFACE} hover:bg-[#FCFAF8] dark:hover:bg-white/[0.04] ${
                    tool.accent
                      ? "!border-t-brand"
                      : "!border-t-[#B9AFA6] dark:!border-t-white/25"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <tool.icon
                      className={`h-[19px] w-[19px] shrink-0 ${tool.accent ? "text-brand" : MUTED}`}
                      aria-hidden
                    />
                    <span className="text-[17.5px] font-bold tracking-[-0.01em]">
                      {tool.title}
                    </span>
                    <ArrowRight
                      className={`ml-auto h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 ${FAINT}`}
                      aria-hidden
                    />
                  </div>
                  <p className={`mt-2 text-sm leading-relaxed ${MUTED}`}>
                    {tool.blurb}
                  </p>
                  <div
                    className={`mt-3.5 flex items-center gap-2 text-[12.5px] font-semibold ${FAINT}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 ${tool.accent ? "bg-brand" : "bg-[#C3BAB2] dark:bg-white/30"}`}
                    />
                    {loading ? "…" : tool.note}
                  </div>
                </Link>
              ))}
            </div>

            <div
              className={`mt-3.5 border border-dashed p-4 ${HAIRLINE} text-[12.5px] ${FAINT}`}
            >
              <span className="font-semibold uppercase tracking-[0.09em]">
                Coming soon
              </span>
              <span className="ml-2">
                Time &amp; Attendance · Performance Reviews · HR Analytics
                dashboards
              </span>
            </div>
          </section>

          <aside className="flex flex-col gap-6">
            {/* Needs you today */}
            <section className={`border ${HAIRLINE} ${SURFACE}`}>
              <div
                className={`flex items-baseline justify-between border-b px-[18px] py-4 ${DIVIDER}`}
              >
                <h2 className="text-[15.5px] font-bold">Needs you today</h2>
                {todos.length > 0 && (
                  <span className="bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand">
                    {todos.length}
                  </span>
                )}
              </div>
              {loading ? (
                <div className={`px-[18px] py-6 text-sm ${FAINT}`}>Loading…</div>
              ) : todos.length === 0 ? (
                <div className={`px-[18px] py-6 text-sm leading-relaxed ${MUTED}`}>
                  You&apos;re all clear. Nothing is waiting on your sign-off
                  right now.
                </div>
              ) : (
                <div className="flex flex-col">
                  {todos.map((item, i) => (
                    <Link
                      key={item.key}
                      to={item.to}
                      className={`flex gap-3 px-[18px] py-3.5 transition-colors hover:bg-[#FCFAF8] dark:hover:bg-white/[0.04] ${
                        i < todos.length - 1 ? `border-b ${DIVIDER}` : ""
                      }`}
                    >
                      <span
                        className={`w-[3px] shrink-0 ${toneBar[item.tone]}`}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {item.label}
                        </span>
                        <span className={`mt-0.5 block text-[12.5px] ${FAINT}`}>
                          {item.detail}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Starting soon */}
            <section className={`border ${HAIRLINE} ${SURFACE}`}>
              <div className={`border-b px-[18px] py-4 ${DIVIDER}`}>
                <h2 className="text-[15.5px] font-bold">Starting soon</h2>
              </div>
              {loading ? (
                <div className={`px-[18px] py-6 text-sm ${FAINT}`}>Loading…</div>
              ) : stats.upcomingStarts.length === 0 ? (
                <div className={`px-[18px] py-6 text-sm leading-relaxed ${MUTED}`}>
                  No start dates on the calendar. Accepted offers and future
                  hire dates show up here.
                </div>
              ) : (
                <div className="flex flex-col">
                  {stats.upcomingStarts.slice(0, 4).map((person, i, arr) => (
                    <div
                      key={person.key}
                      className={`flex items-center gap-3 px-[18px] py-3.5 ${
                        i < arr.length - 1 ? `border-b ${DIVIDER}` : ""
                      }`}
                    >
                      <div
                        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center text-[13px] font-bold ${
                          i === 0
                            ? "bg-brand/10 text-brand"
                            : "bg-[#E9E3DC] text-[#5C554E] dark:bg-white/10 dark:text-white/70"
                        }`}
                      >
                        {initials(person.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {person.name}
                        </div>
                        <div className={`truncate text-[12.5px] ${FAINT}`}>
                          {person.role} ·{" "}
                          {person.date.toLocaleDateString(undefined, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* From the team */}
            <section className={`border ${HAIRLINE} ${SURFACE}`}>
              <div
                className={`flex items-center gap-2.5 border-b px-[18px] py-4 ${DIVIDER}`}
              >
                <Megaphone className="h-4 w-4 text-brand" aria-hidden />
                <h2 className="text-[15.5px] font-bold">From the team</h2>
              </div>
              <div className="px-[18px] py-4">
                {loading ? (
                  <div className={`text-sm ${FAINT}`}>Loading…</div>
                ) : announcement ? (
                  <>
                    <p className="font-serif text-[20px] leading-snug tracking-[-0.01em]">
                      {announcement.excerpt?.trim() || announcement.title}
                    </p>
                    <p className={`mt-2 text-[13px] ${MUTED}`}>
                      {announcement.author_name || "The People team"}
                      {announcement.published_at || announcement.created_at
                        ? ` · ${new Date(
                            announcement.published_at || announcement.created_at,
                          ).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "long",
                          })}`
                        : ""}
                    </p>
                    <Link
                      to="/hr/announcements"
                      className="mt-3.5 inline-block text-[13.5px] font-bold text-brand hover:opacity-80"
                    >
                      Read the announcement →
                    </Link>
                  </>
                ) : (
                  <>
                    <p className={`text-sm leading-relaxed ${MUTED}`}>
                      Nothing posted yet. Announcements you publish show up here
                      for the whole team.
                    </p>
                    <Link
                      to="/hr/announcements"
                      className="mt-3.5 inline-block text-[13.5px] font-bold text-brand hover:opacity-80"
                    >
                      Write an announcement →
                    </Link>
                  </>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

type StatCellProps = {
  icon: LucideIcon;
  label: string;
  value: number;
  delta?: { text: string; tone: "good" | "brand" | "muted" };
  note: string;
  loading: boolean;
};

const StatCell: React.FC<StatCellProps> = ({
  icon: Icon,
  label,
  value,
  delta,
  note,
  loading,
}) => {
  const deltaTone =
    delta?.tone === "good"
      ? "text-[#2F7A54] dark:text-emerald-400"
      : delta?.tone === "brand"
        ? "text-brand"
        : MUTED;

  return (
    <div className={`px-[22px] py-5 ${SURFACE}`}>
      <div className={`flex items-center gap-2 text-[13.5px] font-semibold ${MUTED}`}>
        <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />
        {label}
      </div>
      <div className="mt-3 flex items-baseline gap-2.5">
        <span className="text-[38px] font-bold leading-none tracking-[-0.03em]">
          {loading ? "—" : value}
        </span>
        {!loading && delta && (
          <span className={`text-[13px] font-bold ${deltaTone}`}>
            {delta.text}
          </span>
        )}
      </div>
      <div className={`mt-1.5 text-[12.5px] ${FAINT}`}>{loading ? "" : note}</div>
    </div>
  );
};

export default HrDashboard;
