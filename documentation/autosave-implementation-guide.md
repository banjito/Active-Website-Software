# Autosave Implementation Guide

This guide provides a step-by-step process for implementing Google Docs-style autosave functionality in report components.

## Overview

The autosave feature provides:
- **Silent Auto-Save**: Reports automatically save every 500ms after user input changes
- **Persistent Edit State**: Users remain in edit mode when filling a new report
- **Live Asset Updates**: The linked assets list updates automatically as reports are created
- **No Visual Interruption**: Saving happens silently in the background with no alerts
- **URL Management**: URLs update dynamically to reflect the new report ID upon initial autosave
- **Visual Indicator**: A "✓ Auto Saving Enabled" badge displays on reports with this feature

---

## Step-by-Step Implementation

### 1. Update State Variables

**Replace** the `reportId` parameter with `initialReportId` and add autosave states:

```typescript
// BEFORE
const { id: jobId, reportId } = useParams<{ id: string; reportId?: string }>();
const [loading, setLoading] = useState(true);
const [isEditing, setIsEditing] = useState(!reportId);

// AFTER
const { id: jobId, reportId: initialReportId } = useParams<{ id: string; reportId?: string }>();
const [currentReportId, setCurrentReportId] = useState<string | undefined>(initialReportId);
const [loading, setLoading] = useState(true);
const [isEditing, setIsEditing] = useState(!initialReportId);
const [isAutoSaving, setIsAutoSaving] = useState(false);
const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
const isAutoSaveCreatedRef = React.useRef(false);
const reportIdRef = React.useRef<string | undefined>(initialReportId);
const creatingRef = React.useRef(false);
const pendingSaveRef = React.useRef(false);
```

**Note**: Use `React.useRef` instead of importing `useRef` separately to avoid import issues.

