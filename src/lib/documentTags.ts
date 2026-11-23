/**
 * Tags for the Documents cards on jobs and quotes (opportunities).
 * Stored as plain text, so adding one here needs no database change.
 * Shared values (drawing, spec, contract, misc) line up, so quote documents
 * read naturally when they show on the job.
 */
export interface DocumentTag {
  value: string;
  label: string;
}

export const JOB_DOCUMENT_TAGS: DocumentTag[] = [
  { value: "drawing", label: "Drawing" },
  { value: "spec", label: "Spec" },
  { value: "contract", label: "Contract" },
  { value: "agreement", label: "Agreement" },
  { value: "invoice", label: "Invoice" },
  { value: "misc", label: "Miscellaneous" },
];

export const QUOTE_DOCUMENT_TAGS: DocumentTag[] = [
  { value: "drawing", label: "Drawing" },
  { value: "spec", label: "Spec" },
  { value: "bid_docs", label: "Bid Docs" },
  { value: "proposal", label: "Proposal" },
  { value: "contract", label: "Contract / PO" },
  { value: "misc", label: "Miscellaneous" },
];

/** Every tag either card can show, job order first. */
export const ALL_DOCUMENT_TAGS: DocumentTag[] = [
  ...JOB_DOCUMENT_TAGS,
  ...QUOTE_DOCUMENT_TAGS.filter((q) => !JOB_DOCUMENT_TAGS.some((j) => j.value === q.value)),
];

export function documentTagLabel(value: string): string {
  return ALL_DOCUMENT_TAGS.find((t) => t.value === value)?.label ?? value;
}
