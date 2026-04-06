/**
 * React hook for user preferences stored in Supabase
 * 
 * MULTI-TAB OPTIMIZATIONS:
 * - Only loads preferences once per user per session
 * - Uses global cache from userPreferencesService
 * - Migration only runs once globally (tracked in sessionStorage)
 * - Debounced saves to reduce API load
 * 
 * Usage:
 * const { preferences, updatePreference, isLoading } = useUserPreferences();
 * 
 * // Read a preference
 * const sortField = preferences.filters?.opportunityList?.sortField || 'quote_number';
 * 
 * // Update a preference
 * updatePreference('filters.opportunityList.sortField', 'proposal_due_date');
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  loadUserPreferences,
  saveUserPreferences,
  updatePreference as updatePref,
  deletePreference as deletePref,
  clearPreferencesCache,
  migrateFromLocalStorage,
  UserPreferences
} from '../services/userPreferencesService';

export interface UseUserPreferencesResult {
  preferences: UserPreferences;
  isLoading: boolean;
  error: string | null;
  updatePreference: (path: string, value: any, immediate?: boolean) => Promise<boolean>;
  setPreferences: (prefs: Partial<UserPreferences>, immediate?: boolean) => Promise<boolean>;
  deletePreference: (path: string) => Promise<boolean>;
  reload: () => Promise<void>;
}

// Global state to track if preferences have been loaded this session
// This prevents multiple components/tabs from all trying to load at once
let globalLoadPromise: Promise<UserPreferences> | null = null;
let globalLoadedUserId: string | null = null;
let globalLoadedPrefs: UserPreferences | null = null;

export function useUserPreferences(): UseUserPreferencesResult {
  const { user } = useAuth();
  const [preferences, setPreferencesState] = useState<UserPreferences>(() => {
    // Initialize from global cache if available
    if (globalLoadedUserId === user?.id && globalLoadedPrefs) {
      return globalLoadedPrefs;
    }
    return {};
  });
  const [isLoading, setIsLoading] = useState(() => {
    // If we have cached prefs for this user, don't show loading
    return !(globalLoadedUserId === user?.id && globalLoadedPrefs);
  });
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const lastUserId = useRef<string | null>(null);

  // Load preferences when user changes
  useEffect(() => {
    mountedRef.current = true;
    
    console.log('[useUserPreferences] Effect running:', { 
      hasUser: !!user?.id, 
      lastUserId: lastUserId.current,
      hasGlobalPrefs: !!globalLoadedPrefs,
      globalLoadedUserId 
    });
    
    if (!user?.id) {
      console.log('[useUserPreferences] No user, clearing state');
      setPreferencesState({});
      setIsLoading(false);
      clearPreferencesCache();
      globalLoadedUserId = null;
      globalLoadedPrefs = null;
      globalLoadPromise = null;
      lastUserId.current = null;
      return;
    }

    // Skip if same user and we already have preferences
    if (lastUserId.current === user.id && globalLoadedPrefs) {
      console.log('[useUserPreferences] Same user, using cached prefs');
      setPreferencesState(globalLoadedPrefs);
      setIsLoading(false);
      return;
    }
    lastUserId.current = user.id;

    // If a global load is in progress for this user, wait for it
    if (globalLoadPromise && globalLoadedUserId === user.id) {
      console.log('[useUserPreferences] Load in progress, waiting...');
      setIsLoading(true);
      globalLoadPromise.then((prefs) => {
        console.log('[useUserPreferences] Waited load complete');
        if (mountedRef.current) {
          setPreferencesState(prefs);
          setIsLoading(false);
        }
      }).catch((e) => {
        console.error('[useUserPreferences] Waited load failed:', e);
        if (mountedRef.current) {
          console.error('[useUserPreferences] Load failed:', e);
          setError('Failed to load preferences');
          setIsLoading(false);
        }
      });
      return;
    }

    // Start a new global load
    console.log('[useUserPreferences] Starting new load for user:', user.id?.substring(0, 8));
    setIsLoading(true);
    setError(null);
    globalLoadedUserId = user.id;

    // Add timeout to prevent infinite loading
    const loadWithTimeout = async (): Promise<UserPreferences> => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Preferences load timeout')), 15000);
      });
      
      const loadPromise = (async () => {
        // First, try to migrate from localStorage (only once per session)
        console.log('[useUserPreferences] Migrating from localStorage...');
        await migrateFromLocalStorage(user.id);
        console.log('[useUserPreferences] Migration complete');

        // Load preferences
        console.log('[useUserPreferences] Loading preferences...');
        const prefs = await loadUserPreferences(user.id);
        console.log('[useUserPreferences] Preferences loaded');
        return prefs;
      })();
      
      return Promise.race([loadPromise, timeoutPromise]);
    };

    globalLoadPromise = loadWithTimeout().then((prefs) => {
      globalLoadedPrefs = prefs;
      if (mountedRef.current) {
        setPreferencesState(prefs);
      }
      return prefs;
    }).catch((e) => {
      console.error('[useUserPreferences] Failed to load:', e);
      if (mountedRef.current) {
        setError('Failed to load preferences');
      }
      // Return empty prefs on failure so the app can still function
      return {} as UserPreferences;
    }).finally(() => {
      console.log('[useUserPreferences] Setting isLoading=false');
      if (mountedRef.current) {
        setIsLoading(false);
      }
    });

    return () => {
      mountedRef.current = false;
    };
  }, [user?.id]);

  // Update a single preference by path
  const updatePreference = useCallback(async (
    path: string,
    value: any,
    immediate: boolean = false
  ): Promise<boolean> => {
    if (!user?.id) return false;

    // Optimistic update
    setPreferencesState(prev => {
      const updated = { ...prev };
      setNestedValue(updated, path, value);
      globalLoadedPrefs = updated; // Update global cache too
      return updated;
    });

    const success = await updatePref(user.id, path, value, immediate);
    
    if (!success && mountedRef.current) {
      // Reload on failure
      const prefs = await loadUserPreferences(user.id);
      globalLoadedPrefs = prefs;
      setPreferencesState(prefs);
    }

    return success;
  }, [user?.id]);

  // Set multiple preferences at once
  const setPreferences = useCallback(async (
    prefs: Partial<UserPreferences>,
    immediate: boolean = false
  ): Promise<boolean> => {
    if (!user?.id) return false;

    // Optimistic update
    setPreferencesState(prev => {
      const updated = { ...prev, ...prefs };
      globalLoadedPrefs = updated; // Update global cache too
      return updated;
    });

    const success = await saveUserPreferences(user.id, prefs, immediate);
    
    if (!success && mountedRef.current) {
      // Reload on failure
      const freshPrefs = await loadUserPreferences(user.id);
      globalLoadedPrefs = freshPrefs;
      setPreferencesState(freshPrefs);
    }

    return success;
  }, [user?.id]);

  // Delete a preference
  const deletePreference = useCallback(async (path: string): Promise<boolean> => {
    if (!user?.id) return false;

    const success = await deletePref(user.id, path);
    
    if (success) {
      // Optimistic update
      setPreferencesState(prev => {
        const updated = { ...prev };
        deleteNestedValue(updated, path);
        globalLoadedPrefs = updated; // Update global cache too
        return updated;
      });
    }

    return success;
  }, [user?.id]);

  // Force reload preferences
  const reload = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    globalLoadPromise = null; // Clear global promise to force reload
    
    try {
      const prefs = await loadUserPreferences(user.id);
      globalLoadedPrefs = prefs;
      if (mountedRef.current) {
        setPreferencesState(prefs);
        setError(null);
      }
    } catch (e) {
      console.error('[useUserPreferences] Reload failed:', e);
      if (mountedRef.current) {
        setError('Failed to reload preferences');
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [user?.id]);

  return {
    preferences,
    isLoading,
    error,
    updatePreference,
    setPreferences,
    deletePreference,
    reload
  };
}

/**
 * Hook for a specific preference value with a default
 * More efficient for components that only need one preference
 */
