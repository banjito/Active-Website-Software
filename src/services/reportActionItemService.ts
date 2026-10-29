import { supabase } from '@/lib/supabase';
import { BRAND_COLOR } from '@/lib/companyConfig';
import { escapeHtml, fetchUserNames } from '@/services/reportActivityService';

// Action items: things on a passing report that still need doing or telling the
// customer. ID = report number + item number (26103-203-2). Tables and the two
// functions that create items and change their status are in
// database/migrations/report_action_items.sql.

export type ActionItemStatus =
  | 'unaddressed'
  | 'verbally_communicated'
  | 'formally_notified'
  | 'closed'
  | 'archived';
export type ActionItemCategory =
  | 'cosmetic_damage'
  | 'corrosion_contamination'
  | 'missing_hardware'
  | 'labeling_nameplate'
  | 'drawing_spec_discrepancy'
  | 'improper_workmanship'
  | 'grounding_bonding'
  | 'torque_connections'
  | 'clearance_access'
  | 'settings_discrepancy'
  | 'firmware_software'
  | 'marginal_test_result'
  | 'unable_to_test'
  | 'retest_recommended'
  | 'thermal_anomaly'
  | 'safety_concern'
  | 'code_standard_observation'
  | 'manufacturer_recommendation'
  | 'recommendation_improvement'
  | 'other';
export type ActionItemPriority = 'low' | 'normal' | 'high' | 'urgent';

// Order is the order they appear in menus and filters.
export const ACTION_ITEM_STATUS_LABELS: Record<ActionItemStatus, string> = {
  unaddressed: 'Unaddressed',
  verbally_communicated: 'Verbally communicated',
  formally_notified: 'Formally notified',
  closed: 'Closed',
  archived: 'Archive',
};

/** Prompt for the required note when moving an item to each status. */
export const ACTION_ITEM_STATUS_NOTE_HINTS: Record<ActionItemStatus, string> = {
  unaddressed: 'Why it needs attention again',
  verbally_communicated: 'Who you told, e.g. Told Jim (site lead) at walkdown',
  formally_notified: 'How and to whom, e.g. Emailed Jim / in AMP report / customer CX system',
  closed: 'What closed it out',
  archived: 'Why it no longer applies',
};

export const ACTION_ITEM_CATEGORY_LABELS: Record<ActionItemCategory, string> = {
  cosmetic_damage: 'Cosmetic damage',
  corrosion_contamination: 'Corrosion / contamination',
  missing_hardware: 'Missing hardware',
  labeling_nameplate: 'Labeling / nameplate',
  drawing_spec_discrepancy: 'Drawing / specification discrepancy',
  improper_workmanship: 'Improper workmanship',
  grounding_bonding: 'Grounding / bonding',
  torque_connections: 'Torque / connections',
  clearance_access: 'Clearance / access',
  settings_discrepancy: 'Settings discrepancy',
  firmware_software: 'Firmware / software',
  marginal_test_result: 'Marginal test result',
  unable_to_test: 'Unable to test',
  retest_recommended: 'Retest recommended',
  thermal_anomaly: 'Thermal anomaly',
  safety_concern: 'Safety concern',
  code_standard_observation: 'Code / standard observation',
  manufacturer_recommendation: 'Manufacturer recommendation',
  recommendation_improvement: 'Recommendation / improvement',
  other: 'Other',
};

