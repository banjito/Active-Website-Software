/**
 * User Preferences Service
 * 
 * This service manages user preferences storage in Supabase instead of localStorage.
 * It stores preferences in the common.profiles.user_preferences JSONB column.
 * 
 * MULTI-TAB OPTIMIZATIONS:
 * - Uses BroadcastChannel to sync preferences across tabs
 * - Prevents concurrent API calls with request deduplication
 * - Migration only runs once globally (tracked in sessionStorage)
 * - Extended cache TTL to reduce API load
 * 
 * Structure of user_preferences:
 * {
 *   filters: { opportunityList: {...}, jobList: {...} },
 *   drafts: { estimate-draft-{id}: {...}, letter-proposal-draft-{id}: "..." },
 *   ui: { estimate-tab-order-{id}: [...], mergeGroups: {...} },
 *   portal: { showWelcome: true, ... },
 *   theme: "dark" | "light",
 *   myMenu: { enabled: true, position: {x, y} },
 *   shortcuts: [...],
 *   misc: { ... }
 * }
 */

import { supabase } from '../lib/supabase';

// Types for user preferences
export interface UserPreferences {
  filters?: {
    opportunityList?: {
      sortField?: 'quote_number' | 'opportunity_created_date' | 'proposal_due_date';
      sortDirection?: 'asc' | 'desc';
      searchTerm?: string;
    };
    jobList?: {
      sortField?: string;
      sortDirection?: 'asc' | 'desc';
      searchTerm?: string;
      statusFilter?: string;
    };
    customerList?: {
      sortField?: string;
      sortDirection?: 'asc' | 'desc';
      searchTerm?: string;
    };
    contactList?: {
      sortField?: string;
      sortDirection?: 'asc' | 'desc';
      searchTerm?: string;
    };
  };
  drafts?: {
    [key: string]: any; // estimate-draft-{id}, letter-proposal-draft-{id}
  };
  ui?: {
    [key: string]: any; // estimate-tab-order-{id}, merge groups, etc.
  };
  portal?: {
    showWelcome?: boolean;
    showMyShortcuts?: boolean;
    showReviewShortcuts?: boolean;
    showIssueShortcuts?: boolean;
    showApprovedShortcuts?: boolean;
    hiddenPortals?: string[];
  };
  theme?: 'dark' | 'light' | 'system';
  myMenu?: {
    enabled?: boolean;
    position?: { x: number; y: number };
  };
  shortcuts?: any[];
  recentSearches?: string[];
  meetings?: {
    [key: string]: any;
  };
  misc?: {
    [key: string]: any;
  };
  // Track migration status
  _migratedFromLocalStorage?: boolean;
  _lastUpdated?: string;
}

// In-memory cache to avoid repeated DB calls
let preferencesCache: UserPreferences | null = null;
let cacheUserId: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache TTL (increased from 5 min)

// Pending updates queue to batch writes
let pendingUpdates: Partial<UserPreferences> = {};
let updateTimeout: NodeJS.Timeout | null = null;
const UPDATE_DEBOUNCE_MS = 2000; // 2 second debounce (increased from 1 sec)

// Request deduplication - prevent concurrent API calls
let loadInProgress: Promise<UserPreferences> | null = null;
let saveInProgress: Promise<boolean> | null = null;

// BroadcastChannel for cross-tab sync
let broadcastChannel: BroadcastChannel | null = null;
const BROADCAST_CHANNEL_NAME = 'amp-user-preferences';

// Initialize broadcast channel for cross-tab sync
function initBroadcastChannel() {
  if (broadcastChannel) return;
  
  try {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      const { type, userId, preferences, timestamp } = event.data;
      
      if (type === 'PREFERENCES_UPDATED' && userId === cacheUserId) {
        // Another tab updated preferences - update our cache
        if (timestamp > cacheTimestamp) {
          preferencesCache = preferences;
          cacheTimestamp = timestamp;
          console.log('[UserPrefs] Cache updated from another tab');
        }
      } else if (type === 'CACHE_INVALIDATED' && userId === cacheUserId) {
        // Another tab invalidated the cache
        cacheTimestamp = 0; // Force reload on next access
      }
    };
  } catch (e) {
    // BroadcastChannel not supported (e.g., Safari < 15.4)
    console.warn('[UserPrefs] BroadcastChannel not available');
  }
}

// Broadcast cache update to other tabs
function broadcastCacheUpdate(userId: string, preferences: UserPreferences) {
  if (!broadcastChannel) return;
  
  try {
    broadcastChannel.postMessage({
      type: 'PREFERENCES_UPDATED',
      userId,
      preferences,
      timestamp: Date.now()
    });
  } catch (e) {
    // Ignore broadcast errors
  }
}

