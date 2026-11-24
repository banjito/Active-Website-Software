/**
 * Daily JSA questions (JSA/JHA scope, item 1). One row per version in
 * neta_ops.safety_question_sets (database/migrations/safety_01_questions.sql).
 *
 * Drafts are editable. The safety lead approves one, which puts it in use and
 * freezes it. Only the version in use can run a Daily JSA. No version in use = no JSA.
 */
import { supabase } from "@/lib/supabase";
import { describeSupabaseError, withWriteRetry } from "@/lib/supabaseRetry";

/** The eight steps the Daily JSA screen is built around. The database checks these on approval. */
export const SAFETY_STEP_KEYS = [
  "crew",
  "work",
  "hazards",
  "power",
  "shock_arc",
  "ppe",
  "emergency",
  "sign",
] as const;
export type SafetyStepKey = (typeof SAFETY_STEP_KEYS)[number];

/** When a check is asked. Only the "Power off or on" step uses off/on. */
export type CheckWhen = "always" | "off" | "on";

export interface SafetyCheck {
  /** Permanent. Answers point at it, so never reuse one for different wording. */
  key: string;
  text: string;
  when: CheckWhen;
}

export interface SafetyStep {
  key: SafetyStepKey;
  title: string;
  /** What the person in charge says to the crew. */
  prompt: string;
  help: string;
  /** NFPA 70E section numbers only. Never the book's text. */
  refs: string[];
  checks: SafetyCheck[];
}

export type QuestionSetStatus = "draft" | "in_use" | "retired";

export interface SafetyQuestionSet {
  id: string;
  version: number;
  edition: string;
  status: QuestionSetStatus;
  steps: SafetyStep[];
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  approved_by_name: string | null;
  approved_at: string | null;
  retired_at: string | null;
}

const COLUMNS =
  "id, version, edition, status, steps, notes, created_by_name, created_at, updated_at, approved_by_name, approved_at, retired_at";

const table = () => supabase.schema("neta_ops").from("safety_question_sets");

function fail(error: Parameters<typeof describeSupabaseError>[0], status?: number): never {
  throw new Error(describeSupabaseError(error, status));
}

/** Every version, newest first. */
export async function listQuestionSets(): Promise<SafetyQuestionSet[]> {
  const { data, error, status } = await table().select(COLUMNS).order("version", { ascending: false });
  if (error) fail(error, status);
  return (data ?? []) as SafetyQuestionSet[];
}

/** The approved version crews use today, or null when none is approved yet. */
export async function getQuestionSetInUse(): Promise<SafetyQuestionSet | null> {
  const { data, error, status } = await table().select(COLUMNS).eq("status", "in_use").maybeSingle();
  if (error) fail(error, status);
  return (data as SafetyQuestionSet | null) ?? null;
}

export async function saveDraft(
  id: string,
  changes: Pick<SafetyQuestionSet, "edition" | "steps" | "notes">,
): Promise<void> {
  const { error, status } = await withWriteRetry(
    () => table().update(changes).eq("id", id).eq("status", "draft"),
    { label: "save safety questions" },
  );
  if (error) fail(error, status);
}

/** Copies a version into a new draft. If a draft already exists, returns that one instead. */
export async function startDraft(fromId: string): Promise<string> {
  const { data, error, status } = await supabase
    .schema("neta_ops")
    .rpc("start_safety_question_draft", { p_from: fromId });
  if (error) fail(error, status);
  return data as string;
}

/** Safety lead only. Puts the draft in use and retires the old one. */
export async function approveQuestionSet(id: string): Promise<void> {
  const { error, status } = await supabase
    .schema("neta_ops")
    .rpc("approve_safety_question_set", { p_id: id });
  if (error) fail(error, status);
}

export async function deleteDraft(id: string): Promise<void> {
  const { error, status } = await withWriteRetry(
    () => table().delete().eq("id", id).eq("status", "draft"),
    { label: "delete safety questions draft" },
  );
  if (error) fail(error, status);
}

/** A new permanent key for a check added in the editor. */
export function newCheckKey(): string {
  return `c_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}
