# Report Tables

SQL scripts for creating report-specific database tables.

**Last Updated**: December 2024

---

## 📋 Available Report Tables

All tables are created in the `neta_ops` schema.

| Script | Table Name | Report Type |
|--------|------------|-------------|
| `gfi_trip_test_reports.sql` | `gfi_trip_test_reports` | GFI Trip Test |
| `current_transformer_test_ats_reports.sql` | `current_transformer_test_ats_reports` | Current Transformer ATS |
| `current_transformer_test_mts_reports.sql` | `current_transformer_test_mts_reports` | Current Transformer MTS |
| `voltage_potential_transformer_mts_reports.sql` | `voltage_potential_transformer_mts_reports` | Potential Transformer MTS |
| `medium_voltage_circuit_breaker_reports.sql` | `medium_voltage_circuit_breaker_reports` | MV Circuit Breaker |
| `medium_voltage_vlf_mts_reports.sql` | `medium_voltage_vlf_mts_reports` | MV VLF MTS |
| `automatic_transfer_switch_ats_reports.sql` | `automatic_transfer_switch_ats_reports` | Automatic Transfer Switch |
| `low_voltage_panelboard_small_breaker_reports.sql` | `low_voltage_panelboard_small_breaker_reports` | LV Panelboard Small Breaker |
| `create_lv_cb_et_ats_table.sql` | `lv_cb_et_ats_reports` | LV CB Electronic Trip ATS |
| `medium_voltage_cable_vlf_test.sql` | `medium_voltage_cable_vlf_test` | MV Cable VLF Test |

---

## 🗄️ Standard Table Structure

All report tables follow a consistent structure:

```sql
CREATE TABLE IF NOT EXISTS neta_ops.[report_name]_reports (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign Keys
    job_id UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Job Information
    customer TEXT,
    address TEXT,
    user_name TEXT,
    date DATE,
    job_number TEXT,
    technicians TEXT,
    substation TEXT,
    eqpt_location TEXT,
    identifier TEXT,
    
    -- Test Equipment
    test_equipment JSONB DEFAULT '{}'::jsonb,
    
    -- Report-Specific Data
    -- [Varies by report type]
    
    -- Status
    status TEXT DEFAULT 'PASS' CHECK (status IN ('PASS', 'FAIL')),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔐 Standard Security Setup

Each table includes:

### Permissions
```sql
GRANT ALL ON neta_ops.[table_name] TO authenticated;
```

### Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_[table]_job_id ON neta_ops.[table](job_id);
CREATE INDEX IF NOT EXISTS idx_[table]_user_id ON neta_ops.[table](user_id);
CREATE INDEX IF NOT EXISTS idx_[table]_created_at ON neta_ops.[table](created_at);
```

### Row Level Security
```sql
ALTER TABLE neta_ops.[table] ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users full access
CREATE POLICY "Authenticated users can view all reports"
ON neta_ops.[table] FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert reports"
ON neta_ops.[table] FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update all reports"
ON neta_ops.[table] FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete all reports"
ON neta_ops.[table] FOR DELETE TO authenticated USING (true);
```

### Updated Timestamp Trigger
```sql
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON neta_ops.[table]
    FOR EACH ROW
    EXECUTE FUNCTION common.set_updated_at();
```

---

## 📊 Report-Specific Fields

### GFI Trip Test (`gfi_trip_test_reports`)
```sql
manufacturer TEXT,
rated_current TEXT,
ground_fault_setting TEXT,
ground_fault_trip TEXT,
results TEXT
```

### Current Transformer ATS/MTS
```sql
ct_data JSONB,          -- CT-specific measurements
ratio_polarity JSONB,   -- Ratio and polarity test data
insulation_data JSONB   -- Insulation resistance readings
```

### Medium Voltage Circuit Breaker
```sql
breaker_info JSONB,     -- Breaker specifications
contact_data JSONB,     -- Contact resistance
timing_data JSONB,      -- Operation timing
insulation_data JSONB   -- Insulation readings
```

### Automatic Transfer Switch
```sql
ats_info JSONB,         -- ATS specifications
transfer_data JSONB,    -- Transfer timing
control_data JSONB      -- Control circuit tests
```

---

## ⚡ Running Scripts

### In Supabase SQL Editor

1. Go to Supabase Dashboard
2. Navigate to SQL Editor
3. Paste script content
4. Click "Run"

### Via psql

```bash
psql -h your-host -U postgres -d postgres -f script.sql
```

### Important Notes

- **Never drop tables** with existing data
- Use `IF NOT EXISTS` guards (already included)
- Test in development first
- Backup before running in production

---

## 🔄 Migration from Old Policies

Some tables may have restrictive policies from earlier versions. Scripts include cleanup:

```sql
-- Drop old restrictive policies if they exist
DROP POLICY IF EXISTS "Users can view their own reports" ON neta_ops.[table];
DROP POLICY IF EXISTS "Users can insert their own reports" ON neta_ops.[table];
DROP POLICY IF EXISTS "Users can update their own reports" ON neta_ops.[table];
DROP POLICY IF EXISTS "Users can delete their own reports" ON neta_ops.[table];
```

---

## 📝 Creating New Report Tables

1. Copy an existing script as a template
2. Update table name
3. Add report-specific columns
4. Update indexes
5. Test the script
6. Add to this folder
7. Update this README

### Naming Convention
- Table: `[report_type]_reports` (e.g., `gfi_trip_test_reports`)
- Script: `[report_type]_reports.sql` or `create_[report_type]_table.sql`

---

## 📚 Related Documentation

- `/src/components/reports/README.md` - Report components documentation
- `/documentation/Technical Reference/REPORT_STANDARDIZATION_PLAN.md` - Standardization
- `/Database Scripts/README.md` - Database scripts overview
