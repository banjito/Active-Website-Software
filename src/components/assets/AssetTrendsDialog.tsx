/**
 * Trends for one piece of equipment: chart the same readings across every
 * custom-form report filed on it (e.g. yearly IR on a switchgear).
 *
 * Pick the form, the table, which columns and which rows; each column/row
 * pair is a line across the reports' test dates. Values can be shown in one
 * unit. A table below lists the values with a link to each report, and the
 * trend downloads as CSV.
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
import { Download, ExternalLink, TrendingDown, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { supabase } from "@/lib/supabase";
import type { CustomFormStructure } from "@/lib/types/customForms";
import { adaptStoredData, parseStoredData, projectStateToRuntime } from "@/lib/customForms/instanceState";
import {
  buildTrend,
  filledRowCount,
  rowLabel,
  trendChange,
  trendCsv,
  trendDate,
  type TrendReport,
} from "@/lib/customForms/assetTrends";
import { CHART_COLORS } from "@/lib/customForms/chart";
import { UNIT_CHOICES } from "@/lib/customForms/unitResolution";

const box =
  "h-8 px-2 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white";

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y}` : iso;
};

interface TemplateInfo {
  id: string;
  name: string;
  structure: CustomFormStructure;
}

/** Every custom-form report linked to the asset, read and ready to trend. */
async function loadAssetReports(assetId: string): Promise<{ reports: TrendReport[]; templates: TemplateInfo[] }> {
  const { data: links, error } = await supabase
    .schema("neta_ops")
    .from("assets")
    .select("file_url")
    .eq("equipment_asset_id", assetId)
    .like("file_url", "custom-form:%");
  if (error) throw error;
  const ids = new Map<string, string>(); // instance id → template id
  for (const link of links ?? []) {
    const m = String((link as any).file_url).match(/custom-form\/([^/]+)\/([^/?#]+)/);
    if (m && m[2] !== "new") ids.set(m[2], m[1]);
  }
  if (!ids.size) return { reports: [], templates: [] };

  const [{ data: rows, error: rowsError }, { data: templateRows, error: tError }] = await Promise.all([
    supabase
      .schema("neta_ops")
      .from("custom_form_instances")
      .select("id, template_id, job_id, data, status, created_at")
      .in("id", [...ids.keys()]),
    supabase
      .schema("neta_ops")
      .from("custom_form_templates")
      .select("id, name, structure")
      .in("id", [...new Set(ids.values())]),
  ]);
  if (rowsError) throw rowsError;
  if (tError) throw tError;

  const templates: TemplateInfo[] = (templateRows ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    structure: t.structure as CustomFormStructure,
  }));
  const reports: TrendReport[] = [];
  for (const row of rows ?? []) {
    const template = templates.find((t) => t.id === (row as any).template_id);
    if (!template?.structure?.sections) continue;
    const data = projectStateToRuntime(adaptStoredData(parseStoredData((row as any).data), template.structure));
    const when = trendDate(template.structure, data, (row as any).created_at);
    reports.push({
      instanceId: (row as any).id,
      templateId: template.id,
      jobId: (row as any).job_id,
      status: (row as any).status,
      structure: template.structure,
      data,
      date: when.date,
      dateFromForm: when.fromForm,
    });
  }
  return { reports, templates };
}

export const AssetTrendsDialog: React.FC<{
  assetId: string;
  assetName: string;
  open: boolean;
  onClose: () => void;
}> = ({ assetId, assetName, open, onClose }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<TrendReport[]>([]);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [columnIds, setColumnIds] = useState<string[]>([]);
  const [rows, setRows] = useState<number[]>([]);
  const [unit, setUnit] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadAssetReports(assetId)
      .then((result) => {
        if (cancelled) return;
        setReports(result.reports);
        setTemplates(result.templates.filter((t) => result.reports.some((r) => r.templateId === t.id)));
      })
      .catch((err) => !cancelled && setError(err?.message || "Could not load this equipment's reports."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, assetId]);

  const template = templates.find((t) => t.id === templateId) ?? templates[0];
  const formReports = reports.filter((r) => r.templateId === template?.id);
  const tables = (template?.structure.sections ?? []).filter((s) => s.columns?.length);
  const section = tables.find((s) => s.id === sectionId) ?? tables[0];
  // A table may have had rows added on site; offer every row any report filled.
  const rowCount = section ? Math.max(0, ...formReports.map((r) => filledRowCount(section, r.data))) : 0;
  const reference = formReports[formReports.length - 1];

  // Sensible first picks: the first number column, every row.
  useEffect(() => {
    if (!section) return;
    const numeric = (section.columns ?? []).filter((c) => c.field.type === "number" || c.field.cellBehavior === "calculate");
    setColumnIds(numeric.slice(0, 1).map((c) => c.id));
    setRows(Array.from({ length: Math.min(rowCount, 6) }, (_, i) => i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section?.id, template?.id]);

  const trend = useMemo(
    () =>
      section
        ? buildTrend({ reports: formReports, sectionId: section.id, columnIds, rows, unit: unit || undefined })
        : { series: [], points: [] },
    [formReports, section, columnIds, rows, unit],
  );

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const downloadCsv = () => {
    const blob = new Blob([trendCsv(trend.series, trend.points)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${assetName || "equipment"} - ${section?.title ?? "trend"}.csv`.replace(/[\\/:*?"<>|]/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  };

  const openReport = (r: TrendReport) => navigate(`/jobs/${r.jobId}/custom-form/${r.templateId}/${r.instanceId}`);

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
            The same readings across every custom-form report on this equipment, by test date.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="py-12 flex justify-center">
              <LoadingSpinner size="md" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : !reports.length ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              No custom-form reports are linked to this equipment yet. (Built reports aren't included.)
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
                  <span className="block font-medium">Form</span>
                  <select value={template?.id ?? ""} onChange={(e) => { setTemplateId(e.target.value); setSectionId(""); }} className={`${box} w-64`}>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({reports.filter((r) => r.templateId === t.id).length})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
                  <span className="block font-medium">Table</span>
                  <select value={section?.id ?? ""} onChange={(e) => setSectionId(e.target.value)} className={`${box} w-64`}>
                    {tables.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
                  <span className="block font-medium">Show in</span>
                  <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${box} w-28`} title="Convert every value into this unit">
                    <option value="">as entered</option>
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

              {section && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Columns</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {(section.columns ?? []).map((c) => (
                        <label key={c.id} className="flex items-center gap-1 text-xs text-neutral-700 dark:text-neutral-200">
                          <input type="checkbox" checked={columnIds.includes(c.id)} onChange={() => setColumnIds(toggle(columnIds, c.id))} className="rounded-none" />
                          {c.label || c.id}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Rows</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {Array.from({ length: rowCount }, (_, r) => (
                        <label key={r} className="flex items-center gap-1 text-xs text-neutral-700 dark:text-neutral-200">
                          <input type="checkbox" checked={rows.includes(r)} onChange={() => setRows(toggle(rows, r).sort((a, b) => a - b))} className="rounded-none" />
                          {reference ? rowLabel(section, reference.data, r) : `Row ${r + 1}`}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {trend.points.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-500">
                  {columnIds.length && rows.length
                    ? "No readings in those cells yet."
                    : "Tick at least one column and one row."}
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
                    <table className="min-w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-neutral-100 dark:bg-dark-200 text-left">
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">Test date</th>
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
                          const report = formReports.find((r) => r.instanceId === p.instanceId)!;
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
                              {trend.series.map((s) => (
                                <td key={s.key} className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 tabular-nums">
                                  {p[s.key] == null ? "—" : String(p[s.key])}
                                </td>
                              ))}
                              <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                                <button type="button" onClick={() => openReport(report)} className="inline-flex items-center gap-1 text-brand hover:underline">
                                  <ExternalLink className="w-3 h-3" /> Open
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {unit && (
                    <p className="text-[11px] text-neutral-500">
                      Values are converted into {unit} from the unit each report recorded. A value with a
                      unit of another kind is left out ("—").
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssetTrendsDialog;
