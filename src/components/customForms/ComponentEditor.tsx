/**
 * Component Editor
 *
 * One place to create and edit form components outside of any template:
 * - Built-in components: admins edit the default every new section starts from.
 * - Custom (saved) components: create, rename, edit, duplicate and delete.
 *
 * Editing reuses the section editor modal; the page shows a live preview.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Copy,
  SlidersHorizontal,
  Eye,
  PencilLine,
  Sparkles,
  X,
  Plus,
  Save,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { SectionEditor } from "./SectionEditor";
import { SectionContent } from "./FormPreview";
import { LiveComponentEditor } from "./LiveComponentEditor";
import { ComponentVariantsPanel } from "./ComponentVariantsPanel";
import { FormulaRefHover } from "./FormulaRefHover";
import { TableLayoutEditor } from "./TableLayoutEditor";
import { AiProgress } from "./AiProgress";
import { EquipmentTypePicker } from "./EquipmentTypePicker";
import { EquipmentTypesDialog } from "./EquipmentTypesDialog";
import {
  equipmentTypesLabel,
  equipmentTypesOf,
  fetchEquipmentTypeList,
  isGlobal,
} from "@/lib/customForms/equipmentTypes";
import { useLookupTables } from "@/lib/customForms/lookupLibrary";
import { applyVariant, variantsOf } from "@/lib/customForms/componentVariants";
import { useResizablePanel } from "./useResizablePanel";
import { regenerateSectionWithPrompt } from "@/lib/customForms/excel/generate";
import {
  COMPONENT_LIBRARY,
  getComponentDefinition,
} from "@/lib/customForms/componentLibrary";
import {
  fetchComponentDefaultOverrides,
  getMergedDefaultConfig,
  saveComponentDefaultOverride,
} from "@/lib/customForms/componentDefaultOverrides";
import {
  fetchSavedComponents,
  saveSavedComponent,
  updateSavedComponent,
  deleteSavedComponent,
  type SavedComponent,
} from "@/lib/customForms/savedComponents";
import { ComponentType, SectionConfig } from "@/lib/types/customForms";

type Selection =
  | { kind: "builtin"; type: ComponentType }
  | { kind: "saved"; id: string }
  | { kind: "new" };

const DRAFT_ID = "component-draft";

const CATEGORY_LABELS: Record<string, string> = {
  info: "Info",
  testing: "Testing",
  inspection: "Inspection",
  equipment: "Equipment",
  other: "Other",
};

/** Built-in types whose default may not be overridden (must stay a blank template). */
const PROTECTED_TYPES = new Set<ComponentType>([ComponentType.CUSTOM_TABLE]);

/** Turn a stored config into an editable section with the fields the editor expects. */
function toDraft(
  config: Partial<SectionConfig>,
  fallbackType: ComponentType,
): SectionConfig {
  const type = (config.componentType as ComponentType) ?? fallbackType;
  return {
    ...config,
    id: DRAFT_ID,
    componentType: type,
    title: (config.title as string) || getComponentDefinition(type)?.name || "Component",
    order: 0,
    showInPrint: config.showInPrint !== false,
  } as SectionConfig;
}

const CATEGORY_ORDER = ["info", "testing", "inspection", "equipment", "other"];

type ListShow = "all" | "custom" | "builtin" | "edited";
type ListSort = "name" | "name-desc" | "category" | "type" | "updated";

const SHOW_OPTIONS: { value: ListShow; label: string; title: string }[] = [
  { value: "all", label: "All", title: "Every component" },
  { value: "custom", label: "Custom", title: "Components you've saved" },
  { value: "builtin", label: "Built-in", title: "Components that come with the app" },
  { value: "edited", label: "Edited", title: "Built-ins whose default has been changed" },
];

