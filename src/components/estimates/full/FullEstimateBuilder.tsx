import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { describeSupabaseError, withWriteRetry } from "@/lib/supabaseRetry";
import { getEstimatingPresets } from "@/services/estimatingPresetsService";
import { Button } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { toast } from "@/components/ui/toast";
import { fmtMoney } from "../estimateFieldKit";
import {
  FULL_STEPS,
  type FullStepKey,
  createFullEstimateData,
  getEstimatePrice,
  getStepIssues,
  parseEstimateData,
  recalculateFullEstimate,
} from "./fullEstimateData";
import {
  JobDetailsStep,
  NonSovStep,
  PricingStep,
  SovStep,
  SummaryStep,
  TravelStep,
} from "./FullEstimateSteps";

interface FullEstimateBuilderProps {
  opportunityId: string;
  /** Existing saved estimate row. Omit to create a new one. */
  estimate?: { id: string; data: any; status?: string | null } | null;
  /** Runs after every save, with the saved row. */
  onSaved?: (row: any) => void;
  /** Shown as Close. Receives the saved row, if there is one. */
  onClose?: (row: any | null) => void;
  /** Shown on Summary once the estimate is saved. */
  onGenerateLetter?: () => void;
}

async function fetchJobDefaults(opportunityId: string) {
  const { data: opp, error } = await supabase
    .schema("business")
    .from("opportunities")
    .select("title, description, customer_id")
    .eq("id", opportunityId)
    .single();
  if (error) throw error;

  let customer: any = null;
  if (opp?.customer_id) {
    const { data: found } = await supabase
      .schema("common")
      .from("customers")
      .select("name, company_name, address")
      .eq("id", opp.customer_id)
      .maybeSingle();
    customer = found;
  }

  return {
    title: opp?.title || "",
    client: customer?.company_name || customer?.name || "",
    jobDescription: opp?.description || "",
    location: customer?.address || "",
  };
}

async function nextQuoteNumber(opportunityId: string) {
  const { data: existing } = await supabase
    .schema("business")
    .from("estimates")
    .select("quote_number")
    .eq("opportunity_id", opportunityId);
  const versions = (existing || []).map((q: any) => {
    const m = String(q.quote_number || "").match(/v(\d+)$/);
    return m ? parseInt(m[1]) : 0;
  });
  return `v${Math.max(0, ...versions) + 1}`;
}

