import React, { useState } from "react";
import { ThumbsUp, Smile } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { FeedPost, ReactionType } from "@/lib/communityTypes";
import { ALL_REACTION_TYPES, REACTION_EMOJI } from "@/lib/communityTypes";

type Props = {
  postId: string;
  currentUserId?: string;
  feed: FeedPost;
  onUpdateFeedPost: (
    postId: string,
    updater: (fp: FeedPost) => FeedPost,
  ) => void;
};

function cloneFeedPatch(
  fp: FeedPost,
  type: ReactionType,
  had: boolean,
): FeedPost {
  const nextMine = new Set(fp.myReactions);
  const nextCounts = { ...fp.reactionCounts };
  if (had) nextMine.delete(type);
  else nextMine.add(type);
  const prevC = nextCounts[type] || 0;
  const c = prevC + (had ? -1 : 1);
  if (c <= 0) delete nextCounts[type];
  else nextCounts[type] = c;
  return { ...fp, myReactions: nextMine, reactionCounts: nextCounts };
}

export const ReactionBar: React.FC<Props> = ({
  postId,
  currentUserId,
  feed,
  onUpdateFeedPost,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<ReactionType | null>(null);

  const toggle = async (type: ReactionType) => {
    if (!currentUserId) return;
    const had = feed.myReactions.has(type);
    onUpdateFeedPost(postId, (fp) => cloneFeedPatch(fp, type, had));
    setPending(type);
    try {
      if (had) {
        const { error } = await supabase
          .schema("common")
          .from("post_reactions")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", currentUserId)
          .eq("type", type);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .schema("common")
          .from("post_reactions")
          .insert({
            post_id: postId,
            user_id: currentUserId,
            type,
          });
        if (error) throw error;
      }
    } catch {
      onUpdateFeedPost(postId, (fp) => cloneFeedPatch(fp, type, !had));
    } finally {
      setPending(null);
    }
  };

  const likeActive = feed.myReactions.has("like");
  const likeCount = feed.reactionCounts.like || 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-neutral-100 dark:border-dark-200">
      <button
        type="button"
        disabled={!currentUserId || pending !== null}
        onClick={() => void toggle("like")}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors ${
          likeActive
            ? "bg-[#f26722]/15 text-[#f26722] ring-1 ring-[#f26722]/40"
            : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-dark-200"
        } ${!currentUserId ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <ThumbsUp
          className={`h-3.5 w-3.5 ${likeActive ? "fill-current" : ""}`}
        />
        <span>{likeCount > 0 ? likeCount : "Like"}</span>
      </button>

      <div className="relative">
        <button
          type="button"
          disabled={!currentUserId || pending !== null}
          onClick={() => setPickerOpen((o) => !o)}
          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-1 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-dark-200 ${
            !currentUserId ? "opacity-50 cursor-not-allowed" : ""
          }`}
          aria-expanded={pickerOpen}
          aria-label="More reactions"
        >
          <Smile className="h-3.5 w-3.5" />
        </button>
        {pickerOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-10 cursor-default"
              aria-label="Close"
              onClick={() => setPickerOpen(false)}
            />
            <div className="absolute left-0 bottom-full z-20 mb-1 flex gap-1 rounded-lg border border-neutral-200 dark:border-dark-200 bg-white dark:bg-dark-150 px-2 py-1.5 shadow-lg">
              {ALL_REACTION_TYPES.filter((t) => t !== "like").map((type) => {
                const active = feed.myReactions.has(type);
                const count = feed.reactionCounts[type] || 0;
                return (
                  <button
                    key={type}
                    type="button"
                    title={type}
                    disabled={!currentUserId || pending !== null}
                    onClick={() => {
                      void toggle(type);
                      setPickerOpen(false);
                    }}
                    className={`rounded-md px-1.5 py-0.5 text-lg leading-none hover:bg-neutral-100 dark:hover:bg-dark-200 ${
                      active ? "ring-2 ring-[#f26722]/50" : ""
                    }`}
                  >
                    <span className="sr-only">{type}</span>
                    {REACTION_EMOJI[type]}
                    {count > 0 ? (
                      <span className="ml-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