/** One row in the component list. */
interface ListEntry {
  key: string;
  kind: "builtin" | "saved";
  name: string;
  typeName: string;
  category: string;
  description: string;
  edited: boolean;
  updatedAt?: string;
  builtinType?: ComponentType;
  saved?: SavedComponent;
  /** Equipment types ("*" = Global). */
  equipment: string[];
}

const LIST_PREFS_KEY = "customForms.componentList";

/** Remembered list settings (open, show, category, sort). */
function readListPrefs(): {
  open: boolean;
  show: ListShow;
  category: string;
  sort: ListSort;
} {
  const fallback = { open: true, show: "all" as ListShow, category: "all", sort: "name" as ListSort };
  try {
    const raw = window.localStorage.getItem(LIST_PREFS_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

const listBtnCls = (active: boolean) =>
  `block w-full text-left px-3 py-1.5 text-sm rounded-none ${
    active
      ? "bg-brand/10 text-brand font-medium"
      : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-dark-100"
  }`;

export const ComponentEditor: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin =
    (user?.user_metadata?.role as string) === "Admin" ||
    (user?.user_metadata?.role as string) === "Super Admin";

  const [overrides, setOverrides] = useState<
    Record<string, Partial<SectionConfig>>
  >({});
  const [saved, setSaved] = useState<SavedComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [selection, setSelection] = useState<Selection | null>(null);
  const [draft, setDraft] = useState<SectionConfig | null>(null);
  const [name, setName] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStartedAt, setAiStartedAt] = useState(0);
  // Top-bar toggle: the form preview replaces the editor.
  const [showPreview, setShowPreview] = useState(false);
  // Formulas may read the shared lookup tables; re-render once they load.
  useLookupTables();
  // The page fills the window below the app header; only the component list
  // and the editor scroll, never the page.
  const pageRef = useRef<HTMLDivElement>(null);
  const [pageHeight, setPageHeight] = useState<number>();
  React.useLayoutEffect(() => {
    window.scrollTo(0, 0);
    const fit = () => {
      const el = pageRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setPageHeight(Math.max(320, window.innerHeight - top));
    };
    fit();
    window.addEventListener("resize", fit);
    // Belt and braces: whatever else in the app layout adds a few pixels
    // (padding, a scrollbar, a banner), the page itself must not scroll here.
    // Every scrollable ancestor is locked while this page is open.
    const locked: { el: HTMLElement; overflow: string }[] = [];
    for (
      let el: HTMLElement | null = pageRef.current?.parentElement ?? null;
      el;
      el = el.parentElement
    ) {
      const { overflowY } = window.getComputedStyle(el);
      if (overflowY === "auto" || overflowY === "scroll" || el === document.body || el === document.documentElement) {
        locked.push({ el, overflow: el.style.overflow });
        el.scrollTop = 0;
        el.style.overflow = "hidden";
      }
    }
    return () => {
      window.removeEventListener("resize", fit);
      locked.forEach(({ el, overflow }) => {
        el.style.overflow = overflow;
      });
    };
  }, []);
  const [listPrefs] = useState(readListPrefs);
  const [listOpen, setListOpen] = useState(listPrefs.open);
  const [listShow, setListShow] = useState<ListShow>(listPrefs.show);
  const [listCategory, setListCategory] = useState(listPrefs.category);
  const [listSort, setListSort] = useState<ListSort>(listPrefs.sort);
  // Equipment filter: "all", "__global", "__unassigned" or a type name.
  const [listEquipment, setListEquipment] = useState<string>("all");
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>([]);
  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false);
  useEffect(() => {
    fetchEquipmentTypeList().then(setEquipmentOptions).catch(() => setEquipmentOptions([]));
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        LIST_PREFS_KEY,
        JSON.stringify({ open: listOpen, show: listShow, category: listCategory, sort: listSort }),
      );
    } catch {
      /* storage unavailable */
    }
  }, [listOpen, listShow, listCategory, listSort]);
  const listRef = useRef<HTMLElement>(null);
  const listPanel = useResizablePanel({
    storageKey: "customForms.componentList.width",
    defaultWidth: 320,
    minWidth: 240,
    maxViewportFraction: 0.6,
    side: "left",
  });
  // Variant tab in the editor; null = the full component.
  const [variantTab, setVariantTab] = useState<string | null>(null);
  useEffect(() => setVariantTab(null), [selection]);
  const [newBaseType, setNewBaseType] = useState<ComponentType>(
    ComponentType.CUSTOM_TABLE,
  );

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([
        fetchComponentDefaultOverrides(),
        fetchSavedComponents(),
      ]);
      setOverrides(o);
      setSaved(s);
    } catch (err) {
      console.error("Failed to load components:", err);
      toast.error("Could not load components.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDiscard = async () =>
    !isDirty ||
    (await confirmDialog({
      title: "Discard unsaved changes?",
      description: "Your changes to this component will be lost.",
      confirmLabel: "Discard",
      cancelLabel: "Stay",
      destructive: true,
    }));

  const openBuiltin = async (type: ComponentType) => {
    if (!(await confirmDiscard())) return;
    const def = getComponentDefinition(type);
    setSelection({ kind: "builtin", type });
    setDraft(toDraft(getMergedDefaultConfig(type, overrides), type));
    setName(def?.name ?? type);
    setIsDirty(false);
  };

  const openSaved = async (item: SavedComponent) => {
    if (!(await confirmDiscard())) return;
    setSelection({ kind: "saved", id: item.id });
    setDraft(toDraft(item.section_config, ComponentType.CUSTOM_TABLE));
    setName(item.name);
    setIsDirty(false);
  };

  /** Start a new custom component from a type's default, or as a copy of `from`. */
  const startNew = async (base: ComponentType, from?: SectionConfig) => {
    // A duplicate carries the current edits along, so nothing is lost.
    if (!from && !(await confirmDiscard())) return;
    const config = from ?? getMergedDefaultConfig(base, overrides);
    setSelection({ kind: "new" });
    setDraft(toDraft(config, base));
    setName(from ? `${name} (copy)` : "New component");
    setIsDirty(true);
  };

  /**
   * Build a component from a written description (AI call, billed per use).
   * "new" starts from a blank custom table; "current" reworks the open draft.
   */
  const generateFromDescription = async (target: "new" | "current") => {
    const text = aiText.trim();
    if (!text) return;
    if (target === "new" && !(await confirmDiscard())) return;
    const base =
      target === "current" && draft
        ? draft
        : toDraft(
            getMergedDefaultConfig(ComponentType.CUSTOM_TABLE, overrides),
            ComponentType.CUSTOM_TABLE,
          );
    setAiBusy(true);
    setAiStartedAt(Date.now());
    try {
      const built = await regenerateSectionWithPrompt(base, text);
      if (!built?.length) {
        toast.error("Nothing usable came back. Try describing it differently.");
        return;
      }
      if (built.length > 1) {
        toast("That made more than one section; only the first was kept.");
      }
      const next = toDraft(built[0], base.componentType);
      setDraft(next);
      if (target === "new") {
        setSelection({ kind: "new" });
        setName(next.title || "New component");
      }
      setIsDirty(true);
      setAiOpen(false);
      setAiText("");
      toast.success("Component built. Check it before saving.");
    } catch (err: any) {
      console.error("Failed to generate component:", err);
      toast.error(err?.message || "Could not build the component.");
    } finally {
      setAiBusy(false);
    }
  };

  const updateDraft = (updates: Partial<SectionConfig>) => {
    setDraft((prev) => (prev ? { ...prev, ...updates } : prev));
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!draft || !selection) return;
    if (!user?.id) {
      toast.error("You must be logged in to save components.");
      return;
    }
    setSaving(true);
    try {
      if (selection.kind === "builtin") {
        const { error } = await saveComponentDefaultOverride(
          selection.type,
          draft,
          user.id,
        );
        if (error) throw error;
        const { id, order, ...rest } = draft;
        setOverrides((prev) => ({ ...prev, [selection.type]: rest }));
        toast.success(`Default for "${name}" saved.`);
      } else if (selection.kind === "saved") {
        const { error } = await updateSavedComponent(
          selection.id,
          draft,
          name.trim() || draft.title,
        );
        if (error) throw error;
        await load();
        toast.success(`"${name}" updated.`);
      } else {
        const trimmed = name.trim();
        if (!trimmed) {
          toast.error("Give the component a name first.");
          return;
        }
        const result = await saveSavedComponent(trimmed, draft, user.id);
        if ("error" in result) throw result.error;
        await load();
        setSelection({ kind: "saved", id: result.id });
        toast.success(`"${trimmed}" added to custom components.`);
      }
      setIsDirty(false);
    } catch (err: any) {
      console.error("Failed to save component:", err);
      toast.error(err?.message || "Could not save component.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (selection?.kind !== "saved") return;
    const ok = await confirmDialog({
      title: `Delete "${name}"?`,
      description:
        "It will be removed from the component library. Forms already using it keep their copy.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await deleteSavedComponent(selection.id);
    if (error) {
      toast.error(error.message || "Could not delete component.");
      return;
    }
    toast.success("Component deleted.");
    setSelection(null);
    setDraft(null);
    setIsDirty(false);
    load();
  };

  /** "Discard changes": back to the last saved version, after a confirm. */
  const handleDiscardChanges = async () => {
    if (!isDirty) return;
    const ok = await confirmDialog({
      title: "Discard changes?",
      description: "Everything since the last save is lost.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      destructive: true,
    });
    if (ok) handleRevert();
  };

  /** "Discard draft": drop an unsaved new component entirely. */
  const handleDiscardDraft = async () => {
    const ok = await confirmDialog({
      title: `Discard "${name || "New component"}"?`,
      description: "This new component was never saved, so it will be gone.",
      confirmLabel: "Discard draft",
      cancelLabel: "Keep editing",
      destructive: true,
    });
    if (!ok) return;
    setSelection(null);
    setDraft(null);
    setIsDirty(false);
    setEditorOpen(false);
  };

  const handleRevert = () => {
    if (!selection) return;
    if (selection.kind === "builtin") {
      setDraft(
        toDraft(getMergedDefaultConfig(selection.type, overrides), selection.type),
      );
    } else if (selection.kind === "saved") {
      const item = saved.find((s) => s.id === selection.id);
      if (item) {
        setDraft(toDraft(item.section_config, ComponentType.CUSTOM_TABLE));
        setName(item.name);
      }
    }
    setIsDirty(false);
  };

  const q = search.trim().toLowerCase();

  /** Built-in and custom components in one list, so they filter and sort together. */
  const entries = useMemo<ListEntry[]>(() => {
    const builtins: ListEntry[] = COMPONENT_LIBRARY.map((c) => ({
      key: `b:${c.id}`,
      kind: "builtin",
      name: c.name,
      typeName: c.name,
      category: c.category,
      description: c.description,
      edited: !!overrides[c.id],
      builtinType: c.id,
      equipment: equipmentTypesOf({ ...(overrides[c.id] ?? {}), componentType: c.id }),
    }));
    const custom: ListEntry[] = saved.map((s) => {
      const def = getComponentDefinition(s.section_config.componentType);
      return {
        key: `s:${s.id}`,
        kind: "saved",
        name: s.name,
        typeName: def?.name ?? s.section_config.componentType ?? "Component",
        category: s.section_config.libraryCategory ?? def?.category ?? "other",
        description: s.description ?? "",
        edited: false,
        updatedAt: s.updated_at,
        saved: s,
        equipment: equipmentTypesOf(s.section_config),
      };
    });
    return [...custom, ...builtins];
  }, [saved, overrides]);

  const visibleEntries = useMemo(() => {
    const list = entries.filter((e) => {
      if (listShow === "custom" && e.kind !== "saved") return false;
      if (listShow === "builtin" && e.kind !== "builtin") return false;
      if (listShow === "edited" && !e.edited) return false;
      if (listCategory !== "all" && e.category !== listCategory) return false;
      if (listEquipment === "__global" && !isGlobal(e.equipment)) return false;
      if (listEquipment === "__unassigned" && e.equipment.length) return false;
      // A type shows its own components and the Global ones every report uses.
      if (
        !["all", "__global", "__unassigned"].includes(listEquipment) &&
        !isGlobal(e.equipment) &&
        !e.equipment.includes(listEquipment)
      )
        return false;
      return (
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.typeName.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
      );
    });
    const byName = (a: ListEntry, b: ListEntry) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    return list.sort((a, b) => {
      switch (listSort) {
        case "name-desc":
          return byName(b, a);
        case "updated":
          // Custom components (which have dates) first, newest on top.
          return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || byName(a, b);
        case "type":
          return a.typeName.localeCompare(b.typeName) || byName(a, b);
        case "category":
          return (
            CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
            Number(a.kind === "builtin") - Number(b.kind === "builtin") ||
            byName(a, b)
          );
        default:
          return byName(a, b);
      }
    });
  }, [entries, listShow, listCategory, listSort, q, listEquipment]);

  const isProtected =
    selection?.kind === "builtin" && PROTECTED_TYPES.has(selection.type);
  const canSave =
    !!draft &&
    isDirty &&
    !saving &&
    (selection?.kind !== "builtin" || (isAdmin && !isProtected));
  const typeName = draft
    ? getComponentDefinition(draft.componentType)?.name ?? draft.componentType
    : "";

  const isActive = (e: ListEntry) =>
    e.kind === "saved"
      ? selection?.kind === "saved" && selection.id === e.saved!.id
      : selection?.kind === "builtin" && selection.type === e.builtinType;
  // Wide enough for a details line under each name.
  const roomy = listPanel.width >= 380;
  const filterSelect =
    "h-7 min-w-0 px-1 text-xs bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none text-neutral-900 dark:text-white";
  const filtersActive = listShow !== "all" || listCategory !== "all" || listEquipment !== "all" || !!q;

  return (
    <div
      ref={pageRef}
      style={{ height: pageHeight }}
      // Cancels the app layout's bottom padding, which would add a page scroll.
      className="flex h-[calc(100vh-5rem)] min-h-0 overflow-hidden -mb-3 sm:-mb-4 lg:-mb-6 bg-neutral-50 dark:bg-dark-100"
    >
      {/* Component list (hide-able, drag the right edge to widen) */}
      {!listOpen ? (
        <div className="w-10 shrink-0 flex flex-col items-center gap-2 py-3 border-r border-neutral-200 dark:border-dark-200 bg-white dark:bg-dark-150">
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="p-1.5 rounded-none text-neutral-500 hover:text-brand hover:bg-brand/10"
            title="Show component list"
            aria-label="Show component list"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      ) : (
      <aside
        ref={listRef}
        style={{ width: listPanel.width }}
        className="relative shrink-0 flex flex-col border-r border-neutral-200 dark:border-dark-200 bg-white dark:bg-dark-150"
      >
        <div className="p-3 space-y-2 border-b border-neutral-200 dark:border-dark-200">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (await confirmDiscard()) navigate("/custom-forms/templates");
              }}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Templates
            </Button>
            <button
              type="button"
              onClick={() => setListOpen(false)}
              className="p-1.5 rounded-none text-neutral-500 hover:text-brand hover:bg-brand/10"
              title="Hide component list"
              aria-label="Hide component list"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-1">
            <select
              value={newBaseType}
              onChange={(e) => setNewBaseType(e.target.value as ComponentType)}
              title="Start the new component from this type"
              className={`${filterSelect} flex-1`}
            >
              {COMPONENT_LIBRARY.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={() => startNew(newBaseType)}
              className="bg-brand hover:bg-brand-dark h-7"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              New
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAiOpen(true)}
            className="w-full h-7 border-brand text-brand hover:bg-brand/10"
            leftIcon={<Sparkles className="w-3.5 h-3.5" />}
          >
            Describe a new component
          </Button>

          <div className="relative pt-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 mt-0.5 w-4 h-4 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, type or description"
              className="w-full h-8 pl-8 pr-2 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white"
            />
          </div>
          {/* Show: segmented so the common filter is one click */}
          <div className="flex border border-neutral-300 dark:border-neutral-700">
            {SHOW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setListShow(opt.value)}
                className={`flex-1 h-7 text-xs rounded-none ${
                  listShow === opt.value
                    ? "bg-brand text-white"
                    : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-dark-100"
                }`}
                title={opt.title}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <select
              value={listEquipment}
              onChange={(e) => {
                if (e.target.value === "__manage") setEquipmentDialogOpen(true);
                else setListEquipment(e.target.value);
              }}
              title="Equipment type (a type also shows the Global components)"
              className={`${filterSelect} flex-1`}
            >
              <option value="all">All equipment</option>
              <option value="__global">Global only</option>
              <option value="__unassigned">Unassigned</option>
              {equipmentOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="__manage">Edit the list…</option>
            </select>
          </div>
          <div className="flex gap-1">
            <select
              value={listCategory}
              onChange={(e) => setListCategory(e.target.value)}
              title="Category"
              className={`${filterSelect} flex-1`}
            >
              <option value="all">All categories</option>
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <select
              value={listSort}
              onChange={(e) => setListSort(e.target.value as ListSort)}
              title="Sort"
              className={`${filterSelect} flex-1`}
            >
              <option value="name">Name A→Z</option>
              <option value="name-desc">Name Z→A</option>
              <option value="category">Category</option>
              <option value="type">Type</option>
              <option value="updated">Recently updated</option>
            </select>
          </div>
          <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
            <span>
              {visibleEntries.length} of {entries.length}
            </span>
            {filtersActive && (
              <button
                type="button"
                className="text-brand hover:underline"
                onClick={() => {
                  setSearch("");
                  setListShow("all");
                  setListCategory("all");
                  setListEquipment("all");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <p className="px-3 py-1 text-xs text-neutral-500">Loading…</p>
          ) : visibleEntries.length === 0 ? (
            <p className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
              No components match.
            </p>
          ) : (
            visibleEntries.map((e, i) => {
              const showHeading =
                listSort === "category" &&
                (i === 0 || visibleEntries[i - 1].category !== e.category);
              return (
                <React.Fragment key={e.key}>
                  {showHeading && (
                    <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      {CATEGORY_LABELS[e.category] ?? e.category}
                    </div>
                  )}
                  <button
                    onClick={() =>
                      e.kind === "saved" ? openSaved(e.saved!) : openBuiltin(e.builtinType!)
                    }
                    className={listBtnCls(isActive(e))}
                    title={e.description || e.name}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`shrink-0 px-1 text-[9px] font-semibold uppercase border rounded-none ${
                          e.kind === "saved"
                            ? "border-brand text-brand"
                            : "border-neutral-300 dark:border-neutral-600 text-neutral-500"
                        }`}
                      >
                        {e.kind === "saved" ? "Custom" : "Built-in"}
                      </span>
                      <span className="truncate">{e.name}</span>
                      {e.edited && (
                        <span className="shrink-0 text-[10px] text-brand">• edited</span>
                      )}
                    </span>
                    {roomy && (
                      <span className="block truncate text-[11px] font-normal text-neutral-500 dark:text-neutral-400">
                        {equipmentTypesLabel(e.equipment)} ·{" "}
                        {e.kind === "saved" ? e.typeName : CATEGORY_LABELS[e.category] ?? e.category}
                        {e.updatedAt &&
                          ` · updated ${new Date(e.updatedAt).toLocaleDateString()}`}
                        {e.kind === "builtin" && e.description && ` · ${e.description}`}
                      </span>
                    )}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Drag to widen; double-click resets */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize component list"
          tabIndex={0}
          onPointerDown={(e) => {
            e.preventDefault();
            listPanel.startResize(listRef.current?.getBoundingClientRect().left ?? 0);
          }}
          onDoubleClick={listPanel.resetWidth}
          onKeyDown={listPanel.onHandleKeyDown}
          className={`absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize hover:bg-brand/40 focus:bg-brand/40 focus:outline-none ${
            listPanel.isResizing ? "bg-brand/50" : ""
          }`}
          title="Drag to resize (double-click to reset)"
        />
      </aside>
      )}

      {/* Editor + preview */}
      <main className="flex-1 min-w-0 flex flex-col">
        {aiOpen && (
          <div className="px-4 py-3 border-b border-brand/40 bg-brand/5 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand" />
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                Describe the component
              </span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Uses AI (billed per run).
              </span>
              <button
                type="button"
                onClick={() => setAiOpen(false)}
                className="ml-auto p-1 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {aiBusy && (
              <AiProgress
                steps={[{ id: "drafting", label: "AI is building the component", expectedSeconds: 25 }]}
                current="drafting"
                startedAt={aiStartedAt}
              />
            )}
            <textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              disabled={aiBusy}
              rows={3}
              autoFocus
              placeholder="e.g. Insulation resistance table with columns Phase, Test Voltage (kV), 1 Min (MΩ), 10 Min (MΩ) and a calculated PI column; rows A-B, B-C, C-A"
              className="w-full px-2 py-1.5 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => generateFromDescription("new")}
                disabled={aiBusy || !aiText.trim()}
                className="bg-brand hover:bg-brand-dark"
              >
                {aiBusy ? "Building…" : "Create new component"}
              </Button>
              {draft && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateFromDescription("current")}
                  disabled={aiBusy || !aiText.trim()}
                >
                  Change the open component instead
                </Button>
              )}
            </div>
          </div>
        )}
        {!draft ? (
          <div className="flex-1 flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400 p-6 text-center">
            Pick a component on the left, create a new one, or describe one for AI to build.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-neutral-200 dark:border-dark-200 bg-white dark:bg-dark-150">
              {selection?.kind === "builtin" ? (
                <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
                  {name}
                </h1>
              ) : (
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="Component name"
                  className="h-8 w-72 px-2 text-base font-semibold bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white"
                />
              )}
              <span className="text-xs px-2 py-0.5 rounded-none bg-neutral-100 dark:bg-dark-100 text-neutral-600 dark:text-neutral-300">
                {selection?.kind === "builtin" ? "Built-in" : "Custom"} ·{" "}
                {typeName}
              </span>
              <label className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
                Equipment
                <EquipmentTypePicker
                  value={equipmentTypesOf(draft)}
                  options={equipmentOptions}
                  onChange={(equipmentTypes) => updateDraft({ equipmentTypes })}
                  onManage={() => setEquipmentDialogOpen(true)}
                />
              </label>
              {selection?.kind !== "builtin" && (
                <label className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
                  Category
                  <select
                    value={
                      draft.libraryCategory ??
                      getComponentDefinition(draft.componentType)?.category ??
                      "other"
                    }
                    onChange={(e) => updateDraft({ libraryCategory: e.target.value })}
                    title="Where this component is grouped in the component lists"
                    className="h-7 px-1 text-xs bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none text-neutral-900 dark:text-white"
                  >
                    {CATEGORY_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {isDirty && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Unsaved changes
                </span>
              )}

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditorOpen(true)}
                  title="Every setting, including conditional rows and copied values"
                  leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
                >
                  All settings
                </Button>
                {!showPreview && <TableLayoutEditor section={draft} onUpdate={updateDraft} compact />}
                <Button
                  variant={showPreview ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setShowPreview((v) => !v)}
                  className={showPreview ? "bg-brand hover:bg-brand-dark" : ""}
                  title={showPreview ? "Back to editing" : "See it as it will look on the form"}
                  leftIcon={
                    showPreview ? (
                      <PencilLine className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )
                  }
                >
                  {showPreview ? "Edit" : "Preview"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startNew(draft.componentType, draft)}
                  title="Copy into a new custom component"
                  leftIcon={<Copy className="w-3.5 h-3.5" />}
                >
                  Duplicate
                </Button>
                {selection?.kind === "new" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDiscardDraft}
                    className="text-red-600 hover:text-red-700 hover:border-red-300 dark:text-red-400"
                    title="Throw away this new component without saving it"
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    Discard draft
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDiscardChanges}
                    disabled={!isDirty}
                    title="Go back to the last saved version"
                    leftIcon={<Undo2 className="w-3.5 h-3.5" />}
                  >
                    Discard changes
                  </Button>
                )}
                {selection?.kind === "saved" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    className="text-red-600 hover:text-red-700 hover:border-red-300 dark:text-red-400"
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    Delete
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!canSave}
                  className="bg-brand hover:bg-brand-dark"
                  leftIcon={<Save className="w-3.5 h-3.5" />}
                >
                  {saving
                    ? "Saving…"
                    : selection?.kind === "builtin"
                      ? "Save as default"
                      : "Save"}
                </Button>
              </div>
            </div>

            {selection?.kind === "builtin" && (!isAdmin || isProtected) && (
              <div className="px-4 py-2 text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border-b border-amber-200 dark:border-amber-800">
                {isProtected
                  ? "This built-in stays blank on purpose. Use Duplicate to make your own version."
                  : "Only admins can change built-in defaults. Use Duplicate to make your own version."}
              </div>
            )}

            {/* Rest on a cell or field for a second to see its formula reference.
                On a variant tab the numbering follows that variant's columns. */}
            <FormulaRefHover
              className="flex-1 overflow-auto p-6"
              sections={[
                variantTab
                  ? applyVariant(draft, variantsOf(draft).find((v) => v.id === variantTab))
                  : draft,
              ]}
            >
              <div className="max-w-6xl mx-auto bg-white dark:bg-dark-150 border border-neutral-200 dark:border-dark-200 rounded-none p-4">
                {showPreview ? (
                  // On a variant tab, the preview is that variant.
                  <>
                    <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-2 border-b border-neutral-200 dark:border-neutral-600 pb-1">
                      {draft.title}
                      {variantTab && (
                        <span className="ml-2 text-xs font-normal text-brand">
                          {variantsOf(draft).find((v) => v.id === variantTab)?.name}
                        </span>
                      )}
                    </div>
                    <SectionContent
                      section={
                        variantTab
                          ? applyVariant(draft, variantsOf(draft).find((v) => v.id === variantTab))
                          : draft
                      }
                    />
                  </>
                ) : (
                  <ComponentVariantsPanel
                    section={draft}
                    onUpdate={updateDraft}
                    activeId={variantTab}
                    onActiveChange={setVariantTab}
                  >
                    <LiveComponentEditor section={draft} onUpdate={updateDraft} />
                  </ComponentVariantsPanel>
                )}
              </div>
            </FormulaRefHover>
          </>
        )}
      </main>

      <EquipmentTypesDialog
        open={equipmentDialogOpen}
        onClose={() => setEquipmentDialogOpen(false)}
        onChanged={(list) => {
          setEquipmentOptions(list);
          // Renames and removals re-tag saved components; show the new tags.
          load();
        }}
      />
      {editorOpen && draft && (
        <SectionEditor
          section={draft}
          allSections={[draft]}
          onUpdate={updateDraft}
          onClose={() => setEditorOpen(false)}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
};

export default ComponentEditor;
