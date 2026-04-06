import React, { useState, useEffect, useCallback } from 'react';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Label } from '../../../components/ui/Label';
import { DollarSign, User, Loader2, Save } from 'lucide-react';
import { useAuth } from '../../../lib/AuthContext';
import { toast } from '../../../components/ui/toast';
import { supabase } from '../../../lib/supabase';

interface EmployeeOption {
  id: string;
  email: string;
  full_name: string;
  current_compensation_amount?: number | null;
  current_pay_type?: string | null;
  current_pay_frequency?: string | null;
}

interface CompensationHistoryEntry {
  id: string;
  profile_id: string;
  amount: number;
  pay_type: string;
  pay_frequency: string | null;
  effective_from: string;
  created_at: string;
}

const PAY_TYPES = [{ value: 'salary', label: 'Salary' }, { value: 'hourly', label: 'Hourly' }];
const PAY_FREQUENCIES = [
  { value: 'annual', label: 'Annual' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'weekly', label: 'Weekly' },
];

function formatCompensation(amount: number | null | undefined, payType: string | null | undefined, payFreq: string | null | undefined): string {
  if (amount == null) return '—';
  const type = payType || 'salary';
  if (type === 'hourly') return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}/hr`;
  const freq = payFreq || 'annual';
  const freqLabel = PAY_FREQUENCIES.find((f) => f.value === freq)?.label || freq;
  return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${freqLabel}`;
}

const HR_ADMIN_ROLES = ['Admin', 'Super Admin', 'HR', 'HR Rep'];

