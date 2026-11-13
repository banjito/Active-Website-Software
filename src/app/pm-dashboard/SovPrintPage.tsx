import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Printer } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SovDocument } from '@/components/jobs/SovDocument';
import {
  fetchPmJob,
  fetchSovCustomer,
  loadJobBundles,
  type JobBundle,
  type PmJob,
  type SovCustomer,
} from '@/services/pmDashboardService';
import { mergedProgress, monthKey, payApplication } from '@/utils/pmDashboardCalculations';
import { MonthPicker, Notice, usePmAccess } from './shared';

// The SOV as a printable pay application for one month. Opened from the job's
// Schedule of values. No sidebar, so it prints clean.

export default function SovPrintPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const access = usePmAccess();
  const month = searchParams.get('month') ?? monthKey(new Date());

  const [job, setJob] = useState<PmJob | null>(null);
  const [bundle, setBundle] = useState<JobBundle | null>(null);
  const [customer, setCustomer] = useState<SovCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  usePageTitle(job ? `SOV ${job.job_number ?? ''} ${month}`.trim() : 'SOV');

  useEffect(() => {
    if (!jobId || access.loading || !access.allowed) return;
    let alive = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const loaded = await fetchPmJob(jobId);
        if (!loaded) throw new Error('Job not found.');
        const [result, cust] = await Promise.all([
          loadJobBundles([loaded]),
          fetchSovCustomer(loaded.customer_id).catch((err) => {
            console.error('[SOV print] Customer failed to load:', err);
            return null;
          }),
        ]);
        if (!alive) return;
        setJob(loaded);
        setBundle(result.bundles[loaded.id] ?? null);
        setCustomer(cust);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load the SOV.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [jobId, access.loading, access.allowed]);

  const app = useMemo(() => {
    if (!bundle) return null;
    const progress = mergedProgress(bundle.lines, bundle.reports, bundle.weeks, bundle.gc);
    return payApplication(bundle.lines, progress, month, customer?.retainagePct ?? 0);
  }, [bundle, month, customer?.retainagePct]);

  const changeMonth = (m: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('month', m);
    setSearchParams(next, { replace: true });
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-neutral-100 p-4 dark:bg-neutral-950 print:bg-white print:p-0">{children}</div>
  );

  if (access.loading || (access.allowed && loading)) {
    return shell(
      <div className="flex min-h-[300px] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>,
    );
  }

  if (!access.allowed || (job && !access.fullAccess && job.project_manager_id !== user?.id)) {
    return shell(
      <div className="mx-auto max-w-3xl">
        <Notice>Only the job's PM, or a full-access PM, can print this SOV.</Notice>
      </div>,
    );
  }

  if (error || !job || !bundle || !app) {
    return shell(
      <div className="mx-auto flex max-w-3xl items-start gap-3 rounded-none border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
        <p className="text-sm text-red-700 dark:text-red-300">{error ?? 'Job not found.'}</p>
      </div>,
    );
  }

  const unsaved = bundle.seeded || bundle.changeOrders.some((co) => co.seeded);

  return shell(
    <div className="mx-auto max-w-[11in] space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          onClick={() => navigate(`/pm-dashboard/${job.id}?month=${month}`)}
        >
          Back to job
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker month={month} onChange={changeMonth} />
          <Button size="sm" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      <div className="space-y-2 print:hidden">
        {unsaved && (
          <Notice>Part of this SOV isn't saved yet. Save it on the job page so the printout matches.</Notice>
        )}
        {bundle.lines.length === 0 && <Notice>This job has no SOV lines yet.</Notice>}
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {customer?.retainagePct
            ? `Retainage ${customer.retainagePct}%, from the customer's settings.`
            : "No retainage. Set it on the customer if they hold some back."}{' '}
          Save as PDF from the print window.
        </p>
      </div>

      <SovDocument
        app={app}
        month={month}
        jobNumber={job.job_number}
        jobTitle={job.title}
        customerName={customer?.name || job.customer_name}
        customerAddress={customer?.address ?? null}
        retainagePct={customer?.retainagePct ?? 0}
        changeOrders={bundle.changeOrders}
      />
    </div>,
  );
}
