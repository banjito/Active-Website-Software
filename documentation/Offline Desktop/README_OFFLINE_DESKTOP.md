# 📱 ampOS Offline Desktop Application

> **Transform your web app into a powerful offline-capable desktop application for field technicians**

---

## 🎯 What Is This?

This is a **complete implementation** of an offline-capable desktop version of your ampOS web application. Field technicians can now:

- 📥 Download their assigned jobs and work without internet
- 📝 Create and edit reports completely offline
- 🔄 Automatically sync changes when reconnecting
- 💾 Never lose work due to connectivity issues
- 🖥️ Use a native desktop application on Windows, Mac, or Linux

## 🚀 Quick Links

**Choose your path:**

| I am a... | Start here |
|-----------|------------|
| **Field Technician** | [README-DESKTOP.md](./README-DESKTOP.md) - User guide |
| **First-time Developer** | [QUICK_START.md](./QUICK_START.md) - 5-minute setup |
| **Full Developer** | [OFFLINE_SETUP.md](./OFFLINE_SETUP.md) - Complete guide |
| **Integrating into UI** | [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - How to add to components |
| **Building for Production** | [INSTALLATION_CHECKLIST.md](./INSTALLATION_CHECKLIST.md) - Checklist |
| **Understanding the System** | [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Architecture |

## ⚡ Super Quick Start

### For Field Technicians (End Users)

1. **Install** the app (get installer from IT)
2. **Sign in** with your credentials
3. **Click "Download for Offline"**
4. **Done!** Work offline, sync automatically

### For Developers (Setup)

```bash
# 1. Quick install
./INSTALL.sh       # macOS/Linux
INSTALL.bat        # Windows

# 2. Run it
npm run dev:electron

# 3. Build it
npm run build:desktop
```

That's it! See [QUICK_START.md](./QUICK_START.md) for details.

## 📁 What Was Added?

### New Files Created

```
electron/                        # Desktop app backend
  ├── main.ts                   # ⭐ Electron entry point
  ├── preload.ts                # ⭐ Security bridge
  ├── database/
  │   └── LocalDatabase.ts      # ⭐ Offline storage
  └── sync/
      └── SyncEngine.ts         # ⭐ Sync logic

src/
  ├── hooks/
  │   └── useOfflineDatabase.ts    # ⭐ React hook for offline
  ├── components/offline/           # ⭐ UI components
  │   ├── OfflineStatusBar.tsx     # Status indicator
  │   ├── OfflineDataManager.tsx   # Download wizard
  │   └── DownloadDataButton.tsx   # Trigger button
  └── types/
      └── electron.d.ts            # TypeScript definitions

Configuration:
  ├── electron-builder.json        # Build settings
  ├── tsconfig.electron.json       # TypeScript config
  ├── vite.config.electron.ts      # Vite config
  └── package.json                 # Updated scripts/deps

Documentation:
  ├── README_OFFLINE_DESKTOP.md    # ⭐ This file
  ├── QUICK_START.md               # 5-min quick start
  ├── OFFLINE_SETUP.md             # Complete dev guide
  ├── README-DESKTOP.md            # User guide
  ├── INTEGRATION_GUIDE.md         # How to integrate
  ├── INSTALLATION_CHECKLIST.md    # Verification steps
  └── IMPLEMENTATION_SUMMARY.md    # Architecture details
```

### Modified Files

- `package.json` - Added Electron dependencies and scripts
- `src/App.tsx` - Added OfflineStatusBar component
- `.gitignore` - Added electron artifacts

**Total Impact:** ~15 new files, 2 modified files, zero breaking changes to existing code.

## 🎨 Architecture Overview

```
┌─────────────────────────────────────────────┐
│           Desktop Application               │
│                                             │
│  ┌─────────────────────────────────────┐  │
│  │      React App (Your Web App)       │  │
│  │  - Same UI, same components         │  │
│  │  - Works online AND offline         │  │
│  └────────────┬────────────────────────┘  │
│               │                             │
│  ┌────────────▼────────────────────────┐  │
│  │    Offline Database (PouchDB)       │  │
│  │  - Stores jobs, reports, templates  │  │
│  │  - Fast local queries              │  │
│  └────────────┬────────────────────────┘  │
│               │                             │
│  ┌────────────▼────────────────────────┐  │
│  │       Sync Engine                   │  │
│  │  - Uploads when online              │  │
│  │  - Downloads assigned jobs          │  │
│  │  - Never deletes server data        │  │
│  └────────────┬────────────────────────┘  │
│               │                             │
└───────────────┼─────────────────────────────┘
                │
                │ When Online
                ▼
    ┌───────────────────────┐
    │   Supabase Cloud      │
    │   (Your Backend)      │
    └───────────────────────┘
```

## 🛠️ Technologies Used

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Desktop Framework | **Electron 28** | Wraps React app as native desktop app |
| Local Database | **PouchDB 8** | Stores data offline |
| Backend | **Supabase** | Your existing cloud database |
| Frontend | **React + TypeScript** | Your existing web app |
| Build Tool | **Vite + electron-builder** | Packages desktop installers |

## ✨ Key Features

### 🔌 True Offline Capability
- Works with **zero internet connection**
- All data stored locally on technician's laptop
- Fast, responsive, no loading delays

### 🔄 Smart Sync
- **Automatic** when connection detected
- **Background** sync every 5 minutes
- **Manual** "Sync Now" button available
- **Conflict-free** - only adds, never deletes

### 📊 Visual Indicators
- **Status bar** at bottom shows online/offline
- **Pending uploads** counter
- **Last sync** timestamp
- **Progress bars** during sync

### 💾 Data Management
- **Auto-download** assigned jobs
- **Auto-cleanup** old synced data (30+ days)
- **Smart storage** - only keeps relevant data
- **Safe** - local data corruption doesn't affect server

## 📖 Documentation Guide

### Start Here Based on Your Role

**🔧 I need to build this thing:**
1. Read [QUICK_START.md](./QUICK_START.md) - Get running in 5 minutes
2. Read [OFFLINE_SETUP.md](./OFFLINE_SETUP.md) - Understand the system
3. Use [INSTALLATION_CHECKLIST.md](./INSTALLATION_CHECKLIST.md) - Verify it works

**💻 I need to integrate this into my UI:**
1. Read [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - Step-by-step integration
2. See examples of modifying components
3. Follow the integration plan

**📱 I'm a field technician:**
1. Read [README-DESKTOP.md](./README-DESKTOP.md) - User guide
2. Learn how to download data
3. Understand offline mode

**🧠 I need to understand the architecture:**
1. Read [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Complete overview
2. See data flow diagrams
3. Review technical decisions

**📋 I'm deploying to production:**
1. Use [INSTALLATION_CHECKLIST.md](./INSTALLATION_CHECKLIST.md) - Pre-deployment steps
2. Read security considerations
3. Plan rollout strategy

## 🎮 Common Tasks

### Run in Development Mode

```bash
# Web version (normal)
npm run dev

# Desktop version (with Electron)
npm run dev:electron
```

### Build for Production

```bash
# All platforms
npm run build:desktop

# Specific platforms
npm run package:win      # Windows
npm run package:mac      # macOS
npm run package:linux    # Linux
```

### Add Download Button to Your UI

```tsx
import { DownloadDataButton } from '@/components/offline/DownloadDataButton';

function Dashboard() {
  return (
    <div>
      <DownloadDataButton />  {/* Only shows in desktop app */}
    </div>
  );
}
```

### Use Offline Database in Components

```tsx
import { useOfflineDatabase } from '@/hooks/useOfflineDatabase';

function JobList() {
  const { isOfflineMode, getJobs } = useOfflineDatabase();
  
  useEffect(() => {
    async function load() {
      const jobs = await getJobs(); // Works offline!
      setJobs(jobs);
    }
    load();
  }, []);
  
  return <div>...</div>;
}
```

## 🧪 Testing

### Quick Test

```bash
# 1. Start desktop app
npm run dev:electron

# 2. Sign in and download data

# 3. Disconnect WiFi

# 4. Create a test report

# 5. Check status bar shows "Pending: 1"

# 6. Reconnect WiFi

# 7. Watch it auto-sync!
```

### Full Test Checklist

See [INSTALLATION_CHECKLIST.md](./INSTALLATION_CHECKLIST.md) for complete testing checklist.

## 📦 Distribution

### Build Outputs

After running `npm run build:desktop`:

**Windows:**
- `ampOS-Field-Technician-x.x.x-x64.exe` (installer)
- `ampOS-Field-Technician-x.x.x-x64-portable.exe` (portable)

**macOS:**
- `ampOS-Field-Technician-x.x.x-x64.dmg` (Intel)
- `ampOS-Field-Technician-x.x.x-arm64.dmg` (Apple Silicon)

**Linux:**
- `ampOS-Field-Technician-x.x.x-x64.AppImage`
- `ampOS-Field-Technician-x.x.x-x64.deb`

### Distribute to Technicians

1. **Upload** installers to shared drive/cloud
2. **Send** download link
3. **Provide** [README-DESKTOP.md](./README-DESKTOP.md) user guide
4. **Support** with [OFFLINE_SETUP.md](./OFFLINE_SETUP.md) troubleshooting section

## 🔐 Security

### Current Implementation
✅ Credentials stored securely in Electron  
✅ HTTPS for all Supabase communication  
✅ User authentication required  
✅ No sensitive data in logs  

### Recommended for Production
- 🔒 Add database encryption (see OFFLINE_SETUP.md)
- ✍️ Code sign the application
- 🔄 Implement auto-updates
- 📝 Add audit logging

## 🐛 Troubleshooting

### Common Issues

**"Electron not found"**
```bash
npm install --save-dev electron
```

**"Build fails"**
```bash
rm -rf node_modules dist dist-desktop
npm install
npm run build:desktop
```

**"Sync not working"**
1. Check status bar for online status
2. Verify Supabase credentials in .env
3. Try manual "Sync Now" button
4. Check console for errors

**More issues?** See [OFFLINE_SETUP.md](./OFFLINE_SETUP.md#troubleshooting)

## 📊 System Requirements

### For Development
- Node.js 18+
- npm or yarn
- 4GB RAM minimum
- 2GB free disk space

### For Field Technicians
- Windows 10+, macOS 10.15+, or Ubuntu 20.04+
- 2GB RAM minimum
- 500MB free disk space
- Optional: Internet for initial download and sync

## 🎯 Roadmap

### ✅ Implemented (v1.0)
- Offline database with PouchDB
- Automatic sync engine
- Status bar indicator
- Download data wizard
- Conflict-free sync

### 🔜 Planned (v1.1)
- Database encryption
- Auto-updates
- GPS tagging (optional)
- Advanced sync settings
- Usage analytics

### 💡 Future Ideas
- Offline search
- Smart photo compression
- Selective sync
- Multi-device sync
- Backup/restore

## 🤝 Contributing

### Development Workflow

1. **Clone** the repo
2. **Run** `./INSTALL.sh` or `INSTALL.bat`
3. **Develop** with `npm run dev:electron`
4. **Test** thoroughly
5. **Build** with `npm run build:desktop`
6. **Distribute** to testers

### Reporting Issues

When reporting issues, include:
- Operating system and version
- Electron/Node.js version
- Console error messages
- Steps to reproduce

## 📞 Support

### For Developers
- 📖 Read [OFFLINE_SETUP.md](./OFFLINE_SETUP.md)
- 🔍 Check console for errors
- 🧪 Test in Electron DevTools

### For Users
- 📱 Read [README-DESKTOP.md](./README-DESKTOP.md)
- ⚠️ Check status bar for errors
- 🔄 Try manual sync

### For Integration
- 🔧 Read [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)
- 📝 Follow step-by-step examples
- ✅ Use integration checklist

## 📄 License

Same as your main ampOS application.

## 🙏 Credits

**Built with:**
- Electron - Desktop framework
- PouchDB - Offline database
- React - UI framework
- TypeScript - Type safety
- Your existing ampOS web application

**Special thanks to:**
- Field technicians for requirements
- Development team for feedback

## 🎉 Getting Started Right Now

**Pick your starting point:**

```bash
# Quick test (5 minutes)
./INSTALL.sh && npm run dev:electron

# Full development setup (1 hour)
# Read: OFFLINE_SETUP.md

# Production build (30 minutes)
# Read: INSTALLATION_CHECKLIST.md

# User training (2 hours)
# Read: README-DESKTOP.md
```

---

## 📚 Document Index

| Document | Purpose | Audience | Time |
|----------|---------|----------|------|
| **README_OFFLINE_DESKTOP.md** | Overview (this file) | Everyone | 5 min |
| **QUICK_START.md** | Get running fast | Developers | 5 min |
| **OFFLINE_SETUP.md** | Complete developer guide | Developers | 30 min |
| **README-DESKTOP.md** | User guide | Field Technicians | 15 min |
| **INTEGRATION_GUIDE.md** | How to integrate UI | Frontend Devs | 1 hour |
| **INSTALLATION_CHECKLIST.md** | Pre-deployment verification | DevOps | 2 hours |
| **IMPLEMENTATION_SUMMARY.md** | Architecture & design | Tech Leads | 20 min |

---

## 🚀 One-Command Setup

```bash
# macOS/Linux
curl -o- https://your-server.com/install.sh | bash

# Windows PowerShell
iwr -useb https://your-server.com/install.ps1 | iex

# Or just:
./INSTALL.sh   # macOS/Linux
INSTALL.bat    # Windows
```

---

**Ready to build?** → Start with [QUICK_START.md](./QUICK_START.md)  
**Need details?** → Read [OFFLINE_SETUP.md](./OFFLINE_SETUP.md)  
**Just want to use it?** → See [README-DESKTOP.md](./README-DESKTOP.md)

**Built with ❤️ for field technicians who keep everything running!** ⚡

