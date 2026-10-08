import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { getTimePeople, TimePerson, updateTimePerson } from "@/services/timeReviewService";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

// Payroll sets each person's start time and work days. The phone rings 5 minutes
// after the start time if they haven't clocked in.
const TimeClockSettings: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<TimePerson[] | null>(null);

  const load = async () => {
    try {
      setPeople(await getTimePeople());
    } catch (error: any) {
      console.error("[TimeClockSettings] Load failed:", error);
      toast({ title: "Couldn't load alarm times", description: error?.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (open && !people) load();
  }, [open]);

  const save = async (person: TimePerson, changes: { start_time?: string | null; work_days?: number[] }) => {
    // Show the change right away, then put the saved truth back if it fails
    setPeople((list) => (list ?? []).map((p) => (p.profile_id === person.profile_id ? { ...p, ...changes } : p)));
    try {
      await updateTimePerson(person.profile_id, changes);
    } catch (error: any) {
      console.error("[TimeClockSettings] Save failed:", error);
      toast({ title: "Couldn't save", description: error?.message, variant: "destructive" });
      load();
    }
  };

  const toggleDay = (person: TimePerson, day: number) => {
    const days = person.work_days.includes(day)
      ? person.work_days.filter((d) => d !== day)
      : [...person.work_days, day].sort();
    save(person, { work_days: days });
  };

  return (
    <div className="rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-neutral-900 dark:text-white"
        onClick={() => setOpen(!open)}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        Alarm times
        <span className="font-normal text-neutral-500 dark:text-neutral-400">
          The phone rings 5 minutes after start time if they haven't clocked in.
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-neutral-200 dark:border-neutral-700">
          {!people ? (
            <p className="px-4 py-4 text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Person</th>
                  <th className="px-4 py-3">Start time</th>
                  <th className="px-4 py-3">Work days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {people.map((person) => (
                  <tr key={person.profile_id} className="text-neutral-900 dark:text-neutral-100">
                    <td className="px-4 py-2 font-medium">{person.full_name || "No name"}</td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        aria-label={`Start time for ${person.full_name || "this person"}`}
                        className="form-input w-36 rounded-none"
                        // Saved when the box is left, not on every keystroke
                        key={`${person.profile_id}-${person.start_time ?? ""}`}
                        defaultValue={person.start_time?.slice(0, 5) ?? ""}
                        onBlur={(e) => {
                          const next = e.target.value || null;
                          if (next !== (person.start_time?.slice(0, 5) ?? null)) save(person, { start_time: next });
                        }}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        {DAY_LETTERS.map((letter, day) => {
                          const on = person.work_days.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              aria-pressed={on}
                              className={`h-8 w-8 rounded-none border text-xs font-medium ${
                                on
                                  ? "border-brand bg-brand text-white"
                                  : "border-neutral-300 text-neutral-500 dark:border-neutral-600 dark:text-neutral-400"
                              }`}
                              onClick={() => toggleDay(person, day)}
                            >
                              {letter}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default TimeClockSettings;
