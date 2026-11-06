import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { isSuperUser } from "@/lib/roles";
import {
  ShieldCheck,
  Settings,
  Users,
  ArrowLeft,
  ArrowRight,
  FileText,
  Database,
  LockKeyhole,
  Bell,
  Ruler,
  Clock,
  Link2,
  ClipboardList,
  Activity,
  Palette,
  Timer,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { HeaderBar } from "@/components/ui/HeaderBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { supabase } from "@/lib/supabase";
import { format, formatDistanceToNow } from "date-fns";

// ─── Shared types ────────────────────────────────────────────────────────────

const subPathTitles: Record<string, string> = {
  "in-progress": "In Progress Dashboard",
  "report-time": "Report time",
  "user-management": "User Management",
  "role-management": "Role Management",
  "notification-controls": "Notification Dev Controls",
  "system-health": "System Health",
  "system-logs": "System Logs",
  "data-backup": "Data Backup",
  encryption: "Encryption Settings",
  integrations: "Integrations",
  quickbooks: "QuickBooks Dashboard",
  "site-theme": "Website Theme",
};

type AdminCard = {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
};

const QuickBooksIcon = ({ className }: { className?: string }) => (
  <img
    src="/img/Intuit_QuickBooks_logo.svg"
    alt="QuickBooks"
    className={className}
  />
);

// ─── Dashboard index types ────────────────────────────────────────────────────

interface DashboardStats {
  activeUsers: number | null;
  totalJobs: number | null;
  unreadAlerts: number | null;
  qbConnected: boolean | null;
  qbCompanyName: string | null;
}

type ActivityKind = "system" | "role" | "notification";

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  message: string;
  timestamp: string;
}

// Shared card surface.
const CARD =
  "border border-neutral-200 bg-white dark:border-dark-300 dark:bg-dark-150";

// One tint per section keeps the page calm (was one color per tile).
type Tone = "indigo" | "brand" | "sky" | "emerald";

const TONE_ICON: Record<Tone, string> = {
  indigo:
    "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900",
  brand: "bg-brand/10 text-brand ring-brand/25 dark:bg-brand/15",
  sky: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900",
  emerald:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
};

type CategorySection = {
  label: string;
  tone: Tone;
  cards: AdminCard[];
};

const CATEGORIES: CategorySection[] = [
  {
    label: "People & Access",
    tone: "indigo",
    cards: [
      {
        title: "User Management",
        description: "Add, edit, and deactivate accounts",
        icon: Users,
        path: "/admin-dashboard/user-management",
      },
      {
        title: "Role Management",
        description: "Control who can see and do what",
        icon: ShieldCheck,
        path: "/admin-dashboard/role-management",
      },
    ],
  },
  {
    label: "Operations",
    tone: "brand",
    cards: [
      {
        title: "In Progress Dashboard",
        description: "Jobs underway across divisions",
        icon: Clock,
        path: "/admin-dashboard/in-progress",
      },
      {
        title: "Report time",
        description: "How long reports take to fill out",
        icon: Timer,
        path: "/admin-dashboard/report-time",
      },
      {
        title: "QuickBooks Dashboard",
        description: "Sync status and job linking",
        icon: QuickBooksIcon,
        path: "/admin-dashboard/quickbooks",
      },
      {
        title: "Custom Report Builder",
        description: "Build and edit report templates",
        icon: ClipboardList,
        path: "/custom-forms/templates",
      },
    ],
  },
  {
    label: "System",
    tone: "sky",
    cards: [
      {
        title: "System Health",
        description: "Service status and checks",
        icon: Settings,
        path: "/admin-dashboard/system-health",
      },
      {
        title: "System Logs",
        description: "What changed, who did it, and when",
        icon: FileText,
        path: "/admin-dashboard/system-logs",
      },
      {
        title: "Data Backup",
        description: "Back up and restore data",
        icon: Database,
        path: "/admin-dashboard/data-backup",
      },
      {
        title: "Encryption Settings",
        description: "Keys and data protection",
        icon: LockKeyhole,
        path: "/admin-dashboard/encryption",
      },
    ],
  },
  {
    label: "Configuration",
    tone: "emerald",
    cards: [
      {
        title: "Integrations",
        description: "Connected apps and services",
        icon: Link2,
        path: "/admin-dashboard/integrations",
      },
      {
        title: "Notification Dev Controls",
        description: "Test and toggle notifications",
        icon: Bell,
        path: "/admin-dashboard/notification-controls",
      },
      {
        title: "Calibration Report Recipients",
        description: "Who gets calibration report emails",
        icon: Ruler,
        path: "/admin-dashboard/calibration-recipients",
      },
      {
        title: "Website Theme",
        description: "Brand colors and look",
        icon: Palette,
        path: "/admin-dashboard/site-theme",
      },
    ],
  },
];

