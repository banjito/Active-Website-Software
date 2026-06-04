import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { loadAuthorsForUserIds, isUuid } from '@/lib/communityProfiles';
import type { CommunityPostRow, FeedPost, ReactionType } from '@/lib/communityTypes';
import { ALL_REACTION_TYPES } from '@/lib/communityTypes';
import { PostComposer } from '@/components/community/PostComposer';
import { PostCard } from '@/components/community/PostCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const PAGE = 15;

function isReactionType(t: string): t is ReactionType {
  return (ALL_REACTION_TYPES as string[]).includes(t);
}

function aggregateComments(postIds: string[], rows: { post_id: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of postIds) m.set(id, 0);
  for (const r of rows) {
    if (!m.has(r.post_id)) m.set(r.post_id, 0);
    m.set(r.post_id, (m.get(r.post_id) || 0) + 1);
  }
  return m;
}

function buildReactionMaps(
  postIds: string[],
  reactions: { post_id: string; type: string; user_id: string }[],
  myUserId: string | undefined
) {
  const counts = new Map<string, Partial<Record<ReactionType, number>>>();
  const mine = new Map<string, Set<ReactionType>>();
  for (const id of postIds) {
    counts.set(id, {});
    mine.set(id, new Set());
  }
  for (const r of reactions) {
    if (!isReactionType(r.type)) continue;
    const t = r.type;
    const c = { ...(counts.get(r.post_id) || {}) };
    c[t] = (c[t] || 0) + 1;
    counts.set(r.post_id, c);
    if (myUserId && r.user_id === myUserId) {
      const s = new Set(mine.get(r.post_id) || []);
      s.add(t);
      mine.set(r.post_id, s);
    }
  }
  return { counts, mine };
}

function rowsToFeedPosts(
  rows: CommunityPostRow[],
  authors: Map<string, FeedPost['author']>,
  counts: Map<string, Partial<Record<ReactionType, number>>>,
  mine: Map<string, Set<ReactionType>>,
  commentCounts: Map<string, number>
): FeedPost[] {
  return rows.map((row) => ({
    post: row,
    author: authors.get(row.user_id) || { id: row.user_id, displayName: 'Member' },
    reactionCounts: counts.get(row.id) || {},
    myReactions: mine.get(row.id) || new Set(),
    commentCount: commentCounts.get(row.id) || 0,
  }));
}

function normalizeRealtimePost(raw: Record<string, unknown>): CommunityPostRow | null {
  const id = raw.id as string | undefined;
  const user_id = raw.user_id as string | undefined;
  if (!id || !user_id || !isUuid(id) || !isUuid(user_id)) return null;
  const body = typeof raw.body === 'string' ? raw.body : '';
  const media_urls = Array.isArray(raw.media_urls) ? (raw.media_urls as string[]) : [];
  let created_at = typeof raw.created_at === 'string' ? raw.created_at : '';
  if (!created_at || Number.isNaN(Date.parse(created_at))) {
    created_at = new Date().toISOString();
  }
  return { id, user_id, body, media_urls, created_at };
}

function FeedSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map((k) => (
        <div key={k} className="rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 bg-gray-50 dark:bg-dark-200/50">
          <div className="flex gap-2">
            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-dark-200" />
            <div className="flex-1 space-y-2">
              <div className="h-2.5 w-28 bg-gray-200 dark:bg-dark-200 rounded" />
              <div className="h-2 w-full bg-gray-100 dark:bg-dark-200 rounded" />
              <div className="h-2 w-[75%] bg-gray-100 dark:bg-dark-200 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Full community feed + composer; mount only while the popover is open to avoid idle Realtime subscriptions. */
export function CommunityBoardPanel() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [rangeStart, setRangeStart] = useState(0);

  const loadPage = useCallback(
    async (start: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const { data: rows, error: qErr } = await supabase
          .schema('common')
          .from('posts')
          .select('id, user_id, body, media_urls, created_at')
          .order('created_at', { ascending: false })
          .range(start, start + PAGE - 1);
        if (qErr) throw qErr;
        const list = (rows || []) as CommunityPostRow[];
        if (list.length < PAGE) setHasMore(false);
        else setHasMore(true);

        setRangeStart(start + list.length);

        const ids = list.map((r) => r.id);
        const userIds = list.map((r) => r.user_id);

        const [{ data: reactRows }, { data: commentRows }] = await Promise.all([
          ids.length
            ? supabase.schema('common').from('post_reactions').select('post_id, type, user_id').in('post_id', ids)
            : Promise.resolve({ data: [] as { post_id: string; type: string; user_id: string }[] }),
          ids.length
            ? supabase.schema('common').from('post_comments').select('post_id').in('post_id', ids)
            : Promise.resolve({ data: [] as { post_id: string }[] }),
        ]);

        const authors = await loadAuthorsForUserIds(userIds);
        const { counts, mine } = buildReactionMaps(ids, (reactRows || []) as { post_id: string; type: string; user_id: string }[], user?.id);
        const commentCounts = aggregateComments(ids, (commentRows || []) as { post_id: string }[]);
        const next = rowsToFeedPosts(list, authors, counts, mine, commentCounts);

        setPosts((prev) => {
          if (!append) return next;
          const seen = new Set(prev.map((p) => p.post.id));
          return [...prev, ...next.filter((p) => !seen.has(p.post.id))];
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load feed';
        setError(msg);
        if (!append) setPosts([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    void loadPage(0, false);
  }, [loadPage]);

  useEffect(() => {
    const channel = supabase
      .channel('community-board-panel')
      .on('postgres_changes', { event: 'INSERT', schema: 'common', table: 'posts' }, async (payload) => {
        const row = normalizeRealtimePost(payload.new as Record<string, unknown>);
        if (!row) return;
        const authors = await loadAuthorsForUserIds([row.user_id]);
        const author = authors.get(row.user_id) || { id: row.user_id, displayName: 'Member' };
        const fp: FeedPost = {
          post: row,
          author,
          reactionCounts: {},
          myReactions: new Set(),
          commentCount: 0,
        };
        setPosts((prev) => {
          if (prev.some((p) => p.post.id === row.id)) return prev;
          return [fp, ...prev];
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'common', table: 'post_comments' }, (payload) => {
        const row = payload.new as { post_id: string; user_id: string };
        if (user?.id && row.user_id === user.id) return;
        setPosts((prev) =>
          prev.map((p) =>
            p.post.id === row.post_id ? { ...p, commentCount: p.commentCount + 1 } : p
          )
        );
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'common', table: 'posts' }, (payload) => {
        const id = (payload.old as { id?: string } | null)?.id;
        if (!id) return;
        setPosts((prev) => prev.filter((p) => p.post.id !== id));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const onUpdateFeedPost = useCallback((postId: string, updater: (fp: FeedPost) => FeedPost) => {
    setPosts((prev) => prev.map((p) => (p.post.id === postId ? updater(p) : p)));
  }, []);

  const onIncrementCommentCount = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.post.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p))
    );
  }, []);

  const onPostDeleted = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.post.id !== postId));
  }, []);

  const onPosted = useCallback((fp: FeedPost) => {
    setPosts((prev) => {
      if (prev.some((p) => p.post.id === fp.post.id)) return prev;
      return [fp, ...prev];
    });
  }, []);

  const loadMore = () => {
    if (!hasMore || loadingMore || loading) return;
    void loadPage(rangeStart, true);
  };

  return (
    <div className="flex max-h-[min(85vh,640px)] w-full min-w-0 flex-col bg-white dark:bg-dark-150">
      <div className="shrink-0 border-none border-gray-200 dark:border-gray-700 px-4 py-3 text-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Community Board</h2>
      </div>
      <div className="min-h-0 flex- overflow-y-auto overscroll-contain py-3 px-3 sm:px-4 flex flex-col items-center">
        <div className="w-full max-w-sm space-y-3">
        {user ? <PostComposer user={user} onPosted={onPosted} /> : null}

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-800 dark:text-red-200">
            <p className="font-medium">Could not load feed</p>
            <p className="mt-1 opacity-90">{error}</p>
          </div>
        )}

        {loading ? <FeedSkeleton /> : null}

        {!loading && !error && posts.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-8 text-center text-sm text-gray-600 dark:text-gray-300">
            No posts yet — be the first to share something!
          </div>
        )}

        {!loading &&
          posts
            .filter((fp) => fp.post?.id)
            .map((fp) => (
              <PostCard
                key={fp.post.id}
                feed={fp}
                currentUserId={user?.id}
                onUpdateFeedPost={onUpdateFeedPost}
                onIncrementCommentCount={onIncrementCommentCount}
                onPostDeleted={onPostDeleted}
              />
            ))}

        {!loading && hasMore && posts.length > 0 && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={() => loadMore()}
              disabled={loadingMore}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-200 disabled:opacity-50"
            >
              {loadingMore ? <LoadingSpinner size="xs" /> : 'Load more'}
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
