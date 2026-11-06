import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

/**
 * Counts time spent in a report, in the background. Nothing shows on screen.
 *
 * Every 15 seconds while the report page is on screen and in edit mode it adds to
 * "open" time, and to "active" time too if the person touched, typed or scrolled in
 * the last 5 minutes. Once a minute (and when the tab hides or closes) it sends the
 * totals to common.report_time_ping. Results: Admin Dashboard → Report time.
 *
 * Reads the job, report page and report id from the URL: /jobs/:jobId/:report/:reportId.
 * Table and functions: database/migrations/report_time.sql.
 */

const TICK_SECONDS = 15;
const FLUSH_EVERY_SECONDS = 60;
const IDLE_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart', 'scroll'] as const;
const REPORT_PATH = /^\/jobs\/([0-9a-f-]{36})\/([a-z0-9-]+)(?:\/([0-9a-f-]{36}))?/i;

export function useReportTimer(enabled: boolean) {
  const { pathname } = useLocation();
  const match = pathname.match(REPORT_PATH);
  const jobId = match?.[1] ?? null;
  const reportType = match?.[2] ?? null;
  const reportId = match?.[3] ?? null;

  const state = useRef({
    sessionId: crypto.randomUUID(),
    key: '',
    jobId: null as string | null,
    reportType: null as string | null,
    reportId: null as string | null,
    active: 0,
    open: 0,
    lastTouch: Date.now(),
  });

  // Sends what's counted so far for the current session (read from the ref, so a
  // session that just ended is sent under its own report)
  const flush = () => {
    const s = state.current;
    if (!s.reportType || (s.active <= 0 && s.open <= 0)) return;
    // A new report writes its id into the address bar with history.replaceState,
    // which the router never sees, so read it straight from the address bar.
    if (!s.reportId) {
      const live = window.location.pathname.match(REPORT_PATH);
      if (live && live[1] === s.jobId && live[2] === s.reportType && live[3]) s.reportId = live[3];
    }
    const payload = {
      p_session_id: s.sessionId,
      p_report_type: s.reportType,
      p_report_id: s.reportId,
      p_job_id: s.jobId,
      p_active_seconds: s.active,
      p_open_seconds: s.open,
    };
    s.active = 0;
    s.open = 0;
    // Best effort: a lost minute is fine, an error message is not
    void supabase
      .schema('common')
      .rpc('report_time_ping', payload)
      .then(({ error }) => {
        if (error) console.warn('[report time] not recorded:', error.message);
      });
  };

  // A different report starts a new session. A new report getting its id on first
  // save keeps the same one.
  const key = `${jobId}/${reportType}`;
  useEffect(() => {
    const s = state.current;
    if (s.key !== key || (s.reportId && reportId && s.reportId !== reportId)) {
      if (s.key) flush();
      s.sessionId = crypto.randomUUID();
      s.key = key;
      s.jobId = jobId;
      s.reportType = reportType;
      s.reportId = reportId;
      s.active = 0;
      s.open = 0;
    } else if (!s.reportId && reportId) {
      s.reportId = reportId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reportId]);

  useEffect(() => {
    if (!enabled || !reportType) return;
    const touch = () => {
      state.current.lastTouch = Date.now();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));

    let sinceFlush = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const cur = state.current;
      cur.open += TICK_SECONDS;
      if (Date.now() - cur.lastTouch <= IDLE_MS) cur.active += TICK_SECONDS;
      sinceFlush += TICK_SECONDS;
      if (sinceFlush >= FLUSH_EVERY_SECONDS) {
        sinceFlush = 0;
        flush();
      }
    }, TICK_SECONDS * 1000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);

    return () => {
      window.clearInterval(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, touch, { capture: true }));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
    // flush reads from the ref; re-subscribing on every render isn't needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reportType, jobId]);
}
