# Report Equipment Tables

## Overview

Reports integrate with the equipment system to track and display test equipment used during testing. This includes linking to field equipment records, displaying AMP IDs, serial numbers, and calibration information.

**Last Updated**: January 2025

---

## Table of Contents

1. [Features](#features)
2. [Data Structure](#data-structure)
3. [Report Integration](#report-integration)
4. [Equipment Data Flow](#equipment-data-flow)
5. [Database Storage](#database-storage)
6. [Component Usage](#component-usage)

---

## Features

### Core Capabilities

- **Test Equipment Tracking**: Record equipment used in each test
- **AMP ID Integration**: Link to field equipment database via AMP IDs
- **Serial Number Tracking**: Track equipment serial numbers
- **Calibration Information**: Display calibration dates
- **Equipment Selection**: Select equipment from field equipment database
- **Equipment Display**: Display equipment information in reports

### Equipment Fields

Each test equipment entry typically includes:
- **Name/Model**: Equipment name or model
- **Serial Number**: Equipment serial number
- **AMP ID**: Unique AMP equipment identifier
- **Calibration Date**: Last calibration date
- **Calibration Due Date**: Next calibration due date

---

## Data Structure

### Standard Test Equipment Structure

**Location**: `src/types/standardReportStructure.ts`

```typescript
interface TestEquipmentItem {
  equipmentType: string; // e.g., "Megohmmeter", "Contact Resistance Tester"
  manufacturer: string;
  model: string;
  serialNumber: string;
  ampId?: string; // AMP's internal equipment ID
  calibrationDate?: string;
  calibrationDue?: string;
}

interface StandardTestEquipment {
  equipment: TestEquipmentItem[];
}
```

### Report-Specific Structures

Different report types may have different equipment structures:

#### Example: Automatic Transfer Switch

```typescript
testEquipmentUsed: {
  megohmmeter: {
    name: string;
    serialNumber: string;
    ampId: string;
  };
  lowResistanceOhmmeter: {
    name: string;
    serialNumber: string;
    ampId: string;
  };
}
```

#### Example: Medium Voltage Circuit Breaker

```typescript
testEquipment: {
  insulationResistanceTester: {
    model: string;
    serial: string;
    id: string; // AMP ID
  };
  microOhmmeter: {
    model: string;
    serial: string;
    id: string;
  };
  hiPotTester: {
    model: string;
    serial: string;
    id: string;
  };
}
```

#### Example: Liquid Filled Transformer

```typescript
testEquipment: {
  megohmmeter: {
    name: string;
    serialNumber: string;
    ampId: string;
    calDate: string; // Calibration date
  };
}
```

---

## Report Integration

### Database Storage

Test equipment data is stored in report tables as JSONB:

**Column**: `test_equipment` (JSONB)

**Example Structure**:
```json
{
  "megohmmeter": {
    "name": "Fluke 1550C",
    "serialNumber": "SN123456",
    "ampId": "AMP-001",
    "calDate": "2024-01-15"
  },
  "lowResistanceOhmmeter": {
    "name": "AEMC 6250",
    "serialNumber": "SN789012",
    "ampId": "AMP-002"
  }
}
```

### Report Table Columns

Different report types store equipment in different columns:

1. **Standard Column**: `test_equipment` (JSONB)
2. **Legacy Storage**: Some reports store in `report_info.testEquipment`
3. **Report-Specific**: Some reports have equipment-specific columns

### Common Report Tables

- `switchgear_reports` - `test_equipment` JSONB
- `panelboard_reports` - `test_equipment` JSONB
- `transformer_reports` - `test_equipment` JSONB
- `cable_reports` - `test_equipment` JSONB
- `circuit_breaker_reports` - `test_equipment` JSONB

---

## Equipment Data Flow

### 1. Equipment Selection

When creating/editing a report:

1. User opens report form
2. Test Equipment section displays
3. User can:
   - Manually enter equipment information
   - Select from field equipment database (if integrated)
   - Auto-populate from previous reports

### 2. Data Entry

Equipment data is entered through form inputs:

```typescript
// Example from report component
<input
  value={formData.testEquipment.megohmmeter.name}
  onChange={e => setFormData(p => ({
    ...p,
    testEquipment: {
      ...p.testEquipment,
      megohmmeter: {
        ...p.testEquipment.megohmmeter,
        name: e.target.value
      }
    }
  }))}
/>
```

### 3. Data Persistence

When saving a report:

```typescript
// Save to database
await supabase
  .schema('neta_ops')
  .from('switchgear_reports')
  .update({
    test_equipment: formData.testEquipment
  })
  .eq('id', reportId);
```

### 4. Data Retrieval

When loading a report:

```typescript
// Load from database
const { data } = await supabase
  .schema('neta_ops')
  .from('switchgear_reports')
  .select('test_equipment, report_info')
  .eq('id', reportId)
  .single();

// Handle both new and legacy formats
const testEquipment = data.test_equipment || 
                     data.report_info?.testEquipment || 
                     defaultTestEquipment;
```

---

## Database Storage

### JSONB Column Structure

Equipment is stored as JSONB in the `test_equipment` column:

```sql
-- Example query
SELECT 
  id,
  test_equipment->'megohmmeter'->>'name' as megohmmeter_name,
  test_equipment->'megohmmeter'->>'ampId' as megohmmeter_amp_id,
  test_equipment->'lowResistanceOhmmeter'->>'name' as lro_name
FROM neta_ops.switchgear_reports
WHERE job_id = 'job-uuid';
```

### Legacy Format Support

Some reports store equipment in `report_info` JSONB:

```typescript
// Check both locations
const equipment = data.test_equipment || 
                 data.report_info?.testEquipment || 
                 data.report_data?.testEquipment;
```

### Migration Considerations

When migrating reports:
1. Check `test_equipment` column first
2. Fall back to `report_info.testEquipment`
3. Fall back to `report_data.testEquipment`
4. Use default structure if none found

---

## Component Usage

### Report Form Components

Most report components include a test equipment section:

```typescript
// Example test equipment section
<div className="test-equipment-section">
  <h3>Test Equipment Used</h3>
  
  <div className="equipment-row">
    <label>Megohmmeter</label>
    <input 
      value={formData.testEquipment.megohmmeter.name}
      onChange={handleEquipmentChange('megohmmeter', 'name')}
    />
    <input 
      value={formData.testEquipment.megohmmeter.serialNumber}
      onChange={handleEquipmentChange('megohmmeter', 'serialNumber')}
    />
    <input 
      value={formData.testEquipment.megohmmeter.ampId}
      onChange={handleEquipmentChange('megohmmeter', 'ampId')}
    />
  </div>
</div>
```

### Print Display

Equipment information is displayed in print view:

```typescript
// Print view (hidden on screen, shown in print)
<div className="hidden print:block">
  <table>
    <thead>
      <tr>
        <th>Equipment</th>
        <th>Model/Name</th>
        <th>Serial Number</th>
        <th>AMP ID</th>
        <th>Cal Date</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Megohmmeter</td>
        <td>{formData.testEquipment.megohmmeter.name}</td>
        <td>{formData.testEquipment.megohmmeter.serialNumber}</td>
        <td>{formData.testEquipment.megohmmeter.ampId}</td>
        <td>{formData.testEquipment.megohmmeter.calDate}</td>
      </tr>
    </tbody>
  </table>
</div>
```

### Equipment Lookup Integration

Some reports integrate with field equipment database:

```typescript
// Fetch field equipment
const { data: equipment } = await supabase
  .schema('neta_ops')
  .from('field_equipment')
  .select('equipment_name, amp_id, serial_number, calibration_date')
  .eq('category', 'Megohmmeter')
  .order('equipment_name');

// Populate dropdown
<Select
  value={selectedEquipmentId}
  onChange={handleEquipmentSelect}
>
  {equipment.map(eq => (
    <option key={eq.id} value={eq.id}>
      {eq.equipment_name} ({eq.amp_id})
    </option>
  ))}
</Select>
```

---

## Report Import Integration

When importing reports, equipment data is mapped:

**Location**: `src/services/reportImport/`

```typescript
// Example from importer
if (fieldName.includes('megohmmeter')) {
  reportData.testEquipment.megohmmeter = field.value;
} else if (fieldName.includes('serial')) {
  reportData.testEquipment.serialNumber = field.value;
} else if (fieldName.includes('ampid')) {
  reportData.testEquipment.ampId = field.value;
}
```

---

## Equipment Display in Reports

### Screen View

Equipment is typically editable in screen view:

- Input fields for name, serial, AMP ID
- Dropdowns for equipment selection (if integrated)
- Calibration date pickers

### Print View

Equipment is displayed as read-only text in print:

- Formatted table
- All equipment information visible
- Professional appearance
- NETA-compliant format

### CSS Classes

```css
/* Hide equipment inputs in print */
@media print {
  .test-equipment input {
    display: none;
  }
  
  .test-equipment .print-only {
    display: block;
  }
}
```

---

## Related Documentation

- [Equipment Tables](./EQUIPMENT_TABLES.md) - Field equipment management
- Report Components: `src/components/reports/`
- Report Import: `src/services/reportImport/`
- Standard Structure: `src/types/standardReportStructure.ts`

---

## Troubleshooting

### Equipment Not Saving

1. Verify JSONB column exists
2. Check data structure matches expected format
3. Review browser console for errors
4. Verify RLS policies allow updates

### Equipment Not Displaying

1. Check both `test_equipment` and `report_info.testEquipment`
2. Verify data structure matches component expectations
3. Check for null/undefined values
4. Review print CSS classes

### AMP ID Not Linking

1. Verify AMP ID format matches field equipment database
2. Check field equipment table has matching records
3. Verify equipment lookup integration is enabled

---

## Future Enhancements

Potential improvements:

- Direct field equipment database integration
- Equipment autocomplete from database
- Equipment validation (calibration status)
- Equipment usage tracking across reports
- Equipment maintenance reminders
- Equipment photo/documentation links
- Bulk equipment import/export
