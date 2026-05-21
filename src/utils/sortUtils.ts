const LOCALE_COMPARE_OPTIONS: Intl.CollatorOptions = {
  sensitivity: 'base',
  numeric: true,
};

/** Alphanumeric sort (e.g. OPT-1A before OPT-10A). */
export function compareAlphanumericLabels(a: string, b: string): number {
  return a.localeCompare(b, undefined, LOCALE_COMPARE_OPTIONS);
}

/**
 * Sort linked-asset / report folder labels (substation names).
 * Imported first, Other last, otherwise natural alphanumeric order.
 */
export function compareLinkedAssetFolderLabels(a: string, b: string): number {
  if (a === 'Imported') return -1;
  if (b === 'Imported') return 1;
  if (a === 'Other' && b !== 'Other') return 1;
  if (b === 'Other' && a !== 'Other') return -1;
  return compareAlphanumericLabels(a, b);
}
