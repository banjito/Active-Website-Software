# Database Scripts

All SQL files organized by purpose and type.

## 📁 Structure

### `/Fixes & Maintenance/`
Constraint fixes, schema repairs, permission updates, and RLS management.

### `/Setup & Configuration/`
Table creation, workflow setup, and initial configuration scripts.

### `/Report Tables/`
SQL for report-specific tables (ATS, MTS, transformers, circuit breakers, etc.).

### `/Verification & Testing/`
Schema access verification, debugging queries, and data validation scripts.

### `/Historical Migrations/`
Archived migration scripts from previous releases (68 files).

## ⚠️ Important Notes

### Active vs Historical
- **`/database/migrations/`** (in root) = Active migrations used by app
- **`/Database Scripts/Historical Migrations/`** = Archived for reference

### Running Scripts
1. Backup database first
2. Test in development
3. Check dependencies
4. Verify permissions
5. Use transactions where possible

## 🔍 Quick Reference

| Need | Folder |
|------|--------|
| Fix a constraint | `/Fixes & Maintenance/` |
| Set up new table | `/Setup & Configuration/` |
| Add report table | `/Report Tables/` |
| Debug data | `/Verification & Testing/` |
| View old migrations | `/Historical Migrations/` |
