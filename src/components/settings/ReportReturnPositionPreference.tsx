import React from "react";
import { Bookmark } from "lucide-react";
import { usePreference } from "@/hooks/useUserPreferences";
import {
  REPORT_RETURN_POSITION_DEFAULT,
  REPORT_RETURN_POSITION_PREF,
} from "@/lib/reportReturnPosition";

export const ReportReturnPositionPreference: React.FC = () => {
  const [enabled, setEnabled] = usePreference<boolean>(
    REPORT_RETURN_POSITION_PREF,
    REPORT_RETURN_POSITION_DEFAULT,
  );

  return (
    <div className="px-3 py-3 border-t border-neutral-200 dark:border-neutral-700">
      <label
        htmlFor="report-return-position"
        className="flex items-start gap-2 cursor-pointer"
      >
        <Bookmark className="h-4 w-4 mt-0.5 text-neutral-400 dark:text-brand shrink-0" />
        <span className="flex-1">
          <span className="block text-sm font-semibold text-neutral-900 dark:text-white">
            Return to where I left off
          </span>
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
            Leaving a report keeps your sections open and scrolls back to it.
          </span>
        </span>
        <input
          id="report-return-position"
          type="checkbox"
          checked={enabled !== false}
          onChange={(e) => setEnabled(e.target.checked, true)}
          className="mt-1 h-4 w-4 rounded-none accent-brand"
        />
      </label>
    </div>
  );
};
