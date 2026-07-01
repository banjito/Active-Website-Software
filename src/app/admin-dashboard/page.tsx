import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { isSuperUser } from "@/lib/roles";
import {
  ShieldCheck,
  Settings,
  Users,
  ArrowLeft,
  FileText,
  Database,
  Sliders,
  LockKeyhole,
  Shield,
  Bell,
  Clock,
  Link2,
  DollarSign,
  ClipboardList,
  Activity,
  type LucideIcon,
} from "lucide-react";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { HeaderBar } from "@/components/ui/HeaderBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";

// ─── Shared types ────────────────────────────────────────────────────────────

const subPathTitles: Record<string, string> = {
  "in-progress": "In Progress Dashboard",
  "user-management": "User Management",
  "role-management": "Role Management",
  "permission-management": "Permission Management",
  "notification-controls": "Notification Dev Controls",
  "system-health": "System Health",
  "system-logs": "System Logs",
  "portal-config": "Portal Configuration",
  "data-backup": "Data Backup",
  encryption: "Encryption Settings",
  integrations: "Integrations",
  quickbooks: "QuickBooks Dashboard",
};

type AdminCard = {
  title: string;
  icon: LucideIcon;
  iconClassName: string;
  cardClassName: string;
  path: string;
};

const adminCards: AdminCard[] = [
  {
    title: "In Progress Dashboard",
    icon: Clock,
    iconClassName: "text-cyan-700 dark:text-cyan-200",
    cardClassName:
      "border-cyan-200 bg-cyan-50/80 dark:border-cyan-900 dark:bg-cyan-950/30",
    path: "/admin-dashboard/in-progress",
  },
  {
    title: "User Management",
    icon: Users,
    iconClassName: "text-indigo-700 dark:text-indigo-200",
    cardClassName:
      "border-indigo-200 bg-indigo-50/80 dark:border-indigo-900 dark:bg-indigo-950/30",
    path: "/admin-dashboard/user-management",
  },
  {
    title: "Role Management",
    icon: ShieldCheck,
    iconClassName: "text-emerald-700 dark:text-emerald-200",
    cardClassName:
      "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/30",
    path: "/admin-dashboard/role-management",
  },
  {
    title: "Permission Management",
    icon: Shield,
    iconClassName: "text-orange-700 dark:text-orange-200",
    cardClassName:
      "border-orange-200 bg-orange-50/80 dark:border-orange-900 dark:bg-orange-950/30",
    path: "/admin-dashboard/permission-management",
  },
  {
    title: "Notification Dev Controls",
    icon: Bell,
    iconClassName: "text-rose-700 dark:text-rose-200",
    cardClassName:
      "border-rose-200 bg-rose-50/80 dark:border-rose-900 dark:bg-rose-950/30",
    path: "/admin-dashboard/notification-controls",
  },
  {
    title: "System Health",
    icon: Settings,
    iconClassName: "text-blue-700 dark:text-blue-200",
    cardClassName:
      "border-blue-200 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-950/30",
    path: "/admin-dashboard/system-health",
  },
  {
    title: "System Logs",
    icon: FileText,
    iconClassName: "text-yellow-800 dark:text-yellow-200",
    cardClassName:
      "border-yellow-200 bg-yellow-50/80 dark:border-yellow-900 dark:bg-yellow-950/30",
    path: "/admin-dashboard/system-logs",
  },
  {
    title: "Portal Configuration",
    icon: Sliders,
    iconClassName: "text-purple-700 dark:text-purple-200",
    cardClassName:
      "border-purple-200 bg-purple-50/80 dark:border-purple-900 dark:bg-purple-950/30",
    path: "/admin-dashboard/portal-config",
  },
  {
    title: "Data Backup",
    icon: Database,
    iconClassName: "text-teal-700 dark:text-teal-200",
    cardClassName:
      "border-teal-200 bg-teal-50/80 dark:border-teal-900 dark:bg-teal-950/30",
    path: "/admin-dashboard/data-backup",
  },
  {
    title: "Encryption Settings",
    icon: LockKeyhole,
    iconClassName: "text-red-700 dark:text-red-200",
    cardClassName:
      "border-red-200 bg-red-50/80 dark:border-red-900 dark:bg-red-950/30",
    path: "/admin-dashboard/encryption",
  },
  {
    title: "Integrations",
    icon: Link2,
    iconClassName: "text-green-700 dark:text-green-200",
    cardClassName:
      "border-green-200 bg-green-50/80 dark:border-green-900 dark:bg-green-950/30",
    path: "/admin-dashboard/integrations",
  },
  {
    title: "QuickBooks Dashboard",
    icon: DollarSign,
    iconClassName: "text-lime-800 dark:text-lime-200",
    cardClassName:
      "border-lime-200 bg-lime-50/80 dark:border-lime-900 dark:bg-lime-950/30",
    path: "/admin-dashboard/quickbooks",
  },
  {
    title: "Custom Report Builder",
    icon: ClipboardList,
    iconClassName: "text-amber-800 dark:text-amber-200",
    cardClassName:
      "border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30",
    path: "/custom-forms/templates",
  },
];

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

type CategorySection = {
  label: string;
  cards: AdminCard[];
  gridClass?: string;
};

