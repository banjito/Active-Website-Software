import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Settings } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { fmtMoney, fmtPct } from '@/app/pm-dashboard/shared';
import type { QBOAccountBalance } from '@/services/quickbooksService';
import {
  fetchKpiAccounts,
  loadKpis,
  saveKpiAccounts,
  type Kpi,
  type KpiAccounts,
} from '@/services/officeKpiService';

// Company KPIs for the Office home. Admins only: profit and bank balances are company-wide.

const SELECT =
  'w-full rounded-none border border-neutral-300 bg-white px-2 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100';

function Dots() {
  return (
    <span className="inline-flex h-7 items-center gap-1" role="status" aria-label="Loading">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-none bg-neutral-500 dark:bg-neutral-400"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

const show = (kpi: Kpi) => (kpi.value == null ? 'n/a' : kpi.format === 'pct' ? fmtPct(kpi.value) : fmtMoney(kpi.value));

export function OfficeKpis() {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [bankAccounts, setBankAccounts] = useState<QBOAccountBalance[]>([]);
  const [accounts, setAccounts] = useState<KpiAccounts>({ cash_reserve: null, operating: null });
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<KpiAccounts>(accounts);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const saved = await fetchKpiAccounts().catch(() => ({ cash_reserve: null, operating: null }));
      setAccounts(saved);
      const result = await loadKpis(saved);
      setKpis(result.kpis);
      setBankAccounts(result.bankAccounts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openSettings = () => {
    setDraft(accounts);
    setSaveError(null);
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveKpiAccounts(draft);
      setSettingsOpen(false);
      void load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const allFailed = !loading && kpis.length > 0 && kpis.every((k) => k.error);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Company KPIs</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh"
            title="Refresh"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Settings" title="Settings" onClick={openSettings}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {allFailed && (
        <div className="rounded-none border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          QuickBooks couldn't be reached: {kpis[0].error} Connect your QuickBooks account, then hit refresh.
        </div>
      )}

      <div className="grid grid-cols-2 border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 sm:grid-cols-3 lg:grid-cols-6">
        {(loading && kpis.length === 0 ? Array.from({ length: 12 }, (_, i) => ({ id: String(i) }) as Kpi) : kpis).map(
          (kpi) => (
            <div
              key={kpi.id}
              className="flex min-h-[6.5rem] flex-col gap-1 border-b border-r border-neutral-100 p-3 dark:border-neutral-700"
              title={kpi.error}
            >
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{kpi.label ?? ' '}</span>
              <span
                className={`font-mono text-lg font-semibold ${
                  kpi.value != null && kpi.value < 0
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-neutral-900 dark:text-neutral-100'
                }`}
              >
                {loading ? <Dots /> : show(kpi)}
              </span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {loading ? 'Loading' : kpi.error ? "Couldn't load. Hover for why." : kpi.note}
              </span>
            </div>
          ),
        )}
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>KPI settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Pick the QuickBooks bank accounts behind the two balance KPIs.
            </p>
            {bankAccounts.length === 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                No bank accounts came back from QuickBooks. Check the connection, then hit refresh.
              </p>
            )}
            {(
              [
                ['operating', 'Operating Account'],
                ['cash_reserve', 'Cash Reserve'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block space-y-1">
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{label}</span>
                <select
                  className={SELECT}
                  value={draft[key] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value || null })}
                >
                  <option value="">Not set</option>
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({fmtMoney(a.balance)})
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {saveError && <p className="text-sm text-red-700 dark:text-red-400">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveSettings} isLoading={saving}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
