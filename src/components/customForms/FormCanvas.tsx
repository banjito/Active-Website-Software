/**
 * Form Canvas
 * 
 * The main drag-and-drop area where form sections are displayed and arranged.
 * Sections can be reordered, selected for editing, duplicated, or deleted.
 * Supports per-cell formula editing when formula mode is active.
 */

import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Trash2,
  Copy,
  Settings,
  Eye,
  EyeOff,
  FileCode2,
} from 'lucide-react';

import { SectionConfig, type ConditionalRowConfig, type ColumnConfig } from '@/lib/types/customForms';
import { getComponentDefinition } from '@/lib/customForms/componentLibrary';
import { getSectionReferenceCode } from '@/lib/customForms/formCellResolution';

function isVisibleWhen(
  visibleWhen: Record<string, string | string[]> | undefined,
  settings: Record<string, string>
): boolean {
  if (!visibleWhen || Object.keys(visibleWhen).length === 0) return true;
  for (const [settingId, allowed] of Object.entries(visibleWhen)) {
    const current = settings[settingId] ?? '';
    const allowedList = Array.isArray(allowed) ? allowed : [allowed];
    if (!allowedList.includes(current)) return false;
  }
  return true;
}

function isConditionalRowVisible(row: ConditionalRowConfig, settings: Record<string, string>): boolean {
  return isVisibleWhen(row.visibleWhen, settings);
}

interface SortableSectionProps {
  section: SectionConfig;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  isFormulaEditing?: boolean;
  onCellFormulaChange?: (sectionId: string, rowIndex: number, colId: string, formula: string) => void;
  onRequestEditFormulas?: (sectionId: string) => void;
}

