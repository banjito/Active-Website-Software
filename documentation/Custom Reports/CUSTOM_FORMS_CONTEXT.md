# Custom Forms Builder - Development Context
**Last Updated:** November 6, 2024  
**Status:** Phase 1 Complete - Builder & Preview Working

---

## 🎯 Project Overview

A drag-and-drop form builder that allows users to create custom report templates for equipment testing. These forms are reusable, shareable across all users, and integrate with the existing job/asset system.

### Key Requirements
- ✅ Users can create custom form templates
- ✅ Templates are shared across all users
- ✅ Forms save to `neta_ops` schema (automatic backups)
- ✅ Mobile-optimized, no sidebars
- ✅ All fields accept text (like standard reports)
- ✅ Default values can be cleared
- ✅ Temperature/TCF auto-calculation in Job Details
- ⏳ Add to "Add Asset" menu (NOT under MTS/ATS)
- ⏳ Save filled forms as job assets
- ⏳ Admin panel for template management

---

## 📁 Key Files & Structure

### Database
```
database/migrations/
├── create_custom_forms_tables.sql       # Creates tables (RLS DISABLED)
└── fix_custom_forms_rls.sql             # RLS fix (not used - user keeping RLS off)
```

**Tables:**
- `neta_ops.custom_form_templates` - Stores reusable form templates
- `neta_ops.custom_form_instances` - Stores filled-out forms linked to jobs

### Core Components
```
src/
├── pages/
│   ├── CustomFormTemplates.tsx          # Template list/management page
│   └── CustomFormPreview.tsx            # Preview/test form (no save)
├── components/customForms/
│   ├── FormBuilder.tsx                  # Main builder interface
│   ├── FormCanvas.tsx                   # Drag/drop canvas
│   ├── ComponentLibrarySidebar.tsx      # Component library
│   ├── SectionEditor.tsx                # Edit section properties
│   └── FormPreview.tsx                  # Read-only preview in builder
├── lib/
│   ├── types/customForms.ts             # TypeScript interfaces
│   ├── customForms/componentLibrary.ts  # Pre-built components
│   └── utils/temperatureCorrection.ts   # TCF calculations
└── App.tsx                              # Routes
```

---

## 🚀 Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/custom-forms/templates` | CustomFormTemplates | List all templates (with sidebar) |
| `/custom-forms/builder` | FormBuilder | Create new template (no sidebar) |
| `/custom-forms/builder/:templateId` | FormBuilder | Edit existing template (no sidebar) |
| `/custom-forms/preview/:templateId` | CustomFormPreview | Test form preview (no sidebar, no save) |

---

## 🧩 Available Components

### Info Components
1. **Job Information** - Standard job details with temp/humidity/TCF
2. **Temperature Correction** - Advanced temp with Celsius/TCF display
3. **Nameplate Data** - Equipment nameplate fields

### Testing Components
4. **Insulation Resistance Test** - Multi-row table with temp correction
5. **Shield Continuity Test** - Single-row phase measurements
6. **Withstand Test** - Time-series VLF readings
7. **Voltage Readings** - Generic voltage measurements
8. **Current Readings** - Generic current measurements
9. **Resistance Readings** - Generic resistance measurements

### Inspection Components
10. **Visual & Mechanical Inspection** - NETA-style checklist

### Equipment Components
11. **Test Equipment Used** - Equipment details table
12. **Fuse Data** - Fuse information table

### Other Components
13. **Comments** - Free-text field
14. **Custom Table** - Build your own table
15. **Custom Text Field** - Single custom field

---

## 🔧 How It Works

### Creating a Template
1. Navigate to `/custom-forms/templates`
2. Click "Create Template"
3. Opens full-screen builder (no sidebars)
4. Toggle component library with 📂 button
5. Drag components onto canvas
6. Click gear icon to edit section properties
7. Save template

### Testing a Template
1. From templates list, click "Preview"
2. Opens full-screen preview
3. All fields are fillable
4. PASS/FAIL button works
5. **Changes are NOT saved** (test mode only)

### Form Builder Features
- ✅ Drag & drop components
- ✅ Reorder sections
- ✅ Duplicate sections
- ✅ Delete sections
- ✅ Edit section titles
- ✅ Add/remove table rows
- ✅ Change layouts (1/2/3 column)
- ✅ Mobile responsive

---

## 🌡️ Temperature Correction (TCF)

**Built into Job Information component:**

### Fields
- **Temperature (°F)** - User enters (default: 68)
- **Temperature (°C)** - Auto-calculated, read-only
- **TCF** - Auto-calculated from lookup table, read-only
- **Humidity (%)** - User enters (default: 50)

### Calculation Logic
```typescript
// When temperature changes:
1. Convert F to C: (F - 32) * 5/9
2. Lookup TCF from table (-24°C to 110°C)
3. Update read-only fields
4. Clear if temperature is cleared

// For corrected values in tables:
Corrected = Raw × TCF
```

