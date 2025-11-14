import { useEffect, useState } from 'react';

const KEY_PREFIX = 'amp:user:';
const MY_MENU_KEY = 'myMenuEnabled';
const HOME_POS_KEY = 'homeButtonPos';

export function getMyMenuEnabled(userId?: string | null): boolean {
  if (!userId) return false;
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${userId}:${MY_MENU_KEY}`);
    return raw === 'true';
  } catch {
    return false;
  }
}

export function setMyMenuEnabled(userId: string, enabled: boolean): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${userId}:${MY_MENU_KEY}`, String(enabled));
    // Fire a custom event for same-tab listeners
    window.dispatchEvent(new StorageEvent('storage', {
      key: `${KEY_PREFIX}${userId}:${MY_MENU_KEY}`,
      newValue: String(enabled)
    }));
  } catch {
    // ignore
  }
}

export function useMyMenuEnabled(userId?: string | null): [boolean, (val: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(() => getMyMenuEnabled(userId));

  useEffect(() => {
    setEnabledState(getMyMenuEnabled(userId));
  }, [userId]);

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

  const set = (val: boolean) => {
    if (!userId) return;
    setEnabledState(val);
    setMyMenuEnabled(userId, val);
  };

  return [enabled, set];
}

export interface HomeButtonPosition { x: number; y: number }

export function getHomeButtonPosition(userId?: string | null): HomeButtonPosition {
  if (!userId) return { x: 8, y: 8 };
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${userId}:${HOME_POS_KEY}`);
    if (!raw) return { x: 8, y: 8 };
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
    return { x: 8, y: 8 };
  } catch {
    return { x: 8, y: 8 };
  }
}

export function setHomeButtonPosition(userId: string, pos: HomeButtonPosition): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${userId}:${HOME_POS_KEY}`, JSON.stringify(pos));
    window.dispatchEvent(new StorageEvent('storage', {
      key: `${KEY_PREFIX}${userId}:${HOME_POS_KEY}`,
      newValue: JSON.stringify(pos)
    }));
  } catch {}
}

export function useHomeButtonPosition(userId?: string | null): [HomeButtonPosition, (pos: HomeButtonPosition) => void, () => void] {
  const [pos, setPosState] = useState<HomeButtonPosition>(() => getHomeButtonPosition(userId));

  useEffect(() => {
    setPosState(getHomeButtonPosition(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const key = `${KEY_PREFIX}${userId}:${HOME_POS_KEY}`;
    const onStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setPosState(parsed);
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  const set = (next: HomeButtonPosition) => {
    if (!userId) return;
    setPosState(next);
    setHomeButtonPosition(userId, next);
  };

  const reset = () => set({ x: 8, y: 8 });

  return [pos, set, reset];
}


