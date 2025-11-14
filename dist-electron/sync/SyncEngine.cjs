"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncEngine = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
class SyncEngine {
    constructor(localDB) {
        this.supabase = null; // SupabaseClient
        this.syncInProgress = false;
        this.localDB = localDB;
        this.syncStatus = {
            lastSync: null,
            isOnline: true, // Assume online in main process
            pendingUploads: 0,
            inProgress: false,
        };
    }
    async startSync(credentials) {
        try {
            // Initialize Supabase client
            this.supabase = (0, supabase_js_1.createClient)(credentials.url, credentials.key);
            // Test connection
            const { error } = await this.supabase.from('jobs').select('id').limit(1);
            if (error)
                throw error;
            return { success: true, message: 'Sync initialized successfully' };
        }
        catch (error) {
            console.error('Failed to initialize sync:', error);
            return { success: false, message: error.message };
        }
    }
    isOnline() {
        return this.supabase !== null; // In Electron main, assume always online if supabase is initialized
    }
    async getSyncStatus() {
        const pendingItems = await this.localDB.getPendingSyncItems();
        this.syncStatus.pendingUploads = pendingItems.length;
        this.syncStatus.isOnline = this.isOnline();
        return { ...this.syncStatus };
    }
    handleOnline() {
        console.log('Network connection restored');
        this.syncStatus.isOnline = true;
        // Auto-sync when coming online
        setTimeout(() => {
            this.uploadPendingChanges().catch(err => console.error('Auto-sync failed:', err));
        }, 2000); // Wait 2 seconds to ensure connection is stable
    }
    handleOffline() {
        console.log('Network connection lost');
        this.syncStatus.isOnline = false;
    }
    async downloadJobsForTechnician(technicianId) {
        if (!this.supabase) {
            return { success: false, count: 0 };
        }
        try {
            // Get today's date for filtering
            const today = new Date().toISOString().split('T')[0];
            // Download assigned jobs (modify query based on your schema)
            const { data: jobs, error: jobsError } = await this.supabase
                .from('jobs')
                .select('*')
                .or(`assigned_technician.eq.${technicianId},technicians.cs.{${technicianId}}`)
                .gte('scheduled_date', today);
            if (jobsError)
                throw jobsError;
            // Save jobs locally
            for (const job of jobs || []) {
                await this.localDB.saveJob(job);
            }
            // Download report templates
            const { data: templates, error: templatesError } = await this.supabase
                .from('report_templates')
                .select('*');
            if (templatesError) {
                console.warn('Failed to download templates:', templatesError);
            }
            else {
                for (const template of templates || []) {
                    await this.localDB.saveReportTemplate(template);
                }
            }
            console.log(`Downloaded ${jobs?.length || 0} jobs and ${templates?.length || 0} templates`);
            this.syncStatus.lastSync = new Date();
            return { success: true, count: jobs?.length || 0 };
        }
        catch (error) {
            console.error('Failed to download jobs:', error);
            return { success: false, count: 0 };
        }
    }
    async uploadPendingChanges() {
        if (!this.supabase || this.syncInProgress) {
            return { success: false, uploaded: 0, failed: 0, errors: ['Sync not available or already in progress'] };
        }
        this.syncInProgress = true;
        this.syncStatus.inProgress = true;
        const result = {
            success: true,
            uploaded: 0,
            failed: 0,
            errors: [],
        };
        try {
            const pendingItems = await this.localDB.getPendingSyncItems();
            console.log(`Syncing ${pendingItems.length} pending items...`);
            for (const item of pendingItems) {
                try {
                    if (item.entity === 'report') {
                        await this.uploadReport(item);
                        await this.localDB.removeSyncQueueItem(item._id);
                        result.uploaded++;
                    }
                }
                catch (error) {
                    console.error(`Failed to sync item ${item._id}:`, error);
                    result.failed++;
                    result.errors.push(error.message);
                    // Update attempts counter
                    await this.localDB.updateSyncQueueItem(item._id, {
                        attempts: item.attempts + 1,
                        lastError: error.message,
                    });
                    // If too many attempts, mark as error
                    if (item.attempts >= 5) {
                        result.errors.push(`Item ${item._id} failed after 5 attempts`);
                    }
                }
            }
            this.syncStatus.lastSync = new Date();
            console.log(`Sync complete: ${result.uploaded} uploaded, ${result.failed} failed`);
        }
        catch (error) {
            console.error('Sync process error:', error);
            result.success = false;
            result.errors.push(error.message);
        }
        finally {
            this.syncInProgress = false;
            this.syncStatus.inProgress = false;
        }
        return result;
    }
    async uploadReport(item) {
        if (!this.supabase)
            throw new Error('Supabase not initialized');
        const reportData = item.data;
        // Use upsert to handle both create and update
        // This ensures we never delete data on the server
        const { error } = await this.supabase
            .from('neta_ops.reports') // Adjust table name based on your schema
            .upsert(reportData, {
            onConflict: 'id',
            ignoreDuplicates: false, // Update if exists
        });
        if (error)
            throw error;
        // Mark report as synced locally
        await this.localDB.markReportAsSynced(reportData.id);
    }
    // Periodic cleanup of old data
    async performMaintenance() {
        try {
            // Clean up synced reports older than 30 days
            await this.localDB.cleanupOldData(30);
            console.log('Database maintenance completed');
        }
        catch (error) {
            console.error('Maintenance error:', error);
        }
    }
}
exports.SyncEngine = SyncEngine;
