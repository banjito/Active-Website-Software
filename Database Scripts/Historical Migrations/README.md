# Historical Migrations

Archived database migration scripts from previous releases.

## 📦 Contents

68 migration files (61 SQL, 7 JS) organized chronologically by feature and date.

## ⚠️ Important

**These are archived migrations** - they have already been applied to the database.

### Active vs Historical
- **Active**: `/database/migrations/` in project root
- **Historical**: This folder (for reference only)

## 🔍 Usage

Use these files to:
- Understand historical changes
- Reference past implementations
- Debug legacy issues
- Recreate development environments

## ❌ Do Not

- Re-run these migrations in production
- Modify these files
- Use as templates without reviewing current patterns

## 📝 Notes

- Files are kept for historical reference
- May not reflect current schema
- Check active migrations for latest structure
- Consult git history for context

## 🗂️ Organization

Migrations are typically named with:
- Date prefix (YYYYMMDD)
- Feature name
- Sequential number

Example: `20240315_add_custom_forms_01.sql`







