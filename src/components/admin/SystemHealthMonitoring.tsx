import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Card, { CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/Tabs";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import {
  AlertCircle,
  Activity,
  CheckCircle,
  Clock,
  Database,
  ExternalLink,
  HardDrive,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
  Wifi,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type HealthStatus = "healthy" | "degraded" | "error" | "unknown";

interface TimedResult<T> {
  data: T | null;
  error: any;
  responseTime: number;
}

interface HealthCheck {
  name: string;
  status: HealthStatus;
  message: string;
  responseTime?: number;
  detail?: string;
  action?: string;
}

interface SystemStats {
  overallStatus: HealthStatus;
  checkedAt: string;
  supabaseStatus: {
    status: HealthStatus;
    description: string;
    responseTime: number;
    updatedAt?: string;
  };
  database: {
    status: HealthStatus;
    responseTime: number;
    size: string;
    tables: number;
    rows: number;
    functions: number;
    note?: string;
    error?: string;
  };
  auth: {
    status: HealthStatus;
    responseTime: number;
    signedIn: boolean;
    email?: string;
    error?: string;
  };
  storage: HealthCheck[];
  appData: HealthCheck[];
  environment: {
    projectRef: string;
    appMode: string;
    browserOnline: boolean;
    localTime: string;
  };
  responseData: {
    name: string;
    ms: number;
  }[];
}

const storageBuckets = ["documents", "job-documents", "user-uploads"];
const appTables = [
  {
    label: "customers",
    schema: "common",
    table: "customers",
    sampleSelect: "id",
  },
  { label: "jobs", schema: "neta_ops", table: "jobs", sampleSelect: "id" },
  { label: "assets", schema: "neta_ops", table: "assets", sampleSelect: "id" },
  {
    label: "admin_notifications",
    schema: "common",
    table: "admin_notifications",
    sampleSelect: "id",
  },
];

const timeoutMs = 5000;

function getErrorMessage(error: any): string {
  if (!error) return "No error details returned.";
  if (typeof error === "string") return error || "No error details returned.";

  const parts = [
    error.message,
    error.error_description,
    error.details,
    error.hint,
    error.code,
    error.statusText,
    error.status ? `Status ${error.status}` : "",
  ].filter(Boolean);

  if (parts.length > 0) return parts.join(" ");

  try {
    const entries = Object.getOwnPropertyNames(error)
      .map((key) => [key, error[key]])
      .filter(([, value]) => value);

    if (entries.length > 0) return JSON.stringify(Object.fromEntries(entries));
  } catch {
    // Fall through to the generic message.
  }

  return "Request failed, but Supabase did not return details. Check browser console/network.";
}

function getAppDataFailureAction(label: string, schema: string): string {
  return `Meaning: this login cannot read ${schema}.${label}. Check Supabase permission rules for that table.`;
}

function getProjectRef(): string {
  try {
    const url = new URL(import.meta.env.VITE_SUPABASE_URL);
    return url.hostname.split(".")[0] || "Unknown";
  } catch {
    return "Unknown";
  }
}

async function measure<T>(check: () => Promise<T>): Promise<TimedResult<T>> {
  const start = performance.now();

  try {
    const data = await check();
    return {
      data,
      error: null,
      responseTime: Math.round(performance.now() - start),
    };
  } catch (error) {
    return {
      data: null,
      error,
      responseTime: Math.round(performance.now() - start),
    };
  }
}

async function fetchSupabasePlatformStatus(): Promise<
  SystemStats["supabaseStatus"]
> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  const result = await measure(async () => {
    const response = await fetch(
      "https://status.supabase.com/api/v2/status.json",
      {
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`Status page returned ${response.status}`);
    }

    return response.json();
  });

  window.clearTimeout(timeout);

  if (result.error) {
    return {
      status: "unknown",
      description: `Could not reach Supabase status page: ${getErrorMessage(result.error)}`,
      responseTime: result.responseTime,
    };
  }

  const indicator = result.data?.status?.indicator;
  const status: HealthStatus =
    indicator === "none"
      ? "healthy"
      : indicator === "minor" || indicator === "major"
        ? "degraded"
        : "error";

  return {
    status,
    description: result.data?.status?.description || "Status unavailable",
    responseTime: result.responseTime,
    updatedAt: result.data?.page?.updated_at,
  };
}

