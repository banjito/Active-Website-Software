# Development Tools

Testing utilities, scripts, and import data for development purposes.

## 📁 Folder Structure

### `/Test Scripts/` - Testing & Utilities
Development scripts for testing and maintenance:

#### Customer Management
- `add-test-customer.js` - Add test customer (original)
- `add-test-customer-fixed.mjs` - Add test customer (fixed version)

#### Supabase Testing
- `check-supabase.js` - Check Supabase connection
- `check-supabase.mjs` - Check Supabase connection (ES module)

#### Quick Testing
- `test-quick.js` - Quick test runner
- `test-quick.mjs` - Quick test runner (ES module)

#### Utilities
- `update_task.js` - Task update utility
- `wrap-portals.js` - Portal wrapper utility

### `/Import Data/` - CSV & JSON Imports

#### `/imports/` - CSV Data
- `opportunities_export.csv` - Opportunity data exports
- `quoted_amount_unmatched.csv` - Unmatched quotes
- `quoted_amount_update_report.csv` - Quote update reports

#### `/json imports/` - JSON & Report Files
- 40+ JSON data files
- 4 AMP report templates
- 4 Excel spreadsheets

## 🚀 Usage

### Running Test Scripts

```bash
# Node.js scripts
node "Development Tools/Test Scripts/add-test-customer.js"

# ES Module scripts
node "Development Tools/Test Scripts/check-supabase.mjs"
```

### Importing Data

Import data files are used for:
- Seeding test data
- Migrating from old systems
- Bulk data operations
- Template generation

## ⚠️ Important Notes

### Test Scripts
- **Development only** - Don't run in production
- Check Supabase connection before running
- Test customers will appear in the database
- Clean up test data after testing

### Import Data
- **Backup before importing**
- Verify data format matches schema
- Check for duplicate records
- Validate relationships

### ES Modules (.mjs)
Some scripts use ES module syntax (.mjs) for:
- Modern JavaScript features
- Better import/export
- Compatibility with tooling

## 🔧 Maintenance

### Adding New Test Scripts
1. Create script in `/Test Scripts/`
2. Use `.js` for CommonJS or `.mjs` for ES modules
3. Add error handling
4. Document usage in comments

### Adding Import Data
1. Place CSV files in `/imports/`
2. Place JSON/Excel files in `/json imports/`
3. Document data structure
4. Include sample/test data

## 📊 Data Files Reference

### Customer Data
- Customer imports
- Contact information
- Opportunity tracking

### Report Templates
- AMP report formats
- Test report data
- Template configurations

### Quote Data
- Quoted amounts
- Unmatched records
- Update reports

---

**Last Organized:** November 6, 2024  
**Note:** These are development tools - use with caution!







