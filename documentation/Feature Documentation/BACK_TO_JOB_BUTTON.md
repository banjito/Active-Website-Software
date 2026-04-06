# Back to Job Button Feature

This application now includes a **global "Back to Job" button** that automatically appears on all report pages, making it easy to navigate back to the job details without manually editing the URL or using browser navigation.

## ✨ **Features**

### **Automatic Detection**
- The button automatically appears on any report page
- No changes needed to individual report components
- Works for all current and future reports

### **Smart URL Parsing**
- Detects report pages using the URL pattern: `/jobs/[jobId]/[reportType]/[reportId?]`
- Extracts the job ID from the URL automatically
- Only shows the button when on a valid report page

### **Consistent Styling**
- Uses the brand orange color (`#f26722`) for consistency
- Includes hover effects and dark mode support
- Positioned in the top-left corner of the header

## 🎯 **How It Works**

### **URL Pattern Detection**
The system recognizes report pages by checking if the URL:
1. Contains `/jobs/` 
2. Has more than 3 path segments
3. Doesn't end with just `/jobs`
4. Has a non-empty report type segment

### **Examples of Detected URLs**
✅ **Will Show Button:**
- `/jobs/123/switchgear-report`
- `/jobs/456/switchgear-report/789`
- `/jobs/123/panelboard-report`
- `/jobs/456/automatic-transfer-switch-ats-report/abc123`
- `/jobs/123/low-voltage-circuit-breaker-electronic-trip-ats-report/def456`

❌ **Will NOT Show Button:**
- `/jobs` (jobs list page)
- `/jobs/123` (job detail page)
- `/dashboard` (other pages)
- `/customers` (other pages)

### **Navigation Behavior**
- Clicking the button navigates to `/jobs/[jobId]`
- Takes you directly to the job details page
- Preserves the job context

## 🔧 **Implementation Details**

### **Location**
The button is implemented in the `Layout.tsx` component, making it globally available without modifying individual reports.

### **Code Structure**
```typescript
// Detection logic
const isReportPage = location.pathname.includes('/jobs/') && 
  location.pathname.split('/').length > 3 && 
  !location.pathname.endsWith('/jobs') &&
  location.pathname.split('/')[3] !== '';

// Job ID extraction
const getJobIdFromReportPath = (): string | null => {
  if (!isReportPage) return null;
  const pathParts = location.pathname.split('/');
  const jobsIndex = pathParts.findIndex(part => part === 'jobs');
  if (jobsIndex !== -1 && jobsIndex + 1 < pathParts.length) {
    return pathParts[jobsIndex + 1];
  }
  return null;
};
```

### **Button Component**
```jsx
{isReportPage && jobId && (
  <Button
    variant="ghost"
    size="sm"
    onClick={() => navigate(`/jobs/${jobId}`)}
    className="flex items-center gap-2 text-[#f26722] hover:text-[#e55611] hover:bg-[#f26722]/10"
  >
    <ArrowLeft className="h-4 w-4" />
    Back to Job
  </Button>
)}
```

## 🧪 **Testing**

### **Test Page**
Visit `/back-to-job-test` to see a comprehensive test of the URL detection logic with various example URLs.

### **Manual Testing**
1. Navigate to any job details page (e.g., `/jobs/123`)
2. Click on any report from the assets section
3. Verify the "Back to Job" button appears in the top-left corner
4. Click the button to confirm it returns to the job details page

## 🎨 **Styling**

### **Visual Design**
- **Color**: Brand orange (`#f26722`)
- **Hover**: Darker orange (`#e55611`) with light background
- **Icon**: Left arrow from Lucide React
- **Position**: Top-left corner of the header
- **Size**: Small button with compact padding

### **Dark Mode Support**
- Maintains the same orange color scheme in dark mode
- Proper contrast ratios for accessibility
- Consistent hover effects

## 🚀 **Benefits**

1. **User Experience**: Easy navigation back to job context
2. **Consistency**: Same behavior across all reports
3. **Maintainability**: No need to modify individual report components
4. **Future-Proof**: Automatically works with new reports
5. **Clean Implementation**: Centralized logic in the Layout component

## 📝 **Notes**

- The button only appears on report pages, not on job lists or job details
- The job ID is extracted dynamically from the URL
- No database queries needed - purely URL-based detection
- Compatible with both new and existing reports
- Works with reports that have optional report IDs in the URL

This feature enhances the user experience by providing consistent, intuitive navigation across all report pages without requiring any changes to existing report components. 