# Equipment Tables System

## Overview

The Equipment Tables system manages field equipment, equipment categories, tracking, and equipment assignments. This includes both general equipment management and field equipment specifically used by technicians.

**Last Updated**: January 2025

---

## Table of Contents

1. [Features](#features)
2. [Database Schema](#database-schema)
3. [Equipment Categories](#equipment-categories)
4. [Field Equipment](#field-equipment)
5. [Equipment Tracking](#equipment-tracking)
6. [Components](#components)
7. [Database Migrations](#database-migrations)

---

## Features

### Core Capabilities

- **Equipment Management**: Track equipment inventory, status, and assignments
- **Category System**: Organize equipment by categories
- **Field Equipment**: Specialized tracking for technician field equipment
- **Calibration Tracking**: Track calibration dates and due dates
- **Equipment Assignment**: Assign equipment to technicians
- **Tracking URLs**: Link equipment to external tracking systems
- **AMP ID System**: Unique identifiers for equipment tracking

### Equipment Types

- **General Equipment**: Tools, instruments, and general equipment
- **Field Equipment**: Technician-specific equipment with calibration requirements
- **Vehicles**: Trucks, vans, SUVs (separate from general equipment)

---

## Database Schema

### Table: `neta_ops.equipment_categories`

Stores available equipment categories.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `name` | VARCHAR(100) | Category name (unique) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Indexes**:
- `idx_equipment_categories_name` - Fast lookups by name

**RLS Policies**:
- All authenticated users can view, create, update, and delete categories

### Table: `neta_ops.field_equipment`

Stores field equipment used by technicians.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `equipment_name` | TEXT | Equipment name |
| `amp_id` | TEXT | AMP unique identifier |
| `serial_number` | TEXT | Serial number |
| `category` | TEXT | Equipment category |
| `calibration_date` | DATE | Last calibration date |
| `calibration_due_date` | DATE | Next calibration due date |
| `tracking_url` | TEXT | URL for tracking the equipment |
| `notes` | TEXT | Additional notes |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Key Features**:
- Calibration date tracking
- Category assignment
- AMP ID for unique identification
- Tracking URL integration

### Table: `common.equipment`

General equipment table (legacy schema).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Equipment name |
| `type` | TEXT | Equipment type |
| `serial_number` | TEXT | Serial number |
| `model` | TEXT | Model number |
| `manufacturer` | TEXT | Manufacturer |
| `purchase_date` | DATE | Purchase date |
| `warranty_expiration` | DATE | Warranty expiration |
| `status` | TEXT | Status (available, assigned, maintenance, retired) |
| `location` | TEXT | Current location |
| `notes` | TEXT | Additional notes |
| `last_maintenance_date` | DATE | Last maintenance date |
| `next_maintenance_date` | DATE | Next maintenance date |

### Table: `common.equipment_assignments`

Tracks equipment assignments to technicians.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `equipment_id` | UUID | Reference to equipment |
| `technician_id` | UUID | Reference to user/technician |
| `start_date` | DATE | Assignment start date |
| `end_date` | DATE | Assignment end date (nullable) |
| `notes` | TEXT | Assignment notes |

### Table: `common.equipment_maintenance`

Tracks maintenance records for equipment.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `equipment_id` | UUID | Reference to equipment |
| `maintenance_date` | DATE | Maintenance date |
| `maintenance_type` | TEXT | Type of maintenance |
| `technician_id` | UUID | Technician who performed maintenance |
| `description` | TEXT | Maintenance description |
| `cost` | DECIMAL(10,2) | Maintenance cost |
| `vendor` | TEXT | Vendor name |
| `report_file_path` | TEXT | Path to maintenance report |
| `notes` | TEXT | Additional notes |

---

## Equipment Categories

### Category Management

Categories are managed through the `equipment_categories` table and can be:
- Created by any authenticated user
- Updated by any authenticated user
- Deleted by any authenticated user
- Used to organize field equipment

### Category Population

Categories are automatically populated from existing `field_equipment` records during migration:

```sql
INSERT INTO neta_ops.equipment_categories (name)
SELECT DISTINCT category
FROM neta_ops.field_equipment
WHERE category IS NOT NULL AND category != ''
ON CONFLICT (name) DO NOTHING;
```

### Common Categories

Examples of equipment categories:
- Multimeters
- Megohmmeters
- Low Resistance Ohmmeters
- TTR Test Sets
- Power Quality Analyzers
- Thermal Imaging Cameras
- Cable Testers
- Insulation Testers

---

## Field Equipment

### Key Features

1. **AMP ID System**: Unique identifier for each piece of equipment
2. **Calibration Tracking**: Tracks calibration dates and due dates
3. **Category Assignment**: Links equipment to categories
4. **Tracking URLs**: External tracking system integration
5. **Status Tracking**: In-cal, out-of-cal, maintenance status

### Calibration Status

Field equipment can be in one of these states:
- **In Cal**: Equipment is calibrated and within calibration period
- **Out of Cal**: Equipment calibration has expired
- **Due Soon**: Calibration due date approaching

### Equipment Views

The system provides multiple views:
- **All Equipment**: Complete equipment list
- **In Cal**: Equipment currently in calibration
- **Out of Cal**: Equipment with expired calibration
- **By Category**: Equipment grouped by category

---

## Equipment Tracking

### Tracking URL Integration

The `tracking_url` column allows linking equipment to external tracking systems:

```sql
ALTER TABLE neta_ops.field_equipment
ADD COLUMN IF NOT EXISTS tracking_url TEXT;
```

**Use Cases**:
- Link to asset management systems
- Link to calibration tracking systems
- Link to maintenance scheduling systems
- External equipment databases

### AMP ID System

The AMP ID provides a unique identifier for equipment:
- Used in reports and documentation
- Links to equipment database
- Enables equipment tracking across jobs
- Referenced in test equipment sections of reports

---

## Components

### FieldEquipmentList

**Location**: `src/components/equipment/FieldEquipmentList.tsx`

Main component for viewing and managing field equipment.

**Features**:
- List all field equipment
- Filter by calibration status (all, in-cal, out-of-cal)
- Filter by category
- Search functionality
- Equipment details view
- Calibration date tracking

**Tabs**:
- **All**: All equipment
- **In Cal**: Equipment in calibration
- **Out of Cal**: Equipment out of calibration
- **Category**: Equipment grouped by category

### EquipmentTable

**Location**: `src/components/equipment/EquipmentTable.tsx`

Table component for displaying equipment.

**Features**:
- Equipment name, type, status
- Location and customer information
- Asset association
- Last maintenance date
- Action menu (edit, delete, assign, view details)

### EquipmentManagement

**Location**: `src/components/equipment/EquipmentManagement.tsx`

Full equipment management interface.

**Features**:
- Equipment CRUD operations
- Category management
- Status management
- Assignment tracking
- Maintenance records

---

## Database Migrations

### Equipment Categories Table

**File**: `Database Scripts/Setup & Configuration/create_equipment_categories_table.sql`

Creates the `equipment_categories` table with:
- Table structure
- Indexes
- RLS policies
- Auto-update trigger for `updated_at`
- Initial category population from existing equipment

**To Run**:
```sql
-- Execute in Supabase SQL Editor
-- See: Database Scripts/Setup & Configuration/create_equipment_categories_table.sql
```

### Tracking URL Column

**File**: `Database Scripts/Setup & Configuration/add_tracking_url_to_field_equipment.sql`

Adds `tracking_url` column to `field_equipment` table.

**To Run**:
```sql
-- Execute in Supabase SQL Editor
-- See: Database Scripts/Setup & Configuration/add_tracking_url_to_field_equipment.sql
```

### Verification

After running migrations, verify with:

```sql
-- Verify categories table
SELECT * FROM neta_ops.equipment_categories ORDER BY name;

-- Verify tracking_url column
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'neta_ops' 
  AND table_name = 'field_equipment' 
  AND column_name = 'tracking_url';
```

---

## API Integration

### Fetching Equipment

```typescript
import { supabase } from '@/lib/supabase';

// Fetch all field equipment
const { data, error } = await supabase
  .schema('neta_ops')
  .from('field_equipment')
  .select('*')
  .order('equipment_name', { ascending: true });

// Fetch equipment by category
const { data, error } = await supabase
  .schema('neta_ops')
  .from('field_equipment')
  .select('*')
  .eq('category', 'Multimeters')
  .order('equipment_name', { ascending: true });

// Fetch out-of-cal equipment
const { data, error } = await supabase
  .schema('neta_ops')
  .from('field_equipment')
  .select('*')
  .lt('calibration_due_date', new Date().toISOString())
  .order('calibration_due_date', { ascending: true });
```

### Fetching Categories

```typescript
// Fetch all categories
const { data, error } = await supabase
  .schema('neta_ops')
  .from('equipment_categories')
  .select('*')
  .order('name', { ascending: true });

// Create new category
const { data, error } = await supabase
  .schema('neta_ops')
  .from('equipment_categories')
  .insert({ name: 'New Category' });
```

### Equipment Service

**Location**: `src/lib/services/equipmentService.ts`

Provides high-level equipment management functions:

```typescript
import { equipmentService } from '@/lib/services/equipmentService';

// Get all equipment with filters
const equipment = await equipmentService.getAllEquipment({
  division: 'division-id',
  portal: 'portal-type',
  search: 'search term',
  category: 'category-name',
  status: 'available'
});

// Get equipment by ID
const equipment = await equipmentService.getEquipmentById(id);

// Create equipment
const newEquipment = await equipmentService.createEquipment(equipmentData);

// Update equipment
await equipmentService.updateEquipment(id, updateData);

// Delete equipment
await equipmentService.deleteEquipment(id);
```

---

## Equipment Status

### Status Values

- **available**: Equipment is available for assignment
- **assigned**: Equipment is currently assigned to a technician
- **maintenance**: Equipment is in maintenance
- **retired**: Equipment is no longer in use

### Calibration Status

For field equipment:
- **In Cal**: `calibration_due_date >= today`
- **Out of Cal**: `calibration_due_date < today`
- **Due Soon**: `calibration_due_date` within 30 days

---

## Related Documentation

- [Report Equipment Tables](./REPORT_EQUIPMENT.md) - How reports use equipment data
- Database Schema: `Database Scripts/Setup & Configuration/create_equipment_categories_table.sql`
- Database Schema: `Database Scripts/Setup & Configuration/add_tracking_url_to_field_equipment.sql`

---

## Troubleshooting

### Categories Not Appearing

1. Verify `equipment_categories` table exists
2. Check RLS policies are enabled
3. Ensure user is authenticated
4. Run category population script if needed

### Equipment Not Saving

1. Verify required fields are provided
2. Check category exists in `equipment_categories` table
3. Review browser console for errors
4. Verify RLS policies allow insert/update

### Calibration Dates Not Updating

1. Check date format (should be ISO format)
2. Verify `calibration_date` and `calibration_due_date` are valid dates
3. Check for timezone issues

---

## Future Enhancements

Potential improvements:

- Equipment barcode scanning
- Automated calibration reminders
- Equipment usage tracking
- Maintenance scheduling
- Equipment lifecycle management
- Integration with external asset management systems
- Equipment photos/documentation
- Equipment warranty tracking
