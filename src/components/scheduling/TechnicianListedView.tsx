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

type Props = {
  portalType: PortalType;
  division?: string;
  days?: number; // number of days to show (default 21)
  onAssignmentClick?: (assignment: TechnicianAssignment) => void;
};

export const TechnicianListedView: React.FC<Props> = ({
  portalType,
  division,
  days = 21,
  onAssignmentClick,
}) => {
  const { maskJobTitle } = useDemoMode();
  const [startDate, setStartDate] = useState<string>(
    dayjs().format("YYYY-MM-DD"),
  );
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
  const [qaJobOpen, setQaJobOpen] = useState<boolean>(false);
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

  // Generate visible dates left-to-right starting at startDate
  const dateList = useMemo(() => {
    const dates: string[] = [];
    const start = dayjs(startDate);
    for (let i = 0; i < days; i++) {
      dates.push(start.add(i, "day").format("YYYY-MM-DD"));
    }
    return dates;
  }, [startDate, days]);

  // Auto-roll the view at midnight to keep today at the left
  useEffect(() => {
    const updateAtMidnight = () => {
      const msUntilMidnight = dayjs()
        .endOf("day")
        .add(1, "millisecond")
        .diff(dayjs());
      const t = setTimeout(
        () => setStartDate(dayjs().format("YYYY-MM-DD")),
        msUntilMidnight,
      );
      return () => clearTimeout(t);
    };
    return updateAtMidnight();
  }, []);

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
          const mapped = res.data.map((u: any) => ({
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
  const isAmp = (email?: string) => !!email && /@ampqes\.com$/i.test(email);

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

  const filteredTechs = useMemo(() => {
    let result = displayTechs;

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
  }, [displayTechs, techFilter, selectedTechIds]);

  const goPrev = () =>
    setStartDate(dayjs(startDate).subtract(days, "day").format("YYYY-MM-DD"));
  const goNext = () =>
    setStartDate(dayjs(startDate).add(days, "day").format("YYYY-MM-DD"));
  const goToday = () => setStartDate(dayjs().format("YYYY-MM-DD"));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Listed View</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-2">
              <Button variant="outline" onClick={goPrev}>
                Prev
              </Button>
              <Button variant="outline" onClick={goToday}>
                Today
              </Button>
              <Button variant="outline" onClick={goNext}>
                Next
              </Button>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative w-64">
                <button
                  type="button"
                  onClick={() => setIsTechFilterOpen(!isTechFilterOpen)}
                  className="w-full px-3 py-2 text-left text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-dark-150 text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-dark-200 flex items-center justify-between"
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
                    <div className="absolute z-50 mt-1 w-full max-h-80 overflow-auto border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-dark-150 shadow-lg">
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
                              const allIds = displayTechs.map((t) => t.user_id);
                              setSelectedTechIds(allIds);
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
                            className="flex-1 px-2 py-1 text-xs bg-neutral-500 text-white rounded hover:bg-neutral-600"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>
                      {displayTechs
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
                                className="rounded border-neutral-300 dark:border-neutral-600"
                              />
                              <span>{displayName}</span>
                            </div>
                          );
                        })}
                      {displayTechs.length === 0 && (
                        <div className="px-3 py-2 text-sm text-neutral-500">
                          No technicians
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              {selectedTechIds.length > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                  {selectedTechIds.length} filtered
                </span>
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
                {dateList.map((d) => (
                  <div
                    key={d}
                    className="border border-neutral-200 dark:border-neutral-700 text-center px-2 py-2 text-sm bg-neutral-50 dark:bg-dark-200"
                  >
                    <div className="font-medium">{dayjs(d).format("ddd")}</div>
                    <div className="text-xs">{dayjs(d).format("MM/DD")}</div>
                  </div>
                ))}
              </div>

              {/* Rows */}
              {loading ? (
                <div className="p-6 text-center">
                  <LoadingSpinner size="md" />
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
                  return (
                    <div
                      key={techId}
                      className="grid"
                      style={{
                        gridTemplateColumns: `240px repeat(${dateList.length}, minmax(120px, 1fr))`,
                      }}
                    >
                      <div className="sticky left-0 z-10 bg-white dark:bg-dark-150 border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm truncate">
                        {name}
                      </div>
                      {dateList.map((d) => {
                        const list = rowMap?.get(d) || [];
                        return (
                          <div
                            key={d}
                            className="border border-neutral-200 dark:border-neutral-700 px-2 py-1 min-h-[44px] cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100"
                            onClick={() => {
                              setQaSelectedTechnicians([techId]);
                              setQaForm((prev) => ({
                                ...prev,
                                startDate: d,
                                endDate: d,
                              }));
                              setShowQuickAssign(true);
                            }}
                            title={`Click to add assignment for ${dayjs(d).format("MMM D")}`}
                          >
                            {list.length === 0 ? (
                              <div className="w-full h-full text-xs text-neutral-400">
                                —
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {list
                                  .sort((a, b) =>
                                    a.start_time.localeCompare(b.start_time),
                                  )
                                  .map((a) => {
                                    const isAllDay =
                                      a.start_time?.startsWith("00:00") &&
                                      (a.end_time?.startsWith("23:59") ||
                                        a.end_time?.startsWith("24:00"));
                                    const isUnknown =
                                      a.start_time?.slice(0, 5) ===
                                      a.end_time?.slice(0, 5);
                                    const timeLabel = isAllDay
                                      ? "All Day"
                                      : isUnknown
                                        ? "Unknown"
                                        : `${a.start_time?.slice(0, 5)}-${a.end_time?.slice(0, 5)}`;
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
                                        className={`text-[11px] px-2 py-1 rounded border overflow-hidden whitespace-nowrap text-ellipsis cursor-pointer hover:opacity-80 transition-opacity ${!jobColor ? "border-neutral-200 dark:border-neutral-600 bg-white dark:bg-dark-150" : ""}`}
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

      {/* Quick Assign Dialog */}
      <Dialog open={showQuickAssign} onOpenChange={setShowQuickAssign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Assign</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                Technicians
              </label>
              <input
                type="text"
                placeholder="Search technicians..."
                value={qaTechSearch}
                onChange={(e) => setQaTechSearch(e.target.value)}
                className="mb-2 w-full p-2 border rounded-md dark:bg-dark-150 dark:border-neutral-700"
              />
              <div className="max-h-48 overflow-auto border rounded-md dark:border-neutral-700">
                {displayTechs
                  .filter(
                    (t) =>
                      !qaTechSearch ||
                      formatDisplayName(t.full_name, t.email)
                        .toLowerCase()
                        .includes(qaTechSearch.toLowerCase()),
                  )
                  .map((tech) => (
                    <label
                      key={tech.user_id}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-200"
                    >
                      <input
                        type="checkbox"
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
                      <span>
                        {formatDisplayName(tech.full_name, tech.email)}
                      </span>
                    </label>
                  ))}
                {displayTechs.filter(
                  (t) =>
                    !qaTechSearch ||
                    formatDisplayName(t.full_name, t.email)
                      .toLowerCase()
                      .includes(qaTechSearch.toLowerCase()),
                ).length === 0 && (
                  <div className="px-3 py-2 text-sm text-neutral-500">
                    No matching technicians
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                Job
              </label>
              <input
                type="text"
                placeholder="Search jobs..."
                value={qaJobSearch}
                onChange={(e) => setQaJobSearch(e.target.value)}
                onFocus={() => setQaJobOpen(true)}
                onBlur={() => setTimeout(() => setQaJobOpen(false), 100)}
                className="mb-2 w-full p-2 border rounded-md dark:bg-dark-150 dark:border-neutral-700"
              />
              {qaJobOpen && (
                <div className="max-h-48 overflow-auto border rounded-md dark:border-neutral-700">
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
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-dark-200 ${qaForm.jobId === j.id ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
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
                    <div className="px-3 py-2 text-sm text-neutral-500">
                      No matching jobs
                    </div>
                  )}
                </div>
              )}
            </div>
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
                className="w-full p-2 border rounded-md dark:bg-dark-150 dark:border-neutral-700"
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
                className="w-full p-2 border rounded-md dark:bg-dark-150 dark:border-neutral-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
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
                      className={`w-8 h-8 rounded border-2 ${qaForm.color === color ? "border-neutral-900 dark:border-white" : "border-neutral-300 dark:border-neutral-600"}`}
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
                    className="h-8 w-16 border rounded cursor-pointer dark:bg-dark-150 dark:border-neutral-700"
                    title="Custom color"
                  />
                </div>
                <span className="text-xs text-neutral-600 dark:text-neutral-400">
                  {qaForm.jobId && jobColors[qaForm.jobId]
                    ? "Using saved color for this job"
                    : "New color will be saved for this job"}
                </span>
              </div>
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
                className="w-full p-2 border rounded-md dark:bg-dark-150 dark:border-neutral-700"
                disabled={qaForm.isAllDay}
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
                className="w-full p-2 border rounded-md dark:bg-dark-150 dark:border-neutral-700 disabled:opacity-60"
              />
              <label className="mt-2 inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-white">
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
              <label className="mt-2 ml-4 inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-white">
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
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
              Notes
            </label>
            <Textarea
              value={qaForm.notes}
              onChange={(e) =>
                setQaForm((prev) => ({ ...prev, notes: e.target.value }))
              }
              className="w-full"
              rows={3}
              placeholder="Optional notes"
            />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowQuickAssign(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (
                  !qaForm.jobId ||
                  !qaForm.startDate ||
                  qaSelectedTechnicians.length === 0
                )
                  return;

                // Store the job color
                if (qaForm.jobId && qaForm.color) {
                  setJobColors((prev) => ({
                    ...prev,
                    [qaForm.jobId]: qaForm.color,
                  }));
                }

                try {
                  const start = dayjs(qaForm.startDate);
                  const end = qaForm.endDate ? dayjs(qaForm.endDate) : start;
                  const days: string[] = [];
                  let cur = start.startOf("day");
                  const last = end.startOf("day");
                  while (cur.isBefore(last) || cur.isSame(last)) {
                    days.push(cur.format("YYYY-MM-DD"));
                    cur = cur.add(1, "day");
                  }

                  const startTimeToUse = qaForm.isAllDay
                    ? "00:00"
                    : qaForm.startTime;
                  const endTimeToUse = qaForm.isAllDay
                    ? "23:59"
                    : qaForm.unknownHours
                      ? qaForm.startTime
                      : qaForm.endTime;

                  const payloads = qaSelectedTechnicians.flatMap((tid) =>
                    days.map((d) => ({
                      user_id: tid,
                      job_id: qaForm.jobId,
                      assignment_date: d,
                      start_time: startTimeToUse,
                      end_time: endTimeToUse,
                      status: "scheduled" as any,
                      notes: qaForm.notes || undefined,
                      portal_type: portalType,
                      division: division,
                    })),
                  );

                  await Promise.all(
                    payloads.map((p) =>
                      schedulingService.saveTechnicianAssignment(p as any),
                    ),
                  );
                  setShowQuickAssign(false);

                  // Refresh assignments
                  try {
                    const start = dayListFirst(dateList);
                    const end = dayListLast(dateList);
                    const { data } =
                      await schedulingService.getTechnicianAssignments(
                        undefined,
                        portalType,
                        start,
                        end,
                        division,
                      );
                    setAssignments(data || []);
                  } catch {}
                } catch (e) {
                  console.error("Failed to save assignment(s):", e);
                }
              }}
              disabled={
                !qaForm.jobId ||
                !qaForm.startDate ||
                qaSelectedTechnicians.length === 0
              }
            >
              Save Assignment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

function dayListFirst(list: string[]): string {
  return list.length ? list[0] : dayjs().format("YYYY-MM-DD");
}

function dayListLast(list: string[]): string {
  return list.length ? list[list.length - 1] : dayjs().format("YYYY-MM-DD");
}

export default TechnicianListedView;