// ─── Inline helper components ─────────────────────────────────────────────────

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`h-2 w-2 shrink-0 rounded-none ${ok ? "bg-emerald-500" : "bg-red-500"}`}
      />
      {label}
    </span>
  );
}

function StatCell({
  icon,
  label,
  value,
  helper,
  loading,
  large = true,
  valueClassName = "text-neutral-900 dark:text-white",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  helper: string;
  loading: boolean;
  large?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 p-4 sm:p-5 ${CARD}`}>
      <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-widest">
          {label}
        </span>
      </div>
      {loading ? (
        <>
          <Skeleton className="h-8 w-20 rounded-none" />
          <Skeleton className="h-3 w-32 rounded-none" />
        </>
      ) : (
        <>
          <div
            className={`flex h-8 items-end font-semibold leading-none tabular-nums ${large ? "text-3xl" : "text-lg"} ${valueClassName}`}
          >
            {value}
          </div>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {helper}
          </p>
        </>
      )}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
        {title}
      </h2>
      <div className="h-px flex-1 bg-neutral-200 dark:bg-dark-300" />
    </div>
  );
}

function NavCard({
  card,
  tone,
  meta,
  onOpen,
}: {
  card: AdminCard;
  tone: Tone;
  meta?: React.ReactNode;
  onOpen: (path: string) => void;
}) {
  const { title, description, icon: Icon, path } = card;
  return (
    <button
      type="button"
      onClick={() => onOpen(path)}
      className={`group relative flex w-full items-start gap-3 overflow-hidden rounded-none p-4 text-left ${CARD} transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:hover:border-brand/50 dark:hover:shadow-black/40 dark:focus-visible:ring-offset-black`}
    >
      {/* Brand edge that grows in on hover */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 bg-brand transition-transform duration-200 group-hover:scale-y-100 group-focus-visible:scale-y-100"
      />
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-none ring-1 ring-inset ${TONE_ICON[tone]}`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
            {title}
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brand dark:text-neutral-600" />
        </span>
        <span className="mt-0.5 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
          {description}
        </span>
        {meta && (
          <span className="mt-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
            {meta}
          </span>
        )}
      </span>
    </button>
  );
}

const ACTIVITY_META: Record<
  ActivityKind,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  notification: {
    label: "Alert",
    icon: Bell,
    className:
      "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
  },
  role: {
    label: "Role change",
    icon: ShieldCheck,
    className:
      "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300",
  },
  system: {
    label: "System",
    icon: Settings,
    className: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300",
  },
};

// ─── AdminDashboardIndex ──────────────────────────────────────────────────────

