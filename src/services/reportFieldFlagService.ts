import { supabase } from '@/lib/supabase';

// Field flags: a reviewer marks the exact fields that are wrong or blank when
// sending a report back as an Issue. Table is in
// database/migrations/report_field_flags.sql.

export type FieldFlagReason =
  | 'blank'
  | 'wrong_value'
  | 'check_units'
  | 'out_of_tolerance'
  | 'missing_photo';

export const FIELD_FLAG_REASONS: { value: FieldFlagReason; label: string }[] = [
  { value: 'blank', label: 'Blank' },
  { value: 'wrong_value', label: 'Wrong value' },
  { value: 'check_units', label: 'Check units' },
  { value: 'out_of_tolerance', label: 'Out of tolerance' },
  { value: 'missing_photo', label: 'Missing photo' },
];

export const fieldFlagReasonLabel = (reason: string | null | undefined) =>
  FIELD_FLAG_REASONS.find((r) => r.value === reason)?.label || '';

export type FieldFlagTargetKind = 'field' | 'section';

export interface FieldFlag {
  id: string;
  asset_id: string;
  target_kind: FieldFlagTargetKind;
  field_index: number;
  field_key: string | null;
  context: string;
  locator: Record<string, any>;
  value_at_flag: string | null;
  reason: FieldFlagReason | null;
  note: string | null;
  status: 'open' | 'removed' | 'resolved';
  created_by: string | null;
  created_at: string;
}

export interface NewFieldFlag {
  asset_id: string;
  target_kind: FieldFlagTargetKind;
  field_index: number;
  field_key: string | null;
  context: string;
  locator: Record<string, any>;
  value_at_flag: string | null;
  reason: FieldFlagReason | null;
  note: string | null;
}

/** Fired on window with detail { assetId } whenever flags are added or changed. */
export const FIELD_FLAGS_CHANGED_EVENT = 'reportFieldFlagsChanged';

const notifyChanged = (assetId: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(FIELD_FLAGS_CHANGED_EVENT, { detail: { assetId } }),
  );
};

const table = () => supabase.schema('neta_ops').from('report_field_flags');

export const fetchOpenFieldFlags = async (assetId: string): Promise<FieldFlag[]> => {
  const { data, error } = await table()
    .select('*')
    .eq('asset_id', assetId)
    .eq('status', 'open')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as FieldFlag[];
};

export const createFieldFlag = async (
  flag: NewFieldFlag,
  userId: string,
): Promise<FieldFlag> => {
  const { data, error } = await table()
    .insert({ ...flag, created_by: userId })
    .select('*')
    .single();
  if (error) throw error;
  notifyChanged(flag.asset_id);
  return data as FieldFlag;
};

export const updateFieldFlag = async (
  flag: FieldFlag,
  changes: { reason: FieldFlagReason | null; note: string | null },
): Promise<void> => {
  const { error } = await table().update(changes).eq('id', flag.id);
  if (error) throw error;
  notifyChanged(flag.asset_id);
};

export const removeFieldFlag = async (
  flag: FieldFlag,
  userId: string,
): Promise<void> => {
  const { error } = await table()
    .update({
      status: 'removed',
      closed_by: userId,
      closed_at: new Date().toISOString(),
    })
    .eq('id', flag.id);
  if (error) throw error;
  notifyChanged(flag.asset_id);
};

/** Reviewer says the tech fixed it: the flag closes. */
export const markFieldFlagFixed = async (
  flag: FieldFlag,
  userId: string,
): Promise<void> => {
  const { error } = await table()
    .update({
      status: 'resolved',
      closed_by: userId,
      closed_at: new Date().toISOString(),
    })
    .eq('id', flag.id);
  if (error) throw error;
  notifyChanged(flag.asset_id);
};

/**
 * Reviewer says the field is still wrong after the tech changed it: take the
 * current value as the new starting point, so it shows red again instead of
 * amber "Changed".
 */
