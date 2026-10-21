import React from "react";
import { Briefcase } from "lucide-react";
import { usePreference } from "@/hooks/useUserPreferences";
import {
  JOB_DEFAULT_TAB_OPTIONS,
  JOB_DEFAULT_TAB_PREF,
  resolveJobDefaultTab,
} from "@/lib/jobDefaultTab";

interface JobDefaultTabPreferenceProps {
  isAdmin: boolean;
}

export const JobDefaultTabPreference: React.FC<
  JobDefaultTabPreferenceProps
> = ({ isAdmin }) => {
  const [savedTab, setSavedTab] = usePreference<string | null>(
    JOB_DEFAULT_TAB_PREF,
    null,
  );
  const options = JOB_DEFAULT_TAB_OPTIONS.filter(
    (option) => isAdmin || !option.adminOnly,
  );

  return (
    <div className="px-3 py-3 border-t border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center gap-2 mb-1">
        <Briefcase className="h-4 w-4 text-neutral-400 dark:text-brand shrink-0" />
        <label
          htmlFor="job-default-tab"
          className="text-sm font-semibold text-neutral-900 dark:text-white"
        >
          Open jobs to
        </label>
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
        The tab you land on when you open a job.
      </p>
      <select
        id="job-default-tab"
        value={resolveJobDefaultTab(savedTab, isAdmin)}
        onChange={(e) => setSavedTab(e.target.value, true)}
        className="w-full rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-100 px-2 py-1.5 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand"
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};