function buildDatabaseHealth(appData: HealthCheck[]): SystemStats["database"] {
  const responseTime = Math.max(
    ...appData.map((check) => check.responseTime || 0),
  );
  const status = combineStatus(appData.map((check) => check.status));
  const readableTables = appData.filter(
    (check) => check.status === "healthy" || check.status === "degraded",
  ).length;
  const failedTables = appData.length - readableTables;

  return {
    status,
    responseTime,
    size: "Not exposed",
    tables: readableTables,
    rows: 0,
    functions: 0,
    note:
      failedTables > 0
        ? `${failedTables} app data check${failedTables === 1 ? "" : "s"} blocked.`
        : "Core app tables are reachable. Deep size and row stats need a Supabase SQL function.",
  };
}

async function fetchAuthHealth(): Promise<SystemStats["auth"]> {
  const result = await measure(async () => {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;

    return {
      session: sessionData.session,
      user: userData.user,
    };
  });

  if (result.error) {
    return {
      status: "error",
      responseTime: result.responseTime,
      signedIn: false,
      error: getErrorMessage(result.error),
    };
  }

  return {
    status: result.data?.session && result.data?.user ? "healthy" : "degraded",
    responseTime: result.responseTime,
    signedIn: Boolean(result.data?.session && result.data?.user),
    email: result.data?.user?.email,
  };
}

async function fetchStorageHealth(): Promise<HealthCheck[]> {
  return Promise.all(
    storageBuckets.map(async (bucket) => {
      const result = await measure(async () => {
        const { data, error } = await supabase.storage
          .from(bucket)
          .list("", { limit: 1 });
        if (error) throw error;
        return data;
      });

      if (result.error) {
        return {
          name: bucket,
          status: "error",
          message: "Bucket blocked or missing",
          responseTime: result.responseTime,
          detail: getErrorMessage(result.error),
        };
      }

      return {
        name: bucket,
        status: result.responseTime < 800 ? "healthy" : "degraded",
        message: "Bucket reachable",
        responseTime: result.responseTime,
        detail: `${result.data?.length || 0} item sample read`,
      };
    }),
  );
}

async function fetchAppDataHealth(): Promise<HealthCheck[]> {
  return Promise.all(
    appTables.map(async (table) => {
      const result = await measure(async () => {
        const { data, error } = await supabase
          .schema(table.schema)
          .from(table.table)
          .select(table.sampleSelect)
          .limit(1);

        if (error) throw error;
        return data;
      });

      if (result.error) {
        return {
          name: `${table.schema}.${table.label}`,
          status: "error",
          message: "Read check failed",
          responseTime: result.responseTime,
          detail: getErrorMessage(result.error),
          action: getAppDataFailureAction(table.label, table.schema),
        };
      }

      return {
        name: `${table.schema}.${table.label}`,
        status: result.responseTime < 800 ? "healthy" : "degraded",
        message: "Read check passed",
        responseTime: result.responseTime,
        detail: `${result.data?.length || 0} row sample read`,
      };
    }),
  );
}

function combineStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("error")) return "error";
  if (statuses.includes("degraded")) return "degraded";
  if (statuses.includes("unknown")) return "unknown";
  return "healthy";
}

function getStatusText(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "degraded":
      return "Slow";
    case "error":
      return "Needs attention";
    case "unknown":
      return "Unknown";
  }
}

function getStatusBadgeClass(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300";
    case "degraded":
      return "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-300";
    case "error":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300";
    case "unknown":
      return "border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-dark-300 dark:bg-dark-200 dark:text-neutral-300";
  }
}

function StatusIcon({ status }: { status: HealthStatus }) {
  if (status === "healthy")
    return <CheckCircle className="h-5 w-5 text-green-500" />;
  if (status === "degraded")
    return <AlertCircle className="h-5 w-5 text-yellow-500" />;
  if (status === "error") return <XCircle className="h-5 w-5 text-red-500" />;
  return <AlertCircle className="h-5 w-5 text-neutral-500" />;
}

