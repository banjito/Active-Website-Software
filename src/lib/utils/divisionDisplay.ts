// Centralized helpers for showing division values to users.
//
// Division values in this codebase live in two forms:
//   1. Internal identifier strings (e.g. "north_alabama", "tennessee", "field_tech")
//   2. Human-readable labels that are sometimes also persisted verbatim
//      (e.g. "North Alabama" stored in user_metadata.divisions).
//
// The map below handles both forms so a single formatter can be used anywhere
// a division needs to be displayed. Note: the KEY is what we accept as input,
// the VALUE is what we render. Values are kept aligned with the "Alabama
// Division / Tennessee Division / Georgia Division" portal naming.

const DIVISION_DISPLAY_MAP: Record<string, string> = {
  // Internal identifiers (snake_case / camelCase)
  north_alabama: 'Alabama Division',
  northAlabama: 'Alabama Division',
  tennessee: 'Tennessee Division',
  georgia: 'Georgia Division',
  international: 'International Division',
  calibration: 'Calibration Division',
  armadillo: 'Armadillo Division',
  scavenger: 'Scavenger Division',
  engineering: 'Engineering',
  field_tech: 'Field Technician Portal',
  Decatur: 'Alabama Division (Decatur)',

  // Human-readable values that may be persisted (e.g. user_metadata.divisions)
  'North Alabama': 'Alabama',
  'North Alabama Division': 'Alabama Division',
};

/**
 * Convert a division value (either an internal id or a persisted label) to a
 * user-friendly display string. Returns an empty string for nullish input.
 *
 * Falls back to a title-cased version of the raw value if no mapping exists
 * so new / unknown divisions still render cleanly.
 */
export const formatDivisionDisplay = (
  divisionValue?: string | null
): string => {
  if (!divisionValue) return '';
  if (DIVISION_DISPLAY_MAP[divisionValue]) {
    return DIVISION_DISPLAY_MAP[divisionValue];
  }
  return divisionValue
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Same as {@link formatDivisionDisplay} but strips the trailing " Division"
 * suffix. Useful for compact contexts like badges or chips.
 */
export const formatDivisionShort = (
  divisionValue?: string | null
): string => {
  const full = formatDivisionDisplay(divisionValue);
  return full.replace(/\s+Division(\s+\(.+\))?$/i, (_m, paren) =>
    paren ? paren.trim() : ''
  );
};
