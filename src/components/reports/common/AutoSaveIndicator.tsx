import { CloudSync } from "lucide-react";

interface AutoSaveIndicatorProps {
  isSaving?: boolean;
  className?: string;
}

export const AutoSaveIndicator = ({
  isSaving = false,
  className = "",
}: AutoSaveIndicatorProps) => {
  const label = isSaving ? "Auto-saving" : "Auto saving enabled";

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={`inline-flex items-center transition-colors ${
        isSaving
          ? "text-zinc-400 opacity-60 animate-pulse"
          : "text-green-800 dark:text-green-200"
      } ${className}`}
    >
      <CloudSync className="h-6 w-6" aria-hidden="true" />
    </span>
  );
};

export default AutoSaveIndicator;
