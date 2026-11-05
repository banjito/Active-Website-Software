/**
 * Document schema V2.
 *
 * V1 modelled a report as a list of sections, each with a flat `columns[]`
 * array and one row count. Real NETA reports are not that shape: they have
 * multi-row headers with merged cells, tables that mix repeated records with
 * divider, note and subtotal rows, sections that sit side by side, radio grids,
 * and per-section print orientation. V1 could only approximate them.
 *
 * V2 models the document instead of the easiest table. Every node carries a
 * stable id, so a label can change without moving data, and a grid can be
 * validated before it is published.
 *
 * Nothing here reads the database. Bindings name entries in a controlled
 * registry (see bindings.ts); a template can never query an arbitrary table.
 */

// ---------------------------------------------------------------------------
// References and conditions
// ---------------------------------------------------------------------------

/** Somewhere a value can be read from, for conditions and bindings. */
export type ValueRefV2 =
  | { scope: "field"; sectionId: string; fieldId: string }
  | { scope: "setting"; sectionId: string; settingId: string }
  | {
      scope: "cell";
      tableId: string;
      columnId: string;
      /** `current` means the row being evaluated. */
      row: "current" | { rowId: string } | { index: number };
    }
  | { scope: "binding"; bindingId: string };

/**
 * Declarative conditions. Compiled, never evaluated as source, and always
 * total: an unresolvable reference is treated as empty rather than throwing.
 */
export type ConditionV2 =
  | { kind: "always" }
  | { kind: "never" }
  | { kind: "equals"; ref: ValueRefV2; value: unknown }
  | { kind: "in"; ref: ValueRefV2; values: unknown[] }
  | { kind: "empty"; ref: ValueRefV2 }
  | { kind: "notEmpty"; ref: ValueRefV2 }
  | {
      kind: "compare";
      ref: ValueRefV2;
      op: "lt" | "lte" | "gt" | "gte";
      value: number;
    }
  | { kind: "all"; of: ConditionV2[] }
  | { kind: "any"; of: ConditionV2[] }
  | { kind: "not"; of: ConditionV2 };

/**
 * The condition slots every visual node may carry.
 *
 * Hiding never deletes data. A field hidden by a condition keeps its value so
 * that flipping the condition back restores the reading rather than losing it.
 */
