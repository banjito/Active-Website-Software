/**
 * Section Editor
 *
 * Right sidebar for editing selected section properties.
 * Supports: section title, table rows/columns, field labels,
 * and for table columns: "Populate from field" or "Calculate from formula".
 */

import { isResultsSection } from "@/lib/customForms/assetTrends";
import React, { useState, useRef } from "react";
import {
  X,
  Plus,
  Trash2,
  Eye,
  Save,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  GripVertical,
  Columns,
  Table2,
  Settings,
  LayoutGrid,
  AlignJustify,
  ListPlus,
  SlidersHorizontal,
  Type,
} from "lucide-react";
import {
  CARD_CLASS,
  CardHeader,
  SettingRow,
  SettingsCard,
  ToggleRow,
} from "./SettingsLayout";
import { DefaultValuesDialog } from "./DefaultValuesDialog";
import { resolveLeavingStatic } from "@/lib/customForms/staticColumn";
import { askKeepStaticAsDefaults } from "./askKeepStaticAsDefaults";
import {
  RESULT_TYPE_LABEL,
  RESULT_TYPE_VALUE,
  isResultField,
  sectionColorsResults,
  suggestedOptionColor,
  typeChoicePatch,
  typeSelectValue,
} from "@/lib/customForms/resultField";
import { resultTextColor } from "@/lib/customForms/resultOptions";
import {
  applyTableChoices,
  rowsDiffer,
  snapshotRowChoices,
  tableChoices,
  type TableChoice,
} from "@/lib/customForms/checklistChoices";
import { TableGridEditor } from "./TableGridEditor";
import { TableLayoutEditor } from "./TableLayoutEditor";
import { ResultRuleEditor, DEFAULT_RESULT_RULE } from "./ResultRuleEditor";
import { EquipmentPickerSettings } from "./EquipmentPickerSettings";
import { AssetSourceSelect } from "./AssetSourceSelect";
import { ChartSettings } from "./ChartSettings";
import { ShowWhenSettings } from "./ShowWhenSettings";
import {
  HINT_TITLE,
  canHaveHint,
} from "./CellDefaultInput";
import {
  resolveRowCount,
} from "@/lib/customForms/runtime/layout";
import { ChecklistWidthInput } from "./ChecklistWidthInput";
import { TextStyleControls } from "./TextStyleControls";
import { DECIMAL_CHOICES } from "@/lib/customForms/decimals";
import {
  DEVIATION_COLUMN_ORDER,
  DEVIATION_DEFAULT_WIDTHS,
  resolveDeviation,
  type DeviationColumnId,
} from "@/lib/customForms/deviation";
import { hasCombinedTemperatureField, splitTemperatureHumidity } from "@/lib/customForms/temperatureFields";
import { JobFillControl } from "./JobFillControl";
import {
  combineAsFoundAsLeft,
  pairForColumn,
  splitAsFoundAsLeft,
} from "@/lib/customForms/asFoundAsLeft";
import { resultRuleField } from "@/lib/customForms/resultRules";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import {
  fillBodyGaps,
  fillHeaderGaps,
  removeColumn,
} from "@/lib/customForms/v2/authoring";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  SectionConfig,
  ColumnConfig,
  FieldConfig,
  FieldType,
  ComponentType,
  type SettingFieldConfig,
  type ConditionalRowConfig,
} from "@/lib/types/customForms";
import {
  getSectionReferenceCode,
  getReferenceDescription,
} from "@/lib/customForms/formCellResolution";

/** One selectable field reference for Populate from / Formula */
export interface FieldRefOption {
  sectionId: string;
  sectionTitle: string;
  fieldId: string;
  fieldLabel: string;
  isTable: boolean;
  rowMode?: "same" | "first";
  /** 0-based row index when picking a specific row (e.g. R2 → rowIndex 1) */
  rowIndex?: number;
  refToken: string; // internal: {sectionId.fieldId} or {sectionId.row0.fieldId}
  friendlyRef: string; // display: {IR.C1.R2} or {Job.temperature}
  description: string; // e.g. "Insulation resistance, column 1, row 2"
}

/** Build a flat list of all form fields for "Populate from" / "Insert reference" */
export function buildFieldRefOptions(
  allSections: SectionConfig[],
  excludeSectionId?: string,
): FieldRefOption[] {
  const options: FieldRefOption[] = [];
  for (const sec of allSections) {
    if (sec.id === excludeSectionId) continue;
    const title = sec.title || "Untitled";
    const code = getSectionReferenceCode(sec);

    if (sec.fields?.length) {
      // Job Details: add TCF first so it appears in quick-insert and is easy to find
      if (sec.componentType === ComponentType.JOB_INFO) {
        const tcfFriendlyRef = `{${code}.TCF}`;
        options.push({
          sectionId: sec.id,
          sectionTitle: title,
          fieldId: "tcf",
          fieldLabel: "TCF",
          isTable: false,
          refToken: `{${code}.tcf}`,
          friendlyRef: tcfFriendlyRef,
          description:
            "Job Details » Temperature Correction Factor (from temp/humidity)",
        });
      }
      for (const f of sec.fields) {
        if (sec.componentType === ComponentType.JOB_INFO && f.id === "tcf")
          continue;
        const friendlyRef = `{${code}.${f.id}}`;
        options.push({
          sectionId: sec.id,
          sectionTitle: title,
          fieldId: f.id,
          fieldLabel: f.label || f.id,
          isTable: false,
          refToken: `{${sec.id}.${f.id}}`,
          friendlyRef,
          description: getReferenceDescription(
            friendlyRef.replace(/^\{|\}$/g, ""),
            allSections,
          ),
        });
      }
    }
    if (sec.columns?.length) {
      // Show at least 10 row options so users can pick any column+row; cap at 25 for dropdown size
      const numRows = Math.min(
        Math.max(sec.rows ?? 1, 10),
        sec.maxRows ?? 25,
        25,
      );
      for (let colIndex = 0; colIndex < sec.columns.length; colIndex++) {
        const col = sec.columns[colIndex];
        const fid = col.field?.id ?? col.id;
        const flabel = col.field?.label ?? col.label;
        const cNum = colIndex + 1;
        const friendlySame = `{${code}.C${cNum}}`;
        options.push({
          sectionId: sec.id,
          sectionTitle: title,
          fieldId: fid,
          fieldLabel: flabel,
          isTable: true,
          rowMode: "same",
          refToken: `{${sec.id}.sameRow.${fid}}`,
          friendlyRef: friendlySame,
          description: getReferenceDescription(
            friendlySame.replace(/^\{|\}$/g, ""),
            allSections,
          ),
        });
        for (let r = 1; r <= numRows; r++) {
          const friendlyRow = `{${code}.C${cNum}.R${r}}`;
          const rowIndex = r - 1;
          options.push({
            sectionId: sec.id,
            sectionTitle: title,
            fieldId: fid,
            fieldLabel: flabel,
            isTable: true,
            rowMode: r === 1 ? "first" : undefined,
            rowIndex,
            refToken: `{${sec.id}.row${rowIndex}.${fid}}`,
            friendlyRef: friendlyRow,
            description: getReferenceDescription(
              friendlyRow.replace(/^\{|\}$/g, ""),
              allSections,
            ),
          });
        }
      }
    }
    if (sec.field) {
      const friendlyRef = `{${code}.${sec.field.id}}`;
      options.push({
        sectionId: sec.id,
        sectionTitle: title,
        fieldId: sec.field.id,
        fieldLabel: sec.field.label || sec.field.id,
        isTable: false,
        refToken: `{${sec.id}.${sec.field.id}}`,
        friendlyRef,
        description: getReferenceDescription(
          friendlyRef.replace(/^\{|\}$/g, ""),
          allSections,
        ),
      });
    }
  }
  return options;
}

interface SectionEditorProps {
  section: SectionConfig;
  allSections?: SectionConfig[];
  onUpdate: (updates: Partial<SectionConfig>) => void;
  /** Link this table's row count with another; add/remove rows will stay in sync */
  onLinkRowCountWith?: (otherSectionId: string | null) => void;
  /** Append one option to a table column select (single setState, no double-add). */
  onAppendFieldOption?: (sectionId: string, columnIndex: number) => void;
  onAppendOptionToSectionField?: (sectionId: string) => void;
  onAppendOptionToSectionFieldsField?: (
    sectionId: string,
    fieldIndex: number,
  ) => void;
  onClose: () => void;
  /** When true, show "Save as default" so admin can save this section's config as the component default */
  isAdmin?: boolean;
  /** Called when admin clicks Save as default; receives the current section so caller always has the latest data */
  onSaveAsDefault?: (section: SectionConfig) => Promise<void>;
  /** Called when user clicks Save as new component; receives the current section */
  onSaveAsNewComponent?: (section: SectionConfig) => Promise<void>;
  /** Called when user clicks Update saved component; receives the current section to persist back to saved_components */
  onUpdateSavedComponent?: (section: SectionConfig) => Promise<void>;
  /** Whether formula editing mode is active for this section */
  isFormulaEditing?: boolean;
  /** Toggle formula editing mode on/off */
  onToggleFormulaEditing?: () => void;
}

// ---------------------------------------------------------------------------
// Conditional-table helpers: keep row/column `visibleWhen` references in sync
// when a setting dropdown, its options, or option values change. Without this,
// renaming/removing a setting value orphans every `visibleWhen` that pointed at
// it, so those rows/columns can never match again and disappear permanently.
// ---------------------------------------------------------------------------

/** Number of grid columns a grouped-field component renders with (mirrors the filler). */
function layoutColumnCount(section: SectionConfig): number {
  switch (section.layout) {
    case "six-column":
      return 6;
    case "five-column":
      return 5;
    case "four-column":
      return 4;
    case "three-column":
      return 3;
    case "two-column":
      return 2;
    default:
      return section.componentType === ComponentType.JOB_INFO ? 5 : 1;
  }
}

type VisibleWhen = Record<string, string | string[]>;

/** Apply a transform to the value(s) a single settingId maps to in a visibleWhen map. */
function transformVisibleWhen(
  vw: VisibleWhen | undefined,
  settingId: string,
  transform: (values: string[]) => string[],
): VisibleWhen | undefined {
  if (!vw || !(settingId in vw)) return vw;
  const current = vw[settingId];
  const list = Array.isArray(current) ? current : current != null ? [current] : [];
  const nextList = transform(list);
  const next: VisibleWhen = { ...vw };
  if (nextList.length === 0) {
    delete next[settingId];
  } else {
    next[settingId] = nextList.length === 1 ? nextList[0] : nextList;
  }
  return next;
}

/** Map a visibleWhen transform across every conditional row and column of a section. */
function remapSectionVisibleWhen(
  section: SectionConfig,
  settingId: string,
  transform: (values: string[]) => string[],
): Partial<SectionConfig> {
  const update: Partial<SectionConfig> = {};
  if (section.conditionalRows) {
    update.conditionalRows = section.conditionalRows.map((r) => ({
      ...r,
      visibleWhen: transformVisibleWhen(r.visibleWhen, settingId, transform),
    }));
  }
  if (section.columns) {
    update.columns = section.columns.map((c) => ({
      ...c,
      visibleWhen: transformVisibleWhen(c.visibleWhen, settingId, transform),
    }));
  }
  return update;
}

