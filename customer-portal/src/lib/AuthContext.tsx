import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True once the user has been linked to a customer account (invite accepted). */
  isCustomer: boolean;
  customerId: string | null;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Update the user's own profile fields (stored in auth user_metadata). */
  updateProfile: (data: { full_name?: string; phone?: string }) => Promise<{ error: string | null }>;
  /** Change the sign-in email. Supabase sends a confirmation link to the new address. */
  updateEmail: (email: string) => Promise<{ error: string | null }>;
  /** Set a new password for the signed-in user. */
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  /** Re-fetch the session so freshly-updated app_metadata lands in the JWT. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readCustomer(user: User | null): { isCustomer: boolean; customerId: string | null } {
  const meta = (user?.app_metadata ?? {}) as Record<string, unknown>;
  const accountType = String(meta.account_type ?? '').toLowerCase();
  const customerId = (meta.customer_id as string | undefined) ?? null;
  return { isCustomer: accountType === 'customer' && Boolean(customerId), customerId };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const user = session?.user ?? null;
    const { isCustomer, customerId } = readCustomer(user);

    return {
      session,
      user,
      loading,
      isCustomer,
      customerId,
      async signInWithPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      async signInWithMagicLink(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/jobs` },
        });
        return { error: error?.message ?? null };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      async updateProfile(data) {
        const { data: res, error } = await supabase.auth.updateUser({ data });
        if (!error && res.user) {
          setSession((s) => (s ? { ...s, user: res.user } : s));
        }
        return { error: error?.message ?? null };
      },
      async updateEmail(email) {
        const { error } = await supabase.auth.updateUser({ email });
        return { error: error?.message ?? null };
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        return { error: error?.message ?? null };
      },
      async refresh() {
        const { data } = await supabase.auth.refreshSession();
        setSession(data.session);
      },
    };
  }, [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
