import React, { useState, useCallback, useEffect } from "react";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import {
  FileBarChart,
  Download,
  Loader2,
  Users,
  UserPlus,
  Briefcase,
  Shield,
  Calendar,
  ChevronDown,
  Filter,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../components/ui/toast";
import {
  buildCsv,
  downloadCsv,
  downloadExcel,
} from "../../../lib/hr/exportReports";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/Table";
import { ScrollArea } from "../../../components/ui/ScrollArea";

type ReportId =
  | "headcount-turnover"
  | "new-hires-terminations"
  | "open-requisitions"
  | "certification-compliance"
  | "pto-balances";

interface ReportDef {
  id: ReportId;
  title: string;
  description: string;
  keyReports: string[];
  coreFields: string[];
  output: string;
  icon: React.ReactNode;
}

const REPORT_DEFS: ReportDef[] = [
  {
    id: "headcount-turnover",
    title: "Headcount & Turnover",
    description:
      "Active headcount, headcount by dept/location/role, terminations (voluntary vs involuntary), turnover rate (monthly + rolling 12).",
    keyReports: [
      "Active Headcount",
      "Headcount by Dept / Location / Role",
      "Terminations (Voluntary vs Involuntary)",
      "Turnover Rate (Monthly + Rolling 12)",
    ],
    coreFields: [
      "Employee Status",
      "Hire Date",
      "Termination Date",
      "Termination Type/Reason",
      "Department",
      "Location",
      "Job Title",
      "Manager",
      "Pay Rate",
      "Labor Type",
    ],
    output:
      "Monthly scheduled PDF or Excel (prefer Excel), snapshot as of month-end.",
    icon: <Users className="h-5 w-5" />,
  },
  {
    id: "new-hires-terminations",
    title: "New Hires & Terminations (Rolling 12 Months)",
    description:
      "New hires and terminations by month, average tenure at exit, new-hire turnover (0–90 / 90–180), promotions.",
    keyReports: [
      "New hires by month",
      "Terminations by month",
      "Average tenure at exit",
      "New-hire turnover (0–90 / 90–180)",
      "Promotions",
    ],
    coreFields: [
      "Hire Date or Promotion Date",
      "Termination Date",
      "Employment Type",
      "Department",
      "Tenure (calculated)",
    ],
    output: "Rolling 12-month Excel, quarterly trend view.",
    icon: <UserPlus className="h-5 w-5" />,
  },
  {
    id: "open-requisitions",
    title: "Open Requisitions & Time-to-Fill",
    description:
      "Open requisitions and aging, time-to-fill, offer acceptance rate, pipeline stage counts.",
    keyReports: [
      "Open requisitions + aging",
      "Time-to-fill",
      "Offer acceptance rate",
      "Pipeline stage counts",
    ],
    coreFields: [
      "Requisition Open Date",
      "Close Date",
      "Position",
      "Department",
      "Hiring Manager",
      "Candidate Status",
      "Offer Status",
    ],
    output: "Live dashboard + monthly summary.",
    icon: <Briefcase className="h-5 w-5" />,
  },
  {
    id: "certification-compliance",
    title: "Certification & Compliance Status",
    description:
      "Active certifications, upcoming expirations (30/60/90 days), missing required documents, compliance completion %.",
    keyReports: [
      "Active certifications",
      "Upcoming expirations (30/60/90 days)",
      "Missing required documents",
      "Compliance completion %",
    ],
    coreFields: [
      "Certification Type (NETA, OSHA, etc.)",
      "Issue Date",
      "Expiration Date",
      "Employee Status",
      "Role / Department",
    ],
    output:
      "Bi-weekly scheduled report, exception-based (only expirations/missing).",
    icon: <Shield className="h-5 w-5" />,
  },
  {
    id: "pto-balances",
    title: "PTO Balances & Liability Snapshot",
    description:
      "PTO balances by employee, accrued vs used, PTO liability (hours + dollars), high-risk balances.",
    keyReports: [
      "PTO balances by employee",
      "Accrued vs used",
      "PTO liability (hours + dollars)",
      "High-risk balances",
    ],
    coreFields: [
      "PTO Balance",
      "Accrual Policy",
      "Pay Rate (may link payroll)",
      "Employment Status",
    ],
    output: "Month-end Excel, liability summary for finance.",
    icon: <Calendar className="h-5 w-5" />,
  },
];

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return "—";
  }
}

