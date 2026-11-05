import { supabase } from "@/lib/supabase";
import { describeSupabaseError, withWriteRetry } from "@/lib/supabaseRetry";

/**
 * Readers who signed up on ampqes.com article pages. The website adds them through
 * common.subscribe_article_reader() (service role only). Here, article publishers
 * read the list and mark people unsubscribed; the database enforces both.
 */
export interface ArticleSubscriber {
  id: string;
  email: string;
  first_article_slug: string | null;
  last_article_slug: string | null;
  created_at: string;
  last_seen_at: string;
  return_count: number;
  unsubscribed_at: string | null;
}

const COLUMNS =
  "id, email, first_article_slug, last_article_slug, created_at, last_seen_at, return_count, unsubscribed_at";

// The API returns at most 1000 rows per request, so read the list in pages.
const PAGE = 1000;

export async function listArticleSubscribers(): Promise<ArticleSubscriber[]> {
  const out: ArticleSubscriber[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error, status } = await supabase
      .schema("common")
      .from("article_subscribers")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(describeSupabaseError(error, status));
    out.push(...((data ?? []) as ArticleSubscriber[]));
    if (!data || data.length < PAGE) return out;
  }
}

/** Mark someone unsubscribed, or undo a mistake. */
export async function setArticleSubscriberUnsubscribed(
  id: string,
  unsubscribed: boolean,
  userId: string | undefined,
): Promise<void> {
  const changes = unsubscribed
    ? { unsubscribed_at: new Date().toISOString(), unsubscribed_by: userId ?? null }
    : { unsubscribed_at: null, unsubscribed_by: null };

  const { data, error, status } = await withWriteRetry(() =>
    supabase
      .schema("common")
      .from("article_subscribers")
      .update(changes)
      .eq("id", id)
      .select("id"),
  );
  if (error) throw new Error(describeSupabaseError(error, status));
  // Row security skips rows you may not change without an error, so check.
  if (!data || (data as any[]).length === 0) {
    throw new Error("You don't have permission to change subscribers.");
  }
}
