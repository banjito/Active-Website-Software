# Recent Features Summary

## Overview

This document provides a quick reference guide to recently documented features and changes in the ampOS system. All features are fully documented in their respective detailed documentation files.

**Last Updated**: January 2025

---

## Quick Reference

| Feature | Documentation | Key Points |
|--------|---------------|------------|
| **Signature Profiles** | [SIGNATURE_PROFILES.md](./SIGNATURE_PROFILES.md) | Reusable signature templates for executive summaries |
| **Equipment Tables** | [EQUIPMENT_TABLES.md](./EQUIPMENT_TABLES.md) | Field equipment management with categories and tracking |
| **Report Equipment** | [REPORT_EQUIPMENT.md](./REPORT_EQUIPMENT.md) | Test equipment integration in reports |
| **Scope Quantity** | [SCOPE_QUANTITY_CHANGES.md](./SCOPE_QUANTITY_CHANGES.md) | Quantity selection for combined quotes |
| **Letter Proposals** | [LETTER_PROPOSAL_CHANGES.md](./LETTER_PROPOSAL_CHANGES.md) | Enhanced letter proposal system with duplicates and toggles |
| **Executive Summary** | [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md) | Executive summary generation with signature integration |

---

## Signature Profiles System

### What It Does
Allows users to create, manage, and reuse signature information when generating executive summaries.

### Key Features
- Create signature profiles with name, title, email, phone
- Organize by section (Project Manager, Reviewed By, etc.)
- Select multiple profiles when generating documents
- Automatic integration into executive summaries

### Database
- Table: `neta_ops.signature_profiles`
- Column in `generated_documents`: `selected_signature_profile_ids` (UUID[])

### Components
- `SignatureProfileManager.tsx` - Full CRUD interface
- `SignatureProfileSelector.tsx` - Multi-select interface

**See**: [SIGNATURE_PROFILES.md](./SIGNATURE_PROFILES.md) for complete details.

---

## Equipment Tables System

### What It Does
Manages field equipment, equipment categories, calibration tracking, and equipment assignments.

### Key Features
- Equipment categories for organization
- Field equipment with AMP IDs
- Calibration date tracking
- Tracking URL integration
- Equipment assignment to technicians

### Database
- Table: `neta_ops.equipment_categories` - Equipment categories
- Table: `neta_ops.field_equipment` - Field equipment with calibration
- Table: `common.equipment` - General equipment (legacy)
- Column: `tracking_url` in `field_equipment`

### Components
- `FieldEquipmentList.tsx` - Main equipment list
- `EquipmentTable.tsx` - Equipment table display
- `EquipmentManagement.tsx` - Full management interface

**See**: [EQUIPMENT_TABLES.md](./EQUIPMENT_TABLES.md) for complete details.

---

## Report Equipment Integration

### What It Does
Integrates equipment data into technical reports, tracking test equipment used during testing.

### Key Features
- Test equipment tracking in reports
- AMP ID integration
- Serial number tracking
- Calibration information display
- Equipment selection from field equipment database

### Database
- Column: `test_equipment` (JSONB) in report tables
- Legacy: `report_info.testEquipment` in some reports

### Data Structure
```typescript
testEquipment: {
  megohmmeter: { name, serialNumber, ampId, calDate },
  lowResistanceOhmmeter: { name, serialNumber, ampId }
}
```

**See**: [REPORT_EQUIPMENT.md](./REPORT_EQUIPMENT.md) for complete details.

---

## Scope Quantity Changes

### What It Does
Allows users to specify quantities when combining multiple quotes into a single letter proposal.

### Key Features
- Quantity selection for each quote
- Price multiplication (base_price × quantity)
- Combined quote support
- Visual quantity inputs

### Implementation
- Component: `EstimateSheet.tsx`
- State: `scopeQuantities` (Record<number, number>)
- Calculation: `price = base_price × quantity`

### Use Cases
- Multiple identical units (e.g., 5 transformers)
- Mixed quantities (different items with different quantities)
- Single unit (default quantity: 1)

**See**: [SCOPE_QUANTITY_CHANGES.md](./SCOPE_QUANTITY_CHANGES.md) for complete details.

---

## Letter Proposal Changes

### What It Does
Enhanced letter proposal system with duplicate functionality, section visibility toggles, and improved state management.

### Key Features
- **Duplicate Letters**: One-click duplication
- **Section Visibility**: Toggle sections on/off
- **Rename Letters**: Customize letter titles
- **Improved State**: Better persistence and restoration
- **Combined Quotes**: Support for multiple quotes with quantities

### Database
- Table: `business.letter_proposals`
- Columns: `title`, `html`, `net_30_price`, `neta_standard`
- State: Stored in user preferences

### Components
- `EstimateSheet.tsx` - Main letter proposal component
- `useLetterProposalState` hook - State management

