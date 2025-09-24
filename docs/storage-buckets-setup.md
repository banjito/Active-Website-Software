# Storage Buckets Setup and Document Management

This document provides a comprehensive guide for setting up and using the storage buckets for document management in the AMP application.

## Overview

The application now supports multiple storage buckets for different types of documents:

1. **job-documents** - Subcontractor agreements, contracts, and job-related documents
2. **one-line-drawings** - Electrical one-line drawings, schematics, and technical drawings
3. **documents** - General company documents, manuals, forms, and reports (private)
4. **user-uploads** - Profile pictures and user-specific uploads

## Setup Instructions

### 1. Run the Database Migration

Execute the SQL script to set up all storage buckets and the one-line drawings table:

```bash
# Run this SQL script in your Supabase SQL editor
migrations/setup_storage_buckets.sql
```

This script will:
- Create all four storage buckets with appropriate file size limits and MIME type restrictions
- Set up proper RLS policies for each bucket
- Create the `one_line_drawings` table in the `neta_ops` schema
- Set up indexes and triggers for optimal performance

### 2. Verify Setup

After running the migration, verify the setup by checking:

1. **Storage Buckets**: Go to Supabase Dashboard > Storage and confirm all four buckets exist
2. **Database Table**: Check that `neta_ops.one_line_drawings` table exists
3. **Policies**: Ensure RLS policies are active on both storage buckets and the new table

## Features

### Job Overview - One-Line Drawings

The job overview now includes a dedicated section for one-line drawings:

- **Upload drawings** in various formats (PDF, JPG, PNG, DWG, DXF, Visio)
- **Version management** with the ability to set current drawings
- **Preview functionality** for images and PDFs
- **Download capability** for all file types
- **File metadata** including version, size, and upload date

### Document Categories

The system supports various document categories:
- General documents
- Reports
- Manuals
- Forms
- Contracts
- Agreements
- Drawings
- Schematics
- Specifications

### Storage Bucket Configuration

| Bucket | Public | Size Limit | Purpose |
|--------|---------|------------|---------|
| job-documents | Yes | 50MB | Contracts, agreements, job docs |
| one-line-drawings | Yes | 100MB | Technical drawings, schematics |
| documents | No | 50MB | General company documents |
| user-uploads | Yes | 10MB | Profile pictures, user files |

## Usage

### Uploading One-Line Drawings

1. Navigate to a job detail page
2. Go to the "Overview" tab
3. Find the "One-Line Drawings" section
4. Click "Upload Drawing"
5. Fill in the drawing details:
   - **File**: Select your drawing file
   - **Name**: Enter a descriptive name
   - **Version**: Specify version (defaults to 1.0)
   - **Description**: Optional description
6. Click "Upload Drawing"

### Managing Drawings

- **Set as Current**: Click the star icon to mark a drawing as the current version
- **Preview**: Click the eye icon to preview images and PDFs
- **Download**: Click the download icon to save the file locally
- **Delete**: Click the trash icon to permanently remove a drawing

### API Functions

The following functions are available in `src/lib/documentUtils.ts`:

#### One-Line Drawing Functions
- `uploadOneLineDrawing(drawing: OneLineDrawingUpload)` - Upload a new drawing
- `fetchOneLineDrawings(jobId: string)` - Get all drawings for a job
- `getCurrentOneLineDrawing(jobId: string)` - Get the current drawing for a job
- `deleteOneLineDrawing(drawingId: string)` - Delete a drawing
- `setCurrentOneLineDrawing(drawingId: string)` - Set a drawing as current

#### General Storage Functions
- `getFileUrl(bucket: StorageBucket, filePath: string, expiresIn?: number)` - Get file URL
- `deleteFile(bucket: StorageBucket, filePath: string)` - Delete a file from storage

### TypeScript Types

New types have been added to `src/lib/types/index.ts`:

```typescript
interface OneLineDrawing {
  id: string;
  job_id: string;
  user_id: string;
  name: string;
  description?: string;
  file_url: string;
  file_path: string;
  file_type?: string;
  file_size?: number;
  version: string;
  is_current: boolean;
  upload_date: string;
  created_at: string;
  updated_at: string;
}

interface OneLineDrawingUpload {
  name: string;
  description?: string;
  file: File;
  job_id: string;
  version?: string;
}

type StorageBucket = 'job-documents' | 'one-line-drawings' | 'documents' | 'user-uploads';
```

## File Type Support

### One-Line Drawings
- **Images**: JPEG, PNG, GIF, TIFF, BMP
- **Documents**: PDF
- **CAD Files**: DWG, DXF
- **Diagrams**: Visio files

### Job Documents
- **Documents**: PDF, Word, Excel, PowerPoint
- **Images**: JPEG, PNG, GIF
- **Text**: Plain text files

### General Documents
- **Office Files**: Word, Excel, PowerPoint
- **PDFs**: All PDF files
- **Images**: JPEG, PNG, GIF
- **Data**: CSV files, plain text

## Security

### Access Control
- All buckets require authentication
- Users can only delete their own uploads
- Public buckets allow viewing by all authenticated users
- Private buckets (documents) use signed URLs for access

### File Validation
- File size limits enforced at bucket level
- MIME type restrictions prevent unauthorized file types
- File extension validation on the frontend

## Best Practices

1. **File Naming**: Use descriptive names for drawings and documents
2. **Version Control**: Always specify versions for one-line drawings
3. **File Size**: Optimize large drawings before uploading
4. **Organization**: Use appropriate categories for general documents
5. **Cleanup**: Regularly review and remove outdated drawings

## Troubleshooting

### Common Issues

1. **Upload Fails**: Check file size and type restrictions
2. **Access Denied**: Verify user authentication and RLS policies
3. **Preview Not Working**: Ensure bucket policies allow public access
4. **Database Errors**: Check that the migration ran successfully

### Error Messages

- "User not authenticated" - User needs to log in
- "File too large" - Reduce file size or use a different bucket
- "Invalid file type" - Check supported MIME types for the bucket
- "Drawing not found" - The drawing may have been deleted

## Development

### Adding New Document Types

To add support for new document types:

1. Update the `DocumentCategory` type in `src/lib/types/index.ts`
2. Add MIME types to the bucket configuration in the migration
3. Update UI components to handle the new category
4. Add validation logic if needed

### Extending Storage Buckets

To add new storage buckets:

1. Create the bucket in the migration script
2. Add bucket policies for proper access control
3. Update the `StorageBucket` type
4. Add utility functions in `documentUtils.ts`
5. Update UI components as needed

## Support

For issues with storage buckets or document management:

1. Check the browser console for error messages
2. Verify Supabase configuration and policies
3. Review file permissions and authentication
4. Contact the development team for assistance

---

*This document should be updated as new features are added or existing functionality changes.*
