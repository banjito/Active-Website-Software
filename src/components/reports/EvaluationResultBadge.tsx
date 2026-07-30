import React from "react";
import type { EvaluationResult } from "../../lib/reportEvaluations";

const RESULT_CLASSES: Record<EvaluationResult, string> = {
  PASS: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  FAIL: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "LIMITED SERVICE":
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
};

interface EvaluationResultBadgeProps {
  result?: EvaluationResult | null;
  /** Rendered when the report has no evaluation recorded (or isn't a report). */
  fallback?: React.ReactNode;
  className?: string;
}

/** PASS / FAIL / LIMITED SERVICE badge shared by the report list views. */
export const EvaluationResultBadge: React.FC<EvaluationResultBadgeProps> = ({
  result,
  fallback = null,
  className = "",
}) => {
  if (!result) return <>{fallback}</>;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-none text-xs font-semibold ${RESULT_CLASSES[result]} ${className}`}
      title={`Equipment evaluation: ${result}`}
    >
      {result}
    </span>
  );
};

export default EvaluationResultBadge;
