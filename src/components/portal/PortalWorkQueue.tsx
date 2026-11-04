// Compact "work queue" block for the home page (used by /portal).
// Replaces the separate Announcements + Review/Issue/Approved/Action Item
// shortcut sections with one tabbed queue, plus a side column holding
// announcements and today's schedule.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, Megaphone, Settings } from "lucide-react";
import { ReviewShortcuts } from "@/components/shortcuts/ReviewShortcuts";
import { IssueShortcuts } from "@/components/shortcuts/IssueShortcuts";
import { ActionItemShortcuts } from "@/components/shortcuts/ActionItemShortcuts";
import { ApprovedShortcuts } from "@/components/shortcuts/ApprovedShortcuts";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";

type QueueKey = "review" | "issue" | "action" | "approved";

const QUEUE_TABS: { key: QueueKey; label: string }[] = [
  { key: "review", label: "Needs review" },
  { key: "issue", label: "Issues" },
  { key: "action", label: "Action items" },
  { key: "approved", label: "Approved" },
];

// Key name kept from the /portal2 trial so saved choices carry over.
const TAB_STORAGE_KEY = "portal2.queueTab";

export interface QueueAnnouncement {
  id: string;
  title: string;
  content: string;
  category?: string | null;
  is_pinned?: boolean | null;
  published_at?: string | null;
  created_at: string;
}

export interface QueueAnnouncementState {
  acknowledged_at: string | null;
  dismissed_at: string | null;
  signed_at: string | null;
}

interface PortalWorkQueueProps {
  // Comes from the home page, which already loads (and audience-filters)
  // these, so signing in its popup updates this list right away.
  announcements: QueueAnnouncement[];
  announcementState: Record<string, QueueAnnouncementState>;
  // Opens the home page's View & Acknowledge document popup.
  onOpenDocument: (docUrl: string, title: string, announcementId: string) => void;
  // Last tab picked, from the user's saved portal prefs (null until loaded).
  savedTab?: string | null;
  onTabChange?: (key: QueueKey) => void;
  // Ops Managers and Admins get a gear to turn tabs / side cards on and off.
  canCustomize?: boolean;
  hiddenDisplays?: string[];
  onHiddenDisplaysChange?: (next: string[]) => void;
}

const SIDE_DISPLAYS: { key: string; label: string }[] = [
  { key: "announcements", label: "Announcements" },
  { key: "today", label: "Today's schedule" },
];

// Same marker the home page and HR announcements use for sign-off documents.
const ACK_DOC_RE = /📄 \[View & Acknowledge Document\]\(([^)]+)\)/;

interface TodayAssignment {
  id: string;
  job_id: string | null;
  division: string | null;
  start_time: string | null;
  jobNumber?: string;
  jobTitle?: string;
}

const card =
  "bg-white dark:bg-dark-150 border border-neutral-200 dark:border-dark-300 rounded-none";

