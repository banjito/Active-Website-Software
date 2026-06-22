import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

type State = 'working' | 'need-auth' | 'done' | 'error';

/**
 * Landing page for the invite email link. The Supabase invite sets a session
 * (detectSessionInUrl), then we call the existing `customer-portal-accept-invite`
 * edge function to create the customer_users link + stamp app_metadata, then
 * refresh the session so the new claims land in the JWT.
 */
export function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<State>('working');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (loading || ran.current) return;
    if (!token) {
      setState('error');
      setMessage('This invite link is missing its token.');
      return;
    }
    if (!user) {
      // Session hasn't materialized from the email link yet.
      setState('need-auth');
      return;
    }

    ran.current = true;
    (async () => {
      const { data, error } = await supabase.functions.invoke('customer-portal-accept-invite', {
        body: { token },
      });
      if (error || (data as { error?: string })?.error) {
        setState('error');
        setMessage((data as { error?: string })?.error ?? error?.message ?? 'Could not accept this invite.');
        return;
      }
      await refresh();
      setState('done');
      setTimeout(() => navigate('/jobs', { replace: true }), 1200);
    })();
  }, [loading, user, token, refresh, navigate]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <Card className="w-full max-w-sm animate-scale-in shadow-lift">
        <CardHeader>
          <CardTitle>Accepting your invite</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'working' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Linking your account…
            </div>
          )}
          {state === 'need-auth' && (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Open this page from the link in your invite email so we can verify it's you.</p>
              <Button variant="outline" onClick={() => navigate('/login')}>
                Go to sign in
              </Button>
            </div>
          )}
          {state === 'done' && <p className="text-sm text-foreground">You're all set — taking you to your jobs…</p>}
          {state === 'error' && <p className="text-sm text-destructive">{message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
