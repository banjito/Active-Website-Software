import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Old per-browser cache. Still used so colors show instantly before the
// shared list loads, and as a one-time source to move old colors up.
const LOCAL_KEY = "calendar_job_colors";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^#[0-9a-f]{6}$/i;

const readLocal = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

/**
 * Job colors for the schedule, shared by everyone (common.schedule_job_colors).
 * Admins/Schedulers can change them; everyone sees the same colors.
 */
export function useScheduleJobColors(canEdit: boolean) {
  const [jobColors, setJobColors] =
    useState<Record<string, string>>(readLocal);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const table = () =>
        supabase.schema("common").from("schedule_job_colors");
      const { data, error } = await table().select("job_id, color");
      if (error) {
        // Table not created yet, or offline: keep this browser's colors.
        console.error("Failed to load shared job colors:", error);
        return;
      }
      const shared: Record<string, string> = {};
      (data || []).forEach((r: any) => {
        shared[r.job_id] = r.color;
      });

      // One-time move: colors that only lived in this browser get shared.
      // Colors already shared win.
      const local = readLocal();
      const localOnly = Object.entries(local).filter(
        ([id, c]) => !shared[id] && UUID_RE.test(id) && HEX_RE.test(c),
      );
      if (canEdit && localOnly.length > 0) {
        const { error: upErr } = await table().upsert(
          localOnly.map(([job_id, color]) => ({ job_id, color })),
          { onConflict: "job_id", ignoreDuplicates: true },
        );
        if (upErr) console.error("Failed to share old job colors:", upErr);
      }

      if (mounted) setJobColors({ ...local, ...shared });
    })();
    return () => {
      mounted = false;
    };
  }, [canEdit]);

  // Keep the browser cache in step so colors show instantly next time.
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(jobColors));
    } catch {}
  }, [jobColors]);

  const setJobColor = useCallback(
    async (jobId: string, color: string) => {
      if (!jobId || !HEX_RE.test(color)) return;
      setJobColors((prev) =>
        prev[jobId] === color ? prev : { ...prev, [jobId]: color },
      );
      if (!canEdit) return;
      const { error } = await supabase
        .schema("common")
        .from("schedule_job_colors")
        .upsert(
          { job_id: jobId, color, updated_at: new Date().toISOString() },
          { onConflict: "job_id" },
        );
      if (error) console.error("Failed to save job color:", error);
    },
    [canEdit],
  );

  return { jobColors, setJobColor };
}
