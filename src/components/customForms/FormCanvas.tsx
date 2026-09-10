/**
 * Form Canvas
 *
 * The builder's editing shell: drag-and-drop ordering, per-section actions,
 * and per-cell formula editing. The section bodies themselves come from the
 * shared runtime, so the canvas cannot drift from what the filler renders.
 */

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Trash2,
  Copy,
  Settings,
  EyeOff,
  FileCode2,
} from "lucide-react";

import { SectionConfig } from "@/lib/types/customForms";
import { getComponentDefinition } from "@/lib/customForms/componentLibrary";
import { getSectionReferenceCode } from "@/lib/customForms/formCellResolution";
import {
  cellKey,
  classifySection,
  isColumnVisible,
  isConditionalRowVisible,
  resolveRowCount,
  resolveSettingValues,
  type ControlSlot,
  type SectionChrome,
  type SectionRowInfo,
} from "@/lib/customForms/runtime";
import { SectionBody } from "./runtime/SectionBody";
import { FormulaInput } from "./FormulaInput";
import { createPlaceholderControlRenderer } from "./runtime/PlaceholderControl";
import { useLocalSectionSettings } from "./runtime/useLocalSectionSettings";

/**
 * A formula cell in the canvas grid. It stays a narrow monospace box until the
 * author focuses it, then expands to the full picker, so formula mode still
 * reads as a table rather than a column of dropdowns.
 */
const FormulaCell: React.FC<{
  value: string;
  sections: SectionConfig[];
  placeholder?: string;
  title?: string;
  onChange: (value: string) => void;
}> = ({ value, sections, placeholder, title, onChange }) => {
  const [active, setActive] = React.useState(false);

  if (!active) {
    return (
      <input
        type="text"
        value={value}
        readOnly
        onFocus={() => setActive(true)}
        onClick={() => setActive(true)}
        placeholder={placeholder}
        title={title}
        className="w-full px-1.5 py-1 text-[11px] font-mono bg-amber-50/50 dark:bg-amber-900/10 text-neutral-900 dark:text-white border-none focus:ring-1 focus:ring-amber-400 cursor-text placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
      />
    );
  }

  return (
    <div className="p-1 min-w-[16rem]">
      <FormulaInput
        value={value}
        onChange={onChange}
        sections={sections}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setActive(false)}
        className="mt-1 text-[10px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
      >
        Done
      </button>
    </div>
  );
};

/** Rows shown per table before the canvas offers to expand into formula mode. */
const CANVAS_PREVIEW_ROWS = 3;

interface SectionPreviewProps {
  section: SectionConfig;
  allSections: SectionConfig[];
  isFormulaEditing: boolean;
  onCellFormulaChange?: (
    sectionId: string,
    rowIndex: number,
    colId: string,
    formula: string,
  ) => void;
  onRequestEditFormulas?: (sectionId: string) => void;
}

const FormulaHint: React.FC = () => (
  <div className="mb-2 px-2 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded text-[10px] text-amber-800 dark:text-amber-200">
    Type formulas directly in cells below. Use references like{" "}
    <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">
      {"{"}Code.fieldId{"}"}
    </code>{" "}
    or{" "}
    <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">
      {"{"}Code.C1.R2{"}"}
    </code>
    . Math:{" "}
    <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">
      {"{"}ND.ratedCurrent{"}"}*{"{"}ND.ratedVoltage{"}"}
    </code>
  </div>
);

/**
 * Section body as the builder sees it: reference codes on every addressable
 * cell, and editable formula boxes when formula mode is on for this section.
 */
