import React, { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  ChevronDown,
  Save,
  Loader2,
  ClipboardList,
  Zap,
  Award,
  AlertTriangle,
  Target,
  Handshake,
  FileText,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { toast } from "@/components/ui/toast";
import {
  type KeyEvent,
  type CounselItem,
  type GoalItem,
  type OneOnOneCheckin,
  type OneOnOneCheckinInsert,
  createCheckin,
  updateCheckin,
} from "@/services/hr/oneOnOneService";

interface OneOnOneFormProps {
  employeeId: string;
  employeeName: string;
  managerId: string;
  managerName: string;
  existingCheckin?: OneOnOneCheckin | null;
  onClose: () => void;
  onSaved: () => void;
}

type PulseValue = "needs-attention" | "on-track" | "exceeding" | null;

const EMPTY_EVENT: KeyEvent = { label: "", description: "" };
const EMPTY_COUNSEL: CounselItem = { text: "", followUp: "" };
const EMPTY_GOAL: GoalItem = { goal: "", dueDate: "", status: "", notes: "" };

export const OneOnOneForm: React.FC<OneOnOneFormProps> = ({
  employeeId,
  employeeName,
  managerId,
  managerName,
  existingCheckin,
  onClose,
  onSaved,
}) => {
  const isEditing = !!existingCheckin;

  const [managerNameInput, setManagerNameInput] = useState(managerName);
  const [meetingDate, setMeetingDate] = useState(
    existingCheckin?.meeting_date || new Date().toISOString().slice(0, 10),
  );
  const [periodCovered, setPeriodCovered] = useState(
    existingCheckin?.period_covered || "",
  );
  const [pulse, setPulse] = useState<PulseValue>(
    existingCheckin?.overall_pulse || null,
  );

  const [events, setEvents] = useState<KeyEvent[]>(
    existingCheckin?.key_events?.length
      ? existingCheckin.key_events
      : [{ ...EMPTY_EVENT }, { ...EMPTY_EVENT }],
  );
  const [strengths, setStrengths] = useState<CounselItem[]>(
    existingCheckin?.strengths?.length
      ? existingCheckin.strengths
      : [{ ...EMPTY_COUNSEL }, { ...EMPTY_COUNSEL }, { ...EMPTY_COUNSEL }],
  );
  const [devAreas, setDevAreas] = useState<CounselItem[]>(
    existingCheckin?.development_areas?.length
      ? existingCheckin.development_areas
      : [{ ...EMPTY_COUNSEL }, { ...EMPTY_COUNSEL }, { ...EMPTY_COUNSEL }],
  );
  const [goals, setGoals] = useState<GoalItem[]>(
    existingCheckin?.goals?.length
      ? existingCheckin.goals
      : [{ ...EMPTY_GOAL }, { ...EMPTY_GOAL }, { ...EMPTY_GOAL }],
  );
  const [employeeCommitments, setEmployeeCommitments] = useState<string[]>(
    existingCheckin?.employee_commitments?.length
      ? existingCheckin.employee_commitments
      : ["", "", ""],
  );
  const [managerCommitments, setManagerCommitments] = useState<string[]>(
    existingCheckin?.manager_commitments?.length
      ? existingCheckin.manager_commitments
      : ["", "", ""],
  );
  const [additionalNotes, setAdditionalNotes] = useState(
    existingCheckin?.additional_notes || "",
  );
  const [managerSignature, setManagerSignature] = useState(
    existingCheckin?.manager_signature || "",
  );
  const [saving, setSaving] = useState(false);

  const updateEvent = (idx: number, field: keyof KeyEvent, value: string) => {
    setEvents((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)),
    );
  };
  const updateStrength = (
    idx: number,
    field: keyof CounselItem,
    value: string,
  ) => {
    setStrengths((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    );
  };
  const updateDevArea = (
    idx: number,
    field: keyof CounselItem,
    value: string,
  ) => {
    setDevAreas((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d)),
    );
  };
  const updateGoal = (idx: number, field: keyof GoalItem, value: string) => {
    setGoals((prev) =>
      prev.map((g, i) => (i === idx ? { ...g, [field]: value } : g)),
    );
  };

  const handleSave = async () => {
    if (!pulse) {
      toast({
        title: "Required",
        description: "Please select an overall pulse rating.",
        variant: "warning",
      });
      return;
    }
    setSaving(true);
    try {
      const payload: OneOnOneCheckinInsert = {
        employee_id: employeeId,
        manager_id: managerId,
        meeting_date: meetingDate,
        period_covered: periodCovered || null,
        overall_pulse: pulse,
        key_events: events.filter((e) => e.description.trim()),
        strengths: strengths.filter((s) => s.text.trim()),
        development_areas: devAreas.filter((d) => d.text.trim()),
        goals: goals.filter((g) => g.goal.trim()),
        employee_commitments: employeeCommitments.filter((c) => c.trim()),
        manager_commitments: managerCommitments.filter((c) => c.trim()),
        additional_notes: additionalNotes || null,
        employee_signature: null,
        manager_signature: managerSignature || null,
        created_by: managerId,
      };

      if (isEditing && existingCheckin) {
        await updateCheckin(existingCheckin.id, payload);
        toast({
          title: "Updated",
          description: "Check-in updated successfully.",
          variant: "success",
        });
      } else {
        await createCheckin(payload);
        toast({
          title: "Saved",
          description: "One-on-one check-in saved.",
          variant: "success",
        });
      }
      onSaved();
    } catch (err: any) {
      console.error("Failed to save check-in:", err);
      toast({
        title: "Error",
        description: err?.message || "Failed to save check-in.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const pulseOptions: {
    value: PulseValue;
    label: string;
    icon: React.ReactNode;
    colors: string;
  }[] = [
    {
      value: "needs-attention",
      label: "Needs Attention",
      icon: <AlertTriangle className="h-5 w-5" />,
      colors:
        "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-600 dark:bg-orange-900/30 dark:text-orange-300",
    },
    {
      value: "on-track",
      label: "On Track",
      icon: <Zap className="h-5 w-5" />,
      colors:
        "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300",
    },
    {
      value: "exceeding",
      label: "Exceeding",
      icon: <Award className="h-5 w-5" />,
      colors:
        "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300",
    },
  ];

  const statusOptions = [
    "",
    "Not Started",
    "In Progress",
    "Complete",
    "Missed",
    "Carry Over",
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto p-4">
      <div
        className="relative w-full max-w-4xl bg-white dark:bg-dark-150 rounded-xl shadow-2xl my-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent stripe */}
        <div className="h-1.5 bg-gradient-to-r from-[#4a4e8a] via-[#52b788] to-[#c9a84c]" />

        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-dark-150 border-b border-neutral-200 dark:border-dark-200 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#4a4e8a] dark:text-[#8b8fd4]">
              Monthly Check-In
            </p>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white mt-0.5">
              Manager & Employee One-on-One
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              A structured conversation to reflect, align, and grow.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-dark-200 text-neutral-500 dark:text-neutral-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-8">
          {/* Info row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Employee Name
              </Label>
              <Input
                value={employeeName}
                disabled
                className="mt-1 bg-neutral-50 dark:bg-dark-200"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Manager Name
              </Label>
              <Input
                value={managerNameInput}
                onChange={(e) => setManagerNameInput(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Meeting Date
              </Label>
              <Input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Period Covered
              </Label>
              <Input
                value={periodCovered}
                onChange={(e) => setPeriodCovered(e.target.value)}
                placeholder="e.g. March 2026"
                className="mt-1"
              />
            </div>
          </div>

          {/* Overall Pulse */}
          <Section
            icon={<Zap className="h-4 w-4" />}
            title="Overall Pulse"
            desc="How is this employee doing this month overall?"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {pulseOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPulse(opt.value)}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                    pulse === opt.value
                      ? opt.colors
                      : "border-neutral-200 dark:border-dark-300 hover:border-neutral-300 dark:hover:border-dark-200"
                  }`}
                >
                  {opt.icon}
                  <span className="text-sm font-semibold">{opt.label}</span>
                </button>
              ))}
            </div>
          </Section>

          {/* Key Events */}
          <Section
            icon={<ClipboardList className="h-4 w-4" />}
            title="Key Events This Period"
            desc="Notable incidents, milestones, projects, or moments that shaped this month"
          >
            <div className="space-y-3">
              {events.map((evt, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-neutral-200 dark:border-dark-300 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4a4e8a]" />
                      Event {idx + 1}
                    </span>
                    {events.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setEvents((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-neutral-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <textarea
                    value={evt.description}
                    onChange={(e) =>
                      updateEvent(idx, "description", e.target.value)
                    }
                    placeholder="Describe what happened, when, and the impact..."
                    className="w-full bg-transparent text-sm text-neutral-900 dark:text-white placeholder:text-neutral-300 dark:placeholder:text-neutral-600 resize-none min-h-[60px] outline-none border-none"
                    rows={2}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setEvents((prev) => [...prev, { ...EMPTY_EVENT }])
                }
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#4a4e8a] dark:text-[#8b8fd4] hover:opacity-70"
              >
                <Plus className="h-3.5 w-3.5" /> Add Another Event
              </button>
            </div>
          </Section>

          {/* Counseling & Feedback */}
          <Section
            icon={<Award className="h-4 w-4" />}
            title="Counseling & Feedback"
            desc="Specific behaviors, outcomes, and coaching notes from this period"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 rounded-lg border border-neutral-200 dark:border-dark-300 overflow-hidden">
              {/* Strengths */}
              <div className="bg-emerald-50/50 dark:bg-emerald-900/10 p-5 md:border-r border-b md:border-b-0 border-neutral-200 dark:border-dark-300">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-200 dark:border-dark-300">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Strengths & Wins
                  </span>
                  <span className="text-xs text-neutral-400 ml-auto">
                    {strengths.length} items
                  </span>
                </div>
                <div className="space-y-3">
                  {strengths.map((s, idx) => (
                    <div key={idx} className="flex gap-2">
                      <span className="text-xs font-semibold text-neutral-400 pt-1.5 min-w-[16px]">
                        {idx + 1}.
                      </span>
                      <div className="flex-1 space-y-1">
                        <input
                          value={s.text}
                          onChange={(e) =>
                            updateStrength(idx, "text", e.target.value)
                          }
                          placeholder="Positive behavior or achievement..."
                          className="w-full bg-transparent text-sm border-b border-neutral-200 dark:border-dark-300 focus:border-emerald-400 outline-none pb-1 text-neutral-900 dark:text-white placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
                        />
                        <div className="flex items-center gap-1 text-xs text-neutral-400 italic">
                          <span>Follow-up:</span>
                          <input
                            value={s.followUp}
                            onChange={(e) =>
                              updateStrength(idx, "followUp", e.target.value)
                            }
                            placeholder="Reinforce by..."
                            className="flex-1 bg-transparent border-b border-dashed border-neutral-200 dark:border-dark-300 outline-none text-neutral-600 dark:text-neutral-300 placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
                          />
                        </div>
                        {strengths.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setStrengths((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
                            }
                            className="text-neutral-300 hover:text-red-400 text-xs"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setStrengths((prev) => [...prev, { ...EMPTY_COUNSEL }])
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:opacity-70 mt-3"
                >
                  <Plus className="h-3 w-3" /> Add Strength
                </button>
              </div>

              {/* Development Areas */}
              <div className="bg-orange-50/50 dark:bg-orange-900/10 p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-200 dark:border-dark-300">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                    Areas to Develop
                  </span>
                  <span className="text-xs text-neutral-400 ml-auto">
                    {devAreas.length} items
                  </span>
                </div>
                <div className="space-y-3">
                  {devAreas.map((d, idx) => (
                    <div key={idx} className="flex gap-2">
                      <span className="text-xs font-semibold text-neutral-400 pt-1.5 min-w-[16px]">
                        {idx + 1}.
                      </span>
                      <div className="flex-1 space-y-1">
                        <input
                          value={d.text}
                          onChange={(e) =>
                            updateDevArea(idx, "text", e.target.value)
                          }
                          placeholder="Behavior or gap to address..."
                          className="w-full bg-transparent text-sm border-b border-neutral-200 dark:border-dark-300 focus:border-orange-400 outline-none pb-1 text-neutral-900 dark:text-white placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
                        />
                        <div className="flex items-center gap-1 text-xs text-neutral-400 italic">
                          <span>Action plan:</span>
                          <input
                            value={d.followUp}
                            onChange={(e) =>
                              updateDevArea(idx, "followUp", e.target.value)
                            }
                            placeholder="Address by..."
                            className="flex-1 bg-transparent border-b border-dashed border-neutral-200 dark:border-dark-300 outline-none text-neutral-600 dark:text-neutral-300 placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
                          />
                        </div>
                        {devAreas.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setDevAreas((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
                            }
                            className="text-neutral-300 hover:text-red-400 text-xs"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDevAreas((prev) => [...prev, { ...EMPTY_COUNSEL }])
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:opacity-70 mt-3"
                >
                  <Plus className="h-3 w-3" /> Add Development Area
                </button>
              </div>
            </div>
          </Section>

          {/* Goals & Commitments */}
          <Section
            icon={<Target className="h-4 w-4" />}
            title="Goals & Commitments"
            desc="Review of prior goals and new commitments for next period"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-dark-200">
                    <th
                      className="text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 px-3 py-2"
                      style={{ width: "40%" }}
                    >
                      Goal / Commitment
                    </th>
                    <th
                      className="text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 px-3 py-2"
                      style={{ width: "18%" }}
                    >
                      Due Date
                    </th>
                    <th
                      className="text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 px-3 py-2"
                      style={{ width: "18%" }}
                    >
                      Status
                    </th>
                    <th
                      className="text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 px-3 py-2"
                      style={{ width: "20%" }}
                    >
                      Notes
                    </th>
                    <th className="px-2 py-2" style={{ width: "4%" }} />
                  </tr>
                </thead>
                <tbody>
                  {goals.map((g, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-neutral-100 dark:border-dark-300"
                    >
                      <td className="px-3 py-2">
                        <input
                          value={g.goal}
                          onChange={(e) =>
                            updateGoal(idx, "goal", e.target.value)
                          }
                          placeholder="Describe the goal..."
                          className="w-full bg-transparent outline-none text-neutral-900 dark:text-white placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={g.dueDate}
                          onChange={(e) =>
                            updateGoal(idx, "dueDate", e.target.value)
                          }
                          className="w-full bg-transparent outline-none text-neutral-900 dark:text-white"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={g.status}
                          onChange={(e) =>
                            updateGoal(idx, "status", e.target.value)
                          }
                          className="w-full bg-transparent outline-none text-neutral-900 dark:text-white cursor-pointer"
                        >
                          {statusOptions.map((s) => (
                            <option key={s} value={s}>
                              {s || "-- Select --"}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={g.notes}
                          onChange={(e) =>
                            updateGoal(idx, "notes", e.target.value)
                          }
                          placeholder="Comments..."
                          className="w-full bg-transparent outline-none text-neutral-900 dark:text-white placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
                        />
                      </td>
                      <td className="px-2 py-2">
                        {goals.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setGoals((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
                            }
                            className="text-neutral-300 hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => setGoals((prev) => [...prev, { ...EMPTY_GOAL }])}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#4a4e8a] dark:text-[#8b8fd4] hover:opacity-70 mt-2"
            >
              <Plus className="h-3.5 w-3.5" /> Add Goal
            </button>
          </Section>

          {/* Next Period Commitments */}
          <Section
            icon={<Handshake className="h-4 w-4" />}
            title="Next Period Commitments"
            desc="What both parties commit to before the next check-in"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-neutral-200 dark:border-dark-300 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3 flex items-center gap-1.5">
                  <span className="text-sm">Employee Commits To</span>
                </p>
                {employeeCommitments.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 flex-shrink-0" />
                    <input
                      value={c}
                      onChange={(e) => {
                        const updated = [...employeeCommitments];
                        updated[idx] = e.target.value;
                        setEmployeeCommitments(updated);
                      }}
                      placeholder="Action item..."
                      className="flex-1 bg-transparent text-sm border-b border-neutral-200 dark:border-dark-300 outline-none pb-1 text-neutral-900 dark:text-white placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
                    />
                    {employeeCommitments.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setEmployeeCommitments((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                        className="text-neutral-300 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setEmployeeCommitments((prev) => [...prev, ""])
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#4a4e8a] dark:text-[#8b8fd4] hover:opacity-70 mt-1"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
              <div className="rounded-lg border border-neutral-200 dark:border-dark-300 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3 flex items-center gap-1.5">
                  <span className="text-sm">Manager Commits To</span>
                </p>
                {managerCommitments.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 flex-shrink-0" />
                    <input
                      value={c}
                      onChange={(e) => {
                        const updated = [...managerCommitments];
                        updated[idx] = e.target.value;
                        setManagerCommitments(updated);
                      }}
                      placeholder="Support / resource / action..."
                      className="flex-1 bg-transparent text-sm border-b border-neutral-200 dark:border-dark-300 outline-none pb-1 text-neutral-900 dark:text-white placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
                    />
                    {managerCommitments.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setManagerCommitments((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                        className="text-neutral-300 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setManagerCommitments((prev) => [...prev, ""])}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#4a4e8a] dark:text-[#8b8fd4] hover:opacity-70 mt-1"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
            </div>
          </Section>

          {/* Additional Notes */}
          <Section
            icon={<FileText className="h-4 w-4" />}
            title="Additional Notes"
            desc="Anything else discussed - development, wellness, career path, concerns"
          >
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="Free-form notes from the conversation..."
              className="w-full rounded-lg border border-neutral-200 dark:border-dark-300 bg-white dark:bg-dark-200 p-4 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-300 dark:placeholder:text-neutral-600 resize-y min-h-[80px] outline-none focus:border-[#4a4e8a] transition-colors"
              rows={4}
            />
          </Section>

          {/* Signatures */}
          <div className="border-t-2 border-neutral-200 dark:border-dark-300 bg-neutral-50 dark:bg-dark-200 -mx-6 px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Employee Signature
                </Label>
                <p className="mt-2 text-sm text-neutral-400 dark:text-neutral-500 italic">
                  The employee will sign when they view this check-in from their
                  profile.
                </p>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Manager Signature
                </Label>
                <input
                  value={managerSignature}
                  onChange={(e) => setManagerSignature(e.target.value)}
                  placeholder="Sign or type name"
                  className="w-full mt-1 bg-transparent border-b-2 border-neutral-400 dark:border-neutral-500 outline-none text-base font-serif text-neutral-900 dark:text-white pb-1 placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer with actions */}
        <div className="sticky bottom-0 bg-white dark:bg-dark-150 border-t border-neutral-200 dark:border-dark-200 px-6 py-4 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#4a4e8a] hover:bg-[#3a3e78] text-white"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />{" "}
                {isEditing ? "Update Check-In" : "Save Check-In"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

function Section({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-md bg-neutral-100 dark:bg-dark-200 flex items-center justify-center text-[#f26722]">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
            {title}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {desc}
          </p>
        </div>
        <div className="hidden sm:block flex-1 h-px bg-neutral-200 dark:bg-dark-300 ml-2" />
      </div>
      {children}
    </div>
  );
}
