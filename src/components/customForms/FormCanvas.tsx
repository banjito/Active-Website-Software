/**
 * Form Canvas
 *
 * The builder's editing shell: drag-and-drop ordering, per-section actions,
 * per-cell formula editing, and layout (tick sections, then arrange them side
 * by side, in a grid or in a box). The section bodies themselves come from the
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
  Sparkles,
  EyeOff,
  FileCode2,
  Columns2,
  LayoutGrid,
  RectangleHorizontal,
  MessageSquareText,
  Rows2,
  Scissors,
  Ungroup,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  LogOut,
  X,
  Check,
  type LucideIcon,
} from "lucide-react";

import type {
  CustomFormStructure,
  LayoutGroupConfig,
  LayoutGroupKind,
  SectionConfig,
} from "@/lib/types/customForms";
import {
  LAYOUT_KIND_LABELS,
  MAX_GRID_COLUMNS,
  fitsOnPaper,
  gridTemplate,
  groupSections,
  memberMinWidth,
  sectionMinWidthRem,
  sideBySideFlex,
  layoutUnits,
  moveWithinGroup,
  pageBreakIds,
  removeFromGroup,
  togglePageBreakBefore,
  ungroup,
  updateGroup,
  widthPresets,
  type LayoutUnit,
} from "@/lib/customForms/layoutGroups";
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
import { sectionFromV1 } from "@/lib/customForms/v2/fromV1";
import { confirmDialog } from "@/components/ui/confirmDialog";
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
            className="font-mono text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 break-all"
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
          className="font-mono text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 break-all"
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
  /** Rebuild this section from a written instruction. Absent hides the control. */
  onRegenerate?: (instruction: string) => Promise<void>;
  isFormulaEditing?: boolean;
  onCellFormulaChange?: (
    sectionId: string,
    rowIndex: number,
    colId: string,
    formula: string,
  ) => void;
  onRequestEditFormulas?: (sectionId: string) => void;
  /** Ticked for arranging. Absent hides the tick box. */
  arrangeSelected?: boolean;
  onToggleArrange?: () => void;
  /** Sections inside a group move with the group, not on their own. */
  dragDisabled?: boolean;
  /** Absent hides the page break control (sections inside a group). */
  pageBreakBefore?: boolean;
  onTogglePageBreak?: () => void;
}

