# Integration Guide - Adding Offline Functionality to Existing Components

This guide shows exactly where and how to integrate the offline functionality into your existing ampOS UI.

## Quick Integration

### 1. Add Download Button to Dashboard

The easiest way to let users download data is to add the button to your main dashboard.

**Example: In your existing Dashboard component**

```tsx
// src/app/(dashboard)/page.tsx or wherever your dashboard is

import { DownloadDataButton } from '@/components/offline/DownloadDataButton';

function Dashboard() {
  return (
    <div className="dashboard">
      {/* Your existing header */}
      <div className="flex justify-between items-center mb-6">
        <h1>Dashboard</h1>
        
        {/* Add the download button here */}
        <DownloadDataButton />
      </div>
      
      {/* Rest of your dashboard */}
    </div>
  );
}
```

**The button:**
- Only appears in the desktop app (invisible in web version)
- Opens a modal when clicked
- Guides user through downloading data
- Shows progress and completion

### 2. Status Bar (Already Added!)

The status bar is already integrated in `App.tsx` and appears at the bottom of all pages:

```tsx
// This is already added to src/App.tsx
<OfflineStatusBar />
```

It shows:
- 🟢 Online / 🔴 Offline status
- Pending upload count
- Last sync time
- Manual "Sync Now" button

### 3. Use Offline Database in Job Components

**Example: Modify your job list to work offline**

```tsx
// src/components/jobs/JobList.tsx (or wherever you list jobs)

import { useOfflineDatabase } from '@/hooks/useOfflineDatabase';
import { supabase } from '@/lib/supabaseClient';

function JobList() {
  const [jobs, setJobs] = useState([]);
  const { isOfflineMode, getJobs } = useOfflineDatabase();

  useEffect(() => {
    async function loadJobs() {
      if (isOfflineMode) {
        // Get jobs from local database
        const localJobs = await getJobs();
        setJobs(localJobs);
      } else {
        // Get jobs from Supabase (your existing code)
        const { data } = await supabase.from('jobs').select('*');
        setJobs(data || []);
      }
    }
    loadJobs();
  }, [isOfflineMode]);

  return (
    <div>
      {jobs.map(job => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}
```

### 4. Save Reports Offline

**Example: Modify your report form to save offline**

```tsx
// src/components/reports/ReportForm.tsx (or your report creation component)

import { useOfflineDatabase } from '@/hooks/useOfflineDatabase';
import { supabase } from '@/lib/supabaseClient';
import toast from 'react-hot-toast';

function ReportForm({ jobId }: { jobId: string }) {
  const { isOfflineMode, saveReport } = useOfflineDatabase();

  async function handleSubmit(reportData: any) {
    try {
      if (isOfflineMode) {
        // Save to local database
        await saveReport({
          ...reportData,
          job_id: jobId,
          created_at: new Date().toISOString(),
          status: 'draft'
        });
        
        toast.success('Report saved! Will sync when online.');
      } else {
        // Save to Supabase (your existing code)
        const { error } = await supabase
          .from('neta_ops.reports')
          .insert(reportData);
          
        if (error) throw error;
        toast.success('Report saved!');
      }
    } catch (error) {
      toast.error('Failed to save report');
      console.error(error);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Your form fields */}
    </form>
  );
}
```

## Advanced Integration

### 5. Show Offline Indicator on Components

**Example: Add offline badges to job cards**

```tsx
import { useOfflineDatabase } from '@/hooks/useOfflineDatabase';

function JobCard({ job }: { job: Job }) {
  const { isOnline } = useOfflineDatabase();

  return (
    <div className="job-card">
      <div className="flex justify-between">
        <h3>{job.title}</h3>
        {!isOnline && (
          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
            Offline
          </span>
        )}
      </div>
      {/* Rest of job card */}
    </div>
  );
}
```

### 6. Show Sync Status on Reports

**Example: Indicate which reports need syncing**

