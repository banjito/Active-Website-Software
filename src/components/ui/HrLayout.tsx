import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { Link, useLocation, useNavigate, Navigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import {
  FileText,
  Users,
  Briefcase,
  FileCheck,
  UserPlus,
  FolderOpen,
  Clock,
  Award,
  Shield,
  DoorOpen,
  Plug,
  BarChart3,
  UserCircle,
  Calendar,
  FileText as FileTextIcon,
  CheckSquare,
  Mail,
  Laptop,
  Folder,
  History,
  DollarSign,
  ClipboardList,
  ClipboardCheck,
  Network,
  FileBarChart,
  TrendingUp,
  Download,
  Building2,
  ChevronRight,
  Megaphone,
  Phone,
  UserCheck,
  BookOpen,
  Search,
  X,
} from "lucide-react";
import { HeaderBar } from "./HeaderBar";

interface HrLayoutProps {
  children: React.ReactNode;
}

interface MenuItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

/** Sidebar buckets. Twelve top-level entries in one flat column is hard to
 *  scan, so every section belongs to one of these three labelled groups. */
type NavGroup = "hiring" | "people" | "operations";

const NAV_GROUP_ORDER: NavGroup[] = ["hiring", "people", "operations"];
const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  hiring: "Hiring",
  people: "People",
  operations: "Operations",
};

interface MenuSection {
  key: string;
  label: string;
  icon: React.ReactNode;
  group: NavGroup;
  items: MenuItem[];
}

const SECTION_STATE_KEY = "hr-nav-expanded-sections";

/** `startsWith` alone would light up "/hr/data" for "/hr/data-export"; match a
 *  full path segment instead. */
function pathMatches(pathname: string, target: string): boolean {
  return pathname === target || pathname.startsWith(target + "/");
}

const GROUP_LABEL_CLASS =
  "px-2 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.11em] text-neutral-400 dark:text-white/40";

/** Shared row chrome for the flat, non-collapsible entries. */
const NavLinkRow: React.FC<{
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  /** Filled brand treatment, used for the one call-to-action link. */
  emphasis?: boolean;
  onNavigate?: () => void;
}> = ({ to, icon, label, active, emphasis, onNavigate }) => (
  <Link
    to={to}
    onClick={onNavigate}
    className={`group flex h-9 items-center gap-2.5 px-2 text-[13px] font-semibold transition-colors ${
      emphasis
        ? "bg-brand text-white hover:bg-brand/90"
        : active
          ? "bg-brand/10 text-brand"
          : "text-neutral-700 hover:bg-black/[0.04] hover:text-neutral-900 dark:text-dark-900 dark:hover:bg-dark-50"
    }`}
  >
    <span
      className={`shrink-0 ${
        emphasis
          ? "text-white"
          : active
            ? "text-brand"
            : "text-neutral-400 group-hover:text-brand dark:text-white/45"
      }`}
    >
      {icon}
    </span>
    <span className="truncate">{label}</span>
  </Link>
);

/** Defined at module scope on purpose: declaring it inside HrLayout minted a new
 *  component type every render, which remounted the whole subtree on each
 *  keystroke in the search box. */