export const AdminDashboardIndex: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    activeUsers: null,
    totalJobs: null,
    unreadAlerts: null,
    qbConnected: null,
    qbCompanyName: null,
  });
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);

      const [usersRes, jobsRes, notifsRes, qbRes, sysRes, roleRes] =
        await Promise.allSettled([
          supabase
            .schema("common")
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("is_active", true),
          supabase
            .schema("neta_ops")
            .from("jobs")
            .select("*", { count: "exact", head: true })
            .is("deleted_at", null),
          supabase
            .schema("common")
            .from("admin_notifications")
            .select("id, message, created_at", { count: "exact" })
            .eq("is_read", false)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .schema("common")
            .from("quickbooks_integrations")
            .select("id, company_name, is_active")
            .eq("is_active", true)
            .limit(1)
            .maybeSingle(),
          supabase
            .schema("common")
            .from("system_change_logs")
            .select("id, action, component, timestamp, created_at")
            .order("timestamp", { ascending: false })
            .limit(5),
          supabase
            .schema("common")
            .from("role_change_logs")
            .select("id, old_role, new_role, timestamp, created_at")
            .order("timestamp", { ascending: false })
            .limit(5),
        ]);

      if (cancelled) return;

      const activeUsers =
        usersRes.status === "fulfilled" && !usersRes.value.error
          ? (usersRes.value.count ?? null)
          : null;

      const totalJobs =
        jobsRes.status === "fulfilled" && !jobsRes.value.error
          ? (jobsRes.value.count ?? null)
          : null;

      const unreadAlerts =
        notifsRes.status === "fulfilled" && !notifsRes.value.error
          ? (notifsRes.value.count ?? null)
          : null;

      const qbData =
        qbRes.status === "fulfilled" && !qbRes.value.error
          ? qbRes.value.data
          : undefined;
      const qbConnected = qbData !== undefined ? qbData !== null : null;
      const qbCompanyName =
        qbData && typeof qbData === "object" && "company_name" in qbData
          ? (qbData as { company_name: string | null }).company_name
          : null;

      setStats({
        activeUsers,
        totalJobs,
        unreadAlerts,
        qbConnected,
        qbCompanyName,
      });

      // Build merged activity feed
      const items: ActivityItem[] = [];

      if (notifsRes.status === "fulfilled" && notifsRes.value.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (notifsRes.value.data as any[]).forEach((row) => {
          items.push({
            id: `notif-${row.id}`,
            kind: "notification",
            message: row.message || "Admin notification",
            timestamp: row.created_at || new Date().toISOString(),
          });
        });
      }

      if (sysRes.status === "fulfilled" && sysRes.value.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sysRes.value.data as any[]).forEach((row) => {
          items.push({
            id: `sys-${row.id}`,
            kind: "system",
            message: row.action || "System change",
            timestamp:
              row.timestamp || row.created_at || new Date().toISOString(),
          });
        });
      }

      if (roleRes.status === "fulfilled" && roleRes.value.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (roleRes.value.data as any[]).forEach((row) => {
          items.push({
            id: `role-${row.id}`,
            kind: "role",
            message: `Role changed: ${row.old_role ?? "—"} → ${row.new_role ?? "—"}`,
            timestamp:
              row.timestamp || row.created_at || new Date().toISOString(),
          });
        });
      }

      items.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      setActivity(items.slice(0, 5));
      setLoading(false);
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, []);

  const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString());

  // Live status shown on the matching tile.
  const tileMeta: Record<string, React.ReactNode> = {
    "/admin-dashboard/user-management":
      stats.activeUsers !== null ? `${fmt(stats.activeUsers)} active` : null,
    "/admin-dashboard/quickbooks":
      stats.qbConnected === null ? null : (
        <StatusDot
          ok={stats.qbConnected}
          label={stats.qbConnected ? "Connected" : "Not connected"}
        />
      ),
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand">
          {format(new Date(), "EEEE, MMMM d")}
        </p>
        <h1 className="font-bitcount mt-2 text-4xl text-neutral-950 dark:text-white sm:text-5xl">
          Admin Dashboard
        </h1>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCell
          loading={loading}
          icon={<Users className="h-3.5 w-3.5" />}
          label="Active users"
          value={fmt(stats.activeUsers)}
          helper="Accounts that can sign in"
        />
        <StatCell
          loading={loading}
          icon={<Briefcase className="h-3.5 w-3.5" />}
          label="Total jobs"
          value={fmt(stats.totalJobs)}
          helper="Across all divisions"
        />
        <StatCell
          loading={loading}
          icon={<Bell className="h-3.5 w-3.5" />}
          label="Unread alerts"
          value={fmt(stats.unreadAlerts)}
          valueClassName={
            stats.unreadAlerts
              ? "text-rose-600 dark:text-rose-400"
              : "text-neutral-900 dark:text-white"
          }
          helper={
            stats.unreadAlerts === 0
              ? "All caught up"
              : "Admin notifications to review"
          }
        />
        <StatCell
          loading={loading}
          icon={<QuickBooksIcon className="h-3.5 w-3.5" />}
          label="QuickBooks"
          large={false}
          value={
            stats.qbConnected === null ? (
              "—"
            ) : (
              <StatusDot
                ok={stats.qbConnected}
                label={stats.qbConnected ? "Connected" : "Not connected"}
              />
            )
          }
          helper={
            stats.qbConnected === null
              ? "Status unavailable"
              : stats.qbConnected
                ? stats.qbCompanyName || "Active integration"
                : "No active integration"
          }
        />
      </div>

      {/* Tools (2/3) + activity feed (1/3) */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {CATEGORIES.map((section) => (
            <div key={section.label} className="space-y-3">
              <SectionHeader title={section.label} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {section.cards.map((card) => (
                  <NavCard
                    key={card.path}
                    card={card}
                    tone={section.tone}
                    meta={tileMeta[card.path]}
                    onOpen={navigate}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Recent activity */}
        <div className="lg:col-span-1">
          <div className={CARD}>
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-dark-300">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-brand" />
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Recent activity
                </h2>
              </div>
              <button
                type="button"
                onClick={() => navigate("/admin-dashboard/system-logs")}
                className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 transition-colors hover:text-brand dark:text-neutral-400"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            <div className="p-2">
              {loading ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-none" />
                  ))}
                </div>
              ) : activity.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <span className="flex h-10 w-10 items-center justify-center bg-neutral-100 text-neutral-400 dark:bg-dark-200 dark:text-neutral-500">
                    <Activity className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                    Nothing new
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Changes and alerts show up here.
                  </p>
                </div>
              ) : (
                <ol>
                  {activity.map((item) => {
                    const meta = ACTIVITY_META[item.kind];
                    const KindIcon = meta.icon;
                    return (
                      <li
                        key={item.id}
                        className="flex gap-3 px-2 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-dark-200"
                      >
                        <span
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-none ${meta.className}`}
                        >
                          <KindIcon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm text-neutral-800 dark:text-neutral-200">
                            {item.message}
                          </p>
                          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                            {meta.label} ·{" "}
                            {formatDistanceToNow(new Date(item.timestamp), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── AdminDashboardLayout ─────────────────────────────────────────────────────

export const AdminDashboardLayout: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const hasAdminAccess =
    user?.user_metadata?.role === "Admin" || isSuperUser(user?.email);

  const isIndex =
    location.pathname === "/admin-dashboard" ||
    location.pathname === "/admin-dashboard/";

  const subPath = location.pathname.replace("/admin-dashboard/", "");
  const pageTitle = subPathTitles[subPath];

  React.useEffect(() => {
    if (user && !hasAdminAccess) {
      navigate("/portal");
    }
  }, [user, hasAdminAccess, navigate]);

  if (!user || !hasAdminAccess) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-dark-background">
      <div className="sticky top-0 z-30 w-full shrink-0 print:hidden border-b border-neutral-200 dark:border-dark-200">
        <HeaderBar />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
          {!isIndex && (
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                className="rounded-none border-none bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-dark-200 dark:text-white dark:hover:bg-dark-300"
                onClick={() => navigate("/admin-dashboard")}
                leftIcon={<ArrowLeft className="h-4 w-4" />}
              >
                Back to Dashboard
              </Button>
              {pageTitle && (
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                  {pageTitle}
                </h2>
              )}
            </div>
          )}
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardLayout;
