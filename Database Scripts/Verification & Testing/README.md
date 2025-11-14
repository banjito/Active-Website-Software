# Verification & Testing

Scripts for debugging, data verification, and schema access testing.

## 📋 Contents

### Schema Access
- `schema_access_verification.sql` - Verify schema permissions (original)
- `schema_access_verification_fixed.sql` - Verify schema permissions (fixed version)

### Debugging
- `debug_job_status.sql` - Debug job status issues and data flow

### Data Verification
- `verification_query.sql` - General data verification and validation

## 🔍 Usage

### Schema Access Verification
Check if users/roles have proper access to schemas:
```sql
\i schema_access_verification_fixed.sql
```

### Debugging Issues
When investigating job status problems:
```sql
\i debug_job_status.sql
```

### Data Validation
Verify data integrity and relationships:
```sql
\i verification_query.sql
```

## 📊 Output

These scripts typically return:
- Lists of permissions/grants
- Data inconsistencies
- Missing relationships
- Access issues

## 💡 Tips

- Run verification scripts before and after changes
- Use debugging scripts to trace issues
- Save output for comparison
- Document findings for future reference







