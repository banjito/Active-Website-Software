import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useAuth } from "@/lib/AuthContext";

/**
 * Display name of the signed-in employee, as it should appear in a report's
 * "User" header field. Empty string when there is no name to use — notably the
 * headless print-token session, which has no display name.
 */
export function useCurrentUserDisplayName(): string {
  const { user } = useAuth();
  const metadata = user?.user_metadata as
    | { name?: string; full_name?: string }
    | undefined;
  return (metadata?.name || metadata?.full_name || "").trim();
}

/**
 * Autofills a report's "User" header field with the signed-in employee's name.
 *
 * Only fills brand-new reports (no report id in the URL) and never overwrites a
 * value that is already there — whether typed by the technician or loaded from a
 * saved report — so opening someone else's report never restamps it with the
 * current viewer's name.
 *
 * @param setFormData the report's form-state setter
 * @param reportId    report id from the URL; undefined means "new report"
 * @param field       form-state key holding the User value ("userName" or "user")
 */
export function useReportUserAutofill<T extends Record<string, any>>(
  setFormData: Dispatch<SetStateAction<T>>,
  reportId: string | undefined | null,
  field: keyof T & string,
): void {
  const displayName = useCurrentUserDisplayName();

  useEffect(() => {
    if (reportId || !displayName) return;
    setFormData((prev) => {
      const current = prev?.[field];
      if (typeof current === "string" && current.trim()) return prev;
      return { ...prev, [field]: displayName } as T;
    });
  }, [reportId, displayName, field, setFormData]);
}

export default useReportUserAutofill;
