import React, { useEffect, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/toast";
import {
  getMissedTimeSettings,
  MissedTimeSettings as Settings,
  updateMissedTimeSettings,
} from "@/services/timeReviewService";

const dayLabel = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

// Payroll's controls for the morning "no time logged" email: the on/off switch and
// the company holidays it skips. The email stays off until crews leave Workforce.
const MissedTimeSettings: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null | undefined>(undefined);
  const [newHoliday, setNewHoliday] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setSettings(await getMissedTimeSettings());
    } catch (error: any) {
      console.error("[MissedTimeSettings] Load failed:", error);
      toast({ title: "Couldn't load missed-time settings", description: error?.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (open && settings === undefined) load();
  }, [open]);

  const save = async (changes: Partial<Settings>) => {
    if (!settings) return;
    // Show the change right away, then put the saved truth back if it fails
    setSettings({ ...settings, ...changes });
    setSaving(true);
    try {
      await updateMissedTimeSettings(changes);
    } catch (error: any) {
      console.error("[MissedTimeSettings] Save failed:", error);
      toast({ title: "Couldn't save", description: error?.message, variant: "destructive" });
      load();
    } finally {
      setSaving(false);
    }
  };

  const addHoliday = () => {
    if (!settings || !newHoliday || settings.holidays.includes(newHoliday)) return;
    save({ holidays: [...settings.holidays, newHoliday].sort() });
    setNewHoliday("");
  };

  const on = !!settings?.missed_time_emails;

  return (
    <div className="rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-neutral-900 dark:text-white"
        onClick={() => setOpen(!open)}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        Missed-time email
        <span className="font-normal text-neutral-500 dark:text-neutral-400">
          Each weekday morning, anyone with no time on their last work day gets a reminder.
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-neutral-200 px-4 py-4 text-sm dark:border-neutral-700">
          {settings === undefined ? (
            <p className="text-neutral-500 dark:text-neutral-400">Loading...</p>
          ) : settings === null ? (
            <p className="text-neutral-500 dark:text-neutral-400">
              Not set up yet. Run database/migrations/timestamp_03_missed_time.sql first.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-neutral-900 dark:text-white">
                    Email is {on ? "on" : "off"}
                  </div>
                  <p className="text-neutral-500 dark:text-neutral-400">
                    {on
                      ? "Reminders go out at about 7 AM Central. Monday checks Friday through Sunday."
                      : "Turn on the day crews stop using Workforce, so nobody on Workforce gets mailed."}
                  </p>
                </div>
                <Button
                  variant={on ? "outline" : "primary"}
                  size="sm"
                  isLoading={saving}
                  onClick={() => save({ missed_time_emails: !on })}
                >
                  {on ? "Turn off" : "Turn on"}
                </Button>
              </div>

              <div>
                <div className="font-medium text-neutral-900 dark:text-white">Holidays</div>
                <p className="mb-2 text-neutral-500 dark:text-neutral-400">
                  No reminders for these days. Approved time off and people's non-work days are skipped on their own.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    aria-label="Add a holiday"
                    className="form-input w-44 rounded-none"
                    value={newHoliday}
                    onChange={(e) => setNewHoliday(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addHoliday()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Plus className="h-4 w-4" />}
                    disabled={!newHoliday}
                    onClick={addHoliday}
                  >
                    Add
                  </Button>
                </div>
                {settings.holidays.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {settings.holidays.map((day) => (
                      <span
                        key={day}
                        className="inline-flex items-center gap-1 rounded-none border border-neutral-300 px-2 py-1 text-xs text-neutral-800 dark:border-neutral-600 dark:text-neutral-200"
                      >
                        {dayLabel(day)}
                        <button
                          type="button"
                          aria-label={`Remove ${dayLabel(day)}`}
                          className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                          onClick={() => save({ holidays: settings.holidays.filter((d) => d !== day) })}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MissedTimeSettings;
