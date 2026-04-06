# Reports System

A comprehensive technical report system for electrical testing following NETA (InterNational Electrical Testing Association) standards.

**Last Updated**: December 2024

---

## 📊 Report Categories

### ATS Reports (Acceptance Test Specifications)
Reports for new equipment installation and commissioning.

| Report | File | NETA Section |
|--------|------|--------------|
| Switchgear & Switchboard (ATS 21) | `SwitchgearReport.tsx` | 7.1 |
| Switchgear & Switchboard (ATS 25) | `SwitchgearSwitchboardAssembliesATS25Report.tsx` | 7.1.1 |
| Panelboard (ATS 21) | `PanelboardReport.tsx` | 7.1 |
| Panelboard (ATS 25) | `PanelboardAssembliesATS25Report.tsx` | 7.1.2 |
| Dry Type Transformer | `DryTypeTransformerReport.tsx` | 7.2.1 |
| Small LV Dry Type Transformer (ATS 25) | `TwoSmallDryTyperXfmrATSReport.tsx` | 7.2.1.1 |
| Large Dry Type Transformer | `LargeDryTypeTransformerReport.tsx` | 7.2.1 |
| Liquid Filled Transformer | `LiquidFilledTransformerReport.tsx` | 7.2.2 |
| Liquid Filled Xfmr (ATS 25) | `LiquidFilledXfmrATS25Report.tsx` | 7.2.2 |
| Low Voltage Cable (3 sets) | `3-LowVoltageCableATS.tsx` | 7.3.1 |
| Low Voltage Cable (12 sets) | `12setslowvoltagecables.tsx` | 7.3.1 |
| Medium Voltage VLF | `MediumVoltageVLFReport.tsx` | 7.3.2 |
| Medium Voltage VLF w/Tan Delta | `MediumVoltageCableVLFTest.jsx` | 7.3.2 |
| Low Voltage Switch | `LowVoltageSwitchReport.tsx` | 7.5 |
| Low Voltage Switch Multi-Device | `LowVoltageSwitchMultiDeviceTest.tsx` | 7.5 |
| Medium Voltage Switch (Oil) | `MediumVoltageSwitchOilReport.tsx` | 7.6.2 |
| Medium Voltage Switch (SF6) | `MediumVoltageSwitchSF6Report.tsx` | 7.6.3 |
| LV Circuit Breaker Electronic Trip (Primary) | `LowVoltageCircuitBreakerElectronicTripATSReport.tsx` | 7.6.1.1 |
| LV Circuit Breaker Electronic Trip (Secondary) | `LowVoltageCircuitBreakerElectronicTripATSSecondaryInjectionReport.tsx` | 7.6.1.1 |
| LV Circuit Breaker Thermal-Magnetic | `LowVoltageCircuitBreakerThermalMagneticATSReport.tsx` | 7.6.1.2 |
| LV Molded Case CB (ATS 25) | `LVMoldedCaseCircuitBreakerATS25Report.tsx` | 7.6.1.1.1 |
| LV Panelboard Small Breaker | `LowVoltagePanelboardSmallBreakerTestATSReport.tsx` | 7.6.1 |
| Medium Voltage Circuit Breaker | `MediumVoltageCircuitBreakerReport.tsx` | 7.6.2 |
| Current Transformer (ATS) | `12-CurrentTransformerTestATSReport.tsx` | 7.10 |
| Potential Transformer (ATS) | `PotentialTransformerATSReport.tsx` | 7.11 |
| Automatic Transfer Switch | `AutomaticTransferSwitchATSReport.tsx` | 7.24 |
| Grounding System | `GroundingSystemMaster.tsx` | 7.13 |
| Grounding Fall of Potential | `GroundingFallOfPotentialSlopeMethodTest.tsx` | 7.13.2 |

### MTS Reports (Maintenance Test Specifications)
Reports for periodic maintenance testing.

