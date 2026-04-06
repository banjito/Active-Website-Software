-- ===========================================================
-- ESTIMATING PRESETS TABLE
-- ===========================================================
-- Description: Stores default values for estimate calculations
-- These presets are company-wide and can be adjusted by admins
-- Used to pre-populate estimate forms with default values
-- ===========================================================

-- Create the estimating_presets table in the business schema
CREATE TABLE IF NOT EXISTS business.estimating_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- General Estimating Variables
    default_hourly_rate DECIMAL(10,2) DEFAULT 240.00,          -- Straight time hourly rate
    overtime_rate DECIMAL(10,2) DEFAULT 360.00,                -- Overtime hourly rate (1.5x)
    double_time_rate DECIMAL(10,2) DEFAULT 480.00,             -- Double time hourly rate (2x)
    default_tax_factor DECIMAL(5,4) DEFAULT 1.0900,            -- Tax factor (e.g., 1.09 = 9%)
    default_markup_factor DECIMAL(5,2) DEFAULT 1.30,           -- Material markup factor (e.g., 1.3 = 30%)
    default_number_of_men INTEGER DEFAULT 2,                    -- Default crew size
    default_hours_per_day INTEGER DEFAULT 8,                    -- Default work hours per day
    
    -- Travel Specific Variables - Vehicle
    default_number_of_vehicles INTEGER DEFAULT 1,               -- Default number of vehicles
    default_vehicle_cost_per_mile DECIMAL(10,2) DEFAULT 3.00,  -- Cost per mile for vehicle travel
    default_average_speed INTEGER DEFAULT 50,                   -- Average travel speed in mph
    
    -- Travel Specific Variables - Per Diem & Lodging
    default_per_diem_rate DECIMAL(10,2) DEFAULT 65.00,         -- Daily per diem rate
    default_lodging_rate DECIMAL(10,2) DEFAULT 210.00,         -- Nightly lodging rate
    default_local_miles_per_day INTEGER DEFAULT 50,            -- Local miles driven per day
    
    -- Travel Specific Variables - Flights
    default_flight_number_of_men INTEGER DEFAULT 2,            -- Default number of men flying
    default_flight_rate DECIMAL(10,2) DEFAULT 600.00,          -- Average flight cost per person
    default_flight_luggage_fees DECIMAL(10,2) DEFAULT 50.00,   -- Luggage fees per person
    
    -- Travel Specific Variables - Rental Car
    default_rental_number_of_cars INTEGER DEFAULT 1,           -- Default number of rental cars
    default_rental_rate DECIMAL(10,2) DEFAULT 750.00,          -- Weekly rental rate per car
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Create an index on updated_at for efficient queries
CREATE INDEX IF NOT EXISTS idx_estimating_presets_updated_at 
    ON business.estimating_presets(updated_at DESC);

-- Insert default values if table is empty
INSERT INTO business.estimating_presets (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM business.estimating_presets);

-- Enable RLS
ALTER TABLE business.estimating_presets ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to view presets
CREATE POLICY "Anyone can view estimating presets"
    ON business.estimating_presets
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Allow authenticated users to update presets (can be restricted later to admin only)
CREATE POLICY "Authenticated users can update estimating presets"
    ON business.estimating_presets
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policy: Allow insert for authenticated users (mainly for initial setup)
CREATE POLICY "Authenticated users can insert estimating presets"
    ON business.estimating_presets
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Create trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION business.update_estimating_presets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_estimating_presets_timestamp 
    ON business.estimating_presets;
    
CREATE TRIGGER trigger_update_estimating_presets_timestamp
    BEFORE UPDATE ON business.estimating_presets
    FOR EACH ROW
    EXECUTE FUNCTION business.update_estimating_presets_updated_at();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON business.estimating_presets TO authenticated;

-- Add helpful comment to the table
COMMENT ON TABLE business.estimating_presets IS 'Stores company-wide default values for estimate calculations. These presets are used to pre-populate estimate forms.';

-- Comments on columns for documentation
COMMENT ON COLUMN business.estimating_presets.default_hourly_rate IS 'Default straight time hourly labor rate';
COMMENT ON COLUMN business.estimating_presets.overtime_rate IS 'Overtime hourly rate (typically 1.5x straight time)';
COMMENT ON COLUMN business.estimating_presets.double_time_rate IS 'Double time hourly rate (typically 2x straight time)';
COMMENT ON COLUMN business.estimating_presets.default_tax_factor IS 'Tax factor multiplier (e.g., 1.09 = 9% tax)';
COMMENT ON COLUMN business.estimating_presets.default_markup_factor IS 'Material markup factor (e.g., 1.3 = 30% markup)';
COMMENT ON COLUMN business.estimating_presets.default_number_of_men IS 'Default crew size for estimates';
COMMENT ON COLUMN business.estimating_presets.default_hours_per_day IS 'Default work hours per day';
COMMENT ON COLUMN business.estimating_presets.default_number_of_vehicles IS 'Default number of vehicles for travel';
COMMENT ON COLUMN business.estimating_presets.default_vehicle_cost_per_mile IS 'Cost per mile for vehicle travel expenses';
COMMENT ON COLUMN business.estimating_presets.default_average_speed IS 'Average travel speed in mph for time calculations';
COMMENT ON COLUMN business.estimating_presets.default_per_diem_rate IS 'Daily per diem allowance';
COMMENT ON COLUMN business.estimating_presets.default_lodging_rate IS 'Nightly lodging rate';
COMMENT ON COLUMN business.estimating_presets.default_local_miles_per_day IS 'Expected local driving miles per day';
COMMENT ON COLUMN business.estimating_presets.default_flight_number_of_men IS 'Default number of men traveling by air';
COMMENT ON COLUMN business.estimating_presets.default_flight_rate IS 'Average flight cost per person';
COMMENT ON COLUMN business.estimating_presets.default_flight_luggage_fees IS 'Luggage fees per person';
COMMENT ON COLUMN business.estimating_presets.default_rental_number_of_cars IS 'Default number of rental cars';
COMMENT ON COLUMN business.estimating_presets.default_rental_rate IS 'Weekly rental car rate';

