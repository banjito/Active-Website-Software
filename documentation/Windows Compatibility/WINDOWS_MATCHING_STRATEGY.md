# Windows Chrome Print Matching Strategy

## Goal
Keep macOS print quality exactly as-is, make Windows Chrome match macOS output.

## Current Problem
- Individual report `@media print` blocks override ReportWrapper's Windows fixes
- Windows reverts to default (inferior) print behavior
- macOS and Windows produce different PDFs

## Solution: Windows-Only Print CSS

Instead of removing all individual print CSS (which broke reports), we'll:
1. **Keep individual print CSS** for macOS compatibility
2. **Add Windows-specific overrides** that only apply on Windows
3. **Preserve macOS behavior** exactly as-is

## Implementation Plan

### Step 1: Detect Windows in ReportWrapper
Add Windows detection to ReportWrapper:

```typescript
// In ReportWrapper.tsx useEffect
const isWindows = navigator.platform.includes('Win') || navigator.userAgent.includes('Windows');
```

### Step 2: Windows-Only Print CSS
Create Windows-specific CSS that only applies when:
- `@media print` is active AND
- `isWindows` is true

### Step 3: Targeted Windows Fixes
Only apply minimal CSS needed to make Windows match macOS:
- Font rendering fixes
- Form element cleanup  
- Border enforcement
- Color preservation

## Why This Approach Works

### Preserves macOS Quality
- Individual report print CSS remains untouched
- macOS continues to work exactly as before
- No risk of breaking existing functionality

### Fixes Windows Issues
- Windows gets targeted fixes only
- No CSS conflicts (Windows-only CSS has higher specificity)
- Matches macOS output precisely

### Minimal Risk
- Changes are additive, not destructive
- Easy to rollback if issues arise
- Preserves all existing behavior

## Next Steps

1. **Update ReportWrapper** with Windows detection and Windows-only print CSS
2. **Test on both platforms** to verify matching output
3. **Iterate** on Windows-specific fixes as needed

This approach gives you the best of both worlds:
- ✅ macOS quality preserved exactly
- ✅ Windows matches macOS output
- ✅ No breaking changes to existing reports