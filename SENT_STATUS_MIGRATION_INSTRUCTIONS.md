# Sent Status Migration Instructions

To add the "sent" status to the technical reports system, you need to run the following SQL commands in your Supabase dashboard:

## Steps:

1. Go to your Supabase dashboard
2. Navigate to the SQL Editor
3. Run the following SQL commands:

```sql
-- Drop the existing constraint
ALTER TABLE neta_ops.technical_reports 
DROP CONSTRAINT IF EXISTS technical_reports_status_check;

-- Add the new constraint with 'sent' status
ALTER TABLE neta_ops.technical_reports 
ADD CONSTRAINT technical_reports_status_check 
CHECK (status IN ('draft', 'submitted', 'in-review', 'approved', 'rejected', 'archived', 'sent'));

-- Also update the assets table if it has a similar constraint
ALTER TABLE neta_ops.assets 
DROP CONSTRAINT IF EXISTS assets_status_check;

ALTER TABLE neta_ops.assets 
ADD CONSTRAINT assets_status_check 
CHECK (status IN ('in_progress', 'ready_for_review', 'approved', 'issue', 'sent'));
```

## What this does:

1. **Adds 'sent' status**: The technical_reports table will now accept 'sent' as a valid status
2. **Updates assets table**: The assets table will also accept 'sent' as a valid status
3. **Maintains data integrity**: Only approved reports can be marked as sent (enforced by the application logic)

## After running the migration:

The "Sent" tab will be available in the Report Approval Workflow, and users will be able to mark approved reports as sent from the approved tab.

## Verification:

After running the migration, you can verify it worked by checking that:
1. The "Sent" tab appears in the Report Approval Workflow
2. Approved reports show a "Mark as Sent" button
3. Reports can be successfully marked as sent
