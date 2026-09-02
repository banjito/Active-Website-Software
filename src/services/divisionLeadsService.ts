import { supabase } from "@/lib/supabase";

/**
 * Who leads each division.
 *
 * Exists because ampOS has no concept of a project manager: profiles.role is a permissions
 * string, job_title is free text, and neither answers "who runs Nashville". Rather than
 * inventing a role system, the division switcher lets someone name a lead per division,
 * and features that need "the PMs" read this.
 *
 * Stored as one common.app_settings row keyed by division id:
 *   { "north_alabama": { id, email, name }, ... }
 */
export const DIVISION_LEADS_KEY = "division_leads";

export interface DivisionLead {
  id: string;
  email: string;
  name: string;
}

export type DivisionLeads = Record<string, DivisionLead>;

/** Field Tech (All) holds the director; every other division holds a project manager. */
export const DIRECTOR_DIVISION_ID = "field_tech";

export const leadTitleFor = (divisionId: string): string =>
  divisionId === DIRECTOR_DIVISION_ID ? "Director" : "Project Manager";

export async function fetchDivisionLeads(): Promise<DivisionLeads> {
  const { data, error } = await supabase
    .schema("common")
    .from("app_settings")
    .select("value")
    .eq("key", DIVISION_LEADS_KEY)
    .maybeSingle();

  if (error) {
    // 42P01 = app_settings missing on an instance that never ran that migration.
    if (error.code === "42P01") return {};
    console.error("Failed to load division leads:", error);
    return {};
  }

  return (data?.value ?? {}) as DivisionLeads;
}

/**
 * Set or clear one division's lead. Reads before writing so two people editing different
 * divisions don't overwrite each other, which a whole-object save would do.
 */
export async function saveDivisionLead(
  divisionId: string,
  lead: DivisionLead | null,
): Promise<void> {
  const current = await fetchDivisionLeads();
  const next: DivisionLeads = { ...current };

  if (lead) next[divisionId] = lead;
  else delete next[divisionId];

  const { error } = await supabase
    .schema("common")
    .from("app_settings")
    .upsert(
      {
        key: DIVISION_LEADS_KEY,
        value: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

  if (error) throw error;
}
