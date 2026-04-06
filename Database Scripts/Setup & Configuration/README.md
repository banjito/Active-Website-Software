# Setup & Configuration

Scripts for creating tables, configuring workflows, and initial system setup.

## 📋 Contents

### Workflow Setup
- `asset-approval-workflow-setup.sql` - Asset approval system configuration
- `manual-setup-technical-reports-fixed.sql` - Technical reports setup (fixed)
- `manual-setup-technical-reports.sql` - Technical reports setup (original)

### Table Creation
- `check_and_create_table.sql` - Check existence and create if missing
- `step1_check_table.sql` - Step 1: Table verification
- `step2_create_table.sql` - Step 2: Table creation
- `create_subcontractor_agreements.sql` - Subcontractor agreements table

## 🚀 Usage

### For New Features
1. Use check_and_create pattern for safety
2. Run setup scripts in order
3. Verify tables were created
4. Test with sample data

### Step-by-Step Process
```sql
-- 1. Check if table exists
\i step1_check_table.sql

-- 2. Create table if needed
\i step2_create_table.sql

-- 3. Set permissions (see Fixes & Maintenance)
\i ../Fixes\ &\ Maintenance/step3_fix_permissions.sql
```

## ⚠️ Important

- These scripts modify schema structure
- Run during deployment or maintenance windows
- Always backup before running
- Test in development environment first