const NavSection: React.FC<{
  section: MenuSection;
  expanded: boolean;
  pathname: string;
  onToggle: (key: string) => void;
}> = ({ section, expanded, pathname, onToggle }) => {
  const activeItem = section.items.find((item) =>
    pathMatches(pathname, item.path),
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(section.key)}
        aria-expanded={expanded}
        className={`group flex h-9 w-full items-center gap-2.5 px-2 text-[13px] font-semibold transition-colors ${
          activeItem || expanded
            ? "text-neutral-900 dark:text-white"
            : "text-neutral-700 hover:text-neutral-900 dark:text-dark-900 dark:hover:text-white"
        } hover:bg-black/[0.04] dark:hover:bg-dark-50`}
      >
        <span
          className={`shrink-0 ${
            activeItem
              ? "text-brand"
              : "text-neutral-400 group-hover:text-brand dark:text-white/45"
          }`}
        >
          {section.icon}
        </span>
        <span className="flex-1 truncate text-left">{section.label}</span>
        {/* Collapsed sections would otherwise hide the fact that you are inside
            them, so mark the ancestor of the current page. */}
        {activeItem && !expanded && (
          <span className="h-1.5 w-1.5 shrink-0 bg-brand" aria-hidden />
        )}
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform dark:text-white/40 ${
            expanded ? "rotate-90" : ""
          }`}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="ml-[15px] flex flex-col border-l border-neutral-200 pb-1 dark:border-dark-200">
          {section.items.map((item) => {
            const isActive = pathMatches(pathname, item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`-ml-px flex h-8 items-center border-l-2 pl-3.5 pr-2 text-[12.5px] transition-colors ${
                  isActive
                    ? "border-brand bg-brand/10 font-semibold text-brand"
                    : "border-transparent text-neutral-600 hover:border-neutral-300 hover:bg-black/[0.03] hover:text-neutral-900 dark:text-white/70 dark:hover:bg-dark-50 dark:hover:text-white"
                }`}
              >
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const HrLayout: React.FC<HrLayoutProps> = ({ children }) => {
  const { user, refreshUser } = useAuth();
  const { checkPortalAccess, getUserRole } = usePermissions();
  const userRole = getUserRole();
  const isHrFullAccess = userRole === "Admin" || userRole === "Super Admin";
  const location = useLocation();
  const navigate = useNavigate();

  // Force a fresh role check from the server when entering the HR portal so role changes take effect immediately
  const hasRefreshed = useRef(false);
  useEffect(() => {
    if (!hasRefreshed.current && user) {
      hasRefreshed.current = true;
      supabase.auth
        .getUser()
        .then(({ data }) => {
          if (data?.user) {
            const freshRole = data.user.user_metadata?.role;
            const cachedRole = user.user_metadata?.role;
            if (freshRole !== cachedRole) {
              console.log(
                "[HrLayout] Role mismatch detected, refreshing session:",
                { cachedRole, freshRole },
              );
              refreshUser();
            }
          }
        })
        .catch(() => {});
    }
  }, [user]);
  const [navSearch, setNavSearch] = useState("");
  const [navCursor, setNavCursor] = useState(0);
  const navInputRef = useRef<HTMLInputElement>(null);
  const DEFAULT_SECTION_STATE: Record<string, boolean> = {
    recruiting: false,
    offers: false,
    onboarding: false,
    hrData: false,
    timeAttendance: false,
    performance: false,
    compliance: false,
    offboarding: false,
    integrations: false,
    analytics: false,
  };
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >(() => {
    // Remember which sections were open; re-collapsing them on every page load
    // is the main reason this sidebar felt tedious.
    try {
      const stored = localStorage.getItem(SECTION_STATE_KEY);
      if (stored) {
        return { ...DEFAULT_SECTION_STATE, ...JSON.parse(stored) };
      }
    } catch {
      /* private mode / blocked storage — fall through to defaults */
    }
    return DEFAULT_SECTION_STATE;
  });

  useEffect(() => {
    try {
      localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(expandedSections));
    } catch {
      /* nothing to do if storage is unavailable */
    }
  }, [expandedSections]);

  // Cmd/Ctrl-K focuses the page search from anywhere in the HR portal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navInputRef.current?.focus();
        navInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-expand section if current path matches
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith("/hr/recruiting")) {
      setExpandedSections((prev) => ({ ...prev, recruiting: true }));
    } else if (path.startsWith("/hr/offers")) {
      setExpandedSections((prev) => ({ ...prev, offers: true }));
    } else if (path.startsWith("/hr/onboarding")) {
      setExpandedSections((prev) => ({ ...prev, onboarding: true }));
    } else if (
      path.startsWith("/hr/dashboard") ||
      path.startsWith("/hr/data")
    ) {
      setExpandedSections((prev) => ({ ...prev, hrData: true }));
    } else if (path.startsWith("/hr/time-attendance")) {
      setExpandedSections((prev) => ({ ...prev, timeAttendance: true }));
    } else if (path.startsWith("/hr/performance")) {
      setExpandedSections((prev) => ({ ...prev, performance: true }));
    } else if (path.startsWith("/hr/compliance")) {
      setExpandedSections((prev) => ({ ...prev, compliance: true }));
    } else if (path.startsWith("/hr/offboarding")) {
      setExpandedSections((prev) => ({ ...prev, offboarding: true }));
    } else if (path.startsWith("/hr/integrations")) {
      setExpandedSections((prev) => ({ ...prev, integrations: true }));
    } else if (path.startsWith("/hr/analytics")) {
      setExpandedSections((prev) => ({ ...prev, analytics: true }));
    }
  }, [location.pathname]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const searchParams = new URLSearchParams(location.search);
  const isEmbed = searchParams.get("embed") === "true";

  // All authenticated users get limited HR access (employee files, profiles, doc acknowledgment, manager portal).
  // Only Admin/Super Admin get the full HR portal.
  const HR_LIMITED_ALLOWED_PATHS = [
    "/hr/employee-files",
    "/hr/data/employee-profiles",
    "/hr/data/org-chart",
    "/hr/compliance/document-acknowledgment",
    "/hr/self-service/manager-portal",
    "/hr/onboarding/your-onboarding",
    "/hr/onboarding/sign-form",
    "/hr/handbook",
  ];
  const isPathAllowedForLimited = HR_LIMITED_ALLOWED_PATHS.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + "/"),
  );
  if (!isHrFullAccess && !isPathAllowedForLimited) {
    return <Navigate to="/hr/employee-files" replace />;
  }

  if (!user) return <div className="min-h-screen">{children}</div>;

  if (isEmbed) {
    return (
      <div className="min-h-screen bg-white dark:bg-dark-150">
        <main className="p-0">{children}</main>
      </div>
    );
  }

  const menuSections: MenuSection[] = [
    {
      key: "recruiting",
      label: "Recruiting",
      icon: <Briefcase className="h-3.5 w-3.5" />,
      group: "hiring",
      items: [
        {
          path: "/hr/recruiting/job-requisitions",
          label: "Job Requisitions",
          icon: <Briefcase className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/recruiting/requisition-approvals",
          label: "Requisition Approvals",
          icon: <FileCheck className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/recruiting/career-page",
          label: "Career Page",
          icon: <Building2 className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/recruiting/candidate-tracking",
          label: "Candidate Tracking (ATS)",
          icon: <Users className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/recruiting/interview-scheduling",
          label: "Interview Scheduling",
          icon: <Calendar className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/recruiting/resume-parsing",
          label: "Resume Parsing",
          icon: <FileTextIcon className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/recruiting/candidate-communication",
          label: "Candidate Communication",
          icon: <Mail className="mr-2 h-3.5 w-3.5" />,
        },
      ],
    },
    {
      key: "offers",
      label: "Offers",
      icon: <FileText className="h-3.5 w-3.5" />,
      group: "hiring",
      items: [
        {
          path: "/hr/offers/offer-letters",
          label: "Offer Letters",
          icon: <FileText className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/offers/offer-approvals",
          label: "Offer Approvals",
          icon: <FileCheck className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/offers/e-signatures",
          label: "E-Signatures",
          icon: <FileCheck className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/offers/comp-position-details",
          label: "Comp/Position Details",
          icon: <DollarSign className="mr-2 h-3.5 w-3.5" />,
        },
      ],
    },
    {
      key: "onboarding",
      label: "Onboarding",
      icon: <UserPlus className="h-3.5 w-3.5" />,
      group: "hiring",
      items: [
        {
          path: "/hr/onboarding/your-onboarding",
          label: "Your Onboarding",
          icon: <UserCheck className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/onboarding/tracking",
          label: "Onboarding Tracking",
          icon: <ClipboardList className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/onboarding/new-hire-packets",
          label: "New Hire Packets",
          icon: <Folder className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/onboarding/e-sign-forms",
          label: "E-Sign Forms",
          icon: <FileCheck className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/onboarding/checklists",
          label: "Checklists",
          icon: <CheckSquare className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/onboarding/welcome-emails",
          label: "Welcome Emails",
          icon: <Mail className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/onboarding/it-equipment-tasks",
          label: "IT/Equipment Tasks",
          icon: <Laptop className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/onboarding/it-onboarding",
          label: "IT Onboarding",
          icon: <ClipboardCheck className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/onboarding/office-admin-tasks",
          label: "Office Admin Tasks",
          icon: <Briefcase className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/onboarding/office-admin-onboarding",
          label: "Office Admin Onboarding",
          icon: <ClipboardCheck className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/onboarding/hr-tasks",
          label: "HR Tasks",
          icon: <Users className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/onboarding/hr-onboarding",
          label: "HR Onboarding",
          icon: <ClipboardCheck className="mr-2 h-3.5 w-3.5" />,
        },
      ],
    },
    {
      key: "hrData",
      label: "HR Data",
      icon: <UserCircle className="h-3.5 w-3.5" />,
      group: "people",
      items: [
        {
          path: "/hr/data/employee-profiles",
          label: "Employee Profiles",
          icon: <UserCircle className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/data/job-title-history",
          label: "Job/Title History",
          icon: <History className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/data/compensation-history",
          label: "Compensation History",
          icon: <DollarSign className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/data/org-chart",
          label: "Org Chart",
          icon: <Network className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/data/call-list",
          label: "Call list",
          icon: <Phone className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/data/reporting",
          label: "Reporting",
          icon: <FileBarChart className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/data/custom-tabs",
          label: "Custom Tabs",
          icon: <FolderOpen className="mr-2 h-3.5 w-3.5" />,
        },
      ],
    },
    {
      key: "timeAttendance",
      label: "Time & Attendance",
      icon: <Clock className="h-3.5 w-3.5" />,
      group: "people",
      items: [
        {
          path: "/hr/time-attendance/pto-leave",
          label: "PTO/Leave Tracking",
          icon: <Calendar className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/time-attendance/accrual-policies",
          label: "Accrual Policies",
          icon: <Clock className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/time-attendance/timesheets",
          label: "Timesheets",
          icon: <Clock className="mr-2 h-3.5 w-3.5" />,
        },
      ],
    },
    {
      key: "performance",
      label: "Performance Reviews",
      icon: <Award className="h-3.5 w-3.5" />,
      group: "people",
      items: [
        {
          path: "/hr/performance/review-cycles",
          label: "Review Cycles",
          icon: <Award className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/performance/goals",
          label: "Goals",
          icon: <TrendingUp className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/performance/feedback-tools",
          label: "Feedback Tools",
          icon: <FileText className="mr-2 h-3.5 w-3.5" />,
        },
      ],
    },
    {
      key: "compliance",
      label: "Compliance",
      icon: <Shield className="h-3.5 w-3.5" />,
      group: "operations",
      items: [
        {
          path: "/hr/compliance/document-acknowledgment",
          label: "Document Acknowledgment",
          icon: <FileCheck className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/compliance/e-sign-recordkeeping",
          label: "E-Sign Recordkeeping",
          icon: <Shield className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/compliance/eeo-reporting",
          label: "EEO/Reporting",
          icon: <FileBarChart className="mr-2 h-3.5 w-3.5" />,
        },
      ],
    },
    {
      key: "offboarding",
      label: "Offboarding",
      icon: <DoorOpen className="h-3.5 w-3.5" />,
      group: "operations",
      items: [
        {
          path: "/hr/offboarding/termination-workflows",
          label: "Termination Workflows",
          icon: <DoorOpen className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/offboarding/exit-surveys",
          label: "Exit Surveys",
          icon: <FileText className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/offboarding/final-docs",
          label: "Final Docs",
          icon: <FileText className="mr-2 h-3.5 w-3.5" />,
        },
      ],
    },
    {
      key: "integrations",
      label: "Integrations",
      icon: <Plug className="h-3.5 w-3.5" />,
      group: "operations",
      items: [
        {
          path: "/hr/integrations/payroll",
          label: "Payroll",
          icon: <DollarSign className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/integrations/background-checks",
          label: "Background Checks",
          icon: <Shield className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/integrations/benefits-time-ats",
          label: "Benefits/Time/ATS Tools",
          icon: <Plug className="mr-2 h-3.5 w-3.5" />,
        },
      ],
    },
    {
      key: "analytics",
      label: "Analytics",
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      group: "operations",
      items: [
        {
          path: "/hr/analytics/custom-reports",
          label: "Custom Reports",
          icon: <FileBarChart className="mr-2 h-3.5 w-3.5" />,
        },
        {
          path: "/hr/analytics/export-tools",
          label: "Export Tools",
          icon: <Download className="mr-2 h-3.5 w-3.5" />,
        },
      ],
    },
  ];

  // Flat list of every page the current user can reach, for the sidebar search
  const standaloneNavItems: { path: string; label: string; section?: string }[] =
    isHrFullAccess
      ? [
          { path: "/hr/dashboard", label: "HR Dashboard" },
          { path: "/hr/handbook", label: "Employee Handbook" },
          { path: "/hr/announcements", label: "Announcements" },
          { path: "/hr/employee-files", label: "Employee Files" },
          { path: "/hr/self-service/manager-portal", label: "Manager Portal" },
        ]
      : [
          { path: "/hr/handbook", label: "Employee Handbook" },
          { path: "/hr/employee-files", label: "Employee Files" },
          { path: "/hr/onboarding/your-onboarding", label: "Your Onboarding" },
          { path: "/hr/data/employee-profiles", label: "Employee Profiles" },
          { path: "/hr/data/org-chart", label: "Org Chart" },
          {
            path: "/hr/compliance/document-acknowledgment",
            label: "Document Acknowledgment",
          },
          { path: "/hr/self-service/manager-portal", label: "Manager Portal" },
        ];
  const searchableNavItems = [
    ...standaloneNavItems,
    ...(isHrFullAccess
      ? menuSections.flatMap((s) =>
          s.items.map((i) => ({
            path: i.path,
            label: i.label,
            section: s.label,
          })),
        )
      : []),
  ];
  const navQuery = navSearch.trim().toLowerCase();
  const navResults = navQuery
    ? searchableNavItems
        .filter(
          (i) =>
            i.label.toLowerCase().includes(navQuery) ||
            (i.section || "").toLowerCase().includes(navQuery) ||
            i.path.toLowerCase().includes(navQuery),
        )
        // A hit on the page's own name beats a hit on its section or URL.
        .sort((a, b) => {
          const rank = (x: typeof a) =>
            x.label.toLowerCase().startsWith(navQuery)
              ? 0
              : x.label.toLowerCase().includes(navQuery)
                ? 1
                : 2;
          return rank(a) - rank(b);
        })
    : [];

  const cursor = Math.min(navCursor, Math.max(navResults.length - 1, 0));

  const clearSearch = () => {
    setNavSearch("");
    setNavCursor(0);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      clearSearch();
      navInputRef.current?.blur();
      return;
    }
    if (!navResults.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setNavCursor((c) => (c + 1) % navResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setNavCursor((c) => (c - 1 + navResults.length) % navResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = navResults[cursor];
      if (target) {
        clearSearch();
        navigate(target.path);
      }
    }
  };

  const sectionsByGroup = NAV_GROUP_ORDER.map((group) => ({
    group,
    sections: menuSections.filter((section) => section.group === group),
  })).filter((entry) => entry.sections.length > 0);

  const anyExpanded = menuSections.some((s) => expandedSections[s.key]);
  const toggleAllSections = () => {
    const next = !anyExpanded;
    setExpandedSections(
      Object.fromEntries(menuSections.map((s) => [s.key, next])),
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-dark-background text-foreground">
      <div className="sticky top-0 z-30 w-full shrink-0 print:hidden border-b border-neutral-200 dark:border-dark-200">
        <HeaderBar />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-72 min-w-[18rem] flex-shrink-0 flex-col border-r border-black/10 bg-white dark:border-dark-200 dark:bg-dark-150">
          {/* Sticky search — stays put while the section list scrolls under it */}
          <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-4 pb-3 pt-4 dark:border-dark-200 dark:bg-dark-150">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <input
                ref={navInputRef}
                type="text"
                value={navSearch}
                onChange={(e) => {
                  setNavSearch(e.target.value);
                  setNavCursor(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder="Search HR pages"
                aria-label="Search HR pages"
                className="h-9 w-full rounded-none border border-neutral-200 bg-neutral-50 pl-8 pr-14 text-[13px] text-black placeholder:text-neutral-400 focus:border-brand focus:bg-white focus:outline-none dark:border-dark-200 dark:bg-dark-100 dark:text-dark-900 dark:focus:bg-dark-100"
              />
              {navSearch ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 border border-neutral-200 px-1.5 py-px text-[10px] font-semibold text-neutral-400 dark:border-dark-200 dark:text-white/40"
                  aria-hidden
                >
                  ⌘K
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-grow flex-col overflow-y-auto px-4 pb-6">
            {navQuery ? (
              <div className="flex flex-col pt-3">
                <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.11em] text-neutral-400 dark:text-white/40">
                  {navResults.length}{" "}
                  {navResults.length === 1 ? "result" : "results"}
                </div>
                {navResults.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">
                    No pages match &quot;{navSearch.trim()}&quot;
                  </p>
                ) : (
                  navResults.map((item, i) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={clearSearch}
                      onMouseEnter={() => setNavCursor(i)}
                      className={`flex flex-col items-start px-2 py-1.5 transition-colors ${
                        i === cursor
                          ? "bg-brand/10 text-brand"
                          : "text-neutral-700 hover:bg-black/[0.04] dark:text-dark-900 dark:hover:bg-dark-50"
                      }`}
                    >
                      <span className="text-[13px] font-semibold">
                        {item.label}
                      </span>
                      {item.section && (
                        <span
                          className={`text-[10.5px] ${
                            i === cursor
                              ? "text-brand/70"
                              : "text-neutral-400 dark:text-white/40"
                          }`}
                        >
                          {item.section}
                        </span>
                      )}
                    </Link>
                  ))
                )}
                <p className="mt-2 px-2 text-[10.5px] text-neutral-400 dark:text-white/40">
                  ↑↓ to move · ↵ to open · esc to clear
                </p>
              </div>
            ) : (
              <>
                {/* Pinned — the handful of pages people open every day */}
                <div className={GROUP_LABEL_CLASS}>Pinned</div>
                <div className="flex flex-col">
                  {isHrFullAccess && (
                    <NavLinkRow
                      to="/hr/dashboard"
                      icon={<BarChart3 className="h-3.5 w-3.5" />}
                      label="HR Dashboard"
                      active={
                        location.pathname === "/hr" ||
                        pathMatches(location.pathname, "/hr/dashboard")
                      }
                    />
                  )}
                  <NavLinkRow
                    to="/hr/handbook"
                    icon={<BookOpen className="h-3.5 w-3.5" />}
                    label="Employee Handbook"
                    active={pathMatches(location.pathname, "/hr/handbook")}
                    emphasis
                  />
                  {isHrFullAccess && (
                    <NavLinkRow
                      to="/hr/announcements"
                      icon={<Megaphone className="h-3.5 w-3.5" />}
                      label="Announcements"
                      active={pathMatches(
                        location.pathname,
                        "/hr/announcements",
                      )}
                    />
                  )}
                  <NavLinkRow
                    to="/hr/employee-files"
                    icon={<Folder className="h-3.5 w-3.5" />}
                    label="Employee Files"
                    active={pathMatches(location.pathname, "/hr/employee-files")}
                  />
                </div>

                {isHrFullAccess ? (
                  <>
                    {sectionsByGroup.map(({ group, sections }, groupIndex) => (
                      <div key={group}>
                        <div className="flex items-baseline justify-between">
                          <div className={GROUP_LABEL_CLASS}>
                            {NAV_GROUP_LABELS[group]}
                          </div>
                          {groupIndex === 0 && (
                            <button
                              type="button"
                              onClick={toggleAllSections}
                              className="pr-2 pt-4 text-[11px] font-medium text-neutral-400 hover:text-brand dark:text-white/40"
                            >
                              {anyExpanded ? "Collapse all" : "Expand all"}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col">
                          {sections.map((section) => (
                            <NavSection
                              key={section.key}
                              section={section}
                              expanded={!!expandedSections[section.key]}
                              pathname={location.pathname}
                              onToggle={toggleSection}
                            />
                          ))}
                        </div>
                      </div>
                    ))}

                    <div className={GROUP_LABEL_CLASS}>Portals</div>
                    <NavLinkRow
                      to="/hr/self-service/manager-portal"
                      icon={<Users className="h-3.5 w-3.5" />}
                      label="Manager Portal"
                      active={pathMatches(
                        location.pathname,
                        "/hr/self-service/manager-portal",
                      )}
                    />
                  </>
                ) : (
                  <>
                    <div className={GROUP_LABEL_CLASS}>Your HR</div>
                    <div className="flex flex-col">
                      <NavLinkRow
                        to="/hr/onboarding/your-onboarding"
                        icon={<UserCheck className="h-3.5 w-3.5" />}
                        label="Your Onboarding"
                        active={pathMatches(
                          location.pathname,
                          "/hr/onboarding/your-onboarding",
                        )}
                      />
                      <NavLinkRow
                        to="/hr/data/employee-profiles"
                        icon={<UserCircle className="h-3.5 w-3.5" />}
                        label="Employee Profiles"
                        active={pathMatches(
                          location.pathname,
                          "/hr/data/employee-profiles",
                        )}
                      />
                      <NavLinkRow
                        to="/hr/data/org-chart"
                        icon={<Network className="h-3.5 w-3.5" />}
                        label="Org Chart"
                        active={pathMatches(
                          location.pathname,
                          "/hr/data/org-chart",
                        )}
                      />
                      <NavLinkRow
                        to="/hr/compliance/document-acknowledgment"
                        icon={<Shield className="h-3.5 w-3.5" />}
                        label="Document Acknowledgment"
                        active={pathMatches(
                          location.pathname,
                          "/hr/compliance/document-acknowledgment",
                        )}
                      />
                    </div>

                    <div className={GROUP_LABEL_CLASS}>Portals</div>
                    <NavLinkRow
                      to="/hr/self-service/manager-portal"
                      icon={<Users className="h-3.5 w-3.5" />}
                      label="Manager Portal"
                      active={pathMatches(
                        location.pathname,
                        "/hr/self-service/manager-portal",
                      )}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <main className="flex-1 min-w-0 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
};

export default HrLayout;
