# Fixes & Maintenance

Scripts for fixing constraints, schemas, permissions, and other database issues.

## 📋 Contents

### Constraint Fixes
- `FIX_ASSETS_CONSTRAINT.sql` - Asset table constraint repairs
- `fix-foreign-key-constraints.sql` - Foreign key constraint fixes
- `fix-asset-reports-table.sql` - Asset reports table repairs

### Schema & Data Fixes
- `fix_chat_schemas_simple.sql` - Chat schema repairs
- `fix_quoted_amount.sql` - Quote amount data corrections

### Permissions & RLS
- `step3_fix_permissions.sql` - Permission fixes and grants
- `disable_rls_subcontractor_agreements.sql` - RLS management for subcontractors
- `fix_subcontractor_agreements_policies.sql` - Subcontractor policy fixes

## ⚠️ Usage

1. **Always backup before running**
2. Understand what the script does
3. Test in development first
4. Run during maintenance window if possible
5. Verify results after running

## 🔧 Common Scenarios

- **Constraint violations**: Use constraint fix scripts
- **Permission denied errors**: Run permission fixes
- **RLS blocking queries**: Review RLS management scripts
- **Data inconsistencies**: Use data correction scripts