**See**: [LETTER_PROPOSAL_CHANGES.md](./LETTER_PROPOSAL_CHANGES.md) for complete details.

---

## Executive Summary Pages

### What It Does
Generates professional executive summary documents for job deliverables with signature integration.

### Key Features
- Executive summary generation
- Signature profile integration
- Customizable content sections
- Table of contents generation
- Professional formatting
- PDF generation via deliverables

### Database
- Table: `neta_ops.generated_documents`
- Column: `doc_type = 'summary'`
- Column: `selected_signature_profile_ids` (UUID[])

### Components
- `JobDetail.tsx` - Generation logic
- `DeliverableViewer.tsx` - Viewing interface
- `SignatureProfileSelector.tsx` - Profile selection

**See**: [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md) for complete details.

---

## Database Migrations

### Required Migrations

1. **Signature Profiles**
   - `create_signature_profiles_table.sql`
   - `update_generated_documents_for_signature_profiles.sql`
   - `add_signature_sections_to_generated_documents.sql`

2. **Equipment Categories**
   - `create_equipment_categories_table.sql`
   - `add_tracking_url_to_field_equipment.sql`

3. **Other Changes**
   - `add_documents_stage_to_opportunities.sql`
   - `add_substation_to_assets.sql`

All migrations are in: `Database Scripts/Setup & Configuration/`

---

## Component Locations

### Signature System
- `src/components/jobs/SignatureProfileManager.tsx`
- `src/components/jobs/SignatureProfileSelector.tsx`
- `src/components/jobs/JobDetail.tsx` (integration)

### Equipment System
- `src/components/equipment/FieldEquipmentList.tsx`
- `src/components/equipment/EquipmentTable.tsx`
- `src/components/equipment/EquipmentManagement.tsx`
- `src/lib/services/equipmentService.ts`

### Letter Proposals
- `src/components/estimates/EstimateSheet.tsx`
- `src/hooks/useUserPreferences.ts` (state management)

### Executive Summaries
- `src/components/jobs/JobDetail.tsx` (generation)
- `src/components/jobs/DeliverableViewer.tsx` (viewing)

---

## Integration Points

### Signature Profiles → Executive Summaries
- Profiles selected when generating executive summary
- Profiles included in generated HTML
- Profile IDs stored in `selected_signature_profile_ids`

### Equipment → Reports
- Equipment data stored in `test_equipment` JSONB column
- AMP IDs link to field equipment database
- Equipment displayed in report print view

### Scope Quantity → Letter Proposals
- Quantities set when combining quotes
- Prices calculated with quantities
- Quantities embedded in letter HTML

### Letter Proposals → Opportunities
- Letter proposals linked to opportunities
- `quoted_amount` updated from letter `net_30_price`
- `letter_proposal_date` set when letter saved

---

## Common Workflows

### Generate Executive Summary
1. Navigate to Job Detail
2. Click "Generate Executive Summary"
3. Select signature profiles
4. Summary generated with signatures
5. Saved to `generated_documents` table

### Create Letter Proposal
1. Navigate to Estimate Sheet
2. Select quote(s) for letter
3. Set scope quantities (if combining)
4. Select NETA standard
5. Toggle sections as needed
6. Save letter proposal
7. Opportunity `quoted_amount` updated

### Manage Equipment
1. Navigate to Equipment Management
2. View equipment by category/status
3. Create/edit equipment records
4. Assign to technicians
5. Track calibration dates

---

## Troubleshooting Quick Reference

| Issue | Check |
|-------|-------|
| Signatures not appearing | Verify profiles selected, check profile IDs |
| Equipment not saving | Check RLS policies, verify required fields |
| Quantities not calculating | Verify base prices, check quantity inputs |
| Letter not saving | Check database connection, verify RLS |
| Summary not generating | Verify job data, check signature selection |

See individual documentation files for detailed troubleshooting.

---

## Related Documentation

- [Deliverables System](./Deliverables-System.md) - Document delivery workflow
- [Database Schema](../Database%20&%20Schema/) - Database structure
- [Migration & Fixes](../Migration%20&%20Fixes/) - Database migrations

---

## Future Enhancements

All documentation files include "Future Enhancements" sections with potential improvements for each feature.

---

## Getting Help

For detailed information on any feature, refer to the specific documentation file:

- [SIGNATURE_PROFILES.md](./SIGNATURE_PROFILES.md)
- [EQUIPMENT_TABLES.md](./EQUIPMENT_TABLES.md)
- [REPORT_EQUIPMENT.md](./REPORT_EQUIPMENT.md)
- [SCOPE_QUANTITY_CHANGES.md](./SCOPE_QUANTITY_CHANGES.md)
- [LETTER_PROPOSAL_CHANGES.md](./LETTER_PROPOSAL_CHANGES.md)
- [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md)
