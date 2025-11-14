# ampOS Desktop - System Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                   USER (Field Technician)                       │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Uses Desktop App
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ELECTRON WINDOW                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │              REACT APPLICATION                           │  │
│  │         (Your existing web app)                          │  │
│  │                                                          │  │
│  │  • Job Management     • Report Creation                  │  │
│  │  • Customer Data      • Document Upload                  │  │
│  │  • Dashboard          • Settings                         │  │
│  │                                                          │  │
│  └────────────┬─────────────────────────────────────────────┘  │
│               │                                                 │
│               │ IPC Communication (Preload Bridge)              │
│               │                                                 │
│  ┌────────────▼─────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │            ELECTRON MAIN PROCESS                         │  │
│  │                                                          │  │
│  │  ┌──────────────────┐      ┌──────────────────┐        │  │
│  │  │  Local Database  │      │   Sync Engine    │        │  │
│  │  │    (PouchDB)     │◄────►│                  │        │  │
│  │  │                  │      │  • Upload Queue  │        │  │
│  │  │  • Jobs          │      │  • Download      │        │  │
│  │  │  • Reports       │      │  • Retry Logic   │        │  │
│  │  │  • Templates     │      │                  │        │  │
│  │  └──────────────────┘      └────────┬─────────┘        │  │
│  │                                     │                   │  │
│  └─────────────────────────────────────┼───────────────────┘  │
│                                        │                       │
└────────────────────────────────────────┼───────────────────────┘
                                         │
                                         │ HTTPS
                                         │ (When Online)
                                         ▼
                           ┌─────────────────────────┐
                           │                         │
                           │   SUPABASE CLOUD        │
                           │                         │
                           │  • PostgreSQL Database  │
                           │  • Authentication       │
                           │  • Real-time            │
                           │  • Storage              │
                           │                         │
                           └─────────────────────────┘
```

## Component Breakdown

### 1. React Application Layer

```
┌─────────────────────────────────────────────────────────────┐
│                    REACT COMPONENTS                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Existing Components:          New Offline Components:     │
│  ┌──────────────────┐          ┌──────────────────┐       │
│  │ JobList          │          │ OfflineStatusBar │       │
│  │ ReportForm       │          │ DataManager      │       │
│  │ Dashboard        │          │ DownloadButton   │       │
│  │ CustomerView     │          └──────────────────┘       │
│  └──────────────────┘                                      │
│                                                             │
│  Hooks:                                                     │
│  ┌──────────────────────────────────────┐                 │
│  │ useOfflineDatabase()                 │                 │
│  │  • isOfflineMode                     │                 │
│  │  • isOnline                          │                 │
│  │  • getJobs(), saveReport()           │                 │
│  │  • syncStatus                        │                 │
│  └──────────────────────────────────────┘                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2. Electron IPC Layer

```
┌─────────────────────────────────────────────────────────────┐
│                   PRELOAD SCRIPT (Bridge)                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  window.electronAPI = {                                     │
│    db: {                                                    │
│      getJobs() ───────────────► IPC: 'db:getJobs'         │
│      saveReport() ────────────► IPC: 'db:saveReport'       │
│      getReports() ────────────► IPC: 'db:getReports'       │
│    },                                                       │
│    sync: {                                                  │
│      start() ─────────────────► IPC: 'sync:start'          │
│      uploadPending() ─────────► IPC: 'sync:uploadPending'  │
│      getStatus() ─────────────► IPC: 'sync:getStatus'      │
│    },                                                       │
│    network: {                                               │
│      isOnline() ──────────────► IPC: 'network:isOnline'    │
│    }                                                        │
│  }                                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                         │
                         │ Context Isolation
                         │ (Security)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  ELECTRON MAIN PROCESS                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  IPC Handlers:                                              │
│  • ipcMain.handle('db:getJobs', ...)                       │
│  • ipcMain.handle('db:saveReport', ...)                    │
│  • ipcMain.handle('sync:start', ...)                       │
│  • ipcMain.handle('sync:uploadPending', ...)               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3. Local Database Layer

```
┌─────────────────────────────────────────────────────────────┐
│                   LOCAL DATABASE (PouchDB)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Collections:                                               │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ jobs                                                 │  │
│  │  _id: "job_12345"                                    │  │
│  │  type: "job"                                         │  │
│  │  data: { ...job details... }                         │  │
│  │  lastSynced: Date                                    │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ reports                                              │  │
│  │  _id: "report_67890"                                 │  │
│  │  type: "report"                                      │  │
│  │  jobId: "12345"                                      │  │
│  │  data: { ...report details... }                      │  │
│  │  syncStatus: "pending" | "synced" | "error"         │  │
│  │  createdOffline: boolean                             │  │
│  │  lastModified: Date                                  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ templates                                            │  │
│  │  _id: "template_switchgear"                          │  │
│  │  type: "template"                                    │  │
│  │  reportType: "switchgear_inspection"                 │  │
│  │  data: { ...template structure... }                  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ syncQueue                                            │  │
│  │  _id: "sync_1234567890"                              │  │
│  │  type: "syncQueue"                                   │  │
│  │  action: "create" | "update"                         │  │
│  │  entity: "report" | "job"                            │  │
│  │  entityId: "67890"                                   │  │
│  │  data: { ...payload... }                             │  │
│  │  attempts: 0                                         │  │
│  │  timestamp: Date                                     │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  Indexes:                                                   │
│  • type + jobId (for filtering reports by job)             │
│  • type + syncStatus (for finding pending syncs)           │
│  • type + reportType (for finding templates)               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4. Sync Engine

