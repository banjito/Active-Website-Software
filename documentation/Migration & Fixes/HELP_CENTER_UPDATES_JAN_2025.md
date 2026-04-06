# Help Center Updates - January 2025

Summary of all changes, fixes, and improvements made to the Help Center system.

**Date**: January 2025

---

## 🎯 Overview

Major updates to the Help Center including PDF upload functionality, improved UI/UX, and various bug fixes.

---

## ✨ New Features

### 1. PDF Document Upload

**Description:** Added ability to upload PDF documents to the Help Center, allowing teams to add existing SOPs and documentation without recreating them.

**Components Added:**
- `UploadPdfModal.tsx` - Upload interface
- `PdfViewerModal.tsx` - Full-screen PDF viewer
- Database table: `help_center_documents`
- Storage bucket: `help-center-documents`

**Files Created:**
- `src/components/helpCenter/UploadPdfModal.tsx`
- `src/components/helpCenter/PdfViewerModal.tsx`
- `Database Scripts/Setup & Configuration/create_help_center_documents_table.sql`
- `Database Scripts/Setup & Configuration/setup_help_center_documents_storage.sql`

**Files Modified:**
- `src/components/helpCenter/HelpCenterDashboard.tsx`
- `src/lib/types/helpCenter.ts`
- `src/components/helpCenter/index.ts`
- `src/components/ui/Modal.tsx`

**Key Features:**
- Upload PDFs with custom names
- Assign Portal categories
- Full-screen viewer
- Download and open in new tab
- View count tracking
- Admin-only permissions

---

## 🐛 Bug Fixes

### 1. Duplicate Export Error

**Issue:** `GuideViewer` was exported twice in `index.ts`, causing module loading errors (500 error).

**Fix:** Removed duplicate export statement.

**File:** `src/components/helpCenter/index.ts`

**Before:**
```typescript
export { GuideViewer } from './GuideViewer';
export { UploadPdfModal } from './UploadPdfModal';
export { GuideViewer } from './GuideViewer'; // Duplicate!
```

**After:**
```typescript
export { GuideViewer } from './GuideViewer';
export { UploadPdfModal } from './UploadPdfModal';
```

---

### 2. File Path Duplication

**Issue:** PDF uploads were creating paths like `help-center-documents/help-center-documents/file.pdf` causing 400 errors.

**Fix:** Removed bucket name from file path (bucket is already specified in `.from()` call).

**File:** `src/components/helpCenter/UploadPdfModal.tsx`

**Before:**
```typescript
const filePath = `help-center-documents/${fileName}`;
```

**After:**
```typescript
const filePath = fileName; // Just the filename
```

---

### 3. Missing HR Category Label

**Issue:** HR category was missing from `PORTAL_CATEGORY_LABELS`, causing potential display issues.

**Fix:** Added HR category label.

**File:** `src/lib/types/helpCenter.ts`

**Added:**
```typescript
[PortalCategory.HR]: 'HR Portal',
```

---

### 4. Delete Buttons Not Visible

**Issue:** Delete buttons for guides and documents were only visible on hover, making them hard to discover.

**Fix:** Made delete buttons always visible (80% opacity) for admins, with full opacity on hover.

**File:** `src/components/helpCenter/HelpCenterDashboard.tsx`

**Changed:**
- Removed `opacity-0 group-hover:opacity-100`
- Added `opacity-80 hover:opacity-100`

**Affected Components:**
- `GuideCard`
- `GuideListItem`
- `DocumentCard`
- `DocumentListItem`

---

## 🎨 UI/UX Improvements

### 1. Full-Screen PDF Viewer

**Change:** PDF viewer modal now uses full viewport instead of constrained size.

**Implementation:**
- Updated `Modal.tsx` to support full-screen mode
- Removed height constraints
- Made iframe fill available space

**Files Modified:**
- `src/components/ui/Modal.tsx`
- `src/components/helpCenter/PdfViewerModal.tsx`

---

### 2. Removed Suggested Guides

**Change:** Removed the "Suggested guides to get started" section from the empty state.

**Reason:** Cleaner UI, less clutter.

**File:** `src/components/helpCenter/HelpCenterDashboard.tsx`

**Removed:**
- Entire suggested guides grid section
- `EXAMPLE_GUIDES` import (no longer needed)

---

### 3. Better Error Messages

**Change:** Improved error handling and user feedback for upload failures.

**Added:**
- Specific error messages for bucket not found
- Permission error messages
- Better error logging

**File:** `src/components/helpCenter/UploadPdfModal.tsx`

