# Custom Form Builder Implementation Guide

## Overview

The Custom Form Builder system allows users to create reusable form templates using drag-and-drop components extracted from existing reports. These templates can then be filled out by technicians and saved as job assets under "Custom Forms".

## Architecture

### Two-Phase System

1. **Template Creation** (Form Builder)
   - Users create and save reusable templates
   - Drag & drop components from library
   - Customize sections, fields, tables
   - Preview and save templates

2. **Instance Usage** (Form Filler)
   - Techs select a template
   - Fill with job-specific data
   - Save as asset linked to job

## What Has Been Implemented

### 1. Database Schema ✅
**File:** `database/migrations/create_custom_forms_tables.sql`

- `neta_ops.custom_form_templates` - Stores reusable form definitions
- `neta_ops.custom_form_instances` - Stores filled-out forms
- Row Level Security (RLS) policies
- Triggers for updated_at timestamps
- Indexes for performance

**Key Features:**
- Everyone can create templates
- Admins can deactivate templates
- Templates are shared across all users
- Automatic backups (neta_ops schema)

### 2. Type Definitions ✅
**File:** `src/lib/types/customForms.ts`

Comprehensive TypeScript types for:
- Component types (20+ options)
- Field types (text, number, date, select, etc.)
- Section configuration
- Template structure
- Form instances
- Unit options (voltage, current, resistance, etc.)
- Inspection results

### 3. Component Library ✅
**File:** `src/lib/customForms/componentLibrary.ts`

**Available Components:**
- **Info**: Job Information, Temperature Correction, Nameplate Data
- **Testing**: Insulation Test, Shield Continuity, Withstand Test, Voltage Readings, Current Readings, Resistance Readings
- **Inspection**: Visual & Mechanical Inspection
- **Equipment**: Test Equipment, Fuse Data
- **Other**: Comments, Custom Table, Custom Text

Each component has:
- Default configuration
- Pre-defined fields/columns
- Unit options
- Validation rules
- Layout preferences

### 4. Form Builder UI ✅
**File:** `src/components/customForms/FormBuilder.tsx`

**Features:**
- Drag & drop interface
- Live preview toggle
- Template name and NETA section
- Auto-save dirty state tracking
- Load existing templates for editing

### 5. Supporting Components ✅

**ComponentLibrarySidebar** (`ComponentLibrarySidebar.tsx`)
- Searchable component library
- Category filtering
- Draggable component cards
- Organized by category (info, testing, inspection, equipment, other)

**FormCanvas** (`FormCanvas.tsx`)
- Drop zone for components
- Section reordering (drag & drop)
- Section selection, duplication, deletion
- Live preview of each section
- Empty state with helpful message

**SectionEditor** (`SectionEditor.tsx`)
- Right sidebar for customization
- Edit section title
- Show/hide in print toggle
- Table row management (add/remove rows)
- Column editor (add/remove/customize columns)
- Field editor (labels, types, units, required)
- Checklist item editor

**FormPreview** (`FormPreview.tsx`)
- Read-only preview of complete form
- Matches final form appearance
- Shows all sections in order
- Displays NETA section and headers

## What Still Needs to Be Implemented

### Phase 1: Complete Form Builder

#### 1.1 Template Management Pages

**Templates List Page** (`src/pages/CustomFormTemplates.tsx`)
```typescript
// URL: /custom-forms/templates
// Features:
- List all templates (cards or table view)
- Search and filter templates
- Edit/Delete/Duplicate actions
- Create new template button
- Show template info (name, creator, created date, NETA section)
```

**Implementation:**
```typescript
import { supabase } from '@/lib/supabase';
import { CustomFormTemplate } from '@/lib/types/customForms';

// Fetch templates
const { data } = await supabase
  .schema('neta_ops')
  .from('custom_form_templates')
  .select('*')
  .eq('is_active', true)
  .order('created_at', { ascending: false });
```

#### 1.2 Admin Panel Integration

**Admin Template Management** (`src/pages/admin/CustomFormsAdmin.tsx`)
```typescript
// URL: /admin/custom-forms
// Features:
- View all templates (including inactive)
- Deactivate/reactivate templates
- View usage stats
- Bulk operations
```

### Phase 2: Form Instance (Filler)

#### 2.1 Form Filler Component

**CustomFormFiller** (`src/components/customForms/CustomFormFiller.tsx`)
```typescript
// URL: /jobs/:jobId/custom-form/:templateId/new
// OR: /jobs/:jobId/custom-form/:templateId/:instanceId (for editing)

interface Props {
  jobId: string;
  templateId: string;
  instanceId?: string; // For editing existing instance
}

// Features:
- Load template structure
- Auto-populate job information
- Render all sections based on template
- Handle temperature correction calculations
- Add/remove table rows (if allowed)
- Save as draft or complete
- PASS/FAIL status toggle
- Print functionality
```

