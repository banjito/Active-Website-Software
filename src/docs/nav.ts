/**
 * The docs information architecture.
 *
 * This file is the single source of truth for sidebar order, section landing
 * pages, and prev/next paging. Adding a Markdown file under src/docs/content
 * does nothing until it is listed here. That is deliberate, so half-finished
 * pages never leak into navigation.
 */

import {
  Rocket,
  Briefcase,
  FileText,
  LayoutTemplate,
  PackageCheck,
  TrendingUp,
  Users,
  FlaskConical,
  Building2,
  ShieldCheck,
  Plug,
  BookMarked,
  type LucideIcon,
} from "lucide-react";

export interface DocsNavItem {
  title: string;
  /** Slug relative to /docs, e.g. "jobs/creating-a-job". */
  slug: string;
}

export interface DocsNavGroup {
  title: string;
  items: DocsNavItem[];
}

export interface DocsSection {
  /** First path segment, e.g. "jobs". */
  slug: string;
  title: string;
  /** One-line summary shown on the docs home cards. */
  description: string;
  icon: LucideIcon;
  groups: DocsNavGroup[];
}

export const docsSections: DocsSection[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    description: "What ampOS is, how to sign in, and how to find your way around.",
    icon: Rocket,
    groups: [
      {
        title: "Introduction",
        items: [
          { title: "What is ampOS?", slug: "getting-started/introduction" },
          { title: "Quickstart", slug: "getting-started/quickstart" },
          { title: "Core concepts", slug: "getting-started/core-concepts" },
        ],
      },
      {
        title: "Finding your way around",
        items: [
          { title: "Navigating ampOS", slug: "getting-started/navigation" },
          { title: "Portals and divisions", slug: "getting-started/portals-and-divisions" },
          { title: "Accounts and roles", slug: "getting-started/accounts-and-roles" },
          { title: "Keyboard shortcuts", slug: "getting-started/keyboard-shortcuts" },
        ],
      },
    ],
  },
  {
    slug: "jobs",
    title: "Jobs",
    description: "Create jobs, track them from quote to invoice, and watch the money.",
    icon: Briefcase,
    groups: [
      {
        title: "Basics",
        items: [
          { title: "Jobs overview", slug: "jobs/overview" },
          { title: "Creating a job", slug: "jobs/creating-a-job" },
          { title: "The job page", slug: "jobs/the-job-page" },
          { title: "Job statuses", slug: "jobs/job-statuses" },
        ],
      },
      {
        title: "Who and where",
        items: [
          { title: "Customers and contacts", slug: "jobs/customers-and-contacts" },
          { title: "Sites", slug: "jobs/sites" },
          { title: "Assets", slug: "jobs/assets" },
        ],
      },
      {
        title: "Running the work",
        items: [
          { title: "Scheduling", slug: "jobs/scheduling" },
          { title: "Job files and documents", slug: "jobs/files-and-documents" },
          { title: "SLA tracking", slug: "jobs/sla-tracking" },
        ],
      },
      {
        title: "Money",
        items: [
          { title: "Costs and profitability", slug: "jobs/costs-and-profitability" },
          { title: "Change orders", slug: "jobs/change-orders" },
          { title: "Billing a job", slug: "jobs/billing" },
        ],
      },
    ],
  },
  {
    slug: "reports",
    title: "Reports",
    description: "NETA-compliant test reports: create, fill out, review, approve.",
    icon: FileText,
    groups: [
      {
        title: "Basics",
        items: [
          { title: "Reports overview", slug: "reports/overview" },
          { title: "Creating a report", slug: "reports/creating-a-report" },
          { title: "Filling out a report", slug: "reports/filling-out-a-report" },
          { title: "Saving and autosave", slug: "reports/saving-and-autosave" },
        ],
      },
      {
        title: "Report content",
        items: [
          { title: "Equipment tables", slug: "reports/equipment-tables" },
          { title: "Test values and pass/fail", slug: "reports/test-values" },
          { title: "Comments and photos", slug: "reports/comments-and-photos" },
        ],
      },
      {
        title: "Getting reports out",
        items: [
          { title: "Review and approval", slug: "reports/review-and-approval" },
          { title: "Printing and PDFs", slug: "reports/printing-and-pdfs" },
        ],
      },
      {
        title: "Reference",
        items: [{ title: "Report catalog", slug: "reports/catalog" }],
      },
    ],
  },
  {
    slug: "deliverables",
    title: "Deliverables",
    description: "Bundle reports into a single, branded package for the customer.",
    icon: PackageCheck,
    groups: [
      {
        title: "Basics",
        items: [
          { title: "Deliverables overview", slug: "deliverables/overview" },
          { title: "Building a deliverable", slug: "deliverables/building-a-deliverable" },
        ],
      },
      {
        title: "Front matter",
        items: [
          { title: "Cover letters", slug: "deliverables/cover-letters" },
          { title: "Executive summaries", slug: "deliverables/executive-summaries" },
          { title: "Signature profiles", slug: "deliverables/signature-profiles" },
        ],
      },
      {
        title: "Sending it",
        items: [
          { title: "Review and approval", slug: "deliverables/review-and-approval" },
          { title: "Delivering to the customer", slug: "deliverables/delivering" },
        ],
      },
    ],
  },
  {
    slug: "custom-forms",
    title: "Custom forms",
    description: "Build your own report templates without writing code.",
    icon: LayoutTemplate,
    groups: [
      {
        title: "Custom forms",
        items: [
          { title: "Overview", slug: "custom-forms/overview" },
          { title: "Building a template", slug: "custom-forms/building-a-template" },
          { title: "Components and field types", slug: "custom-forms/field-types" },
          { title: "Using a form on a job", slug: "custom-forms/using-on-a-job" },
        ],
      },
    ],
  },
  {
    slug: "sales",
    title: "Sales",
    description: "Opportunities, estimates, territories, and goals.",
    icon: TrendingUp,
    groups: [
      {
        title: "Pipeline",
        items: [
          { title: "Sales overview", slug: "sales/overview" },
          { title: "Opportunities", slug: "sales/opportunities" },
          { title: "Estimates and proposals", slug: "sales/estimates-and-proposals" },
          { title: "Pipeline calendar", slug: "sales/pipeline-calendar" },
        ],
      },
      {
        title: "Structure",
        items: [
          { title: "Territories", slug: "sales/territories" },
          { title: "Goals", slug: "sales/goals" },
          { title: "Estimating presets", slug: "sales/estimating-presets" },
        ],
      },
    ],
  },
  {
    slug: "hr",
    title: "HR",
    description: "Hiring, onboarding, employee records, time off, and reviews.",
    icon: Users,
    groups: [
      {
        title: "Overview",
        items: [
          { title: "HR overview", slug: "hr/overview" },
          { title: "Employee profiles", slug: "hr/employee-profiles" },
        ],
      },
      {
        title: "Hiring",
        items: [
          { title: "Recruiting", slug: "hr/recruiting" },
          { title: "Offers and e-signatures", slug: "hr/offers-and-esignatures" },
          { title: "Onboarding", slug: "hr/onboarding" },
        ],
      },
      {
        title: "Ongoing",
        items: [
          { title: "Time and attendance", slug: "hr/time-and-attendance" },
          { title: "Performance", slug: "hr/performance" },
          { title: "Announcements", slug: "hr/announcements" },
          { title: "Compliance", slug: "hr/compliance" },
          { title: "Offboarding", slug: "hr/offboarding" },
        ],
      },
    ],
  },
  {
    slug: "lab",
    title: "Lab and engineering",
    description: "Calibration, testing procedures, certificates, and design work.",
    icon: FlaskConical,
    groups: [
      {
        title: "Lab",
        items: [
          { title: "Lab overview", slug: "lab/overview" },
          { title: "Equipment calibration", slug: "lab/equipment-calibration" },
          { title: "Testing procedures", slug: "lab/testing-procedures" },
          { title: "Certificates", slug: "lab/certificates" },
          { title: "Quality metrics", slug: "lab/quality-metrics" },
        ],
      },
      {
        title: "Engineering",
        items: [{ title: "Engineering portal", slug: "lab/engineering-portal" }],
      },
    ],
  },
  {
    slug: "operations",
    title: "Operations",
    description: "Vendors, purchase orders, fleet, resources, and meetings.",
    icon: Building2,
    groups: [
      {
        title: "Office",
        items: [
          { title: "Operations overview", slug: "operations/overview" },
          { title: "Vendors and purchase orders", slug: "operations/vendors-and-pos" },
          { title: "Resources", slug: "operations/resources" },
        ],
      },
      {
        title: "Field",
        items: [
          { title: "Field equipment and vehicles", slug: "operations/field-equipment" },
          { title: "Maintenance", slug: "operations/maintenance" },
        ],
      },
      {
        title: "Team",
        items: [
          { title: "Meetings", slug: "operations/meetings" },
          { title: "Community board", slug: "operations/community-board" },
        ],
      },
    ],
  },
  {
    slug: "admin",
    title: "Administration",
    description: "Users, permissions, notifications, health, and theming.",
    icon: ShieldCheck,
    groups: [
      {
        title: "People",
        items: [
          { title: "Admin overview", slug: "admin/overview" },
          { title: "User management", slug: "admin/user-management" },
          { title: "Roles and permissions", slug: "admin/roles-and-permissions" },
        ],
      },
      {
        title: "System",
        items: [
          { title: "Notification controls", slug: "admin/notification-controls" },
          { title: "System health and logs", slug: "admin/system-health" },
          { title: "Data backup", slug: "admin/data-backup" },
          { title: "Site theme", slug: "admin/site-theme" },
        ],
      },
    ],
  },
  {
    slug: "integrations",
    title: "Integrations",
    description: "QuickBooks, automated email, the customer portal, and offline reports.",
    icon: Plug,
    groups: [
      {
        title: "Integrations",
        items: [
          { title: "Integrations overview", slug: "integrations/overview" },
          { title: "QuickBooks Online", slug: "integrations/quickbooks" },
          { title: "Automated emails", slug: "integrations/automated-emails" },
          { title: "Customer portal", slug: "integrations/customer-portal" },
          { title: "Offline reports app", slug: "integrations/offline-app" },
        ],
      },
    ],
  },
  {
    slug: "reference",
    title: "Reference",
    description: "Glossary, email schedules, and what to do when something breaks.",
    icon: BookMarked,
    groups: [
      {
        title: "Reference",
        items: [
          { title: "Glossary", slug: "reference/glossary" },
          { title: "Email schedule", slug: "reference/email-schedule" },
          { title: "Troubleshooting", slug: "reference/troubleshooting" },
        ],
      },
    ],
  },
];

