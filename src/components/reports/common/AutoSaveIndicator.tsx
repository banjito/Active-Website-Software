import { CloudAlert, CloudSync } from "lucide-react";
import { useAutoSaveStatus } from "./autoSaveStatus";

interface AutoSaveIndicatorProps {
  isSaving?: boolean;
  className?: string;
}

export const AutoSaveIndicator = ({
  isSaving = false,
  className = "",
}: AutoSaveIndicatorProps) => {
  // A green "auto saving enabled" icon while saves are failing is exactly how
  // completed reports went missing, so the failure state wins over the rest.
  const status = useAutoSaveStatus();
  const failed = status.state === "error";

  const label = failed
    ? `Not saved: ${status.message || "could not reach the server"}`
    : isSaving
      ? "Auto-saving"
      : "Auto saving enabled";

  const Icon = failed ? CloudAlert : CloudSync;

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={`inline-flex items-center transition-colors ${
        failed
          ? "text-red-600 dark:text-red-400"
          : isSaving
            ? "text-neutral-400 opacity-60 animate-pulse"
            : "text-green-800 dark:text-green-200"
      } ${className}`}
    >
      <Icon className="h-6 w-6" aria-hidden="true" />
      {failed ? (
        <span className="ml-1 text-sm font-semibold">Not saved</span>
      ) : null}
    </span>
  );
};

export default AutoSaveIndicator;
