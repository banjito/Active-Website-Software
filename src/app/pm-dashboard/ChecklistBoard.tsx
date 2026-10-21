import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { useDemoMode } from '@/lib/DemoModeContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ChecklistBox, ChecklistProgress } from '@/components/jobs/JobChecklist';
import type { PmJob } from '@/services/pmDashboardService';
import {
  CHECKLIST_PHASES,
  ChecklistSetupMissingError,
  fetchChecklistItems,
  fetchChecklistJobFacts,
  fetchChecklistSteps,
  summarizeJobChecklist,
  type ChecklistItem,
  type ChecklistJobFacts,
  type ChecklistStep,
} from '@/services/jobChecklistService';
import ChecklistStepEditor from './ChecklistStepEditor';
import { Notice, StatTile } from './shared';

// Steps in these phases must be done before a crew goes out
const SETUP_PHASES = new Set(['Sales', 'Setup']);

/** Project checklist across the PM Dashboard's jobs: one row per job, one box per step. */
export default function ChecklistBoard({ jobs }: { jobs: PmJob[] }) {
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();
  const { maskJobTitle, maskCustomerName } = useDemoMode();
  const [steps, setSteps] = useState<ChecklistStep[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [facts, setFacts] = useState<ChecklistJobFacts[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupMissing, setSetupMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyLate, setOnlyLate] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const ids = jobs.map((j) => j.id);
    setLoading(true);
    setError(null);
    try {
      const [s, i, f] = await Promise.all([
        fetchChecklistSteps(),
        ids.length ? fetchChecklistItems(ids) : Promise.resolve([]),
        ids.length ? fetchChecklistJobFacts(ids) : Promise.resolve([]),
      ]);
      setSteps(s);
      setItems(i);
      setFacts(f);
      setSetupMissing(false);
    } catch (err) {
      if (err instanceof ChecklistSetupMissingError) {
        setSetupMissing(true);
      } else {
        console.error('[Checklist board] Load failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to load the checklist.');
      }
    } finally {
      setLoading(false);
    }
  }, [jobs]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const today = new Date();
    const factsById = new Map(facts.map((f) => [f.id, f]));
    const itemsByJob = new Map<string, ChecklistItem[]>();
    for (const item of items) {
      const list = itemsByJob.get(item.job_id) ?? [];
      list.push(item);
      itemsByJob.set(item.job_id, list);
    }
    return jobs
      .map((job) => ({
        job,
        summary: summarizeJobChecklist(steps, itemsByJob.get(job.id) ?? [], factsById.get(job.id), today),
      }))
      .sort(
        (a, b) =>
          b.summary.late - a.summary.late ||
          a.summary.done / (a.summary.total || 1) - b.summary.done / (b.summary.total || 1),
      );
  }, [jobs, steps, items, facts]);

  const phases = CHECKLIST_PHASES.map((phase) => ({
    phase,
    count: steps.filter((s) => s.phase === phase).length,
  })).filter((p) => p.count > 0);
  // Steps are shown phase by phase, so the grid columns line up with the phase headers
  const orderedSteps = phases.flatMap((p) => steps.filter((s) => s.phase === p.phase));
  const firstInPhase = new Set(phases.map((p) => steps.find((s) => s.phase === p.phase)?.id));

  const lateSteps = rows.reduce((sum, r) => sum + r.summary.late, 0);
  const readyToMobilize = rows.filter((r) =>
    r.summary.statuses
      .filter((s) => SETUP_PHASES.has(s.step.phase))
      .every((s) => s.display === 'done' || s.display === 'auto' || s.display === 'na'),
  ).length;
  const waitingOnContract = rows.filter((r) =>
    r.summary.statuses.some(
      (s) => s.step.key === 'contract_signed' && (s.display === 'open' || s.display === 'late'),
    ),
  ).length;
  const shown = onlyLate ? rows.filter((r) => r.summary.late > 0) : rows;

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (setupMissing) {
    return (
      <Notice>
        Checklist database setup has not been run. Run database/migrations/job_checklist.sql to turn it on.
      </Notice>
    );
  }

  if (error) {
    return (
      <div className="rounded-none border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Active jobs" value={String(rows.length)} />
        <StatTile label="Ready to mobilize" value={String(readyToMobilize)} note="Every sales and setup step done" />
        <StatTile label="Late steps" value={String(lateSteps)} note="Past their due date" />
        <StatTile label="Waiting on contract" value={String(waitingOnContract)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          aria-pressed={onlyLate}
          onClick={() => setOnlyLate((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-none border px-3 py-1.5 text-sm ${
            onlyLate
              ? 'border-red-600 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-950 dark:text-red-300'
              : 'border-neutral-300 bg-white text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200'
          }`}
        >
          <ChecklistBox display="late" />
          Only late
        </button>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} leftIcon={<Pencil className="h-4 w-4" />}>
            Edit steps
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr className="border-b border-neutral-300 dark:border-neutral-600">
              <th rowSpan={2} className="px-3 py-2 text-left font-medium text-neutral-600 dark:text-neutral-300">
                Job
              </th>
              {phases.map((p) => (
                <th
                  key={p.phase}
                  colSpan={p.count}
                  className="border-l border-neutral-300 px-2 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-neutral-800 dark:border-neutral-600 dark:text-neutral-200"
                >
                  {p.phase}
                </th>
              ))}
              <th
                rowSpan={2}
                className="w-40 border-l border-neutral-300 px-3 py-2 text-left font-medium text-neutral-600 dark:border-neutral-600 dark:text-neutral-300"
              >
                Progress
              </th>
            </tr>
            <tr className="border-b border-neutral-200 dark:border-neutral-700">
              {orderedSteps.map((s) => (
                <th
                  key={s.id}
                  className={`w-20 px-1.5 py-2 text-center text-[11px] font-medium leading-tight text-neutral-500 dark:text-neutral-400 ${
                    firstInPhase.has(s.id) ? 'border-l border-neutral-300 dark:border-neutral-600' : ''
                  }`}
                >
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={orderedSteps.length + 2} className="px-3 py-6 text-center text-neutral-500">
                  {onlyLate ? 'No jobs with late steps.' : 'No active jobs at this location.'}
                </td>
              </tr>
            )}
            {shown.map(({ job, summary }) => {
              const href = `/jobs/${job.id}?tab=checklist`;
              const byStep = new Map(summary.statuses.map((s) => [s.step.id, s]));
              return (
                <tr
                  key={job.id}
                  onClick={() => navigate(href)}
                  className="cursor-pointer border-b border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-700/40"
                >
                  <td className="px-3 py-2">
                    <Link
                      to={href}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                    >
                      <span className="font-mono">{job.job_number ?? ''}</span>{' '}
                      {maskJobTitle(job.title) || 'Untitled job'}
                    </Link>
                    {summary.late > 0 && (
                      <span className="ml-2 rounded-none border border-red-600 bg-red-50 px-1.5 font-mono text-[11px] text-red-700 dark:border-red-500 dark:bg-red-950 dark:text-red-300">
                        {summary.late} late
                      </span>
                    )}
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {maskCustomerName(job.customer_name)}
                    </div>
                  </td>
                  {orderedSteps.map((s) => (
                    <td
                      key={s.id}
                      className={`px-1.5 py-2 text-center ${
                        firstInPhase.has(s.id) ? 'border-l border-neutral-300 dark:border-neutral-600' : ''
                      }`}
                    >
                      {byStep.get(s.id)?.display === 'na' ? (
                        <span className="font-mono text-[11px] text-neutral-400">N/A</span>
                      ) : (
                        <ChecklistBox display={byStep.get(s.id)?.display ?? 'open'} />
                      )}
                    </td>
                  ))}
                  <td className="border-l border-neutral-300 px-3 py-2 dark:border-neutral-600">
                    <ChecklistProgress done={summary.done} total={summary.total} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Orange: done. Blue: ticked itself from the job. Red: past due. Click a job to tick its boxes.
      </p>

      {isAdmin && (
        <ChecklistStepEditor open={editing} onOpenChange={setEditing} steps={steps} onSaved={() => void load()} />
      )}
    </div>
  );
}
