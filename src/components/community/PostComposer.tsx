import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { ImagePlus, Loader2, SendHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import type {
  CommunityPostRow,
  FeedPost,
  ReactionType,
} from "@/lib/communityTypes";
import { loadAuthorsForUserIds } from "@/lib/communityProfiles";

const MAX_CHARS = 500;
const BUCKET = "community-media";
/** When expanded and still empty: starting height before typing. */
const TEXTAREA_EXPANDED_EMPTY_PX = 112;
/** Minimum height once user has typed (content-based grow still applies). */
const TEXTAREA_MIN_PX = 52;
const TEXTAREA_MAX_PX = 220;

type Props = {
  user: User;
  onPosted: (post: FeedPost) => void;
};

function buildFeedFromRow(
  row: CommunityPostRow,
  author: FeedPost["author"],
): FeedPost {
  return {
    post: row,
    author,
    reactionCounts: {},
    myReactions: new Set<ReactionType>(),
    commentCount: 0,
  };
}

export const PostComposer: React.FC<Props> = ({ user, onPosted }) => {
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  /** Pixel height driven by layout effect so React style + measurement stay in sync. */
  const [taHeightPx, setTaHeightPx] = useState(TEXTAREA_EXPANDED_EMPTY_PX);
  const [taScroll, setTaScroll] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = body.trim();
  const canSubmit =
    (trimmed.length > 0 || files.length > 0) &&
    trimmed.length <= MAX_CHARS &&
    !submitting;

  const openComposer = useCallback(() => {
    setExpanded(true);
    setTaHeightPx(TEXTAREA_EXPANDED_EMPTY_PX);
    setTaScroll(false);
  }, []);

  const syncTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el || !expanded) return;
    if (!body.trim()) {
      setTaHeightPx(TEXTAREA_EXPANDED_EMPTY_PX);
      setTaScroll(false);
      return;
    }
    el.style.height = "0px";
    const sh = el.scrollHeight;
    const next = Math.min(Math.max(sh, TEXTAREA_MIN_PX), TEXTAREA_MAX_PX);
    setTaHeightPx(next);
    setTaScroll(sh > TEXTAREA_MAX_PX);
  }, [body, expanded]);

  useLayoutEffect(() => {
    syncTextareaHeight();
  }, [syncTextareaHeight]);

  useEffect(() => {
    if (!expanded) return;
    textareaRef.current?.focus();
  }, [expanded]);

  /** After blur, collapse to one-line stub if focus left the composer and there is no draft. */
  const scheduleCollapseIfIdle = useCallback(() => {
    window.setTimeout(() => {
      if (submitting) return;
      if (!sectionRef.current?.contains(document.activeElement)) {
        if (!body.trim() && files.length === 0) setExpanded(false);
      }
    }, 160);
  }, [body, files, submitting]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (body.trim() || files.length > 0) return;
      setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, body, files]);

  const uploadMedia = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
    }
    return urls;
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const media_urls = files.length > 0 ? await uploadMedia() : [];
      const insertBody = trimmed.slice(0, MAX_CHARS);
      if (!insertBody && media_urls.length === 0) return;

      const { data, error } = await supabase
        .schema("common")
        .from("posts")
        .insert({
          user_id: user.id,
          body: insertBody,
          media_urls,
        })
        .select("id, user_id, body, media_urls, created_at")
        .single();

      if (error) throw error;
      const row = data as CommunityPostRow;

      const authors = await loadAuthorsForUserIds([user.id]);
      const author = authors.get(user.id) || {
        id: user.id,
        displayName:
          (user.user_metadata?.name as string) ||
          user.email?.split("@")[0] ||
          "You",
        avatarUrl: (user.user_metadata?.profileImage as string) || undefined,
      };

      onPosted(buildFeedFromRow(row, author));
      setBody("");
      setTaHeightPx(TEXTAREA_EXPANDED_EMPTY_PX);
      setTaScroll(false);
      setFiles([]);
      setExpanded(false);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      console.error("Post failed", e);
      alert(
        e instanceof Error
          ? e.message
          : "Could not publish post. Check storage bucket `community-media` and database migration.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      ref={sectionRef}
      className="w-full bg-white dark:bg-dark-150 rounded-none p-3 mb-3"
    >
      {!expanded ? (
        <button
          type="button"
          onClick={openComposer}
          aria-label="Start a post"
          className="flex h-9 w-full items-center rounded-none border-none bg-neutral-100 px-3 text-left text-sm text-neutral-500 shadow-sm hover:bg-neutral-50 focus:outline-none dark:border-neutral-600 dark:bg-dark-100 dark:text-neutral-400 dark:hover:bg-dark-200"
        >
          <span className="truncate">Share an update…</span>
        </button>
      ) : (
        <>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_CHARS))}
            onBlur={scheduleCollapseIfIdle}
            placeholder="Share an update…"
            rows={1}
            aria-label="Post body"
            className="mt-0 box-border w-full min-h-0 resize-none rounded-none border border-neutral-300 bg-neutral-100 px-2 py-2 text-sm leading-snug text-neutral-900 shadow-sm focus:outline-none  focus:ring-brand dark:border-neutral-600 dark:bg-dark-100 dark:text-white dark:focus:border-brand"
            style={{
              height: taHeightPx,
              maxHeight: TEXTAREA_MAX_PX,
              minHeight: 0,
              overflowY: taScroll ? "auto" : "hidden",
            }}
          />
          <div className="flex justify-between items-center mt-1 mb-2">
            <span
              className={`text-xs ${body.length >= MAX_CHARS ? "text-amber-600" : "text-neutral-500 dark:text-neutral-400"}`}
            >
              {body.length}/{MAX_CHARS}
            </span>
          </div>

          {files.length > 0 && (
            <ul className="text-xs text-neutral-600 dark:text-neutral-400 mb-3 space-y-1">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex justify-between gap-2"
                >
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    className="text-red-600 shrink-0"
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const list = e.target.files ? Array.from(e.target.files) : [];
                  setFiles((prev) => [...prev, ...list].slice(0, 8));
                }}
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center bg-brand gap-1.5 rounded-none border-none px-2 py-2 text-white hover:bg-brand/80"
              >
                <ImagePlus className="stroke-[1.5] h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              disabled={!canSubmit}
              onMouseDown={(e) => {
                if (!canSubmit) return;
                e.preventDefault();
              }}
              onClick={() => void submit()}
              className="inline-flex items-center gap-1.5 rounded-none px-2 py-2 font-medium text-white bg-brand hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <SendHorizontal className="h-5 w-5" />
              )}
            </button>
          </div>
        </>
      )}
    </section>
  );
};
