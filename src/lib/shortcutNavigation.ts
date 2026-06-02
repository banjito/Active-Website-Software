import type { NavigateFunction } from 'react-router-dom';

/** Map URL first segment to division context (same as HeaderBar shortcuts). */
export function divisionFromShortcutPath(path: string): string | null {
  const segment = path.replace(/^\//, '').split('/')[0];
  if (!segment) return null;

  const pathToDivision: Record<string, string> = {
    'field-tech': 'field_tech',
    north_alabama: 'north_alabama',
    tennessee: 'tennessee',
    georgia: 'georgia',
    international: 'international',
    calibration: 'calibration',
    armadillo: 'armadillo',
    scavenger: 'scavenger',
    'sales-dashboard': 'sales',
    sales: 'sales',
    engineering: 'engineering',
    hr: 'hr',
    lab: 'lab',
    office: 'office',
    'admin-dashboard': 'admin',
    admin: 'admin',
    meetings: 'meetings',
  };

  return pathToDivision[segment] ?? null;
}

export function navigateFromShortcut(
  url: string,
  navigate: NavigateFunction,
  setDivision: (division: string | null) => void
): void {
  if (url.startsWith('http')) {
    window.open(url, '_blank');
    return;
  }
  const division = divisionFromShortcutPath(url);
  if (division) setDivision(division);
  else setDivision(null);
  navigate(url);
}
