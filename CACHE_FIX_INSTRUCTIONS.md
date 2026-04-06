# Cache Fix Instructions for Opportunity Loading Issue

## Problem
Users experiencing the error `getInitialFilterSettings is not defined` when trying to view opportunities in the sales portal. This is caused by browser caching and service workers serving old versions of the JavaScript files.

## What Was Fixed

### 1. Removed Service Worker
- Deleted `/public/print-service-worker.js`
- Removed service worker registration from `pdfExportService.ts`
- Service worker was causing aggressive caching of old JavaScript files

### 2. Added Automatic Cache Cleanup
- Created `src/services/unregister-sw.ts` to automatically unregister service workers
- Modified `src/main.tsx` to run cleanup on every page load
- This ensures all users get the latest code

## For Users Currently Experiencing the Issue

### Option 1: Automatic Fix (Recommended)
1. Visit this URL in your browser: `https://your-ampos-domain.com/clear-cache.html`
2. The page will automatically clear all caches and service workers
3. Close ALL ampOS browser tabs
4. Wait 5 seconds
5. Open ampOS in a fresh tab
6. Opportunities should now load normally

### Option 2: Manual Browser Cache Clear

#### Chrome/Edge
1. Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
2. Select "All time" for time range
3. Check "Cached images and files"
4. Check "Cookies and other site data"
5. Click "Clear data"
6. Close all browser tabs
7. Reopen ampOS

#### Firefox
1. Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
2. Select "Everything" for time range
3. Check "Cache"
4. Check "Cookies"
5. Click "Clear Now"
6. Close all browser tabs
7. Reopen ampOS

#### Safari
1. Press `Cmd+Option+E` to empty caches
2. Go to Develop → Empty Caches (if Develop menu is enabled)
3. Close all browser tabs
4. Reopen ampOS

## For Developers

### Testing the Fix
```bash
# 1. Install dependencies (if needed)
npm install

# 2. Build the app
npm run build

# 3. Deploy or run locally
npm run dev
```

### Verifying Service Worker Removal
Open browser DevTools:
1. Go to Application tab (Chrome/Edge) or Storage tab (Firefox)
2. Click on "Service Workers"
3. Should see no service workers registered
4. If any exist, click "Unregister"

### Checking Cache Status
In DevTools Console, run:
```javascript
// Check for service workers
navigator.serviceWorker.getRegistrations().then(r => console.log('SWs:', r.length));

// Check for caches
caches.keys().then(k => console.log('Caches:', k));
```

## Root Cause Analysis

The issue occurred because:
1. A service worker was registered that cached JavaScript files
2. Code was updated with the `getInitialFilterSettings` function
3. Browsers served old cached JavaScript without the function
4. This caused a ReferenceError when trying to call the missing function

## Prevention

Going forward:
- Service worker has been completely removed
- App now unregisters any service workers on startup
- Users will always get the latest code
- No more caching issues with critical JavaScript files

## Support

If users continue to experience issues after clearing cache:
1. Try using an incognito/private browsing window
2. Check browser console for any additional errors
3. Ensure they've closed ALL tabs before reopening
4. Try a different browser to verify it's not a browser-specific issue

## Technical Details

Files Modified:
- `src/services/pdfExportService.ts` - Removed SW registration
- `src/services/unregister-sw.ts` - NEW: Cleanup utility
- `src/main.tsx` - Added automatic cleanup on app load
- `public/clear-cache.html` - NEW: Manual cleanup tool
- `public/print-service-worker.js` - DELETED
- `dist/print-service-worker.js` - DELETED

The OpportunityList.tsx file is correct and contains the `getInitialFilterSettings` function (lines 113-143). The issue is purely a caching problem, not a code problem.















