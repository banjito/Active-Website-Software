import { supabase } from '../lib/supabase';
import { toast } from '../components/ui/toast';

export interface JobNotification {
  id: string;
  job_id: string;
  user_id: string | null; // null for notifications to all users
  title: string;
  message: string;
  type: 'status_change' | 'deadline_approaching' | 'resource_assigned' | 'cost_update' | 'sla_violation' | 'new_job' | 'other';
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
  updated_at: string;
  metadata: any; // Additional data like source, priority, etc.
  job?: {
    id: string;
    deleted_at: string | null;
  };
}

export type DigestKey = 'dailyReview' | 'dailyReadyToBill' | 'weeklyReports';

export interface AutomatedEmailPreferences {
  dailyReview: boolean;
  dailyReadyToBill: boolean;
  weeklyReports: boolean;
}

export interface NotificationPreferences {
  enableNotifications: boolean;
  emailNotifications: boolean;
  notificationTypes: {
    status_change: boolean;
    deadline_approaching: boolean;
    resource_assigned: boolean;
    cost_update: boolean;
    sla_violation: boolean;
    new_job: boolean;
  };
  automatedEmails?: AutomatedEmailPreferences;
}

export const DEFAULT_AUTOMATED_EMAILS: AutomatedEmailPreferences = {
  dailyReview: true,
  dailyReadyToBill: true,
  weeklyReports: true,
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enableNotifications: true,
  emailNotifications: false,
  notificationTypes: {
    status_change: true,
    deadline_approaching: true,
    resource_assigned: true,
    cost_update: true,
    sla_violation: true,
    new_job: true
  },
  automatedEmails: { ...DEFAULT_AUTOMATED_EMAILS },
};

/** Merge stored JSON with defaults (in-app + digest email prefs). */
export function mergeNotificationPreferences(
  stored: Partial<NotificationPreferences> | null | undefined
): NotificationPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    ...stored,
    notificationTypes: {
      ...DEFAULT_PREFERENCES.notificationTypes,
      ...stored?.notificationTypes,
    },
    automatedEmails: {
      ...DEFAULT_AUTOMATED_EMAILS,
      ...stored?.automatedEmails,
    },
  };
}

// Get user notification preferences
// Gracefully degrades to DEFAULT_PREFERENCES when the table doesn't exist or
// when RLS/ownership denies access. Errors known to be "benign" are swallowed
// silently to avoid polluting the console on every page load.
export const getUserNotificationPreferences = async (userId: string): Promise<NotificationPreferences> => {
  try {
    const { data, error } = await supabase
      .schema('common')
      .from('user_preferences')
      .select('notification_preferences')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      const code = (error as any).code;
      // PGRST301 = RLS denied, 42P01 = table missing, 42501 = permission denied
      // (usually a trigger/policy referencing the `users` table)
      if (code === 'PGRST301' || code === '42P01' || code === '42501') {
        return mergeNotificationPreferences(null);
      }
      throw error;
    }

    return mergeNotificationPreferences(
      data?.notification_preferences as Partial<NotificationPreferences> | undefined
    );
  } catch (error) {
    // Don't log benign permission/missing-table errors -- just fall back.
    const code = (error as any)?.code;
    if (code !== 'PGRST301' && code !== '42P01' && code !== '42501') {
      console.error('Error getting notification preferences:', error);
    }
    return mergeNotificationPreferences(null);
  }
};

// Update user notification preferences
export const updateUserNotificationPreferences = async (
  userId: string, 
  preferences: NotificationPreferences
): Promise<{ success: boolean }> => {
  try {
    const { error } = await supabase
      .schema('common')
      .from('user_preferences')
      .upsert({
        user_id: userId,
        notification_preferences: preferences,
        updated_at: new Date().toISOString()
      });
      
    if (error) throw error;
    
    return { success: true };
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return { success: false };
  }
};

