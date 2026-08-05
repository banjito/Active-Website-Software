import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Add TypeScript declaration for import.meta.env (used by Vite)
declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface ImportMetaEnv {
    [key: string]: string | boolean | undefined;
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
  }
}

/**
 * Merges Tailwind CSS classes together
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a UUID string to be properly used in SQL queries
 * @param uuid The UUID string to format
 * @returns Properly quoted UUID string for SQL
 */
export function formatUUID(uuid: string): string {
  // Remove any existing quotes just to be safe
  const cleanUuid = uuid.replace(/['"]/g, '');
  
  // Return the UUID with proper SQL single quotes
  return `'${cleanUuid}'`;
} 
