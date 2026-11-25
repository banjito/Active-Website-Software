/**
 * The job's JHA, the written safety plan (JSA/JHA scope, item 2).
 * neta_ops.job_jhas (database/migrations/safety_02_job_jha.sql): one row per version.
 * Finishing locks a version. A change means a new version, copied from the last one.
 */
import { supabase } from "@/lib/supabase";
import { describeSupabaseError, withWriteRetry } from "@/lib/supabaseRetry";
import { RowDraftSaver, type DraftSaveState } from "@/lib/rowDraftSaver";
import { currentHazards, type SafetyWorkType } from "@/lib/safetyWorkTypes";

export interface JhaWorkType {
  key: string;
  name: string;
  /** When its list was approved, as of copying. Null = the list wasn't approved yet. */
  approved_at: string | null;
}

export interface JhaHazard {
  key: string;
  hazard: string;
  controls: string;
  /** Work type it came from, or null when typed by hand. */
  from: string | null;
}

/** Keys match the Daily JSA's emergency step. */
export interface EmergencyPlan {
  address?: string;
  ems_meet?: string;
  hospital?: string;
  aed?: string;
  caller?: string;
  rescue?: string;
  notes?: string;
}

export interface JobJha {
  id: string;
  job_id: string;
  version: number;
  status: "draft" | "final";
  work_summary: string;
  work_types: JhaWorkType[];
  hazards: JhaHazard[];
  energized_expected: boolean | null;
  energized_notes: string;
  emergency_plan: EmergencyPlan;
  prepared_by_name: string | null;
  finalized_by_name: string | null;
  finalized_at: string | null;
  last_save_id: string | null;
  created_at: string;
  updated_at: string;
}

export type JhaContent = Pick<
  JobJha,
  "work_summary" | "work_types" | "hazards" | "energized_expected" | "energized_notes" | "emergency_plan"
>;

export const EMERGENCY_FIELDS: { key: keyof EmergencyPlan; label: string; hint: string; required: boolean }[] = [
  { key: "address", label: "Site address for 911", hint: "Street address, gate or building", required: true },
  { key: "ems_meet", label: "Where we meet EMS", hint: "Gate, door or corner", required: true },
  { key: "hospital", label: "Nearest hospital and route", hint: "Name, address, how to get there", required: true },
  { key: "aed", label: "AED, first aid, extinguisher", hint: "Where each one is", required: true },
  { key: "caller", label: "Who calls 911", hint: "Name and phone, if known", required: false },
  { key: "rescue", label: "Trained in CPR and contact release", hint: "Names, if known", required: false },
  { key: "notes", label: "Anything else", hint: "Site emergency number, alarms, muster point", required: false },
];

const COLUMNS =
  "id, job_id, version, status, work_summary, work_types, hazards, energized_expected, energized_notes, emergency_plan, prepared_by_name, finalized_by_name, finalized_at, last_save_id, created_at, updated_at";

const db = () => supabase.schema("neta_ops");
const table = () => db().from("job_jhas");

function fail(error: Parameters<typeof describeSupabaseError>[0], status?: number): never {
  throw new Error(describeSupabaseError(error, status));
}

/** Every version, newest first. */
export async function listJobJhas(jobId: string): Promise<JobJha[]> {
  const { data, error, status } = await table()
    .select(COLUMNS)
    .eq("job_id", jobId)
    .order("version", { ascending: false });
  if (error) fail(error, status);
  return (data ?? []) as JobJha[];
}

/** A job with a site keeps its emergency plan there, for the next job. */
export async function jobHasSite(jobId: string): Promise<boolean> {
  const { data, error, status } = await db().from("jobs").select("site_id").eq("id", jobId).maybeSingle();
  if (error) fail(error, status);
  return !!data?.site_id;
}

/** Starts version 1, or the next version. Returns the open draft if there already is one. */
export async function startJobJha(jobId: string): Promise<string> {
  const { data, error, status } = await db().rpc("start_job_jha", { p_job_id: jobId });
  if (error) fail(error, status);
  return data as string;
}

export async function finishJobJha(id: string, updatedAt: string): Promise<void> {
  const { error, status } = await db().rpc("finish_job_jha", { p_id: id, p_updated_at: updatedAt });
  if (error) fail(error, status);
}

export async function deleteJhaDraft(id: string): Promise<void> {
  const { error, status } = await withWriteRetry(() => table().delete().eq("id", id).eq("status", "draft"), {
    label: "delete JHA draft",
  });
  if (error) fail(error, status);
}

