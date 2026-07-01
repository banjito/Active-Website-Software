import React, { useState, useEffect, useCallback } from "react";
import {
  ClipboardList,
  ChevronRight,
  Calendar,
  AlertTriangle,
  Zap,
  Award,
  Eye,
  Edit2,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/toast";
import {
  type OneOnOneCheckin,
  fetchCheckinsForEmployee,
  deleteCheckin,
  signCheckinAsEmployee,
} from "@/services/hr/oneOnOneService";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { OneOnOneForm } from "./OneOnOneForm";

interface OneOnOneListProps {
  employeeId: string;
  employeeName: string;
  currentUserId: string;
  currentUserName: string;
  canStartNew: boolean;
  canEdit: boolean;
}

const PULSE_CONFIG = {
  "needs-attention": {
    label: "Needs Attention",
    icon: AlertTriangle,
    color:
      "text-orange-600 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/40",
  },
  "on-track": {
    label: "On Track",
    icon: Zap,
    color: "text-blue-600 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/40",
  },
  exceeding: {
    label: "Exceeding",
    icon: Award,
    color:
      "text-emerald-600 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40",
  },
} as const;

export const OneOnOneList: React.FC<OneOnOneListProps> = ({
  employeeId,
  employeeName,
  currentUserId,
  currentUserName,
  canStartNew,
  canEdit,
}) => {
  const [checkins, setCheckins] = useState<OneOnOneCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCheckin, setEditingCheckin] = useState<OneOnOneCheckin | null>(
    null,
  );
  const [viewingCheckin, setViewingCheckin] = useState<OneOnOneCheckin | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadCheckins = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const data = await fetchCheckinsForEmployee(employeeId);
      setCheckins(data);
    } catch (err: any) {
      console.error("Failed to load check-ins:", err);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadCheckins();
  }, [loadCheckins]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this check-in? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await deleteCheckin(id);
      toast({
        title: "Deleted",
        description: "Check-in removed.",
        variant: "success",
      });
      loadCheckins();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to delete.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditingCheckin(null);
    loadCheckins();
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#f26722]" />
            One-on-One Check-Ins
          </h3>
          {canStartNew && (
            <Button
              size="sm"
              onClick={() => {
                setEditingCheckin(null);
                setShowForm(true);
              }}
              className="bg-[#4a4e8a] hover:bg-[#3a3e78] text-white text-xs"
            >
              <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
              Start One-on-One
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500 py-2">
            <LoadingSpinner size="sm" />
          </div>
        ) : checkins.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No one-on-one check-ins on file yet.
            {canStartNew && ' Click "Start One-on-One" to begin.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {checkins.map((c) => {
              const pulseInfo = c.overall_pulse
                ? PULSE_CONFIG[c.overall_pulse]
                : null;
              const PulseIcon = pulseInfo?.icon;
              return (
                <li
                  key={c.id}
                  className="group flex items-center justify-between gap-3 rounded-none border border-neutral-200 dark:border-dark-300 p-3 hover:border-neutral-300 dark:hover:border-dark-200 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(c.meeting_date)}
                    </div>
                    {pulseInfo && PulseIcon && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-xs font-semibold ${pulseInfo.color}`}
                      >
                        <PulseIcon className="h-3 w-3" />
                        {pulseInfo.label}
                      </span>
                    )}
                    {c.period_covered && (
                      <span className="text-xs text-neutral-400 truncate">
                        {c.period_covered}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewingCheckin(c)}
                      className="p-1.5 rounded text-neutral-400 hover:text-[#4a4e8a] hover:bg-neutral-100 dark:hover:bg-dark-200"
                      title="View"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCheckin(c);
                            setShowForm(true);
                          }}
                          className="p-1.5 rounded text-neutral-400 hover:text-[#f26722] hover:bg-neutral-100 dark:hover:bg-dark-200"
                          title="Edit"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          disabled={deletingId === c.id}
                          className="p-1.5 rounded text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-dark-200"
                          title="Delete"
                        >
                          {deletingId === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <OneOnOneForm
          employeeId={employeeId}
          employeeName={employeeName}
          managerId={currentUserId}
          managerName={currentUserName}
          existingCheckin={editingCheckin}
          onClose={() => {
            setShowForm(false);
            setEditingCheckin(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {/* Read-only viewer (employee can sign) */}
      {viewingCheckin && (
        <OneOnOneViewer
          checkin={viewingCheckin}
          currentUserId={currentUserId}
          onClose={() => setViewingCheckin(null)}
          onSigned={loadCheckins}
        />
      )}
    </>
  );
};

function OneOnOneViewer({
  checkin,
  currentUserId,
  onClose,
  onSigned,
}: {
  checkin: OneOnOneCheckin;
  currentUserId: string;
  onClose: () => void;
  onSigned: () => void;
}) {
  const pulseInfo = checkin.overall_pulse
    ? PULSE_CONFIG[checkin.overall_pulse]
    : null;
  const PulseIcon = pulseInfo?.icon;

  const isEmployee = currentUserId === checkin.employee_id;
  const canSign = isEmployee && !checkin.employee_signature;

  const [sigValue, setSigValue] = useState("");
  const [signing, setSigning] = useState(false);

  const handleSign = async () => {
    if (!sigValue.trim()) {
      toast({
        title: "Required",
        description: "Please type your name to sign.",
        variant: "warning",
      });
      return;
    }
    setSigning(true);
    try {
      await signCheckinAsEmployee(checkin.id, sigValue.trim());
      toast({
        title: "Signed",
        description: "Your signature has been saved.",
        variant: "success",
      });
      onSigned();
      onClose();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to sign.",
        variant: "destructive",
      });
    } finally {
      setSigning(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto p-4">
      <div className="relative w-full max-w-3xl bg-white dark:bg-dark-150 rounded-none shadow-2xl my-6 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-[#4a4e8a] via-[#52b788] to-[#c9a84c]" />

        <div className="px-6 py-4 border-b border-neutral-200 dark:border-dark-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#4a4e8a] dark:text-[#8b8fd4]">
              One-on-One Check-In
            </p>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white mt-0.5">
              {formatDate(checkin.meeting_date)}
              {checkin.period_covered && (
                <span className="text-neutral-400 font-normal">
                  {" "}
                  - {checkin.period_covered}
                </span>
              )}
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Pulse */}
          {pulseInfo && PulseIcon && (
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-none text-sm font-semibold ${pulseInfo.color}`}
            >
              <PulseIcon className="h-4 w-4" />
              {pulseInfo.label}
            </div>
          )}

          {/* Key Events */}
          {checkin.key_events?.length > 0 && (
            <ViewSection title="Key Events">
              {checkin.key_events.map((e, i) => (
                <div
                  key={i}
                  className="text-sm text-neutral-700 dark:text-neutral-300 mb-2 pl-4 border-l-2 border-[#4a4e8a]/30"
                >
                  {e.description}
                </div>
              ))}
            </ViewSection>
          )}

          {/* Strengths */}
          {checkin.strengths?.length > 0 && (
            <ViewSection title="Strengths & Wins">
              {checkin.strengths.map((s, i) => (
                <div key={i} className="mb-2">
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">
                    {i + 1}. {s.text}
                  </p>
                  {s.followUp && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 italic ml-4">
                      Follow-up: {s.followUp}
                    </p>
                  )}
                </div>
              ))}
            </ViewSection>
          )}

          {/* Development Areas */}
          {checkin.development_areas?.length > 0 && (
            <ViewSection title="Areas to Develop">
              {checkin.development_areas.map((d, i) => (
                <div key={i} className="mb-2">
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">
                    {i + 1}. {d.text}
                  </p>
                  {d.followUp && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 italic ml-4">
                      Action plan: {d.followUp}
                    </p>
                  )}
                </div>
              ))}
            </ViewSection>
          )}

          {/* Goals */}
          {checkin.goals?.length > 0 && (
            <ViewSection title="Goals & Commitments">
              <div className="space-y-1">
                {checkin.goals.map((g, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    <span className="flex-1">{g.goal}</span>
                    {g.status && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-neutral-100 dark:bg-dark-200 text-neutral-600 dark:text-neutral-300 flex-shrink-0">
                        {g.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </ViewSection>
          )}

          {/* Commitments */}
          {(checkin.employee_commitments?.length > 0 ||
            checkin.manager_commitments?.length > 0) && (
            <ViewSection title="Next Period Commitments">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {checkin.employee_commitments?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-neutral-500 mb-1">
                      Employee:
                    </p>
                    <ul className="list-disc list-inside text-sm text-neutral-700 dark:text-neutral-300 space-y-0.5">
                      {checkin.employee_commitments.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {checkin.manager_commitments?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-neutral-500 mb-1">
                      Manager:
                    </p>
                    <ul className="list-disc list-inside text-sm text-neutral-700 dark:text-neutral-300 space-y-0.5">
                      {checkin.manager_commitments.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </ViewSection>
          )}

          {/* Notes */}
          {checkin.additional_notes && (
            <ViewSection title="Additional Notes">
              <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                {checkin.additional_notes}
              </p>
            </ViewSection>
          )}

          {/* Signatures */}
          <div className="border-t-2 border-neutral-200 dark:border-dark-300 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">
                Employee Signature
              </p>
              {checkin.employee_signature ? (
                <p className="font-serif text-neutral-900 dark:text-white">
                  {checkin.employee_signature}
                </p>
              ) : canSign ? (
                <div className="space-y-2">
                  <input
                    value={sigValue}
                    onChange={(e) => setSigValue(e.target.value)}
                    placeholder="Type your name to sign"
                    className="w-full bg-transparent border-b-2 border-neutral-400 dark:border-neutral-500 outline-none text-base font-serif text-neutral-900 dark:text-white pb-1 placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
                  />
                  <Button
                    size="sm"
                    onClick={handleSign}
                    disabled={signing}
                    className="bg-[#4a4e8a] hover:bg-[#3a3e78] text-white"
                  >
                    {signing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />{" "}
                        Signing...
                      </>
                    ) : (
                      "Sign Check-In"
                    )}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-neutral-400 italic">
                  Not yet signed
                </p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">
                Manager Signature
              </p>
              {checkin.manager_signature ? (
                <p className="font-serif text-neutral-900 dark:text-white">
                  {checkin.manager_signature}
                </p>
              ) : (
                <p className="text-sm text-neutral-400 italic">
                  Not yet signed
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
        {title}
      </h4>
      {children}
    </div>
  );
}
