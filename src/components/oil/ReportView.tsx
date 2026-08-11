import React from "react";
import {
  DGA_ROWS,
  FLUID_ROWS,
  IDENT_ROWS,
  conditionSeverity,
  severityClasses,
  severityLabel,
  trend,
  type OilReport,
  type Severity,
} from "@/lib/oilReport";

/**
 * Presentational renderer for one transformer oil analysis unit.
 *
 * Shared by the conversion workflow (/oil-results) and the saved report page
 * (/oil-results/:id), so both show byte-identical output.
 */

const Badge: React.FC<{ severity: Severity; children: React.ReactNode }> = ({
  severity,
  children,
}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-none px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${severityClasses[severity]}`}
  >
    <span className="h-1.5 w-1.5 rounded-none bg-current" aria-hidden="true" />
    {children}
  </span>
);

/** Two-column key/value grid used by the nameplate and equipment blocks. */
const SpecGrid: React.FC<{
  title: string;
  rows: [string, string][];
}> = ({ title, rows }) => (
  <div className="rounded-none border border-neutral-200 dark:border-neutral-700 overflow-hidden">
    <div className="bg-neutral-50 dark:bg-neutral-800/60 px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-700">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
        {title}
      </h3>
    </div>
    <dl className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-2 gap-2 px-4 py-2">
          <dt className="text-sm text-neutral-500 dark:text-neutral-400">
            {label}
          </dt>
          <dd className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {value || <span className="text-neutral-300 dark:text-neutral-600">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  </div>
);

/** Arrow + delta shown beside the newest value of a numeric DGA row. */
const TrendMark: React.FC<{ current?: string; previous?: string }> = ({
  current,
  previous,
}) => {
  const t = trend(current, previous);
  if (!t || t.direction === "flat") return null;
  const up = t.direction === "up";
  return (
    <span
      className={`ml-2 inline-flex items-center text-[11px] font-medium tabular-nums ${
        up
          ? "text-amber-600 dark:text-amber-400"
          : "text-emerald-600 dark:text-emerald-400"
      }`}
      title={`${up ? "Increase" : "Decrease"} of ${Math.abs(t.delta).toLocaleString()} since prior sample`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(t.delta).toLocaleString()}
    </span>
  );
};

const Cell: React.FC<{ children: React.ReactNode; muted?: boolean }> = ({
  children,
  muted,
}) => (
  <td
    className={`px-4 py-2 align-top text-sm tabular-nums ${
      muted
        ? "text-neutral-400 dark:text-neutral-500"
        : "text-neutral-900 dark:text-neutral-100"
    }`}
  >
    {children}
  </td>
);

const RowLabel: React.FC<{ children: React.ReactNode; indent?: boolean }> = ({
  children,
  indent,
}) => (
  <th
    scope="row"
    className={`py-2 pr-4 text-left text-sm font-normal text-neutral-600 dark:text-neutral-400 whitespace-nowrap ${
      indent ? "pl-8" : "pl-4"
    }`}
  >
    {children}
  </th>
);

/** Section header row spanning the full width of the results table. */
const SectionRow: React.FC<{ label: string; span: number }> = ({
  label,
  span,
}) => (
  <tr className="bg-neutral-50 dark:bg-neutral-800/60">
    <th
      scope="colgroup"
      colSpan={span}
      className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300 border-y border-neutral-200 dark:border-neutral-700"
    >
      {label}
    </th>
  </tr>
);

const ReportView: React.FC<{ report: OilReport }> = ({ report }) => {
  const { nameplate: n, equipment: e, samples } = report;
  const cols = samples.length + 1;
  const latest = samples[0];
  const latestSeverity = conditionSeverity(latest?.dgaCondition);

  /** Narrative blocks are long prose, so they render below the value table. */
  const narratives = samples
    .map((s, i) => ({ sample: s, index: i }))
    .filter(
      ({ sample }) =>
        sample.dgaAnalysis || sample.operatingProcedures || sample.oilQuality,
    );

  return (
    <div className="space-y-6">
      {/* Unit summary */}
      <div className="rounded-none border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
              {report.label}
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {n.manufacturer} {n.equipmentType} · {n.kvaRating} kVA ·{" "}
              {n.primaryKV} kV · S/N {n.serialNumber}
            </p>
          </div>
          <div className="text-right">
            <Badge severity={latestSeverity}>
              {latest?.dgaCondition
                ? `${latest.dgaCondition} · ${severityLabel[latestSeverity]}`
                : severityLabel.unknown}
            </Badge>
            <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              Latest sample {latest?.sampleDate}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SpecGrid
          title="Nameplate Data"
          rows={[
            ["Serial Number", n.serialNumber],
            ["Unit ID", n.unitId],
            ["Equipment Type", n.equipmentType],
            ["Manufacturer", n.manufacturer],
            ["Year Manufactured", n.yearManufactured],
            ["Primary kV", n.primaryKV],
            ["Gallons", n.gallons],
            ["kVA Rating", n.kvaRating],
            ["Phases", n.phases],
            ["Fluid Type", n.fluidType],
            ["Substation Location", n.substationLocation],
            ["Breathing Configuration", n.breathingConfiguration],
          ]}
        />
        <SpecGrid
          title="Equipment Information"
          rows={[
            ["Top Valve (in)", e.topValve],
            ["Bottom Valve (in)", e.bottomValve],
            ["Hose Length (ft)", e.hoseLength],
            ["Paint Condition", e.paintCondition],
            ["Conservator Tank", e.conservatorTank],
            ["Bushings Enclosed", e.bushingsEnclosed],
            ["Leaks", e.leaks],
            ["Radiators", e.radiators],
            ["Service Energized", e.serviceEnergized],
            ["Compartments", e.compartments],
          ]}
        />
      </div>

      {/* Results table: one column per sample date */}
      <div className="rounded-none border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-brand text-white">
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                >
                  Sample Date
                </th>
                {samples.map((s, i) => (
                  <th
                    key={`${s.sampleDate}-${i}`}
                    scope="col"
                    className="px-4 py-3 text-left text-sm font-semibold whitespace-nowrap"
                  >
                    {s.sampleDate}
                    {i === 0 && samples.length > 1 && (
                      <span className="ml-2 rounded-none bg-white/20 px-1.5 py-0.5 text-[10px] font-medium uppercase">
                        Latest
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              <SectionRow label="Sample Identification" span={cols} />
              {IDENT_ROWS.filter((r) =>
                samples.some((s) => s[r.key]),
              ).map((row) => (
                <tr key={row.key}>
                  <RowLabel>{row.label}</RowLabel>
                  {samples.map((s, i) => (
                    <Cell key={i} muted={!s[row.key]}>
                      {(s[row.key] as string) || "—"}
                    </Cell>
                  ))}
                </tr>
              ))}

              <SectionRow label="Dissolved Gas Analysis (ppm)" span={cols} />
              {DGA_ROWS.filter((r) =>
                samples.some((s) => s.dga[r.key]),
              ).map((row) => (
                <tr key={row.key}>
                  <RowLabel indent={row.indent}>{row.label}</RowLabel>
                  {samples.map((s, i) => (
                    <Cell key={i} muted={!s.dga[row.key]}>
                      {s.dga[row.key] || "—"}
                      {i === 0 && (
                        <TrendMark
                          current={s.dga[row.key]}
                          previous={samples[1]?.dga[row.key]}
                        />
                      )}
                    </Cell>
                  ))}
                </tr>
              ))}

              <tr>
                <RowLabel>DGA Condition</RowLabel>
                {samples.map((s, i) => (
                  <Cell key={i}>
                    {s.dgaCondition ? (
                      <Badge severity={conditionSeverity(s.dgaCondition)}>
                        {s.dgaCondition}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </Cell>
                ))}
              </tr>

              <tr>
                <RowLabel>Sampling Interval</RowLabel>
                {samples.map((s, i) => (
                  <Cell key={i} muted={!s.samplingInterval}>
                    {s.samplingInterval || "—"}
                  </Cell>
                ))}
              </tr>

              <SectionRow label="Fluid Quality" span={cols} />
              {FLUID_ROWS.filter((r) => samples.some((s) => s[r.key])).map(
                (row) => (
                  <tr key={row.key}>
                    <RowLabel>
                      {row.label}
                      {row.unit && (
                        <span className="ml-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                          {row.unit}
                        </span>
                      )}
                    </RowLabel>
                    {samples.map((s, i) => (
                      <Cell key={i} muted={!s[row.key]}>
                        {(s[row.key] as string) || "—"}
                      </Cell>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Narrative findings */}
      {narratives.length > 0 && (
        <div className="rounded-none border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
          <div className="bg-neutral-50 dark:bg-neutral-800/60 px-5 py-3 border-b border-neutral-200 dark:border-neutral-700">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
              Analysis &amp; Recommendations
            </h3>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {narratives.map(({ sample: s, index }) => (
              <div key={index} className="p-5">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                    {s.sampleDate}
                  </span>
                  {s.dgaCondition && (
                    <Badge severity={conditionSeverity(s.dgaCondition)}>
                      {s.dgaCondition}
                    </Badge>
                  )}
                  {s.barcodeDGA && (
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">
                      Barcode {s.barcodeDGA}
                    </span>
                  )}
                </div>
                <div className="mt-3 space-y-3">
                  {s.dgaAnalysis && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        DGA Analysis
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">
                        {s.dgaAnalysis}
                      </p>
                    </div>
                  )}
                  {s.operatingProcedures && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        Operating Procedures
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">
                        {s.operatingProcedures}
                      </p>
                    </div>
                  )}
                  {s.oilQuality && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        Oil Quality
                      </p>
                      <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                        {s.oilQuality}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportView;
