/**
 * Trends for one piece of equipment: chart the same results across every report
 * filed on it, custom forms and built-in reports alike.
 *
 * Tick the readings to compare. Like fields line up on their own; the mapping
 * tool covers fields that are named differently on different report types.
 * Only results are offered, never job details, nameplate data or inspections.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, ExternalLink, Link2, TrendingDown, TrendingUp } from "lucide-react";
import toast from "react-hot-toast";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { trendChange, trendCsv } from "@/lib/customForms/assetTrends";
import { CHART_COLORS } from "@/lib/customForms/chart";
import { UNIT_CHOICES } from "@/lib/customForms/unitResolution";
import type { TrendEntry } from "@/lib/trends/readings";
import {
  buildLineTrend,
  buildTrendLines,
  firstLines,
  groupLines,
  type MappingMember,
  type TrendMapping,
} from "@/lib/trends/trendLines";
import {
  deleteTrendMapping,
  fetchTrendMappings,
  loadAssetTrendEntries,
  saveTrendMapping,
} from "@/services/assetTrendsService";
import { canEditDiagramDefaults } from "@/services/siteDiagramsService";
import { TrendMatchPanel } from "./TrendMatchPanel";

const box =
  "h-8 px-2 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white";

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y}` : iso;
};

export const AssetTrendsDialog: React.FC<{
  assetId: string;
  assetName: string;
  open: boolean;
  onClose: () => void;
}> = ({ assetId, assetName, open, onClose }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<TrendEntry[]>([]);
  const [unread, setUnread] = useState(0);
  const [empty, setEmpty] = useState(0);
  const [saved, setSaved] = useState<TrendMapping[]>([]);
  const [temporary, setTemporary] = useState<TrendMapping[]>([]);
  const [savingAvailable, setSavingAvailable] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [unit, setUnit] = useState("");
  const [matching, setMatching] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([loadAssetTrendEntries(assetId), fetchTrendMappings(), canEditDiagramDefaults()])
      .then(([reports, saved, allowed]) => {
        if (cancelled) return;
        setEntries(reports.entries);
        setUnread(reports.unread);
        setEmpty(reports.empty);
        setSaved(saved.mappings);
        setSavingAvailable(saved.available);
        setCanSave(allowed);
        setSelected(firstLines(buildTrendLines(reports.entries, saved.mappings)));
      })
      .catch((err) => !cancelled && setError(err?.message || "Could not load this equipment's reports."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, assetId]);

  // A comparison in this window outranks a saved match on the same fields.
  const mappings = useMemo(() => [...temporary, ...saved], [temporary, saved]);
  const lines = useMemo(() => buildTrendLines(entries, mappings), [entries, mappings]);
  const chosen = useMemo(() => lines.filter((line) => selected.includes(line.key)), [lines, selected]);
  const trend = useMemo(() => buildLineTrend(entries, chosen, unit || undefined), [entries, chosen, unit]);

  const groups = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = lines.filter((line) => {
      const text = `${line.group} ${line.label}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
    return groupLines(shown);
  }, [lines, query]);

  const toggle = (key: string) =>
    setSelected((list) => (list.includes(key) ? list.filter((x) => x !== key) : [...list, key]));

  const compare = (mapping: TrendMapping) => {
    setTemporary((list) => [mapping, ...list.filter((m) => m.id !== mapping.id)]);
    setSelected((list) => [...new Set([...list, `map:${mapping.id}`])]);
  };

  const save = async (mapping: { id?: string; name: string; members: MappingMember[] }, tempId?: string) => {
    try {
      const result = await saveTrendMapping(mapping);
      setSaved((list) => [...list.filter((m) => m.id !== result.id), result]);
      setTemporary((list) => list.filter((m) => m.id !== tempId));
      setSelected((list) => [...new Set([...list.filter((key) => key !== `map:${tempId}`), `map:${result.id}`])]);
      toast.success("Match saved.");
    } catch (err) {
      console.error("Failed to save the match:", err);
      toast.error("The match couldn't be saved.");
      throw err;
    }
  };

  const remove = async (mapping: TrendMapping) => {
    if (!mapping.saved) {
      setTemporary((list) => list.filter((m) => m.id !== mapping.id));
      return;
    }
    try {
      await deleteTrendMapping(mapping.id);
      setSaved((list) => list.filter((m) => m.id !== mapping.id));
    } catch (err) {
      console.error("Failed to delete the match:", err);
      toast.error("The match couldn't be deleted.");
    }
  };

  const downloadCsv = () => {
    const blob = new Blob([trendCsv(trend.series, trend.points)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${assetName || "equipment"} - trend.csv`.replace(/[\\/:*?"<>|]/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  };

  const skipped = [
    unread > 0 && `${unread} ${unread === 1 ? "report" : "reports"} couldn't be read`,
    empty > 0 && `${empty} ${empty === 1 ? "report has" : "reports have"} no results to chart`,
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[min(80rem,96vw)] max-w-none max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden"
      >
        <div className="px-4 py-3 pr-12 border-b border-neutral-200 dark:border-neutral-700">
          <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-white">
            Trends · {assetName}
          </DialogTitle>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Results from every report on this equipment, by test date.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="py-12 flex justify-center">
              <LoadingSpinner size="md" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : !entries.length ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              No results to chart yet.{skipped.length > 0 && ` ${skipped.join("; ")}.`}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
                  <span className="block font-medium">Show in</span>
                  <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${box} w-36`} title="Convert every value into this unit">
                    <option value="">each line's unit</option>
                    {UNIT_CHOICES.map((g) => (
                      <optgroup key={g.kind} label={g.kind}>
                        {g.units.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <Button
                  variant={matching ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setMatching(!matching)}
                  leftIcon={<Link2 className="w-3.5 h-3.5" />}
                >
                  Match fields
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadCsv}
                  disabled={!trend.points.length}
                  className="ml-auto"
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                >
                  CSV
                </Button>
              </div>

              {matching && (
                <TrendMatchPanel
                  entries={entries}
                  mappings={mappings}
                  canSave={canSave}
                  savingAvailable={savingAvailable}
                  onCompare={compare}
                  onSave={save}
                  onRemove={remove}
                />
              )}

              <div className="grid gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
                <div className="space-y-2 min-w-0">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find a reading"
                    aria-label="Find a reading"
                    className={`${box} w-full`}
                  />
                  <div className="max-h-60 md:max-h-[32rem] overflow-y-auto border border-neutral-200 dark:border-neutral-700 p-2 space-y-3">
                    {groups.map(({ group, lines: groupLinesShown }) => (
                      <div key={group}>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{group}</div>
                        {groupLinesShown.map((line) => (
                          <label key={line.key} className="flex items-start gap-1.5 py-0.5 text-xs text-neutral-700 dark:text-neutral-200">
                            <input
                              type="checkbox"
                              checked={selected.includes(line.key)}
                              onChange={() => toggle(line.key)}
                              className="rounded-none mt-0.5"
                            />
                            <span className="min-w-0 flex-1 break-words">
                              {line.label}
                              {line.mappingId && <Link2 className="inline w-3 h-3 ml-1 text-brand" aria-label="Matched" />}
                            </span>
                            <span className="text-neutral-400 tabular-nums" title="Reports with this reading">
                              {line.reportCount}
                            </span>
                          </label>
                        ))}
                      </div>
                    ))}
                    {!groups.length && <p className="text-xs text-neutral-500">No readings match.</p>}
                  </div>
                </div>

                <div className="space-y-3 min-w-0">
              {trend.points.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-500">
                  {chosen.length ? "None of those readings can be shown in that unit." : "Tick at least one reading."}
                </p>
              ) : (
                <>
                  <div className="h-80 border border-neutral-200 dark:border-neutral-700 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend.points} margin={{ top: 8, right: 16, bottom: 8, left: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d4" />
                        <XAxis
                          dataKey="t"
                          type="number"
                          scale="time"
                          domain={["dataMin", "dataMax"]}
                          tickFormatter={(t) => new Date(t).toLocaleDateString()}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis tick={{ fontSize: 10 }} width={56} label={unit ? { value: unit, angle: -90, position: "insideLeft", fontSize: 10 } : undefined} />
                        <Tooltip labelFormatter={(t) => new Date(Number(t)).toLocaleDateString()} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {trend.series.map((s, i) => (
                          <Line
                            key={s.key}
                            dataKey={s.key}
                            name={s.label}
                            stroke={CHART_COLORS[i % CHART_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            connectNulls
                            isAnimationActive={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-xs text-neutral-800 dark:text-neutral-200">
                      <thead>
                        <tr className="bg-neutral-100 dark:bg-dark-200 text-left">
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">Test date</th>
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">Report</th>
                          {trend.series.map((s) => {
                            const change = trendChange(trend.points, s.key);
                            return (
                              <th key={s.key} className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                                {s.label}
                                {change !== null && (
                                  <span className={`ml-1 inline-flex items-center gap-0.5 font-normal ${change < 0 ? "text-red-600" : "text-green-700"}`} title="Change from the first report to the latest">
                                    {change < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                                    {change > 0 ? "+" : ""}
                                    {change.toFixed(0)}%
                                  </span>
                                )}
                              </th>
                            );
                          })}
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {trend.points.map((p) => {
                          const report = entries.find((r) => r.id === p.instanceId)!;
                          return (
                            <tr key={p.instanceId}>
                              <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 whitespace-nowrap">
                                {fmtDate(p.date)}
                                {!report.dateFromForm && (
                                  <span className="ml-1 text-neutral-400" title="This report has no test date; the date it was created is used">
                                    (created)
                                  </span>
                                )}
                              </td>
                              <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">{report.reportTypeName}</td>
                              {trend.series.map((s) => (
                                <td key={s.key} className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 tabular-nums">
                                  {p[s.key] == null ? "—" : String(p[s.key])}
                                </td>
                              ))}
                              <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                                <button type="button" onClick={() => navigate(report.path)} className="inline-flex items-center gap-1 text-brand hover:underline">
                                  <ExternalLink className="w-3 h-3" /> Open
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {trend.leftOut > 0 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      {trend.leftOut} {trend.leftOut === 1 ? "value is" : "values are"} left out ("—"): the unit can't convert to this scale.
                    </p>
                  )}
                </>
              )}
              {skipped.length > 0 && <p className="text-[11px] text-neutral-500">Left out: {skipped.join("; ")}.</p>}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssetTrendsDialog;