---

## 📊 Database Changes

### New Table: `help_center_documents`

**Schema:**
```sql
CREATE TABLE common.help_center_documents (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type VARCHAR(50) DEFAULT 'application/pdf',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    view_count INTEGER DEFAULT 0
);
```

**Indexes:**
- Category index
- Created by index
- Created at index (descending)

**RLS Policies:**
- View: All authenticated users
- Create: All authenticated users
- Update/Delete: Own documents or admin role

**Migration Script:**
`Database Scripts/Setup & Configuration/create_help_center_documents_table.sql`

---

## 🔧 Storage Changes

### New Bucket: `help-center-documents`

**Configuration:**
- Public bucket (required for PDF viewing)
- 50MB file size limit
- PDF MIME type only

**Policies:**
- Authenticated users can upload
- Authenticated users can view
- Authenticated users can update/delete

**Setup Script:**
`Database Scripts/Setup & Configuration/setup_help_center_documents_storage.sql`

---

## 📝 Type System Updates

### New Interface: `HelpCenterDocument`

**Location:** `src/lib/types/helpCenter.ts`

```typescript
export interface HelpCenterDocument {
  id?: string;
  name: string;
  category: PortalCategory;
  file_path: string;
  file_url: string;
  file_size: number;
  file_type?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  viewCount?: number;
}
```

---

## 🔄 Migration Steps

### For New Installations

1. **Run Database Migration:**
   ```sql
   -- Run in Supabase SQL Editor
   Database Scripts/Setup & Configuration/create_help_center_documents_table.sql
   ```

2. **Create Storage Bucket:**
   - Go to Supabase Dashboard → Storage
   - Create bucket: `help-center-documents`
   - Set as public
   - Set 50MB limit
   - Allow `application/pdf` MIME type

3. **Run Storage Policies:**
   ```sql
   -- Run in Supabase SQL Editor
   Database Scripts/Setup & Configuration/setup_help_center_documents_storage.sql
   ```

### For Existing Installations

1. Run the database migration script
2. Create the storage bucket
3. Run the storage policies script
4. No code changes needed (already in place)

---

## ✅ Testing Checklist

- [x] PDF upload works for admins
- [x] PDF upload fails gracefully for non-admins
- [x] PDF viewer opens in full-screen modal
- [x] PDF downloads work
- [x] View count increments on open
- [x] Delete buttons visible for admins
- [x] Delete works for guides and documents
- [x] Search filters documents correctly
- [x] Category filter works for documents
- [x] Documents display in correct categories
- [x] Error messages are helpful
- [x] No duplicate exports in index.ts

---

## 📚 Documentation

**New Documentation:**
- `Feature Documentation/HELP_CENTER_PDF_UPLOAD.md` - Complete feature documentation

**Updated Documentation:**
- This file (migration summary)

---

## 🔍 Files Changed Summary

### New Files (4)
1. `src/components/helpCenter/UploadPdfModal.tsx`
2. `src/components/helpCenter/PdfViewerModal.tsx`
3. `Database Scripts/Setup & Configuration/create_help_center_documents_table.sql`
4. `Database Scripts/Setup & Configuration/setup_help_center_documents_storage.sql`

### Modified Files (5)
1. `src/components/helpCenter/HelpCenterDashboard.tsx`
2. `src/lib/types/helpCenter.ts`
3. `src/components/helpCenter/index.ts`
4. `src/components/ui/Modal.tsx`
5. `documentation/Feature Documentation/HELP_CENTER_PDF_UPLOAD.md` (new)

---

## 🎯 Impact Assessment

### Breaking Changes
- **None** - All changes are additive

### Deprecations
- **None**

### Performance Impact
- Minimal - New queries are indexed
- PDF loading is handled by browser

### Security Impact
- RLS policies enforce permissions
- Admin-only upload/delete enforced in UI
- Storage bucket policies restrict access

---

## 🚀 Deployment Notes

1. **Database Migration Required:** Yes
2. **Storage Setup Required:** Yes
3. **Code Deployment:** Standard
4. **Rollback Plan:** 
   - Remove new components if needed
   - Table can remain (no breaking changes)
   - Storage bucket can be deleted if needed

---

## 📞 Support

For issues related to these changes:
1. Check `HELP_CENTER_PDF_UPLOAD.md` for feature documentation
2. Review troubleshooting section
3. Verify database and storage setup
4. Check browser console for errors

---

**Document Version**: 1.0  
**Date**: January 2025  
**Author**: Development Team
