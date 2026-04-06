/**
 * Proposal Scope Notes Service
 * 
 * Handles CRUD operations for pre-defined scope notes that can be
 * added to letter proposals. These notes are reusable templates for
 * common scope clarifications (e.g., breaker testing thresholds,
 * equipment exclusions, etc.)
 */

import { supabase } from '../lib/supabase';

export interface ProposalScopeNote {
  id: string;
  title: string;
  content: string;
  category: string;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ProposalScopeNoteInput = Pick<ProposalScopeNote, 'title' | 'content'> & 
  Partial<Pick<ProposalScopeNote, 'category' | 'is_active' | 'sort_order'>>;

/**
 * Fetch all active scope notes, ordered by sort_order then title
 */
export async function getScopeNotes(): Promise<ProposalScopeNote[]> {
  try {
    const { data, error } = await supabase
      .schema('business')
      .from('proposal_scope_notes')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true });

    if (error) {
      console.error('Error fetching scope notes:', error);
      throw error;
    }

    return (data || []) as ProposalScopeNote[];
  } catch (error) {
    console.error('Error in getScopeNotes:', error);
    return [];
  }
}

/**
 * Fetch all scope notes (including inactive), for management UI
 */
export async function getAllScopeNotes(): Promise<ProposalScopeNote[]> {
  try {
    const { data, error } = await supabase
      .schema('business')
      .from('proposal_scope_notes')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true });

    if (error) {
      console.error('Error fetching all scope notes:', error);
      throw error;
    }

    return (data || []) as ProposalScopeNote[];
  } catch (error) {
    console.error('Error in getAllScopeNotes:', error);
    return [];
  }
}

/**
 * Create a new scope note
 */
export async function createScopeNote(
  note: ProposalScopeNoteInput,
  userId?: string
): Promise<ProposalScopeNote> {
  const payload = {
    title: note.title.trim(),
    content: note.content.trim(),
    category: note.category?.trim() || 'General',
    is_active: note.is_active ?? true,
    sort_order: note.sort_order ?? 0,
    created_by: userId || null,
  };

  const { data, error } = await supabase
    .schema('business')
    .from('proposal_scope_notes')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('Error creating scope note:', error);
    throw error;
  }

  return data as ProposalScopeNote;
}

/**
 * Update an existing scope note
 */
export async function updateScopeNote(
  id: string,
  updates: Partial<ProposalScopeNoteInput>
): Promise<ProposalScopeNote> {
  const payload: any = {};
  if (updates.title !== undefined) payload.title = updates.title.trim();
  if (updates.content !== undefined) payload.content = updates.content.trim();
  if (updates.category !== undefined) payload.category = updates.category.trim();
  if (updates.is_active !== undefined) payload.is_active = updates.is_active;
  if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;

  const { data, error } = await supabase
    .schema('business')
    .from('proposal_scope_notes')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating scope note:', error);
    throw error;
  }

  return data as ProposalScopeNote;
}

/**
 * Delete a scope note permanently
 */
export async function deleteScopeNote(id: string): Promise<void> {
  const { error } = await supabase
    .schema('business')
    .from('proposal_scope_notes')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting scope note:', error);
    throw error;
  }
}

/**
 * Get unique categories from existing scope notes
 */
export async function getScopeNoteCategories(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .schema('business')
      .from('proposal_scope_notes')
      .select('category')
      .eq('is_active', true)
      .order('category', { ascending: true });

    if (error) {
      console.error('Error fetching scope note categories:', error);
      throw error;
    }

    // Deduplicate categories
    const categories = [...new Set((data || []).map((d: any) => d.category).filter(Boolean))];
    return categories as string[];
  } catch (error) {
    console.error('Error in getScopeNoteCategories:', error);
    return [];
  }
}
