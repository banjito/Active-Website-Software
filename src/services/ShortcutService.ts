import { supabase } from '../lib/supabase';

export const MAX_SHORTCUTS = 8;

export interface Shortcut {
  id?: string;
  user_id: string;
  title: string;
  url: string;
  icon?: string;
  position: number;
}

export const ShortcutService = {
  /**
   * Get all shortcuts for the current user
   */
  async getUserShortcuts(userId: string): Promise<Shortcut[]> {
    console.log('ShortcutService - Getting shortcuts for user:', userId);
    
    try {
      const { data, error } = await supabase
        .schema('common')
        .from('user_shortcuts')
        .select('*')
        .eq('user_id', userId)
        .order('position', { ascending: true });

      if (error) {
        console.error('Error fetching shortcuts:', error);
        throw error;
      }

      console.log('ShortcutService - Retrieved shortcuts:', data);
      return data || [];
    } catch (err) {
      console.error('Error in getUserShortcuts:', err);
      throw err;
    }
  },

  /**
   * Bulk create multiple shortcuts at once for convenience flows
   */
  async bulkCreateShortcuts(userId: string, items: Array<{ title: string; url: string; icon?: string }>): Promise<Shortcut[]> {
    console.log('ShortcutService - Bulk create shortcuts:', items);
    if (!items.length) return [];
    try {
      const existing = await this.getUserShortcuts(userId);
      if (existing.length >= MAX_SHORTCUTS) {
        throw new Error(`Maximum ${MAX_SHORTCUTS} shortcuts allowed. Remove one to add more.`);
      }
      const slotsLeft = MAX_SHORTCUTS - existing.length;
      const toAdd = items.slice(0, slotsLeft);
      if (!toAdd.length) return existing;

      const start = existing.length > 0 ? Math.max(...existing.map(s => s.position || 0)) + 1 : 0;
      const toInsert = toAdd.map((it, idx) => ({ user_id: userId, title: it.title, url: it.url, icon: it.icon, position: start + idx }));
      const { data, error } = await supabase
        .schema('common')
        .from('user_shortcuts')
        .insert(toInsert)
        .select();

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error in bulkCreateShortcuts:', err);
      throw err;
    }
  },

  /**
   * Create a new shortcut
   */
  async createShortcut(shortcut: Omit<Shortcut, 'id' | 'position'>): Promise<Shortcut> {
    console.log('ShortcutService - Creating shortcut:', shortcut);
    
    try {
      const existing = await this.getUserShortcuts(shortcut.user_id);
      if (existing.length >= MAX_SHORTCUTS) {
        throw new Error(`Maximum ${MAX_SHORTCUTS} shortcuts allowed. Remove one to add more.`);
      }
      const position = existing.length > 0 ? Math.max(...existing.map(s => s.position || 0)) + 1 : 0;

      const { data, error } = await supabase
        .schema('common')
        .from('user_shortcuts')
        .insert([{ ...shortcut, position }])
        .select()
        .single();

      if (error) {
        console.error('Error creating shortcut:', error);
        throw error;
      }

      console.log('ShortcutService - Created shortcut:', data);
      return data;
    } catch (err) {
      console.error('Error in createShortcut:', err);
      throw err;
    }
  },

  /**
   * Update an existing shortcut
   */
  async updateShortcut(id: string, shortcut: Partial<Omit<Shortcut, 'id' | 'user_id'>>): Promise<Shortcut> {
    console.log('ShortcutService - Updating shortcut:', id, shortcut);
    
    try {
      const { data, error } = await supabase
        .schema('common')
        .from('user_shortcuts')
        .update({ ...shortcut, updated_at: new Date() })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating shortcut:', error);
        throw error;
      }

      console.log('ShortcutService - Updated shortcut:', data);
      return data;
    } catch (err) {
      console.error('Error in updateShortcut:', err);
      throw err;
    }
  },

  /**
   * Delete a shortcut
   */
  async deleteShortcut(id: string): Promise<void> {
    console.log('ShortcutService - Deleting shortcut:', id);
    
    try {
      const { error } = await supabase
        .schema('common')
        .from('user_shortcuts')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting shortcut:', error);
        throw error;
      }

      console.log('ShortcutService - Deleted shortcut:', id);
    } catch (err) {
      console.error('Error in deleteShortcut:', err);
      throw err;
    }
  },

  /**
   * Reorder shortcuts
   * @param userId The user ID
   * @param shortcutIds Array of shortcut IDs in the new order
   */
  async reorderShortcuts(userId: string, shortcutIds: string[]): Promise<void> {
    console.log('ShortcutService - Reordering shortcuts for user:', userId, shortcutIds);
    
    try {
      // Start a batch update
      const updates = shortcutIds.map((id, index) => {
        return supabase
          .schema('common')
          .from('user_shortcuts')
          .update({ position: index, updated_at: new Date() })
          .eq('id', id)
          .eq('user_id', userId);
      });

      // Execute all updates in parallel
      await Promise.all(updates);
      console.log('ShortcutService - Reordered shortcuts successfully');
    } catch (err) {
      console.error('Error in reorderShortcuts:', err);
      throw err;
    }
  }
}; 