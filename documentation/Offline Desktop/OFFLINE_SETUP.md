# ampOS Field Technician - Offline Desktop Setup

This guide will help you set up and build the offline-capable desktop version of ampOS for field technicians.

## Prerequisites

Before you begin, make sure you have:

- **Node.js 18+** installed ([download here](https://nodejs.org/))
- **npm** or **yarn** package manager
- **Git** (for version control)

## Installation

### 1. Install Dependencies

```bash
cd Active-Website-Software-master
npm install
```

This will install all required dependencies including:
- Electron (desktop framework)
- PouchDB (local database)
- Build tools (electron-builder, TypeScript)

### 2. Environment Setup

Make sure your `.env` file has the Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Development

### Running in Development Mode

To test the desktop app during development:

```bash
npm run dev:electron
```

This will:
1. Start the Vite dev server (web app)
2. Launch Electron with hot reload
3. Open DevTools automatically

**Note:** The app will run on `http://localhost:5175` by default.

### Testing Offline Features

1. **Launch the app** with `npm run dev:electron`
2. **Sign in** with your technician credentials
3. **Download data** using the "Download for Offline" button (you'll need to add this to the UI)
4. **Disconnect from internet** to test offline mode
5. **Create/edit reports** - they'll be queued for sync
6. **Reconnect** - changes will auto-sync

## Building for Production

### Build for All Platforms

```bash
npm run build:desktop
```

This creates installers in the `dist-desktop/` folder.

### Build for Specific Platforms

**Windows:**
```bash
npm run package:win
```
Creates:
- `ampOS-Field-Technician-x.x.x-x64.exe` (installer)
- `ampOS-Field-Technician-x.x.x-x64-portable.exe` (portable)

**macOS:**
```bash
npm run package:mac
```
Creates:
- `ampOS-Field-Technician-x.x.x-x64.dmg` (Intel Macs)
- `ampOS-Field-Technician-x.x.x-arm64.dmg` (M1/M2 Macs)

**Linux:**
```bash
npm run package:linux
```
Creates:
- `ampOS-Field-Technician-x.x.x-x64.AppImage`
- `ampOS-Field-Technician-x.x.x-x64.deb`

## Architecture Overview

### File Structure

```
Active-Website-Software-master/
├── electron/                    # Electron main process
│   ├── main.ts                 # App entry point
│   ├── preload.ts              # Bridge between Electron & React
│   ├── database/
│   │   └── LocalDatabase.ts    # PouchDB local storage
│   └── sync/
│       └── SyncEngine.ts       # Sync logic
├── src/
│   ├── hooks/
│   │   └── useOfflineDatabase.ts  # React hook for offline DB
│   └── components/
│       └── offline/
│           ├── OfflineStatusBar.tsx    # Status indicator
│           └── OfflineDataManager.tsx  # Download manager
└── electron-builder.json       # Build configuration
```

### How It Works

1. **Electron Wrapper**: Packages your React app as a native desktop application
2. **Local Database**: PouchDB stores jobs, reports, and templates locally
3. **Sync Engine**: Manages upload/download between local DB and Supabase
4. **Offline Detection**: Automatically detects connection status
5. **Conflict-Free Sync**: Only uploads new data, never deletes from server

## Usage for Field Technicians

### First Time Setup

1. **Install the app** from the provided installer
2. **Launch** ampOS Field Technician
3. **Sign in** with your credentials
4. **Click "Download Data"** to pull your assigned jobs

### Working Offline

1. **View Jobs**: All downloaded jobs are available offline
2. **Create Reports**: Reports are saved locally and marked "pending sync"
3. **Edit Reports**: Changes are tracked locally
4. **Status Bar**: Shows online/offline status at bottom of screen

### Syncing Data

**Automatic Sync:**
- Happens automatically when online
- Every 5 minutes in the background
- When you create/edit a report

**Manual Sync:**
- Click "Sync Now" in the status bar
- Shows progress and count of uploads

### Data Management

**Storage Location:**
- Windows: `C:\Users\[YourName]\AppData\Roaming\ampOS-field.db`
- macOS: `~/Library/Application Support/ampOS-field.db`
- Linux: `~/.config/ampOS-field.db`

**Cleanup:**
- Synced reports older than 30 days are auto-removed
- Keeps storage manageable
- Never affects server data

## Troubleshooting

### Build Issues

**Problem:** `electron-builder` fails
**Solution:** 
```bash
npm install --save-dev electron-builder
npm run build:desktop
```

**Problem:** TypeScript errors in electron/
**Solution:**
```bash
npm install --save-dev @types/node @types/pouchdb
```

### Runtime Issues

**Problem:** App won't start
**Solution:** Check console logs:
- Windows: `%APPDATA%\ampOS Field Technician\logs\`
- macOS: `~/Library/Logs/ampOS Field Technician/`

**Problem:** Sync failing
**Solution:**
1. Check internet connection
2. Verify Supabase credentials in env file
3. Check status bar for specific errors

**Problem:** Database corruption
**Solution:**
1. Close the app
2. Delete the database file (see Storage Location above)
3. Restart and re-download data

## Development Tips

### Debugging

**Electron Main Process:**
```bash
# In electron/main.ts, uncomment:
mainWindow.webContents.openDevTools();
```

**React App:**
- Use Chrome DevTools (F12) in Electron window
- Same as web development

### Testing Sync Logic

```typescript
// In electron/sync/SyncEngine.ts
// Add console.log to track sync operations:

async uploadPendingChanges() {
  console.log('Starting sync...', await this.localDB.getPendingSyncItems());
  // ... rest of code
}
```

### Modifying Local Database Schema

If you need to change what's stored locally:

1. Update interface in `electron/database/LocalDatabase.ts`
2. Add migration logic if needed
3. Increment version number
4. Test with existing data

## Distributing to Technicians

### Option 1: Direct Install

1. Build the installer for their platform
2. Upload to shared drive or cloud storage
3. Technicians download and install

### Option 2: Auto-Updates (Advanced)

Set up auto-update server:

```json
// In electron-builder.json
{
  "publish": {
    "provider": "generic",
    "url": "https://your-update-server.com/downloads"
  }
}
```

Then in `electron/main.ts`:
```typescript
import { autoUpdater } from 'electron-updater';

app.on('ready', () => {
  autoUpdater.checkForUpdatesAndNotify();
});
```

## Security Notes

1. **Credentials**: Never hardcode Supabase credentials
2. **Local Data**: Database is not encrypted (consider adding encryption for sensitive data)
3. **Updates**: Use code signing for production builds
4. **Access Control**: Sync only pulls data for authenticated user

## Performance Tips

1. **Selective Download**: Only download jobs for current week
2. **Lazy Loading**: Load report templates on-demand
3. **Cleanup**: Run maintenance regularly
4. **Indexes**: PouchDB indexes are already configured for common queries

## Next Steps

After setup:

1. ✅ Test in development mode
2. ✅ Build for your platform
3. ✅ Test offline functionality
4. ✅ Distribute to test users
5. ✅ Collect feedback
6. ✅ Roll out to all field technicians

## Support

For issues or questions:
- Check this documentation
- Review console logs
- Test sync manually using DevTools
- Check Supabase connection

## Additional Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [PouchDB Guide](https://pouchdb.com/guides/)
- [Supabase Docs](https://supabase.com/docs)