const SectionPreview: React.FC<SectionPreviewProps> = ({
  section,
  allSections,
  isFormulaEditing,
  onCellFormulaChange,
  onRequestEditFormulas,
}) => {
  const { getSettingValue, setSettingValue, conditionValues } =
    useLocalSectionSettings();
  const placeholder = React.useMemo(
    () => createPlaceholderControlRenderer({ density: "compact" }),
    [],
  );
  const kind = classifySection(section);
  const code = getSectionReferenceCode(section);

  const renderFormulaCell = (slot: ControlSlot) => {
    const { cell } = slot;
    if (!cell) return placeholder(slot);
    const value = section.cellFormulas?.[cellKey(cell.rowIndex, cell.colId)] ?? "";
    const columnHint =
      slot.field?.cellBehavior === "calculate"
        ? (slot.field.calculation?.formula ?? "")
        : slot.field?.cellBehavior === "populate"
          ? "(populated)"
          : "";
    return (
      <FormulaCell
        value={value}
        sections={allSections}
        placeholder={columnHint || "e.g. {JD.tcf} or {IR.C1.R2}"}
        title={`Cell ${code}.C${cell.colIndex + 1}.R${cell.rowIndex + 1}`}
        onChange={(next) =>
          onCellFormulaChange?.(section.id, cell.rowIndex, cell.colId, next)
        }
      />
    );
  };

  const chrome: SectionChrome = {
    mode: "edit",
    density: "compact",
    renderControl: isFormulaEditing ? renderFormulaCell : placeholder,
    getSettingValue,
    setSettingValue,
    conditionValues,
    maxBodyRows: isFormulaEditing ? undefined : CANVAS_PREVIEW_ROWS,
    rowGutter: isFormulaEditing
      ? {
          header: "#",
          cell: (rowIndex) => `R${rowIndex + 1}`,
        }
      : undefined,
    renderSectionHeader: () => (isFormulaEditing ? <FormulaHint /> : null),
    renderColumnHeaderExtra: (_section, col, colIndex) => {
      const cNum = colIndex + 1;
      const totalRows = resolveRowCount(section);
      const rowRefs = Array.from(
        { length: Math.min(totalRows, 5) },
        (_, i) => `{${code}.C${cNum}.R${i + 1}}`,
      ).join(", ");
      return (
        <>
          {col.width && (
            <span className="text-[9px] text-neutral-400 ml-1">
              ({col.width})
            </span>
          )}
          <div
            className="font-mono text-[10px] text-amber-600 dark:text-amber-400 mt-0.5"
            title={`${section.title || "Section"}, column ${cNum} (same row). Or ${rowRefs} for specific rows.`}
          >
            {`{${code}.C${cNum}}`}
          </div>
          {!isFormulaEditing && (
            <div className="text-[9px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              ({section.title || "Section"}, column {cNum}, same row)
            </div>
          )}
        </>
      );
    },
    renderFieldLabelExtra: (_section, field) => (
      <>
        {field.readOnly && (
          <span className="text-blue-500 ml-1 text-[10px]">(Auto)</span>
        )}
        <div
          className="font-mono text-[10px] text-amber-600 dark:text-amber-400 mt-0.5"
          title={`${section.title || "Section"} » ${field.label || field.id}`}
        >
          {`{${code}.${field.id}}`}
        </div>
      </>
    ),
    renderRowOverflow: (_section, info, columnCount) => {
      if (kind === "checklist") {
        return (
          <tr>
            <td
              colSpan={columnCount}
              className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-neutral-500 dark:text-neutral-400"
            >
              ... {info.rowCount - info.shownRowCount} more items
            </td>
          </tr>
        );
      }
      return (
        <tr>
          <td
            colSpan={columnCount}
            className="border border-neutral-300 dark:border-neutral-600 p-0"
          >
            <button
              type="button"
              onClick={() => onRequestEditFormulas?.(section.id)}
              className="w-full px-2 py-2.5 text-center text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-0 border-t border-neutral-200 dark:border-neutral-600"
            >
              Show all {info.rowCount} rows and edit formulas…
            </button>
          </td>
        </tr>
      );
    },
    renderSectionFooter: (_section, info) => (
      <CanvasSectionFooter
        section={section}
        info={info}
        isFormulaEditing={isFormulaEditing}
        getSettingValue={getSettingValue}
      />
    ),
  };

  if (kind === "empty") {
    return (
      <div className="text-center text-neutral-500 dark:text-neutral-400 py-4 text-sm">
        No preview available
      </div>
    );
  }

  return (
    <div
      className={isFormulaEditing ? "max-h-[420px] overflow-y-auto" : undefined}
    >
      <SectionBody section={section} chrome={chrome} />
    </div>
  );
};

