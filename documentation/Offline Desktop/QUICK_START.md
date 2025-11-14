# 🚀 Quick Start - ampOS Desktop App

Get up and running in 5 minutes!

## For End Users (Field Technicians)

### Installation

1. **Download** the installer from your IT department:
   - Windows: `ampOS-Field-Technician-Setup.exe`
   - Mac: `ampOS-Field-Technician.dmg`

2. **Run** the installer (double-click)

3. **Launch** the app from your Applications/Start Menu

4. **Sign in** with your credentials

5. **Click** the "Download for Offline" button in the header

6. **Wait** for download to complete (~1-2 minutes)

7. **Done!** You can now work offline

---

## For Developers

### First Time Setup

```bash
# 1. Navigate to the project
cd Active-Website-Software-master

# 2. Install dependencies
npm install

# 3. Test in development mode
npm run dev:electron

# 4. Build for production (takes ~5 minutes)
npm run build:desktop
```

Your installers will be in `dist-desktop/`

### Development Workflow

```bash
# Run web version (normal dev)
npm run dev

# Run desktop version (with Electron)
npm run dev:electron

# Build specific platforms
npm run package:win      # Windows only
npm run package:mac      # macOS only
npm run package:linux    # Linux only
```

---

## Adding the Download Button to Your UI

In any component where you want users to download data:

```tsx
import { DownloadDataButton } from '@/components/offline/DownloadDataButton';

function MyComponent() {
  return (
    <div>
      {/* Your existing UI */}
      
      {/* Add this button - it only shows in desktop app */}
      <DownloadDataButton />
    </div>
  );
}
```

**Suggested locations:**
- Dashboard header
- User menu dropdown
- Settings page
- Job list page header

---

## Testing Offline Mode

1. **Start the app**: `npm run dev:electron`
2. **Sign in** as a test technician
3. **Download data** using the button
4. **Disconnect WiFi/Ethernet**
5. **Create a test report** - it should work!
6. **Check status bar** - should show "Offline Mode" and "1 pending upload"
7. **Reconnect** - watch it auto-sync!

---

## Common Issues

### "Electron not found"

```bash
npm install --save-dev electron
```

### "PouchDB errors"

```bash
npm install pouchdb pouchdb-find
npm install --save-dev @types/pouchdb
```

### "TypeScript errors in electron/"

```bash
npm install --save-dev @types/node
```

### Build fails

```bash
# Clear cache and rebuild
rm -rf node_modules dist dist-desktop dist-electron
npm install
npm run build:desktop
```

---

## Distribution Checklist

Before distributing to field technicians:

- [ ] Test on the target OS (Windows/Mac/Linux)
- [ ] Verify offline mode works
- [ ] Test sync after reconnecting
- [ ] Check that reports save correctly
- [ ] Ensure status bar appears
- [ ] Test with actual user credentials
- [ ] Create installation guide for non-technical users
- [ ] Set up support process for issues

---

## Next Steps

1. **Read** [OFFLINE_SETUP.md](./OFFLINE_SETUP.md) for complete details
2. **Read** [README-DESKTOP.md](./README-DESKTOP.md) for user documentation
3. **Test** the app thoroughly
4. **Customize** as needed for your workflow
5. **Deploy** to field technicians

---

## Quick Reference

### File Structure
```
electron/              # Electron main process code
  ├── main.ts         # Entry point
  ├── preload.ts      # IPC bridge
  ├── database/       # Local database
  └── sync/           # Sync engine

src/
  ├── hooks/
  │   └── useOfflineDatabase.ts    # React hook
  └── components/offline/
      ├── OfflineStatusBar.tsx     # Status indicator
      ├── OfflineDataManager.tsx   # Download UI
      └── DownloadDataButton.tsx   # Trigger button
```

### Key Commands
```bash
npm run dev:electron     # Development
npm run build:desktop    # Build all platforms
npm run package:win      # Windows only
npm run package:mac      # macOS only
npm run package:linux    # Linux only
```

### Configuration Files
- `electron-builder.json` - Build settings
- `tsconfig.electron.json` - TypeScript config for Electron
- `package.json` - Dependencies and scripts

---

**Need help?** Check [OFFLINE_SETUP.md](./OFFLINE_SETUP.md) for detailed documentation!

