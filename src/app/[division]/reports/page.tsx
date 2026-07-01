import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useDivision } from "@/App";
import { PageLayout } from "@/components/ui/PageLayout";
import Card, {
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { QualityMetrics } from "@/components/lab/QualityMetrics";
import { PortalType } from "@/lib/types/scheduling";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ReportApprovalWorkflow } from "@/components/reports/ReportApprovalWorkflow";
import { canAccessReportApproval } from "@/lib/roles";
import { supabase } from "@/lib/supabase";
import { Flag } from "lucide-react";

export default function ReportsPage() {
  const params = useParams();
  const { user } = useAuth();
  const { division, setDivision } = useDivision();
  const navigate = useNavigate();
  const [portalType, setPortalType] = useState<PortalType>("neta");
  const [activeTab, setActiveTab] = useState("quality");
  const [openReportFlagCount, setOpenReportFlagCount] = useState(0);

  useEffect(() => {
    if (params.division && params.division !== division) {
      setDivision(params.division as string);
    }
  }, [params.division, division, setDivision]);

  // Handle URL tab parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get("tab");
    if (
      tab &&
      ["quality", "performance", "scheduling", "approval"].includes(tab)
    ) {
      setActiveTab(tab);
    }
  }, []);

  useEffect(() => {
    if (division) {
      if (
        ["north_alabama", "tennessee", "georgia", "international"].includes(
          division,
        )
      ) {
        setPortalType("neta");
      } else if (["calibration", "armadillo"].includes(division)) {
        setPortalType("lab");
      } else if (division === "scavenger") {
        setPortalType("scavenger");
      }
    }
  }, [division]);

  // Check access permissions (single source of truth in roles.ts)
  const canAccessReports = canAccessReportApproval(
    user?.user_metadata?.role,
    user?.email,
  );

  useEffect(() => {
    if (!user || !canAccessReports) {
      console.warn(
        "User not logged in or does not have permission to access reports.",
      );
      navigate("/portal");
    }
  }, [user, canAccessReports, navigate]);

  useEffect(() => {
    if (!user || !canAccessReports) {
      setOpenReportFlagCount(0);
      return;
    }

    const loadOpenReportFlagCount = async () => {
      try {
        const { count, error } = await supabase
          .schema("common")
          .from("report_flags")
          .select("id", { count: "exact", head: true })
          .eq("status", "open");

        if (error) throw error;
        setOpenReportFlagCount(count || 0);
      } catch (error) {
        console.warn(
          "[ReportsPage] Failed to load open report flag count:",
          error,
        );
        setOpenReportFlagCount(0);
      }
    };

    void loadOpenReportFlagCount();

    const channel = supabase
      .channel("reports-page-report-flags")
      .on(
        "postgres_changes",
        { event: "*", schema: "common", table: "report_flags" },
        () => void loadOpenReportFlagCount(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, canAccessReports]);

  if (!division || !user || !canAccessReports) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  const formattedDivision = division
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return (
    <PageLayout
      title={`${formattedDivision} Division - Reports`}
      subtitle="Generate and view operational reports and metrics"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="quality">Quality Metrics</TabsTrigger>
          <TabsTrigger value="performance">Performance Reports</TabsTrigger>
          <TabsTrigger value="scheduling">Scheduling Reports</TabsTrigger>
          <TabsTrigger value="approval">
            <span className="inline-flex items-center gap-1.5">
              Report Approval
              {openReportFlagCount > 0 && (
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-none bg-yellow-400 px-1.5 text-[11px] font-bold leading-none text-yellow-950 shadow-sm"
                  title={`${openReportFlagCount} open customer flag${openReportFlagCount === 1 ? "" : "s"} needing attention`}
                  aria-label={`${openReportFlagCount} open customer flag${openReportFlagCount === 1 ? "" : "s"} needing attention`}
                >
                  <Flag className="h-3 w-3" />
                </span>
              )}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quality">
          <Card>
            <CardHeader>
              <CardTitle>Quality Metrics</CardTitle>
              <CardDescription>
                Generate quality assurance reports and metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <QualityMetrics division={division} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <Card>
            <CardHeader>
              <CardTitle>Performance Reports</CardTitle>
              <CardDescription>
                View technician and team performance metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>Performance reporting features coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scheduling">
          <Card>
            <CardHeader>
              <CardTitle>Scheduling Reports</CardTitle>
              <CardDescription>
                Generate scheduling efficiency and utilization reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>Scheduling reporting features coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approval">
          <Card>
            <CardHeader>
              <CardTitle>Report Approval</CardTitle>
              <CardDescription>
                Review and approve technical reports across all jobs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canAccessReports ? (
                <ReportApprovalWorkflow
                  division={division}
                  onUpdate={() => {
                    // Optional: Add any refresh logic here
                    console.log("Report approval updated");
                  }}
                />
              ) : (
                <div className="p-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-none text-sm text-yellow-800 dark:text-yellow-200">
                  You do not have permission to access the report approval
                  workflow. Please contact an administrator if you believe this
                  is an error.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
