/**
 * Shared lookup tables.
 *
 * One library of tables (NETA Table 100.1 and the like) that every custom form
 * formula can read with `lookup("table.id", {key})` or
 * `lookup("table.id", {key}, "column")`. Tables live in
 * neta_ops.custom_form_lookup_tables; a few built-ins ship in code.
 *
 * Formulas are evaluated synchronously during render, so the tables are held
 * in a module cache that pages load once (`useLookupTables`) and that the
 * formula evaluator reads (`getLookupResources`).
 */

import React from 'react';
import { supabase } from '@/lib/supabase';
import { canReviewReports } from '@/lib/roles';
import {
  allLookupTables,
  lookupRegistryState,
  setLibraryLookupTables,
  subscribeLookupTables,
  type SharedLookupTable,
} from '@/lib/customForms/lookupRegistry';

export type { SharedLookupTable } from '@/lib/customForms/lookupRegistry';
export {
  allLookupTables,
  cacheLookupTable,
  getLookupResources,
  BUILT_IN_LOOKUP_TABLES,
} from '@/lib/customForms/lookupRegistry';

/**
 * Who may change lookup tables: admins, and anyone allowed to review reports
 * (the same authority as approving them). Everyone else can read and use them.
 * The database enforces the same rule (restrict_custom_form_lookup_tables_editing.sql).
 */
export function canEditLookupTables(user: { email?: string | null; user_metadata?: any } | null | undefined): boolean {
  const role = (user?.user_metadata?.role as string) || '';
  return role === 'Admin' || role === 'Super Admin' || canReviewReports(role, user?.email);
}

export const MISSING_LOOKUP_TABLE_MESSAGE =
  'Lookup tables are not set up yet. Run Database Scripts/Setup & Configuration/create_custom_form_lookup_tables.sql in Supabase.';

const MISSING_CODES = new Set(['42P01', 'PGRST205', 'PGRST204', '42703']);

/** Formula ids: lower-case letters, digits, dots and underscores, e.g. "neta.table100_1". */
export const LOOKUP_ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

const table = () => supabase.schema('neta_ops').from('custom_form_lookup_tables');

function fromRow(row: any): SharedLookupTable {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    keyType: row.key_type,
    valueType: row.value_type,
    match: row.match ?? 'exact',
    keyLabel: row.key_label ?? undefined,
    valueLabel: row.value_label ?? undefined,
    columns: Array.isArray(row.columns) ? row.columns : [],
    entries: Array.isArray(row.entries) ? row.entries : [],
    fallback: row.fallback ?? null,
    engineeringVerified: !!row.engineering_verified,
    verifiedAt: row.verified_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchLookupTables(): Promise<{ tables: SharedLookupTable[]; missing: boolean }> {
  const { data, error } = await table().select('*').order('name', { ascending: true });
  if (error) {
    if (error.code && MISSING_CODES.has(error.code)) return { tables: [], missing: true };
    throw new Error(error.message);
  }
  return { tables: (data ?? []).map(fromRow), missing: false };
}

export async function saveLookupTable(t: SharedLookupTable, userId?: string): Promise<void> {
  const { error } = await table().upsert({
    id: t.id,
    name: t.name.trim(),
    description: t.description ?? null,
    key_type: t.match === 'range' ? 'number' : t.keyType,
    value_type: t.valueType,
    match: t.match ?? 'exact',
    key_label: t.keyLabel ?? null,
    value_label: t.valueLabel ?? null,
    columns: t.columns ?? [],
    entries: t.entries,
    fallback: t.fallback ?? null,
    engineering_verified: t.engineeringVerified,
    verified_by: t.engineeringVerified ? userId ?? null : null,
    verified_at: t.engineeringVerified ? t.verifiedAt ?? new Date().toISOString() : null,
    created_by: userId ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (error.code && MISSING_CODES.has(error.code)) throw new Error(MISSING_LOOKUP_TABLE_MESSAGE);
    // 42501: the database's row rules refused the write.
    if (error.code === '42501') throw new Error(NO_PERMISSION_MESSAGE);
    throw new Error(error.message);
  }
}

export const NO_PERMISSION_MESSAGE = 'Only admins and report reviewers can change lookup tables.';

export async function deleteLookupTable(id: string): Promise<void> {
  // A refused delete returns no error, just no rows; ask for the row back to tell.
  const { data, error } = await table().delete().eq('id', id).select('id');
  if (error) throw new Error(error.code === '42501' ? NO_PERMISSION_MESSAGE : error.message);
  if (!data?.length) throw new Error(NO_PERMISSION_MESSAGE);
}

// ---------------------------------------------------------------------------
// Loading into the formula cache (see lookupRegistry.ts)
// ---------------------------------------------------------------------------

let loading: Promise<void> | null = null;

/** Load (or reload) the library into the cache. */
export function loadLookupTables(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = fetchLookupTables()
    .then((result) => setLibraryLookupTables(result.tables, result.missing))
    .catch((err) => {
      console.error('Failed to load lookup tables:', err);
      setLibraryLookupTables(lookupRegistryState().library, false);
    });
  return loading;
}

/**
 * Loads the tables once and re-renders when they change, so formulas that
 * read them update as soon as the library arrives.
 */
export function useLookupTables() {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const unsubscribe = subscribeLookupTables(() => setTick((n) => n + 1));
    loadLookupTables();
    return unsubscribe;
  }, []);
  return {
    tables: allLookupTables(),
    missing: lookupRegistryState().missing,
    reload: () => loadLookupTables(true),
  };
}
