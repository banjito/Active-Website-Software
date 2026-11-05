/**
 * Section runtime entry point.
 *
 * Callers still hand this a V1 `SectionConfig`, which is what every shell and
 * the saved-component library hold. It adapts that to a V2 section and renders
 * through `SectionBodyV2`, so there is one renderer and V1 templates reach it
 * through the adapter rather than through a second code path.
 *
 * Contact resistance gets its Phase Value Deviation columns added here, so it
 * draws like any other table (see lib/customForms/deviation.ts). Reports from
 * before those columns keep their separate tables (LegacyValueDeviation).
 */

import React from "react";
import type { SectionConfig } from "@/lib/types/customForms";
import {
  classifySection,
  resolveRowCount,
  rowStateKey,
  tablePrintStyles,
  type SectionChrome,
} from "@/lib/customForms/runtime";
import { sectionFromV1 } from "@/lib/customForms/v2/fromV1";
import {
  conditionScopeValues,
  type ConditionScope,
} from "@/lib/customForms/v2/conditions";
import { SectionBodyV2 } from "./SectionBodyV2";
import { ChartSection } from "./ChartSection";
import { LegacyValueDeviation } from "./LegacyValueDeviation";
import {
  pieceFlex,
  pieceSection,
  resolveTableLayout,
  type TablePiece,
} from "@/lib/customForms/tableLayout";

export { DEFAULT_DEVIATION, resolveDeviation } from "@/lib/customForms/deviation";
import { usesLegacyDeviation, withInlineDeviation } from "@/lib/customForms/deviation";

export interface SectionBodyProps {
  section: SectionConfig;
  chrome: SectionChrome;
}

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
      // Row buttons and footers once per component, on the first table.
      ...(primary
        ? {}
        : { renderSectionHeader: undefined, renderSectionFooter: undefined, renderRowAction: undefined }),
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
  section: authored,
  chrome,
}) => {
  const legacy = usesLegacyDeviation(authored, chrome.conditionValues?.() ?? {});
  const section = React.useMemo(
    () => (legacy ? authored : withInlineDeviation(authored)),
    [authored, legacy],
  );
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
  const showLegacyDeviation = legacy && section.showDeviation !== false;
  const legacyRowCount = Math.min(
    resolveRowCount(section),
    chrome.maxBodyRows ?? Number.POSITIVE_INFINITY,
  );

  // A chart reads another table on the form rather than holding its own.
  if (section.chart) return <ChartSection section={section} chrome={chrome} />;
  if (kind === "empty") return null;

  // A custom table layout: pieces in rows (side by side, wrapping when narrow).
  if (section.tableLayout?.rows?.length && section.columns?.length) {
    const layout = resolveTableLayout(section, showLegacyDeviation);
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
                  <LegacyValueDeviation
                    section={section}
                    chrome={chrome}
                    rowCount={legacyRowCount}
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
      {showLegacyDeviation && (
        <LegacyValueDeviation section={section} chrome={chrome} rowCount={legacyRowCount} />
      )}
    </>
  );
};
