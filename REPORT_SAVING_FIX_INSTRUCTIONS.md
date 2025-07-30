# Report Saving Error Fix Instructions

## Problem Summary
Three reports were failing to save due to missing database tables:

1. **Low Voltage Cable Test (ATS up to 20 sets)** - Missing table: `low_voltage_cable_test_20sets`
2. **8-Low Voltage Circuit Breaker Electronic Trip Unit ATS** - Missing table: `low_voltage_circuit_breaker_electronic_trip_ats`
3. **8-Low Voltage Circuit Breaker Electronic Trip Unit ATS - Secondary Injection** - Missing table: `low_voltage_circuit_breaker_electronic_trip_ats`

## Solution
I've created a comprehensive SQL migration file that creates all the missing tables with proper structure, permissions, and security policies.

## Steps to Fix

### 1. Run the Database Migration
Execute the SQL migration file in your Supabase SQL Editor:

**File:** `supabase/migrations/20250115_fix_report_saving_errors.sql`

**Instructions:**
1. Open your Supabase dashboard
2. Go to SQL Editor
3. Copy and paste the contents of the migration file
4. Run the SQL commands

### 2. Tables Created
The migration creates these tables in the `neta_ops` schema:

- `low_voltage_cable_test_20sets` - For 20 sets cable test reports
- `low_voltage_cable_test_12sets` - For 12 sets cable test reports  
- `low_voltage_cable_test_3sets` - For 3 sets (MTS) cable test reports
- `low_voltage_circuit_breaker_electronic_trip_ats` - For electronic trip unit ATS reports (both primary and secondary injection)

### 3. Table Structure
Each table includes:
- `id` (UUID, primary key)
- `job_id` (UUID, references jobs table)
- `user_id` (UUID, references auth.users)
- `data` (JSONB, stores report form data) - for cable test tables
- `report_info`, `nameplate_data`, etc. (JSONB columns) - for circuit breaker table
- `created_at` and `updated_at` timestamps

### 4. Security & Permissions
- Row Level Security (RLS) enabled on all tables
- Users can only access their own reports or reports from jobs in their division
- Proper indexes for performance
- Automatic `updated_at` timestamp triggers

### 5. Verification
After running the migration, you can verify the tables exist by running:

```sql
SELECT 'low_voltage_cable_test_20sets' as table_name, count(*) as record_count FROM neta_ops.low_voltage_cable_test_20sets
UNION ALL
SELECT 'low_voltage_cable_test_12sets' as table_name, count(*) as record_count FROM neta_ops.low_voltage_cable_test_12sets
UNION ALL
SELECT 'low_voltage_cable_test_3sets' as table_name, count(*) as record_count FROM neta_ops.low_voltage_cable_test_3sets
UNION ALL
SELECT 'low_voltage_circuit_breaker_electronic_trip_ats' as table_name, count(*) as record_count FROM neta_ops.low_voltage_circuit_breaker_electronic_trip_ats;
```

## Expected Results
After running the migration:

1. **Low Voltage Cable Test (20 sets)** reports will save successfully to `low_voltage_cable_test_20sets`
2. **Low Voltage Circuit Breaker Electronic Trip Unit ATS** reports will save successfully to `low_voltage_circuit_breaker_electronic_trip_ats`
3. **Low Voltage Circuit Breaker Electronic Trip Unit ATS - Secondary Injection** reports will save successfully to the same table with different data structure

## Code Changes Made
- No code changes were required - the reports were already correctly structured
- The issue was purely missing database tables
- Routes are properly defined in App.tsx
- Save handlers in the components are correctly implemented

## Additional Notes
- The circuit breaker table supports both primary injection and secondary injection reports using the same table with different JSONB column structures
- All tables use JSONB for flexible data storage, allowing for easy schema evolution
- Row-level security ensures data isolation between users and divisions 