import { supabase } from "@/lib/supabase";
import { describeSupabaseError, withWriteRetry } from "@/lib/supabaseRetry";

export type PrayerStatus = "active" | "answered";
export type PrayerFilter = "all" | PrayerStatus;

/**
 * One row of common.prayer_wall_feed. The view nulls author_id / author_name
 * on anonymous rows unless the caller is the author, so nothing here needs
 * scrubbing client-side.
 */
export interface PrayerRequest {
  id: string;
  title: string | null;
  body: string;
  is_anonymous: boolean;
  status: PrayerStatus;
  answered_note: string | null;
  answered_at: string | null;
  created_at: string;
  is_mine: boolean;
  author_id: string | null;
  author_name: string | null;
  praying_count: number;
  is_praying: boolean;
}

export const PRAYER_PAGE_SIZE = 20;
export const PRAYER_BODY_MAX = 1000;
export const PRAYER_TITLE_MAX = 120;
export const PRAYER_NOTE_MAX = 500;

const FEED_COLUMNS =
  "id, title, body, is_anonymous, status, answered_note, answered_at, created_at, is_mine, author_id, author_name, praying_count, is_praying";

/**
 * Newest first, keyset-paginated on created_at. Pass the last row's created_at
 * as `before` to get the next page.
 */
export async function fetchPrayerFeed(opts: {
  filter: PrayerFilter;
  before?: string | null;
  limit?: number;
}): Promise<PrayerRequest[]> {
  const limit = opts.limit ?? PRAYER_PAGE_SIZE;
  let query = supabase
    .schema("common")
    .from("prayer_wall_feed")
    .select(FEED_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (opts.filter !== "all") query = query.eq("status", opts.filter);
  if (opts.before) query = query.lt("created_at", opts.before);

  const { data, error } = await query;
  if (error) throw new Error(describeSupabaseError(error));
  return (data || []) as PrayerRequest[];
}

export async function fetchPrayerRequest(id: string): Promise<PrayerRequest | null> {
  const { data, error } = await supabase
    .schema("common")
    .from("prayer_wall_feed")
    .select(FEED_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(describeSupabaseError(error));
  return (data as PrayerRequest | null) ?? null;
}

export async function postPrayerRequest(input: {
  body: string;
  title?: string;
  isAnonymous: boolean;
}): Promise<string> {
  const { data, error } = await supabase.schema("common").rpc("prayer_request_post", {
    p_body: input.body,
    p_title: input.title?.trim() || null,
    p_is_anonymous: input.isAnonymous,
  });
  if (error) throw new Error(describeSupabaseError(error));
  return data as string;
}

/** Returns the caller's new praying state. */
export async function togglePraying(requestId: string): Promise<boolean> {
  const { data, error } = await supabase
    .schema("common")
    .rpc("prayer_request_toggle_praying", { p_request_id: requestId });
  if (error) throw new Error(describeSupabaseError(error));
  return Boolean(data);
}

export async function markPrayerAnswered(requestId: string, note: string): Promise<void> {
  const { error } = await withWriteRetry(
    () =>
      supabase.schema("common").rpc("prayer_request_mark_answered", {
        p_request_id: requestId,
        p_note: note.trim() || null,
      }),
    { label: "prayer_request_mark_answered" },
  );
  if (error) throw new Error(describeSupabaseError(error));
}

export async function deletePrayerRequest(requestId: string): Promise<void> {
  const { error } = await withWriteRetry(
    () =>
      supabase.schema("common").rpc("prayer_request_delete", { p_request_id: requestId }),
    { label: "prayer_request_delete" },
  );
  if (error) throw new Error(describeSupabaseError(error));
}
