import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Search, X } from "lucide-react";
import { Button } from "../ui/Button";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import {
  EstimatingScopeLibraryItem,
  getEstimatingScopeLibraryItems,
} from "../../services/estimatingScopeLibraryService";

interface ScopeLibraryPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (item: EstimatingScopeLibraryItem) => void;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const getSearchableText = (item: EstimatingScopeLibraryItem) =>
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

export const ScopeLibraryPickerModal: React.FC<
  ScopeLibraryPickerModalProps
> = ({ open, onClose, onSelect }) => {
  const [items, setItems] = useState<EstimatingScopeLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    const loadItems = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getEstimatingScopeLibraryItems(false);
        setItems(data);
      } catch (err: any) {
        console.error("Error loading scope item library:", err);
        setError(err?.message || "Failed to load scope item library.");
      } finally {
        setLoading(false);
      }
    };

    setSearchQuery("");
    loadItems();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    // Focus the search input once the modal is mounted.
    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => getSearchableText(item).includes(query));
  }, [items, searchQuery]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-[69]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-[70] bg-white dark:bg-dark-150 rounded-none shadow-xl w-full max-w-[90vw] mx-4 max-h-[85vh] flex flex-col border border-neutral-200 dark:border-neutral-700"
      >
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#f26722]" />
              Scope Item Library
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Select an item to populate this estimate row. You can still edit
              the row after importing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
            aria-label="Close scope item library"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 ml-2"
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by item, activity, notes, or equipment..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="md" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center text-neutral-500 dark:text-neutral-400 py-12">
              {items.length === 0
                ? "No scope library items have been created yet. Add items from Estimating Presets → Scope Item Library."
                : "No library items match your search."}
            </div>
          ) : (
            <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-700 rounded-none">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 text-sm">
                <thead className="bg-neutral-50 dark:bg-dark-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                      Action
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                      Item
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                      Activity
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-neutral-700 dark:text-neutral-200">
                      Material
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-neutral-700 dark:text-neutral-200">
                      Techs
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-neutral-700 dark:text-neutral-200">
                      Hours
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                      Estimate Notes
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                      Library Notes
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                      Test Equipment
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700 bg-white dark:bg-dark-150">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-orange-50 dark:hover:bg-dark-100 transition-colors cursor-pointer"
                      onDoubleClick={() => onSelect(item)}
                    >
                      <td className="px-3 py-3 align-top text-left whitespace-nowrap">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(item);
                          }}
                          size="sm"
                          className="bg-[#f26722] text-white hover:bg-[#d4551a]"
                        >
                          Use
                        </Button>
                      </td>
                      <td className="px-3 py-3 align-top font-medium text-neutral-900 dark:text-white min-w-[220px]">
                        {item.item_name}
                      </td>
                      <td className="px-3 py-3 align-top text-neutral-700 dark:text-neutral-300 min-w-[120px]">
                        {item.activity || "—"}
                      </td>
                      <td className="px-3 py-3 align-top text-right text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                        {formatCurrency(item.material_cost)}
                      </td>
                      <td className="px-3 py-3 align-top text-right text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                        {item.tech_count || 0}
                      </td>
                      <td className="px-3 py-3 align-top text-right text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                        {item.hours || 0}
                      </td>
                      <td className="px-3 py-3 align-top text-neutral-700 dark:text-neutral-300 min-w-[220px] max-w-[320px]">
                        {item.estimate_notes || "—"}
                      </td>
                      <td className="px-3 py-3 align-top text-neutral-700 dark:text-neutral-300 min-w-[220px] max-w-[320px]">
                        {item.library_notes || "—"}
                      </td>
                      <td className="px-3 py-3 align-top text-neutral-700 dark:text-neutral-300 min-w-[180px]">
                        {item.equipment && item.equipment.length > 0
                          ? item.equipment
                              .map((equipment) => equipment.name)
                              .join(", ")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ScopeLibraryPickerModal;