**Key Implementation Points:**
```typescript
// Load template
const { data: template } = await supabase
  .schema('neta_ops')
  .from('custom_form_templates')
  .select('*')
  .eq('id', templateId)
  .single();

// Load job info (same as existing reports)
const { data: jobData } = await supabase
  .schema('neta_ops')
  .from('jobs')
  .select('*, customer:customers(*)')
  .eq('id', jobId)
  .single();

// Save instance
const instanceData = {
  template_id: templateId,
  template_name: template.name,
  neta_section: template.neta_section,
  job_id: jobId,
  user_id: user.id,
  data: {
    jobInfo: { /* populated from job */ },
    sections: { /* user-entered data */ }
  },
  status: 'PASS' // or 'FAIL'
};

const { data: savedInstance } = await supabase
  .schema('neta_ops')
  .from('custom_form_instances')
  .insert(instanceData)
  .select()
  .single();

// Create asset entry (like existing reports)
const assetData = {
  name: `${template.name} - ${formData.identifier || jobData.title}`,
  file_url: `report:/jobs/${jobId}/custom-form/${savedInstance.id}`,
  user_id: user.id
};

const { data: asset } = await supabase
  .schema('neta_ops')
  .from('assets')
  .insert(assetData)
  .select()
  .single();

// Link to job
await supabase
  .schema('neta_ops')
  .from('job_assets')
  .insert({
    job_id: jobId,
    asset_id: asset.id,
    user_id: user.id
  });
```

#### 2.2 Dynamic Section Rendering

Create reusable renderers for each component type:

**TableSection** (`src/components/customForms/renderers/TableSection.tsx`)
```typescript
interface Props {
  section: SectionConfig;
  data: any[];
  onChange: (data: any[]) => void;
  isEditMode: boolean;
}

// Renders any table-based section with dynamic columns
```

**FieldGroupSection** (`src/components/customForms/renderers/FieldGroupSection.tsx`)
```typescript
// Renders grouped fields (Job Info, Nameplate, etc.)
```

**ChecklistSection** (`src/components/customForms/renderers/ChecklistSection.tsx`)
```typescript
// Renders visual inspection checklists
```

**SingleFieldSection** (`src/components/customForms/renderers/SingleFieldSection.tsx`)
```typescript
// Renders comments, custom text fields
```

### Phase 3: Integration with Existing System

#### 3.1 Add to Asset Menu

**Update:** `src/components/jobs/AddAssetMenu.tsx` or equivalent

```typescript
// Add Custom Forms category
const customFormTemplates = await supabase
  .schema('neta_ops')
  .from('custom_form_templates')
  .select('id, name')
  .eq('is_active', true)
  .order('name');

// Add to menu
const assetCategories = {
  ats: [...],
  mts: [...],
  customForms: customFormTemplates.map(template => ({
    label: template.name,
    path: `/jobs/${jobId}/custom-form/${template.id}/new`,
    icon: FileText
  }))
};
```

#### 3.2 Report Mappings

**Update:** `src/components/reports/reportMappings.ts`

```typescript
export function getReportName(slug: string): string {
  // ... existing mappings
  
  // For custom forms, fetch from template
  if (slug.startsWith('custom-form-')) {
    return 'Custom Form'; // Or fetch actual name
  }
}

export function getAssetName(slug: string, identifier: string): string {
  // ... existing mappings
  
  if (slug.startsWith('custom-form-')) {
    return `Custom Form - ${identifier}`;
  }
}
```

#### 3.3 Routing

**Update:** `src/App.tsx` or routing file

```typescript
// Template routes
<Route path="/custom-forms/templates" element={<CustomFormTemplates />} />
<Route path="/custom-forms/builder" element={<FormBuilder />} />
<Route path="/custom-forms/builder/:templateId" element={<FormBuilder />} />

// Instance routes
<Route path="/jobs/:jobId/custom-form/:templateId/new" element={<CustomFormFiller />} />
<Route path="/jobs/:jobId/custom-form/:templateId/:instanceId" element={<CustomFormFiller />} />
```

### Phase 4: Advanced Features

#### 4.1 Calculations & Dependencies

Implement calculation engine for temperature correction, TCF, etc:

```typescript
// src/lib/customForms/calculationEngine.ts
export function calculateField(
  formula: string,
  dependencies: Record<string, any>,
  allData: any
): any {
  // Parse formula
  // Get dependent values
  // Calculate result
  // Handle TCF calculations
}
```

