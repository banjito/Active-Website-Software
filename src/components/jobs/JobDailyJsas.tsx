/**
 * Job → Safety → Daily JSAs (JSA/JHA scope, item 3).
 * Today's JSA up top, then every day's, newest first. Opening one goes to /jobs/:id/jsa/:jsaId.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CheckCircle2, ChevronRight, Hand, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";
import { useAuth } from "@/lib/AuthContext";
import { useCan } from "@/lib/permissions";
import { CARD, MUTED } from "@/app/safety/safetyUi";
import { getQuestionSetInUse } from "@/lib/safetyQuestions";
import {
  durationText,
  leadOf,
  listJobJsas,
  openStop,
  SHORT_JSA_MINUTES,
  deleteJsa,
  startJsa,
  today,
  type DailyJsaRow,
} from "@/lib/dailyJsa";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const dayLabel = (d: string) => format(parseISO(d), "EEE, MMM d");
const time = (iso: string | null) => (iso ? format(new Date(iso), "h:mm a") : "");
const TEXT_BUTTON = "font-medium text-brand hover:underline hover:underline-offset-2 disabled:opacity-60";

export default function JobDailyJsas({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const { can } = useCan();
  const canLead = can("safety.lead_jsa");
  const canPractice = can("safety.manage_questions") || can("safety.approve_questions");
  const canApprove = can("safety.approve_questions");
  const navigate = useNavigate();
  const location = useLocation();

  const [rows, setRows] = useState<DailyJsaRow[] | null>(null);
  const [questionsReady, setQuestionsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "start" | "practice">(null);

  const load = useCallback(async () => {
    try {
      const [list, inUse] = await Promise.all([listJobJsas(jobId), getQuestionSetInUse()]);
      setRows(list);
      setQuestionsReady(!!inUse);
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (id: string) =>
    navigate(`/jobs/${jobId}/jsa/${id}`, { state: { from: location.pathname + location.search } });

  const start = async (practice: boolean) => {
    setBusy(practice ? "practice" : "start");
    try {
      open(await startJsa(jobId, practice));
    } catch (e) {
      toast({ title: "Couldn't start the JSA", description: message(e), variant: "destructive" });
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteJsa(id);
      setRows((list) => list?.filter((r) => r.id !== id) ?? list);
    } catch (e) {
      toast({ title: "Couldn't delete the JSA", description: message(e), variant: "destructive" });
    }
  };

  if (error) {
    return (
      <div className={`${CARD} p-5 text-sm text-red-600 dark:text-red-400`}>
        Couldn't load the Daily JSAs: {error}
        <Button size="sm" variant="outline" className="ml-3" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!rows) {
    return (
      <div className="flex justify-center p-10">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  // Today's, practice runs included, so a JSA you already started picks up where you left off
  const todays = rows.filter((r) => r.work_date === today());
  const running = todays.filter((r) => r.status === "in_progress");
  const runningReal = running.filter((r) => !r.practice);
  const doneToday = todays.filter((r) => r.status === "done" && !r.practice);

  return (
    <div className="space-y-4">
      {/* Today */}
      <div className={`${CARD} p-5 max-sm:p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Today's JSA</h3>
            <p className={`mt-0.5 text-sm ${MUTED}`}>{format(new Date(), "EEEE, MMMM d")}</p>
          </div>
          {questionsReady && canLead && runningReal.length === 0 && (
            <Button
              leftIcon={<Play className="h-4 w-4" />}
              isLoading={busy === "start"}
              disabled={busy !== null}
              onClick={() => void start(false)}
            >
              {doneToday.length > 0 ? "Start another crew's JSA" : "Start today's JSA"}
            </Button>
          )}
        </div>

        {!questionsReady && (
          <div className="mt-4 flex gap-2.5 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="space-y-2">
              <p>Crews can't start a Daily JSA until the safety lead approves the questions.</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {canApprove && (
                  <Link to="/admin-dashboard/safety-questions" className={TEXT_BUTTON}>
                    Review the questions
                  </Link>
                )}
                {canPractice && !running.some((r) => r.practice) && (
                  <button type="button" className={TEXT_BUTTON} disabled={busy !== null} onClick={() => void start(true)}>
                    {busy === "practice" ? "Starting…" : "Try a practice JSA"}
                  </button>
                )}
              </div>
              {canPractice && (
                <p className="text-xs opacity-80">
                  A practice JSA uses the draft questions. It's tagged Practice and you can delete it.
                </p>
              )}
            </div>
          </div>
        )}

        {running.map((r) => {
          const mine = !!user && r.started_by === user.id;
          const what = r.practice ? "a practice JSA" : "today's JSA";
          const canDelete = canLead || (r.practice && canPractice);
          return (
            <div key={r.id} className="mt-4 flex items-center gap-2 border border-brand/40 bg-brand/5 p-3 max-sm:gap-1">
              <button type="button" onClick={() => open(r.id)} className="min-w-0 flex-1 text-left text-sm text-neutral-900 dark:text-white">
                {mine ? "You" : <span className="font-medium">{r.started_by_name || "Someone"}</span>} started {what} at{" "}
                {time(r.started_at)}.
                <span className={`block text-xs ${MUTED}`}>
                  {canLead ? "Pick up where it left off." : "Open it to see where they are."}
                </span>
              </button>
              {canDelete && (
                <ConfirmPopover
                  side="bottom"
                  message={r.practice ? "Delete this practice JSA?" : "Delete today's JSA? Everything on it is lost."}
                  confirmLabel="Delete"
                  destructive
                  onConfirm={() => remove(r.id)}
                >
                  <button
                    type="button"
                    aria-label="Delete this JSA"
                    className="p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </ConfirmPopover>
              )}
              <button
                type="button"
                onClick={() => open(r.id)}
                className="flex items-center gap-1 px-2 py-2 text-sm font-medium text-brand hover:underline"
              >
                {canLead ? "Resume" : "Open"} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {doneToday.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => open(r.id)}
            className="mt-4 flex w-full items-center gap-3 border border-emerald-500/40 bg-emerald-50 p-3 text-left hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20"
          >
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" />
            <span className="min-w-0 flex-1 text-sm text-neutral-900 dark:text-white">
              Done at {time(r.finished_at)}. {leadOf(r.crew)?.name || r.started_by_name || "Someone"} in charge, {r.crew.length}{" "}
              {r.crew.length === 1 ? "person" : "people"}.
            </span>
            <span className="flex items-center gap-1 text-sm font-medium text-brand">
              View <ChevronRight className="h-4 w-4" />
            </span>
          </button>
        ))}
        {questionsReady && canLead && runningReal.length > 0 && (
          <button
            type="button"
            className="mt-3 text-sm text-neutral-600 underline underline-offset-2 hover:text-brand dark:text-neutral-300"
            disabled={busy !== null}
            onClick={() => void start(false)}
          >
            Second crew on this job today? Start another JSA
          </button>
        )}
        {questionsReady && !canLead && todays.length === 0 && (
          <p className={`mt-3 text-sm ${MUTED}`}>No JSA yet today. The person in charge starts it.</p>
        )}
      </div>

      {/* Every day */}
      <div className={CARD}>
        <div className="border-b border-neutral-100 px-5 py-3 dark:border-neutral-800 max-sm:px-4">
          <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Daily JSAs</h3>
        </div>
        {rows.length === 0 ? (
          <p className={`px-5 py-6 text-sm ${MUTED}`}>No Daily JSAs on this job yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {rows.map((r) => (
              <JsaListRow key={r.id} row={r} onOpen={() => open(r.id)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function JsaListRow({ row, onOpen }: { row: DailyJsaRow; onOpen: () => void }) {
  const lead = leadOf(row.crew);
  const took = durationText(row.started_at, row.finished_at);
  const short =
    row.status === "done" &&
    !!row.finished_at &&
    new Date(row.finished_at).getTime() - new Date(row.started_at).getTime() < SHORT_JSA_MINUTES * 60_000;
  const stopped = openStop(row);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-neutral-50 dark:hover:bg-dark-200 max-sm:gap-3 max-sm:px-4"
      >
        <span className="w-24 flex-shrink-0 text-sm font-medium text-neutral-900 dark:text-white max-sm:w-20">
          {dayLabel(row.work_date)}
        </span>
        <span className="min-w-0 flex-1 text-sm text-neutral-700 dark:text-neutral-300">
          <span className="block truncate">
            {lead?.name || row.started_by_name || "No one named"} in charge · {row.crew.length}{" "}
            {row.crew.length === 1 ? "person" : "people"}
          </span>
          <span className={`block text-xs ${MUTED}`}>
            {row.power === "on" ? "Power on" : row.power === "off" ? "Power off" : "Power not picked yet"}
            {took && ` · took ${took}`}
            {row.jha_version ? ` · JHA v${row.jha_version}` : " · no JHA"}
          </span>
        </span>
        <span className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
          {row.practice && <Tag tone="neutral">Practice</Tag>}
          {stopped && (
            <Tag tone="red">
              <Hand className="h-3 w-3" /> Stopped
            </Tag>
          )}
          {!stopped && row.stops.length > 0 && <Tag tone="neutral">Stop Work ×{row.stops.length}</Tag>}
          {short && <Tag tone="amber">Short</Tag>}
          {row.status === "done" ? <Tag tone="green">Done</Tag> : <Tag tone="amber">In progress</Tag>}
          <ChevronRight className="h-4 w-4 text-neutral-400" />
        </span>
      </button>
    </li>
  );
}

function Tag({ tone, children }: { tone: "green" | "amber" | "red" | "neutral"; children: React.ReactNode }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    amber: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
    red: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    neutral: "bg-neutral-100 text-neutral-700 dark:bg-dark-200 dark:text-neutral-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-none px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
