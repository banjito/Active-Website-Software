import { createClient } from '@supabase/supabase-js';
// Must be imported before createClient() runs: it snapshots the auth params in
// the URL before detectSessionInUrl strips them. See authUrlSnapshot.ts.
import './authUrlSnapshot';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Log environment variables (masked for security)
console.log('Supabase URL:', supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'Undefined');
console.log('Supabase Anon Key:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 10)}...` : 'Undefined');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase credentials are missing. Check your environment variables.');
  throw new Error('Supabase URL or Anon Key is missing from environment variables.');
}

// Initialize Supabase client with proper cookie/session handling
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true, // RE-ENABLED - Supabase handles token refresh automatically. AuthContext ignores TOKEN_REFRESHED events to prevent loops.
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'supabase.auth.token',
    flowType: 'pkce'
  }
});

console.log('Supabase client initialized, use direct schema selection in service calls');

/** localStorage key the Supabase client persists the session under. */
export const AUTH_STORAGE_KEY = 'supabase.auth.token';

/**
 * True when the browser itself says there is no network. `navigator.onLine` is
 * only trustworthy in the negative direction (false really does mean no
 * connection), which is the only direction we act on.
 */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * True when an auth call failed because the request never reached the auth
 * server: hotspot dropped, WiFi handed off, DNS failure, 522 from the edge.
 *
 * These are retryable. The stored refresh token is still perfectly good, so
 * nothing about the session may be thrown away in response to one — that is
 * what used to sign people out every time they lost signal. Only a server that
 * answers and *rejects* the refresh token means the session is really dead.
 */
export function isRetryableAuthError(error: any): boolean {
  if (!error) return false;
  if (isOffline()) return true;
  const message = (error?.message ?? String(error)).toLowerCase();
  const name = (error?.name ?? '').toLowerCase();
  const status = error?.status;
  return (
    name === 'authretryablefetcherror' ||
    status === 0 ||
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 522 ||
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    message.includes('network error') ||
    message.includes('networkerror') ||
    message.includes('err_failed') ||
    message.includes('err_internet_disconnected') ||
    message.includes('timeout') ||
    message.includes('cors') ||
    message.includes('access-control-allow-origin') ||
    message.includes('rate limit')
  );
}

/** The opposite: the auth server answered and refused the refresh token. */
export function isUnrecoverableAuthError(error: any): boolean {
  if (!error || isRetryableAuthError(error)) return false;
  const message = (error?.message ?? String(error)).toLowerCase();
  return (
    message.includes('invalid_grant') ||
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found') ||
    message.includes('refresh_token_not_found') ||
    message.includes('already used') ||
    message.includes('session_not_found') ||
    message.includes('session from session_id claim in jwt does not exist')
  );
}

export interface PersistedSession {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: any;
}

/**
 * Reads the session the Supabase client persisted, with no network call.
 *
 * This is how a user stays signed in while the device is offline. The tokens on
 * disk are the truth about who is signed in; `getSession()` can only report that
 * truth when it can *also* reach the server to trade an expired access token for
 * a fresh one, so offline it returns `session: null` for a session that is
 * perfectly recoverable the moment signal comes back.
 */
export function readPersistedSession(): PersistedSession | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // supabase-js v2 stores the session object directly; older builds nested it
    // under `currentSession`.
    const session = parsed?.currentSession ?? parsed;
    if (!session?.refresh_token) return null;
    if (!session.user) {
      // v2 with a separate user store keeps the user under `<key>-user`.
      try {
        const rawUser = localStorage.getItem(`${AUTH_STORAGE_KEY}-user`);
        const parsedUser = rawUser ? JSON.parse(rawUser) : null;
        if (parsedUser?.user) session.user = parsedUser.user;
      } catch {
        /* no separate user store */
      }
    }
    return session as PersistedSession;
  } catch (e) {
    console.warn('Could not read persisted Supabase session:', e);
    return null;
  }
}

/**
 * Clears persisted auth state. Only call this when the session is *known* dead
 * (the server rejected the refresh token) or the user asked to sign out. Never
 * on a network failure.
 */
