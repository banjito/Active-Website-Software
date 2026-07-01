import React, { useEffect, useState } from "react";
import { PageLayout } from "@/components/ui/PageLayout";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Clock, CalendarClock, Users, Award, Layers } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { useAuth } from "@/lib/AuthContext";
import { useDivision } from "@/lib/DivisionContext";
import { useParams, useNavigate } from "react-router-dom";
import { PortalType, TechnicianAssignment } from "@/lib/types/scheduling";
import { TechnicianCalendar } from "@/components/scheduling/TechnicianCalendar";
import { TechnicianListedView } from "@/components/scheduling/TechnicianListedView";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import dayjs from "dayjs";

interface TechCalendarProps {
  portalType: PortalType;
  division?: string;
  viewOnly?: boolean;
  showAllTechnicians?: boolean;
}

export default function SchedulingPage() {
  const params = useParams();
  const { user } = useAuth();
  const { division, setDivision } = useDivision();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>("listed");
  const [portalType, setPortalType] = useState<PortalType>("neta");
  const [selectedAssignment, setSelectedAssignment] =
    useState<TechnicianAssignment | null>(null);
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);

  useEffect(() => {
    if (params.division && params.division !== division) {
      setDivision(params.division as string);
    }
  }, [params.division, division, setDivision]);

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

  // Allow any authenticated user to access and edit the scheduler
  const canAccessScheduler = !!user;

  useEffect(() => {
    if (!user) {
      console.warn("User not logged in.");
      navigate("/portal");
    }
  }, [user, navigate]);

  // All authenticated users may access scheduler; no additional role redirect

  if (!division || !user || !canAccessScheduler) {
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

  const handleAssignmentClick = (assignment: TechnicianAssignment) => {
    setSelectedAssignment(assignment);
    setShowAssignmentDialog(true);
  };

  // Helper functions to always derive name from email (firstname.lastname format)
  const deriveNameFromEmail = (email?: string | null): string | null => {
    if (!email) return null;
    const lower = String(email).toLowerCase();
    const m = lower.match(/^([a-z]+)\.([a-z]+)@ampqes\.com$/i);
    if (!m) return null;
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(m[1])} ${cap(m[2])}`;
  };

  const formatDisplayName = (name?: string, email?: string): string => {
    // Always prioritize email-derived name (firstname.lastname format)
    const derived = deriveNameFromEmail(email);
    if (derived) return derived;

    // Fallback to provided name or email
    const n = (name || "").trim();
    return n || email || "Unknown";
  };

  // Mock data for the dashboard cards
  const dashboardCards = [
    {
      title: "Technicians",
      value: "12",
      icon: <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />,
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
    },
    {
      title: "Scheduled Today",
      value: "6",
      icon: <Clock className="h-6 w-6 text-green-600 dark:text-green-400" />,
      bgColor: "bg-green-100 dark:bg-green-900/20",
    },
    {
      title: "Pending Approvals",
      value: "3",
      icon: (
        <CalendarClock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
      ),
      bgColor: "bg-amber-100 dark:bg-amber-900/20",
    },
    {
      title: "Jobs This Week",
      value: "8",
      icon: <Layers className="h-6 w-6 text-purple-600 dark:text-purple-400" />,
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
    },
  ];

  return (
    <PageLayout
      title={`${formattedDivision} Division - Scheduling`}
      subtitle="Manage technician scheduling and job assignments"
    >
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList>
            <TabsTrigger value="listed">Listed View</TabsTrigger>
            <TabsTrigger value="calendar">Calendar View</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="mt-6">
            <TechnicianCalendar
              portalType={portalType}
              division={division}
              showAllTechnicians={true}
              onAssignmentClick={handleAssignmentClick}
            />
          </TabsContent>

          <TabsContent value="listed" className="mt-6">
            <TechnicianListedView
              portalType={portalType}
              division={division}
              days={7}
              onAssignmentClick={handleAssignmentClick}
            />
          </TabsContent>
        </Tabs>

        {/* Assignment Details Dialog */}
        <Dialog
          open={showAssignmentDialog}
          onOpenChange={setShowAssignmentDialog}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Assignment Details</DialogTitle>
            </DialogHeader>

            {selectedAssignment && (
              <div className="space-y-4">
                {/* Job Information */}
                <div className="bg-neutral-50 dark:bg-dark-200 rounded-none p-4">
                  <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
                    Job Information
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-neutral-500 dark:text-neutral-400">
                        Job Number
                      </label>
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {selectedAssignment.job?.job_number || "N/A"}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-neutral-500 dark:text-neutral-400">
                        Job Title
                      </label>
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {selectedAssignment.job?.title || "N/A"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Assignment Information */}
                <div className="bg-neutral-50 dark:bg-dark-200 rounded-none p-4">
                  <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
                    Assignment Details
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-neutral-500 dark:text-neutral-400">
                        Assigned Technician
                      </label>
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {formatDisplayName(
                          selectedAssignment.user?.user_metadata?.name,
                          selectedAssignment.user?.email,
                        )}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-neutral-500 dark:text-neutral-400">
                        Date
                      </label>
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {dayjs(selectedAssignment.assignment_date).format(
                          "MMMM D, YYYY",
                        )}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-neutral-500 dark:text-neutral-400">
                        Time
                      </label>
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {(() => {
                          const isAllDay =
                            selectedAssignment.start_time?.startsWith(
                              "00:00",
                            ) &&
                            (selectedAssignment.end_time?.startsWith("23:59") ||
                              selectedAssignment.end_time?.startsWith("24:00"));
                          const isUnknown =
                            selectedAssignment.start_time?.slice(0, 5) ===
                            selectedAssignment.end_time?.slice(0, 5);

                          if (isAllDay) return "All Day";
                          if (isUnknown) return "Unknown Hours";
                          return `${selectedAssignment.start_time?.slice(0, 5)} - ${selectedAssignment.end_time?.slice(0, 5)}`;
                        })()}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-neutral-500 dark:text-neutral-400">
                        Status
                      </label>
                      <p className="font-medium text-neutral-900 dark:text-white capitalize">
                        {selectedAssignment.status || "scheduled"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {selectedAssignment.notes && (
                  <div className="bg-neutral-50 dark:bg-dark-200 rounded-none p-4">
                    <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                      Notes
                    </h3>
                    <p className="text-sm text-neutral-900 dark:text-white whitespace-pre-wrap">
                      {selectedAssignment.notes}
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowAssignmentDialog(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
  );
}
