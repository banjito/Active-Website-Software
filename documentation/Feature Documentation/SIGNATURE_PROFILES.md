# Signature Profiles System

## Overview

The Signature Profiles system allows users to create, manage, and reuse signature information when generating executive summaries and other documents. This eliminates the need to manually enter signature details each time a document is created.

**Last Updated**: January 2025

---

## Table of Contents

1. [Features](#features)
2. [Database Schema](#database-schema)
3. [Components](#components)
4. [Usage](#usage)
5. [Database Migrations](#database-migrations)
6. [API Integration](#api-integration)

---

## Features

### Core Capabilities

- **Create Signature Profiles**: Save reusable signature information including name, title, email, phone, and section assignment
- **Manage Profiles**: Edit, delete, and organize signature profiles
- **Section-Based Organization**: Assign profiles to different sections (e.g., "Project Manager", "Reviewed By", "Work Performed By")
- **Profile Selection**: Select multiple profiles when generating executive summaries
- **Automatic Integration**: Selected profiles are automatically included in generated documents

### User Interface

- **Signature Profile Manager**: Full CRUD interface for managing profiles
- **Signature Profile Selector**: Multi-select interface for choosing profiles when generating documents
- **Grouped Display**: Profiles are grouped by section title for easy selection

---

## Database Schema

### Table: `neta_ops.signature_profiles`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `name` | TEXT | Display name (e.g., "John Chambers", "Ethan Thoenes") |
| `title` | TEXT | Job title (e.g., "Electrical Engineer", "NETA III Technician") |
| `email` | TEXT | Email address |
| `phone` | TEXT | Phone number |
| `section_title` | TEXT | Section assignment (default: "Reviewed By") |
| `created_by` | UUID | User who created the profile |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

### Indexes

- `idx_signature_profiles_created_by` - Filter by creator
- `idx_signature_profiles_name` - Search by name

### Row Level Security (RLS)

All authenticated users can:
- View all signature profiles
- Create new profiles
- Update any profile
- Delete any profile

### Table: `neta_ops.generated_documents`

The `generated_documents` table stores references to selected signature profiles:

| Column | Type | Description |
|--------|------|-------------|
| `selected_signature_profile_ids` | UUID[] | Array of signature profile IDs selected for this document |
| `signature_sections` | JSONB | Legacy format for backward compatibility |

**Note**: New documents should use `selected_signature_profile_ids`. The `signature_sections` column is maintained for backward compatibility with existing documents.

---

## Components

### SignatureProfileManager

**Location**: `src/components/jobs/SignatureProfileManager.tsx`

Full CRUD interface for managing signature profiles.

**Features**:
- List all profiles (sorted alphabetically)
- Create new profiles
- Edit existing profiles
- Delete profiles
- Group profiles by section title
- Search and filter capabilities

**Props**:
```typescript
interface SignatureProfileManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

### SignatureProfileSelector

**Location**: `src/components/jobs/SignatureProfileSelector.tsx`

Multi-select interface for choosing profiles when generating documents.

**Features**:
- Display profiles grouped by section
- Multi-select with checkboxes
- Select all / Deselect all
- Search functionality
- Link to profile manager

**Props**:
```typescript
interface SignatureProfileSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProfileIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}
```

### Integration in JobDetail

**Location**: `src/components/jobs/JobDetail.tsx`

The signature profile selector is integrated into the document generation workflow:

1. User clicks to generate executive summary
2. Signature profile selector dialog opens
3. User selects desired profiles
4. Selected profile IDs are stored in `selected_signature_profile_ids` array
5. HTML is generated with signature sections from selected profiles

---

## Usage

### Creating a Signature Profile

1. Navigate to Job Detail page
2. Open Signature Profile Manager (via selector or direct access)
3. Click "Add New Profile"
4. Fill in:
   - Name (required)
   - Title
   - Email
   - Phone
   - Section Title (default: "Reviewed By")
5. Click "Save"

### Using Profiles in Executive Summary

1. Navigate to Job Detail page
2. Click "Generate Executive Summary"
3. Signature Profile Selector dialog opens
4. Select desired profiles (can select multiple)
5. Profiles are grouped by section for easy selection
6. Click "Done" to proceed with generation
7. Selected profiles are automatically included in the generated document

### Managing Profiles

1. Open Signature Profile Manager
2. View all profiles (sorted alphabetically)
3. Click edit icon to modify a profile
4. Click delete icon to remove a profile
5. Changes are saved immediately

---

## Database Migrations

### Initial Table Creation

**File**: `Database Scripts/Setup & Configuration/create_signature_profiles_table.sql`

Creates the `signature_profiles` table with:
- All required columns
- Indexes for performance
- RLS policies
- Comments for documentation

**To Run**:
```sql
-- Execute in Supabase SQL Editor
-- See: Database Scripts/Setup & Configuration/create_signature_profiles_table.sql
```

### Generated Documents Integration

**File**: `Database Scripts/Setup & Configuration/update_generated_documents_for_signature_profiles.sql`

Adds `selected_signature_profile_ids` column to `generated_documents` table.

**File**: `Database Scripts/Setup & Configuration/add_signature_sections_to_generated_documents.sql`

Adds `signature_sections` JSONB column for backward compatibility.

### Permissions Fix

**File**: `Database Scripts/Fixes & Maintenance/fix_signature_profiles_permissions.sql`

Fixes RLS policies if permissions issues occur.

### Verification

**File**: `Database Scripts/Verification & Testing/verify_signature_profiles_table.sql`

Verifies table structure and permissions.

---

## API Integration

### Supabase Client Usage

```typescript
import { supabase } from '@/lib/supabase';

// Fetch all profiles
const { data, error } = await supabase
  .schema('neta_ops')
  .from('signature_profiles')
  .select('*')
  .order('name', { ascending: true });

// Create new profile
const { data, error } = await supabase
  .schema('neta_ops')
  .from('signature_profiles')
  .insert({
    name: 'John Doe',
    title: 'Electrical Engineer',
    email: 'john@example.com',
    phone: '(256) 123-4567',
    section_title: 'Reviewed By',
    created_by: userId
  });

// Update profile
const { data, error } = await supabase
  .schema('neta_ops')
  .from('signature_profiles')
  .update({ title: 'Senior Engineer' })
  .eq('id', profileId);

// Delete profile
const { error } = await supabase
  .schema('neta_ops')
  .from('signature_profiles')
  .delete()
  .eq('id', profileId);

// Fetch profiles by IDs (for document generation)
const { data, error } = await supabase
  .schema('neta_ops')
  .from('signature_profiles')
  .select('*')
  .in('id', Array.from(selectedProfileIds));
```

### Document Generation

When generating an executive summary, the system:

1. Retrieves selected profile IDs from `selected_signature_profile_ids`
2. Fetches full profile data from `signature_profiles` table
3. Groups profiles by `section_title`
4. Generates HTML signature sections
5. Inserts into executive summary HTML

**Example HTML Generation**:
```typescript
const generateSignatureSectionsHTML = async (profileIds: Set<string>) => {
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

---

## Section Titles

Common section titles used in the system:

- **"Project Manager"** - Project management signatures
- **"Reviewed By"** - Review signatures (default)
- **"Work Performed By"** - Technician/field work signatures
- **"Approved By"** - Approval signatures

Users can create custom section titles as needed.

---

## Backward Compatibility

The system maintains backward compatibility with existing documents:

1. **Legacy Format**: Documents using `signature_sections` JSONB column continue to work
2. **New Format**: New documents use `selected_signature_profile_ids` array
3. **Migration Path**: Legacy documents can be migrated to use profile IDs

---

## Related Documentation

- [Executive Summary Pages](./EXECUTIVE_SUMMARY.md) - How executive summaries use signature profiles
- [Deliverables System](./Deliverables-System.md) - Document generation workflow
- Database Schema: `Database Scripts/Setup & Configuration/create_signature_profiles_table.sql`

---

## Troubleshooting

### Profiles Not Appearing

1. Check RLS policies are enabled
2. Verify user is authenticated
3. Check database connection

### Profiles Not Saving

1. Verify required fields (name) are provided
2. Check `created_by` field is set
3. Review browser console for errors

### Profiles Not Showing in Selector

1. Ensure profiles exist in database
2. Check section_title grouping logic
3. Verify profile IDs are valid UUIDs

---

## Future Enhancements

Potential improvements:

- Profile templates
- Bulk import/export
- Profile versioning
- Signature image uploads
- Profile sharing between users
- Default profile selection per user
