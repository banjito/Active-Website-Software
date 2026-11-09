import React, { useEffect, useState } from "react";
import { PageLayout } from "@/components/ui/PageLayout";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Clock, CalendarClock, Users, Award, Layers } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { useAuth } from "@/lib/AuthContext";
import { useDivision } from "@/App"; // Import from App.tsx instead of DivisionContext.tsx
import { useParams, useNavigate } from "react-router-dom";
import { PortalType, TechnicianAssignment } from "@/lib/types/scheduling";
import { TechnicianCalendar } from "@/components/scheduling/TechnicianCalendar";
import { TechnicianListedView } from "@/components/scheduling/TechnicianListedView";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { canEditSchedule } from "@/lib/roles";
import { AssignmentDetailsDialog } from "@/components/scheduling/AssignmentDetailsDialog";
import { DivisionScheduleCards } from "@/components/scheduling/DivisionScheduleCards";
import { useDivisions } from "@/hooks/useDivisions";

interface TechCalendarProps {
  portalType: PortalType;
  division?: string;
  viewOnly?: boolean;
  showAllTechnicians?: boolean;
}

// Orange underline tabs, same look as Project Tracker and Customer notes.
const UNDERLINE_TAB =
  "-mb-px rounded-none border-b-2 border-transparent px-4 py-2 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:text-brand data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-brand";

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
  // Bumped after an edit/delete so both views reload their assignments.
  const [refreshKey, setRefreshKey] = useState(0);
  const canEdit = canEditSchedule(user);
  const allDivisions = useDivisions();

  // The URL says "field-tech", but the sidebar knows Field Tech (All) as
  // "field_tech". Setting the URL spelling made the sidebar hide the
  // Divisions list and Field Equipment link.
  const urlDivision = params.division as string | undefined;
  const sidebarDivision =
    urlDivision === "field-tech" ? "field_tech" : urlDivision;
  // Schedule data keeps using the URL spelling, as it always has, so
  // existing Field Tech (All) assignments still show.
  const scheduleDivision = urlDivision || division;

  useEffect(() => {
    if (sidebarDivision && sidebarDivision !== division) {
      setDivision(sidebarDivision);
    }
  }, [sidebarDivision, division, setDivision]);

  useEffect(() => {
    if (scheduleDivision) {
      // Every field tech division (including ones added from the sidebar) is neta.
      if (["calibration", "armadillo"].includes(scheduleDivision)) {
        setPortalType("lab");
      } else if (scheduleDivision === "scavenger") {
        setPortalType("scavenger");
      } else {
        setPortalType("neta");
      }
    }
  }, [scheduleDivision]);

  // Allow any authenticated user to access and edit the scheduler
  const canAccessScheduler = !!user;

  useEffect(() => {
    if (!user) {
      console.warn("User not logged in.");
      navigate("/portal");
    }
  }, [user, navigate]);

  if (!scheduleDivision || !user || !canAccessScheduler) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  // Field Tech (All) is a combined, read-only view with a card per city.
  const isFieldTechAll = sidebarDivision === "field_tech";
  // Same names the sidebar uses (e.g. "Decatur", not "North Alabama").
  const divisionLabel =
    allDivisions.find((d) => d.id === sidebarDivision)?.label ||
    scheduleDivision
      .split(/[_-]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

  const handleAssignmentClick = (assignment: TechnicianAssignment) => {
    setSelectedAssignment(assignment);
    setShowAssignmentDialog(true);
  };

  return (
    <PageLayout title={`${divisionLabel} Scheduling`}>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
            {divisionLabel} Scheduling
          </h1>
        </div>

        {/* Field Tech (All) is just shortcuts to each city's schedule. */}
        {isFieldTechAll ? (
          <DivisionScheduleCards refreshKey={refreshKey} />
        ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="flex h-auto w-full justify-start gap-2 rounded-none border-b border-neutral-200 bg-transparent p-0 dark:border-neutral-700 dark:bg-transparent">
            <TabsTrigger value="listed" className={UNDERLINE_TAB}>
              Listed View
            </TabsTrigger>
            <TabsTrigger value="calendar" className={UNDERLINE_TAB}>
              Calendar View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="mt-6">
            <TechnicianCalendar
              portalType={portalType}
              division={scheduleDivision}
              showAllTechnicians={true}
              onAssignmentClick={handleAssignmentClick}
              refreshKey={refreshKey}
              viewOnly={isFieldTechAll}
            />
          </TabsContent>

          <TabsContent value="listed" className="mt-6">
            <TechnicianListedView
              portalType={portalType}
              division={scheduleDivision}
              days={7}
              onAssignmentClick={handleAssignmentClick}
              refreshKey={refreshKey}
              allowAdd={!isFieldTechAll}
            />
          </TabsContent>
        </Tabs>
        )}

        <AssignmentDetailsDialog
          assignment={selectedAssignment}
          open={showAssignmentDialog}
          onOpenChange={setShowAssignmentDialog}
          canEdit={canEdit}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      </div>
    </PageLayout>
  );
}
