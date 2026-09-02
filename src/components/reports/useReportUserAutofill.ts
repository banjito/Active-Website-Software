import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useDemoMode } from "@/lib/DemoModeContext";
import { reportIdFromUrl } from "./common/reportIdentity";

/**
 * The job's "User" once fetched, keyed by job id. A job page opens a dozen
 * reports in a session and the value never changes while it is open, so the
 * first report to ask pays for the lookup and the rest read it from here.
 */
const endUserCache = new Map<string, string>();

/**
 * The "User" for a job: the company or facility that will own the building,
 * which is what the "User" field on a report means. It is set on the job
 * (Job Details -> Edit -> "User"), not derived from whoever is signed in.
 *
 * Returns "" until the lookup lands, and "" when the job has no User set.
 */
export function useJobEndUser(jobId: string | undefined | null): string {
  const [value, setValue] = useState(() =>
    jobId ? (endUserCache.get(jobId) ?? "") : "",
  );

  useEffect(() => {
    if (!jobId) {
      setValue("");
      return;
    }

    const cached = endUserCache.get(jobId);
    if (cached !== undefined) {
      setValue(cached);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("end_user")
        .eq("id", jobId)
        .maybeSingle();
      // A job in lab_ops, or an older database without the column, simply has
      // no User to offer -- leave the field blank rather than guessing.
      if (error) return;
      const endUser = ((data as any)?.end_user || "").trim();
      endUserCache.set(jobId, endUser);
      if (!cancelled) setValue(endUser);
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return value;
}

/** Forget a job's cached "User" so the next report re-reads it. */
export function clearJobEndUserCache(jobId?: string): void {
  if (jobId) endUserCache.delete(jobId);
  else endUserCache.clear();
}

/**
 * Autofills a report's "User" header field from the job's User.
 *
 * Only fills brand-new reports -- a report that already exists on the job keeps
 * whatever was typed on it, so changing the job's User never rewrites reports
 * that are already filled out, in review, or approved. A value already in the
 * field is never overwritten either.
 *
 * @param setFormData the report's form-state setter
 * @param reportId    report id from the route; undefined means "new report"
 * @param field       form-state key holding the User value ("userName", "user", ...)
 * @param jobIdOverride job id, when the report does not take it from the `:id` route param
 */
export function useReportUserAutofill<T extends Record<string, any>>(
  setFormData: Dispatch<SetStateAction<T>>,
  reportId: string | undefined | null,
  field: keyof T & string,
  jobIdOverride?: string,
): void {
  const { id: routeJobId } = useParams<{ id?: string }>();
  const { maskCustomerName } = useDemoMode();

  // Whether this was a new report when the page opened. Auto-save creates the
  // row and rewrites the address bar mid-session, and some reports parse their
  // id out of the URL a tick after mount, so "new" is decided once, on the
  // first render, and not re-read afterwards.
  const startedNewRef = useRef<boolean | null>(null);
  if (startedNewRef.current === null) {
    startedNewRef.current = !reportId && !reportIdFromUrl();
  }

  // An existing report never needs the job's User, so it never looks it up.
  const jobId = startedNewRef.current
    ? (jobIdOverride ?? routeJobId)
    : undefined;
  const endUser = useJobEndUser(jobId);

  useEffect(() => {
    if (!endUser) return;
    const value = maskCustomerName(endUser);
    setFormData((prev) => {
      const current = prev?.[field];
      if (typeof current === "string" && current.trim()) return prev;
      return { ...prev, [field]: value } as T;
    });
  }, [endUser, field, maskCustomerName, setFormData]);
}

export default useReportUserAutofill;
