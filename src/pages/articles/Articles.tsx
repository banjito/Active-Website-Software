/**
 * Articles for ampqes.com/articles.
 *
 * Anyone signed in writes drafts and submits them. A publisher (Admin,
 * superuser, or someone on the publishers list) publishes. Publishing triggers
 * a website rebuild from the database, so the page goes live in a few minutes.
 * The database enforces every rule here; the UI only hides what would fail.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  ImagePlus,
  Lock,
  Newspaper,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { SortHeader, type SortDirection } from "@/components/ui/SortHeader";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { companyConfig } from "@/lib/companyConfig";
import { ArticleBodyEditor } from "@/components/articles/ArticleBodyEditor";
import {
  articleBodyText,
  sanitizeArticleHtml,
  slugify,
} from "@/lib/articleHtml";
import {
  ARTICLE_STATUS_LABEL,
  type Article,
  type ArticleDraft,
  type ArticleStatus,
  type PersonOption,
  addPublisher,
  canPublishArticles,
  createArticle,
  getArticle,
  isArticleAdmin,
  listArticles,
  listPeople,
  listPublisherIds,
  removePublisher,
  updateArticle,
  uploadArticleImage,
} from "@/services/articlesService";

const SITE_BASE = `https://${companyConfig.websiteDomain}/articles/`;
const EXCERPT_TARGET = 160;
const EXCERPT_MAX = 300;

const inputClass =
  "w-full rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-100 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand";
const labelClass =
  "block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1";

const STATUS_CLASS: Record<ArticleStatus, string> = {
  draft:
    "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  in_review:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  published:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  archived:
    "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400",
};

function StatusBadge({ status }: { status: ArticleStatus }) {
  return (
    <span
      className={`inline-block rounded-none px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      {ARTICLE_STATUS_LABEL[status]}
    </span>
  );
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function usePeople() {
  const [people, setPeople] = useState<PersonOption[]>([]);
  useEffect(() => {
    listPeople()
      .then(setPeople)
      .catch((e) => console.error("Load people for articles:", e));
  }, []);
  const byId = useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people],
  );
  return { people, byId };
}

export default function Articles() {
  const { id } = useParams<{ id?: string }>();
  return id ? <ArticleEditor key={id} routeId={id} /> : <ArticleList />;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

type Filter = "all" | "mine" | ArticleStatus;
type SortField = "title" | "author" | "status" | "updated";

function ArticleList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { people, byId } = usePeople();
  const [rows, setRows] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [publisher, setPublisher] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortField, setSortField] = useState<SortField>("updated");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [showPublishers, setShowPublishers] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listArticles(), canPublishArticles(), isArticleAdmin()])
      .then(([list, canPub, isAdm]) => {
        if (cancelled) return;
        setRows(list);
        setPublisher(canPub);
        setAdmin(isAdm);
        // Publishers land on what needs them.
        if (canPub && list.some((a) => a.status === "in_review")) {
          setFilter("in_review");
        }
      })
      .catch((e) =>
        toast({
          title: "Could not load articles",
          description: e.message,
          variant: "destructive",
        }),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const authorName = useCallback(
    (a: Article) => byId.get(a.author_id || "")?.full_name || "",
    [byId],
  );

  const reviewCount = rows.filter((a) => a.status === "in_review").length;

  const visible = useMemo(() => {
    const mine = (a: Article) =>
      a.created_by === user?.id || a.author_id === user?.id;
    const filtered = rows.filter((a) => {
      if (filter === "all") return a.status !== "archived";
      if (filter === "mine") return mine(a);
      return a.status === filter;
    });
    const key = (a: Article): string => {
      switch (sortField) {
        case "title":
          return a.title.toLowerCase();
        case "author":
          return authorName(a).toLowerCase();
        case "status":
          return a.status;
        default:
          return a.updated_at;
      }
    };
    return [...filtered].sort((a, b) => {
      const c = key(a).localeCompare(key(b));
      return sortDir === "asc" ? c : -c;
    });
  }, [rows, filter, sortField, sortDir, user?.id, authorName]);

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "mine", label: "Mine" },
    {
      value: "in_review",
      label: reviewCount ? `In review (${reviewCount})` : "In review",
    },
    { value: "published", label: "Published" },
    { value: "draft", label: "Drafts" },
    { value: "archived", label: "Archived" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Newspaper className="h-6 w-6 text-brand" />
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
              Articles
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Write for {companyConfig.websiteDomain}. A publisher reviews and
              posts it.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {admin && (
            <Button
              variant="outline"
              leftIcon={<Users className="h-4 w-4" />}
              onClick={() => setShowPublishers(true)}
            >
              Publishers
            </Button>
          )}
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => navigate("/articles/new")}
          >
            New article
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-none px-3 py-1.5 text-sm border ${
              filter === f.value
                ? "border-brand bg-brand text-white"
                : "border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:border-brand"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-none border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No articles here yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-none border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-dark-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              <tr>
                {(
                  [
                    ["title", "Title"],
                    ["author", "Author"],
                    ["status", "Status"],
                    ["updated", "Updated"],
                  ] as [SortField, string][]
                ).map(([field, label]) => (
                  <th key={field} className="px-4 py-2 font-medium">
                    <SortHeader
                      label={label}
                      field={field}
                      sortField={sortField}
                      sortDirection={sortDir}
                      onSort={(f, d) => {
                        setSortField(f);
                        setSortDir(d);
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => navigate(`/articles/${a.id}`)}
                  className="cursor-pointer border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-dark-100"
                >
                  <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                    {a.title || (
                      <span className="italic text-neutral-400">Untitled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                    {authorName(a)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                    {formatDate(a.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPublishers && (
        <PublishersPanel
          people={people}
          onClose={() => setShowPublishers(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Publishers (Admins only)
// ---------------------------------------------------------------------------

function PublishersPanel({
  people,
  onClose,
}: {
  people: PersonOption[];
  onClose: () => void;
}) {
  const [ids, setIds] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listPublisherIds()
      .then(setIds)
      .catch((e) =>
        toast({
          title: "Could not load publishers",
          description: e.message,
          variant: "destructive",
        }),
      );
  }, []);

  const run = async (fn: () => Promise<void>, next: string[]) => {
    setBusy(true);
    try {
      await fn();
      setIds(next);
      setAdding("");
    } catch (e: any) {
      toast({ title: "Not saved", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const name = (id: string) =>
    people.find((p) => p.id === id)?.full_name || "Unknown person";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-none bg-white dark:bg-dark-150 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Publishers
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-none p-1 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          Admins can always publish. Add anyone else who should review and
          publish articles.
        </p>
        <ul className="mb-4 divide-y divide-neutral-100 dark:divide-neutral-800">
          {ids.length === 0 && (
            <li className="py-2 text-sm text-neutral-400">No extra publishers.</li>
          )}
          {ids.map((id) => (
            <li key={id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-neutral-900 dark:text-white">{name(id)}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run(
                    () => removePublisher(id),
                    ids.filter((x) => x !== id),
                  )
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className={inputClass}
          >
            <option value="">Add a person...</option>
            {people
              .filter((p) => p.active && !ids.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
          </select>
          <Button
            disabled={!adding || busy}
            onClick={() => run(() => addPublisher(adding), [...ids, adding])}
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

interface FormState extends ArticleDraft {
  tagsText: string;
}

function toForm(a: Partial<Article>): FormState {
  return {
    title: a.title || "",
    slug: a.slug || "",
    excerpt: a.excerpt || "",
    body_html: a.body_html || "",
    cover_image_url: a.cover_image_url || null,
    cover_image_alt: a.cover_image_alt || "",
    category: a.category || "",
    tags: a.tags || [],
    author_id: a.author_id || null,
    tagsText: (a.tags || []).join(", "),
  };
}

function toDraft(f: FormState): ArticleDraft {
  return {
    title: f.title.trim(),
    slug: f.slug ? slugify(f.slug) : null,
    excerpt: f.excerpt?.trim() || null,
    body_html: sanitizeArticleHtml(f.body_html),
    cover_image_url: f.cover_image_url || null,
    cover_image_alt: f.cover_image_alt?.trim() || null,
    category: f.category?.trim() || null,
    tags: f.tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    author_id: f.author_id,
  };
}

function ArticleEditor({ routeId }: { routeId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { people, byId } = usePeople();
  const isNew = routeId === "new";
  // New articles get their id up front so images can be uploaded before the
  // first save.
  const articleId = useMemo(
    () => (isNew ? crypto.randomUUID() : routeId),
    [isNew, routeId],
  );

  const [article, setArticle] = useState<Article | null>(null);
  const [form, setForm] = useState<FormState>(() =>
    toForm({ author_id: user?.id }),
  );
  const savedJson = useRef(JSON.stringify(toDraft(toForm({ author_id: user?.id }))));
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [publisher, setPublisher] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const coverInput = useRef<HTMLInputElement>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  useEffect(() => {
    canPublishArticles().then(setPublisher);
    if (isNew) return;
    getArticle(routeId)
      .then((a) => {
        if (!a) {
          toast({ title: "Article not found", variant: "destructive" });
          navigate("/articles", { replace: true });
          return;
        }
        setArticle(a);
        const f = toForm(a);
        setForm(f);
        savedJson.current = JSON.stringify(toDraft(f));
        setSlugTouched(!!a.slug);
        setReviewNotes(a.review_notes || "");
      })
      .catch((e) =>
        toast({
          title: "Could not load article",
          description: e.message,
          variant: "destructive",
        }),
      )
      .finally(() => setLoading(false));
  }, [isNew, routeId, navigate]);

  const status: ArticleStatus = article?.status || "draft";
  const slugLocked = !!article?.published_at;
  const isOwner =
    isNew ||
    article?.created_by === user?.id ||
    article?.author_id === user?.id;
  const canEdit =
    publisher || (isOwner && (status === "draft" || status === "in_review"));
  const dirty = JSON.stringify(toDraft(form)) !== savedJson.current;

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onTitle = (title: string) =>
    setForm((f) => ({
      ...f,
      title,
      slug: slugTouched || slugLocked ? f.slug : slugify(title),
    }));

  const missing = (): string[] => {
    const out: string[] = [];
    if (!form.title.trim()) out.push("a title");
    if (!slugify(form.slug || "")) out.push("a web address");
    if (!form.excerpt?.trim()) out.push("a summary");
    if (!articleBodyText(form.body_html) && !/<img/i.test(form.body_html))
      out.push("the article body");
    if (form.cover_image_url && !form.cover_image_alt?.trim())
      out.push("a cover image description");
    return out;
  };

  /**
   * Saves the form, optionally changing status in the same write so a publish
   * is one database change (and one site rebuild).
   */
  const save = async (
    next?: { status: ArticleStatus; review_notes?: string | null },
    successTitle = "Saved",
  ) => {
    if (next && (next.status === "in_review" || next.status === "published")) {
      const need = missing();
      if (need.length) {
        toast({
          title: "Not ready yet",
          description: `Add ${need.join(", ")}.`,
          variant: "warning",
        });
        return;
      }
    }
    setBusy(true);
    try {
      const draft = toDraft(form);
      if (isNew && !article) {
        await createArticle(articleId, draft);
        if (next) await updateArticle(articleId, next);
      } else {
        await updateArticle(articleId, next ? { ...draft, ...next } : draft);
      }
      const fresh = await getArticle(articleId);
      if (fresh) {
        setArticle(fresh);
        const f = toForm(fresh);
        setForm(f);
        savedJson.current = JSON.stringify(toDraft(f));
        setSlugTouched(!!fresh.slug);
        setReviewNotes(fresh.review_notes || "");
      }
      toast({ title: successTitle, variant: "success" });
      if (isNew) navigate(`/articles/${articleId}`, { replace: true });
    } catch (e: any) {
      toast({ title: "Not saved", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const confirmThen = async (
    title: string,
    description: string,
    confirmLabel: string,
    action: () => Promise<void>,
    destructive = false,
  ) => {
    if (await confirmDialog({ title, description, confirmLabel, destructive })) {
      await action();
    }
  };

  const remove = () =>
    confirmThen(
      "Delete this article?",
      status === "published"
        ? "It comes off the website at the next rebuild."
        : "This cannot be undone from ampOS.",
      "Delete",
      async () => {
        setBusy(true);
        try {
          await updateArticle(articleId, { deleted_at: new Date().toISOString() });
          navigate("/articles", { replace: true });
        } catch (e: any) {
          toast({ title: "Not deleted", description: e.message, variant: "destructive" });
          setBusy(false);
        }
      },
      true,
    );

  const uploadCover = async (file: File) => {
    setCoverUploading(true);
    try {
      const url = await uploadArticleImage(articleId, file);
      set("cover_image_url", url);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setCoverUploading(false);
    }
  };

  const uploadInline = async (file: File) => {
    try {
      return await uploadArticleImage(articleId, file);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      throw e;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  const excerptLen = (form.excerpt || "").length;
  const readOnly = !canEdit;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/articles"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" /> All articles
        </Link>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          {status === "published" && article?.slug && (
            <a
              href={`${SITE_BASE}${article.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
            >
              View on site <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {status === "draft" && article?.review_notes && (
        <div className="mb-4 rounded-none border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          <div className="font-medium">Sent back by a publisher</div>
          <div className="whitespace-pre-wrap">{article.review_notes}</div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main */}
        <div className="min-w-0 space-y-4">
          <input
            value={form.title}
            onChange={(e) => onTitle(e.target.value)}
            readOnly={readOnly}
            placeholder="Article title"
            className="w-full rounded-none border-0 border-b border-neutral-200 dark:border-neutral-700 bg-transparent px-0 py-2 text-3xl font-semibold text-neutral-900 dark:text-white placeholder:text-neutral-300 focus:outline-none focus:border-brand"
          />
          <ArticleBodyEditor
            value={form.body_html}
            onChange={(html) => set("body_html", html)}
            onUploadImage={uploadInline}
            readOnly={readOnly}
          />
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <ActionsCard
            status={status}
            isNew={isNew && !article}
            dirty={dirty}
            busy={busy}
            publisher={publisher}
            isOwner={isOwner}
            canEdit={canEdit}
            reviewNotes={reviewNotes}
            setReviewNotes={setReviewNotes}
            onSave={() =>
              save(
                undefined,
                status === "published" ? "Saved. The site will update shortly." : "Saved",
              )
            }
            onSubmit={() => save({ status: "in_review" }, "Sent for review")}
            onWithdraw={() => save({ status: "draft" }, "Moved back to draft")}
            onSendBack={() =>
              save(
                { status: "draft", review_notes: reviewNotes.trim() || null },
                "Sent back to the writer",
              )
            }
            onPublish={() =>
              confirmThen(
                "Publish this article?",
                `It goes live at ${SITE_BASE}${slugify(form.slug || "")} in a few minutes. The web address cannot change after this.`,
                "Publish",
                () => save({ status: "published" }, "Published. The site is rebuilding."),
              )
            }
            onUnpublish={() =>
              confirmThen(
                "Unpublish this article?",
                "It comes off the website at the next rebuild and goes back to draft.",
                "Unpublish",
                () => save({ status: "draft" }, "Unpublished"),
              )
            }
            onArchive={() =>
              confirmThen(
                "Archive this article?",
                "It comes off the website if live, and is hidden from the main list.",
                "Archive",
                () => save({ status: "archived" }, "Archived"),
              )
            }
            onRestore={() => save({ status: "draft" }, "Restored to draft")}
            onDelete={remove}
          />

          <div className="space-y-4 rounded-none border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 p-4">
            <div>
              <label className={labelClass}>
                Web address{" "}
                {slugLocked && <Lock className="inline h-3 w-3 align-[-1px]" />}
              </label>
              <div className="text-xs text-neutral-400 mb-1 break-all">
                {SITE_BASE}
              </div>
              <input
                value={form.slug || ""}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"));
                }}
                onBlur={() => set("slug", slugify(form.slug || ""))}
                readOnly={readOnly || slugLocked}
                placeholder="article-web-address"
                className={inputClass}
              />
              {slugLocked && (
                <p className="mt-1 text-xs text-neutral-500">
                  Locked after first publish so the link never breaks.
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Summary</label>
              <textarea
                value={form.excerpt || ""}
                onChange={(e) => set("excerpt", e.target.value.replace(/\n/g, " "))}
                readOnly={readOnly}
                maxLength={EXCERPT_MAX}
                rows={4}
                placeholder="One or two sentences. Shown on the article list and in Google results."
                className={inputClass}
              />
              <p
                className={`mt-1 text-xs ${
                  excerptLen > EXCERPT_TARGET ? "text-amber-600" : "text-neutral-500"
                }`}
              >
                {excerptLen} / {EXCERPT_TARGET} recommended
              </p>
            </div>

            <div>
              <label className={labelClass}>Cover image</label>
              <input
                ref={coverInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadCover(file);
                  e.target.value = "";
                }}
              />
              {form.cover_image_url ? (
                <div className="space-y-2">
                  <img
                    src={form.cover_image_url}
                    alt={form.cover_image_alt || ""}
                    className="w-full rounded-none border border-neutral-200 dark:border-neutral-700"
                  />
                  {!readOnly && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        isLoading={coverUploading}
                        onClick={() => coverInput.current?.click()}
                      >
                        Replace
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          set("cover_image_url", null);
                          set("cover_image_alt", "");
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                  <input
                    value={form.cover_image_alt || ""}
                    onChange={(e) => set("cover_image_alt", e.target.value)}
                    readOnly={readOnly}
                    placeholder="Describe the image (required)"
                    className={inputClass}
                  />
                </div>
              ) : (
                !readOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={coverUploading}
                    leftIcon={<ImagePlus className="h-4 w-4" />}
                    onClick={() => coverInput.current?.click()}
                  >
                    Add cover image
                  </Button>
                )
              )}
            </div>

            <div>
              <label className={labelClass}>Author</label>
              {publisher && !readOnly ? (
                <select
                  value={form.author_id || ""}
                  onChange={(e) => set("author_id", e.target.value || null)}
                  className={inputClass}
                >
                  <option value="">No author</option>
                  {/* Keep the current author listed even if they have left. */}
                  {people
                    .filter((p) => p.active || p.id === form.author_id)
                    .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                      {p.job_title ? `, ${p.job_title}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-neutral-900 dark:text-white">
                  {byId.get(form.author_id || "")?.full_name || "Unknown"}
                </div>
              )}
            </div>

            <div>
              <label className={labelClass}>Category</label>
              <input
                value={form.category || ""}
                onChange={(e) => set("category", e.target.value)}
                readOnly={readOnly}
                placeholder="e.g. Testing, Safety, Company news"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Tags</label>
              <input
                value={form.tagsText}
                onChange={(e) => set("tagsText", e.target.value)}
                readOnly={readOnly}
                placeholder="Comma separated"
                className={inputClass}
              />
            </div>

            {article && (
              <div className="space-y-0.5 border-t border-neutral-100 dark:border-neutral-800 pt-3 text-xs text-neutral-500 dark:text-neutral-400">
                {article.published_at && (
                  <div>First published {formatDate(article.published_at)}</div>
                )}
                {article.submitted_at && (
                  <div>Last submitted {formatDate(article.submitted_at)}</div>
                )}
                <div>Last saved {formatDate(article.updated_at)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionsCard(props: {
  status: ArticleStatus;
  isNew: boolean;
  dirty: boolean;
  busy: boolean;
  publisher: boolean;
  isOwner: boolean;
  canEdit: boolean;
  reviewNotes: string;
  setReviewNotes: (s: string) => void;
  onSave: () => void;
  onSubmit: () => void;
  onWithdraw: () => void;
  onSendBack: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { status, isNew, dirty, busy, publisher, isOwner, canEdit } = props;

  let hint = "";
  if (!canEdit) {
    hint =
      status === "published"
        ? "Live on the website. Ask a publisher to make changes."
        : "Only the writer or a publisher can edit this.";
  } else if (status === "draft") {
    hint = publisher
      ? "Publish when ready, or save as a draft."
      : "When it is ready, send it for review. A publisher posts it.";
  } else if (status === "in_review") {
    hint = publisher
      ? "Waiting for you. Publish it, or send it back with notes."
      : "A publisher is reviewing this. You can still make edits.";
  } else if (status === "published") {
    hint = "Live on the website. Saving changes updates the site in a few minutes.";
  } else {
    hint = "Archived. Not on the website.";
  }

  return (
    <div className="space-y-3 rounded-none border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 p-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">{hint}</p>

      {canEdit && status !== "archived" && (
        <Button
          variant={status === "published" ? "primary" : "outline"}
          className="w-full"
          disabled={busy || (!dirty && !isNew)}
          onClick={props.onSave}
        >
          {status === "published" ? "Save changes" : "Save draft"}
        </Button>
      )}

      {status === "draft" && canEdit && !publisher && (
        <Button className="w-full" disabled={busy} onClick={props.onSubmit}>
          Send for review
        </Button>
      )}

      {status === "in_review" && isOwner && !publisher && (
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={props.onWithdraw}
        >
          Move back to draft
        </Button>
      )}

      {publisher && (status === "draft" || status === "in_review") && (
        <Button className="w-full" disabled={busy} onClick={props.onPublish}>
          Publish
        </Button>
      )}

      {publisher && status === "in_review" && (
        <div className="space-y-2 border-t border-neutral-100 dark:border-neutral-800 pt-3">
          <textarea
            value={props.reviewNotes}
            onChange={(e) => props.setReviewNotes(e.target.value)}
            rows={3}
            placeholder="Notes for the writer"
            className={inputClass}
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={busy || !props.reviewNotes.trim()}
            onClick={props.onSendBack}
          >
            Send back with notes
          </Button>
        </div>
      )}

      {publisher && status === "published" && (
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={props.onUnpublish}
        >
          Unpublish
        </Button>
      )}

      {publisher && status !== "archived" && !isNew && (
        <Button
          variant="ghost"
          className="w-full"
          disabled={busy}
          onClick={props.onArchive}
        >
          Archive
        </Button>
      )}

      {publisher && status === "archived" && (
        <Button className="w-full" disabled={busy} onClick={props.onRestore}>
          Restore to draft
        </Button>
      )}

      {!isNew && (publisher || (canEdit && status !== "published")) && (
        <Button
          variant="ghost"
          className="w-full text-red-600 dark:text-red-400"
          disabled={busy}
          leftIcon={<Trash2 className="h-4 w-4" />}
          onClick={props.onDelete}
        >
          Delete
        </Button>
      )}
    </div>
  );
}
