import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Edit,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash,
  X,
} from "lucide-react";
import { Button } from "../ui/Button";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import {
  archiveEstimatingScopeLibraryItem,
  createEstimatingScopeLibraryItem,
  EstimatingScopeLibraryItem,
  EstimatingTestEquipment,
  getEstimatingScopeLibraryItems,
  getEstimatingTestEquipment,
  updateEstimatingScopeLibraryItem,
} from "../../services/estimatingScopeLibraryService";

interface ScopeLibraryManagerProps {
  userId?: string;
}

type ScopeLibraryFormState = {
  item_name: string;
  activity: string;
  material_cost: string;
  tech_count: string;
  hours: string;
  estimate_notes: string;
  library_notes: string;
  equipment_ids: string[];
};

const EMPTY_FORM: ScopeLibraryFormState = {
  item_name: "",
  activity: "",
  material_cost: "0",
  tech_count: "0",
  hours: "0",
  estimate_notes: "",
  library_notes: "",
  equipment_ids: [],
};

const COMMON_ACTIVITIES = [
  "Acceptance",
  "Maintenance",
  "Engineering",
  "Commissioning",
  "Troubleshooting",
  "Repair",
  "Inspection",
  "Training",
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const parseNumber = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getItemSearchText = (item: EstimatingScopeLibraryItem) =>
  [
    item.item_name,
    item.activity,
    item.estimate_notes,
    item.library_notes,
    ...(item.equipment || []).map((equipment) => equipment.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export const ScopeLibraryManager: React.FC<ScopeLibraryManagerProps> = ({
  userId,
}) => {
  const [items, setItems] = useState<EstimatingScopeLibraryItem[]>([]);
  const [equipment, setEquipment] = useState<EstimatingTestEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState("All");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] =
    useState<EstimatingScopeLibraryItem | null>(null);
  const [form, setForm] = useState<ScopeLibraryFormState>(EMPTY_FORM);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [libraryItems, equipmentItems] = await Promise.all([
        getEstimatingScopeLibraryItems(includeInactive),
        getEstimatingTestEquipment(true),
      ]);
      setItems(libraryItems);
      setEquipment(equipmentItems);
    } catch (err: any) {
      console.error("Error loading scope item library:", err);
      setError(err?.message || "Failed to load scope item library.");
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const activityOptions = useMemo(() => {
    const fromItems = items
      .map((item) => item.activity)
      .filter(Boolean) as string[];
    return Array.from(new Set([...COMMON_ACTIVITIES, ...fromItems])).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !query || getItemSearchText(item).includes(query);
      const matchesActivity =
        activityFilter === "All" || item.activity === activityFilter;
      return matchesSearch && matchesActivity;
    });
  }, [activityFilter, items, searchQuery]);

  const clearMessages = () => {
    setError(null);
    setSuccessMessage(null);
  };

  const startCreate = () => {
    clearMessages();
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const startEdit = (item: EstimatingScopeLibraryItem) => {
    clearMessages();
    setEditingItem(item);
    setForm({
      item_name: item.item_name,
      activity: item.activity || "",
      material_cost: String(item.material_cost ?? 0),
      tech_count: String(item.tech_count ?? 0),
      hours: String(item.hours ?? 0),
      estimate_notes: item.estimate_notes || "",
      library_notes: item.library_notes || "",
      equipment_ids: (item.equipment || []).map((equipmentItem) =>
        equipmentItem.id,
      ),
    });
    setIsFormOpen(true);
  };

  const cancelForm = () => {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(false);
  };

  const updateForm = <K extends keyof ScopeLibraryFormState>(
    field: K,
    value: ScopeLibraryFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleEquipment = (equipmentId: string) => {
    setForm((prev) => {
      const next = new Set(prev.equipment_ids);
      if (next.has(equipmentId)) {
        next.delete(equipmentId);
      } else {
        next.add(equipmentId);
      }
      return { ...prev, equipment_ids: Array.from(next) };
    });
  };

  const handleSave = async () => {
    if (!form.item_name.trim()) {
      setError("Item name is required.");
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      const payload = {
        item_name: form.item_name,
        activity: form.activity,
        material_cost: parseNumber(form.material_cost),
        tech_count: parseNumber(form.tech_count),
        hours: parseNumber(form.hours),
        estimate_notes: form.estimate_notes,
        library_notes: form.library_notes,
        equipment_ids: form.equipment_ids,
      };

      if (editingItem) {
        await updateEstimatingScopeLibraryItem(editingItem.id, payload, userId);
        setSuccessMessage("Scope library item updated.");
      } else {
        await createEstimatingScopeLibraryItem(payload, userId);
        setSuccessMessage("Scope library item added.");
      }

      cancelForm();
      await loadLibrary();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error("Error saving scope library item:", err);
      setError(err?.message || "Failed to save scope library item.");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (item: EstimatingScopeLibraryItem) => {
    if (
      !window.confirm(
        `Archive scope library item "${item.item_name}"? It will no longer show in estimate row searches.`,
      )
    ) {
      return;
    }

    clearMessages();
    try {
      await archiveEstimatingScopeLibraryItem(item.id, userId);
      setSuccessMessage("Scope library item archived.");
      await loadLibrary();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error("Error archiving scope library item:", err);
      setError(err?.message || "Failed to archive scope library item.");
    }
  };

  const handleRestore = async (item: EstimatingScopeLibraryItem) => {
    clearMessages();
    try {
      await updateEstimatingScopeLibraryItem(item.id, { is_active: true }, userId);
      setSuccessMessage("Scope library item restored.");
      await loadLibrary();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error("Error restoring scope library item:", err);
      setError(err?.message || "Failed to restore scope library item.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-dark-150 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#f26722]" />
              Scope Item Library
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400 max-w-3xl">
              Build reusable estimating knowledge for common scope items. Items
              can populate estimate rows with item name, material cost, techs,
              hours, and estimate notes while remaining fully editable in the
              estimate.
            </p>
          </div>
          <Button
            onClick={startCreate}
            size="sm"
            className="bg-[#f26722] text-white hover:bg-[#d4551a] shrink-0"
          >
            <Plus className="h-4 w-4 mr-1" />
            New Library Item
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_220px_auto] gap-3 lg:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items, notes, or equipment..."
              className="w-full pl-9 pr-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
            />
          </div>
          <select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
            className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
          >
            <option value="All">All activities</option>
            {activityOptions.map((activity) => (
              <option key={activity} value={activity}>
                {activity}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-[#f26722] focus:ring-[#f26722]"
            />
            Show archived
          </label>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-300">
            {successMessage}
          </div>
        )}
      </div>

      {isFormOpen && (
        <div className="bg-white dark:bg-dark-150 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              {editingItem ? "Edit Scope Library Item" : "New Scope Library Item"}
            </h3>
            <button
              onClick={cancelForm}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
              aria-label="Cancel scope library form"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Item Name
              </label>
              <input
                type="text"
                value={form.item_name}
                onChange={(e) => updateForm("item_name", e.target.value)}
                placeholder="e.g., Transformer Turns Ratio Test"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Activity
              </label>
              <input
                type="text"
                value={form.activity}
                onChange={(e) => updateForm("activity", e.target.value)}
                placeholder="e.g., Maintenance"
                list="scope-library-activity-options"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
              />
              <datalist id="scope-library-activity-options">
                {activityOptions.map((activity) => (
                  <option key={activity} value={activity} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Library-only classification; not imported into the estimate row.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Material Cost
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.material_cost}
                  onChange={(e) => updateForm("material_cost", e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  # Techs
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={form.tech_count}
                  onChange={(e) => updateForm("tech_count", e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  # Hours
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={form.hours}
                  onChange={(e) => updateForm("hours", e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Estimate Notes
              </label>
              <textarea
                value={form.estimate_notes}
                onChange={(e) => updateForm("estimate_notes", e.target.value)}
                rows={4}
                placeholder="Imported into the estimate row notes field."
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white resize-vertical"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Library Notes
              </label>
              <textarea
                value={form.library_notes}
                onChange={(e) => updateForm("library_notes", e.target.value)}
                rows={4}
                placeholder="Internal estimating guidance; not imported into the estimate."
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white resize-vertical"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Test Equipment
              </label>
              {equipment.length === 0 ? (
                <div className="rounded-md border border-dashed border-neutral-300 dark:border-neutral-600 p-4 text-sm text-neutral-500 dark:text-neutral-400">
                  No test equipment has been created yet. Add equipment in the
                  Test Equipment tab, then attach it here.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 rounded-md border border-neutral-200 dark:border-neutral-700 p-3 max-h-52 overflow-y-auto">
                  {equipment.map((equipmentItem) => (
                    <label
                      key={equipmentItem.id}
                      className="inline-flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300"
                    >
                      <input
                        type="checkbox"
                        checked={form.equipment_ids.includes(equipmentItem.id)}
                        onChange={() => toggleEquipment(equipmentItem.id)}
                        className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-[#f26722] focus:ring-[#f26722]"
                      />
                      <span>
                        {equipmentItem.name}
                        {!equipmentItem.is_active && (
                          <span className="ml-1 text-xs text-neutral-400">
                            (archived)
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={cancelForm} variant="outline" size="sm">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.item_name.trim() || saving}
              isLoading={saving}
              size="sm"
              className="bg-[#f26722] text-white hover:bg-[#d4551a]"
            >
              <Save className="h-4 w-4 mr-1" />
              {editingItem ? "Save Changes" : "Add Library Item"}
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-dark-150 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="md" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center text-neutral-500 dark:text-neutral-400 py-12 px-4">
            {items.length === 0
              ? 'No scope library items yet. Click "New Library Item" to create one.'
              : "No scope library items match your filters."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 text-sm">
              <thead className="bg-neutral-50 dark:bg-dark-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                    Item
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                    Activity
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-neutral-700 dark:text-neutral-200">
                    Material
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-neutral-700 dark:text-neutral-200">
                    Techs
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-neutral-700 dark:text-neutral-200">
                    Hours
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                    Notes
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                    Test Equipment
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-neutral-700 dark:text-neutral-200">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-dark-100">
                    <td className="px-4 py-3 align-top font-medium text-neutral-900 dark:text-white min-w-[220px]">
                      {item.item_name}
                    </td>
                    <td className="px-4 py-3 align-top text-neutral-700 dark:text-neutral-300 min-w-[120px]">
                      {item.activity || "—"}
                    </td>
                    <td className="px-4 py-3 align-top text-right text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      {formatCurrency(item.material_cost)}
                    </td>
                    <td className="px-4 py-3 align-top text-right text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      {item.tech_count || 0}
                    </td>
                    <td className="px-4 py-3 align-top text-right text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      {item.hours || 0}
                    </td>
                    <td className="px-4 py-3 align-top text-neutral-700 dark:text-neutral-300 min-w-[260px] max-w-[420px]">
                      <div>
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">
                          Estimate:
                        </span>{" "}
                        {item.estimate_notes || "—"}
                      </div>
                      <div className="mt-1 text-neutral-500 dark:text-neutral-400">
                        <span className="font-medium">Library:</span>{" "}
                        {item.library_notes || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-neutral-700 dark:text-neutral-300 min-w-[180px]">
                      {item.equipment && item.equipment.length > 0
                        ? item.equipment
                            .map((equipmentItem) => equipmentItem.name)
                            .join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          item.is_active
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                        }`}
                      >
                        {item.is_active ? "Active" : "Archived"}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => startEdit(item)}
                          className="text-neutral-500 hover:text-[#f26722] transition-colors"
                          title="Edit library item"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        {item.is_active ? (
                          <button
                            onClick={() => handleArchive(item)}
                            className="text-neutral-500 hover:text-red-600 transition-colors"
                            title="Archive library item"
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRestore(item)}
                            className="text-neutral-500 hover:text-green-600 transition-colors"
                            title="Restore library item"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScopeLibraryManager;