### Files
- `src/lib/utils/temperatureCorrection.ts` - Shared utility
- Contains full TCF lookup table with interpolation

---

## ✅ What's Working

### Phase 1 Complete
- [x] Database tables created (RLS disabled)
- [x] Form builder UI (no sidebar by default)
- [x] Component library with 15 pre-built components
- [x] Drag & drop functionality
- [x] Section editing (add/remove rows, change layouts)
- [x] Template save/load
- [x] Templates list page with search
- [x] Preview mode for testing
- [x] Temperature/TCF auto-calculation
- [x] All inputs accept text (not restricted to numbers)
- [x] Default values can be cleared
- [x] Mobile optimized
- [x] Dark mode support

---

## 🔨 TODO - Phase 2

### High Priority
1. **Create CustomFormFiller component** (`src/components/customForms/CustomFormFiller.tsx`)
   - Similar to CustomFormPreview but with save functionality
   - Links to job_id
   - Saves to `custom_form_instances` table
   - Creates asset entry
   - Links asset to job via `job_assets` table

2. **Integrate into "Add Asset" Menu**
   - Add "Custom Forms" section to asset dropdown
   - List available templates
   - Open CustomFormFiller when selected
   - Pass job_id as prop

3. **Display in Job Details**
   - Show custom form instances in assets list
   - Link to view/edit filled forms
   - Show form name and status

### Medium Priority
4. **Admin Panel for Templates**
   - Path: `/admin/custom-forms`
   - View all templates (including inactive)
   - Activate/deactivate templates
   - Delete templates permanently
   - User permissions check

5. **Template Versioning**
   - Track template changes
   - Don't break existing instances
   - Show "Template Updated" indicator

6. **Corrected Values Calculation**
   - Auto-multiply raw values by TCF in insulation test tables
   - Update corrected columns in real-time

### Low Priority
7. **Export to PDF**
   - Generate PDF from filled forms
   - Include all sections
   - Match standard report styling

8. **Template Categories/Tags**
   - Organize templates by equipment type
   - Filter in template list
   - Search by category

9. **Formula Builder for Calculated Fields**
   - UI for creating custom calculations
   - Dependency management
   - Error handling

---

## 🗃️ Database Schema

### custom_form_templates
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL
description TEXT
neta_section TEXT (e.g., 'ATS 7.3.3', 'MTS 4.2')
created_by UUID (references auth.users)
structure JSONB NOT NULL (form definition)
is_active BOOLEAN (default true)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### custom_form_instances
```sql
id UUID PRIMARY KEY
template_id UUID (references custom_form_templates)
template_name TEXT (snapshot)
neta_section TEXT (snapshot)
job_id UUID NOT NULL (link to job)
user_id UUID (references auth.users)
data JSONB NOT NULL (all form data)
status TEXT (PASS/FAIL)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**Note:** RLS is currently DISABLED. User wants it off.

---

## 📝 TypeScript Interfaces

### CustomFormTemplate
```typescript
{
  id?: string;
  name: string;
  description?: string;
  netaSection?: string;
  createdBy?: string;
  structure: {
    sections: SectionConfig[];
    settings: {
      includePassFail: boolean;
      includeJobInfo: boolean;
      includePrintHeader: boolean;
      pageBreakAfterSection: boolean;
    };
  };
}
```

### SectionConfig
```typescript
{
  id: string;
  componentType: ComponentType;
  title: string;
  order: number;
  showInPrint: boolean;
  layout?: 'single-column' | 'two-column' | 'three-column' | 'grid';
  
  // For form fields (job info, nameplate, etc.)
  fields?: Field[];
  
  // For tables
  columns?: Column[];
  rows?: number;
  allowAddRows?: boolean;
  allowRemoveRows?: boolean;
  minRows?: number;
  maxRows?: number;
  
  // For checklists
  checklistItems?: ChecklistItem[];
  
  // For single fields
  field?: Field;
}
```

---

## 🐛 Known Issues

### Current Issues
1. **Corrected value calculation not implemented**
   - Insulation test table has corrected columns
   - Need to multiply raw × TCF in real-time
   - Requires implementing calculation logic in preview/filler

2. **No validation on save**
   - Empty template names allowed
   - No checks for duplicate names
   - Should add validation

3. **Console logging still active**
   - Debug logs in FormBuilder.tsx
   - Should remove before production

### Design Decisions
- **RLS Disabled**: User preference, keeping it off
- **No Asset Creation in Preview**: Intentional for testing
- **Text inputs for numbers**: Matches standard reports (allows N/A, <0.1, etc.)

---

## 🧪 Testing

### Manual Test Checklist
- [ ] Create new template
- [ ] Add Job Information component
- [ ] Verify temp/TCF auto-calculation
- [ ] Add insulation test table
- [ ] Add/remove table rows
- [ ] Save template
- [ ] Preview template
- [ ] Edit existing template
- [ ] Duplicate template
- [ ] Delete template
- [ ] Search templates
- [ ] Test on mobile screen
- [ ] Test dark mode

### Test Data
```javascript
// Good test temperature values:
68°F → 20°C → TCF 1.000
72°F → 22.22°C → TCF 11.040
32°F → 0°C → TCF 0.400
```

---

## 🔑 Key Code Patterns

### Adding a New Component Type

1. **Add to ComponentType enum** (`src/lib/types/customForms.ts`)
```typescript
export enum ComponentType {
  // ... existing types
  NEW_COMPONENT = 'new_component',
}
```

2. **Add to COMPONENT_LIBRARY** (`src/lib/customForms/componentLibrary.ts`)
```typescript
{
  id: ComponentType.NEW_COMPONENT,
  name: 'New Component',
  description: 'Description here',
  icon: 'IconName',
  category: 'testing',
  defaultConfig: {
    componentType: ComponentType.NEW_COMPONENT,
    title: 'Default Title',
    order: 99,
    showInPrint: true,
    // ... component-specific config
  }
}
```

3. **Add rendering logic** (if needed)
   - `FormCanvas.tsx` - Builder preview
   - `CustomFormPreview.tsx` - Test preview
   - `CustomFormFiller.tsx` - Actual form (TODO)

### Accessing Form Data
```typescript
// In preview/filler components
const value = formData[sectionId]?.[fieldId] || '';

