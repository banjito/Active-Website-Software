# Custom Forms - Quick Start Guide

## 🚀 Pick Up Where We Left Off

### What's Done ✅
1. Form builder working (`/custom-forms/builder`)
2. Templates list working (`/custom-forms/templates`)
3. Preview working (`/custom-forms/preview/:id`)
4. Temperature/TCF auto-calculation working
5. All fields accept text and can be cleared
6. Mobile optimized

### What's Next ⏳
**Create the form filler** - the component that actually saves forms to jobs.

---

## 📋 Next Task: CustomFormFiller

### File to Create
`src/components/customForms/CustomFormFiller.tsx`

### Copy From
`src/pages/CustomFormPreview.tsx` (95% the same)

### Key Changes Needed
1. **Add jobId prop**
   ```typescript
   interface CustomFormFillerProps {
     templateId: string;
     jobId: string;
     instanceId?: string; // For editing existing
   }
   ```

2. **Add save function**
   ```typescript
   const handleSave = async () => {
     // Save to custom_form_instances
     // Create asset entry
     // Link to job via job_assets
     // Navigate back to job
   };
   ```

3. **Load existing instance** (if editing)
   ```typescript
   if (instanceId) {
     // Load from custom_form_instances
     // Populate formData
   }
   ```

### Database Operations
```typescript
// 1. Save form instance
const { data: instance } = await supabase
  .schema('neta_ops')
  .from('custom_form_instances')
  .insert({
    template_id: templateId,
    template_name: template.name,
    neta_section: template.netaSection,
    job_id: jobId,
    user_id: user.id,
    data: formData,
    status: status
  })
  .select()
  .single();

// 2. Create asset
const { data: asset } = await supabase
  .schema('neta_ops')
  .from('assets')
  .insert({
    name: `${template.name} - ${formData.jobInfo?.identifier || 'Custom Form'}`,
    file_url: `report:/jobs/${jobId}/custom-forms/${instance.id}`,
    user_id: user.id
  })
  .select()
  .single();

// 3. Link to job
await supabase
  .schema('neta_ops')
  .from('job_assets')
  .insert({
    job_id: jobId,
    asset_id: asset.id,
    user_id: user.id
  });

// 4. Navigate back
navigate(`/jobs/${jobId}`);
```

---

## 🔧 Then: Add to "Add Asset" Menu

### File to Edit
Find where the "Add Asset" dropdown is rendered in job details.

### Changes
1. **Add "Custom Forms" section**
2. **List active templates**
3. **On click, open CustomFormFiller**

```typescript
// Pseudo-code
<Menu>
  {/* Existing sections */}
  
  <MenuSection title="Custom Forms">
    {activeTemplates.map(template => (
      <MenuItem 
        onClick={() => openCustomForm(template.id)}
      >
        {template.name}
        {template.netaSection && <Badge>{template.netaSection}</Badge>}
      </MenuItem>
    ))}
  </MenuSection>
</Menu>
```

---

## 🗺️ Navigation Flow

```
Job Details Page
  ↓
Click "Add Asset" → Select "Custom Forms" → Choose Template
  ↓
CustomFormFiller opens
  ↓
Fill out form → Click Save
  ↓
Back to Job Details (new asset appears)
  ↓
Click asset to view/edit
  ↓
CustomFormFiller opens with existing data
```

---

## 🧪 Testing Steps

1. **Test creating new form instance**
   - Go to job details
   - Click "Add Asset" → "Custom Forms" → Select template
   - Fill out form
   - Click Save
   - Verify asset appears in job
   - Check database: custom_form_instances, assets, job_assets

2. **Test editing existing instance**
   - Click on saved form asset
   - Modify data
   - Click Save
   - Verify changes saved

3. **Test PASS/FAIL status**
   - Toggle status button
   - Save
   - Verify status in database

---

## 📁 Files You'll Touch

### New Files
- `src/components/customForms/CustomFormFiller.tsx`

### Files to Edit
- Job details page (wherever "Add Asset" menu is)
- Possibly routing in `src/App.tsx`

### Reference Files
- `src/pages/CustomFormPreview.tsx` - Copy most of this
- `src/components/reports/MediumVoltageVLFReport.tsx` - Example save logic
- `REPORT_GUIDE.md` - Standard save pattern

---

## 💾 Save Pattern (from existing reports)

```typescript
// Standard pattern from existing reports
const handleSave = async () => {
  if (!jobId || !user?.id) return;

  try {
    let result;
    if (instanceId) {
      // Update existing
      result = await supabase
        .schema('neta_ops')
        .from('custom_form_instances')
        .update({ data: formData, status: status })
        .eq('id', instanceId)
        .select()
        .single();
    } else {
      // Create new
      result = await supabase
        .schema('neta_ops')
        .from('custom_form_instances')
        .insert({ /* ... */ })
        .select()
        .single();

      // Create asset
      const assetData = { /* ... */ };
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
    }

    if (result.error) throw result.error;

    toast.success('Form saved successfully!');
    navigate(`/jobs/${jobId}`);
  } catch (error) {
    console.error('Error saving form:', error);
    toast.error('Failed to save form');
  }
};
```

---

## 🎯 Focus Areas

### 1. Form Filler (Today/Tomorrow)
- [ ] Create CustomFormFiller.tsx
- [ ] Add save functionality
- [ ] Test create/edit/save cycle

### 2. Integration (Next)
- [ ] Add "Custom Forms" to asset menu
- [ ] List templates in menu
- [ ] Link to CustomFormFiller
- [ ] Display in job assets list

### 3. Admin Panel (Later)
- [ ] Create `/admin/custom-forms` page
- [ ] View all templates
- [ ] Activate/deactivate templates
- [ ] Delete templates

---

## ⚡ Quick Commands

```bash
# Start dev
npm run dev

# Check database
# Supabase URL: https://vdxprdihmbqomwqfldpo.supabase.co

# Test URLs
http://localhost:5175/custom-forms/templates
http://localhost:5175/custom-forms/builder
http://localhost:5175/custom-forms/preview/{templateId}
```

---

## 🆘 If Something Breaks

### Form Builder Won't Load
- Check console for errors
- Verify routes in App.tsx
- Check database connection

### Can't Save Template
- RLS is disabled (intentional)
- Check user is logged in
- Check FormBuilder save function

### Preview Not Working
- Verify templateId in URL
- Check database for template
- Check console for errors

### TCF Not Calculating
- Verify temperature field has value
- Check temperatureCorrection.ts import
- Look for NaN in console

---

## 📞 Need Help?

1. Check `CUSTOM_FORMS_CONTEXT.md` for detailed info
2. Look at existing reports for patterns
3. Check console for errors
4. Verify database tables exist
5. Check that user is authenticated

---

**You got this! Start with CustomFormFiller.tsx** 🚀