const SortableSection: React.FC<SortableSectionProps> = ({
  section,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  isFormulaEditing = false,
  onCellFormulaChange,
  onRequestEditFormulas,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const componentDef = getComponentDefinition(section.componentType);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white dark:bg-dark-150 border-2 rounded-lg transition-all ${
        isSelected
          ? 'border-[#f26722] shadow-lg'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      {/* Section Header */}
      <div
        className={`flex items-center gap-2 md:gap-3 px-2 md:px-4 py-2 md:py-3 border-b ${
          isSelected
            ? 'border-[#f26722] bg-orange-50 dark:bg-orange-900/20'
            : 'border-gray-200 dark:border-gray-700'
        }`}
      >
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hidden md:block"
        >
          <GripVertical className="w-4 h-4 md:w-5 md:h-5" />
        </button>

        {/* Section Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xs md:text-sm font-semibold text-gray-900 dark:text-white truncate">
              {section.title}
            </h3>
            {isFormulaEditing && (
              <span className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded font-medium">
                <FileCode2 className="w-3 h-3" />
                Formula Mode
              </span>
            )}
            {!section.showInPrint && (
              <span className="hidden md:flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <EyeOff className="w-3 h-3" />
                Hidden in print
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {componentDef?.name || section.componentType}
          </p>
          <p className="font-mono text-[10px] text-gray-400 dark:text-gray-500 truncate" title={`${section.title || 'Section'} — use in formulas e.g. {${getSectionReferenceCode(section)}.C1.R2} (${section.title || 'Section'}, column 1, row 2)`}>
            {getSectionReferenceCode(section)} ({section.title || 'Section'})
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-0.5 md:gap-1">
          <button
            onClick={onSelect}
            className="p-1.5 md:p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-100 rounded"
            title="Edit section"
          >
            <Settings className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>

          <button
            onClick={onDuplicate}
            className="hidden md:block p-1.5 md:p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-100 rounded"
            title="Duplicate section"
          >
            <Copy className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>

          <button
            onClick={onDelete}
            className="p-1.5 md:p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-dark-100 rounded"
            title="Delete section"
          >
            <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>
        </div>
      </div>

      {/* Section Preview */}
      <div className="p-3 md:p-4">
        <SectionPreview
          section={section}
          isFormulaEditing={isFormulaEditing}
          onCellFormulaChange={onCellFormulaChange}
          onRequestEditFormulas={onRequestEditFormulas}
        />
      </div>
    </div>
  );
};

/** Interactive conditional table preview for the builder canvas */
const ConditionalTableCanvasPreview: React.FC<{ section: SectionConfig }> = ({ section }) => {
  const initialSettings: Record<string, string> = {};
  (section.settingFields ?? []).forEach((sf) => {
    initialSettings[sf.id] = sf.defaultValue ?? sf.options[0]?.value ?? '';
  });
  const [settings, setSettings] = useState<Record<string, string>>(initialSettings);

  const visibleRows = (section.conditionalRows ?? []).filter((row) =>
    isVisibleWhen(row.visibleWhen, settings)
  );
  const visibleColumns = (section.columns ?? []).filter((col: ColumnConfig) =>
    isVisibleWhen(col.visibleWhen, settings)
  );

  return (
    <div className="space-y-3 w-full min-w-0">
      <div className="flex flex-wrap items-center gap-3 text-xs pb-2 border-b border-gray-200 dark:border-gray-600">
        {(section.settingFields ?? []).map((sf) => (
          <div key={sf.id} className="flex items-center gap-1.5">
            <span className="font-medium text-gray-700 dark:text-gray-300">{sf.label}:</span>
            <select
              value={settings[sf.id] ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, [sf.id]: e.target.value }))}
              className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-dark-150 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#f26722]"
            >
              {sf.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {visibleColumns.length > 0 && visibleRows.length > 0 ? (
        <div className="overflow-x-auto w-full min-w-0">
          <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 text-xs">
            <thead>
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.id}
                    className="border border-gray-300 dark:border-gray-600 px-2 py-1 bg-gray-50 dark:bg-dark-200 text-left font-medium"
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 font-medium text-gray-700 dark:text-gray-300">
                    {row.label}
                  </td>
                  {visibleColumns.slice(1).map((col) => (
                    <td key={col.id} className="border border-gray-300 dark:border-gray-600 px-2 py-1">
                      <div className="h-6 bg-gray-100 dark:bg-dark-100 rounded" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic py-2">
          No rows/columns visible for the selected settings.
        </p>
      )}
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-gray-500 dark:text-gray-400">
          {visibleRows.length} row{visibleRows.length !== 1 ? 's' : ''}, {visibleColumns.length} col{visibleColumns.length !== 1 ? 's' : ''} &middot; {(section.conditionalRows ?? []).length} total defined
        </span>
        {section.allowAddRows && (
          <span className="text-[#f26722]">+ Add Row</span>
        )}
        {section.allowRemoveRows && (
          <span className="text-red-500">- Remove Row</span>
        )}
      </div>
    </div>
  );
};

/**
 * Preview of what the section will look like.
 * When formula editing is active, table cells become editable inputs for per-cell formulas.
 */
const SectionPreview: React.FC<{
  section: SectionConfig;
  isFormulaEditing?: boolean;
  onCellFormulaChange?: (sectionId: string, rowIndex: number, colId: string, formula: string) => void;
  onRequestEditFormulas?: (sectionId: string) => void;
}> = ({ section, isFormulaEditing = false, onCellFormulaChange, onRequestEditFormulas }) => {
  // Conditional table: interactive dropdowns + all visible rows
  if (
    section.settingFields &&
    section.settingFields.length > 0 &&
    section.conditionalRows &&
    section.conditionalRows.length > 0 &&
    section.columns &&
    section.columns.length > 0
  ) {
    return <ConditionalTableCanvasPreview section={section} />;
  }

  // For table-based components
  if (section.columns && section.columns.length > 0) {
    const code = getSectionReferenceCode(section);
    const totalRows = section.rows || 1;
    const showAllRows = isFormulaEditing;
    const displayRows = showAllRows ? totalRows : Math.min(totalRows, 3);

    return (
      <div className={`overflow-x-auto ${isFormulaEditing ? 'max-h-[420px] overflow-y-auto' : ''}`}>
        {isFormulaEditing && (
          <div className="mb-2 px-2 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded text-[10px] text-amber-800 dark:text-amber-200">
            Type formulas directly in cells below. Use references like <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">{'{'}Code.fieldId{'}'}</code> or <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">{'{'}Code.C1.R2{'}'}</code>. Math: <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">{'{'}ND.ratedCurrent{'}'}*{'{'}ND.ratedVoltage{'}'}</code>
          </div>
        )}
        <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 text-xs">
          <thead>
            <tr>
              {isFormulaEditing && (
                <th className="border border-gray-300 dark:border-gray-600 px-1 py-1 bg-gray-50 dark:bg-dark-200 text-center font-medium w-8 text-[10px] text-gray-400">
                  #
                </th>
              )}
              {section.columns.map((col, colIndex) => {
                const cNum = colIndex + 1;
                const sameRowRef = `{${code}.C${cNum}}`;
                const rowRefs = Array.from({ length: Math.min(totalRows, 5) }, (_, i) => `{${code}.C${cNum}.R${i + 1}}`).join(', ');
                return (
                  <th
                    key={col.id}
                    className="border border-gray-300 dark:border-gray-600 px-2 py-1 bg-gray-50 dark:bg-dark-200 text-left font-medium align-top"
                    style={col.width ? { width: col.width } : undefined}
                  >
                    <div>{col.label}{col.width && <span className="text-[9px] text-gray-400 ml-1">({col.width})</span>}</div>
                    <div className="font-mono text-[10px] text-amber-600 dark:text-amber-400 mt-0.5" title={`${section.title || 'Section'}, column ${cNum} (same row). Or ${rowRefs} for specific rows.`}>
                      {sameRowRef}
                    </div>
                    {!isFormulaEditing && (
                      <div className="text-[9px] text-gray-500 dark:text-gray-400 mt-0.5">
                        ({section.title || 'Section'}, column {cNum}, same row)
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: displayRows }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {isFormulaEditing && (
                  <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-[10px] text-gray-400 bg-gray-50 dark:bg-dark-200">
                    R{rowIndex + 1}
                  </td>
                )}
                {section.columns!.map(col => {
                  const cellKey = `row${rowIndex}_${col.id}`;
                  const cellFormula = section.cellFormulas?.[cellKey] ?? '';
                  const colLevelFormula = col.field?.cellBehavior === 'calculate'
                    ? col.field.calculation?.formula ?? ''
                    : col.field?.cellBehavior === 'populate'
                      ? '(populated)'
                      : '';

                  if (isFormulaEditing) {
                    return (
                      <td
                        key={col.id}
                        className="border border-gray-300 dark:border-gray-600 p-0"
                        style={col.width ? { width: col.width } : undefined}
                      >
                        <input
                          type="text"
                          value={cellFormula}
                          onChange={(e) => onCellFormulaChange?.(section.id, rowIndex, col.id, e.target.value)}
                          placeholder={colLevelFormula || 'e.g. {JD.TCF} or {IR.C1.R2}'}
                          className="w-full px-1.5 py-1 text-[11px] font-mono bg-amber-50/50 dark:bg-amber-900/10 text-gray-900 dark:text-white border-none focus:ring-1 focus:ring-amber-400 focus:bg-amber-50 dark:focus:bg-amber-900/20 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                          title={`Cell ${code}.C${section.columns!.indexOf(col) + 1}.R${rowIndex + 1} — e.g. {JD.TCF} for TCF, {section.C1.R2} for table ref`}
                        />
                      </td>
                    );
                  }

                  return (
                    <td
                      key={col.id}
                      className="border border-gray-300 dark:border-gray-600 px-2 py-1"
                      style={col.width ? { width: col.width } : undefined}
                    >
                      {cellFormula ? (
                        <div className="h-6 bg-amber-50 dark:bg-amber-900/20 rounded px-1 flex items-center">
                          <span className="text-[10px] font-mono text-amber-700 dark:text-amber-300 truncate">{cellFormula}</span>
                        </div>
                      ) : (
                        <div className="h-6 bg-gray-100 dark:bg-dark-100 rounded"></div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!showAllRows && totalRows > 3 && (
              <tr>
                <td
                  colSpan={section.columns.length + (isFormulaEditing ? 1 : 0)}
                  className="border border-gray-300 dark:border-gray-600 p-0"
                >
                  <button
                    type="button"
                    onClick={() => onRequestEditFormulas?.(section.id)}
                    className="w-full px-2 py-2.5 text-center text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-0 border-t border-gray-200 dark:border-gray-600"
                  >
                    Show all {totalRows} rows and edit formulas…
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {isFormulaEditing && (
          <p className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-400">
            Showing all {totalRows} rows. Empty cells use column-level behavior. Per-cell formulas override column settings.
          </p>
        )}
        {!isFormulaEditing && (
          <div className="flex items-center gap-2 mt-1.5 text-[10px]">
            <span className="text-gray-500 dark:text-gray-400">
              {totalRows} row{totalRows !== 1 ? 's' : ''}
            </span>
            {section.allowAddRows && (
              <span className="text-[#f26722]">+ Add Row</span>
            )}
            {section.allowRemoveRows && (
              <span className="text-red-500">- Remove Row</span>
            )}
            {!section.allowAddRows && !section.allowRemoveRows && (
              <span className="text-gray-400 dark:text-gray-500 italic">fixed rows</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // For grouped fields (nameplate data, job info, etc.) - stacked label + input in each cell
  if (section.fields && section.fields.length > 0) {
    const columns = section.componentType === 'job-info' ? 5 : section.layout === 'five-column' ? 5 : section.layout === 'four-column' ? 4 : section.layout === 'three-column' ? 3 : section.layout === 'two-column' ? 2 : 1;
    const code = getSectionReferenceCode(section);
    const fieldRows: typeof section.fields[] = [];
    for (let i = 0; i < section.fields.length; i += columns) {
      fieldRows.push(section.fields.slice(i, i + columns));
    }
    const isJobInfo = section.componentType === 'job-info';
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 text-xs">
          <tbody>
            {fieldRows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map(field => (
                  <td
                    key={field.id}
                    className="border border-gray-300 dark:border-gray-600 px-2 py-1 align-top"
                  >
                    <div className="font-medium text-gray-700 dark:text-gray-300">
                      {field.label}
                      {field.unit && <span className="text-gray-500 ml-1">({field.unit})</span>}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                      {field.readOnly && <span className="text-blue-500 ml-1 text-[10px]">(Auto)</span>}
                    </div>
                    <div className="font-mono text-[10px] text-amber-600 dark:text-amber-400 mt-0.5" title={`${section.title || 'Section'} » ${field.label || field.id}`}>
                      {`{${code}.${field.id}}`}
                    </div>
                    <div className={`h-6 mt-1 ${field.readOnly ? 'bg-gray-200 dark:bg-dark-200' : 'bg-gray-100 dark:bg-dark-100'} rounded`}></div>
                  </td>
                ))}
                {row.length < columns && Array.from({ length: columns - row.length }).map((_, i) => (
                  <td key={`empty-${i}`} className="border border-gray-300 dark:border-gray-600 px-2 py-1"></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {isJobInfo && (
          <p className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 text-[11px] text-amber-700 dark:text-amber-300 font-medium">
            Use <span className="font-mono">{'{JD.TCF}'}</span> in formulas for Temperature Correction Factor
          </p>
        )}
      </div>
    );
  }

  // For single field components (comments, custom text) - stacked label + input in one cell
  if (section.field) {
    const code = getSectionReferenceCode(section);
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 text-xs">
          <tbody>
            <tr>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">
                <div className="font-medium text-gray-700 dark:text-gray-300">{section.field.label}</div>
                <div className="font-mono text-[10px] text-amber-600 dark:text-amber-400 mt-0.5" title={`Use in formula: {${code}.${section.field.id}}`}>
                  {`{${code}.${section.field.id}}`}
                </div>
                <div className={`${section.field.type === 'textarea' ? 'h-16' : 'h-6'} mt-1 bg-gray-100 dark:bg-dark-100 rounded`}></div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // For checklist components (visual inspection)
  if (section.checklistItems && section.checklistItems.length > 0) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 text-xs">
          <thead>
            <tr>
              <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 bg-gray-50 dark:bg-dark-200 text-left font-medium w-24">
                NETA Section
              </th>
              <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 bg-gray-50 dark:bg-dark-200 text-left font-medium">
                Description
              </th>
              <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 bg-gray-50 dark:bg-dark-200 text-left font-medium w-32">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {section.checklistItems.slice(0, 3).map(item => (
              <tr key={item.id}>
                <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">
                  {item.netaSection || '-'}
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">
                  {item.description}
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">
                  <div className="h-6 bg-gray-100 dark:bg-dark-100 rounded"></div>
                </td>
              </tr>
            ))}
            {section.checklistItems.length > 3 && (
              <tr>
                <td
                  colSpan={3}
                  className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-gray-500 dark:text-gray-400"
                >
                  ... {section.checklistItems.length - 3} more items
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="text-center text-gray-500 dark:text-gray-400 py-4 text-sm">
      No preview available
    </div>
  );
};

interface FormCanvasProps {
  sections: SectionConfig[];
  selectedSectionId: string | null;
  onSectionSelect: (sectionId: string) => void;
  onSectionDelete: (sectionId: string) => void;
  onSectionDuplicate: (sectionId: string) => void;
  formulaEditingSectionId?: string | null;
  onCellFormulaChange?: (sectionId: string, rowIndex: number, colId: string, formula: string) => void;
  onRequestEditFormulas?: (sectionId: string) => void;
}

export const FormCanvas: React.FC<FormCanvasProps> = ({
  sections,
  selectedSectionId,
  onSectionSelect,
  onSectionDelete,
  onSectionDuplicate,
  formulaEditingSectionId = null,
  onCellFormulaChange,
  onRequestEditFormulas,
}) => {
  const { setNodeRef } = useDroppable({
    id: 'form-canvas',
  });

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div ref={setNodeRef} className="w-full mx-auto">
      <SortableContext
        items={sortedSections.map(s => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3 md:space-y-4">
          {sortedSections.map((section) => (
            <SortableSection
              key={section.id}
              section={section}
              isSelected={section.id === selectedSectionId}
              onSelect={() => onSectionSelect(section.id)}
              onDelete={() => {
                if (confirm(`Are you sure you want to delete "${section.title}"?`)) {
                  onSectionDelete(section.id);
                }
              }}
              onDuplicate={() => onSectionDuplicate(section.id)}
              isFormulaEditing={section.id === formulaEditingSectionId}
              onCellFormulaChange={onCellFormulaChange}
              onRequestEditFormulas={onRequestEditFormulas}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
};
