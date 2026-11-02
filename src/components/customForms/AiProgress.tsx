/**
 * Progress for an AI generation that can't report its own progress.
 *
 * Shows the steps (done, current, still to come), the time so far, and a bar.
 * Finished steps fill the bar for real; inside the current step the bar
 * creeps toward the step's end on a curve that slows down and never quite
 * gets there, so it always moves but never claims to be done before it is.
 */

import React, { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

export interface AiProgressStep {
  id: string;
  label: string;
  /** Rough expected seconds, to pace the bar within this step. */
  expectedSeconds: number;
}

export const AiProgress: React.FC<{
  steps: AiProgressStep[];
  /** Id of the step running now. */
  current: string;
  /** When the whole run started (ms). */
  startedAt: number;
  /** One line under the title, e.g. which report. */
  detail?: string;
}> = ({ steps, current, startedAt, detail }) => {
  const [now, setNow] = useState(Date.now());
  const [stepStartedAt, setStepStartedAt] = useState(Date.now());
  useEffect(() => setStepStartedAt(Date.now()), [current]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const index = Math.max(0, steps.findIndex((s) => s.id === current));
  const total = steps.reduce((sum, s) => sum + s.expectedSeconds, 0) || 1;
  const done = steps.slice(0, index).reduce((sum, s) => sum + s.expectedSeconds, 0);
  const step = steps[index];
  const inStep = Math.max(0, (now - stepStartedAt) / 1000);
  // 1 - e^(-t/T): about 63% of the step at its expected time, 95% at three times it.
  const fraction = step ? 1 - Math.exp(-inStep / Math.max(1, step.expectedSeconds)) : 0;
  const percent = Math.min(99, ((done + fraction * (step?.expectedSeconds ?? 0)) / total) * 100);
  const elapsed = Math.round((now - startedAt) / 1000);
  const slow = step && inStep > step.expectedSeconds * 2.5;

  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-neutral-900 dark:text-white">{step?.label ?? "Working"}…</span>
        <span className="tabular-nums text-xs text-neutral-500 dark:text-neutral-400">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </span>
      </div>
      {detail && <p className="-mt-2 text-xs text-neutral-500 dark:text-neutral-400 truncate">{detail}</p>}
      <div className="h-2 w-full bg-neutral-200 dark:bg-dark-200 rounded-none overflow-hidden">
        <div className="h-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${percent}%` }} />
      </div>
      <ol className="space-y-1">
        {steps.map((s, i) => (
          <li
            key={s.id}
            className={`flex items-center gap-2 text-xs ${
              i < index
                ? "text-neutral-500 dark:text-neutral-400"
                : i === index
                  ? "text-neutral-900 dark:text-white font-medium"
                  : "text-neutral-400 dark:text-neutral-500"
            }`}
          >
            {i < index ? (
              <Check className="w-3.5 h-3.5 text-green-600" />
            ) : i === index ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
            ) : (
              <span className="w-3.5 h-3.5 border border-neutral-300 dark:border-neutral-600 rounded-none" />
            )}
            {s.label}
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
        {slow
          ? "Still working: large reports take longer. You can leave this open; it will finish on its own."
          : "This usually takes under a minute or two. Please keep this window open."}
      </p>
    </div>
  );
};

export default AiProgress;
