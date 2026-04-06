# Custom Form Builder System

## Quick Summary

The Custom Form Builder is a drag-and-drop system that allows technicians to create reusable form templates from a library of components extracted from existing reports. These templates can then be filled out and saved as job assets.

## What We Built (Framework Complete ✅)

### 1. **Database Layer** 
- `neta_ops.custom_form_templates` - Stores reusable templates
- `neta_ops.custom_form_instances` - Stores filled forms
- Complete RLS policies
- Automatic backups (neta_ops schema)

### 2. **Component Library**
20+ pre-built components including:
- Job Information
- Temperature Correction (with TCF calculations)
- Insulation Tests
- Shield Continuity
- Withstand Tests
- Visual Inspections
- Test Equipment
- Nameplate Data
- Fuse Data
- Comments
- Custom Tables

### 3. **Form Builder UI**
- ✅ Drag & drop interface
- ✅ Component library sidebar with search/filter
- ✅ Live canvas with section reordering
- ✅ Section editor for customization
- ✅ Preview mode
- ✅ Save/load templates
- ✅ Add/remove/duplicate sections
- ✅ Customize columns, rows, fields, units
- ✅ NETA section assignment

## What's Next (Implementation Order)

### Phase 1: Template Management (Week 1)
**Priority: HIGH**

Create the template list page:
```
/custom-forms/templates
```

This page should:
- Display all active templates
- Allow creating new templates (navigates to builder)
- Allow editing existing templates
- Allow duplicating templates
- Show template info (name, creator, date, NETA section)

### Phase 2: Form Filler (Weeks 2-3)
**Priority: HIGH**

Create the form instance component:
```
/jobs/:jobId/custom-form/:templateId/new
/jobs/:jobId/custom-form/:templateId/:instanceId
```

This needs:
1. Load template structure
2. Render all sections dynamically
3. Auto-populate job info from job
4. Handle user input
5. Temperature correction calculations
6. Add/remove table rows
7. PASS/FAIL toggle
8. Save to database
9. Create asset entry
10. Link to job
11. Print functionality

### Phase 3: Integration (Week 4)
**Priority: MEDIUM**

1. Add "Custom Forms" to Add Asset menu
2. Load templates dynamically in menu
3. Update routing
4. Add admin panel for template management

## File Structure

```
src/
├── components/
│   └── customForms/
│       ├── FormBuilder.tsx              ✅ Complete
│       ├── ComponentLibrarySidebar.tsx  ✅ Complete
│       ├── FormCanvas.tsx               ✅ Complete
│       ├── SectionEditor.tsx            ✅ Complete
│       ├── FormPreview.tsx              ✅ Complete
│       ├── CustomFormFiller.tsx         ❌ TODO - HIGH PRIORITY
│       └── renderers/
│           ├── TableSection.tsx         ❌ TODO
│           ├── FieldGroupSection.tsx    ❌ TODO
│           ├── ChecklistSection.tsx     ❌ TODO
│           └── SingleFieldSection.tsx   ❌ TODO
├── lib/
│   ├── types/
│   │   └── customForms.ts               ✅ Complete
│   └── customForms/
│       ├── componentLibrary.ts          ✅ Complete
│       ├── calculationEngine.ts         ❌ TODO
│       └── validation.ts                ❌ TODO
├── pages/
│   ├── CustomFormTemplates.tsx          ❌ TODO - HIGH PRIORITY
│   └── admin/
│       └── CustomFormsAdmin.tsx         ❌ TODO - MEDIUM PRIORITY
└── database/
    └── migrations/
        └── create_custom_forms_tables.sql ✅ Complete
```

## Key Features

### Template Builder
- [x] Drag & drop components
- [x] Reorder sections
- [x] Customize section titles
- [x] Add/remove table rows
- [x] Add/remove columns
- [x] Edit field labels & types
- [x] Set units (Ω, V, A, kV, etc.)
- [x] Mark fields as required
- [x] Show/hide in print
- [x] Preview mode
- [x] Save templates
- [x] Edit existing templates

### Form Filler (TODO)
- [ ] Load template
- [ ] Auto-populate job info
- [ ] Dynamic section rendering
- [ ] Add/remove rows (if allowed)
- [ ] Temperature corrections
- [ ] PASS/FAIL status
- [ ] Save as draft
- [ ] Save complete
- [ ] Create asset
- [ ] Link to job
- [ ] Print functionality
- [ ] Edit existing forms

## Quick Start

### 1. Run Database Migration
```sql
-- In Supabase SQL Editor
\i database/migrations/create_custom_forms_tables.sql
```

