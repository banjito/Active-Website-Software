import { supabase } from '@/lib/supabase';

// Report history: status changes, reviewer notes and the tech's fix notes for one
// report (an assets row). Table and trigger are in database/migrations/report_activity.sql.
// Status changes are logged by the database; the app only adds fix notes.

export type ReportActivityKind =
  | 'status_change'
  | 'review_comment'
  | 'fix_note'
  | 'action_item'
  | 'field_flag';

export interface ReportActivity {
  id: number;
  asset_id: string;
  kind: ReportActivityKind;
  from_status: string | null;
  to_status: string | null;
  comment: string | null;
  actor_id: string | null;
  created_at: string;
  /** Rebuilt from backups; actor can be missing. */
  backfilled: boolean;
  /** Filled in from common.profiles. */
  actor_name: string | null;
}

/** One send-back: the reviewer's Issue note and the fix notes that answered it. */
export interface IssueRound {
  issue: ReportActivity;
  fixNotes: ReportActivity[];
}

const STATUS_LABELS: Record<string, string> = {
  'not started': 'Not Started',
  in_progress: 'In Progress',
  ready_for_review: 'Ready for Review',
  submitted: 'Ready for Review',
  approved: 'Approved',
  sent: 'Sent',
  issue: 'Issue',
  rejected: 'Issue',
  archived: 'Archived',
};

export const reportStatusLabel = (status: string | null | undefined) =>
  status ? STATUS_LABELS[status] ?? status : 'None';

/** Display names for user ids, keyed by id. Best effort: unknown ids are left out. */
export async function fetchUserNames(
  ids: (string | null | undefined)[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean))) as string[];
  if (unique.length === 0) return {};
  const { data, error } = await supabase
    .schema('common')
    .from('profiles')
    .select('id, full_name, email')
    .in('id', unique);
  if (error) {
    console.warn('[reportActivity] Failed to load names:', error);
    return {};
  }
  const names: Record<string, string> = {};
  (data || []).forEach((p: any) => {
    names[p.id] = p.full_name || p.email;
  });
  return names;
}

/** Oldest first. */
export async function fetchReportActivity(assetId: string): Promise<ReportActivity[]> {
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('report_activity')
    .select('id, asset_id, kind, from_status, to_status, comment, actor_id, created_at, backfilled')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  const rows = data || [];
  const names = await fetchUserNames(rows.map((r: any) => r.actor_id));
  return rows.map((r: any) => ({
    ...r,
    actor_name: r.actor_id ? names[r.actor_id] ?? null : null,
  }));
}

/** Every time the report was sent to Issue, with the fix notes written after it. Oldest first. */
export function issueRounds(activity: ReportActivity[]): IssueRound[] {
  const rounds: IssueRound[] = [];
  activity.forEach((row) => {
    const current = rounds[rounds.length - 1];
    if (row.kind === 'status_change' && row.to_status === 'issue') {
      rounds.push({ issue: row, fixNotes: [] });
    } else if (row.kind === 'review_comment' && row.to_status === 'issue' && current) {
      // Reviewer reworded the note while the report was still in Issue
      current.issue = { ...current.issue, comment: row.comment };
    } else if (row.kind === 'fix_note' && current) {
      current.fixNotes.push(row);
    }
  });
  return rounds;
}

/**
 * True when the latest send-back to Issue has no fix note yet. Moving back to
 * In Progress doesn't count as an answer; any later review step does.
 */
export function awaitingFixNote(activity: ReportActivity[]): boolean {
  for (let i = activity.length - 1; i >= 0; i--) {
    const row = activity[i];
    if (row.kind === 'fix_note') return false;
    if (row.kind !== 'status_change') continue;
    if (row.to_status === 'in_progress' || row.to_status === 'not started') continue;
    return row.to_status === 'issue';
  }
  return false;
}

export async function addFixNote(assetId: string, note: string): Promise<void> {
  // Not retried: a repeated insert would log the note twice.
  const { error } = await supabase
    .schema('neta_ops')
    .from('report_activity')
    .insert({ asset_id: assetId, kind: 'fix_note', comment: note.trim() });
  if (error) throw error;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * "Sent back before" box for the review dialog in ReportApprovalWorkflow, which
 * builds its markup as a string outside React. Newest send-back first. Empty
 * string when the report was never sent to Issue.
 */
export function issueRoundsHtml(rounds: IssueRound[]): string {
  if (rounds.length === 0) return '';
  const byline = (row: ReportActivity) =>
    escapeHtml([row.actor_name, formatWhen(row.created_at)].filter(Boolean).join(' · '));
  const items = [...rounds]
    .reverse()
    .map(({ issue, fixNotes }) => {
      const fixes = fixNotes.length
        ? fixNotes
            .map(
              (n) => `
          <div style="font-size:0.8125rem;color:#111827;white-space:pre-wrap;word-break:break-word;"><strong>Fix note:</strong> ${escapeHtml(n.comment || '')}</div>
          <div style="font-size:0.75rem;color:#6b7280;">${byline(n)}</div>`,
            )
            .join('')
        : `<div style="font-size:0.75rem;color:#b91c1c;">No fix note from the tech</div>`;
      return `
        <div style="border-left:3px solid #f59e0b;padding-left:0.5rem;display:flex;flex-direction:column;gap:0.25rem;">
          <div style="font-size:0.8125rem;color:#111827;white-space:pre-wrap;word-break:break-word;">${escapeHtml(issue.comment || '(no comment)')}</div>
          <div style="font-size:0.75rem;color:#6b7280;">${byline(issue)}</div>
          ${fixes}
        </div>`;
    })
    .join('');
  const times = rounds.length === 1 ? '1 time' : `${rounds.length} times`;
  return `
    <div style="border:1px solid #fcd34d;background:#fffbeb;padding:0.75rem;display:flex;flex-direction:column;gap:0.625rem;">
      <div style="font-size:0.875rem;font-weight:600;color:#92400e;">Sent back to Issue ${times} before</div>
      ${items}
    </div>`;
}
