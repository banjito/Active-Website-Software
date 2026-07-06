import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatLocalDateShort } from "@/utils/dateUtils";

interface FieldEquipment {
  id: string;
  equipment_name: string;
  amp_id: string | null;
  serial_number: string | null;
  calibration_date: string | null;
  calibration_due_date: string | null;
}

interface EquipmentAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (equipment: FieldEquipment) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Optional: exclude these field_equipment ids from the dropdown. Omit to allow the same equipment in multiple slots (e.g. one device for Megohmmeter and Hipot). */
  excludeEquipmentIds?: string[];
}

export const EquipmentAutocomplete: React.FC<EquipmentAutocompleteProps> = ({
  value,
  onChange,
  onSelect,
  placeholder = "Type equipment name...",
  className = "",
  disabled = false,
  readOnly = false,
  excludeEquipmentIds,
}) => {
  const [suggestions, setSuggestions] = useState<FieldEquipment[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const justSelectedRef = useRef(false);
  // Suppress the search effect for one searchQuery change right after a
  // selection, so setting the input to the chosen name doesn't reopen the list.
  const suppressSearchRef = useRef(false);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Calculate dropdown position relative to viewport
  const updateDropdownPosition = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + 2,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, []);

  // Sync searchQuery with value prop. Skip clearing when value is empty right after onSelect so parent's stale render doesn't wipe the displayed name.
  useEffect(() => {
    const next = value ?? "";
    if (next === "" && justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    setSearchQuery(next);
  }, [value]);

  // Clear suggestions when readOnly changes to true
  useEffect(() => {
    if (readOnly) {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [readOnly]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        // Also check if click is inside the portal dropdown
        const dropdown = document.getElementById(
          "equipment-autocomplete-portal",
        );
        if (dropdown && dropdown.contains(event.target as Node)) return;
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Recalculate dropdown position on scroll/resize when open
  useEffect(() => {
    if (!showSuggestions) return;
    updateDropdownPosition();
    const handleReposition = () => updateDropdownPosition();
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [showSuggestions, updateDropdownPosition]);

  // Search equipment as user types
  useEffect(() => {
    // Don't search if readOnly is true
    if (readOnly) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Skip the search that would otherwise fire from setting the input to the
    // just-selected equipment name (which would reopen the dropdown).
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      setShowSuggestions(false);
      return;
    }

    if (!searchQuery || searchQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const searchEquipment = async () => {
      setLoading(true);
      try {
        const like = `%${searchQuery.toLowerCase()}%`;
        const { data, error } = await supabase
          .schema("neta_ops")
          .from("field_equipment")
          .select(
            "id, equipment_name, amp_id, serial_number, calibration_date, calibration_due_date",
          )
          .or(
            `equipment_name.ilike.${like},amp_id.ilike.${like},serial_number.ilike.${like}`,
          )
          .limit(10)
          .order("equipment_name", { ascending: true });

        if (error) throw error;
        let list = (data || []) as FieldEquipment[];
        if (excludeEquipmentIds?.length) {
          list = list.filter((e) => !excludeEquipmentIds.includes(e.id));
        }
        setSuggestions(list);
        setShowSuggestions(true);
      } catch (error) {
        console.error("Error searching equipment:", error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(searchEquipment, 300); // Debounce
    return () => clearTimeout(timer);
  }, [searchQuery, readOnly, excludeEquipmentIds]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const newValue = e.target.value;
    setSearchQuery(newValue);
    onChange(newValue);
    if (newValue.length >= 2) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectEquipment = (equipment: FieldEquipment) => {
    justSelectedRef.current = true;
    suppressSearchRef.current = true;
    setSearchQuery(equipment.equipment_name);
    onChange(equipment.equipment_name);
    setShowSuggestions(false);
    if (onSelect) {
      onSelect(equipment);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400 print:hidden" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={() => {
            if (!readOnly && suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled || readOnly}
          readOnly={readOnly}
          autoComplete="off"
          spellCheck={false}
          className={`w-full pl-10 print:pl-2 pr-10 print:pr-2 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-100 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722] ${readOnly ? "bg-neutral-100 dark:bg-dark-150 cursor-not-allowed" : ""}`}
        />
        {searchQuery && !readOnly && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              onChange("");
              setShowSuggestions(false);
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 print:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showSuggestions &&
        suggestions.length > 0 &&
        !readOnly &&
        dropdownPos &&
        createPortal(
          <div
            id="equipment-autocomplete-portal"
            style={{
              position: "absolute",
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              zIndex: 99999,
            }}
            className="bg-white dark:bg-dark-150 border border-neutral-200 dark:border-dark-200 rounded-none shadow-lg max-h-60 overflow-y-auto"
          >
            {loading && (
              <div className="p-3 text-center text-sm text-neutral-500 dark:text-neutral-400">
                Searching...
              </div>
            )}
            {!loading &&
              suggestions.map((equipment) => (
                <div
                  key={equipment.id}
                  onClick={() => handleSelectEquipment(equipment)}
                  className="px-3 py-2 hover:bg-neutral-100 dark:hover:bg-dark-100 cursor-pointer border-b border-neutral-100 dark:border-dark-200 last:border-b-0"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-neutral-900 dark:text-white">
                        {equipment.equipment_name}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 space-y-0.5">
                        {equipment.amp_id && (
                          <div>AMP ID: {equipment.amp_id}</div>
                        )}
                        {equipment.serial_number && (
                          <div>Serial: {equipment.serial_number}</div>
                        )}
                        {equipment.calibration_date && (
                          <div>
                            Cal Date:{" "}
                            {formatLocalDateShort(equipment.calibration_date)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>,
          document.body,
        )}
    </div>
  );
};
