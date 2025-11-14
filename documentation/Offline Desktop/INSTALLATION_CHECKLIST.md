# Installation Checklist ✅

Use this checklist to ensure proper setup of the ampOS Desktop App.

## Prerequisites

### Developer Machine

- [ ] Node.js 18+ installed
- [ ] npm or yarn installed
- [ ] Git installed
- [ ] Code editor (VS Code recommended)
- [ ] Terminal/Command Prompt access

### Build Machine (if different)

- [ ] All above prerequisites
- [ ] Admin/sudo access (for signing on macOS)
- [ ] Code signing certificate (for production)

## Initial Setup

### 1. Install Dependencies

```bash
cd Active-Website-Software-master
npm install
```

Verify these are installed:
- [ ] electron
- [ ] electron-builder
- [ ] pouchdb
- [ ] pouchdb-find
- [ ] concurrently
- [ ] wait-on

Check with: `npm list electron electron-builder pouchdb`

### 2. Environment Configuration

- [ ] `.env` file exists with:
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_ANON_KEY`

### 3. TypeScript Configuration

- [ ] `tsconfig.electron.json` exists
- [ ] No TypeScript errors: `npx tsc -p tsconfig.electron.json --noEmit`

### 4. Electron Files

Verify these files exist:
- [ ] `electron/main.ts`
- [ ] `electron/preload.ts`
- [ ] `electron/database/LocalDatabase.ts`
- [ ] `electron/sync/SyncEngine.ts`

### 5. React Components

Verify these files exist:
- [ ] `src/hooks/useOfflineDatabase.ts`
- [ ] `src/components/offline/OfflineStatusBar.tsx`
- [ ] `src/components/offline/OfflineDataManager.tsx`
- [ ] `src/components/offline/DownloadDataButton.tsx`
- [ ] `src/types/electron.d.ts`

## Development Testing

### 1. Web Version (Control Test)

```bash
npm run dev
```

- [ ] App starts on http://localhost:5175
- [ ] Can sign in
- [ ] Can view jobs
- [ ] Can create reports
- [ ] No console errors

### 2. Desktop Version

```bash
npm run dev:electron
```

- [ ] Vite starts successfully
- [ ] Electron window opens
- [ ] App loads in Electron window
- [ ] DevTools open automatically
- [ ] Can sign in
- [ ] Status bar appears at bottom
- [ ] Status bar shows "Online" or "Offline"

### 3. Offline Functionality

With `npm run dev:electron` running:

- [ ] Click "Download for Offline" button
- [ ] Download dialog appears
- [ ] Can initialize sync
- [ ] Jobs download successfully
- [ ] Templates download successfully
- [ ] Status bar updates with job count

**Then disconnect internet:**

- [ ] Status bar changes to "Offline Mode"
- [ ] Can still view jobs
- [ ] Can create a test report
- [ ] Report is marked "pending sync"
- [ ] Status bar shows "1 pending upload"

**Reconnect internet:**

- [ ] Status bar changes to "Online"
- [ ] Auto-sync starts
- [ ] Report uploads successfully
- [ ] Status bar shows "0 pending uploads"
- [ ] Can verify report in Supabase

## Build Testing

### 1. TypeScript Compilation

```bash
npm run build:electron
```

- [ ] TypeScript compiles without errors
- [ ] `dist-electron/` folder created
- [ ] `dist-electron/main.js` exists
- [ ] `dist-electron/preload.js` exists

### 2. Vite Build

- [ ] Vite builds successfully
- [ ] `dist/` folder created
- [ ] `dist/index.html` exists

### 3. Electron Builder

- [ ] `electron-builder` runs without errors
- [ ] `dist-desktop/` folder created
- [ ] Installer(s) created for your platform

**Platform-specific checks:**

**Windows:**
- [ ] `.exe` installer created
- [ ] Portable `.exe` created (optional)
- [ ] Can install on test Windows machine
- [ ] App runs after installation

**macOS:**
- [ ] `.dmg` created (Intel)
- [ ] `.dmg` created (Apple Silicon) - if applicable
- [ ] Can install on test Mac
- [ ] App runs after installation
- [ ] No security warnings (if signed)

**Linux:**
- [ ] `.AppImage` created
- [ ] `.deb` created
- [ ] Can run AppImage
- [ ] Can install .deb package

## Production Checklist

### Before Distribution

- [ ] Version number updated in `package.json`
- [ ] Tested on all target platforms
- [ ] Offline mode works on all platforms
- [ ] Sync works on all platforms
- [ ] No console errors on any platform
- [ ] Release notes written
- [ ] User documentation updated

### Code Signing (Production Only)

**Windows:**
- [ ] Code signing certificate obtained
- [ ] Certificate configured in `electron-builder.json`
- [ ] Installer is signed

**macOS:**
- [ ] Apple Developer account active
- [ ] Signing certificate in keychain
- [ ] App is signed and notarized
- [ ] No Gatekeeper warnings

### Security

- [ ] No hardcoded credentials in code
- [ ] Environment variables used for secrets
- [ ] Database file location is secure
- [ ] No sensitive data in logs
- [ ] HTTPS used for all network requests

## Deployment Checklist

### Distribution

- [ ] Installers uploaded to distribution server
- [ ] Download links tested
- [ ] Installation guide created for users
- [ ] Support process documented

### User Training

- [ ] Training materials created
- [ ] Demo video recorded (optional)
- [ ] FAQ document created
- [ ] Support contact information provided

### Monitoring

- [ ] Crash reporting configured (optional)
- [ ] Analytics configured (optional)
- [ ] Feedback mechanism in place
- [ ] Update mechanism planned

## Post-Deployment

### Week 1

- [ ] Monitor for crash reports
- [ ] Check support tickets
- [ ] Verify sync is working
- [ ] Collect user feedback

### Week 2-4

- [ ] Address critical issues
- [ ] Plan updates based on feedback
- [ ] Document common problems
- [ ] Update user guide if needed

## Troubleshooting Reference

### Common Build Issues

**Issue:** `electron-builder` not found
**Fix:** `npm install --save-dev electron-builder`

**Issue:** TypeScript errors in `electron/`
**Fix:** `npm install --save-dev @types/node @types/pouchdb`

**Issue:** Build fails with "cannot resolve module"
**Fix:** Clear cache: `rm -rf node_modules package-lock.json && npm install`

### Common Runtime Issues

**Issue:** Blank Electron window
**Fix:** Check DevTools console for errors, verify `dist/index.html` exists

**Issue:** "electronAPI is not defined"
**Fix:** Verify `preload.ts` is being loaded, check `webPreferences` in `main.ts`

**Issue:** Sync not working
**Fix:** Check environment variables, verify network connectivity, check Supabase status

**Issue:** Database corruption
**Fix:** Delete database file (see README-DESKTOP.md for location), restart app

## Success Criteria

The installation is complete when:

✅ Desktop app builds without errors
✅ App runs on all target platforms
✅ Users can download data for offline use
✅ Offline mode works (create/edit reports)
✅ Sync works when reconnecting
✅ Status bar shows correct information
✅ No data loss during sync
✅ Users can install and run the app independently

---

**Date Completed:** __________

**Tested By:** __________

**Platform(s) Tested:** __________

**Issues Found:** __________

**Notes:** __________

