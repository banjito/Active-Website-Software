import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Navigate, useLocation } from 'react-router-dom';

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const signOut = async () => {
    try {
      setUser(null);
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Supabase sign out error:', error);
        setError(error);
      }
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        console.error('Error clearing storage:', e);
      }
    } catch (err) {
      console.error('Error in signOut:', err);
      setUser(null);
      setError(err instanceof Error ? err : new Error('Sign out failed'));
    }
  };

  const refreshUser = async () => {
    try {
      // Force a session refresh to pull updated JWT claims (e.g., updated role)
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('Error refreshing session:', refreshError);
      }

      // Fallback to getUser if refresh didn't return a session
      if (!refreshData?.session) {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          console.error('Error fetching user after refresh attempt:', error);
          return;
        }
        setUser(data.user ?? null);
        return;
      }

      setUser(refreshData.session.user ?? null);
    } catch (err) {
      console.error('Unexpected error refreshing user/session:', err);
    }
  };

  useEffect(() => {
    let mounted = true;
    let roleChangeChannel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) {
        console.error("Initial session check failed:", sessionError);
        setError(sessionError);
      } else {
        setUser(session?.user ?? null);
      }
      setLoading(false);
      // Ensure latest role/user claims are loaded on initial mount without requiring re-login
      if (session?.user) {
        void refreshUser();
      }
    }).catch(err => {
      if (mounted) {
        console.error("Initial session promise error:", err);
        setError(err);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) {
        console.log('onAuthStateChange event:', event, 'session:', !!session);
        setUser(session?.user ?? null);
        setLoading(false);
        setError(null);
      }
    });

    // Subscribe to role change logs to auto-refresh current user's permissions
    (async () => {
      // Wait until initial user is set
      const current = (await supabase.auth.getUser()).data.user;
      if (current) {
        roleChangeChannel = supabase
          .channel('role-changes')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'common',
              table: 'role_change_logs',
              filter: `user_id=eq.${current.id}`,
            },
            async () => {
              // When a role change is detected for this user, refresh the user object
              await refreshUser();
            }
          )
          .subscribe();
      }
    })();

    // Refresh on window focus/visibility to pick up any role changes made while tab was inactive
    const handleFocus = () => {
      try {
        const suspend = localStorage.getItem('AMP_SUSPEND_REFRESH');
        if (suspend === 'true') return;
      } catch {}
      if (mounted) {
        void refreshUser();
      }
    };
    const handleVisibility = () => {
      try {
        const suspend = localStorage.getItem('AMP_SUSPEND_REFRESH');
        if (suspend === 'true') return;
      } catch {}
      if (mounted && document.visibilityState === 'visible') {
        void refreshUser();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (roleChangeChannel) {
        supabase.removeChannel(roleChangeChannel);
      }
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  if (error) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="text-red-600">Authentication Error: {error.message}</div>
    </div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg text-gray-600">Loading...</div>
    </div>;
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const profileIncomplete = !user.user_metadata?.name;
  if (profileIncomplete && location.pathname !== '/profile-setup') {
    console.log("User profile incomplete, redirecting to /profile-setup");
    return <Navigate to="/profile-setup" replace />;
  }

  return <>{children}</>;
}