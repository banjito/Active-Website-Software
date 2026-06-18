/**
 * Section Editor
 *
 * Right sidebar for editing selected section properties.
 * Supports: section title, table rows/columns, field labels,
 * and for table columns: "Populate from field" or "Calculate from formula".
 */

import React, { useState, useRef } from "react";
import {
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Link2,
  Calculator,
  Type,
  Save,
  ChevronDown,
  FileCode2,
  GripVertical,
  Columns,
} from "lucide-react";
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

  return (
    <div className="w-96 bg-white dark:bg-dark-150 border-l dark:border-neutral-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b dark:border-neutral-700 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white shrink-0">
            Edit Section
          </h2>
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
                  className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded border border-neutral-200 dark:border-neutral-600"
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
        <button
          onClick={onClose}
          className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Job Details: prominent TCF callout so users know they can reference it */}
        {section.componentType === ComponentType.JOB_INFO && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3">
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

        {/* Basic Settings header with Edit Formulas button */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Basic Settings
            </h3>
            {section.columns &&
              section.columns.length > 0 &&
              onToggleFormulaEditing && (
                <button
                  type="button"
                  onClick={onToggleFormulaEditing}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                    isFormulaEditing
                      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-700 border-neutral-200 dark:border-neutral-600"
                  }`}
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  {isFormulaEditing ? "Exit Formulas" : "Edit Formulas"}
                </button>
              )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Section Title
              </label>
              <Input
                value={section.title}
                onChange={(e) => onUpdate({ title: e.target.value })}
                placeholder="Enter section title"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Reference code
              </label>
              <Input
                value={section.referenceCode ?? ""}
                onChange={(e) =>
                  onUpdate({ referenceCode: e.target.value || undefined })
                }
                placeholder={getSectionReferenceCode(section)}
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                e.g. {"{"}
                {getSectionReferenceCode(section)}.C1.R2
                {"}"} (
                {getReferenceDescription(
                  `${getSectionReferenceCode(section)}.C1.R2`,
                  allSections.length ? allSections : [section],
                )}
                )
              </p>
              {section.componentType === ComponentType.JOB_INFO && (
                <p className="text-[10px] text-neutral-600 dark:text-neutral-300 mt-1 font-medium">
                  In formulas use {"{JD.TCF}"} for Temperature Correction Factor
                  (from this section’s temp/humidity).
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showInPrint"
                checked={section.showInPrint}
                onChange={(e) => onUpdate({ showInPrint: e.target.checked })}
                className="rounded"
              />
              <label
                htmlFor="showInPrint"
                className="text-sm text-neutral-700 dark:text-neutral-300 flex items-center gap-1"
              >
                {section.showInPrint ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
                Show in printed report
              </label>
            </div>
            {section.componentType === ComponentType.CONTACT_RESISTANCE && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showDeviation"
                  checked={section.showDeviation !== false}
                  onChange={(e) =>
                    onUpdate({ showDeviation: e.target.checked })
                  }
                  className="rounded"
                />
                <label
                  htmlFor="showDeviation"
                  className="text-sm text-neutral-700 dark:text-neutral-300"
                >
                  Show Value Deviation (Phase / Neutral / Ground)
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Table Settings (for table-based components) */}
        {section.columns && (
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
              Table Settings
            </h3>

            <div className="space-y-3">
              {/* Number of Rows - only for regular tables, not conditional tables */}
              {section.componentType !== ComponentType.CONDITIONAL_TABLE && (
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Number of Rows
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
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
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      ({section.minRows || 1} - {section.maxRows || 100})
                    </span>
                  </div>
                </div>
              )}

              {/* Allow Add/Remove Rows */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allowAddRows"
                    checked={section.allowAddRows}
                    onChange={(e) =>
                      onUpdate({ allowAddRows: e.target.checked })
                    }
                    className="rounded"
                  />
                  <label
                    htmlFor="allowAddRows"
                    className="text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    Allow adding rows
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allowRemoveRows"
                    checked={section.allowRemoveRows}
                    onChange={(e) =>
                      onUpdate({ allowRemoveRows: e.target.checked })
                    }
                    className="rounded"
                  />
                  <label
                    htmlFor="allowRemoveRows"
                    className="text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    Allow removing rows
                  </label>
                </div>
              </div>

              {/* Link row count with another table */}
              {onLinkRowCountWith &&
                section.componentType !== ComponentType.CONDITIONAL_TABLE && (
                  <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3 mt-3">
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Link row count with
                    </label>
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-1.5">
                      When linked, adding or removing a row in one table updates
                      the other so formulas stay in sync.
                    </p>
                    <select
                      value={
                        section.rowCountLinkGroupId
                          ? (allSections.find(
                              (s) =>
                                s.id !== section.id &&
                                s.rowCountLinkGroupId ===
                                  section.rowCountLinkGroupId,
                            )?.id ?? "")
                          : ""
                      }
                      onChange={(e) =>
                        onLinkRowCountWith(e.target.value || null)
                      }
                      className="w-full px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-150 text-neutral-900 dark:text-white"
                    >
                      <option value="">None</option>
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
                      <p className="text-[10px] text-green-600 dark:text-green-400 mt-1">
                        Linked with:{" "}
                        {allSections
                          .filter(
                            (s) =>
                              s.rowCountLinkGroupId ===
                                section.rowCountLinkGroupId &&
                              s.id !== section.id,
                          )
                          .map((s) => s.title || s.id)
                          .join(", ") || "other table(s)"}
                      </p>
                    )}
                  </div>
                )}

              {/* Fields above table (e.g. Test Voltage, Test Duration) - only for non-conditional tables */}
              {section.componentType !== ComponentType.CONDITIONAL_TABLE && (
                <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3 mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Fields above table
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const id = `above-${Date.now()}`;
                        const newField: FieldConfig = {
                          id,
                          label: "New field",
                          type: FieldType.TEXT,
                        };
                        onUpdate({
                          aboveTableFields: [
                            ...(section.aboveTableFields || []),
                            newField,
                          ],
                        });
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add field
                    </Button>
                  </div>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-2">
                    Optional inputs shown above the table (e.g. Test Voltage,
                    Test Duration). Choose input type for each.
                  </p>
                  <div className="space-y-2">
                    {(section.aboveTableFields || []).map((f, idx) => (
                      <div
                        key={f.id}
                        className="p-2 rounded border border-neutral-200 dark:border-neutral-600 space-y-1.5 bg-neutral-50/50 dark:bg-dark-100/50"
                      >
                        <div className="flex items-center gap-2">
                          <Input
                            value={f.label}
                            onChange={(e) => {
                              const next = [
                                ...(section.aboveTableFields || []),
                              ];
                              next[idx] = { ...f, label: e.target.value };
                              onUpdate({ aboveTableFields: next });
                            }}
                            placeholder="Label (e.g. Test Voltage)"
                            className="text-xs flex-1"
                          />
                          <select
                            value={f.type}
                            onChange={(e) => {
                              const next = [
                                ...(section.aboveTableFields || []),
                              ];
                              const newType = e.target.value as FieldType;
                              next[idx] = {
                                ...f,
                                type: newType,
                                ...(newType === FieldType.SELECT &&
                                !f.options?.length
                                  ? {
                                      options: [
                                        {
                                          label: "Option 1",
                                          value: "Option 1",
                                        },
                                      ],
                                    }
                                  : {}),
                              };
                              onUpdate({ aboveTableFields: next });
                            }}
                            className="px-2 py-1 text-xs bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded text-neutral-900 dark:text-white"
                          >
                            <option value={FieldType.TEXT}>Text</option>
                            <option value={FieldType.NUMBER}>Number</option>
                            <option value={FieldType.DATE}>Date</option>
                            <option value={FieldType.SELECT}>Dropdown</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              const next = (
                                section.aboveTableFields || []
                              ).filter((_, i) => i !== idx);
                              onUpdate({ aboveTableFields: next });
                            }}
                            className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        {f.type === FieldType.SELECT && (
                          <div className="pl-1 space-y-1">
                            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                              Options:
                            </span>
                            {(f.options || []).map((opt, oIdx) => (
                              <div
                                key={oIdx}
                                className="flex items-center gap-1"
                              >
                                <Input
                                  value={opt?.label ?? opt?.value ?? ""}
                                  onChange={(e) => {
                                    const next = [
                                      ...(section.aboveTableFields || []),
                                    ];
                                    const opts = [...(next[idx].options || [])];
                                    opts[oIdx] = {
                                      label: e.target.value,
                                      value: e.target.value,
                                    };
                                    next[idx] = { ...next[idx], options: opts };
                                    onUpdate({ aboveTableFields: next });
                                  }}
                                  className="text-xs h-7 flex-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = [
                                      ...(section.aboveTableFields || []),
                                    ];
                                    next[idx] = {
                                      ...next[idx],
                                      options: (next[idx].options || []).filter(
                                        (_, i) => i !== oIdx,
                                      ),
                                    };
                                    onUpdate({ aboveTableFields: next });
                                  }}
                                  className="p-1 text-neutral-400 hover:text-red-600"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const next = [
                                  ...(section.aboveTableFields || []),
                                ];
                                const opts = [
                                  ...(next[idx].options || []),
                                  {
                                    label: `Option ${(next[idx].options?.length || 0) + 1}`,
                                    value: `Option ${(next[idx].options?.length || 0) + 1}`,
                                  },
                                ];
                                next[idx] = { ...next[idx], options: opts };
                                onUpdate({ aboveTableFields: next });
                              }}
                              className="text-[10px] text-[#f26722] hover:underline"
                            >
                              + Add option
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Print layout (table margins & row height) */}
              <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3 mt-3">
                <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                  Print layout
                </h4>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                  Margins and row height for preview and print/PDF (e.g. 0, 4px,
                  0.25in).
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">
                      Margin top
                    </label>
                    <Input
                      value={section.printLayout?.marginTop ?? ""}
                      onChange={(e) =>
                        onUpdate({
                          printLayout: {
                            ...section.printLayout,
                            marginTop: e.target.value || undefined,
                          },
                        })
                      }
                      placeholder="0"
                      className="text-xs py-1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">
                      Margin bottom
                    </label>
                    <Input
                      value={section.printLayout?.marginBottom ?? ""}
                      onChange={(e) =>
                        onUpdate({
                          printLayout: {
                            ...section.printLayout,
                            marginBottom: e.target.value || undefined,
                          },
                        })
                      }
                      placeholder="0"
                      className="text-xs py-1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">
                      Margin left
                    </label>
                    <Input
                      value={section.printLayout?.marginLeft ?? ""}
                      onChange={(e) =>
                        onUpdate({
                          printLayout: {
                            ...section.printLayout,
                            marginLeft: e.target.value || undefined,
                          },
                        })
                      }
                      placeholder="0"
                      className="text-xs py-1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">
                      Margin right
                    </label>
                    <Input
                      value={section.printLayout?.marginRight ?? ""}
                      onChange={(e) =>
                        onUpdate({
                          printLayout: {
                            ...section.printLayout,
                            marginRight: e.target.value || undefined,
                          },
                        })
                      }
                      placeholder="0"
                      className="text-xs py-1"
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">
                    Row height
                  </label>
                  <Input
                    value={section.printLayout?.rowHeight ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        printLayout: {
                          ...section.printLayout,
                          rowHeight: e.target.value || undefined,
                        },
                      })
                    }
                    placeholder="auto or e.g. 24px"
                    className="text-xs py-1"
                  />
                </div>
              </div>

              {/* Columns */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Columns
                  </label>
                  <div className="flex items-center gap-1">
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
                    >
                      <Columns className="w-3 h-3 mr-1" />
                      Even %
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const newColumn: ColumnConfig = {
                          id: `col-${Date.now()}`,
                          label: `Column ${(section.columns?.length || 0) + 1}`,
                          width: "25%",
                          field: {
                            id: `field-${Date.now()}`,
                            label: `Column ${(section.columns?.length || 0) + 1}`,
                            type: FieldType.TEXT,
                          },
                        };
                        onUpdate({
                          columns: [...(section.columns || []), newColumn],
                        });
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Column
                    </Button>
                  </div>
                </div>

                <DndContext
                  sensors={columnSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleColumnDragEnd}
                >
                  <SortableContext
                    items={section.columns?.map((c) => c.id) || []}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {section.columns?.map((column, index) => (
                        <SortableColumnEditor
                          key={column.id}
                          id={column.id}
                          column={column}
                          currentSectionId={section.id}
                          allSections={allSections}
                          settingFields={section.settingFields}
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
                            const newColumns = section.columns?.filter(
                              (c) => c.id !== column.id,
                            );
                            onUpdate({ columns: newColumns });
                          }}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>

              {/* Conditional table: setting dropdowns and which rows show for each value */}
              {(section.componentType === ComponentType.CONDITIONAL_TABLE ||
                (section.columns?.length &&
                  (section.settingFields?.length ||
                    section.conditionalRows?.length))) && (
                <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3 mt-3 space-y-4">
                  <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Conditional table (dropdowns control visible rows)
                  </h4>

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
                      >
                        <Plus className="w-3 h-3 mr-1" />
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
                                onUpdate({ settingFields: next });
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
                                    const next = [
                                      ...(section.settingFields || []),
                                    ];
                                    const opts = [...(next[idx].options || [])];
                                    opts[oIdx] = {
                                      ...opt,
                                      value: e.target.value,
                                      label: e.target.value,
                                    };
                                    next[idx] = { ...next[idx], options: opts };
                                    onUpdate({ settingFields: next });
                                  }}
                                  className="w-16 h-5 text-[10px] py-0"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = [
                                      ...(section.settingFields || []),
                                    ];
                                    const opts = next[idx].options.filter(
                                      (_, i) => i !== oIdx,
                                    );
                                    next[idx] = { ...next[idx], options: opts };
                                    onUpdate({ settingFields: next });
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
                              className="text-[10px] text-[#f26722] hover:underline"
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
                      >
                        <Plus className="w-3 h-3 mr-1" />
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
              )}
            </div>
          </div>
        )}

        {/* Fields Settings (for grouped field components) */}
        {section.fields && (
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
              Fields
            </h3>

            <div className="space-y-3">
              {/* Layout — Job Details is fixed 5 wide × 2 down; others can choose */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Layout
                </label>
                {section.componentType === ComponentType.JOB_INFO ? (
                  <div className="px-3 py-2 rounded-md bg-neutral-100 dark:bg-dark-200 text-neutral-700 dark:text-neutral-300 text-sm border border-neutral-200 dark:border-neutral-600">
                    5 columns, 2 rows (fixed for Job Details)
                  </div>
                ) : (
                  <select
                    value={section.layout || "single-column"}
                    onChange={(e) =>
                      onUpdate({ layout: e.target.value as any })
                    }
                    className="w-full px-3 py-2 bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722] text-neutral-900 dark:text-white text-sm"
                  >
                    <option value="single-column">Single Column</option>
                    <option value="two-column">Two Columns</option>
                    <option value="three-column">Three Columns</option>
                    <option value="four-column">Four Columns</option>
                    <option value="five-column">Five Columns</option>
                    <option value="grid">Grid</option>
                  </select>
                )}
              </div>

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
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Field
                  </Button>
                </div>

                <div className="space-y-2">
                  {section.fields?.map((field, index) => (
                    <FieldEditor
                      key={field.id}
                      field={field}
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
              </div>
            </div>
          </div>
        )}

        {/* Single Field Settings */}
        {section.field && (
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
              Field Settings
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
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
              Checklist Items
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {section.checklistItems.length} items
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newItem = {
                      id: `item-${Date.now()}`,
                      netaSection: "",
                      description: "New inspection item",
                      resultOptions: [
                        "satisfactory",
                        "unsatisfactory",
                        "Not Applicable",
                      ],
                    };
                    onUpdate({
                      checklistItems: [
                        ...(section.checklistItems || []),
                        newItem,
                      ],
                    });
                  }}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-2">
                {section.checklistItems?.map((item, index) => (
                  <ChecklistItemEditor
                    key={item.id}
                    item={item}
                    onUpdate={(updates) => {
                      const newItems = [...(section.checklistItems || [])];
                      newItems[index] = { ...item, ...updates };
                      onUpdate({ checklistItems: newItems });
                    }}
                    onDelete={() => {
                      const newItems = section.checklistItems?.filter(
                        (i) => i.id !== item.id,
                      );
                      onUpdate({ checklistItems: newItems });
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Print layout for sections that render a table but don't have Table Settings (fields / single field / checklist) */}
        {!section.columns &&
          (section.fields?.length ||
            section.field ||
            section.checklistItems?.length) && (
            <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3 mt-3">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-2">
                Print layout
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                Table margins and row height for preview and print/PDF.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">
                    Margin top
                  </label>
                  <Input
                    value={section.printLayout?.marginTop ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        printLayout: {
                          ...section.printLayout,
                          marginTop: e.target.value || undefined,
                        },
                      })
                    }
                    placeholder="0"
                    className="text-xs py-1"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">
                    Margin bottom
                  </label>
                  <Input
                    value={section.printLayout?.marginBottom ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        printLayout: {
                          ...section.printLayout,
                          marginBottom: e.target.value || undefined,
                        },
                      })
                    }
                    placeholder="0"
                    className="text-xs py-1"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">
                    Margin left
                  </label>
                  <Input
                    value={section.printLayout?.marginLeft ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        printLayout: {
                          ...section.printLayout,
                          marginLeft: e.target.value || undefined,
                        },
                      })
                    }
                    placeholder="0"
                    className="text-xs py-1"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">
                    Margin right
                  </label>
                  <Input
                    value={section.printLayout?.marginRight ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        printLayout: {
                          ...section.printLayout,
                          marginRight: e.target.value || undefined,
                        },
                      })
                    }
                    placeholder="0"
                    className="text-xs py-1"
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">
                  Row height
                </label>
                <Input
                  value={section.printLayout?.rowHeight ?? ""}
                  onChange={(e) =>
                    onUpdate({
                      printLayout: {
                        ...section.printLayout,
                        rowHeight: e.target.value || undefined,
                      },
                    })
                  }
                  placeholder="auto or e.g. 24px"
                  className="text-xs py-1"
                />
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

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
}> = ({
  column,
  currentSectionId,
  allSections,
  settingFields,
  onUpdate,
  onDelete,
  onAppendOption,
  dragHandleProps,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const field = column.field;
  const behavior = field.cellBehavior ?? "user";
  const refOptions = buildFieldRefOptions(
    allSections /* include current section so user can pick column+row from same table */,
  );

  const handleBehaviorChange = (next: "user" | "populate" | "calculate") => {
    onUpdate({
      field: {
        ...field,
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
      },
    });
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

  return (
    <div className="bg-neutral-50 dark:bg-dark-100 rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        {dragHandleProps && (
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 touch-none"
            {...dragHandleProps}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 text-left text-sm font-medium text-neutral-900 dark:text-white"
        >
          {column.label}
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-2 pt-2 border-t dark:border-neutral-700">
          <Input
            value={column.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="Column label"
            className="text-xs"
          />

          <div>
            <label className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1">
              Column width (e.g. 25%, 100px, auto)
            </label>
            <Input
              value={column.width || ""}
              onChange={(e) => onUpdate({ width: e.target.value || undefined })}
              placeholder="auto"
              className="text-xs"
            />
          </div>

          {/* Conditional table: show column only when these setting values are selected */}
          {settingFields && settingFields.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-neutral-200 dark:border-neutral-600">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block">
                Show column when
              </label>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                Leave all unchecked to show for every selection.
              </p>
              {settingFields.map((sf) => {
                const current = column.visibleWhen?.[sf.id];
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
                      {sf.label}:
                    </span>
                    {sf.options.map((opt) => {
                      const checked = currentList.includes(opt.value);
                      return (
                        <label
                          key={opt.value}
                          className="flex items-center gap-1 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const nextList = e.target.checked
                                ? [
                                    ...currentList.filter(
                                      (v) => v !== opt.value,
                                    ),
                                    opt.value,
                                  ]
                                : currentList.filter((v) => v !== opt.value);
                              const vw = { ...(column.visibleWhen || {}) };
                              if (nextList.length === 0) delete vw[sf.id];
                              else
                                vw[sf.id] =
                                  nextList.length === 1
                                    ? nextList[0]
                                    : nextList;
                              onUpdate({ visibleWhen: vw });
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
          )}

          {/* Cell value: User entry | Populate from report | Calculate from report */}
          {allSections.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block">
                Cell value
              </span>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`cell-${column.id}`}
                    checked={behavior === "user"}
                    onChange={() => handleBehaviorChange("user")}
                    className="rounded"
                  />
                  <Type className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="text-xs">User entry</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`cell-${column.id}`}
                    checked={behavior === "populate"}
                    onChange={() => handleBehaviorChange("populate")}
                    className="rounded"
                  />
                  <Link2 className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="text-xs">Populate from field</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`cell-${column.id}`}
                    checked={behavior === "calculate"}
                    onChange={() => handleBehaviorChange("calculate")}
                    className="rounded"
                  />
                  <Calculator className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="text-xs">Calculate from formula</span>
                </label>
              </div>

              {behavior === "user" && (
                <div className="mt-2 space-y-2 pt-2 border-t border-neutral-200 dark:border-neutral-600">
                  <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block">
                    Input type
                  </label>
                  <select
                    value={field.type}
                    onChange={(e) => {
                      const newType = e.target.value as FieldType;
                      const updates: Partial<FieldConfig> = { type: newType };
                      if (
                        newType === FieldType.SELECT &&
                        !(field.options && field.options.length)
                      ) {
                        updates.options = [
                          { label: "Option 1", value: "Option 1" },
                        ];
                      }
                      onUpdate({ field: { ...field, ...updates } });
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722] text-neutral-900 dark:text-white"
                  >
                    <option value={FieldType.TEXT}>Text</option>
                    <option value={FieldType.NUMBER}>Number</option>
                    <option value={FieldType.DATE}>Date</option>
                    <option value={FieldType.SELECT}>Dropdown (select)</option>
                  </select>
                  {field.type === FieldType.SELECT && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-neutral-600 dark:text-neutral-400">
                          Dropdown options ({(field.options || []).length})
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const currentOptions = field.options || [];
                            onUpdate({
                              field: {
                                ...field,
                                options: [
                                  ...currentOptions,
                                  {
                                    label: `Option ${currentOptions.length + 1}`,
                                    value: `Option ${currentOptions.length + 1}`,
                                  },
                                ],
                              },
                            });
                          }}
                          className="h-6 px-2 text-xs border border-neutral-300 dark:border-neutral-600 rounded hover:bg-neutral-100 dark:hover:bg-dark-200 inline-flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Add option
                        </button>
                      </div>
                      <ul className="space-y-1 max-h-40 overflow-y-auto">
                        {(field.options || []).map((opt, idx) => (
                          <li
                            key={`${field.id}-opt-${idx}`}
                            className="flex items-center gap-1.5"
                          >
                            <Input
                              value={opt?.label ?? ""}
                              onChange={(e) => {
                                const next = [...(field.options || [])];
                                next[idx] = {
                                  label: e.target.value,
                                  value: e.target.value,
                                };
                                onUpdate({
                                  field: { ...field, options: next },
                                });
                              }}
                              placeholder="Option text"
                              className="flex-1 text-xs h-7"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const next = (field.options || []).filter(
                                  (_, i) => i !== idx,
                                );
                                onUpdate({
                                  field: { ...field, options: next },
                                });
                              }}
                              className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                              title="Remove option"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                      {(field.options || []).length === 0 && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          Add options above so users can pick a value.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {behavior === "populate" && (
                <div className="mt-2">
                  <label className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1">
                    Copy value from (pick section, column, and row)
                  </label>
                  <select
                    value={getPopulateFromValue()}
                    onChange={(e) => handlePopulateFromSelect(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722] text-neutral-900 dark:text-white"
                  >
                    <option value="">— Select a field —</option>
                    {Array.from(
                      new Map(
                        refOptions.map((o) => [o.sectionId, o.sectionTitle]),
                      ).entries(),
                    ).map(([sectionId, sectionTitle]) => (
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
                </div>
              )}

              {behavior === "calculate" && (
                <div className="mt-2 space-y-1.5">
                  <label className="text-xs text-neutral-500 dark:text-neutral-400 block">
                    Formula — use refs like {"{IR.C1.R2}"} (table) or{" "}
                    {"{JD.TCF}"} (Job Details TCF)
                  </label>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    Job Details: {"{JD.TCF}"} = Temperature Correction Factor
                    (from temp/humidity). Add a Job Details section to the form
                    to use it.
                  </p>
                  <Textarea
                    value={field.calculation?.formula ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        field: {
                          ...field,
                          calculation: {
                            formula: e.target.value,
                            dependsOn: field.calculation?.dependsOn ?? [],
                          },
                        },
                      })
                    }
                    placeholder="e.g. {JD.TCF} * value or {IR.C1.R2}"
                    rows={2}
                    className="text-xs font-mono"
                  />
                  <div className="flex flex-wrap gap-1">
                    {refOptions.slice(0, 8).map((opt) => (
                      <button
                        key={opt.refToken}
                        type="button"
                        onClick={() => {
                          const current = field.calculation?.formula ?? "";
                          onUpdate({
                            field: {
                              ...field,
                              calculation: {
                                formula:
                                  current +
                                  (current ? " " : "") +
                                  opt.friendlyRef,
                                dependsOn: field.calculation?.dependsOn ?? [],
                              },
                            },
                          });
                        }}
                        className="px-2 py-1 text-xs font-mono bg-neutral-200 dark:bg-neutral-600 rounded hover:bg-[#f26722] hover:text-white dark:hover:bg-[#e55611]"
                        title={`${opt.friendlyRef} — ${opt.description}`}
                      >
                        {opt.friendlyRef}
                      </button>
                    ))}
                    {refOptions.length > 8 && (
                      <span className="text-xs text-neutral-500">
                        +{refOptions.length - 8} more below
                      </span>
                    )}
                  </div>
                  <select
                    className="w-full mt-1 px-2 py-1 text-xs font-mono bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-md"
                    onChange={(e) => {
                      const token = e.target.value;
                      if (!token) return;
                      const current = field.calculation?.formula ?? "";
                      onUpdate({
                        field: {
                          ...field,
                          calculation: {
                            formula: current + (current ? " " : "") + token,
                            dependsOn: field.calculation?.dependsOn ?? [],
                          },
                        },
                      });
                      e.target.value = "";
                    }}
                  >
                    <option value="">
                      Insert reference (pick section, column, row)…
                    </option>
                    {Array.from(
                      new Map(
                        refOptions.map((o) => [o.sectionId, o.sectionTitle]),
                      ).entries(),
                    ).map(([sectionId, sectionTitle]) => (
                      <optgroup key={sectionId} label={sectionTitle}>
                        {refOptions
                          .filter((o) => o.sectionId === sectionId)
                          .map((opt) => (
                            <option key={opt.refToken} value={opt.friendlyRef}>
                              {opt.friendlyRef} — {opt.description}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <FieldEditor
            field={column.field}
            onUpdate={(updates) =>
              onUpdate({ field: { ...column.field, ...updates } })
            }
            onAppendOption={onAppendOption}
            onDelete={() => {}}
            hideDelete
            compact
          />
        </div>
      )}
    </div>
  );
};

/**
 * Field Editor for individual fields
 */
const FieldEditor: React.FC<{
  field: FieldConfig;
  onUpdate: (updates: Partial<FieldConfig>) => void;
  onDelete: () => void;
  onAppendOption?: () => void;
  hideDelete?: boolean;
  compact?: boolean;
}> = ({ field, onUpdate, onDelete, onAppendOption, hideDelete, compact }) => {
  const [isExpanded, setIsExpanded] = useState(!compact);
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
    <div className="bg-neutral-50 dark:bg-dark-100 rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 text-left text-sm font-medium text-neutral-900 dark:text-white"
        >
          {field.label}
        </button>
        {!hideDelete && (
          <button
            onClick={onDelete}
            className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-2 pt-2 border-t dark:border-neutral-700">
          <Input
            value={field.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="Field label"
            className="text-xs"
          />

          <select
            value={field.type}
            onChange={(e) => {
              const newType = e.target.value as FieldType;
              const updates: Partial<FieldConfig> = { type: newType };
              if (
                newType === FieldType.SELECT &&
                !(field.options && field.options.length)
              ) {
                updates.options = [];
              }
              onUpdate(updates);
            }}
            className="px-2 py-1 bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722] text-neutral-900 dark:text-white text-xs"
          >
            <option value={FieldType.TEXT}>Text</option>
            <option value={FieldType.NUMBER}>Number</option>
            <option value={FieldType.DATE}>Date</option>
            <option value={FieldType.SELECT}>Select</option>
            <option value={FieldType.TEXTAREA}>Text Area</option>
            <option value={FieldType.CHECKBOX}>Checkbox</option>
          </select>

          {field.type === FieldType.SELECT && (
            <div className="space-y-2 pt-1 border-t dark:border-neutral-700">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Dropdown options ({(field.options || []).length})
                </span>
                <button
                  type="button"
                  onClick={handleAddOption}
                  disabled={addOptionCooldown}
                  className="h-6 px-2 text-xs shrink-0 border border-neutral-300 dark:border-neutral-600 rounded hover:bg-neutral-100 dark:hover:bg-dark-200 inline-flex items-center gap-1 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Plus className="w-3 h-3" />
                  {addOptionCooldown ? "…" : "Add"}
                </button>
              </div>
              <ul className="space-y-1.5 max-h-[280px] overflow-y-auto overflow-x-hidden pr-1 min-h-[2rem]">
                {(field.options || []).map((opt, idx) => (
                  <li
                    key={`${field.id}-opt-${idx}`}
                    className="flex items-center gap-1.5"
                  >
                    <Input
                      value={opt?.label ?? ""}
                      onChange={(e) => {
                        const next = [...(field.options || [])];
                        next[idx] = {
                          label: e.target.value,
                          value: e.target.value,
                        };
                        onUpdate({ options: next });
                      }}
                      placeholder="Option text"
                      className="flex-1 text-xs h-7"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = (field.options || []).filter(
                          (_, i) => i !== idx,
                        );
                        onUpdate({ options: next });
                      }}
                      className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                      title="Remove option"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
              {(field.options || []).length === 0 && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  No options yet. Click Add to define dropdown choices.
                </p>
              )}

              {(field.options || []).length > 8 && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Scroll above to see all options. You can add as many as you
                  need.
                </p>
              )}
            </div>
          )}

          {field.unit !== undefined && (
            <Input
              value={field.unit}
              onChange={(e) => onUpdate({ unit: e.target.value })}
              placeholder="Unit (e.g., kV, A, Ω)"
              className="text-xs"
            />
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`required-${field.id}`}
              checked={field.required}
              onChange={(e) => onUpdate({ required: e.target.checked })}
              className="rounded text-xs"
            />
            <label
              htmlFor={`required-${field.id}`}
              className="text-xs text-neutral-700 dark:text-neutral-300"
            >
              Required
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Checklist Item Editor
 */
const ChecklistItemEditor: React.FC<{
  item: any;
  onUpdate: (updates: any) => void;
  onDelete: () => void;
}> = ({ item, onUpdate, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-neutral-50 dark:bg-dark-100 rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 text-left text-sm font-medium text-neutral-900 dark:text-white"
        >
          {item.netaSection || "No section"}:{" "}
          {item.description.substring(0, 40)}...
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-2 pt-2 border-t dark:border-neutral-700">
          <Input
            value={item.netaSection}
            onChange={(e) => onUpdate({ netaSection: e.target.value })}
            placeholder="NETA Section (e.g., 7.3.3.A.1)"
            className="text-xs"
          />

          <Textarea
            value={item.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Description"
            rows={3}
            className="text-xs"
          />
        </div>
      )}
    </div>
  );
};