#### 4.2 Print Styling

Each section type needs print styles:

```typescript
// Add to CustomFormFiller.tsx
const printStyles = `
  @media print {
    /* Standard print styles like other reports */
    /* Hide interactive elements */
    /* Format tables properly */
  }
`;
```

#### 4.3 Validation

```typescript
// src/lib/customForms/validation.ts
export function validateForm(
  template: CustomFormTemplate,
  data: any
): ValidationError[] {
  // Check required fields
  // Validate field types
  // Check calculated fields
}
```

## Implementation Order

### Week 1: Template Management
1. Templates List Page
2. Admin integration
3. Basic routing

### Week 2: Form Filler - Core
1. CustomFormFiller component
2. Section renderers (table, fields, checklist)
3. Job info auto-population

### Week 3: Form Filler - Advanced
1. Add/remove rows functionality
2. Temperature correction calculations
3. Save functionality
4. Asset creation

### Week 4: Integration & Testing
1. Add to asset menu
2. Print functionality
3. Edit mode for existing instances
4. Validation
5. Testing

## Testing Checklist

### Template Creation
- [ ] Create new template
- [ ] Add various component types
- [ ] Customize sections (rows, columns, fields)
- [ ] Preview template
- [ ] Save template
- [ ] Edit existing template
- [ ] Duplicate template
- [ ] Delete section
- [ ] Reorder sections

### Form Filling
- [ ] Load template
- [ ] Auto-populate job info
- [ ] Fill table sections
- [ ] Add/remove rows
- [ ] Fill field groups
- [ ] Fill checklists
- [ ] Temperature corrections work
- [ ] Save draft
- [ ] Save complete
- [ ] Edit existing instance
- [ ] Print form
- [ ] Asset appears in job

### Permissions
- [ ] Everyone can create templates
- [ ] Everyone can view active templates
- [ ] Users can edit own templates
- [ ] Admins can deactivate any template
- [ ] Everyone can fill forms
- [ ] Users can edit own instances

## Database Migrations

Run the migration:
```sql
-- In Supabase SQL Editor or migration tool
\i database/migrations/create_custom_forms_tables.sql
```

## Environment Setup

No additional environment variables needed. Uses existing Supabase connection.

## Common Patterns

### Loading Templates
```typescript
const loadTemplates = async () => {
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('custom_form_templates')
    .select('*')
    .eq('is_active', true)
    .order('name');
  
  if (error) throw error;
  return data;
};
```

### Saving Instances
```typescript
const saveInstance = async (formData: any) => {
  const instanceData = {
    template_id: templateId,
    job_id: jobId,
    user_id: user.id,
    data: formData,
    status: status
  };
  
  // Insert or update
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('custom_form_instances')
    .upsert(instanceData)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};
```

### Rendering Dynamic Sections
```typescript
const renderSection = (section: SectionConfig, data: any) => {
  switch (section.componentType) {
    case ComponentType.JOB_INFO:
      return <FieldGroupSection section={section} data={data} />;
    case ComponentType.INSULATION_TEST:
      return <TableSection section={section} data={data} />;
    case ComponentType.VISUAL_INSPECTION:
      return <ChecklistSection section={section} data={data} />;
    case ComponentType.COMMENTS:
      return <SingleFieldSection section={section} data={data} />;
    default:
      return <CustomSection section={section} data={data} />;
  }
};
```

## Future Enhancements

1. **Template Versioning**
   - Track template changes over time
   - Allow reverting to previous versions

2. **Template Sharing**
   - Export/import templates
   - Share between organizations

3. **Advanced Calculations**
   - Formula builder UI
   - More complex calculations

4. **Conditional Sections**
   - Show/hide sections based on other field values

5. **Digital Signatures**
   - Add signature fields
   - Timestamp signatures

6. **Attachments**
   - Allow attaching photos/documents to forms

7. **Mobile Optimization**
   - Touch-friendly interface
   - Offline support

## Support & Questions

For implementation questions or issues:
1. Check this guide first
2. Review existing report components for patterns
3. Check Supabase RLS policies
4. Test in development environment first

## Related Files

- Database: `database/migrations/create_custom_forms_tables.sql`
- Types: `src/lib/types/customForms.ts`
- Components Library: `src/lib/customForms/componentLibrary.ts`
- Form Builder: `src/components/customForms/FormBuilder.tsx`
- Sidebar: `src/components/customForms/ComponentLibrarySidebar.tsx`
- Canvas: `src/components/customForms/FormCanvas.tsx`
- Editor: `src/components/customForms/SectionEditor.tsx`
- Preview: `src/components/customForms/FormPreview.tsx`