/** Flat, in-order list of every navigable page. Drives prev/next paging. */
export const docsFlatNav: DocsNavItem[] = docsSections.flatMap((section) =>
  section.groups.flatMap((group) => group.items),
);

/**
 * Route paths to register under /docs, relative to it.
 *
 * These are deliberately one-per-section (`jobs/:page`) rather than a single
 * `*` splat. React Router v6 ranks routes by specificity, not declaration
 * order, and the app's `/:division/jobs/:id` route outranks `/docs/*`, which
 * made every /docs/jobs/... page render the job detail screen instead. With
 * the section slug static, `/docs/jobs/:page` outranks it and the docs win.
 */
export const docsRoutePaths: string[] = docsSections.map(
  (section) => `${section.slug}/:page`,
);

export function findSection(slug: string): DocsSection | undefined {
  return docsSections.find((section) => section.slug === slug.split("/")[0]);
}

export function findNavItem(slug: string): DocsNavItem | undefined {
  return docsFlatNav.find((item) => item.slug === slug);
}

/** Group title an item belongs to, used for breadcrumbs. */
export function findGroupTitle(slug: string): string | undefined {
  for (const section of docsSections) {
    for (const group of section.groups) {
      if (group.items.some((item) => item.slug === slug)) return group.title;
    }
  }
  return undefined;
}

export function getAdjacentPages(slug: string): {
  previous?: DocsNavItem;
  next?: DocsNavItem;
} {
  const index = docsFlatNav.findIndex((item) => item.slug === slug);
  if (index === -1) return {};
  return {
    previous: index > 0 ? docsFlatNav[index - 1] : undefined,
    next: index < docsFlatNav.length - 1 ? docsFlatNav[index + 1] : undefined,
  };
}