export const markFieldFlagStillWrong = async (
  flag: FieldFlag,
  currentValue: string,
): Promise<void> => {
  const { error } = await table()
    .update({ value_at_flag: currentValue })
    .eq('id', flag.id);
  if (error) throw error;
  notifyChanged(flag.asset_id);
};

/**
 * When the report was last sent for review, from the report history (logged by
 * a trigger, so every way of submitting counts). Flags older than this are
 * from the previous round.
 */
export const fetchRoundStart = async (assetId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('report_activity')
    .select('created_at')
    .eq('asset_id', assetId)
    .eq('kind', 'status_change')
    .eq('to_status', 'ready_for_review')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.created_at ?? null;
};

/** Report statuses where open flags matter (approval queue rows say "submitted"). */
const FLAG_COUNT_STATUSES = ['issue', 'rejected', 'in_progress', 'ready_for_review', 'submitted'];

/**
 * Open flag counts per report, for "2 fields flagged" tags in report lists.
 * Skips reports in other statuses, and flags from before a report's last
 * approval (an old round). Returns {} on error so a list still loads.
 */
export const fetchOpenFieldFlagCounts = async (
  reports: { id: string; status?: string | null; approved_at?: string | null }[],
): Promise<Record<string, number>> => {
  const counts: Record<string, number> = {};
  const relevant = reports.filter((r) =>
    FLAG_COUNT_STATUSES.includes(String(r.status || '').toLowerCase()),
  );
  if (relevant.length === 0) return counts;
  const approvedAt: Record<string, number> = {};
  relevant.forEach((r) => {
    if (r.approved_at) approvedAt[r.id] = Date.parse(r.approved_at);
  });
  const ids = relevant.map((r) => r.id);
  try {
    // Chunked so a big job doesn't overflow the request URL
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await table()
        .select('asset_id, created_at')
        .eq('status', 'open')
        .in('asset_id', ids.slice(i, i + 200));
      if (error) throw error;
      (data || []).forEach((row: any) => {
        const cutoff = approvedAt[row.asset_id];
        if (cutoff && Date.parse(row.created_at) <= cutoff) return;
        counts[row.asset_id] = (counts[row.asset_id] || 0) + 1;
      });
    }
  } catch (e) {
    console.warn('[fieldFlags] Failed to load open counts:', e);
    return {};
  }
  return counts;
};

export interface FlaggableReportAsset {
  id: string;
  status: string;
  approved_at: string | null;
}

/**
 * Finds the open report's asset from its URL parts, the same way
 * ReportStatusButton does: exact file_url first, then by report id for older
 * assets saved under a different slug.
 */
export const findReportAsset = async (parts: {
  jobId: string;
  slug: string;
  reportId: string;
}): Promise<FlaggableReportAsset | null> => {
  const scheme = parts.slug.startsWith('custom-form/') ? 'custom-form' : 'report';
  const fileUrl = `${scheme}:/jobs/${parts.jobId}/${parts.slug}/${parts.reportId}`;
  const columns = 'id, status, approved_at, file_url';
  const assets = () => supabase.schema('neta_ops').from('assets');

  const { data, error } = await assets().select(columns).eq('file_url', fileUrl).limit(1);
  if (error) throw error;
  let row: any = data?.[0];

  if (!row) {
    const { data: bySuffix, error: suffixError } = await assets()
      .select(columns)
      .ilike('file_url', `%/${parts.reportId}`);
    if (suffixError) throw suffixError;
    row =
      bySuffix?.find((a: any) =>
        (a.file_url || '').startsWith(`${scheme}:/jobs/${parts.jobId}/`),
      ) ||
      bySuffix?.find((a: any) => (a.file_url || '').startsWith(`${scheme}:/jobs/`));
  }

  if (!row) return null;
  return {
    id: row.id,
    status: String(row.status || 'not started').toLowerCase(),
    approved_at: row.approved_at || null,
  };
};
