import { createClient } from '@supabase/supabase-js';
import { wrapSupabaseClient } from './supabaseHelpers';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Log environment variables (masked for security)
console.log('Supabase URL:', supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'Undefined');
console.log('Supabase Anon Key:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 10)}...` : 'Undefined');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase credentials are missing. Check your environment variables.');
  throw new Error('Supabase URL or Anon Key is missing from environment variables.');
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

// Helper function to identify connection-related errors
export function isConnectionError(error: any): boolean {
  console.log('Checking for database connection error:', error);
  
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
  const isConnection = connectionErrorPatterns.some(pattern => 
    errorMessage.includes(pattern.toLowerCase())
  );
  
  if (isConnection) {
    console.warn('Database connection error detected:', error);
  }
  
  return isConnection;
}

/**
 * Check if the error is related to a schema not existing
 * @param error Any error object
 * @returns boolean indicating if it's a schema error
 */
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
  
  const isSchema = schemaErrorPatterns.some(pattern => 
    errorMessage.includes(pattern.toLowerCase())
  );
  
  if (isSchema) {
    console.warn('Database schema error detected:', error);
  }
  
  return isSchema;
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

// Initialize Supabase client (WITH default schema common) and wrap it
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'common' } // Explicitly set the default schema for the client
});
// Wrap the client to use schema mapping (for .from() calls)
export const supabase = wrapSupabaseClient(supabaseClient);

console.log('Supabase client initialized with schema mapping, default schema set to common.');