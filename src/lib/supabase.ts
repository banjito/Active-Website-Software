import { createClient } from '@supabase/supabase-js';

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
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !sessionData?.session) {
      console.warn('Session invalid, attempting refresh:', sessionError);
      const { error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        console.error('Failed to refresh session:', refreshError);
        // If refresh fails, try to get user to see if we can recover
        const { error: getUserError } = await supabase.auth.getUser();
        if (getUserError) {
          console.error('Session completely invalid:', getUserError);
          return false;
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring valid session:', error);
    return false;
  }
}

/**
 * Performs a "soft refresh" of the Supabase session - clears stale auth cache and 
 * gets a fresh session. This mimics what happens during sign-out/sign-in without
 * requiring the user to actually sign out. Use this when queries start failing.
 * 
 * Returns true if session was successfully recovered, false if user needs to sign in again.
 */
export async function performSoftSessionRefresh(): Promise<boolean> {
  try {
    console.log('🔃 performSoftSessionRefresh: Clearing stale auth cache and refreshing session...');
    
    // Step 1: Clear stale Supabase auth data from storage
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('supabase') || key.includes('sb-'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        console.log(`  ↳ Clearing localStorage key: ${key}`);
        localStorage.removeItem(key);
      });
      
      const sessionKeysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes('supabase') || key.includes('sb-'))) {
          sessionKeysToRemove.push(key);
        }
      }
      sessionKeysToRemove.forEach(key => {
        console.log(`  ↳ Clearing sessionStorage key: ${key}`);
        sessionStorage.removeItem(key);
      });
    } catch (e) {
      console.warn('  ↳ Error clearing storage:', e);
    }

    // Step 2: Force Supabase to get a fresh session
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    
    if (refreshError) {
      console.error('  ↳ performSoftSessionRefresh failed:', refreshError);
      return false;
    }

    if (!refreshData?.session) {
      console.error('  ↳ performSoftSessionRefresh: No session returned');
      return false;
    }

    console.log('  ↳ performSoftSessionRefresh: Session recovered successfully!');
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