/**
 * Load user preferences from Supabase
 * Uses request deduplication to prevent concurrent API calls
 */
export async function loadUserPreferences(userId: string): Promise<UserPreferences> {
  initBroadcastChannel();
  
  // Return cached if valid
  const now = Date.now();
  if (preferencesCache && cacheUserId === userId && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return preferencesCache;
  }

  // If a load is already in progress for this user, wait for it
  if (loadInProgress && cacheUserId === userId) {
    console.log('[UserPrefs] Load already in progress, waiting...');
    return loadInProgress;
  }

  // Start new load
  loadInProgress = (async () => {
    try {
      const { data, error } = await supabase
        .schema('common')
        .from('profiles')
        .select('user_preferences')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('[UserPrefs] Error loading:', error.message);
        // Return cached data if available, even if expired
        if (preferencesCache && cacheUserId === userId) {
          return preferencesCache;
        }
        return {};
      }

      const prefs = (data?.user_preferences as UserPreferences) || {};
      
      // Update cache
      preferencesCache = prefs;
      cacheUserId = userId;
      cacheTimestamp = Date.now();

      return prefs;
    } finally {
      loadInProgress = null;
    }
  })();

  return loadInProgress;
}

/**
 * Save user preferences to Supabase (debounced)
 */
export async function saveUserPreferences(
  userId: string, 
  preferences: UserPreferences,
  immediate: boolean = false
): Promise<boolean> {
  // Merge with pending updates
  pendingUpdates = deepMerge(pendingUpdates, preferences);
  
  // Update cache immediately for responsive UI
  if (preferencesCache && cacheUserId === userId) {
    preferencesCache = deepMerge(preferencesCache, preferences);
    cacheTimestamp = Date.now();
    // Broadcast to other tabs
    broadcastCacheUpdate(userId, preferencesCache);
  }

  if (immediate) {
    // Save immediately
    return await flushPendingUpdates(userId);
  }

  // Debounce the actual save
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }

  return new Promise((resolve) => {
    updateTimeout = setTimeout(async () => {
      const success = await flushPendingUpdates(userId);
      resolve(success);
    }, UPDATE_DEBOUNCE_MS);
  });
}

/**
 * Flush pending updates to database
 * Uses request deduplication to prevent concurrent saves
 */
async function flushPendingUpdates(userId: string): Promise<boolean> {
  if (Object.keys(pendingUpdates).length === 0) {
    return true;
  }

  // If a save is already in progress, queue this one
  if (saveInProgress) {
    console.log('[UserPrefs] Save already in progress, waiting...');
    await saveInProgress;
    // After the previous save completes, try again if we still have updates
    if (Object.keys(pendingUpdates).length > 0) {
      return flushPendingUpdates(userId);
    }
    return true;
  }

  const updates = { ...pendingUpdates };
  pendingUpdates = {};

  saveInProgress = (async () => {
    try {
      // Get current preferences first (use cache if available)
      const current = preferencesCache && cacheUserId === userId 
        ? preferencesCache 
        : await loadUserPreferences(userId);
      const merged = deepMerge(current, updates);
      merged._lastUpdated = new Date().toISOString();

      const { error } = await supabase
        .schema('common')
        .from('profiles')
        .update({ user_preferences: merged })
        .eq('id', userId);

      if (error) {
        console.error('[UserPrefs] Error saving:', error.message);
        // Re-queue the failed updates
        pendingUpdates = deepMerge(updates, pendingUpdates);
        return false;
      }

      // Update cache
      preferencesCache = merged;
      cacheTimestamp = Date.now();
      
      // Broadcast to other tabs
      broadcastCacheUpdate(userId, merged);

      return true;
    } finally {
      saveInProgress = null;
    }
  })();

  return saveInProgress;
}

/**
 * Update a specific preference path
 * e.g., updatePreference(userId, 'filters.opportunityList.sortField', 'quote_number')
 */
export async function updatePreference(
  userId: string,
  path: string,
  value: any,
  immediate: boolean = false
): Promise<boolean> {
  const update = setNestedValue({}, path, value);
  return saveUserPreferences(userId, update, immediate);
}

/**
 * Get a specific preference value
 */
export async function getPreference<T>(
  userId: string,
  path: string,
  defaultValue: T
): Promise<T> {
  const prefs = await loadUserPreferences(userId);
  return getNestedValue(prefs, path, defaultValue);
}

