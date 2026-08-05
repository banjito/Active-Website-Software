/**
 * Snapshot of the auth parameters present in the URL when the page first loaded.
 *
 * The Supabase client runs with `detectSessionInUrl: true`, which means it reads
 * `?code=` / `#access_token=` out of the URL and then rewrites the address bar
 * (history.replaceState) to strip them. That happens during client
 * initialization, so by the time the /auth/callback component mounts the
 * parameters can already be gone - which used to look identical to "no valid
 * authentication parameters found" and produced a bogus "Verification Failed".
 *
 * This module is imported by lib/supabase.ts *above* the createClient() call, so
 * the snapshot is always taken before the client can clean anything up.
 */

export interface AuthUrlParams {
  /** PKCE authorization code (?code=...) */
  code: string | null;
  /** One-time token for verifyOtp (?token_hash=... or the legacy ?token=...) */
  tokenHash: string | null;
  /** Implicit-flow tokens (#access_token=...&refresh_token=...) */
  accessToken: string | null;
  refreshToken: string | null;
  /** Link type: signup | recovery | invite | magiclink | email | email_change */
  type: string | null;
  /** Failure reported by Supabase itself, e.g. otp_expired / access_denied */
  errorCode: string | null;
  errorDescription: string | null;
}

const EMPTY: AuthUrlParams = {
  code: null,
  tokenHash: null,
  accessToken: null,
  refreshToken: null,
  type: null,
  errorCode: null,
  errorDescription: null,
};

function parse(search: string, hash: string): AuthUrlParams {
  const query = new URLSearchParams(search.replace(/^\?/, ""));
  // Supabase puts implicit-flow tokens and implicit-flow errors in the fragment.
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));

  // Query first, fragment second - a value is only ever in one of them.
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = query.get(key) ?? fragment.get(key);
      if (value) return value;
    }
    return null;
  };

  return {
    code: pick("code"),
    tokenHash: pick("token_hash", "token"),
    accessToken: pick("access_token"),
    refreshToken: pick("refresh_token"),
    type: pick("type"),
    errorCode: pick("error_code", "error"),
    errorDescription: pick("error_description"),
  };
}

function hasAny(params: AuthUrlParams): boolean {
  return Object.values(params).some((value) => value !== null);
}

const snapshot: AuthUrlParams =
  typeof window === "undefined"
    ? EMPTY
    : parse(window.location.search, window.location.hash);

const snapshotPath =
  typeof window === "undefined" ? null : window.location.pathname;

/**
 * Auth parameters for the current page, reading the live URL first and falling
 * back to the load-time snapshot for anything the Supabase client has since
 * stripped. The snapshot is only trusted on the path it was captured on, so a
 * client-side navigation can't resurrect stale tokens.
 */
export function readAuthUrlParams(): AuthUrlParams {
  if (typeof window === "undefined") return EMPTY;

  const live = parse(window.location.search, window.location.hash);
  if (hasAny(live)) return live;
  if (snapshotPath !== null && snapshotPath !== window.location.pathname) {
    return EMPTY;
  }
  return snapshot;
}
