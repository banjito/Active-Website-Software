import type { ReactNode } from "react";
import { confirmDialog } from "@/components/ui/confirmDialog";

/**
 * Trial layout for the opportunity page, behind a Super Admin toggle.
 *
 * Layout only: OpportunityDetail passes in the real data, the real save
 * handlers, and the real estimates / documents / RFIs / notes blocks. To drop
 * the trial, delete this file and the "preview" lines in OpportunityDetail.
 */

export const OPPORTUNITY_TYPES: { value: string; label: string }[] = [
  { value: "large_acceptance", label: "Large Acceptance Project" },
  { value: "small_acceptance", label: "Small Acceptance Project" },
  { value: "maintenance", label: "Maintenance Project" },
  { value: "engineering", label: "Engineering" },
  { value: "time_materials", label: "Time & Materials (T&M)" },
  { value: "other", label: "Other" },
];

export const DOCUMENTS_STAGES = [
  "Budgetary",
  "Not available",
  "Design Development",
  "Issue for Proposal",
  "Issue for Construction",
  "Post Construction",
  "30%",
  "60%",
  "90%",
  "95%",
];

const STATUSES: { value: string; label: string }[] = [
  { value: "awareness", label: "Awareness" },
  { value: "interest", label: "Interest" },
  { value: "quote", label: "Quote" },
  { value: "decision", label: "Decision" },
  { value: "decision - forecasted win", label: "Decision - Forecasted Win" },
  { value: "decision - forecast lose", label: "Decision - Forecast Lose" },
  { value: "awarded", label: "Awarded" },
  { value: "lost", label: "Lost" },
  { value: "no quote", label: "No Quote" },
];
const STAGES = ["Awareness", "Interest", "Quote", "Decision", "Awarded"];

const APPROVALS: { value: string; label: string }[] = [
  { value: "", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "ready_for_review", label: "Ready for Review" },
  { value: "approved_to_send", label: "Approved to Send" },
  { value: "sent", label: "Sent" },
];

const card =
  "border border-black/10 bg-white dark:border-dark-300 dark:bg-dark-150";
const label =
  "text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400";
const muted = "text-neutral-500 dark:text-neutral-400";
export const previewSelectClass =
  "rounded-none border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60 dark:border-neutral-600 dark:bg-dark-100 dark:text-white";

// ── Title (sits beside the page's own action buttons) ─────────────────────

