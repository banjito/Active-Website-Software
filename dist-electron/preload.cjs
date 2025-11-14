"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose protected methods to renderer process
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // Database operations
    db: {
        getJobs: () => electron_1.ipcRenderer.invoke('db:getJobs'),
        getJob: (jobId) => electron_1.ipcRenderer.invoke('db:getJob', jobId),
        saveJob: (job) => electron_1.ipcRenderer.invoke('db:saveJob', job),
        getReportTemplates: () => electron_1.ipcRenderer.invoke('db:getReportTemplates'),
        saveReport: (report) => electron_1.ipcRenderer.invoke('db:saveReport', report),
        getReports: (jobId) => electron_1.ipcRenderer.invoke('db:getReports', jobId),
        getPendingSyncItems: () => electron_1.ipcRenderer.invoke('db:getPendingSyncItems'),
    },
    // Sync operations
    sync: {
        start: (credentials) => electron_1.ipcRenderer.invoke('sync:start', credentials),
        uploadPending: () => electron_1.ipcRenderer.invoke('sync:uploadPending'),
        downloadJobs: (technicianId) => electron_1.ipcRenderer.invoke('sync:downloadJobs', technicianId),
        getStatus: () => electron_1.ipcRenderer.invoke('sync:getStatus'),
    },
    // Network status
    network: {
        isOnline: () => electron_1.ipcRenderer.invoke('network:isOnline'),
        onStatusChange: (callback) => {
            if (typeof window !== 'undefined') {
                window.addEventListener('online', () => callback(true));
                window.addEventListener('offline', () => callback(false));
            }
        },
    },
});