export const contentOf = (j: JobJha): JhaContent => ({
  work_summary: j.work_summary,
  work_types: j.work_types,
  hazards: j.hazards,
  energized_expected: j.energized_expected,
  energized_notes: j.energized_notes,
  emergency_plan: j.emergency_plan,
});

// ─── Picking work types ─────────────────────────────────────────────────────

/** Adds a work type and copies its hazards in. Also used to pull in a newer list: it replaces the old copy. */
export function withWorkType(content: JhaContent, w: SafetyWorkType): JhaContent {
  const entry: JhaWorkType = { key: w.key, name: w.name, approved_at: w.approved_at };
  const copied: JhaHazard[] = currentHazards(w).map((h) => ({
    key: `${w.key}.${h.key}`,
    hazard: h.hazard,
    controls: h.controls,
    from: w.key,
  }));
  const has = content.work_types.some((t) => t.key === w.key);
  return {
    ...content,
    work_types: has
      ? content.work_types.map((t) => (t.key === w.key ? entry : t))
      : [...content.work_types, entry],
    hazards: [...content.hazards.filter((h) => h.from !== w.key), ...copied],
  };
}

export function withoutWorkType(content: JhaContent, key: string): JhaContent {
  return {
    ...content,
    work_types: content.work_types.filter((t) => t.key !== key),
    hazards: content.hazards.filter((h) => h.from !== key),
  };
}

/** What's left before it can be finished. The database checks the same things. */
export function missingForFinish(c: JhaContent): string[] {
  const out: string[] = [];
  if (!c.work_summary.trim()) out.push("Describe the work");
  if (c.hazards.length === 0) out.push("Add at least one hazard");
  else if (c.hazards.some((h) => !h.hazard.trim() || !h.controls.trim())) out.push("Fill in every hazard and its control");
  if (c.energized_expected === null) out.push("Say if energized work is expected");
  else if (c.energized_expected && !c.energized_notes.trim()) out.push("Say what will be energized and why");
  if (EMERGENCY_FIELDS.some((f) => f.required && !c.emergency_plan[f.key]?.trim())) out.push("Finish the emergency plan");
  return out;
}

/** Plain list of what changed from one version to the next. */
export function changesBetween(before: JhaContent, after: JhaContent): string[] {
  const out: string[] = [];
  if (before.work_summary.trim() !== after.work_summary.trim()) out.push("Work description changed");
  for (const t of after.work_types) if (!before.work_types.some((b) => b.key === t.key)) out.push(`Added ${t.name}`);
  for (const t of before.work_types) if (!after.work_types.some((a) => a.key === t.key)) out.push(`Removed ${t.name}`);

  const old = new Map(before.hazards.map((h) => [h.key, h]));
  const now = new Set(after.hazards.map((h) => h.key));
  for (const h of after.hazards) {
    const was = old.get(h.key);
    const name = h.hazard.trim() || "unnamed hazard";
    if (!was) out.push(`New hazard: ${name}`);
    else if (was.hazard.trim() !== h.hazard.trim() || was.controls.trim() !== h.controls.trim()) out.push(`Changed hazard: ${name}`);
  }
  for (const h of before.hazards) if (!now.has(h.key)) out.push(`Removed hazard: ${h.hazard}`);

  if (before.energized_expected !== after.energized_expected || before.energized_notes.trim() !== after.energized_notes.trim()) {
    out.push("Energized work changed");
  }
  if (EMERGENCY_FIELDS.some((f) => (before.emergency_plan[f.key] ?? "").trim() !== (after.emergency_plan[f.key] ?? "").trim())) {
    out.push("Emergency plan changed");
  }
  return out;
}

// ─── Autosave ───────────────────────────────────────────────────────────────

export type JhaSaveState = DraftSaveState;

/** Autosave for a JHA draft. See RowDraftSaver for how conflicts are caught. */
export class JhaDraftSaver extends RowDraftSaver<JhaContent> {
  constructor(id: string, savedAt: string, onState: (state: DraftSaveState, message?: string) => void) {
    super(
      {
        label: "save JHA",
        update: (content, saveId, at) =>
          table()
            .update({ ...content, last_save_id: saveId })
            .eq("id", id)
            .eq("status", "draft")
            .eq("updated_at", at)
            .select("updated_at"),
        read: () => table().select("updated_at, last_save_id").eq("id", id).maybeSingle(),
      },
      id,
      savedAt,
      onState,
    );
  }
}
