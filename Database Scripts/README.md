# Database Scripts

All SQL files organized by purpose and type.

**Last Updated**: December 2024

---

## 📁 Folder Structure

### `/Setup & Configuration/`
Table creation, workflow setup, and initial configuration scripts.

| Script | Purpose |
|--------|---------|
| `create_deliverables_table.sql` | Create deliverables table for packaging reports |
| `add_status_to_generated_documents.sql` | Add locking status to cover letters |
| `add_report_selection_to_cover_letters.sql` | Add report selection to generated documents |
| `add_update_delete_policies_generated_documents.sql` | RLS policies for generated documents |
| `create_liquid_filled_xfmr_ats25_reports.sql` | Liquid filled transformer ATS 25 table |
| `create_small_lv_dry_type_transformer_ats25_reports.sql` | Small LV dry type transformer table |
| `create_subcontractor_agreements.sql` | Subcontractor agreements table |
| `create_custom_form_saved_components_table.sql` | Saved custom form components (library) for report builder |
| `add_portal_preferences_to_profiles.sql` | User portal preferences |
| `add_pause_functionality_to_issues.sql` | Issue pause feature |
| `add-submittal-tracking.sql` | Submittal tracking system |
| `asset-approval-workflow-setup.sql` | Asset approval workflow |
| `fix_issue_priority_permissions.sql` | Issue priority RLS policies |
| `manual-set-report-timestamps.sql` | Manual timestamp updates |
| `manual-setup-technical-reports.sql` | Technical reports setup |
| `manual-setup-technical-reports-fixed.sql` | Fixed version of above |
| `check_and_create_table.sql` | Table existence checking |
| `step1_check_table.sql` | Migration step 1 |
| `step2_create_table.sql` | Migration step 2 |

### `/Report Tables/`
SQL for report-specific tables.

| Script | Report Type | Schema |
|--------|-------------|--------|
| `gfi_trip_test_reports.sql` | GFI Trip Test | neta_ops |
| `current_transformer_test_ats_reports.sql` | CT ATS | neta_ops |
| `current_transformer_test_mts_reports.sql` | CT MTS | neta_ops |
| `voltage_potential_transformer_mts_reports.sql` | PT MTS | neta_ops |
| `medium_voltage_circuit_breaker_reports.sql` | MV Circuit Breaker | neta_ops |
| `medium_voltage_vlf_mts_reports.sql` | MV VLF MTS | neta_ops |
| `automatic_transfer_switch_ats_reports.sql` | Transfer Switch | neta_ops |
| `low_voltage_panelboard_small_breaker_reports.sql` | Panelboard Small Breaker | neta_ops |
| `create_lv_cb_et_ats_table.sql` | LV CB Electronic Trip | neta_ops |

### `/Fixes & Maintenance/`
Constraint fixes, schema repairs, permission updates, and RLS management.

| Script | Purpose |
|--------|---------|
| `FIX_ASSETS_CONSTRAINT.sql` | Fix asset table constraints |
| `fix_chat_schemas_simple.sql` | Chat schema fixes |
| `fix_quoted_amount.sql` | Quoted amount field fix |
| `fix_subcontractor_agreements_policies.sql` | Subcontractor RLS policies |
| `fix-asset-reports-table.sql` | Asset reports table fix |
| `fix-foreign-key-constraints.sql` | Foreign key repairs |
| `disable_rls_subcontractor_agreements.sql` | Disable RLS temporarily |
| `step3_fix_permissions.sql` | Permission fixes |

### `/Verification & Testing/`
Schema access verification, debugging queries, and data validation.

| Script | Purpose |
|--------|---------|
| `schema_access_verification.sql` | Verify schema access |
| `schema_access_verification_fixed.sql` | Fixed verification script |
| `verification_query.sql` | General verification queries |
| `debug_job_status.sql` | Debug job status issues |

### `/Historical Migrations/`
Archived migration scripts from previous releases (68 files).

See `/Historical Migrations/README.md` for details.

---

## 🗄️ Schema Overview

### `neta_ops` Schema
Main operational data schema.

| Table | Purpose |
|-------|---------|
| `jobs` | Job records |
| `assets` | Documents, reports, files |
| `job_assets` | Job-to-asset relationships |
| `deliverables` | Deliverable packages |
| `generated_documents` | Cover letters, summaries |
| `custom_form_templates` | Form builder templates |
| `custom_form_instances` | Filled form instances |
| `[report]_reports` | Individual report tables |

### `common` Schema
Shared data across the application.

