/**
 * The Daily JSA walkthrough (JSA/JHA scope, item 3). Route: /jobs/:id/jsa/:jsaId
 *
 * Built for the lead's phone: one step per screen, big buttons, what to say out loud.
 * The steps and their wording come from the approved questions, copied onto the JSA.
 * Autosaves as you go. Stop Work is on every step. Finishing locks it.
 * Finished JSAs (and anyone who can't lead one) see the record instead.
 *
 * ampOS never picks PPE or works out boundaries. The crew copies the label.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Hand,
  Info,
  Plus,
  Power,
  PowerOff,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { useAuth } from "@/lib/AuthContext";
import { useCan } from "@/lib/permissions";
import { useUnsavedEdits } from "@/lib/unsavedEdits";
import { AutoTextarea, CARD, FIELD, MUTED } from "./safetyUi";
import type { SafetyStep } from "@/lib/safetyQuestions";
import { changesBetween, contentOf as jhaContentOf, EMERGENCY_FIELDS, listJobJhas, type JhaHazard } from "@/lib/jobJha";
import {
  contentOf,
  deleteJsa,
  durationText,
  emptyLabel,
  finishJsa,
  getJobHeader,
  getJsa,
  JsaDraftSaver,
  labelComplete,
  leadOf,
  listCrewChoices,
  missingForFinish,
  newKey,
  openStop,
  stepChecks,
  stepMissing,
  type DailyJsa,
  type JsaContent,
  type JsaCrewMember,
  type JsaLabel,
  type JsaSaveState,
} from "@/lib/dailyJsa";

type JhaNote =
  | { kind: "none" }
  | { kind: "new"; version: number }
  | { kind: "changed"; from: number; to: number; changes: string[] };

interface Loaded {
  jsa: DailyJsa;
  job: { job_number: string | null; title: string | null } | null;
  /** The JSA this one carried over from. */
  prev: DailyJsa | null;
  jhaNote: JhaNote | null;
}

type Change = (fn: (c: JsaContent) => JsaContent) => void;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const dayLabel = (d: string) => format(parseISO(d), "EEE, MMM d");
const time = (iso: string | null) => (iso ? format(new Date(iso), "h:mm a") : "");
const filled = (s: string | null | undefined) => !!s?.trim();

const LABEL_FIELDS: { key: Exclude<keyof JsaLabel, "key">; label: string; hint: string; wide?: boolean }[] = [
  { key: "equipment", label: "Equipment", hint: "Name on the gear, like SWGR-1 main", wide: true },
  { key: "voltage", label: "Nominal voltage", hint: "As on the label" },
  { key: "label_date", label: "Label date", hint: "As on the label" },
  { key: "limited", label: "Limited approach", hint: "As on the label" },
  { key: "restricted", label: "Restricted approach", hint: "As on the label" },
  { key: "arc_boundary", label: "Arc flash boundary", hint: "As on the label" },
  { key: "energy", label: "Incident energy", hint: "cal/cm², as on the label" },
  { key: "ppe_category", label: "PPE category", hint: "If the label shows one" },
];

