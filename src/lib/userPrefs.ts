/**
 * User Preferences (Legacy API)
 * 
 * This file provides backward compatibility for the old localStorage-based 
 * preferences API. New code should use useUserPreferences hook directly.
 * 
 * The implementation now delegates to Supabase-backed preferences service.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { 
  loadUserPreferences, 
  saveUserPreferences, 
  getPreferenceSync 
} from '../services/userPreferencesService';

const KEY_PREFIX = 'amp:user:';
const MY_MENU_KEY = 'myMenuEnabled';
const HOME_POS_KEY = 'homeButtonPos';

/**
 * @deprecated Use useMyMenuPreferences hook from useUserPreferences.ts instead
 */
export function getMyMenuEnabled(userId?: string | null): boolean {
  if (!userId) return false;
  // Try to get from cache synchronously
  return getPreferenceSync('myMenu.enabled', false);
}

/**
 * @deprecated Use useMyMenuPreferences hook from useUserPreferences.ts instead
 */
export function setMyMenuEnabled(userId: string, enabled: boolean): void {
  if (!userId) return;
  // Save to Supabase (async, fire and forget)
  saveUserPreferences(userId, { myMenu: { enabled } }).catch(console.error);
  
  // Also fire storage event for backward compatibility with same-tab listeners
  window.dispatchEvent(new StorageEvent('storage', {
    key: `${KEY_PREFIX}${userId}:${MY_MENU_KEY}`,
    newValue: String(enabled)
  }));
}

/**
 * @deprecated Use useMyMenuPreferences hook from useUserPreferences.ts instead
 */
export function useMyMenuEnabled(userId?: string | null): [boolean, (val: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(false);
  const isInitialized = useRef(false);

  // Load from Supabase on mount
  useEffect(() => {
    if (!userId) {
      setEnabledState(false);
      return;
    }

    loadUserPreferences(userId).then((prefs) => {
      setEnabledState(prefs.myMenu?.enabled ?? false);
      isInitialized.current = true;
    }).catch(console.error);
  }, [userId]);

  // Listen for storage events (backward compatibility)
  useEffect(() => {
    if (!userId) return;
    const key = `${KEY_PREFIX}${userId}:${MY_MENU_KEY}`;
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        setEnabledState(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  const set = useCallback((val: boolean) => {
    if (!userId) return;
    setEnabledState(val);
    setMyMenuEnabled(userId, val);
  }, [userId]);

  return [enabled, set];
}

export interface HomeButtonPosition { x: number; y: number }

const DEFAULT_POSITION: HomeButtonPosition = { x: 8, y: 8 };

/**
 * @deprecated Use useMyMenuPreferences hook from useUserPreferences.ts instead
 */
export function getHomeButtonPosition(userId?: string | null): HomeButtonPosition {
  if (!userId) return DEFAULT_POSITION;
  // Try to get from cache synchronously
  return getPreferenceSync('myMenu.position', DEFAULT_POSITION);
}

/**
 * @deprecated Use useMyMenuPreferences hook from useUserPreferences.ts instead
 */
export function setHomeButtonPosition(userId: string, pos: HomeButtonPosition): void {
  if (!userId) return;
  // Save to Supabase (async, fire and forget)
  saveUserPreferences(userId, { myMenu: { position: pos } }).catch(console.error);
  
  // Also fire storage event for backward compatibility
  window.dispatchEvent(new StorageEvent('storage', {
    key: `${KEY_PREFIX}${userId}:${HOME_POS_KEY}`,
    newValue: JSON.stringify(pos)
  }));
}

/**
 * @deprecated Use useMyMenuPreferences hook from useUserPreferences.ts instead
 */
export function useHomeButtonPosition(userId?: string | null): [HomeButtonPosition, (pos: HomeButtonPosition) => void, () => void] {
  const [pos, setPosState] = useState<HomeButtonPosition>(DEFAULT_POSITION);
  const isInitialized = useRef(false);

  // Load from Supabase on mount
  useEffect(() => {
    if (!userId) {
      setPosState(DEFAULT_POSITION);
      return;
    }

    loadUserPreferences(userId).then((prefs) => {
      const savedPos = prefs.myMenu?.position;
      if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
        setPosState(savedPos);
      }
      isInitialized.current = true;
    }).catch(console.error);
  }, [userId]);

  // Listen for storage events (backward compatibility)
  useEffect(() => {
    if (!userId) return;
    const key = `${KEY_PREFIX}${userId}:${HOME_POS_KEY}`;
    const onStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
            setPosState(parsed);
          }
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  const set = useCallback((next: HomeButtonPosition) => {
    if (!userId) return;
    setPosState(next);
    setHomeButtonPosition(userId, next);
  }, [userId]);

  const reset = useCallback(() => {
    set(DEFAULT_POSITION);
  }, [set]);

  return [pos, set, reset];
}