export default function FullEstimateBuilder({
  opportunityId,
  estimate,
  onSaved,
  onClose,
  onGenerateLetter,
}: FullEstimateBuilderProps) {
  const { user } = useAuth();
  const [data, setData] = useState<any>(() =>
    estimate ? recalculateFullEstimate(parseEstimateData(estimate.data)) : null,
  );
  const [step, setStep] = useState<FullStepKey>(
    () => parseEstimateData(estimate?.data)?.builderStep || "job",
  );
  const [saveState, setSaveState] = useState<{
    kind: "idle" | "saved" | "error";
    at?: Date;
  }>({ kind: "idle" });

  const rowIdRef = useRef<string | null>(estimate?.id ?? null);
  const rowRef = useRef<any>(estimate ?? null);
  const latestRef = useRef<any>(data);
  const dirtyRef = useRef(false);
  const errorShownRef = useRef(false);
  const savePromiseRef = useRef<Promise<any> | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    if (estimate) return;
    let cancelled = false;
    (async () => {
      try {
        const [presets, job] = await Promise.all([
          getEstimatingPresets().catch(() => null),
          fetchJobDefaults(opportunityId),
        ]);
        if (cancelled) return;
        const fresh = recalculateFullEstimate(
          createFullEstimateData(presets, job),
        );
        latestRef.current = fresh;
        setData(fresh);
      } catch (err: any) {
        console.error("Error starting full estimate:", err);
        toast({
          title: "Could not start the estimate",
          description: describeSupabaseError(err),
          variant: "destructive",
          persistent: true,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only runs once, for a new estimate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeRow = async (snapshot: any) => {
    const payload = {
      data: JSON.stringify(snapshot),
      travel_data: JSON.stringify(snapshot.travel_data || {}),
    };
    if (rowIdRef.current) {
      const id = rowIdRef.current;
      return withWriteRetry(
        () =>
          supabase
            .schema("business")
            .from("estimates")
            .update(payload)
            .eq("id", id)
            .select()
            .single(),
        { label: "full estimate save" },
      );
    }
    const quote_number = await nextQuoteNumber(opportunityId);
    return withWriteRetry(
      () =>
        supabase
          .schema("business")
          .from("estimates")
          .insert({
            opportunity_id: opportunityId,
            ...payload,
            quote_number,
            user_id: user?.id,
            status: "in_progress",
          })
          .select()
          .single(),
      { label: "full estimate create" },
    );
  };

  // One save at a time, so a new row can only ever be created once. Edits made
  // during a save go out in the next pass of the loop.
  const saveNow = (): Promise<any> => {
    if (!savePromiseRef.current) {
      savePromiseRef.current = (async () => {
        try {
          let row: any = null;
          do {
            dirtyRef.current = false;
            const { data: saved, error } = await writeRow(latestRef.current);
            if (error) throw error;
            row = saved;
            rowIdRef.current = saved.id;
            rowRef.current = saved;
          } while (dirtyRef.current);
          errorShownRef.current = false;
          setSaveState({ kind: "saved", at: new Date() });
          onSavedRef.current?.(row);
          return row;
        } catch (err: any) {
          console.error("Error saving full estimate:", err);
          dirtyRef.current = true;
          setSaveState({ kind: "error" });
          if (!errorShownRef.current) {
            errorShownRef.current = true;
            toast({
              title: "Failed to save estimate",
              description: describeSupabaseError(err),
              variant: "destructive",
              persistent: true,
            });
          }
          return null;
        } finally {
          savePromiseRef.current = null;
        }
      })();
    }
    return savePromiseRef.current;
  };

  const update = (change: (prev: any) => any) => {
    dirtyRef.current = true;
    latestRef.current = recalculateFullEstimate(change(latestRef.current));
    setData(latestRef.current);
  };

  // Autosave only ever updates a row that exists. The row is created on purpose
  // by the first Next or Save.
  useEffect(() => {
    if (!dirtyRef.current || !rowIdRef.current) return;
    const timer = setTimeout(() => void saveNow(), 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(
    () => () => {
      if (dirtyRef.current && rowIdRef.current) void saveNow();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const stepIndex = FULL_STEPS.findIndex((s) => s.key === step);
  const firstBlocked = useMemo(() => {
    if (!data) return 0;
    const index = FULL_STEPS.findIndex(
      (s) => getStepIssues(s.key, data).length > 0,
    );
    return index < 0 ? FULL_STEPS.length - 1 : index;
  }, [data]);

  if (!data) {
    return (
      <div className="py-16 text-center text-sm text-neutral-500 dark:text-dark-500">
        Loading estimate...
      </div>
    );
  }

  const issues = getStepIssues(step, data);
  const price = getEstimatePrice(data);

  const goTo = async (key: FullStepKey) => {
    if (key === step) return;
    if (!rowIdRef.current && !(await saveNow())) return;
    update((prev) => ({ ...prev, builderStep: key }));
    setStep(key);
  };

  const handleClose = async () => {
    if (!rowIdRef.current && dirtyRef.current) {
      const ok = await confirmDialog({
        title: "Discard this estimate?",
        description: "It has not been saved yet.",
        confirmLabel: "Discard",
      });
      if (!ok) return;
      onClose?.(null);
      return;
    }
    const row = dirtyRef.current ? await saveNow() : rowRef.current;
    if (dirtyRef.current) return;
    if (row) {
      window.dispatchEvent(
        new CustomEvent("estimateSaved", {
          detail: { opportunityId, estimateId: row.id },
        }),
      );
    }
    onClose?.(row);
  };

  const stepProps = { data, update };

  return (
    <div className="text-left text-neutral-900 dark:text-dark-900">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-xs px-2 py-1 rounded-none bg-brand/10 text-brand font-medium">
          Full Estimate
        </span>
        <span className="text-sm font-semibold truncate">
          {data.title || "Untitled estimate"}
        </span>
        <span className="ml-auto text-xs text-neutral-500 dark:text-dark-500">
          {saveState.kind === "error"
            ? "Not saved"
            : saveState.kind === "saved"
              ? `Saved ${saveState.at?.toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : ""}
        </span>
        {onClose && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<X size={14} />}
            onClick={handleClose}
          >
            Close
          </Button>
        )}
      </div>

      <div className="grid grid-cols-6 border border-neutral-200 dark:border-dark-200 mb-4">
        {FULL_STEPS.map((s, i) => {
          const isCurrent = s.key === step;
          const isDone = i < stepIndex;
          const isOpen = i <= firstBlocked;
          return (
            <button
              key={s.key}
              type="button"
              disabled={!isOpen}
              title={isOpen ? undefined : "Finish the steps before this one"}
              onClick={() => void goTo(s.key)}
              className={`flex items-center gap-2 px-3 py-2 text-left text-xs border-r last:border-r-0 border-neutral-200 dark:border-dark-200 disabled:cursor-not-allowed ${
                isCurrent
                  ? "font-semibold text-neutral-900 dark:text-white shadow-[inset_0_-3px_0_var(--brand)]"
                  : isOpen
                    ? "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-dark-100"
                    : "text-neutral-400 dark:text-neutral-500"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center border text-[11px] ${
                  isDone
                    ? "bg-neutral-900 border-neutral-900 text-white dark:bg-white dark:border-white dark:text-neutral-900"
                    : isCurrent
                      ? "border-brand text-brand"
                      : "border-neutral-300 dark:border-dark-300"
                }`}
              >
                {isDone ? <Check size={12} /> : i + 1}
              </span>
              <span className="truncate">{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-[50vh] pb-4">
        {step === "job" && <JobDetailsStep {...stepProps} />}
        {step === "sov" && <SovStep {...stepProps} />}
        {step === "nonSov" && <NonSovStep {...stepProps} />}
        {step === "travel" && <TravelStep {...stepProps} />}
        {step === "pricing" && <PricingStep {...stepProps} />}
        {step === "summary" && (
          <SummaryStep
            {...stepProps}
            opportunityId={opportunityId}
            currentId={rowIdRef.current}
            onGenerateLetter={
              onGenerateLetter
                ? async () => {
                    if (await saveNow()) onGenerateLetter();
                  }
                : undefined
            }
          />
        )}
      </div>

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-x-8 gap-y-2 border-t-2 border-brand bg-white dark:bg-dark-150 px-4 py-2 print:hidden">
        {[
          { label: "FINAL (M-F)", value: fmtMoney(price.finalValue) },
          {
            label: "Total hours",
            value: (Number(data.hoursSummary.totalHours) || 0).toFixed(1),
          },
          {
            label: "Days onsite",
            value: (Number(data.hoursSummary.daysOnsite) || 0).toFixed(1),
          },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-dark-500">
              {label}
            </div>
            <div className="text-lg font-bold tabular-nums">{value}</div>
          </div>
        ))}
        {issues.length > 0 && (
          <div className="text-xs text-amber-700 dark:text-amber-300 max-w-sm">
            Still needed: {issues.join(", ")}
          </div>
        )}
        <div className="ml-auto flex gap-2">
          {stepIndex > 0 && (
            <Button
              variant="outline"
              leftIcon={<ArrowLeft size={16} />}
              onClick={() => void goTo(FULL_STEPS[stepIndex - 1].key)}
            >
              Back
            </Button>
          )}
          {stepIndex < FULL_STEPS.length - 1 && (
            <Button
              rightIcon={<ArrowRight size={16} />}
              disabled={issues.length > 0}
              onClick={() => void goTo(FULL_STEPS[stepIndex + 1].key)}
            >
              Next: {FULL_STEPS[stepIndex + 1].label}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
