import { supabase } from "@/lib/supabase";
import { describeSupabaseError, withWriteRetry } from "@/lib/supabaseRetry";

/**
 * Divisions, read from common.divisions.
 *
 * A division used to be a bare string duplicated across the frontend and pinned
 * down by a CHECK constraint on neta_ops.jobs, so adding one meant a migration
 * plus hand-editing every hardcoded array. common.divisions is now the source of
 * truth and jobs.division is a foreign key to it -- see
 * database/migrations/create_divisions_table.sql.
 */

export interface Division {
  id: string;
  label: string;
  sort_order: number;
  is_field_tech: boolean;
  active: boolean;
}

/**
 * What the sidebar showed before this table existed. Used verbatim when the
 * migration has not been run on an instance, so the switcher renders exactly as
 * it always did rather than emptying out.
 */
export const BUILTIN_FIELD_TECH_DIVISIONS: Division[] = [
  { id: "field_tech", label: "Field Tech (All)", sort_order: 10, is_field_tech: true, active: true },
  { id: "north_alabama", label: "Decatur", sort_order: 20, is_field_tech: true, active: true },
  { id: "tennessee", label: "Nashville", sort_order: 30, is_field_tech: true, active: true },
  { id: "georgia", label: "Atlanta", sort_order: 40, is_field_tech: true, active: true },
  { id: "virginia", label: "Virginia", sort_order: 50, is_field_tech: true, active: true },
  { id: "international", label: "International", sort_order: 60, is_field_tech: true, active: true },
];

/** Field Tech (All) is the aggregate view; every other division lists its own jobs. */
export const divisionPath = (id: string): string =>
  id === "field_tech" ? "/field-tech" : `/${id}/jobs`;

/** Postgres "relation does not exist" -- the instance has not run the migration. */
const UNDEFINED_TABLE = "42P01";

/**
 * Active Field Tech divisions in sidebar order. Never throws: a failure here
 * would blank the navigation, so it falls back to the built-in list.
 */
export async function fetchFieldTechDivisions(): Promise<Division[]> {
  const { data, error } = await supabase
    .schema("common")
    .from("divisions")
    .select("id, label, sort_order, is_field_tech, active")
    .eq("is_field_tech", true)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    if (error.code !== UNDEFINED_TABLE) {
      console.error("Failed to load divisions:", describeSupabaseError(error));
    }
    return BUILTIN_FIELD_TECH_DIVISIONS;
  }

  // An instance with the table but no seeded rows should still navigate.
  if (!data?.length) return BUILTIN_FIELD_TECH_DIVISIONS;

  return data as Division[];
}

/**
 * Turn "Dallas / Fort Worth" into "dallas_fort_worth". The id becomes the URL
 * segment (/dallas_fort_worth/jobs) and the value stored in jobs.division, so it
 * is restricted to what both tolerate.
 */
export function slugifyDivisionId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface CreateDivisionInput {
  label: string;
  /** Defaults to the slugified label. */
  id?: string;
}

/**
 * Add a division. Admin-only at the database level (RLS), so a non-admin gets a
 * 42501 back rather than a silent no-op.
 */
export async function createDivision({
  label,
  id,
}: CreateDivisionInput): Promise<Division> {
  const trimmedLabel = label.trim();
  const divisionId = (id ?? slugifyDivisionId(trimmedLabel)).trim();

  if (!trimmedLabel) throw new Error("A division needs a name.");
  if (!divisionId) {
    throw new Error("That name has no letters or numbers to build an id from.");
  }

  // Append to the end of the switcher rather than interleaving with the cities.
  const { data: last } = await supabase
    .schema("common")
    .from("divisions")
    .select("sort_order")
    .eq("is_field_tech", true)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = {
    id: divisionId,
    label: trimmedLabel,
    sort_order: (last?.sort_order ?? 0) + 10,
    is_field_tech: true,
    active: true,
  };

  // The id is client-supplied, so a repeated insert collides rather than
  // creating a second division -- safe to retry.
  const { data, error } = await withWriteRetry(
    () =>
      supabase
        .schema("common")
        .from("divisions")
        .insert(row)
        .select("id, label, sort_order, is_field_tech, active")
        .single(),
    { label: "createDivision" },
  );

  if (error) {
    if (error.code === "23505") {
      throw new Error(`A division with the id "${divisionId}" already exists.`);
    }
    if (error.code === "42501") {
      throw new Error("Only an administrator can add a division.");
    }
    if (error.code === UNDEFINED_TABLE) {
      throw new Error(
        "Divisions are still hardcoded on this instance. Run database/migrations/create_divisions_table.sql first.",
      );
    }
    throw new Error(describeSupabaseError(error));
  }

  return data as Division;
}
