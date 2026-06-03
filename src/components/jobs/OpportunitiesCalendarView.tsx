import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import { EventClickArg, DatesSetArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface OpportunityCalendarItem {
  id: string;
  title: string | null;
  quote_number: string;
  proposal_due_date: string | null;
  estimate_approval_status: string | null;
}

/** Parse date for calendar display. Date-only strings (YYYY-MM-DD) are parsed as local date to avoid timezone off-by-one (e.g. due 13th showing on 12th). */
function parseDate(d: string | null): Date | null {
  if (!d) return null;
  const trimmed = (d as string).trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const [, y, m, day] = dateOnlyMatch;
    const parsed = new Date(Number(y), Number(m) - 1, Number(day));
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// Calendar colors show estimate stage, not due-date urgency.
function getEventColor(opportunity: OpportunityCalendarItem): string {
  const status = (opportunity.estimate_approval_status || '').toLowerCase();
  const dueDate = parseDate(opportunity.proposal_due_date);
  if (!dueDate) return 'var(--cal-gray)';

  if (status === 'no_quote' || status === 'no quote') return 'var(--cal-gray)';
  if (status === 'sent') return 'var(--cal-sent)';
  if (!status) return 'var(--cal-not-started)';
  return 'var(--cal-in-progress)';
}

function getEventTitle(opportunity: OpportunityCalendarItem): string {
  const title = (opportunity.title || '').trim();
  const q = (opportunity.quote_number || '').trim();
  if (title && q) return `${q} — ${title}`;
  return title || q || 'Untitled';
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function OpportunitiesCalendarView() {
  const navigate = useNavigate();
  const calendarRef = useRef<FullCalendar>(null);
  const [opportunities, setOpportunities] = useState<OpportunityCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  const loadOpportunities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: oppData, error: oppErr } = await supabase
        .schema('business')
        .from('opportunities')
        .select('id, title, quote_number, proposal_due_date')
        .not('proposal_due_date', 'is', null)
        .order('proposal_due_date', { ascending: true });

      if (oppErr) throw oppErr;
      const opps = (oppData || []) as OpportunityCalendarItem[];

      if (opps.length === 0) {
        setOpportunities([]);
        setLoading(false);
        return;
      }

      const ids = opps.map((o) => o.id);
      const { data: estData, error: estErr } = await supabase
        .schema('business')
        .from('estimates')
        .select('id, opportunity_id, status, created_at')
        .in('opportunity_id', ids)
        .order('created_at', { ascending: false });

      const statusByOpp: Record<string, string> = {};
      if (!estErr && estData && estData.length > 0) {
        (estData as { opportunity_id: string; status: string }[]).forEach((row) => {
          if (row.opportunity_id && statusByOpp[row.opportunity_id] == null) {
            statusByOpp[row.opportunity_id] = row.status || '';
          }
        });
      }

      const withStatus = opps.map((o) => ({
        ...o,
        estimate_approval_status: statusByOpp[o.id] || null
      }));
      setOpportunities(withStatus);
    } catch (e) {
      console.error('Error loading opportunities for calendar:', e);
      setError(e instanceof Error ? e.message : 'Failed to load opportunities');
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOpportunities();
  }, [loadOpportunities]);

  const events = opportunities
    .map((opp) => {
      const due = parseDate(opp.proposal_due_date);
      if (!due) return null;
      return {
        id: opp.id,
        title: getEventTitle(opp),
        start: due,
        allDay: true,
        backgroundColor: getEventColor(opp),
        borderColor: getEventColor(opp),
        extendedProps: { opportunityId: opp.id, opportunity: opp }
      };
    })
    .filter(Boolean) as { id: string; title: string; start: Date; allDay: boolean; backgroundColor: string; borderColor: string; extendedProps: { opportunityId: string; opportunity: OpportunityCalendarItem } }[];

  const handleEventClick = (info: EventClickArg) => {
    info.jsEvent.preventDefault();
    const id = info.event.extendedProps?.opportunityId as string | undefined;
    if (id) navigate(`/sales-dashboard/opportunities/${id}`);
  };

  const handleDatesSet = (arg: DatesSetArg) => {
    if (arg.view.type === 'dayGridMonth' && arg.view.currentStart) {
      setCurrentDate(arg.view.currentStart);
    }
  };

  const goPrev = () => {
    calendarRef.current?.getApi().prev();
  };

  const goNext = () => {
    calendarRef.current?.getApi().next();
  };

  const goToday = () => {
    calendarRef.current?.getApi().today();
  };

  const today = new Date();
  const isCurrentMonth = currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear();

  return (
    <div className="opportunities-calendar space-y-5">
      <style>{`
        .opportunities-calendar {
          --cal-not-started: #d97706;
          --cal-sent: #059669;
          --cal-in-progress: #2563eb;
          --cal-gray: #64748b;
        }
        .dark .opportunities-calendar {
          --cal-not-started: #f59e0b;
          --cal-sent: #10b981;
          --cal-in-progress: #3b82f6;
          --cal-gray: #94a3b8;
        }
        .opportunities-calendar .fc {
          font-family: inherit;
        }
        .opportunities-calendar .fc-theme-standard td,
        .opportunities-calendar .fc-theme-standard th {
          border-color: var(--fc-border-color, #e2e8f0);
        }
        .dark .opportunities-calendar .fc-theme-standard td,
        .dark .opportunities-calendar .fc-theme-standard th {
          border-color: rgba(255,255,255,0.08);
        }
        .opportunities-calendar .fc-scrollgrid {
          border-radius: 8px;
          overflow: hidden;
        }
        .opportunities-calendar .fc-col-header {
          border-bottom: 1px solid var(--fc-border-color, #e2e8f0);
          background: rgba(248, 250, 252, 0.9);
        }
        .dark .opportunities-calendar .fc-col-header {
          border-bottom-color: rgba(255,255,255,0.08);
          background: rgba(0,0,0,0.2);
        }
        .opportunities-calendar .fc-col-header-cell {
          padding: 12px 6px;
          font-size: 0.8125rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #334155;
        }
        .dark .opportunities-calendar .fc-col-header-cell {
          color: rgba(255,255,255,0.85);
        }
        .opportunities-calendar .fc-daygrid-day {
          min-height: 100px;
        }
        .opportunities-calendar .fc-daygrid-day-number {
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--fc-neutral-text-color, #64748b);
          padding: 6px 8px;
          margin: 4px;
          border-radius: 6px;
        }
        .dark .opportunities-calendar .fc-daygrid-day-number {
          color: rgba(255,255,255,0.6);
        }
        .opportunities-calendar .fc-day-today .fc-daygrid-day-number {
          background: var(--fc-today-bg-color, #f1f5f9);
          color: #0f172a;
        }
        .dark .opportunities-calendar .fc-day-today .fc-daygrid-day-number {
          background: rgba(255,255,255,0.12);
          color: #fff;
        }
        .opportunities-calendar .fc-daygrid-day-frame {
          min-height: 0;
        }
        .opportunities-calendar .fc-event {
          border: none;
          border-radius: 6px;
          padding: 2px 6px;
          font-size: 0.75rem;
          font-weight: 500;
        }
        .opportunities-calendar .fc-event:hover {
          filter: brightness(0.95);
        }
        .opportunities-calendar .fc-daygrid-event-harness {
          margin: 1px 2px;
        }
        .opportunities-calendar .fc-daygrid-more-link {
          font-size: 0.6875rem;
          font-weight: 500;
        }
      `}</style>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-dark-900 tracking-tight">Proposal due calendar</h1>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-0.5">
            By due date. Click a block to open the opportunity.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500 dark:text-dark-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[var(--cal-not-started)]" aria-hidden /> Not started
          </span>
          <span className="inline-flex items-center gap-1.5" title="Working on the estimate">
            <span className="w-2.5 h-2.5 rounded-sm bg-[var(--cal-in-progress)]" aria-hidden /> In progress
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[var(--cal-sent)]" aria-hidden /> Sent
          </span>
          <span className="inline-flex items-center gap-1.5" title="Not submitting a quote for this opportunity">
            <span className="w-2.5 h-2.5 rounded-sm bg-[var(--cal-gray)]" aria-hidden /> No Quote
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200/80 dark:border-dark-300 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-24 text-gray-500 dark:text-dark-400 text-sm">
            Loading calendar…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-300 bg-gray-50/50 dark:bg-dark-200/50">
              <button
                type="button"
                onClick={goPrev}
                className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-600 dark:text-dark-400 hover:bg-gray-200 dark:hover:bg-dark-300 hover:text-gray-900 dark:hover:text-dark-900 transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-sm font-semibold text-gray-900 dark:text-dark-900 tabular-nums">
                {formatMonthYear(currentDate)}
              </span>
              <button
                type="button"
                onClick={goNext}
                className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-600 dark:text-dark-400 hover:bg-gray-200 dark:hover:bg-dark-300 hover:text-gray-900 dark:hover:text-dark-900 transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <div className="px-4 pb-4 pt-1">
              <div className="flex items-center justify-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={goToday}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                    isCurrentMonth
                      ? 'bg-gray-200 dark:bg-dark-300 text-gray-700 dark:text-dark-200'
                      : 'text-gray-600 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-200'
                  }`}
                >
                  Today
                </button>
              </div>
              {/* Days of the week at the top */}
              <div className="grid grid-cols-7 border-b border-gray-200 dark:border-dark-300 bg-gray-50 dark:bg-dark-200/60">
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
                  <div
                    key={day}
                    className="py-2.5 text-center text-sm font-semibold text-gray-700 dark:text-dark-300"
                  >
                    {day}
                  </div>
                ))}
              </div>
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={false}
                firstDay={0}
                dayHeaders={false}
                datesSet={handleDatesSet}
                events={events}
                eventClick={handleEventClick}
                dayMaxEvents={4}
                height="auto"
                eventDisplay="block"
                eventContent={(arg) => (
                  <div className="fc-event-main-frame overflow-hidden">
                    <div className="fc-event-title truncate text-xs font-medium" title={arg.event.title}>
                      {arg.event.title}
                    </div>
                  </div>
                )}
                eventDidMount={(info) => {
                  const el = info.el as HTMLElement;
                  el.style.cursor = 'pointer';
                  el.style.overflow = 'hidden';
                  el.style.textOverflow = 'ellipsis';
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default OpportunitiesCalendarView;