const SortableSection: React.FC<SortableSectionProps> = ({
  section,
  allSections,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onRegenerate,
  isFormulaEditing = false,
  onCellFormulaChange,
  onRequestEditFormulas,
  arrangeSelected = false,
  onToggleArrange,
  dragDisabled = false,
  pageBreakBefore = false,
  onTogglePageBreak,
}) => {
  const [prompting, setPrompting] = React.useState(false);
  const [instruction, setInstruction] = React.useState("");
  const [rebuilding, setRebuilding] = React.useState(false);
  const [rebuildError, setRebuildError] = React.useState<string | null>(null);

  const runRegenerate = async () => {
    if (!onRegenerate || rebuilding || !instruction.trim()) return;
    setRebuilding(true);
    setRebuildError(null);
    try {
      await onRegenerate(instruction);
      setPrompting(false);
      setInstruction("");
    } catch (error) {
      setRebuildError(error instanceof Error ? error.message : "Could not rebuild that section");
    } finally {
      setRebuilding(false);
    }
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: section.id,
    // Both halves: a bare `true` only stops dragging, and a section inside a
    // group that still accepts drops lets a new section land between members.
    disabled: { draggable: dragDisabled, droppable: dragDisabled },
  });

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
      data-layout-unit={section.id}
      className={`bg-white dark:bg-dark-150 border-2 rounded-none transition-all min-w-0 ${
        isSelected
          ? "border-brand shadow-lg"
          : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
      } ${arrangeSelected ? "outline outline-2 outline-dashed outline-offset-2 outline-brand" : ""}`}
    >
      <div
        className={`flex items-center gap-2 md:gap-3 px-2 md:px-4 py-2 md:py-3 border-b ${
          isSelected
            ? "border-brand bg-orange-50 dark:bg-orange-900/20"
            : "border-neutral-200 dark:border-neutral-700"
        }`}
      >
        {onToggleArrange && (
          <span className="relative inline-flex h-4 w-4 shrink-0">
            <input
              type="checkbox"
              checked={arrangeSelected}
              onChange={onToggleArrange}
              title="Tick to arrange with other sections"
              aria-label={`Select ${section.title || "section"} to arrange`}
              className="peer h-4 w-4 cursor-pointer appearance-none rounded-none border-2 border-neutral-400 dark:border-neutral-500 bg-white dark:bg-dark-100 checked:border-brand checked:bg-brand dark:checked:border-brand dark:checked:bg-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            />
            <Check
              strokeWidth={3}
              className="pointer-events-none absolute inset-0 m-auto hidden h-3 w-3 text-white peer-checked:block"
            />
          </span>
        )}
        {!dragDisabled && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hidden md:block"
          >
            <GripVertical className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xs md:text-sm font-semibold text-neutral-900 dark:text-white min-w-0 [overflow-wrap:anywhere]">
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
          {onRegenerate && (
            <button
              onClick={() => setPrompting((open) => !open)}
              className={`p-1.5 md:p-2 rounded hover:bg-neutral-100 dark:hover:bg-dark-100 ${
                prompting ? "text-brand" : "text-neutral-400 hover:text-brand"
              }`}
              title="Rebuild this section from a description"
            >
              <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
          )}
          {onTogglePageBreak && (
            <button
              onClick={onTogglePageBreak}
              className={`hidden md:block p-1.5 md:p-2 rounded-none hover:bg-neutral-100 dark:hover:bg-dark-100 ${
                pageBreakBefore
                  ? "text-brand"
                  : "text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              }`}
              title={pageBreakBefore ? "Remove the page break above" : "Start a new printed page here"}
              aria-pressed={pageBreakBefore}
            >
              <Scissors className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
          )}
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

      {prompting && onRegenerate && (
        <div className="px-3 md:px-4 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-orange-50/60 dark:bg-orange-900/10">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={instruction}
              disabled={rebuilding}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void runRegenerate();
                if (event.key === "Escape") setPrompting(false);
              }}
              placeholder='What should this section be? e.g. "four columns: Function, Setting, Delay, I2t, with six rows"'
              className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <button
              onClick={() => void runRegenerate()}
              disabled={rebuilding || !instruction.trim()}
              className="shrink-0 px-2.5 py-1.5 text-xs rounded bg-brand text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {rebuilding ? "Rebuilding…" : "Rebuild"}
            </button>
            <button
              onClick={() => setPrompting(false)}
              disabled={rebuilding}
              className="shrink-0 px-2 py-1.5 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {rebuildError && (
            <p className="mt-1 text-[11px] text-red-700 dark:text-red-300">{rebuildError}</p>
          )}
          <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
            The section is replaced. Nothing else in the form changes, and any cell
            values already saved against it will need checking.
          </p>
        </div>
      )}

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

// ---------------------------------------------------------------------------
// Layout: groups, the arrange bar, page break markers
// ---------------------------------------------------------------------------

const KIND_ICONS: Record<LayoutGroupKind, LucideIcon> = {
  "side-by-side": Columns2,
  grid: LayoutGrid,
  strip: RectangleHorizontal,
  callout: MessageSquareText,
  "keep-together": Rows2,
};

const KIND_HINTS: Record<LayoutGroupKind, string> = {
  "side-by-side": "Next to each other in one row",
  grid: "In rows of a set number of columns",
  strip: "Inside one bordered box",
  callout: "Inside a highlighted note box",
  "keep-together": "Never split across two printed pages",
};

const ARRANGE_KINDS: LayoutGroupKind[] = [
  "side-by-side",
  "grid",
  "strip",
  "callout",
  "keep-together",
];

/** Side by side and grid need at least two sections to mean anything. */
const minimumFor = (kind: LayoutGroupKind) =>
  kind === "side-by-side" || kind === "grid" ? 2 : 1;

const smallSelect =
  "h-7 px-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-100 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand";

const PageBreakMarker: React.FC<{ onRemove: () => void }> = ({ onRemove }) => (
  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
    <div className="flex-1 border-t-2 border-dashed border-neutral-300 dark:border-neutral-600" />
    <Scissors className="w-3 h-3" />
    New printed page
    <button
      type="button"
      onClick={onRemove}
      className="p-0.5 rounded-none text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
      title="Remove page break"
      aria-label="Remove page break"
    >
      <X className="w-3 h-3" />
    </button>
    <div className="flex-1 border-t-2 border-dashed border-neutral-300 dark:border-neutral-600" />
  </div>
);