export const ACTION_ITEM_PRIORITY_LABELS: Record<ActionItemPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export interface ActionItem {
  id: string;
  asset_id: string;
  job_id: string;
  item_number: number;
  item_code: string;
  title: string;
  description: string | null;
  category: ActionItemCategory;
  priority: ActionItemPriority;
  status: ActionItemStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionItemUpdate {
  id: number;
  item_id: string;
  from_status: ActionItemStatus | null;
  to_status: ActionItemStatus | null;
  note: string | null;
  updated_by: string | null;
  created_at: string;
  updated_by_name: string | null;
}

export interface ActionItemPhoto {
  id: string;
  item_id: string;
  file_url: string;
  file_name: string | null;
  created_at: string;
}

export interface ActionItemDetail {
  updates: ActionItemUpdate[];
  photos: ActionItemPhoto[];
  recipients: { user_id: string; name: string | null; seen_at: string | null }[];
  createdByName: string | null;
}

const ITEM_COLUMNS =
  'id, asset_id, job_id, item_number, item_code, title, description, category, priority, status, created_by, created_at, updated_at';

/** Oldest first, so the numbers read 1, 2, 3. */
export async function fetchActionItems(assetId: string): Promise<ActionItem[]> {
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('report_action_items')
    .select(ITEM_COLUMNS)
    .eq('asset_id', assetId)
    .order('item_number', { ascending: true });
  if (error) throw error;
  return (data || []) as ActionItem[];
}

/** Every item on these reports, any status. For the job's Action items tab. */
export async function fetchActionItemsForAssets(assetIds: string[]): Promise<ActionItem[]> {
  const items: ActionItem[] = [];
  // Chunked so a big job doesn't overflow the request URL
  for (let i = 0; i < assetIds.length; i += 200) {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('report_action_items')
      .select(ITEM_COLUMNS)
      .in('asset_id', assetIds.slice(i, i + 200));
    if (error) throw error;
    items.push(...((data || []) as ActionItem[]));
  }
  return items;
}

export interface ActionItemWithContext extends ActionItem {
  report_name: string | null;
  job_number: string | null;
  job_title: string | null;
}

/**
 * Items across every job, newest first, with report and job names, for the
 * Action items button on the jobs list. Capped so it stays quick.
 */
export async function fetchActionItemsAcrossJobs(limit = 2000): Promise<ActionItemWithContext[]> {
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('report_action_items')
    .select(ITEM_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const items = (data || []) as ActionItem[];

  const assetIds = Array.from(new Set(items.map((i) => i.asset_id)));
  const jobIds = Array.from(new Set(items.map((i) => i.job_id)));
  const assetNames = new Map<string, string>();
  const jobs = new Map<string, { job_number: string | null; title: string | null }>();
  for (let i = 0; i < assetIds.length; i += 200) {
    const { data: rows } = await supabase
      .schema('neta_ops')
      .from('assets')
      .select('id, name')
      .in('id', assetIds.slice(i, i + 200));
    (rows || []).forEach((a: any) => assetNames.set(a.id, a.name));
  }
  for (let i = 0; i < jobIds.length; i += 200) {
    const { data: rows } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('id, job_number, title')
      .in('id', jobIds.slice(i, i + 200));
    (rows || []).forEach((j: any) => jobs.set(j.id, { job_number: j.job_number, title: j.title }));
  }
  return items.map((i) => ({
    ...i,
    report_name: assetNames.get(i.asset_id) ?? null,
    job_number: jobs.get(i.job_id)?.job_number ?? null,
    job_title: jobs.get(i.job_id)?.title ?? null,
  }));
}

/** How many items are unaddressed across every job. Best effort: 0 on failure. */
export async function fetchUnaddressedActionItemCount(): Promise<number> {
  const { count, error } = await supabase
    .schema('neta_ops')
    .from('report_action_items')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'unaddressed');
  if (error) {
    console.warn('[actionItems] Failed to count unaddressed items:', error);
    return 0;
  }
  return count || 0;
}

/**
 * Unaddressed action items per report, keyed by asset id, for badges on report lists.
 * Best effort: a failure (or the table not existing yet) yields {}.
 */
export async function fetchOpenActionItemCounts(
  assetIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (assetIds.length === 0) return counts;
  try {
    // Chunked so a big job doesn't overflow the request URL
    for (let i = 0; i < assetIds.length; i += 200) {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('report_action_items')
        .select('asset_id')
        .eq('status', 'unaddressed')
        .in('asset_id', assetIds.slice(i, i + 200));
      if (error) throw error;
      (data || []).forEach((row: any) => {
        counts[row.asset_id] = (counts[row.asset_id] || 0) + 1;
      });
    }
  } catch (e) {
    console.warn('[actionItems] Failed to load open counts:', e);
    return {};
  }
  return counts;
}

/** Unaddressed items on these reports, for the "send to customer" warning. Best effort. */
export async function fetchOpenActionItems(assetIds: string[]): Promise<ActionItem[]> {
  const items: ActionItem[] = [];
  for (let i = 0; i < assetIds.length; i += 200) {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('report_action_items')
      .select(ITEM_COLUMNS)
      .eq('status', 'unaddressed')
      .in('asset_id', assetIds.slice(i, i + 200))
      .order('item_code', { ascending: true });
    if (error) {
      console.warn('[actionItems] Failed to load open items:', error);
      return [];
    }
    items.push(...((data || []) as ActionItem[]));
  }
  return items;
}

/** Extra lines for a "mark as sent" confirm that list unaddressed action items; "" when none. */
export async function openActionItemsWarning(assetIds: string[]): Promise<string> {
  const items = await fetchOpenActionItems(assetIds);
  if (items.length === 0) return '';
  const lines = items.slice(0, 10).map((i) => `#${i.item_code}: ${i.title}`);
  if (items.length > 10) lines.push(`...and ${items.length - 10} more`);
  return `\n\n${items.length} unaddressed action item${items.length === 1 ? '' : 's'} (to tell the customer):\n${lines.join('\n')}`;
}

export async function fetchActionItemDetail(item: ActionItem): Promise<ActionItemDetail> {
  const [updatesRes, photosRes, recipientsRes] = await Promise.all([
    supabase
      .schema('neta_ops')
      .from('report_action_item_updates')
      .select('id, item_id, from_status, to_status, note, updated_by, created_at')
      .eq('item_id', item.id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    supabase
      .schema('neta_ops')
      .from('report_action_item_photos')
      .select('id, item_id, file_url, file_name, created_at')
      .eq('item_id', item.id)
      .order('created_at', { ascending: true }),
    supabase
      .schema('neta_ops')
      .from('report_action_item_recipients')
      .select('user_id, seen_at')
      .eq('item_id', item.id),
  ]);
  if (updatesRes.error) throw updatesRes.error;
  if (photosRes.error) throw photosRes.error;
  if (recipientsRes.error) throw recipientsRes.error;

  const updates = updatesRes.data || [];
  const recipients = recipientsRes.data || [];
  const names = await fetchUserNames([
    item.created_by,
    ...updates.map((u: any) => u.updated_by),
    ...recipients.map((r: any) => r.user_id),
  ]);
  return {
    updates: updates.map((u: any) => ({
      ...u,
      updated_by_name: u.updated_by ? names[u.updated_by] ?? null : null,
    })),
    photos: (photosRes.data || []) as ActionItemPhoto[],
    recipients: recipients.map((r: any) => ({
      user_id: r.user_id,
      seen_at: r.seen_at,
      name: names[r.user_id] ?? null,
    })),
    createdByName: item.created_by ? names[item.created_by] ?? null : null,
  };
}

export async function createActionItem(input: {
  assetId: string;
  title: string;
  description: string;
  category: ActionItemCategory;
  priority: ActionItemPriority;
  notifyUserIds: string[];
}): Promise<ActionItem> {
  // Not retried: a repeated call would create a second item.
  const { data, error } = await supabase.schema('neta_ops').rpc('create_report_action_item', {
    p_asset_id: input.assetId,
    p_title: input.title.trim(),
    p_description: input.description,
    p_category: input.category,
    p_priority: input.priority,
    p_notify: input.notifyUserIds,
  });
  if (error) throw error;
  return data as ActionItem;
}

export async function updateActionItemDetails(
  itemId: string,
  fields: Pick<ActionItem, 'title' | 'description' | 'category' | 'priority'>,
): Promise<void> {
  const { error } = await supabase
    .schema('neta_ops')
    .from('report_action_items')
    .update({
      title: fields.title.trim(),
      description: fields.description?.trim() || null,
      category: fields.category,
      priority: fields.priority,
    })
    .eq('id', itemId);
  if (error) throw error;
}

export async function setActionItemStatus(
  itemId: string,
  status: ActionItemStatus,
  note: string,
): Promise<void> {
  const { error } = await supabase.schema('neta_ops').rpc('set_report_action_item_status', {
    p_item_id: itemId,
    p_status: status,
    p_note: note,
  });
  if (error) throw error;
}

export async function addActionItemNote(itemId: string, note: string, userId: string): Promise<void> {
  const { error } = await supabase
    .schema('neta_ops')
    .from('report_action_item_updates')
    .insert({ item_id: itemId, note: note.trim(), updated_by: userId });
  if (error) throw error;
}

export async function addActionItemRecipients(itemId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const { error } = await supabase
    .schema('neta_ops')
    .from('report_action_item_recipients')
    .upsert(
      userIds.map((user_id) => ({ item_id: itemId, user_id })),
      { onConflict: 'item_id,user_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

/** Uploads photos to the documents bucket (same place as issue attachments). Returns how many failed. */
export async function uploadActionItemPhotos(itemId: string, files: File[], userId: string): Promise<number> {
  let failed = 0;
  for (const file of files) {
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `action-items/${itemId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('documents').getPublicUrl(path);
      const { error } = await supabase.schema('neta_ops').from('report_action_item_photos').insert({
        item_id: itemId,
        file_path: path,
        file_url: pub.publicUrl,
        file_name: file.name,
        uploaded_by: userId,
      });
      if (error) throw error;
    } catch (e) {
      console.error('[actionItems] Photo upload failed:', file.name, e);
      failed += 1;
    }
  }
  return failed;
}

/**
 * Who to tell by default: the job's PM, and its lead when the lead's name
 * exactly matches one person. The lead is typed-in text, not an account, so a
 * name that matches nobody (or several people) is left for the user to pick.
 */
export async function fetchDefaultRecipients(jobId: string): Promise<string[]> {
  const ids: string[] = [];
  try {
    const { data: job } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('project_manager_id, fireteam_lead')
      .eq('id', jobId)
      .maybeSingle();
    if (job?.project_manager_id) ids.push(job.project_manager_id);
    const lead = (job?.fireteam_lead || '').trim();
    if (lead) {
      const { data: matches } = await supabase
        .schema('common')
        .from('profiles')
        .select('id')
        .ilike('full_name', lead.replace(/[%_]/g, (c) => `\\${c}`))
        .limit(2);
      if (matches?.length === 1 && !ids.includes(matches[0].id)) ids.push(matches[0].id);
    }
  } catch (e) {
    console.warn('[actionItems] Failed to load default recipients:', e);
  }
  return ids;
}

export interface UnseenActionItem extends ActionItem {
  report_name: string | null;
  file_url: string | null;
}

/** Items this person was told about and hasn't opened yet, newest first. For the bell. */
export async function fetchMyUnseenActionItems(userId: string): Promise<UnseenActionItem[]> {
  const { data: rows, error } = await supabase
    .schema('neta_ops')
    .from('report_action_item_recipients')
    .select('item_id')
    .eq('user_id', userId)
    .is('seen_at', null)
    .limit(50);
  if (error) throw error;
  const itemIds = (rows || []).map((r: any) => r.item_id);
  if (itemIds.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .schema('neta_ops')
    .from('report_action_items')
    .select(ITEM_COLUMNS)
    .in('id', itemIds)
    .order('created_at', { ascending: false });
  if (itemsError) throw itemsError;

  const assetIds = Array.from(new Set((items || []).map((i: any) => i.asset_id)));
  const { data: assets } = await supabase
    .schema('neta_ops')
    .from('assets')
    .select('id, name, file_url')
    .in('id', assetIds);
  const byId = new Map((assets || []).map((a: any) => [a.id, a]));
  return (items || []).map((i: any) => ({
    ...i,
    report_name: byId.get(i.asset_id)?.name ?? null,
    file_url: byId.get(i.asset_id)?.file_url ?? null,
  }));
}

export async function markActionItemSeen(itemId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .schema('neta_ops')
    .from('report_action_item_recipients')
    .update({ seen_at: new Date().toISOString() })
    .eq('item_id', itemId)
    .eq('user_id', userId)
    .is('seen_at', null);
  if (error) console.warn('[actionItems] Failed to mark seen:', error);
}

/**
 * App route for a report's page; uploaded PDFs have none, so they open the
 * job's Action items tab. Add `actionItem=<id>` to open one item there.
 */
export function actionItemReportPath(item: { job_id: string; file_url?: string | null }): string {
  const url = item.file_url || '';
  if (/^(report|custom-form):\/jobs\//.test(url)) return url.replace(/^(report|custom-form):/, '');
  return `/jobs/${item.job_id}?tab=action-items`;
}

/** Fired after any action item change so badges and the bell refresh. */
export const ACTION_ITEMS_CHANGED_EVENT = 'actionItemsChanged';

export function notifyActionItemsChanged(assetId: string) {
  window.dispatchEvent(new CustomEvent(ACTION_ITEMS_CHANGED_EVENT, { detail: { assetId } }));
}

/**
 * Action items box for the review dialog in ReportApprovalWorkflow, which builds
 * its markup as a string outside React. The button (#review-action-items-btn)
 * is wired by the caller to open the full dialog.
 */
export function actionItemsHtml(items: ActionItem[], hasReportNumber: boolean): string {
  const open = items.filter((i) => i.status === 'unaddressed').length;
  const rows = items
    .map(
      (i) => `
      <div style="display:flex;gap:0.5rem;align-items:baseline;font-size:0.8125rem;">
        <span style="font-family:ui-monospace,monospace;font-size:0.75rem;color:${BRAND_COLOR};white-space:nowrap;">#${escapeHtml(i.item_code)}</span>
        <span style="flex:1;min-width:0;color:#111827;overflow-wrap:anywhere;">${escapeHtml(i.title)}</span>
        <span style="font-size:0.75rem;color:${i.status === 'unaddressed' ? BRAND_COLOR : '#6b7280'};white-space:nowrap;">${ACTION_ITEM_STATUS_LABELS[i.status]}</span>
      </div>`,
    )
    .join('');
  const button = hasReportNumber
    ? `<button id="review-action-items-btn" style="padding:0.25rem 0.625rem;border:1px solid #d1d5db;background:white;cursor:pointer;font-size:0.8125rem;color:#374151;">${items.length ? 'Open' : '+ Add'}</button>`
    : '';
  const empty = !hasReportNumber
    ? '<div style="font-size:0.75rem;color:#6b7280;">No report number yet, so no action items.</div>'
    : items.length === 0
      ? '<div style="font-size:0.75rem;color:#6b7280;">Passes, but something to do or tell the customer? Add it here.</div>'
      : '';
  return `
    <div style="border:1px solid #e5e7eb;padding:0.75rem;display:flex;flex-direction:column;gap:0.5rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
        <span style="font-size:0.875rem;font-weight:600;color:#111827;">Action items${open ? ` (${open} unaddressed)` : ''}</span>
        ${button}
      </div>
      ${rows}${empty}
    </div>`;
}
