import { supabase } from '@/lib/supabase';
import { describeSupabaseError, withWriteRetry } from '@/lib/supabaseRetry';
import type { RfiImportChange, RfiSheetRow } from '@/lib/rfiWorkbook';

// RFIs on an opportunity: estimating questions for the customer.
// Tables are in database/migrations/opportunity_rfis.sql. An RFI is answered when
// its response is not blank. Numbers are never reused.

export interface OpportunityRfi {
  id: string;
  opportunity_id: string;
  number: number;
  question: string;
  spec_ref: string | null;
  response: string | null;
  date_added: string;
  date_answered: string | null;
  source: 'ampos' | 'customer';
  created_by_name: string | null;
  updated_at: string;
}

export interface RfiLogEntry {
  id: number;
  action: 'download' | 'upload';
  file_name: string | null;
  rfi_count: number;
  user_name: string | null;
  created_at: string;
}

export interface RfiActor {
  id: string;
  name: string | null;
}

const RFI_COLUMNS =
  'id, opportunity_id, number, question, spec_ref, response, date_added, date_answered, source, created_by_name, updated_at';
const LOG_COLUMNS = 'id, action, file_name, rfi_count, user_name, created_at';

export class RfiSetupMissingError extends Error {
  constructor() {
    super('RFI database setup has not been run (database/migrations/opportunity_rfis.sql).');
  }
}

function isSetupMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /could not find the table/i.test(error.message ?? '');
}

function fail(error: { code?: string; message?: string; hint?: string }, status?: number): never {
  if (isSetupMissing(error)) throw new RfiSetupMissingError();
  throw new Error(describeSupabaseError(error, status));
}

export const isRfiAnswered = (rfi: Pick<OpportunityRfi, 'response'>) => !!rfi.response?.trim();

/** Local date as yyyy-mm-dd (toISOString would give tomorrow in the evening) */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toSheetRow(rfi: OpportunityRfi): RfiSheetRow {
  return {
    id: rfi.id,
    number: rfi.number,
    dateAdded: rfi.date_added,
    question: rfi.question,
    specRef: rfi.spec_ref,
    response: rfi.response,
    dateAnswered: rfi.date_answered,
  };
}

export async function fetchOpportunityRfis(opportunityIds: string[]): Promise<OpportunityRfi[]> {
  if (opportunityIds.length === 0) return [];
  const { data, error, status } = await supabase
    .schema('business')
    .from('opportunity_rfis')
    .select(RFI_COLUMNS)
    .in('opportunity_id', opportunityIds)
    .order('number', { ascending: true });
  if (error) fail(error, status);
  return (data ?? []) as OpportunityRfi[];
}

export async function fetchRfiLog(opportunityId: string): Promise<RfiLogEntry[]> {
  const { data, error, status } = await supabase
    .schema('business')
    .from('opportunity_rfi_log')
    .select(LOG_COLUMNS)
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) fail(error, status);
  return (data ?? []) as RfiLogEntry[];
}

async function nextNumber(opportunityId: string): Promise<number> {
  const { data, error, status } = await supabase
    .schema('business')
    .from('opportunity_rfis')
    .select('number')
    .eq('opportunity_id', opportunityId)
    .order('number', { ascending: false })
    .limit(1);
  if (error) fail(error, status);
  return ((data?.[0] as { number: number } | undefined)?.number ?? 0) + 1;
}

export interface NewRfi {
  question: string;
  spec_ref?: string | null;
  response?: string | null;
  date_answered?: string | null;
  source?: 'ampos' | 'customer';
}

/**
 * Adds an RFI with the next number. The id is made here, so a retried save lands
 * on the same row. If someone else takes the number first, tries the next one.
 */