/** Rename an option value everywhere it is referenced (rows/columns/default). */
function renameSettingValue(
  section: SectionConfig,
  settingId: string,
  oldValue: string,
  newValue: string,
): Partial<SectionConfig> {
  if (oldValue === newValue) return {};
  return remapSectionVisibleWhen(section, settingId, (values) =>
    values.map((v) => (v === oldValue ? newValue : v)),
  );
}

/** Remove a deleted option value from every row/column visibleWhen. */
function removeSettingValue(
  section: SectionConfig,
  settingId: string,
  removedValue: string,
): Partial<SectionConfig> {
  return remapSectionVisibleWhen(section, settingId, (values) =>
    values.filter((v) => v !== removedValue),
  );
}

/** Strip a deleted setting's key from every row/column visibleWhen. */
function removeSettingReferences(
  section: SectionConfig,
  settingId: string,
): Partial<SectionConfig> {
  const strip = (vw: VisibleWhen | undefined): VisibleWhen | undefined => {
    if (!vw || !(settingId in vw)) return vw;
    const next = { ...vw };
    delete next[settingId];
    return next;
  };
  const update: Partial<SectionConfig> = {};
  if (section.conditionalRows) {
    update.conditionalRows = section.conditionalRows.map((r) => ({
      ...r,
      visibleWhen: strip(r.visibleWhen),
    }));
  }
  if (section.columns) {
    update.columns = section.columns.map((c) => ({
      ...c,
      visibleWhen: strip(c.visibleWhen),
    }));
  }
  return update;
}