// Update a field
handleFieldChange(sectionId, fieldId, newValue);

// For table cells
const cellId = `${section.id}_row${rowIndex}`;
handleFieldChange(cellId, column.field.id, value);
```

---

## 📞 Integration Points

### Where Custom Forms Connect

1. **Job Assets**
   - Filled forms saved as assets
   - Displayed in job details page
   - File URL pattern: `report:/jobs/{jobId}/custom-forms/{instanceId}`

2. **Add Asset Menu**
   - New section: "Custom Forms"
   - Lists active templates
   - Opens filler on selection

3. **Assets Table**
   - `neta_ops.assets` - Asset metadata
   - `neta_ops.job_assets` - Links assets to jobs
   - Asset name: `"Template Name - Identifier"`

4. **Standard Reports**
   - Shares TCF calculation utility
   - Uses same print styles
   - Follows same PASS/FAIL pattern

---

## 🎨 Styling

### Key Classes
```css
/* Form inputs */
.form-input    /* Standard input */
.form-select   /* Standard select */
.form-label    /* Standard label */

/* Read-only fields */
bg-neutral-100 dark:bg-dark-200  /* Read-only background */

/* Brand color */
bg-[#f26722] hover:bg-[#e55611]  /* AMP orange */

/* Status buttons */
bg-green-600  /* PASS */
bg-red-600    /* FAIL */
```

### Dark Mode
All components support dark mode using Tailwind's `dark:` prefix.

---

## 💡 Tips for Tomorrow

### Quick Start
1. Open `/custom-forms/templates`
2. Your test template should be there
3. Click "Preview" to test
4. Click "Edit" to modify

### Next Steps Priority
1. Start with CustomFormFiller component
2. Copy from CustomFormPreview.tsx
3. Add save functionality
4. Test saving to database
5. Create asset entry
6. Link to job

### Useful Commands
```bash
# Start dev server
npm run dev

# Check for linter errors
npm run lint

# Access Supabase
# URL: https://vdxprdihmbqomwqfldpo.supabase.co
```

---

## 📚 Reference Documents

### In This Folder
- `CUSTOM_FORMS_IMPLEMENTATION_GUIDE.md` - Technical guide
- `CUSTOM_FORMS_README.md` - Quick start
- `CUSTOM_FORMS_SUMMARY.md` - High-level overview
- `CUSTOM_FORMS_FILES_CREATED.md` - File list

### Project Rules
- `.cursor/rules/cursor_rules.mdc` - Rule structure
- `.cursor/rules/dev_workflow.mdc` - Development workflow
- `REPORT_GUIDE.md` - Report development standards

---

## 🎯 Success Criteria

### Phase 1 ✅ (Complete)
- Users can create templates
- Users can preview templates
- Templates save to database
- Mobile optimized

### Phase 2 ⏳ (Next)
- Users can fill out forms from jobs
- Forms save as job assets
- Forms appear in add asset menu
- Admins can manage templates

### Phase 3 (Future)
- Export to PDF
- Template versioning
- Advanced calculations
- Template categories

---

## 🤝 Notes

- User prefers RLS disabled (confirmed)
- No asset creation during preview (intentional)
- Sidebar hidden by default (mobile-first)
- All number inputs accept text (matches standard reports)
- Temperature in Job Info is standard across all forms
- TCF calculation is automatic and shared

---

**Ready to continue tomorrow!** 🚀

Start with creating `CustomFormFiller.tsx` - it's the bridge between templates and actual job data.
