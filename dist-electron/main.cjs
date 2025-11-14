"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const url = __importStar(require("url"));
const LocalDatabase_1 = require("./database/LocalDatabase");
const SyncEngine_1 = require("./sync/SyncEngine");
// Keep a global reference to prevent garbage collection
let mainWindow = null;
let localDB;
let syncEngine;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
        },
        icon: path.join(__dirname, '../public/ampOS-favicon.png'),
        title: 'ampOS Field Technician',
    });
    // Load the app
    const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
    if (isDev) {
        console.log('Loading dev server from http://localhost:5175');
        mainWindow.loadURL('http://localhost:5175').catch(err => {
            console.error('Failed to load URL:', err);
        });
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadURL(url.format({
            pathname: path.join(__dirname, '../dist/index.html'),
            protocol: 'file:',
            slashes: true,
        }));
    }
    // Log any load errors
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Failed to load:', errorCode, errorDescription);
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    // Initialize database and sync
    initializeBackend();
}
async function initializeBackend() {
    try {
        // Initialize local database
        localDB = new LocalDatabase_1.LocalDatabase();
        await localDB.initialize();
        // Initialize sync engine
        syncEngine = new SyncEngine_1.SyncEngine(localDB);
        // Check for initial sync
        const isFirstRun = await localDB.isFirstRun();
        if (isFirstRun) {
            console.log('First run detected, waiting for user authentication...');
        }
        console.log('Backend initialized successfully');
    }
    catch (error) {
        console.error('Failed to initialize backend:', error);
    }
}
// IPC Handlers
// Database operations
electron_1.ipcMain.handle('db:getJobs', async () => {
    return await localDB.getJobs();
});
electron_1.ipcMain.handle('db:getJob', async (_event, jobId) => {
    return await localDB.getJob(jobId);
});
electron_1.ipcMain.handle('db:saveJob', async (_event, job) => {
    return await localDB.saveJob(job);
});
electron_1.ipcMain.handle('db:getReportTemplates', async () => {
    return await localDB.getReportTemplates();
});
electron_1.ipcMain.handle('db:saveReport', async (_event, report) => {
    return await localDB.saveReport(report);
});
electron_1.ipcMain.handle('db:getReports', async (_event, jobId) => {
    return await localDB.getReports(jobId);
});
electron_1.ipcMain.handle('db:getPendingSyncItems', async () => {
    return await localDB.getPendingSyncItems();
});
// Sync operations
electron_1.ipcMain.handle('sync:start', async (_event, credentials) => {
    return await syncEngine.startSync(credentials);
});
electron_1.ipcMain.handle('sync:uploadPending', async () => {
    return await syncEngine.uploadPendingChanges();
});
electron_1.ipcMain.handle('sync:downloadJobs', async (_event, technicianId) => {
    return await syncEngine.downloadJobsForTechnician(technicianId);
});
electron_1.ipcMain.handle('sync:getStatus', async () => {
    return await syncEngine.getSyncStatus();
});
// Online status
electron_1.ipcMain.handle('network:isOnline', async () => {
    return syncEngine.isOnline();
});
// App lifecycle
electron_1.app.on('ready', createWindow);
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
// Periodic sync check (every 5 minutes when online)
setInterval(async () => {
    if (syncEngine && syncEngine.isOnline()) {
        try {
            await syncEngine.uploadPendingChanges();
        }
        catch (error) {
            console.error('Background sync failed:', error);
        }
    }
}, 5 * 60 * 1000);