export const SectionEditor: React.FC<SectionEditorProps> = ({
  section,
  allSections = [],
  onUpdate,
  onLinkRowCountWith,
  onAppendFieldOption,
  onAppendOptionToSectionField,
  onAppendOptionToSectionFieldsField,
  onClose,
  isAdmin = false,
  onSaveAsDefault,
  onSaveAsNewComponent,
  onUpdateSavedComponent,
  isFormulaEditing = false,
  onToggleFormulaEditing,
}) => {
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultsTableOpen, setDefaultsTableOpen] = useState(false);
  const [tableTextOpen, setTableTextOpen] = useState(false);
  // Table-wide text settings in use, counted on the Text button.
  const tableTextCount = [section.headerText?.fontSize, section.headerText?.align, section.bodyText?.fontSize, section.bodyText?.align].filter(Boolean).length;
  const [savingNewComponent, setSavingNewComponent] = useState(false);
  const [updatingSavedComponent, setUpdatingSavedComponent] = useState(false);

  const columnSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !section.columns) return;
    const oldIndex = section.columns.findIndex((c) => c.id === active.id);
    const newIndex = section.columns.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...section.columns];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onUpdate({ columns: reordered });
  };

  const handleFieldDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !section.fields) return;
    const oldIndex = section.fields.findIndex((f) => f.id === active.id);
    const newIndex = section.fields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...section.fields];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onUpdate({ fields: reordered });
  };

  // Grid width for grouped fields – bounds the per-field "span columns" control
  const fieldGridColumns = layoutColumnCount(section);

  const handleSaveAsDefault = async () => {
    if (!onSaveAsDefault) return;
    setSavingDefault(true);
    try {
      await onSaveAsDefault(section);
    } finally {
      setSavingDefault(false);
    }
  };

  const handleSaveAsNewComponent = async () => {
    if (!onSaveAsNewComponent) return;
    setSavingNewComponent(true);
    try {
      await onSaveAsNewComponent(section);
    } finally {
      setSavingNewComponent(false);
    }
  };

  const handleUpdateSavedComponent = async () => {
    if (!onUpdateSavedComponent) return;
    setUpdatingSavedComponent(true);
    try {
      await onUpdateSavedComponent(section);
    } finally {
      setUpdatingSavedComponent(false);
    }
  };

  // A wide modal rather than a side panel: the grid editor and long field
  // lists need the room, and the canvas behind them isn't edited meanwhile.
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
    <DialogContent
      aria-describedby={undefined}
      className="w-[min(72rem,95vw)] max-w-none h-[90vh] p-0 gap-0 flex flex-col overflow-hidden"
    >
      {/* Header. Right padding leaves room for the dialog's close button. */}
      <div className="p-4 pr-12 border-b dark:border-neutral-700 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <DialogTitle className="text-lg font-semibold text-neutral-900 dark:text-white shrink-0">
            Edit Section
            <span className="ml-2 font-normal text-neutral-500 dark:text-neutral-400">
              {section.title}
            </span>
          </DialogTitle>
          {(onSaveAsDefault ||
            onSaveAsNewComponent ||
            onUpdateSavedComponent) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={
                    savingDefault ||
                    savingNewComponent ||
                    updatingSavedComponent
                  }
                  className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-none border border-neutral-200 dark:border-neutral-600"
                >
                  Save as Component
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[12rem]">
                {onUpdateSavedComponent && section.savedComponentId && (
                  <>
                    <DropdownMenuItem
                      onSelect={handleUpdateSavedComponent}
                      disabled={updatingSavedComponent}
                      className="flex items-center gap-2"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {updatingSavedComponent
                        ? "Updating…"
                        : "Update saved component"}
                    </DropdownMenuItem>
                    <DropdownMenuLabel className="text-[10px] font-normal text-neutral-500 dark:text-neutral-400">
                      Save changes back to this component in the library
                    </DropdownMenuLabel>
                  </>
                )}
                {onSaveAsNewComponent && (
                  <>
                    <DropdownMenuItem
                      onSelect={handleSaveAsNewComponent}
                      disabled={savingNewComponent}
                      className="flex items-center gap-2"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingNewComponent ? "Saving…" : "Save as new component"}
                    </DropdownMenuItem>
                    <DropdownMenuLabel className="text-[10px] font-normal text-neutral-500 dark:text-neutral-400">
                      Add to component library so others can drag it into their
                      reports
                    </DropdownMenuLabel>
                  </>
                )}
                {isAdmin && onSaveAsDefault && (
                  <>
                    <DropdownMenuItem
                      onSelect={handleSaveAsDefault}
                      disabled={savingDefault}
                      className="flex items-center gap-2"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingDefault
                        ? "Saving…"
                        : "Save as new default component"}
                    </DropdownMenuItem>
                    <DropdownMenuLabel className="text-[10px] font-normal text-neutral-500 dark:text-neutral-400">
                      Override default for this component type (column and
                      per-cell formulas)
                    </DropdownMenuLabel>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Editor content: scrolling cards. */}
      <div className="flex-1 min-h-0 flex">
      <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4 bg-neutral-100/60 dark:bg-dark-200">
        {/* Job Details: prominent TCF callout so users know they can reference it */}
        {section.componentType === ComponentType.JOB_INFO && (
          <div className="rounded-none border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-100 mb-1">
              Use in formulas on this sheet
            </p>
            <p className="text-sm font-mono font-medium text-amber-800 dark:text-amber-200">
              {"{JD.TCF}"}
            </p>
            <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90 mt-0.5">
              Temperature Correction Factor (from Temp °F / °C, Humidity above).
              Use this reference in any table formula.
            </p>
          </div>
        )}

        {/* Basics */}
        <SettingsCard
          id="sec-basics"
          title="Basics"
          icon={<Settings className="w-4 h-4" />}
          actions={
            section.columns &&
            section.columns.length > 0 &&
            onToggleFormulaEditing && (
              <button
                type="button"
                onClick={onToggleFormulaEditing}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-none border transition-colors ${
                  isFormulaEditing
                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-700 border-neutral-200 dark:border-neutral-600"
                }`}
                title="Click cells on the canvas to give them their own formula"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                {isFormulaEditing ? "Exit cell formulas" : "Edit cell formulas"}
              </button>
            )
          }
        >
          <SettingRow label="Section title" htmlFor="section-title">
            <Input
              id="section-title"
              value={section.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              placeholder="Enter section title"
            />
          </SettingRow>
          <SettingRow
            label="Reference code"
            htmlFor="section-code"
            help="Short name formulas use for this section."
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="section-code"
                value={section.referenceCode ?? ""}
                onChange={(e) => onUpdate({ referenceCode: e.target.value || undefined })}
                placeholder={getSectionReferenceCode(section)}
                className="font-mono text-xs w-32"
              />
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                e.g. <code className="font-mono">{`{${getSectionReferenceCode(section)}.C1.R2}`}</code> ={" "}
                {getReferenceDescription(
                  `${getSectionReferenceCode(section)}.C1.R2`,
                  allSections.length ? allSections : [section],
                )}
              </span>
            </div>
            {section.componentType === ComponentType.JOB_INFO && (
              <p className="text-[11px] text-neutral-600 dark:text-neutral-300 mt-1 font-medium">
                In formulas use {"{JD.TCF}"} for Temperature Correction Factor
                (from this section’s temp/humidity).
              </p>
            )}
          </SettingRow>
        </SettingsCard>

        {/* Visibility & results */}
        <SettingsCard id="sec-display" title="Display & results" icon={<Eye className="w-4 h-4" />}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
            <ToggleRow
              id="showInPrint"
              label="Show in printed report"
              help="Off: on screen only."
              checked={section.showInPrint !== false}
              onChange={(next) => onUpdate({ showInPrint: next })}
            />
            <ToggleRow
              id="colorResults"
              label="Color-code results"
              help="Green pass, red fail, yellow limited. Off for plain text (e.g. inspections)."
              checked={sectionColorsResults(section)}
              onChange={(next) => onUpdate({ colorResults: next })}
            />
            {!!section.columns?.length && (
              <ToggleRow
                id="trendResults"
                label="Results table"
                help="Its readings show in the asset's Trends."
                checked={isResultsSection(section)}
                onChange={(next) => onUpdate({ trendResults: next })}
              />
            )}
            {section.componentType === ComponentType.CONTACT_RESISTANCE && (
              <ToggleRow
                id="showDeviation"
                label="Phase Value Deviation columns"
                help="Measured / Criteria / Result beside each row."
                checked={section.showDeviation !== false}
                onChange={(next) => onUpdate({ showDeviation: next })}
              />
            )}
          </div>
          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-700">
            <ShowWhenSettings section={section} allSections={allSections} onUpdate={onUpdate} />
          </div>
        </SettingsCard>

        {/* Layout: how the table is arranged and its merged headers. */}
        {section.columns && (
          <SettingsCard id="sec-layout" title="Layout" icon={<LayoutGrid className="w-4 h-4" />}>
            <SettingRow
              label="Table arrangement"
              help="Split, combine, or place tables side by side."
            >
              <TableLayoutEditor section={section} onUpdate={onUpdate} />
            </SettingRow>
            {section.columns.length > 0 && (
              <div className="pt-3 border-t border-neutral-100 dark:border-neutral-700">
                <div className="mb-2">
                  <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Grid: merged headers, mixed rows, footers
                  </p>
                </div>
                <TableGridEditor section={section} onUpdate={onUpdate} allSections={allSections} />
              </div>
            )}
          </SettingsCard>
        )}

        {/* What a chart plots */}
        {section.chart && (
          <section id="sec-chart" className={`${CARD_CLASS} p-3`}>
            <ChartSettings section={section} allSections={allSections} onUpdate={onUpdate} />
          </section>
        )}

        {/* Table settings (for table-based components) */}
        {section.columns && (
          <div className="space-y-4">
            <div className="space-y-4">
              {/* Rows */}
              <SettingsCard id="sec-rows" title="Rows" icon={<AlignJustify className="w-4 h-4" />}>
                {section.componentType !== ComponentType.CONDITIONAL_TABLE && (
                  <SettingRow
                    label="Rows on a new report"
                    htmlFor="section-rows"
                    help={`Between ${section.minRows || 1} and ${section.maxRows || 100}.`}
                  >
                    <Input
                      id="section-rows"
                      type="number"
                      value={section.rows || 1}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 1;
                        const min = section.minRows || 1;
                        const max = section.maxRows || 100;
                        onUpdate({ rows: Math.max(min, Math.min(max, value)) });
                      }}
                      min={section.minRows || 1}
                      max={section.maxRows || 100}
                      className="w-24"
                    />
                  </SettingRow>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
                  <ToggleRow
                    id="allowAddRows"
                    label="Technician can add rows"
                    checked={!!section.allowAddRows}
                    onChange={(next) => onUpdate({ allowAddRows: next })}
                  />
                  <ToggleRow
                    id="allowRemoveRows"
                    label="Technician can remove rows"
                    checked={!!section.allowRemoveRows}
                    onChange={(next) => onUpdate({ allowRemoveRows: next })}
                  />
                </div>
                {onLinkRowCountWith &&
                  section.componentType !== ComponentType.CONDITIONAL_TABLE && (
                    <SettingRow
                      label="Link row count with"
                      htmlFor="section-row-link"
                      help="Adding or removing a row in one table does the same in the other, so formulas stay in step."
                    >
                      <select
                        id="section-row-link"
                        value={
                          section.rowCountLinkGroupId
                            ? (allSections.find(
                                (s) =>
                                  s.id !== section.id &&
                                  s.rowCountLinkGroupId === section.rowCountLinkGroupId,
                              )?.id ?? "")
                            : ""
                        }
                        onChange={(e) => onLinkRowCountWith(e.target.value || null)}
                        className="w-full max-w-md px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white"
                      >
                        <option value="">Not linked</option>
                        {allSections
                          .filter(
                            (s) =>
                              s.id !== section.id &&
                              s.columns?.length &&
                              s.componentType !== ComponentType.CONDITIONAL_TABLE,
                          )
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.title || s.id} ({s.rows ?? 1} rows)
                            </option>
                          ))}
                      </select>
                      {section.rowCountLinkGroupId && (
                        <p className="text-[11px] text-green-700 dark:text-green-400 mt-1">
                          Linked with:{" "}
                          {allSections
                            .filter(
                              (s) =>
                                s.rowCountLinkGroupId === section.rowCountLinkGroupId &&
                                s.id !== section.id,
                            )
                            .map((s) => s.title || s.id)
                            .join(", ") || "other table(s)"}
                        </p>
                      )}
                    </SettingRow>
                  )}
              </SettingsCard>

              {/* Fields above the table (e.g. Test Voltage, Test Duration) */}
              {section.componentType !== ComponentType.CONDITIONAL_TABLE && (
                <SettingsCard
                  id="sec-above"
                  title="Fields above table"
                  icon={<ListPlus className="w-4 h-4" />}
                  description="Inputs shown above the table, e.g. Test Voltage or Test Duration."
                  flush
                  actions={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const id = `above-${Date.now()}`;
                        const newField: FieldConfig = { id, label: "New field", type: FieldType.TEXT };
                        onUpdate({ aboveTableFields: [...(section.aboveTableFields || []), newField] });
                      }}
                      leftIcon={<Plus className="w-3 h-3" />}
                    >
                      Add field
                    </Button>
                  }
                >
                  {(section.aboveTableFields ?? []).length === 0 ? (
                    <p className="px-3 py-3 text-xs text-neutral-500 dark:text-neutral-400">
                      None yet.
                    </p>
                  ) : (
                    <div>
                      <div className="grid grid-cols-[minmax(10rem,1fr)_10rem_1.75rem] gap-1.5 px-3 py-1.5 bg-neutral-100 dark:bg-dark-200 border-b border-neutral-300 dark:border-neutral-600 text-[11px] font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
                        <span>Label</span>
                        <span>Type</span>
                        <span />
                      </div>
                      {(section.aboveTableFields || []).map((f, idx) => {
                        const setAbove = (patch: Partial<FieldConfig>) => {
                          const next = [...(section.aboveTableFields || [])];
                          next[idx] = { ...next[idx], ...patch };
                          onUpdate({ aboveTableFields: next });
                        };
                        return (
                          <div key={f.id} className="border-b border-neutral-200 dark:border-neutral-700 px-3 py-1.5 space-y-1.5">
                            <div className="grid grid-cols-[minmax(10rem,1fr)_10rem_1.75rem] gap-1.5 items-center">
                              <input
                                value={f.label}
                                onChange={(e) => setAbove({ label: e.target.value })}
                                placeholder="Label (e.g. Test Voltage)"
                                className={`${inlineInputCls} w-full min-w-0 font-medium`}
                              />
                              <select
                                value={f.type}
                                onChange={(e) => {
                                  const newType = e.target.value as FieldType;
                                  setAbove({
                                    type: newType,
                                    ...((newType === FieldType.SELECT || newType === FieldType.RADIO) && !f.options?.length
                                      ? { options: [{ label: "Option 1", value: "Option 1" }] }
                                      : {}),
                                  });
                                }}
                                className={`${inlineInputCls} w-full`}
                              >
                                <option value={FieldType.TEXT}>Text</option>
                                <option value={FieldType.NUMBER}>Number</option>
                                <option value={FieldType.DATE}>Date</option>
                                <option value={FieldType.SELECT}>Dropdown</option>
                                <option value={FieldType.RADIO}>Radio buttons</option>
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdate({
                                    aboveTableFields: (section.aboveTableFields || []).filter((_, i) => i !== idx),
                                  })
                                }
                                className="flex justify-center p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                                title="Delete field"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {(f.type === FieldType.SELECT || f.type === FieldType.RADIO) && (
                              <div className="pl-2 border-l-2 border-brand">
                                <InlineOptionsEditor
                                  options={f.options || []}
                                  onChange={(opts) => setAbove({ options: opts })}
                                  onAdd={() => {
                                    const n = (f.options?.length || 0) + 1;
                                    setAbove({
                                      options: [...(f.options || []), { label: `Option ${n}`, value: `Option ${n}` }],
                                    });
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SettingsCard>
              )}

              {/* Columns */}
              <div id="sec-columns" className={CARD_CLASS}>
                <CardHeader
                  title="Columns"
                  icon={<Columns className="w-4 h-4" />}
                  description="One line per column. ▸ opens the rest of a column's settings."
                  actions={
                    <>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Text size and alignment for the table's headings and cells"
                      onClick={() => setTableTextOpen((o) => !o)}
                      aria-expanded={tableTextOpen}
                      className={tableTextOpen ? "text-brand" : ""}
                      leftIcon={<Type className="w-3 h-3" />}
                      rightIcon={
                        tableTextOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                      }
                    >
                      Text{tableTextCount > 0 ? ` · ${tableTextCount}` : ""}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="See the table as the report shows it and type each cell's starting value"
                      onClick={() => setDefaultsTableOpen(true)}
                      leftIcon={<Table2 className="w-3 h-3" />}
                    >
                      Default values table
                    </Button>
                    <DefaultValuesDialog
                      open={defaultsTableOpen}
                      onClose={() => setDefaultsTableOpen(false)}
                      section={section}
                      onUpdate={onUpdate}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Set each column width to equal % (e.g. for print/PDF)"
                      onClick={() => {
                        const cols = section.columns || [];
                        if (cols.length === 0) return;
                        const n = cols.length;
                        const base = Math.floor(100 / n);
                        const remainder = 100 - base * n;
                        const evenColumns = cols.map((c, i) => ({
                          ...c,
                          width: `${i < remainder ? base + 1 : base}%`,
                        }));
                        onUpdate({ columns: evenColumns });
                      }}
                      leftIcon={<Columns className="w-3 h-3" />}
                    >
                      Even widths
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        const newColumn: ColumnConfig = {
                          id: `col-${Date.now()}`,
                          label: `Column ${(section.columns?.length || 0) + 1}`,
                          // No width: it takes a fair share. A fixed 25% made
                          // every table past four columns overflow the page.
                          field: {
                            id: `field-${Date.now()}`,
                            label: `Column ${(section.columns?.length || 0) + 1}`,
                            type: FieldType.TEXT,
                          },
                        };
                        const columns = [...(section.columns || []), newColumn];
                        const grown: SectionConfig = { ...section, columns };
                        onUpdate({
                          columns,
                          // A new column is not covered by an existing header,
                          // so give it a header cell rather than leaving a hole
                          // that blocks publication.
                          ...(section.v2?.header?.length
                            ? {
                                v2: {
                                  ...section.v2,
                                  header: fillHeaderGaps(grown, section.v2.header),
                                  body: section.v2.body ? fillBodyGaps(grown, section.v2.body) : undefined,
                                },
                              }
                            : {}),
                        });
                      }}
                      leftIcon={<Plus className="w-3 h-3" />}
                    >
                      Add column
                    </Button>
                    </>
                  }
                />

                {/* Text size and alignment for the whole table, behind the card's Text button. */}
                {tableTextOpen && (
                  <div className="mb-3 ml-1 border-l-2 border-brand pl-3 py-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-24 shrink-0 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                        Heading text
                      </span>
                      <TextStyleControls value={section.headerText} onChange={(headerText) => onUpdate({ headerText })} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-24 shrink-0 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                        Cell text
                      </span>
                      <TextStyleControls value={section.bodyText} onChange={(bodyText) => onUpdate({ bodyText })} />
                    </div>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      A column's own Text setting (▸ on its line) wins over Cell text.
                    </p>
                  </div>
                )}

                <DndContext
                  sensors={columnSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleColumnDragEnd}
                >
                  <SortableContext
                    items={section.columns?.map((c) => c.id) || []}
                    strategy={verticalListSortingStrategy}
                  >
                    {/* A table of columns: scrolls sideways rather than wrapping. */}
                    <div className="overflow-x-auto">
                    <div className="min-w-[56rem]">
                      <ColumnListHeader />
                      {section.columns?.map((column, index) => (
                        <SortableColumnEditor
                          key={column.id}
                          id={column.id}
                          column={column}
                          currentSectionId={section.id}
                          allSections={allSections}
                          settingFields={section.settingFields}
                          onSectionUpdate={onUpdate}
                          onUpdate={(updates) => {
                            const newColumns = [...(section.columns || [])];
                            newColumns[index] = { ...column, ...updates };
                            onUpdate({ columns: newColumns });
                          }}
                          onAppendOption={
                            onAppendFieldOption
                              ? () => onAppendFieldOption(section.id, index)
                              : undefined
                          }
                          onDelete={() => {
                            // Goes through removeColumn so the grid overlay,
                            // per-cell formulas and unit selectors that named
                            // this column are cleaned up with it. Filtering
                            // `columns` alone leaves header cells anchored to a
                            // column that no longer exists, and the renderer
                            // then drops them and the table loses its header.
                            onUpdate(removeColumn(section, column.id));
                          }}
                        />
                      ))}
                      {!section.columns?.length && (
                        <p className="px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400">
                          No columns yet. Use Add column.
                        </p>
                      )}
                      {section.componentType === ComponentType.CONTACT_RESISTANCE &&
                        section.showDeviation !== false &&
                        !!section.columns?.length && (
                          <>
                            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">
                              Phase Value Deviation (always after the columns above)
                            </div>
                            {DEVIATION_COLUMN_ORDER.map((id) => (
                              <DeviationColumnRow key={id} id={id} section={section} onUpdate={onUpdate} />
                            ))}
                          </>
                        )}
                    </div>
                    </div>
                  </SortableContext>
                </DndContext>
              </div>

              {/* Conditional table: setting dropdowns and which rows show for each value */}
              {(section.componentType === ComponentType.CONDITIONAL_TABLE ||
                (section.columns?.length &&
                  (section.settingFields?.length ||
                    section.conditionalRows?.length))) && (
                <div id="sec-conditional" className={`${CARD_CLASS} pb-3 space-y-4`}>
                  <CardHeader
                    title="Conditional rows"
                    icon={<SlidersHorizontal className="w-4 h-4" />}
                    description="Dropdowns above the table choose which rows show."
                  />
                  <div className="px-3 space-y-4">

                  {/* Setting fields (dropdowns above the table) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        Setting dropdowns
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const id = `setting-${Date.now()}`;
                          const newSetting: SettingFieldConfig = {
                            id,
                            label: `Setting ${(section.settingFields?.length || 0) + 1}`,
                            options: [
                              { value: "Option A", label: "Option A" },
                              { value: "Option B", label: "Option B" },
                            ],
                            defaultValue: "Option A",
                          };
                          onUpdate({
                            settingFields: [
                              ...(section.settingFields || []),
                              newSetting,
                            ],
                          });
                        }}
                        leftIcon={<Plus className="w-3 h-3" />}
                      >
                        Add dropdown
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {(section.settingFields || []).map((sf, idx) => (
                        <div
                          key={sf.id}
                          className="p-2 rounded border border-neutral-200 dark:border-neutral-600 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Input
                              value={sf.label}
                              onChange={(e) => {
                                const next = [...(section.settingFields || [])];
                                next[idx] = { ...sf, label: e.target.value };
                                onUpdate({ settingFields: next });
                              }}
                              placeholder="Dropdown label"
                              className="text-xs flex-1"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const next = (
                                  section.settingFields || []
                                ).filter((_, i) => i !== idx);
                                onUpdate({
                                  settingFields: next,
                                  ...removeSettingReferences(section, sf.id),
                                });
                              }}
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </Button>
                          </div>
                          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                            Options:{" "}
                            {sf.options
                              .map((o) => o.label || o.value)
                              .join(", ")}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {sf.options.map((opt, oIdx) => (
                              <span
                                key={oIdx}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-dark-200 text-[10px]"
                              >
                                <Input
                                  value={opt.value}
                                  onChange={(e) => {
                                    const newValue = e.target.value;
                                    const oldValue = opt.value;
                                    const next = [
                                      ...(section.settingFields || []),
                                    ];
                                    const opts = [...(next[idx].options || [])];
                                    opts[oIdx] = {
                                      ...opt,
                                      value: newValue,
                                      label: newValue,
                                    };
                                    next[idx] = {
                                      ...next[idx],
                                      options: opts,
                                      // Keep default pointed at the renamed value
                                      defaultValue:
                                        next[idx].defaultValue === oldValue
                                          ? newValue
                                          : next[idx].defaultValue,
                                    };
                                    // Cascade the rename into every row/column visibleWhen
                                    onUpdate({
                                      settingFields: next,
                                      ...renameSettingValue(
                                        section,
                                        sf.id,
                                        oldValue,
                                        newValue,
                                      ),
                                    });
                                  }}
                                  className="w-16 h-5 text-[10px] py-0"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const removedValue = opt.value;
                                    const next = [
                                      ...(section.settingFields || []),
                                    ];
                                    const opts = next[idx].options.filter(
                                      (_, i) => i !== oIdx,
                                    );
                                    next[idx] = {
                                      ...next[idx],
                                      options: opts,
                                      // Retarget default if it pointed at the removed value
                                      defaultValue:
                                        next[idx].defaultValue === removedValue
                                          ? opts[0]?.value
                                          : next[idx].defaultValue,
                                    };
                                    onUpdate({
                                      settingFields: next,
                                      ...removeSettingValue(
                                        section,
                                        sf.id,
                                        removedValue,
                                      ),
                                    });
                                  }}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...(section.settingFields || [])];
                                const newOpt = {
                                  value: `Option ${(next[idx].options?.length || 0) + 1}`,
                                  label: `Option ${(next[idx].options?.length || 0) + 1}`,
                                };
                                next[idx] = {
                                  ...next[idx],
                                  options: [
                                    ...(next[idx].options || []),
                                    newOpt,
                                  ],
                                };
                                onUpdate({ settingFields: next });
                              }}
                              className="text-[10px] text-brand hover:underline"
                            >
                              + Add option
                            </button>
                          </div>
                          <div>
                            <label className="text-[10px] text-neutral-500 dark:text-neutral-400">
                              Default:{" "}
                            </label>
                            <select
                              value={sf.defaultValue ?? ""}
                              onChange={(e) => {
                                const next = [...(section.settingFields || [])];
                                next[idx] = {
                                  ...sf,
                                  defaultValue: e.target.value,
                                };
                                onUpdate({ settingFields: next });
                              }}
                              className="text-[10px] ml-1 border rounded px-1 py-0.5"
                            >
                              {sf.options.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label || o.value}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Conditional rows: label + visible when which setting values */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        Rows (visibility by setting)
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const id = `row${section.conditionalRows?.length ?? 0}`;
                          const newRow: ConditionalRowConfig = {
                            id,
                            label: `Row ${(section.conditionalRows?.length || 0) + 1}`,
                            visibleWhen: {},
                          };
                          if (section.settingFields?.length) {
                            const first = section.settingFields[0];
                            newRow.visibleWhen = {
                              [first.id]: first.options[0]?.value ?? "",
                            };
                          }
                          onUpdate({
                            conditionalRows: [
                              ...(section.conditionalRows || []),
                              newRow,
                            ],
                          });
                        }}
                        leftIcon={<Plus className="w-3 h-3" />}
                      >
                        Add row
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {(section.conditionalRows || []).map((row, rIdx) => (
                        <div
                          key={row.id}
                          className="p-2 rounded border border-neutral-200 dark:border-neutral-600 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Input
                              value={row.label}
                              onChange={(e) => {
                                const next = [
                                  ...(section.conditionalRows || []),
                                ];
                                next[rIdx] = { ...row, label: e.target.value };
                                onUpdate({ conditionalRows: next });
                              }}
                              placeholder="Row label"
                              className="text-xs flex-1"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const next = (
                                  section.conditionalRows || []
                                ).filter((_, i) => i !== rIdx);
                                onUpdate({ conditionalRows: next });
                              }}
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </Button>
                          </div>
                          {(section.settingFields || []).map((sf) => {
                            const current = row.visibleWhen?.[sf.id];
                            const currentList = Array.isArray(current)
                              ? current
                              : current
                                ? [current]
                                : [];
                            return (
                              <div
                                key={sf.id}
                                className="flex flex-wrap items-center gap-1.5 text-[10px]"
                              >
                                <span className="text-neutral-500 dark:text-neutral-400">
                                  Show when {sf.label}:
                                </span>
                                {sf.options.map((opt) => {
                                  const checked = currentList.includes(
                                    opt.value,
                                  );
                                  return (
                                    <label
                                      key={opt.value}
                                      className="flex items-center gap-1 cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => {
                                          const next = [
                                            ...(section.conditionalRows || []),
                                          ];
                                          const nextList = e.target.checked
                                            ? [
                                                ...currentList.filter(
                                                  (v) => v !== opt.value,
                                                ),
                                                opt.value,
                                              ]
                                            : currentList.filter(
                                                (v) => v !== opt.value,
                                              );
                                          const vw = {
                                            ...(next[rIdx].visibleWhen || {}),
                                          };
                                          if (nextList.length === 0)
                                            delete vw[sf.id];
                                          else
                                            vw[sf.id] =
                                              nextList.length === 1
                                                ? nextList[0]
                                                : nextList;
                                          next[rIdx] = {
                                            ...next[rIdx],
                                            visibleWhen: vw,
                                          };
                                          onUpdate({ conditionalRows: next });
                                        }}
                                        className="rounded"
                                      />
                                      <span>{opt.label || opt.value}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Fields Settings (for grouped field components) */}
        {section.fields && (
          <div id="sec-fields" className={`${CARD_CLASS} p-3`}>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 dark:text-white mb-3">
              <ListPlus className="w-4 h-4 text-neutral-400" />
              Fields
            </h3>

            <div className="space-y-3">
              {/* Layout — how many columns the fields pack into */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Layout
                </label>
                {(
                  <select
                    value={section.layout || (section.componentType === ComponentType.JOB_INFO ? "five-column" : "single-column")}
                    onChange={(e) =>
                      onUpdate({ layout: e.target.value as any })
                    }
                    className="w-full px-3 py-2 bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none shadow-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand text-neutral-900 dark:text-white text-sm"
                  >
                    <option value="single-column">Single Column</option>
                    <option value="two-column">Two Columns</option>
                    <option value="three-column">Three Columns</option>
                    <option value="four-column">Four Columns</option>
                    <option value="five-column">Five Columns</option>
                    <option value="six-column">Six Columns</option>
                    <option value="grid">Grid</option>
                  </select>
                )}
              </div>

              {hasCombinedTemperatureField(section.fields) && (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs border border-brand/40 bg-brand/5">
                  <span className="text-neutral-700 dark:text-neutral-200">
                    Temperature and humidity share one box. Split them into Temp ("87°F (31°C)") and Humidity ("21%")?
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdate({ fields: splitTemperatureHumidity(section.fields!) })}
                    className="ml-auto h-7 px-2 text-xs text-white bg-brand hover:bg-brand-dark rounded-none"
                  >
                    Use separate fields
                  </button>
                </div>
              )}

              {/* Field List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Fields
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newField: FieldConfig = {
                        id: `field-${Date.now()}`,
                        label: `Field ${(section.fields?.length || 0) + 1}`,
                        type: FieldType.TEXT,
                      };
                      onUpdate({
                        fields: [...(section.fields || []), newField],
                      });
                    }}
                    leftIcon={<Plus className="w-3 h-3" />}
                  >
                    Add Field
                  </Button>
                </div>

                <DndContext
                  sensors={columnSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleFieldDragEnd}
                >
                  <SortableContext
                    items={section.fields?.map((f) => f.id) || []}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1">
                      {section.fields?.map((field, index) => (
                        <SortableFieldEditor
                          key={field.id}
                          id={field.id}
                          field={field}
                          gridColumns={fieldGridColumns}
                          jobInfo={section.componentType === ComponentType.JOB_INFO}
                          onUpdate={(updates) => {
                            const newFields = [...(section.fields || [])];
                            newFields[index] = { ...field, ...updates };
                            onUpdate({ fields: newFields });
                          }}
                          onAppendOption={
                            onAppendOptionToSectionFieldsField
                              ? () =>
                                  onAppendOptionToSectionFieldsField(
                                    section.id,
                                    index,
                                  )
                              : undefined
                          }
                          onDelete={() => {
                            const newFields = section.fields?.filter(
                              (f) => f.id !== field.id,
                            );
                            onUpdate({ fields: newFields });
                          }}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            </div>
          </div>
        )}

        {/* Single Field Settings */}
        {section.field && (
          <div id="sec-field" className={`${CARD_CLASS} p-3`}>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
              Field
            </h3>

            <FieldEditor
              field={section.field}
              onUpdate={(updates) =>
                onUpdate({ field: { ...section.field!, ...updates } })
              }
              onAppendOption={
                onAppendOptionToSectionField
                  ? () => onAppendOptionToSectionField(section.id)
                  : undefined
              }
              onDelete={() => {}}
              hideDelete
            />
          </div>
        )}

        {/* Checklist Items (for inspection components) */}
        {section.checklistItems && (
          <div id="sec-checklist" className={`${CARD_CLASS} p-3`}>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
              Checklist items
            </h3>

            <div className="space-y-1.5 mb-4">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Column headings and widths
              </span>
              {(
                [
                  ["section", "NETA Section"],
                  ["description", "Description"],
                  ["result", "Result"],
                ] as const
              ).map(([key, defaultLabel]) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    value={section.checklistHeaders?.[key] ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        checklistHeaders: {
                          ...section.checklistHeaders,
                          [key]: e.target.value || undefined,
                        },
                      })
                    }
                    placeholder={defaultLabel}
                    title="Column heading"
                    className={`${inlineInputCls} flex-1 min-w-0`}
                  />
                  <ChecklistWidthInput
                    value={section.checklistColumnWidths?.[key]}
                    onChange={(next) =>
                      onUpdate({
                        checklistColumnWidths: {
                          ...section.checklistColumnWidths,
                          [key]: next || undefined,
                        },
                      })
                    }
                    className={`${inlineInputCls} w-20`}
                  />
                </div>
              ))}
            </div>

            <ChecklistItemsEditor
              items={section.checklistItems}
              onChange={(checklistItems) => onUpdate({ checklistItems })}
            />
          </div>
        )}

      </div>
      </div>
    </DialogContent>
    </Dialog>
  );
};

type QuickFormulaKind = "devAvg" | "devMin" | "avg";

const QUICK_FORMULAS: { kind: QuickFormulaKind; label: string }[] = [
  { kind: "devAvg", label: "% deviation from the average" },
  { kind: "devMin", label: "% deviation from the lowest" },
  { kind: "avg", label: "Average" },
];

/** A ready-made formula over column `ref` (e.g. "SI.C3") of this table. */
function quickFormula(kind: QuickFormulaKind, ref: string): string {
  const all = `{${ref}.all}`;
  const row = `{${ref}}`;
  if (kind === "avg") return `round(avg(${all}), 2)`;
  const base = kind === "devAvg" ? `avg(${all})` : `min(${all})`;
  // Blank when this row has no reading, or the reference is blank or zero.
  return `if(isnull(${row}) or isnull(${base}) or ${base} == 0, null, round((${row} - ${base}) / ${base} * 100, 2))`;
}

/** Sortable wrapper for ColumnEditor – provides drag handle and transform */
const SortableColumnEditor: React.FC<{
  id: string;
  column: ColumnConfig;
  currentSectionId: string;
  allSections: SectionConfig[];
  settingFields?: SettingFieldConfig[];
  onUpdate: (updates: Partial<ColumnConfig>) => void;
  onDelete: () => void;
  onAppendOption?: () => void;
  onSectionUpdate?: (updates: Partial<SectionConfig>) => void;
}> = ({ id, ...rest }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ColumnEditor
        dragHandleProps={{ ...attributes, ...listeners }}
        {...rest}
      />
    </div>
  );
};

/** Sortable wrapper for FieldEditor – provides drag handle and transform */
const SortableFieldEditor: React.FC<{
  id: string;
  field: FieldConfig;
  gridColumns: number;
  jobInfo?: boolean;
  onUpdate: (updates: Partial<FieldConfig>) => void;
  onDelete: () => void;
  onAppendOption?: () => void;
}> = ({ id, ...rest }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <FieldEditor
        dragHandleProps={{ ...attributes, ...listeners }}
        {...rest}
      />
    </div>
  );
};

/**
 * Column Editor for table columns – includes "Populate from field" / "Calculate from formula"
 * and for conditional tables: "Show when" (column visibility by setting).
 */
const ColumnEditor: React.FC<{
  column: ColumnConfig;
  currentSectionId: string;
  allSections: SectionConfig[];
  settingFields?: SettingFieldConfig[];
  onUpdate: (updates: Partial<ColumnConfig>) => void;
  onDelete: () => void;
  onAppendOption?: () => void;
  dragHandleProps?: Record<string, unknown>;
  /** Update section-level fields (used to store per-row static cell text). */
  onSectionUpdate?: (updates: Partial<SectionConfig>) => void;
}> = ({
  column,
  currentSectionId,
  allSections,
  settingFields,
  onUpdate,
  onDelete,
  onAppendOption,
  dragHandleProps,
  onSectionUpdate,
}) => {
  const field = column.field;
  const behavior = field.cellBehavior ?? "user";
  const refOptions = buildFieldRefOptions(
    allSections /* include current section so user can pick column+row from same table */,
  );

  // Parent section – used to enumerate rows and store per-row static text.
  const parentSection = allSections.find((s) => s.id === currentSectionId);
  const staticRows: { index: number; label: string }[] = parentSection
    ?.conditionalRows?.length
    ? parentSection.conditionalRows.map((r, i) => ({
        index: i,
        label: r.label || `Row ${i + 1}`,
      }))
    : Array.from({
        length: parentSection ? resolveRowCount(parentSection) : 0,
      }).map((_, i) => ({
        index: i,
        label: `Row ${i + 1}`,
      }));
  const setStaticCell = (rowIndex: number, val: string) => {
    const key = `row${rowIndex}_${column.id}`;
    const next = { ...(parentSection?.staticCells ?? {}) };
    if (val === "") delete next[key];
    else next[key] = val;
    onSectionUpdate?.({ staticCells: next });
  };

  /**
   * Save the column's new field. Leaving Static text, its per-row text is
   * offered as default values (User entry) or cleared, so no cell stays locked.
   */
  const commitField = async (nextField: FieldConfig, next: string) => {
    if (behavior === "static" && parentSection && onSectionUpdate) {
      const leave = await resolveLeavingStatic(parentSection, column.id, field, next, askKeepStaticAsDefaults);
      if (leave) {
        onSectionUpdate({
          ...leave,
          columns: (parentSection.columns ?? []).map((c) =>
            c.id === column.id ? { ...column, field: { ...nextField, staticValue: undefined } } : c,
          ),
        });
        return;
      }
    }
    onUpdate({ field: nextField });
  };

  const handleBehaviorChange = (
    next: "user" | "populate" | "calculate" | "static",
  ) => {
    commitField({
        ...field,
        resultRule: undefined,
        cellBehavior: next,
        ...(next === "user" && {
          populateFrom: undefined,
          calculation: undefined,
          readOnly: undefined,
        }),
        ...(next === "populate" && { calculation: undefined }),
        ...(next === "calculate" && {
          populateFrom: undefined,
          readOnly: true,
        }),
        ...(next === "static" && {
          populateFrom: undefined,
          calculation: undefined,
          readOnly: true,
        }),
      }, next);
  };

  const handlePopulateFromSelect = (value: string) => {
    if (!value) {
      onUpdate({ field: { ...field, populateFrom: undefined } });
      return;
    }
    const opt = refOptions.find((o) => o.refToken === value);
    if (!opt) return;
    onUpdate({
      field: {
        ...field,
        populateFrom: {
          sectionId: opt.sectionId,
          fieldId: opt.fieldId,
          ...(opt.rowIndex != null
            ? { rowIndex: opt.rowIndex }
            : { rowMode: opt.rowMode }),
        },
        readOnly: true,
      },
    });
  };

  const getPopulateFromValue = () => {
    const p = field.populateFrom;
    if (!p) return "";
    const opt = refOptions.find(
      (o) =>
        o.sectionId === p.sectionId &&
        o.fieldId === p.fieldId &&
        (p.rowIndex != null
          ? o.rowIndex === p.rowIndex
          : o.rowMode === p.rowMode),
    );
    return opt?.refToken ?? "";
  };

  const refGroups = Array.from(
    new Map(refOptions.map((o) => [o.sectionId, o.sectionTitle])).entries(),
  );
  const showOptions =
    behavior === "user" && field.type === FieldType.SELECT;
  const isResult = !!field.resultRule;
  const showEquipment = behavior === "user" && !isResult && !!parentSection;
  const showFormulaRefs = behavior === "calculate" && !isResult && refOptions.length > 0;
  const showStaticRows = behavior === "static" && staticRows.length > 0;
  const showVisibleWhen = !!settingFields && settingFields.length > 0;
  // Things set in the "More" panel, counted on its button so nothing hides unseen.
  const visibleWhenCount = Object.keys(column.visibleWhen ?? {}).length;
  const moreCount =
    (column.fontSize || column.align ? 1 : 0) +
    (behavior === "calculate" && field.decimals != null ? 1 : 0) +
    (field.placeholder ? 1 : 0) +
    (field.assetSource ? 1 : 0) +
    (parentSection && pairForColumn(parentSection, column.id) ? 1 : 0) +
    (field.equipmentPicker ? 1 : 0) +
    visibleWhenCount;
  const optionCount = field.options?.length ?? 0;
  const [open, setOpen] = useState(false);

  const setFormula = (formula: string) =>
    onUpdate({
      field: {
        ...field,
        calculation: { formula, dependsOn: field.calculation?.dependsOn ?? [] },
      },
    });

  const cellCls = `${inlineInputCls} w-full min-w-0`;
  const panelLabel = "w-28 shrink-0 text-[11px] font-medium text-neutral-500 dark:text-neutral-400";

  return (
    <div
      className={`border-b border-neutral-200 dark:border-neutral-700 ${
        open ? "bg-neutral-50 dark:bg-dark-100" : "bg-white dark:bg-dark-150 hover:bg-neutral-50 dark:hover:bg-dark-100"
      }`}
    >
      {/* One line per column, lined up under the header. */}
      <div className={`${COLUMN_GRID} items-center px-1 py-1`}>
        <div className="flex justify-center">
          {dragHandleProps && (
            <button
              type="button"
              className="cursor-grab active:cursor-grabbing p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 touch-none"
              title="Drag to reorder"
              {...dragHandleProps}
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <input
          value={column.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Column label"
          title="Column label"
          className={`${cellCls} font-medium`}
        />
        <input
          value={column.width || ""}
          onChange={(e) => onUpdate({ width: e.target.value || undefined })}
          placeholder="auto"
          title="Column width (e.g. 25%, 100px, auto)"
          className={cellCls}
        />
        <select
          value={isResult ? "result" : behavior}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "result") {
              commitField(resultRuleField(field, field.resultRule ?? DEFAULT_RESULT_RULE), "result");
              return;
            }
            handleBehaviorChange(next as "user" | "populate" | "calculate" | "static");
          }}
          title="Where the cell's value comes from"
          className={cellCls}
        >
          <option value="user">User entry</option>
          <option value="populate">Copy from field</option>
          <option value="calculate">Formula</option>
          <option value="static">Static text</option>
          <option value="result">Pass / Fail result</option>
        </select>

        {/* Details: what this kind of cell needs. */}
        <div className="flex items-center gap-1 min-w-0">
          {behavior === "user" && !isResult && (
            <>
              <select
                value={typeSelectValue(field)}
                onChange={(e) => {
                  const updates: Partial<FieldConfig> = typeChoicePatch(field, e.target.value);
                  if (
                    updates.type === FieldType.SELECT &&
                    !updates.options &&
                    !(field.options && field.options.length)
                  ) {
                    updates.options = [{ label: "Option 1", value: "Option 1" }];
                    setOpen(true);
                  }
                  onUpdate({ field: { ...field, ...updates } });
                }}
                title="Input type"
                className={cellCls}
              >
                <option value={FieldType.TEXT}>Text</option>
                <option value={FieldType.NUMBER}>Number</option>
                <option value={FieldType.DATE}>Date</option>
                <option value={FieldType.SELECT}>Dropdown</option>
                <option value={RESULT_TYPE_VALUE}>{RESULT_TYPE_LABEL}</option>
                <option value={FieldType.RADIO}>Radio buttons</option>
                <option value={FieldType.TEXTAREA}>Text Area</option>
                <option value={FieldType.CHECKBOX}>Checkbox</option>
              </select>
              {showOptions && (
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="h-7 shrink-0 px-1.5 text-[11px] border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-600 dark:text-neutral-300 hover:border-brand hover:text-brand whitespace-nowrap"
                  title="Edit this dropdown's choices"
                >
                  {optionCount} choice{optionCount === 1 ? "" : "s"}
                </button>
              )}
            </>
          )}
          {behavior === "populate" && (
            <select
              value={getPopulateFromValue()}
              onChange={(e) => handlePopulateFromSelect(e.target.value)}
              title="Copy value from (pick section, column, and row)"
              className={cellCls}
            >
              <option value="">— Copy value from… —</option>
              {refGroups.map(([sectionId, sectionTitle]) => (
                <optgroup key={sectionId} label={sectionTitle}>
                  {refOptions
                    .filter((o) => o.sectionId === sectionId)
                    .map((opt) => (
                      <option key={opt.refToken} value={opt.refToken}>
                        {opt.friendlyRef} — {opt.description}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          )}
          {behavior === "calculate" && !isResult && (
            <input
              value={field.calculation?.formula ?? ""}
              onChange={(e) => setFormula(e.target.value)}
              onFocus={() => setOpen(true)}
              placeholder="Formula, e.g. {JD.TCF} * {IR.C2}"
              title={field.calculation?.formula || "Use refs like {IR.C1.R2} (table) or {JD.TCF}. More ▸ has helpers."}
              className={`${cellCls} font-mono`}
            />
          )}
          {behavior === "static" && (
            <input
              value={field.staticValue ?? ""}
              onChange={(e) => onUpdate({ field: { ...field, staticValue: e.target.value } })}
              placeholder="Same text for every row"
              title="Same text for every row. Per-row text: More ▸"
              className={cellCls}
            />
          )}
          {isResult && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="h-7 w-full text-left px-2 text-[11px] border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-600 dark:text-neutral-300 hover:border-brand hover:text-brand truncate"
              title="Edit the pass / fail rule"
            >
              Pass / fail rule…
            </button>
          )}
        </div>

        <input
          value={field.unit ?? ""}
          onChange={(e) =>
            onUpdate({
              field: {
                ...field,
                unit: e.target.value === "" && field.unit === undefined ? undefined : e.target.value,
              },
            })
          }
          placeholder="—"
          title="Unit (e.g. kV, A, Ω)"
          className={`${cellCls} text-center`}
        />
        <div className="flex justify-center">
          <input
            type="checkbox"
            checked={!!field.required}
            onChange={(e) => onUpdate({ field: { ...field, required: e.target.checked } })}
            className="rounded-none"
            title="Required: the report can't be submitted with this blank"
            aria-label="Required"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`h-7 flex items-center justify-center gap-0.5 text-[11px] border rounded-none ${
            open
              ? "border-brand text-brand"
              : "border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-brand hover:text-brand"
          }`}
          title={open ? "Hide more settings" : "More settings for this column"}
          aria-expanded={open}
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {moreCount > 0 && <span className="font-semibold">{moreCount}</span>}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex justify-center p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
          title="Delete column"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* More settings, one labelled line each. */}
      {open && (
        <div className="ml-8 mr-2 mb-2 border-l-2 border-brand pl-3 py-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={panelLabel} title="Text size and alignment of this column's cells">
              Text
            </span>
            <TextStyleControls
              value={{ fontSize: column.fontSize, align: column.align }}
              onChange={(next) => onUpdate({ fontSize: next?.fontSize, align: next?.align })}
              autoMeans="the table's Cell text"
            />
          </div>

          {isResult && parentSection && (
            <div className="flex flex-wrap items-start gap-2">
              <span className={panelLabel}>Pass / fail rule</span>
              <div className="flex-1 min-w-0">
                <ResultRuleEditor
                  section={parentSection}
                  columnId={column.id}
                  rule={field.resultRule!}
                  onChange={(rule) => onUpdate({ field: resultRuleField(field, rule) })}
                />
              </div>
            </div>
          )}

          {showOptions && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={panelLabel}>Choices</span>
              <div className="flex-1 min-w-0">
                <InlineOptionsEditor
                  colored={isResultField(field)}
                  options={field.options || []}
                  onChange={(options) => onUpdate({ field: { ...field, options } })}
                  onAdd={() => {
                    if (onAppendOption) return onAppendOption();
                    const n = (field.options || []).length + 1;
                    onUpdate({
                      field: {
                        ...field,
                        options: [...(field.options || []), { label: `Option ${n}`, value: `Option ${n}` }],
                      },
                    });
                  }}
                />
              </div>
            </div>
          )}

          {showFormulaRefs && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={panelLabel}>Formula helpers</span>
              <select
                className={`${inlineInputCls} w-64 font-mono`}
                value=""
                onChange={(e) => {
                  const token = e.target.value;
                  if (!token) return;
                  const current = field.calculation?.formula ?? "";
                  setFormula(current + (current ? " " : "") + token);
                }}
              >
                <option value="">Insert reference…</option>
                {refGroups.map(([sectionId, sectionTitle]) => {
                  const sec = allSections.find((s) => s.id === sectionId);
                  const code = sec ? getSectionReferenceCode(sec) : "";
                  return (
                    <optgroup key={sectionId} label={sectionTitle}>
                      {/* Whole columns first: for avg / min / max / sum. */}
                      {(sec?.columns ?? []).map((c, i) => (
                        <option key={`all-${c.id}`} value={`{${code}.C${i + 1}.all}`}>
                          {`{${code}.C${i + 1}.all}`} — {c.label || `column ${i + 1}`}, all rows (use in avg/min/max/sum)
                        </option>
                      ))}
                      {refOptions
                        .filter((o) => o.sectionId === sectionId)
                        .map((opt) => (
                          <option key={opt.refToken} value={opt.friendlyRef}>
                            {opt.friendlyRef} — {opt.description}
                          </option>
                        ))}
                    </optgroup>
                  );
                })}
              </select>
              {parentSection && (parentSection.columns?.length ?? 0) > 0 && (
                <select
                  className={`${inlineInputCls} w-64`}
                  value=""
                  title="Write a common formula for you. It replaces what's in the formula box."
                  onChange={(e) => {
                    const [kind, idx] = e.target.value.split(":");
                    if (!kind) return;
                    const ref = `${getSectionReferenceCode(parentSection)}.C${Number(idx) + 1}`;
                    setFormula(quickFormula(kind as QuickFormulaKind, ref));
                  }}
                >
                  <option value="">Quick formula…</option>
                  {QUICK_FORMULAS.map((q) => (
                    <optgroup key={q.kind} label={q.label}>
                      {parentSection.columns!.map((c, i) =>
                        c.id === column.id ? null : (
                          <option key={c.id} value={`${q.kind}:${i}`}>
                            {q.label} of “{c.label || `column ${i + 1}`}”
                          </option>
                        ),
                      )}
                    </optgroup>
                  ))}
                </select>
              )}
              {field.calculation?.formula && (
                <code className="basis-full block text-[11px] font-mono text-neutral-600 dark:text-neutral-300 break-all bg-white dark:bg-dark-150 border border-neutral-200 dark:border-neutral-700 px-2 py-1">
                  = {field.calculation.formula}
                </code>
              )}
            </div>
          )}

          {behavior === "calculate" && !isResult && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={panelLabel} title="How many digits after the decimal point are shown and printed">
                Decimal places
              </span>
              <select
                value={field.decimals ?? ""}
                onChange={(e) =>
                  onUpdate({
                    field: {
                      ...field,
                      decimals: e.target.value === "" ? undefined : Number(e.target.value),
                      ...(e.target.value === "" ? { decimalMode: undefined } : {}),
                    },
                  })
                }
                className={`${inlineInputCls} w-32`}
              >
                <option value="">As calculated</option>
                {DECIMAL_CHOICES.map((d) => (
                  <option key={d} value={d}>
                    {d === 0 ? "0 (whole number)" : d}
                  </option>
                ))}
              </select>
              {field.decimals != null && (
                <select
                  value={field.decimalMode ?? "round"}
                  onChange={(e) =>
                    onUpdate({
                      field: { ...field, decimalMode: e.target.value === "cut" ? "cut" : undefined },
                    })
                  }
                  className={`${inlineInputCls} w-36`}
                  title="Round: 12.346 → 12.35. Cut off: 12.346 → 12.34."
                >
                  <option value="round">Round</option>
                  <option value="cut">Cut off (truncate)</option>
                </select>
              )}
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Everything uses the shown number: other formulas, pass/fail and charts (new reports).
              </span>
            </div>
          )}

          {showStaticRows && (
            <div className="flex flex-wrap items-start gap-2">
              <span className={panelLabel} title="Text for one row, instead of the column's text">
                Per-row text
              </span>
              <div className="flex-1 min-w-0 grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-1">
                {staticRows.map((r) => (
                  <label key={r.index} className="flex items-center gap-1 min-w-0">
                    <span className="w-14 shrink-0 text-[10px] text-neutral-500 dark:text-neutral-400 truncate" title={r.label}>
                      {r.label}
                    </span>
                    <input
                      value={parentSection?.staticCells?.[`row${r.index}_${column.id}`] ?? ""}
                      onChange={(e) => setStaticCell(r.index, e.target.value)}
                      placeholder={field.staticValue || "—"}
                      className={`${inlineInputCls} w-full min-w-0`}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {behavior === "user" && !isResult && canHaveHint(field) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={panelLabel}>Hint</span>
              <input
                value={field.placeholder ?? ""}
                onChange={(e) => onUpdate({ field: { ...field, placeholder: e.target.value || undefined } })}
                placeholder="Shown in the empty cell"
                title={HINT_TITLE}
                className={`${inlineInputCls} w-64`}
              />
            </div>
          )}

          {showEquipment && (
            <div className="flex flex-wrap items-start gap-2">
              <span className={panelLabel}>Test equipment</span>
              <div className="flex-1 min-w-0">
                <EquipmentPickerSettings
                  section={parentSection!}
                  columnId={column.id}
                  field={field}
                  onChange={(next) => onUpdate({ field: next })}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className={panelLabel}>Fill from asset</span>
            <AssetSourceSelect
              column
              value={field.assetSource}
              onChange={(assetSource) => onUpdate({ field: { ...field, assetSource } })}
            />
          </div>

          {parentSection && onSectionUpdate && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={panelLabel}>As Found / As Left</span>
              <button
                type="button"
                onClick={() =>
                  onSectionUpdate(
                    pairForColumn(parentSection, column.id)
                      ? combineAsFoundAsLeft(parentSection, column.id)
                      : splitAsFoundAsLeft(parentSection, column.id),
                  )
                }
                className="h-7 px-2 text-[11px] border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-600 dark:text-neutral-300 hover:border-brand hover:text-brand"
                title={
                  pairForColumn(parentSection, column.id)
                    ? "Back to one column (the As Left column and its readings are removed)"
                    : "Split into As Found and As Left columns under one heading"
                }
              >
                {pairForColumn(parentSection, column.id) ? "Combine back into one column" : "Split into As Found / As Left"}
              </button>
            </div>
          )}

          {showVisibleWhen &&
            settingFields!.map((sf) => {
              const current = column.visibleWhen?.[sf.id];
              const currentList = Array.isArray(current) ? current : current ? [current] : [];
              return (
                <div
                  key={sf.id}
                  className="flex flex-wrap items-center gap-2 text-[11px]"
                  title="Show this column only when these values are selected. Leave all unchecked to always show."
                >
                  <span className={panelLabel}>Show when {sf.label}</span>
                  {sf.options.map((opt) => {
                    const checked = currentList.includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-center gap-1 cursor-pointer text-neutral-700 dark:text-neutral-300">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const nextList = e.target.checked
                              ? [...currentList.filter((v) => v !== opt.value), opt.value]
                              : currentList.filter((v) => v !== opt.value);
                            const vw = { ...(column.visibleWhen || {}) };
                            if (nextList.length === 0) delete vw[sf.id];
                            else vw[sf.id] = nextList.length === 1 ? nextList[0] : nextList;
                            onUpdate({ visibleWhen: vw });
                          }}
                          className="rounded-none"
                        />
                        <span>{opt.label || opt.value}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};

/**
 * One of the three Phase Value Deviation columns, as a line in the column
 * list. They are added when the table is drawn, so their wording, width,
 * choices and text live in section.deviation rather than in `columns`.
 */
const DEVIATION_HEADER_KEY: Record<DeviationColumnId, "measured" | "criteria" | "results"> = {
  phaseMeasured: "measured",
  phaseCriteria: "criteria",
  phaseResult: "results",
};

type DeviationColumnLook = NonNullable<NonNullable<SectionConfig["deviation"]>["columns"]>[DeviationColumnId];

const DeviationColumnRow: React.FC<{
  id: DeviationColumnId;
  section: SectionConfig;
  onUpdate: (updates: Partial<SectionConfig>) => void;
}> = ({ id, section, onUpdate }) => {
  const [open, setOpen] = useState(false);
  const dev = resolveDeviation(section);
  const own = section.deviation ?? {};
  const mine: NonNullable<DeviationColumnLook> = own.columns?.[id] ?? {};
  const headerKey = DEVIATION_HEADER_KEY[id];
  const set = (patch: Partial<NonNullable<SectionConfig["deviation"]>>) =>
    onUpdate({ deviation: { ...own, ...patch } });
  const setColumn = (patch: Partial<NonNullable<DeviationColumnLook>>) => {
    const next: Record<string, unknown> = { ...mine, ...patch };
    Object.keys(next).forEach((k) => next[k] === undefined && delete next[k]);
    const columns = { ...(own.columns ?? {}) };
    if (Object.keys(next).length) columns[id] = next as NonNullable<DeviationColumnLook>;
    else delete columns[id];
    set({ columns: Object.keys(columns).length ? columns : undefined });
  };

  const choices =
    id === "phaseCriteria"
      ? {
          list: dev.phaseCriteriaOptions,
          start: dev.phaseCriteriaDefault,
          setList: (v: string[]) => set({ phaseCriteriaOptions: v }),
          setStart: (v: string) => set({ phaseCriteriaDefault: v }),
        }
      : id === "phaseResult"
        ? {
            list: dev.phaseResultOptions,
            start: dev.phaseResultDefault,
            setList: (v: string[]) => set({ phaseResultOptions: v }),
            setStart: (v: string) => set({ phaseResultDefault: v }),
          }
        : null;
  const moreCount = mine.fontSize || mine.align ? 1 : 0;
  const cellCls = `${inlineInputCls} w-full min-w-0`;
  const panelLabel = "w-28 shrink-0 text-[11px] font-medium text-neutral-500 dark:text-neutral-400";
  const fixedCls =
    "h-7 flex items-center px-2 text-[11px] text-neutral-500 dark:text-neutral-400 border border-dashed border-neutral-300 dark:border-neutral-600 truncate";

  return (
    <div
      className={`border-b border-neutral-200 dark:border-neutral-700 ${
        open ? "bg-neutral-50 dark:bg-dark-100" : "bg-white dark:bg-dark-150 hover:bg-neutral-50 dark:hover:bg-dark-100"
      }`}
    >
      <div className={`${COLUMN_GRID} items-center px-1 py-1`}>
        <span />
        <input
          value={dev.headers[headerKey] ?? ""}
          onChange={(e) => set({ headers: { ...(own.headers ?? {}), [headerKey]: e.target.value } })}
          placeholder="Column label"
          title="Column label"
          className={`${cellCls} font-medium`}
        />
        <input
          value={mine.width ?? ""}
          onChange={(e) => setColumn({ width: e.target.value.trim() || undefined })}
          placeholder={DEVIATION_DEFAULT_WIDTHS[id]}
          title="Column width as a % of the table. The reading columns share the rest."
          className={cellCls}
        />
        <span className={fixedCls} title="Set by the report">
          {choices ? "Dropdown" : "Worked out"}
        </span>
        <div className="flex items-center gap-1 min-w-0">
          {choices ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="h-7 shrink-0 px-1.5 text-[11px] border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-600 dark:text-neutral-300 hover:border-brand hover:text-brand whitespace-nowrap"
              title="Edit this dropdown's choices"
            >
              {choices.list.length} choice{choices.list.length === 1 ? "" : "s"}
            </button>
          ) : (
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
              Spread of the A, B and C readings
            </span>
          )}
        </div>
        <span />
        <span />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`h-7 flex items-center justify-center gap-0.5 text-[11px] border rounded-none ${
            open
              ? "border-brand text-brand"
              : "border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-brand hover:text-brand"
          }`}
          title={open ? "Hide more settings" : "More settings for this column"}
          aria-expanded={open}
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {moreCount > 0 && <span className="font-semibold">{moreCount}</span>}
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ showDeviation: false })}
          className="flex justify-center p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
          title="Hide all three Phase Value Deviation columns (turn back on under Settings)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="ml-8 mr-2 mb-2 border-l-2 border-brand pl-3 py-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={panelLabel} title="Text size and alignment of this column's cells">
              Text
            </span>
            <TextStyleControls
              value={{ fontSize: mine.fontSize, align: mine.align }}
              onChange={(next) => setColumn({ fontSize: next?.fontSize, align: next?.align })}
              autoMeans="the table's Cell text"
            />
          </div>
          {choices && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={panelLabel}>Choices</span>
                <div className="flex-1 min-w-0">
                  <InlineOptionsEditor
                    options={choices.list.map((v) => ({ label: v, value: v }))}
                    onChange={(next) => choices.setList(next.map((o) => o.label))}
                    onAdd={() => choices.setList([...choices.list, `Option ${choices.list.length + 1}`])}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={panelLabel}>Starting value</span>
                <select
                  value={choices.start}
                  onChange={(e) => choices.setStart(e.target.value)}
                  className={`${inlineInputCls} w-32`}
                >
                  {choices.list.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Shared column layout for the header and every column row:
 * drag · label · width · cell value · details · unit · required · more · delete.
 */
const COLUMN_GRID =
  "grid grid-cols-[1.75rem_minmax(9rem,1.3fr)_4.5rem_9rem_minmax(12rem,2fr)_4rem_2.5rem_2.75rem_1.75rem] gap-1.5";

/** The header over the column rows. */
const ColumnListHeader: React.FC = () => (
  <div
    className={`${COLUMN_GRID} px-1 py-1.5 sticky top-0 z-10 bg-neutral-100 dark:bg-dark-200 border-b border-neutral-300 dark:border-neutral-600 text-[11px] font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300`}
  >
    <span />
    <span>Column</span>
    <span title="Column width (e.g. 25%, 100px, auto)">Width</span>
    <span title="Where the cell's value comes from">Cell value</span>
    <span title="Input type, formula, copied field or fixed text">Details</span>
    <span className="text-center">Unit</span>
    <span className="text-center" title="Required">Req.</span>
    <span className="text-center" title="More settings">More</span>
    <span />
  </div>
);

/** Shared look for the small inline inputs/selects in field and column rows. */
export const inlineInputCls =
  "h-7 px-2 text-xs bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand text-neutral-900 dark:text-white";

/** Dropdown options laid out side by side so a field stays within two rows. */
export const InlineOptionsEditor: React.FC<{
  options: { label: string; value: string; color?: string }[];
  onChange: (next: { label: string; value: string; color?: string }[]) => void;
  onAdd: () => void;
  addDisabled?: boolean;
  /** Show arrows that move an option earlier or later in the list. */
  reorderable?: boolean;
  /** "Result" fields: a colour picker beside each choice. */
  colored?: boolean;
}> = ({ options, onChange, onAdd, addDisabled, reorderable, colored }) => {
  const move = (from: number, to: number) => {
    const next = [...options];
    next.splice(to, 0, ...next.splice(from, 1));
    onChange(next);
  };
  const arrowBtn =
    "p-0.5 text-neutral-400 hover:text-brand disabled:opacity-30 disabled:pointer-events-none";
  return (
  <div className="flex flex-wrap items-center gap-1.5">
    <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
      Options ({options.length}):
    </span>
    {options.map((opt, idx) => (
      <div key={idx} className="flex items-center">
        {reorderable && (
          <button
            type="button"
            onClick={() => move(idx, idx - 1)}
            disabled={idx === 0}
            className={arrowBtn}
            title="Move earlier in the list"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
        )}
        <input
          value={opt?.label ?? opt?.value ?? ""}
          onChange={(e) => {
            const next = [...options];
            next[idx] = { ...next[idx], label: e.target.value, value: e.target.value };
            onChange(next);
          }}
          placeholder="Option text"
          className={`${inlineInputCls} w-32`}
          style={
            colored
              ? {
                  backgroundColor: opt.color ?? suggestedOptionColor(opt.label),
                  color: resultTextColor(opt.color ?? suggestedOptionColor(opt.label)),
                  fontWeight: 600,
                }
              : undefined
          }
        />
        {colored && (
          <input
            type="color"
            value={opt.color ?? suggestedOptionColor(opt.label)}
            onChange={(e) => {
              const next = [...options];
              next[idx] = { ...next[idx], color: e.target.value };
              onChange(next);
            }}
            title="Colour for this choice"
            aria-label="Colour"
            className="h-7 w-7 p-0 border border-neutral-300 dark:border-neutral-700 rounded-none bg-transparent cursor-pointer"
          />
        )}
        {reorderable && (
          <button
            type="button"
            onClick={() => move(idx, idx + 1)}
            disabled={idx === options.length - 1}
            className={arrowBtn}
            title="Move later in the list"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange(options.filter((_, i) => i !== idx))}
          className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
          title="Remove option"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    ))}
    <button
      type="button"
      onClick={onAdd}
      disabled={addDisabled}
      className="h-7 px-2 text-xs border border-neutral-300 dark:border-neutral-600 rounded-none hover:bg-neutral-100 dark:hover:bg-dark-200 inline-flex items-center gap-1 disabled:opacity-50 disabled:pointer-events-none"
    >
      <Plus className="w-3 h-3" />
      Add
    </button>
  </div>
  );
};

type ChecklistItem = NonNullable<SectionConfig["checklistItems"]>[number];

/** Edit the result choices of every checklist row at once. Mount with a key so it starts fresh. */
export const ChecklistTableChoices: React.FC<{
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}> = ({ items, onChange }) => {
  const [before, setBefore] = useState(() => snapshotRowChoices(items));
  const [choices, setChoices] = useState(() => tableChoices(items));
  const update = (next: TableChoice[]) => {
    setChoices(next);
    onChange(applyTableChoices(items, before, next));
  };
  const matchEveryRow = () => {
    const labels = [...new Set(choices.map((c) => c.label).filter((l) => l.trim()))];
    const next = items.map((item) => ({ ...item, resultOptions: labels }));
    setBefore(snapshotRowChoices(next));
    setChoices(tableChoices(next));
    onChange(next);
  };
  return (
    <div className="min-w-0 space-y-1">
      <InlineOptionsEditor
        reorderable
        options={choices.map((c) => ({ ...c, value: c.label }))}
        onChange={(next) => update(next as unknown as TableChoice[])}
        onAdd={() => update([...choices, { from: null, label: `Option ${choices.length + 1}` }])}
      />
      {rowsDiffer(items) && (
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Some rows have their own choices. Changes here only reach the rows that use that choice.{" "}
          <button type="button" onClick={matchEveryRow} className="text-brand hover:underline">
            Give every row this exact list
          </button>
        </p>
      )}
    </div>
  );
};

/** Edit the result choices of one checklist row. */
export const ChecklistRowChoices: React.FC<{
  item: ChecklistItem;
  onChange: (resultOptions: string[]) => void;
}> = ({ item, onChange }) => {
  const list = item.resultOptions ?? [];
  return (
    <InlineOptionsEditor
      reorderable
      options={list.map((v) => ({ label: v, value: v }))}
      onChange={(next) => onChange(next.map((o) => o.label))}
      onAdd={() => onChange([...list, `Option ${list.length + 1}`])}
    />
  );
};

/** The rows of a checklist, with their result choices. */
const ChecklistItemsEditor: React.FC<{
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}> = ({ items, onChange }) => {
  // Which row's result choices are open ("all" = the whole table).
  const [editing, setEditing] = useState<string | null>(null);
  const toggle = (target: string) => setEditing((e) => (e === target ? null : target));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="mr-auto text-xs text-neutral-500 dark:text-neutral-400">
          {items.length} items
        </span>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => toggle("all")}>
            {editing === "all" ? "Close result choices" : "Edit result choices for all items"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange([
              ...items,
              {
                id: `item-${Date.now()}`,
                netaSection: "",
                description: "New inspection item",
                resultOptions: items[0]?.resultOptions ?? [
                  "satisfactory",
                  "unsatisfactory",
                  "Not Applicable",
                ],
              },
            ])
          }
          leftIcon={<Plus className="w-3 h-3" />}
        >
          Add Item
        </Button>
      </div>

      {editing === "all" && (
        <div className="border border-brand px-2 py-1.5 rounded-none">
          <ChecklistTableChoices items={items} onChange={onChange} />
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item.id}>
            <ChecklistItemEditor
              item={item}
              choicesOpen={editing === item.id}
              onToggleChoices={() => toggle(item.id)}
              onUpdate={(updates) => {
                const next = [...items];
                next[index] = { ...item, ...updates };
                onChange(next);
              }}
              onDelete={() => onChange(items.filter((i) => i.id !== item.id))}
            />
            {editing === item.id && (
              <div className="border border-t-0 border-brand px-2 py-1.5 rounded-none">
                <ChecklistRowChoices
                  item={item}
                  onChange={(resultOptions) => {
                    const next = [...items];
                    next[index] = { ...item, resultOptions };
                    onChange(next);
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Field Editor for individual fields.
 * Row 1 holds every setting; row 2 only appears for dropdown options.
 */
const FieldEditor: React.FC<{
  field: FieldConfig;
  onUpdate: (updates: Partial<FieldConfig>) => void;
  onDelete: () => void;
  onAppendOption?: () => void;
  hideDelete?: boolean;
  compact?: boolean;
  /** Drag handle props from the sortable wrapper (grouped-field reordering) */
  dragHandleProps?: Record<string, unknown>;
  /** Grid width of the parent grouped-field component; enables the span controls */
  gridColumns?: number;
  /** A Job Details field, which can start from the job overview. */
  jobInfo?: boolean;
}> = ({
  field,
  onUpdate,
  onDelete,
  onAppendOption,
  hideDelete,
  dragHandleProps,
  gridColumns,
  jobInfo,
}) => {
  const [addOptionCooldown, setAddOptionCooldown] = useState(false);

  const handleAddOption = () => {
    if (addOptionCooldown) return;
    setAddOptionCooldown(true);
    if (onAppendOption) {
      onAppendOption();
    } else {
      const currentOptions = field.options || [];
      onUpdate({
        options: [
          ...currentOptions,
          { label: "New option", value: "new-option" },
        ],
      });
    }
    window.setTimeout(() => setAddOptionCooldown(false), 500);
  };

  return (
    <div className="bg-neutral-50 dark:bg-dark-100 rounded-none px-2 py-1.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {dragHandleProps && (
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 touch-none"
            {...dragHandleProps}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
        <input
          value={field.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Field label"
          title="Field label"
          className={`${inlineInputCls} flex-1 min-w-[10rem] font-medium`}
        />
        <select
          value={typeSelectValue(field)}
          onChange={(e) => {
            const updates: Partial<FieldConfig> = typeChoicePatch(field, e.target.value);
            if (
              updates.type === FieldType.SELECT &&
              !updates.options &&
              !(field.options && field.options.length)
            ) {
              updates.options = [];
            }
            onUpdate(updates);
          }}
          title="Field type"
          className={`${inlineInputCls} w-32`}
        >
          <option value={FieldType.TEXT}>Text</option>
          <option value={FieldType.NUMBER}>Number</option>
          <option value={FieldType.DATE}>Date</option>
          <option value={FieldType.SELECT}>Select</option>
          <option value={RESULT_TYPE_VALUE}>{RESULT_TYPE_LABEL}</option>
          <option value={FieldType.RADIO}>Radio buttons</option>
          <option value={FieldType.TEXTAREA}>Text Area</option>
          <option value={FieldType.CHECKBOX}>Checkbox</option>
          <option value={FieldType.TEMPERATURE}>Temperature (°F with °C)</option>
          <option value={FieldType.SIGNATURE}>Signature</option>
          <option value={FieldType.PHOTO}>Photos</option>
        </select>

        {canHaveHint(field) && (
          <input
            value={field.placeholder ?? ""}
            onChange={(e) => onUpdate({ placeholder: e.target.value || undefined })}
            placeholder="Hint"
            title={HINT_TITLE}
            className={`${inlineInputCls} w-28`}
          />
        )}

        {field.unit !== undefined && (
          <input
            value={field.unit}
            onChange={(e) => onUpdate({ unit: e.target.value })}
            placeholder="Unit"
            title="Unit (e.g. kV, A, Ω)"
            className={`${inlineInputCls} w-16`}
          />
        )}

        {/* Field size within the component grid (width = columns spanned, height = rows spanned) */}
        {gridColumns != null && gridColumns > 1 && (
          <>
            <label
              className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-neutral-400"
              title="Width (columns)"
            >
              W
              <select
                value={field.colSpan ?? 1}
                onChange={(e) =>
                  onUpdate({
                    colSpan: Math.max(1, parseInt(e.target.value, 10) || 1),
                  })
                }
                className={`${inlineInputCls} w-16`}
              >
                {Array.from({ length: gridColumns }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}/{gridColumns}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-neutral-400"
              title="Height (rows)"
            >
              H
              <input
                type="number"
                min={1}
                value={field.rowSpan ?? 1}
                onChange={(e) =>
                  onUpdate({
                    rowSpan: Math.max(1, parseInt(e.target.value, 10) || 1),
                  })
                }
                className={`${inlineInputCls} w-14`}
              />
            </label>
          </>
        )}

        <AssetSourceSelect value={field.assetSource} onChange={(assetSource) => onUpdate({ assetSource })} />

        {jobInfo && <JobFillControl field={field} onChange={onUpdate} />}

        <label className="flex items-center gap-1 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={!!field.required}
            onChange={(e) => onUpdate({ required: e.target.checked })}
            className="rounded-none"
          />
          Required
        </label>

        {!hideDelete && (
          <button
            onClick={onDelete}
            className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
            title="Delete field"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {field.type === FieldType.SELECT && (
        <div className="pl-6">
          <InlineOptionsEditor
            colored={isResultField(field)}
            options={field.options || []}
            onChange={(options) => onUpdate({ options })}
            onAdd={handleAddOption}
            addDisabled={addOptionCooldown}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Checklist Item Editor – NETA section and description on one line.
 */
const ChecklistItemEditor: React.FC<{
  item: any;
  onUpdate: (updates: any) => void;
  onDelete: () => void;
  choicesOpen: boolean;
  onToggleChoices: () => void;
}> = ({ item, onUpdate, onDelete, choicesOpen, onToggleChoices }) => (
  <div className="bg-neutral-50 dark:bg-dark-100 rounded-none px-2 py-1.5 flex items-center gap-2">
    <input
      value={item.netaSection ?? ""}
      onChange={(e) => onUpdate({ netaSection: e.target.value })}
      placeholder="NETA Section (e.g., 7.3.3.A.1)"
      title="NETA Section"
      className={`${inlineInputCls} w-40 shrink-0`}
    />
    <input
      value={item.description ?? ""}
      onChange={(e) => onUpdate({ description: e.target.value })}
      placeholder="Description"
      title={item.description}
      className={`${inlineInputCls} flex-1 min-w-0`}
    />
    <button
      type="button"
      onClick={onToggleChoices}
      className={`shrink-0 text-[11px] hover:text-brand ${
        choicesOpen ? "text-brand" : "text-neutral-500 dark:text-neutral-400"
      }`}
      title={(item.resultOptions ?? []).join(", ") || "No choices yet"}
    >
      Choices ({item.resultOptions?.length ?? 0})
    </button>
    <button
      onClick={onDelete}
      className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
      title="Delete item"
    >
      <Trash2 className="w-3 h-3" />
    </button>
  </div>
);
