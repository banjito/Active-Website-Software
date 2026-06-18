import React, { useState, useEffect, useCallback, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import { EventClickArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  CalendarEvent,
  TechnicianAssignment,
  TechnicianException,
  PortalType,
  AssignmentStatus,
  AvailableTechnician,
} from "@/lib/types/scheduling";
import { schedulingService } from "@/lib/services/schedulingService";
import { useAuth } from "@/lib/AuthContext";
import { useDemoMode } from "@/lib/DemoModeContext";
import { UserData, User } from "@/lib/types/auth";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Select, { SelectOption } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { supabase } from "@/lib/supabase";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import dayjs from "dayjs";

interface TechnicianCalendarProps {
  portalType: PortalType;
  division?: string;
  onAssignmentClick?: (assignment: TechnicianAssignment) => void;
  onDateClick?: (date: Date) => void;
  onAddAvailability?: () => void;
  onAddException?: (date: Date) => void;
  selectedTechnician?: string;
  viewOnly?: boolean;
  showAllTechnicians?: boolean;
}

export function TechnicianCalendar({
  portalType,
  division,
  onAssignmentClick,
  onDateClick,
  onAddAvailability,
  onAddException,
  selectedTechnician,
  viewOnly = false,
  showAllTechnicians = true,
}: TechnicianCalendarProps) {
  const { user } = useAuth();
  const { maskJobTitle } = useDemoMode();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [technicians, setTechnicians] = useState<AvailableTechnician[]>([]);
  const [filteredTechnician, setFilteredTechnician] = useState<
    string | undefined
  >(selectedTechnician);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<
    "dayGridMonth" | "timeGridWeek" | "timeGridDay"
  >("dayGridMonth");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [schemaError, setSchemaError] = useState<boolean>(false);
  const [currentMonthLabel, setCurrentMonthLabel] = useState<string>(
    dayjs().format("MMMM YYYY"),
  );
  const [currentDate, setCurrentDate] = useState<Date>(dayjs().toDate());
  const calendarRef = useRef<any>(null);
  const [monthPicker, setMonthPicker] = useState<string>(
    dayjs().format("YYYY-MM"),
  );
  const [reloadKey, setReloadKey] = useState<number>(0);

  // Main-view filters (persist)
  const [mainFilterTechId, setMainFilterTechId] = useState<string>("");
  const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]); // Multi-select technician filter
  const [mainFilterJobId, setMainFilterJobId] = useState<string>("");
  const [techSearch, setTechSearch] = useState<string>("");
  const [jobSearchMain, setJobSearchMain] = useState<string>("");
  const [isTechFocused, setIsTechFocused] = useState<boolean>(false);
  const [isJobFocused, setIsJobFocused] = useState<boolean>(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sched_main_filters_v1");
      if (raw) {
        const o = JSON.parse(raw);
        if (o.tech) setMainFilterTechId(o.tech);
        if (o.job) setMainFilterJobId(o.job);
        if (o.techName) setTechSearch(o.techName);
        if (o.jobName) setJobSearchMain(o.jobName);
        if (o.selectedTechs && Array.isArray(o.selectedTechs))
          setSelectedTechIds(o.selectedTechs);
      }
    } catch {}
  }, []);
  const saveMainFilters = () =>
    localStorage.setItem(
      "sched_main_filters_v1",
      JSON.stringify({
        tech: mainFilterTechId,
        job: mainFilterJobId,
        techName: techSearch,
        jobName: jobSearchMain,
        selectedTechs: selectedTechIds,
      }),
    );
  const clearMainFilters = () => {
    setMainFilterTechId("");
    setMainFilterJobId("");
    setTechSearch("");
    setJobSearchMain("");
    setSelectedTechIds([]);
    localStorage.removeItem("sched_main_filters_v1");
  };

  // Quick assignment dialog state (restored)
  const [showQuickAssign, setShowQuickAssign] = useState<boolean>(false);
  const [users, setUsers] = useState<
    Array<{ id: string; label: string; email?: string }>
  >([]);
  const [userSearch, setUserSearch] = useState<string>("");
  const [jobSearch, setJobSearch] = useState<string>("");
  const [jobs, setJobs] = useState<Array<{ id: string; label: string }>>([]);
  const [qaForm, setQaForm] = useState({
    technicianId: "",
    jobId: "",
    startDate: "",
    endDate: "",
    startTime: "07:30",
    endTime: "16:00",
    unknownHours: false,
    isAllDay: true,
    notes: "",
    color: "#3b82f6", // Default blue color
  });
  const [qaSelectedTechnicians, setQaSelectedTechnicians] = useState<string[]>(
    [],
  );
  const [qaTechSearch, setQaTechSearch] = useState<string>("");
  const [qaJobSearch, setQaJobSearch] = useState<string>("");
  const [qaJobOpen, setQaJobOpen] = useState<boolean>(false);

  // Store job colors (persisted in localStorage) - Initialize directly from localStorage
  const [jobColors, setJobColors] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("calendar_job_colors");
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error("Error loading job colors:", error);
      return {};
    }
  });

  // Save job colors to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem("calendar_job_colors", JSON.stringify(jobColors));
    } catch (error) {
      console.error("Error saving job colors:", error);
    }
  }, [jobColors]);

  // Update form color when job is selected
  useEffect(() => {
    if (qaForm.jobId && jobColors[qaForm.jobId]) {
      setQaForm((prev) => ({ ...prev, color: jobColors[qaForm.jobId] }));
    }
  }, [qaForm.jobId, jobColors]);

  // Schedule summary dialog state
  const [showDaySchedule, setShowDaySchedule] = useState<boolean>(false);
  const [dayScheduleStart, setDayScheduleStart] = useState<string>("");
  const [dayScheduleEnd, setDayScheduleEnd] = useState<string>("");
  const [showGroupManage, setShowGroupManage] = useState<boolean>(false);
  const [groupEvent, setGroupEvent] = useState<CalendarEvent | null>(null);
  const [gmSelectedTechnicians, setGmSelectedTechnicians] = useState<string[]>(
    [],
  );
  const [gmTechSearch, setGmTechSearch] = useState<string>("");
  const [gmStartTime, setGmStartTime] = useState<string>("07:30");
  const [gmEndTime, setGmEndTime] = useState<string>("16:00");
  const [gmUnknownHours, setGmUnknownHours] = useState<boolean>(false);
  const [showRemoveScope, setShowRemoveScope] = useState<boolean>(false);
  const [removeScopeEvent, setRemoveScopeEvent] =
    useState<CalendarEvent | null>(null);

  // Determine if a job has additional future days beyond the selected event date
  const hasFutureJobDays = useCallback(
    (jobId?: string, fromISO?: string) => {
      if (!jobId || !fromISO) return false;
      const fromDay = dayjs(fromISO).startOf("day");
      return events.some(
        (ev) =>
          ev.job?.id === jobId &&
          dayjs(ev.start).startOf("day").isAfter(fromDay),
      );
    },
    [events],
  );

  // Handle calendar range changes
  const handleDatesSet = useCallback(
    ({ start, end }: { start: Date; end: Date }) => {
      const formattedStart = dayjs(start).format("YYYY-MM-DD");
      const formattedEnd = dayjs(end).format("YYYY-MM-DD");
      if (formattedStart !== startDate || formattedEnd !== endDate) {
        setStartDate(formattedStart);
        setEndDate(formattedEnd);
      }
      // Derive a stable month label (use mid-range to avoid previous/next overlap)
      const mid = dayjs(start).add(15, "day");
      setCurrentMonthLabel(mid.format("MMMM YYYY"));
      setMonthPicker(mid.format("YYYY-MM"));
      setCurrentDate(mid.toDate());
    },
    [startDate, endDate],
  );

  // Fetch available technicians
  useEffect(() => {
    const fetchTechnicians = async () => {
      setLoading(true);
      setError(null);
      setSchemaError(false);
      try {
        if (showAllTechnicians) {
          try {
            const { data, error } =
              await schedulingService.getAvailableTechnicians(
                portalType,
                division,
              );
            if (error) {
              console.warn(
                "Available technicians view not yet created in database. Using fallback.",
                error,
              );
              // Set schema error flag to true to show notification
              setSchemaError(true);
              // If the available_technicians view doesn't exist yet, we'll use a fallback
              if (user) {
                const fallbackTechnicians: AvailableTechnician[] = [
                  {
                    user_id: user.id,
                    full_name: user.user_metadata?.name || "Current User",
                    email: user.email ?? "",
                    division: user.user_metadata?.division || division,
                    portal_type: portalType,
                    day_of_week: 0,
                    start_time: "08:00:00",
                    end_time: "17:00:00",
                  },
                ];
                setTechnicians(fallbackTechnicians);
              }
            } else {
              setTechnicians(data || []);
            }
          } catch (err) {
            console.warn("Error fetching technicians, using fallback:", err);
            setSchemaError(true);
            // Setup fallback data
            if (user) {
              const fallbackTechnicians: AvailableTechnician[] = [
                {
                  user_id: user.id,
                  full_name: user.user_metadata?.name || "Current User",
                  email: user.email ?? "",
                  division: user.user_metadata?.division || division,
                  portal_type: portalType,
                  day_of_week: 0,
                  start_time: "08:00:00",
                  end_time: "17:00:00",
                },
              ];
              setTechnicians(fallbackTechnicians);
            }
          }
        } else {
          if (user) {
            const currentUserAsTechnician: AvailableTechnician = {
              user_id: user.id,
              full_name: user.user_metadata?.name,
              email: user.email ?? "",
              division: user.user_metadata?.division,
              portal_type: portalType,
              day_of_week: 0,
              start_time: "00:00:00",
              end_time: "00:00:00",
            };
            setTechnicians([currentUserAsTechnician]);
            if (!filteredTechnician) {
              setFilteredTechnician(user.id);
            }
          }
        }
      } catch (err) {
        console.error("Error fetching technicians:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch technicians",
        );
        setSchemaError(true);

        // Still provide fallback data even in case of error
        if (user) {
          const fallbackTechnicians: AvailableTechnician[] = [
            {
              user_id: user.id,
              full_name: user.user_metadata?.name || "Current User",
              email: user.email ?? "",
              division: user.user_metadata?.division || division,
              portal_type: portalType,
              day_of_week: 0,
              start_time: "08:00:00",
              end_time: "17:00:00",
            },
          ];
          setTechnicians(fallbackTechnicians);
          if (!filteredTechnician) {
            setFilteredTechnician(user.id);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTechnicians();
  }, [user, showAllTechnicians, portalType, division, filteredTechnician]);

  // Load full users list for filters/name enrichment (uses existing admin RPC)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Try public RPC first
        let res = await supabase.rpc("admin_get_users");
        if (res.error) {
          // Some projects host the RPC under common
          res = await supabase.schema("common").rpc("admin_get_users");
        }
        if (!res.error && res.data && mounted) {
          const mapped = res.data.map((u: any) => ({
            id: u.id,
            label: (u.raw_user_meta_data?.name ?? u.email) as string,
            email: u.email as string,
          }));
          setUsers(mapped);
          return;
        }
      } catch {}
      // Fallback to technicians (at least current user appears)
      if (mounted && technicians && technicians.length > 0) {
        setUsers(
          technicians.map((t) => ({
            id: t.user_id,
            label: t.full_name || t.email || t.user_id,
            email: t.email,
          })),
        );
      }
    })();
    return () => {
      mounted = false;
    };
  }, [technicians]);

  // Load jobs for filter/options and quick-assign
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

  // Fetch calendar data when date range or technician changes
  useEffect(() => {
    const fetchCalendarData = async () => {
      if (!startDate || !endDate) return;

      setLoading(true);
      setError(null);

      try {
        try {
          const { data: assignments, error: assignmentsError } =
            await schedulingService.getTechnicianAssignments(
              filteredTechnician,
              portalType,
              startDate,
              endDate,
              division,
            );

          if (assignmentsError) {
            console.warn(
              "Error fetching assignments, likely schema issue:",
              assignmentsError,
            );
            setSchemaError(true);
            // Continue with empty assignments array
            setEvents([]);
          } else {
            // Enrich assignment user details from technicians/users to avoid "Unknown" labels
            const techMap = new Map<
              string,
              { name?: string; email?: string }
            >();
            technicians.forEach((t) =>
              techMap.set(t.user_id, {
                name: t.full_name || undefined,
                email: t.email || undefined,
              }),
            );
            const userMap = new Map<
              string,
              { name?: string; email?: string }
            >();
            users.forEach((u) =>
              userMap.set(u.id, { name: u.label, email: u.email || undefined }),
            );
            const enrichedAssignments = (assignments || []).map((a) => {
              const hasName = !!(a as any)?.user?.user_metadata?.name;
              const hasEmail = !!(a as any)?.user?.email;
              if (!hasName || !hasEmail) {
                const info = techMap.get(a.user_id) || userMap.get(a.user_id);
                if (info) {
                  return {
                    ...a,
                    user: {
                      id: a.user_id,
                      email: info.email,
                      user_metadata: { name: info.name },
                    } as unknown as User,
                  };
                }
              }
              return a;
            });

            let exceptions: TechnicianException[] = [];
            if (filteredTechnician) {
              try {
                const { data: exceptionsData, error: exceptionsError } =
                  await schedulingService.getTechnicianExceptions(
                    filteredTechnician,
                    portalType,
                    startDate,
                    endDate,
                  );

                if (exceptionsError) {
                  console.warn(
                    "Error fetching exceptions, likely schema issue:",
                    exceptionsError,
                  );
                  // Continue with empty exceptions array
                } else {
                  exceptions = exceptionsData || [];
                }
              } catch (exceptionsErr) {
                console.warn("Error in exceptions fetch:", exceptionsErr);
                // Continue with empty exceptions array
              }
            }

            const calendarEvents = schedulingService.convertToCalendarEvents(
              enrichedAssignments || [],
              exceptions,
            );

            // Apply job colors to events
            const eventsWithColors = calendarEvents.map((event) => {
              if (event.job?.id && jobColors[event.job.id]) {
                const jobColor = jobColors[event.job.id];
                return {
                  ...event,
                  color: jobColor,
                  backgroundColor: jobColor,
                  borderColor: jobColor,
                };
              }
              return event;
            });

            setEvents(eventsWithColors);
          }
        } catch (err) {
          console.warn("Database error in assignments fetch:", err);
          setSchemaError(true);
          setEvents([]);
        }
      } catch (err) {
        console.error("Error fetching calendar data:", err);
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCalendarData();
  }, [
    startDate,
    endDate,
    filteredTechnician,
    portalType,
    division,
    users,
    technicians,
    reloadKey,
    jobColors,
  ]);

  // Handle event click with specific type
  const handleEventClick = (clickInfo: EventClickArg) => {
    const eventId = clickInfo.event.id;
    // Find the original CalendarEvent from our state
    const sourceEvent = events.find((event) => event.id === eventId);

    if (sourceEvent?.source === "assignment" && onAssignmentClick) {
      // Ensure the data needed for TechnicianAssignment exists
      if (sourceEvent.technician && sourceEvent.job) {
        // Construct the object matching TechnicianAssignment more closely
        const techAssignment: TechnicianAssignment = {
          id: eventId.replace("assignment-", ""),
          user_id: sourceEvent.technician.id,
          job_id: sourceEvent.job.id,
          assignment_date: dayjs(sourceEvent.start).format("YYYY-MM-DD"),
          start_time: dayjs(sourceEvent.start).format("HH:mm:ss"),
          end_time: sourceEvent.end
            ? dayjs(sourceEvent.end).format("HH:mm:ss")
            : dayjs(sourceEvent.start).add(1, "hour").format("HH:mm:ss"), // Handle null end time
          status: sourceEvent.status ?? "scheduled", // Use nullish coalescing
          notes: undefined, // Add optional fields as undefined if not available
          portal_type: portalType,
          division: division,
          created_at: "", // Placeholder or fetch actual value
          updated_at: "", // Placeholder or fetch actual value
          created_by: undefined, // Add optional fields as undefined
          // Reconstruct nested objects carefully
          user: sourceEvent.technician
            ? ({
                id: sourceEvent.technician.id,
                // Add other User fields as needed, potentially fetching them
                email: undefined,
                user_metadata: { name: sourceEvent.technician.name },
              } as User)
            : undefined, // Cast to User type if needed
          job: sourceEvent.job
            ? {
                id: sourceEvent.job.id,
                job_number: sourceEvent.job.number,
                title: maskJobTitle(sourceEvent.job.title),
                // Add other Job fields as needed, potentially fetching them
                status: "pending", // Placeholder
                division: division,
                customer_id: "",
                created_at: "",
                updated_at: "",
              }
            : undefined,
          createdBy: undefined, // Add optional fields as undefined
        };

        onAssignmentClick(techAssignment);
      }
    }
    if (sourceEvent?.source === "assignment_group") {
      setGroupEvent(sourceEvent);
      setShowGroupManage(true);
      try {
        setGmStartTime(dayjs(sourceEvent.start).format("HH:mm"));
        setGmEndTime(dayjs(sourceEvent.end).format("HH:mm"));
        setGmSelectedTechnicians([]);
        setGmTechSearch("");
        setGmUnknownHours(false);
      } catch {}
      return;
    }
    // Handle exception click if needed
  };

  // Helper to open a day (delegate to parent if provided, otherwise open summary dialog)
  const openDay = (date: Date) => {
    if (onDateClick) {
      onDateClick(date);
      return;
    }
    const clicked = dayjs(date).format("YYYY-MM-DD");
    setDayScheduleStart(clicked);
    setDayScheduleEnd(clicked);
    setShowDaySchedule(true);
  };

  // Show schedule summary on day click
  const handleDateClick = (arg: any) => {
    openDay(arg.date);
  };

  const handleSelectRange = (info: any) => {
    const start = dayjs(info.start).format("YYYY-MM-DD");
    const endExclusive = dayjs(info.end);
    const end = (
      info.allDay ? endExclusive.subtract(1, "day") : endExclusive
    ).format("YYYY-MM-DD");
    if (onDateClick) {
      // For parent handlers, just open the first day to keep UX simple
      openDay(info.start);
      return;
    }
    setDayScheduleStart(start);
    setDayScheduleEnd(end);
    setShowDaySchedule(true);
  };

  // Remove an event from summary
  const handleRemoveEvent = async (eventId: string) => {
    try {
      if (eventId.startsWith("assignment-")) {
        const id = eventId.replace("assignment-", "");
        const { error } =
          await schedulingService.deleteTechnicianAssignment(id);
        if (error) throw error;
      } else if (eventId.startsWith("exception-")) {
        const id = eventId.replace("exception-", "");
        const { error } = await schedulingService.deleteTechnicianException(id);
        if (error) throw error;
      }
      setReloadKey((k) => k + 1);
    } catch (err) {
      console.error("Remove event failed:", err);
    }
  };

  const handleRemoveGroupAll = async (ev: CalendarEvent) => {
    try {
      const ids = (ev.technicians || [])
        .map((t) => t.assignment_id)
        .filter(Boolean) as string[];
      await Promise.all(
        ids.map((id) => schedulingService.deleteTechnicianAssignment(id)),
      );
      setShowGroupManage(false);
      setGroupEvent(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      console.error("Remove group failed:", err);
    }
  };

  const handleRemoveGroupOne = async (assignmentId?: string) => {
    if (!assignmentId) return;
    try {
      const { error } =
        await schedulingService.deleteTechnicianAssignment(assignmentId);
      if (error) throw error;
      // Update local group dialog state
      setGroupEvent((prev) => {
        if (!prev) return prev;
        const remaining = (prev.technicians || []).filter(
          (t) => t.assignment_id !== assignmentId,
        );
        return { ...prev, technicians: remaining } as CalendarEvent;
      });
      setReloadKey((k) => k + 1);
    } catch (err) {
      console.error("Remove technician from group failed:", err);
    }
  };

  const handleAddTechsToGroup = async () => {
    if (!groupEvent || !groupEvent.job?.id) return;
    const jobId = groupEvent.job.id;
    const date = dayjs(groupEvent.start).format("YYYY-MM-DD");
    const startTime = gmStartTime;
    const endTime = gmUnknownHours ? gmStartTime : gmEndTime;
    const assigned = new Set(
      (groupEvent.technicians || []).map((t) => String(t.id)),
    );
    const toAdd = gmSelectedTechnicians.filter(
      (id) => !assigned.has(String(id)),
    );
    if (toAdd.length === 0) return;
    try {
      await Promise.all(
        toAdd.map((tid) =>
          schedulingService.saveTechnicianAssignment({
            user_id: tid,
            job_id: jobId,
            assignment_date: date,
            start_time: startTime,
            end_time: endTime,
            status: "scheduled" as AssignmentStatus,
            notes: undefined,
            portal_type: portalType,
            division: division,
          }),
        ),
      );
      setShowGroupManage(false);
      setGroupEvent(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      console.error("Add technicians to group failed:", err);
      setError(
        err instanceof Error ? err.message : "Failed to add technicians",
      );
    }
  };

  // Handle adding an exception (keep as is)
  const handleAddException = (date: Date) => {
    if (!viewOnly && onAddException) {
      onAddException(date);
    }
  };

  // Prepare options for the Select component
  // Build technician options from availability + users (admin list) + any technicians present in current events
  const isAmpEmail = (email?: string | null) =>
    !!email && /@ampqes\.com$/i.test(String(email));
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

  // Filter out lab technicians - only show NETA and admin technicians
  const isNotLabTech = (tech: any) => {
    const portalType = tech.portal_type || tech.division;
    return portalType !== "lab";
  };

  const baseTechOpts: SelectOption[] = technicians
    .filter((tech) => isAmpEmail(tech.email) && isNotLabTech(tech))
    .map((tech) => ({
      value: tech.user_id,
      label: formatDisplayName(tech.full_name || undefined, tech.email),
    }));
  const adminUserOpts: SelectOption[] = users
    .filter((u) => isAmpEmail(u.email))
    .map((u) => ({ value: u.id, label: formatDisplayName(u.label, u.email) }));
  const eventTechMap = new Map<string, string>();
  const allowedIds = new Set<string>([
    ...technicians
      .filter((t) => isAmpEmail(t.email) && isNotLabTech(t))
      .map((t) => String(t.user_id)),
    ...users.filter((u) => isAmpEmail(u.email)).map((u) => String(u.id)),
  ]);
  events.forEach((ev) => {
    if (ev.technician?.id && allowedIds.has(String(ev.technician.id))) {
      const label = ev.technician.name || ev.technician.id.slice(0, 8);
      eventTechMap.set(ev.technician.id, label);
    }
  });
  const mergedTechOpts: SelectOption[] = [...baseTechOpts];
  // Merge in admin users (avoid duplicates)
  adminUserOpts.forEach((opt) => {
    if (!mergedTechOpts.some((o) => String(o.value) === String(opt.value))) {
      mergedTechOpts.push(opt);
    }
  });
  eventTechMap.forEach((label, id) => {
    if (!mergedTechOpts.some((o) => String(o.value) === id)) {
      mergedTechOpts.push({ value: id, label });
    }
  });
  const technicianOptionsAll: SelectOption[] = [
    { value: "", label: "All Technicians" },
    ...mergedTechOpts,
  ];
  const technicianOptions: SelectOption[] = technicianOptionsAll.filter(
    (o) =>
      !techSearch ||
      String(o.label).toLowerCase().includes(techSearch.toLowerCase()),
  );
  const jobOptions: SelectOption[] = [
    { value: "", label: "All Jobs" },
    ...jobs.map((j) => ({ value: j.id, label: j.label })),
  ];
  const jobOptionsFiltered: SelectOption[] = jobOptions.filter(
    (o) =>
      !jobSearchMain ||
      String(o.label).toLowerCase().includes(jobSearchMain.toLowerCase()),
  );

  // After users/jobs are loaded, backfill search boxes from saved IDs if names missing
  useEffect(() => {
    if (mainFilterTechId && !techSearch) {
      const found = technicianOptionsAll.find(
        (o) => String(o.value) === String(mainFilterTechId),
      );
      if (found) setTechSearch(String(found.label));
    }
  }, [technicianOptionsAll, mainFilterTechId]);
  useEffect(() => {
    if (mainFilterJobId && !jobSearchMain) {
      const found = jobOptions.find(
        (o) => String(o.value) === String(mainFilterJobId),
      );
      if (found) setJobSearchMain(String(found.label));
    }
  }, [jobOptions, mainFilterJobId]);

  // Keep QA job search and selected QA job synced both ways
  useEffect(() => {
    if (qaForm.jobId && jobs.length > 0) {
      const found = jobs.find((j) => String(j.id) === String(qaForm.jobId));
      if (found && !qaJobSearch) {
        setQaJobSearch(found.label);
      }
    }
  }, [qaForm.jobId, jobs]);

  // Persist last picked QA job across views
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
        if (o?.id) setQaForm((prev) => ({ ...prev, jobId: o.id }));
        if (o?.label) setQaJobSearch(o.label);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quick-assign save handler
  const handleQuickAssignSave = async () => {
    try {
      const techIds = qaSelectedTechnicians.length
        ? qaSelectedTechnicians
        : qaForm.technicianId
          ? [qaForm.technicianId]
          : [];
      if (techIds.length === 0 || !qaForm.jobId || !qaForm.startDate) return;

      // Store the job color
      if (qaForm.jobId && qaForm.color) {
        setJobColors((prev) => ({
          ...prev,
          [qaForm.jobId]: qaForm.color,
        }));
      }

      const start = dayjs(qaForm.startDate);
      const end = qaForm.endDate ? dayjs(qaForm.endDate) : start;
      const days: string[] = [];
      let cur = start.startOf("day");
      const last = end.startOf("day");
      while (cur.isBefore(last) || cur.isSame(last)) {
        days.push(cur.format("YYYY-MM-DD"));
        cur = cur.add(1, "day");
      }

      const startTimeToUse = qaForm.isAllDay ? "00:00" : qaForm.startTime;
      const endTimeToUse = qaForm.isAllDay
        ? "23:59"
        : qaForm.unknownHours
          ? qaForm.startTime
          : qaForm.endTime;

      const payloads = techIds.flatMap((tid) =>
        days.map((d) => ({
          user_id: tid,
          job_id: qaForm.jobId,
          assignment_date: d,
          start_time: startTimeToUse,
          end_time: endTimeToUse,
          status: "scheduled" as AssignmentStatus,
          notes: qaForm.notes || undefined,
          portal_type: portalType,
          division: division,
        })),
      );
      await Promise.all(
        payloads.map((p) => schedulingService.saveTechnicianAssignment(p)),
      );
      setShowQuickAssign(false);
      setShowDaySchedule(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      console.error("Quick assign save failed:", err);
      setError(
        err instanceof Error ? err.message : "Failed to save assignment",
      );
    }
  };

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="p-4">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Calendar className="h-5 w-5" />
            Technician Schedule{division && ` - ${division}`}
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 pr-3 mr-2 border-r dark:border-zinc-700">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  calendarRef.current?.getApi().prev();
                }}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  calendarRef.current?.getApi().today();
                  setCurrentDate(dayjs().toDate());
                }}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  calendarRef.current?.getApi().next();
                }}
              >
                Next
              </Button>
              <span className="ml-1 text-sm font-medium text-zinc-800 dark:text-white">
                {currentMonthLabel}
              </span>
              <input
                type="month"
                value={monthPicker}
                onChange={(e) => {
                  setMonthPicker(e.target.value);
                  const dt = dayjs(`${e.target.value}-01`).toDate();
                  setCurrentDate(dt);
                  calendarRef.current?.getApi().gotoDate(dt);
                }}
                className="ml-2 border border-zinc-300 dark:border-zinc-600 rounded px-2 py-1 text-sm bg-white dark:bg-dark-150 text-zinc-900 dark:text-white"
              />
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTechFocused(!isTechFocused)}
                className="w-[280px] px-3 py-2 text-left text-sm border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-dark-150 text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-dark-200 flex items-center justify-between"
              >
                <span>
                  {selectedTechIds.length === 0
                    ? "All Technicians"
                    : `${selectedTechIds.length} Technician${selectedTechIds.length > 1 ? "s" : ""} Selected`}
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
              {isTechFocused && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsTechFocused(false)}
                  />
                  <div className="absolute z-50 mt-1 w-full max-h-80 overflow-auto border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-dark-150 shadow-lg">
                    <div className="sticky top-0 bg-white dark:bg-dark-150 p-2 border-b border-zinc-200 dark:border-zinc-700">
                      <Input
                        placeholder="Search technician..."
                        value={techSearch}
                        onChange={(e) => setTechSearch(e.target.value)}
                        className="w-full"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const allTechIds = mergedTechOpts
                              .map((opt) => String(opt.value))
                              .filter((id) => id);
                            setSelectedTechIds(allTechIds);
                          }}
                          className="flex-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTechIds([]);
                          }}
                          className="flex-1 px-2 py-1 text-xs bg-zinc-500 text-white rounded hover:bg-zinc-600"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>
                    {technicianOptions.map((opt) => {
                      const techId = String(opt.value);
                      const isSelected = selectedTechIds.includes(techId);

                      const handleToggle = () => {
                        if (techId === "") {
                          // "All Technicians" option - clear selection
                          setSelectedTechIds([]);
                        } else {
                          setSelectedTechIds((prev) =>
                            prev.includes(techId)
                              ? prev.filter((id) => id !== techId)
                              : [...prev, techId],
                          );
                        }
                      };

                      return (
                        <div
                          key={techId}
                          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-dark-200 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggle();
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={
                              techId === ""
                                ? selectedTechIds.length === 0
                                : isSelected
                            }
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggle();
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-zinc-300 dark:border-zinc-600"
                          />
                          <span>{String(opt.label)}</span>
                        </div>
                      );
                    })}
                    {technicianOptions.length === 0 && (
                      <div className="px-3 py-2 text-sm text-zinc-500">
                        No technicians
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="relative">
              <Input
                placeholder="Search job..."
                value={jobSearchMain}
                onChange={(e) => setJobSearchMain(e.target.value)}
                onFocus={() => setIsJobFocused(true)}
                onBlur={() => setIsJobFocused(false)}
                className="w-[260px]"
              />
              {isJobFocused && (
                <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-dark-150 shadow">
                  {jobOptionsFiltered.map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onMouseDown={() => {
                        setMainFilterJobId(String(opt.value));
                        setJobSearchMain(String(opt.label));
                        setIsJobFocused(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-dark-200"
                    >
                      {String(opt.label)}
                    </button>
                  ))}
                  {jobOptionsFiltered.length === 0 && (
                    <div className="px-3 py-2 text-sm text-zinc-500">
                      No jobs
                    </div>
                  )}
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={clearMainFilters}>
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={saveMainFilters}>
              Save
            </Button>
            {(selectedTechIds.length > 0 || mainFilterJobId) && (
              <div className="ml-2 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <span>Active filters:</span>
                {selectedTechIds.length > 0 && (
                  <span className="px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                    {selectedTechIds.length} Technician
                    {selectedTechIds.length > 1 ? "s" : ""}
                  </span>
                )}
                {mainFilterJobId && (
                  <span className="px-2 py-1 rounded-full bg-zinc-100 dark:bg-dark-200">
                    Job: {jobSearchMain || mainFilterJobId}
                  </span>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {/* schema warning intentionally hidden per request */}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 flex items-center">
              <AlertCircle className="h-5 w-5 mr-2" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-2">
            {/* status badges removed per request */}

            <div style={{ height: "600px" }}>
              {loading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="flex justify-center py-6">
                    <LoadingSpinner size="md" />
                  </div>
                </div>
              ) : (
                <FullCalendar
                  key={`cal-${dayjs(currentDate).format("YYYY-MM")}`}
                  ref={calendarRef}
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                  initialView={currentView}
                  headerToolbar={false}
                  initialDate={currentDate}
                  events={events.filter((ev) => {
                    // Multi-select technician filter
                    const matchTech =
                      selectedTechIds.length === 0 ||
                      selectedTechIds.includes(String(ev?.technician?.id)) ||
                      (ev as any)?.technicians?.some((t: any) =>
                        selectedTechIds.includes(String(t.id)),
                      );
                    const matchJob =
                      !mainFilterJobId || ev?.job?.id === mainFilterJobId;
                    return matchTech && matchJob;
                  })}
                  eventClick={handleEventClick}
                  dateClick={handleDateClick}
                  select={handleSelectRange}
                  eventContent={(arg) => {
                    const isAllDay =
                      arg.event.allDay || arg.event.extendedProps?.allDay;
                    const timeDisplay = isAllDay ? "All Day" : arg.timeText;
                    const techs: Array<{ name?: string }> | undefined = (
                      arg.event.extendedProps as any
                    )?.technicians;

                    if (techs && techs.length) {
                      const allNames = techs
                        .map((t) => t.name || "")
                        .filter(Boolean);
                      const shown = allNames.slice(0, 2);
                      const extra = allNames.length - shown.length;
                      const namesLine = `${shown.join(", ")}${extra > 0 ? ` +${extra}` : ""}`;
                      return (
                        <div className="fc-event-custom leading-tight w-full overflow-hidden">
                          <div className="font-medium text-[12px] truncate max-w-full overflow-hidden">
                            {arg.event.title}
                          </div>
                          <div className="text-[11px] opacity-80 truncate max-w-full whitespace-nowrap overflow-hidden">
                            {timeDisplay}
                          </div>
                          <div className="text-[11px] opacity-80 truncate max-w-full whitespace-nowrap overflow-hidden">
                            {namesLine}
                          </div>
                        </div>
                      ) as any;
                    }
                    // Fallback for non-grouped events
                    return (
                      <div className="fc-event-custom leading-tight w-full overflow-hidden">
                        <div className="font-medium text-[12px] truncate max-w-full overflow-hidden">
                          {arg.event.title}
                        </div>
                        <div className="text-[11px] opacity-80 truncate max-w-full whitespace-nowrap overflow-hidden">
                          {timeDisplay}
                        </div>
                      </div>
                    ) as any;
                  }}
                  eventDidMount={(info) => {
                    // Ensure the event element never overflows its day cell
                    const el = info.el as HTMLElement;
                    el.style.overflow = "hidden";
                    el.style.whiteSpace = "nowrap";
                    el.style.textOverflow = "ellipsis";
                    el.style.maxWidth = "100%";

                    // Apply job color if available
                    const eventColor =
                      info.event.backgroundColor ||
                      info.event.extendedProps?.color;
                    if (eventColor) {
                      el.style.backgroundColor = eventColor;
                      el.style.borderColor = eventColor;
                    }
                  }}
                  dayCellDidMount={(info) => {
                    // Fallback: ensure clicking any day cell opens the summary
                    info.el.style.cursor = "pointer";
                    info.el.addEventListener("click", () => openDay(info.date));
                  }}
                  editable={!viewOnly}
                  selectable={!viewOnly}
                  selectMirror={true}
                  dayMaxEvents={true}
                  weekends={true}
                  datesSet={handleDatesSet}
                  slotMinTime="06:00:00"
                  slotMaxTime="22:00:00"
                  allDaySlot={true}
                  height="auto"
                  eventTimeFormat={{
                    hour: "2-digit",
                    minute: "2-digit",
                    meridiem: false,
                    hour12: false,
                  }}
                  slotLabelFormat={{
                    hour: "2-digit",
                    minute: "2-digit",
                    omitZeroMinute: false,
                    meridiem: false,
                    hour12: false,
                  }}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      /* Day schedule summary dialog */
      <Dialog open={showDaySchedule} onOpenChange={setShowDaySchedule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Summary</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-zinc-700 dark:text-white">
              {dayScheduleStart === dayScheduleEnd
                ? `Selected: ${dayScheduleStart}`
                : `Selected: ${dayScheduleStart} to ${dayScheduleEnd}`}
            </div>
            <div className="max-h-60 overflow-auto border rounded-md dark:border-zinc-700">
              {events.filter((ev) => {
                const d = dayjs(ev.start).format("YYYY-MM-DD");
                return d >= dayScheduleStart && d <= dayScheduleEnd;
              }).length === 0 ? (
                <div className="p-3 text-sm text-zinc-500">No events.</div>
              ) : (
                <ul className="divide-y dark:divide-zinc-700">
                  {events
                    .filter((ev) => {
                      const d = dayjs(ev.start).format("YYYY-MM-DD");
                      return d >= dayScheduleStart && d <= dayScheduleEnd;
                    })
                    .map((ev) => (
                      <li
                        key={ev.id}
                        className="p-2 flex items-center justify-between"
                      >
                        <div className="text-sm">
                          <div className="font-medium text-zinc-900 dark:text-white">
                            {ev.title}
                          </div>
                          <div className="text-zinc-600 dark:text-zinc-300">
                            {dayjs(ev.start).format("HH:mm")} -{" "}
                            {ev.end ? dayjs(ev.end).format("HH:mm") : "—"}
                            {(ev as any)?.technicians?.length
                              ? ` • ${(ev as any).technicians
                                  .map((t: any) => t.name)
                                  .filter(Boolean)
                                  .join(", ")}`
                              : ev.technician?.name
                                ? ` • ${ev.technician.name}`
                                : ""}
                          </div>
                        </div>
                        {((ev.id.startsWith("assignment-") &&
                          !ev.id.startsWith("assignment-group-")) ||
                          ev.id.startsWith("exception-")) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveEvent(ev.id)}
                          >
                            Remove
                          </Button>
                        )}
                        {ev.id.startsWith("assignment-group-") && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setGroupEvent(ev);
                                setShowGroupManage(true);
                              }}
                            >
                              Manage
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const shouldPrompt = hasFutureJobDays(
                                  ev.job?.id,
                                  ev.start,
                                );
                                if (shouldPrompt) {
                                  setRemoveScopeEvent(ev as any);
                                  setShowRemoveScope(true);
                                } else {
                                  // Only this day exists; remove this day's grouped block directly
                                  handleRemoveGroupAll(ev as any);
                                }
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </div>
            {!viewOnly && (
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => {
                    setShowQuickAssign(true);
                    setQaForm((prev) => ({
                      ...prev,
                      startDate: dayScheduleStart,
                      endDate: dayScheduleEnd,
                      technicianId:
                        filteredTechnician ||
                        mainFilterTechId ||
                        prev.technicianId,
                    }));
                    const defaultTech = filteredTechnician || mainFilterTechId;
                    setQaSelectedTechnicians((prev) =>
                      defaultTech && !prev.length ? [defaultTech] : prev,
                    );
                  }}
                >
                  Assign Technician
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* Quick assign dialog */}
      <Dialog open={showQuickAssign} onOpenChange={setShowQuickAssign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Assign</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                Technicians
              </label>
              <input
                type="text"
                placeholder="Search technicians..."
                value={qaTechSearch}
                onChange={(e) => setQaTechSearch(e.target.value)}
                className="mb-2 w-full p-2 border rounded-md dark:bg-dark-150 dark:border-zinc-700"
              />
              <div className="max-h-48 overflow-auto border rounded-md dark:border-zinc-700">
                {mergedTechOpts
                  .filter(
                    (o) =>
                      !qaTechSearch ||
                      String(o.label)
                        .toLowerCase()
                        .includes(qaTechSearch.toLowerCase()),
                  )
                  .map((opt) => (
                    <label
                      key={String(opt.value)}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-dark-200"
                    >
                      <input
                        type="checkbox"
                        checked={qaSelectedTechnicians.includes(
                          String(opt.value),
                        )}
                        onChange={(e) => {
                          const id = String(opt.value);
                          setQaSelectedTechnicians((prev) =>
                            e.target.checked
                              ? [...prev, id]
                              : prev.filter((t) => t !== id),
                          );
                        }}
                      />
                      <span>{String(opt.label)}</span>
                    </label>
                  ))}
                {mergedTechOpts.filter(
                  (o) =>
                    !qaTechSearch ||
                    String(o.label)
                      .toLowerCase()
                      .includes(qaTechSearch.toLowerCase()),
                ).length === 0 && (
                  <div className="px-3 py-2 text-sm text-zinc-500">
                    No matching technicians
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                Job
              </label>
              <input
                type="text"
                placeholder="Search jobs..."
                value={qaJobSearch}
                onChange={(e) => setQaJobSearch(e.target.value)}
                onFocus={() => setQaJobOpen(true)}
                onBlur={() => setTimeout(() => setQaJobOpen(false), 100)}
                className="mb-2 w-full p-2 border rounded-md dark:bg-dark-150 dark:border-zinc-700"
              />
              {qaJobOpen && (
                <div className="max-h-48 overflow-auto border rounded-md dark:border-zinc-700">
                  {[...jobs]
                    .filter(
                      (j) =>
                        !qaJobSearch ||
                        String(j.label)
                          .toLowerCase()
                          .includes(qaJobSearch.toLowerCase()),
                    )
                    .map((j) => (
                      <button
                        key={j.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-dark-200 ${qaForm.jobId === j.id ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        onMouseDown={() => {
                          setQaForm((prev) => ({ ...prev, jobId: j.id }));
                          setQaJobSearch(j.label);
                          setQaJobOpen(false);
                        }}
                      >
                        {j.label}
                      </button>
                    ))}
                  {[...jobs].filter(
                    (j) =>
                      !qaJobSearch ||
                      String(j.label)
                        .toLowerCase()
                        .includes(qaJobSearch.toLowerCase()),
                  ).length === 0 && (
                    <div className="px-3 py-2 text-sm text-zinc-500">
                      No matching jobs
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={qaForm.startDate}
                onChange={(e) =>
                  setQaForm((prev) => ({ ...prev, startDate: e.target.value }))
                }
                className="w-full p-2 border rounded-md dark:bg-dark-150 dark:border-zinc-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                End Date
              </label>
              <input
                type="date"
                value={qaForm.endDate}
                onChange={(e) =>
                  setQaForm((prev) => ({ ...prev, endDate: e.target.value }))
                }
                className="w-full p-2 border rounded-md dark:bg-dark-150 dark:border-zinc-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                Job Color
              </label>
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    "#ef4444",
                    "#f97316",
                    "#eab308",
                    "#22c55e",
                    "#3b82f6",
                    "#8b5cf6",
                    "#ec4899",
                    "#64748b",
                  ].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setQaForm((prev) => ({ ...prev, color }))}
                      className={`w-8 h-8 rounded border-2 ${qaForm.color === color ? "border-zinc-900 dark:border-white" : "border-zinc-300 dark:border-zinc-600"}`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                  <input
                    type="color"
                    value={qaForm.color}
                    onChange={(e) =>
                      setQaForm((prev) => ({ ...prev, color: e.target.value }))
                    }
                    className="h-8 w-16 border rounded cursor-pointer dark:bg-dark-150 dark:border-zinc-700"
                    title="Custom color"
                  />
                </div>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {qaForm.jobId && jobColors[qaForm.jobId]
                    ? "Using saved color for this job"
                    : "New color will be saved for this job"}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={qaForm.startTime}
                onChange={(e) =>
                  setQaForm((prev) => ({ ...prev, startTime: e.target.value }))
                }
                className="w-full p-2 border rounded-md dark:bg-dark-150 dark:border-zinc-700"
                disabled={qaForm.isAllDay}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                End Time
              </label>
              <input
                type="time"
                value={qaForm.endTime}
                onChange={(e) =>
                  setQaForm((prev) => ({ ...prev, endTime: e.target.value }))
                }
                disabled={qaForm.unknownHours || qaForm.isAllDay}
                className="w-full p-2 border rounded-md dark:bg-dark-150 dark:border-zinc-700 disabled:opacity-60"
              />
              <label className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-white">
                <input
                  type="checkbox"
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
              <label className="mt-2 ml-4 inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-white">
                <input
                  type="checkbox"
                  checked={qaForm.isAllDay}
                  onChange={(e) =>
                    setQaForm((prev) => ({
                      ...prev,
                      isAllDay: e.target.checked,
                      unknownHours: e.target.checked
                        ? false
                        : prev.unknownHours,
                    }))
                  }
                />
                All Day
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                Notes
              </label>
              <Textarea
                value={qaForm.notes}
                onChange={(e) =>
                  setQaForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Optional notes"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowQuickAssign(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleQuickAssignSave}
              disabled={
                (qaSelectedTechnicians.length === 0 && !qaForm.technicianId) ||
                !qaForm.jobId ||
                !qaForm.startDate
              }
            >
              Save Assignment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Remove scope dialog */}
      <Dialog open={showRemoveScope} onOpenChange={setShowRemoveScope}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Job From Calendar</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-zinc-700 dark:text-white">
              Choose how much to remove for:{" "}
              <span className="font-medium">{removeScopeEvent?.title}</span>
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  if (!removeScopeEvent) return;
                  await handleRemoveGroupAll(removeScopeEvent);
                  setShowRemoveScope(false);
                }}
              >
                Just this day
              </Button>
              <Button
                onClick={async () => {
                  if (!removeScopeEvent?.job?.id) return;
                  const fromDate = dayjs(removeScopeEvent.start).format(
                    "YYYY-MM-DD",
                  );
                  await schedulingService.deleteAssignmentsByJob({
                    jobId: removeScopeEvent.job.id,
                    fromDate,
                    portalType,
                    division,
                  });
                  setShowRemoveScope(false);
                  setRemoveScopeEvent(null);
                  setReloadKey((k) => k + 1);
                }}
              >
                All future scheduling for this job
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Group manage dialog */}
      <Dialog open={showGroupManage} onOpenChange={setShowGroupManage}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Assignments</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-zinc-700 dark:text-white">
              {groupEvent?.title}
            </div>
            <ul className="divide-y dark:divide-zinc-700 max-h-60 overflow-auto">
              {(groupEvent?.technicians || []).map((t) => (
                <li
                  key={t.assignment_id || t.id}
                  className="p-2 flex items-center justify-between"
                >
                  <div className="text-sm text-zinc-800 dark:text-white">
                    {t.name || t.id}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveGroupOne(t.assignment_id)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
              {(groupEvent?.technicians || []).length === 0 && (
                <div className="p-3 text-sm text-zinc-500">
                  No assignments remaining.
                </div>
              )}
            </ul>
            {/* Add technicians to this job/day */}
            <div className="pt-2 border-t dark:border-zinc-700">
              <div className="mb-2 text-sm font-medium text-zinc-800 dark:text-white">
                Add Technicians
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                    Technicians
                  </label>
                  <input
                    type="text"
                    placeholder="Search technicians..."
                    value={gmTechSearch}
                    onChange={(e) => setGmTechSearch(e.target.value)}
                    className="mb-2 w-full p-2 border rounded-md dark:bg-dark-150 dark:border-zinc-700"
                  />
                  <div className="max-h-40 overflow-auto border rounded-md dark:border-zinc-700">
                    {mergedTechOpts
                      .filter(
                        (o) =>
                          !gmTechSearch ||
                          String(o.label)
                            .toLowerCase()
                            .includes(gmTechSearch.toLowerCase()),
                      )
                      .filter(
                        (o) =>
                          !(groupEvent?.technicians || []).some(
                            (t) => String(t.id) === String(o.value),
                          ),
                      )
                      .map((opt) => (
                        <label
                          key={String(opt.value)}
                          className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-dark-200"
                        >
                          <input
                            type="checkbox"
                            checked={gmSelectedTechnicians.includes(
                              String(opt.value),
                            )}
                            onChange={(e) => {
                              const id = String(opt.value);
                              setGmSelectedTechnicians((prev) =>
                                e.target.checked
                                  ? [...prev, id]
                                  : prev.filter((t) => t !== id),
                              );
                            }}
                          />
                          <span>{String(opt.label)}</span>
                        </label>
                      ))}
                    {mergedTechOpts
                      .filter(
                        (o) =>
                          !gmTechSearch ||
                          String(o.label)
                            .toLowerCase()
                            .includes(gmTechSearch.toLowerCase()),
                      )
                      .filter(
                        (o) =>
                          !(groupEvent?.technicians || []).some(
                            (t) => String(t.id) === String(o.value),
                          ),
                      ).length === 0 && (
                      <div className="px-3 py-2 text-sm text-zinc-500">
                        No matching technicians
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                    Times
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={gmStartTime}
                      onChange={(e) => setGmStartTime(e.target.value)}
                      className="w-full p-2 border rounded-md dark:bg-dark-150 dark:border-zinc-700"
                    />
                    <input
                      type="time"
                      value={gmEndTime}
                      onChange={(e) => setGmEndTime(e.target.value)}
                      disabled={gmUnknownHours}
                      className="w-full p-2 border rounded-md dark:bg-dark-150 dark:border-zinc-700 disabled:opacity-60"
                    />
                  </div>
                  <label className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-white">
                    <input
                      type="checkbox"
                      checked={gmUnknownHours}
                      onChange={(e) => setGmUnknownHours(e.target.checked)}
                    />
                    Unknown hours
                  </label>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  onClick={handleAddTechsToGroup}
                  disabled={gmSelectedTechnicians.length === 0}
                >
                  Add
                </Button>
              </div>
            </div>
            {(groupEvent?.technicians || []).length > 0 && (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowGroupManage(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => groupEvent && handleRemoveGroupAll(groupEvent)}
                >
                  Remove All
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
