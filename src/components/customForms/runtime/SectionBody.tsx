/**
 * Section runtime entry point.
 *
 * Callers still hand this a V1 `SectionConfig`, which is what every shell and
 * the saved-component library hold. It adapts that to a V2 section and renders
 * through `SectionBodyV2`, so there is one renderer and V1 templates reach it
 * through the adapter rather than through a second code path.
 *
 * The contact-resistance value-deviation block is the one thing V2 does not
 * model as part of the table: it is a pair of side tables rendered here. Its
 * wording and choices come from `section.deviation` (defaults below), so they
 * are editable like the rest of the component.
 */

import React from "react";
import {
  FieldType,
  type FieldConfig,
  type SectionConfig,
} from "@/lib/types/customForms";
import {
  classifySection,
  resolveRowCount,
  rowStateKey,
  tablePrintStyles,
  type ControlSlot,
  type SectionChrome,
} from "@/lib/customForms/runtime";
import { sectionFromV1 } from "@/lib/customForms/v2/fromV1";
import {
  conditionScopeValues,
  type ConditionScope,
} from "@/lib/customForms/v2/conditions";
import { SectionBodyV2 } from "./SectionBodyV2";
import { ChartSection } from "./ChartSection";
import {
  pieceFlex,
  pieceSection,
  resolveTableLayout,
  type TablePiece,
} from "@/lib/customForms/tableLayout";

export { DEFAULT_DEVIATION, resolveDeviation } from "@/lib/customForms/deviation";
import { resolveDeviation } from "@/lib/customForms/deviation";

export interface SectionBodyProps {
  section: SectionConfig;
  chrome: SectionChrome;
}

/** Synthetic field for a control the runtime owns rather than the template. */
function selectField(
  id: string,
  label: string,
  options: string[],
  defaultValue?: string,
): FieldConfig {
  return {
    id,
    label,
    type: FieldType.SELECT,
    defaultValue,
    options: options.map((value) => ({ label: value, value })),
  };
}

/**
 * Contact resistance: the Value Deviation tables. `part` picks what to draw:
 * both side by side (the original layout), just one of them, or both merged
 * into one table (a table layout piece).
 */
