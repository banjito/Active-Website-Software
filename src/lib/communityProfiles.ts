import { supabase } from '@/lib/supabase';
import type { CommunityAuthor } from '@/lib/communityTypes';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return typeof s === 'string' && UUID_RE.test(s);
}

/**
 * Resolve display name + avatar for a set of auth user ids (profiles + RPC fallback).
 */
export async function loadAuthorsForUserIds(userIds: string[]): Promise<Map<string, CommunityAuthor>> {
  const unique = [...new Set(userIds)].filter(isUuid);
  const map = new Map<string, CommunityAuthor>();

  if (unique.length === 0) return map;

  try {
    const { data: profiles, error: profilesError } = await supabase
      .schema('common')
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .in('id', unique);

    if (profilesError) {
      console.warn('community: profiles batch skipped', profilesError.message);
    } else {
      for (const row of profiles || []) {
        const r = row as {
          id: string;
          full_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
        };
        const displayName = r.full_name || (r.email ? r.email.split('@')[0] : 'Member');
        map.set(r.id, {
          id: r.id,
          displayName,
          avatarUrl: r.avatar_url || null,
        });
      }
    }
  } catch (e) {
    console.warn('community: profiles batch error', e);
  }

  const missing = unique.filter((id) => !map.has(id));
  await Promise.all(
    missing.map(async (id) => {
      try {
        const { data: metaData } = await supabase.schema('common').rpc('get_user_metadata', { p_user_id: id });
        if (metaData) {
          const m = metaData as {
            email?: string;
            full_name?: string;
            name?: string;
            profile_image?: string;
            avatar_url?: string;
          };
          const email = m.email || '';
          const displayName = m.full_name || m.name || (email ? email.split('@')[0] : 'Member');
          map.set(id, {
            id,
            displayName,
            avatarUrl: m.profile_image || m.avatar_url || null,
          });
        } else {
          map.set(id, { id, displayName: 'Member' });
        }
      } catch {
        map.set(id, { id, displayName: 'Member' });
      }
    })
  );

  return map;
}
