import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase, isConnectionError } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';
import { PageLayout } from '@/components/ui/PageLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { formatStatusLabel } from '@/utils/formatters';

const PAGE_SIZE = 50;

/** Divisions that have jobs: all field services (NETA) + engineering + scavenger */
const UNIFIED_DIVISIONS = ['north_alabama', 'tennessee', 'georgia', 'international', 'engineering', 'scavenger'] as const;

const DIVISION_LABELS: Record<string, string> = {
  north_alabama: 'Alabama',
  tennessee: 'Tennessee',
  georgia: 'Georgia',
  international: 'International',
  engineering: 'Engineering',
  scavenger: 'Scavenger',
};

/** Badge color per source portal so each job is clearly flagged */
const DIVISION_BADGE_CLASS: Record<string, string> = {
  north_alabama: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700',
  tennessee: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300 dark:border-blue-700',
  georgia: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700',
  international: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300 border border-sky-300 dark:border-sky-700',
  engineering: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700',
  scavenger: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-300 dark:border-violet-700',
};

type StatusFilter = 'all' | 'in_progress' | 'pending' | 'completed' | 'billed';

interface JobRow {
  id: string;
  job_number: string | null;
  title: string;
  status: string;
  division: string | null;
  due_date: string | null;
  start_date: string | null;
  budget: number | null;
  customer_id: string | null;
  customers: { id: string; name: string; company_name: string } | null;
  contractValue?: number;
}