function MetricCard({
  icon,
  label,
  value,
  helper,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
  status: HealthStatus;
}) {
  return (
    <div className="rounded-none border border-neutral-200 bg-white p-4 dark:border-dark-300 dark:bg-dark-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-none bg-neutral-100 p-2 dark:bg-dark-300">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 dark:text-white">
              {label}
            </p>
            <p className="mt-1 break-words text-2xl font-bold text-neutral-900 dark:text-white">
              {value}
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-300">
              {helper}
            </p>
          </div>
        </div>
        <StatusIcon status={status} />
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: HealthCheck }) {
  return (
    <div className="flex flex-col gap-2 border-b border-neutral-100 py-3 last:border-0 dark:border-dark-300 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-start gap-2">
        <StatusIcon status={check.status} />
        <div className="min-w-0">
          <p className="font-medium text-neutral-900 dark:text-white">
            {check.name}
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            {check.message}
          </p>
          {check.detail && (
            <p className="mt-1 break-words text-xs text-neutral-500 dark:text-neutral-400">
              {check.detail}
            </p>
          )}
          {check.action && (
            <p className="mt-1 text-xs font-medium text-neutral-700 dark:text-neutral-200">
              {check.action}
            </p>
          )}
        </div>
      </div>
      {typeof check.responseTime === "number" && (
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          {check.responseTime}ms
        </span>
      )}
    </div>
  );
}

