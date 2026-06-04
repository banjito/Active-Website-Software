import React, { useState, useEffect } from 'react';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Label } from '../../../components/ui/Label';
import { DollarSign, Loader2, Save } from 'lucide-react';
import { useAuth } from '../../../lib/AuthContext';
import { toast } from '../../../components/ui/toast';
import { supabase } from '../../../lib/supabase';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const HR_ADMIN_ROLES = ['Admin', 'Super Admin', 'HR', 'HR Rep'];
const PAY_TYPES = [{ value: 'salary', label: 'Salary' }, { value: 'hourly', label: 'Hourly' }];
const PAY_FREQUENCY_OPTIONS = [
  { value: 'annual', label: 'Annual' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'weekly', label: 'Weekly' },
];

interface CompensationViewProps {
  profileId: string;
  employeeName: string;
}

const PAY_FREQUENCIES: Record<string, string> = {
  annual: 'Annual',
  monthly: 'Monthly',
  biweekly: 'Biweekly',
  weekly: 'Weekly',
};

function formatCompensation(
  amount: number | null | undefined,
  payType: string | null | undefined,
  payFreq: string | null | undefined
): string {
  if (amount == null) return '—';
  const type = payType || 'salary';
  if (type === 'hourly') return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}/hr`;
  const freq = payFreq || 'annual';
  const freqLabel = PAY_FREQUENCIES[freq] || freq;
  return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${freqLabel}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

interface CompEntry {
  id: string;
  amount: number;
  pay_type: string;
  pay_frequency: string | null;
  effective_from: string;
  created_at: string;
}

export const CompensationView: React.FC<CompensationViewProps> = ({ profileId, employeeName }) => {
  const { user } = useAuth();
  const role = (user?.user_metadata?.role as string) || '';
  const canEdit = HR_ADMIN_ROLES.includes(role);
  const [current, setCurrent] = useState<{
    current_compensation_amount: number | null;
    current_pay_type: string | null;
    current_pay_frequency: string | null;
  } | null>(null);
  const [history, setHistory] = useState<CompEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [payTypeInput, setPayTypeInput] = useState<string>('salary');
  const [payFreqInput, setPayFreqInput] = useState<string>('annual');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: profileData } = await supabase
        .schema('common')
        .from('profiles')
        .select('current_compensation_amount, current_pay_type, current_pay_frequency')
        .eq('id', profileId)
        .single();
      setCurrent(
        profileData
          ? {
              current_compensation_amount: profileData.current_compensation_amount ?? null,
              current_pay_type: profileData.current_pay_type ?? null,
              current_pay_frequency: profileData.current_pay_frequency ?? null,
            }
          : null
      );
      const amt = profileData?.current_compensation_amount;
      setAmountInput(amt != null ? String(amt) : '');
      setPayTypeInput(profileData?.current_pay_type || 'salary');
      setPayFreqInput(profileData?.current_pay_frequency || 'annual');

      const { data: historyData } = await supabase
        .schema('common')
        .from('compensation_history')
        .select('id, amount, pay_type, pay_frequency, effective_from, created_at')
        .eq('profile_id', profileId)
        .order('effective_from', { ascending: false });
      setHistory((historyData as CompEntry[]) || []);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [profileId]);

  const handleUpdateCompensation = async () => {
    if (!user) return;
    if (!canEdit) {
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
          profile_id: profileId,
          amount,
          pay_type: payType,
          pay_frequency: payFreq,
          effective_from: new Date().toISOString(),
          created_by: user.id,
        });
      if (insertError) throw new Error(insertError.message);

      const { error: updateError } = await supabase
        .schema('common')
        .from('profiles')
        .update({
          current_compensation_amount: amount,
          current_pay_type: payType,
          current_pay_frequency: payFreq,
        })
        .eq('id', profileId);
      if (updateError) throw new Error(updateError.message);

      toast({ title: 'Success', description: 'Compensation updated and history recorded.', variant: 'success' });
      fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to update compensation', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="h-5 w-5 animate-spin" />
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Current compensation
          </CardTitle>
          <CardDescription>Compensation on file for {employeeName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {current?.current_compensation_amount != null ? (
            <p className="text-lg text-gray-900 dark:text-white">
              {formatCompensation(
                current.current_compensation_amount,
                current.current_pay_type,
                current.current_pay_frequency
              )}
            </p>
          ) : (
            <p className="text-muted-foreground">No compensation on file.</p>
          )}
          {canEdit && (
            <div className="pt-4 border-t border-gray-200 dark:border-dark-200 space-y-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Update compensation</p>
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
                      {PAY_FREQUENCY_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <Button onClick={handleUpdateCompensation} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" />Update compensation</>}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compensation history</CardTitle>
          <CardDescription>Previous compensation records for {employeeName}</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground py-4">No compensation history.</p>
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
                      <td className="py-2 px-2">
                        {formatCompensation(entry.amount, entry.pay_type, entry.pay_frequency)}
                      </td>
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
    </div>
  );
};
