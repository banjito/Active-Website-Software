import React, { useCallback, useEffect, useRef, useState } from "react";
import { HeartHandshake, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { PrayerRequestCard } from "@/components/prayerWall/PrayerRequestCard";
import {
  deletePrayerRequest,
  fetchPrayerFeed,
  fetchPrayerRequest,
  markPrayerAnswered,
  postPrayerRequest,
  togglePraying,
  PRAYER_BODY_MAX,
  PRAYER_PAGE_SIZE,
  PRAYER_TITLE_MAX,
  PrayerFilter,
  PrayerRequest,
} from "@/services/prayerWallService";

const FILTERS: { key: PrayerFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "answered", label: "Answered" },
];

const EMPTY_COPY: Record<PrayerFilter, string> = {
  all: "No prayer requests yet. Be the first to share one.",
  active: "No active requests right now.",
  answered: "No answered requests yet.",
};

export default function PrayerWall() {
  const { user } = useAuth();

  const [filter, setFilter] = useState<PrayerFilter>("all");
  const [items, setItems] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // Compose box
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [posting, setPosting] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Guards against a stale page landing after the filter changed.
  const requestSeq = useRef(0);

  const setBusy = (id: string, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  const loadFirstPage = useCallback(
    async (nextFilter: PrayerFilter) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setLoadError(null);
      try {
        const rows = await fetchPrayerFeed({ filter: nextFilter });
        if (seq !== requestSeq.current) return;
        setItems(rows);
        setHasMore(rows.length === PRAYER_PAGE_SIZE);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        const message = err instanceof Error ? err.message : "Could not load the prayer wall.";
        console.error("PrayerWall: load failed", err);
        setLoadError(message);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [],
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore || items.length === 0) return;
    const seq = requestSeq.current;
    const last = items[items.length - 1];
    setLoadingMore(true);
    try {
      const rows = await fetchPrayerFeed({ filter, before: last.created_at });
      if (seq !== requestSeq.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      setHasMore(rows.length === PRAYER_PAGE_SIZE);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load more.";
      console.error("PrayerWall: load more failed", err);
      toast({ title: "Could not load more", description: message, variant: "destructive" });
    } finally {
      if (seq === requestSeq.current) setLoadingMore(false);
    }
  }, [filter, hasMore, items, loading, loadingMore]);

  useEffect(() => {
    void loadFirstPage(filter);
  }, [filter, loadFirstPage]);

  // Refresh when the tab regains focus so counts don't go stale.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void loadFirstPage(filter);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [filter, loadFirstPage]);

  // Infinite scroll; the Load more button below is the fallback.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) {
      toast({ title: "Write something first", variant: "warning" });
      return;
    }
    if (!user) return;
    setPosting(true);
    try {
      const id = await postPrayerRequest({ body: trimmed, title, isAnonymous });
      setBody("");
      setTitle("");
      setIsAnonymous(false);
      setComposeOpen(false);
      // Re-read through the view so the card carries the same shape (and the
      // same identity-stripping) as everything else in the feed.
      const created = await fetchPrayerRequest(id);
      if (created && (filter === "all" || filter === created.status)) {
        setItems((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
      } else {
        void loadFirstPage(filter);
      }
      toast({ title: "Posted to the prayer wall", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not post.";
      console.error("PrayerWall: post failed", err);
      toast({ title: "Could not post", description: message, variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  const handleTogglePraying = async (request: PrayerRequest) => {
    if (busyIds.has(request.id)) return;
    setBusy(request.id, true);
    // Optimistic flip; reverted on failure.
    const optimistic = !request.is_praying;
    setItems((prev) =>
      prev.map((r) =>
        r.id === request.id
          ? {
              ...r,
              is_praying: optimistic,
              praying_count: Math.max(0, r.praying_count + (optimistic ? 1 : -1)),
            }
          : r,
      ),
    );
    try {
      const actual = await togglePraying(request.id);
      if (actual !== optimistic) {
        // Server disagreed (double-click race). Trust the server.
        const fresh = await fetchPrayerRequest(request.id);
        if (fresh) setItems((prev) => prev.map((r) => (r.id === fresh.id ? fresh : r)));
      }
    } catch (err) {
      setItems((prev) => prev.map((r) => (r.id === request.id ? request : r)));
      const message = err instanceof Error ? err.message : "Could not update.";
      console.error("PrayerWall: toggle praying failed", err);
      toast({ title: "Could not update", description: message, variant: "destructive" });
    } finally {
      setBusy(request.id, false);
    }
  };

  const handleMarkAnswered = async (request: PrayerRequest, note: string) => {
    setBusy(request.id, true);
    try {
      await markPrayerAnswered(request.id, note);
      const fresh = await fetchPrayerRequest(request.id);
      setItems((prev) => {
        if (filter === "active") return prev.filter((r) => r.id !== request.id);
        return prev.map((r) => (r.id === request.id && fresh ? fresh : r));
      });
      toast({ title: "Marked as answered", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update.";
      console.error("PrayerWall: mark answered failed", err);
      toast({ title: "Could not mark answered", description: message, variant: "destructive" });
      throw err;
    } finally {
      setBusy(request.id, false);
    }
  };

  const handleDelete = async (request: PrayerRequest) => {
    setBusy(request.id, true);
    try {
      await deletePrayerRequest(request.id);
      setItems((prev) => prev.filter((r) => r.id !== request.id));
      toast({ title: "Request deleted", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete.";
      console.error("PrayerWall: delete failed", err);
      toast({ title: "Could not delete", description: message, variant: "destructive" });
      throw err;
    } finally {
      setBusy(request.id, false);
    }
  };

  const bodyRemaining = PRAYER_BODY_MAX - body.length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <HeartHandshake className="h-6 w-6 text-brand" />
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            Prayer Wall
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Share a request. Let the team know you're praying.
          </p>
        </div>
      </div>

      {/* Compose: a single text bubble that grows into the full form on focus */}
      <form
        onSubmit={handlePost}
        className="mb-6 rounded-none border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 sm:p-5"
      >
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out",
            composeOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, PRAYER_TITLE_MAX))}
              maxLength={PRAYER_TITLE_MAX}
              placeholder="Title (optional)"
              disabled={posting}
              tabIndex={composeOpen ? 0 : -1}
              className="form-input mb-3 w-full rounded-none placeholder:text-neutral-400/70 dark:placeholder:text-neutral-500/70"
            />
          </div>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, PRAYER_BODY_MAX))}
          onFocus={() => setComposeOpen(true)}
          maxLength={PRAYER_BODY_MAX}
          required
          disabled={posting}
          placeholder="How can others be praying for you?"
          className={cn(
            "form-textarea mt-0 w-full resize-none rounded-none transition-[height] duration-300 ease-out",
            "placeholder:text-neutral-400/70 dark:placeholder:text-neutral-500/70",
            composeOpen ? "h-32" : "h-10 cursor-text",
          )}
        />
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
            composeOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                <Switch
                  checked={isAnonymous}
                  onCheckedChange={setIsAnonymous}
                  disabled={posting}
                  checkedClassName="bg-brand"
                />
                Post anonymously
              </label>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "text-xs",
                    bodyRemaining < 50
                      ? "text-red-600 dark:text-red-400"
                      : "text-neutral-500 dark:text-neutral-400",
                  )}
                >
                  {bodyRemaining} left
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={posting}
                  tabIndex={composeOpen ? 0 : -1}
                  onClick={() => {
                    setComposeOpen(false);
                    setBody("");
                    setTitle("");
                    setIsAnonymous(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isLoading={posting}
                  disabled={!body.trim()}
                  tabIndex={composeOpen ? 0 : -1}
                >
                  Post
                </Button>
              </div>
            </div>
            {isAnonymous && (
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                Your name is hidden from everyone else. You'll still see it as yours and can mark it answered.
              </p>
            )}
          </div>
        </div>
      </form>

      {/* Filter tabs */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filter requests"
          className="flex border-b border-neutral-200 dark:border-neutral-700"
        >
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                filter === f.key
                  ? "border-brand text-brand"
                  : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void loadFirstPage(filter)}
          disabled={loading}
          className="rounded-none p-2 text-neutral-500 hover:text-brand disabled:opacity-50 dark:text-neutral-400"
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : loadError ? (
        <div className="rounded-none border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-300">
          <p className="font-medium">Couldn't load the prayer wall.</p>
          <p className="mt-1 break-words">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void loadFirstPage(filter)}
          >
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-none border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {EMPTY_COPY[filter]}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((r) => (
            <PrayerRequestCard
              key={r.id}
              request={r}
              busy={busyIds.has(r.id)}
              onTogglePraying={handleTogglePraying}
              onMarkAnswered={handleMarkAnswered}
              onDelete={handleDelete}
            />
          ))}
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loadingMore ? (
                <LoadingSpinner size="sm" />
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => void loadMore()}>
                  Load more
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
