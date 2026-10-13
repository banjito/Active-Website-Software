import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/Button';
import {
  DIRECTOR_DIVISION_ID,
  fetchDivisionLeads,
  type DivisionLeads,
} from '@/services/divisionLeadsService';
import { monthLabel, shiftMonth } from '@/utils/pmDashboardCalculations';

const PM_ROLES = ['Operations Manager', 'Project Manager'];

/**
 * Who may open the PM dashboard: admins, operations managers, and anyone named as a
 * division lead. Mirrors common.is_pm_or_admin() in pm_dashboard.sql, which is what
 * actually guards the data.
 */
export function usePmAccess() {
  const { user } = useAuth();
  const { isAdmin, getUserRole } = usePermissions();
  const [leads, setLeads] = useState<DivisionLeads | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchDivisionLeads().then((l) => alive && setLeads(l));
    return () => {
      alive = false;
    };
  }, []);

  const ledDivisions = Object.keys(leads ?? {}).filter((id) => leads?.[id]?.id === user?.id);

  return {
    loading: leads === null,
    allowed: isAdmin || PM_ROLES.includes(getUserRole() ?? '') || ledDivisions.length > 0,
    /** The location this person is the project manager of, if any */
    leadDivision: ledDivisions.find((id) => id !== DIRECTOR_DIVISION_ID) ?? null,
  };
}

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export const fmtMoney = (n: number): string => money.format(n);

export const fmtHours = (n: number): string =>
  n.toLocaleString('en-US', { maximumFractionDigits: 1 });

export const fmtPct = (value: number | null): string =>
  value == null ? 'n/a' : `${Math.round(value * 100)}%`;

export function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        aria-label="Previous month"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-[9.5rem] rounded-none border border-neutral-300 bg-white px-3 py-1.5 text-center text-sm font-semibold text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100">
        {monthLabel(month, 'long')}
      </div>
      <Button
        variant="outline"
        size="icon"
        aria-label="Next month"
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Track({ value, over }: { value: number | null; over?: boolean }) {
  return (
    <div
      className="h-3 w-full rounded-none bg-neutral-200 dark:bg-neutral-700"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value == null ? undefined : Math.round(value * 100)}
    >
      <div
        className={`h-full rounded-none ${over ? 'bg-red-600' : 'bg-brand'}`}
        style={{ width: `${(value ?? 0) * 100}%` }}
      />
    </div>
  );
}

/** Labeled bar for the job page. `over` turns it red, e.g. more hours used than estimated. */
export function ProgressBar({
  label,
  value,
  detail,
  over,
}: {
  label: string;
  value: number | null;
  detail?: string;
  over?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{label}</span>
        <span className="font-mono text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {fmtPct(value)}
        </span>
      </div>
      <Track value={value} over={over} />
      {detail && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{detail}</p>}
    </div>
  );
}

/** Bar with the percent beside it, for a table cell. */
export function MiniBar({ value, over }: { value: number | null; over?: boolean }) {
  return (
    <div className="flex min-w-[8rem] items-center gap-2">
      <Track value={value} over={over} />
      <span className="w-10 shrink-0 text-right font-mono text-xs text-neutral-700 dark:text-neutral-300">
        {fmtPct(value)}
      </span>
    </div>
  );
}

export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-none border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{note}</p>}
    </div>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-none border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      {children}
    </div>
  );
}
