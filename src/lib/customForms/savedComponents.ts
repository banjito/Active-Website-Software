/**
 * Saved components – user-defined sections that appear in the component library.
 * Stored in neta_ops.custom_form_saved_components so everyone can use them.
 */

import { supabase } from '@/lib/supabase';
import type { SectionConfig } from '@/lib/types/customForms';

export interface SavedComponent {
  id: string;
  name: string;
  description: string | null;
  section_config: SectionConfig;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch all saved components (for the library sidebar).
 */
export async function fetchSavedComponents(): Promise<SavedComponent[]> {
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('custom_form_saved_components')
    .select('id, name, description, section_config, created_by, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === '42P01') return []; // table does not exist
    console.error('Error fetching saved components:', error);
    return [];
  }

  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    section_config: (row.section_config ?? {}) as SectionConfig,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

/**
 * Save a section as a new component in the library. Strips id/order from config.
 */
export async function saveSavedComponent(
  name: string,
  sectionConfig: SectionConfig,
  userId: string
): Promise<{ id: string } | { error: Error }> {
  const { id: _id, order: _order, ...rest } = sectionConfig as SectionConfig & { id?: string; order?: number };
  const section_config = rest as Record<string, unknown>;

  const { data, error } = await supabase
    .schema('neta_ops')
    .from('custom_form_saved_components')
    .insert({
      name: name.trim(),
      section_config,
      created_by: userId,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    const msg = (error as { message?: string }).message ?? String(error);
    const code = (error as { code?: string }).code;
    if (code === '42P01') {
      return {
        error: new Error(
          'Saved components table is missing. Run Database Scripts/Setup & Configuration/create_custom_form_saved_components_table.sql in Supabase.'
        ),
      };
    }
    return { error: new Error(code ? `${msg} (${code})` : msg) };
  }

  return { id: data.id };
}

/**
 * Update an existing saved component's section config and optionally its name.
 */
export async function updateSavedComponent(
  id: string,
  sectionConfig: SectionConfig,
  name?: string
): Promise<{ error: Error | null }> {
  const { id: _id, order: _order, savedComponentId: _savedId, ...rest } = sectionConfig as SectionConfig & { id?: string; order?: number; savedComponentId?: string };
  const section_config = rest as Record<string, unknown>;

  const payload: Record<string, unknown> = {
    section_config,
    updated_at: new Date().toISOString(),
  };
  if (name != null) payload.name = name;

  const { data: rows, error } = await supabase
    .schema('neta_ops')
    .from('custom_form_saved_components')
    .update(payload)
    .eq('id', id)
    .select('id, section_config');

  if (error) {
    const msg = (error as { message?: string }).message ?? String(error);
    const code = (error as { code?: string }).code;
    return { error: new Error(code ? `${msg} (${code})` : msg) };
  }

  if (!rows || rows.length === 0) {
    return { error: new Error('Update returned 0 rows — the saved component may have been deleted or RLS is blocking writes.') };
  }

  return { error: null };
}

/**
 * Delete a saved component from the library.
 */
export async function deleteSavedComponent(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .schema('neta_ops')
    .from('custom_form_saved_components')
    .delete()
    .eq('id', id);

  if (error) {
    const msg = (error as { message?: string }).message ?? String(error);
    const code = (error as { code?: string }).code;
    return { error: new Error(code ? `${msg} (${code})` : msg) };
  }
  return { error: null };
}