export const SystemHealthMonitoring: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchSystemStats();
  }, [refreshKey]);

  const fetchSystemStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const [supabaseStatus, auth, storage, appData] = await Promise.all([
        fetchSupabasePlatformStatus(),
        fetchAuthHealth(),
        fetchStorageHealth(),
        fetchAppDataHealth(),
      ]);
      const database = buildDatabaseHealth(appData);

      const responseData = [
        { name: "Supabase", ms: supabaseStatus.responseTime },
        { name: "Database", ms: database.responseTime },
        { name: "Auth", ms: auth.responseTime },
        ...storage.map((check) => ({
          name: check.name,
          ms: check.responseTime || 0,
        })),
        ...appData.map((check) => ({
          name: check.name,
          ms: check.responseTime || 0,
        })),
      ];

      const overallStatus = combineStatus([
        supabaseStatus.status,
        database.status,
        auth.status,
        ...storage.map((check) => check.status),
        ...appData.map((check) => check.status),
      ]);

      setStats({
        overallStatus,
        checkedAt: new Date().toISOString(),
        supabaseStatus,
        database,
        auth,
        storage,
        appData,
        environment: {
          projectRef: getProjectRef(),
          appMode: import.meta.env.MODE || "Unknown",
          browserOnline:
            typeof navigator === "undefined" ? true : navigator.onLine,
          localTime: new Date().toLocaleString(),
        },
        responseData,
      });
    } catch (err: any) {
      console.error("Error fetching system stats:", err);
      setError(`Failed to load system health: ${getErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshKey((prevKey) => prevKey + 1);
  };

  const slowestCheck = useMemo(() => {
    if (!stats?.responseData.length) return null;
    return [...stats.responseData].sort((a, b) => b.ms - a.ms)[0];
  }, [stats]);

  return (
    <Card className="border border-neutral-200 bg-white shadow-sm dark:border-dark-300 dark:bg-dark-150">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center text-lg font-medium text-neutral-900 dark:text-white">
          <Server className="mr-2 h-5 w-5 text-blue-500" />
          System Health
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw
            className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          {loading ? "Checking..." : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error ? (
          <div className="flex items-center rounded-none bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-300">
            <AlertCircle className="mr-2 h-5 w-5" />
            <span>{error}</span>
          </div>
        ) : stats ? (
          <div className="space-y-6">
            <div
              className={`rounded-none border p-4 ${getStatusBadgeClass(stats.overallStatus)}`}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <StatusIcon status={stats.overallStatus} />
                  <div>
                    <p className="text-base font-semibold">
                      Overall: {getStatusText(stats.overallStatus)}
                    </p>
                    <p className="text-sm">
                      Last checked{" "}
                      {new Date(stats.checkedAt).toLocaleTimeString()}
                      {slowestCheck
                        ? ` - Slowest check: ${slowestCheck.name} at ${slowestCheck.ms}ms`
                        : ""}
                    </p>
                  </div>
                </div>
                <a
                  className="inline-flex items-center text-sm font-medium underline-offset-4 hover:underline"
                  href="https://status.supabase.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Supabase status
                  <ExternalLink className="ml-1 h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={
                  <Wifi className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                }
                label="Supabase Platform"
                value={getStatusText(stats.supabaseStatus.status)}
                helper={`${stats.supabaseStatus.description} - ${stats.supabaseStatus.responseTime}ms`}
                status={stats.supabaseStatus.status}
              />
              <MetricCard
                icon={
                  <Database className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
                }
                label="Database"
                value={`${stats.database.responseTime}ms`}
                helper={
                  stats.database.error ||
                  stats.database.note ||
                  `${stats.database.tables} tables - ${stats.database.size}`
                }
                status={stats.database.status}
              />
              <MetricCard
                icon={
                  <Lock className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                }
                label="Auth"
                value={stats.auth.signedIn ? "Signed in" : "Check failed"}
                helper={
                  stats.auth.error || stats.auth.email || "Session present"
                }
                status={stats.auth.status}
              />
              <MetricCard
                icon={
                  <Activity className="h-5 w-5 text-orange-600 dark:text-orange-300" />
                }
                label="Browser"
                value={stats.environment.browserOnline ? "Online" : "Offline"}
                helper={`Project ${stats.environment.projectRef} - ${stats.environment.appMode}`}
                status={stats.environment.browserOnline ? "healthy" : "error"}
              />
            </div>

            <Tabs defaultValue="live">
              <TabsList className="w-full">
                <TabsTrigger value="live">Live Checks</TabsTrigger>
                <TabsTrigger value="database">Database</TabsTrigger>
                <TabsTrigger value="storage">Storage</TabsTrigger>
                <TabsTrigger value="environment">Environment</TabsTrigger>
              </TabsList>

              <TabsContent value="live" className="mt-4">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <Card className="p-4">
                    <h4 className="mb-3 text-sm font-medium text-neutral-500 dark:text-neutral-300">
                      App Data Checks
                    </h4>
                    <div>
                      {stats.appData.map((check) => (
                        <CheckRow key={check.name} check={check} />
                      ))}
                    </div>
                  </Card>

                  <Card className="p-4">
                    <h4 className="mb-3 text-sm font-medium text-neutral-500 dark:text-neutral-300">
                      Response Times
                    </h4>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.responseData}>
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 11 }}
                            interval={0}
                            angle={-30}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis />
                          <Tooltip />
                          <Bar
                            dataKey="ms"
                            name="Milliseconds"
                            fill="#f26722"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="database" className="mt-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="p-4">
                      <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-300">
                        Database Size
                      </h4>
                      <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
                        {stats.database.size}
                      </p>
                    </Card>
                    <Card className="p-4">
                      <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-300">
                        Tables
                      </h4>
                      <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
                        {stats.database.tables}
                      </p>
                    </Card>
                    <Card className="p-4">
                      <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-300">
                        Estimated Rows
                      </h4>
                      <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
                        {stats.database.rows.toLocaleString()}
                      </p>
                    </Card>
                    <Card className="p-4">
                      <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-300">
                        Functions
                      </h4>
                      <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
                        {stats.database.functions}
                      </p>
                    </Card>
                  </div>

                  {stats.database.error && (
                    <div className="rounded-none bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300">
                      {stats.database.error}
                    </div>
                  )}

                  {stats.database.note && (
                    <div className="rounded-none bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
                      {stats.database.note}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="storage" className="mt-4">
                <Card className="p-4">
                  <h4 className="mb-3 text-sm font-medium text-neutral-500 dark:text-neutral-300">
                    Storage Buckets
                  </h4>
                  <div>
                    {stats.storage.map((check) => (
                      <CheckRow key={check.name} check={check} />
                    ))}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="environment" className="mt-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    icon={
                      <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                    }
                    label="Project Ref"
                    value={stats.environment.projectRef}
                    helper="Supabase project connected to this app"
                    status="healthy"
                  />
                  <MetricCard
                    icon={
                      <Server className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                    }
                    label="App Mode"
                    value={stats.environment.appMode}
                    helper="Current build environment"
                    status="healthy"
                  />
                  <MetricCard
                    icon={
                      <Clock className="h-5 w-5 text-purple-600 dark:text-purple-300" />
                    }
                    label="Local Time"
                    value={stats.environment.localTime}
                    helper="Your browser clock"
                    status="healthy"
                  />
                  <MetricCard
                    icon={
                      <HardDrive className="h-5 w-5 text-orange-600 dark:text-orange-300" />
                    }
                    label="Storage Checks"
                    value={`${stats.storage.filter((check) => check.status === "healthy").length}/${stats.storage.length}`}
                    helper="Buckets reachable from this login"
                    status={combineStatus(
                      stats.storage.map((check) => check.status),
                    )}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <p>No data available</p>
        )}
      </CardContent>
    </Card>
  );
};

export default SystemHealthMonitoring;