export const CompensationHistory: React.FC = () => {
  const { user } = useAuth();
  const role = (user?.user_metadata?.role as string) || '';
  const canEditCompensation = HR_ADMIN_ROLES.includes(role);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [payTypeInput, setPayTypeInput] = useState<string>('salary');
  const [payFreqInput, setPayFreqInput] = useState<string>('annual');
  const [history, setHistory] = useState<CompensationHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchEmployees = useCallback(async () => {
    try {
      setLoadingEmployees(true);
      const { data: usersData, error: usersErr } = await supabase.schema('common').rpc('admin_get_users');
      const allUsers: any[] = usersErr ? (await supabase.rpc('admin_get_users')).data || [] : usersData || [];
      if (!allUsers?.length) {
        setEmployees([]);
        return;
      }

      const { data: profilesData } = await supabase
        .schema('common')
        .from('profiles')
        .select('id, full_name, current_compensation_amount, current_pay_type, current_pay_frequency');

      const profilesMap: Record<string, any> = {};
      (profilesData || []).forEach((p: any) => { profilesMap[p.id] = p; });

      const list = allUsers
        .filter((u: any) => (u.email || '').toLowerCase().endsWith('@ampqes.com'))
        .map((u: any) => {
          const profile = profilesMap[u.id];
          const name = profile?.full_name || u.raw_user_meta_data?.name || u.user_metadata?.name || u.email?.split('@')[0] || 'Unknown';
          return {
            id: u.id,
            email: u.email || '',
            full_name: name,
            current_compensation_amount: profile?.current_compensation_amount ?? null,
            current_pay_type: profile?.current_pay_type ?? null,
            current_pay_frequency: profile?.current_pay_frequency ?? null,
          };
        })
        .sort((a: EmployeeOption, b: EmployeeOption) =>
          (a.full_name || a.email).toLowerCase().localeCompare((b.full_name || b.email).toLowerCase())
        );

      setEmployees(list);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to load employees', variant: 'destructive' });
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const fetchHistory = useCallback(async (profileId: string) => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .schema('common')
        .from('compensation_history')
        .select('id, profile_id, amount, pay_type, pay_frequency, effective_from, created_at')
        .eq('profile_id', profileId)
        .order('effective_from', { ascending: false });
      if (error) throw error;
      setHistory((data as CompensationHistoryEntry[]) || []);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to load compensation history', variant: 'destructive' });
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedEmployee) {
      setAmountInput('');
      setHistory([]);
      return;
    }
    const amt = selectedEmployee.current_compensation_amount;
    setAmountInput(amt != null ? String(amt) : '');
    setPayTypeInput(selectedEmployee.current_pay_type || 'salary');
    setPayFreqInput(selectedEmployee.current_pay_frequency || 'annual');
    fetchHistory(selectedEmployee.id);
  }, [selectedEmployee, fetchHistory]);

  const handleUpdateCompensation = async () => {
    if (!selectedEmployee || !user) return;
    if (!canEditCompensation) {
      toast({ title: 'Access denied', description: 'Only HR or Admin can change pay history.', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(amountInput?.replace(/,/g, '') || '');
    if (isNaN(amount) || amount < 0) {
      toast({ title: 'Invalid amount', description: 'Enter a valid number.', variant: 'destructive' });
      return;
    }
    const payType = payTypeInput || 'salary';
    const payFreq = payType === 'hourly' ? null : (payFreqInput || 'annual');

    setSaving(true);
    try {
      const { error: insertError } = await supabase
        .schema('common')
        .from('compensation_history')
        .insert({
          profile_id: selectedEmployee.id,
          amount,
          pay_type: payType,
          pay_frequency: payFreq,
          effective_from: new Date().toISOString(),
          created_by: user.id,
        });
      if (insertError) throw new Error(`History: ${insertError.message}`);

      const { error: updateError } = await supabase
        .schema('common')
        .from('profiles')
        .update({
          current_compensation_amount: amount,
          current_pay_type: payType,
          current_pay_frequency: payFreq,
        })
        .eq('id', selectedEmployee.id);
      if (updateError) throw new Error(`Profile: ${updateError.message}`);

      toast({ title: 'Success', description: 'Compensation updated and history recorded.', variant: 'success' });
      setSelectedEmployee({
        ...selectedEmployee,
        current_compensation_amount: amount,
        current_pay_type: payType,
        current_pay_frequency: payFreq,
      });
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === selectedEmployee.id
            ? { ...e, current_compensation_amount: amount, current_pay_type: payType, current_pay_frequency: payFreq }
            : e
        )
      );
      fetchHistory(selectedEmployee.id);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to update compensation', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <DollarSign className="h-8 w-8" />
          Compensation History
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Track compensation per employee. Updates are recorded in history and reflected on the employee profile.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Select employee
          </CardTitle>
          <CardDescription>Choose an employee to view or update their compensation and history.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingEmployees ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading employees…
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="employee-select">Employee</Label>
              <select
                id="employee-select"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:border-dark-300"
                value={selectedEmployee?.id ?? ''}
                onChange={(e) => setSelectedEmployee(employees.find((emp) => emp.id === e.target.value) || null)}
              >
                <option value="">— Select employee —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name || emp.email} {emp.current_compensation_amount != null ? `(${formatCompensation(emp.current_compensation_amount, emp.current_pay_type, emp.current_pay_frequency)})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedEmployee && (
            <div className="pt-4 border-t space-y-4">
              {!canEditCompensation ? (
                <p className="text-sm text-muted-foreground">
                  Only HR or Admin roles can change pay history. You can view compensation and history below.
                </p>
              ) : (
                <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder={payTypeInput === 'hourly' ? 'e.g. 45.00' : 'e.g. 85000'}
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pay type</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-dark-300"
                    value={payTypeInput}
                    onChange={(e) => setPayTypeInput(e.target.value)}
                  >
                    {PAY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                {payTypeInput === 'salary' && (
                  <div className="space-y-2">
                    <Label>Frequency</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-dark-300"
                      value={payFreqInput}
                      onChange={(e) => setPayFreqInput(e.target.value)}
                    >
                      {PAY_FREQUENCIES.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleUpdateCompensation} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" />Update compensation</>}
                </Button>
                {selectedEmployee.current_compensation_amount != null && (
                  <span className="text-sm text-muted-foreground">
                    Current: {formatCompensation(selectedEmployee.current_compensation_amount, selectedEmployee.current_pay_type, selectedEmployee.current_pay_frequency)}
                  </span>
                )}
              </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedEmployee && (
        <Card>
          <CardHeader>
            <CardTitle>Compensation history</CardTitle>
            <CardDescription>
              Previous compensation for {selectedEmployee.full_name || selectedEmployee.email}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading history…
              </div>
            ) : history.length === 0 ? (
              <p className="text-muted-foreground py-4">
                No compensation history yet. Update compensation above to create the first record.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-dark-300">
                      <th className="text-left py-3 px-2 font-medium">Amount</th>
                      <th className="text-left py-3 px-2 font-medium">Type</th>
                      <th className="text-left py-3 px-2 font-medium">Effective from</th>
                      <th className="text-left py-3 px-2 font-medium">Recorded at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <tr key={entry.id} className="border-b border-gray-100 dark:border-dark-200">
                        <td className="py-2 px-2">{formatCompensation(entry.amount, entry.pay_type, entry.pay_frequency)}</td>
                        <td className="py-2 px-2 capitalize">{entry.pay_type}</td>
                        <td className="py-2 px-2 text-muted-foreground">{formatDate(entry.effective_from)}</td>
                        <td className="py-2 px-2 text-muted-foreground">{formatDate(entry.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
