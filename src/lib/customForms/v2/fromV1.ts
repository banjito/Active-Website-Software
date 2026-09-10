/**
 * V1 to V2 structure adapter.
 *
 * The runtime renders V2 only. Every V1 template comes through here on load,
 * so there is one renderer rather than two, and a V1 template keeps rendering
 * exactly as it did while gaining nothing it did not ask for.
 *
 * This is a pure, deterministic mapping: the same V1 structure always produces
 * the same V2 document, ids included, so a template's identity does not shift
 * between loads. It never writes back. A stored V1 template stays V1 until a
 * publish deliberately converts it.
 */

import {
  ComponentType,
  type ColumnConfig,
  type CustomFormStructure,
  type FieldConfig,
  type SectionConfig,
} from "@/lib/types/customForms";
import { classifySection } from "../runtime/sectionKind";
import {
  groupedFieldColumnCount,
  maxRows,
  minRows,
  resolveRowCount,
  contactResistanceRowLabels,
} from "../runtime/layout";
import type {
  BlockV2,
  BodyRowV2,
  CellV2,
  ColumnV2,
  ConditionV2,
  ControlV2,
  DocumentV2,
  FieldV2,
  OptionV2,
  RowPolicyV2,
  SectionBlockV2,
  SectionContentV2,
  SettingV2,
  TableV2,
} from "./schema";
import { implicitHeaderRow } from "./grid";

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/**
 * V1 expressed visibility as `visibleWhen: { settingId: value | value[] }`,
 * meaning "every named setting currently holds one of these values".
 */
function conditionFromVisibleWhen(
  sectionId: string,
  visibleWhen: Record<string, string | string[]> | undefined,
): ConditionV2 | undefined {
  if (!visibleWhen || Object.keys(visibleWhen).length === 0) return undefined;
  const clauses: ConditionV2[] = Object.entries(visibleWhen).map(
    ([settingId, allowed]) => ({
      kind: "in",
      ref: { scope: "setting", sectionId, settingId },
      values: Array.isArray(allowed) ? allowed : [allowed],
    }),
  );
  return clauses.length === 1 ? clauses[0] : { kind: "all", of: clauses };
}

// ---------------------------------------------------------------------------
// Controls and fields
// ---------------------------------------------------------------------------

function optionsFromV1(field: FieldConfig): OptionV2[] {
  return (field.options ?? []).map((option: any) => ({
    value: option?.value ?? option?.label ?? "",
    label: option?.label ?? option?.value ?? "",
  }));
}

function controlFromV1(field: FieldConfig): ControlV2 {
  switch (field.type) {
    case "textarea":
      return { type: "multiline", rows: 3, placeholder: field.placeholder };
    case "number":
      return {
        type: "number",
        min: field.validation?.min,
        max: field.validation?.max,
        placeholder: field.placeholder,
      };
    case "date":
      return { type: "date" };
    case "select":
      return { type: "select", options: optionsFromV1(field), allowBlank: true };
    case "radio":
      return {
        type: "radio-group",
        options: optionsFromV1(field),
        presentation: "horizontal",
      };
    case "checkbox":
      return { type: "checkbox" };
    case "calculated":
      return { type: "derived" };
    case "temperature-humidity":
      return {
        type: "temperature-humidity",
        defaultFahrenheit: field.defaultTemperature,
        defaultHumidity: field.defaultHumidity,
      };
    default:
      return { type: "text", placeholder: field.placeholder };
  }
}

function fieldFromV1(field: FieldConfig): FieldV2 {
  return {
    id: field.id,
    label: field.label,
    control: controlFromV1(field),
    unit: field.unit,
    required: field.required,
    readOnly: field.readOnly,
    defaultValue: field.defaultValue,
    formula: field.calculation?.formula,
    colSpan: field.colSpan,
    rowSpan: field.rowSpan,
  };
}

