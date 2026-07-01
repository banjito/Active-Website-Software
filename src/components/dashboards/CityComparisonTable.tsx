import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "@/components/ui/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { supabase } from "@/lib/supabase";
import { useDivision } from "@/App";
import { formatDivisionDisplay } from "@/lib/utils/divisionDisplay";
import { FIELD_TECH_DIVISIONS } from "@/app/dashboards/FieldTechDashboard";

interface CityCounts {
  division: string;
  total: number;
  active: number;
  upcoming: number;
  completed: number;
}

const emptyCounts = (division: string): CityCounts => ({
  division,
  total: 0,
  active: 0,
  upcoming: 0,
  completed: 0,
});

/**
 * Per-city job breakdown shown at the top of the Field Technician Portal.
 *
 * Data comes only from real rows in neta_ops.jobs. "Total" is every
 * non-deleted job for the city regardless of status; Active/Upcoming/Completed
 * are the in_progress/pending/completed subsets (matching FieldTechDashboard's
 * count cards), so those three will not sum to Total when other statuses exist.
 */
export const CityComparisonTable: React.FC = () => {
  const navigate = useNavigate();
  const { setDivision } = useDivision();
  const [rows, setRows] = useState<CityCounts[]>(
    FIELD_TECH_DIVISIONS.map(emptyCounts),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase
          .schema("neta_ops")
          .from("jobs")
          .select("division, status")
          .is("deleted_at", null)
          .in("division", FIELD_TECH_DIVISIONS);

        if (queryError) throw queryError;

        const byDivision: Record<string, CityCounts> = {};
        for (const division of FIELD_TECH_DIVISIONS) {
          byDivision[division] = emptyCounts(division);
        }

        for (const job of data ?? []) {
          const bucket = byDivision[(job as any).division];
          if (!bucket) continue;
          bucket.total += 1;
          const status = (job as any).status;
          if (status === "in_progress") bucket.active += 1;
          else if (status === "pending") bucket.upcoming += 1;
          else if (status === "completed") bucket.completed += 1;
        }

        if (!cancelled) {
          setRows(FIELD_TECH_DIVISIONS.map((d) => byDivision[d]));
        }
      } catch (e) {
        console.error("CityComparisonTable: failed to load job counts", e);
        if (!cancelled) setError("Unable to load city comparison data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const goToCity = (division: string) => {
    setDivision(division);
    navigate(`/${division}/jobs`);
  };

  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      active: acc.active + r.active,
      upcoming: acc.upcoming + r.upcoming,
      completed: acc.completed + r.completed,
    }),
    { total: 0, active: 0, upcoming: 0, completed: 0 },
  );

  const text = (value: number) => (loading ? "—" : value.toLocaleString());

  const toneClasses: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    amber:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    green:
      "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  };

  // Soft, color-coded count pill; zero values stay quiet so the eye lands on
  // the cities that actually have work.
  const chip = (value: number, tone: keyof typeof toneClasses) => (
    <span
      className={`inline-flex min-w-[2.25rem] items-center justify-center rounded-none px-2.5 py-1 text-sm font-semibold tabular-nums ${
        value === 0 && !loading
          ? "text-neutral-300 dark:text-dark-400"
          : toneClasses[tone]
      }`}
    >
      {text(value)}
    </span>
  );

  const headDot = (tone: "blue" | "amber" | "green", label: string) => (
    <span className="inline-flex items-center justify-center gap-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-none ${
          tone === "blue"
            ? "bg-blue-500"
            : tone === "amber"
              ? "bg-amber-500"
              : "bg-green-500"
        }`}
      />
      {label}
    </span>
  );

  return (
    <Card className="mb-6 sm:mb-8 p-4 sm:p-6">
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="!border-0 hover:!bg-transparent">
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-dark-400">
                City
              </TableHead>
              <TableHead className="text-center text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-dark-400">
                Total
              </TableHead>
              <TableHead className="text-center text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-dark-400">
                {headDot("blue", "Active")}
              </TableHead>
              <TableHead className="text-center text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-dark-400">
                {headDot("amber", "Upcoming")}
              </TableHead>
              <TableHead className="text-center text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-dark-400">
                {headDot("green", "Completed")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.division}
                onClick={() => goToCity(r.division)}
                className="group cursor-pointer !border-0 transition-colors hover:!bg-neutral-50 dark:hover:!bg-dark-200/60"
              >
                <TableCell className="font-medium text-neutral-800 transition-colors group-hover:text-[#f26722] dark:text-white">
                  {formatDivisionDisplay(r.division)}
                </TableCell>
                <TableCell className="text-center text-sm font-semibold tabular-nums text-neutral-900 dark:text-white">
                  {text(r.total)}
                </TableCell>
                <TableCell className="text-center">
                  {chip(r.active, "blue")}
                </TableCell>
                <TableCell className="text-center">
                  {chip(r.upcoming, "amber")}
                </TableCell>
                <TableCell className="text-center">
                  {chip(r.completed, "green")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter className="!bg-transparent">
            <TableRow className="!border-0 hover:!bg-transparent">
              <TableCell className="border-t border-neutral-200 font-semibold text-neutral-900 dark:border-dark-300 dark:text-white">
                Total
              </TableCell>
              <TableCell className="border-t border-neutral-200 text-center text-sm font-bold tabular-nums text-neutral-900 dark:border-dark-300 dark:text-white">
                {text(totals.total)}
              </TableCell>
              <TableCell className="border-t border-neutral-200 text-center text-sm font-semibold tabular-nums text-blue-700 dark:border-dark-300 dark:text-blue-300">
                {text(totals.active)}
              </TableCell>
              <TableCell className="border-t border-neutral-200 text-center text-sm font-semibold tabular-nums text-amber-700 dark:border-dark-300 dark:text-amber-300">
                {text(totals.upcoming)}
              </TableCell>
              <TableCell className="border-t border-neutral-200 text-center text-sm font-semibold tabular-nums text-green-700 dark:border-dark-300 dark:text-green-300">
                {text(totals.completed)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </Card>
  );
};

export default CityComparisonTable;