export function OpportunityPreviewTitle({
  quoteNumber,
  title,
  customerLine,
  description,
  badges,
}: {
  quoteNumber: ReactNode;
  title: string;
  customerLine: string;
  description?: string | null;
  badges: string[];
}) {
  return (
    <div className="min-w-0 flex-1 basis-[420px] space-y-1.5">
      <div className="text-sm font-semibold text-brand">Quote #{quoteNumber}</div>
      <h2 className="text-2xl font-semibold leading-tight text-neutral-900 dark:text-white">
        {title}
      </h2>
      {customerLine && (
        <div className="text-[15px] text-neutral-700 dark:text-neutral-300">{customerLine}</div>
      )}
      {description && (
        <p className={`max-w-3xl whitespace-pre-line text-sm ${muted}`}>{description}</p>
      )}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {badges.map((b) => (
            <span
              key={b}
              className="border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              {b}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

/** Progress strip. Display only, so a stray click can't change a real quote. */
function Steps({ names, current }: { names: string[]; current: number }) {
  return (
    <ol className="grid grid-cols-5 gap-1">
      {names.map((name, i) => (
        <li key={name} aria-current={i === current ? "step" : undefined} className="min-w-0 space-y-1.5">
          <div
            className={`h-1.5 ${
              i === current
                ? "bg-brand"
                : i < current
                  ? "bg-brand/40"
                  : "bg-neutral-200 dark:bg-neutral-700"
            }`}
          />
          <div
            className={`text-xs leading-snug ${
              i === current
                ? "font-semibold text-neutral-900 dark:text-white"
                : i < current
                  ? "text-neutral-700 dark:text-neutral-300"
                  : muted
            }`}
          >
            {name}
          </div>
        </li>
      ))}
    </ol>
  );
}

function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={card}>
      <h3 className="px-5 pb-1 pt-4 text-base font-semibold text-neutral-900 dark:text-white">{title}</h3>
      <div className="px-5 pb-4">{children}</div>
    </div>
  );
}

function Rows({ rows }: { rows: PreviewRow[] }) {
  return (
    <dl className="divide-y divide-neutral-100 dark:divide-neutral-700/60">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 py-2 text-sm">
          <dt className={`shrink-0 ${muted}`}>{r.label}</dt>
          <dd className="min-w-0 break-words text-right font-medium text-neutral-900 dark:text-white">
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── Page body ─────────────────────────────────────────────────────────────

export interface PreviewRow {
  label: string;
  value: ReactNode;
}

export interface PreviewStat {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "warn" | "late";
  /** Long text (like a period of performance) renders smaller. */
  small?: boolean;
  onClick?: () => void;
  title?: string;
}

export interface PreviewDate {
  label: string;
  value: ReactNode;
  state: "done" | "next" | "todo";
  extra?: ReactNode;
}

interface Props {
  stats: PreviewStat[];
  status: string;
  onStatusChange: (status: string) => void;
  /** Why it was lost, when it was. */
  lostNote?: ReactNode;
  /** Change order quotes: their status is set on the job, not here. */
  changeOrderLabel?: string | null;
  approval: string | null;
  approvalSaving: boolean;
  onApprovalChange: (approval: string) => void;
  approvalHint?: ReactNode;
  details: PreviewRow[];
  dates: PreviewDate[];
  people: PreviewRow[];
  inBidTotal: boolean;
  onToggleBidTotal: () => void;
  job: ReactNode;
  notesOnFile?: string | null;
  estimates: ReactNode;
  documents: ReactNode;
  rfis: ReactNode;
  notes: ReactNode;
}

export default function OpportunityPagePreview(p: Props) {
  const isLost = p.status === "lost";
  const isNoQuote = p.status === "no quote";
  const stage = p.status.startsWith("decision")
    ? 3
    : STAGES.findIndex((s) => s.toLowerCase() === p.status);

  const approvalValue = p.approval === "no quote" ? "no_quote" : (p.approval ?? "");
  const approvalStep = APPROVALS.findIndex((a) => a.value === approvalValue);

  const markNoQuote = async () => {
    const ok = await confirmDialog({
      title: "Mark this opportunity No Quote?",
      description: "Its status changes to No Quote. You can change it back any time.",
      confirmLabel: "Mark No Quote",
    });
    if (ok) p.onStatusChange("no quote");
  };

  return (
    <div className="space-y-5 bg-neutral-50 p-4 sm:p-6 dark:bg-dark-background">
      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {p.stats.map((s) => {
          const body = (
            <>
              <span className={label}>{s.label}</span>
              <span
                className={`block font-semibold tabular-nums ${s.small ? "line-clamp-2 text-base leading-snug" : "text-2xl leading-tight"} ${
                  s.tone === "late"
                    ? "text-red-700 dark:text-red-400"
                    : s.tone === "warn"
                      ? "text-orange-700 dark:text-orange-400"
                      : "text-neutral-900 dark:text-white"
                }`}
              >
                {s.value}
              </span>
              {s.note && <span className={`block text-xs ${muted}`}>{s.note}</span>}
            </>
          );
          return s.onClick ? (
            <button
              key={s.label}
              type="button"
              onClick={s.onClick}
              title={s.title}
              className={`${card} space-y-1.5 px-4 py-3 text-left transition-colors hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
            >
              {body}
            </button>
          ) : (
            <div key={s.label} title={s.title} className={`${card} space-y-1.5 px-4 py-3`}>
              {body}
            </div>
          );
        })}
      </div>

      {/* Where it stands */}
      <div className={`${card} grid divide-y divide-neutral-200 md:grid-cols-2 md:divide-x md:divide-y-0 dark:divide-neutral-700`}>
        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className={label}>Sales stage</span>
            {!p.changeOrderLabel && (
              <div className="flex items-center gap-3 text-sm">
                {!isLost && (
                  <button type="button" onClick={() => p.onStatusChange("lost")} className="text-brand hover:underline">
                    Mark lost
                  </button>
                )}
                {!isNoQuote && (
                  <button type="button" onClick={() => void markNoQuote()} className="text-brand hover:underline">
                    No quote
                  </button>
                )}
                <select
                  value={p.status}
                  onChange={(e) => p.onStatusChange(e.target.value)}
                  aria-label="Sales stage"
                  className={previewSelectClass}
                >
                  {!STATUSES.some((s) => s.value === p.status) && (
                    <option value={p.status}>{p.status}</option>
                  )}
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {p.changeOrderLabel ? (
            <p className="text-sm text-neutral-900 dark:text-white">
              {p.changeOrderLabel}
              <span className={`block text-xs ${muted}`}>Set on the job's Change Orders card.</span>
            </p>
          ) : (
            <>
              <Steps names={STAGES} current={isLost || isNoQuote ? -1 : stage} />
              {(isLost || isNoQuote) && (
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  {isLost ? "Lost" : "No Quote"}
                </p>
              )}
              {p.lostNote}
            </>
          )}
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className={label}>Estimate approval</span>
            <div className="flex items-center gap-2 text-sm">
              {p.approvalSaving && <span className={`text-xs ${muted}`}>Saving...</span>}
              <select
                value={approvalValue}
                onChange={(e) => p.onApprovalChange(e.target.value)}
                disabled={p.approvalSaving}
                aria-label="Estimate approval"
                className={previewSelectClass}
              >
                {approvalValue !== "no_quote" && approvalStep < 0 && (
                  <option value={approvalValue}>{approvalValue.replace(/_/g, " ")}</option>
                )}
                {APPROVALS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
                <option value="no_quote">No Quote</option>
              </select>
            </div>
          </div>
          <Steps names={APPROVALS.map((a) => a.label)} current={approvalStep} />
          {approvalValue === "no_quote" && (
            <p className="text-sm font-medium text-red-700 dark:text-red-400">No Quote</p>
          )}
          {p.approvalHint}
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <div className={card}>{p.estimates}</div>
          {p.documents}
          {p.rfis}
          {p.notes}
        </div>

        <div className="min-w-0 space-y-5">
          <SideCard title="Details">
            <Rows rows={p.details} />
          </SideCard>

          <SideCard title="Key dates">
            <ol className="pt-2">
              {p.dates.map((d, i) => (
                <li key={d.label} className="flex gap-3">
                  <div className="flex w-2.5 flex-col items-center" aria-hidden="true">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 border-2 ${
                        d.state === "done"
                          ? "border-neutral-800 bg-neutral-800 dark:border-neutral-200 dark:bg-neutral-200"
                          : d.state === "next"
                            ? "border-brand bg-brand"
                            : "border-neutral-300 bg-transparent dark:border-neutral-600"
                      }`}
                    />
                    {i < p.dates.length - 1 && (
                      <span className="w-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className={muted}>{d.label}</span>
                      <span
                        className={`text-right ${
                          d.state === "todo" ? muted : "font-medium text-neutral-900 dark:text-white"
                        }`}
                      >
                        {d.value}
                      </span>
                    </div>
                    {d.extra}
                  </div>
                </li>
              ))}
            </ol>
          </SideCard>

          <SideCard title="People">
            <Rows rows={p.people} />
          </SideCard>

          <div className={`${card} flex items-start justify-between gap-4 px-5 py-4`}>
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">Include in weekly bid total</p>
              <p className={`text-xs ${muted}`}>
                Turn off to leave this quote out of the Sales Dashboard total.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={p.inBidTotal}
              aria-label="Include in weekly bid total"
              onClick={p.onToggleBidTotal}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-none transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:focus:ring-offset-dark-150 ${
                p.inBidTotal ? "bg-brand" : "bg-neutral-300 dark:bg-neutral-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-none bg-white transition-transform ${
                  p.inBidTotal ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <SideCard title="Job">
            <div className="space-y-2 pt-1 text-sm text-neutral-700 dark:text-neutral-300">{p.job}</div>
          </SideCard>

          {p.notesOnFile && (
            <SideCard title="Notes on file">
              <p className="whitespace-pre-line pt-1 text-sm text-neutral-700 dark:text-neutral-300">
                {p.notesOnFile}
              </p>
            </SideCard>
          )}
        </div>
      </div>
    </div>
  );
}