export function usePreference<T>(
  path: string,
  defaultValue: T
): [T, (value: T, immediate?: boolean) => Promise<boolean>, boolean] {
  const { preferences, updatePreference, isLoading } = useUserPreferences();
  
  const value = getNestedValue(preferences, path, defaultValue);
  
  const setValue = useCallback(async (newValue: T, immediate?: boolean) => {
    return updatePreference(path, newValue, immediate);
  }, [updatePreference, path]);

  return [value, setValue, isLoading];
}

/**
 * Hook for opportunity list filter preferences
 */
export function useOpportunityFilters() {
  const { preferences, updatePreference } = useUserPreferences();
  
  const filters = preferences.filters?.opportunityList || {
    sortField: 'quote_number' as const,
    sortDirection: 'desc' as const,
    searchTerm: ''
  };

  const setSortField = useCallback(async (field: 'quote_number' | 'opportunity_created_date' | 'proposal_due_date') => {
    return updatePreference('filters.opportunityList.sortField', field);
  }, [updatePreference]);

  const setSortDirection = useCallback(async (direction: 'asc' | 'desc') => {
    return updatePreference('filters.opportunityList.sortDirection', direction);
  }, [updatePreference]);

  const setSearchTerm = useCallback(async (term: string) => {
    return updatePreference('filters.opportunityList.searchTerm', term);
  }, [updatePreference]);

  return {
    sortField: filters.sortField || 'quote_number',
    sortDirection: filters.sortDirection || 'desc',
    searchTerm: filters.searchTerm || '',
    setSortField,
    setSortDirection,
    setSearchTerm
  };
}