/** V1 cell behaviour maps directly onto the V2 cell kinds. */
function cellKindFromV1(field: FieldConfig | undefined): CellV2["kind"] {
  switch (field?.cellBehavior) {
    case "populate":
      return "populated";
    case "calculate":
      return "calculated";
    case "static":
      return "static";
    default:
      return field?.readOnly ? "display" : "editable";
  }
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function columnFromV1(sectionId: string, column: ColumnConfig): ColumnV2 {
  return {
    id: column.id,
    fieldId: column.field?.id ?? column.id,
    label: column.label,
    width: column.width,
    visibleWhen: conditionFromVisibleWhen(sectionId, column.visibleWhen),
    defaultCell: {
      kind: cellKindFromV1(column.field),
      control: controlFromV1(column.field),
      text: column.field?.staticValue,
      formula: column.field?.calculation?.formula,
    },
  };
}

function rowPolicyFromV1(section: SectionConfig): RowPolicyV2 {
  return {
    initial: resolveRowCount(section),
    min: minRows(section),
    max: maxRows(section),
    allowAdd: !!section.allowAddRows,
    allowRemove: !!section.allowRemoveRows,
    // V1 had no reorder or copy. Turning them on here would change behaviour
    // for every existing template, so they stay off until a template asks.
    allowReorder: false,
    allowCopy: false,
    linkGroupId: section.rowCountLinkGroupId,
    generatedLabels:
      section.componentType === ComponentType.CONTACT_RESISTANCE
        ? contactResistanceRowLabels(section)
        : undefined,
  };
}

/**
 * A per-cell formula or static text in V1 overrode the column's behaviour for
 * one cell. In V2 that is a real cell in a fixed row, so the override survives
 * validation instead of living in a side map keyed by row index.
 */
function overriddenCells(
  section: SectionConfig,
  rowIndex: number,
): CellV2[] | null {
  const columns = section.columns ?? [];
  const hasOverride = columns.some((column) => {
    const key = `row${rowIndex}_${column.id}`;
    return (
      !!section.cellFormulas?.[key]?.trim() ||
      section.staticCells?.[key] != null
    );
  });
  if (!hasOverride) return null;

  return columns.map((column) => {
    const key = `row${rowIndex}_${column.id}`;
    const formula = section.cellFormulas?.[key]?.trim();
    const staticText = section.staticCells?.[key];
    if (formula) {
      return {
        id: `${section.id}-r${rowIndex}-${column.id}`,
        columnId: column.id,
        kind: "calculated",
        formula,
      };
    }
    if (staticText != null && staticText !== "") {
      return {
        id: `${section.id}-r${rowIndex}-${column.id}`,
        columnId: column.id,
        kind: "static",
        text: staticText,
      };
    }
    return {
      id: `${section.id}-r${rowIndex}-${column.id}`,
      columnId: column.id,
      kind: cellKindFromV1(column.field),
      control: controlFromV1(column.field),
      text: column.field?.staticValue,
    };
  });
}

function tableFromV1(section: SectionConfig): TableV2 {
  const columns = (section.columns ?? []).map((column) =>
    columnFromV1(section.id, column),
  );
  const kind = classifySection(section);
  const body: BodyRowV2[] = [];

  if (kind === "conditional-table") {
    // Conditional rows are literal rows whose visibility follows the settings.
    // Row order is the definition order, which is how V1 keyed their values.
    for (const row of section.conditionalRows ?? []) {
      body.push({
        id: row.id,
        kind: "fixed",
        label: row.label,
        visibleWhen: conditionFromVisibleWhen(section.id, row.visibleWhen),
        cells: columns.map((column, columnIndex) =>
          columnIndex === 0
            ? {
                id: `${row.id}-${column.id}`,
                columnId: column.id,
                kind: "static",
                text: row.label,
                emphasis: "bold",
              }
            : {
                id: `${row.id}-${column.id}`,
                columnId: column.id,
                kind: column.defaultCell?.kind ?? "editable",
                control: column.defaultCell?.control,
                formula: column.defaultCell?.formula,
                text: column.defaultCell?.text,
              },
        ),
      });
    }
  } else {
    // A plain table is one records generator, except where V1 pinned a per-cell
    // formula or static value, which becomes a fixed row at that position.
    const rowCount = resolveRowCount(section);
    let runStart = 0;
    const flushRecords = (endExclusive: number) => {
      if (endExclusive <= runStart) return;
      body.push({
        id: `${section.id}-records-${runStart}`,
        kind: "records",
        policy: { ...rowPolicyFromV1(section), initial: endExclusive - runStart },
      });
    };

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const cells = overriddenCells(section, rowIndex);
      if (!cells) continue;
      flushRecords(rowIndex);
      body.push({
        id: `${section.id}-r${rowIndex}`,
        kind: "fixed",
        cells,
      });
      runStart = rowIndex + 1;
    }
    flushRecords(rowCount);

    if (body.length === 0) {
      body.push({
        id: `${section.id}-records`,
        kind: "records",
        policy: rowPolicyFromV1(section),
      });
    }
  }

  // A section may declare V2 structure V1 cannot express. Where it does, that
  // wins over what was generated; where it does not, nothing changes.
  const overlay = section.v2;
  const withUnits = overlay?.columnUnits
    ? columns.map((column) =>
        overlay.columnUnits![column.id]
          ? { ...column, units: overlay.columnUnits![column.id] }
          : column,
      )
    : columns;

  return {
    id: section.id,
    columns: withUnits,
    header:
      overlay?.header && overlay.header.length > 0
        ? overlay.header
        : [implicitHeaderRow(withUnits)],
    body: overlay?.body && overlay.body.length > 0 ? overlay.body : body,
    footer: overlay?.footer ?? [],
    units: overlay?.units,
    print: overlay?.print ?? { repeatHeader: true, rowSplit: "avoid" },
    aboveFields: (section.aboveTableFields ?? []).map(fieldFromV1),
  };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function settingsFromV1(section: SectionConfig): SettingV2[] | undefined {
  if (!section.settingFields?.length) return undefined;
  return section.settingFields.map((setting) => ({
    id: setting.id,
    label: setting.label,
    defaultValue: setting.defaultValue,
    options: setting.options.map((option) => ({
      value: option.value,
      label: option.label,
    })),
  }));
}

function contentFromV1(section: SectionConfig): SectionContentV2 {
  switch (classifySection(section)) {
    case "conditional-table":
    case "contact-resistance":
    case "table":
      return { kind: "table", table: tableFromV1(section) };

    case "grouped-fields":
      return {
        kind: "fields",
        columns: groupedFieldColumnCount(section),
        fields: (section.fields ?? []).map(fieldFromV1),
      };

    case "single-field":
      return { kind: "field", field: fieldFromV1(section.field!) };

    case "checklist":
      return {
        kind: "checklist",
        items: (section.checklistItems ?? []).map((item) => ({
          id: item.id,
          netaSection: item.netaSection,
          description: item.description,
          options: (item.resultOptions ?? []).map((option) => ({
            value: option,
            label: option,
          })),
        })),
      };

    default:
      return { kind: "empty" };
  }
}

export function sectionFromV1(section: SectionConfig): SectionBlockV2 {
  return {
    id: section.id,
    type: "section",
    title: section.title,
    referenceCode: section.referenceCode,
    componentType: section.componentType,
    settings: settingsFromV1(section),
    content: contentFromV1(section),
    print: {
      // V1 stored this as "show in print"; anything not explicitly false prints.
      only: section.showInPrint === false ? "screen" : undefined,
      margins: section.printLayout
        ? {
            top: section.printLayout.marginTop,
            right: section.printLayout.marginRight,
            bottom: section.printLayout.marginBottom,
            left: section.printLayout.marginLeft,
          }
        : undefined,
      rowHeight: section.printLayout?.rowHeight,
    },
  };
}

/**
 * A whole V1 structure as a V2 document. Sections become a flat list of blocks
 * because V1 had no nesting; layout containers only appear in templates
 * authored as V2.
 */
export function documentFromV1(structure: CustomFormStructure): DocumentV2 {
  const blocks: BlockV2[] = [...structure.sections]
    .sort((a, b) => a.order - b.order)
    .map(sectionFromV1);

  return {
    schemaVersion: 2,
    settings: {
      includePassFail: structure.settings?.includePassFail !== false,
      includeJobInfo: structure.settings?.includeJobInfo !== false,
      includePrintHeader: structure.settings?.includePrintHeader !== false,
      pageBreakAfterSection:
        structure.settings?.pageBreakAfterSection === true,
      orientation: "portrait",
    },
    blocks,
  };
}

/** True when a stored structure is already a V2 document. */
export function isDocumentV2(value: unknown): value is DocumentV2 {
  return (
    !!value &&
    typeof value === "object" &&
    (value as DocumentV2).schemaVersion === 2 &&
    Array.isArray((value as DocumentV2).blocks)
  );
}

/** Read either schema as a V2 document. */
export function toDocumentV2(
  structure: CustomFormStructure | DocumentV2,
): DocumentV2 {
  return isDocumentV2(structure)
    ? structure
    : documentFromV1(structure as CustomFormStructure);
}
