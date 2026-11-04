import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { schedulingService } from "@/lib/services/schedulingService";
import { useDivisions } from "@/hooks/useDivisions";
import { fieldTechCities } from "@/services/divisionsService";
import { weekStartOf } from "@/lib/scheduleTime";

type CityStats = { people: number; jobs: number };

type Props = {
  /** Bump to recount after an edit or delete. */
  refreshKey?: number;
};

/**
 * Field Tech (All) shortcuts: one card per city with this week's counts.
 * Clicking a card opens that city's schedule (where jobs get added).
 */
export const DivisionScheduleCards: React.FC<Props> = ({ refreshKey }) => {
  const cities = fieldTechCities(useDivisions());
  const cityIds = useMemo(() => cities.map((c) => c.id), [cities]);
  const cityKey = cityIds.join(",");
  const [stats, setStats] = useState<Record<string, CityStats> | null>(null);

  const weekStart = weekStartOf(dayjs());
  const weekEnd = dayjs(weekStart).add(6, "day").format("YYYY-MM-DD");

  useEffect(() => {
    if (cityIds.length === 0) return;
    let mounted = true;
    (async () => {
      const [{ data, error }, deactivated] = await Promise.all([
        supabase
          .schema("common")
          .from("technician_assignments")
          .select("user_id, job_id, division")
          .eq("portal_type", "neta")
          .in("division", cityIds)
          .gte("assignment_date", weekStart)
          .lte("assignment_date", weekEnd),
        schedulingService.getDeactivatedUserIds(),
      ]);
      if (error) {
        console.error("Failed to load division counts:", error);
        return;
      }
      const people: Record<string, Set<string>> = {};
      const jobs: Record<string, Set<string>> = {};
      (data || []).forEach((r: any) => {
        if (deactivated.has(r.user_id)) return;
        (people[r.division] ||= new Set()).add(r.user_id);
        (jobs[r.division] ||= new Set()).add(r.job_id);
      });
      const next: Record<string, CityStats> = {};
      cityIds.forEach((id) => {
        next[id] = {
          people: people[id]?.size || 0,
          jobs: jobs[id]?.size || 0,
        };
      });
      if (mounted) setStats(next);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityKey, weekStart, refreshKey]);

  if (cities.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Divisions this week ({dayjs(weekStart).format("MMM D")} -{" "}
        {dayjs(weekEnd).format("MMM D")})
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cities.map((city) => {
          const s = stats?.[city.id];
          return (
            <Link
              key={city.id}
              to={`/${city.id}/scheduling`}
              className="group flex items-center justify-between gap-2 rounded-none border border-neutral-200 bg-white px-4 py-3 transition-colors hover:border-brand dark:border-neutral-700 dark:bg-dark-150 dark:hover:border-brand"
              title={`Open ${city.label} scheduling`}
            >
              <div className="min-w-0">
                <div className="truncate font-semibold text-neutral-900 dark:text-white">
                  {city.label}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {s
                    ? `${s.people} ${s.people === 1 ? "person" : "people"} · ${s.jobs} ${s.jobs === 1 ? "job" : "jobs"}`
                    : "..."}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 transition-colors group-hover:text-brand" />
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default DivisionScheduleCards;
