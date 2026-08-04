import { supabase } from "@/lib/supabase";
import type { Site } from "@/lib/types/assetTracking";

// Sites are facilities, standalone by design — no customer FK. See
// src/lib/types/assetTracking.ts for why.

const SITE_COLUMNS =
  "id, name, address, city, state, notes, status, created_by, created_at, updated_at";

/** A site plus how many active equipment assets are registered at it. */
export interface SiteWithCounts extends Site {
  asset_count: number;
}

export async function fetchSites(): Promise<SiteWithCounts[]> {
  const { data, error } = await supabase
    .schema("common")
    .from("sites")
    .select(SITE_COLUMNS)
    .order("name", { ascending: true });

  if (error) {
    // 42P01 = table missing (migration not applied yet) — don't crash the page.
    if (error.code === "42P01") return [];
    throw error;
  }

  const sites = (data ?? []) as Site[];
  if (sites.length === 0) return [];

  const counts = await fetchAssetCountsBySite(sites.map((s) => s.id));
  return sites.map((s) => ({ ...s, asset_count: counts[s.id] ?? 0 }));
}

export async function fetchSite(siteId: string): Promise<Site | null> {
  const { data, error } = await supabase
    .schema("common")
    .from("sites")
    .select(SITE_COLUMNS)
    .eq("id", siteId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") return null;
    throw error;
  }
  return (data as Site) ?? null;
}

/**
 * Asset count per site. One query for all sites rather than one per row — the list page
 * would otherwise fire an N+1 as soon as there are more than a handful of facilities.
 */
async function fetchAssetCountsBySite(
  siteIds: string[],
): Promise<Record<string, number>> {
  if (siteIds.length === 0) return {};

  const { data, error } = await supabase
    .schema("neta_ops")
    .from("equipment_assets")
    .select("site_id")
    .in("site_id", siteIds)
    .is("deleted_at", null);

  if (error) {
    if (error.code === "42P01") return {};
    throw error;
  }

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { site_id: string }[]) {
    counts[row.site_id] = (counts[row.site_id] ?? 0) + 1;
  }
  return counts;
}

export type SiteInput = Pick<
  Site,
  "name" | "address" | "city" | "state" | "notes" | "status"
> & { id?: string };

export async function upsertSite(input: SiteInput): Promise<Site> {
  const payload = {
    name: input.name.trim(),
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    notes: input.notes?.trim() || null,
    status: input.status || "active",
  };

  const query = input.id
    ? supabase
        .schema("common")
        .from("sites")
        .update(payload)
        .eq("id", input.id)
        .select(SITE_COLUMNS)
        .single()
    : supabase
        .schema("common")
        .from("sites")
        .insert(payload)
        .select(SITE_COLUMNS)
        .single();

  const { data, error } = await query;
  if (error) {
    // 23505 = the unique index on (name, city, state).
    if (error.code === "23505") {
      throw new Error(
        `A site named "${payload.name}" already exists${payload.city ? ` in ${payload.city}` : ""}. Use the existing one so its assets stay in one place.`,
      );
    }
    throw error;
  }
  return data as Site;
}

/**
 * Delete a site. Blocked while it still has assets — those assets are shared across every
 * job at the facility, so removing the site would orphan work from other projects. The
 * ON DELETE RESTRICT foreign key is the backstop if this check races.
 */
export async function deleteSite(siteId: string): Promise<void> {
  const { count, error: countError } = await supabase
    .schema("neta_ops")
    .from("equipment_assets")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .is("deleted_at", null);

  if (countError && countError.code !== "42P01") throw countError;
  if ((count ?? 0) > 0) {
    throw new Error(
      `This site has ${count} registered asset${count === 1 ? "" : "s"}. Remove them first, or set the site to inactive instead.`,
    );
  }

  const { error } = await supabase
    .schema("common")
    .from("sites")
    .delete()
    .eq("id", siteId);
  if (error) throw error;
}