const CATEGORIES: CategorySection[] = [
  {
    label: "People & Access",
    cards: adminCards.filter((c) =>
      [
        "/admin-dashboard/user-management",
        "/admin-dashboard/role-management",
        "/admin-dashboard/permission-management",
      ].includes(c.path),
    ),
  },
  {
    label: "Operations",
    cards: adminCards.filter((c) =>
      [
        "/admin-dashboard/in-progress",
        "/admin-dashboard/quickbooks",
        "/custom-forms/templates",
      ].includes(c.path),
    ),
  },
  {
    label: "System",
    cards: adminCards.filter((c) =>
      [
        "/admin-dashboard/system-health",
        "/admin-dashboard/system-logs",
        "/admin-dashboard/data-backup",
        "/admin-dashboard/encryption",
      ].includes(c.path),
    ),
    gridClass: "grid-cols-2",
  },
  {
    label: "Configuration",
    cards: adminCards.filter((c) =>
      [
        "/admin-dashboard/portal-config",
        "/admin-dashboard/notification-controls",
        "/admin-dashboard/integrations",
      ].includes(c.path),
    ),
  },
];

// ─── Inline helper components ─────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  helper,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-[88px] w-full rounded-none" />;

  return (
    <div className="rounded-none border border-neutral-200 bg-white p-4 dark:border-dark-300 dark:bg-dark-200">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-none bg-neutral-100 p-2 dark:bg-dark-300">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {label}
          </p>
          <p
            className={`mt-1 font-bold text-neutral-900 dark:text-white ${
              /^\d|^—/.test(value)
                ? "text-2xl"
                : value.length > 8
                  ? "text-lg"
                  : "text-xl"
            }`}
          >
            {value}
          </p>
          <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
            {helper}
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="shrink-0 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        {title}
      </h2>
      <div className="h-px flex-1 bg-neutral-200 dark:bg-dark-300" />
    </div>
  );
}

function NavCard({
  card,
  navigate,
}: {
  card: AdminCard;
  navigate: (path: string) => void;
}) {
  const { title, icon: Icon, iconClassName, cardClassName, path } = card;
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={title}
      className={`group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-black/30 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 dark:focus:ring-offset-black ${cardClassName}`}
      onClick={() => navigate(path)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(path);
        }
      }}
    >
      <CardContent className="flex min-h-[56px] items-center justify-center gap-2 px-3 py-4 text-center">
        <Icon className={`h-4 w-4 shrink-0 ${iconClassName}`} />
        <span className="text-sm font-medium text-neutral-900 dark:text-white">
          {title}
        </span>
      </CardContent>
    </Card>
  );
}

function getActivityIcon(kind: ActivityKind): React.ReactNode {
  switch (kind) {
    case "notification":
      return <Bell className="h-4 w-4 text-blue-500 dark:text-blue-300" />;
    case "role":
      return (
        <ShieldCheck className="h-4 w-4 text-purple-500 dark:text-purple-300" />
      );
    case "system":
      return (
        <Settings className="h-4 w-4 text-orange-500 dark:text-orange-300" />
      );
  }
}

function getActivityBadgeClass(kind: ActivityKind): string {
  switch (kind) {
    case "notification":
      return "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900";
    case "role":
      return "bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-900";
    case "system":
      return "bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-900";
  }
}

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

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-neutral-950 dark:text-white">
          Admin Dashboard
        </h1>
      </div>

      {/* KPI stat row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          loading={loading}
          icon={
            <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
          }
          label="Active Users"
          value={fmt(stats.activeUsers)}
          helper="Accounts currently active"
        />
        <StatCard
          loading={loading}
          icon={
            <ClipboardList className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
          }
          label="Total Jobs"
          value={fmt(stats.totalJobs)}
          helper="Non-deleted jobs across all divisions"
        />
        <StatCard
          loading={loading}
          icon={<Bell className="h-5 w-5 text-rose-600 dark:text-rose-300" />}
          label="Unread Alerts"
          value={fmt(stats.unreadAlerts)}
          helper={
            stats.unreadAlerts === 0
              ? "All caught up"
              : "Unread admin notifications"
          }
        />
        <StatCard
          loading={loading}
          icon={
            <DollarSign className="h-5 w-5 text-lime-700 dark:text-lime-300" />
          }
          label="QuickBooks"
          value={
            stats.qbConnected === null
              ? "—"
              : stats.qbConnected
                ? "Connected"
                : "Disconnected"
          }
          helper={
            stats.qbConnected === null
              ? "Status unavailable"
              : stats.qbConnected && stats.qbCompanyName
                ? stats.qbCompanyName
                : stats.qbConnected
                  ? "Active integration found"
                  : "No active QB integration"
          }
        />
      </div>

      {/* Categorized nav (2/3) + activity feed (1/3) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Categorized navigation */}
        <div className="space-y-6 lg:col-span-2">
          {CATEGORIES.map((section) => (
            <div key={section.label} className="space-y-3">
              <SectionHeader title={section.label} />
              <div
                className={`grid grid-cols-1 gap-3 ${section.gridClass ?? "sm:grid-cols-2 md:grid-cols-3"}`}
              >
                {section.cards.map((card) => (
                  <NavCard key={card.title} card={card} navigate={navigate} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Recent activity feed */}
        <div className="lg:col-span-1">
          <Card className="border border-neutral-200 bg-white shadow-sm dark:border-dark-300 dark:bg-dark-150">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-medium text-neutral-900 dark:text-white">
                <Activity className="h-4 w-4 text-neutral-500" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : activity.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  No recent activity found.
                </p>
              ) : (
                <div className="divide-y divide-neutral-100 dark:divide-dark-300">
                  {activity.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 py-3"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="mt-0.5 shrink-0">
                          {getActivityIcon(item.kind)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-neutral-700 dark:text-neutral-200">
                            {item.message}
                          </p>
                          <span
                            className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${getActivityBadgeClass(item.kind)}`}
                          >
                            {item.kind}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-xs text-neutral-400 dark:text-neutral-500">
                        {formatDistanceToNow(new Date(item.timestamp), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-dark-300">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/admin-dashboard/system-logs")}
                >
                  View all logs
                </Button>
              </div>
            </CardContent>
          </Card>
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
                className="rounded-none border-none bg-neutral-100 hover:bg-neutral-200"
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
