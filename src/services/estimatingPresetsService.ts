/**
 * Estimating Presets Service
 * 
 * Handles fetching and updating company-wide default values for estimates.
 * These presets are used to pre-populate estimate forms with default values.
 */

import { supabase } from '../lib/supabase';

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
  
  // Metadata
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

// Default values if no presets exist in the database
export const DEFAULT_ESTIMATING_PRESETS: Omit<EstimatingPresets, 'id' | 'created_at' | 'updated_at' | 'updated_by'> = {
  // General
  default_hourly_rate: 240.00,
  overtime_rate: 360.00,
  double_time_rate: 480.00,
  default_tax_factor: 1.09,
  default_markup_factor: 1.30,
  default_number_of_men: 2,
  default_hours_per_day: 8,
  
  // Travel - Vehicle
  default_number_of_vehicles: 1,
  default_vehicle_cost_per_mile: 3.00,
  default_average_speed: 50,
  
  // Travel - Per Diem & Lodging
  default_per_diem_rate: 65.00,
  default_lodging_rate: 210.00,
  default_local_miles_per_day: 50,
  
  // Travel - Flights
  default_flight_number_of_men: 2,
  default_flight_rate: 600.00,
  default_flight_luggage_fees: 50.00,
  
  // Travel - Rental Car
  default_rental_number_of_cars: 1,
  default_rental_rate: 750.00,
};

/**
 * Fetch the current estimating presets
 * Returns the first (and only) row from the presets table
 * If no presets exist, returns default values
 */
export async function getEstimatingPresets(): Promise<EstimatingPresets> {
  try {
    const { data, error } = await supabase
      .schema('business')
      .from('estimating_presets')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      // If no data exists, return defaults
      if (error.code === 'PGRST116') {
        console.log('No estimating presets found, using defaults');
        return {
          id: '',
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
    console.error('Error fetching estimating presets:', error);
    // Return defaults on error
    return {
      id: '',
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
  presets: Partial<Omit<EstimatingPresets, 'id' | 'created_at' | 'updated_at'>>,
  userId?: string
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
        .schema('business')
        .from('estimating_presets')
        .update(updateData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return data as EstimatingPresets;
    } else {
      // Insert new record
      const { data, error } = await supabase
        .schema('business')
        .from('estimating_presets')
        .insert(updateData)
        .select()
        .single();

      if (error) throw error;
      return data as EstimatingPresets;
    }
  } catch (error) {
    console.error('Error updating estimating presets:', error);
    throw error;
  }
}

/**
 * Reset presets to default values
 * @param userId - ID of the user making the reset
 */
export async function resetEstimatingPresets(userId?: string): Promise<EstimatingPresets> {
  return updateEstimatingPresets(DEFAULT_ESTIMATING_PRESETS, userId);
}






