import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui';
import { Calendar, Send, Clock, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useDemoMode } from '../../lib/DemoModeContext';

interface DailyItem {
  id: string;
  title: string;
  proposal_due_date: string;
  estimateStatus: string | null;
  quoted_amount?: number | null;
  customer_name?: string;
}

const toDateOnly = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const DailyReport: React.FC = () => {
  const navigate = useNavigate();
  const { maskCustomerName } = useDemoMode();
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateOnly(new Date()));
  const [items, setItems] = useState<DailyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDailyData = async () => {
      try {
        setLoading(true);
        setError(null);
        const dateStr = selectedDate;
        const startOfDay = `${dateStr}T00:00:00`;
        const endOfDay = `${dateStr}T23:59:59.999`;

        const { data: opportunities, error: oppError } = await supabase
          .schema('business')
          .from('opportunities')
          .select('id, title, proposal_due_date, quoted_amount, customer_id')
          .not('proposal_due_date', 'is', null)
          .gte('proposal_due_date', startOfDay)
          .lte('proposal_due_date', endOfDay)
          .order('title');

        if (oppError) throw oppError;
        const rawOpps = opportunities || [];
        const opps = rawOpps.filter((o: any) => {
          const due = o.proposal_due_date;
          if (!due) return false;
          const dueDateOnly = typeof due === 'string' ? due.slice(0, 10) : toDateOnly(new Date(due));
          return dueDateOnly === dateStr;
        });

        if (opps.length === 0) {
          setItems([]);
          return;
        }

        const opportunityIds = opps.map((o: any) => o.id);
        const { data: estimatesData } = await supabase
          .schema('business')
          .from('estimates')
          .select('id, opportunity_id, status, created_at')
          .in('opportunity_id', opportunityIds)
          .order('created_at', { ascending: false });

        const latestStatusByOpp: Record<string, string> = {};
        (estimatesData || []).forEach((row: any) => {
          if (row.opportunity_id && latestStatusByOpp[row.opportunity_id] == null) {
            latestStatusByOpp[row.opportunity_id] = row.status || '';
          }
        });

        const customerIds = [...new Set((opps as any[]).map((o) => o.customer_id).filter(Boolean))];
        let customerNames: Record<string, string> = {};
        if (customerIds.length > 0) {
          const { data: customers } = await supabase
            .schema('business')
            .from('customers')
            .select('id, company_name, name')
            .in('id', customerIds);
          (customers || []).forEach((c: any) => {
            customerNames[c.id] = c.company_name || c.name || '';
          });
        }

        const dailyItems: DailyItem[] = (opps as any[]).map((o) => ({
          id: o.id,
          title: o.title || 'Untitled',
          proposal_due_date: o.proposal_due_date,
          estimateStatus: latestStatusByOpp[o.id] ?? null,
          quoted_amount: o.quoted_amount,
          customer_name: o.customer_id ? customerNames[o.customer_id] : undefined,
        }));
        setItems(dailyItems);
      } catch (err) {
        console.error('Error fetching daily report:', err);
        setError('Failed to load daily report');
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDailyData();
  }, [selectedDate]);

  const sentItems = items.filter((i) => i.estimateStatus === 'sent');
  const notSentItems = items.filter((i) => i.estimateStatus !== 'sent');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Daily Report</h2>
        <div className="flex items-center gap-2">
          <label htmlFor="daily-report-date" className="text-sm text-gray-600 dark:text-gray-400">
            Date
          </label>
          <input
            id="daily-report-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722]"
          />
        </div>
      </div>

      <Card className="border border-gray-200 dark:border-gray-700 dark:bg-dark-150">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#f26722]" />
            Estimates due {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
            {items.length === 0
              ? 'No proposals due this day.'
              : `${items.length} proposal${items.length === 1 ? '' : 's'} due · ${sentItems.length} sent, ${notSentItems.length} not yet sent`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</div>
          ) : error ? (
            <div className="py-6 text-center text-sm text-red-600 dark:text-red-400">{error}</div>
          ) : items.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">No estimates due on this day.</div>
          ) : (
            <div className="space-y-4">
              {sentItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Send className="h-4 w-4 text-green-600 dark:text-green-400" />
                    Sent ({sentItems.length})
                  </div>
                  <ul className="space-y-1.5">
                    {sentItems.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`/sales-dashboard/opportunities/${item.id}`)}
                          className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-green-50/50 dark:bg-green-900/20 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors group"
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            <FileText className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-[#f26722]">{item.title}</p>
                              {item.customer_name && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{maskCustomerName(item.customer_name)}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {item.quoted_amount != null && Number(item.quoted_amount) > 0 && (
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{formatCurrency(Number(item.quoted_amount))}</span>
                            )}
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">Sent</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {notSentItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    Not yet sent ({notSentItems.length})
                  </div>
                  <ul className="space-y-1.5">
                    {notSentItems.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`/sales-dashboard/opportunities/${item.id}`)}
                          className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-amber-50/50 dark:bg-amber-900/20 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors group"
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            <FileText className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-[#f26722]">{item.title}</p>
                              {item.customer_name && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{maskCustomerName(item.customer_name)}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {item.quoted_amount != null && Number(item.quoted_amount) > 0 && (
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{formatCurrency(Number(item.quoted_amount))}</span>
                            )}
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                              {item.estimateStatus ? item.estimateStatus.replace(/_/g, ' ') : 'No estimate'}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DailyReport;
