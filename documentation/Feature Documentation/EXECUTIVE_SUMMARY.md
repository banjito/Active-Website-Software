# Executive Summary Pages

## Overview

The Executive Summary system generates professional executive summary documents for job deliverables. These summaries provide high-level overviews of work performed, test results, and key outcomes, and include signature sections for project managers and reviewers.

**Last Updated**: January 2025

---

## Table of Contents

1. [Features](#features)
2. [Document Structure](#document-structure)
3. [Signature Integration](#signature-integration)
4. [Generation Process](#generation-process)
5. [Database Schema](#database-schema)
6. [Component Integration](#component-integration)
7. [Deliverables Integration](#deliverables-integration)

---

## Features

### Core Capabilities

- **Executive Summary Generation**: Generate professional executive summaries
- **Signature Profiles**: Select and include signature profiles
- **Customizable Content**: Editable summary and test results sections
- **Job Information**: Automatic inclusion of job details
- **Table of Contents**: Auto-generated TOC from reports
- **Professional Formatting**: NETA-compliant document formatting
- **PDF Generation**: Export to PDF via deliverables system

### Key Sections

1. **Header**: AMP logo and branding
2. **Metadata**: Project number and date
3. **Introduction**: Customer and site address
4. **Summary**: Brief description of scope, dates, and outcomes
5. **Test Results/Discrepancies**: Overall results and discrepancies
6. **Signatures**: Project manager and reviewer signatures
7. **Footer**: Page numbers and document info

---

## Document Structure

### HTML Template

```html
<div class="amp-page">
  <div class="amp-stripe"></div>
  <div class="amp-badge">
    <img src="[AMP Logo URL]" alt="AMP" />
  </div>
  <div class="amp-page-content">
    <div class="exec-title">Executive Summary</div>
    <div class="exec-title-rule"></div>
    <div class="exec-meta"><b>AMP Project #[jobNumber]</b></div>
    <div class="exec-meta">[Date]</div>
    <div class="exec-section">
      AMP is pleased to present this executive summary to <b>[Customer/Company]</b>.
    </div>
    <div class="exec-section">
      <b>Site Address</b> [Site Address]
    </div>
    <div class="exec-section" contenteditable>
      <b>Summary</b> Enter a brief description of scope, dates, and key outcomes.
    </div>
    <div class="exec-section" contenteditable>
      <b>Test Result/Discrepancies</b> Enter overall results and any discrepancies.
    </div>
    [Signature Sections]
  </div>
  [Footer]
</div>
```

### CSS Classes

- `.amp-page` - Page container
- `.amp-stripe` - Top stripe decoration
- `.amp-badge` - Logo container
- `.amp-page-content` - Main content area
- `.exec-title` - Executive Summary title
- `.exec-title-rule` - Title underline
- `.exec-meta` - Metadata (project number, date)
- `.exec-section` - Content sections
- `.sig-grid` - Signature grid container
- `.sig-col` - Signature column

---

## Signature Integration

### Signature Profile Selection

When generating executive summary:

1. User clicks "Generate Executive Summary"
2. Signature Profile Selector dialog opens
3. User selects desired profiles
4. Profiles are grouped by section title
5. Selected profiles are included in document

### Signature HTML Generation

```typescript
const generateSignatureSectionsHTML = async (profileIds: Set<string>) => {
  // Fetch profiles
  const { data: profiles } = await supabase
    .schema('neta_ops')
    .from('signature_profiles')
    .select('*')
    .in('id', Array.from(profileIds));
  
  // Group by section_title
  const bySection = profiles.reduce((acc, p) => {
    const section = p.section_title || 'Reviewed By';
    if (!acc[section]) acc[section] = [];
    acc[section].push(p);
    return acc;
  }, {} as Record<string, typeof profiles>);
  
  // Generate HTML
  return Object.entries(bySection).map(([title, sectionProfiles]) => {
    return `<div class="sig-col">
      <b>${title}:</b>
      ${sectionProfiles.map(p => `
        ${p.name}<br/>
        ${p.title || '[Title]'}<br/>
        ${p.email || 'email@ampqes.com'}<br/>
        ${p.phone || '(xxx) xxx-xxxx'}
      `).join('<br/><br/>')}
    </div>`;
  }).join('');
};
```

### Fallback Signatures

If no profiles selected, default signatures are used:

```typescript
// Fallback to default
return `<div class="sig-grid">
  <div class="sig-col" contenteditable>
    <b>Project Manager:</b>
    ${fireteam || 'Name'}<br/>
    [Title]<br/>
    ${fireteamEmail || 'email@ampqes.com'}<br/>
  </div>
  <div class="sig-col" contenteditable>
    <b>Reviewed by:</b>
    ${reviewedByName || 'Name'}<br/>
    [Title]<br/>
    ${reviewedByEmail || 'email@ampqes.com'}<br/>
    (xxx) xxx-xxxx
  </div>
</div>`;
```

---

## Generation Process

### Generation Flow

1. **User Action**: User clicks "Generate Executive Summary"
2. **Profile Selection**: Signature profile selector opens
3. **Profile Selection**: User selects profiles
4. **Data Gathering**: Job data, customer info, reports gathered
5. **HTML Generation**: Executive summary HTML generated
6. **Database Save**: Document saved to `generated_documents` table
7. **Deliverable Link**: Linked to deliverable if applicable

### Implementation

**Location**: `src/components/jobs/JobDetail.tsx`

```typescript
const generateDoc = async (docType: 'cover' | 'summary') => {
  // Gather job data
  const jobNum = jobData?.job_number || '';
  const company = jobData?.customer?.company_name || '';
  const siteAddress = jobData?.site_address || '';
  const projectTitle = jobData?.title || '';
  
  // Get signature profiles
  const finalSelectedProfileIds = selectedProfileIds; // From selector
  
  // Generate HTML
  const summaryHtml = `
    <div class="amp-page">
      ${headerHtml}
      <div class="exec-title">Executive Summary</div>
      ${await generateSignatureSectionsHTML(finalSelectedProfileIds)}
    </div>
  `;
  
  // Save to database
  const { data: doc } = await supabase
    .schema('neta_ops')
    .from('generated_documents')
    .insert({
      job_id: jobId,
      doc_type: 'summary',
      html: summaryHtml,
      selected_signature_profile_ids: Array.from(finalSelectedProfileIds)
    })
    .select()
    .single();
  
  return doc;
};
```

---

## Database Schema

### Table: `neta_ops.generated_documents`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `job_id` | UUID | Reference to job |
| `doc_type` | TEXT | Document type ('cover' or 'summary') |
| `name` | TEXT | Custom document name |
| `html` | TEXT | Document HTML content |
| `selected_signature_profile_ids` | UUID[] | Array of signature profile IDs |
| `signature_sections` | JSONB | Legacy signature format |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

### Signature Profile References

The `selected_signature_profile_ids` column stores references to signature profiles:

```typescript
// When saving
selected_signature_profile_ids: Array.from(selectedProfileIds)

// When loading
const { data: profiles } = await supabase
  .schema('neta_ops')
  .from('signature_profiles')
  .select('*')
  .in('id', document.selected_signature_profile_ids);
```

---

## Component Integration

### JobDetail Component

**Location**: `src/components/jobs/JobDetail.tsx`

Main component for executive summary generation:

- `generateDoc()` - Generate cover letter or executive summary
- `generateSignatureSectionsHTML()` - Generate signature HTML
- Signature profile selector integration
- Document viewer integration

### SignatureProfileSelector

**Location**: `src/components/jobs/SignatureProfileSelector.tsx`

Component for selecting signature profiles:

- Multi-select interface
- Grouped by section title
- Search functionality
- Link to profile manager

### DeliverableViewer

**Location**: `src/components/jobs/DeliverableViewer.tsx`

Component for viewing deliverables including executive summaries:

- Displays executive summary HTML
- PDF generation integration
- Report listing
- Document navigation

---

## Deliverables Integration

### Deliverable Structure

Executive summaries are included in deliverables:

```typescript
interface Deliverable {
  id: string;
  job_id: string;
  cover_letter_id: string; // Generated document ID
  executive_summary_id: string; // Generated document ID
  reports: Asset[]; // Included reports
}
```

### Deliverable Generation

When creating deliverable:

1. Generate cover letter
2. Generate executive summary
3. Select reports to include
4. Create deliverable record
5. Link all documents

### Deliverable Viewing

In DeliverableViewer:

1. Load deliverable record
2. Fetch cover letter document
3. Fetch executive summary document
4. Fetch included reports
5. Display in sequence
6. Generate combined PDF

---

## Table of Contents

### TOC Generation

Executive summaries can include a table of contents generated from reports:

```typescript
// Build TOC by scanning reports
const slugToTable: Record<string, string> = {
  'panelboard-report': 'panelboard_reports',
  'switchgear-report': 'switchgear_reports',
  // ... more mappings
};

let tocHtml = '';
for (const report of reports) {
  const tableName = slugToTable[report.slug];
  if (tableName) {
    // Query report for identifier
    const { data } = await supabase
      .schema('neta_ops')
      .from(tableName)
      .select('report_info')
      .eq('id', report.id)
      .single();
    
    const identifier = data?.report_info?.identifier || '';
    tocHtml += `<div>${identifier}</div>`;
  }
}
```

---

## Related Documentation

- [Signature Profiles](./SIGNATURE_PROFILES.md) - Signature profile system
- [Deliverables System](./Deliverables-System.md) - Deliverables workflow
- Job Components: `src/components/jobs/JobDetail.tsx`
- Deliverable Components: `src/components/jobs/DeliverableViewer.tsx`

---

## Troubleshooting

### Summary Not Generating

1. Verify job data is loaded
2. Check signature profile selection
3. Review HTML generation logic
4. Check database insert permissions

### Signatures Not Appearing

1. Verify profiles are selected
2. Check profile IDs are valid
3. Review signature HTML generation
4. Check profile data exists

### Content Not Editable

1. Verify `contenteditable` attributes
2. Check CSS is not disabling editing
3. Review document viewer permissions
4. Check for JavaScript errors

### PDF Generation Issues

1. Verify deliverable is created
2. Check all documents are linked
3. Review PDF generation logic
4. Check browser print functionality

---

## Future Enhancements

Potential improvements:

- Executive summary templates
- Custom section ordering
- Rich text editing
- Image insertion
- Multiple signature sections
- Signature image uploads
- Executive summary versioning
- Email integration
- Custom formatting options
- Multi-language support