**Concurrent-insert guard (required):** `reportIdRef`, `creatingRef`, and `pendingSaveRef` prevent duplicate report rows when multiple autosaves fire before the first INSERT returns. See [Concurrent-insert guard](#concurrent-insert-guard) below.

---

### 2. Update loadReport Function

Modify the `loadReport` function to handle autosave creation:

```typescript
const loadReport = async () => {
  // CRITICAL: This check must come FIRST, before checking !currentReportId
  // Don't reload if we just created the report via autosave
  if (isAutoSaveCreatedRef.current) {
    isAutoSaveCreatedRef.current = false;
    setLoading(false);
    return;
  }

  if (!currentReportId) {
    setLoading(false);
    setIsEditing(true);
    return;
  }
  
  try {
    setLoading(true);
    
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('your_report_table')
      .select('*')
      .eq('id', currentReportId)  // Changed from reportId
      .single();
    
    if (error) throw error;
    
    if (data) {
      // Populate form data...
      setIsEditing(false);
    }
  } catch (error) {
    console.error('Error loading report:', error);
    setIsEditing(true);
  } finally {
    setLoading(false);
  }
};
```

**⚠️ CRITICAL ORDER**: The `isAutoSaveCreatedRef` check MUST come before the `!currentReportId` check. Otherwise, after autosave creates a report, the component will reload it and exit edit mode.

---

### 3. Update useEffect Dependencies

Replace all `reportId` references with `currentReportId` in useEffect dependencies:

```typescript
// BEFORE
useEffect(() => {
  loadReport();
}, [reportId]);

// AFTER
useEffect(() => {
  loadReport();
}, [currentReportId]);
```

---

### 4. Create the autoSave Function

Add the `autoSave` function **BEFORE** `handleSave`:

```typescript
// Auto-save function
const autoSave = React.useCallback(async () => {
  if (!jobId || !user?.id) return;

  const reportPayload = {
    job_id: jobId,
    user_id: user.id,
    // ... your report data structure
  };

  try {
    setIsAutoSaving(true);

    if (currentReportId) {
      // Update existing report
      await supabase
        .schema('neta_ops')
        .from('your_report_table')
        .update(reportPayload)
        .eq('id', currentReportId);
    } else {
      // Create new report
      const result = await supabase
        .schema('neta_ops')
        .from('your_report_table')
        .insert(reportPayload)
        .select()
        .single();

      if (result.data) {
        const newReportId = result.data.id;
        
        // Create asset entry
        const assetData = {
          name: `Report Name - ${formData.identifier || 'Unnamed'}`,
          file_url: `report:/jobs/${jobId}/report-route/${newReportId}`,
          user_id: user.id
        };
        
        const { data: assetResult } = await supabase
          .schema('neta_ops')
          .from('assets')
          .insert(assetData)
          .select()
          .single();
          
        if (assetResult) {
          await supabase
            .schema('neta_ops')
            .from('job_assets')
            .insert({
              job_id: jobId,
              asset_id: assetResult.id,
              user_id: user.id
            });
        }
        
        // Update state and URL
        setCurrentReportId(newReportId);
        isAutoSaveCreatedRef.current = true;
        window.history.replaceState({}, '', `/jobs/${jobId}/report-route/${newReportId}`);
      }
    }
  } catch (error) {
    console.error('Auto-save error:', error);
  } finally {
    setIsAutoSaving(false);
  }
}, [jobId, user?.id, currentReportId, formData, /* other dependencies */]);
```

**Note**: Use `React.useCallback` instead of importing `useCallback` separately.

---

### 5. Add Autosave useEffect

**⚠️ CRITICAL**: Place this **AFTER** the `autoSave` function definition, not before!

```typescript
// Auto-save effect with debounce (MUST be placed AFTER autoSave function definition)
useEffect(() => {
  if (!isEditing || loading) return;
  
  if (autoSaveTimerRef.current) {
    clearTimeout(autoSaveTimerRef.current);
  }

  autoSaveTimerRef.current = setTimeout(() => {
    autoSave();
  }, 500); // 500ms debounce

  return () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
  };
}, [formData, status, isEditing, loading, autoSave]);
```

**⚠️ CRITICAL ERROR TO AVOID**: 
```
Uncaught ReferenceError: Cannot access 'autoSave' before initialization
```
This error occurs when the autosave useEffect is placed BEFORE the `autoSave` function definition. The useEffect references `autoSave` in its dependency array, so it must be defined first.

---

### 6. Update handleSave Function

Update `handleSave` to use `currentReportId` and remove alert messages:

```typescript
const handleSave = async () => {
  if (!jobId || !user?.id || !isEditing) return;

  try {
    const reportPayload = {
      job_id: jobId,
      user_id: user.id,
      // ... your report data
    };

    let result;
    if (currentReportId) {  // Changed from reportId
      result = await supabase
        .schema('neta_ops')
        .from('your_report_table')
        .update(reportPayload)
        .eq('id', currentReportId)  // Changed from reportId
        .select()
        .single();
    } else {
      // Create new report logic...
    }

    if (result.error) throw result.error;

    setIsEditing(false);
    // Remove alert message - autosave makes this unnecessary
    navigateAfterSave(navigate, jobId, location);
  } catch (error) {
    console.error('Error saving report:', error);
    alert(`Failed to save report: ${(error as Error).message}`);
  }
};
```

---

### 7. Replace All reportId References

Search and replace all remaining `reportId` references with `currentReportId`:

```typescript
// Loading states
if (loading && currentReportId) return <div>Loading...</div>;

// Conditional rendering
{currentReportId && !isEditing ? (
  <button onClick={() => setIsEditing(true)}>Edit Report</button>
) : (
  <button onClick={handleSave}>Save Report</button>
)}
```

---

### 8. Add Visual Indicator Badge

Add the "Auto Saving Enabled" badge to the header:

```tsx
<div className="flex gap-2 items-center">
  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
    ✓ Auto Saving Enabled
  </span>
  
  {/* Status Button */}
  <button
    onClick={() => {
      if (isEditing) {
        setStatus(status === 'PASS' ? 'FAIL' : 'PASS');
      }
    }}
    disabled={!isEditing}
    className={/* ... */}
  >
    {status}
  </button>

  {/* Edit/Save Buttons */}
  {currentReportId && !isEditing ? (
    <button onClick={() => setIsEditing(true)}>Edit Report</button>
  ) : (
    <button onClick={handleSave} disabled={!isEditing}>Save Report</button>
  )}
</div>
```

---

## Concurrent-insert guard

### Problem

Autosave uses a 500ms debounce. If the user keeps typing, a second autosave can start **before** the first `INSERT` finishes. The code used to check `currentReportId` from React state to decide insert vs update. State updates are async, so both calls saw “no report id yet” and both ran `INSERT` — creating duplicate rows (sometimes milliseconds apart).

### Solution

Use **refs** (synchronous) instead of state for the insert/update gate:

| Ref | Purpose |
|-----|---------|
| `reportIdRef` | Holds the report UUID as soon as the first insert succeeds |
| `creatingRef` | `true` while an insert is in flight; blocks a second insert |
| `pendingSaveRef` | If a save was skipped because an insert was in flight, queue one trailing save after insert completes |

### autoSave pattern

```typescript
if (reportIdRef.current) {
  await supabase.from(TABLE).update(payload).eq('id', reportIdRef.current);
} else if (creatingRef.current) {
  pendingSaveRef.current = true;
} else {
  creatingRef.current = true;
  try {
    const result = await supabase.from(TABLE).insert(payload).select().single();
    if (result.data) {
      reportIdRef.current = result.data.id;
      setCurrentReportId(result.data.id);
      // asset + job_assets + URL replaceState (unchanged)
    } else {
      creatingRef.current = false;
    }
  } catch (e) {
    creatingRef.current = false;
    throw e;
  }
}
// in finally:
if (pendingSaveRef.current) {
  pendingSaveRef.current = false;
  setTimeout(() => autoSave(), 0);
}
```

Remove `currentReportId` from the `autoSave` `useCallback` dependency array; use `reportIdRef` inside the callback instead.

### handleSave pattern

Use the same `reportIdRef` / `creatingRef` checks. If `creatingRef.current` is true when the user clicks Save, wait briefly for the in-flight insert, then update:

```typescript
} else if (creatingRef.current) {
  const deadline = Date.now() + 5000;
  while (creatingRef.current && !reportIdRef.current && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (reportIdRef.current) {
    // update path
  } else {
    throw new Error('Report creation is still in progress. Please try again.');
  }
}
```

### URL param sync

If the report uses `reportId` from the URL (not `initialReportId`), sync the ref when the param changes:

```typescript
useEffect(() => {
  setCurrentReportId(reportId);
  reportIdRef.current = reportId;
}, [reportId]);
```

### Reports updated (May 2026)

All report components that use `autoSaveTimerRef` / `isAutoSaveCreatedRef` were patched with this guard, including `PanelboardAssembliesATS25Report.tsx` (confirmed duplicate source in production).

---

## Common Errors and Solutions

### Error 1: "Cannot access 'autoSave' before initialization"

**Cause**: The autosave useEffect is placed before the `autoSave` function definition.

**Solution**: Move the autosave useEffect to **after** the `autoSave` function definition.

```typescript
// ❌ WRONG ORDER
useEffect(() => {
  autoSave();  // References autoSave before it's defined
}, [formData, autoSave]);

const autoSave = React.useCallback(async () => {
  // ...
}, []);

// ✅ CORRECT ORDER
const autoSave = React.useCallback(async () => {
  // ...
}, []);

useEffect(() => {
  autoSave();  // Now autoSave is defined
}, [formData, autoSave]);
```

---

### Error 2: Report exits edit mode after first autosave

**Cause**: The `isAutoSaveCreatedRef` check is placed AFTER the `!currentReportId` check in `loadReport`.

**Solution**: Move the `isAutoSaveCreatedRef` check to the **very beginning** of `loadReport`:

```typescript
// ❌ WRONG ORDER
const loadReport = async () => {
  if (!currentReportId) {
    // This runs when there's no ID
    if (isAutoSaveCreatedRef.current) {
      // But after autosave creates an ID, this block is skipped!
      return;
    }
  }
}

// ✅ CORRECT ORDER
const loadReport = async () => {
  // Check FIRST, before anything else
  if (isAutoSaveCreatedRef.current) {
    isAutoSaveCreatedRef.current = false;
    setLoading(false);
    return;
  }
  
  if (!currentReportId) {
    // ...
  }
}
```

---

### Error 3: Import errors with useRef or useCallback

**Cause**: Importing `useRef` or `useCallback` separately can cause issues.

**Solution**: Use `React.useRef` and `React.useCallback` instead:

```typescript
// ❌ AVOID
import React, { useState, useEffect, useRef, useCallback } from 'react';
const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
const autoSave = useCallback(async () => { /* ... */ }, []);

// ✅ CORRECT
import React, { useState, useEffect } from 'react';
const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
const autoSave = React.useCallback(async () => { /* ... */ }, []);
```

---

## Testing Checklist

After implementing autosave, verify:

- [ ] Opening a new report starts in edit mode
- [ ] Typing in any field triggers autosave after 500ms
- [ ] The report appears in the linked assets list after first autosave
- [ ] The URL updates to include the new report ID
- [ ] Continuing to edit keeps you in edit mode (doesn't exit to view mode)
- [ ] The "✓ Auto Saving Enabled" badge is visible
- [ ] Refreshing the page loads the saved data
- [ ] The "Save Report" button still works for manual saves
- [ ] Opening an existing report starts in view mode with "Edit Report" button
- [ ] No console errors appear during autosave
- [ ] No visual alerts or loading indicators appear during autosave

---

## File Structure Example

```typescript
import React, { useState, useEffect } from 'react';

const YourReport: React.FC = () => {
  // 1. State setup with currentReportId
  const { id: jobId, reportId: initialReportId } = useParams();
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(initialReportId);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isAutoSaveCreatedRef = React.useRef(false);

  // 2. loadReport with autosave check FIRST
  const loadReport = async () => {
    if (isAutoSaveCreatedRef.current) {
      isAutoSaveCreatedRef.current = false;
      setLoading(false);
      return;
    }
    if (!currentReportId) { /* ... */ }
    // Load logic...
  };

  // 3. useEffect with currentReportId
  useEffect(() => {
    loadReport();
  }, [currentReportId]);

  // 4. autoSave function BEFORE useEffect
  const autoSave = React.useCallback(async () => {
    // Autosave logic...
  }, [jobId, user?.id, currentReportId, formData]);

  // 5. Autosave useEffect AFTER autoSave function
  useEffect(() => {
    if (!isEditing || loading) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => autoSave(), 500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [formData, isEditing, loading, autoSave]);

  // 6. handleSave with currentReportId
  const handleSave = async () => {
    // Save logic using currentReportId...
  };

  // 7. Render with badge and currentReportId checks
  return (
    <div>
      <span>✓ Auto Saving Enabled</span>
      {currentReportId && !isEditing ? (
        <button onClick={() => setIsEditing(true)}>Edit Report</button>
      ) : (
        <button onClick={handleSave}>Save Report</button>
      )}
    </div>
  );
};
```

---

## Key Takeaways

1. **Order Matters**: The autosave useEffect must come AFTER the autoSave function
2. **Check Order Matters**: The `isAutoSaveCreatedRef` check must come FIRST in loadReport
3. **Use React.useRef and React.useCallback**: Avoid importing hooks separately
4. **Replace ALL reportId references**: Search the entire file for `reportId` and replace with `currentReportId`
5. **Silent Operation**: No alerts or visual loading indicators during autosave
6. **Debounce**: 500ms delay prevents excessive database calls
7. **URL Management**: Use `window.history.replaceState` to update URL without reload

---

## Progress Tracking

Track completed reports in `Documentation/devlogs/nov15log.md`:

```markdown
### ✅ Completed (X reports)
1. **ReportName.tsx** - ✓ Badge added
2. **AnotherReport.tsx** - ✓ Badge added

### 🔄 In Progress (1 report)
X. **CurrentReport.tsx** - Implementation in progress
```

---

## Support

For issues or questions about autosave implementation:
- Review the common errors section above
- Check that the order of function definitions and useEffects is correct
- Verify all `reportId` references have been replaced with `currentReportId`
- Test with browser DevTools console open to catch errors early