/**
 * Get preferences synchronously from cache (use after initial load)
 */
export function getPreferenceSync<T>(path: string, defaultValue: T): T {
  if (!preferencesCache) {
    return defaultValue;
  }
  return getNestedValue(preferencesCache, path, defaultValue);
}

/**
 * Delete a specific preference
 */
export async function deletePreference(
  userId: string,
  path: string
): Promise<boolean> {
  const prefs = await loadUserPreferences(userId);
  deleteNestedValue(prefs, path);
  
  try {
    const { error } = await supabase
      .schema('common')
      .from('profiles')
      .update({ user_preferences: prefs })
      .eq('id', userId);

    if (error) {
      console.error('[UserPrefs] Error deleting:', error.message);
      return false;
    }

    // Update cache
    preferencesCache = prefs;
    cacheTimestamp = Date.now();
    
    // Broadcast to other tabs
    broadcastCacheUpdate(userId, prefs);

    return true;
  } catch (e) {
    console.error('[UserPrefs] Failed to delete:', e);
    return false;
  }
}

/**
 * Clear the in-memory cache (call on sign out)
 */
export function clearPreferencesCache(): void {
  preferencesCache = null;
  cacheUserId = null;
  cacheTimestamp = 0;
  pendingUpdates = {};
  if (updateTimeout) {
    clearTimeout(updateTimeout);
    updateTimeout = null;
  }
  loadInProgress = null;
  saveInProgress = null;
}

// Migration tracking key
const MIGRATION_KEY = 'amp_prefs_migrated';

/**
 * Check if migration has already run (across all tabs)
 */
function hasMigrationRun(userId: string): boolean {
  try {
    const migrated = sessionStorage.getItem(MIGRATION_KEY);
    if (migrated) {
      const data = JSON.parse(migrated);
      return data.userId === userId && data.done === true;
    }
  } catch {}
  return false;
}

/**
 * Mark migration as complete (across all tabs)
 */
function markMigrationComplete(userId: string): void {
  try {
    sessionStorage.setItem(MIGRATION_KEY, JSON.stringify({ userId, done: true, timestamp: Date.now() }));
  } catch {}
}

/**
 * Migrate localStorage data to Supabase
 * Only runs once per session (tracked in sessionStorage to work across tabs)
 */
