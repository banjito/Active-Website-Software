import React, { useEffect, useMemo, useState } from "react";
import {
  PlusCircle,
  Edit2,
  Trash2,
  GripVertical,
  Search,
  ChevronLeft,
  ExternalLink,
  ArrowUpRight,
  Check,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  ShortcutService,
  Shortcut,
  MAX_SHORTCUTS,
} from "@/services/ShortcutService";
import { BUILTIN_PORTALS } from "@/components/shortcuts/builtins";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface ShortcutsDropdownProps {
  onNavigate: (url: string) => void;
}

type View = "list" | "form" | "quick";

interface FormData {
  title: string;
  url: string;
}

const SortableRow: React.FC<{
  shortcut: Shortcut;
  onNavigate: (url: string) => void;
  onEdit: (s: Shortcut) => void;
  onDelete: (id: string) => void;
}> = ({ shortcut, onNavigate, onEdit, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: shortcut.id!,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isExternal = shortcut.url.startsWith("http");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 rounded-lg pl-1 pr-1.5 ${
        isDragging
          ? "bg-orange-50 dark:bg-[#f26722]/10 ring-1 ring-[#f26722]/40 shadow-md z-50"
          : "hover:bg-neutral-50 dark:hover:bg-dark-200"
      } transition-colors`}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-neutral-300 hover:text-[#f26722] dark:text-neutral-600 dark:hover:text-[#f26722] active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => onNavigate(shortcut.url)}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
        title={shortcut.url}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
            {shortcut.title}
          </span>
          <span className="block truncate text-[11px] leading-tight text-neutral-400 dark:text-neutral-500">
            {shortcut.url}
          </span>
        </span>
        {isExternal ? (
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-300 dark:text-neutral-600" />
        ) : (
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-neutral-300 dark:text-neutral-600" />
        )}
      </button>

      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          aria-label={`Edit ${shortcut.title}`}
          onClick={() => onEdit(shortcut)}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-dark-100 dark:hover:text-neutral-200"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${shortcut.title}`}
          onClick={() => onDelete(shortcut.id!)}
          className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export const ShortcutsDropdown: React.FC<ShortcutsDropdownProps> = ({
  onNavigate,
}) => {
  const { user } = useAuth();
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");

  // Form (add/edit)
  const [formData, setFormData] = useState<FormData>({ title: "", url: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [useBuiltin, setUseBuiltin] = useState(true);
  const [selectedPortal, setSelectedPortal] = useState("sales");
  const [selectedOption, setSelectedOption] = useState("");

  // Quick add
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQuick, setSelectedQuick] = useState<Record<string, boolean>>(
    {},
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const loadShortcuts = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const data = await ShortcutService.getUserShortcuts(user.id);
      setShortcuts(data);
    } catch (err) {
      console.error("Error loading shortcuts:", err);
      setError("Failed to load shortcuts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShortcuts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const atMax = shortcuts.length >= MAX_SHORTCUTS;

  const openAdd = () => {
    setFormData({ title: "", url: "" });
    setEditingId(null);
    setUseBuiltin(true);
    setSelectedPortal("sales");
    setSelectedOption(
      BUILTIN_PORTALS.find((p) => p.key === "sales")?.options[0]?.path || "",
    );
    setError(null);
    setView("form");
  };

  const openEdit = (s: Shortcut) => {
    setFormData({ title: s.title, url: s.url });
    setEditingId(s.id!);
    setUseBuiltin(false);
    setError(null);
    setView("form");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!editingId && atMax) {
      setError(`You can have at most ${MAX_SHORTCUTS} shortcuts.`);
      return;
    }

    const payload = useBuiltin
      ? selectedOption
        ? {
            title:
              BUILTIN_PORTALS.find(
                (p) => p.key === selectedPortal,
              )?.options.find((o) => o.path === selectedOption)?.label ||
              "Shortcut",
            url: selectedOption,
          }
        : {
            title:
              BUILTIN_PORTALS.find((p) => p.key === selectedPortal)?.label ||
              "Portal",
            url: `portal:${selectedPortal}`,
          }
      : formData;

    try {
      setLoading(true);
      setError(null);
      if (editingId) {
        await ShortcutService.updateShortcut(editingId, payload);
      } else {
        await ShortcutService.createShortcut({ user_id: user.id, ...payload });
      }
      await loadShortcuts();
      setView("list");
    } catch (err) {
      console.error("Error saving shortcut:", err);
      setError("Failed to save shortcut.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this shortcut?")) return;
    try {
      setLoading(true);
      setError(null);
      await ShortcutService.deleteShortcut(id);
      await loadShortcuts();
    } catch (err) {
      console.error("Error deleting shortcut:", err);
      setError("Failed to delete shortcut.");
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !user || active.id === over.id) return;
    setShortcuts((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return items;
      const next = arrayMove(items, oldIndex, newIndex);
      ShortcutService.reorderShortcuts(
        user.id,
        next.map((i) => i.id!),
      ).catch((err) => {
        console.error("Error reordering:", err);
        setError("Failed to save new order.");
        loadShortcuts();
      });
      return next;
    });
  };

  const quickAddItems = useMemo(() => {
    const items: Array<{ key: string; label: string; path: string }> = [];
    BUILTIN_PORTALS.forEach((p) => {
      p.options.forEach((opt) => {
        const l = opt.label.toLowerCase();
        if (
          l.includes("drag to reorder") ||
          l.includes("reorder your shortcuts")
        )
          return;
        items.push({
          key: `${p.key}:${opt.path}`,
          label: `${p.label} • ${opt.label}`,
          path: opt.path,
        });
      });
    });
    return items.filter((it) =>
      it.label.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery]);

  const selectedQuickCount =
    Object.values(selectedQuick).filter(Boolean).length;

  const handleQuickAdd = async () => {
    if (!user) return;
    const chosen = quickAddItems.filter((it) => selectedQuick[it.key]);
    if (!chosen.length) {
      setView("list");
      return;
    }
    const slotsLeft = MAX_SHORTCUTS - shortcuts.length;
    if (slotsLeft <= 0) {
      setError(`You can have at most ${MAX_SHORTCUTS} shortcuts.`);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await ShortcutService.bulkCreateShortcuts(
        user.id,
        chosen
          .slice(0, slotsLeft)
          .map((c) => ({ title: c.label, url: c.path })),
      );
    } finally {
      setLoading(false);
      setSelectedQuick({});
      setSearchQuery("");
      await loadShortcuts();
      setView("list");
    }
  };

  const headerTitle =
    view === "list"
      ? "Shortcuts"
      : view === "quick"
        ? "Quick Add"
        : editingId
          ? "Edit Shortcut"
          : "Add Shortcut";

  return (
    <div className="flex max-h-[32rem] w-80 flex-col overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/5 dark:bg-dark-150 dark:ring-white/10">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-100 px-3 py-2.5 dark:border-dark-200">
        {view !== "list" && (
          <button
            type="button"
            aria-label="Back"
            onClick={() => {
              setView("list");
              setError(null);
              setSelectedQuick({});
              setSearchQuery("");
            }}
            className="-ml-1 rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-dark-200"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <span className="flex-1 text-sm font-semibold text-neutral-900 dark:text-white">
          {headerTitle}
        </span>
        {view === "list" && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-dark-200 dark:text-neutral-400">
            {shortcuts.length}/{MAX_SHORTCUTS}
          </span>
        )}
        {view === "quick" && selectedQuickCount > 0 && (
          <span className="rounded-full bg-[#f26722]/10 px-2 py-0.5 text-[11px] font-medium text-[#f26722]">
            {selectedQuickCount} selected
          </span>
        )}
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "list" && (
          <div className="p-1.5">
            {loading && shortcuts.length === 0 ? (
              <div className="flex justify-center py-10">
                <LoadingSpinner size="xs" />
              </div>
            ) : shortcuts.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  No shortcuts yet
                </p>
                <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                  Add shortcuts to jump to your favorite pages.
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={shortcuts.map((s) => s.id!)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-0.5">
                    {shortcuts.map((s) => (
                      <SortableRow
                        key={s.id}
                        shortcut={s}
                        onNavigate={onNavigate}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        )}

        {view === "form" && (
          <form onSubmit={handleSave} className="space-y-3 p-3">
            {!editingId && (
              <div className="flex rounded-lg bg-neutral-100 p-0.5 text-xs font-medium dark:bg-dark-200">
                <button
                  type="button"
                  onClick={() => setUseBuiltin(true)}
                  className={`flex-1 rounded-md px-2 py-1.5 transition-colors ${
                    useBuiltin
                      ? "bg-white text-neutral-900 shadow-sm dark:bg-dark-100 dark:text-white"
                      : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  Built-in page
                </button>
                <button
                  type="button"
                  onClick={() => setUseBuiltin(false)}
                  className={`flex-1 rounded-md px-2 py-1.5 transition-colors ${
                    !useBuiltin
                      ? "bg-white text-neutral-900 shadow-sm dark:bg-dark-100 dark:text-white"
                      : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  Custom URL
                </button>
              </div>
            )}

            {useBuiltin && !editingId ? (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    Portal
                  </label>
                  <select
                    className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-sm focus:border-[#f26722] focus:outline-none focus:ring-1 focus:ring-[#f26722] dark:border-dark-200 dark:bg-dark-100 dark:text-white"
                    value={selectedPortal}
                    onChange={(e) => {
                      setSelectedPortal(e.target.value);
                      setSelectedOption(
                        BUILTIN_PORTALS.find(
                          (p) => p.key === (e.target.value as any),
                        )?.options[0]?.path || "",
                      );
                    }}
                  >
                    {BUILTIN_PORTALS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    Destination
                  </label>
                  <select
                    className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-sm focus:border-[#f26722] focus:outline-none focus:ring-1 focus:ring-[#f26722] dark:border-dark-200 dark:bg-dark-100 dark:text-white"
                    value={selectedOption}
                    onChange={(e) => setSelectedOption(e.target.value)}
                  >
                    <option value="">(Add as portal group)</option>
                    {BUILTIN_PORTALS.find(
                      (p) => p.key === (selectedPortal as any),
                    )?.options.map((opt) => (
                      <option key={opt.path} value={opt.path}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <label
                    className="text-xs font-medium text-neutral-600 dark:text-neutral-300"
                    htmlFor="sc-title"
                  >
                    Name
                  </label>
                  <input
                    id="sc-title"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, title: e.target.value }))
                    }
                    placeholder="My Shortcut"
                    required
                    className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-sm focus:border-[#f26722] focus:outline-none focus:ring-1 focus:ring-[#f26722] dark:border-dark-200 dark:bg-dark-100 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    className="text-xs font-medium text-neutral-600 dark:text-neutral-300"
                    htmlFor="sc-url"
                  >
                    URL or path
                  </label>
                  <input
                    id="sc-url"
                    value={formData.url}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, url: e.target.value }))
                    }
                    placeholder="/north_alabama/dashboard or https://…"
                    required
                    className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-sm focus:border-[#f26722] focus:outline-none focus:ring-1 focus:ring-[#f26722] dark:border-dark-200 dark:bg-dark-100 dark:text-white"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setView("list");
                  setError(null);
                }}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-dark-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#f26722] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#f26722]/90 disabled:opacity-50"
              >
                {loading ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-b-transparent" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {editingId ? "Save" : "Add"}
              </button>
            </div>
          </form>
        )}

        {view === "quick" && (
          <div>
            <div className="sticky top-0 z-10 bg-white p-2.5 dark:bg-dark-150">
              <div className="flex items-center gap-2 rounded-md border border-neutral-300 px-2.5 py-1.5 focus-within:border-[#f26722] focus-within:ring-1 focus-within:ring-[#f26722] dark:border-dark-200 dark:bg-dark-100">
                <Search className="h-4 w-4 shrink-0 text-neutral-400" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search pages…"
                  className="w-full bg-transparent text-sm focus:outline-none dark:text-white"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear"
                  >
                    <X className="h-3.5 w-3.5 text-neutral-400 hover:text-neutral-600" />
                  </button>
                )}
              </div>
            </div>
            {quickAddItems.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-400">
                No matches
              </div>
            ) : (
              <ul className="px-1.5 pb-1.5">
                {quickAddItems.map((it) => {
                  const checked = !!selectedQuick[it.key];
                  return (
                    <li key={it.key}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-neutral-50 dark:hover:bg-dark-200">
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked
                              ? "border-[#f26722] bg-[#f26722] text-white"
                              : "border-neutral-300 dark:border-dark-200"
                          }`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedQuick((p) => ({
                              ...p,
                              [it.key]: !p[it.key],
                            }))
                          }
                          className="sr-only"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-neutral-700 dark:text-neutral-200">
                          {it.label}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {view === "list" && (
        <div className="flex shrink-0 items-center gap-2 border-t border-neutral-100 p-2 dark:border-dark-200">
          <button
            type="button"
            onClick={() => {
              setSelectedQuick({});
              setSearchQuery("");
              setError(null);
              setView("quick");
            }}
            disabled={atMax}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-neutral-300 px-2 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-dark-200 dark:text-neutral-200 dark:hover:bg-dark-200"
          >
            <Search className="h-3.5 w-3.5" />
            Quick add
          </button>
          <button
            type="button"
            onClick={openAdd}
            disabled={atMax}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[#f26722] px-2 py-1.5 text-xs font-medium text-white hover:bg-[#f26722]/90 disabled:opacity-50"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add custom
          </button>
        </div>
      )}

      {view === "quick" && (
        <div className="flex shrink-0 justify-end gap-2 border-t border-neutral-100 p-2 dark:border-dark-200">
          <button
            type="button"
            onClick={() => {
              setView("list");
              setSelectedQuick({});
              setSearchQuery("");
            }}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-dark-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={loading || selectedQuickCount === 0}
            className="rounded-md bg-[#f26722] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#f26722]/90 disabled:opacity-50"
          >
            {loading
              ? "Adding…"
              : `Add${selectedQuickCount ? ` (${selectedQuickCount})` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
};

export default ShortcutsDropdown;