| Table | Purpose |
|-------|---------|
| `customers` | Customer records |
| `profiles` | User profiles |
| `sla_definitions` | SLA templates |
| `sla_tracking` | Active SLA instances |
| `sla_violations` | SLA violation records |

---

## ⚠️ Important Notes

### Running Scripts

1. **Always backup first** before running any script
2. **Test in development** before production
3. **Check dependencies** - some scripts require others to run first
4. **Verify permissions** - ensure you have required access
5. **Use transactions** where possible for rollback capability

### Script Order for New Setup

1. Run `/Setup & Configuration/` scripts first
2. Run `/Report Tables/` scripts for needed report types
3. Run `/Fixes & Maintenance/` only if issues occur

### Active vs Historical

- **`/database/migrations/`** (in project root) = Active migrations used by app
- **`/Database Scripts/Historical Migrations/`** = Archived for reference only

---

## 🔧 Common Tasks

### Create a New Report Table

1. Copy an existing report table script
2. Update table name and columns
3. Add appropriate indexes
4. Enable RLS with policies
5. Add to Report Tables folder

Example structure:
```sql
CREATE TABLE IF NOT EXISTS neta_ops.new_report_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Job Information
    customer TEXT,
    address TEXT,
    job_number TEXT,
    date DATE,
    technicians TEXT,
    substation TEXT,
    
    -- Test Equipment
    test_equipment JSONB DEFAULT '{}'::jsonb,
    
    -- Report-specific fields
    -- ...
    
    -- Status
    status TEXT DEFAULT 'PASS' CHECK (status IN ('PASS', 'FAIL')),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant permissions
GRANT ALL ON neta_ops.new_report_reports TO authenticated;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_new_report_reports_job_id 
ON neta_ops.new_report_reports(job_id);

-- Enable RLS
ALTER TABLE neta_ops.new_report_reports ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view all reports"
ON neta_ops.new_report_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert reports"
ON neta_ops.new_report_reports FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update all reports"
ON neta_ops.new_report_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete all reports"
ON neta_ops.new_report_reports FOR DELETE TO authenticated USING (true);
```

### Fix RLS Policies

If you get permission errors:
```sql
-- Check existing policies
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- Drop restrictive policies
DROP POLICY IF EXISTS "policy_name" ON schema.table;

-- Create permissive policies
CREATE POLICY "allow_all_select" ON schema.table 
FOR SELECT USING (true);
```

### Add Column to Existing Table

```sql
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'neta_ops' 
    AND table_name = 'table_name' 
    AND column_name = 'new_column'
  ) THEN
    ALTER TABLE neta_ops.table_name 
    ADD COLUMN new_column TEXT;
  END IF;
END $$;
```

---

## 📋 Table Templates

### Deliverables Table Structure
```sql
neta_ops.deliverables
├── id (UUID, PK)
├── job_id (UUID, FK → jobs)
├── name (TEXT, required)
├── description (TEXT)
├── status (TEXT: draft/in_review/approved/rejected/delivered)
├── cover_letter_id (UUID, FK → generated_documents)
├── executive_summary_id (UUID, FK → generated_documents)
├── combined_pdf_url (TEXT)
├── created_by (UUID)
├── created_at (TIMESTAMPTZ)
├── updated_at (TIMESTAMPTZ)
├── approved_by (UUID)
├── approved_at (TIMESTAMPTZ)
├── rejected_by (UUID)
├── rejected_at (TIMESTAMPTZ)
├── rejection_reason (TEXT)
└── delivered_at (TIMESTAMPTZ)
```

### Generated Documents Table Structure
```sql
neta_ops.generated_documents
├── id (UUID, PK)
├── job_id (UUID, FK → jobs)
├── name (TEXT)
├── doc_type (TEXT: cover/summary/both)
├── html (TEXT)
├── selected_report_ids (UUID[])
├── status (TEXT: draft/locked)
├── locked_at (TIMESTAMPTZ)
├── locked_by (UUID)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

---

## 🔍 Quick Reference

| Need | Script Location |
|------|-----------------|
| Create new table | `/Setup & Configuration/` |
| Add report table | `/Report Tables/` |
| Fix constraints | `/Fixes & Maintenance/` |
| Verify schema | `/Verification & Testing/` |
| Historical reference | `/Historical Migrations/` |

---

## 📚 Related Documentation

- `/documentation/Database & Schema/schema_relationships.md` - Table relationships
- `/documentation/Migration & Fixes/SCHEMA_MIGRATION.md` - Migration procedures
- `/database/migrations/` - Active application migrations
