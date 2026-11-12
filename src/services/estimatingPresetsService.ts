/**
 * Estimating Presets Service
 *
 * Handles fetching and updating company-wide default values for estimates.
 * These presets are used to pre-populate estimate forms with default values.
 */

import { supabase } from "../lib/supabase";
import { DEFAULT_ESTIMATING_PRESETS as SHARED_ESTIMATING_DEFAULTS } from "../lib/estimatePricing";

export interface EstimatingPresets {
  id: string;

  // General Estimating Variables
  default_hourly_rate: number;
  overtime_rate: number;
  double_time_rate: number;
  default_tax_factor: number;
  default_markup_factor: number;
  default_number_of_men: number;
  default_hours_per_day: number;

  // Travel - Vehicle
  default_number_of_vehicles: number;
  default_vehicle_cost_per_mile: number;
  default_average_speed: number;

  // Travel - Per Diem & Lodging
  default_per_diem_rate: number;
  default_lodging_rate: number;
  default_local_miles_per_day: number;

  // Travel - Flights
  default_flight_number_of_men: number;
  default_flight_rate: number;
  default_flight_luggage_fees: number;

  // Travel - Rental Car
  default_rental_number_of_cars: number;
  default_rental_rate: number;

  // Proposal letter template sections (admin-editable; null = built-in default)
  // Effective values are resolved via resolveProposalTemplateSections() in
  // src/components/estimates/proposalTemplateDefaults.ts
  proposal_intro_html?: string | null;
  proposal_terms_html?: string | null;
  proposal_conclusion_html?: string | null;
  proposal_signature_html?: string | null;
  proposal_safety_policy_html?: string | null;
  proposal_signer_name?: string | null;
  proposal_signer_title?: string | null;
  // Expanded template editing (v2). JSON columns are stored/loaded as-is by
  // Supabase; helpers in proposalTemplateDefaults.ts coerce + fall back.
  proposal_header_html?: string | null;
  proposal_footer_html?: string | null;
  proposal_neta_options?: unknown | null;
  proposal_custom_sections?: unknown | null;
  // Adjustable branding: logos, banner text, safety title, signature image.
  // { letterLogoUrl, letterBannerText, safetyLogoUrl, safetyTitle, signatureImage }
  proposal_branding?: unknown | null;

  // Metadata
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

// Default values if no presets exist in the database. The numbers live in
// supabase/functions/_shared/estimateMath.ts (shared with the AI connector).
// proposal_* template fields are deliberately omitted: resetEstimatingPresets()
// must not wipe admin-edited letter text.
export const DEFAULT_ESTIMATING_PRESETS: Omit<
  EstimatingPresets,
  "id" | "created_at" | "updated_at" | "updated_by"
> = SHARED_ESTIMATING_DEFAULTS;

/**
 * Fetch the current estimating presets
 * Returns the first (and only) row from the presets table
 * If no presets exist, returns default values
 */
export async function getEstimatingPresets(): Promise<EstimatingPresets> {
  try {
    const { data, error } = await supabase
      .schema("business")
      .from("estimating_presets")
      .select("*")
      .limit(1)
      .single();

    if (error) {
      // If no data exists, return defaults
      if (error.code === "PGRST116") {
        console.log("No estimating presets found, using defaults");
        return {
          id: "",
          ...DEFAULT_ESTIMATING_PRESETS,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: null,
        };
      }
      throw error;
    }

    return data as EstimatingPresets;
  } catch (error) {
    console.error("Error fetching estimating presets:", error);
    // Return defaults on error
    return {
      id: "",
      ...DEFAULT_ESTIMATING_PRESETS,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: null,
    };
  }
}

/**
 * Update the estimating presets
 * @param presets - Partial preset values to update
 * @param userId - ID of the user making the update
 */
export async function updateEstimatingPresets(
  presets: Partial<Omit<EstimatingPresets, "id" | "created_at" | "updated_at">>,
  userId?: string,
): Promise<EstimatingPresets> {
  try {
    // First, get the existing record or create one
    const existing = await getEstimatingPresets();

    const updateData = {
      ...presets,
      updated_by: userId || null,
    };

    if (existing.id) {
      // Update existing record
      const { data, error } = await supabase
        .schema("business")
        .from("estimating_presets")
        .update(updateData)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      return data as EstimatingPresets;
    } else {
      // Insert new record
      const { data, error } = await supabase
        .schema("business")
        .from("estimating_presets")
        .insert(updateData)
        .select()
        .single();

      if (error) throw error;
      return data as EstimatingPresets;
    }
  } catch (error) {
    console.error("Error updating estimating presets:", error);
    throw error;
  }
}

/**
 * Reset presets to default values
 * @param userId - ID of the user making the reset
 */
export async function resetEstimatingPresets(
  userId?: string,
): Promise<EstimatingPresets> {
  return updateEstimatingPresets(DEFAULT_ESTIMATING_PRESETS, userId);
}