### 2. Add Routing
```typescript
// In your main router file
<Route path="/custom-forms/builder" element={<FormBuilder />} />
<Route path="/custom-forms/builder/:templateId" element={<FormBuilder />} />
```

### 3. Test the Builder
Navigate to: `/custom-forms/builder`

- Drag components from sidebar
- Customize sections
- Preview the form
- Save template

### 4. Next: Build Form Filler
Follow the implementation guide in `docs/CUSTOM_FORMS_IMPLEMENTATION_GUIDE.md`

## Usage Example

### Creating a Template
1. Navigate to Form Builder
2. Name your template (e.g., "Cable Testing Form")
3. Set NETA section (e.g., "ATS 7.3.3")
4. Drag "Job Information" component
5. Drag "Temperature Correction" component
6. Drag "Insulation Test" table
7. Customize number of rows
8. Add/remove columns as needed
9. Preview
10. Save template

### Using a Template (Once Implemented)
1. Navigate to job
2. Click "Add Asset"
3. Select "Custom Forms"
4. Choose your template
5. Form opens with template structure
6. Job info auto-populated
7. Fill in test data
8. Toggle PASS/FAIL
9. Save
10. Asset appears under "Custom Forms"

## Components Available

| Component | Type | Use Case |
|-----------|------|----------|
| Job Information | Fields | Customer, address, job #, date, etc. |
| Temperature Correction | Calculated | Temp in F/C, humidity, TCF |
| Nameplate Data | Fields | Manufacturer, model, serial, ratings |
| Insulation Test | Table | A-G, B-G, C-G with temp correction |
| Shield Continuity | Table | Phase readings with units |
| Withstand Test | Table | Time-series readings (VLF) |
| Visual Inspection | Checklist | NETA inspection items |
| Test Equipment | Table | Equipment, serial #, AMP ID |
| Voltage Readings | Table | Generic voltage measurements |
| Current Readings | Table | Generic current measurements |
| Resistance Readings | Table | Generic resistance measurements |
| Fuse Data | Table | Fuse ratings and info |
| Comments | Textarea | Free-form notes |
| Custom Table | Table | Build your own |
| Custom Text | Field | Single custom field |

## Technical Details

### Data Structure
Templates store form structure as JSONB:
```json
{
  "sections": [
    {
      "id": "section-1",
      "componentType": "insulation-test",
      "title": "Insulation Resistance Test",
      "order": 0,
      "showInPrint": true,
      "columns": [...],
      "rows": 3,
      "allowAddRows": true
    }
  ],
  "settings": {
    "includePassFail": true,
    "includeJobInfo": true
  }
}
```

Instances store filled data as JSONB:
```json
{
  "jobInfo": {
    "customer": "ABC Corp",
    "jobNumber": "12345",
    ...
  },
  "sections": {
    "section-1": {
      "rows": [
        { "ag": "1000", "bg": "1050", ... }
      ]
    }
  }
}
```

### Calculations
Temperature correction automatically applies:
- Fahrenheit → Celsius conversion
- TCF lookup from standard tables
- Applies TCF to insulation readings

### Units
All unit dropdowns support:
- Continuity: Ω, mΩ, μΩ
- Insulation: GΩ, MΩ, kΩ
- Current: A, mA, µA
- Voltage: kV, V, mV
- Capacitance: F, µF, nF, pF

### Print Styling
Uses same print system as existing reports:
- Hides interactive elements
- Professional formatting
- Black text on white
- Clean borders
- Company logo header
- NETA section display

## Dependencies

Required packages (already in use):
- `@dnd-kit/core` - Drag & drop
- `@dnd-kit/sortable` - Sortable lists
- `lucide-react` - Icons
- `react-hot-toast` - Notifications

## Permissions

- **Everyone**: Create & use templates
- **Everyone**: Fill out forms
- **Creators**: Edit their own templates
- **Admins**: Deactivate any template

## Next Steps

1. **Immediate**: Create Templates List Page
2. **High Priority**: Build Form Filler component
3. **High Priority**: Create section renderers
4. **Medium Priority**: Integrate with Add Asset menu
5. **Medium Priority**: Add admin panel
6. **Low Priority**: Add validation
7. **Low Priority**: Add advanced calculations

## Questions?

See the detailed implementation guide:
`docs/CUSTOM_FORMS_IMPLEMENTATION_GUIDE.md`

This guide includes:
- Complete code examples
- Database queries
- Implementation patterns
- Testing checklist
- Common pitfalls
- Best practices


