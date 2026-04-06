# Deliverables System

**Last Updated**: December 2024

---

## Overview

The Deliverables system provides a comprehensive way to package, review, and deliver technical reports to customers. It enables teams to combine multiple reports with professional cover letters and executive summaries into polished deliverable packages.

---

## Key Features

### 1. **Create Deliverables**
- Name and describe each deliverable
- Select a cover letter (which contains report selections)
- Add optional executive summary
- Generate combined PDF with all documents

### 2. **PDF Generation**
- **Cover Letter** - Professional introduction document
- **Executive Summary** - Optional overview of findings
- **Reports** - All selected technical reports in order
- **Single PDF Output** - Combined document ready for customer delivery

### 3. **Status Tracking**
Deliverables progress through the following statuses:

| Status | Description |
|--------|-------------|
| **Draft** | Initial creation and editing |
| **In Review** | Submitted for approval |
| **Approved** | Accepted and ready for delivery |
| **Rejected** | Not accepted (with rejection reason) |
| **Delivered** | Final state after delivery to customer |

### 4. **Document Locking**
- Cover letters are **locked** when deliverables are approved/sent
- Prevents accidental changes to delivered documents
- Tracks who locked and when

### 5. **Review & Approval Workflow**
- Submit deliverables for review
- Approve or reject with comments
- Track approval history
- View rejection reasons

---

## Components

### JobDeliverables.tsx
Main deliverables management component.

**Location**: `src/components/jobs/JobDeliverables.tsx`

**Features**:
- List all deliverables for a job
- Create new deliverables
- Select cover letters
- View deliverable details
- Status management
- Delete draft deliverables

### DeliverableViewer.tsx
PDF generation and viewing component.

**Location**: `src/components/jobs/DeliverableViewer.tsx`

**Features**:
- Render cover letter
- Render executive summary
- Load and render all selected reports
- Generate combined PDF
- Print-ready output
- Progress indicators

---

## Database Structure

### Deliverables Table
```sql
neta_ops.deliverables
├── id (UUID, PK)
├── job_id (UUID, FK → jobs)
├── name (TEXT, required)
├── description (TEXT)
├── status (TEXT: draft/in_review/approved/rejected/delivered)
├── cover_letter_id (UUID, FK → generated_documents, required)
├── executive_summary_id (UUID, FK → generated_documents)
├── combined_pdf_url (TEXT)
├── created_by (UUID)
├── created_at (TIMESTAMPTZ)
├── updated_at (TIMESTAMPTZ)
├── approved_by (UUID)
├── approved_at (TIMESTAMPTZ)
├── rejected_by (UUID)
├── rejected_at (TIMESTAMPTZ)
├── rejection_reason (TEXT)
└── delivered_at (TIMESTAMPTZ)
```

### Generated Documents Table
```sql
neta_ops.generated_documents
├── id (UUID, PK)
├── job_id (UUID, FK → jobs)
├── name (TEXT)
├── doc_type (TEXT: cover/summary/both)
├── html (TEXT) -- Full HTML content
├── selected_report_ids (UUID[]) -- Reports included
├── status (TEXT: draft/locked)
├── locked_at (TIMESTAMPTZ)
├── locked_by (UUID)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

---

## Workflow

### Creating a Deliverable

1. **Navigate to Job Details**
   - Open any job
   - Click the **"Deliverables"** tab

2. **Create Cover Letter First**
   - Go to Generated Documents
   - Create a cover letter
   - Select which reports to include
   - Save the cover letter

3. **Create Deliverable**
   - Click **"Create Deliverable"** button
   - Enter a name (required)
   - Add optional description
   - Select the cover letter
   - Click **"Create Deliverable"**

### Managing Deliverables

| Status | Available Actions |
|--------|-------------------|
| **Draft** | Edit, Delete, Submit for Review |
| **In Review** | Approve, Reject (with reason) |
| **Approved** | Mark as Delivered, View PDF |
| **Rejected** | View reason, Create new |
| **Delivered** | View only |

### Generating PDF

1. Navigate to deliverable
2. Click "View Deliverable" or navigate to `/jobs/:jobId/deliverable/:deliverableId`
3. Review the content preview
4. Click **"Generate PDF"**
5. Wait for progress (loading each report)
6. Print dialog opens with combined document
7. Select "Save as PDF" or print directly

---

## PDF Generation Process

The DeliverableViewer handles PDF generation in several steps:

### 1. Load Deliverable Data
```typescript
// Load deliverable, cover letter, executive summary
const { data: deliverableData } = await supabase
  .schema('neta_ops')
  .from('deliverables')
  .select('*')
  .eq('id', deliverableId);
