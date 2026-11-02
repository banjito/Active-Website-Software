/**
 * Re-flow dialog
 *
 * The one place to reorder and add components in a template. Each component
 * is a compact row (name, type, variant, reference code, group, page break),
 * not the full table. Changes are made on a copy and only reach the template
 * on "Done", so "Cancel" really discards them.
 *
 * Groups (side by side, grid, box) move as one block, so re-flowing never
 * splits a group.
 */

import React, { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  LogOut,
  Copy,
  FileText,
  GripVertical,
  Layers,
  Scissors,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import type { CustomFormStructure, SectionConfig } from "@/lib/types/customForms";
import type { SavedComponent } from "@/lib/customForms/savedComponents";
import type { ComponentType } from "@/lib/types/customForms";
import type { ComponentVariant } from "@/lib/customForms/componentVariants";
import { getComponentDefinition } from "@/lib/customForms/componentLibrary";
import {
  getSectionReferenceCode,
  withFreeReferenceCode,
} from "@/lib/customForms/formCellResolution";
import {
  LAYOUT_KIND_LABELS,
  groupSections,
  layoutUnits,
  moveUnit,
  moveWithinGroup,
  pageBreakIds,
  placeAfterSection,
  removeFromGroup,
  tidyLayout,
  togglePageBreakBefore,
  ungroup,
  type LayoutUnit,
} from "@/lib/customForms/layoutGroups";
import { ARRANGE_KINDS, KIND_HINTS, KIND_ICONS, minimumFor } from "./FormCanvas";
import { sortedSections } from "@/lib/customForms/runtime";
import { ComponentInsertPoint } from "./ComponentInsertPoint";
import { iconMap } from "./ComponentLibrarySidebar";

const DRAG_TYPE = "application/x-reflow-unit";

let idCounter = 0;
/** Unique even when two components are added in the same millisecond. */
const newSectionId = () => `section-${Date.now()}-${++idCounter}`;

interface ReflowDialogProps {
  open: boolean;
  structure: CustomFormStructure;
  savedComponents: SavedComponent[];
  builtinOverrides: Record<string, Partial<SectionConfig>>;
  /** A new section for a built-in (optionally a variant of it), not yet placed. */
  makeBuiltinSection: (type: ComponentType, variantId?: string) => SectionConfig | null;
  /** A new section from a saved component (optionally a variant of it), not yet placed. */
  makeSavedSection: (saved: SavedComponent, variant?: ComponentVariant) => SectionConfig;
  onApply: (structure: CustomFormStructure) => void;
  onClose: () => void;
}

export const ReflowDialog: React.FC<ReflowDialogProps> = ({
  open,
  structure,
  savedComponents,
  builtinOverrides,
  makeBuiltinSection,
  makeSavedSection,
  onApply,
  onClose,
}) => {
  // Work on a copy, taken each time the dialog opens.
  const [draft, setDraft] = useState(structure);
  const [changed, setChanged] = useState(false);
  const [dropOn, setDropOn] = useState<string | null>(null);
  // Sections ticked to be grouped.
  const [picked, setPicked] = useState<string[]>([]);
  React.useEffect(() => {
    if (open) {
      setDraft(structure);
      setChanged(false);
      setPicked([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const units = useMemo(() => layoutUnits(draft), [draft]);
  const breaks = useMemo(() => pageBreakIds(draft), [draft]);
  const sorted = useMemo(() => sortedSections(draft.sections), [draft]);

  const update = (next: CustomFormStructure) => {
    setDraft(next);
    setChanged(true);
  };

  /** Index in the section order where a unit starts (or the end). */
  const startIndex = (unit?: LayoutUnit) => {
    if (!unit) return sorted.length;
    const firstId = unit.type === "group" ? unit.sections[0]?.id : unit.id;
    const i = sorted.findIndex((s) => s.id === firstId);
    return i < 0 ? sorted.length : i;
  };

  const insertAt = (index: number, section: SectionConfig | null) => {
    if (!section) return;
    const list = [...sorted];
    list.splice(index, 0, withFreeReferenceCode({ ...section, id: newSectionId() }, list));
    update({ ...draft, sections: list.map((s, i) => ({ ...s, order: i })) });
  };

  const removeSection = (id: string) =>
    update(
      tidyLayout({
        ...draft,
        sections: sorted.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i })),
      }),
    );

  const duplicate = (section: SectionConfig) =>
    update(
      placeAfterSection(
        draft,
        section.id,
        withFreeReferenceCode(
          {
            ...section,
            id: newSectionId(),
            title: `${section.title} (Copy)`,
            referenceCode: getSectionReferenceCode(section),
          },
          draft.sections,
        ),
      ),
    );

  const close = async () => {
    if (
      changed &&
      !(await confirmDialog({
        title: "Discard re-flow changes?",
        description: "The order and any components you added here will not be kept.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        destructive: true,
      }))
    ) {
      return;
    }
    onClose();
  };

  const insertPoint = (index: number, label = "Add component") => (
    <ComponentInsertPoint
      label={label}
      savedComponents={savedComponents}
      builtinOverrides={builtinOverrides}
      onAddBuiltin={(type, variantId) => insertAt(index, makeBuiltinSection(type, variantId))}
      onAddSaved={(saved, variant) => insertAt(index, makeSavedSection(saved, variant))}
    />
  );

  const iconBtn =
    "p-1 rounded-none text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-dark-100 disabled:opacity-30";

  const togglePick = (id: string) =>
    setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const livePicked = picked.filter((id) => sorted.some((s) => s.id === id));

  /** One line of information about a section. */
  const sectionLine = (
    section: SectionConfig,
    group?: { index: number; count: number; across: boolean },
  ) => {
    const def = getComponentDefinition(section.componentType);
    const Icon = (def && iconMap[def.icon]) || FileText;
    const inGroup = !!group;
    return (
      <div key={section.id} className={`flex items-center gap-2 min-w-0 ${inGroup ? "pl-6 py-0.5" : ""}`}>
        {sorted.length > 1 && (
          <input
            type="checkbox"
            checked={picked.includes(section.id)}
            onChange={() => togglePick(section.id)}
            className="rounded-none shrink-0"
            title="Tick two or more to put them side by side, in a grid or in a box"
          />
        )}
        <Icon className="w-4 h-4 shrink-0 text-neutral-500" />
        <span className="font-medium text-sm text-neutral-900 dark:text-white truncate">
          {section.title || "Untitled"}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-amber-700 dark:text-amber-400">
          {getSectionReferenceCode(section)}
        </span>
        <span className="shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
          {def?.name ?? section.componentType}
        </span>
        {section.appliedVariant && (
          <span className="shrink-0 px-1 text-[10px] border border-brand text-brand rounded-none">
            {section.appliedVariant}
          </span>
        )}
        {section.showInPrint === false && (
          <span className="shrink-0 text-[10px] text-neutral-400">hidden in print</span>
        )}
        <span className="ml-auto flex items-center shrink-0">
          {group && group.count > 1 && (
            <>
              <button
                type="button"
                className={iconBtn}
                disabled={group.index === 0}
                onClick={() => update(moveWithinGroup(draft, section.id, -1))}
                title={group.across ? "Move left in the group" : "Move up in the group"}
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                className={iconBtn}
                disabled={group.index === group.count - 1}
                onClick={() => update(moveWithinGroup(draft, section.id, 1))}
                title={group.across ? "Move right in the group" : "Move down in the group"}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {group && (
            <button
              type="button"
              className={iconBtn}
              onClick={() => update(removeFromGroup(draft, section.id))}
              title="Take this out of the group"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
          <button type="button" className={iconBtn} onClick={() => duplicate(section)} title="Duplicate">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className={`${iconBtn} hover:text-red-600`}
            onClick={async () => {
              if (
                await confirmDialog({
                  title: `Remove "${section.title || "this section"}"?`,
                  description: "It is removed when you click Done.",
                  confirmLabel: "Remove",
                  destructive: true,
                })
              ) {
                removeSection(section.id);
              }
            }}
            title="Remove"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </span>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[min(48rem,95vw)] max-w-none max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden"
      >
        <div className="px-4 py-3 pr-12 border-b border-neutral-200 dark:border-neutral-700">
          <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-white">
            Re-flow components
          </DialogTitle>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Drag a row (or use the arrows) to reorder. Use the + lines to add components.
            Tick components to group them. Nothing changes until you click Done.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {units.length === 0 ? (
            <div className="py-8">{insertPoint(0, "Add your first component")}</div>
          ) : (
            <>
              {insertPoint(0)}
              {units.map((unit, i) => (
                <React.Fragment key={unit.id}>
                  {breaks.has(unit.id) && (
                    <div className="flex items-center gap-2 my-1 text-[10px] uppercase tracking-wide text-neutral-400">
                      <span className="flex-1 border-t border-dashed border-neutral-300 dark:border-neutral-600" />
                      Page break
                      <span className="flex-1 border-t border-dashed border-neutral-300 dark:border-neutral-600" />
                    </div>
                  )}
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, unit.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                      e.preventDefault();
                      setDropOn(unit.id);
                    }}
                    onDragLeave={() => setDropOn((d) => (d === unit.id ? null : d))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDropOn(null);
                      const id = e.dataTransfer.getData(DRAG_TYPE);
                      if (id && id !== unit.id) update(moveUnit(draft, id, unit.id));
                    }}
                    className={`flex items-start gap-2 px-2 py-1.5 bg-white dark:bg-dark-150 border rounded-none ${
                      dropOn === unit.id
                        ? "border-brand border-t-4"
                        : "border-neutral-200 dark:border-neutral-700"
                    }`}
                  >
                    <GripVertical
                      className="w-4 h-4 mt-0.5 shrink-0 text-neutral-400 cursor-grab"
                      aria-label="Drag to reorder"
                    />
                    <div className="flex-1 min-w-0">
                      {unit.type === "section" ? (
                        sectionLine(unit.section)
                      ) : (
                        <>
                          <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                            <Layers className="w-4 h-4 text-neutral-400" />
                            <span className="font-medium">
                              {LAYOUT_KIND_LABELS[unit.group.kind]} · {unit.sections.length} components
                            </span>
                            <button
                              type="button"
                              onClick={() => update(ungroup(draft, unit.id))}
                              className="ml-auto flex items-center gap-1 text-[11px] text-neutral-500 hover:text-brand"
                              title="Split the group back into separate components"
                            >
                              <Scissors className="w-3 h-3" />
                              Ungroup
                            </button>
                          </div>
                          {unit.sections.map((s, k) =>
                            sectionLine(s, {
                              index: k,
                              count: unit.sections.length,
                              across:
                                unit.group.kind === "side-by-side" || unit.group.kind === "grid",
                            }),
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center shrink-0">
                      <button
                        type="button"
                        className={iconBtn}
                        disabled={i === 0}
                        onClick={() => update(moveUnit(draft, unit.id, units[i - 1].id))}
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className={iconBtn}
                        disabled={i === units.length - 1}
                        onClick={() => update(moveUnit(draft, unit.id, units[i + 1].id))}
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      {i > 0 && (
                        <button
                          type="button"
                          className={`${iconBtn} text-[10px] px-1.5`}
                          onClick={() => update(togglePageBreakBefore(draft, unit.id))}
                          title={breaks.has(unit.id) ? "Remove the page break before this" : "Start a new page here"}
                        >
                          {breaks.has(unit.id) ? "No break" : "Page break"}
                        </button>
                      )}
                    </div>
                  </div>
                  {insertPoint(startIndex(units[i + 1]))}
                </React.Fragment>
              ))}
            </>
          )}
        </div>

        {livePicked.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-t-2 border-brand bg-brand/5">
            <span className="text-xs font-semibold text-neutral-900 dark:text-white mr-1">
              {livePicked.length} ticked. Arrange as:
            </span>
            {ARRANGE_KINDS.map((kind) => {
              const Icon = KIND_ICONS[kind];
              const tooFew = livePicked.length < minimumFor(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  disabled={tooFew}
                  onClick={() => {
                    update(groupSections(draft, livePicked, kind).structure);
                    setPicked([]);
                  }}
                  title={tooFew ? "Tick at least two components" : KIND_HINTS[kind]}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 text-neutral-800 dark:text-neutral-100 hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-800"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {LAYOUT_KIND_LABELS[kind]}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPicked([])}
              className="ml-auto px-2 py-1 text-xs text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
            >
              Clear
            </button>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-200 dark:border-neutral-700">
          <span className="mr-auto text-xs text-neutral-500 dark:text-neutral-400">
            {sorted.length} component{sorted.length === 1 ? "" : "s"}
            {changed ? " · unsaved re-flow" : ""}
          </span>
          <Button variant="outline" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-brand hover:bg-brand-dark"
            onClick={() => {
              if (changed) onApply(tidyLayout(draft));
              onClose();
            }}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReflowDialog;
