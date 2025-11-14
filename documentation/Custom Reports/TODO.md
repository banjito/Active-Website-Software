# Custom Forms - TODO List

## ✅ Phase 1: Builder & Preview (DONE)

- [x] Database tables created
- [x] Form builder UI
- [x] Component library (15 components)
- [x] Drag & drop
- [x] Save/load templates
- [x] Templates list page
- [x] Preview mode
- [x] Temperature/TCF auto-calc
- [x] Text input for all fields
- [x] Clearable default values
- [x] Mobile optimization
- [x] Dark mode support

---

## 🔨 Phase 2: Integration (IN PROGRESS)

### HIGH PRIORITY

#### 1. Create Form Filler Component
- [ ] Create `src/components/customForms/CustomFormFiller.tsx`
- [ ] Copy from CustomFormPreview.tsx
- [ ] Add jobId and instanceId props
- [ ] Add save function
  - [ ] Save to custom_form_instances
  - [ ] Create asset entry
  - [ ] Link to job via job_assets
- [ ] Add load existing instance logic
- [ ] Test create new form
- [ ] Test edit existing form
- [ ] Add to App.tsx routes

#### 2. Add to "Add Asset" Menu
- [ ] Find job details "Add Asset" dropdown code
- [ ] Add "Custom Forms" section
- [ ] Fetch active templates
- [ ] List templates in menu
- [ ] Open CustomFormFiller on click
- [ ] Pass jobId prop
- [ ] Test from job page

#### 3. Display in Job Assets
- [ ] Verify forms appear in job assets list
- [ ] Add icon/indicator for custom forms
- [ ] Make clickable to view/edit
- [ ] Test navigation to CustomFormFiller
- [ ] Show PASS/FAIL status

---

## 🎨 Phase 3: Polish (LATER)

### MEDIUM PRIORITY

#### 4. Admin Panel
- [ ] Create `/admin/custom-forms` page
- [ ] View all templates (active & inactive)
- [ ] Toggle active/inactive status
- [ ] Delete templates permanently
- [ ] User permissions check
- [ ] Add to admin menu

#### 5. Template Versioning
- [ ] Track template changes
- [ ] Don't break existing instances
- [ ] Show "Template Updated" warning
- [ ] Copy/snapshot template on save

#### 6. Corrected Values Calculation
- [ ] Implement real-time TCF multiplication
- [ ] Update corrected columns in tables
- [ ] Handle empty/invalid values
- [ ] Test with different temperatures

---

## 🚀 Phase 4: Advanced Features (FUTURE)

### LOW PRIORITY

#### 7. Export to PDF
- [ ] Generate PDF from filled forms
- [ ] Match standard report styling
- [ ] Include all sections
- [ ] Handle page breaks
- [ ] Add print styles

#### 8. Template Categories/Tags
- [ ] Add category field to templates
- [ ] Filter by category in list
- [ ] Search by tags
- [ ] Equipment type categories

#### 9. Formula Builder
- [ ] UI for creating calculations
- [ ] Dependency picker
- [ ] Formula validation
- [ ] Error handling
- [ ] Test calculations

#### 10. Keyboard Navigation
- [ ] Arrow key navigation in tables
- [ ] Tab through form fields
- [ ] Shortcuts for save/cancel
- [ ] Match standard reports

---

## 🐛 Known Issues to Fix

- [ ] Remove debug console.logs from FormBuilder
- [ ] Add validation on template save (name required)
- [ ] Prevent duplicate template names
- [ ] Better error messages
- [ ] Loading states for all async operations

---

## 📝 Documentation Needed

- [ ] User guide for creating templates
- [ ] User guide for filling out forms
- [ ] Admin guide for template management
- [ ] Video walkthrough
- [ ] Add to main README

---

## 🧪 Testing Checklist

### Builder Testing
- [ ] Create template
- [ ] Edit template
- [ ] Delete template
- [ ] Duplicate template
- [ ] Add all component types
- [ ] Reorder sections
- [ ] Add/remove table rows
- [ ] Change layouts
- [ ] Save with empty name (should fail)
- [ ] Mobile responsiveness
- [ ] Dark mode

### Preview Testing
- [ ] Preview template
- [ ] Fill all field types
- [ ] Clear default values
- [ ] Temperature calculation
- [ ] PASS/FAIL toggle
- [ ] Back button
- [ ] Changes not saved (correct behavior)

### Filler Testing (TODO)
- [ ] Create new form instance
- [ ] Edit existing instance
- [ ] Save to database
- [ ] Asset created correctly
- [ ] Linked to job
- [ ] Appears in job assets
- [ ] PASS/FAIL status saves
- [ ] Temperature calculations work
- [ ] All field types work

### Integration Testing (TODO)
- [ ] Open from Add Asset menu
- [ ] All templates listed
- [ ] Opens correct template
- [ ] Returns to job after save
- [ ] Can re-open to edit
- [ ] Multiple forms per job
- [ ] Forms from different templates

---

## 📊 Progress Tracking

**Phase 1:** ████████████████████ 100% (Done)  
**Phase 2:** ████░░░░░░░░░░░░░░░░  20% (CustomFormFiller next)  
**Phase 3:** ░░░░░░░░░░░░░░░░░░░░   0%  
**Phase 4:** ░░░░░░░░░░░░░░░░░░░░   0%  

**Overall:** ████░░░░░░░░░░░░░░░░  25% Complete

---

## 🎯 Next Session Goals

1. Create CustomFormFiller.tsx (core functionality)
2. Test save/load cycle
3. Add route if needed

**Time Estimate:** 1-2 hours for CustomFormFiller

---

## 💡 Notes

- RLS staying disabled (user preference)
- Preview intentionally doesn't save (test mode)
- All number inputs accept text (matches standard reports)
- TCF is built into Job Info (not separate component)

---

**Last Updated:** November 6, 2024  
**Next Update:** After CustomFormFiller is complete