export async function migrateFromLocalStorage(userId: string): Promise<boolean> {
  // Check if migration already ran in this session (any tab)
  if (hasMigrationRun(userId)) {
    console.log('[UserPrefs] Migration already completed this session');
    return true;
  }

  try {
    // Check if already migrated in database
    const current = await loadUserPreferences(userId);
    if (current._migratedFromLocalStorage) {
      console.log('[UserPrefs] Already migrated (from database flag)');
      markMigrationComplete(userId);
      return true;
    }

    const migrated: UserPreferences = { ...current };
    let hasMigrations = false;

    // Map of localStorage keys to preference paths
    const migrationMap: { pattern: RegExp; handler: (key: string, value: any, prefs: UserPreferences) => void }[] = [
      // Opportunity filters
      {
        pattern: /^opportunityFilters:(.+)$/,
        handler: (key, value, prefs) => {
          if (!prefs.filters) prefs.filters = {};
          prefs.filters.opportunityList = value;
        }
      },
      // Estimate drafts
      {
        pattern: /^estimate-draft-(.+)$/,
        handler: (key, value, prefs) => {
          if (!prefs.drafts) prefs.drafts = {};
          prefs.drafts[key] = value;
        }
      },
      // Estimate tab order
      {
        pattern: /^estimate-tab-order-(.+)$/,
        handler: (key, value, prefs) => {
          if (!prefs.ui) prefs.ui = {};
          prefs.ui[key] = value;
        }
      },
      // Letter proposal drafts
      {
        pattern: /^letter-proposal-draft-(.+)$/,
        handler: (key, value, prefs) => {
          if (!prefs.drafts) prefs.drafts = {};
          prefs.drafts[key] = value;
        }
      },
      // Letter proposal open state
      {
        pattern: /^letter-proposal-open-(.+)$/,
        handler: (key, value, prefs) => {
          if (!prefs.ui) prefs.ui = {};
          prefs.ui[key] = value;
        }
      },
      // Letter quote index
      {
        pattern: /^letter-quote-index-(.+)$/,
        handler: (key, value, prefs) => {
          if (!prefs.ui) prefs.ui = {};
          prefs.ui[key] = value;
        }
      },
      // Letter NETA standard
      {
        pattern: /^letter-neta-standard-(.+)$/,
        handler: (key, value, prefs) => {
          if (!prefs.ui) prefs.ui = {};
          prefs.ui[key] = value;
        }
      },
      // My Menu enabled
      {
        pattern: /^amp:user:(.+):myMenuEnabled$/,
        handler: (key, value, prefs) => {
          if (!prefs.myMenu) prefs.myMenu = {};
          prefs.myMenu.enabled = value === 'true';
        }
      },
      // Home button position
      {
        pattern: /^amp:user:(.+):homeButtonPos$/,
        handler: (key, value, prefs) => {
          if (!prefs.myMenu) prefs.myMenu = {};
          try {
            prefs.myMenu.position = typeof value === 'string' ? JSON.parse(value) : value;
          } catch {}
        }
      },
      // Recent searches
      {
        pattern: /^recentSearches:(.+)$/,
        handler: (key, value, prefs) => {
          try {
            prefs.recentSearches = typeof value === 'string' ? JSON.parse(value) : value;
          } catch {}
        }
      },
      // Theme
      {
        pattern: /^theme$/,
        handler: (key, value, prefs) => {
          prefs.theme = value as 'dark' | 'light' | 'system';
        }
      },
      // Portal preferences
      {
        pattern: /^portalPreferences:(.+)$/,
        handler: (key, value, prefs) => {
          try {
            prefs.portal = typeof value === 'string' ? JSON.parse(value) : value;
          } catch {}
        }
      },
      // Meeting data
      {
        pattern: /^meetings:(.+)$/,
        handler: (key, value, prefs) => {
          if (!prefs.meetings) prefs.meetings = {};
          const subKey = key.replace('meetings:', '');
          try {
            prefs.meetings[subKey] = typeof value === 'string' ? JSON.parse(value) : value;
          } catch {}
        }
      },
      // Merge groups
      {
        pattern: /^mergeGroups-(.+)$/,
        handler: (key, value, prefs) => {
          if (!prefs.ui) prefs.ui = {};
          prefs.ui[key] = value;
        }
      }
    ];

    // Scan localStorage and migrate (limit to first 50 keys to avoid blocking)
    const keysToProcess: string[] = [];
    for (let i = 0; i < Math.min(localStorage.length, 100); i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // Skip Supabase auth keys
      if (key.includes('supabase') || key.includes('sb-')) continue;
      // Skip suspend refresh flag
      if (key === 'AMP_SUSPEND_REFRESH') continue;
      keysToProcess.push(key);
    }

    for (const key of keysToProcess) {
      for (const { pattern, handler } of migrationMap) {
        if (pattern.test(key)) {
          try {
            let value = localStorage.getItem(key);
            // Try to parse JSON
            try {
              value = JSON.parse(value || '');
            } catch {
              // Keep as string
            }
            handler(key, value, migrated);
            hasMigrations = true;
          } catch (e) {
            console.warn(`[UserPrefs] Failed to migrate key: ${key}`, e);
          }
          break;
        }
      }
    }

    if (hasMigrations) {
      migrated._migratedFromLocalStorage = true;
      migrated._lastUpdated = new Date().toISOString();

      // Save migrated preferences
      const { error } = await supabase
        .schema('common')
        .from('profiles')
        .update({ user_preferences: migrated })
        .eq('id', userId);

      if (error) {
        console.error('[UserPrefs] Error saving migrated:', error.message);
        return false;
      }

      // Clear migrated localStorage keys (except auth)
      const keysToRemove: string[] = [];
      for (const key of keysToProcess) {
        for (const { pattern } of migrationMap) {
          if (pattern.test(key)) {
            keysToRemove.push(key);
            break;
          }
        }
      }

      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch {}
      });

      console.log(`[UserPrefs] Migrated ${keysToRemove.length} keys to Supabase`);

      // Update cache
      preferencesCache = migrated;
      cacheTimestamp = Date.now();
    }

    // Mark migration complete for this session
    markMigrationComplete(userId);

    return true;
  } catch (e) {
    console.error('[UserPrefs] Migration failed:', e);
    return false;
  }
}

// Utility functions

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];
      const targetValue = (result as any)[key];
      
      if (sourceValue !== null && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        if (targetValue !== null && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
          (result as any)[key] = deepMerge(targetValue, sourceValue);
        } else {
          (result as any)[key] = { ...sourceValue };
        }
      } else {
        (result as any)[key] = sourceValue;
      }
    }
  }
  
  return result;
}

function setNestedValue(obj: any, path: string, value: any): any {
  const parts = path.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  
  current[parts[parts.length - 1]] = value;
  return obj;
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