```
┌─────────────────────────────────────────────────────────────┐
│                      SYNC ENGINE                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  State Management:                                          │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ syncStatus = {                                       │  │
│  │   lastSync: Date | null,                             │  │
│  │   isOnline: boolean,                                 │  │
│  │   pendingUploads: number,                            │  │
│  │   inProgress: boolean                                │  │
│  │ }                                                     │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  Download Flow:                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 1. Initialize Supabase client                        │  │
│  │ 2. Fetch jobs for technician                         │  │
│  │ 3. Fetch report templates                            │  │
│  │ 4. Save to local database                            │  │
│  │ 5. Update lastSync timestamp                         │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  Upload Flow:                                               │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 1. Get pending items from syncQueue                  │  │
│  │ 2. For each item:                                    │  │
│  │    • Upload to Supabase (upsert)                     │  │
│  │    • If success: remove from queue                   │  │
│  │    • If error: increment attempts                    │  │
│  │    • If attempts > 5: mark as error                  │  │
│  │ 3. Update syncStatus                                 │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  Triggers:                                                  │
│  • Manual: User clicks "Sync Now"                          │
│  • Automatic: Network status changes to online             │
│  • Periodic: Every 5 minutes (if online)                   │
│  • On save: When report is created/updated                 │
│                                                             │
│  Error Handling:                                            │
│  • Network timeout: Retry with backoff                     │
│  • Auth error: Re-authenticate                             │
│  • Server error: Queue for later                           │
│  • Too many failures: Alert user                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### Scenario 1: Initial Data Download

```
User                React           Electron          PouchDB        Supabase
 │                   │                 │                │              │
 │  Click Download   │                 │                │              │
 ├──────────────────►│                 │                │              │
 │                   │  start()        │                │              │
 │                   ├────────────────►│                │              │
 │                   │                 │  Initialize    │              │
 │                   │                 ├───────────────────────────────►
 │                   │                 │                │   GET /jobs  │
 │                   │                 │◄───────────────────────────────┤
 │                   │                 │                │   [jobs data]│
 │                   │                 │  Save jobs     │              │
 │                   │                 ├───────────────►│              │
 │                   │                 │                │              │
 │                   │                 │  GET templates │              │
 │                   │                 ├───────────────────────────────►
 │                   │                 │◄───────────────────────────────┤
 │                   │                 │  Save templates│              │
 │                   │                 ├───────────────►│              │
 │                   │  Success!       │                │              │
 │                   │◄────────────────┤                │              │
 │  "Download done!" │                 │                │              │
 │◄──────────────────┤                 │                │              │
