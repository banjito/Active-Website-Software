# Default Job Files Feature

## Overview

The Default Job Files feature automatically adds predefined template files to every new job created in the system. This ensures consistency across all jobs and helps technicians start with the necessary documentation templates.

## How It Works

When a new job is created through any of the following methods:
- JobCreationForm (used in division dashboards)
- JobList component (manual job creation)
- OpportunityDetail (converting opportunities to jobs)

The system automatically:
1. Creates the job record
2. Adds default files based on the job's division
3. Links the files to the job
4. Shows confirmation to the user

## Default Files Structure

### Global Default Files
These files are added to **ALL** jobs regardless of division:
- Safety Checklist
- Work Order
- Equipment Inspection Report
- Job Completion Report

### Division-Specific Files
Additional files are added based on the job's division:

**Calibration Division:**
- Calibration Certificate Template
- Measurement Uncertainty Analysis
- Calibration Data Sheet

**Armadillo Division:**
- Armadillo Testing Procedures
- Quality Control Checklist

**Scavenger Division:**
- Scavenger Operations Manual
- Environmental Assessment

**NETA Division:**
- NETA Standards Compliance
- Electrical Testing Report

**North Alabama Division:**
- North Alabama Regional Procedures

## Configuration

### Main Configuration File
Edit `src/lib/config/defaultJobFiles.config.ts` to:
- Add new default files
- Modify existing files
- Configure division-specific files
- Adjust system settings

### Adding New Global Default Files
```typescript
import { addGlobalDefaultFile } from '@/lib/config/defaultJobFiles.config';

addGlobalDefaultFile({
  name: 'New Template',
  description: 'Description of the template',
  file_url: 'template://new-template',
  template_type: 'new_template',
  status: 'pending'
});
```

### Adding Division-Specific Files
```typescript
import { addDivisionDefaultFile } from '@/lib/config/defaultJobFiles.config';

addDivisionDefaultFile('calibration', {
  name: 'Special Calibration Form',
  description: 'Special form for calibration jobs',
  file_url: 'template://special-calibration',
  template_type: 'special_calibration',
  status: 'pending'
});
```

### System Settings
```typescript
export const DEFAULT_FILE_SETTINGS = {
  ENABLE_DEFAULT_FILES: true,           // Enable/disable the entire feature
  ALLOW_DISABLE_PER_JOB: false,        // Allow users to opt-out per job
  DEFAULT_STATUS: 'pending',            // Default status for new files
  SHOW_NOTIFICATION: true,              // Show success notifications
  FAIL_ON_DEFAULT_FILE_ERROR: false    // Fail job creation if files can't be added
};
```

## File URL Formats

Default files use special URL formats to indicate they are templates:

- `template://safety-checklist` - Template file (not a real URL)
- `report://jobs/{jobId}/report-type/{reportId}` - Generated report
- `https://...` - Real file URL from storage

## User Experience

### For End Users
1. **Job Creation**: Users create jobs normally through the interface
2. **Automatic Files**: Default files appear automatically in the job
3. **File Management**: Users can upload additional files as needed
4. **File Status**: Default files start with "pending" status
5. **Normal Workflow**: Users work with files as usual (edit, approve, etc.)

### For Administrators
1. **Easy Configuration**: Modify default files in the config file
2. **Division Management**: Set different defaults per division
3. **System Control**: Enable/disable the feature globally
4. **Error Handling**: Jobs still create even if default files fail

## Technical Implementation

### Service Layer
- `src/lib/services/defaultJobFiles.ts` - Main service functions
- `src/lib/config/defaultJobFiles.config.ts` - Configuration file

### Integration Points
- `JobCreationForm.tsx` - Division dashboard job creation
- `JobList.tsx` - Manual job creation
- `OpportunityDetail.tsx` - Opportunity to job conversion

### Database Schema
Default files are stored as regular assets in the `neta_ops.assets` table with:
- `template_type` field to identify template files
- `file_url` starting with `template://` for template files
- Linked to jobs through `neta_ops.job_assets` table

## Troubleshooting

### Common Issues

**Default files not appearing:**
1. Check `DEFAULT_FILE_SETTINGS.ENABLE_DEFAULT_FILES` is `true`
2. Verify the division name matches the config
3. Check browser console for errors

**Job creation failing:**
1. Check if `FAIL_ON_DEFAULT_FILE_ERROR` is `true`
2. Look for database permission issues
3. Verify the assets table exists

**Wrong files for division:**
1. Check division name mapping in job creation
2. Verify division-specific files in config
3. Check console logs for division value

### Debug Information
The system logs detailed information about default file operations:
- Job creation success/failure
- Default files added
- Division-specific file selection
- Error details

## Future Enhancements

Potential improvements:
1. **User Preferences**: Allow users to customize their default files
2. **Template Management**: Web interface to manage templates
3. **File Versioning**: Track template versions and updates
4. **Role-Based Files**: Different defaults based on user roles
5. **Conditional Files**: Add files based on job type or customer
6. **Bulk Operations**: Apply default files to existing jobs

## Support

For questions or issues with default job files:
1. Check the browser console for error messages
2. Verify configuration in `defaultJobFiles.config.ts`
3. Review database logs for permission issues
4. Contact the development team for advanced troubleshooting 