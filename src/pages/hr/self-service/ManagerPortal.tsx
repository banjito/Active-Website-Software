import React, { useState, useEffect, useCallback } from 'react';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Users, UserCircle, Mail, Briefcase, Loader2, ExternalLink, UserPlus } from 'lucide-react';
import { useAuth } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';
import { ProfileView } from '../../../components/profile/ProfileView';
import { toast } from '../../../components/ui/toast';

interface ReportProfile {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string;
  avatar_url: string | null;
}

function ReportCard({
  report,
  onOpenProfile,
  muted = false,
}: {
  report: ReportProfile;
  onOpenProfile: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      className={`group text-left rounded-xl border p-4 transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
        muted
          ? 'border-slate-200/80 dark:border-slate-700/70 bg-slate-50/50 dark:bg-slate-900/30 hover:border-slate-300 dark:hover:border-slate-600'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-600'
      }`}
      onClick={onOpenProfile}
    >
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex-shrink-0 flex items-center justify-center ring-2 ring-white dark:ring-slate-800 shadow-sm">
          {report.avatar_url ? (
            <img src={report.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xl font-semibold text-slate-600 dark:text-slate-300">
              {(report.full_name || '?')[0].toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 dark:text-white truncate group-hover:text-slate-700 dark:group-hover:text-slate-200">
            {report.full_name}
          </p>
          {report.job_title && (
            <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate mt-0.5">
              <Briefcase className="h-3.5 w-3.5 flex-shrink-0" />
              {report.job_title}
            </p>
          )}
          {report.email && (
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate mt-0.5">
              <Mail className="h-3.5 w-3.5 flex-shrink-0" />
              {report.email}
            </p>
          )}
          <span className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-slate-600 dark:text-slate-300 group-hover:text-slate-700 dark:group-hover:text-slate-200">
            <UserCircle className="h-4 w-4" />
            View profile
            <ExternalLink className="h-3.5 w-3.5 opacity-70" />
          </span>
        </div>
      </div>
    </button>
  );
}

export const ManagerPortal: React.FC = () => {
  const { user } = useAuth();
  const [directReports, setDirectReports] = useState<ReportProfile[]>([]);
  const [indirectReports, setIndirectReports] = useState<ReportProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileViewUserId, setProfileViewUserId] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      let { data: rows, error } = await supabase
        .schema('common')
        .from('org_chart_assignments')
        .select('profile_id, reports_to_profile_id');

      if (error) {
        const fallback = await supabase
          .from('org_chart_assignments')
          .select('profile_id, reports_to_profile_id');
        if (!fallback.error) {
          rows = fallback.data;
          error = null;
        }
      }
      if (error) throw error;
      const assignments = (rows || []) as { profile_id: string; reports_to_profile_id: string | null }[];
      const byManager = new Map<string, string[]>();
      for (const a of assignments) {
        if (!a.reports_to_profile_id) continue;
        const list = byManager.get(a.reports_to_profile_id) ?? [];
        list.push(a.profile_id);
        byManager.set(a.reports_to_profile_id, list);
      }

      // Direct = people who report directly to you (one level down)
      const directIds: string[] = byManager.get(user.id) ?? [];
      // Indirect = everyone else in your org tree (reports of your reports, etc.)
      const indirectIds: string[] = [];
      const queue = [...directIds];
      const seen = new Set<string>(directIds);
      while (queue.length) {
        const managerId = queue.shift()!;
        const reportsOf = byManager.get(managerId) ?? [];
        for (const id of reportsOf) {
          if (!seen.has(id)) {
            seen.add(id);
            indirectIds.push(id);
            queue.push(id);
          }
        }
      }

      const allIds = [...directIds, ...indirectIds];
      if (allIds.length === 0) {
        setDirectReports([]);
        setIndirectReports([]);
        return;
      }

      const { data: usersData } = await supabase.schema('common').rpc('admin_get_users');
      const allUsers: any[] = usersData || [];
      const { data: profilesData } = await supabase
        .schema('common')
        .from('profiles')
        .select('id, full_name, job_title, avatar_url, profile_image')
        .in('id', allIds);

      const profilesMap: Record<string, any> = {};
      (profilesData || []).forEach((p: any) => { profilesMap[p.id] = p; });

      const toProfile = (id: string): ReportProfile => {
        const u = allUsers.find((x: any) => x.id === id);
        const p = profilesMap[id];
        const email = u?.email ?? '';
        const full_name = p?.full_name || u?.raw_user_meta_data?.name || u?.user_metadata?.name || email?.split('@')[0] || 'Unknown';
        return { id, full_name, job_title: p?.job_title ?? null, email, avatar_url: p?.avatar_url || p?.profile_image || null };
      };

      const direct = directIds.map(toProfile).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
      const indirect = indirectIds.map(toProfile).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

      setDirectReports(direct);
      setIndirectReports(indirect);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to load reports', variant: 'destructive' });
      setDirectReports([]);
      setIndirectReports([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero header */}
      <div className="mb-8">
        <div className="rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/60 dark:to-slate-900/40 border border-slate-200/80 dark:border-slate-700/50 px-6 py-8 sm:px-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Manager Portal
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300 text-base max-w-xl">
            View and manage your team. Direct reports are people who report right to you; others in your org tree appear under them.
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Direct reports</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                  {directReports.length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  People who report right to you
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Users className="h-6 w-6 text-slate-600 dark:text-slate-300" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Under your org</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                  {indirectReports.length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Report to your direct reports
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Users className="h-6 w-6 text-slate-600 dark:text-slate-300" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Org chart</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">
                  Edit reporting in HR Data → Org Chart
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <UserPlus className="h-6 w-6 text-slate-600 dark:text-slate-300" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Direct reports section */}
      <Card className="border-slate-200 dark:border-slate-700/50 overflow-hidden">
        <CardHeader className="border-b border-slate-200 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-200/80 dark:bg-slate-700 flex items-center justify-center">
              <Users className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                Direct reports
              </CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400 mt-0.5">
                People who report right to you. Click a card to open their profile.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {directReports.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-10 text-center">
              <div className="mx-auto h-14 w-14 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center mb-4">
                <Users className="h-7 w-7 text-slate-500 dark:text-slate-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                No one reports to you yet
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                Reporting relationships are managed in the org chart. Add yourself as a manager and assign reports in HR Data → Org Chart.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {directReports.map((report) => (
                <ReportCard key={report.id} report={report} onOpenProfile={() => setProfileViewUserId(report.id)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Under your org (indirect reports) */}
      <Card className="border-slate-200 dark:border-slate-700/50 overflow-hidden mt-8">
        <CardHeader className="border-b border-slate-200 dark:border-slate-700/50 bg-slate-50/30 dark:bg-slate-800/20 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-200/60 dark:bg-slate-700 flex items-center justify-center">
              <Users className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                Under your org
              </CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400 mt-0.5">
                People who report to your direct reports (not directly to you). Click a card to open their profile.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {indirectReports.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-2">
              No one else in your org tree. Only direct reports are listed above.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {indirectReports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onOpenProfile={() => setProfileViewUserId(report.id)}
                  muted
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ProfileView
        isOpen={!!profileViewUserId}
        onClose={() => setProfileViewUserId(null)}
        userId={profileViewUserId ?? undefined}
      />
    </div>
  );
};
