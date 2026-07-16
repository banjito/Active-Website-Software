import React, { useState, useEffect, useCallback } from 'react';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { UserCircle, FileText, Calendar, ExternalLink, Loader2, Briefcase, Mail } from 'lucide-react';
import { useAuth } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';
import { fetchEmployeeDocuments } from '@/services/hr/employeeDocumentsService';
import { ProfileView } from '../../../components/profile/ProfileView';
import { toast } from '../../../components/ui/toast';

interface PtoRow {
  leave_type: string;
  from_date: string;
  to_date: string;
  allocated_leaves: number;
  used_leaves: number;
  balance_leaves: number;
}

interface DocRow {
  id: string;
  name: string;
  category: string;
  file_url: string;
  expiration_date?: string | null;
}

export const EmployeePortal: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<{ full_name?: string; job_title?: string; department?: string; email?: string } | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [pto, setPto] = useState<PtoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileViewOpen, setProfileViewOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [profileRes, docsRes, employeeRes, leaveTypesRes, allocationsRes] = await Promise.all([
        supabase.schema('common').from('profiles').select('full_name, job_title, department').eq('id', user.id).maybeSingle(),
        fetchEmployeeDocuments({ employeeId: user.id }).catch(() => []),
        supabase.schema('hr').from('employees').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.schema('hr').from('leave_types').select('id, name').then(({ data }) => data || []),
        (async () => {
          const { data: emp } = await supabase.schema('hr').from('employees').select('id').eq('user_id', user.id).maybeSingle();
          if (!emp?.id) return [];
          const { data } = await supabase
            .schema('hr')
            .from('leave_allocations')
            .select('leave_type_id, from_date, to_date, allocated_leaves, used_leaves, balance_leaves')
            .eq('employee_id', emp.id);
          return data || [];
        })(),
      ]);

      const profileData = profileRes.data as { full_name?: string; job_title?: string; department?: string } | null;
      const email = (user as any).email;
      setProfile(profileData ? { ...profileData, email } : { email });

      const docList = (docsRes as any[]).filter((d: any) => !d.archived).map((d: any) => ({
        id: d.id,
        name: d.name,
        category: d.category || 'general',
        file_url: d.file_url,
        expiration_date: d.expiration_date,
      }));
      setDocs(docList);

      const typeMap: Record<string, string> = {};
      (leaveTypesRes as { id: string; name: string }[]).forEach((t) => { typeMap[t.id] = t.name; });
      const allocs = allocationsRes as any[];
      setPto(allocs.map((a) => ({
        leave_type: typeMap[a.leave_type_id] ?? '—',
        from_date: a.from_date,
        to_date: a.to_date,
        allocated_leaves: Number(a.allocated_leaves ?? 0),
        used_leaves: Number(a.used_leaves ?? 0),
        balance_leaves: Number(a.balance_leaves ?? 0),
      })));
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to load data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString();
    } catch {
      return '—';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground dark:text-dark-foreground">Employee Portal</h1>
        <p className="text-sm text-muted-foreground dark:text-dark-500 mt-1">
          Your personal data, documents, and PTO at a glance.
        </p>
      </div>

      {/* Personal data */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Personal data</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={() => setProfileViewOpen(true)} rightIcon={<ExternalLink className="h-3.5 w-3.5" />}>
            View full profile
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{profile?.full_name ?? '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span>{profile?.email ?? '—'}</span>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <span><strong>Title:</strong> {profile?.job_title ?? '—'}</span>
            <span><strong>Department:</strong> {profile?.department ?? '—'}</span>
          </div>
        </CardContent>
      </Card>

      {/* My documents */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <CardTitle>My documents</CardTitle>
          </div>
          <CardDescription>Documents on file for you. Open full profile to view certifications and history.</CardDescription>
        </CardHeader>
        <CardContent>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents on file.</p>
          ) : (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <span>{d.name}</span>
                  <div className="flex items-center gap-2">
                    {d.expiration_date && (
                      <span className="text-muted-foreground">Expires: {formatDate(d.expiration_date)}</span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                    >
                      <a href={d.file_url} target="_blank" rel="noopener noreferrer">
                        Open
                      </a>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* PTO / Leave */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <CardTitle>PTO & leave</CardTitle>
          </div>
          <CardDescription>Your leave balances. Request time off through your manager or HR.</CardDescription>
        </CardHeader>
        <CardContent>
          {pto.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No leave allocations on file. Contact HR to set up your PTO balance.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-dark-200">
                    <th className="text-left py-2 font-medium">Leave type</th>
                    <th className="text-left py-2 font-medium">Period</th>
                    <th className="text-right py-2 font-medium">Allocated</th>
                    <th className="text-right py-2 font-medium">Used</th>
                    <th className="text-right py-2 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {pto.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 dark:border-dark-200/50">
                      <td className="py-2">{row.leave_type}</td>
                      <td className="py-2">{formatDate(row.from_date)} – {formatDate(row.to_date)}</td>
                      <td className="py-2 text-right">{row.allocated_leaves}</td>
                      <td className="py-2 text-right">{row.used_leaves}</td>
                      <td className="py-2 text-right font-medium">{row.balance_leaves}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ProfileView isOpen={profileViewOpen} onClose={() => setProfileViewOpen(false)} />
    </div>
  );
};
