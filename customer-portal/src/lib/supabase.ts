import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in the same values the staff app uses.',
  );
}

// Same Supabase project as the staff app. Tenant isolation is enforced by
// Postgres RLS (common.current_customer_id()), so this client only ever needs
// the public anon key — every query is automatically scoped to the signed-in
// customer's own approved/sent records.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    // Distinct storage key so a logged-in staff session in the same browser
    // never collides with a customer session.
    storageKey: 'ampos.customer-portal.auth',
    flowType: 'pkce',
  },
});