```

### Scenario 2: Creating Report Offline

```
User                React           Electron          PouchDB        Supabase
 │                   │                 │                │              │
 │  Fill report form │                 │                │              │
 ├──────────────────►│                 │                │              │
 │                   │                 │                │              │
 │  Click Save       │                 │                │              │
 ├──────────────────►│                 │                │              │
 │                   │  saveReport()   │                │              │
 │                   ├────────────────►│                │              │
 │                   │                 │  Save to DB    │              │
 │                   │                 ├───────────────►│              │
 │                   │                 │                │              │
 │                   │                 │  Add to queue  │              │
 │                   │                 ├───────────────►│              │
 │                   │                 │                │              │
 │                   │  Success!       │                │              │
 │                   │◄────────────────┤                │              │
 │  "Saved (offline)"│                 │                │              │
 │◄──────────────────┤                 │                │              │
 │                   │                 │                │              │
 │  [Status bar: "1 pending upload"]   │                │              │
```

### Scenario 3: Auto-Sync When Online

```
Network             React           Electron          PouchDB        Supabase
 │                   │                 │                │              │
 │  Connection       │                 │                │              │
 │  restored         │                 │                │              │
 ├──────────────────────────────────────►                │              │
 │                   │                 │                │              │
 │                   │                 │  Get pending   │              │
 │                   │                 ├───────────────►│              │
 │                   │                 │◄───────────────┤              │
 │                   │                 │  [3 reports]   │              │
 │                   │                 │                │              │
 │                   │                 │  Upload #1     │              │
 │                   │                 ├───────────────────────────────►
 │                   │                 │◄───────────────────────────────┤
 │                   │                 │  Success       │              │
 │                   │                 │  Remove from Q │              │
 │                   │                 ├───────────────►│              │
 │                   │                 │                │              │
 │                   │                 │  Upload #2     │              │
 │                   │                 ├───────────────────────────────►
 │                   │                 │◄───────────────────────────────┤
 │                   │                 │  Remove from Q │              │
 │                   │                 ├───────────────►│              │
 │                   │                 │                │              │
 │                   │                 │  Upload #3     │              │
 │                   │                 ├───────────────────────────────►
 │                   │                 │◄───────────────────────────────┤
 │                   │                 │  Remove from Q │              │
 │                   │                 ├───────────────►│              │
 │                   │                 │                │              │
 │                   │  Sync complete! │                │              │
 │                   │◄────────────────┤                │              │
 │  [Status bar: "All synced!"]        │                │              │
```

## File System Structure

```
User's Computer
│
├── Application Binary
│   ├── ampOS Field Technician.app (macOS)
│   ├── ampOS Field Technician.exe (Windows)
│   └── ampOS-Field-Technician.AppImage (Linux)
│
└── User Data Directory
    ├── Database/
    │   └── ampOS-field.db         ← PouchDB local database
    │
    ├── Logs/
    │   ├── main.log               ← Electron main process logs
    │   └── renderer.log           ← React app logs
    │
    └── Config/
        └── preferences.json       ← User preferences