const ValueDeviation: React.FC<{
  section: SectionConfig;
  chrome: SectionChrome;
  rowCount: number;
  part?: "both" | "phase" | "lines" | "combined";
}> = ({ section, chrome, rowCount, part = "both" }) => {
  const headerCell =
    "px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-xs font-medium text-neutral-700 dark:text-white";
  const dev = resolveDeviation(section);
  const headings = (
    <tr>
      <th className={`${headerCell} text-left`}>{dev.headers.label}</th>
      <th className={`${headerCell} text-center`}>{dev.headers.criteria}</th>
      <th className={`${headerCell} text-center`}>{dev.headers.results}</th>
    </tr>
  );

  const slot = (field: FieldConfig, stateKey: string): ControlSlot => ({
    section,
    field,
    stateKey,
    placement: "deviation-cell",
  });

  const phaseRows = Array.from({ length: rowCount }).map((_, rowIndex) => {
              const stateKey = rowStateKey(section.id, rowIndex);
              return (
                <tr
                  key={rowIndex}
                  className="border-t border-neutral-200 dark:border-neutral-700"
                >
                  <td className="px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300">
                    {dev.phaseLabel}
                  </td>
                  <td className="px-3 py-2">
                    {chrome.renderControl(
                      slot(
                        selectField(
                          "phaseCriteria",
                          dev.headers.criteria,
                          dev.phaseCriteriaOptions,
                          dev.phaseCriteriaDefault,
                        ),
                        stateKey,
                      ),
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {chrome.renderControl(
                      slot(
                        selectField(
                          "phaseResult",
                          dev.headers.results,
                          dev.phaseResultOptions,
                          dev.phaseResultDefault,
                        ),
                        stateKey,
                      ),
                    )}
                  </td>
                </tr>
              );
            });

  // Saved values are keyed `{id}Criteria` / `{id}Result` (neutralCriteria, ...).
  const lineRows = dev.extraRows
    .map(({ id, label }) => [label, `${id}Criteria`, `${id}Result`, id] as const)
    .map(([label, criteriaId, resultId, rowId]) => (
              <tr
                key={rowId}
                className="border-t border-neutral-200 dark:border-neutral-700"
              >
                <td className="px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300">
                  {label}
                </td>
                <td className="px-3 py-2">
                  {chrome.renderControl(
                    slot(
                      selectField(
                        criteriaId,
                        dev.headers.criteria,
                        dev.extraCriteriaOptions,
                        dev.extraDefault,
                      ),
                      section.id,
                    ),
                  )}
                </td>
                <td className="px-3 py-2">
                  {chrome.renderControl(
                    slot(
                      selectField(
                        resultId,
                        dev.headers.results,
                        dev.extraResultOptions,
                        dev.extraDefault,
                      ),
                      section.id,
                    ),
                  )}
                </td>
              </tr>
            ));

  const table = (rows: React.ReactNode) => (
    <table className="w-full table-fixed border-collapse border border-neutral-200 dark:border-neutral-700">
      <thead>{headings}</thead>
      <tbody>{rows}</tbody>
    </table>
  );

  if (part === "phase") return table(phaseRows);
  if (part === "lines") return lineRows.length ? table(lineRows) : null;
  if (part === "combined") return table([...phaseRows, ...lineRows]);

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      <div className="w-full">{table(phaseRows)}</div>
      {lineRows.length > 0 && <div className="w-full">{table(lineRows)}</div>}
    </div>
  );
};

/** One table piece of a split table: the same section, only some columns. */
const ColumnsPiece: React.FC<{
  section: SectionConfig;
  piece: TablePiece;
  chrome: SectionChrome;
  scope: ConditionScope;
  primary: boolean;
  wrapperStyle?: React.CSSProperties;
  rowStyle?: React.CSSProperties;
}> = ({ section, piece, chrome, scope, primary, wrapperStyle, rowStyle }) => {
  const shown = React.useMemo(() => pieceSection(section, piece), [section, piece]);
  const v2 = React.useMemo(() => sectionFromV1(shown), [shown]);
  const pieceChrome = React.useMemo<SectionChrome>(() => {
    // Column references ({IR.C3}) count across the whole table, not the piece.
    const fullIndex = new Map((section.columns ?? []).map((c, i) => [c.id, i]));
    return {
      ...chrome,
      renderColumnHeaderExtra: chrome.renderColumnHeaderExtra
        ? (s, col, i) => chrome.renderColumnHeaderExtra!(section, col, fullIndex.get(col.id) ?? i)
        : undefined,
      // Add-row buttons and footers once per component, on the first table.
      ...(primary ? {} : { renderSectionHeader: undefined, renderSectionFooter: undefined }),
    };
  }, [chrome, section, primary]);
  return (
    <SectionBodyV2
      v1Section={shown}
      section={v2}
      chrome={pieceChrome}
      scope={scope}
      wrapperStyle={wrapperStyle}
      rowStyle={rowStyle}
      hideSettings={!primary}
    />
  );
};

export const SectionBody: React.FC<SectionBodyProps> = ({
  section,
  chrome,
}) => {
  const v2Section = React.useMemo(() => sectionFromV1(section), [section]);
  const { wrapperStyle, rowStyle } = tablePrintStyles(section.printLayout);

  // Conditions read instance values through the chrome, so builder modes with
  // local settings and the filler with saved data resolve the same way.
  const scope: ConditionScope = React.useMemo(
    () => ({
      // Setting defaults are folded in first. Without that, a form nobody has
      // touched has no setting values at all, and every conditional row
      // evaluates to hidden.
      values: conditionScopeValues([section], chrome.conditionValues?.() ?? {}),
      bindings: chrome.bindingValues?.(),
      rowStateKey: (_tableId, row) =>
        row.index != null ? rowStateKey(section.id, row.index) : undefined,
    }),
    [chrome, section],
  );

  const kind = classifySection(section);
  const showDeviation =
    kind === "contact-resistance" && section.showDeviation !== false;
  const deviationRowCount = Math.min(
    resolveRowCount(section),
    chrome.maxBodyRows ?? Number.POSITIVE_INFINITY,
  );

  // A chart reads another table on the form rather than holding its own.
  if (section.chart) return <ChartSection section={section} chrome={chrome} />;
  if (kind === "empty") return null;

  // A custom table layout: pieces in rows (side by side, wrapping when narrow).
  if (section.tableLayout?.rows?.length && section.columns?.length) {
    const layout = resolveTableLayout(section);
    const firstColumnsPiece = layout.rows.flat().find((p) => p.kind === "columns")?.id;
    return (
      <div className="space-y-4 print:space-y-2">
        {layout.rows.map((row, r) => (
          <div key={r} className="flex flex-wrap items-start gap-4 print:gap-2">
            {row.map((piece) => (
              <div key={piece.id} style={pieceFlex(piece)}>
                {piece.kind === "columns" ? (
                  <ColumnsPiece
                    section={section}
                    piece={piece}
                    chrome={chrome}
                    scope={scope}
                    primary={piece.id === firstColumnsPiece}
                    wrapperStyle={wrapperStyle}
                    rowStyle={rowStyle}
                  />
                ) : (
                  <ValueDeviation
                    section={section}
                    chrome={chrome}
                    rowCount={deviationRowCount}
                    part={
                      piece.kind === "deviation-phase"
                        ? "phase"
                        : piece.kind === "deviation-lines"
                          ? "lines"
                          : "combined"
                    }
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <SectionBodyV2
        v1Section={section}
        section={v2Section}
        chrome={chrome}
        scope={scope}
        wrapperStyle={wrapperStyle}
        rowStyle={rowStyle}
      />
      {showDeviation && (
        <ValueDeviation
          section={section}
          chrome={chrome}
          rowCount={deviationRowCount}
        />
      )}
    </>
  );
};
