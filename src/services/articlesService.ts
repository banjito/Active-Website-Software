import { supabase } from "@/lib/supabase";
import { describeSupabaseError, withWriteRetry } from "@/lib/supabaseRetry";

export type ArticleStatus = "draft" | "in_review" | "published" | "archived";

export interface Article {
  id: string;
  title: string;
  slug: string | null;
  excerpt: string | null;
  body_html: string;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  category: string | null;
  tags: string[];
  author_id: string | null;
  status: ArticleStatus;
  review_notes: string | null;
  submitted_at: string | null;
  published_at: string | null;
  content_updated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Fields a writer edits. Workflow columns are set by the database. */
export type ArticleDraft = Pick<
  Article,
  | "title"
  | "slug"
  | "excerpt"
  | "body_html"
  | "cover_image_url"
  | "cover_image_alt"
  | "category"
  | "tags"
  | "author_id"
>;

export interface PersonOption {
  id: string;
  full_name: string;
  job_title: string | null;
  /** Current employee. Only active people appear in pickers. */
  active: boolean;
}

export const ARTICLE_STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  archived: "Archived",
};

const LIST_COLUMNS =
  "id, title, slug, status, author_id, created_by, updated_at, published_at, submitted_at";

const articles = () => supabase.schema("common").from("articles");

function fail(error: any, status?: number): never {
  throw new Error(describeSupabaseError(error, status));
}

export async function listArticles(): Promise<Article[]> {
  const { data, error, status } = await articles()
    .select(LIST_COLUMNS)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) fail(error, status);
  return (data || []) as unknown as Article[];
}

export async function getArticle(id: string): Promise<Article | null> {
  const { data, error, status } = await articles()
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) fail(error, status);
  return data as Article | null;
}

export async function createArticle(id: string, draft: ArticleDraft) {
  const { error, status } = await withWriteRetry(
    () => articles().insert({ id, ...draft }),
    { label: "create article" },
  );
  if (error) fail(error, status);
}

export async function updateArticle(
  id: string,
  fields: Partial<ArticleDraft> & {
    status?: ArticleStatus;
    review_notes?: string | null;
    deleted_at?: string | null;
  },
) {
  const { data, error, status } = await withWriteRetry(
    () => articles().update(fields).eq("id", id).select("id"),
    { label: "update article" },
  );
  if (error) fail(error, status);
  // Row security skips rows you may not change without an error, so check.
  if (!data || (data as any[]).length === 0) {
    throw new Error("You don't have permission to change this article.");
  }
}

export async function canPublishArticles(): Promise<boolean> {
  const { data, error } = await supabase
    .schema("common")
    .rpc("article_can_publish");
  if (error) {
    console.warn("article_can_publish:", error.message);
    return false;
  }
  return data === true;
}

export async function isArticleAdmin(): Promise<boolean> {
  const { data, error } = await supabase
    .schema("common")
    .rpc("article_is_admin");
  if (error) return false;
  return data === true;
}

/** Uploads to the public article-images bucket. Each upload gets a new name. */
export async function uploadArticleImage(
  articleId: string,
  file: File,
): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${articleId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("article-images")
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) throw new Error(error.message);
  return supabase.storage.from("article-images").getPublicUrl(path).data
    .publicUrl;
}

/**
 * Everyone with a name, so bylines of past authors still resolve. Pickers
 * should offer only `active` people. Active matches the HR rule: employment
 * status "active" (blank counts as active), not hidden, login not disabled.
 */
export async function listPeople(): Promise<PersonOption[]> {
  const { data, error, status } = await supabase
    .schema("common")
    .from("profiles")
    .select("id, full_name, job_title, employment_status, hidden, is_active")
    .not("full_name", "is", null)
    .order("full_name");
  if (error) fail(error, status);
  return (data || []).map((p: any) => ({
    id: p.id,
    full_name: p.full_name,
    job_title: p.job_title,
    active:
      (p.employment_status || "active").toLowerCase() === "active" &&
      !p.hidden &&
      p.is_active !== false,
  }));
}

export async function listPublisherIds(): Promise<string[]> {
  const { data, error, status } = await supabase
    .schema("common")
    .from("article_publishers")
    .select("user_id");
  if (error) fail(error, status);
  return (data || []).map((r: any) => r.user_id);
}

export async function addPublisher(userId: string) {
  const { error, status } = await withWriteRetry(
    () =>
      supabase
        .schema("common")
        .from("article_publishers")
        .insert({ user_id: userId }),
    { label: "add publisher" },
  );
  if (error) fail(error, status);
}

export async function removePublisher(userId: string) {
  const { error, status } = await supabase
    .schema("common")
    .from("article_publishers")
    .delete()
    .eq("user_id", userId);
  if (error) fail(error, status);
}
