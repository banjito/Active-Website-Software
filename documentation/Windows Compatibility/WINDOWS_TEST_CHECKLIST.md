# Windows Chrome Print Test Checklist

Use this checklist to verify PDFs on Windows Chrome match your macOS output.

## Quick Verification (Any Report)

Test with any report. Check the PDF output for:

- [ ] **Table Borders:** Solid black 1px lines (not fuzzy or gray)
- [ ] **Select Dropdowns:** No arrows or triangles visible
- [ ] **Number Inputs:** No up/down spin buttons visible
- [ ] **Text Quality:** Smooth, professional font rendering
- [ ] **Colors:** Match macOS (especially orange brand color #f26722)
- [ ] **Layout:** Same spacing and alignment as macOS
- [ ] **Form Fields:** Look like plain text (no boxes or borders)

---

## Detailed Test Reports

Test these three reports for comprehensive coverage:

### 1. LowVoltageCircuitBreakerElectronicTripMTSReport
**Why:** Complex tables, many form elements, temperature correction

**Test Steps:**
1. Open report in edit mode
2. Fill in basic job info (customer, date, job number)
3. Add at least one test set with some readings
4. Enter temperature value (e.g., 72°F)
5. Print to PDF (Ctrl+P → Save as PDF)

**Verify:**
- [ ] Visual/Mechanical inspection table has crisp borders
- [ ] Temperature dropdown has no arrow
- [ ] All numeric inputs have no spinners
- [ ] TCF value renders cleanly
- [ ] Trip testing table is properly formatted
- [ ] Pass/Fail status renders correctly

---

### 2. PanelboardReport  
**Why:** Multiple sections, various input types

**Test Steps:**
1. Open report in edit mode
2. Fill in customer/job info section
3. Add a few visual inspection results
4. Add test equipment entries
5. Print to PDF

**Verify:**
- [ ] Job info table borders are crisp
- [ ] Visual inspection dropdowns have no arrows
- [ ] Results column aligns properly
- [ ] Comments section renders cleanly
- [ ] Test equipment table has proper borders
- [ ] Status badge (PASS/FAIL) renders correctly

---

### 3. LiquidFilledTransformerReport
**Why:** Large tables, multiple data columns

**Test Steps:**
1. Open report in edit mode
2. Fill in transformer details
3. Add oil test results (if applicable)
4. Add electrical test readings
5. Print to PDF

**Verify:**
- [ ] Large data tables have consistent borders
- [ ] All columns are properly aligned
- [ ] Numeric values don't show spinners in PDF
- [ ] Multi-row tables don't break awkwardly
- [ ] Headers are bold and stand out
- [ ] Footer/notes sections render properly

---

## Side-by-Side Comparison

For best results, generate PDFs of the same report from both platforms:

### On macOS:
1. Open report → Fill with sample data → Print to PDF
2. Save as `report_macos.pdf`

### On Windows:
1. Open same report → Use same data → Print to PDF  
2. Save as `report_windows.pdf`

### Compare:
- [ ] Open both PDFs side by side
- [ ] Zoom to same level (100% or 125%)
- [ ] Check page by page for differences
- [ ] Pay special attention to:
  - Table border thickness
  - Font weight and spacing  
  - Input field appearance
  - Overall layout alignment

---

## Common Issues & Solutions

### ❌ Issue: Borders look double or fuzzy
**Cause:** Windows rendering issue
**Check:** Zoom level in PDF viewer (try 100%, 125%, 150%)
**Note:** May appear fuzzy on screen but print fine on paper

### ❌ Issue: Dropdown arrows still visible
**Cause:** CSS not applied or cached styles
**Fix:** Hard refresh (Ctrl+Shift+R), clear browser cache

### ❌ Issue: Fonts look different
**Cause:** Font availability on Windows vs macOS
**Check:** Both systems have Arial installed (standard on both)

### ❌ Issue: Spacing slightly different
**Cause:** Browser print engine differences
**Acceptable:** 1-2px variations are normal
**Not Acceptable:** Entire sections shifted or misaligned

### ❌ Issue: Colors look washed out
**Cause:** Print color settings
**Fix:** Check Chrome print dialog → More Settings → Options → Background graphics (should be ON)

---

## Success Criteria

**PASS:** Windows PDFs are **nearly identical** to macOS PDFs
- Visual differences are minimal (1-2px)
- No form controls visible (arrows, spinners)
- Professional print-ready appearance
- Same data fits on same pages

**ACCEPTABLE:** Minor rendering differences
- Slight font smoothing variation (Windows ClearType vs macOS)
- Very minor spacing differences (< 2px)
- Colors within 5% match

**FAIL:** Significant differences requiring code adjustment
- Form controls still visible
- Table borders missing or badly formatted
- Layout breaks or wrapping differences
- Unprofessional appearance

---

## Reporting Results

If tests pass: ✅ You're good to go!

If tests fail, note:
1. Which report(s) showed issues
2. Specific problems (screenshot if possible)
3. Browser version (Chrome → Help → About Google Chrome)
4. Windows version
5. Any error messages in browser console (F12 → Console tab)

---

## Browser Settings to Check

Make sure these Windows Chrome settings are standard:

**Print Dialog (Ctrl+P):**
- Destination: Save as PDF (or Microsoft Print to PDF)
- Pages: All
- Layout: Portrait (unless report specifies landscape)
- Paper size: Letter (8.5 x 11 in)
- Margins: Default
- Scale: Default (100%)
- Options: Background graphics ✓ ON
- Options: Headers and footers OFF

**Chrome Settings:**
- Zoom level: 100% (Ctrl+0)
- Hardware acceleration: ON (recommended)
- Clear cache before testing if unsure

---

## Quick Win Test

**Fastest way to verify the fix works:**

1. Open `LowVoltageCircuitBreakerElectronicTripMTSReport`
2. Just fill in: Customer name, Date, Temp = 72
3. Ctrl+P (Print Preview)
4. Look at preview - should see NO:
   - Dropdown arrows
   - Number input spinners
   - Form field borders
5. If clean → Save as PDF → Success! ✅

**Time:** < 2 minutes

**If this passes, the rest will too.**

