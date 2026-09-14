import type { CustomFormTemplate } from "@/lib/types/customForms";

export type ExcelScalar = string | number | boolean;
export interface ExcelImportIssue {
  code: string;
  message: string;
  sheet?: string;
  cell?: string;
}
export interface ExcelCell {
  address: string;
  type: "number" | "string" | "boolean" | "date" | "blank" | "error";
  /** For formulas this is Excel's last cached result, not a recalculation. */
  value?: ExcelScalar;
  formatted?: string;
  formula?: string;
  numberFormat?: string;
}
export interface ExcelSheet {
  name: string;
  hidden: boolean;
  range: string;
  cells: ExcelCell[];
  merges: string[];
  columnWidths: { column: string; width: number }[];
  validations: { range: string; type: string; formula1?: string; formula2?: string; options?: string[] }[];
}
export interface ExcelWorkbookAnalysis {
  fileName: string;
  sheets: ExcelSheet[];
  formulaCount: number;
  names: { name: string; reference: string; sheetIndex?: number }[];
  features: string[];
  issues: ExcelImportIssue[];
}

/**
 * Where a section's data comes from, as the model returns it.
 *
 * Ranges, not cells: listing every cell made the answer grow with the workbook
 * and hit the model's output ceiling on real files. `deriveMappings` expands
 * these, so no cell can land on the wrong row through a slip in a long list.
 */
export type ExcelSourceMap =
  | { sectionId: string; kind: "table"; sheet: string; range: string }
  /**
   * A table whose columns are named by their first data cell.
   *
   * A form drawn in Excel merges cells, so what reads as eight columns can be
   * twenty-seven columns of the raw grid. Demanding a rectangle whose width
   * matched the column count forced empty padding columns into the form. An
   * anchor per column says where each one actually starts, and the row step
   * comes from the merge heights in the workbook.
   */
  | { sectionId: string; kind: "columns"; sheet: string; anchors: string[]; rows: number }
  | { sectionId: string; kind: "fields"; sheet: string; cells: { fieldId: string; cell: string }[] };

/** One workbook cell against one form field. Derived here, never sent by the model. */
export interface ExcelCellMapping {
  sheet: string;
  cell: string;
  sectionId: string;
  fieldId: string;
  /** Table cells require both; grouped/single fields omit both. */
  rowIndex?: number;
  columnId?: string;
  role: "input" | "constant" | "calculated";
}
export interface ExcelGenerationResponse {
  template: CustomFormTemplate;
  sources: ExcelSourceMap[];
  warnings: string[];
}
export interface ExcelFormulaReview {
  sheet: string;
  cell: string;
  original: string;
  targetId?: string;
  translated?: string;
  status: "matched" | "different" | "unverified" | "unsupported";
  message: string;
  /** Where the translation is close but not identical, said plainly. */
  caveats?: string[];
}
/** Stored with the draft so problems do not disappear after leaving the import dialog. */
export interface ExcelImportReview {
  version: 1;
  fileName: string;
  sheetNames: string[];
  issues: ExcelImportIssue[];
  formulas: ExcelFormulaReview[];
  /** Explicit human acknowledgment. Never means engineering certification. */
  reviewed: boolean;
}
export interface ExcelImportDraft {
  template: CustomFormTemplate;
  review: ExcelImportReview;
}
