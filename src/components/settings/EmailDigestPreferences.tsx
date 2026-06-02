import React, { useCallback, useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { toast } from '@/components/ui/toast';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_AUTOMATED_EMAILS,
  getUserNotificationPreferences,
  mergeNotificationPreferences,
  updateUserNotificationPreferences,
  type AutomatedEmailPreferences,
  type NotificationPreferences,
} from '@/services/notificationService';

interface EmailDigestPreferencesProps {
  userId: string;
  userEmail?: string;
}

const DIGEST_OPTIONS: {
  key: keyof AutomatedEmailPreferences;
  label: string;
  description: string;
}[] = [
  {
    key: 'dailyReview',
    label: 'Daily review digest',
    description: 'Reports ready for review (weekdays around 12:00 PM Central).',
  },
  {
    key: 'dailyReadyToBill',
    label: 'Daily ready-to-bill digest',
    description: 'Jobs waiting to be billed (around 8:00 AM Central).',
  },
  {
    key: 'weeklyReports',
    label: 'Weekly reports digest',
    description: 'PO summary and jobs status (Mondays around 8:00 AM Central).',
  },
];

export function EmailDigestPreferences({ userId, userEmail }: EmailDigestPreferencesProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [hasSavedRow, setHasSavedRow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    try {
      const { data: row } = await supabase
        .schema('common')
        .from('user_preferences')
        .select('notification_preferences')
        .eq('user_id', userId)
        .maybeSingle();

      setHasSavedRow(!!row);
      const prefs = await getUserNotificationPreferences(userId);
      setPreferences(prefs);
    } catch {
      toast({
        title: 'Could not load email settings',
        variant: 'destructive',
      });
      setPreferences(mergeNotificationPreferences(null));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const persistAutomatedEmails = async (automatedEmails: AutomatedEmailPreferences) => {
    if (!preferences) return;

    setSaving(true);
    const updated: NotificationPreferences = {
      ...preferences,
      automatedEmails,
    };

    const { success } = await updateUserNotificationPreferences(userId, updated);
    setSaving(false);

    if (success) {
      setPreferences(updated);
      setHasSavedRow(true);
      toast({ title: 'Email preferences saved' });
    } else {
      toast({
        title: 'Could not save email preferences',
        variant: 'destructive',
      });
    }
  };

  const handleToggle = (key: keyof AutomatedEmailPreferences, checked: boolean) => {
    if (!preferences || saving) return;
    const automatedEmails: AutomatedEmailPreferences = {
      ...DEFAULT_AUTOMATED_EMAILS,
      ...preferences.automatedEmails,
      [key]: checked,
    };
    void persistAutomatedEmails(automatedEmails);
  };

  const automated = preferences?.automatedEmails ?? DEFAULT_AUTOMATED_EMAILS;

  return (
    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-1">
        <Mail className="h-5 w-5 text-gray-400 dark:text-[#f26722]" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Email digests</h3>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 ml-7">
        Scheduled ampOS summary emails
        {userEmail ? (
          <>
            {' '}
            sent to <span className="font-medium text-gray-700 dark:text-gray-300">{userEmail}</span>
          </>
        ) : null}
        .
        {!hasSavedRow && !loading
          ? ' Adjust a toggle below to start or stop digests.'
          : ' Turn off any you do not want.'}
      </p>

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 ml-7">Loading…</p>
      ) : (
        <div className="space-y-3 ml-7">
          {DIGEST_OPTIONS.map(({ key, label, description }) => (
            <div key={key} className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 dark:text-white">{label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
              </div>
              <Switch
                checked={automated[key] !== false}
                onCheckedChange={(checked) => handleToggle(key, checked)}
                disabled={saving}
                checkedClassName="bg-[#f26722]"
                aria-label={label}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
