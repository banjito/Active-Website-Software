export type ReactionType = 'like' | 'heart' | 'laugh' | 'fire' | 'clap';

export const REACTION_EMOJI: Record<ReactionType, string> = {
  like: '👍',
  heart: '❤️',
  laugh: '😂',
  fire: '🔥',
  clap: '👏',
};

export const ALL_REACTION_TYPES: ReactionType[] = ['like', 'heart', 'laugh', 'fire', 'clap'];

export interface CommunityPostRow {
  id: string;
  user_id: string;
  body: string;
  media_urls: string[] | null;
  created_at: string;
}

export interface CommunityAuthor {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface CommunityCommentRow {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export interface FeedPost {
  post: CommunityPostRow;
  author: CommunityAuthor;
  reactionCounts: Partial<Record<ReactionType, number>>;
  myReactions: Set<ReactionType>;
  commentCount: number;
}

export interface CommentWithAuthor extends CommunityCommentRow {
  author: CommunityAuthor;
}
