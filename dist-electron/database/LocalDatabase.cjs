"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalDatabase = void 0;
const pouchdb_1 = __importDefault(require("pouchdb"));
const pouchdb_find_1 = __importDefault(require("pouchdb-find"));
// Add the find plugin
pouchdb_1.default.plugin(pouchdb_find_1.default);
class LocalDatabase {
    constructor() {
        this.initialized = false;
        // Use a persistent location for the database
        const dbPath = process.env.NODE_ENV === 'development'
            ? './ampOS-field-dev.db'
            : './ampOS-field.db';
        this.db = new pouchdb_1.default(dbPath);
    }
    async initialize() {
        if (this.initialized)
            return;
        try {
            // Create indexes for faster queries
            await this.db.createIndex({
                index: { fields: ['type', 'jobId'] }
            });
            await this.db.createIndex({
                index: { fields: ['type', 'syncStatus'] }
            });
            await this.db.createIndex({
                index: { fields: ['type', 'reportType'] }
            });
            this.initialized = true;
            console.log('Local database initialized');
        }
        catch (error) {
            console.error('Failed to initialize database:', error);
            throw error;
        }
    }
    async isFirstRun() {
        try {
            const result = await this.db.find({
                selector: { type: 'job' },
                limit: 1
            });
            return result.docs.length === 0;
        }
        catch (error) {
            console.error('Error checking first run:', error);
            return true;
        }
    }
    // Job operations
    async saveJob(job) {
        const doc = {
            _id: `job_${job.id}`,
            type: 'job',
            data: job,
            lastSynced: new Date(),
            createdLocally: false,
        };
        try {
            const existing = await this.db.get(doc._id).catch(() => null);
            if (existing) {
                doc._rev = existing._rev;
            }
            await this.db.put(doc);
        }
        catch (error) {
            console.error('Error saving job:', error);
            throw error;
        }
    }
    async getJob(jobId) {
        try {
            const doc = await this.db.get(`job_${jobId}`);
            return doc.data;
        }
        catch (error) {
            if (error.status === 404) {
                return null;
            }
            throw error;
        }
    }
    async getJobs() {
        try {
            const result = await this.db.find({
                selector: { type: 'job' }
            });
            return result.docs.map((doc) => doc.data);
        }
        catch (error) {
            console.error('Error getting jobs:', error);
            return [];
        }
    }
    // Report operations
    async saveReport(report) {
        const doc = {
            _id: `report_${report.id || Date.now()}`,
            type: 'report',
            jobId: report.job_id,
            data: report,
            syncStatus: 'pending',
            createdOffline: true, // Always true in Electron main process
            lastModified: new Date(),
        };
        try {
            const existing = await this.db.get(doc._id).catch(() => null);
            if (existing) {
                doc._rev = existing._rev;
            }
            await this.db.put(doc);
            // Add to sync queue
            await this.addToSyncQueue('report', report.id ? 'update' : 'create', doc._id, report);
        }
        catch (error) {
            console.error('Error saving report:', error);
            throw error;
        }
    }
    async getReports(jobId) {
        try {
            const selector = { type: 'report' };
            if (jobId) {
                selector.jobId = jobId;
            }
            const result = await this.db.find({ selector });
            return result.docs.map((doc) => ({
                ...doc.data,
                syncStatus: doc.syncStatus,
                createdOffline: doc.createdOffline,
            }));
        }
        catch (error) {
            console.error('Error getting reports:', error);
            return [];
        }
    }
    // Report template operations
    async saveReportTemplate(template) {
        const doc = {
            _id: `template_${template.id}`,
            type: 'template',
            reportType: template.reportType,
            data: template,
            lastUpdated: new Date(),
        };
        try {
            const existing = await this.db.get(doc._id).catch(() => null);
            if (existing) {
                doc._rev = existing._rev;
            }
            await this.db.put(doc);
        }
        catch (error) {
            console.error('Error saving template:', error);
            throw error;
        }
    }
    async getReportTemplates() {
        try {
            const result = await this.db.find({
                selector: { type: 'template' }
            });
            return result.docs.map((doc) => doc.data);
        }
        catch (error) {
            console.error('Error getting templates:', error);
            return [];
        }
    }
    // Sync queue operations
    async addToSyncQueue(entity, action, entityId, data) {
        const doc = {
            _id: `sync_${Date.now()}_${Math.random()}`,
            type: 'syncQueue',
            action,
            entity,
            entityId,
            data,
            timestamp: new Date(),
            attempts: 0,
        };
        try {
            await this.db.put(doc);
        }
        catch (error) {
            console.error('Error adding to sync queue:', error);
        }
    }
    async getPendingSyncItems() {
        try {
            const result = await this.db.find({
                selector: { type: 'syncQueue' },
                sort: [{ timestamp: 'asc' }]
            });
            return result.docs;
        }
        catch (error) {
            console.error('Error getting sync queue:', error);
            return [];
        }
    }
    async removeSyncQueueItem(id) {
        try {
            const doc = await this.db.get(id);
            await this.db.remove(doc);
        }
        catch (error) {
            console.error('Error removing sync queue item:', error);
        }
    }
    async updateSyncQueueItem(id, updates) {
        try {
            const doc = await this.db.get(id);
            await this.db.put({ ...doc, ...updates });
        }
        catch (error) {
            console.error('Error updating sync queue item:', error);
        }
    }
    async markReportAsSynced(reportId) {
        try {
            const doc = await this.db.get(`report_${reportId}`);
            doc.syncStatus = 'synced';
            await this.db.put(doc);
        }
        catch (error) {
            console.error('Error marking report as synced:', error);
        }
    }
    // Cleanup operations
    async cleanupOldData(daysOld = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        try {
            // Find old synced reports
            const result = await this.db.find({
                selector: {
                    type: 'report',
                    syncStatus: 'synced',
                    lastModified: { $lt: cutoffDate.toISOString() }
                }
            });
            // Delete them
            const deletePromises = result.docs.map((doc) => this.db.remove(doc));
            await Promise.all(deletePromises);
            console.log(`Cleaned up ${result.docs.length} old reports`);
        }
        catch (error) {
            console.error('Error cleaning up old data:', error);
        }
    }
}
exports.LocalDatabase = LocalDatabase;
