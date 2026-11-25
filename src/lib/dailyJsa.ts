/**
 * The Daily JSA, the crew's daily tailgate (JSA/JHA scope, item 3).
 * neta_ops.job_tailgates (database/migrations/safety_03_daily_jsa.sql): one row per crew, per job, per day.
 *
 * It starts from the job's JHA plus the last JSA. The lead walks the crew through the
 * eight steps of the approved questions. Finishing locks it. Signatures come in item 5.
 * ampOS never picks PPE or works out boundaries: the crew copies the label.
 */
import { differenceInMinutes, format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { describeSupabaseError, withWriteRetry } from "@/lib/supabaseRetry";
import { RowDraftSaver, type DraftSaveState } from "@/lib/rowDraftSaver";
import { EMERGENCY_FIELDS, type EmergencyPlan, type JhaHazard } from "@/lib/jobJha";
import type { SafetyCheck, SafetyStep } from "@/lib/safetyQuestions";

export interface JsaCrewMember {
  key: string;
  name: string;
  /** Set when picked from staff. Null for temps and subs typed in. */
  user_id: string | null;
  /** Temps and subs: who they work for. */
  company: string | null;
  /** The person in charge. Exactly one. */
  lead: boolean;
}

/** Copied from an equipment label, as written. Never calculated. */
export interface JsaLabel {
  key: string;
  equipment: string;
  voltage: string;
  limited: string;
  restricted: string;
  arc_boundary: string;
  energy: string;
  ppe_category: string;
  label_date: string;
}

export interface JsaStop {
  key: string;
  at: string;
  by_name: string;
  /** Step key it was stopped on. */
  step: string | null;
  reason: string;
  resumed_at: string | null;
  resumed_by_name: string | null;
  resolution: string | null;
}

export interface JsaStepAnswer {
  /** Keys of the checks that were ticked. */
  checked: string[];
  note: string;
}

export type JsaPower = "off" | "on";

export interface DailyJsa {
  id: string;
  job_id: string;
  /** yyyy-MM-dd, the crew's own day. */
  work_date: string;
  status: "in_progress" | "done";
  practice: boolean;
  question_set_version: number;
  questions: SafetyStep[];
  jha_id: string | null;
  jha_version: number | null;
  previous_id: string | null;
  crew: JsaCrewMember[];
  work_summary: string;
  changes_today: string;
  hazards: JhaHazard[];
  power: JsaPower | null;
  power_reason: string;
  labels: JsaLabel[];
  no_label: boolean;
  no_label_note: string;
  emergency_plan: EmergencyPlan;
  answers: Record<string, JsaStepAnswer>;
  stops: JsaStop[];
  current_step: string | null;
  step_seconds: Record<string, number>;
  started_by: string | null;
  started_by_name: string | null;
  started_at: string;
  finished_by_name: string | null;
  finished_at: string | null;
  last_save_id: string | null;
  created_at: string;
  updated_at: string;
}

/** What the screen edits while it's in progress. */
export type JsaContent = Pick<
  DailyJsa,
  | "crew"
  | "work_summary"
  | "changes_today"
  | "hazards"
  | "power"
  | "power_reason"
  | "labels"
  | "no_label"
  | "no_label_note"
  | "emergency_plan"
  | "answers"
  | "stops"
  | "current_step"
  | "step_seconds"
>;

/** The list on the job's Daily JSAs tab. */
export type DailyJsaRow = Pick<
  DailyJsa,
  | "id"
  | "work_date"
  | "status"
  | "practice"
  | "crew"
  | "power"
  | "stops"
  | "started_by_name"
  | "started_at"
  | "finished_at"
  | "jha_version"
>;

const COLUMNS =
  "id, job_id, work_date, status, practice, question_set_version, questions, jha_id, jha_version, previous_id, " +
  "crew, work_summary, changes_today, hazards, power, power_reason, labels, no_label, no_label_note, emergency_plan, " +
  "answers, stops, current_step, step_seconds, started_by, started_by_name, started_at, finished_by_name, finished_at, " +
  "last_save_id, created_at, updated_at";
const LIST_COLUMNS = "id, work_date, status, practice, crew, power, stops, started_by_name, started_at, finished_at, jha_version";

const db = () => supabase.schema("neta_ops");
const table = () => db().from("job_tailgates");

function fail(error: Parameters<typeof describeSupabaseError>[0], status?: number): never {
  throw new Error(describeSupabaseError(error, status));
}

/** Today on this phone, yyyy-MM-dd. */
export const today = () => format(new Date(), "yyyy-MM-dd");

/** Newest day first. */
export async function listJobJsas(jobId: string): Promise<DailyJsaRow[]> {
  const { data, error, status } = await table()
    .select(LIST_COLUMNS)
    .eq("job_id", jobId)
    .order("work_date", { ascending: false })
    .order("started_at", { ascending: false });
  if (error) fail(error, status);
  return (data ?? []) as unknown as DailyJsaRow[];
}

export async function getJsa(id: string): Promise<DailyJsa | null> {
  const { data, error, status } = await table().select(COLUMNS).eq("id", id).maybeSingle();
  if (error) fail(error, status);
  return (data as unknown as DailyJsa | null) ?? null;
}

export async function getJobHeader(jobId: string): Promise<{ job_number: string | null; title: string | null } | null> {
  const { data, error, status } = await db().from("jobs").select("job_number, title").eq("id", jobId).maybeSingle();
  if (error) fail(error, status);
  return data ?? null;
}

/**
 * Starts today's JSA and returns its id. The id is made here, so a retry after a
 * dropped connection hands back the same JSA instead of making a second one.
 */
export async function startJsa(jobId: string, practice = false): Promise<string> {
  const id = crypto.randomUUID();
  const { data, error, status } = await withWriteRetry(
    () => db().rpc("start_job_tailgate", { p_id: id, p_job_id: jobId, p_work_date: today(), p_practice: practice }),
    { label: "start Daily JSA" },
  );
  if (error) fail(error, status);
  return (data as string) ?? id;
}

export async function finishJsa(id: string, updatedAt: string): Promise<void> {
  const { error, status } = await db().rpc("finish_job_tailgate", { p_id: id, p_updated_at: updatedAt });
  if (error) fail(error, status);
}

/** In progress (started by mistake), or a practice run. */
export async function deleteJsa(id: string): Promise<void> {
  const { error, status } = await withWriteRetry(() => table().delete().eq("id", id), { label: "delete Daily JSA" });
  if (error) fail(error, status);
}

/** Staff names for the crew list. */
export async function listCrewChoices(): Promise<{ id: string; name: string }[]> {
  const { data, error, status } = await db().rpc("jsa_crew_choices");
  if (error) fail(error, status);
  return (data ?? []) as { id: string; name: string }[];
}

export const contentOf = (j: DailyJsa): JsaContent => ({
  crew: j.crew,
  work_summary: j.work_summary,
  changes_today: j.changes_today,
  hazards: j.hazards,
  power: j.power,
  power_reason: j.power_reason,
  labels: j.labels,
  no_label: j.no_label,
  no_label_note: j.no_label_note,
  emergency_plan: j.emergency_plan,
  answers: j.answers,
  stops: j.stops,
  current_step: j.current_step,
  step_seconds: j.step_seconds,
});

export const newKey = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

export const emptyLabel = (): JsaLabel => ({
  key: newKey("l"),
  equipment: "",
  voltage: "",
  limited: "",
  restricted: "",
  arc_boundary: "",
  energy: "",
  ppe_category: "",
  label_date: "",
});

export const openStop = (c: Pick<JsaContent, "stops">): JsaStop | undefined => c.stops.find((s) => !s.resumed_at);

export const leadOf = (crew: JsaCrewMember[]): JsaCrewMember | undefined => crew.find((m) => m.lead);

/** The checks asked on this step. Power-step checks depend on power off or on. */
export function stepChecks(step: SafetyStep, power: JsaPower | null): SafetyCheck[] {
  return step.checks.filter((c) => c.when === "always" || c.when === power);
}

const filled = (s: string | null | undefined) => !!s?.trim();

export const labelComplete = (l: JsaLabel) =>
  filled(l.equipment) && filled(l.arc_boundary) && (filled(l.energy) || filled(l.ppe_category));

/** What's left on one step. The database checks the same things when finishing. */
export function stepMissing(step: SafetyStep, c: JsaContent): string[] {
  const out: string[] = [];
  switch (step.key) {
    case "crew":
      if (c.crew.length === 0) out.push("Add the crew");
      else if (c.crew.some((m) => !filled(m.name))) out.push("Fill in every name");
      if (c.crew.length > 0 && c.crew.filter((m) => m.lead).length !== 1) out.push("Pick the person in charge");
      break;
    case "work":
      if (!filled(c.work_summary)) out.push("Say today's work");
      if (!filled(c.changes_today)) out.push("Say what's different today");
      break;
    case "hazards":
      if (c.hazards.length === 0) out.push("Add at least one hazard");
      else if (c.hazards.some((h) => !filled(h.hazard) || !filled(h.controls))) out.push("Fill in every hazard and its control");
      break;
    case "power":
      if (!c.power) out.push("Pick power off or on");
      else if (c.power === "on" && !filled(c.power_reason)) out.push("Say why the power can't be off");
      break;
    case "shock_arc":
      if (c.no_label) {
        if (!filled(c.no_label_note)) out.push("Say the plan for the missing or old label");
      } else if (c.labels.length === 0) out.push("Copy at least one label");
      else if (c.labels.some((l) => !labelComplete(l))) {
        out.push("Each label needs the equipment, arc flash boundary, and incident energy or PPE category");
      }
      break;
    case "emergency":
      if (EMERGENCY_FIELDS.some((f) => f.required && !filled(c.emergency_plan[f.key]))) out.push("Finish the emergency plan");
      break;
  }
  const answer = c.answers[step.key];
  const unticked = stepChecks(step, c.power).some((k) => !answer?.checked.includes(k.key));
  if (unticked && !filled(answer?.note)) out.push("Tick every item, or add a note saying why not");
  return out;
}

/** Everything left before finishing, by step. */
export function missingForFinish(questions: SafetyStep[], c: JsaContent): { step: number; title: string; items: string[] }[] {
  const out = questions
    .map((s, i) => ({ step: i, title: s.title, items: stepMissing(s, c) }))
    .filter((m) => m.items.length > 0);
  if (openStop(c)) out.unshift({ step: -1, title: "Stop Work", items: ["Say what was done about the stop"] });
  return out;
}

/** "14 min", from start to finish. */
export function durationText(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "";
  const mins = Math.max(0, differenceInMinutes(new Date(finishedAt), new Date(startedAt)));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

/** Under this many minutes, the list flags the JSA as short. */
export const SHORT_JSA_MINUTES = 5;

// ─── Autosave ───────────────────────────────────────────────────────────────

export type JsaSaveState = DraftSaveState;

export class JsaDraftSaver extends RowDraftSaver<JsaContent> {
  constructor(id: string, savedAt: string, onState: (state: DraftSaveState, message?: string) => void) {
    super(
      {
        label: "save Daily JSA",
        update: (content, saveId, at) =>
          table()
            .update({ ...content, last_save_id: saveId })
            .eq("id", id)
            .eq("status", "in_progress")
            .eq("updated_at", at)
            .select("updated_at"),
        read: () => table().select("updated_at, last_save_id").eq("id", id).maybeSingle(),
      },
      id,
      savedAt,
      onState,
      600,
    );
  }
}