export default function DailyJsaPage() {
  const { id: jobId = "", jsaId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from ?? `/jobs/${jobId}?tab=safety`;
  const { user } = useAuth();
  const myName = (user?.user_metadata?.name as string | undefined) || user?.email?.split("@")[0] || "";
  const { can } = useCan();
  const canLead = can("safety.lead_jsa");
  const canPractice = can("safety.manage_questions") || can("safety.approve_questions");

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<JsaContent | null>(null);
  const [saveState, setSaveState] = useState<JsaSaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "finish" | "delete" | "close">(null);
  const [sheet, setSheet] = useState<null | "stop" | "resume">(null);
  const saverRef = useRef<JsaDraftSaver | null>(null);
  const contentRef = useRef<JsaContent | null>(null);
  const enteredRef = useRef(Date.now());

  const load = useCallback(async () => {
    try {
      const [jsa, job] = await Promise.all([getJsa(jsaId), getJobHeader(jobId)]);
      if (!jsa || jsa.job_id !== jobId) {
        setError("This JSA doesn't exist, or you can't see it.");
        return;
      }
      const prev = jsa.previous_id ? await getJsa(jsa.previous_id) : null;

      let jhaNote: JhaNote | null = null;
      if (!jsa.jha_id) jhaNote = { kind: "none" };
      else if (prev && prev.jha_version !== jsa.jha_version && jsa.jha_version) {
        if (!prev.jha_id) jhaNote = { kind: "new", version: jsa.jha_version };
        else {
          const jhas = await listJobJhas(jobId);
          const before = jhas.find((j) => j.id === prev.jha_id);
          const after = jhas.find((j) => j.id === jsa.jha_id);
          if (before && after) {
            jhaNote = {
              kind: "changed",
              from: before.version,
              to: after.version,
              changes: changesBetween(jhaContentOf(before), jhaContentOf(after)),
            };
          }
        }
      }

      saverRef.current = null;
      if (jsa.status === "in_progress" && canLead) {
        const saver: JsaDraftSaver = new JsaDraftSaver(jsa.id, jsa.updated_at, (state, msg) => {
          if (saverRef.current !== saver) return;
          setSaveState(state);
          setSaveError(msg ?? null);
        });
        saverRef.current = saver;
      }
      contentRef.current = contentOf(jsa);
      setContent(contentRef.current);
      setData({ jsa, job, prev, jhaNote });
      setSaveState("saved");
      setSaveError(null);
      setError(null);
      enteredRef.current = Date.now();
    } catch (e) {
      setError(message(e));
    }
  }, [jobId, jsaId, canLead]);

  useEffect(() => {
    void load();
    return () => {
      // Leaving the page: finish saving in the background
      void saverRef.current?.flush();
      saverRef.current = null;
    };
  }, [load]);

  useUnsavedEdits(saveState !== "saved" && saveState !== "conflict");

  const change: Change = useCallback((fn) => {
    if (!contentRef.current || !saverRef.current) return;
    const next = fn(contentRef.current);
    contentRef.current = next;
    setContent(next);
    saverRef.current.queue(next);
  }, []);

  const questions = data?.jsa.questions ?? [];
  const index = Math.max(0, questions.findIndex((s) => s.key === content?.current_step));
  const step = questions[index];

  /** Adds the time spent on the current step, and moves to another one. */
  const goTo = (to: number | null) => {
    const secs = Math.round((Date.now() - enteredRef.current) / 1000);
    enteredRef.current = Date.now();
    change((c) => {
      const cur = c.current_step ?? questions[0]?.key ?? "crew";
      return {
        ...c,
        current_step: to === null ? c.current_step : questions[to].key,
        step_seconds: { ...c.step_seconds, [cur]: (c.step_seconds[cur] ?? 0) + secs },
      };
    });
    if (to !== null) window.scrollTo({ top: 0 });
  };

  const close = async () => {
    const saver = saverRef.current;
    if (saver) {
      setBusy("close");
      goTo(null);
      const saved = await saver.flush();
      setBusy(null);
      if (
        !saved &&
        !(await confirmDialog({
          title: "Leave without saving?",
          description: "Your last changes didn't save. Check your signal.",
          confirmLabel: "Leave",
          cancelLabel: "Stay",
          destructive: true,
        }))
      ) {
        return;
      }
    }
    navigate(backTo);
  };

  const finish = async () => {
    const ok = await confirmDialog({
      title: "Finish today's JSA?",
      description: "It locks once it's finished. If things change later today, start a new one.",
      confirmLabel: "Finish and lock",
    });
    if (!ok) return;
    const saver = saverRef.current;
    if (!saver) return;
    setBusy("finish");
    goTo(null);
    try {
      if (!(await saver.flush())) {
        toast({ title: "Not finished", description: "Your last changes didn't save. Try again.", variant: "destructive" });
        return;
      }
      await finishJsa(saver.id, saver.updatedAt);
      await load();
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast({ title: "Couldn't finish", description: message(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (practice: boolean) => {
    const ok = await confirmDialog({
      title: practice ? "Delete this practice JSA?" : "Discard this JSA?",
      description: practice ? "It's only a practice run." : "Only do this if it was started by mistake. Everything on it is lost.",
      confirmLabel: practice ? "Delete" : "Discard",
      destructive: true,
    });
    if (!ok || !data) return;
    setBusy("delete");
    try {
      saverRef.current = null;
      await deleteJsa(data.jsa.id);
      navigate(backTo);
    } catch (e) {
      toast({ title: "Couldn't delete", description: message(e), variant: "destructive" });
      setBusy(null);
    }
  };

  const stopWork = async (byName: string, reason: string) => {
    change((c) => ({
      ...c,
      stops: [
        ...c.stops,
        {
          key: newKey("s"),
          at: new Date().toISOString(),
          by_name: byName.trim(),
          step: c.current_step,
          reason: reason.trim(),
          resumed_at: null,
          resumed_by_name: null,
          resolution: null,
        },
      ],
    }));
    setSheet(null);
    await saverRef.current?.flush();
  };

  const resume = async (byName: string, resolution: string) => {
    change((c) => ({
      ...c,
      stops: c.stops.map((s) =>
        s.resumed_at
          ? s
          : { ...s, resumed_at: new Date().toISOString(), resumed_by_name: byName.trim(), resolution: resolution.trim() },
      ),
    }));
    setSheet(null);
    await saverRef.current?.flush();
  };

  // ─── Loading, errors, record view ───

  if (error) {
    return (
      <Shell>
        <TopBar onClose={() => navigate(backTo)} title="Daily JSA" />
        <div className="mx-auto max-w-2xl px-4 pt-6">
          <div className={`${CARD} p-5 text-sm text-red-600 dark:text-red-400`}>
            {error}
            <Button size="sm" variant="outline" className="ml-3" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </div>
      </Shell>
    );
  }
  if (!data || !content || !step) {
    return (
      <Shell>
        <div className="flex justify-center p-16">
          <LoadingSpinner size="md" />
        </div>
      </Shell>
    );
  }

  const { jsa, job, prev, jhaNote } = data;
  const jobText = [job?.job_number ? `#${job.job_number}` : null, job?.title].filter(Boolean).join(" ");

  if (saveState === "conflict") {
    return (
      <Shell>
        <TopBar onClose={() => navigate(backTo)} title="Daily JSA" subtitle={jobText} />
        <div className="mx-auto max-w-2xl px-4 pt-6">
          <div className={`${CARD} space-y-3 p-5`}>
            <p className="text-base font-semibold text-neutral-900 dark:text-white">Someone else changed this JSA on another phone.</p>
            <p className={`text-sm ${MUTED}`}>Reload to see their changes, then carry on. Your last change wasn't saved.</p>
            <Button onClick={() => void load()}>Reload</Button>
          </div>
        </div>
      </Shell>
    );
  }

  const editable = jsa.status === "in_progress" && canLead && !!saverRef.current;
  if (!editable) {
    return (
      <Shell>
        <TopBar onClose={() => navigate(backTo)} title={`Daily JSA · ${dayLabel(jsa.work_date)}`} subtitle={jobText} />
        <JsaRecord
          jsa={jsa}
          canDelete={jsa.practice && canPractice}
          deleting={busy === "delete"}
          onDelete={() => void remove(true)}
        />
      </Shell>
    );
  }

  // ─── The walkthrough ───

  const missingHere = stepMissing(step, content);
  const allMissing = missingForFinish(questions, content);
  const stopped = openStop(content);
  const last = index === questions.length - 1;
  const startingHazards = new Set(jsa.hazards.map((h) => h.key));

  return (
    <Shell>
      <TopBar
        onClose={() => void close()}
        closing={busy === "close"}
        title={`Step ${index + 1} of ${questions.length} · ${step.title}`}
        subtitle={`Daily JSA · ${jobText}`}
        right={
          <>
            <SaveBadge state={saveState} error={saveError} onRetry={() => void saverRef.current?.flush()} />
            {!stopped && (
              <button
                type="button"
                onClick={() => setSheet("stop")}
                className="flex items-center gap-1.5 bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                <Hand className="h-4 w-4" /> Stop Work
              </button>
            )}
          </>
        }
        progress={{ at: index, total: questions.length }}
      />

      <div className="mx-auto max-w-2xl space-y-5 px-4 pb-36 pt-5">
        {jsa.practice && (
          <Banner tone="neutral" icon={<Info className="h-4 w-4" />}>
            Practice run on the draft questions. It isn't a real JSA, and you can delete it.
          </Banner>
        )}

        {stopped && (
          <div className="space-y-3 border-2 border-red-600 bg-red-50 p-4 dark:bg-red-500/10">
            <p className="flex items-center gap-2 text-base font-bold text-red-700 dark:text-red-400">
              <Hand className="h-5 w-5" /> Work stopped
            </p>
            <p className="text-base text-neutral-900 dark:text-white">{stopped.reason}</p>
            <p className={`text-sm ${MUTED}`}>
              {stopped.by_name || "Someone"} stopped it at {time(stopped.at)}.
            </p>
            <Button onClick={() => setSheet("resume")}>It's fixed. Carry on</Button>
          </div>
        )}

        {index === 0 && jhaNote && <JhaNoteBanner note={jhaNote} />}

        <div className="space-y-4">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">{step.title}</h1>
          {step.prompt && (
            <div className="border-l-4 border-brand bg-brand/5 px-4 py-3">
              <p className={`text-xs font-medium uppercase tracking-wide ${MUTED}`}>Say to the crew</p>
              <p className="mt-1 text-lg leading-snug text-neutral-900 dark:text-white">{step.prompt}</p>
            </div>
          )}
        </div>

        <StepBody
          step={step}
          content={content}
          change={change}
          prev={prev}
          startingHazards={startingHazards}
          allMissing={allMissing}
          onJump={(i) => goTo(i)}
        />

        <Checks step={step} content={content} change={change} />

        {(step.help || step.refs.length > 0) && (
          <p className={`text-sm ${MUTED}`}>
            {step.help}
            {step.refs.length > 0 && <span className="ml-1 whitespace-nowrap">NFPA 70E {step.refs.join(", ")}.</span>}
          </p>
        )}

        {last && (
          <button
            type="button"
            onClick={() => void remove(jsa.practice)}
            disabled={busy !== null}
            className="text-sm text-neutral-500 underline underline-offset-2 hover:text-red-600 dark:text-neutral-400"
          >
            {jsa.practice ? "Delete this practice JSA" : "Started by mistake? Discard it"}
          </button>
        )}
      </div>

      {/* Back and Next. Left padding on phones keeps clear of the Issue button. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-700 dark:bg-dark-150/95 print:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 max-sm:pl-16">
          <Button variant="outline" disabled={index === 0} onClick={() => goTo(index - 1)} leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back
          </Button>
          <p className="min-w-0 flex-1 text-right text-xs text-amber-700 dark:text-amber-400">
            {stopped ? "Work is stopped." : last ? (allMissing.length > 0 ? "Some steps aren't done yet." : "") : missingHere[0]}
          </p>
          {last ? (
            <Button
              disabled={allMissing.length > 0 || busy !== null}
              isLoading={busy === "finish"}
              onClick={() => void finish()}
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              Finish JSA
            </Button>
          ) : (
            <Button disabled={missingHere.length > 0 || !!stopped} onClick={() => goTo(index + 1)} rightIcon={<ArrowRight className="h-4 w-4" />}>
              Next
            </Button>
          )}
        </div>
      </div>

      {sheet === "stop" && (
        <Sheet
          title="Stop Work"
          intro="Anyone can stop the work. Say what's wrong. The JSA can't go on until it's sorted out."
          textLabel="What's wrong?"
          confirmLabel="Stop the work"
          danger
          defaultName={myName}
          onCancel={() => setSheet(null)}
          onConfirm={(name, text) => void stopWork(name, text)}
        />
      )}
      {sheet === "resume" && stopped && (
        <Sheet
          title="Carry on"
          intro={`Stopped for: ${stopped.reason}`}
          textLabel="What did we do about it?"
          confirmLabel="Carry on"
          defaultName={myName}
          onCancel={() => setSheet(null)}
          onConfirm={(name, text) => void resume(name, text)}
        />
      )}
    </Shell>
  );
}

// ─── Frame ──────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-neutral-900 dark:bg-dark-background dark:text-white">{children}</div>;
}

function TopBar({
  title,
  subtitle,
  onClose,
  closing,
  right,
  progress,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  closing?: boolean;
  right?: React.ReactNode;
  progress?: { at: number; total: number };
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150 print:hidden">
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-2">
        <button
          type="button"
          onClick={onClose}
          disabled={closing}
          aria-label="Close"
          className="-ml-2 flex h-10 w-10 flex-shrink-0 items-center justify-center text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-dark-200"
        >
          {closing ? <LoadingSpinner size="sm" /> : <X className="h-5 w-5" />}
        </button>
        <div className="min-w-0 flex-1">
          {subtitle && <p className={`truncate text-xs ${MUTED}`}>{subtitle}</p>}
          <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{title}</p>
        </div>
        {right}
      </div>
      {progress && (
        <div className="mx-auto flex max-w-2xl gap-1 px-4 pb-2" aria-hidden>
          {Array.from({ length: progress.total }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 ${i < progress.at ? "bg-brand" : i === progress.at ? "bg-brand/50" : "bg-neutral-200 dark:bg-neutral-700"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SaveBadge({ state, error, onRetry }: { state: JsaSaveState; error: string | null; onRetry: () => void }) {
  if (state === "error") {
    return (
      <button type="button" onClick={onRetry} title={error ?? undefined} className="text-xs font-medium text-red-600 underline dark:text-red-400">
        Not saved. Retry
      </button>
    );
  }
  return (
    <span className={`text-xs ${MUTED} max-sm:hidden`}>
      {state === "saved" ? "Saved" : state === "saving" ? "Saving…" : "Not saved yet"}
    </span>
  );
}

function Banner({ tone, icon, children }: { tone: "amber" | "neutral"; icon: React.ReactNode; children: React.ReactNode }) {
  const tones = {
    amber: "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200",
    neutral: "border-neutral-400 bg-neutral-100 text-neutral-800 dark:bg-dark-200 dark:text-neutral-200",
  };
  return (
    <div className={`flex gap-2.5 border-l-4 p-3 text-sm ${tones[tone]}`}>
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

function JhaNoteBanner({ note }: { note: JhaNote }) {
  if (note.kind === "none") {
    return (
      <Banner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
        This job has no finished JHA yet. Go ahead, and tell your PM.
      </Banner>
    );
  }
  if (note.kind === "new") {
    return (
      <Banner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
        The JHA was finished since the last JSA (version {note.version}). Today starts from it. Go over it with the crew.
      </Banner>
    );
  }
  return (
    <Banner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
      <p className="font-medium">
        The JHA changed since the last JSA (version {note.from} to {note.to}). Tell the crew:
      </p>
      {note.changes.length > 0 ? (
        <ul className="list-disc pl-5">
          {note.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : (
        <p>Only small wording changes.</p>
      )}
    </Banner>
  );
}

/** A popup from the bottom: Stop Work, and carrying on after one. */
function Sheet({
  title,
  intro,
  textLabel,
  confirmLabel,
  danger,
  defaultName,
  onCancel,
  onConfirm,
}: {
  title: string;
  intro: string;
  textLabel: string;
  confirmLabel: string;
  danger?: boolean;
  defaultName: string;
  onCancel: () => void;
  onConfirm: (name: string, text: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [text, setText] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" onClick={onCancel}>
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-lg space-y-4 rounded-[0px] bg-white p-5 dark:bg-dark-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className={`flex items-center gap-2 text-lg font-bold ${danger ? "text-red-700 dark:text-red-400" : "text-neutral-900 dark:text-white"}`}>
            {danger && <Hand className="h-5 w-5" />}
            {title}
          </h2>
          <button type="button" onClick={onCancel} aria-label="Cancel" className="p-1 text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className={`text-sm ${MUTED}`}>{intro}</p>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-900 dark:text-white">{textLabel}</span>
          <AutoTextarea autoFocus value={text} onChange={(e) => setText(e.target.value)} className={`${FIELD} min-h-[4.5rem]`} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-900 dark:text-white">Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={danger ? "destructive" : "primary"}
            disabled={!text.trim() || !name.trim()}
            onClick={() => onConfirm(name, text)}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Steps ──────────────────────────────────────────────────────────────────

function StepBody({
  step,
  content,
  change,
  prev,
  startingHazards,
  allMissing,
  onJump,
}: {
  step: SafetyStep;
  content: JsaContent;
  change: Change;
  prev: DailyJsa | null;
  startingHazards: Set<string>;
  allMissing: ReturnType<typeof missingForFinish>;
  onJump: (index: number) => void;
}) {
  switch (step.key) {
    case "crew":
      return <CrewStep content={content} change={change} prev={prev} />;
    case "work":
      return <WorkStep content={content} change={change} prev={prev} />;
    case "hazards":
      return <HazardsStep content={content} change={change} startingHazards={startingHazards} />;
    case "power":
      return <PowerStep content={content} change={change} />;
    case "shock_arc":
      return <LabelsStep content={content} change={change} prev={prev} />;
    case "emergency":
      return <EmergencyStep content={content} change={change} />;
    case "sign":
      return <SignStep content={content} allMissing={allMissing} onJump={onJump} />;
    default:
      return null;
  }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-neutral-900 dark:text-white">{label}</span>
      {children}
      {hint && <span className={`block text-xs ${MUTED}`}>{hint}</span>}
    </label>
  );
}

function CrewStep({ content, change, prev }: { content: JsaContent; change: Change; prev: DailyJsa | null }) {
  const [choices, setChoices] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState<string | null>(null);

  useEffect(() => {
    listCrewChoices()
      .then(setChoices)
      .catch(() => setChoices([]));
  }, []);

  const crew = content.crew;
  const has = (m: { user_id?: string | null; name: string }) =>
    crew.some((c) => (m.user_id && c.user_id === m.user_id) || c.name.trim().toLowerCase() === m.name.trim().toLowerCase());

  const add = (m: Omit<JsaCrewMember, "key" | "lead">) => {
    change((c) => ({ ...c, crew: [...c.crew, { ...m, key: newKey("p"), lead: c.crew.length === 0 }] }));
    setSearch("");
    setCompany(null);
  };
  const removeMember = (key: string) =>
    change((c) => {
      const left = c.crew.filter((m) => m.key !== key);
      // Someone has to stay in charge
      if (left.length > 0 && !left.some((m) => m.lead)) left[0] = { ...left[0], lead: true };
      return { ...c, crew: left };
    });
  const makeLead = (key: string) => change((c) => ({ ...c, crew: c.crew.map((m) => ({ ...m, lead: m.key === key })) }));

  const q = search.trim().toLowerCase();
  const matches = q ? choices.filter((p) => p.name.toLowerCase().includes(q) && !has({ user_id: p.id, name: p.name })).slice(0, 6) : [];
  const fromLast = (prev?.crew ?? []).filter((m) => !has(m));

  return (
    <div className="space-y-4">
      <ul className={`${CARD} divide-y divide-neutral-100 dark:divide-neutral-800`}>
        {crew.map((m) => (
          <li key={m.key} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base text-neutral-900 dark:text-white">{m.name}</p>
              {m.company && <p className={`truncate text-xs ${MUTED}`}>{m.company}</p>}
            </div>
            {m.lead ? (
              <span className="bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">In charge</span>
            ) : (
              <button
                type="button"
                onClick={() => makeLead(m.key)}
                className="px-2 py-1 text-xs text-neutral-600 underline underline-offset-2 hover:text-brand dark:text-neutral-300"
              >
                Make in charge
              </button>
            )}
            <button
              type="button"
              onClick={() => removeMember(m.key)}
              aria-label={`Remove ${m.name}`}
              className="p-2 text-neutral-400 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
        {crew.length === 0 && <li className={`px-3 py-3 text-sm ${MUTED}`}>No one yet.</li>}
      </ul>

      {fromLast.length > 0 && (
        <div className="space-y-2">
          <p className={`text-sm ${MUTED}`}>On the last JSA ({dayLabel(prev!.work_date)}). Tap to add:</p>
          <div className="flex flex-wrap gap-2">
            {fromLast.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => add({ name: m.name, user_id: m.user_id, company: m.company })}
                className="flex items-center gap-1.5 border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 hover:border-brand dark:border-neutral-600 dark:bg-dark-150 dark:text-neutral-200"
              >
                <Plus className="h-3.5 w-3.5" /> {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Field label="Add someone">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCompany(null);
            }}
            placeholder="Type a name"
            className={FIELD}
          />
        </Field>
        {matches.length > 0 && (
          <ul className={`${CARD} divide-y divide-neutral-100 dark:divide-neutral-800`}>
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => add({ name: p.name, user_id: p.id, company: null })}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-base hover:bg-neutral-50 dark:hover:bg-dark-200"
                >
                  <UserPlus className="h-4 w-4 text-neutral-400" /> {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {q && company === null && (
          <button
            type="button"
            onClick={() => setCompany("")}
            className="text-sm text-brand underline underline-offset-2"
          >
            Add "{search.trim()}" as a temp or sub
          </button>
        )}
        {q && company !== null && (
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field label={`Who does ${search.trim()} work for?`}>
                <input
                  autoFocus
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && company.trim()) add({ name: search.trim(), user_id: null, company: company.trim() });
                  }}
                  placeholder="Company"
                  className={FIELD}
                />
              </Field>
            </div>
            <Button disabled={!company.trim()} onClick={() => add({ name: search.trim(), user_id: null, company: company.trim() })}>
              Add
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function WorkStep({ content, change, prev }: { content: JsaContent; change: Change; prev: DailyJsa | null }) {
  return (
    <div className="space-y-4">
      <Field label="Today's work" hint="What, where, and on which gear.">
        <AutoTextarea
          value={content.work_summary}
          onChange={(e) => change((c) => ({ ...c, work_summary: e.target.value }))}
          className={`${FIELD} min-h-[4.5rem]`}
        />
      </Field>
      <Field
        label="What's different today?"
        hint={
          prev
            ? `Compared with the last JSA (${dayLabel(prev.work_date)}): new area, gear, people, weather, other trades nearby.`
            : "Compared with the JHA: anything the plan didn't expect."
        }
      >
        <AutoTextarea
          value={content.changes_today}
          onChange={(e) => change((c) => ({ ...c, changes_today: e.target.value }))}
          className={`${FIELD} min-h-[4.5rem]`}
        />
      </Field>
    </div>
  );
}

function HazardsStep({ content, change, startingHazards }: { content: JsaContent; change: Change; startingHazards: Set<string> }) {
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const edit = (key: string, part: Partial<JhaHazard>) =>
    change((c) => ({ ...c, hazards: c.hazards.map((h) => (h.key === key ? { ...h, ...part } : h)) }));
  const add = () => {
    const key = newKey("h");
    change((c) => ({ ...c, hazards: [...c.hazards, { key, hazard: "", controls: "", from: null }] }));
    setFocusKey(key);
  };

  return (
    <div className="space-y-3">
      {content.hazards.map((h) => (
        <div key={h.key} className={`${CARD} space-y-2 p-3`}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              {!startingHazards.has(h.key) && (
                <span className="inline-block bg-brand/10 px-1.5 py-0.5 text-xs font-medium text-brand">New today</span>
              )}
              <AutoTextarea
                autoFocus={h.key === focusKey}
                value={h.hazard}
                onChange={(e) => edit(h.key, { hazard: e.target.value })}
                placeholder="Hazard"
                className={`${FIELD} font-medium`}
              />
            </div>
            <button
              type="button"
              aria-label="Remove hazard"
              onClick={() => change((c) => ({ ...c, hazards: c.hazards.filter((x) => x.key !== h.key) }))}
              className="p-2 text-neutral-400 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <AutoTextarea
            value={h.controls}
            onChange={(e) => edit(h.key, { controls: e.target.value })}
            placeholder="How we control it"
            className={FIELD}
          />
        </div>
      ))}
      {content.hazards.length === 0 && <p className={`text-sm ${MUTED}`}>No hazards yet.</p>}
      <Button variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={add}>
        Add a hazard
      </Button>
    </div>
  );
}

function PowerStep({ content, change }: { content: JsaContent; change: Change }) {
  const pick = (power: "off" | "on") => change((c) => ({ ...c, power }));
  const option = (value: "off" | "on", icon: React.ReactNode, title: string, sub: string) => {
    const on = content.power === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => pick(value)}
        className={`flex w-full items-start gap-3 border-2 p-4 text-left ${
          on ? "border-brand bg-brand/5" : "border-neutral-300 bg-white hover:border-neutral-400 dark:border-neutral-600 dark:bg-dark-150"
        }`}
      >
        <span className={`mt-0.5 ${on ? "text-brand" : "text-neutral-500"}`}>{icon}</span>
        <span>
          <span className="block text-base font-semibold text-neutral-900 dark:text-white">{title}</span>
          <span className={`block text-sm ${MUTED}`}>{sub}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Power" className="grid gap-3 sm:grid-cols-2">
        {option("off", <PowerOff className="h-6 w-6" />, "Power off", "We make it safe before anyone touches it.")}
        {option("on", <Power className="h-6 w-6" />, "Power stays on", "Needs a reason. Live work needs a permit.")}
      </div>
      {content.power === "on" && (
        <>
          <Field label="Why can't the power be off?">
            <AutoTextarea
              value={content.power_reason}
              onChange={(e) => change((c) => ({ ...c, power_reason: e.target.value }))}
              className={`${FIELD} min-h-[4.5rem]`}
            />
          </Field>
          <Banner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
            Live work needs a signed Energized Work Permit and a second person named before anyone starts.
          </Banner>
        </>
      )}
    </div>
  );
}

function LabelsStep({ content, change, prev }: { content: JsaContent; change: Change; prev: DailyJsa | null }) {
  const edit = (key: string, part: Partial<JsaLabel>) =>
    change((c) => ({ ...c, labels: c.labels.map((l) => (l.key === key ? { ...l, ...part } : l)) }));
  const lastLabels = prev?.labels ?? [];

  return (
    <div className="space-y-3">
      <p className={`text-sm ${MUTED}`}>Copy each label as it's written. ampOS never works these out.</p>

      {!content.no_label && (
        <>
          {content.labels.map((l, i) => (
            <div key={l.key} className={`${CARD} space-y-3 p-3`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Label {i + 1}
                  {labelComplete(l) && <Check className="ml-1.5 inline h-4 w-4 text-emerald-600" />}
                </p>
                <button
                  type="button"
                  aria-label="Remove label"
                  onClick={() => change((c) => ({ ...c, labels: c.labels.filter((x) => x.key !== l.key) }))}
                  className="p-1.5 text-neutral-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {LABEL_FIELDS.map((f) => (
                  <div key={f.key} className={f.wide ? "col-span-2" : ""}>
                    <Field label={f.label}>
                      <input
                        value={l[f.key]}
                        onChange={(e) => edit(l.key, { [f.key]: e.target.value } as Partial<JsaLabel>)}
                        placeholder={f.hint}
                        className={FIELD}
                      />
                    </Field>
                  </div>
                ))}
              </div>
              <p className={`text-xs ${MUTED}`}>Needed: equipment, arc flash boundary, and incident energy or PPE category.</p>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => change((c) => ({ ...c, labels: [...c.labels, emptyLabel()] }))}
            >
              {content.labels.length === 0 ? "Add a label" : "Add another label"}
            </Button>
            {content.labels.length === 0 && lastLabels.length > 0 && (
              <Button
                variant="outline"
                leftIcon={<Copy className="h-4 w-4" />}
                onClick={() => change((c) => ({ ...c, labels: lastLabels.map((l) => ({ ...l, key: newKey("l") })) }))}
              >
                Copy the last JSA's labels
              </Button>
            )}
          </div>
          {content.labels.length > 0 && lastLabels.length > 0 && (
            <p className={`text-xs ${MUTED}`}>Copied labels: read each one against the label on the gear.</p>
          )}
        </>
      )}

      <label className="flex items-start gap-3 py-1">
        <input
          type="checkbox"
          checked={content.no_label}
          onChange={(e) => change((c) => ({ ...c, no_label: e.target.checked }))}
          className="mt-1 h-5 w-5 rounded-none accent-[var(--brand)]"
        />
        <span className="text-base text-neutral-900 dark:text-white">No label, or the label is out of date</span>
      </label>
      {content.no_label && (
        <Field label="What's the plan?" hint="Stop and call the PM before anyone works on it.">
          <AutoTextarea
            value={content.no_label_note}
            onChange={(e) => change((c) => ({ ...c, no_label_note: e.target.value }))}
            className={`${FIELD} min-h-[4.5rem]`}
          />
        </Field>
      )}
    </div>
  );
}

function EmergencyStep({ content, change }: { content: JsaContent; change: Change }) {
  return (
    <div className="space-y-3">
      {EMERGENCY_FIELDS.map((f) => (
        <Field key={f.key} label={f.required ? f.label : `${f.label} (if known)`} hint={f.hint}>
          <AutoTextarea
            value={content.emergency_plan[f.key] ?? ""}
            onChange={(e) => change((c) => ({ ...c, emergency_plan: { ...c.emergency_plan, [f.key]: e.target.value } }))}
            className={FIELD}
          />
        </Field>
      ))}
    </div>
  );
}

function SignStep({
  content,
  allMissing,
  onJump,
}: {
  content: JsaContent;
  allMissing: ReturnType<typeof missingForFinish>;
  onJump: (index: number) => void;
}) {
  return (
    <div className="space-y-4">
      <ul className={`${CARD} divide-y divide-neutral-100 dark:divide-neutral-800`}>
        {content.crew.map((m) => (
          <li key={m.key} className="flex items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-base text-neutral-900 dark:text-white">
              {m.name}
              {m.company && <span className={`ml-2 text-xs ${MUTED}`}>{m.company}</span>}
            </span>
            {m.lead && <span className="bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">In charge</span>}
          </li>
        ))}
      </ul>
      <Banner tone="neutral" icon={<Info className="h-4 w-4" />}>
        Signing on each person's phone is coming next. For now, finishing saves who was here and the time.
      </Banner>
      {allMissing.length > 0 && (
        <div className="space-y-2 border-l-4 border-amber-500 bg-amber-50 p-3 dark:bg-amber-500/10">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Before you can finish</p>
          <ul className="space-y-1.5">
            {allMissing.map((m) => (
              <li key={m.step} className="text-sm text-amber-900 dark:text-amber-200">
                {m.step >= 0 ? (
                  <button type="button" onClick={() => onJump(m.step)} className="font-medium underline underline-offset-2">
                    {m.title}
                  </button>
                ) : (
                  <span className="font-medium">{m.title}</span>
                )}
                : {m.items.join(". ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Checks({ step, content, change }: { step: SafetyStep; content: JsaContent; change: Change }) {
  const checks = stepChecks(step, content.power);
  const answer = content.answers[step.key] ?? { checked: [], note: "" };
  const unticked = checks.some((c) => !answer.checked.includes(c.key));
  const set = (next: Partial<typeof answer>) =>
    change((c) => ({ ...c, answers: { ...c.answers, [step.key]: { ...answer, ...c.answers[step.key], ...next } } }));
  const toggle = (key: string) => {
    const now = content.answers[step.key]?.checked ?? [];
    set({ checked: now.includes(key) ? now.filter((k) => k !== key) : [...now, key] });
  };

  if (step.key === "power" && !content.power) return null;

  return (
    <div className="space-y-3">
      {checks.length > 0 && (
        <div className="space-y-2">
          {checks.map((c) => {
            const on = answer.checked.includes(c.key);
            return (
              <button
                key={c.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(c.key)}
                className={`flex min-h-[52px] w-full items-start gap-3 border p-3 text-left ${
                  on
                    ? "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-500/10"
                    : "border-neutral-300 bg-white hover:border-neutral-400 dark:border-neutral-600 dark:bg-dark-150"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center border-2 ${
                    on ? "border-emerald-600 bg-emerald-600 text-white" : "border-neutral-400 dark:border-neutral-500"
                  }`}
                >
                  {on && <Check className="h-4 w-4" />}
                </span>
                <span className="text-base text-neutral-900 dark:text-white">{c.text}</span>
              </button>
            );
          })}
        </div>
      )}
      <Field label={unticked && checks.length > 0 ? "Note (needed: say why an item isn't ticked)" : "Note (optional)"}>
        <AutoTextarea value={answer.note} onChange={(e) => set({ note: e.target.value })} className={FIELD} />
      </Field>
    </div>
  );
}

// ─── The record ─────────────────────────────────────────────────────────────

function JsaRecord({
  jsa,
  canDelete,
  deleting,
  onDelete,
}: {
  jsa: DailyJsa;
  canDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  const lead = leadOf(jsa.crew);
  const took = durationText(jsa.started_at, jsa.finished_at);
  const rows: [string, React.ReactNode][] = [
    ["Status", jsa.status === "done" ? "Done" : "In progress"],
    ["In charge", lead?.name ?? "No one named"],
    ["Started", `${time(jsa.started_at)} by ${jsa.started_by_name || "someone"}`],
    ["Finished", jsa.finished_at ? `${time(jsa.finished_at)} by ${jsa.finished_by_name || "someone"}${took ? ` · took ${took}` : ""}` : "Not yet"],
    ["JHA", jsa.jha_version ? `Version ${jsa.jha_version}` : "No finished JHA"],
    ["Questions", `Version ${jsa.question_set_version}`],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 pb-16 pt-5">
      {jsa.practice && (
        <Banner tone="neutral" icon={<Info className="h-4 w-4" />}>
          Practice run on the draft questions. It isn't a real JSA.
        </Banner>
      )}
      {jsa.status === "in_progress" && (
        <Banner tone="amber" icon={<Info className="h-4 w-4" />}>
          In progress. The person in charge is walking the crew through it.
        </Banner>
      )}

      <div className={`${CARD} p-4`}>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className={MUTED}>{k}</dt>
              <dd className="text-neutral-900 dark:text-white">{v}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>

      {jsa.stops.length > 0 && (
        <div className={`${CARD} space-y-3 p-4`}>
          <h2 className="flex items-center gap-2 text-base font-semibold text-red-700 dark:text-red-400">
            <Hand className="h-4 w-4" /> Stop Work
          </h2>
          {jsa.stops.map((s) => (
            <div key={s.key} className="space-y-0.5 text-sm">
              <p className="text-neutral-900 dark:text-white">{s.reason}</p>
              <p className={MUTED}>
                {s.by_name || "Someone"} stopped it at {time(s.at)}.
                {s.resumed_at ? ` ${s.resumed_by_name || "Someone"} carried on at ${time(s.resumed_at)}: ${s.resolution}` : " Not resolved."}
              </p>
            </div>
          ))}
        </div>
      )}

      {jsa.questions.map((step, i) => (
        <StepRecord key={step.key} n={i + 1} step={step} jsa={jsa} />
      ))}

      {canDelete && (
        <Button variant="outline" leftIcon={<Trash2 className="h-4 w-4" />} isLoading={deleting} onClick={onDelete}>
          Delete this practice JSA
        </Button>
      )}
    </div>
  );
}

function StepRecord({ n, step, jsa }: { n: number; step: SafetyStep; jsa: DailyJsa }) {
  const answer = jsa.answers[step.key];
  const checks = stepChecks(step, jsa.power);
  const seconds = jsa.step_seconds[step.key];

  const body = useMemo(() => {
    switch (step.key) {
      case "crew":
        return (
          <ul className="text-sm">
            {jsa.crew.map((m) => (
              <li key={m.key} className="text-neutral-900 dark:text-white">
                {m.name}
                {m.company && <span className={MUTED}> · {m.company}</span>}
                {m.lead && <span className="ml-2 text-xs font-semibold text-brand">In charge</span>}
              </li>
            ))}
          </ul>
        );
      case "work":
        return (
          <div className="space-y-2 text-sm">
            <p className="whitespace-pre-wrap text-neutral-900 dark:text-white">{jsa.work_summary || "Not filled in"}</p>
            <p>
              <span className={MUTED}>Different today: </span>
              <span className="whitespace-pre-wrap text-neutral-900 dark:text-white">{jsa.changes_today || "Not filled in"}</span>
            </p>
          </div>
        );
      case "hazards":
        return (
          <ul className="space-y-1.5 text-sm">
            {jsa.hazards.map((h) => (
              <li key={h.key}>
                <span className="font-medium text-neutral-900 dark:text-white">{h.hazard}</span>
                <span className={MUTED}>: {h.controls}</span>
              </li>
            ))}
          </ul>
        );
      case "power":
        return (
          <p className="text-sm text-neutral-900 dark:text-white">
            {jsa.power === "on" ? `Power stays on. Why: ${jsa.power_reason}` : jsa.power === "off" ? "Power off" : "Not picked"}
          </p>
        );
      case "shock_arc":
        return jsa.no_label ? (
          <p className="text-sm text-neutral-900 dark:text-white">No label or an old label. Plan: {jsa.no_label_note}</p>
        ) : (
          <div className="space-y-2">
            {jsa.labels.map((l) => (
              <dl key={l.key} className="grid grid-cols-[9rem_1fr] gap-x-3 text-sm">
                {LABEL_FIELDS.filter((f) => filled(l[f.key])).map((f) => (
                  <React.Fragment key={f.key}>
                    <dt className={MUTED}>{f.label}</dt>
                    <dd className="text-neutral-900 dark:text-white">{l[f.key]}</dd>
                  </React.Fragment>
                ))}
              </dl>
            ))}
          </div>
        );
      case "emergency":
        return (
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
            {EMERGENCY_FIELDS.filter((f) => filled(jsa.emergency_plan[f.key])).map((f) => (
              <React.Fragment key={f.key}>
                <dt className={MUTED}>{f.label}</dt>
                <dd className="whitespace-pre-wrap text-neutral-900 dark:text-white">{jsa.emergency_plan[f.key]}</dd>
              </React.Fragment>
            ))}
          </dl>
        );
      default:
        return null;
    }
  }, [step.key, jsa]);

  return (
    <section className={`${CARD} space-y-3 p-4`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
          {n}. {step.title}
        </h2>
        {seconds ? <span className={`text-xs ${MUTED}`}>{seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`}</span> : null}
      </div>
      {body}
      {checks.length > 0 && (
        <ul className="space-y-1">
          {checks.map((c) => {
            const on = !!answer?.checked.includes(c.key);
            return (
              <li key={c.key} className="flex items-start gap-2 text-sm">
                {on ? (
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                ) : (
                  <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
                )}
                <span className={on ? "text-neutral-900 dark:text-white" : "text-red-700 dark:text-red-400"}>{c.text}</span>
              </li>
            );
          })}
        </ul>
      )}
      {filled(answer?.note) && (
        <p className="text-sm">
          <span className={MUTED}>Note: </span>
          <span className="whitespace-pre-wrap text-neutral-900 dark:text-white">{answer?.note}</span>
        </p>
      )}
    </section>
  );
}
