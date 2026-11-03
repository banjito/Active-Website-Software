import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { schedulingService } from "@/lib/services/schedulingService";
import {
  AvailableTechnician,
  PortalType,
  TechnicianAssignment,
} from "@/lib/types/scheduling";
import { supabase } from "@/lib/supabase";
import { useDemoMode } from "@/lib/DemoModeContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { employeeEmailRegex, employeeNameEmailRegex } from "@/lib/companyConfig";
import { useAuth } from "@/lib/AuthContext";
import { canEditSchedule } from "@/lib/roles";
import { useScheduleJobColors } from "@/components/scheduling/useScheduleJobColors";
import { JobColorSwatches } from "@/components/scheduling/JobColorSwatches";
import {
  formatTimeRange,
  mondayOf,
  unknownHoursEnd,
} from "@/lib/scheduleTime";
import { toast } from "@/components/ui/toast";
import { describeSupabaseError } from "@/lib/supabaseRetry";
import { ChevronLeft, ChevronRight, Minus, Plus, UserMinus } from "lucide-react";

type Props = {
  portalType: PortalType;
  division?: string;
  days?: number; // number of days to show (default 21)
  onAssignmentClick?: (assignment: TechnicianAssignment) => void;
  /** Bump to reload assignments (after an edit/delete in the details popup). */
  refreshKey?: number;
  /**
   * False on Field Tech (All): jobs are added from inside a division so
   * each one lands on the right city's schedule. Edit/delete still work.
   */
  allowAdd?: boolean;
};