interface DashboardData {
  headcount: Record<string, unknown>[];
  requisitions: Record<string, unknown>[];
  certs: Record<string, unknown>[];
  newHires: Record<string, unknown>[];
  pto: Record<string, unknown>[];
}

const emptyDashboard: DashboardData = {
  headcount: [],
  requisitions: [],
  certs: [],
  newHires: [],
  pto: [],
};

export function HrCustomReports() {
  const [dashboardData, setDashboardData] =
    useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [runningReport, setRunningReport] = useState<ReportId | null>(null);
  const [filterAsOfDate, setFilterAsOfDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d.toISOString().slice(0, 7) + "-01";
  });
  const [filterDepartment, setFilterDepartment] = useState<string>("");
  const [filterLocation, setFilterLocation] = useState<string>("");
  const [expandedReport, setExpandedReport] = useState<ReportId | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setDashboardError(null);
    try {
      const [headcountRes, reqsRes, certsRes, newHiresRes, ptoRes] =
        await Promise.all([
          supabase
            .schema("common")
            .from("profiles")
            .select(
              "id, full_name, email, job_title, department, location, hire_date, termination_date, termination_type, termination_reason, employment_status, labor_type, current_compensation_amount, current_pay_type",
            )
            .order("department", { ascending: true })
            .order("full_name", { ascending: true }),
          supabase
            .schema("common")
            .from("job_requisitions")
            .select(
              "id, title, department, location, employment_type, status, created_at, updated_at, closed_at",
            )
            .order("created_at", { ascending: false }),
          supabase
            .schema("common")
            .from("employee_certifications")
            .select(
              "id, employee_id, cert_name, cert_type, cert_category, cert_date, expiration_date, status, issuing_organization",
            )
            .order("expiration_date", { ascending: true, nullsFirst: false }),
          (async () => {
            const twelveMonthsAgo = new Date();
            twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
            const start = twelveMonthsAgo.toISOString().slice(0, 10);
            const { data } = await supabase
              .schema("common")
              .from("profiles")
              .select(
                "id, full_name, email, department, hire_date, termination_date, termination_type, employment_status",
              )
              .order("hire_date", { ascending: false, nullsFirst: false });
            const inRange = (d: string | null | undefined) => d && d >= start;
            return (data || []).filter((r: Record<string, unknown>) => {
              if (
                !inRange(r.hire_date as string) &&
                !inRange(r.termination_date as string)
              )
                return false;
              if (
                filterDepartment &&
                (r.department as string) !== filterDepartment
              )
                return false;
              return true;
            });
          })(),
          (async () => {
            const { data: types } = await supabase
              .schema("hr")
              .from("leave_types")
              .select("id, name");
            const { data: allocations, error } = await supabase
              .schema("hr")
              .from("leave_allocations")
              .select(
                "id, employee_id, leave_type_id, from_date, to_date, allocated_leaves, used_leaves, balance_leaves",
              );
            if (error || !allocations) return [] as Record<string, unknown>[];
            const typeMap: Record<string, string> = {};
            (types || []).forEach((t: { id: string; name: string }) => {
              typeMap[t.id] = t.name;
            });
            return allocations.map((a: Record<string, unknown>) => ({
              leave_type: typeMap[(a.leave_type_id as string) ?? ""] ?? "—",
              from_date: a.from_date,
              to_date: a.to_date,
              allocated_leaves: a.allocated_leaves,
              used_leaves: a.used_leaves,
              balance_leaves: a.balance_leaves,
            }));
          })(),
        ]);

      const headcountFiltered = (headcountRes.data || []).filter(
        (r: Record<string, unknown>) => {
          if (filterDepartment && (r.department as string) !== filterDepartment)
            return false;
          if (filterLocation && (r.location as string) !== filterLocation)
            return false;
          return true;
        },
      );
      const reqsFiltered = (reqsRes.data || []).filter(
        (r: Record<string, unknown>) => {
          if (filterDepartment && (r.department as string) !== filterDepartment)
            return false;
          return true;
        },
      );

      setDashboardData({
        headcount: headcountFiltered,
        requisitions: reqsFiltered,
        certs: certsRes.data || [],
        newHires: newHiresRes,
        pto: ptoRes,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load dashboard";
      setDashboardError(msg);
      setDashboardData(emptyDashboard);
    } finally {
      setLoading(false);
    }
  }, [filterAsOfDate, filterDepartment, filterLocation]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const runHeadcountTurnover = useCallback(
    (format: "excel" | "csv") => {
      setRunningReport("headcount-turnover");
      try {
        const filtered = dashboardData.headcount;
        const headers = [
          "Full Name",
          "Email",
          "Employee Status",
          "Hire Date",
          "Termination Date",
          "Termination Type",
          "Termination Reason",
          "Department",
          "Location",
          "Job Title",
          "Labor Type",
          "Pay Rate",
          "Pay Type",
        ];
        const dataRows = filtered.map((r: Record<string, unknown>) => [
          r.full_name ?? "—",
          r.email ?? "—",
          (r.employment_status as string) ?? "active",
          formatDate(r.hire_date as string),
          formatDate(r.termination_date as string),
          (r.termination_type as string) ?? "—",
          (r.termination_reason as string) ?? "—",
          (r.department as string) ?? "—",
          (r.location as string) ?? "—",
          (r.job_title as string) ?? "—",
          (r.labor_type as string) ?? "—",
          r.current_compensation_amount != null
            ? String(r.current_compensation_amount)
            : "—",
          (r.current_pay_type as string) ?? "—",
        ]);

        const filenameBase = "headcount-turnover-snapshot";
        if (format === "excel") {
          const excelRows = filtered.map((r: Record<string, unknown>) => ({
            "Full Name": r.full_name ?? "—",
            Email: r.email ?? "—",
            "Employee Status": (r.employment_status as string) ?? "active",
            "Hire Date": formatDate(r.hire_date as string),
            "Termination Date": formatDate(r.termination_date as string),
            "Termination Type": (r.termination_type as string) ?? "—",
            "Termination Reason": (r.termination_reason as string) ?? "—",
            Department: (r.department as string) ?? "—",
            Location: (r.location as string) ?? "—",
            "Job Title": (r.job_title as string) ?? "—",
            "Labor Type": (r.labor_type as string) ?? "—",
            "Pay Rate":
              r.current_compensation_amount != null
                ? String(r.current_compensation_amount)
                : "—",
            "Pay Type": (r.current_pay_type as string) ?? "—",
          }));
          downloadExcel(
            headers,
            excelRows,
            filenameBase,
            "Headcount & Turnover",
          );
        } else {
          const csv = buildCsv(headers, dataRows);
          downloadCsv(csv, filenameBase);
        }
        toast({
          title: "Export started",
          description: `${format.toUpperCase()} download started.`,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Export failed";
        toast({
          title: "Export failed",
          description: msg,
          variant: "destructive",
        });
      } finally {
        setRunningReport(null);
      }
    },
    [dashboardData.headcount],
  );

  const runOpenRequisitions = useCallback(
    (format: "excel" | "csv") => {
      setRunningReport("open-requisitions");
      try {
        const filtered = dashboardData.requisitions;

        const headers = [
          "Title",
          "Department",
          "Location",
          "Employment Type",
          "Status",
          "Created",
          "Updated",
          "Closed",
        ];
        const dataRows = filtered.map((r: Record<string, unknown>) => [
          r.title ?? "—",
          r.department ?? "—",
          r.location ?? "—",
          (r.employment_type as string) ?? "—",
          (r.status as string) ?? "—",
          formatDate(r.created_at as string),
          formatDate(r.updated_at as string),
          formatDate(r.closed_at as string),
        ]);

        const filenameBase = "open-requisitions";
        if (format === "excel") {
          const excelRows = filtered.map((r: Record<string, unknown>) => ({
            Title: r.title ?? "—",
            Department: r.department ?? "—",
            Location: r.location ?? "—",
            "Employment Type": (r.employment_type as string) ?? "—",
            Status: (r.status as string) ?? "—",
            Created: formatDate(r.created_at as string),
            Updated: formatDate(r.updated_at as string),
            Closed: formatDate(r.closed_at as string),
          }));
          downloadExcel(headers, excelRows, filenameBase, "Requisitions");
        } else {
          const csv = buildCsv(headers, dataRows);
          downloadCsv(csv, filenameBase);
        }
        toast({
          title: "Export started",
          description: `${format.toUpperCase()} download started.`,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Export failed";
        toast({
          title: "Export failed",
          description: msg,
          variant: "destructive",
        });
      } finally {
        setRunningReport(null);
      }
    },
    [dashboardData.requisitions],
  );

  const runCertificationCompliance = useCallback(
    (format: "excel" | "csv") => {
      setRunningReport("certification-compliance");
      try {
        const rows = dashboardData.certs;

        const headers = [
          "Cert Name",
          "Cert Type",
          "Category",
          "Issue Date",
          "Expiration Date",
          "Status",
          "Issuing Org",
        ];
        const dataRows = rows.map((r: Record<string, unknown>) => [
          r.cert_name ?? "—",
          r.cert_type ?? "—",
          (r.cert_category as string) ?? "—",
          formatDate(r.cert_date as string),
          formatDate(r.expiration_date as string),
          (r.status as string) ?? "—",
          (r.issuing_organization as string) ?? "—",
        ]);

        const filenameBase = "certification-compliance";
        if (format === "excel") {
          const excelRows = rows.map((r: Record<string, unknown>) => ({
            "Cert Name": r.cert_name ?? "—",
            "Cert Type": r.cert_type ?? "—",
            Category: (r.cert_category as string) ?? "—",
            "Issue Date": formatDate(r.cert_date as string),
            "Expiration Date": formatDate(r.expiration_date as string),
            Status: (r.status as string) ?? "—",
            "Issuing Org": (r.issuing_organization as string) ?? "—",
          }));
          downloadExcel(headers, excelRows, filenameBase, "Certifications");
        } else {
          const csv = buildCsv(headers, dataRows);
          downloadCsv(csv, filenameBase);
        }
        toast({
          title: "Export started",
          description: `${format.toUpperCase()} download started.`,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Export failed";
        toast({
          title: "Export failed",
          description: msg,
          variant: "destructive",
        });
      } finally {
        setRunningReport(null);
      }
    },
    [dashboardData.certs],
  );

  const runNewHiresTerminations = useCallback(
    (format: "excel" | "csv") => {
      setRunningReport("new-hires-terminations");
      try {
        const filtered = dashboardData.newHires;

        const headers = [
          "Full Name",
          "Email",
          "Department",
          "Hire Date",
          "Termination Date",
          "Termination Type",
          "Status",
        ];
        const dataRows = filtered.map((r: Record<string, unknown>) => [
          r.full_name ?? "—",
          r.email ?? "—",
          (r.department as string) ?? "—",
          formatDate(r.hire_date as string),
          formatDate(r.termination_date as string),
          (r.termination_type as string) ?? "—",
          (r.employment_status as string) ?? "—",
        ]);

        const filenameBase = "new-hires-terminations-rolling-12";
        if (format === "excel") {
          const excelRows = filtered.map((r: Record<string, unknown>) => ({
            "Full Name": r.full_name ?? "—",
            Email: r.email ?? "—",
            Department: (r.department as string) ?? "—",
            "Hire Date": formatDate(r.hire_date as string),
            "Termination Date": formatDate(r.termination_date as string),
            "Termination Type": (r.termination_type as string) ?? "—",
            Status: (r.employment_status as string) ?? "—",
          }));
          downloadExcel(
            headers,
            excelRows,
            filenameBase,
            "New Hires & Terminations",
          );
        } else {
          const csv = buildCsv(headers, dataRows);
          downloadCsv(csv, filenameBase);
        }
        toast({
          title: "Export started",
          description: `${format.toUpperCase()} download started.`,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Export failed";
        toast({
          title: "Export failed",
          description: msg,
          variant: "destructive",
        });
      } finally {
        setRunningReport(null);
      }
    },
    [dashboardData.newHires],
  );

  const runPtoBalances = useCallback(
    (format: "excel" | "csv") => {
      setRunningReport("pto-balances");
      try {
        const rows = dashboardData.pto.map((r: Record<string, unknown>) => ({
          leave_type: r.leave_type ?? "—",
          from_date: formatDate(r.from_date as string),
          to_date: formatDate(r.to_date as string),
          allocated: r.allocated_leaves ?? "—",
          used: r.used_leaves ?? "—",
          balance: r.balance_leaves ?? "—",
        }));

        const headers = [
          "Leave Type",
          "From",
          "To",
          "Allocated",
          "Used",
          "Balance",
        ];
        const dataRows = rows.map((r) => [
          r.leave_type,
          r.from_date,
          r.to_date,
          r.allocated,
          r.used,
          r.balance,
        ]);
        const filenameBase = "pto-balances-snapshot";
        if (format === "excel") {
          downloadExcel(
            headers,
            rows.map((r) => ({
              "Leave Type": r.leave_type,
              From: r.from_date,
              To: r.to_date,
              Allocated: r.allocated,
              Used: r.used,
              Balance: r.balance,
            })),
            filenameBase,
            "PTO Balances",
          );
        } else {
          downloadCsv(buildCsv(headers, dataRows), filenameBase);
        }
        toast({
          title: "Export started",
          description: `${format.toUpperCase()} download started.`,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Export failed";
        toast({
          title: "Export failed",
          description: msg,
          variant: "destructive",
        });
      } finally {
        setRunningReport(null);
      }
    },
    [dashboardData.pto],
  );

  const runReport = useCallback(
    (id: ReportId, format: "excel" | "csv") => {
      switch (id) {
        case "headcount-turnover":
          runHeadcountTurnover(format);
          break;
        case "new-hires-terminations":
          runNewHiresTerminations(format);
          break;
        case "open-requisitions":
          runOpenRequisitions(format);
          break;
        case "certification-compliance":
          runCertificationCompliance(format);
          break;
        case "pto-balances":
          runPtoBalances(format);
          break;
        default:
          toast({
            title: "Not implemented",
            description: "This report is not yet available.",
            variant: "destructive",
          });
      }
    },
    [
      runHeadcountTurnover,
      runNewHiresTerminations,
      runOpenRequisitions,
      runCertificationCompliance,
      runPtoBalances,
    ],
  );

  const activeHeadcount = dashboardData.headcount.filter(
    (r) => (r.employment_status as string) !== "terminated",
  ).length;
  const openReqs = dashboardData.requisitions.filter((r) =>
    ["draft", "pending_approval", "approved", "posted"].includes(
      (r.status as string) ?? "",
    ),
  ).length;
  const now = new Date();
  const in90 = new Date(now);
  in90.setDate(in90.getDate() + 90);
  const certsExpiring90 = dashboardData.certs.filter((r) => {
    const exp = r.expiration_date as string | null;
    if (!exp) return false;
    const d = new Date(exp);
    return d >= now && d <= in90;
  }).length;
  const newHires12 = dashboardData.newHires.filter(
    (r) => r.hire_date && !r.termination_date,
  ).length;
  const terminations12 = dashboardData.newHires.filter(
    (r) => r.termination_date,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
          HR Analytics Dashboard
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-2">
          View and export HR analytics. Data refreshes when you change filters
          or click Refresh.
        </p>
      </div>

      {/* Shared filters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
          <CardDescription>
            As-of date, department, and location apply to headcount and related
            reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium">As-of date</label>
            <Input
              type="month"
              value={filterAsOfDate.slice(0, 7)}
              onChange={(e) =>
                setFilterAsOfDate(e.target.value ? e.target.value + "-01" : "")
              }
              className="w-40"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium">Department</label>
            <Input
              placeholder="All"
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium">Location</label>
            <Input
              placeholder="All"
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              className="w-40"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboard}
            disabled={loading}
            className="ml-auto flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </CardContent>
      </Card>

      {dashboardError && (
        <div className="flex items-center gap-2 rounded-none border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{dashboardError}</span>
        </div>
      )}

      {/* KPI summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Active Headcount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "—" : activeHeadcount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Open Requisitions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "—" : openReqs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Certs Expiring (90d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "—" : certsExpiring90}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              New Hires (12 mo)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "—" : newHires12}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Terminations (12 mo)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "—" : terminations12}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report cards */}
      <div className="grid gap-4">
        {REPORT_DEFS.map((def) => {
          const isExpanded = expandedReport === def.id;
          const isRunning = runningReport === def.id;
          return (
            <Card key={def.id}>
              <CardHeader
                className="cursor-pointer select-none"
                onClick={() => setExpandedReport(isExpanded ? null : def.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-none bg-primary/10 p-2 text-primary">
                      {def.icon}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{def.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {def.description}
                      </CardDescription>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                </div>
              </CardHeader>
              {isExpanded && (
                <CardContent className="space-y-4 border-t pt-4">
                  {def.id === "headcount-turnover" && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Showing {dashboardData.headcount.length} employee
                        record(s). Active: {activeHeadcount}.
                      </p>
                      <ScrollArea
                        className="rounded-none border"
                        maxHeight="420px"
                      >
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Hire Date</TableHead>
                              <TableHead>Term. Date</TableHead>
                              <TableHead>Dept</TableHead>
                              <TableHead>Location</TableHead>
                              <TableHead>Job Title</TableHead>
                              <TableHead>Labor Type</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dashboardData.headcount.map((r, i) => (
                              <TableRow key={(r.id as string) || i}>
                                <TableCell>
                                  {String(r.full_name ?? "—")}
                                </TableCell>
                                <TableCell>{String(r.email ?? "—")}</TableCell>
                                <TableCell>
                                  {String(r.employment_status ?? "active")}
                                </TableCell>
                                <TableCell>
                                  {formatDate(r.hire_date as string)}
                                </TableCell>
                                <TableCell>
                                  {formatDate(r.termination_date as string)}
                                </TableCell>
                                <TableCell>
                                  {String(r.department ?? "—")}
                                </TableCell>
                                <TableCell>
                                  {String(r.location ?? "—")}
                                </TableCell>
                                <TableCell>
                                  {String(r.job_title ?? "—")}
                                </TableCell>
                                <TableCell>
                                  {String(r.labor_type ?? "—")}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </>
                  )}
                  {def.id === "new-hires-terminations" && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Rolling 12 months: {dashboardData.newHires.length}{" "}
                        record(s).
                      </p>
                      <ScrollArea
                        className="rounded-none border"
                        maxHeight="420px"
                      >
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Department</TableHead>
                              <TableHead>Hire Date</TableHead>
                              <TableHead>Term. Date</TableHead>
                              <TableHead>Term. Type</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dashboardData.newHires.map((r, i) => (
                              <TableRow key={(r.id as string) || i}>
                                <TableCell>
                                  {String(r.full_name ?? "—")}
                                </TableCell>
                                <TableCell>{String(r.email ?? "—")}</TableCell>
                                <TableCell>
                                  {String(r.department ?? "—")}
                                </TableCell>
                                <TableCell>
                                  {formatDate(r.hire_date as string)}
                                </TableCell>
                                <TableCell>
                                  {formatDate(r.termination_date as string)}
                                </TableCell>
                                <TableCell>
                                  {String(r.termination_type ?? "—")}
                                </TableCell>
                                <TableCell>
                                  {String(r.employment_status ?? "—")}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </>
                  )}
                  {def.id === "open-requisitions" && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {dashboardData.requisitions.length} requisition(s).
                        Open: {openReqs}.
                      </p>
                      <ScrollArea
                        className="rounded-none border"
                        maxHeight="420px"
                      >
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Title</TableHead>
                              <TableHead>Department</TableHead>
                              <TableHead>Location</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Created</TableHead>
                              <TableHead>Closed</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dashboardData.requisitions.map((r, i) => (
                              <TableRow key={(r.id as string) || i}>
                                <TableCell>{String(r.title ?? "—")}</TableCell>
                                <TableCell>
                                  {String(r.department ?? "—")}
                                </TableCell>
                                <TableCell>
                                  {String(r.location ?? "—")}
                                </TableCell>
                                <TableCell>
                                  {String(r.employment_type ?? "—")}
                                </TableCell>
                                <TableCell>{String(r.status ?? "—")}</TableCell>
                                <TableCell>
                                  {formatDate(r.created_at as string)}
                                </TableCell>
                                <TableCell>
                                  {formatDate(r.closed_at as string)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </>
                  )}
                  {def.id === "certification-compliance" && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {dashboardData.certs.length} certification(s). Expiring
                        in 90 days: {certsExpiring90}.
                      </p>
                      <ScrollArea
                        className="rounded-none border"
                        maxHeight="420px"
                      >
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Cert Name</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Issue Date</TableHead>
                              <TableHead>Expiration</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Issuing Org</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dashboardData.certs.map((r, i) => (
                              <TableRow key={(r.id as string) || i}>
                                <TableCell>
                                  {String(r.cert_name ?? "—")}
                                </TableCell>
                                <TableCell>
                                  {String(r.cert_type ?? "—")}
                                </TableCell>
                                <TableCell>
                                  {String(r.cert_category ?? "—")}
                                </TableCell>
                                <TableCell>
                                  {formatDate(r.cert_date as string)}
                                </TableCell>
                                <TableCell>
                                  {formatDate(r.expiration_date as string)}
                                </TableCell>
                                <TableCell>{String(r.status ?? "—")}</TableCell>
                                <TableCell>
                                  {String(r.issuing_organization ?? "—")}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </>
                  )}
                  {def.id === "pto-balances" && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {dashboardData.pto.length} PTO allocation(s). HR leave
                        data required.
                      </p>
                      <ScrollArea
                        className="rounded-none border"
                        maxHeight="420px"
                      >
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Leave Type</TableHead>
                              <TableHead>From</TableHead>
                              <TableHead>To</TableHead>
                              <TableHead>Allocated</TableHead>
                              <TableHead>Used</TableHead>
                              <TableHead>Balance</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dashboardData.pto.map((r, i) => (
                              <TableRow key={i}>
                                <TableCell>
                                  {String(r.leave_type ?? "—")}
                                </TableCell>
                                <TableCell>
                                  {formatDate(r.from_date as string)}
                                </TableCell>
                                <TableCell>
                                  {formatDate(r.to_date as string)}
                                </TableCell>
                                <TableCell>
                                  {String(r.allocated_leaves ?? "—")}
                                </TableCell>
                                <TableCell>
                                  {String(r.used_leaves ?? "—")}
                                </TableCell>
                                <TableCell>
                                  {String(r.balance_leaves ?? "—")}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="default"
                      disabled={isRunning}
                      onClick={() => runReport(def.id, "excel")}
                      className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
                    >
                      {isRunning ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileBarChart className="h-4 w-4 mr-2" />
                      )}
                      Export Excel
                    </Button>
                    <Button
                      variant="outline"
                      disabled={isRunning}
                      onClick={() => runReport(def.id, "csv")}
                    >
                      {isRunning ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Export CSV
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