// Get user notifications with optional filtering
// Note: This function automatically filters out notifications for deleted jobs.
// The `jobs` table lives in the `neta_ops` schema while `job_notifications`
// lives in `common`, so PostgREST cannot resolve a foreign-key embed across
// schemas. Instead we fetch notifications first, then look up deleted job
// IDs from `neta_ops.jobs` in a separate, bounded query.
export const getUserNotifications = async (
  userId: string,
  options: {
    limit?: number;
    unreadOnly?: boolean;
    types?: string[];
    jobId?: string;
  } = {}
): Promise<{ data: JobNotification[], error: any }> => {
  try {
    const { limit = 50, unreadOnly = false, types, jobId } = options;

    let query = supabase
      .schema('common')
      .from('job_notifications')
      .select('*')
      .or(`user_id.eq.${userId},user_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    if (types && types.length > 0) {
      query = query.in('type', types);
    }

    if (jobId) {
      query = query.eq('job_id', jobId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const notifications = (data || []) as JobNotification[];
    if (notifications.length === 0) {
      return { data: notifications, error: null };
    }

    // Collect unique job IDs and look up deletion state in neta_ops.jobs.
    const jobIds = Array.from(
      new Set(notifications.map(n => n.job_id).filter((id): id is string => !!id))
    );

    let deletedJobIds = new Set<string>();
    if (jobIds.length > 0) {
      try {
        const { data: jobRows, error: jobError } = await supabase
          .schema('neta_ops')
          .from('jobs')
          .select('id, deleted_at')
          .in('id', jobIds);

        if (!jobError && jobRows) {
          deletedJobIds = new Set(
            jobRows.filter((j: any) => j.deleted_at).map((j: any) => j.id)
          );
        }
      } catch {
        // If the cross-schema lookup fails (permissions, etc.), don't fail
        // the whole notifications load -- just skip the deleted-job filter.
      }
    }

    const filteredData = notifications.filter(n => !n.job_id || !deletedJobIds.has(n.job_id));

    return { data: filteredData, error: null };
  } catch (error) {
    console.error('Error getting notifications:', error);
    return { data: [], error };
  }
};

// Mark notification as read
export const markNotificationAsRead = async (
  notificationId: string
): Promise<{ success: boolean, error: any }> => {
  try {
    const { error } = await supabase
      .schema('common')
      .from('job_notifications')
      .update({ 
        is_read: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', notificationId);
      
    if (error) throw error;
    
    return { success: true, error: null };
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return { success: false, error };
  }
};

// Mark all notifications as read for a user
export const markAllNotificationsAsRead = async (
  userId: string
): Promise<{ success: boolean, error: any }> => {
  try {
    const { error } = await supabase
      .schema('common')
      .from('job_notifications')
      .update({ 
        is_read: true,
        updated_at: new Date().toISOString()
      })
      .or(`user_id.eq.${userId},user_id.is.null`);
      
    if (error) throw error;
    
    return { success: true, error: null };
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return { success: false, error };
  }
};

// Dismiss notification (hide without deleting)
export const dismissNotification = async (
  notificationId: string
): Promise<{ success: boolean, error: any }> => {
  try {
    const { error } = await supabase
      .schema('common')
      .from('job_notifications')
      .update({ 
        is_dismissed: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', notificationId);
      
    if (error) throw error;
    
    return { success: true, error: null };
  } catch (error) {
    console.error('Error dismissing notification:', error);
    return { success: false, error };
  }
};

// Create a new notification
export const createJobNotification = async (
  notification: Omit<JobNotification, 'id' | 'is_read' | 'is_dismissed' | 'created_at' | 'updated_at'>
): Promise<{ data: JobNotification | null, error: any }> => {
  try {
    const { data, error } = await supabase
      .schema('common')
      .from('job_notifications')
      .insert({
        ...notification,
        is_read: false,
        is_dismissed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error('Error creating notification:', error);
    return { data: null, error };
  }
};

// Show toast notification
export const showToastNotification = (notification: JobNotification) => {
  const variant = getVariantForNotificationType(notification.type);
  
  toast({
    title: notification.title,
    description: notification.message,
    variant
  });
};

// Helper to get appropriate toast variant based on notification type
const getVariantForNotificationType = (type: string): 'default' | 'success' | 'warning' | 'destructive' | 'info' => {
  switch (type) {
    case 'status_change':
      return 'info';
    case 'deadline_approaching':
      return 'warning';
    case 'resource_assigned':
      return 'info';
    case 'cost_update':
      return 'info';
    case 'sla_violation':
      return 'destructive';
    case 'new_job':
      return 'success';
    default:
      return 'default';
  }
};

// Get unread notification count for a user
// Note: This function automatically filters out notifications for deleted jobs.
// See the comment on getUserNotifications for why we don't use a PostgREST embed.
export const getUnreadNotificationCount = async (userId: string): Promise<number> => {
  try {
    const { data, error } = await supabase
      .schema('common')
      .from('job_notifications')
      .select('id, job_id')
      .or(`user_id.eq.${userId},user_id.is.null`)
      .eq('is_read', false)
      .eq('is_dismissed', false);

    if (error) throw error;

    const notifications = (data || []) as Array<{ id: string; job_id: string | null }>;
    if (notifications.length === 0) return 0;

    const jobIds = Array.from(
      new Set(notifications.map(n => n.job_id).filter((id): id is string => !!id))
    );

    let deletedJobIds = new Set<string>();
    if (jobIds.length > 0) {
      try {
        const { data: jobRows, error: jobError } = await supabase
          .schema('neta_ops')
          .from('jobs')
          .select('id, deleted_at')
          .in('id', jobIds);

        if (!jobError && jobRows) {
          deletedJobIds = new Set(
            jobRows.filter((j: any) => j.deleted_at).map((j: any) => j.id)
          );
        }
      } catch {
        // Skip deletion filter on error
      }
    }

    return notifications.filter(n => !n.job_id || !deletedJobIds.has(n.job_id)).length;
  } catch (error) {
    console.error('Error getting unread notification count:', error);
    return 0;
  }
};
