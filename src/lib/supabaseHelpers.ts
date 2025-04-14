import { SupabaseClient } from '@supabase/supabase-js'
import { getTable } from './schema'

// Extended Supabase client with schema support
export function schemaFrom(supabase: SupabaseClient, tableName: string) {
  // Use the schema mapping to get the correct schema-qualified table name
  const schemaQualifiedTable = getTable(tableName)
  
  // Return the query builder with the correct table name
  return supabase.from(schemaQualifiedTable)
}

// Helper for migrations - this wraps supabase.from() to automatically use the correct schema
// Make the function generic to accept any schema type (must be string)
export function wrapSupabaseClient<SchemaName extends string = 'public'>(
  supabase: SupabaseClient<any, SchemaName>
): SupabaseClient<any, SchemaName> {
  const originalFrom = supabase.from.bind(supabase)
  
  // Override the from method to use schema mapping
  supabase.from = (tableName: string) => {
    return originalFrom(getTable(tableName))
  }
  
  return supabase
} 