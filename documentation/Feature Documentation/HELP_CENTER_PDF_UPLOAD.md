# Help Center PDF Upload Feature

Complete documentation for the PDF upload functionality added to the ampOS Help Center.

**Last Updated**: January 2025

---

## 📋 Overview

The Help Center now supports uploading PDF documents (SOPs, guides, etc.) alongside the existing guide builder system. This allows teams to upload existing documentation without recreating it in the guide format.

### Key Features

- ✅ Upload PDF documents with custom names
- ✅ Assign Portal categories to documents
- ✅ Full-screen PDF viewer modal
- ✅ Download and open in new tab options
- ✅ View count tracking
- ✅ Admin-only upload and delete permissions
- ✅ Search and filter by category
- ✅ Display alongside guides in organized categories

---

## 🗄️ Database Schema

### Table: `help_center_documents`

Located in the `common` schema.

```sql
CREATE TABLE common.help_center_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
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

**Columns:**
- `id` - Unique identifier
- `name` - Display name for the document
- `category` - Portal category (operations, sales, hr, etc.)
- `file_path` - Storage path to the PDF file
- `file_url` - Public URL for accessing the PDF
- `file_size` - File size in bytes
- `file_type` - MIME type (default: application/pdf)
- `created_by` - User who uploaded the document
- `created_at` - Upload timestamp
- `updated_at` - Last update timestamp
- `view_count` - Number of times document was viewed

**Indexes:**
- `idx_help_center_documents_category` - For filtering by category
- `idx_help_center_documents_created_by` - For user queries
- `idx_help_center_documents_created_at` - For sorting by date

**RLS Policies:**
- All authenticated users can view documents
- Authenticated users can create documents
- Users can update/delete their own documents
- Admins can update/delete any document

---

## 📦 Storage Setup

### Bucket: `help-center-documents`

**Configuration:**
- **Name**: `help-center-documents`
- **Public**: Yes (required for PDF viewing)
- **File Size Limit**: 50MB (recommended)
- **Allowed MIME Types**: `application/pdf`

### Storage Policies

The storage bucket requires RLS policies for:
- **INSERT**: Authenticated users can upload PDFs
- **SELECT**: Authenticated users can view/download PDFs
- **UPDATE**: Authenticated users can update files
- **DELETE**: Authenticated users can delete files

See `Database Scripts/Setup & Configuration/setup_help_center_documents_storage.sql` for complete policy definitions.

---

## 🚀 Setup Instructions

### 1. Database Migration

Run the table creation script:

```bash
# In Supabase SQL Editor
Database Scripts/Setup & Configuration/create_help_center_documents_table.sql
```

This creates:
- The `help_center_documents` table
- Required indexes
- RLS policies
- Update trigger for `updated_at`

### 2. Storage Bucket Setup

**Option A: Via Supabase Dashboard**
1. Go to Storage → New Bucket
2. Name: `help-center-documents`
3. Public: ✅ Yes
4. File size limit: 50MB
5. Allowed MIME types: `application/pdf`

**Option B: Via SQL**
Run the storage policies script:

```bash
# In Supabase SQL Editor
Database Scripts/Setup & Configuration/setup_help_center_documents_storage.sql
```

**Note:** The bucket itself must be created via Dashboard or API first.

### 3. Verify Setup

Check that:
- ✅ Table exists: `SELECT * FROM common.help_center_documents LIMIT 1;`
- ✅ Bucket exists in Storage dashboard
- ✅ Policies are active (check Storage → Policies)

---

## 💻 Component Architecture

### Components

#### `UploadPdfModal.tsx`
Modal component for uploading PDF documents.

**Props:**
- `isOpen: boolean` - Modal visibility
- `onClose: () => void` - Close handler
- `onUploadSuccess: () => void` - Callback after successful upload

**Features:**
- File selection (PDF only, 50MB max)
- Document name input
- Portal category selection
- Upload progress indicator
- Error handling with helpful messages

**Usage:**
```tsx
<UploadPdfModal
  isOpen={showUploadModal}
  onClose={() => setShowUploadModal(false)}
  onUploadSuccess={() => loadDocuments()}
/>
```

#### `PdfViewerModal.tsx`
Full-screen modal for viewing PDF documents.

**Props:**
- `isOpen: boolean` - Modal visibility
- `onClose: () => void` - Close handler
- `document: HelpCenterDocument | null` - Document to display

**Features:**
- Full-screen PDF viewer (iframe)
- Download button
- Open in new tab button
- View count tracking (auto-increments)
- Loading state
- Error handling with fallback options

**Usage:**
```tsx
<PdfViewerModal
  isOpen={showPdfViewer}
  onClose={() => setShowPdfViewer(false)}
  document={selectedDocument}