export const TechnicianListedView: React.FC<Props> = ({
  portalType,
  division,
  days = 21,
  onAssignmentClick,
  refreshKey,
  allowAdd = true,
}) => {
  const { maskJobTitle } = useDemoMode();
  const { user } = useAuth();
  // Same rule the database uses for editing schedules (Admin or Scheduler).
  // Everyone else gets a read-only grid.
  const canEdit = canEditSchedule(user);
  const canAdd = canEdit && allowAdd;
  // People removed from this division's schedule (shared for everyone).
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [isHiddenMenuOpen, setIsHiddenMenuOpen] = useState<boolean>(false);
  // Weeks start on Monday.
  const [startDate, setStartDate] = useState<string>(() => mondayOf(dayjs()));
  const [today, setToday] = useState<string>(dayjs().format("YYYY-MM-DD"));
  const [qaSaving, setQaSaving] = useState<boolean>(false);
  const [technicians, setTechnicians] = useState<AvailableTechnician[]>([]);
  const [assignments, setAssignments] = useState<TechnicianAssignment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [techFilter, setTechFilter] = useState<string>("");
  const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]); // Multi-select technician filter
  const [isTechFilterOpen, setIsTechFilterOpen] = useState<boolean>(false);
  const [users, setUsers] = useState<
    Array<{ id: string; label: string; email?: string }>
  >([]);
  const [jobs, setJobs] = useState<Array<{ id: string; label: string }>>([]);

  // Quick-assign dialog state
  const [showQuickAssign, setShowQuickAssign] = useState<boolean>(false);
  const [qaSelectedTechnicians, setQaSelectedTechnicians] = useState<string[]>(
    [],
  );
  const [qaTechSearch, setQaTechSearch] = useState<string>("");
  const [qaJobSearch, setQaJobSearch] = useState<string>("");
  const [qaForm, setQaForm] = useState({
    jobId: "",
    startDate: "",
    endDate: "",
    startTime: "07:30",
    endTime: "16:00",
    isAllDay: true,
    unknownHours: false,
    notes: "",
    color: "#3b82f6", // Default blue color
  });

  // Job colors, shared by everyone (saved in the database)
  const { jobColors, setJobColor } = useScheduleJobColors(canEdit);

  // Update form color when job is selected
  useEffect(() => {
    if (qaForm.jobId && jobColors[qaForm.jobId]) {
      setQaForm((prev) => ({ ...prev, color: jobColors[qaForm.jobId] }));
    }
  }, [qaForm.jobId, jobColors]);

  // Generate visible dates left-to-right starting at startDate
  const dateList = useMemo(() => {
    const dates: string[] = [];
    const start = dayjs(startDate);
    for (let i = 0; i < days; i++) {
      dates.push(start.add(i, "day").format("YYYY-MM-DD"));
    }
    return dates;
  }, [startDate, days]);

  // At midnight: move the "today" highlight, and if the screen was on
  // the current week, follow into the new week.
  useEffect(() => {
    const msUntilMidnight = dayjs()
      .endOf("day")
      .add(1, "millisecond")
      .diff(dayjs());
    const t = setTimeout(() => {
      const prevWeek = mondayOf(dayjs(today));
      setToday(dayjs().format("YYYY-MM-DD"));
      setStartDate((cur) => (cur === prevWeek ? mondayOf(dayjs()) : cur));
    }, msUntilMidnight);
    return () => clearTimeout(t);
  }, [today]);

  // Load jobs for quick-assign options
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase
          .schema("neta_ops")
          .from("jobs")
          .select("id, job_number, title")
          .order("updated_at", { ascending: false })
          .limit(500);
        if (mounted && data) {
          setJobs(
            data.map((j: any) => ({
              id: j.id,
              label: `${j.job_number ?? ""} ${j.title ?? ""}`.trim(),
            })),
          );
        }
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [division]);

  // Keep job search and selected job synced both ways
  useEffect(() => {
    if (qaForm.jobId && jobs.length > 0) {
      const found = jobs.find((j) => String(j.id) === String(qaForm.jobId));
      if (found && !qaJobSearch) {
        setQaJobSearch(found.label);
      }
    }
  }, [qaForm.jobId, jobs]);

  // Persist last picked job across views
  useEffect(() => {
    try {
      if (qaForm.jobId || qaJobSearch) {
        localStorage.setItem(
          "sched_qa_last_job",
          JSON.stringify({ id: qaForm.jobId, label: qaJobSearch }),
        );
      }
    } catch {}
  }, [qaForm.jobId, qaJobSearch]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sched_qa_last_job");
      if (raw) {
        const o = JSON.parse(raw);
        if (o?.id) setQaForm((f) => ({ ...f, jobId: o.id }));
        if (o?.label) setQaJobSearch(o.label);
      }
    } catch {}
  }, []);

  // Fetch technicians
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data } = await schedulingService.getAvailableTechnicians(
          portalType,
          division,
        );
        if (mounted)
          setTechnicians(
            (data || []).reduce((acc: AvailableTechnician[], t) => {
              if (!acc.some((a) => a.user_id === t.user_id)) acc.push(t);
              return acc;
            }, []),
          );
      } catch (e) {
        if (mounted) setError("Failed to load technicians");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [portalType, division]);

  // Load people removed from this division's schedule
  useEffect(() => {
    let mounted = true;
    setHiddenIds(new Set());
    if (!division) return;
    (async () => {
      const { data, error } = await supabase
        .schema("common")
        .from("schedule_hidden_people")
        .select("user_id")
        .eq("division", division);
      if (error) {
        console.error("Failed to load removed people:", error);
        return;
      }
      if (mounted) setHiddenIds(new Set((data || []).map((r: any) => r.user_id)));
    })();
    return () => {
      mounted = false;
    };
  }, [division]);

  // Remove a person from (or add them back to) this division's schedule.
  // Optimistic: the row moves right away, and flips back if the save fails.
  const setPersonHidden = async (
    techId: string,
    name: string,
    hide: boolean,
    offerUndo = true,
  ) => {
    if (!division) return;
    const flip = (toHidden: boolean) =>
      setHiddenIds((prev) => {
        const next = new Set(prev);
        if (toHidden) next.add(techId);
        else next.delete(techId);
        return next;
      });
    flip(hide);
    const table = supabase.schema("common").from("schedule_hidden_people");
    const { error } = hide
      ? await table.upsert(
          { division, user_id: techId },
          { onConflict: "division,user_id", ignoreDuplicates: true },
        )
      : await table.delete().eq("division", division).eq("user_id", techId);
    if (error) {
      console.error("Failed to update schedule people:", error);
      flip(!hide);
      toast({
        title: hide ? `Couldn't remove ${name}` : `Couldn't add back ${name}`,
        description: describeSupabaseError(error),
        variant: "destructive",
      });
      return;
    }
    if (offerUndo) {
      toast({
        title: hide
          ? `Removed ${name} from this schedule`
          : `Added ${name} back`,
        variant: "success",
        duration: 8000,
        action: {
          label: "Undo",
          onClick: () => setPersonHidden(techId, name, !hide, false),
        },
      });
    }
  };

  // Fetch assignments for range (all technicians)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const start = dayListFirst(dateList);
        const end = dayListLast(dateList);
        const { data } = await schedulingService.getTechnicianAssignments(
          undefined,
          portalType,
          start,
          end,
          division,
        );
        if (mounted) setAssignments(data || []);
      } catch (e) {
        if (mounted) setError("Failed to load assignments");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [dateList, portalType, division]);

  // Reload assignments quietly (no spinner) after a save, edit, or delete.
  const reloadAssignments = async () => {
    const { data, error: loadErr } =
      await schedulingService.getTechnicianAssignments(
        undefined,
        portalType,
        dayListFirst(dateList),
        dayListLast(dateList),
        division,
      );
    if (loadErr) {
      console.error("Failed to reload assignments:", loadErr);
      return;
    }
    setAssignments(data || []);
  };
  useEffect(() => {
    if (refreshKey) reloadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Load users list to map IDs to names/email
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        let res = await supabase.rpc("admin_get_users");
        if (res.error) {
          res = await supabase.schema("common").rpc("admin_get_users");
        }
        if (!res.error && res.data && mounted) {
          // Deactivated staff never show on the schedule.
          const deactivated = await schedulingService.getDeactivatedUserIds();
          const mapped = res.data
            .filter((u: any) => !deactivated.has(u.id))
            .map((u: any) => ({
            id: u.id,
            label: (u.raw_user_meta_data?.name ?? u.email) as string,
            email: u.email as string,
          }));
          setUsers(mapped);
        }
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Helper functions to always derive name from email (firstname.lastname format)
  const deriveNameFromEmail = (email?: string | null): string | null => {
    if (!email) return null;
    const lower = String(email).toLowerCase();
    const m = lower.match(employeeNameEmailRegex);
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

  const techIdToName = useMemo(() => {
    const m = new Map<string, string>();
    // Admin users mapping - use email-derived names
    users.forEach((u) => {
      if (u.email) {
        m.set(u.id, formatDisplayName(u.label, u.email));
      }
    });
    // Technicians (availability) - use email-derived names
    technicians.forEach((t: any) => {
      if (t.email) {
        const candidate =
          typeof t.full_name === "string"
            ? t.full_name
            : t.full_name?.raw_user_meta_data?.name || t.full_name?.name;
        m.set(t.user_id, formatDisplayName(candidate, t.email));
      }
    });
    // Enrich from assignments - ONLY if they have email (most important/latest data)
    assignments.forEach((a) => {
      if (a.user?.email) {
        const metaName =
          a.user?.user_metadata?.name ||
          (a.user as any)?.raw_user_meta_data?.name;
        m.set(a.user_id, formatDisplayName(metaName, a.user.email));
        console.log(
          "[TechnicianListedView] Set name for",
          a.user_id,
          ":",
          formatDisplayName(metaName, a.user.email),
          "from email:",
          a.user.email,
        );
      } else {
        console.warn(
          "[TechnicianListedView] Assignment missing email for user:",
          a.user_id,
          a.user,
        );
      }
    });
    return m;
  }, [technicians, assignments, users]);

  const assignmentsByTechByDate = useMemo(() => {
    const map = new Map<string, Map<string, TechnicianAssignment[]>>();
    assignments.forEach((a) => {
      const tech = a.user_id;
      const date = a.assignment_date;
      if (!map.has(tech)) map.set(tech, new Map());
      const inner = map.get(tech)!;
      if (!inner.has(date)) inner.set(date, []);
      inner.get(date)!.push(a);
    });
    return map;
  }, [assignments]);

  // Build display technician list: union of availability list and any technicians with assignments
  const isAmp = (email?: string) => !!email && employeeEmailRegex.test(email);

  // Filter out lab technicians - only show NETA and admin technicians
  const isNotLabTech = (tech: any) => {
    const portalType = tech.portal_type || tech.division;
    return portalType !== "lab";
  };

  const displayTechs = useMemo(() => {
    const map = new Map<string, AvailableTechnician>();
    technicians
      .filter((t) => isAmp(t.email) && isNotLabTech(t))
      .forEach((t) => map.set(t.user_id, t));
    assignments.forEach((a) => {
      const assignmentPortalType = a.portal_type || a.division;
      if (
        !map.has(a.user_id) &&
        isAmp(a.user?.email || "") &&
        assignmentPortalType !== "lab"
      ) {
        map.set(a.user_id, {
          user_id: a.user_id,
          full_name:
            a.user?.user_metadata?.name ||
            (a.user as any)?.raw_user_meta_data?.name ||
            a.user?.email,
          email: a.user?.email || "",
          division,
          portal_type: portalType,
          day_of_week: 0,
          start_time: "00:00:00",
          end_time: "00:00:00",
        } as AvailableTechnician);
      }
    });
    // Include all known amp users even if they have no availability or assignments
    users.forEach((u) => {
      if (isAmp(u.email)) {
        const id = (u as any).id || "";
        if (id && !map.has(id)) {
          map.set(id, {
            user_id: id,
            full_name: u.label,
            email: u.email || "",
            division,
            portal_type: portalType,
            day_of_week: 0,
            start_time: "00:00:00",
            end_time: "00:00:00",
          } as AvailableTechnician);
        }
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      (a.full_name || a.email || "").localeCompare(
        b.full_name || b.email || "",
      ),
    );
  }, [technicians, assignments, division, portalType, users]);

  // Removed people stay hidden, except in weeks where they have a job
  // (so a scheduled job never silently disappears from the grid).
  const assignedIds = useMemo(
    () => new Set(assignments.map((a) => a.user_id)),
    [assignments],
  );
  const visibleTechs = useMemo(
    () =>
      displayTechs.filter(
        (t) => !hiddenIds.has(t.user_id) || assignedIds.has(t.user_id),
      ),
    [displayTechs, hiddenIds, assignedIds],
  );
  const hiddenTechs = useMemo(
    () => displayTechs.filter((t) => hiddenIds.has(t.user_id)),
    [displayTechs, hiddenIds],
  );

  const filteredTechs = useMemo(() => {
    let result = visibleTechs;

    // Apply multi-select filter
    if (selectedTechIds.length > 0) {
      result = result.filter((t) => selectedTechIds.includes(t.user_id));
    }

    // Apply search filter
    const q = techFilter.trim().toLowerCase();
    if (q) {
      result = result.filter((t) =>
        (t.full_name || t.email || "").toLowerCase().includes(q),
      );
    }

    return result;
  }, [visibleTechs, techFilter, selectedTechIds]);

  const goPrev = () =>
    setStartDate(dayjs(startDate).subtract(days, "day").format("YYYY-MM-DD"));
  const goNext = () =>
    setStartDate(dayjs(startDate).add(days, "day").format("YYYY-MM-DD"));
  const goToday = () => setStartDate(mondayOf(dayjs()));
  const rangeLabel = `${dayjs(dayListFirst(dateList)).format("MMM D")} - ${dayjs(dayListLast(dateList)).format("MMM D, YYYY")}`;
  const isCurrentWeek = dateList.includes(today);

  const qaTechOptions = visibleTechs.filter(
    (t) =>
      !qaTechSearch ||
      formatDisplayName(t.full_name, t.email)
        .toLowerCase()
        .includes(qaTechSearch.toLowerCase()),
  );
  const qaJobOptions = jobs.filter(
    (j) =>
      !qaJobSearch ||
      String(j.label).toLowerCase().includes(qaJobSearch.toLowerCase()),
  );

  // Why Save is greyed out (shown next to the button).
  const qaProblem = !qaForm.jobId
    ? "Pick a job."
    : qaSelectedTechnicians.length === 0
      ? "Pick at least one person."
      : !qaForm.startDate
        ? "Pick a start date."
        : qaForm.endDate && qaForm.endDate < qaForm.startDate
          ? "End date is before start date."
          : !qaForm.isAllDay &&
              !qaForm.unknownHours &&
              qaForm.endTime <= qaForm.startTime
            ? "End time must be after start time."
            : "";

  const handleQuickAssignSave = async () => {
    if (qaProblem || qaSaving) return;
    setQaSaving(true);
    try {
      if (qaForm.color) setJobColor(qaForm.jobId, qaForm.color);

      const days: string[] = [];
      let cur = dayjs(qaForm.startDate).startOf("day");
      const last = dayjs(qaForm.endDate || qaForm.startDate).startOf("day");
      while (!cur.isAfter(last)) {
        days.push(cur.format("YYYY-MM-DD"));
        cur = cur.add(1, "day");
      }

      const startTime = qaForm.isAllDay ? "00:00" : qaForm.startTime;
      const endTime = qaForm.isAllDay
        ? "23:59"
        : qaForm.unknownHours
          ? unknownHoursEnd(qaForm.startTime)
          : qaForm.endTime;

      const payloads = qaSelectedTechnicians.flatMap((tid) =>
        days.map((d) => ({
          user_id: tid,
          job_id: qaForm.jobId,
          assignment_date: d,
          start_time: startTime,
          end_time: endTime,
          status: "scheduled" as any,
          notes: qaForm.notes || undefined,
          portal_type: portalType,
          division: division,
        })),
      );

      const results = await Promise.all(
        payloads.map((p) =>
          schedulingService
            .saveTechnicianAssignment(p as any)
            .catch((e) => ({ data: null, error: e })),
        ),
      );
      const failed = results.filter((r) => r.error);
      await reloadAssignments();

      if (failed.length === 0) {
        const people = qaSelectedTechnicians.length;
        toast({
          title: `Assigned ${people} ${people === 1 ? "person" : "people"} for ${days.length} ${days.length === 1 ? "day" : "days"}`,
          variant: "success",
        });
        setShowQuickAssign(false);
      } else {
        console.error("Failed to save assignment(s):", failed);
        toast({
          title:
            failed.length === payloads.length
              ? "Couldn't save the assignment"
              : `Saved ${payloads.length - failed.length} of ${payloads.length}. ${failed.length} failed.`,
          description: describeSupabaseError(failed[0].error as any),
          variant: "destructive",
          duration: 10000,
        });
        // Dialog stays open so nothing typed is lost.
      }
    } finally {
      setQaSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Listed View</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-2 items-center">
              <Button
                variant="outline"
                className="h-9"
                onClick={goPrev}
                leftIcon={<ChevronLeft className="w-4 h-4" />}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                className="h-9"
                onClick={goToday}
                disabled={isCurrentWeek}
              >
                This Week
              </Button>
              <Button
                variant="outline"
                className="h-9"
                onClick={goNext}
                rightIcon={<ChevronRight className="w-4 h-4" />}
              >
                Next
              </Button>
              <span className="ml-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
                {rangeLabel}
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative w-64">
                <button
                  type="button"
                  onClick={() => setIsTechFilterOpen(!isTechFilterOpen)}
                  className="w-full h-9 px-3 text-left text-sm border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-dark-200 flex items-center justify-between"
                >
                  <span>
                    {selectedTechIds.length === 0
                      ? "All Technicians"
                      : `${selectedTechIds.length} Selected`}
                  </span>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {isTechFilterOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsTechFilterOpen(false)}
                    />
                    <div className="absolute z-50 mt-1 w-full max-h-80 overflow-auto border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 shadow-lg">
                      <div className="sticky top-0 bg-white dark:bg-dark-150 p-2 border-b border-neutral-200 dark:border-neutral-700">
                        <Input
                          placeholder="Search technician..."
                          value={techFilter}
                          onChange={(e) => setTechFilter(e.target.value)}
                          className="w-full"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const allIds = visibleTechs.map((t) => t.user_id);
                              setSelectedTechIds(allIds);
                            }}
                            className="flex-1 px-2 py-1 text-xs rounded-none border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-dark-200"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTechIds([]);
                            }}
                            className="flex-1 px-2 py-1 text-xs rounded-none border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-dark-200"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>
                      {visibleTechs
                        .filter(
                          (t) =>
                            !techFilter ||
                            (t.full_name || t.email || "")
                              .toLowerCase()
                              .includes(techFilter.toLowerCase()),
                        )
                        .map((tech) => {
                          const isSelected = selectedTechIds.includes(
                            tech.user_id,
                          );
                          const displayName = formatDisplayName(
                            tech.full_name,
                            tech.email,
                          );

                          const handleToggle = () => {
                            setSelectedTechIds((prev) =>
                              prev.includes(tech.user_id)
                                ? prev.filter((id) => id !== tech.user_id)
                                : [...prev, tech.user_id],
                            );
                          };

                          return (
                            <div
                              key={tech.user_id}
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-dark-200 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggle();
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleToggle();
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-none border-neutral-300 dark:border-neutral-600"
                              />
                              <span>{displayName}</span>
                            </div>
                          );
                        })}
                      {visibleTechs.length === 0 && (
                        <div className="px-3 py-2 text-sm text-neutral-500">
                          No technicians
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              {canEdit && !allowAdd && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Open a division above to add jobs
                </span>
              )}
              {!canEdit && (
                <span
                  className="text-xs text-neutral-500 dark:text-neutral-400"
                  title="Only Admins, Super Admins, and Schedulers can change the schedule."
                >
                  View only
                  {user?.user_metadata?.role
                    ? ` (your role: ${user.user_metadata.role})`
                    : ""}
                </span>
              )}
              {selectedTechIds.length > 0 && (
                <span className="text-xs px-2 py-1 rounded-none bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                  {selectedTechIds.length} filtered
                </span>
              )}
              {canEdit && hiddenTechs.length > 0 && (
                <div className="relative">
                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={() => setIsHiddenMenuOpen((o) => !o)}
                    leftIcon={<UserMinus className="w-4 h-4" />}
                  >
                    Removed ({hiddenTechs.length})
                  </Button>
                  {isHiddenMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsHiddenMenuOpen(false)}
                      />
                      <div className="absolute right-0 z-50 mt-1 w-72 max-h-80 overflow-auto border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 shadow-lg">
                        <div className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">
                          Hidden from this division's schedule
                        </div>
                        {hiddenTechs.map((t) => {
                          const n = formatDisplayName(t.full_name, t.email);
                          return (
                            <div
                              key={t.user_id}
                              className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-dark-200"
                            >
                              <span className="truncate">{n}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setPersonHidden(t.user_id, n, false)
                                }
                                className="shrink-0 text-xs font-medium text-brand hover:underline"
                              >
                                Add back
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="overflow-auto">
            <div className="min-w-[900px]">
              {/* Header row */}
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `240px repeat(${dateList.length}, minmax(120px, 1fr))`,
                }}
              >
                <div className="sticky left-0 z-10 bg-white dark:bg-dark-150 border border-neutral-200 dark:border-neutral-700 px-3 py-2 font-semibold">
                  Technician
                </div>
                {dateList.map((d) => {
                  const isToday = d === today;
                  return (
                    <div
                      key={d}
                      className={`border border-neutral-200 dark:border-neutral-700 text-center px-2 py-2 text-sm ${
                        isToday
                          ? "bg-brand/10 text-brand border-t-2 border-t-brand"
                          : isWeekend(d)
                            ? "bg-neutral-100 dark:bg-dark-100 text-neutral-500 dark:text-neutral-400"
                            : "bg-neutral-50 dark:bg-dark-200"
                      }`}
                    >
                      <div className="font-medium">
                        {isToday ? "Today" : dayjs(d).format("ddd")}
                      </div>
                      <div className="text-xs">
                        {dayjs(d).format(isToday ? "ddd MM/DD" : "MM/DD")}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rows */}
              {loading ? (
                <div className="p-6 text-center">
                  <LoadingSpinner size="md" />
                </div>
              ) : filteredTechs.length === 0 ? (
                <div className="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  No one to show. Clear the filter
                  {canEdit && hiddenTechs.length > 0
                    ? ", or add people back from Removed"
                    : ""}
                  .
                </div>
              ) : (
                filteredTechs.map((t) => {
                  const techId = t.user_id;
                  const name =
                    techIdToName.get(techId) ||
                    t.full_name ||
                    t.email ||
                    techId;
                  const rowMap = assignmentsByTechByDate.get(techId);
                  const isHidden = hiddenIds.has(techId);
                  const bookedDays = dateList.filter(
                    (d) => (rowMap?.get(d)?.length || 0) > 0,
                  ).length;
                  return (
                    <div
                      key={techId}
                      className="grid"
                      style={{
                        gridTemplateColumns: `240px repeat(${dateList.length}, minmax(120px, 1fr))`,
                      }}
                    >
                      <div
                        className="group sticky left-0 z-10 bg-white dark:bg-dark-150 border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm flex items-center gap-2 min-w-0"
                        title={
                          isHidden
                            ? "Removed from this schedule. Showing because they have a job this week."
                            : undefined
                        }
                      >
                        {canEdit && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPersonHidden(techId, name, !isHidden);
                            }}
                            className={`shrink-0 w-4 h-4 rounded-none flex items-center justify-center text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity ${
                              isHidden
                                ? "bg-neutral-500 hover:bg-neutral-600"
                                : "bg-red-600 hover:bg-red-700"
                            }`}
                            title={
                              isHidden
                                ? `Add ${name} back to this schedule`
                                : `Remove ${name} from this schedule`
                            }
                            aria-label={
                              isHidden
                                ? `Add ${name} back to this schedule`
                                : `Remove ${name} from this schedule`
                            }
                          >
                            {isHidden ? (
                              <Plus className="w-3 h-3" strokeWidth={3} />
                            ) : (
                              <Minus className="w-3 h-3" strokeWidth={3} />
                            )}
                          </button>
                        )}
                        <span
                          className={`truncate ${isHidden ? "italic text-neutral-400 dark:text-neutral-500" : ""}`}
                        >
                          {name}
                        </span>
                        {isHidden && (
                          <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                            Removed
                          </span>
                        )}
                        {bookedDays > 0 && (
                          <span
                            className="ml-auto shrink-0 text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400"
                            title={`Booked ${bookedDays} of ${dateList.length} days`}
                          >
                            {bookedDays}/{dateList.length}
                          </span>
                        )}
                      </div>
                      {dateList.map((d) => {
                        const list = rowMap?.get(d) || [];
                        const tint =
                          d === today
                            ? "bg-brand/5"
                            : isWeekend(d)
                              ? "bg-neutral-50 dark:bg-dark-200/60"
                              : "";
                        return (
                          <div
                            key={d}
                            className={`group/cell border border-neutral-200 dark:border-neutral-700 px-2 py-1 min-h-[44px] ${tint} ${
                              canAdd
                                ? "cursor-pointer hover:bg-neutral-100 dark:hover:bg-dark-100"
                                : ""
                            }`}
                            onClick={
                              canAdd
                                ? () => {
                                    setQaSelectedTechnicians([techId]);
                                    setQaForm((prev) => ({
                                      ...prev,
                                      startDate: d,
                                      endDate: d,
                                    }));
                                    setShowQuickAssign(true);
                                  }
                                : undefined
                            }
                            title={
                              canAdd
                                ? `Add a job for ${name} on ${dayjs(d).format("MMM D")}`
                                : undefined
                            }
                          >
                            {list.length === 0 ? (
                              canAdd ? (
                                <div className="w-full h-full min-h-[34px] flex items-center justify-center text-neutral-400 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                  <Plus className="w-4 h-4" />
                                </div>
                              ) : null
                            ) : (
                              <div className="flex flex-col gap-1">
                                {list
                                  .sort((a, b) =>
                                    a.start_time.localeCompare(b.start_time),
                                  )
                                  .map((a) => {
                                    const timeLabel = formatTimeRange(
                                      a.start_time,
                                      a.end_time,
                                    );
                                    const jobColor = a.job_id
                                      ? jobColors[a.job_id]
                                      : null;

                                    // Inline styles for job color with white text
                                    const colorStyles = jobColor
                                      ? {
                                          backgroundColor: jobColor,
                                          borderColor: jobColor,
                                          color: "#ffffff",
                                        }
                                      : {};

                                    return (
                                      <div
                                        key={a.id}
                                        title={`${maskJobTitle(a.job?.title) || ""}\nClick to view assignment details`}
                                        className={`text-[11px] px-2 py-1 rounded-none border overflow-hidden whitespace-nowrap text-ellipsis cursor-pointer hover:opacity-80 transition-opacity ${!jobColor ? "border-neutral-200 dark:border-neutral-600 bg-white dark:bg-dark-150" : ""}`}
                                        style={colorStyles}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (onAssignmentClick) {
                                            onAssignmentClick(a);
                                          }
                                        }}
                                      >
                                        <span className="font-medium">
                                          {a.job?.job_number || ""}
                                        </span>{" "}
                                        {maskJobTitle(a.job?.title) || ""}
                                        <span className="ml-1 opacity-70">
                                          {timeLabel}
                                        </span>
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Assign Dialog: landscape, three columns (who / what / when) */}
      <Dialog open={showQuickAssign} onOpenChange={setShowQuickAssign}>
        <DialogContent className="w-[min(1040px,95vw)] max-w-none">
          <DialogHeader>
            <DialogTitle>Quick Assign</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Who */}
            <div className="flex flex-col min-h-0">
              <div className="flex items-baseline justify-between mb-1">
                <label className="text-sm font-medium text-neutral-700 dark:text-white">
                  Technicians
                </label>
                {qaSelectedTechnicians.length > 0 && (
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {qaSelectedTechnicians.length} selected
                  </span>
                )}
              </div>
              <input
                type="text"
                placeholder="Search technicians..."
                value={qaTechSearch}
                onChange={(e) => setQaTechSearch(e.target.value)}
                className="mb-2 w-full p-2 border rounded-none bg-white dark:bg-dark-150 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white"
              />
              <div className="h-72 overflow-auto border rounded-none border-neutral-300 dark:border-neutral-700">
                {qaTechOptions.map((tech) => (
                  <label
                    key={tech.user_id}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-200"
                  >
                    <input
                      type="checkbox"
                      className="rounded-none"
                      checked={qaSelectedTechnicians.includes(tech.user_id)}
                      onChange={(e) => {
                        const id = tech.user_id;
                        setQaSelectedTechnicians((prev) =>
                          e.target.checked
                            ? [...prev, id]
                            : prev.filter((t) => t !== id),
                        );
                      }}
                    />
                    <span>{formatDisplayName(tech.full_name, tech.email)}</span>
                  </label>
                ))}
                {qaTechOptions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-neutral-500">
                    No matching technicians
                  </div>
                )}
              </div>
            </div>

            {/* What */}
            <div className="flex flex-col min-h-0">
              <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                Job
              </label>
              <input
                type="text"
                placeholder="Search jobs..."
                value={qaJobSearch}
                onChange={(e) => setQaJobSearch(e.target.value)}
                className="mb-2 w-full p-2 border rounded-none bg-white dark:bg-dark-150 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white"
              />
              <div className="h-44 overflow-auto border rounded-none border-neutral-300 dark:border-neutral-700">
                {qaJobOptions.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-dark-200 ${
                      qaForm.jobId === j.id
                        ? "bg-brand/10 text-brand font-medium"
                        : ""
                    }`}
                    onClick={() => {
                      setQaForm((prev) => ({ ...prev, jobId: j.id }));
                      setQaJobSearch(j.label);
                    }}
                  >
                    {j.label}
                  </button>
                ))}
                {qaJobOptions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-neutral-500">
                    No matching jobs
                  </div>
                )}
              </div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-white mt-4 mb-1">
                Job Color
              </label>
              <JobColorSwatches
                value={qaForm.color}
                onChange={(color) => setQaForm((prev) => ({ ...prev, color }))}
              />
              <span className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {qaForm.jobId && jobColors[qaForm.jobId]
                  ? "Using this job's saved color"
                  : "Color will be saved for this job"}
              </span>
            </div>

            {/* When */}
            <div className="flex flex-col min-h-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={qaForm.startDate}
                    onChange={(e) =>
                      setQaForm((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                    className="w-full p-2 border rounded-none bg-white dark:bg-dark-150 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={qaForm.endDate}
                    onChange={(e) =>
                      setQaForm((prev) => ({ ...prev, endDate: e.target.value }))
                    }
                    className="w-full p-2 border rounded-none bg-white dark:bg-dark-150 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={qaForm.startTime}
                    onChange={(e) =>
                      setQaForm((prev) => ({ ...prev, startTime: e.target.value }))
                    }
                    disabled={qaForm.isAllDay}
                    className="w-full p-2 border rounded-none bg-white dark:bg-dark-150 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={qaForm.endTime}
                    onChange={(e) =>
                      setQaForm((prev) => ({ ...prev, endTime: e.target.value }))
                    }
                    disabled={qaForm.unknownHours || qaForm.isAllDay}
                    className="w-full p-2 border rounded-none bg-white dark:bg-dark-150 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white disabled:opacity-50"
                  />
                </div>
              </div>
              <div className="mt-2 flex gap-4 text-sm text-neutral-700 dark:text-white">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="rounded-none"
                    checked={qaForm.isAllDay}
                    onChange={(e) =>
                      setQaForm((prev) => ({
                        ...prev,
                        isAllDay: e.target.checked,
                        unknownHours: e.target.checked ? false : prev.unknownHours,
                      }))
                    }
                  />
                  All Day
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="rounded-none"
                    checked={qaForm.unknownHours}
                    onChange={(e) =>
                      setQaForm((prev) => ({
                        ...prev,
                        unknownHours: e.target.checked,
                      }))
                    }
                    disabled={qaForm.isAllDay}
                  />
                  Unknown hours
                </label>
              </div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-white mt-4 mb-1">
                Notes
              </label>
              <Textarea
                value={qaForm.notes}
                onChange={(e) =>
                  setQaForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                className="w-full flex-1 min-h-[96px]"
                rows={4}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-4">
            {qaProblem && (
              <span className="mr-auto text-xs text-neutral-500 dark:text-neutral-400">
                {qaProblem}
              </span>
            )}
            <Button
              variant="outline"
              onClick={() => setShowQuickAssign(false)}
              disabled={qaSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleQuickAssignSave}
              disabled={!!qaProblem || qaSaving}
            >
              {qaSaving ? "Saving..." : "Save Assignment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

function isWeekend(d: string): boolean {
  const day = dayjs(d).day();
  return day === 0 || day === 6;
}

function dayListFirst(list: string[]): string {
  return list.length ? list[0] : dayjs().format("YYYY-MM-DD");
}

function dayListLast(list: string[]): string {
  return list.length ? list[list.length - 1] : dayjs().format("YYYY-MM-DD");
}

export default TechnicianListedView;
