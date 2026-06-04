import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRelativeSafe } from '@/lib/formatRelativeSafe';
import type { CommentWithAuthor, CommunityCommentRow } from '@/lib/communityTypes';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { loadAuthorsForUserIds } from '@/lib/communityProfiles';

const PREVIEW = 3;

type Props = {
  postId: string;
  currentUserId?: string;
  commentCount: number;
  onLocalCommentPosted: () => void;
};

export const CommentThread: React.FC<Props> = ({ postId, currentUserId, commentCount, onLocalCommentPosted }) => {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .schema('common')
        .from('post_comments')
        .select('id, post_id, user_id, body, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = (data || []) as CommunityCommentRow[];
      const authors = await loadAuthorsForUserIds(rows.map((r) => r.user_id));
      setComments(
        rows.map((r) => ({
          ...r,
          author: authors.get(r.user_id) || { id: r.user_id, displayName: 'Member' },
        }))
      );
    } catch (e) {
      console.error('Failed to load comments', e);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (!open) return;
    void loadComments();
  }, [open, loadComments]);

  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel(`post_comments:${postId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'common', table: 'post_comments', filter: `post_id=eq.${postId}` },
        async (payload) => {
          const row = payload.new as CommunityCommentRow;
          const authors = await loadAuthorsForUserIds([row.user_id]);
          const author = authors.get(row.user_id) || { id: row.user_id, displayName: 'Member' };
          setComments((prev) => {
            if (prev.some((c) => c.id === row.id)) return prev;
            return [...prev, { ...row, author }];
          });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, postId]);

  const submit = async () => {
    const body = text.trim();
    if (!currentUserId || !body || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .schema('common')
        .from('post_comments')
        .insert({ post_id: postId, user_id: currentUserId, body })
        .select('id, post_id, user_id, body, created_at')
        .single();
      if (error) throw error;
      const row = data as CommunityCommentRow;
      const authors = await loadAuthorsForUserIds([row.user_id]);
      const author = authors.get(row.user_id) || { id: row.user_id, displayName: 'Member' };
      setComments((prev) => {
        if (prev.some((c) => c.id === row.id)) return prev;
        return [...prev, { ...row, author }];
      });
      setText('');
      onLocalCommentPosted();
    } catch (e) {
      console.error('Comment failed', e);
    } finally {
      setSubmitting(false);
    }
  };

  const visible = showAll ? comments : comments.slice(0, PREVIEW);
  const hidden = Math.max(0, comments.length - PREVIEW);

  return (
    <div className="mt-2 border-t border-gray-100 dark:border-dark-200 pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-[#f26722] dark:hover:text-[#f26722]"
      >
        <MessageCircle className="h-4 w-4" />
        {commentCount === 0 ? 'Comment' : `${commentCount} comment${commentCount === 1 ? '' : 's'}`}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {loading ? (
            <div className="flex justify-center py-4"><LoadingSpinner size="md" /></div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No comments yet.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {visible.map((c) => (
                  <li key={c.id} className="rounded-md bg-gray-50 dark:bg-dark-200/80 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{c.author.displayName}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                        {formatRelativeSafe(c.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap break-words">{c.body}</p>
                  </li>
                ))}
              </ul>
              {!showAll && hidden > 0 && (
                <button
                  type="button"
                  className="text-sm text-[#f26722] hover:underline"
                  onClick={() => setShowAll(true)}
                >
                  View all {comments.length} comments
                </button>
              )}
            </>
          )}

          {currentUserId ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a comment…"
                rows={2}
                className="form-textarea text-sm resize-y min-h-[2.5rem]"
              />
              <button
                type="button"
                disabled={!text.trim() || submitting}
                onClick={() => void submit()}
                className="self-end px-3 py-1.5 rounded-md text-sm font-medium text-white bg-[#f26722] hover:bg-[#e55611] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Posting…' : 'Reply'}
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">Sign in to comment.</p>
          )}
        </div>
      )}
    </div>
  );
};
