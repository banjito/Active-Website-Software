import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import { ChevronRight, MapPin } from "lucide-react";
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cities.map((city) => {
          const s = stats?.[city.id];
          return (
            <Link
              key={city.id}
              to={`/${city.id}/scheduling`}
              className="group flex flex-col gap-4 rounded-none border border-neutral-200 bg-white p-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-brand dark:border-neutral-700 dark:bg-dark-150 dark:hover:border-brand"
              title={`Open ${city.label} scheduling`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin className="h-5 w-5 shrink-0 text-brand" />
                  <span className="truncate text-lg font-semibold text-neutral-900 dark:text-white">
                    {city.label}
                  </span>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-neutral-400 transition-colors group-hover:text-brand" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                    {s ? s.people : "-"}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {s?.people === 1 ? "Person" : "People"}
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                    {s ? s.jobs : "-"}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {s?.jobs === 1 ? "Job" : "Jobs"}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default DivisionScheduleCards;
