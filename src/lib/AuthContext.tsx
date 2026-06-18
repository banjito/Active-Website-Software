import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Navigate, useLocation } from "react-router-dom";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
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
    const match = lower.match(/^([a-z]+)\.([a-z]+)@ampqes\.com$/i);
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
   * softRefresh - Mimics what happens during sign-out/sign-in without requiring the user to sign out.
   * This clears stale auth cache and forces a fresh session, which fixes "opportunities not loading" issues.
   * Returns true if the refresh was successful, false otherwise.
   */
  const softRefresh = async (): Promise<boolean> => {
    try {
      console.log(
        "🔃 softRefresh: Starting session recovery (like sign-out/sign-in but without signing out)...",
      );

      // Step 1: Clear stale Supabase auth data from storage (mimics what signOut does)
      try {
        // Clear only Supabase-related storage keys, not everything
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes("supabase") || key.includes("sb-"))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => {
          console.log(`  ↳ Clearing localStorage key: ${key}`);
          localStorage.removeItem(key);
        });

        // Also clear sessionStorage auth data
        const sessionKeysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && (key.includes("supabase") || key.includes("sb-"))) {
            sessionKeysToRemove.push(key);
          }
        }
        sessionKeysToRemove.forEach((key) => {
          console.log(`  ↳ Clearing sessionStorage key: ${key}`);
          sessionStorage.removeItem(key);
        });
      } catch (e) {
        console.warn("  ↳ Error clearing storage:", e);
      }

      // Step 2: Force Supabase to get a completely fresh session
      console.log("  ↳ Forcing fresh session from Supabase...");
      const { data: refreshData, error: refreshError } =
        await supabase.auth.refreshSession();

      if (refreshError) {
        console.error("  ↳ softRefresh refreshSession error:", refreshError);
        // If refresh fails, the user likely needs to actually sign in again
        return false;
      }

      if (!refreshData?.session) {
        console.error("  ↳ softRefresh: No session returned");
        return false;
      }

      // Step 3: Update the user state with the fresh session
      console.log("  ↳ softRefresh: Session recovered successfully!");
      setUser(refreshData.session.user ?? null);
      lastRefreshTime.current = Date.now();

      return true;
    } catch (err) {
      console.error("  ↳ softRefresh unexpected error:", err);
      return false;
    }
  };

  // Helper: detect network/CORS/522 errors — don't clear tokens, treat as "try again later"
  const isNetworkOrCorsError = (err: any): boolean => {
    if (!err) return false;
    const msg = (err?.message ?? String(err)).toLowerCase();
    const name = (err?.name ?? "").toLowerCase();
    const status = (err as any)?.status;
    return (
      msg.includes("failed to fetch") ||
      msg.includes("cors") ||
      msg.includes("access-control-allow-origin") ||
      msg.includes("network error") ||
      msg.includes("err_failed") ||
      name.includes("authretryablefetcherror") ||
      name.includes("fetcherror") ||
      status === 522 ||
      status === 0
    );
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
        const isUnrecoverableAuthError =
          !isRateLimitError &&
          !isNetworkError &&
          (errorMessage.includes("invalid_grant") ||
            errorMessage.includes("invalid refresh token") ||
            errorMessage.includes("refresh token is invalid"));

        if (isRateLimitError) {
          console.warn(
            "Rate limit hit - waiting before retry. Do NOT clear tokens.",
          );
          setUser(null);
        } else if (isNetworkError) {
          console.warn(
            "Auth server unreachable (CORS/522/network). Showing login; tokens kept for retry.",
          );
          setUser(null);
        } else if (isUnrecoverableAuthError) {
          console.error(
            "Unrecoverable auth error detected - clearing stored auth",
          );
          try {
            localStorage.removeItem("supabase.auth.token");
            Object.keys(localStorage)
              .filter((k) => k.includes("sb-"))
              .forEach((k) => localStorage.removeItem(k));
          } catch (e) {
            console.warn("Failed to clear localStorage:", e);
          }
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
        const isUnrecoverableAuthError =
          !isRateLimitError &&
          !isNetworkError &&
          (errorMessage.includes("invalid_grant") ||
            errorMessage.includes("invalid refresh token") ||
            errorMessage.includes("refresh token is invalid"));

        if (isTimeout) {
          console.warn(
            "Auth session timed out (Supabase may be slow or unreachable). Showing login.",
          );
          setUser(null);
        } else if (isRateLimitError) {
          console.warn(
            "Rate limit hit during session init - waiting before retry",
          );
          setUser(null);
        } else if (isNetworkError) {
          console.warn(
            "Auth server unreachable. Showing login; tokens kept for retry.",
          );
          setUser(null);
        } else if (isUnrecoverableAuthError) {
          try {
            localStorage.removeItem("supabase.auth.token");
            Object.keys(localStorage)
              .filter((k) => k.includes("sb-"))
              .forEach((k) => localStorage.removeItem(k));
          } catch (e) {
            console.warn("Failed to clear localStorage:", e);
          }
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
      if (event === "SIGNED_OUT" && user) {
        console.error(
          "⚠️ SIGNED_OUT received while user exists - investigating...",
        );
        // Don't immediately sign out - check if we actually have a valid session
        supabase.auth.getSession().then(({ data, error }) => {
          if (error || !data.session) {
            console.log("  ↳ Confirmed no valid session, signing out");
            setUser(null);
          } else {
            console.log("  ↳ Session still valid, ignoring SIGNED_OUT event");
          }
        });
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
    // This mimics what happens during sign-out/sign-in, automatically recovering stale sessions
    let lastVisibilityCheck = Date.now();
    const VISIBILITY_CHECK_COOLDOWN_MS = 30000; // 30 seconds minimum between checks

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

      // Check if session is actually valid by trying to get user
      try {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError || !sessionData?.session) {
          console.log("  ↳ Session appears stale, triggering softRefresh...");
          // Session is invalid - trigger soft refresh (like sign-out/sign-in)
          const success = await softRefresh();
          if (!success) {
            console.warn(
              "  ↳ softRefresh failed - user may need to sign in again",
            );
          }
        } else {
          // Session exists, but let's verify the token is actually working
          const { error: userError } = await supabase.auth.getUser();
          if (userError) {
            console.log(
              "  ↳ getUser failed despite session existing, triggering softRefresh...",
            );
            await softRefresh();
          } else {
            console.log("  ↳ Session is healthy, no action needed");
          }
        }
      } catch (err) {
        console.warn("  ↳ Session health check error:", err);
        // On error, try soft refresh just to be safe
        await softRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (roleChangeChannel) {
        supabase.removeChannel(roleChangeChannel);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
        <div className="text-lg text-zinc-600">
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-zinc-600">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const profileIncomplete = !user.user_metadata?.name;
  if (profileIncomplete && location.pathname !== "/profile-setup") {
    console.log("User profile incomplete, redirecting to /profile-setup");
    return <Navigate to="/profile-setup" replace />;
  }

  return <>{children}</>;
}
