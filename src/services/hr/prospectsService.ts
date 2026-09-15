import { supabase } from '@/lib/supabase';
import { describeSupabaseError, withWriteRetry } from '@/lib/supabaseRetry';
import {
  findDuplicates,
  MatchSubject,
  DuplicateReport,
  ProspectSource,
  ProspectStatus,
} from '@/lib/talentPool/normalize';
import type { ExistingProspect } from '@/lib/talentPool/csvImport';

// Every call goes through a database function in the common schema. Clients
// have no direct table access; see database/migrations/talent_pool.sql.

export type { ProspectSource, ProspectStatus };

export interface Prospect {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  job_title: string | null;
  current_org: string | null;
  location: string | null;
  source: ProspectSource;
  status: ProspectStatus;
  availability: string | null;
  needs_follow_up: boolean;
  owner_id: string | null;
  owner_name: string | null;
  last_contact_date: string | null;
  candidate_id: string | null;
  promoted_at: string | null;
  has_import_refs: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectInput {
  first_name?: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  job_title?: string | null;
  current_org?: string | null;
  location?: string | null;
  source?: ProspectSource;
  status?: Exclude<ProspectStatus, 'promoted'>;
  availability?: string | null;
  needs_follow_up?: boolean;
  owner_id?: string | null;
}

export type ProspectSort = 'name' | 'status' | 'source' | 'location' | 'last_contact_date' | 'created_at' | 'updated_at';

export interface ProspectFilters {
  search?: string;
  source?: ProspectSource | '';
  /** A user id, 'unassigned', or '' for anyone. */
  owner?: string;
  followUp?: boolean;
}

export interface ListParams extends ProspectFilters {
  /** '' = everything except promoted, 'all' = everything, or one status. */
  status?: ProspectStatus | 'all' | '';
  page?: number;
  pageSize?: number;
  sort?: ProspectSort;
  ascending?: boolean;
}

export type ActivityType = 'note' | 'call' | 'text' | 'email' | 'status_change' | 'promoted';

export interface ProspectActivity {
  id: string;
  type: ActivityType;
  body: string | null;
  occurred_at: string | null;
  original_author: string | null;
  imported: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface TalentPoolMember {
  user_id: string;
  name: string;
  email: string;
}

export interface TalentPoolAccess {
  can_access: boolean;
  can_manage: boolean;
  promotion_enabled: boolean;
}

export interface CandidateMatch {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  position_applied: string;
  status: string;
  applied_date: string | null;
  match: 'email' | 'name';
}

export interface PromoteInput {
  first_name: string;
  last_name: string;
  email: string;
  position_applied: string;
  source: string;
  phone?: string | null;
  requisition_id?: string | null;
  existing_candidate_id?: string | null;
  summary?: string | null;
  /** Candidate ids the reviewer already saw and decided are a different application. */
  acknowledged_candidate_ids?: string[];
}

export type PromoteResult =
  | { kind: 'promoted'; candidateId: string; alreadyPromoted: boolean; linkedExisting: boolean }
  | { kind: 'conflicts'; conflicts: CandidateMatch[] };

export class TalentPoolError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'TalentPoolError';
    this.code = code;
  }
}

const db = () => supabase.schema('common');

// Error messages never include contact data or note bodies.
function fail(label: string, error: any, status?: number): never {
  console.error(`[prospectsService] ${label} failed (${error?.code ?? status ?? 'unknown'})`);
  throw new TalentPoolError(describeSupabaseError(error, status), error?.code);
}

async function rpc<T>(label: string, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error, status } = await db().rpc(fn, args);
  if (error) fail(label, error, status);
  return data as T;
}

/** For operations that are safe to repeat (fixed ids, set-to-value updates). */
async function rpcRetry<T>(label: string, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error, status } = await withWriteRetry(() => db().rpc(fn, args), { label });
  if (error) fail(label, error, status);
  return data as T;
}

function ownerArgs(owner?: string) {
  if (owner === 'unassigned') return { p_owner: null, p_unassigned: true };
  return { p_owner: owner || null, p_unassigned: false };
}