| Report | File | NETA Section |
|--------|------|--------------|
| Switchgear & Panelboard (MTS) | `SwitchgearReport.tsx` (MTS mode) | 7.1 |
| Large Dry Type Transformer (MTS) | `LargeDryTypeTransformerMTSReport.tsx` | 7.2.1 |
| Large Dry Type Xfmr (MTS) | `LargeDryTypeXfmrMTSReport.tsx` | 7.2.1 |
| Small Dry Type Transformer (MTS) | `TwoSmallDryTyperXfmrMTSReport.tsx` | 7.2.1 |
| Liquid Filled Xfmr Visual (MTS) | `LiquidXfmrVisualMTSReport.tsx` | 7.2.2 |
| Low Voltage Cable (MTS) | `3-LowVoltageCableMTS.tsx` | 7.3.1 |
| Medium Voltage VLF (MTS) | `MediumVoltageVLFMTSReport.tsx` | 7.3.2 |
| Tan Delta Test (MTS) | `TanDeltaChartMTS.tsx` | 7.3.2 |
| Low Voltage Switch Maint (MTS) | `6-LowVoltageSwitchMaintMTSReport.tsx` | 7.5 |
| LV CB Electronic Trip (MTS) | `LowVoltageCircuitBreakerElectronicTripMTSReport.tsx` | 7.6.1.1 |
| LV CB Thermal-Magnetic (MTS) | `LowVoltageCircuitBreakerThermalMagneticMTSReport.tsx` | 7.6.1.2 |
| Medium Voltage CB (MTS) | `MediumVoltageCircuitBreakerMTSReport.tsx` | 7.6.2 |
| MV Motor Starter (MTS) | `23-MediumVoltageMotorStarterMTSReport.tsx` | 7.15 |
| MV Switch (MTS) | `23-MediumVoltageSwitchMTSReport.tsx` | 7.6 |
| Current Transformer (MTS) | `12-CurrentTransformerTestMTSReport.tsx` | 7.10 |
| Voltage/Potential Transformer (MTS) | `13-VoltagePotentialTransformerTestMTSReport.tsx` | 7.11 |

### Specialized Reports

| Report | File | Purpose |
|--------|------|---------|
| GFI Trip Test | `GFITripTestReport.tsx` | Ground fault trip testing |
| Oil Inspection | `OilInspectionReport.tsx` | Transformer oil analysis |
| Oil Analysis | `OilAnalysisReport.tsx` | Detailed oil testing |
| Cable HiPot | `CableHiPotReport.tsx` | High potential testing |
| Relay Test | `RelayTestReport.tsx` | Protective relay testing |

---

## 🔄 Report Workflow

### Status Lifecycle
```
Draft → Submitted → In Review → Approved → Sent → Archived
                         ↓
                     Rejected
```

### User Roles & Permissions

| Role | Permissions |
|------|-------------|
| **Admin** | Full access - approve, review, configure |
| **Manager** | Review, approve, export PDFs |
| **Supervisor** | Review, recommend (no final approval) |
| **User** | View, export approved reports |

---

## ✅ Report Approval Process

### Overview

The Report Approval Workflow provides administrators and managers with a streamlined interface to review, approve, reject, or archive technical reports. The system uses a **modal-based viewer** that displays reports in a read-only preview mode, allowing reviewers to examine the full report content before making approval decisions.

### Accessing the Approval Workflow

The Report Approval Workflow can be accessed from two locations:

1. **Division Reports Page** (`/[division]/reports`)
   - Navigate to the "Approval" tab
   - View all reports across all jobs in the division

2. **Job Detail Page** (`/jobs/[jobId]`)
   - Navigate to the "Reports" tab (Admin only)
   - View reports specific to that job

### Viewing Reports

#### Opening a Report for Review

1. Click the **"View"** button next to any submitted report in the approval list
2. A full-screen modal opens displaying:
   - **Header Section**: Report title, status badge, and close button
   - **Report Preview**: Full report content in an iframe (read-only)
   - **Preview Mode Banner**: Indicates this is a read-only preview with option to open in new tab
   - **Review Actions Panel**: Collapsible panel at the bottom (only for submitted reports)

#### Modal Features

- **Full-Screen Display**: Modal takes up the entire viewport with a dark backdrop
- **Read-Only Preview**: Report is displayed in preview mode (`fromApproval=true` parameter prevents navigation)
- **Status Badge**: Color-coded badge showing current report status:
  - 🟡 **Submitted** (yellow) - Pending review
  - 🟢 **Approved** (green) - Approved and ready
  - 🔴 **Rejected** (red) - Rejected or marked as issue
- **Open in New Tab**: Link in preview banner allows opening the full report in a new browser tab

### Review Actions

#### Toggle Review Panel

For reports with **"Submitted"** status, a **"Show Review"** button appears at the bottom of the modal:

