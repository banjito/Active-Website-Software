import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Polls the Supabase REST gateway to detect when the backend is unreachable
 * (e.g. the project is being upgraded, restarting, paused, or the user has
 * lost their internet connection).
 *
 * During a Supabase Postgres upgrade the whole project — including the API
 * gateway — goes offline, so a lightweight request to the REST root will either
 * fail to connect or return a 5xx. We treat any completed HTTP response with a
 * status < 500 as "the gateway is up" (401/404 still means Supabase answered).
 *
 * To avoid flashing the maintenance screen on a single transient blip, the
 * status only flips to "down" after a couple of consecutive failures.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

// How often to check while things look healthy vs. while we think we're down.
const HEALTHY_INTERVAL_MS = 25_000;
const DOWN_INTERVAL_MS = 5_000;
// Per-request timeout.
const REQUEST_TIMEOUT_MS = 8_000;
// Consecutive failures required before we declare the backend down.
const FAILURE_THRESHOLD = 2;

export type ConnectionStatus = "healthy" | "down";

interface UseSupabaseHealthResult {
  status: ConnectionStatus;
  /** true when the browser itself reports no network connection */
  isBrowserOffline: boolean;
  /** manually trigger a check (used by the "Try again" button) */
  checkNow: () => void;
}

async function pingSupabase(): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // Misconfigured env — don't block the app with a maintenance screen.
    return true;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: "HEAD",
      headers: { apikey: SUPABASE_ANON_KEY },
      // Never serve a cached success while the project is actually down.
      cache: "no-store",
      signal: controller.signal,
    });
    // Any answer below 500 means the gateway responded → backend is reachable.
    return res.status < 500;
  } catch {
    // Network error / timeout / DNS failure → treat as unreachable.
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function useSupabaseHealth(): UseSupabaseHealthResult {
  const [status, setStatus] = useState<ConnectionStatus>("healthy");
  const [isBrowserOffline, setIsBrowserOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  const failureCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  // Keep latest status without re-triggering the polling effect.
  const statusRef = useRef<ConnectionStatus>(status);
  statusRef.current = status;

  const runCheck = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const ok = await pingSupabase();
      if (ok) {
        failureCountRef.current = 0;
        setStatus("healthy");
      } else {
        failureCountRef.current += 1;
        if (failureCountRef.current >= FAILURE_THRESHOLD) {
          setStatus("down");
        }
      }
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // Polling loop that re-schedules itself based on current status.
  useEffect(() => {
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      const interval =
        statusRef.current === "down" ? DOWN_INTERVAL_MS : HEALTHY_INTERVAL_MS;
      timerRef.current = setTimeout(async () => {
        await runCheck();
        schedule();
      }, interval);
    };

    // Kick off an immediate check, then start the loop.
    runCheck().finally(schedule);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runCheck]);

  // React to browser online/offline and tab re-focus for snappier recovery.
  useEffect(() => {
    const handleOnline = () => {
      setIsBrowserOffline(false);
      runCheck();
    };
    const handleOffline = () => setIsBrowserOffline(true);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") runCheck();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [runCheck]);

  return { status, isBrowserOffline, checkNow: runCheck };
}
