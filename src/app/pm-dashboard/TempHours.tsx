import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, Save, Send, Settings, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast } from '@/components/ui/toast';
import { confirmDialog } from '@/components/ui/confirmDialog';
import type { PmJob } from '@/services/pmDashboardService';
import {
  fetchTempLines,
  fetchTempSetup,
  fetchWeekSends,
  saveTempLines,
  saveTempSetup,
  sendTempHours,
  shiftWeek,
  TempHoursSetupMissingError,
  weekLabel,
  weekStartOf,
  type TempAgency,
  type TempHourLine,
  type TempWeekSend,
  type TempWorker,
} from '@/services/tempHoursService';
import { fmtHours, Notice } from './shared';

const INPUT =
  'rounded-none border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100';
const NUMBER = `${INPUT} text-right font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;
const TH = 'px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400';

const sentOn = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Weekly temp hours. PMs enter each temp's total hours by job, then send one
// combined email per agency. The hours also count in each job's hours used.
export default function TempHours({ jobs }: { jobs: PmJob[] }) {
  const { user } = useAuth();
  const { maskJobTitle } = useDemoMode();
  const [week, setWeek] = useState(() => weekStartOf());
  const [agencies, setAgencies] = useState<TempAgency[]>([]);
  const [workers, setWorkers] = useState<TempWorker[]>([]);
  const [lines, setLines] = useState<TempHourLine[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [sends, setSends] = useState<Record<string, TempWeekSend>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [setup, weekLines, weekSends] = await Promise.all([fetchTempSetup(), fetchTempLines(week), fetchWeekSends(week)]);
      setAgencies(setup.agencies);
      setWorkers(setup.workers);
      setLines(weekLines);
      setSends(weekSends);
      setRemovedIds([]);
      setDirty(false);
      setMissing(false);
    } catch (e: any) {
      if (e instanceof TempHoursSetupMissingError) setMissing(true);
      else setError(e?.message ?? 'Could not load temp hours');
    } finally {
      setLoading(false);
    }
  }, [week]);

  useEffect(() => {
    load();
  }, [load]);

  const jobLabel = useMemo(() => {
    const map = new Map(jobs.map((j) => [j.id, `${j.job_number ?? ''} ${maskJobTitle(j.title) || ''}`.trim()]));
    return (id: string) => map.get(id) ?? 'Job not in this view';
  }, [jobs, maskJobTitle]);
  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
  const activeWorkers = workers.filter((w) => w.active);

  const change = (next: TempHourLine[]) => {
    setLines(next);
    setDirty(true);
  };
  const update = (id: string, patch: Partial<TempHourLine>) =>
    change(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addRow = () =>
    change([...lines, { id: crypto.randomUUID(), week_start: week, worker_id: '', job_id: '', hours: 0 }]);
  const removeRow = (id: string) => {
    setRemovedIds((prev) => [...prev, id]);
    change(lines.filter((l) => l.id !== id));
  };

  const goWeek = async (by: number) => {
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Leave without saving?',
        description: "This week's changes aren't saved.",
        confirmLabel: 'Leave',
        destructive: true,
      });
      if (!ok) return;
    }
    setWeek(shiftWeek(week, by));
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveTempLines(lines, removedIds);
      await load();
      toast({ title: 'Temp hours saved', variant: 'success' });
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const send = async (agency: TempAgency, total: number) => {
    const again = !!sends[agency.id];
    const ok = await confirmDialog({
      title: again ? `Send ${agency.name} the hours again?` : `Send ${agency.name} this week's hours?`,
      description: `${fmtHours(total)} hours, week of ${weekLabel(week)}, to ${agency.recipients.join(', ')}. You get a copy.`,
      confirmLabel: 'Send',
    });
    if (!ok) return;
    setSendingId(agency.id);
    try {
      const res = await sendTempHours(week, agency.id);
      toast({ title: 'Sent', description: `Emailed ${res.sentTo.join(', ')}.`, variant: 'success' });
      setSends(await fetchWeekSends(week));
    } catch (e: any) {
      toast({ title: "Couldn't send", description: e?.message, variant: 'destructive' });
    } finally {
      setSendingId(null);
    }
  };

  if (missing) {
    return <Notice>Temp hours need database setup: run database/migrations/temp_hours.sql.</Notice>;
  }

  const filled = lines.filter((l) => l.worker_id && l.job_id);
  const totalFor = (agencyId: string) =>
    filled.filter((l) => workerById.get(l.worker_id)?.agency_id === agencyId).reduce((t, l) => t + (l.hours || 0), 0);
  const weekTotal = filled.reduce((t, l) => t + (l.hours || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" aria-label="Previous week" onClick={() => goWeek(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[12rem] text-center text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Week of {weekLabel(week)}
          </div>
          <Button variant="outline" size="sm" aria-label="Next week" onClick={() => goWeek(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="text-xs text-amber-700 dark:text-amber-300">Unsaved changes</span>}
          <Button variant="outline" size="sm" leftIcon={<Settings className="h-4 w-4" />} onClick={() => setSettingsOpen(true)}>
            Agencies and temps
          </Button>
          {activeWorkers.length > 0 && (
            <Button variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={addRow}>
              Add row
            </Button>
          )}
          {dirty && (
            <Button size="sm" leftIcon={<Save className="h-4 w-4" />} isLoading={saving} onClick={save}>
              Save
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-none border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <LoadingSpinner size="md" />
        </div>
      ) : agencies.length === 0 || workers.length === 0 ? (
        <div className="rounded-none border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
          {agencies.length === 0
            ? 'Add your temp agency and who gets its weekly email.'
            : 'Add the temps who work for you.'}
          <div className="mt-3">
            <Button size="sm" leftIcon={<Settings className="h-4 w-4" />} onClick={() => setSettingsOpen(true)}>
              Agencies and temps
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900/40">
                <tr>
                  <th className={TH}>Temp</th>
                  <th className={TH}>Job</th>
                  <th className={`${TH} text-right`}>Hours this week</th>
                  <th className={TH} aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-neutral-500 dark:text-neutral-400">
                      No hours this week yet. Use Add row.
                    </td>
                  </tr>
                )}
                {lines.map((l) => (
                  <tr key={l.id} className="border-t border-neutral-200 dark:border-neutral-700">
                    <td className="px-3 py-2">
                      <select
                        aria-label="Temp"
                        className={`${INPUT} w-full min-w-[12rem]`}
                        value={l.worker_id}
                        onChange={(e) => update(l.id, { worker_id: e.target.value })}
                      >
                        <option value="">Pick a temp</option>
                        {agencies.map((a) => (
                          <optgroup key={a.id} label={a.name}>
                            {workers
                              .filter((w) => w.agency_id === a.id && (w.active || w.id === l.worker_id))
                              .map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        aria-label="Job"
                        className={`${INPUT} w-full min-w-[14rem]`}
                        value={l.job_id}
                        onChange={(e) => update(l.id, { job_id: e.target.value })}
                      >
                        <option value="">Pick a job</option>
                        {l.job_id && !jobs.some((j) => j.id === l.job_id) && (
                          <option value={l.job_id}>{jobLabel(l.job_id)}</option>
                        )}
                        {jobs.map((j) => (
                          <option key={j.id} value={j.id}>
                            {jobLabel(j.id)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        aria-label="Hours this week"
                        type="number"
                        min={0}
                        step={0.25}
                        className={`${NUMBER} w-24`}
                        value={l.hours || ''}
                        placeholder="0"
                        onChange={(e) => update(l.id, { hours: Math.max(0, parseFloat(e.target.value) || 0) })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" aria-label="Remove row" onClick={() => removeRow(l.id)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {filled.length > 0 && (
                <tfoot>
                  <tr className="border-t border-neutral-300 font-medium dark:border-neutral-600">
                    <td className="px-3 py-2" colSpan={2}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtHours(weekTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="space-y-2">
            {agencies
              .filter((a) => a.active)
              .map((a) => {
                const total = totalFor(a.id);
                const sent = sends[a.id];
                return (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-none border border-neutral-200 bg-white px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  >
                    <div>
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">
                        {a.name} · {fmtHours(total)} hours
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {sent
                          ? `Sent ${sentOn(sent.sent_at)} to ${sent.sent_to.join(', ')}`
                          : a.recipients.length
                            ? `Goes to ${a.recipients.join(', ')}`
                            : 'No one set to get this yet. Add them under Agencies and temps.'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={sent ? 'outline' : 'primary'}
                      leftIcon={<Send className="h-4 w-4" />}
                      isLoading={sendingId === a.id}
                      disabled={dirty || total <= 0 || a.recipients.length === 0}
                      title={dirty ? 'Save first' : undefined}
                      onClick={() => send(a, total)}
                    >
                      {sent ? 'Send again' : 'Mark complete and send'}
                    </Button>
                  </div>
                );
              })}
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              One email per agency with every PM's temps for the week. These hours count in each job's hours
              used. Nothing goes to QuickBooks.
            </p>
          </div>
        </>
      )}

      {settingsOpen && (
        <SetupDialog
          agencies={agencies}
          workers={workers}
          userId={user?.id}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function SetupDialog({
  agencies: initialAgencies,
  workers: initialWorkers,
  userId,
  onClose,
  onSaved,
}: {
  agencies: TempAgency[];
  workers: TempWorker[];
  userId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [agencies, setAgencies] = useState(() =>
    initialAgencies.map((a) => ({ ...a, recipientsText: a.recipients.join(', ') })),
  );
  const [workers, setWorkers] = useState(initialWorkers);
  const [removedAgencies, setRemovedAgencies] = useState<string[]>([]);
  const [removedWorkers, setRemovedWorkers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const bad = agencies.find((a) => !a.name.trim());
    if (bad) return toast({ title: 'Give every agency a name', variant: 'destructive' });
    const parsed = agencies.map(({ recipientsText, ...a }) => ({
      ...a,
      recipients: recipientsText
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter(Boolean),
    }));
    const badEmail = parsed.flatMap((a) => a.recipients).find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (badEmail) return toast({ title: `"${badEmail}" isn't an email address`, variant: 'destructive' });
    const keptWorkers = workers.filter((w) => w.name.trim() && w.agency_id);
    setSaving(true);
    try {
      await saveTempSetup(parsed, keptWorkers, { agencyIds: removedAgencies, workerIds: removedWorkers }, userId);
      toast({ title: 'Saved', variant: 'success' });
      onSaved();
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* No auto-focus on open: it put a focus ring on Add agency */}
      <DialogContent className="sm:max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Agencies and temps</DialogTitle>
        </DialogHeader>
        <div className="-mx-1 max-h-[65vh] space-y-6 overflow-y-auto px-1 py-1 text-sm">
          <section className="space-y-2">
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Agencies</h3>
            {agencies.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2">
                <input
                  id={`agency-name-${a.id}`}
                  aria-label="Agency name"
                  className={`${INPUT} w-40`}
                  placeholder="Agency name"
                  value={a.name}
                  onChange={(e) => setAgencies(agencies.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)))}
                />
                <input
                  id={`agency-to-${a.id}`}
                  aria-label="Who gets the weekly email"
                  className={`${INPUT} min-w-[14rem] flex-1`}
                  placeholder="Weekly email to: mike@premier.com, you@company.com"
                  value={a.recipientsText}
                  onChange={(e) =>
                    setAgencies(agencies.map((x) => (x.id === a.id ? { ...x, recipientsText: e.target.value } : x)))
                  }
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300" htmlFor={`agency-active-${a.id}`}>
                    <input
                      id={`agency-active-${a.id}`}
                      type="checkbox"
                      className="rounded-none accent-brand"
                      checked={a.active}
                      onChange={(e) => setAgencies(agencies.map((x) => (x.id === a.id ? { ...x, active: e.target.checked } : x)))}
                    />
                    Active
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${a.name || 'agency'}`}
                    onClick={async () => {
                      if (initialAgencies.some((x) => x.id === a.id)) {
                        const ok = await confirmDialog({
                          title: `Remove ${a.name}?`,
                          description: 'Its temps and their hours are removed too. To keep the history, uncheck Active instead.',
                          confirmLabel: 'Remove',
                          destructive: true,
                        });
                        if (!ok) return;
                        setRemovedAgencies([...removedAgencies, a.id]);
                      }
                      setAgencies(agencies.filter((x) => x.id !== a.id));
                      setWorkers(workers.filter((w) => w.agency_id !== a.id));
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-neutral-500 opacity-80 hover:text-neutral-900 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:text-white"
              onClick={() =>
                setAgencies([
                  ...agencies,
                  { id: crypto.randomUUID(), name: '', recipients: [], recipientsText: '', active: true },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              Add agency
            </button>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Temps</h3>
            {workers.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center gap-2">
                <input
                  aria-label="Temp name"
                  className={`${INPUT} min-w-[12rem] flex-1`}
                  placeholder="Full name"
                  value={w.name}
                  onChange={(e) => setWorkers(workers.map((x) => (x.id === w.id ? { ...x, name: e.target.value } : x)))}
                />
                <select
                  aria-label="Agency"
                  className={`${INPUT} w-40`}
                  value={w.agency_id}
                  onChange={(e) => setWorkers(workers.map((x) => (x.id === w.id ? { ...x, agency_id: e.target.value } : x)))}
                >
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || 'New agency'}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300" htmlFor={`temp-active-${w.id}`}>
                  <input
                    id={`temp-active-${w.id}`}
                    type="checkbox"
                    className="rounded-none accent-brand"
                    checked={w.active}
                    onChange={(e) => setWorkers(workers.map((x) => (x.id === w.id ? { ...x, active: e.target.checked } : x)))}
                  />
                  Active
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${w.name || 'temp'}`}
                  onClick={() => {
                    if (initialWorkers.some((x) => x.id === w.id)) setRemovedWorkers([...removedWorkers, w.id]);
                    setWorkers(workers.filter((x) => x.id !== w.id));
                  }}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            ))}
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-neutral-500 opacity-80 hover:text-neutral-900 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:text-white"
              disabled={agencies.length === 0}
              onClick={() =>
                setWorkers([...workers, { id: crypto.randomUUID(), agency_id: agencies[0]?.id ?? '', name: '', active: true }])
              }
            >
              <Plus className="h-4 w-4" />
              Add temp
            </button>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Uncheck Active when a temp leaves; their past hours stay. Removing deletes their hours too.
            </p>
          </section>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" leftIcon={<Save className="h-4 w-4" />} isLoading={saving} onClick={save}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
