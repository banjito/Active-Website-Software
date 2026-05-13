import React, { useState } from 'react';
import { Trash2, User as UserIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRelativeSafe } from '@/lib/formatRelativeSafe';
import type { FeedPost } from '@/lib/communityTypes';
import { ReactionBar } from './ReactionBar';
import { CommentThread } from './CommentThread';

type Props = {
  feed: FeedPost;
  currentUserId?: string;
  onUpdateFeedPost: (postId: string, updater: (fp: FeedPost) => FeedPost) => void;
  onIncrementCommentCount: (postId: string) => void;
  onPostDeleted: (postId: string) => void;
};

function mediaKind(url: string): 'image' | 'video' | 'other' {
  if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url)) return 'image';
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) return 'video';
  return 'other';
}

export const PostCard: React.FC<Props> = ({
  feed,
  currentUserId,
  onUpdateFeedPost,
  onIncrementCommentCount,
  onPostDeleted,
}) => {
  const { post, author } = feed;
  const displayBody = (post.body || '').trim();
  const [deleting, setDeleting] = useState(false);
  const isOwner = Boolean(currentUserId && post.user_id === currentUserId);

  const handleDelete = async () => {
    if (!isOwner || deleting) return;
    if (!window.confirm('Delete this post? Comments and reactions will be removed too.')) return;
    setDeleting(true);
    try {
      const { error } = await supabase.schema('common').from('posts').delete().eq('id', post.id).eq('user_id', post.user_id);
      if (error) throw error;
      onPostDeleted(post.id);
    } catch (e) {
      console.error('Delete post failed', e);
      alert(e instanceof Error ? e.message : 'Could not delete post.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <article className="w-full bg-white dark:bg-dark-150 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-2.5">
      <div className="flex gap-2">
        <div className="h-8 w-8 rounded-full overflow-hidden bg-gray-200 dark:bg-dark-200 flex-shrink-0 flex items-center justify-center">
          {author.avatarUrl ? (
            <img src={author.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-1.5">
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0 min-w-0">
              <span className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{author.displayName}</span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{formatRelativeSafe(post.created_at)}</span>
            </div>
            {isOwner ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="shrink-0 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                aria-label="Delete post"
              >
                <Trash2 className="h-3 w-3" />
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            ) : null}
          </div>
          {displayBody ? (
            <div className="mt-1.5 inline-block max-w-full rounded-2xl bg-gray-100 dark:bg-dark-200/90 px-2.5 py-1.5">
              <p className="text-sm leading-snug text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">{displayBody}</p>
            </div>
          ) : null}

          {(post.media_urls || []).length > 0 && (
            <div className="mt-2 space-y-1.5">
              {(post.media_urls || []).map((url, idx) => {
                const kind = mediaKind(url);
                if (kind === 'image') {
                  return (
                    <a key={`${post.id}-m-${idx}`} href={url} target="_blank" rel="noreferrer" className="block">
                      <img src={url} alt="" className="max-h-56 w-full rounded-md object-contain bg-transparent" />
                    </a>
                  );
                }
                if (kind === 'video') {
                  return (
                    <video key={`${post.id}-m-${idx}`} src={url} controls className="max-h-56 w-full rounded-md bg-black" />
                  );
                }
                return (
                  <a key={`${post.id}-m-${idx}`} href={url} target="_blank" rel="noreferrer" className="text-sm text-[#f26722] hover:underline break-all">
                    {url}
                  </a>
                );
              })}
            </div>
          )}

          <ReactionBar postId={post.id} currentUserId={currentUserId} feed={feed} onUpdateFeedPost={onUpdateFeedPost} />

          <CommentThread
            postId={post.id}
            currentUserId={currentUserId}
            commentCount={feed.commentCount}
            onLocalCommentPosted={() => onIncrementCommentCount(post.id)}
          />
        </div>
      </div>
    </article>
  );
};
