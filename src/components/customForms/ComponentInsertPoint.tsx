/**
 * Component Insert Point
 *
 * A thin "+" line placed above, between and below the sections on the canvas.
 * Clicking it opens a searchable picker of built-in and saved components, and
 * the chosen one is added at exactly that spot. Replaces the always-open
 * component library sidebar.
 */

import React, { useEffect, useRef, useState } from "react";
import { FileText, Plus, Search } from "lucide-react";
import {
  COMPONENT_LIBRARY,
  getComponentDefinition,
} from "@/lib/customForms/componentLibrary";
import type { SavedComponent } from "@/lib/customForms/savedComponents";
import type { ComponentType, SectionConfig } from "@/lib/types/customForms";
import {
  variantsOf,
  type ComponentVariant,
  type LibraryConfig,
} from "@/lib/customForms/componentVariants";
import { fitsEquipmentType } from "@/lib/customForms/equipmentTypes";
import { iconMap } from "./componentIcons";

const CATEGORY_LABELS: Record<string, string> = {
  info: "Info",
  testing: "Testing",
  inspection: "Inspection",
  equipment: "Equipment",
  other: "Other",
};

const CATEGORY_ORDER = ["info", "testing", "inspection", "equipment", "other"];

/** A saved component's list category: its own, else its base type's. */
function savedCategory(saved: SavedComponent): string {
  return (
    (saved.section_config as LibraryConfig).libraryCategory ??
    getComponentDefinition(saved.section_config.componentType)?.category ??
    "other"
  );
}

interface ComponentInsertPointProps {
  savedComponents: SavedComponent[];
  /** Admin-saved built-in defaults; built-in variants live here. */
  builtinOverrides?: Record<string, Partial<SectionConfig>>;
  /** No variantId = the full (base) component. */
  onAddBuiltin: (type: ComponentType, variantId?: string) => void;
  onAddSaved: (saved: SavedComponent, variant?: ComponentVariant) => void;
  /**
   * The template's equipment type. Its components and the Global ones are
   * listed; "Show all" reveals the rest.
   */
  equipmentType?: string;
  /** Always show the line (e.g. the empty canvas), not only on hover. */
  alwaysVisible?: boolean;
  label?: string;
}

export const ComponentInsertPoint: React.FC<ComponentInsertPointProps> = ({
  savedComponents,
  builtinOverrides = {},
  equipmentType,
  onAddBuiltin,
  onAddSaved,
  alwaysVisible = false,
  label = "Add component",
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const filterByEquipment = !!equipmentType && !showAll;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const q = search.trim().toLowerCase();
  const saved = savedComponents
    .filter((s) => s.name.toLowerCase().includes(q))
    .filter((s) => !filterByEquipment || fitsEquipmentType(s.section_config, equipmentType))
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(savedCategory(a)) - CATEGORY_ORDER.indexOf(savedCategory(b)) ||
        a.name.localeCompare(b.name),
    );
  const builtins = COMPONENT_LIBRARY.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q),
  ).filter(
    (c) =>
      !filterByEquipment ||
      fitsEquipmentType({ ...(builtinOverrides[c.id] ?? {}), componentType: c.id }, equipmentType),
  );
  const categories = Array.from(new Set(builtins.map((c) => c.category)));

  const pick = (fn: () => void) => {
    fn();
    setOpen(false);
    setSearch("");
  };

  const itemCls =
    "w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm rounded-none text-neutral-800 dark:text-neutral-100 hover:bg-brand/10 hover:text-brand";
  const variantCls =
    "w-full flex items-center gap-2 pl-8 pr-2 py-1 text-left text-xs rounded-none text-neutral-600 dark:text-neutral-300 hover:bg-brand/10 hover:text-brand";

  /** Sub-rows for a component's variants (the row above adds the full one). */
  const variantRows = (variants: ComponentVariant[], add: (v: ComponentVariant) => void) =>
    variants.map((v) => (
      <button
        key={v.id}
        type="button"
        className={variantCls}
        onClick={() => pick(() => add(v))}
        title={`Add the "${v.name}" variant`}
      >
        <span className="text-neutral-400">↳</span>
        <span className="truncate">{v.name}</span>
      </button>
    ));
  const fullLabel = (variants: ComponentVariant[]) =>
    variants.length > 0 ? (
      <span className="ml-auto shrink-0 text-[10px] text-neutral-400">full</span>
    ) : null;

  return (
    <div ref={ref} className="relative print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`group w-full flex items-center gap-2 py-1 transition-opacity ${
          alwaysVisible || open ? "opacity-100" : "opacity-40 hover:opacity-100 focus:opacity-100"
        }`}
        title={label}
        aria-label={label}
      >
        <span className="flex-1 h-px bg-brand/60" />
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-brand border border-brand bg-white dark:bg-dark-150 rounded-none">
          <Plus className="w-3.5 h-3.5" />
          {label}
        </span>
        <span className="flex-1 h-px bg-brand/60" />
      </button>

      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full z-40 mt-1 w-[min(28rem,90vw)] max-h-[60vh] flex flex-col bg-white dark:bg-dark-150 border border-neutral-200 dark:border-dark-200 shadow-lg rounded-none">
          <div className="p-2 border-b border-neutral-200 dark:border-dark-200">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search components"
                className="w-full h-8 pl-8 pr-2 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white"
              />
            </div>
          </div>
          {equipmentType && (
            <div className="px-2 py-1 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 border-b border-neutral-100 dark:border-dark-200">
              <span>{showAll ? "All components" : `For ${equipmentType} + Global`}</span>
              <button type="button" onClick={() => setShowAll((v) => !v)} className="text-brand hover:underline">
                {showAll ? `Only ${equipmentType}` : "Show all"}
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-1">
            {saved.length > 0 && (
              <div className="mb-2">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Saved components
                </div>
                {saved.map((s, i) => {
                  const variants = variantsOf(s.section_config);
                  const cat = savedCategory(s);
                  const showCat = i === 0 || savedCategory(saved[i - 1]) !== cat;
                  return (
                    <React.Fragment key={s.id}>
                      {showCat && (
                        <div className="px-2 pt-1 text-[10px] text-neutral-400">
                          {CATEGORY_LABELS[cat] ?? cat}
                        </div>
                      )}
                      <button
                        type="button"
                        className={itemCls}
                        onClick={() => pick(() => onAddSaved(s))}
                      >
                        <FileText className="w-4 h-4 shrink-0 text-neutral-500" />
                        <span className="truncate">{s.name}</span>
                        {fullLabel(variants)}
                      </button>
                      {variantRows(variants, (v) => onAddSaved(s, v))}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
            {categories.map((cat) => (
              <div key={cat} className="mb-2">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {CATEGORY_LABELS[cat] ?? cat}
                </div>
                {builtins
                  .filter((c) => c.category === cat)
                  .map((c) => {
                    const Icon = iconMap[c.icon] || FileText;
                    const variants = variantsOf(builtinOverrides[c.id]);
                    return (
                      <React.Fragment key={c.id}>
                        <button
                          type="button"
                          className={itemCls}
                          title={c.description}
                          onClick={() => pick(() => onAddBuiltin(c.id))}
                        >
                          <Icon className="w-4 h-4 shrink-0 text-neutral-500" />
                          <span className="truncate">{c.name}</span>
                          {fullLabel(variants)}
                        </button>
                        {variantRows(variants, (v) => onAddBuiltin(c.id, v.id))}
                      </React.Fragment>
                    );
                  })}
              </div>
            ))}
            {saved.length === 0 && builtins.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
                No components match.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ComponentInsertPoint;