const CanvasSectionFooter: React.FC<{
  section: SectionConfig;
  info: SectionRowInfo;
  isFormulaEditing: boolean;
  getSettingValue: (section: SectionConfig, settingId: string) => unknown;
}> = ({ section, info, isFormulaEditing, getSettingValue }) => {
  const kind = classifySection(section);

  if (kind === "grouped-fields") {
    if (section.componentType !== "job-info") return null;
    return (
      <p className="mt-2 pt-2 border-t border-neutral-200 dark:border-neutral-600 text-[11px] text-amber-700 dark:text-amber-300 font-medium">
        Use <span className="font-mono">{"{JD.TCF}"}</span> in formulas for
        Temperature Correction Factor
      </p>
    );
  }

  if (kind === "conditional-table") {
    const settings = resolveSettingValues(section, (id) =>
      getSettingValue(section, id),
    );
    const visibleColumns = (section.columns ?? []).filter((col) =>
      isColumnVisible(col, settings),
    );
    const visibleRows = (section.conditionalRows ?? []).filter((row) =>
      isConditionalRowVisible(row, settings),
    );
    return (
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-neutral-500 dark:text-neutral-400">
          {visibleRows.length} row{visibleRows.length !== 1 ? "s" : ""},{" "}
          {visibleColumns.length} col{visibleColumns.length !== 1 ? "s" : ""}{" "}
          &middot; {(section.conditionalRows ?? []).length} total defined
        </span>
        {section.allowAddRows && <span className="text-brand">+ Add Row</span>}
        {section.allowRemoveRows && (
          <span className="text-red-500">- Remove Row</span>
        )}
      </div>
    );
  }

  if (kind !== "table" && kind !== "contact-resistance") return null;

  if (isFormulaEditing) {
    return (
      <p className="mt-1.5 text-[10px] text-neutral-500 dark:text-neutral-400">
        Showing all {info.rowCount} rows. Empty cells use column-level behavior.
        Per-cell formulas override column settings.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-1.5 text-[10px]">
      <span className="text-neutral-500 dark:text-neutral-400">
        {info.rowCount} row{info.rowCount !== 1 ? "s" : ""}
      </span>
      {section.allowAddRows && <span className="text-brand">+ Add Row</span>}
      {section.allowRemoveRows && (
        <span className="text-red-500">- Remove Row</span>
      )}
      {!section.allowAddRows && !section.allowRemoveRows && (
        <span className="text-neutral-400 dark:text-neutral-500 italic">
          fixed rows
        </span>
      )}
    </div>
  );
};

interface SortableSectionProps {
  section: SectionConfig;
  allSections: SectionConfig[];
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  isFormulaEditing?: boolean;
  onCellFormulaChange?: (
    sectionId: string,
    rowIndex: number,
    colId: string,
    formula: string,
  ) => void;
  onRequestEditFormulas?: (sectionId: string) => void;
}

const SortableSection: React.FC<SortableSectionProps> = ({
  section,
  allSections,
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
      className={`bg-white dark:bg-dark-150 border-2 rounded-none transition-all ${
        isSelected
          ? "border-brand shadow-lg"
          : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
      }`}
    >
      <div
        className={`flex items-center gap-2 md:gap-3 px-2 md:px-4 py-2 md:py-3 border-b ${
          isSelected
            ? "border-brand bg-orange-50 dark:bg-orange-900/20"
            : "border-neutral-200 dark:border-neutral-700"
        }`}
      >
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hidden md:block"
        >
          <GripVertical className="w-4 h-4 md:w-5 md:h-5" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xs md:text-sm font-semibold text-neutral-900 dark:text-white truncate">
              {section.title}
            </h3>
            {isFormulaEditing && (
              <span className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded font-medium">
                <FileCode2 className="w-3 h-3" />
                Formula Mode
              </span>
            )}
            {!section.showInPrint && (
              <span className="hidden md:flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                <EyeOff className="w-3 h-3" />
                Hidden in print
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            {componentDef?.name || section.componentType}
          </p>
          <p
            className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500 truncate"
            title={`${section.title || "Section"} — use in formulas e.g. {${getSectionReferenceCode(section)}.C1.R2} (${section.title || "Section"}, column 1, row 2)`}
          >
            {getSectionReferenceCode(section)} ({section.title || "Section"})
          </p>
        </div>

        <div className="flex items-center gap-0.5 md:gap-1">
          <button
            onClick={onSelect}
            className="p-1.5 md:p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-dark-100 rounded"
            title="Edit section"
          >
            <Settings className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>

          <button
            onClick={onDuplicate}
            className="hidden md:block p-1.5 md:p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-dark-100 rounded"
            title="Duplicate section"
          >
            <Copy className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>

          <button
            onClick={onDelete}
            className="p-1.5 md:p-2 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-dark-100 rounded"
            title="Delete section"
          >
            <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>
        </div>
      </div>

      <div className="p-3 md:p-4">
        <SectionPreview
          section={section}
          allSections={allSections}
          isFormulaEditing={isFormulaEditing}
          onCellFormulaChange={onCellFormulaChange}
          onRequestEditFormulas={onRequestEditFormulas}
        />
      </div>
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
  onCellFormulaChange?: (
    sectionId: string,
    rowIndex: number,
    colId: string,
    formula: string,
  ) => void;
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
  const { setNodeRef } = useDroppable({ id: "form-canvas" });
  const ordered = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div ref={setNodeRef} className="w-full mx-auto">
      <SortableContext
        items={ordered.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3 md:space-y-4">
          {ordered.map((section) => (
            <SortableSection
              key={section.id}
              section={section}
              allSections={ordered}
              isSelected={section.id === selectedSectionId}
              onSelect={() => onSectionSelect(section.id)}
              onDelete={() => {
                if (
                  confirm(`Are you sure you want to delete "${section.title}"?`)
                ) {
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