- **When Hidden**: Button shows "Show Review" with ▲ icon (pointing up)
- **When Visible**: Button shows "Hide Review" with ▼ icon (pointing down)
- Click the button to expand/collapse the review actions panel

#### Review Actions Available

When the review panel is expanded, reviewers can:

1. **Add Review Comments**
   - Text area for entering review notes
   - Comments are **required** when rejecting a report
   - Optional for approval or archiving

2. **Approve Report** (✓ Approve button)
   - Changes status from "Submitted" to "Approved"
   - Updates `approved_at` and `issued_at` timestamps
   - Creates revision history entry
   - Updates linked asset status if applicable

3. **Reject / Mark as Issue** (✕ Reject button)
   - Changes status from "Submitted" to "Rejected"
   - **Requires comments** - validation prevents rejection without notes
   - Creates revision history entry
   - Updates linked asset status

4. **Archive Report** (Archive button)
   - Changes status to "Archived"
   - Removes from active approval queue
   - Creates revision history entry

#### Review Process Workflow

```
1. Click "View" on submitted report
   ↓
2. Review report content in modal
   ↓
3. Click "Show Review" to expand actions panel
   ↓
4. Add comments (if needed)
   ↓
5. Click action button:
   - Approve → Report becomes approved
   - Reject → Report marked as rejected (requires comments)
   - Archive → Report archived
   ↓
6. Modal closes automatically
   ↓
7. Report list refreshes with updated status
```

### Technical Implementation

#### Modal Architecture

The report viewer uses a **vanilla JavaScript modal** rendered directly to `document.body`, completely isolated from React's component lifecycle. This approach:

- **Prevents Unmounting Issues**: Modal survives parent component re-renders
- **Isolates from React State**: Avoids conflicts with iframe-loaded React apps
- **Stable Display**: Modal remains open even if parent components unmount/remount

#### URL Parsing

The system correctly handles different report URL structures:

- **3-part URLs**: `/jobs/{jobId}/{reportSlug}/{reportId}`
  - Example: `/jobs/123/switchgear-report/abc-456`
  
- **4-part URLs**: `/jobs/{jobId}/{reportSlug}/{substation}/{reportId}`
  - Example: `/jobs/123/gfi-trip-test-report/electrical_room/abc-456`
  - Used for reports with substation identifiers (e.g., GFI Trip Test)

#### Preview Mode

Reports opened from the approval workflow include the `fromApproval=true` query parameter:

- Prevents navigation after save operations
- Maintains read-only preview state
- Allows "Open in new tab" for full report access

### Filtering & Search

The approval workflow includes comprehensive filtering options:

- **Status Filter**: Filter by Draft, Submitted, In Review, Approved, Rejected, Archived, Sent
- **Report Type Filter**: Filter by specific report type (e.g., "GFI Trip Test Report")
- **Date Range**: Filter by submission date range
- **Search**: Text search across report titles and metadata
- **Division Filter**: Filter by division (when accessed from division page)
- **Job Filter**: Filter by specific job (when accessed from job detail page)

### Metrics Dashboard

The approval workflow displays real-time metrics:

- **Total Reports**: All reports in the system
- **Draft**: Reports being edited
- **Submitted**: Reports pending review
- **In Review**: Reports currently being reviewed
- **Approved**: Successfully approved reports
- **Rejected**: Reports marked as issues
- **Archived**: Archived reports
- **Sent**: Reports sent to customers

### Revision History

All approval actions are tracked in the report's `revision_history` array:

```typescript
{
  version: number,
  timestamp: string,
  user_id: string,
  status: 'approved' | 'rejected' | 'archived',
  comments: string
}
```

### Best Practices

1. **Review Before Approving**: Always review the full report content before approving
2. **Add Comments**: Include meaningful comments, especially when rejecting
3. **Use Archive Carefully**: Archive only reports that are no longer relevant
4. **Check Linked Assets**: Approval may update related asset statuses
5. **Verify Data**: Ensure report data is complete and accurate before approval

---

## 🖨️ Print Output

All reports support professional print output with:

### Header Elements
- AMP logo
- Report title
- PASS/FAIL status badge
- Job information

### Print-Specific Tables
Reports render special print tables with:
- Borders visible (black)
- Text in black
- White backgrounds
- No interactive elements
- Professional formatting