```

### 2. Load Reports
```typescript
// Get report assets by IDs from cover letter
const reportIds = coverLetter.selected_report_ids;
const { data: assetData } = await supabase
  .schema('neta_ops')
  .from('assets')
  .select('id, name, file_url')
  .in('id', reportIds);
```

### 3. Extract Report HTML
For each report:
1. Create hidden iframe
2. Load report with `?print=true&embedded=true`
3. Wait for content to render
4. Extract HTML and styles
5. Convert images to base64

### 4. Build Combined Document
```html
<!DOCTYPE html>
<html>
<head>
  <!-- Print styles -->
  <!-- All extracted styles -->
</head>
<body>
  <!-- Cover Letter -->
  <div class="print-section cover-letter-section">...</div>
  
  <!-- Executive Summary (if present) -->
  <div class="print-section exec-summary-section">...</div>
  
  <!-- Reports -->
  <div class="print-section report-section">...</div>
</body>
</html>
```

### 5. Open Print Dialog
The combined HTML is written to a new window and auto-triggers print.

---

## Print Styling

### CSS Classes

```css
/* Show only when printing */
.print:block { display: block !important; }

/* Hide when printing */
.print:hidden { display: none !important; }

/* Page breaks */
.print-section {
  page-break-after: always;
  break-after: page;
}

/* Color preservation */
* {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
```

### Report Print Requirements

All reports must support print mode:
- Hide interactive elements (dropdowns, buttons)
- Show print-specific tables (`.job-info-print`)
- Black text on white background
- Visible borders
- Professional formatting

---

## Database Setup

### Required Migrations

Run these scripts in order:

```sql
-- 1. Add report selection to cover letters
/Database Scripts/Setup & Configuration/add_report_selection_to_cover_letters.sql

-- 2. Add status/locking to generated documents
/Database Scripts/Setup & Configuration/add_status_to_generated_documents.sql

-- 3. Create deliverables table
/Database Scripts/Setup & Configuration/create_deliverables_table.sql

-- 4. Add update/delete policies
/Database Scripts/Setup & Configuration/add_update_delete_policies_generated_documents.sql
```

---

## Integration Points

### Job Details Page
- Deliverables tab in JobDetail.tsx
- Shows deliverable count badge
- Quick access to create/view

### Assets System
- Reports are selected from job assets
- Cover letters track `selected_report_ids`
- Maintains report order

### Generated Documents
- Cover letters and summaries stored here
- Document locking prevents changes
- HTML content for rendering

---

## Troubleshooting

### "Database migration required" Error
Run the migration scripts listed above in order.

### PDF Not Generating
1. Allow popups in browser
2. Check console for errors
3. Verify all reports load correctly
4. Ensure cover letter has `selected_report_ids`

### Missing Reports in PDF
1. Verify reports are saved correctly
2. Check `file_url` format: `report:/jobs/:jobId/:type/:substation/:reportId`
3. Ensure reports have print-mode support

### Styles Not Applied in Print
1. Add `-webkit-print-color-adjust: exact`
2. Use inline styles for critical elements
3. Convert images to base64

---

## Future Enhancements

### Planned Features
1. **Email Integration** - Send deliverables via email
2. **Customer Portal** - Customers view their deliverables
3. **Templates** - Reusable deliverable configurations
4. **Version History** - Track deliverable revisions
5. **Digital Signatures** - Customer acknowledgment

### Phase 2 Features
1. Automatic cover letter generation
2. AI-generated executive summaries
3. Customer feedback integration
4. Delivery tracking

---

## Technical Notes

### Routes
- Deliverables Tab: `/jobs/:jobId` (Deliverables tab)
- Deliverable Viewer: `/jobs/:jobId/deliverable/:deliverableId`

### Environment
- Requires print popup permissions
- Works best in Chrome/Edge
- Safari may have print differences

### Performance
- Large deliverables (10+ reports) may take 30+ seconds
- Images are converted to base64 for reliability
- Reports load sequentially to avoid memory issues
