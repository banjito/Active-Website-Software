import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/Button";
import { SearchFilters } from "./GlobalSearchBar";

export interface SearchFilterPanelProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  onClose: () => void;
}

// Available entity types in the system
const ENTITY_TYPES = [
  { id: "customers", label: "Customers" },
  { id: "contacts", label: "Contacts" },
  { id: "jobs", label: "Jobs" },
  { id: "opportunities", label: "Opportunities" },
  { id: "assets", label: "Assets" },
  { id: "reports", label: "Reports" },
];

// Available divisions in the system
const DIVISIONS = [
  { id: "north_alabama", label: "Decatur" },
  { id: "tennessee", label: "Nashville" },
  { id: "georgia", label: "Atlanta" },
  { id: "international", label: "International" },
  { id: "calibration", label: "Calibration" },
  { id: "armadillo", label: "Armadillo" },
  { id: "scavenger", label: "Scavenger" },
  { id: "sales", label: "Sales" },
  { id: "engineering", label: "Engineering" },
  { id: "office_admin", label: "Office Admin" },
];

export const SearchFilterPanel: React.FC<SearchFilterPanelProps> = ({
  filters,
  onChange,
  onClose,
}) => {
  const [localFilters, setLocalFilters] = useState<SearchFilters>({
    ...filters,
  });

  // Handle mode toggle
  const toggleAdvancedMode = () => {
    setLocalFilters((prev) => ({
      ...prev,
      advancedMode: !prev.advancedMode,
    }));
  };

  // Handle entity type selection
  const toggleEntityType = (entityId: string) => {
    setLocalFilters((prev) => {
      const currentEntityTypes = prev.entityTypes || [];
      const isSelected = currentEntityTypes.includes(entityId);

      const newEntityTypes = isSelected
        ? currentEntityTypes.filter((id) => id !== entityId)
        : [...currentEntityTypes, entityId];

      return {
        ...prev,
        entityTypes: newEntityTypes,
      };
    });
  };

  // Handle division selection
  const toggleDivision = (divisionId: string) => {
    setLocalFilters((prev) => {
      const currentDivisions = prev.divisions || [];
      const isSelected = currentDivisions.includes(divisionId);

      const newDivisions = isSelected
        ? currentDivisions.filter((id) => id !== divisionId)
        : [...currentDivisions, divisionId];

      return {
        ...prev,
        divisions: newDivisions,
      };
    });
  };

  // Apply filters when user clicks the apply button
  const applyFilters = () => {
    onChange(localFilters);
  };

  // Reset filters to default state
  const resetFilters = () => {
    const resetFilters = {
      entityTypes: [],
      divisions: [],
      advancedMode: false,
    };
    setLocalFilters(resetFilters);
    onChange(resetFilters);
  };

  // Apply filters whenever they change
  useEffect(() => {
    applyFilters();
  }, [localFilters]);

  return (
    <div className="absolute z-10 top-full mt-1 w-full bg-white dark:bg-dark-150 shadow-lg rounded-none border border-neutral-200 dark:border-dark-300">
      <div className="flex items-center justify-between p-3 border-b border-neutral-200 dark:border-dark-300">
        <h3 className="font-medium text-neutral-900 dark:text-white">
          Search Filters
        </h3>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="text-neutral-500 hover:text-neutral-700 dark:text-dark-400 dark:hover:text-dark-300"
          >
            Reset
          </Button>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-700 dark:text-dark-400 dark:hover:text-dark-300"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-4">
        {/* Mode Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-neutral-700 dark:text-dark-300">
            Advanced Search Mode
          </span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={localFilters.advancedMode}
              onChange={toggleAdvancedMode}
            />
            <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-none peer dark:bg-dark-400 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-none after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-[#f26722]"></div>
          </label>
        </div>

        {/* Entity Types */}
        <div>
          <h4 className="text-sm font-medium text-neutral-700 dark:text-dark-300 mb-2">
            Entity Types
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {ENTITY_TYPES.map((entity) => (
              <div key={entity.id} className="flex items-center">
                <input
                  type="checkbox"
                  id={`entity-${entity.id}`}
                  checked={localFilters.entityTypes.includes(entity.id)}
                  onChange={() => toggleEntityType(entity.id)}
                  className="w-4 h-4 text-[#f26722] bg-neutral-100 border-neutral-300 rounded focus:ring-[#f26722] dark:focus:ring-[#f26722] dark:ring-offset-neutral-800 focus:ring-2 dark:bg-dark-400 dark:border-dark-500"
                />
                <label
                  htmlFor={`entity-${entity.id}`}
                  className="ml-2 text-sm font-medium text-neutral-900 dark:text-dark-200"
                >
                  {entity.label}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Divisions */}
        <div>
          <h4 className="text-sm font-medium text-neutral-700 dark:text-dark-300 mb-2">
            Divisions
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {DIVISIONS.map((division) => (
              <div key={division.id} className="flex items-center">
                <input
                  type="checkbox"
                  id={`division-${division.id}`}
                  checked={localFilters.divisions.includes(division.id)}
                  onChange={() => toggleDivision(division.id)}
                  className="w-4 h-4 text-[#f26722] bg-neutral-100 border-neutral-300 rounded focus:ring-[#f26722] dark:focus:ring-[#f26722] dark:ring-offset-neutral-800 focus:ring-2 dark:bg-dark-400 dark:border-dark-500"
                />
                <label
                  htmlFor={`division-${division.id}`}
                  className="ml-2 text-sm font-medium text-neutral-900 dark:text-dark-200"
                >
                  {division.label}
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchFilterPanel;
