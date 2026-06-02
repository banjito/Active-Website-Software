export type PassFailBadgeVariant = 'pass' | 'fail' | 'limited';

/** Maps report status strings to print badge CSS class (pass / fail / limited). */
export function getPassFailBadgeClass(status: string | undefined | null): PassFailBadgeVariant {
  const normalized = String(status ?? 'PASS').trim().toUpperCase();
  if (normalized === 'FAIL') return 'fail';
  if (normalized === 'LIMITED SERVICE' || normalized === 'LIMITED_SERVICE') return 'limited';
  return 'pass';
}

/** Shared print CSS — use in report-level @media print blocks when needed. */
export const PASS_FAIL_BADGE_PRINT_CSS = `
  .pass-fail-status-box.pass {
    background-color: #22c55e !important;
    border-color: #16a34a !important;
    color: white !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .pass-fail-status-box.fail {
    background-color: #ef4444 !important;
    border-color: #dc2626 !important;
    color: white !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .pass-fail-status-box.limited {
    background-color: #eab308 !important;
    border-color: #ca8a04 !important;
    color: #111827 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
`;
