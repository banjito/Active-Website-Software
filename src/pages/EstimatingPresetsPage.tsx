/**
 * Estimating Presets Page
 *
 * Allows users to view and modify company-wide default values used in estimates.
 * These presets pre-populate estimate forms with default values.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../lib/AuthContext";
import { usePermissions } from "../hooks/usePermissions";
import {
  getEstimatingPresets,
  updateEstimatingPresets,
  resetEstimatingPresets,
  EstimatingPresets,
  DEFAULT_ESTIMATING_PRESETS,
} from "../services/estimatingPresetsService";
import {
  Save,
  RotateCcw,
  Calculator,
  Truck,
  Plane,
  DollarSign,
  Users,
  Clock,
  AlertCircle,
  CheckCircle,
  BookOpen,
  Wrench,
  FileText,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import ScopeLibraryManager from "../components/estimates/ScopeLibraryManager";
import TestEquipmentManager from "../components/estimates/TestEquipmentManager";
import ProposalTemplateEditor from "../components/estimates/ProposalTemplateEditor";

// Input component for currency fields - moved outside to prevent recreation
const CurrencyInput: React.FC<{
  label: string;
  value: number;
  field: keyof EstimatingPresets;
  helpText?: string;
  onChange: (field: keyof EstimatingPresets, value: number) => void;
}> = React.memo(({ label, value, field, helpText, onChange }) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsedValue = parseFloat(e.target.value) || 0;
      onChange(field, parsedValue);
    },
    [field, onChange],
  );

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        {label}
      </label>
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-500 dark:text-neutral-400">
          $
        </span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={value || ""}
          onChange={handleChange}
          className="block w-full pl-8 pr-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm
                     focus:ring-[#f26722] focus:border-[#f26722]
                     bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
        />
      </div>
      {helpText && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {helpText}
        </p>
      )}
    </div>
  );
});

CurrencyInput.displayName = "CurrencyInput";

// Input component for number fields - moved outside to prevent recreation
const NumberInput: React.FC<{
  label: string;
  value: number;
  field: keyof EstimatingPresets;
  helpText?: string;
  suffix?: string;
  step?: number;
  min?: number;
  onChange: (field: keyof EstimatingPresets, value: number) => void;
}> = React.memo(
  ({ label, value, field, helpText, suffix, step = 1, min = 0, onChange }) => {
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const parsedValue = parseFloat(e.target.value) || 0;
        onChange(field, parsedValue);
      },
      [field, onChange],
    );

    return (
      <div className="mb-4">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          {label}
        </label>
        <div className="relative">
          <input
            type="number"
            step={step}
            min={min}
            value={value || ""}
            onChange={handleChange}
            className="block w-full px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm
                     focus:ring-[#f26722] focus:border-[#f26722]
                     bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
          />
          {suffix && (
            <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-500 dark:text-neutral-400 text-sm">
              {suffix}
            </span>
          )}
        </div>
        {helpText && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {helpText}
          </p>
        )}
      </div>
    );
  },
);

NumberInput.displayName = "NumberInput";

// Input component for factor/multiplier fields - moved outside to prevent recreation
const FactorInput: React.FC<{
  label: string;
  value: number;
  field: keyof EstimatingPresets;
  helpText?: string;
  showPercentage?: boolean;
  onChange: (field: keyof EstimatingPresets, value: number) => void;
}> = React.memo(
  ({ label, value, field, helpText, showPercentage = false, onChange }) => {
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const parsedValue = parseFloat(e.target.value) || 0;
        onChange(field, parsedValue);
      },
      [field, onChange],
    );

    return (
      <div className="mb-4">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            value={value || ""}
            onChange={handleChange}
            className="block w-full px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm
                     focus:ring-[#f26722] focus:border-[#f26722]
                     bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
          />
          {showPercentage && (
            <span className="text-sm text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
              ({((value - 1) * 100).toFixed(0)}%)
            </span>
          )}
        </div>
        {helpText && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {helpText}
          </p>
        )}
      </div>
    );
  },
);

FactorInput.displayName = "FactorInput";

export default function EstimatingPresetsPage() {
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const [activeTab, setActiveTab] = useState<
    "presets" | "library" | "equipment" | "proposal"
  >("presets");
  const [presets, setPresets] = useState<EstimatingPresets | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load presets on mount
  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getEstimatingPresets();
      setPresets(data);
    } catch (err) {
      console.error("Error loading presets:", err);
      setError("Failed to load estimating presets. Using default values.");
      setPresets({
        id: "",
        ...DEFAULT_ESTIMATING_PRESETS,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: null,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = useCallback(
    (field: keyof EstimatingPresets, value: number) => {
      if (!presets) return;

      setPresets((prev) => ({
        ...prev!,
        [field]: value,
      }));
      setHasChanges(true);
      setSuccessMessage(null);
    },
    [presets],
  );

  const handleSave = async () => {
    if (!presets || !user) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const { id, created_at, updated_at, updated_by, ...rest } = presets;
      // proposal_* template columns are managed by the Proposal Template tab;
      // don't write this page's (possibly stale) copies back over them.
      const updateData = Object.fromEntries(
        Object.entries(rest).filter(([key]) => !key.startsWith("proposal_")),
      );
      await updateEstimatingPresets(updateData, user.id);

      setHasChanges(false);
      setSuccessMessage("Estimating presets saved successfully!");

      // Auto-clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error("Error saving presets:", err);
      setError("Failed to save estimating presets. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!user) return;

    if (
      !window.confirm(
        "Are you sure you want to reset all presets to their default values? This cannot be undone.",
      )
    ) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const resetData = await resetEstimatingPresets(user.id);
      setPresets(resetData);
      setHasChanges(false);
      setSuccessMessage("Presets reset to default values successfully!");

      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error("Error resetting presets:", err);
      setError("Failed to reset presets. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!presets) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-none p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="h-5 w-5" />
            <span>
              Unable to load estimating presets. Please refresh the page.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
              <Calculator className="h-7 w-7 text-[#f26722]" />
              Estimating Presets
            </h1>
          </div>
          {activeTab === "presets" && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300
                           bg-white dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded-none
                           hover:bg-neutral-50 dark:hover:bg-dark-200 disabled:opacity-50 transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                Reset to Defaults
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white
                           bg-[#f26722] hover:bg-[#e55611] rounded-none shadow-sm
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>

        {/* Status Messages */}
        {error && (
          <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-none p-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-none p-4">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          </div>
        )}

        {hasChanges && !successMessage && activeTab === "presets" && (
          <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-none p-4">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>You have unsaved changes.</span>
            </div>
          </div>
        )}

        <div className="mt-6 border-b border-neutral-200 dark:border-neutral-700">
          <div
            role="tablist"
            className="flex flex-wrap gap-2"
            aria-label="Estimating preset tabs"
          >
            {[
              {
                id: "presets" as const,
                label: "Default Presets",
                icon: Calculator,
              },
              {
                id: "library" as const,
                label: "Scope Item Library",
                icon: BookOpen,
              },
              {
                id: "equipment" as const,
                label: "Test Equipment",
                icon: Wrench,
              },
              // Proposal letter template editing is restricted to admin/super users
              ...(isAdmin
                ? [
                    {
                      id: "proposal" as const,
                      label: "Proposal Template",
                      icon: FileText,
                    },
                  ]
                : []),
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? "border-[#f26722] text-[#f26722]"
                      : "border-transparent text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {activeTab === "presets" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* General Estimating Variables */}
            <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-neutral-200 dark:border-neutral-700">
                <DollarSign className="h-5 w-5 text-[#f26722]" />
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                  General Estimating Variables
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <CurrencyInput
                  label="Default Hourly Rate (Straight Time)"
                  value={presets.default_hourly_rate}
                  field="default_hourly_rate"
                  helpText="Base hourly labor rate"
                  onChange={handleInputChange}
                />

                <CurrencyInput
                  label="Overtime Rate"
                  value={presets.overtime_rate}
                  field="overtime_rate"
                  helpText="Typically 1.5x straight time"
                  onChange={handleInputChange}
                />

                <CurrencyInput
                  label="Double Time Rate"
                  value={presets.double_time_rate}
                  field="double_time_rate"
                  helpText="Typically 2x straight time"
                  onChange={handleInputChange}
                />

                <FactorInput
                  label="Default Tax Factor"
                  value={presets.default_tax_factor}
                  field="default_tax_factor"
                  helpText="e.g., 1.09 = 9% tax"
                  showPercentage={true}
                  onChange={handleInputChange}
                />

                <FactorInput
                  label="Default Markup Factor"
                  value={presets.default_markup_factor}
                  field="default_markup_factor"
                  helpText="e.g., 1.3 = 30% markup"
                  showPercentage={true}
                  onChange={handleInputChange}
                />

                <div className="sm:col-span-2 grid grid-cols-2 gap-6">
                  <NumberInput
                    label="Default Number of Men"
                    value={presets.default_number_of_men}
                    field="default_number_of_men"
                    helpText="Default crew size"
                    min={1}
                    onChange={handleInputChange}
                  />

                  <NumberInput
                    label="Default Hours Per Day"
                    value={presets.default_hours_per_day}
                    field="default_hours_per_day"
                    helpText="Work hours per day"
                    suffix="hrs"
                    min={1}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            </div>

            {/* Vehicle Travel Variables */}
            <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-neutral-200 dark:border-neutral-700">
                <Truck className="h-5 w-5 text-[#f26722]" />
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                  Vehicle Travel Variables
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <NumberInput
                  label="Default Number of Vehicles"
                  value={presets.default_number_of_vehicles}
                  field="default_number_of_vehicles"
                  helpText="Vehicles for travel"
                  min={1}
                  onChange={handleInputChange}
                />

                <CurrencyInput
                  label="Vehicle Cost Per Mile"
                  value={presets.default_vehicle_cost_per_mile}
                  field="default_vehicle_cost_per_mile"
                  helpText="Per mile rate"
                  onChange={handleInputChange}
                />

                <NumberInput
                  label="Average Speed"
                  value={presets.default_average_speed}
                  field="default_average_speed"
                  helpText="For travel time calculations"
                  suffix="mph"
                  min={1}
                  onChange={handleInputChange}
                />

                <NumberInput
                  label="Local Miles Per Day"
                  value={presets.default_local_miles_per_day}
                  field="default_local_miles_per_day"
                  helpText="Expected daily local driving"
                  suffix="mi"
                  min={0}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            {/* Per Diem & Lodging Variables */}
            <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-neutral-200 dark:border-neutral-700">
                <Users className="h-5 w-5 text-[#f26722]" />
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                  Per Diem & Lodging
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <CurrencyInput
                  label="Default Per Diem Rate"
                  value={presets.default_per_diem_rate}
                  field="default_per_diem_rate"
                  helpText="Daily meal allowance"
                  onChange={handleInputChange}
                />

                <CurrencyInput
                  label="Default Lodging Rate"
                  value={presets.default_lodging_rate}
                  field="default_lodging_rate"
                  helpText="Nightly lodging rate"
                  onChange={handleInputChange}
                />
              </div>
            </div>

            {/* Flight Travel Variables */}
            <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-neutral-200 dark:border-neutral-700">
                <Plane className="h-5 w-5 text-[#f26722]" />
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                  Flight Travel Variables
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <NumberInput
                  label="Default Flight Number of Men"
                  value={presets.default_flight_number_of_men}
                  field="default_flight_number_of_men"
                  helpText="People flying"
                  min={1}
                  onChange={handleInputChange}
                />

                <CurrencyInput
                  label="Default Flight Rate"
                  value={presets.default_flight_rate}
                  field="default_flight_rate"
                  helpText="Average cost per flight"
                  onChange={handleInputChange}
                />

                <CurrencyInput
                  label="Default Luggage Fees"
                  value={presets.default_flight_luggage_fees}
                  field="default_flight_luggage_fees"
                  helpText="Per person luggage fees"
                  onChange={handleInputChange}
                />
              </div>
            </div>

            {/* Rental Car Variables */}
            <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6 lg:col-span-2">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-neutral-200 dark:border-neutral-700">
                <Clock className="h-5 w-5 text-[#f26722]" />
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                  Rental Car Variables
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6">
                <NumberInput
                  label="Default Number of Rental Cars"
                  value={presets.default_rental_number_of_cars}
                  field="default_rental_number_of_cars"
                  helpText="Cars to rent"
                  min={0}
                  onChange={handleInputChange}
                />

                <CurrencyInput
                  label="Default Rental Rate"
                  value={presets.default_rental_rate}
                  field="default_rental_rate"
                  helpText="Weekly rental rate per car"
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>

          {/* Last Updated Info */}
          {presets.updated_at && (
            <div className="mt-6 text-sm text-neutral-500 dark:text-neutral-400 text-center">
              Last updated: {new Date(presets.updated_at).toLocaleString()}
            </div>
          )}
        </>
      )}

      {activeTab === "library" && <ScopeLibraryManager userId={user?.id} />}

      {activeTab === "equipment" && <TestEquipmentManager userId={user?.id} />}

      {activeTab === "proposal" && isAdmin && (
        <ProposalTemplateEditor userId={user?.id} />
      )}
    </div>
  );
}
