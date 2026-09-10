/**
 * Renderer input and mode contract.
 *
 * One runtime draws every custom-form section. It owns structure: which rows
 * and columns exist, how the grid packs, what the table markup is, which
 * settings are in force. It does not own controls. Each shell supplies a
 * `renderControl` that turns a slot into whatever that mode shows: a real
 * input in the filler, a grey placeholder on the builder canvas, a formula
 * box in formula mode, plain text in print.
 *
 * Adding a section type means adding one case to the runtime. It must never
 * mean adding a switch to a page.
 */

import type { ReactNode } from "react";
import type {
  ColumnConfig,
  FieldConfig,
  SectionConfig,
} from "@/lib/types/customForms";
import type { CellV2, ControlV2 } from "../v2/schema";
import type { RowInstanceV2 } from "../instanceState";

/**
 * - `edit`     builder canvas: structural preview with reference codes.
 * - `preview`  builder preview tab and saved-component previews: shape only.
 * - `fill`     a technician entering results.
 * - `readonly` a saved instance shown without editing.
 * - `print`    print and PDF output.
 */
export type RenderMode = "edit" | "preview" | "fill" | "readonly" | "print";

export type ControlPlacement =
  | "grouped"
  | "single"
  | "above-table"
  | "table-cell"
  | "checklist-result"
  | "deviation-cell"
  | "row-label"
  | "signature";

/** One leaf control the shell has to draw. */
export interface ControlSlot {
  section: SectionConfig;
  field: FieldConfig;
  /** formData key this control reads and writes. */
  stateKey: string;
  placement: ControlPlacement;
  /** Present for table cells only. */
  cell?: {
    rowIndex: number;
    colId: string;
    colIndex: number;
    column: ColumnConfig;
  };
  /** Set when the runtime knows the control cannot be edited in this mode. */
  readOnly?: boolean;

  /**
   * The V2 control, when the runtime is drawing a V2 document. Controls V1
   * could not express (radio groups, checkbox groups, signatures, unit-aware
   * values) only appear here; `field` still carries a best-effort V1 shape so
   * a chrome that has not been taught V2 keeps rendering something sensible.
   */
  controlV2?: ControlV2;
  /** The V2 cell this slot came from, for result styling and units. */
  cellV2?: CellV2;
  /** Stable row identity, for a slot inside a table row. */
  rowInstanceId?: string;
}

export interface SectionRowInfo {
  /** Rows the section defines. */
  rowCount: number;
  /** Rows actually drawn, which a display cap may reduce. */
  shownRowCount: number;
}

/**
 * Per-mode behaviour handed to the runtime. Only `mode` and `renderControl`
 * are required; the hooks let a shell add its own chrome without forking the
 * structural code.
 */
export interface SectionChrome {
  mode: RenderMode;
  /** `compact` is the builder canvas. Everything else uses `normal`. */
  density?: "compact" | "normal";

  renderControl(slot: ControlSlot): ReactNode;

  /** Current value of a settings dropdown driving conditional visibility. */
  getSettingValue?(section: SectionConfig, settingId: string): unknown;
  /** Omit to render settings dropdowns disabled. */
  setSettingValue?(
    section: SectionConfig,
    settingId: string,
    value: string,
  ): void;

  /** Extra content inside a table cell, after the control (row delete, etc.). */
  renderCellAdornment?(slot: ControlSlot): ReactNode;
  /** Extra content in a column header, under the label (reference codes). */
  renderColumnHeaderExtra?(
    section: SectionConfig,
    column: ColumnConfig,
    colIndex: number,
  ): ReactNode;
  /** Extra content under a grouped or single field label (reference codes). */
  renderFieldLabelExtra?(section: SectionConfig, field: FieldConfig): ReactNode;
  /** Row-number gutter shown left of the table body. */
  rowGutter?: {
    header: ReactNode;
    cell(rowIndex: number): ReactNode;
  };
  /** Cap on rendered body rows. The runtime calls `renderRowOverflow` past it. */
  maxBodyRows?: number;
  renderRowOverflow?(
    section: SectionConfig,
    info: SectionRowInfo,
    columnCount: number,
  ): ReactNode;
  /**
   * Instance values conditions read. Builder modes return their local settings
   * so conditional rows can be exercised without a filled-in form.
   */
  conditionValues?(): Record<string, any>;
  /** Resolved report-context bindings, by binding id. */
  bindingValues?(): Record<string, unknown>;

  /** Stable row identities for a section, from the instance state. */
  instanceRowsFor?(sectionId: string): RowInstanceV2[] | undefined;
  /** How many rows each records generator currently holds. */
  generatorCountsFor?(sectionId: string): Record<string, number> | undefined;

  /** Content above the table, inside the section body. */
  renderSectionHeader?(section: SectionConfig, info: SectionRowInfo): ReactNode;
  /** Add and remove row controls, row counts, hints. Drawn under the body. */
  renderSectionFooter?(section: SectionConfig, info: SectionRowInfo): ReactNode;
}