```tsx
import { useOfflineDatabase } from '@/hooks/useOfflineDatabase';

function ReportList({ jobId }: { jobId: string }) {
  const [reports, setReports] = useState([]);
  const { isOfflineMode, getReports } = useOfflineDatabase();

  useEffect(() => {
    async function loadReports() {
      if (isOfflineMode) {
        const localReports = await getReports(jobId);
        setReports(localReports);
      } else {
        const { data } = await supabase
          .from('neta_ops.reports')
          .select('*')
          .eq('job_id', jobId);
        setReports(data || []);
      }
    }
    loadReports();
  }, [jobId, isOfflineMode]);

  return (
    <div>
      {reports.map(report => (
        <div key={report.id} className="report-item">
          <span>{report.title}</span>
          
          {/* Show sync status if created offline */}
          {report.createdOffline && report.syncStatus === 'pending' && (
            <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
              📤 Pending Sync
            </span>
          )}
          
          {report.syncStatus === 'synced' && (
            <span className="ml-2 text-green-600 text-xs">
              ✓ Synced
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

### 7. Disable Cloud Features When Offline

**Example: Disable features that require internet**

```tsx
import { useOfflineDatabase } from '@/hooks/useOfflineDatabase';

function JobDetailPage({ jobId }: { jobId: string }) {
  const { isOnline } = useOfflineDatabase();

  return (
    <div>
      {/* Always available features */}
      <button onClick={createReport}>Create Report</button>
      
      {/* Features that need internet */}
      <button 
        onClick={shareWithTeam} 
        disabled={!isOnline}
        className={!isOnline ? 'opacity-50 cursor-not-allowed' : ''}
      >
        Share with Team {!isOnline && '(Requires Internet)'}
      </button>
      
      <button 
        onClick={exportToPDF} 
        disabled={!isOnline}
        className={!isOnline ? 'opacity-50 cursor-not-allowed' : ''}
      >
        Export to PDF {!isOnline && '(Requires Internet)'}
      </button>
    </div>
  );
}
```

### 8. Handle Sync Conflicts (Advanced)

If you need to handle cases where data might conflict:

```tsx
import { useOfflineDatabase } from '@/hooks/useOfflineDatabase';

