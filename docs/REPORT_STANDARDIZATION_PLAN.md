# Report Standardization Plan

## Overview

This document outlines the plan to standardize all reports in the AMP application to ensure consistency, maintainability, and better user experience.

## Current Issues

### 1. Inconsistent Data Structure Patterns
- **Pattern 1**: `report_info` + separate JSONB columns (e.g., `nameplate_data`, `visual_inspection`)
- **Pattern 2**: Single `report_data` column with everything nested
- **Pattern 3**: Flat structure with individual columns
- **Pattern 4**: Mixed approaches within the same report

### 2. Inconsistent Field Naming
- Customer: `customer` vs `customerName` vs `customer_name`
- Date: `date` vs `testDate` vs `report_date`
- Temperature: Different structures and field names
- Technicians: `technicians` vs `testedBy` vs `userName`

### 3. Inconsistent Visual Inspection Patterns
- Array of objects vs flat key-value pairs
- Different NETA section naming conventions
- Inconsistent result options across reports

### 4. Database Table Issues
- Some reports use incorrect table names in code
- Missing tables referenced in PDF export
- Inconsistent column naming across tables

## Standardized Structure

### Core Components

1. **BaseReportData**: Common fields for all reports
   - `jobInfo`: Customer, address, date, technicians, etc.
   - `environmental`: Temperature, humidity, TCF
   - `metadata`: Status, report type, version
   - `comments`: General comments

2. **StandardNameplateData**: Equipment nameplate information
3. **StandardVisualInspection**: NETA visual inspection items
4. **StandardTestEquipment**: Test equipment used
5. **ElectricalTestResult**: Standardized test results

### Database Structure

```sql
-- Standardized columns for all report tables
id UUID PRIMARY KEY
job_id UUID REFERENCES jobs(id)
user_id UUID REFERENCES users(id)
created_at TIMESTAMP WITH TIME ZONE
updated_at TIMESTAMP WITH TIME ZONE

-- Standardized JSONB columns
report_info JSONB NOT NULL           -- BaseReportData
nameplate_data JSONB                 -- StandardNameplateData
visual_inspection JSONB              -- StandardVisualInspection  
test_equipment JSONB                 -- StandardTestEquipment
electrical_tests JSONB               -- Equipment-specific test data
equipment_specific JSONB             -- Any equipment-specific data
```

## Migration Strategy

### Phase 1: Foundation (Week 1)
- [x] Create standardized type definitions (`src/types/standardReportStructure.ts`)
- [x] Create migration utilities (`src/utils/reportMigration.ts`)
- [x] Create template component (`src/components/reports/StandardReportTemplate.tsx`)
- [ ] Update PDF export service to handle standardized structure

### Phase 2: Core Reports (Week 2-3)
Migrate the most commonly used reports first:

1. **SwitchgearReport.tsx** - Already partially standardized
2. **PanelboardReport.tsx** - Similar structure to switchgear
3. **DryTypeTransformerReport.tsx** - Common transformer type
4. **MediumVoltageCableVLFTest.jsx** - Convert to .tsx and standardize

### Phase 3: Transformer Reports (Week 4)
1. **LargeDryTypeTransformerMTSReport.tsx**
2. **LiquidFilledTransformerReport.tsx**
3. **OilInspectionReport.tsx**
4. **TwoSmallDryTyperXfmrATSReport.tsx**
5. **TwoSmallDryTyperXfmrMTSReport.tsx**

### Phase 4: Circuit Breaker Reports (Week 5)
1. **MediumVoltageCircuitBreakerReport.tsx**
2. **MediumVoltageCircuitBreakerMTSReport.tsx**
3. **LowVoltageCircuitBreakerThermalMagneticMTSReport.tsx**

### Phase 5: Specialized Reports (Week 6)
1. **CurrentTransformerTestATSReport.tsx**
2. **CurrentTransformerTestMTSReport.tsx**
3. **AutomaticTransferSwitchATSReport.tsx**
4. **MediumVoltageMotorStarterMTSReport.tsx**
5. **MediumVoltageSwitchOilReport.tsx**

### Phase 6: Final Reports & Cleanup (Week 7)
1. Remaining specialized reports
2. Database migration scripts
3. Update all asset creation patterns
4. Final testing and validation

## Implementation Guidelines

### For Each Report Migration:

1. **Analyze Current Structure**
   ```typescript
   const pattern = identifyReportPattern(currentReport);
   console.log(`Report follows ${pattern}`);
   ```

2. **Create Migration Function**
   ```typescript
   const migratedReport = migrateReportToStandardStructure(
     legacyReport, 
     'switchgear', 
     jobId, 
     userId
   );
   ```

3. **Update Component Structure**
   - Use standardized state management
   - Implement view/edit mode pattern
   - Use standard form components
   - Follow standard layout patterns

4. **Update Database Operations**
   - Use standardized save/load patterns
   - Update table structure if needed
   - Ensure proper asset creation