```

**Database Locations:**
- Windows: `C:\Users\[User]\AppData\Roaming\ampOS-field.db`
- macOS: `~/Library/Application Support/ampOS-field.db`
- Linux: `~/.config/ampOS-field.db`

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SECURITY LAYERS                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Layer 1: Context Isolation                                 │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Renderer (React) CANNOT access:                      │  │
│  │  • Node.js APIs                                      │  │
│  │  • File system                                       │  │
│  │  • Network directly                                  │  │
│  │                                                       │  │
│  │ Only through controlled electronAPI bridge          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  Layer 2: Preload Script                                    │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Exposes ONLY specific, safe functions:              │  │
│  │  • db.getJobs() ✓                                    │  │
│  │  • sync.start() ✓                                    │  │
│  │                                                       │  │
│  │ Does NOT expose:                                     │  │
│  │  • File system access ✗                              │  │
│  │  • Arbitrary code execution ✗                        │  │
│  │  • System commands ✗                                 │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  Layer 3: Authentication                                    │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ • Supabase Auth required                             │  │
│  │ • JWT tokens with expiration                         │  │
│  │ • Refresh tokens for long sessions                   │  │
│  │ • No hardcoded credentials                           │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  Layer 4: Transport Security                                │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ • HTTPS only for Supabase                            │  │
│  │ • Certificate validation                             │  │
│  │ • No insecure protocols                              │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  Layer 5: Local Data (Future Enhancement)                  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ • Database encryption (planned)                      │  │
│  │ • OS-level keychain for credentials                  │  │
│  │ • Secure credential storage                          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Performance Characteristics

### Storage

```
Component         Size       Notes
─────────────────────────────────────────────────
App Binary        ~150 MB    Includes Electron + React
Initial DB        ~10 MB     50 jobs + templates
Per Report        ~100 KB    Without images
With Photos       ~2-5 MB    Per report with images
Total Typical     ~50 MB     After 1 week of use
```

### Network Usage

```
Operation         Data       Time
─────────────────────────────────────────────────
Initial Download  5-10 MB    30-60 seconds
Sync 1 Report     100 KB     1-2 seconds
Sync 10 Reports   1 MB       10-20 seconds
Download Updates  2-5 MB     15-30 seconds
```

### Memory Usage

```
State            RAM Usage   Notes
─────────────────────────────────────────────────
Idle             150 MB      Electron + React
Active Use       250 MB      With data loaded
Syncing          300 MB      Peak during upload
Heavy Load       400 MB      Many reports open
```

## Technology Stack Details

```
┌─────────────────────────────────────────────────────────────┐
│                    TECHNOLOGY STACK                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Desktop Framework                                          │
│  ┌────────────────────────────────────┐                    │
│  │ Electron 28.1.0                    │                    │
│  │ • Chromium 120                     │                    │
│  │ • Node.js 18.18                    │                    │
│  │ • V8 JavaScript engine             │                    │
│  └────────────────────────────────────┘                    │
│                                                             │
│  Frontend                                                   │
│  ┌────────────────────────────────────┐                    │
│  │ React 18.3.1                       │                    │
│  │ TypeScript 5.3.3                   │                    │
│  │ Vite 6.2.4                         │                    │
│  │ React Router 6.30.0                │                    │
│  └────────────────────────────────────┘                    │
│                                                             │
│  Local Database                                             │
│  ┌────────────────────────────────────┐                    │
│  │ PouchDB 8.0.1                      │                    │
│  │ pouchdb-find 8.0.1 (queries)       │                    │
│  │ LevelDB (storage engine)           │                    │
│  └────────────────────────────────────┘                    │
│                                                             │
│  Backend                                                    │
│  ┌────────────────────────────────────┐                    │
│  │ Supabase 2.57.2                    │                    │
│  │ • PostgreSQL 15                    │                    │
│  │ • PostgREST API                    │                    │
│  │ • Supabase Auth                    │                    │
│  └────────────────────────────────────┘                    │
│                                                             │
│  Build Tools                                                │
│  ┌────────────────────────────────────┐                    │
│  │ electron-builder 24.9.1            │                    │
│  │ TypeScript 5.3.3                   │                    │
│  │ Vite 6.2.4                         │                    │
│  └────────────────────────────────────┘                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
Development          Build              Distribution
    │                 │                      │
    │  npm run        │                      │
    │  build:desktop  │                      │
    ├────────────────►│                      │
    │                 │                      │
    │                 │  Compile TS          │
    │                 │  Bundle React        │
    │                 │  Package Electron    │
    │                 │                      │
    │                 │  Create Installers   │
    │                 ├─────────────────────►│
    │                 │                      │
    │                 │                  Windows:
    │                 │                  • .exe installer
    │                 │                  • .exe portable
    │                 │                      │
    │                 │                  macOS:
    │                 │                  • .dmg (Intel)
    │                 │                  • .dmg (ARM64)
    │                 │                      │
    │                 │                  Linux:
    │                 │                  • .AppImage
    │                 │                  • .deb
    │                 │                      │
    │                 │                      │
    │                 │                  Upload to:
    │                 │                  • File server
    │                 │                  • Cloud storage
    │                 │                  • Update server
```

## Scaling Considerations

### Single User
- ✅ Current architecture is perfect
- Local database handles 1000s of reports
- No performance issues

### Multiple Devices per User
- ⚠️ Current: Each device has own database
- 💡 Future: Cloud sync between devices
- 💡 Future: Conflict resolution needed

### Team Collaboration
- ⚠️ Current: No real-time collaboration
- 💡 Future: WebSocket updates
- 💡 Future: Presence indicators

### Large Scale (100+ users)
- ✅ Server can handle load (Supabase scales)
- ✅ Each client independent
- ✅ Sync is staggered (not all at once)

---

**For implementation details, see:**
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Complete implementation guide
- [OFFLINE_SETUP.md](./OFFLINE_SETUP.md) - Developer setup
- [README_OFFLINE_DESKTOP.md](./README_OFFLINE_DESKTOP.md) - Overview