interface CanvasGroupProps {
  unit: Extract<LayoutUnit, { type: "group" }>;
  pageBreakBefore: boolean;
  onUpdate: (patch: Partial<Omit<LayoutGroupConfig, "id" | "sectionIds">>) => void;
  onUngroup: () => void;
  /** Absent for the first block, which already starts a page. */
  onTogglePageBreak?: () => void;
  renderMember: (section: SectionConfig, index: number, count: number) => React.ReactNode;
}

/** A group on the canvas: a dashed box with its settings, dragged as one. */
const CanvasGroup: React.FC<CanvasGroupProps> = ({
  unit,
  pageBreakBefore,
  onUpdate,
  onUngroup,
  onTogglePageBreak,
  renderMember,
}) => {
  const { group, sections } = unit;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id });
  const Icon = KIND_ICONS[group.kind];
  // The canvas card carries editing chrome (reference codes, buttons), so it
  // needs more room than the printed section before it can share a row.
  const printMins = sections.map((section) => sectionMinWidthRem(sectionFromV1(section)));
  const canvasMins = printMins.map((rem) => Math.max(20, rem * 1.3 + 2));
  const weighted = group.widths?.length === sections.length;
  const fits = fitsOnPaper(group.kind, printMins, group.columns);
  // A group that will not fit on paper is drawn stacked, the way it prints,
  // so the builder never shows columns next to a note saying there are none.
  const across = fits && (group.kind === "side-by-side" || group.kind === "strip");
  const presets = widthPresets(sections.length);
  const presetIndex = Math.max(
    0,
    presets.findIndex(
      (preset) => JSON.stringify(preset.widths) === JSON.stringify(group.widths),
    ),
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      data-layout-unit={group.id}
      className="border-2 border-dashed border-brand/60 bg-brand/5 dark:bg-brand/10 rounded-none"
    >
      <div className="flex flex-wrap items-center gap-2 px-2 md:px-3 py-2 border-b border-dashed border-brand/40">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hidden md:block"
          title="Drag to move the whole group"
        >
          <GripVertical className="w-4 h-4 md:w-5 md:h-5" />
        </button>
        <Icon className="w-4 h-4 text-brand shrink-0" />
        <select
          value={group.kind}
          onChange={(event) => onUpdate({ kind: event.target.value as LayoutGroupKind })}
          className={smallSelect}
          aria-label="Arrangement"
          title={KIND_HINTS[group.kind]}
        >
          {ARRANGE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {LAYOUT_KIND_LABELS[kind]}
            </option>
          ))}
        </select>

        {group.kind === "side-by-side" && sections.length > 1 && (
          <select
            value={presetIndex}
            onChange={(event) => onUpdate({ widths: presets[Number(event.target.value)].widths })}
            className={smallSelect}
            aria-label="Widths"
          >
            {presets.map((preset, index) => (
              <option key={preset.label} value={index}>
                {preset.label}
              </option>
            ))}
          </select>
        )}

        {group.kind === "grid" && (
          <select
            value={group.columns ?? 2}
            onChange={(event) => onUpdate({ columns: Number(event.target.value) })}
            className={smallSelect}
            aria-label="Columns"
          >
            {Array.from({ length: MAX_GRID_COLUMNS - 1 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n} columns
              </option>
            ))}
          </select>
        )}

        {group.kind === "callout" && (
          <select
            value={group.tone ?? "info"}
            onChange={(event) =>
              onUpdate({ tone: event.target.value as LayoutGroupConfig["tone"] })
            }
            className={smallSelect}
            aria-label="Callout style"
          >
            <option value="info">Note (blue)</option>
            <option value="warning">Warning (amber)</option>
            <option value="criteria">Criteria (orange)</option>
          </select>
        )}

        <input
          value={group.title ?? ""}
          onChange={(event) => onUpdate({ title: event.target.value })}
          placeholder="Heading (optional)"
          className={`${smallSelect} flex-1 min-w-[8rem]`}
          aria-label="Group heading"
        />

        <div className="flex items-center gap-0.5 ml-auto">
          {onTogglePageBreak && (
            <button
              type="button"
              onClick={onTogglePageBreak}
              className={`p-1.5 rounded-none hover:bg-white/70 dark:hover:bg-dark-100 ${
                pageBreakBefore ? "text-brand" : "text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              }`}
              title={pageBreakBefore ? "Remove the page break above" : "Start a new printed page here"}
              aria-pressed={pageBreakBefore}
            >
              <Scissors className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onUngroup}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-none text-neutral-600 dark:text-neutral-300 hover:bg-white/70 dark:hover:bg-dark-100"
            title="Put these sections back one under another"
          >
            <Ungroup className="w-3.5 h-3.5" />
            Ungroup
          </button>
        </div>
      </div>

      {!fits && (
        <p className="px-2 md:px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border-b border-dashed border-brand/40">
          {group.kind === "grid"
            ? `Too wide for ${group.columns ?? 2} columns on a printed page. They will print in fewer columns.`
            : "Too wide to fit side by side on a printed page. These sections will print one under another."}
        </p>
      )}

      <div className="p-2 md:p-3">
        {group.kind === "grid" && fits ? (
          <div
            className="grid gap-3 items-start"
            style={{ gridTemplateColumns: gridTemplate(group.columns, Math.max(...canvasMins)) }}
          >
            {sections.map((section, index) => renderMember(section, index, sections.length))}
          </div>
        ) : across ? (
          <div className="flex flex-wrap items-start gap-3">
            {sections.map((section, index) => (
              <div
                key={section.id}
                style={{
                  flex: sideBySideFlex(
                    group.kind === "side-by-side" && weighted ? group.widths![index] : 1,
                  ),
                  minWidth: memberMinWidth(canvasMins[index]),
                }}
              >
                {renderMember(section, index, sections.length)}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {sections.map((section, index) => renderMember(section, index, sections.length))}
          </div>
        )}
      </div>
    </div>
  );
};

interface FormCanvasProps {
  sections: SectionConfig[];
  /** The whole structure, for layout. */
  structure: CustomFormStructure;
  /** Apply a layout edit. Takes an updater so edits never act on stale state. */
  onStructureChange: (update: (structure: CustomFormStructure) => CustomFormStructure) => void;
  selectedSectionId: string | null;
  onSectionSelect: (sectionId: string) => void;
  onSectionDelete: (sectionId: string) => void;
  onSectionDuplicate: (sectionId: string) => void;
  /** Replace a section with one rebuilt from a written instruction. */
  onSectionRegenerate?: (sectionId: string, instruction: string) => Promise<void>;
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
  structure,
  onStructureChange,
  selectedSectionId,
  onSectionSelect,
  onSectionDelete,
  onSectionDuplicate,
  onSectionRegenerate,
  formulaEditingSectionId = null,
  onCellFormulaChange,
  onRequestEditFormulas,
}) => {
  const { setNodeRef } = useDroppable({ id: "form-canvas" });
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const units = React.useMemo(
    () => layoutUnits({ ...structure, sections }),
    [structure, sections],
  );
  const breaks = React.useMemo(
    () => pageBreakIds({ ...structure, sections }),
    [structure, sections],
  );

  const [arrangeIds, setArrangeIds] = React.useState<string[]>([]);
  const liveIds = new Set(ordered.map((s) => s.id));
  const picked = arrangeIds.filter((id) => liveIds.has(id));
  const toggleArrange = (id: string) =>
    setArrangeIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const arrange = (kind: LayoutGroupKind) => {
    onStructureChange((current) => groupSections(current, picked, kind).structure);
    setArrangeIds([]);
  };

  const renderSection = (
    section: SectionConfig,
    options: { inGroup: boolean },
  ) => (
    <SortableSection
      key={section.id}
      section={section}
      allSections={ordered}
      isSelected={section.id === selectedSectionId}
      onSelect={() => onSectionSelect(section.id)}
      onDelete={async () => {
        if (
          await confirmDialog({
            title: `Delete "${section.title || "this section"}"?`,
            description: "It is removed from this template. Saved forms keep their own copy.",
            confirmLabel: "Delete",
            destructive: true,
          })
        ) {
          onSectionDelete(section.id);
        }
      }}
      onDuplicate={() => onSectionDuplicate(section.id)}
      onRegenerate={
        onSectionRegenerate
          ? (instruction) => onSectionRegenerate(section.id, instruction)
          : undefined
      }
      isFormulaEditing={section.id === formulaEditingSectionId}
      onCellFormulaChange={onCellFormulaChange}
      onRequestEditFormulas={onRequestEditFormulas}
      arrangeSelected={picked.includes(section.id)}
      onToggleArrange={ordered.length > 1 ? () => toggleArrange(section.id) : undefined}
      dragDisabled={options.inGroup}
      pageBreakBefore={breaks.has(section.id)}
      onTogglePageBreak={
        options.inGroup || section.id === units[0]?.id
          ? undefined
          : () => onStructureChange((current) => togglePageBreakBefore(current, section.id))
      }
    />
  );

  const renderMember = (
    group: LayoutGroupConfig,
    section: SectionConfig,
    index: number,
    count: number,
  ) => {
    const across = group.kind === "side-by-side" || group.kind === "grid";
    const Earlier = across ? ChevronLeft : ChevronUp;
    const Later = across ? ChevronRight : ChevronDown;
    const move = (delta: -1 | 1) =>
      onStructureChange((current) => moveWithinGroup(current, section.id, delta));
    const controlClass =
      "p-1 rounded-none text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-white/70 dark:hover:bg-dark-100 disabled:opacity-30 disabled:hover:bg-transparent";
    return (
      <div key={section.id} className="min-w-0">
        <div className="flex items-center justify-end gap-0.5 mb-1">
          {count > 1 && (
            <>
              <button
                type="button"
                className={controlClass}
                disabled={index === 0}
                onClick={() => move(-1)}
                title={across ? "Move left" : "Move up"}
                aria-label={across ? "Move left" : "Move up"}
              >
                <Earlier className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                className={controlClass}
                disabled={index === count - 1}
                onClick={() => move(1)}
                title={across ? "Move right" : "Move down"}
                aria-label={across ? "Move right" : "Move down"}
              >
                <Later className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            className={`${controlClass} flex items-center gap-1 text-[11px]`}
            onClick={() => onStructureChange((current) => removeFromGroup(current, section.id))}
            title="Take this section out of the group"
          >
            <LogOut className="w-3.5 h-3.5" />
            Take out
          </button>
        </div>
        {renderSection(section, { inGroup: true })}
      </div>
    );
  };

  return (
    <div ref={setNodeRef} className={`w-full mx-auto ${picked.length > 0 ? "pb-44 md:pb-24" : ""}`}>
      {ordered.length > 1 && (
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          Tick two or more sections to put them side by side, in a grid, or in a box.
        </p>
      )}

      <SortableContext
        items={units.map((unit) => unit.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3 md:space-y-4">
          {units.map((unit) => (
            <React.Fragment key={unit.id}>
              {breaks.has(unit.id) && (
                <PageBreakMarker
                  onRemove={() =>
                    onStructureChange((current) => togglePageBreakBefore(current, unit.id))
                  }
                />
              )}
              {unit.type === "section" ? (
                renderSection(unit.section, { inGroup: false })
              ) : (
                <CanvasGroup
                  unit={unit}
                  pageBreakBefore={breaks.has(unit.id)}
                  onUpdate={(patch) =>
                    onStructureChange((current) => updateGroup(current, unit.id, patch))
                  }
                  onUngroup={() =>
                    onStructureChange((current) => ungroup(current, unit.id))
                  }
                  onTogglePageBreak={
                    unit.id === units[0]?.id
                      ? undefined
                      : () =>
                          onStructureChange((current) => togglePageBreakBefore(current, unit.id))
                  }
                  renderMember={(section, index, count) =>
                    renderMember(unit.group, section, index, count)
                  }
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </SortableContext>

      {picked.length > 0 && (
        // Floats at the bottom of the window, so ticking a box never shifts the
        // sections under the pointer, and it is on screen however the page is
        // scrolled. The canvas gets bottom padding so it never hides the last section.
        <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-40 w-max max-w-[calc(100vw-2rem)] flex flex-wrap items-center gap-1.5 border-2 border-brand bg-white dark:bg-dark-150 px-3 py-2 rounded-none shadow-lg">
          <span className="text-xs font-semibold text-neutral-900 dark:text-white mr-1">
            {picked.length} selected. Arrange as:
          </span>
          {ARRANGE_KINDS.map((kind) => {
            const Icon = KIND_ICONS[kind];
            const tooFew = picked.length < minimumFor(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => arrange(kind)}
                disabled={tooFew}
                title={tooFew ? "Tick at least two sections" : KIND_HINTS[kind]}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-none border border-neutral-300 dark:border-neutral-600 text-neutral-800 dark:text-neutral-100 hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-800 dark:disabled:hover:text-neutral-100"
              >
                <Icon className="w-3.5 h-3.5" />
                {LAYOUT_KIND_LABELS[kind]}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setArrangeIds([])}
            className="ml-auto px-2 py-1 text-xs rounded-none text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};
