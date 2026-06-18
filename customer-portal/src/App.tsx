import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { FullPageSpinner } from '@/components/ui/spinner';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Login } from '@/pages/Login';
import { AcceptInvite } from '@/pages/AcceptInvite';
import { Jobs } from '@/pages/Jobs';
import { JobDetail } from '@/pages/JobDetail';
import { Reports } from '@/pages/Reports';

/** Requires a signed-in user who has been linked to a customer account. */
function RequireCustomer({ children }: { children: React.ReactNode }) {
  const { user, loading, isCustomer, signOut } = useAuth();

  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;

  if (!isCustomer) {
    // Authenticated, but not (yet) a customer — e.g. a staff login, or an
    // invite that hasn't been accepted. Don't leak the portal UI.
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>No customer access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              This account isn't linked to a customer organization. If you received an invite, open the link in that
              email to finish setup.
            </p>
            <Button variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route
        path="/jobs"
        element={
          <RequireCustomer>
            <Jobs />
          </RequireCustomer>
        }
      />
      <Route
        path="/jobs/:jobId"
        element={
          <RequireCustomer>
            <JobDetail />
          </RequireCustomer>
        }
      />
      <Route
        path="/reports"
        element={
          <RequireCustomer>
            <Reports />
          </RequireCustomer>
        }
      />
      <Route path="*" element={<Navigate to="/jobs" replace />} />
    </Routes>
  );
}
