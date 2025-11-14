# ampOS Field Technician Desktop App 🚀

Welcome to the offline-capable desktop version of ampOS! This version allows field technicians to work without internet and sync when connected.

## 🎯 Quick Start

### For Field Technicians

**Just want to use the app?**

1. Download the installer for your system:
   - **Windows**: `ampOS-Field-Technician-Setup.exe`
   - **Mac**: `ampOS-Field-Technician.dmg`
   - **Linux**: `ampOS-Field-Technician.AppImage`

2. Install and launch the app

3. Sign in with your credentials

4. Click **"Download Data for Offline Use"** to sync your jobs

5. Work offline - everything saves locally!

6. When back online, changes sync automatically ✅

---

### For Developers

**Want to build or modify the app?**

See [OFFLINE_SETUP.md](./OFFLINE_SETUP.md) for complete development guide.

**Quick commands:**
```bash
# Install dependencies
npm install

# Run in development
npm run dev:electron

# Build for production
npm run build:desktop

# Build for specific platforms
npm run package:win      # Windows
npm run package:mac      # macOS
npm run package:linux    # Linux
```

---

## ✨ Features

### 🔌 Work Completely Offline
- All assigned jobs downloaded to your laptop
- All report templates stored locally
- Create and edit reports without internet
- Everything saves automatically

### 🔄 Automatic Sync
- Changes upload when connection detected
- Background sync every 5 minutes
- Never loses your work
- Conflict-free (only adds, never deletes server data)

### 📊 Status Bar
- See online/offline status at a glance
- Track pending uploads
- Manual sync button
- Last sync timestamp

### 💾 Smart Storage
- Auto-cleanup of old synced reports (30+ days)
- Efficient local database (PouchDB)
- Keeps only relevant data
- Minimal disk space usage

---

## 📱 User Interface

### Status Bar (Bottom of Screen)

**Online Mode:**
```
🟢 Online  |  0 pending uploads  |  Last synced: 2:45 PM  |  [Sync Now]
```

**Offline Mode:**
```
🔴 Offline Mode  |  3 pending uploads  |  Changes will sync when online
```

**Syncing:**
```
🟢 Online  |  Syncing...  |  Uploading 2 of 5 reports
```

---

## 🎮 How to Use

### Initial Download

1. **Open the app** for the first time
2. **Sign in** with your technician account
3. Look for the **"Download Data"** button (usually in the header or settings)
4. **Click it** - you'll see:
   ```
   ⏳ Downloading 15 jobs...
   ⏳ Downloading 47 report templates...
   ✅ Download complete!
   ```

### Creating Reports Offline

1. **Navigate to a job** as usual
2. **Click "Add Report"** - works offline!
3. **Fill out the report** - all fields save automatically
4. **Submit** - report is marked "pending sync"
5. **Status bar** shows "1 pending upload"

### When Back Online

- **Automatic**: App detects connection and syncs in background
- **Manual**: Click "Sync Now" in status bar
- **Progress**: See "Uploading 3 of 7 reports..."
- **Complete**: "✅ All changes synced!"

---

## 🔧 Technical Details

### What Gets Stored Locally?

**Jobs:**
- All your assigned jobs (current + future)
- Job details, customer info, schedules
- Technician assignments

**Report Templates:**
- All available report types
- Form structures and validation
- Required fields

**Your Reports:**
- Reports you create offline
- Reports you edit offline
- Sync status for each

### What Doesn't Sync?

To keep the app fast and storage efficient:
- ❌ Other technicians' reports
- ❌ Jobs not assigned to you
- ❌ Historical jobs (older than 90 days)
- ❌ System-wide settings

### Database Location

Your local database is stored at:

**Windows:**
```
C:\Users\[YourName]\AppData\Roaming\ampOS-field.db
```

**macOS:**
```
~/Library/Application Support/ampOS-field.db
```

**Linux:**
```
~/.config/ampOS-field.db
```

---

## 🐛 Troubleshooting

### App Won't Start

1. **Check logs** (see locations below)
2. **Try reinstalling** the app
3. **Contact IT support** with error details