export const prospectsService = {
  async getAccess(): Promise<TalentPoolAccess> {
    return rpc('getAccess', 'talent_pool_my_access', {});
  },

  async list(params: ListParams = {}): Promise<{ rows: Prospect[]; total: number }> {
    const pageSize = params.pageSize ?? 50;
    const page = Math.max(params.page ?? 1, 1);
    const data = await rpc<{ rows: Prospect[]; total: number }>('list', 'talent_pool_list', {
      p_search: params.search?.trim() || null,
      p_status: params.status || null,
      p_source: params.source || null,
      ...ownerArgs(params.owner),
      p_follow_up: !!params.followUp,
      p_sort: params.sort ?? 'created_at',
      p_ascending: !!params.ascending,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });
    return { rows: data?.rows ?? [], total: Number(data?.total ?? 0) };
  },

  async getCounts(filters: ProspectFilters = {}): Promise<Record<ProspectStatus, number>> {
    const data = await rpc<Record<string, number>>('getCounts', 'talent_pool_counts', {
      p_search: filters.search?.trim() || null,
      p_source: filters.source || null,
      ...ownerArgs(filters.owner),
      p_follow_up: !!filters.followUp,
    });
    const counts = { new: 0, contacted: 0, interested: 0, future_roles: 0, not_interested: 0, promoted: 0 };
    for (const [status, n] of Object.entries(data ?? {})) {
      if (status in counts) counts[status as ProspectStatus] = Number(n);
    }
    return counts;
  },

  async getById(id: string): Promise<Prospect | null> {
    return rpc('getById', 'talent_pool_get', { p_id: id });
  },

  async listMembers(): Promise<TalentPoolMember[]> {
    return (await rpc<TalentPoolMember[]>('listMembers', 'talent_pool_members_list', {})) ?? [];
  },

  /**
   * Id is chosen client-side so a retried request returns the same prospect.
   * The CSV import passes its own so re-running a partial import is safe too.
   */
  async create(input: ProspectInput, id: string = crypto.randomUUID()): Promise<Prospect> {
    return rpcRetry('create', 'talent_pool_create', { p_id: id, p: input });
  },

  async update(id: string, input: ProspectInput, expectedUpdatedAt?: string): Promise<Prospect> {
    // Not retried: a status change also writes an activity event, and the
    // stale-edit check would reject the repeat anyway.
    return rpc('update', 'talent_pool_update', {
      p_id: id,
      p: input,
      p_expected_updated_at: expectedUpdatedAt ?? null,
    });
  },

  async delete(id: string): Promise<void> {
    await rpcRetry('delete', 'talent_pool_delete', { p_id: id });
  },

  async bulkUpdateStatus(ids: string[], status: Exclude<ProspectStatus, 'promoted'>): Promise<number> {
    const data = await rpc<{ updated: number }>('bulkUpdateStatus', 'talent_pool_bulk_status', {
      p_ids: ids,
      p_status: status,
    });
    return data?.updated ?? 0;
  },

  async bulkAssignOwner(ids: string[], ownerId: string | null): Promise<number> {
    const data = await rpcRetry<{ updated: number }>('bulkAssignOwner', 'talent_pool_bulk_owner', {
      p_ids: ids,
      p_owner_id: ownerId,
    });
    return data?.updated ?? 0;
  },

  async getActivity(
    prospectId: string,
    { page = 1, pageSize = 50 }: { page?: number; pageSize?: number } = {},
  ): Promise<{ rows: ProspectActivity[]; total: number }> {
    const data = await rpc<{ rows: ProspectActivity[]; total: number }>('getActivity', 'talent_pool_activity', {
      p_prospect_id: prospectId,
      p_limit: pageSize,
      p_offset: (Math.max(page, 1) - 1) * pageSize,
    });
    return { rows: data?.rows ?? [], total: Number(data?.total ?? 0) };
  },

  async addActivity(
    prospectId: string,
    input: { type: 'note' | 'call' | 'text' | 'email'; body?: string | null; occurred_at?: string | null; id?: string },
  ): Promise<void> {
    await rpcRetry('addActivity', 'talent_pool_add_activity', {
      p_id: input.id ?? crypto.randomUUID(),
      p_prospect_id: prospectId,
      p_type: input.type,
      p_body: input.body ?? null,
      p_occurred_at: input.type === 'note' ? null : input.occurred_at ?? null,
    });
  },

  async findCandidateMatches(input: { email?: string; first_name?: string; last_name?: string }): Promise<CandidateMatch[]> {
    return (
      (await rpc<CandidateMatch[]>('findCandidateMatches', 'talent_pool_candidate_matches', {
        p_email: input.email?.trim() || null,
        p_first_name: input.first_name?.trim() || null,
        p_last_name: input.last_name?.trim() || null,
      })) ?? []
    );
  },

  /** Existing prospects sharing an email, LinkedIn URL, or name key. Used by the CSV import preview. */
  async findIdentityMatches(lookup: { emails: string[]; linkedinUrls: string[]; nameKeys: string[] }): Promise<ExistingProspect[]> {
    if (!lookup.emails.length && !lookup.linkedinUrls.length && !lookup.nameKeys.length) return [];
    return (
      (await rpc<ExistingProspect[]>('findIdentityMatches', 'talent_pool_identity_matches', {
        p_emails: lookup.emails,
        p_linkedin_urls: lookup.linkedinUrls,
        p_name_keys: lookup.nameKeys,
      })) ?? []
    );
  },

  /** Classifies rows against existing prospects. See normalize.ts for the rules. */
  findDuplicates(rows: MatchSubject[], existing: MatchSubject[]): DuplicateReport {
    return findDuplicates(rows, existing);
  },

  /**
   * One database transaction: creates or links the application, marks the
   * prospect promoted, and logs one event. Safe to repeat; a retry returns the
   * candidate already linked.
   */
  async promoteToCandidate(prospectId: string, input: PromoteInput): Promise<PromoteResult> {
    const required: Array<keyof PromoteInput> = ['first_name', 'last_name', 'email', 'position_applied', 'source'];
    if (!input.existing_candidate_id) {
      const missing = required.filter((k) => !String(input[k] ?? '').trim());
      if (missing.length) throw new TalentPoolError(`Missing: ${missing.join(', ').replace(/_/g, ' ')}`);
    }
    const data = await rpcRetry<any>('promoteToCandidate', 'talent_pool_promote', {
      p_prospect_id: prospectId,
      p: {
        ...input,
        acknowledged_candidate_ids: input.acknowledged_candidate_ids ?? [],
      },
    });
    if (data?.conflicts) return { kind: 'conflicts', conflicts: data.conflicts };
    return {
      kind: 'promoted',
      candidateId: data.candidate_id,
      alreadyPromoted: !!data.already_promoted,
      linkedExisting: !!data.linked_existing,
    };
  },
};