function ReportEditor({ reportId }: { reportId: string }) {
  const { isOnline, syncStatus } = useOfflineDatabase();
  const [hasLocalChanges, setHasLocalChanges] = useState(false);

  return (
    <div>
      {/* Warning if there are pending changes */}
      {syncStatus.pendingUploads > 0 && isOnline && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-yellow-800">
            ⚠️ You have {syncStatus.pendingUploads} unsaved changes that will sync shortly.
          </p>
        </div>
      )}
      
      {/* Editor content */}
    </div>
  );
}
```

## Recommended Integration Points

### Must-Have (Essential)

1. **✅ Status Bar** - Already added to App.tsx
2. **📥 Download Button** - Add to Dashboard or Settings
3. **💾 Save Reports Offline** - Modify report forms

### Nice-to-Have (Enhanced Experience)

4. **🏷️ Offline Badges** - Show offline status on components
5. **📤 Sync Indicators** - Show which items need syncing
6. **🚫 Disabled Features** - Disable cloud-only features when offline
7. **⚠️ Sync Warnings** - Warn about pending uploads

### Optional (Advanced)

8. **📊 Sync Statistics** - Show data usage, sync history
9. **⚙️ Settings Page** - Let users manage offline data
10. **🔔 Notifications** - Alert when sync completes or fails

## Step-by-Step Integration Plan

### Week 1: Core Functionality

**Day 1-2: Add Download Button**
- [ ] Identify main dashboard component
- [ ] Import `DownloadDataButton`
- [ ] Add to dashboard header
- [ ] Test download functionality

**Day 3-4: Modify Job List**
- [ ] Import `useOfflineDatabase` hook
- [ ] Add offline data loading
- [ ] Test job listing offline

**Day 5: Modify Report Forms**
- [ ] Add offline save logic to all report types
- [ ] Test creating reports offline
- [ ] Verify sync when online

### Week 2: Enhanced UI

**Day 1-2: Add Offline Indicators**
- [ ] Add offline badges to job cards
- [ ] Add sync status to reports
- [ ] Test UI updates

**Day 3-4: Disable Cloud Features**
- [ ] Identify cloud-dependent features
- [ ] Disable when offline
- [ ] Add helpful tooltips

**Day 5: User Testing**
- [ ] Test with field technician
- [ ] Collect feedback
- [ ] Make adjustments

### Week 3: Polish & Deploy

**Day 1-2: Error Handling**
- [ ] Add error messages for sync failures
- [ ] Add retry logic
- [ ] Test edge cases

**Day 3-4: Documentation**
- [ ] Update user guide
- [ ] Create training materials
- [ ] Record demo video (optional)

**Day 5: Deploy**
- [ ] Build desktop app
- [ ] Distribute to beta testers
- [ ] Monitor for issues

## Component Checklist

Use this checklist to track which components you've updated:

### Job Management
- [ ] Job List - Uses offline database
- [ ] Job Detail - Works offline
- [ ] Job Create - Saves offline (if applicable)

### Report Management
- [ ] Report List - Shows offline reports
- [ ] Report Create - Saves offline
- [ ] Report Edit - Saves changes offline
- [ ] Report View - Works offline

### Dashboard
- [ ] Download button added
- [ ] Offline indicators added
- [ ] Cloud features disabled when offline

### Navigation
- [ ] All routes work offline
- [ ] No broken links when offline
- [ ] Status bar visible on all pages

## Testing Checklist

After integration:

### Functional Testing
- [ ] Can download data when online
- [ ] Can view jobs offline
- [ ] Can create reports offline
- [ ] Can edit reports offline
- [ ] Reports sync when online
- [ ] Status bar shows correct status
- [ ] Pending count is accurate

### UI Testing
- [ ] Offline badges appear correctly
- [ ] Sync indicators work
- [ ] Disabled buttons are clear
- [ ] Status bar is visible but not intrusive

### Edge Case Testing
- [ ] Disconnect during download
- [ ] Disconnect during sync
- [ ] Create multiple reports offline
- [ ] Rapid online/offline switching
- [ ] App restart with pending uploads

## Common Issues & Solutions

### Issue: "useOfflineDatabase is undefined"

**Solution:** Make sure you're importing correctly:
```tsx
import { useOfflineDatabase } from '@/hooks/useOfflineDatabase';
// NOT from '@/hooks/useOfflineDatabase.ts'
```

### Issue: "getJobs returns empty array"

**Solution:** User needs to download data first:
1. Check if download button is visible
2. User must click "Download for Offline"
3. Wait for download to complete

### Issue: "Reports not syncing"

**Solution:** Check these:
1. Is user online? Check status bar
2. Are there pending uploads? Check count
3. Try manual sync with "Sync Now" button
4. Check console for errors

### Issue: "Status bar not showing"

**Solution:** Status bar only shows in Electron:
1. Make sure you're running `npm run dev:electron`
2. Check that `window.electronAPI` exists
3. Verify `OfflineStatusBar` is in App.tsx

## Support & Resources

### Getting Help

**For developers:**
- Check console for errors
- Review `OFFLINE_SETUP.md`
- Test in Electron DevTools

**For users:**
- Check `README-DESKTOP.md`
- Verify internet connection
- Try manual sync

### Next Steps

1. ✅ Follow the integration plan above
2. ✅ Test each component as you integrate
3. ✅ Deploy to test users
4. ✅ Collect feedback
5. ✅ Iterate and improve

---

**Need help?** See `OFFLINE_SETUP.md` for troubleshooting or `README-DESKTOP.md` for user guidance.

**Ready to integrate?** Start with adding the Download Button to your dashboard!