/**
 * Hook for estimate drafts
 */
export function useEstimateDraft(opportunityId: string) {
  const { preferences, updatePreference, deletePreference, isLoading } = useUserPreferences();
  
  const draftKey = `estimate-draft-${opportunityId}`;
  const draft = preferences.drafts?.[draftKey] || null;

  const saveDraft = useCallback(async (draftData: any) => {
    return updatePreference(`drafts.${draftKey}`, draftData);
  }, [updatePreference, draftKey]);

  const clearDraft = useCallback(async () => {
    return deletePreference(`drafts.${draftKey}`);
  }, [deletePreference, draftKey]);

  return {
    draft,
    saveDraft,
    clearDraft,
    isLoading
  };
}

/**
 * Hook for letter proposal state
 */
export function useLetterProposalState(opportunityId: string) {
  const { preferences, updatePreference, deletePreference } = useUserPreferences();
  
  const draftKey = `letter-proposal-draft-${opportunityId}`;
  const openKey = `letter-proposal-open-${opportunityId}`;
  const quoteIndexKey = `letter-quote-index-${opportunityId}`;
  const netaStandardKey = `letter-neta-standard-${opportunityId}`;

  const letterHtml = preferences.drafts?.[draftKey] || null;
  const isOpen = preferences.ui?.[openKey] === 'true' || preferences.ui?.[openKey] === true;
  const quoteIndex = preferences.ui?.[quoteIndexKey];
  const netaStandard = preferences.ui?.[netaStandardKey];

  const setLetterHtml = useCallback(async (html: string) => {
    return updatePreference(`drafts.${draftKey}`, html);
  }, [updatePreference, draftKey]);

  const setIsOpen = useCallback(async (open: boolean) => {
    return updatePreference(`ui.${openKey}`, open);
  }, [updatePreference, openKey]);

  const setQuoteIndex = useCallback(async (index: number | null) => {
    return updatePreference(`ui.${quoteIndexKey}`, index);
  }, [updatePreference, quoteIndexKey]);

  const setNetaStandard = useCallback(async (standard: string) => {
    return updatePreference(`ui.${netaStandardKey}`, standard);
  }, [updatePreference, netaStandardKey]);

  const clearAll = useCallback(async () => {
    await deletePreference(`drafts.${draftKey}`);
    await deletePreference(`ui.${openKey}`);
    await deletePreference(`ui.${quoteIndexKey}`);
    await deletePreference(`ui.${netaStandardKey}`);
  }, [deletePreference, draftKey, openKey, quoteIndexKey, netaStandardKey]);

  return {
    letterHtml,
    isOpen,
    quoteIndex,
    netaStandard,
    setLetterHtml,
    setIsOpen,
    setQuoteIndex,
    setNetaStandard,
    clearAll
  };
}

/**
 * Hook for estimate tab order
 */
export function useEstimateTabOrder(opportunityId: string) {
  const { preferences, updatePreference } = useUserPreferences();
  
  const key = `estimate-tab-order-${opportunityId}`;
  const tabOrder = preferences.ui?.[key] as string[] | null;

  const setTabOrder = useCallback(async (order: string[]) => {
    return updatePreference(`ui.${key}`, order);
  }, [updatePreference, key]);

  return {
    tabOrder,
    setTabOrder
  };
}

/**
 * Hook for my menu preferences (replaces userPrefs.ts)
 */
export function useMyMenuPreferences() {
  const { preferences, updatePreference } = useUserPreferences();
  
  const enabled = preferences.myMenu?.enabled ?? false;
  const position = preferences.myMenu?.position ?? { x: 8, y: 8 };

  const setEnabled = useCallback(async (value: boolean) => {
    return updatePreference('myMenu.enabled', value);
  }, [updatePreference]);

  const setPosition = useCallback(async (pos: { x: number; y: number }) => {
    return updatePreference('myMenu.position', pos);
  }, [updatePreference]);

  const resetPosition = useCallback(async () => {
    return updatePreference('myMenu.position', { x: 8, y: 8 });
  }, [updatePreference]);

  return {
    enabled,
    position,
    setEnabled,
    setPosition,
    resetPosition
  };
}

// Utility functions
function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  
  current[parts[parts.length - 1]] = value;
}

function getNestedValue<T>(obj: any, path: string, defaultValue: T): T {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined || !current.hasOwnProperty(part)) {
      return defaultValue;
    }
    current = current[part];
  }
  
  return current ?? defaultValue;
}

function deleteNestedValue(obj: any, path: string): void {
  const parts = path.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) {
      return;
    }
    current = current[parts[i]];
  }
  
  delete current[parts[parts.length - 1]];
}

export type { UserPreferences };