**Log locations:**
- Windows: `%APPDATA%\ampOS Field Technician\logs\`
- macOS: `~/Library/Logs/ampOS Field Technician/`
- Linux: `~/.config/ampOS Field Technician/logs/`

### Sync Isn't Working

**Check these:**
- ✅ Connected to internet (check status bar)
- ✅ Not on VPN (can block sync)
- ✅ Firewall allows the app
- ✅ Try manual sync with "Sync Now" button

**If still failing:**
1. Close the app
2. Restart it
3. Wait 30 seconds for auto-sync
4. Check status bar for errors

### Reports Are Missing

**If reports aren't showing:**
1. Check the **job detail page** (not just the list)
2. Look for **"pending sync"** badge
3. Check **"All Reports"** tab (might be in a different section)
4. Try **syncing manually**

**If reports are truly lost:**
1. Check the local database (see location above)
2. Database can be recovered by IT if needed
3. Reports are never deleted without explicit action

### "Database Corrupted" Error

This is rare but can happen:

1. **Close the app**
2. **Backup the database file** (copy it somewhere safe)
3. **Delete the database** (see location above)
4. **Restart the app**
5. **Re-download data**

Your server data is safe! Only the local copy needs refreshing.

### Can't Download Data

**Possible causes:**
- Not connected to internet
- Supabase server is down (rare)
- Your account doesn't have jobs assigned

**Solutions:**
1. Check internet connection
2. Try again in a few minutes
3. Contact supervisor to verify job assignments

---

## 🔒 Security & Privacy

### Your Data is Safe

- **Encryption**: Database is stored locally (consider encrypting for extra security)
- **Authentication**: Must sign in to access
- **Sync**: Only uploads YOUR data
- **Privacy**: Only sees jobs assigned to YOU

### What's Sent to Server?

**Uploaded:**
- Reports you create
- Reports you edit
- Timestamp of changes

**Downloaded:**
- Jobs assigned to you
- Report templates (for everyone)
- Customer info (for your jobs only)

**Never Uploaded:**
- Your location
- App usage data
- Diagnostic info (unless you opt-in)

---

## 💡 Tips & Best Practices

### Before Going to the Field

1. ✅ **Open the app** while on Wi-Fi
2. ✅ **Download latest data**
3. ✅ **Wait for "Download complete"**
4. ✅ **Create a test report** to ensure it works
5. ✅ **Check status bar** shows "Offline Mode" when disconnected

### During Field Work

1. 💾 **Save often** (though it auto-saves)
2. 📸 **Take photos** (they're stored locally)
3. 📝 **Fill reports completely** before leaving site
4. 🔋 **Charge laptop** (offline mode uses less battery but still needs power)

### After Field Work

1. 📡 **Connect to Wi-Fi** when back at office/home
2. ⏳ **Wait for auto-sync** (watch status bar)
3. ✅ **Verify** all reports show "synced" status
4. 🧹 **Close app** to trigger cleanup

### Weekly Maintenance

- **Monday AM**: Download latest jobs for the week
- **Friday PM**: Ensure all reports are synced
- **Monthly**: Check storage space (though cleanup is automatic)

---

## 📞 Support

### Getting Help

**For technicians:**
- Contact your supervisor
- Check the user guide (this file!)
- IT helpdesk: [your IT email]

**For developers:**
- See [OFFLINE_SETUP.md](./OFFLINE_SETUP.md)
- Check GitHub issues
- Review console logs

### Feedback

We want to make this better! Report:
- 🐛 Bugs or errors
- 💡 Feature ideas
- 🎨 UI/UX improvements
- 📖 Documentation issues

---

## 🚀 What's Next?

### Planned Features

- 🔐 **Database encryption** for extra security
- 🎨 **Dark mode** (if not already available)
- 📊 **Offline analytics** (storage usage, sync stats)
- 🔔 **Smart notifications** (remind to sync, updates available)
- 📷 **Better photo handling** (compression, optimization)
- 🗺️ **GPS tagging** (optional location for reports)
- 🔄 **Selective sync** (choose which jobs to download)

### Version History

**v1.0.0** - Initial Release
- ✅ Offline database (PouchDB)
- ✅ Auto-sync when online
- ✅ Status bar indicator
- ✅ Conflict-free sync
- ✅ Auto-cleanup

---

## 📄 License

Internal use only - ampOS Field Technician Desktop

---

**Built with ❤️ for field technicians who keep the lights on!** ⚡

