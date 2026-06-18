import React, { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Bell,
  CheckCircle,
  Clock,
  FileText,
  Filter,
  RefreshCw,
  Search,
  Shield,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import Card, { CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type LogKind = "notification" | "role" | "system" | "permission";
type FilterKind = "all" | LogKind;

interface SystemLogItem {
  id: string;
  kind: LogKind;
  title: string;
  message: string;
  timestamp: string;
  source: string;
  badge: string;
  read?: boolean;
}

interface SourceError {
  source: string;
  message: string;
}

function getErrorMessage(error: any): string {
  if (!error) return "Unknown error";
  return error.message || error.details || error.hint || JSON.stringify(error);
}

function getIcon(kind: LogKind) {
  switch (kind) {
    case "notification":
      return <Bell className="h-4 w-4 text-blue-600 dark:text-blue-300" />;
    case "role":
      return <Users className="h-4 w-4 text-purple-600 dark:text-purple-300" />;
    case "system":
      return (
        <Settings className="h-4 w-4 text-orange-600 dark:text-orange-300" />
      );
    case "permission":
      return (
        <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
      );
  }
}

function getBadgeClass(kind: LogKind): string {
  switch (kind) {
    case "notification":
      return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900";
    case "role":
      return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-900";
    case "system":
      return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-900";
    case "permission":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900";
  }
}

function mapNotification(row: any): SystemLogItem {
  return {
    id: `notification-${row.id}`,
    kind: "notification",
    title: row.type === "new_user" ? "New user" : "Admin notification",
    message: row.message || "Notification created",
    timestamp: row.created_at,
    source: "common.admin_notifications",
    badge: row.is_read ? "Read" : "Unread",
    read: row.is_read,
  };
}

function mapRoleChange(row: any): SystemLogItem {
  return {
    id: `role-${row.id}`,
    kind: "role",
    title: "Role changed",
    message: `${row.old_role || "No role"} -> ${row.new_role || "No role"}`,
    timestamp: row.timestamp || row.created_at,
    source: row.component || "Admin role management",
    badge: "Role",
  };
}

function mapSystemChange(row: any): SystemLogItem {
  return {
    id: `system-${row.id}`,
    kind: "system",
    title: row.action || "System change",
    message: row.details
      ? JSON.stringify(row.details)
      : "System setting changed",
    timestamp: row.timestamp || row.created_at,
    source: row.component || "System",
    badge: "System",
  };
}

function mapPermissionChange(row: any): SystemLogItem {
  return {
    id: `permission-${row.id}`,
    kind: "permission",
    title: "Permission changed",
    message: `${row.permission_action || row.action || "Changed"} ${row.resource || "permission"}`,
    timestamp: row.timestamp || row.created_at,
    source: row.component || "Permissions",
    badge: "Permission",
  };
}

export const SystemLogsCard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<SystemLogItem[]>([]);
  const [sourceErrors, setSourceErrors] = useState<SourceError[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeFilter, setActiveFilter] = useState<FilterKind>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    setSourceErrors([]);

    const sources = await Promise.allSettled([
      supabase
        .schema("common")
        .from("admin_notifications")
        .select("id,type,message,is_read,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .schema("common")
        .from("role_change_logs")
        .select("id,old_role,new_role,reason,component,timestamp,created_at")
        .order("timestamp", { ascending: false })
        .limit(20),
      supabase
        .schema("common")
        .from("system_change_logs")
        .select("id,action,component,details,timestamp,created_at")
        .order("timestamp", { ascending: false })
        .limit(20),
      supabase
        .schema("common")
        .from("permission_change_logs")
        .select(
          "id,action,resource,permission_action,component,timestamp,created_at",
        )
        .order("timestamp", { ascending: false })
        .limit(20),
    ]);

    const nextLogs: SystemLogItem[] = [];
    const nextErrors: SourceError[] = [];
    const sourceNames = [
      "common.admin_notifications",
      "common.role_change_logs",
      "common.system_change_logs",
      "common.permission_change_logs",
    ];
    const mappers = [
      mapNotification,
      mapRoleChange,
      mapSystemChange,
      mapPermissionChange,
    ];

    sources.forEach((result, index) => {
      if (result.status === "rejected") {
        nextErrors.push({
          source: sourceNames[index],
          message: getErrorMessage(result.reason),
        });
        return;
      }

      const { data, error } = result.value;
      if (error) {
        nextErrors.push({
          source: sourceNames[index],
          message: getErrorMessage(error),
        });
        return;
      }

      nextLogs.push(...((data || []) as any[]).map(mappers[index]));
    });

    nextLogs.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    setLogs(nextLogs.slice(0, 50));
    setSourceErrors(nextErrors);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [refreshKey]);

  const filteredLogs = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return logs.filter((log) => {
      const matchesFilter = activeFilter === "all" || log.kind === activeFilter;
      const matchesSearch =
        !normalizedSearch ||
        `${log.title} ${log.message} ${log.source} ${log.badge}`
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, logs, searchQuery]);

  const unreadCount = logs.filter(
    (log) => log.kind === "notification" && !log.read,
  ).length;
  const filterOptions: { value: FilterKind; label: string }[] = [
    { value: "all", label: "All" },
    { value: "notification", label: "Notifications" },
    { value: "role", label: "Roles" },
    { value: "system", label: "System" },
    { value: "permission", label: "Permissions" },
  ];

  return (
    <Card className="border border-zinc-200 bg-white shadow-sm dark:border-dark-300 dark:bg-dark-150">
      <CardHeader className="flex flex-col gap-4 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="flex items-center text-lg font-medium text-zinc-900 dark:text-white">
            <FileText className="mr-2 h-5 w-5 text-blue-500" />
            System Logs
          </CardTitle>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-300">
            Admin activity, role changes, permission changes, and system events.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((prev) => prev + 1)}
          disabled={loading}
        >
          {loading ? (
            <LoadingSpinner size="xs" />
          ) : (
            <>
              <RefreshCw className="mr-1 h-4 w-4" />
              Refresh
            </>
          )}
        </Button>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-md border border-zinc-200 p-4 dark:border-dark-300">
                <p className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-300">
                  Events
                </p>
                <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-white">
                  {logs.length}
                </p>
              </div>
              <div className="rounded-md border border-zinc-200 p-4 dark:border-dark-300">
                <p className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-300">
                  Unread
                </p>
                <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-white">
                  {unreadCount}
                </p>
              </div>
              <div className="rounded-md border border-zinc-200 p-4 dark:border-dark-300">
                <p className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-300">
                  Sources
                </p>
                <p className="mt-1 flex items-center text-2xl font-bold text-zinc-900 dark:text-white">
                  {4 - sourceErrors.length}/4
                  {sourceErrors.length === 0 ? (
                    <CheckCircle className="ml-2 h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="ml-2 h-5 w-5 text-yellow-500" />
                  )}
                </p>
              </div>
            </div>

            {sourceErrors.length > 0 && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-300">
                <p className="font-medium">Some log sources need setup.</p>
                <div className="mt-2 space-y-1">
                  {sourceErrors.map((sourceError) => (
                    <p key={sourceError.source}>
                      {sourceError.source}: {sourceError.message}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setActiveFilter(option.value)}
                    className={`rounded-md border px-3 py-2 text-sm font-medium ${
                      activeFilter === option.value
                        ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-dark-300 dark:bg-dark-200 dark:text-zinc-200 dark:hover:bg-dark-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <label className="flex min-w-0 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 dark:border-dark-300">
                <Search className="h-4 w-4 text-zinc-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none dark:text-white"
                  placeholder="Search logs"
                />
              </label>
            </div>

            {filteredLogs.length > 0 ? (
              <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-dark-300">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col gap-3 border-b border-zinc-100 p-4 last:border-0 dark:border-dark-300 md:flex-row md:items-start md:justify-between"
                  >
                    <div className="flex min-w-0 gap-3">
                      <div className="mt-1 rounded-md bg-zinc-100 p-2 dark:bg-dark-300">
                        {getIcon(log.kind)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-zinc-900 dark:text-white">
                            {log.title}
                          </p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getBadgeClass(log.kind)}`}
                          >
                            {log.badge}
                          </span>
                        </div>
                        <p className="mt-1 break-words text-sm text-zinc-700 dark:text-zinc-200">
                          {log.message}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {log.source}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-sm text-zinc-500 dark:text-zinc-300">
                      <Clock className="h-4 w-4" />
                      {formatDistanceToNow(new Date(log.timestamp), {
                        addSuffix: true,
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-zinc-300 p-8 text-center dark:border-dark-300">
                <Filter className="h-8 w-8 text-zinc-400" />
                <p className="mt-2 font-medium text-zinc-900 dark:text-white">
                  No logs found
                </p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-300">
                  Try another filter, or run the admin log setup SQL if sources
                  are missing.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
