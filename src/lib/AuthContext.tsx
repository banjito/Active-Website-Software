import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { User } from "@supabase/supabase-js";
import {
  supabase,
  isOffline,
  isRetryableAuthError,
  isUnrecoverableAuthError,
  readPersistedSession,
  clearPersistedAuth,
} from "./supabase";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Navigate, useLocation } from "react-router-dom";
import { employeeNameEmailRegex } from "./companyConfig";

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  softRefresh: () => Promise<boolean>; // Mimics sign-out/sign-in without actually signing out
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

/**
 * Whether two user objects describe the same signed-in person in the same
 * state. Used to avoid handing React a brand-new object for an unchanged user.
 */
function sameUser(a: User | null, b: User | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.role === b.role &&
    a.updated_at === b.updated_at &&
    JSON.stringify(a.user_metadata ?? null) ===
      JSON.stringify(b.user_metadata ?? null) &&
    JSON.stringify(a.app_metadata ?? null) ===
      JSON.stringify(b.app_metadata ?? null)
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);

  /**
   * Sets the user, but keeps the *existing* object when nothing about the user
   * actually changed.
   *
   * Every token renewal hands back a fresh user object describing the same
   * person. Several reports re-run their load effect on `[jobId, reportId,
   * user]`, and reloading throws away whatever the technician has typed since
   * the last successful save. Returning the previous object makes React skip
   * the re-render entirely, so a routine token renewal - including the one that
   * fires the moment WiFi comes back, exactly when unsaved work exists - can't
   * wipe a form. A real change (new sign-in, role update, renamed profile) still
   * produces a new object and still re-runs those effects.
   */
  const setUser = React.useCallback((next: User | null) => {
    setUserState((prev) => (sameUser(prev, next) ? prev : next));
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Track users we've already attempted auto-name for this session to prevent loops
  const autoNameAttempted = React.useRef<Set<string>>(new Set());
  // Rate limit refreshUser to prevent token refresh storms
  const lastRefreshTime = React.useRef<number>(0);
  const REFRESH_COOLDOWN_MS = 5000; // 5 second cooldown between refreshes

  const deriveNameFromEmail = (email?: string | null): string | null => {
    if (!email) return null;
    const lower = email.toLowerCase();
    const match = lower.match(employeeNameEmailRegex);
    if (!match) return null;
    const first = match[1];
    const last = match[2];
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(first)} ${cap(last)}`;
  };

  const maybeApplyAutoName = async (u: User | null) => {
    try {
      if (!u?.email || !u?.id) return;

      // Prevent multiple attempts for the same user in this session
      if (autoNameAttempted.current.has(u.id)) {
        return;
      }

      const derived = deriveNameFromEmail(u.email);
      if (!derived) return;
      const current = u.user_metadata?.name as string | undefined;

      // Log for debugging the specific user issue
      console.log("maybeApplyAutoName check:", {
        userId: u.id,
        email: u.email,
        current,
        derived,
        match: current === derived,
      });

      if (current !== derived) {
        // Mark as attempted BEFORE the API call to prevent race conditions
        autoNameAttempted.current.add(u.id);

        const { error: updErr } = await supabase.auth.updateUser({
          data: { name: derived },
        });
        if (updErr) {
          console.warn("Auto-name update failed:", updErr);
          // Remove from attempted set so it can retry on next sign-in
          autoNameAttempted.current.delete(u.id);
        }
        // Note: updateUser() automatically triggers onAuthStateChange with USER_UPDATED event,
        // so we don't need to manually call refreshUser() here (which would cause a loop)
      }
    } catch (e) {
      console.warn("maybeApplyAutoName error:", e);
    }
  };

  const signOut = async () => {
    try {
      setUser(null);
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Supabase sign out error:", error);
        setError(error);
      }
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        console.error("Error clearing storage:", e);
      }
    } catch (err) {
      console.error("Error in signOut:", err);
      setUser(null);
      setError(err instanceof Error ? err : new Error("Sign out failed"));
    }
  };

  const refreshUser = async () => {
    try {
      // Rate limit to prevent token refresh storms
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTime.current;
      console.log("🔄 refreshUser called", {
        timeSinceLastRefresh,
        cooldown: REFRESH_COOLDOWN_MS,
      });

      if (timeSinceLastRefresh < REFRESH_COOLDOWN_MS) {
        console.log("  ↳ Skipped - cooldown active");
        return;
      }
      lastRefreshTime.current = now;

      // Force a session refresh to pull updated JWT claims (e.g., updated role)
      console.log("  ↳ Calling supabase.auth.refreshSession()...");
      const { data: refreshData, error: refreshError } =
        await supabase.auth.refreshSession();
      if (refreshError) {
        console.error("  ↳ refreshSession error:", refreshError);
        return; // Don't try getUser if refresh failed - it will just fail too
      }

      // Fallback to getUser if refresh didn't return a session
      if (!refreshData?.session) {
        console.log("  ↳ No session from refresh, trying getUser...");
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          console.error("  ↳ getUser error:", error);
          return;
        }
        setUser(data.user ?? null);
        return;
      }

      console.log("  ↳ Session refreshed successfully");
      setUser(refreshData.session.user ?? null);
    } catch (err) {
      console.error("Unexpected error in refreshUser:", err);
    }
  };

  /**
   * softRefresh - Recovers a stale session in place, without making the user
   * sign out and back in. Call it when queries start failing with auth errors.
   *
   * Returns true when the session was refreshed. A false return does NOT mean
   * "sign in again": if the auth server was simply unreachable (hotspot drop,
   * WiFi handoff, captive portal) the stored credentials are left untouched and
   * the signed-in user is kept, so the next attempt can succeed.
   */
  const softRefresh = async (): Promise<boolean> => {
    // Offline: there is nothing to recover and nothing worth destroying. The
    // stored refresh token is still valid; it just can't be exchanged yet.
    if (isOffline()) {
      console.warn("🔃 softRefresh: device is offline - keeping the current session.");
      return false;
    }

    try {
      console.log("🔃 softRefresh: refreshing the session in place...");

      // Refresh FIRST, and only ever clear storage once the server has actually
      // rejected the refresh token. The previous version deleted every Supabase
      // key before refreshing, so a refresh that failed because the network was
      // down left the device with no credentials at all - which is why losing
      // WiFi forced a fresh sign-in. A successful refresh rewrites storage
      // itself, so the pre-emptive wipe bought nothing.
      const { data: refreshData, error: refreshError } =
        await supabase.auth.refreshSession();

      if (refreshError) {
        if (isUnrecoverableAuthError(refreshError)) {
          console.error(
            "  ↳ refresh token was rejected by the server - signing out:",
            refreshError,
          );
          clearPersistedAuth();
          setUser(null);
          return false;
        }
        console.warn(
          "  ↳ softRefresh could not reach the auth server; session kept for retry:",
          refreshError,
        );
        return false;
      }

      if (!refreshData?.session) {
        console.warn("  ↳ softRefresh: no session returned; session kept for retry");
        return false;
      }

      console.log("  ↳ softRefresh: session recovered successfully!");
      setUser(refreshData.session.user ?? null);
      lastRefreshTime.current = Date.now();

      return true;
    } catch (err) {
      console.error("  ↳ softRefresh unexpected error:", err);
      return false;
    }
  };

  // Network/CORS/522/offline detection lives in supabase.ts so the auth layer
  // and the query layer agree on what counts as "try again later".
  const isNetworkOrCorsError = isRetryableAuthError;

  // onAuthStateChange closes over the first render's state, so read the current
  // user through a ref instead of the (permanently null) captured value.
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  /**
   * Restores the signed-in user from the tokens on disk, with no network call.
   *
   * getSession() reports `session: null` once the access token has aged out and
   * it cannot reach the server to renew it - true after roughly an hour without
   * signal. The refresh token in storage is still good, so treating that as
   * "signed out" is what used to bounce field users to the login screen every
   * time a hotspot dropped. Keep them signed in on the stored identity; the
   * client renews the token by itself as soon as the connection is back.
   */
  const hydrateFromStoredSession = (): boolean => {
    const stored = readPersistedSession();
    if (!stored?.user) return false;
    console.warn(
      "📴 Auth server unreachable - staying signed in on the stored session; it will renew when the connection returns.",
    );
    setUser(stored.user as User);
    return true;
  };

  useEffect(() => {
    let mounted = true;
    let roleChangeChannel: ReturnType<typeof supabase.channel> | null = null;

    const INITIAL_SESSION_TIMEOUT_MS = 12_000; // 12s so app never hangs on 522/CORS

    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Auth session timeout")),
        INITIAL_SESSION_TIMEOUT_MS,
      ),
    );

    const applySessionResult = (result: {
      data: { session: any };
      error: any;
    }) => {
      if (!mounted) return;
      const {
        data: { session },
        error: sessionError,
      } = result;

      // Debug: Log system time vs token expiry to detect clock sync issues
      if (session?.expires_at) {
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = session.expires_at;
        const diff = expiresAt - now;
        console.log("Token debug:", {
          systemTime: new Date().toISOString(),
          tokenExpiresAt: new Date(expiresAt * 1000).toISOString(),
          secondsUntilExpiry: diff,
          clockMightBeOff: diff < 0 || diff > 7200,
        });
        if (diff < 0) {
          console.error(
            "⚠️ TOKEN APPEARS EXPIRED - Check if system clock is correct!",
          );
        }
      }

      if (sessionError) {
        console.error("Initial session check failed:", sessionError);
        const errorMessage = sessionError.message?.toLowerCase() || "";
        const statusCode = (sessionError as any).status;

        const isRateLimitError =
          statusCode === 429 || errorMessage.includes("rate limit");
        const isNetworkError = isNetworkOrCorsError(sessionError);
        const isDeadSession =
          !isRateLimitError &&
          !isNetworkError &&
          (isUnrecoverableAuthError(sessionError) ||
            errorMessage.includes("refresh token is invalid"));

        if (isRateLimitError || isNetworkError) {
          console.warn(
            "Auth server unreachable (offline/CORS/522/rate limit). Restoring the stored session.",
          );
          // Only fall back to the login screen when there is genuinely nothing
          // on disk to restore.
          if (!hydrateFromStoredSession()) setUser(null);
        } else if (isDeadSession) {
          console.error(
            "Unrecoverable auth error detected - clearing stored auth",
          );
          clearPersistedAuth();
          setError(sessionError);
          setUser(null);
        } else {
          setError(sessionError);
          setUser(null);
        }
      } else {
        setUser(session?.user ?? null);
      }
      setLoading(false);
      if (session?.user) {
        void maybeApplyAutoName(session.user);
        setupRoleChannel(session.user);
      }
    };

    Promise.race([sessionPromise, timeoutPromise])
      .then((result) => {
        if (!mounted) return;
        applySessionResult(result as { data: { session: any }; error: any });
      })
      .catch((err) => {
        if (!mounted) return;
        console.error("Initial session promise error:", err);
        const errorMessage = err?.message?.toLowerCase() || "";
        const isTimeout = errorMessage.includes("timeout");
        const isRateLimitError =
          (err as any)?.status === 429 || errorMessage.includes("rate limit");
        const isNetworkError = isTimeout || isNetworkOrCorsError(err);
        const isDeadSession =
          !isRateLimitError &&
          !isNetworkError &&
          (isUnrecoverableAuthError(err) ||
            errorMessage.includes("refresh token is invalid"));

        if (isTimeout || isRateLimitError || isNetworkError) {
          console.warn(
            "Auth session could not be checked (timeout/offline/rate limit). Restoring the stored session.",
          );
          if (!hydrateFromStoredSession()) setUser(null);
        } else if (isDeadSession) {
          clearPersistedAuth();
          setError(err);
          setUser(null);
        } else {
          setError(err);
          setUser(null);
        }
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      // Log ALL events for debugging
      console.log("🔐 onAuthStateChange:", {
        event,
        hasSession: !!session,
        userId: session?.user?.id?.substring(0, 8),
        timestamp: new Date().toISOString(),
      });

      // Ignore TOKEN_REFRESHED events entirely to prevent refresh loops
      if (event === "TOKEN_REFRESHED") {
        console.log("  ↳ Ignoring TOKEN_REFRESHED event");
        return;
      }

      // If we get SIGNED_OUT but we currently have a user, something is forcing logout
      if (event === "SIGNED_OUT" && userRef.current) {
        console.error(
          "⚠️ SIGNED_OUT received while user exists - investigating...",
        );
        // Offline, this is almost always a refresh that could not reach the
        // server rather than a real sign-out. Keep the user on the stored
        // credentials instead of dropping them at the login screen.
        if (isOffline() && readPersistedSession()) {
          console.log("  ↳ Offline with stored credentials, ignoring SIGNED_OUT");
          return;
        }
        // Don't immediately sign out - check if we actually have a valid session
        supabase.auth.getSession().then(({ data, error }) => {
          if (data.session) {
            console.log("  ↳ Session still valid, ignoring SIGNED_OUT event");
            return;
          }
          if (isNetworkOrCorsError(error) && readPersistedSession()) {
            console.log(
              "  ↳ Could not reach the auth server; keeping the stored session",
            );
            return;
          }
          console.log("  ↳ Confirmed no valid session, signing out");
          setUser(null);
        });
        return;
      }

      // A null session on a non-sign-out event (INITIAL_SESSION offline, for
      // instance) means "couldn't confirm", not "signed out". Don't drop a user
      // we still hold valid credentials for.
      if (!session && userRef.current && readPersistedSession()) {
        console.log(
          `  ↳ ${event} arrived without a session but credentials are stored - keeping the user signed in`,
        );
        setLoading(false);
        return;
      }

      setUser(session?.user ?? null);
      setLoading(false);
      setError(null);

      if (session?.user && event === "SIGNED_IN") {
        void maybeApplyAutoName(session.user);
      }
    });

    // NOTE: Manual token refresh removed - autoRefreshToken is now enabled in supabase.ts
    // Supabase handles token refresh automatically. We ignore TOKEN_REFRESHED events above to prevent loops.

    // Subscribe to role change logs to auto-refresh current user's permissions
    // Uses the already-loaded user from state instead of calling getUser() again
    const setupRoleChannel = (currentUser: User | null) => {
      if (!currentUser) {
        console.log("Skipping role change subscription - no valid user");
        return;
      }

      roleChangeChannel = supabase
        .channel("role-changes")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "common",
            table: "role_change_logs",
            filter: `user_id=eq.${currentUser.id}`,
          },
          async () => {
            // When a role change is detected for this user, refresh the user object
            await refreshUser();
          },
        )
        .subscribe();
    };

    // We'll call setupRoleChannel from within the getSession callback once we have the user

    // Auto session health check when tab becomes visible (fixes "opportunities not loading" issue)
    // This refreshes a stale session in place, without making the user sign in again.
    let lastVisibilityCheck = Date.now();
    const VISIBILITY_CHECK_COOLDOWN_MS = 30000; // 30 seconds minimum between checks

    const checkSessionHealth = async (trigger: string) => {
      if (!mounted) return;

      // Nothing to check and nothing to fix while the device has no network.
      // The stored refresh token stays put and gets used the moment we're back.
      if (isOffline()) {
        console.log(`  ↳ ${trigger}: device is offline, skipping session check`);
        return;
      }

      try {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionData?.session) {
          // Session exists, but let's verify the token is actually working
          const { error: userError } = await supabase.auth.getUser();
          if (!userError) {
            console.log("  ↳ Session is healthy, no action needed");
            return;
          }
          if (isNetworkOrCorsError(userError)) {
            console.log("  ↳ Connection problem, not a session problem - leaving it alone");
            return;
          }
          console.log(
            "  ↳ getUser failed despite session existing, triggering softRefresh...",
          );
          await softRefresh();
          return;
        }

        if (isNetworkOrCorsError(sessionError)) {
          console.log(
            "  ↳ Auth server unreachable - keeping the stored session for the next attempt",
          );
          // The connection died between the offline check above and this call.
          // Hold onto the user rather than bouncing them to /login.
          if (!userRef.current) hydrateFromStoredSession();
          return;
        }

        console.log("  ↳ Session appears stale, triggering softRefresh...");
        const success = await softRefresh();
        if (!success && !isOffline() && !readPersistedSession()) {
          console.warn("  ↳ softRefresh failed - user needs to sign in again");
        }
      } catch (err) {
        console.warn("  ↳ Session health check error:", err);
        if (!isNetworkOrCorsError(err)) await softRefresh();
      }
    };

    const handleVisibilityChange = async () => {
      if (!mounted) return;
      if (document.visibilityState !== "visible") return;

      // Respect suspend flag for editing workflows
      try {
        const suspend = localStorage.getItem("AMP_SUSPEND_REFRESH");
        if (suspend === "true") return;
      } catch {}

      // Rate limit visibility checks
      const now = Date.now();
      if (now - lastVisibilityCheck < VISIBILITY_CHECK_COOLDOWN_MS) {
        return;
      }
      lastVisibilityCheck = now;

      console.log("👁️ Tab became visible - checking session health...");
      await checkSessionHealth("visibilitychange");
    };

    // Coming back onto WiFi/hotspot is the moment the access token can actually
    // be renewed. Do it right away so the first query after reconnecting works,
    // instead of waiting for the auto-refresh timer or a tab switch.
    const handleOnline = async () => {
      if (!mounted) return;
      console.log("🌐 Connection restored - renewing the session...");
      lastVisibilityCheck = Date.now();
      const refreshed = await softRefresh();
      if (refreshed && !roleChangeChannel && userRef.current) {
        // The role-change subscription can't be opened offline; open it now.
        setupRoleChannel(userRef.current);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (roleChangeChannel) {
        supabase.removeChannel(roleChangeChannel);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">
          Authentication Error: {error.message}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-neutral-600">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, signOut, refreshUser, softRefresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Print-token bootstrap: when there's no logged-in user but the URL carries a
  // `token` query param, exchange it (via report-print-auth) for a renderer
  // session so a headless browser can render the report's ?print=true page.
  // This branch is inert for normal staff usage (they always have `user`).
  const printToken = new URLSearchParams(location.search).get("token");
  const [printAuthFailed, setPrintAuthFailed] = useState(false);
  const printAttempted = useRef(false);

  useEffect(() => {
    if (loading || user || !printToken || printAttempted.current) return;
    printAttempted.current = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("report-print-auth", {
          body: { token: printToken },
        });
        const accessToken = (data as { access_token?: string } | null)?.access_token;
        const refreshToken = (data as { refresh_token?: string } | null)?.refresh_token;
        if (error || !accessToken || !refreshToken) {
          throw error || new Error("Print token exchange failed");
        }
        // setSession populates `user` via onAuthStateChange and re-renders.
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      } catch (e) {
        console.warn("Print-token exchange failed:", e);
        setPrintAuthFailed(true);
      }
    })();
  }, [loading, user, printToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-neutral-600">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  // While exchanging a print token (no user yet, not yet failed), show the
  // spinner instead of redirecting to /login.
  if (!user && printToken && !printAuthFailed) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-neutral-600">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Skip the profile-setup redirect on print-token sessions (the renderer
  // account has no display name and must render the report directly).
  const profileIncomplete = !user.user_metadata?.name;
  if (profileIncomplete && !printToken && location.pathname !== "/profile-setup") {
    console.log("User profile incomplete, redirecting to /profile-setup");
    return <Navigate to="/profile-setup" replace />;
  }

  return <>{children}</>;
}
