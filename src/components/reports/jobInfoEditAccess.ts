import { useAuth } from "@/lib/AuthContext";
import { canApproveReports } from "@/lib/roles";

/**
 * Approvers keep write access to the job information block after a report is
 * approved or sent. Everything below that block stays locked for everyone.
 */
export function useCanEditLockedJobInfo(): boolean {
  const { user } = useAuth();
  return canApproveReports(
    (user?.user_metadata?.role as string) || "",
    user?.email,
  );
}

/** Marks a field the lock enforcement should leave alone. */
export const JOB_INFO_EDITABLE_ATTR = "data-job-info-editable";

/** Overrides the lock's pointer-events/cursor rules for the marked fields. */
export const JOB_INFO_EDITABLE_CSS = `
  [${JOB_INFO_EDITABLE_ATTR}="true"] {
    pointer-events: auto !important;
    cursor: auto !important;
    opacity: 1 !important;
  }
`;

const normalize = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .replace(/[*:()]/g, "")
    .trim()
    .replace(/\.$/, "")
    .toLowerCase();

/**
 * Labels that appear in a job information block. Used only for report types
 * whose block carries no `job-info-onscreen` class, where the section has to be
 * located by its heading and a stray field could otherwise slip through.
 */
const JOB_INFO_LABELS = new Set([
  "job #",
  "job number",
  "job no",
  "customer",
  "customer name",
  "address",
  "customer address",
  "location",
  "job location",
  "user",
  "user name",
  "date",
  "technicians",
  "technician",
  "substation",
  "equipment location",
  "eqpt. location",
  "eqpt location",
  "identifier",
  "eqpt. identifier",
  "eqpt identifier",
  "equipment identifier",
  "breaker identifier",
  "circuit / cell no",
  "circuit/cell no",
  "temperature",
  "temp",
  "temp. °f",
  "temp °f",
  "°f",
  "temp. °c",
  "temp °c",
  "°c",
  "tcf",
  "celsius",
  "fahrenheit",
  "humidity",
  "humidity %",
  "%",
]);

const FIELD_SELECTOR = "input, select, textarea";

/** Label text sitting next to a field, however the report happens to wire it. */
const labelFor = (field: Element): string => {
  const labels = (field as HTMLInputElement).labels;
  if (labels && labels.length > 0) {
    return normalize(labels[0].textContent || "");
  }
  const wrapper = field.parentElement?.closest("div");
  return normalize(wrapper?.querySelector("label")?.textContent || "");
};

/**
 * The fields of the job information block(s) inside `root`.
 *
 * Most report types tag the block with `job-info-onscreen`. The rest are found
 * through their "Job Information" heading, and there the known job info labels
 * decide what counts so nothing from the test sheet below is picked up.
 */
export function collectJobInfoFields(root: ParentNode): HTMLElement[] {
  const fields: HTMLElement[] = [];

  root.querySelectorAll(".job-info-onscreen").forEach((block) => {
    block
      .querySelectorAll(FIELD_SELECTOR)
      .forEach((field) => fields.push(field as HTMLElement));
  });

  root.querySelectorAll("h1, h2, h3, h4").forEach((heading) => {
    if (normalize(heading.textContent || "") !== "job information") return;
    const section = heading.parentElement;
    if (!section || section.querySelector(".job-info-onscreen")) return;
    section.querySelectorAll(FIELD_SELECTOR).forEach((field) => {
      if (JOB_INFO_LABELS.has(labelFor(field))) fields.push(field as HTMLElement);
    });
  });

  return fields;
}

/**
 * Hands a field back to React: drops the lock's disabled/pointer-events and
 * leaves `readOnly` alone, since that is the report's own edit-mode flag.
 */
export function releaseJobInfoField(field: HTMLElement): void {
  if (field.getAttribute(JOB_INFO_EDITABLE_ATTR) !== "true") {
    field.setAttribute(JOB_INFO_EDITABLE_ATTR, "true");
  }
  const input = field as HTMLInputElement | HTMLSelectElement;
  if (input.disabled) input.disabled = false;
  if (field.style.pointerEvents) field.style.pointerEvents = "";
}

/**
 * Buttons the lock hides. Save and Edit stay available to approvers so job
 * info corrections can be written back; anything that adds, removes or
 * re-submits test data stays hidden for everyone.
 */
export function isSaveOrEditButtonLabel(text: string): boolean {
  return (
    text === "edit report" ||
    text === "save report" ||
    text === "save" ||
    text === "save & close"
  );
}