/>
```

#### `HelpCenterDashboard.tsx`
Main dashboard component (updated).

**New Features:**
- "Upload PDF" button (admin only)
- Document loading and display
- Document deletion (admin only)
- Documents grouped by Portal category
- Search and filter support for documents

---

## 📝 Type Definitions

### `HelpCenterDocument`

```typescript
interface HelpCenterDocument {
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

**Location:** `src/lib/types/helpCenter.ts`

---

## 🔐 Permissions & Security

### Admin Requirements

Only users with Admin or Super Admin roles can:
- Upload PDF documents
- Delete PDF documents
- Delete guides

### User Permissions

All authenticated users can:
- View PDF documents
- View guides
- Search and filter content

### RLS Policies

**Database:**
- View: All authenticated users
- Create: All authenticated users (UI restricts to admins)
- Update/Delete: Own documents or admin role

**Storage:**
- Upload: Authenticated users
- View: Authenticated users
- Delete: Authenticated users

---

## 🎨 UI/UX Features

### Upload Flow

1. Admin clicks "Upload PDF" button
2. Modal opens with:
   - File selection (drag & drop or click)
   - Document name input (auto-filled from filename)
   - Portal category dropdown
3. Upload progress shown
4. Success message and modal closes
5. Document appears in appropriate category

### Viewing Flow

1. User clicks on PDF document card/list item
2. Full-screen modal opens
3. PDF loads in embedded iframe
4. View count increments automatically
5. User can:
   - View PDF with browser controls
   - Download PDF
   - Open in new tab

### Display

Documents are displayed:
- **Grid View**: Card layout with PDF icon, name, size, view count
- **List View**: Compact list with PDF icon, name, size, date
- **Grouped**: By Portal category (same as guides)
- **Searchable**: By document name
- **Filterable**: By Portal category

---

## 🐛 Troubleshooting

### Upload Issues

**Error: "Bucket not found"**
- Solution: Create the `help-center-documents` bucket in Supabase Storage
- Verify bucket name is exactly `help-center-documents`

**Error: "Database table not configured"**
- Solution: Run `create_help_center_documents_table.sql` migration

**Error: "Permission denied"**
- Solution: Check storage bucket policies are set up correctly
- Verify user has authenticated session

**Error: "File size must be less than 50MB"**
- Solution: Compress PDF or split into multiple documents

### Viewing Issues

**PDF doesn't load in modal**
- Check file URL is accessible (try opening in new tab)
- Verify storage bucket is public
- Check browser console for CORS errors

**View count not incrementing**
- Check database permissions
- Verify RLS policies allow updates
- Check browser console for errors

---

## 📊 Recent Changes & Fixes

### January 2025

#### Added
- ✅ PDF upload functionality
- ✅ Full-screen PDF viewer modal
- ✅ Document management (upload, view, delete)
- ✅ Portal category assignment
- ✅ View count tracking
- ✅ Search and filter for documents

#### Fixed
- ✅ Removed duplicate `GuideViewer` export in index.ts
- ✅ Fixed file path issue (removed duplicate bucket name in path)
- ✅ Made delete buttons always visible for admins (was hover-only)
- ✅ Removed suggested guides section from empty state
- ✅ Fixed HR category missing from PORTAL_CATEGORY_LABELS

#### Improved
- ✅ Better error messages for upload failures
- ✅ Upload progress indicator
- ✅ Full-screen modal for better PDF viewing
- ✅ Document cards/list items with consistent styling

---

## 🔄 Migration from Existing System

If you have existing PDFs stored elsewhere:

1. **Bulk Upload Process:**
   - Use the upload modal for each document
   - Assign appropriate Portal categories
   - Use descriptive names

2. **Database Migration (if needed):**
   - Export existing document metadata
   - Map to `help_center_documents` schema
   - Import via SQL or API

3. **Storage Migration:**
   - Upload files to `help-center-documents` bucket
   - Update file paths in database records
   - Verify public URLs are accessible

---

## 📚 Related Documentation

- [Help Center Guide Builder](./README.md) - Guide creation system
- [Storage Buckets Setup](../Technical%20Reference/storage-buckets-setup.md) - General storage setup
- [Database Schema](../Database%20&%20Schema/README.md) - Database documentation

---

## 🎯 Future Enhancements

Potential improvements:
- [ ] PDF thumbnail generation
- [ ] Document versioning
- [ ] Bulk upload support
- [ ] Document tags/categories
- [ ] Document search within PDF content
- [ ] Document analytics (popular documents, etc.)
- [ ] Document templates
- [ ] Integration with guide builder (embed PDFs in guides)

---

## 📞 Support

For issues or questions:
1. Check this documentation
2. Review troubleshooting section
3. Check browser console for errors
4. Verify database and storage setup
5. Contact development team

---

**Document Version**: 1.0  
**Last Updated**: January 2025
