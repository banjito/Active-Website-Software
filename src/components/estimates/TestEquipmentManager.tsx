import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Edit, Plus, RotateCcw, Save, Trash, Wrench, X } from "lucide-react";
import { Button } from "../ui/Button";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import {
  archiveEstimatingTestEquipment,
  createEstimatingTestEquipment,
  EstimatingTestEquipment,
  getEstimatingTestEquipment,
  updateEstimatingTestEquipment,
} from "../../services/estimatingScopeLibraryService";

interface TestEquipmentManagerProps {
  userId?: string;
  onEquipmentChanged?: () => void;
}

type EquipmentFormState = {
  name: string;
  description: string;
};

const EMPTY_FORM: EquipmentFormState = {
  name: "",
  description: "",
};

export const TestEquipmentManager: React.FC<TestEquipmentManagerProps> = ({
  userId,
  onEquipmentChanged,
}) => {
  const [equipment, setEquipment] = useState<EstimatingTestEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingEquipment, setEditingEquipment] =
    useState<EstimatingTestEquipment | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<EquipmentFormState>(EMPTY_FORM);

  const loadEquipment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEstimatingTestEquipment(includeInactive);
      setEquipment(data);
    } catch (err: any) {
      console.error("Error loading test equipment:", err);
      setError(err?.message || "Failed to load test equipment.");
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    loadEquipment();
  }, [loadEquipment]);

  const filteredEquipment = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return equipment;

    return equipment.filter((item) =>
      [item.name, item.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [equipment, searchQuery]);

  const clearMessages = () => {
    setError(null);
    setSuccessMessage(null);
  };

  const startCreate = () => {
    clearMessages();
    setEditingEquipment(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const startEdit = (item: EstimatingTestEquipment) => {
    clearMessages();
    setEditingEquipment(item);
    setForm({
      name: item.name,
      description: item.description || "",
    });
    setIsFormOpen(true);
  };

  const cancelForm = () => {
    setEditingEquipment(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Test equipment name is required.");
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      if (editingEquipment) {
        await updateEstimatingTestEquipment(
          editingEquipment.id,
          {
            name: form.name,
            description: form.description,
          },
          userId,
        );
        setSuccessMessage("Test equipment updated.");
      } else {
        await createEstimatingTestEquipment(
          {
            name: form.name,
            description: form.description,
          },
          userId,
        );
        setSuccessMessage("Test equipment added.");
      }

      cancelForm();
      await loadEquipment();
      onEquipmentChanged?.();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error("Error saving test equipment:", err);
      setError(err?.message || "Failed to save test equipment.");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (item: EstimatingTestEquipment) => {
    if (
      !window.confirm(
        `Archive test equipment "${item.name}"? Existing library item associations will remain for historical reference.`,
      )
    ) {
      return;
    }

    clearMessages();
    try {
      await archiveEstimatingTestEquipment(item.id, userId);
      setSuccessMessage("Test equipment archived.");
      await loadEquipment();
      onEquipmentChanged?.();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error("Error archiving test equipment:", err);
      setError(err?.message || "Failed to archive test equipment.");
    }
  };

  const handleRestore = async (item: EstimatingTestEquipment) => {
    clearMessages();
    try {
      await updateEstimatingTestEquipment(item.id, { is_active: true }, userId);
      setSuccessMessage("Test equipment restored.");
      await loadEquipment();
      onEquipmentChanged?.();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error("Error restoring test equipment:", err);
      setError(err?.message || "Failed to restore test equipment.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Wrench className="h-5 w-5 text-brand" />
              Test Equipment
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400 max-w-3xl">
              Maintain the equipment list that can be attached to scope library
              items. This does not currently import into an estimate row, but it
              preserves the data needed for future internal equipment reports.
            </p>
          </div>
          <Button
            onClick={startCreate}
            size="sm"
            className="bg-brand text-white hover:bg-brand-dark shrink-0"
            leftIcon={<Plus className="h-4 w-4 mr-1" />}
          >
            New Equipment
          </Button>
        </div>

        <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search equipment..."
            className="flex-1 px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
          />
          <label className="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-brand focus:ring-brand"
            />
            Show archived
          </label>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-none p-3 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-none p-3 text-sm text-green-700 dark:text-green-300">
            {successMessage}
          </div>
        )}
      </div>

      {isFormOpen && (
        <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              {editingEquipment ? "Edit Test Equipment" : "New Test Equipment"}
            </h3>
            <button
              onClick={cancelForm}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
              aria-label="Cancel equipment form"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Equipment Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Doble F6150"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Description / Notes
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Optional internal note"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={cancelForm} variant="outline" size="sm">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.name.trim() || saving}
              isLoading={saving}
              size="sm"
              className="bg-brand text-white hover:bg-brand-dark"
            >
              <Save className="h-4 w-4 mr-1" />
              {editingEquipment ? "Save Changes" : "Add Equipment"}
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="md" />
          </div>
        ) : filteredEquipment.length === 0 ? (
          <div className="text-center text-neutral-500 dark:text-neutral-400 py-12 px-4">
            {equipment.length === 0
              ? 'No test equipment yet. Click "New Equipment" to create one.'
              : "No test equipment matches your search."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 text-sm">
              <thead className="bg-neutral-50 dark:bg-dark-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                    Equipment
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                    Description
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
                {filteredEquipment.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-neutral-50 dark:hover:bg-dark-100"
                  >
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                      {item.name}
                    </td>
                    <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">
                      {item.description || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-none px-2 py-1 text-xs font-medium ${
                          item.is_active
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                        }`}
                      >
                        {item.is_active ? "Active" : "Archived"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => startEdit(item)}
                          className="text-neutral-500 hover:text-brand transition-colors"
                          title="Edit equipment"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        {item.is_active ? (
                          <button
                            onClick={() => handleArchive(item)}
                            className="text-neutral-500 hover:text-red-600 transition-colors"
                            title="Archive equipment"
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRestore(item)}
                            className="text-neutral-500 hover:text-green-600 transition-colors"
                            title="Restore equipment"
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

export default TestEquipmentManager;