export async function createRfi(opportunityId: string, rfi: NewRfi, actor: RfiActor): Promise<OpportunityRfi> {
  const id = crypto.randomUUID();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const number = await nextNumber(opportunityId);
    const response = rfi.response?.trim() || null;
    const row = {
      id,
      opportunity_id: opportunityId,
      number,
      question: rfi.question.trim(),
      spec_ref: rfi.spec_ref?.trim() || null,
      response,
      date_answered: response ? rfi.date_answered || todayIso() : null,
      date_added: todayIso(),
      source: rfi.source ?? 'ampos',
      created_by: actor.id,
      created_by_name: actor.name,
    };
    const { data, error, status } = await withWriteRetry(
      () =>
        supabase.schema('business').from('opportunity_rfis').upsert(row, { onConflict: 'id' }).select(RFI_COLUMNS).single(),
      { label: 'add RFI' },
    );
    if (!error) return data as OpportunityRfi;
    // Number taken by someone else's save in the meantime
    if (error.code === '23505' && /number/i.test(`${error.message} ${(error as any).details ?? ''}`)) continue;
    fail(error, status);
  }
  throw new Error('Could not pick an RFI number. Try again.');
}

export interface RfiPatch {
  question?: string;
  spec_ref?: string | null;
  response?: string | null;
  date_answered?: string | null;
}

export async function updateRfi(id: string, patch: RfiPatch): Promise<OpportunityRfi> {
  const row: Record<string, unknown> = {};
  if (patch.question !== undefined) row.question = patch.question.trim();
  if (patch.spec_ref !== undefined) row.spec_ref = patch.spec_ref?.trim() || null;
  if (patch.response !== undefined) {
    const response = patch.response?.trim() || null;
    row.response = response;
    row.date_answered = response ? patch.date_answered || todayIso() : null;
  } else if (patch.date_answered !== undefined) {
    row.date_answered = patch.date_answered;
  }
  const { data, error, status } = await withWriteRetry(
    () => supabase.schema('business').from('opportunity_rfis').update(row).eq('id', id).select(RFI_COLUMNS).single(),
    { label: 'update RFI' },
  );
  if (error) fail(error, status);
  return data as OpportunityRfi;
}

export async function deleteRfi(id: string): Promise<void> {
  const { data, error, status } = await supabase
    .schema('business')
    .from('opportunity_rfis')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) fail(error, status);
  // Row security hides the row instead of raising an error
  if (!data || data.length === 0) throw new Error('Only admins can delete an answered RFI.');
}

export async function logRfiAction(
  opportunityId: string,
  action: 'download' | 'upload',
  fileName: string,
  count: number,
  actor: RfiActor,
): Promise<void> {
  const { error } = await supabase.schema('business').from('opportunity_rfi_log').insert({
    opportunity_id: opportunityId,
    action,
    file_name: fileName,
    rfi_count: count,
    user_id: actor.id,
    user_name: actor.name,
  });
  // The log is a nice-to-have; never block the download or upload on it
  if (error) console.warn('[rfi] could not log', action, describeSupabaseError(error));
}

/**
 * Saves the ticked changes from a returned file, one at a time. Returns how many
 * were saved; the first failure stops the run and is thrown with that count.
 */
export async function applyRfiImport(
  opportunityId: string,
  changes: RfiImportChange[],
  actor: RfiActor,
): Promise<number> {
  let saved = 0;
  for (const change of changes) {
    try {
      if (change.kind === 'new') {
        await createRfi(
          opportunityId,
          {
            question: change.question,
            spec_ref: change.specRef,
            response: change.response,
            date_answered: change.dateAnswered,
            source: 'customer',
          },
          actor,
        );
      } else if ((change.kind === 'answer' || change.kind === 'replace') && change.rfiId) {
        await updateRfi(change.rfiId, { response: change.response, date_answered: change.dateAnswered });
      } else {
        continue;
      }
      saved += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Saved ${saved} of ${changes.length}. Stopped at ${change.number ? `RFI #${change.number}` : 'a new question'}: ${message}`);
    }
  }
  return saved;
}
