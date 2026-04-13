import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import {
  LogOut,
  MapPin,
  User as UserIcon,
  Settings,
  FileText,
  Eye,
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
  ChevronDown,
  ChevronRight,
  Megaphone,
  Phone,
  UserCheck
} from "lucide-react"
import { Button } from './Button';
import { ThemeToggle } from '../theme/theme-toggle';
import { SettingsPopup } from './SettingsPopup';
import { ProfileView } from '../profile/ProfileView';
import { AboutPopup } from './AboutPopup';
import { SidebarShortcuts } from '@/components/shortcuts/SidebarShortcuts';
import { useMyMenuEnabled } from '@/lib/userPrefs';

interface HrLayoutProps {
  children: React.ReactNode;
}

interface MenuItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

interface MenuSection {
  key: string;
  label: string;
  icon: React.ReactNode;
  items: MenuItem[];
}

export const HrLayout: React.FC<HrLayoutProps> = ({ children }) => {
  const { user, signOut, refreshUser } = useAuth();
  const { checkPortalAccess, getUserRole } = usePermissions();
  const userRole = getUserRole();
  const isHrFullAccess = userRole === 'Admin' || userRole === 'Super Admin';
  const location = useLocation();
  const navigate = useNavigate();

  // Force a fresh role check from the server when entering the HR portal so role changes take effect immediately
  const hasRefreshed = useRef(false);
  useEffect(() => {
    if (!hasRefreshed.current && user) {
      hasRefreshed.current = true;
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user) {
          const freshRole = data.user.user_metadata?.role;
          const cachedRole = user.user_metadata?.role;
          if (freshRole !== cachedRole) {
            console.log('[HrLayout] Role mismatch detected, refreshing session:', { cachedRole, freshRole });
            refreshUser();
          }
        }
      }).catch(() => {});
    }
  }, [user]);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [isProfileViewOpen, setIsProfileViewOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [myMenuEnabled] = useMyMenuEnabled(user?.id);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
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
  });

  // Auto-expand section if current path matches
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/hr/recruiting')) {
      setExpandedSections(prev => ({ ...prev, recruiting: true }));
    } else if (path.startsWith('/hr/offers')) {
      setExpandedSections(prev => ({ ...prev, offers: true }));
    } else if (path.startsWith('/hr/onboarding')) {
      setExpandedSections(prev => ({ ...prev, onboarding: true }));
    } else if (path.startsWith('/hr/dashboard') || path.startsWith('/hr/data')) {
      setExpandedSections(prev => ({ ...prev, hrData: true }));
    } else if (path.startsWith('/hr/time-attendance')) {
      setExpandedSections(prev => ({ ...prev, timeAttendance: true }));
    } else if (path.startsWith('/hr/performance')) {
      setExpandedSections(prev => ({ ...prev, performance: true }));
    } else if (path.startsWith('/hr/compliance')) {
      setExpandedSections(prev => ({ ...prev, compliance: true }));
    } else if (path.startsWith('/hr/offboarding')) {
      setExpandedSections(prev => ({ ...prev, offboarding: true }));
    } else if (path.startsWith('/hr/integrations')) {
      setExpandedSections(prev => ({ ...prev, integrations: true }));
    } else if (path.startsWith('/hr/analytics')) {
      setExpandedSections(prev => ({ ...prev, analytics: true }));
    }
  }, [location.pathname]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Effect to close profile dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileMenuRef]);

  const searchParams = new URLSearchParams(location.search);
  const isEmbed = searchParams.get('embed') === 'true';

  // All authenticated users get limited HR access (employee files, profiles, doc acknowledgment, manager portal).
  // Only Admin/Super Admin get the full HR portal.
  const HR_LIMITED_ALLOWED_PATHS = ['/hr/employee-files', '/hr/data/employee-profiles', '/hr/data/org-chart', '/hr/compliance/document-acknowledgment', '/hr/self-service/manager-portal'];
  const isPathAllowedForLimited = HR_LIMITED_ALLOWED_PATHS.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));
  if (!isHrFullAccess && !isPathAllowedForLimited) {
    return <Navigate to="/hr/employee-files" replace />;
  }

  if (!user) return <div className="min-h-screen">{children}</div>;

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      window.location.href = '/login';
    } catch (error) {
      console.error('Error signing out:', error);
      window.location.href = '/login';
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleViewProfile = () => {
    setIsProfileMenuOpen(false);
    setIsProfileViewOpen(true);
  };

  const handleSettings = () => {
    setIsProfileMenuOpen(false);
    setSettingsMenuOpen(true);
  };

  const handleAbout = () => {
    setIsProfileMenuOpen(false);
    setIsAboutOpen(true);
  };

  if (isEmbed) {
    return (
      <div className="min-h-screen bg-white dark:bg-dark-150">
        <main className="p-0">
          {children}
        </main>
      </div>
    );
  }

  // Helper component for collapsible menu sections
  const CollapsibleSection: React.FC<{ section: MenuSection }> = ({ section }) => {
    const isExpanded = expandedSections[section.key];
    const hasActiveItem = section.items.some(item => location.pathname.startsWith(item.path));

    return (
      <div>
        <button
          onClick={() => toggleSection(section.key)}
          className={`w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium text-muted-foreground dark:text-dark-500 mt-3 mb-1 hover:text-gray-900 dark:hover:text-white transition-colors ${
            hasActiveItem ? 'text-gray-900 dark:text-white' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-3.5">{section.icon}</div>
            <span>{section.label}</span>
          </div>
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        {isExpanded && (
          <div className="flex flex-col gap-0.5 pl-2">
            {section.items.map((item) => (
              <Link key={item.path} to={item.path}>
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left text-xs font-normal text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start h-8 ${
                    location.pathname.startsWith(item.path) ? 'bg-black/5 dark:bg-dark-50' : ''
                  }`}
                >
                  {item.label}
                </Button>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  const menuSections: MenuSection[] = [
    {
      key: 'recruiting',
      label: 'Recruiting',
      icon: <Briefcase className="h-3.5 w-3.5" />,
      items: [
        { path: '/hr/recruiting/job-requisitions', label: 'Job Requisitions', icon: <Briefcase className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/recruiting/requisition-approvals', label: 'Requisition Approvals', icon: <FileCheck className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/recruiting/career-page', label: 'Career Page', icon: <Building2 className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/recruiting/candidate-tracking', label: 'Candidate Tracking (ATS)', icon: <Users className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/recruiting/interview-scheduling', label: 'Interview Scheduling', icon: <Calendar className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/recruiting/resume-parsing', label: 'Resume Parsing', icon: <FileTextIcon className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/recruiting/candidate-communication', label: 'Candidate Communication', icon: <Mail className="mr-2 h-3.5 w-3.5" /> },
      ],
    },
    {
      key: 'offers',
      label: 'Offers',
      icon: <FileText className="h-3.5 w-3.5" />,
      items: [
        { path: '/hr/offers/offer-letters', label: 'Offer Letters', icon: <FileText className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/offers/offer-approvals', label: 'Offer Approvals', icon: <FileCheck className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/offers/e-signatures', label: 'E-Signatures', icon: <FileCheck className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/offers/comp-position-details', label: 'Comp/Position Details', icon: <DollarSign className="mr-2 h-3.5 w-3.5" /> },
      ],
    },
    {
      key: 'onboarding',
      label: 'Onboarding',
      icon: <UserPlus className="h-3.5 w-3.5" />,
      items: [
        { path: '/hr/onboarding/your-onboarding', label: 'Your Onboarding', icon: <UserCheck className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/onboarding/tracking', label: 'Onboarding Tracking', icon: <ClipboardList className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/onboarding/new-hire-packets', label: 'New Hire Packets', icon: <Folder className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/onboarding/e-sign-forms', label: "E-Sign Forms", icon: <FileCheck className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/onboarding/checklists', label: 'Checklists', icon: <CheckSquare className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/onboarding/welcome-emails', label: 'Welcome Emails', icon: <Mail className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/onboarding/it-equipment-tasks', label: 'IT/Equipment Tasks', icon: <Laptop className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/onboarding/it-onboarding', label: 'IT Onboarding', icon: <ClipboardCheck className="mr-2 h-3.5 w-3.5" /> },
      ],
    },
    {
      key: 'hrData',
      label: 'HR Data',
      icon: <UserCircle className="h-3.5 w-3.5" />,
      items: [
        { path: '/hr/dashboard', label: 'HR Dashboard', icon: <BarChart3 className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/data/employee-profiles', label: 'Employee Profiles', icon: <UserCircle className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/data/job-title-history', label: 'Job/Title History', icon: <History className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/data/compensation-history', label: 'Compensation History', icon: <DollarSign className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/data/org-chart', label: 'Org Chart', icon: <Network className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/data/call-list', label: 'Call list', icon: <Phone className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/data/reporting', label: 'Reporting', icon: <FileBarChart className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/data/custom-tabs', label: 'Custom Tabs', icon: <FolderOpen className="mr-2 h-3.5 w-3.5" /> },
      ],
    },
    {
      key: 'timeAttendance',
      label: 'Time & Attendance',
      icon: <Clock className="h-3.5 w-3.5" />,
      items: [
        { path: '/hr/time-attendance/pto-leave', label: 'PTO/Leave Tracking', icon: <Calendar className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/time-attendance/accrual-policies', label: 'Accrual Policies', icon: <Clock className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/time-attendance/timesheets', label: 'Timesheets', icon: <Clock className="mr-2 h-3.5 w-3.5" /> },
      ],
    },
    {
      key: 'performance',
      label: 'Performance Reviews',
      icon: <Award className="h-3.5 w-3.5" />,
      items: [
        { path: '/hr/performance/review-cycles', label: 'Review Cycles', icon: <Award className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/performance/goals', label: 'Goals', icon: <TrendingUp className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/performance/feedback-tools', label: 'Feedback Tools', icon: <FileText className="mr-2 h-3.5 w-3.5" /> },
      ],
    },
    {
      key: 'compliance',
      label: 'Compliance',
      icon: <Shield className="h-3.5 w-3.5" />,
      items: [
        { path: '/hr/compliance/document-acknowledgment', label: 'Document Acknowledgment', icon: <FileCheck className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/compliance/e-sign-recordkeeping', label: 'E-Sign Recordkeeping', icon: <Shield className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/compliance/eeo-reporting', label: 'EEO/Reporting', icon: <FileBarChart className="mr-2 h-3.5 w-3.5" /> },
      ],
    },
    {
      key: 'offboarding',
      label: 'Offboarding',
      icon: <DoorOpen className="h-3.5 w-3.5" />,
      items: [
        { path: '/hr/offboarding/termination-workflows', label: 'Termination Workflows', icon: <DoorOpen className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/offboarding/exit-surveys', label: 'Exit Surveys', icon: <FileText className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/offboarding/final-docs', label: 'Final Docs', icon: <FileText className="mr-2 h-3.5 w-3.5" /> },
      ],
    },
    {
      key: 'integrations',
      label: 'Integrations',
      icon: <Plug className="h-3.5 w-3.5" />,
      items: [
        { path: '/hr/integrations/payroll', label: 'Payroll', icon: <DollarSign className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/integrations/background-checks', label: 'Background Checks', icon: <Shield className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/integrations/benefits-time-ats', label: 'Benefits/Time/ATS Tools', icon: <Plug className="mr-2 h-3.5 w-3.5" /> },
      ],
    },
    {
      key: 'analytics',
      label: 'Analytics',
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      items: [
        { path: '/hr/analytics/custom-reports', label: 'Custom Reports', icon: <FileBarChart className="mr-2 h-3.5 w-3.5" /> },
        { path: '/hr/analytics/export-tools', label: 'Export Tools', icon: <Download className="mr-2 h-3.5 w-3.5" /> },
      ],
    },
  ];

  return (
    <div className="flex min-h-screen bg-background dark:bg-dark-background">
      {/* Sidebar - hidden when My Menu is enabled */}
      {!myMenuEnabled && (
      <div className="w-64 min-w-[16rem] flex-shrink-0 flex-col border-r border-black/10 bg-white dark:bg-dark-150 dark:border-dark-200 flex">
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-black/10 dark:border-dark-200 px-6">
          <Link to="/portal">
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
              alt="AMP Logo"
              className="h-8 cursor-pointer hover:opacity-80 transition-opacity"
            />
          </Link>
        </div>
        {/* Sidebar Links */}
        <div className="flex flex-col gap-1 p-4 flex-grow overflow-y-auto">
          {myMenuEnabled && (
            <>
              <SidebarShortcuts />
              <h2 className="px-2 text-xs font-semibold text-muted-foreground dark:text-dark-500 mt-3">MENU</h2>
            </>
          )}
          {/* Standalone top-level items */}
          {isHrFullAccess && (
            <Link to="/hr/announcements">
              <Button
                variant="ghost"
                className={`w-full justify-start pl-0 text-left text-xs font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start h-8 ${
                  location.pathname.startsWith('/hr/announcements') ? 'bg-black/5 dark:bg-dark-50' : ''
                }`}
              >
                <Megaphone className="mr-2 h-3.5 w-3.5 text-[#f26722]" />
                Announcements
              </Button>
            </Link>
          )}

          <Link to="/hr/employee-files">
            <Button
              variant="ghost"
              className={`w-full justify-start pl-0 text-left text-xs font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start h-8 ${
                location.pathname.startsWith('/hr/employee-files') ? 'bg-black/5 dark:bg-dark-50' : ''
              }`}
            >
              <Folder className="mr-2 h-3.5 w-3.5 text-[#f26722]" />
              Employee Files
            </Button>
          </Link>

          {isHrFullAccess ? (
            <>
              <div className="flex flex-col gap-1">
                {menuSections.map((section) => (
                  <CollapsibleSection key={section.key} section={section} />
                ))}
              </div>
              <Link to="/hr/self-service/manager-portal" className="mt-auto">
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left text-xs font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start h-8 ${
                    location.pathname.startsWith('/hr/self-service/manager-portal') ? 'bg-black/5 dark:bg-dark-50' : ''
                  }`}
                >
                  <Users className="mr-2 h-3.5 w-3.5 text-[#f26722]" />
                  Manager Portal
                </Button>
              </Link>
            </>
          ) : (
            <div className="flex flex-col gap-0.5">
              <Link to="/hr/data/employee-profiles">
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left text-xs font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start h-8 ${
                    location.pathname.startsWith('/hr/data/employee-profiles') ? 'bg-black/5 dark:bg-dark-50' : ''
                  }`}
                >
                  <UserCircle className="mr-2 h-3.5 w-3.5 text-[#f26722]" />
                  Employee Profiles
                </Button>
              </Link>
              <Link to="/hr/data/org-chart">
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left text-xs font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start h-8 ${
                    location.pathname.startsWith('/hr/data/org-chart') ? 'bg-black/5 dark:bg-dark-50' : ''
                  }`}
                >
                  <Network className="mr-2 h-3.5 w-3.5 text-[#f26722]" />
                  Org Chart
                </Button>
              </Link>
              <Link to="/hr/compliance/document-acknowledgment">
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left text-xs font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start h-8 ${
                    location.pathname.startsWith('/hr/compliance/document-acknowledgment') ? 'bg-black/5 dark:bg-dark-50' : ''
                  }`}
                >
                  <Shield className="mr-2 h-3.5 w-3.5 text-[#f26722]" />
                  Document Acknowledgment
                </Button>
              </Link>
              <Link to="/hr/self-service/manager-portal">
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left text-xs font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start h-8 ${
                    location.pathname.startsWith('/hr/self-service/manager-portal') ? 'bg-black/5 dark:bg-dark-50' : ''
                  }`}
                >
                  <Users className="mr-2 h-3.5 w-3.5 text-[#f26722]" />
                  Manager Portal
                </Button>
              </Link>
            </div>
          )}
        </div>
        {/* Bottom Logout Button */}
        <div className="p-4 border-t border-black/10 dark:border-dark-200">
          <Button
            variant="ghost"
            className="w-full justify-start pl-0 text-left text-xs font-medium text-red-600 hover:bg-black/5 dark:text-red-400 dark:hover:bg-dark-50 !justify-start h-8"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            {isSigningOut ? 'Signing out...' : 'Sign Out'}
          </Button>
        </div>
      </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        {!myMenuEnabled && (
          <header className="sticky top-0 z-30 w-full border-b border-gray-200 bg-white/75 backdrop-blur-sm dark:bg-dark-150/75 dark:border-dark-200 print:hidden">
            <div className="w-full px-4 sm:px-6 lg:px-8">
              <div className="flex h-20 items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {myMenuEnabled && (
                  <Link to="/portal" className="flex-shrink-0 hidden sm:block">
                    <img
                      src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
                      alt="AMP Logo"
                      className="h-8 lg:h-10 mr-2"
                    />
                  </Link>
                )}
                <h2 className="text-base lg:text-lg font-semibold truncate">HR Portal</h2>
              </div>
              <div className="flex items-center">
                <div className="relative" ref={profileMenuRef}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full w-10 h-10 hover:bg-gray-100 dark:hover:bg-dark-50 p-0 overflow-hidden"
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  >
                    {user?.user_metadata?.profileImage ? (
                      <img
                        src={user.user_metadata.profileImage}
                        alt="Profile"
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <UserIcon className="h-5 w-5 text-gray-600 dark:text-dark-400" />
                    )}
                  </Button>
                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-md bg-white dark:bg-dark-150 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                      <div className="py-1">
                        <div className="px-4 py-2 border-b border-gray-200 dark:border-dark-200">
                          <p className="text-sm font-medium text-gray-900 dark:text-dark-900">
                            {user?.user_metadata?.name || 'User'}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-dark-400 truncate">
                            {user?.user_metadata?.role || 'No role assigned'}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-dark-500 truncate mt-1">
                            {user?.email || 'Loading...'}
                          </p>
                        </div>
                        <button
                          onClick={() => navigate('/portal')}
                          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-[#f26722] hover:bg-gray-100 dark:hover:bg-dark-50"
                        >
                          <MapPin className="mr-3 h-5 w-5 text-gray-400 dark:text-[#f26722]" />
                          Back to Portal
                        </button>
                        <button
                          onClick={handleViewProfile}
                          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-[#f26722] hover:bg-gray-100 dark:hover:bg-dark-50"
                        >
                          <Eye className="mr-3 h-5 w-5 text-gray-400 dark:text-[#f26722]" />
                          View Profile
                        </button>
                        <button
                          onClick={handleSettings}
                          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-[#f26722] hover:bg-gray-100 dark:hover:bg-dark-50"
                        >
                          <Settings className="mr-3 h-5 w-5 text-gray-400 dark:text-[#f26722]" />
                          Settings
                        </button>
                        <button
                          onClick={handleAbout}
                          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-[#f26722] hover:bg-gray-100 dark:hover:bg-dark-50"
                        >
                          <FileText className="mr-3 h-5 w-5 text-gray-400 dark:text-[#f26722]" />
                          About
                        </button>
                        <button
                          onClick={handleSignOut}
                          disabled={isSigningOut}
                          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-[#f26722] hover:bg-gray-100 dark:hover:bg-dark-50"
                        >
                          <LogOut className="mr-3 h-5 w-5 text-gray-400 dark:text-[#f26722]" />
                          {isSigningOut ? 'Signing out...' : 'Sign Out'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          </header>
        )}

        {/* Settings Popup */}
        <SettingsPopup 
          isOpen={settingsMenuOpen}
          onClose={() => setSettingsMenuOpen(false)}
          onAbout={handleAbout}
          currentUser={user}
        />

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Profile View Modal */}
      {isProfileViewOpen && (
        <ProfileView 
          isOpen={isProfileViewOpen} 
          onClose={() => setIsProfileViewOpen(false)} 
        />
      )}

      <AboutPopup
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
    </div>
  );
};

export default HrLayout;
