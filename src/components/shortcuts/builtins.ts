export type BuiltinPortalKey =
  | 'portal'
  | 'sales'
  | 'meetings'
  | 'field_tech'
  | 'engineering'
  | 'lab'
  | 'admin'
  | 'office'
  | 'hr'
  | 'north_alabama'
  | 'tennessee'
  | 'georgia'
  | 'international'
  | 'calibration'
  | 'armadillo'
  | 'scavenger';

interface BuiltinOption {
  label: string;
  path: string; // relative router path
}

export interface BuiltinPortal {
  key: BuiltinPortalKey;
  label: string;
  options: BuiltinOption[];
}

export const BUILTIN_PORTALS: BuiltinPortal[] = [
  {
    key: 'portal',
    label: 'Portal',
    options: [
      { label: 'Home', path: '/portal' },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    options: [
      { label: 'Dashboard', path: '/sales-dashboard' },
      { label: 'Opportunities', path: '/sales-dashboard/opportunities' },
      { label: 'Customers', path: '/sales-dashboard/customers' },
      { label: 'Contacts', path: '/sales-dashboard/contacts' },
      { label: 'Goals', path: '/sales/goals' },
      { label: 'Goals Dashboard', path: '/sales/goals/dashboard' },
    ],
  },
  {
    key: 'meetings',
    label: 'Meetings',
    options: [
      { label: 'Runway', path: '/meetings' },
      { label: 'My Data', path: '/meetings/my-data' },
      { label: 'Insights', path: '/meetings/insights' },
      { label: 'Data', path: '/meetings/data' },
      { label: 'Rocks', path: '/meetings/rocks' },
      { label: 'To-Dos', path: '/meetings/todos' },
      { label: 'Issues', path: '/meetings/issues' },
      { label: 'Headlines', path: '/meetings/headlines' },
      { label: 'Vision', path: '/meetings/vision' },
      { label: 'Responsibilities', path: '/meetings/responsibilities' },
    ],
  },
  {
    key: 'field_tech',
    label: 'Field Technician',
    options: [
      { label: 'Dashboard', path: '/field-tech/dashboard' },
      { label: 'Jobs', path: '/field-tech/jobs' },
      { label: 'Reports', path: '/field-tech/reports' },
    ],
  },
  {
    key: 'engineering',
    label: 'Engineering',
    options: [
      { label: 'Dashboard', path: '/engineering/dashboard' },
      { label: 'Jobs', path: '/engineering/jobs' },
      { label: 'Designs', path: '/engineering/designs' },
      { label: 'Documentation', path: '/engineering/documentation' },
      { label: 'Standards', path: '/engineering/standards' },
      { label: 'Drawings', path: '/engineering/drawings' },
    ],
  },
  {
    key: 'lab',
    label: 'Lab',
    options: [
      { label: 'Dashboard', path: '/lab' },
      { label: 'Equipment', path: '/lab/equipment' },
      { label: 'Procedures', path: '/lab/procedures' },
      { label: 'Certificates', path: '/lab/certificates' },
      { label: 'Quality Metrics', path: '/lab/quality-metrics' },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    options: [
      { label: 'Dashboard', path: '/admin-dashboard' },
      { label: 'Encryption Settings', path: '/admin/encryption' },
    ],
  },
  {
    key: 'office',
    label: 'Office',
    options: [
      { label: 'Dashboard', path: '/office' },
    ],
  },
  {
    key: 'hr',
    label: 'HR',
    options: [
      { label: 'HR Portal', path: '/hr' },
    ],
  },
  // Divisions share a common set of tabs
  ...(['north_alabama','tennessee','georgia','international','calibration','armadillo','scavenger'] as BuiltinPortalKey[]).map((key) => ({
    key,
    label:
      key === 'north_alabama' ? 'North Alabama' :
      key === 'international' ? 'International' :
      key.charAt(0).toUpperCase() + key.slice(1),
    options: [
      { label: 'Dashboard', path: `/${key}/dashboard` },
      { label: 'Customers', path: `/${key}/customers` },
      { label: 'Contacts', path: `/${key}/contacts` },
      { label: 'Jobs', path: `/${key}/jobs` },
      { label: 'Reports', path: `/${key}/reports` },
      { label: 'Scheduling', path: `/${key}/scheduling` },
      { label: 'Equipment', path: `/${key}/equipment` },
    ],
  })),
];