export function clearPersistedAuth(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('supabase') || key.startsWith('sb-'))) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch (e) {
    console.warn('Failed to clear persisted auth:', e);
  }
}

// Helper function to identify cookie/session-related errors
export function isCookieAuthError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = typeof error.message === 'string' 
    ? error.message.toLowerCase() 
    : typeof error === 'string' 
      ? error.toLowerCase() 
      : JSON.stringify(error).toLowerCase();
  
  const cookieAuthPatterns = [
    'invalid_token',
    'jwt_expired',
    'session_not_found',
    'invalid_session',
    'token_expired',
    'refresh_token_not_found',
    'unauthorized',
    'invalid_grant',
    'cookie'
  ];
  
  return cookieAuthPatterns.some(pattern => 
    errorMessage.includes(pattern.toLowerCase())
  );
}

// Helper function to refresh session and clear stale cookies if needed
export async function ensureValidSession(): Promise<boolean> {
  try {
    // Offline: the stored tokens are still the user's session, they just can't
    // be exchanged right now. Report the session as usable so callers surface a
    // connection error rather than an auth failure.
    if (isOffline()) {
      return !!readPersistedSession();
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session) {
      if (isRetryableAuthError(sessionError)) {
        console.warn('Auth server unreachable; keeping stored session:', sessionError);
        return !!readPersistedSession();
      }

      console.warn('Session invalid, attempting refresh:', sessionError);
      const { error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError) {
        if (isRetryableAuthError(refreshError)) {
          console.warn('Refresh could not reach the server; keeping stored session:', refreshError);
          return !!readPersistedSession();
        }
        console.error('Failed to refresh session:', refreshError);
        // If refresh fails, try to get user to see if we can recover
        const { error: getUserError } = await supabase.auth.getUser();
        if (getUserError) {
          if (isRetryableAuthError(getUserError)) {
            return !!readPersistedSession();
          }
          console.error('Session completely invalid:', getUserError);
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Error ensuring valid session:', error);
    // A thrown fetch failure is a connection problem, not a dead session.
    if (isRetryableAuthError(error)) return !!readPersistedSession();
    return false;
  }
}

/**
 * Performs a "soft refresh" of the Supabase session: trades the stored refresh
 * token for a fresh access token without making the user sign out and back in.
 * Use this when queries start failing with auth errors.
 *
 * Returns true when the session was refreshed. A false return does NOT mean the
 * user must sign in again - it may simply mean the server was unreachable, in
 * which case the stored credentials are left untouched for the next attempt.
 */
export async function performSoftSessionRefresh(): Promise<boolean> {
  // Offline is not a reason to touch stored credentials. Bail out and let the
  // caller retry when the connection is back.
  if (isOffline()) {
    console.warn('🔃 performSoftSessionRefresh: device is offline - keeping stored session.');
    return false;
  }

  try {
    console.log('🔃 performSoftSessionRefresh: refreshing session...');

    // Refresh FIRST. The old version wiped every Supabase key out of storage
    // before refreshing, so a refresh that failed for a network reason left the
    // device with no credentials at all - a permanent sign-out caused by a
    // temporary WiFi drop. A successful refresh rewrites storage on its own.
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

    if (refreshError) {
      if (isUnrecoverableAuthError(refreshError)) {
        console.error('  ↳ refresh token was rejected - clearing auth:', refreshError);
        clearPersistedAuth();
        return false;
      }
      console.warn('  ↳ refresh failed but is retryable; tokens kept:', refreshError);
      return false;
    }

    if (!refreshData?.session) {
      console.warn('  ↳ performSoftSessionRefresh: no session returned; tokens kept');
      return false;
    }

    console.log('  ↳ performSoftSessionRefresh: session recovered successfully!');
    return true;
  } catch (err) {
    console.error('  ↳ performSoftSessionRefresh unexpected error:', err);
    return false;
  }
}

/**
 * Checks if an error is an authentication/authorization error that might be fixed by refreshing the session.
 */
export function isAuthError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = typeof error.message === 'string' 
    ? error.message.toLowerCase() 
    : typeof error === 'string' 
      ? error.toLowerCase() 
      : JSON.stringify(error).toLowerCase();
  
  const statusCode = error?.status || error?.code;
  
  // Check for common auth error status codes
  if (statusCode === 401 || statusCode === 403) {
    return true;
  }
  
  // Check for auth error patterns in the message
  const authErrorPatterns = [
    'jwt',
    'token',
    'expired',
    'invalid_grant',
    'unauthorized',
    'not authenticated',
    'auth',
    'session',
    'permission denied',
    'access denied'
  ];
  
  return authErrorPatterns.some(pattern => 
    errorMessage.includes(pattern.toLowerCase())
  );
}

// Helper function to identify connection-related errors
export function isConnectionError(error: any): boolean {
  if (!error) return false;
  
  // Check error message for common connection error patterns
  const connectionErrorPatterns = [
    'connection refused',
    'network error',
    'timeout',
    'socket hang up',
    'ECONNREFUSED',
    'fetch failed',
    'Failed to fetch',
    'could not connect to server',
    'Connection terminated unexpectedly',
    'the connection has been closed'
  ];
  
  // Convert error to string if it's not already a string
  const errorMessage = typeof error.message === 'string' 
    ? error.message.toLowerCase() 
    : typeof error === 'string' 
      ? error.toLowerCase() 
      : JSON.stringify(error).toLowerCase();
  
  // Check if any of the connection error patterns match
  return connectionErrorPatterns.some(pattern => 
    errorMessage.includes(pattern.toLowerCase())
  );
}

// Check if the error is related to a schema not existing
export function isSchemaError(error: any): boolean {
  if (!error) return false;
  
  // Convert error to string if it's not already a string
  const errorMessage = typeof error.message === 'string' 
    ? error.message.toLowerCase() 
    : typeof error === 'string' 
      ? error.toLowerCase() 
      : JSON.stringify(error).toLowerCase();
  
  // Check for schema-related error patterns
  const schemaErrorPatterns = [
    'schema',
    'relation',
    'does not exist',
    'undefined column',
    'unknown column',
    'no such table',
    'no schema has been selected',
    'invalid schema'
  ];
  
  return schemaErrorPatterns.some(pattern => 
    errorMessage.includes(pattern.toLowerCase())
  );
}

// Define the test function (keep it defined in case needed later)
async function testSupabaseConnection(client: any) {
  console.log('Attempting Supabase connection test...');
  try {
    // Let's test a simpler query that doesn't rely on auth.users
    // Fetching schemas might be a safer, less intrusive test
    const { data, error } = await client.rpc('get_schema_names'); 

    if (error) {
      console.error('Supabase connection test failed:', error.message);
      return false;
    }
    console.log('Supabase connection test successful. Schemas found:', data);
    return true;
  } catch (err) {
    console.error('Error during Supabase connection test:', err);
    return false;
  }
}

/**
 * Try to execute a query with a fallback schema if the primary schema fails
 * @param callback Function that executes the query
 * @param primarySchema The primary schema to try first
 * @param fallbackSchema The fallback schema to try if primary fails
 * @returns Result of the successful query or throws error if both attempts fail
 */
export async function tryWithFallbackSchema<T>(
  callback: (schema: string) => Promise<T>,
  primarySchema: string, 
  fallbackSchema: string = 'common'
): Promise<T> {
  try {
    // Try with the primary schema first
    return await callback(primarySchema);
  } catch (error) {
    console.log(`Error with primary schema "${primarySchema}":`, error);
    
    // If it's a schema-related error, try with the fallback schema
    if (isSchemaError(error)) {
      console.log(`Attempting with fallback schema "${fallbackSchema}"`);
      try {
        return await callback(fallbackSchema);
      } catch (fallbackError) {
        console.error(`Error with fallback schema "${fallbackSchema}":`, fallbackError);
        throw fallbackError;
      }
    } else {
      // If it's not a schema error, rethrow the original error
      throw error;
    }
  }
}