### CSS Classes
```css
.print:block      /* Show only when printing */
.print:hidden     /* Hide when printing */
.print:border-black  /* Black borders for print */
.print:text-black    /* Black text for print */
```

---

## 📁 File Structure

```
reports/
├── common/
│   ├── JobInfoPrintTable.tsx      # Reusable job info table
│   └── NameplatePrintTable.tsx    # Reusable nameplate table
├── reportMappings.ts              # Report name/slug mappings
├── ReportUtils.ts                 # Shared utilities
├── ReportWrapper.tsx              # Common wrapper component
├── ReportDetail.tsx               # Report detail view
├── StandardReportTemplate.tsx     # Base template
└── [Individual Report Files]
```

---

## 🔧 Report Configuration

### Report Mappings (`reportMappings.ts`)
Maps URL slugs to display names:

```typescript
export const REPORT_NAMES: { [key: string]: string } = {
  'switchgear-report': '1-Switchgear, Switchboard, Panelboard Inspection & Test Report ATS 21',
  'gfi-trip-test-report': 'Ground Fault Trip Test Report',
  // ... more mappings
};
```

### Helper Functions
```typescript
// Get display name from URL slug
getReportName('switchgear-report') // Returns full name

// Get asset name with identifier
getAssetName('switchgear-report', 'Substation A') // Returns "Name - Identifier"
```

---

## 📊 Database Tables

### Report-Specific Tables (neta_ops schema)

| Table | Report Type |
|-------|-------------|
| `gfi_trip_test_reports` | GFI Trip Test |
| `current_transformer_test_ats_reports` | CT ATS |
| `current_transformer_test_mts_reports` | CT MTS |
| `voltage_potential_transformer_mts_reports` | PT MTS |
| `medium_voltage_circuit_breaker_reports` | MV CB |
| `automatic_transfer_switch_ats_reports` | ATS |
| `low_voltage_panelboard_small_breaker_reports` | Panelboard |
| `medium_voltage_vlf_mts_reports` | MV VLF MTS |

### Common Fields
All report tables include:
- `id` (UUID, primary key)
- `job_id` (UUID, foreign key to jobs)
- `user_id` (UUID, foreign key to auth.users)
- `customer`, `address`, `job_number`
- `date`, `technicians`, `substation`
- `test_equipment` (JSONB)
- `status` (PASS/FAIL)
- `created_at`, `updated_at`

---

## 🛠️ Creating New Reports

### 1. Create Report Component
```typescript
// src/components/reports/NewReport.tsx
import { ReportWrapper } from './ReportWrapper';
import { getReportName, getAssetName } from './reportMappings';

const REPORT_SLUG = 'new-report';
const TABLE_NAME = 'new_reports';

const NewReport: React.FC = () => {
  // Component implementation
  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Report content */}
    </ReportWrapper>
  );
};
```

### 2. Add to Report Mappings
```typescript
// reportMappings.ts
export const REPORT_NAMES = {
  // ... existing
  'new-report': 'New Report Full Name',
};
```

### 3. Create Database Table
```sql
-- Database Scripts/Report Tables/new_reports.sql
CREATE TABLE IF NOT EXISTS neta_ops.new_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  -- ... fields
);
```

### 4. Add Route
Add route to main router for the new report.

---

## 📝 Style Requirements

### All Reports Must Include:
1. **Print CSS** - Professional output for printing
2. **Dark Mode Support** - `dark:` modifier classes
3. **Responsive Layout** - Works on various screen sizes
4. **Status Badge** - PASS/FAIL indicator
5. **Job Information** - Standard job info section
6. **Test Equipment** - Equipment tracking section

### Brand Standards
- Primary Color: `#f26722` (orange)
- Headers: Use orange divider bars
- Tables: Bordered with proper spacing
- Status: Green for PASS, Red for FAIL

---

## 🔍 Report Import System

The `/src/services/reportImport/` directory contains 42 specialized importers for parsing existing report data:

- `BaseImporter.ts` - Base class for all importers
- Individual importers for each report type
- Type definitions in `types.ts`

---

## 📚 Related Documentation

- `/documentation/Feature Documentation/Deliverables-System.md` - Deliverables workflow
- `/documentation/Technical Reference/REPORT_STANDARDIZATION_PLAN.md` - Standardization efforts
- `/Database Scripts/Report Tables/README.md` - Database setup