function getStatusColor(status: string): string {
  switch ((status || '').toLowerCase()) {
    case 'completed':
    case 'ready_to_bill':
    case 'ready to bill':
      return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
    case 'in_progress':
    case 'in-progress':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
    case 'billed':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
}

export default function UnifiedJobsPage() {
  const { user } = useAuth();
  const { maskJobTitle, maskCustomerName } = useDemoMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filterByContractValue, setFilterByContractValue] = useState(false);
  const [showTotals, setShowTotals] = useState(false);
  const [allTime, setAllTime] = useState(true);
  const [dateRangeStart, setDateRangeStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [dateRangeEnd, setDateRangeEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [page, setPage] = useState(1);

  const fetchJobs = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('*')
        .in('division', [...UNIFIED_DIVISIONS])
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (jobError) {
        if (isConnectionError(jobError)) {
          throw new Error('Unable to connect to the database. Please check your connection.');
        }
        throw jobError;
      }

      if (!jobData || jobData.length === 0) {
        setJobs([]);
        return;
      }

      const jobIds = jobData.map((j: any) => j.id);
      let contractValueMap: Record<string, number> = {};
      try {
        const { data: contractsData } = await supabase
          .schema('neta_ops')
          .from('job_contracts')
          .select('job_id, value, value_operation')
          .in('job_id', jobIds);
        if (contractsData?.length) {
          contractsData.forEach((row: any) => {
            const jobId = row.job_id;
            const raw = row.value;
            if (raw === null || raw === undefined) return;
            const amount = Math.abs(typeof raw === 'number' ? raw : parseFloat(raw));
            if (isNaN(amount)) return;
            const op = row.value_operation ?? (raw >= 0 ? 'add_to_total' : 'subtract_from_remaining');
            if (!contractValueMap[jobId]) contractValueMap[jobId] = 0;
            if (op === 'add_to_total' || op === 'add_to_remaining') contractValueMap[jobId] += amount;
            else if (op === 'subtract_from_remaining' || op === 'subtract_from_total') contractValueMap[jobId] -= amount;
          });
        }
      } catch (_) {}

      // Batch-fetch all customers in one query (avoids N+1)
      const customerIds = [...new Set(jobData.filter((j: any) => j.customer_id).map((j: any) => j.customer_id))];
      let customerMap: Record<string, { id: string; name: string; company_name: string }> = {};
      if (customerIds.length > 0) {
        const { data: customersData } = await supabase
          .schema('common')
          .from('customers')
          .select('id, name, company_name')
          .in('id', customerIds);
        if (customersData) {
          customersData.forEach((c: any) => { customerMap[c.id] = c; });
        }
      }
      const jobsWithCustomers = jobData.map((job: any) => ({
        ...job,
        customers: job.customer_id ? (customerMap[job.customer_id] ?? null) : null,
        contractValue: contractValueMap[job.id] ?? 0,
      } as JobRow));
      setJobs(jobsWithCustomers);
    } catch (err: any) {
      setLoadError(err?.message ?? 'Failed to load jobs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && location.pathname === '/all-jobs') fetchJobs();
  }, [user, location.pathname, fetchJobs]);

  const filteredJobs = useMemo(() => {
    let base = jobs;
    if (showTotals && !allTime) {
      const startDate = new Date(dateRangeStart);
      const endDate = new Date(dateRangeEnd);
      endDate.setHours(23, 59, 59, 999);
      base = base.filter((j) => {
        if (!j.start_date) return false;
        const jobDate = new Date(j.start_date);
        return jobDate >= startDate && jobDate <= endDate;
      });
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'completed') {
        base = base.filter((j) => {
          const s = (j.status || '').toLowerCase();
          return s === 'completed' || s === 'ready_to_bill' || s === 'ready to bill';
        });
      } else if (statusFilter === 'billed') {
        base = base.filter((j) => (j.status || '').toLowerCase() === 'billed');
      } else {
        base = base.filter((j) => (j.status || '').toLowerCase() === statusFilter);
      }
    }
    if (filterByContractValue) {
      base = base.filter((j) => (j.contractValue ?? 0) !== 0);
    }
    if (!searchTerm.trim()) return base;
    const lower = searchTerm.toLowerCase();
    return base.filter(
      (j) =>
        maskJobTitle(j.title)?.toLowerCase().includes(lower) ||
        j.customers?.company_name?.toLowerCase().includes(lower) ||
        j.customers?.name?.toLowerCase().includes(lower) ||
        j.job_number?.toLowerCase().includes(lower) ||
        (j.status || '').toLowerCase().includes(lower)
    );
  }, [jobs, statusFilter, searchTerm, filterByContractValue, showTotals, allTime, dateRangeStart, dateRangeEnd, maskJobTitle]);

  const statusTotals = useMemo(() => {
    let jobsInRange = jobs;
    if (showTotals && !allTime) {
      const startDate = new Date(dateRangeStart);
      const endDate = new Date(dateRangeEnd);
      endDate.setHours(23, 59, 59, 999);
      jobsInRange = jobs.filter((j) => {
        if (!j.start_date) return false;
        const jobDate = new Date(j.start_date);
        return jobDate >= startDate && jobDate <= endDate;
      });
    }
    const totals = { all: { count: 0, total: 0 }, pending: { count: 0, total: 0 }, in_progress: { count: 0, total: 0 }, completed: { count: 0, total: 0 }, billed: { count: 0, total: 0 } };
    let contractValueLeftToBill = 0;
    jobs.forEach((j) => { contractValueLeftToBill += j.contractValue ?? 0; });
    jobsInRange.forEach((j) => {
      const budget = j.budget || 0;
      const status = (j.status || '').toLowerCase();
      totals.all.count++;
      totals.all.total += budget;
      if (status === 'pending') { totals.pending.count++; totals.pending.total += budget; }
      else if (status === 'in_progress' || status === 'in-progress') { totals.in_progress.count++; totals.in_progress.total += budget; }
      else if (status === 'completed' || status === 'ready_to_bill' || status === 'ready to bill') { totals.completed.count++; totals.completed.total += budget; }
      else if (status === 'billed') { totals.billed.count++; totals.billed.total += budget; }
    });
    return { ...totals, contractValueLeftToBill };
  }, [jobs, showTotals, allTime, dateRangeStart, dateRangeEnd]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginatedJobs = useMemo(
    () => filteredJobs.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
    [filteredJobs, pageSafe]
  );

  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchTerm, filterByContractValue, showTotals, allTime, dateRangeStart, dateRangeEnd]);

  useEffect(() => {
    if (page > totalPages && totalPages >= 1) setPage(totalPages);
  }, [totalPages, page]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pageSafe]);

  return (
    <PageLayout title="Global Portal">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 mb-6">
          Jobs from all field service divisions, engineering, and scavenger. Each row is clearly labeled by source portal.
        </p>

        {loadError && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg flex items-center justify-between">
            <span>{loadError}</span>
            <button
              onClick={() => { setLoadError(null); fetchJobs(); }}
              className="px-3 py-1 bg-red-100 dark:bg-red-900/40 rounded text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Totals and Date Range Section (same as Field Tech) */}
        <div className="mt-6">
          <button
            onClick={() => setShowTotals(!showTotals)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          >
            {showTotals ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showTotals ? 'Hide' : 'Show'} Totals & Date Range
          </button>
          {showTotals && (
            <div className="mt-4 bg-white dark:bg-dark-150 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700 dark:text-white">Date Range:</label>
                  <button
                    type="button"
                    onClick={() => setAllTime(!allTime)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      allTime ? 'bg-[#f26722] text-white' : 'bg-gray-100 dark:bg-dark-100 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-200'
                    }`}
                  >
                    All Time
                  </button>
                  {!allTime && (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={dateRangeStart}
                        onChange={(e) => setDateRangeStart(e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722]"
                      />
                      <span className="text-gray-500 dark:text-gray-400">to</span>
                      <input
                        type="date"
                        value={dateRangeEnd}
                        onChange={(e) => setDateRangeEnd(e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722]"
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                <div className="bg-gray-50 dark:bg-dark-100 rounded-md p-3">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">All Jobs</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                    ${statusTotals.all.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{statusTotals.all.count} jobs</div>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-md p-3">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Pending</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                    ${statusTotals.pending.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{statusTotals.pending.count} jobs</div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-md p-3">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">In Progress</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                    ${statusTotals.in_progress.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{statusTotals.in_progress.count} jobs</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-md p-3">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Completed</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                    ${statusTotals.completed.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{statusTotals.completed.count} jobs</div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-md p-3">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Billed</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                    ${statusTotals.billed.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{statusTotals.billed.count} jobs</div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-md p-3">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Remaining Balance Left to Bill</div>
                  <div className={`mt-1 text-2xl font-semibold ${(statusTotals.contractValueLeftToBill || 0) > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                    ${(statusTotals.contractValueLeftToBill || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sum of remaining balance from non-billed jobs</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status Tabs */}
        <div className="mt-6">
          <div className="inline-flex rounded-md shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden" role="tablist">
            {[
              { key: 'all' as const, label: 'All Jobs' },
              { key: 'pending' as const, label: 'Pending' },
              { key: 'in_progress' as const, label: 'In Progress' },
              { key: 'completed' as const, label: 'Completed / Ready to Bill' },
              { key: 'billed' as const, label: 'Billed' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-4 py-2 text-sm font-medium focus:outline-none transition-colors ${
                  statusFilter === key ? 'bg-[#f26722] text-white' : 'bg-white dark:bg-dark-150 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-100'
                }${key !== 'billed' ? ' border-r border-gray-200 dark:border-gray-700' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* By Remaining Balance filter */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setFilterByContractValue(!filterByContractValue)}
            className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filterByContractValue
                ? 'bg-[#f26722] text-white'
                : 'bg-white dark:bg-dark-150 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-dark-100'
            }`}
          >
            By Remaining Balance
          </button>
        </div>

        {/* Search */}
        <div className="mt-6">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search jobs by title, customer, job number, status, or description..."
              className="w-full px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-150 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722]"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          {searchTerm && (
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Found {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} matching &quot;{searchTerm}&quot;
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-600 dark:text-gray-400"><LoadingSpinner size="md" /></div>
        ) : (
          <>
            <div className="mt-8 -mx-4 overflow-x-auto sm:mx-0 shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-dark-200">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider sm:pl-6">Source</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Job #</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Title</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Customer</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Remaining Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-dark-150">
                  {paginatedJobs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-500 dark:text-gray-400">
                        {jobs.length === 0 ? 'No jobs found.' : 'No jobs match the current filters.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedJobs.map((job) => {
                      const div = (job.division || '').toLowerCase();
                      const badgeClass = DIVISION_BADGE_CLASS[div] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
                      const sourceLabel = DIVISION_LABELS[div] || job.division || '—';
                      return (
                        <tr
                          key={job.id}
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          className="hover:bg-gray-50 dark:hover:bg-dark-100 cursor-pointer transition-colors"
                        >
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6">
                            <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold border ${badgeClass}`}>{sourceLabel}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900 dark:text-white">{job.job_number || 'Pending'}</td>
                          <td className="px-3 py-4 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate">{maskJobTitle(job.title)}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-300">{maskCustomerName(job.customers?.company_name || job.customers?.name) || '—'}</td>
                          <td className="whitespace-nowrap px-3 py-4">
                            <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${getStatusColor(job.status)}`}>{formatStatusLabel(job.status)}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            {job.contractValue !== undefined && job.contractValue !== 0 ? (
                              <span className={job.contractValue < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                                {job.contractValue < 0 ? '-' : ''}${Math.abs(job.contractValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {!loading && filteredJobs.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Showing {((pageSafe - 1) * PAGE_SIZE) + 1}–{Math.min(pageSafe * PAGE_SIZE, filteredJobs.length)} of {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} (50 per page)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pageSafe <= 1}
                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-dark-100"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Page {pageSafe} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={pageSafe >= totalPages}
                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-dark-100"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
