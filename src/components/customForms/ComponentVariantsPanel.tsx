/**
 * Component Variants Panel
 *
 * Tabs above the component editor: "Full component" (the base, edited with
 * the live editor passed as children) and one tab per variant. A variant tab
 * lists every column / row / field / checklist item of the base with a
 * checkbox; unticking leaves that part out of the variant. A preview shows the
 * variant as it will be added to a form.
 */

import React from "react";
import { Copy, Layers, Plus, Trash2 } from "lucide-react";
import type { SectionConfig } from "@/lib/types/customForms";
import {
  applyVariant,
  isPartHidden,
  newVariantId,
  togglePart,
  variantParts,
  variantsOf,
  type ComponentVariant,
  type VariantPartKind,
} from "@/lib/customForms/componentVariants";
import { SectionContent } from "./FormPreview";
import { confirmDialog } from "@/components/ui/confirmDialog";

const KIND_LABELS: Record<VariantPartKind, string> = {
  column: "Columns",
  row: "Rows",
  field: "Fields",
  item: "Checklist items",
  line: "Value Deviation lines",
};

const tabCls = (active: boolean) =>
  `shrink-0 h-8 px-3 text-xs font-medium rounded-none border-b-2 ${
    active
      ? "border-brand text-brand"
      : "border-transparent text-neutral-600 dark:text-neutral-300 hover:text-brand"
  }`;

export const ComponentVariantsPanel: React.FC<{
  section: SectionConfig;
  onUpdate: (updates: Partial<SectionConfig>) => void;
  /** Selected variant id; null = the full component. */
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
  /** The base editor, shown on the "Full component" tab. */
  children: React.ReactNode;
}> = ({ section, onUpdate, activeId, onActiveChange, children }) => {
  const variants = variantsOf(section);
  const active = variants.find((v) => v.id === activeId) ?? null;
  const parts = variantParts(section);

  const setVariants = (next: ComponentVariant[]) =>
    onUpdate({ variants: next } as Partial<SectionConfig>);
  const updateActive = (next: ComponentVariant) =>
    setVariants(variants.map((v) => (v.id === next.id ? next : v)));

  const addVariant = (from?: ComponentVariant) => {
    const variant: ComponentVariant = from
      ? { ...from, id: newVariantId(), name: `${from.name} (copy)` }
      : { id: newVariantId(), name: `Variant ${variants.length + 1}` };
    setVariants([...variants, variant]);
    onActiveChange(variant.id);
  };

  const deleteActive = async () => {
    if (!active) return;
    const ok = await confirmDialog({
      title: `Delete variant "${active.name}"?`,
      description: "Forms that already used it keep their copy.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setVariants(variants.filter((v) => v.id !== active.id));
    onActiveChange(null);
  };

  const kinds = (Object.keys(KIND_LABELS) as VariantPartKind[]).filter((k) =>
    parts.some((p) => p.kind === k),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-1 border-b border-neutral-200 dark:border-neutral-700 overflow-x-auto">
        <Layers className="w-4 h-4 mb-2 mr-1 shrink-0 text-neutral-400" />
        <button type="button" className={tabCls(!active)} onClick={() => onActiveChange(null)}>
          Full component
        </button>
        {variants.map((v) => (
          <button
            key={v.id}
            type="button"
            className={tabCls(active?.id === v.id)}
            onClick={() => onActiveChange(v.id)}
          >
            {v.name || "Untitled variant"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => addVariant()}
          className="shrink-0 h-8 px-2 flex items-center gap-1 text-xs text-brand hover:bg-brand/10 rounded-none"
          title="A variant is this component with some parts left out, e.g. 3-wire vs 4-wire"
        >
          <Plus className="w-3.5 h-3.5" />
          Add variant
        </button>
      </div>

      {!active ? (
        <>{children}</>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={active.name}
              onChange={(e) => updateActive({ ...active, name: e.target.value })}
              placeholder="Variant name, e.g. 3-wire"
              className="h-8 w-64 px-2 text-sm font-medium bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => addVariant(active)}
              className="h-8 px-2 flex items-center gap-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-dark-100"
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicate
            </button>
            <button
              type="button"
              onClick={deleteActive}
              className="h-8 px-2 flex items-center gap-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded-none text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete variant
            </button>
          </div>

          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Untick what this variant leaves out. Everything else, including any part
            you add to the full component later, is included. To change wording or
            layout, edit the full component.
          </p>

          {parts.length === 0 ? (
            <p className="text-xs text-neutral-500">This component has no parts a variant can leave out.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {kinds.map((kind) => {
                const ofKind = parts.filter((p) => p.kind === kind);
                const included = ofKind.filter((p) => !isPartHidden(active, p)).length;
                return (
                  <div key={kind} className="min-w-0">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      {KIND_LABELS[kind]}{" "}
                      <span className="font-normal normal-case">
                        ({included} of {ofKind.length})
                      </span>
                    </div>
                    <div className="max-h-64 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-none">
                      {ofKind.map((part) => {
                        const hidden = isPartHidden(active, part);
                        return (
                          <label
                            key={part.id}
                            className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100"
                            title={part.label}
                          >
                            <input
                              type="checkbox"
                              checked={!hidden}
                              onChange={() => updateActive(togglePart(active, part))}
                              className="rounded-none"
                            />
                            <span
                              className={`truncate ${
                                hidden
                                  ? "text-neutral-400 line-through"
                                  : "text-neutral-800 dark:text-neutral-100"
                              }`}
                            >
                              {part.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <div className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Preview of "{active.name}"
            </div>
            <div className="border border-neutral-200 dark:border-neutral-700 rounded-none p-3">
              <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-2 border-b border-neutral-200 dark:border-neutral-600 pb-1">
                {section.title}
              </div>
              <SectionContent section={applyVariant(section, active)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComponentVariantsPanel;