export interface ConditionalV2 {
  /** Hidden on screen and in print when this is false. */
  visibleWhen?: ConditionV2;
  /** Hidden in print only. Independent of `visibleWhen`. */
  printWhen?: ConditionV2;
  requiredWhen?: ConditionV2;
  readOnlyWhen?: ConditionV2;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export interface UnitSpecV2 {
  /** Unit symbols the user may choose between, e.g. ["μΩ", "mΩ", "Ω"]. */
  options: string[];
  default?: string;
  /**
   * Where the chooser lives. `table` shows one selector for the whole table,
   * `column` one per column, `cell` one inside every cell.
   */
  scope: "table" | "column" | "cell";
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export interface OptionV2 {
  value: string;
  label: string;
  /** Colours a result cell when the table cell asks for result styling. */
  tone?: "pass" | "fail" | "limited" | "neutral";
}

export type ControlV2 =
  | { type: "text"; placeholder?: string; maxLength?: number }
  | { type: "multiline"; rows?: number; placeholder?: string }
  | {
      type: "number";
      decimals?: number;
      min?: number;
      max?: number;
      placeholder?: string;
    }
  | { type: "date" }
  | { type: "time" }
  | { type: "datetime" }
  | { type: "select"; options: OptionV2[]; allowBlank?: boolean }
  | { type: "checkbox"; label?: string }
  | { type: "checkbox-group"; options: OptionV2[]; layout?: "row" | "column" }
  | {
      type: "radio-group";
      options: OptionV2[];
      /** `table-cell` spreads one radio per column across a table row. */
      presentation: "horizontal" | "vertical" | "table-cell";
    }
  | { type: "equipment-lookup" }
  | { type: "asset-lookup" }
  | { type: "signature"; roleId: string; roleLabel: string }
  | { type: "derived" }
  | { type: "unit-value"; units: UnitSpecV2 }
  | {
      type: "temperature-humidity";
      defaultFahrenheit?: number;
      defaultHumidity?: number;
    };

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export interface BindingRefV2 {
  /** An id from the binding registry. Never a table or column name. */
  bindingId: string;
  /** Keep the bound value read-only. Default true. */
  locked?: boolean;
}

export interface FieldV2 extends ConditionalV2 {
  id: string;
  label: string;
  control: ControlV2;
  unit?: string;
  required?: boolean;
  readOnly?: boolean;
  defaultValue?: unknown;
  /** Populate from report context rather than from typing. */
  binding?: BindingRefV2;
  /** Expression producing the value. Phase 3 replaces the evaluator. */
  formula?: string;
  help?: string;
  /** Grid spans inside a fields block. */
  colSpan?: number;
  rowSpan?: number;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export type CellAlignV2 = "left" | "center" | "right";
export type CellEmphasisV2 = "none" | "bold" | "muted" | "heading";

export type CellKindV2 =
  | "editable"
  | "populated"
  | "calculated"
  | "display"
  | "lookup"
  | "static"
  | "empty";

export interface CellV2 extends ConditionalV2 {
  id: string;
  /** The column this cell starts in. Spans extend rightwards from here. */
  columnId: string;
  colSpan?: number;
  rowSpan?: number;
  kind: CellKindV2;
  /** For `editable` and `lookup`. */
  control?: ControlV2;
  /** For `static` and `display`. */
  text?: string;
  binding?: BindingRefV2;
  formula?: string;
  align?: CellAlignV2;
  emphasis?: CellEmphasisV2;
  /** Colour the cell by its PASS/FAIL/LIMITED SERVICE value. */
  resultStyle?: boolean;
  unit?: string;
}

export interface HeaderCellV2 extends ConditionalV2 {
  id: string;
  columnId: string;
  colSpan?: number;
  rowSpan?: number;
  label: string;
  align?: CellAlignV2;
}

export interface HeaderRowV2 extends ConditionalV2 {
  id: string;
  cells: HeaderCellV2[];
}

export interface ColumnV2 extends ConditionalV2 {
  /** Grid identity: what cells anchor to, and what cell formulas are keyed by. */
  id: string;
  /**
   * The key this column's values are stored under, which is NOT the column id.
   * V1 tables carry a column id (`col-test`) and a separate field id (`test`),
   * and the instance is keyed by the field. Conflating them renders every cell
   * blank and saves to the wrong key. Defaults to `id` when absent.
   */
  fieldId?: string;
  label?: string;
  width?: string;
  align?: CellAlignV2;
  units?: UnitSpecV2;
  /** Template for the cells a records row generates in this column. */
  defaultCell?: Omit<CellV2, "id" | "columnId">;
}

/** How many runtime rows a records row makes, and what the user may do to them. */
export interface RowPolicyV2 {
  initial: number;
  min: number;
  max: number;
  allowAdd: boolean;
  allowRemove: boolean;
  allowReorder: boolean;
  allowCopy: boolean;
  /** Rows in other tables that add and remove together with this one. */
  linkGroupId?: string;
  /** First-column labels used when generating rows, e.g. "Section 1". */
  generatedLabels?: string[];

  /**
   * How many table rows one record occupies. Default 1.
   *
   * Several NETA reports record two readings per circuit, an as-measured row
   * and a corrected row, with the identifying columns spanning both. Without
   * this a record is always one row and those reports cannot be represented.
   */
  rowsPerRecord?: number;
  /**
   * Columns that identify the record rather than the reading, so they are
   * drawn once and span the whole record instead of repeating on each row.
   */
  spanningColumns?: string[];
  /** A label per sub-row, e.g. ["RDG", "Corrected"]. */
  subRowLabels?: string[];
}

/**
 * One entry in a table body. `records` is a generator: it expands to as many
 * runtime rows as the policy and the instance say. Everything else is a single
 * literal row, which is how a table mixes readings with dividers and subtotals.
 */
export type BodyRowV2 =
  | ({ id: string; kind: "records"; policy: RowPolicyV2 } & ConditionalV2)
  | ({ id: string; kind: "fixed"; label?: string; cells: CellV2[] } & ConditionalV2)
  | ({ id: string; kind: "divider" } & ConditionalV2)
  | ({
      id: string;
      kind: "note" | "criteria" | "label";
      text: string;
      align?: CellAlignV2;
    } & ConditionalV2)
  | ({
      id: string;
      kind: "subtotal" | "total";
      label?: string;
      cells: CellV2[];
    } & ConditionalV2);

export interface FooterRowV2 extends ConditionalV2 {
  id: string;
  cells: CellV2[];
}

export interface TablePrintV2 {
  /** Redraw the header after every page break. */
  repeatHeader?: boolean;
  /** Whether a single row may be split across a page boundary. */
  rowSplit?: "avoid" | "allow";
}

export interface TableV2 {
  id: string;
  columns: ColumnV2[];
  header: HeaderRowV2[];
  body: BodyRowV2[];
  footer: FooterRowV2[];
  units?: UnitSpecV2;
  print?: TablePrintV2;
  /** Fields shown above the table, e.g. Test Voltage. */
  aboveFields?: FieldV2[];
}

// ---------------------------------------------------------------------------
// Settings that drive conditional visibility
// ---------------------------------------------------------------------------

export interface SettingV2 {
  id: string;
  label: string;
  options: OptionV2[];
  defaultValue?: string;
}

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------

export interface PrintConfigV2 {
  breakBefore?: boolean;
  breakAfter?: boolean;
  orientation?: "portrait" | "landscape";
  /** Do not split this block across a page boundary. */
  keepTogether?: boolean;
  /** Restrict a block to one medium. */
  only?: "print" | "screen";
  margins?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  rowHeight?: string;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export type SectionContentV2 =
  | { kind: "table"; table: TableV2 }
  | {
      kind: "fields";
      fields: FieldV2[];
      columns: number;
    }
  | { kind: "field"; field: FieldV2 }
  | {
      kind: "checklist";
      items: Array<
        {
          id: string;
          netaSection?: string;
          description: string;
          options: OptionV2[];
        } & ConditionalV2
      >;
    }
  | { kind: "signatures"; roles: Array<{ id: string; label: string; required?: boolean }> }
  | { kind: "empty" };

export interface SectionBlockV2 extends ConditionalV2 {
  id: string;
  type: "section";
  title: string;
  /** Short code formulas address this section by, e.g. `IR`. */
  referenceCode?: string;
  /** The V1 component type this came from, kept for the component library. */
  componentType?: string;
  settings?: SettingV2[];
  content: SectionContentV2;
  print?: PrintConfigV2;
}

export type LayoutKindV2 =
  | "stack"
  | "grid"
  | "side-by-side"
  | "strip"
  | "callout"
  | "keep-together";

export interface LayoutBlockV2 extends ConditionalV2 {
  id: string;
  type: "layout";
  kind: LayoutKindV2;
  /** For `grid`. */
  columns?: number;
  /** For `side-by-side`: one CSS width per child. */
  widths?: string[];
  /** For `callout`. */
  tone?: "info" | "warning" | "criteria";
  title?: string;
  children: BlockV2[];
  print?: PrintConfigV2;
}

export interface PageBreakBlockV2 {
  id: string;
  type: "page-break";
}

export type BlockV2 = SectionBlockV2 | LayoutBlockV2 | PageBreakBlockV2;

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export interface DocumentSettingsV2 {
  includePassFail: boolean;
  includeJobInfo: boolean;
  includePrintHeader: boolean;
  pageBreakAfterSection?: boolean;
  /** Default page orientation; a block may override it. */
  orientation?: "portrait" | "landscape";
}

export interface DocumentV2 {
  schemaVersion: 2;
  settings: DocumentSettingsV2;
  blocks: BlockV2[];
}

// ---------------------------------------------------------------------------
// Narrowing helpers
// ---------------------------------------------------------------------------

export function isSectionBlock(block: BlockV2): block is SectionBlockV2 {
  return block.type === "section";
}

export function isLayoutBlock(block: BlockV2): block is LayoutBlockV2 {
  return block.type === "layout";
}

export function isPageBreakBlock(block: BlockV2): block is PageBreakBlockV2 {
  return block.type === "page-break";
}

/** Every block in the tree, depth first, parents before children. */
export function walkBlocks(blocks: BlockV2[]): BlockV2[] {
  const out: BlockV2[] = [];
  const visit = (list: BlockV2[]) => {
    for (const block of list) {
      out.push(block);
      if (isLayoutBlock(block)) visit(block.children);
    }
  };
  visit(blocks);
  return out;
}

/** Every section in the tree, in document order. */
export function allSections(document: DocumentV2): SectionBlockV2[] {
  return walkBlocks(document.blocks).filter(isSectionBlock);
}

export function sectionTable(section: SectionBlockV2): TableV2 | null {
  return section.content.kind === "table" ? section.content.table : null;
}
