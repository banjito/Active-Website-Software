import React, { useCallback, useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  DEFAULT_AUTOMATED_EMAILS,
  getUserNotificationPreferences,
  mergeNotificationPreferences,
  updateUserNotificationPreferences,
  type AutomatedEmailPreferences,
  type NotificationPreferences,
} from "@/services/notificationService";

interface EmailDigestPreferencesProps {
  userId: string;
  userEmail?: string;
  /** Tighter layout for profile settings sub-menu */
  compact?: boolean;
}

const DIGEST_OPTIONS: {
  key: keyof AutomatedEmailPreferences;
  label: string;
  description: string;
}[] = [
  {
    key: "dailyReview",
    label: "Daily review digest",
    description: "Reports ready for review (weekdays around 12:00 PM Central).",
  },
  {
    key: "dailyReadyToBill",
    label: "Daily ready-to-bill digest",
    description: "Jobs waiting to be billed (around 8:00 AM Central).",
  },
  {
    key: "weeklyReports",
    label: "Weekly reports digest",
    description: "PO summary and jobs status (Mondays around 8:00 AM Central).",
  },
];

export function EmailDigestPreferences({
  userId,
  userEmail,
  compact = false,
}: EmailDigestPreferencesProps) {
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null);
  const [hasSavedRow, setHasSavedRow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    try {
      const { data: row } = await supabase
        .schema("common")
        .from("user_preferences")
        .select("notification_preferences")
        .eq("user_id", userId)
        .maybeSingle();

      setHasSavedRow(!!row);
      const prefs = await getUserNotificationPreferences(userId);
      setPreferences(prefs);
    } catch {
      toast({
        title: "Could not load email settings",
        variant: "destructive",
      });
      setPreferences(mergeNotificationPreferences(null));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const persistAutomatedEmails = async (
    automatedEmails: AutomatedEmailPreferences,
  ) => {
    if (!preferences) return;

    setSaving(true);
    const updated: NotificationPreferences = {
      ...preferences,
      automatedEmails,
    };

    const { success } = await updateUserNotificationPreferences(
      userId,
      updated,
    );
    setSaving(false);

    if (success) {
      setPreferences(updated);
      setHasSavedRow(true);
      toast({ title: "Email preferences saved" });
    } else {
      toast({
        title: "Could not save email preferences",
        variant: "destructive",
      });
    }
  };

  const handleToggle = (
    key: keyof AutomatedEmailPreferences,
    checked: boolean,
  ) => {
    if (!preferences || saving) return;
    const automatedEmails: AutomatedEmailPreferences = {
      ...DEFAULT_AUTOMATED_EMAILS,
      ...preferences.automatedEmails,
      [key]: checked,
    };
    void persistAutomatedEmails(automatedEmails);
  };

  const automated = preferences?.automatedEmails ?? DEFAULT_AUTOMATED_EMAILS;

  const iconClass = compact ? "h-4 w-4" : "h-5 w-5";
  const inset = compact ? "px-3" : "px-4";
  const descPad = compact ? "" : "ml-7";

  return (
    <div
      className={`${inset} py-3 border-t border-neutral-200 dark:border-neutral-700`}
    >
      <div className={`flex items-center gap-2 mb-1 ${compact ? "" : ""}`}>
        <Mail
          className={`${iconClass} text-neutral-400 dark:text-brand shrink-0`}
        />
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Email digests
        </h3>
      </div>
      <p
        className={`text-xs text-neutral-500 dark:text-neutral-400 mb-3 ${descPad}`}
      >
        Scheduled ampOS summary emails
        {userEmail ? (
          <>
            {" "}
            to{" "}
            <span className="font-medium text-neutral-700 dark:text-neutral-300">
              {userEmail}
            </span>
          </>
        ) : null}
        .
        {!hasSavedRow && !loading
          ? " Adjust a toggle to start or stop."
          : " Turn off any you do not want."}
      </p>

      {loading ? (
        <div className={`flex justify-center py-6 ${descPad}`}>
          <LoadingSpinner size="md" />
        </div>
      ) : (
        <div className={`space-y-2.5 ${descPad}`}>
          {DIGEST_OPTIONS.map(({ key, label, description }) => (
            <div key={key} className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-neutral-900 dark:text-white">
                  {label}
                </p>
                {!compact && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {description}
                  </p>
                )}
              </div>
              <Switch
                checked={automated[key] !== false}
                onCheckedChange={(checked) => handleToggle(key, checked)}
                disabled={saving}
                checkedClassName="bg-brand"
                aria-label={label}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
