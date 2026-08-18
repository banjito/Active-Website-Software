import React from "react";
import {
  resultSeverity,
  severityClasses,
  severityLabel,
  type AmplifyField,
  type AmplifyReport,
  type AmplifySection,
  type AmplifyTable,
  type Severity,
} from "@/lib/amplifyReport";

/**
 * Presentational renderer for one AMP-lify report.
 *
 * Shared by the conversion workflow (/amplify-reports) and the saved report
 * page (/amplify-reports/:id), so both show byte-identical output.
 *
 * The layout is driven by the payload rather than hard-coded: the workbooks are
 * hand-maintained and gain a section or a column between revisions, so every
 * block here renders whatever the parse produced, in the order it produced it.
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

const Dash = () => (
  <span className="text-neutral-300 dark:text-neutral-600">—</span>
);

/** Two-column key/value grid, used for the identity block and field sections. */
const SpecGrid: React.FC<{ title: string; fields: AmplifyField[] }> = ({
  title,
  fields,
}) => (
  <div className="overflow-hidden rounded-none border border-neutral-200 dark:border-neutral-700">
    <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 dark:border-neutral-700 dark:bg-neutral-800/60">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
        {title}
      </h3>
    </div>
    <dl className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {fields.map((field, i) => (
        // Workbooks repeat a label across blocks often enough that the label
        // alone is not a stable key.
        <div key={`${field.label}-${i}`} className="grid grid-cols-2 gap-2 px-4 py-2">
          <dt className="text-sm text-neutral-500 dark:text-neutral-400">
            {field.label}
          </dt>
          <dd className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {field.value || <Dash />}
          </dd>
        </div>
      ))}
    </dl>
  </div>
);

/** One section's results table. Columns come from the workbook. */
const ResultsTable: React.FC<{ table: AmplifyTable }> = ({ table }) => {
  // The stub column only earns its place when some row actually has a label.
  const hasStub = table.rows.some((row) => row.label);
  const hasResult = table.rows.some((row) => row.result);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="bg-brand text-white">
            {/* Stub column heading stays blank: the section title above the
                table already names what the row labels are. */}
            {hasStub && <th scope="col" className="px-4 py-3" />}
            {table.columns.map((column, i) => (
              <th
                key={`${column}-${i}`}
                scope="col"
                className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold"
              >
                {column}
                {table.units?.[i] && (
                  <span className="ml-1.5 text-[11px] font-normal text-white/70">
                    {table.units[i]}
                  </span>
                )}
              </th>
            ))}
            {hasResult && (
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
              >
                Result
              </th>
            )}
          </tr>
        </thead>

        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {table.rows.map((row, r) => (
            <tr key={r}>
              {hasStub && (
                <th
                  scope="row"
                  className="whitespace-nowrap py-2 pl-4 pr-4 text-left text-sm font-normal text-neutral-600 dark:text-neutral-400"
                >
                  {row.label || <Dash />}
                </th>
              )}
              {table.columns.map((_, c) => (
                <td
                  key={c}
                  className={`px-4 py-2 align-top text-sm tabular-nums ${
                    row.cells[c]
                      ? "text-neutral-900 dark:text-neutral-100"
                      : "text-neutral-400 dark:text-neutral-500"
                  }`}
                >
                  {row.cells[c] || "—"}
                </td>
              ))}
              {hasResult && (
                <td className="px-4 py-2 align-top text-sm">
                  {row.result ? (
                    <Badge severity={resultSeverity(row.result)}>
                      {row.result}
                    </Badge>
                  ) : (
                    <Dash />
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** A section: any combination of a field block, a table, and prose. */
const Section: React.FC<{ section: AmplifySection }> = ({ section }) => (
  <div className="overflow-hidden rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
    <div className="border-b border-neutral-200 bg-neutral-50 px-5 py-3 dark:border-neutral-700 dark:bg-neutral-800/60">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
        {section.title}
      </h3>
    </div>

    {section.fields.length > 0 && (
      <dl className="grid gap-x-8 divide-y divide-neutral-100 px-5 dark:divide-neutral-800 md:grid-cols-2 md:divide-y-0">
        {section.fields.map((field, i) => (
          <div
            key={`${field.label}-${i}`}
            className="grid grid-cols-2 gap-2 py-2 md:border-b md:border-neutral-100 md:dark:border-neutral-800"
          >
            <dt className="text-sm text-neutral-500 dark:text-neutral-400">
              {field.label}
            </dt>
            <dd className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {field.value || <Dash />}
            </dd>
          </div>
        ))}
      </dl>
    )}

    {section.table && <ResultsTable table={section.table} />}

    {section.notes && (
      <div className="border-t border-neutral-100 px-5 py-4 dark:border-neutral-800">
        <p className="whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">
          {section.notes}
        </p>
      </div>
    )}
  </div>
);

const AmplifyReportView: React.FC<{ report: AmplifyReport }> = ({ report }) => {
  const severity = resultSeverity(report.status);

  /** Header meta line: only the parts the workbook actually filled in. */
  const meta = [
    report.customer,
    report.siteName,
    report.jobNumber && `Job ${report.jobNumber}`,
    report.reportDate,
  ].filter(Boolean);

  /** Job identity, kept beside the equipment block rather than in the strip. */
  const jobFields: AmplifyField[] = [
    { label: "Customer", value: report.customer },
    { label: "Site", value: report.siteName },
    { label: "Address", value: report.siteAddress },
    { label: "Job Number", value: report.jobNumber },
    { label: "Report Date", value: report.reportDate },
    { label: "Technician", value: report.technician },
  ].filter((field) => field.value);

  return (
    <div className="space-y-6">
      {/* Report summary */}
      <div className="rounded-none border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
              {report.label}
            </h2>
            {meta.length > 0 && (
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {meta.join(" · ")}
              </p>
            )}
          </div>
          <div className="text-right">
            <Badge severity={severity}>
              {report.status
                ? `${report.status} · ${severityLabel[severity]}`
                : severityLabel.unknown}
            </Badge>
            {report.sourceSheet && (
              <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                Sheet {report.sourceSheet}
              </p>
            )}
          </div>
        </div>
      </div>

      {(report.equipment.length > 0 || jobFields.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {report.equipment.length > 0 && (
            <SpecGrid title="Equipment" fields={report.equipment} />
          )}
          {jobFields.length > 0 && (
            <SpecGrid title="Job Information" fields={jobFields} />
          )}
        </div>
      )}

      {report.sections.map((section) => (
        <Section key={section.id} section={section} />
      ))}
    </div>
  );
};

export default AmplifyReportView;
