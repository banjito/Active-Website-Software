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
      { label: 'Estimating Preset Settings', path: '/sales/estimating-presets' },
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
      { label: 'Custom Report Builder', path: '/custom-forms/templates' },
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
      { label: 'Custom Report Builder', path: '/custom-forms/templates' },
      { label: 'Encryption Settings', path: '/admin/encryption' },
    ],
  },
  {
    key: 'office',
    label: 'Office',
    options: [
      { label: 'Vendors', path: '/office/vendors' },
      { label: "Vendor PO's", path: '/office' },
    ],
  },
  {
    key: 'hr',
    label: 'HR',
    options: [
      { label: 'Announcements', path: '/hr/announcements' },
      { label: 'Employee Files', path: '/hr/employee-files' },
      { label: 'Manager Portal', path: '/hr/self-service/manager-portal' },
      { label: 'HR Dashboard', path: '/hr/dashboard' },
      { label: 'Job Requisitions', path: '/hr/recruiting/job-requisitions' },
      { label: 'Requisition Approvals', path: '/hr/recruiting/requisition-approvals' },
      { label: 'Career Page', path: '/hr/recruiting/career-page' },
      { label: 'Candidate Tracking (ATS)', path: '/hr/recruiting/candidate-tracking' },
      { label: 'Interview Scheduling', path: '/hr/recruiting/interview-scheduling' },
      { label: 'Resume Parsing', path: '/hr/recruiting/resume-parsing' },
      { label: 'Candidate Communication', path: '/hr/recruiting/candidate-communication' },
      { label: 'Offer Letters', path: '/hr/offers/offer-letters' },
      { label: 'Offer Approvals', path: '/hr/offers/offer-approvals' },
      { label: 'E-Signatures (Offers)', path: '/hr/offers/e-signatures' },
      { label: 'Comp/Position Details', path: '/hr/offers/comp-position-details' },
      { label: 'Your Onboarding', path: '/hr/onboarding/your-onboarding' },
      { label: 'Onboarding Tracking', path: '/hr/onboarding/tracking' },
      { label: 'New Hire Packets', path: '/hr/onboarding/new-hire-packets' },
      { label: 'E-Sign Forms', path: '/hr/onboarding/e-sign-forms' },
      { label: 'Checklists', path: '/hr/onboarding/checklists' },
      { label: 'Welcome Emails', path: '/hr/onboarding/welcome-emails' },
      { label: 'IT/Equipment Tasks', path: '/hr/onboarding/it-equipment-tasks' },
      { label: 'IT Onboarding', path: '/hr/onboarding/it-onboarding' },
      { label: 'Employee Profiles', path: '/hr/data/employee-profiles' },
      { label: 'Job/Title History', path: '/hr/data/job-title-history' },
      { label: 'Compensation History', path: '/hr/data/compensation-history' },
      { label: 'Org Chart', path: '/hr/data/org-chart' },
      { label: 'Call List', path: '/hr/data/call-list' },
      { label: 'Reporting', path: '/hr/data/reporting' },
      { label: 'Custom Tabs', path: '/hr/data/custom-tabs' },
      { label: 'PTO/Leave Tracking', path: '/hr/time-attendance/pto-leave' },
      { label: 'Review Cycles', path: '/hr/performance/review-cycles' },
      { label: 'Document Acknowledgment', path: '/hr/compliance/document-acknowledgment' },
      { label: 'Termination Workflows', path: '/hr/offboarding/termination-workflows' },
      { label: 'Exit Surveys', path: '/hr/offboarding/exit-surveys' },
      { label: 'Final Docs', path: '/hr/offboarding/final-docs' },
      { label: 'Payroll', path: '/hr/integrations/payroll' },
      { label: 'Background Checks', path: '/hr/integrations/background-checks' },
      { label: 'Benefits/Time/ATS Tools', path: '/hr/integrations/benefits-time-ats' },
      { label: 'Analytics Dashboards', path: '/hr/analytics/dashboards' },
      { label: 'Custom Reports', path: '/hr/analytics/custom-reports' },
      { label: 'Export Tools', path: '/hr/analytics/export-tools' },
    ],
  },
  // Divisions share a common set of tabs
  ...(['north_alabama','tennessee','georgia','international','armadillo','scavenger'] as BuiltinPortalKey[]).map((key) => ({
    key,
    label:
      key === 'north_alabama' ? 'Alabama' :
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