function greetingFor(date: Date) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function localDateString(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(t: string | null) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return "";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr ?? "00"} ${h >= 12 ? "PM" : "AM"}`;
}

function timeAgo(iso: string) {
  const diffH = Math.floor((Date.now() - new Date(iso).getTime()) / 36e5);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  const d = Math.floor(diffH / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export default function PortalWorkQueue({
  announcements,
  announcementState,
  onOpenDocument,
  savedTab,
  onTabChange,
  canCustomize = false,
  hiddenDisplays = [],
  onHiddenDisplaysChange,
}: PortalWorkQueueProps) {
  const { user } = useAuth();

  // ---------- Tabs ----------
  const [tab, setTab] = useState<QueueKey>(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY) as QueueKey | null;
      return saved && QUEUE_TABS.some((t) => t.key === saved) ? saved : "review";
    } catch {
      return "review";
    }
  });
  const [counts, setCounts] = useState<Record<QueueKey, number | null>>({
    review: null,
    issue: null,
    action: null,
    approved: null,
  });

  // The browser copy above shows the right tab instantly; the saved profile
  // copy wins once it loads (sign-out wipes the browser copy).
  useEffect(() => {
    if (savedTab && QUEUE_TABS.some((t) => t.key === savedTab)) {
      setTab(savedTab as QueueKey);
    }
  }, [savedTab]);

  const selectTab = (key: QueueKey) => {
    setTab(key);
    onTabChange?.(key);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, key);
    } catch {
      /* private mode: browser copy just isn't kept */
    }
  };

  // One stable callback per tab, so the child effects don't loop.
  const countHandlers = useMemo(() => {
    const make = (key: QueueKey) => (n: number) =>
      setCounts((prev) => (prev[key] === n ? prev : { ...prev, [key]: n }));
    return {
      review: make("review"),
      issue: make("issue"),
      action: make("action"),
      approved: make("approved"),
    };
  }, []);

  // ---------- Gear: which displays show (Ops Managers / Admins) ----------
  const hidden = canCustomize ? hiddenDisplays : [];
  const visibleTabs = QUEUE_TABS.filter((t) => !hidden.includes(t.key));
  const activeTab: QueueKey | null = visibleTabs.some((t) => t.key === tab)
    ? tab
    : (visibleTabs[0]?.key ?? null);
  const showAnnouncements = !hidden.includes("announcements");
  const showToday = !hidden.includes("today");
  const showSide = showAnnouncements || showToday;
  const [gearOpen, setGearOpen] = useState(false);

  const toggleDisplay = (key: string) => {
    const next = hidden.includes(key)
      ? hidden.filter((k) => k !== key)
      : [...hidden, key];
    onHiddenDisplaysChange?.(next);
  };

  useEffect(() => {
    if (!gearOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGearOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gearOpen]);

  // Each tab mounts its list the first time it's opened, so a home page
  // visit loads one list instead of four.
  const [opened, setOpened] = useState<Set<QueueKey>>(() => new Set([tab]));
  useEffect(() => {
    if (!activeTab) return;
    setOpened((prev) =>
      prev.has(activeTab) ? prev : new Set(prev).add(activeTab),
    );
  }, [activeTab]);

  // All four tab counts in one request (database/migrations/portal_queue_counts.sql).
  // If that function isn't there, each badge fills in when its tab is opened.
  useEffect(() => {
    let cancelled = false;
    const loadCounts = async () => {
      const { data, error } = await supabase
        .schema("neta_ops")
        .rpc("get_portal_queue_counts");
      if (cancelled) return;
      if (error) {
        console.warn("Work queue counts unavailable:", error.message);
        return;
      }
      const row: any = Array.isArray(data) ? data[0] : data;
      if (!row) return;
      setCounts({
        review: row.review_jobs ?? 0,
        issue: row.issue_jobs ?? 0,
        action: row.action_jobs ?? 0,
        approved: row.approved_jobs ?? 0,
      });
    };
    void loadCounts();
    // Same event the lists listen to when a report changes status.
    window.addEventListener("assetStatusChanged", loadCounts);
    return () => {
      cancelled = true;
      window.removeEventListener("assetStatusChanged", loadCounts);
    };
  }, []);

  // ---------- Announcements ----------
  // Hide dismissed ones, and sign-off ones the user has already signed.
  const visibleAnnouncements = announcements
    .filter((a) => {
      const st = announcementState[a.id];
      if (st?.dismissed_at) return false;
      if (st?.signed_at && ACK_DOC_RE.test(a.content || "")) return false;
      return true;
    })
    .slice(0, 4);

  // ---------- Today's schedule ----------
  const [today, setToday] = useState<TodayAssignment[]>([]);
  const [todayLoaded, setTodayLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .schema("common")
          .from("technician_assignments")
          .select("id, job_id, division, start_time")
          .eq("user_id", user.id)
          .eq("assignment_date", localDateString(new Date()))
          .order("start_time", { ascending: true });
        if (error) throw error;
        const rows = (data || []) as unknown as TodayAssignment[];

        const jobIds = Array.from(
          new Set(rows.map((r) => r.job_id).filter(Boolean)),
        ) as string[];
        if (jobIds.length > 0) {
          const { data: jobs, error: jobsError } = await supabase
            .schema("neta_ops")
            .from("jobs")
            .select("id, job_number, title")
            .in("id", jobIds);
          if (jobsError) throw jobsError;
          const byId: Record<string, { job_number?: string; title?: string }> =
            {};
          (jobs || []).forEach((j: any) => (byId[j.id] = j));
          rows.forEach((r) => {
            const j = r.job_id ? byId[r.job_id] : undefined;
            r.jobNumber = j?.job_number;
            r.jobTitle = j?.title;
          });
        }
        if (!cancelled) setToday(rows);
      } catch (err) {
        console.error("Error loading today's schedule:", err);
      } finally {
        if (!cancelled) setTodayLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // ---------- Render ----------
  return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Work queue */}
        <div className={`${card} ${showSide ? "lg:col-span-2" : "lg:col-span-3"} min-w-0`}>
          <div className="relative flex border-b border-neutral-200 dark:border-dark-300">
          <div
            role="tablist"
            aria-label="Work queue"
            className="flex flex-1 flex-wrap"
          >
            {visibleTabs.map((t) => {
              const selected = activeTab === t.key;
              const n = counts[t.key];
              return (
                <button
                  key={t.key}
                  id={`work-queue-tab-${t.key}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`work-queue-panel-${t.key}`}
                  onClick={() => selectTab(t.key)}
                  className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:bg-brand/10 ${
                    selected
                      ? "border-brand text-neutral-900 dark:text-white"
                      : "border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                  }`}
                >
                  {t.label}
                  {n !== null && (
                    <span
                      className={`min-w-[1.5rem] rounded-none px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums ${
                        n > 0 && t.key !== "approved"
                          ? "bg-brand text-white"
                          : "border border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-dark-300 dark:bg-dark-200 dark:text-neutral-400"
                      }`}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {canCustomize && (
            <>
              <button
                type="button"
                aria-label="Choose what shows on the home page"
                aria-haspopup="true"
                aria-expanded={gearOpen}
                onClick={() => setGearOpen((v) => !v)}
                className={`flex w-11 shrink-0 items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  gearOpen
                    ? "bg-brand/10 text-brand"
                    : "text-neutral-500 hover:text-brand dark:text-neutral-400"
                }`}
              >
                <Settings className="h-4 w-4" />
              </button>
              {gearOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setGearOpen(false)}
                  />
                  {/* Floats over the list instead of pushing it down. */}
                  <div
                    role="group"
                    aria-label="Show on home page"
                    className="absolute right-0 top-full z-40 w-60 rounded-none border border-neutral-200 border-t-2 border-t-brand bg-white p-3 shadow-lg dark:border-dark-300 dark:bg-dark-150"
                  >
                    <p className="text-sm font-bold text-neutral-900 dark:text-white">
                      Show on home page
                    </p>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Tabs
                    </p>
                    {QUEUE_TABS.map((t) => (
                      <label
                        key={t.key}
                        htmlFor={`queue-show-${t.key}`}
                        className="flex cursor-pointer items-center gap-2 py-1 text-sm text-neutral-800 dark:text-neutral-200"
                      >
                        <input
                          id={`queue-show-${t.key}`}
                          type="checkbox"
                          checked={!hidden.includes(t.key)}
                          onChange={() => toggleDisplay(t.key)}
                          className="h-4 w-4 rounded-none accent-brand"
                        />
                        {t.label}
                      </label>
                    ))}
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Side column
                    </p>
                    {SIDE_DISPLAYS.map((d) => (
                      <label
                        key={d.key}
                        htmlFor={`queue-show-${d.key}`}
                        className="flex cursor-pointer items-center gap-2 py-1 text-sm text-neutral-800 dark:text-neutral-200"
                      >
                        <input
                          id={`queue-show-${d.key}`}
                          type="checkbox"
                          checked={!hidden.includes(d.key)}
                          onChange={() => toggleDisplay(d.key)}
                          className="h-4 w-4 rounded-none accent-brand"
                        />
                        {d.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          </div>
          {/* A tab's list loads the first time it's opened, then stays mounted. */}
          <div className="max-h-[520px] overflow-y-auto p-4">
            {!activeTab && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                All tabs are turned off. Use the gear to turn some back on.
              </p>
            )}
            <div id="work-queue-panel-review" role="tabpanel" aria-labelledby="work-queue-tab-review" hidden={activeTab !== "review"}>
              {opened.has("review") && <ReviewShortcuts onCount={countHandlers.review} />}
            </div>
            <div id="work-queue-panel-issue" role="tabpanel" aria-labelledby="work-queue-tab-issue" hidden={activeTab !== "issue"}>
              {opened.has("issue") && <IssueShortcuts onCount={countHandlers.issue} />}
            </div>
            <div id="work-queue-panel-action" role="tabpanel" aria-labelledby="work-queue-tab-action" hidden={activeTab !== "action"}>
              {opened.has("action") && <ActionItemShortcuts onCount={countHandlers.action} />}
            </div>
            <div id="work-queue-panel-approved" role="tabpanel" aria-labelledby="work-queue-tab-approved" hidden={activeTab !== "approved"}>
              {opened.has("approved") && <ApprovedShortcuts onCount={countHandlers.approved} />}
            </div>
          </div>
        </div>

        {/* Side column */}
        {showSide && (
        <div className="flex min-w-0 flex-col gap-6">
          {showAnnouncements && (
          <div className={card}>
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-dark-300">
              <h3 className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
                <Megaphone className="h-4 w-4 text-brand" />
                Announcements
              </h3>
              <Link to="/hr/announcements" className="text-sm font-semibold text-brand hover:underline">
                All
              </Link>
            </div>
            {visibleAnnouncements.length === 0 ? (
              <p className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">No new announcements.</p>
            ) : (
              visibleAnnouncements.map((a) => {
                const docUrl = a.content?.match(ACK_DOC_RE)?.[1] ?? null;
                const rowClass =
                  "block w-full border-b border-neutral-200 px-4 py-3 text-left last:border-b-0 hover:bg-neutral-50 focus:outline-none focus-visible:bg-brand/10 dark:border-dark-300 dark:hover:bg-dark-200";
                const body = (
                  <>
                    <span className="flex items-start gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-none ${a.is_pinned ? "bg-brand" : "bg-neutral-300 dark:bg-neutral-600"}`}
                      />
                      {a.title}
                    </span>
                    <span className="ml-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {[a.category, timeAgo(a.published_at || a.created_at)]
                        .filter(Boolean)
                        .join(" · ")}
                      {docUrl && (
                        <span className="rounded-none bg-brand px-1.5 py-0.5 font-semibold text-white">
                          Needs signature
                        </span>
                      )}
                    </span>
                  </>
                );
                return docUrl ? (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onOpenDocument(docUrl, a.title, a.id)}
                    className={rowClass}
                  >
                    {body}
                  </button>
                ) : (
                  <Link key={a.id} to="/hr/announcements" className={rowClass}>
                    {body}
                  </Link>
                );
              })
            )}
          </div>
          )}

          {showToday && (
          <div className={card}>
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-dark-300">
              <h3 className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
                <CalendarDays className="h-4 w-4 text-brand" />
                Today
              </h3>
              {today[0]?.division && (
                <Link
                  to={`/${today[0].division}/scheduling`}
                  className="text-sm font-semibold text-brand hover:underline"
                >
                  Schedule
                </Link>
              )}
            </div>
            {!todayLoaded ? (
              <p className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
            ) : today.length === 0 ? (
              <p className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">Nothing on your schedule today.</p>
            ) : (
              today.map((r) => {
                const body = (
                  <>
                    <span className="w-16 shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                      {formatTime(r.start_time) || "All day"}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-neutral-900 dark:text-white">
                      <span className="font-semibold">{r.jobNumber || "Job"}</span>
                      {r.jobTitle && (
                        <span className="text-neutral-600 dark:text-neutral-300"> · {r.jobTitle}</span>
                      )}
                    </span>
                    {r.job_id && <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />}
                  </>
                );
                const rowClass =
                  "flex items-center gap-3 border-b border-neutral-200 px-4 py-2.5 last:border-b-0 dark:border-dark-300";
                return r.job_id ? (
                  <Link
                    key={r.id}
                    to={`/jobs/${r.job_id}`}
                    className={`${rowClass} hover:bg-neutral-50 dark:hover:bg-dark-200`}
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={r.id} className={rowClass}>
                    {body}
                  </div>
                );
              })
            )}
          </div>
          )}
        </div>
        )}
      </div>
  );
}

// "Good afternoon, Jack" line, shown above the ampOS logo on /portal.
export function PortalGreeting() {
  const { user } = useAuth();
  const firstName =
    (user?.user_metadata?.name || "").trim().split(/\s+/)[0] ||
    user?.email?.split("@")[0] ||
    "";
  return (
    <p className="mb-3 text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
      {greetingFor(new Date())}
      {firstName ? `, ${firstName}` : ""}
    </p>
  );
}