5. **Test Migration**
   - Verify existing reports load correctly
   - Test new report creation
   - Validate PDF export
   - Check asset linking

### Code Patterns to Follow

#### State Management
```typescript
const [formData, setFormData] = useState<BaseReportData>({
  jobInfo: createStandardJobInfo(),
  environmental: createStandardEnvironmental(),
  metadata: createStandardMetadata(reportType),
  comments: ''
});

const [nameplateData, setNameplateData] = useState<StandardNameplateData>({
  manufacturer: '',
  catalogNumber: '',
  serialNumber: ''
});
```

#### Visual Inspection
```typescript
const [visualInspection, setVisualInspection] = useState<StandardVisualInspection>({
  items: EQUIPMENT_SPECIFIC_VISUAL_ITEMS,
  generalComments: ''
});
```

#### Save Pattern
```typescript
const reportRecord: Omit<StandardReportRecord, 'id' | 'created_at' | 'updated_at'> = {
  job_id: jobId,
  user_id: user.id,
  report_info: formData,
  nameplate_data: nameplateData,
  visual_inspection: visualInspection,
  equipment_specific: equipmentSpecificData
};
```

## Database Migrations Required

### 1. Table Structure Updates
Some tables may need column additions:
```sql
-- Add missing standardized columns
ALTER TABLE report_table_name 
ADD COLUMN IF NOT EXISTS report_info JSONB,
ADD COLUMN IF NOT EXISTS nameplate_data JSONB,
ADD COLUMN IF NOT EXISTS visual_inspection JSONB;
```

### 2. Data Migration Scripts
For each table with existing data:
```sql
-- Migrate existing data to new structure
UPDATE report_table_name 
SET report_info = migrate_report_data(existing_columns)
WHERE report_info IS NULL;
```

### 3. Missing Tables
Create any missing tables referenced in PDF export:
- Verify all table names in `pdfExportService.ts` exist
- Create missing tables with standardized structure

## Validation & Testing

### 1. Automated Validation
```typescript
// Add to each migrated component
const validation = validateReportStructure(reportData, reportType);
if (!validation.isValid) {
  console.warn('Validation failed:', validation.errors);
}
```

### 2. Migration Testing
- Test loading existing reports
- Test creating new reports  
- Test PDF export functionality
- Test asset creation and linking

### 3. User Acceptance Testing
- Verify all reports render correctly
- Test edit/save functionality
- Verify data persistence
- Test print/export features

## Benefits of Standardization

### 1. Developer Experience
- Consistent patterns across all reports
- Easier to add new reports
- Reduced code duplication
- Better TypeScript support

### 2. User Experience  
- Consistent UI/UX across all reports
- Standardized keyboard navigation
- Consistent dark mode support
- Uniform print/export functionality

### 3. Maintenance
- Easier bug fixes across all reports
- Consistent validation and error handling
- Simplified testing
- Better code organization

### 4. Future Development
- Easier to add new features to all reports
- Consistent API patterns
- Better data analytics capabilities
- Simplified integration with external systems

## Timeline

| Week | Phase | Deliverables |
|------|-------|-------------|
| 1 | Foundation | Types, utilities, template, PDF service updates |
| 2-3 | Core Reports | 4 most common reports migrated |
| 4 | Transformer Reports | 5 transformer reports migrated |
| 5 | Circuit Breaker Reports | 3 circuit breaker reports migrated |
| 6 | Specialized Reports | 5 specialized reports migrated |
| 7 | Cleanup | Database migrations, final testing |

## Success Criteria

- [ ] All reports follow standardized structure
- [ ] All reports have consistent UI/UX
- [ ] PDF export works for all reports
- [ ] No data loss during migration
- [ ] Performance maintained or improved
- [ ] All tests pass
- [ ] Documentation updated

## Risk Mitigation

### Data Loss Prevention
- Backup all report data before migration
- Test migration scripts on copies first
- Implement rollback procedures
- Validate data integrity after migration

### Backwards Compatibility
- Keep migration utilities for future use
- Maintain ability to read legacy formats
- Gradual migration approach
- Fallback to legacy patterns if needed

### Performance Considerations
- Monitor query performance after migration
- Optimize JSONB queries if needed
- Consider indexing strategies
- Test with large datasets

## Next Steps

1. **Immediate (This Week)**
   - Review and approve this plan
   - Set up development branch for standardization work
   - Begin Phase 1 implementation

2. **Short Term (Next 2 Weeks)**
   - Complete Phase 1 and begin Phase 2
   - Start migrating core reports
   - Test migration utilities

3. **Medium Term (Next Month)**
   - Complete core report migrations
   - Begin specialized report migrations
   - Implement database migration scripts

4. **Long Term (Next Quarter)**
   - Complete all report migrations
   - Implement advanced features enabled by standardization
   - Consider additional optimizations 