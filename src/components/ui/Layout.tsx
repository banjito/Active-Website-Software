import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useDivision } from '../../App';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  FileText,
  LogOut,
  MapPin,
  User as UserIcon,
  Settings,
  Eye,
  ArrowLeft,
  Menu,
  X
} from "lucide-react"
import { Button } from './Button';
import { ThemeToggle } from '../theme/theme-toggle';
import { SettingsPopup } from './SettingsPopup';
import { ProfileView } from '../profile/ProfileView';
import { AboutPopup } from './AboutPopup';
import { useMobileDetection } from '../../hooks/useMobileDetection';
import { CommunityBoardPopover } from '@/components/community/CommunityBoardPopover';
import { HeaderBar } from './HeaderBar';

interface LayoutProps {
  children: React.ReactNode;
}

/** Job sub-routes that use Layout but are not equipment report forms. */
const NON_REPORT_JOB_SUBROUTES = new Set([
  'generated-document',
  'deliverable',
  'custom-form',
]);

/** True when viewing an equipment report form (components/reports), e.g. /jobs/:id/switchgear-report/:reportId */
function isReportFormPath(pathname: string): boolean {
  const parts = pathname.split('/').filter(Boolean);
  const jobsIndex = parts.indexOf('jobs');
  if (jobsIndex === -1) return false;
  if (parts.length < jobsIndex + 3) return false;
  const reportSlug = parts[jobsIndex + 2];
  if (!reportSlug || NON_REPORT_JOB_SUBROUTES.has(reportSlug)) return false;
  return true;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, signOut } = useAuth();
  const { division } = useDivision();
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile, deviceType } = useMobileDetection();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [isProfileViewOpen, setIsProfileViewOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isFieldTech = division === 'field_tech';
  // Base path for list views (no dashboard in sidebar)
  const basePath = division ? (isFieldTech ? '/field-tech' : `/${division}`) : '';

  // Remember "Global Portal" so Jobs link stays /all-jobs after visiting Contacts/Customers etc.
  // Only clear when user is on a real division's jobs or dashboard page (e.g. /north_alabama/jobs), not when on /neta/contacts
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const isOnDivisionJobsOrDashboard = pathSegments.length >= 2 &&
    ['north_alabama', 'tennessee', 'georgia', 'international', 'engineering', 'field-tech', 'calibration', 'armadillo', 'scavenger'].includes(pathSegments[0]) &&
    (pathSegments[1] === 'jobs' || pathSegments[1] === 'dashboard');
  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    if (location.pathname === '/all-jobs') sessionStorage.setItem('useGlobalJobs', 'true');
    else if (isOnDivisionJobsOrDashboard) sessionStorage.setItem('useGlobalJobs', 'false');
  }, [location.pathname, isOnDivisionJobsOrDashboard]);
  const useGlobalJobs = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('useGlobalJobs') === 'true';
  
  const isReportPage = isReportFormPath(location.pathname);
  
  const getJobIdFromReportPath = (): string | null => {
    if (!isReportPage) return null;
    const pathParts = location.pathname.split('/');
    const jobsIndex = pathParts.findIndex(part => part === 'jobs');
    if (jobsIndex !== -1 && jobsIndex + 1 < pathParts.length) {
      return pathParts[jobsIndex + 1];
    }
    return null;
  };
  
  const jobId = getJobIdFromReportPath();

  // Global report lock: prevent editing approved/sent reports across ALL report types
  const [isReportLocked, setIsReportLocked] = useState(false);
  // Track whether the "Mark Ready to Review" button should be hidden
  // (hidden when status is ready_for_review, approved, or sent)
  const [hideReadyToReview, setHideReadyToReview] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setIsReportLocked(false); // Reset on route change
    setHideReadyToReview(false);

    const checkLock = async () => {
      if (!isReportPage) return;
      const pathParts = location.pathname.split('/').filter(Boolean);
      const jobsIndex = pathParts.indexOf('jobs');
      if (jobsIndex === -1 || pathParts.length < jobsIndex + 4) return;

      // Build the full path after /jobs/ to construct the file_url
      // This handles both standard paths (/jobs/{id}/{slug}/{reportId})
      // and substation paths (/jobs/{id}/{slug}/{substation}/{reportId})
      const afterJobs = pathParts.slice(jobsIndex + 1).join('/');
      const jId = pathParts[jobsIndex + 1];
      // The last segment is always the reportId
      const lastSegment = pathParts[pathParts.length - 1];

      try {
        // The approval status is stored directly on the assets table
        // Build the exact file_url from the full path: report:/jobs/{jobId}/{slug}/{reportId}
        // or: report:/jobs/{jobId}/{slug}/{substation}/{reportId}
        const fileUrl = `report:/jobs/${afterJobs}`;
        const { data: asset } = await supabase
          .schema('neta_ops')
          .from('assets')
          .select('id, status')
          .eq('file_url', fileUrl)
          .maybeSingle();

        let assetStatus: string | null = (asset as any)?.status || null;

        // If exact match didn't find it, try broader suffix match on the last segment (reportId)
        if (!assetStatus) {
          const { data: assetsBySuffix } = await supabase
            .schema('neta_ops')
            .from('assets')
            .select('id, status, file_url')
            .ilike('file_url', `%/${lastSegment}`);
          if (Array.isArray(assetsBySuffix) && assetsBySuffix.length > 0) {
            const candidate = assetsBySuffix.find(a =>
              (a.file_url || '').startsWith(`report:/jobs/${jId}/`)
            ) || assetsBySuffix.find(a =>
              (a.file_url || '').startsWith('report:/jobs/')
            ) || assetsBySuffix[0];
            assetStatus = (candidate as any)?.status || null;
          }
        }

        if (!isCancelled) {
          const s = String(assetStatus || '').toLowerCase();
          if (s === 'approved' || s === 'sent') {
            setIsReportLocked(true);
            setHideReadyToReview(true);
          } else if (s === 'ready_for_review') {
            setHideReadyToReview(true);
          }
        }
      } catch {
        // Silent fallback
      }
    };

    if (typeof window !== 'undefined' && isReportPage) {
      checkLock();
    }

    return () => { isCancelled = true; };
  }, [location.pathname, isReportPage]);

  // DOM-level lock enforcement via MutationObserver
  // Works for ALL reports regardless of whether they use ReportWrapper
  useEffect(() => {
    if (!isReportLocked) return;

    const lockAllFormElements = () => {
      // Target both #report-container and the main content area
      const containers = [
        document.getElementById('report-container'),
        document.querySelector('main')
      ].filter(Boolean) as HTMLElement[];

      containers.forEach(container => {
        // Disable all inputs, selects, textareas (only set if not already locked to avoid extra mutations)
        const formElements = container.querySelectorAll('input, select, textarea');
        formElements.forEach((el) => {
          const element = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
          if (element.tagName === 'SELECT') {
            if (!(element as HTMLSelectElement).disabled) (element as HTMLSelectElement).disabled = true;
          } else {
            const input = element as HTMLInputElement;
            if (!input.readOnly) input.readOnly = true;
            if (!input.disabled) input.disabled = true;
          }
          if (element.style.pointerEvents !== 'none') element.style.pointerEvents = 'none';
        });

        // Hide Edit Report, Save, and modifier buttons
        const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
        buttons.forEach((btn) => {
          const text = (btn.textContent || '').trim().toLowerCase();
          if (
            text === 'edit report' ||
            text === 'save report' ||
            text === 'save' ||
            text === 'save & close' ||
            text === 'add row' ||
            text === 'add bus section' ||
            text === 'add test' ||
            text === 'add section' ||
            text === 'remove' ||
            text === 'delete' ||
            text === 'mark ready to review' ||
            text === 'mark as ready to review' ||
            text === 'submit for review' ||
            text.startsWith('add ') ||
            text.startsWith('remove ') ||
            text.startsWith('delete ')
          ) {
            btn.style.display = 'none';
          }
          // Disable PASS/FAIL toggle buttons
          if (text === 'pass' || text === 'fail') {
            btn.disabled = true;
            btn.style.pointerEvents = 'none';
            btn.style.cursor = 'not-allowed';
          }
        });
      });
    };

    // Run immediately
    lockAllFormElements();
    // Run again after a short delay to catch late-rendering components
    const delayTimer = setTimeout(lockAllFormElements, 500);
    const delayTimer2 = setTimeout(lockAllFormElements, 1500);

    // Use MutationObserver to re-enforce when new nodes are added (e.g. React re-renders).
    // Do NOT observe attributes (disabled/readOnly) — we set those ourselves, which would
    // retrigger the observer and cause an infinite loop that freezes the tab.
    const mainEl = document.querySelector('main');
    let observer: MutationObserver | null = null;
    if (mainEl) {
      observer = new MutationObserver(() => {
        lockAllFormElements();
      });
      observer.observe(mainEl, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      clearTimeout(delayTimer);
      clearTimeout(delayTimer2);
      if (observer) observer.disconnect();
    };
  }, [isReportLocked]);

  // Hide "Mark Ready to Review" button when status is ready_for_review, approved, or sent
  // This runs separately from the full lock since ready_for_review reports are still editable
  useEffect(() => {
    if (!hideReadyToReview) return;

    const hideReviewButton = () => {
      const mainEl = document.querySelector('main');
      if (!mainEl) return;
      const buttons = Array.from(mainEl.querySelectorAll('button')) as HTMLButtonElement[];
      buttons.forEach((btn) => {
        const text = (btn.textContent || '').trim().toLowerCase();
        if (text === 'mark ready to review' || text === 'mark as ready to review' || text === 'submit for review') {
          btn.style.display = 'none';
          // Also hide the parent container div if it's a wrapper just for this button
          const parent = btn.parentElement;
          if (parent && parent.children.length === 1 && parent.classList.contains('flex')) {
            parent.style.display = 'none';
          }
        }
      });
    };

    // Run immediately and with delays
    hideReviewButton();
    const t1 = setTimeout(hideReviewButton, 500);
    const t2 = setTimeout(hideReviewButton, 1500);

    // MutationObserver to catch late renders
    const mainEl = document.querySelector('main');
    let observer: MutationObserver | null = null;
    if (mainEl) {
      observer = new MutationObserver(() => { hideReviewButton(); });
      observer.observe(mainEl, { childList: true, subtree: true });
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (observer) observer.disconnect();
    };
  }, [hideReadyToReview]);

  // Inject CSS-level lock styles for approved/sent reports
  useEffect(() => {
    if (!isReportLocked) return;
    const styleId = 'report-locked-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      main .report-locked-banner { display: flex !important; }
      main input, main select, main textarea {
        pointer-events: none !important;
        cursor: not-allowed !important;
      }
      #report-container input, #report-container select, #report-container textarea {
        pointer-events: none !important;
        cursor: not-allowed !important;
      }
      @media print {
        .report-locked-banner,
        main .report-locked-banner { display: none !important; visibility: hidden !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, [isReportLocked]);

  // Format division name for display (no dashboard label)
  function formatDivisionName(divisionValue: string | null): string {
    if (!divisionValue) return 'AMP Portal';
    const divisionMap: { [key: string]: string } = {
      'neta': 'Global Portal',
      'north_alabama': 'Alabama Division',
      'northAlabama': 'Alabama Division',
      'tennessee': 'Tennessee Division',
      'georgia': 'Georgia Division',
      'international': 'International Division',
      'calibration': 'Calibration Division',
      'armadillo': 'Armadillo Division',
      'scavenger': 'Scavenger Division',
      'engineering': 'Engineering Portal',
      'field_tech': 'Field Technician Portal',
      'Decatur': 'Alabama Division (Decatur)'
    };
    return divisionMap[divisionValue] || 'All Divisions';
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
      // Close mobile sidebar when clicking outside
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setIsMobileSidebarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileMenuRef, sidebarRef]);

  // Close mobile sidebar when route changes
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  if (!user) return <div className="min-h-screen">{children}</div>;

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      // Force reload to clear any remaining state
      window.location.replace('/login');
    } catch (error) {
      console.error('Error signing out:', error);
      // Force reload even on error
      window.location.replace('/login');
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

  const searchParams = new URLSearchParams(location.search);
  const isEmbed = searchParams.get('embed') === 'true';
  const isEmbedded = searchParams.get('embedded') === 'true';
  const isMeetingsPage =
    location.pathname === '/meetings' || location.pathname.startsWith('/meetings/');
  const useHeaderBarLayout = !isMeetingsPage && !isReportPage;

  // If embedded mode, render children without any chrome
  if (isEmbedded) {
    return <div className="min-h-screen w-full">{children}</div>;
  }

  // Render the appropriate menu items
  const renderMenuItems = () => {
      // Check if user is Office Admin or if we're in the Office Administration Portal
      const isOfficeAdmin = user?.user_metadata?.role === 'Office Admin';
      const isOfficePortal = location.pathname.startsWith('/office');
      const hideJobsAndScheduling = isOfficeAdmin || isOfficePortal;
      // Global Portal: Jobs link goes to /all-jobs when here or when user was on Global Portal (useGlobalJobs)
      const isGlobalPortal = location.pathname === '/all-jobs' || useGlobalJobs;
      
      // Default menu items for non-HR portals (no NETA dashboard link)
      return (
        <>
          {/* Office Admin menu items */}
          {(isOfficeAdmin || isOfficePortal) && (
            <>
              <Link to="/office/vendors" onClick={() => setIsMobileSidebarOpen(false)}>
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                    location.pathname === '/office/vendors' ? 'bg-black/5 dark:bg-dark-50' : ''
                  }`}
                >
                  Vendors
                </Button>
              </Link>
              <Link to="/office" onClick={() => setIsMobileSidebarOpen(false)}>
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                    location.pathname === '/office' ? 'bg-black/5 dark:bg-dark-50' : ''
                  }`}
                >
                  Vendor PO's
                </Button>
              </Link>
            </>
          )}
          
          <Link to={`${basePath}/customers`} onClick={() => setIsMobileSidebarOpen(false)}>
            <Button 
              variant="ghost" 
              className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                location.pathname.endsWith('/customers') ? 'bg-black/5 dark:bg-dark-50' : ''
              }`}
            >
              Customers
            </Button>
          </Link>
          <Link to={`${basePath}/contacts`} onClick={() => setIsMobileSidebarOpen(false)}>
            <Button 
              variant="ghost" 
              className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                location.pathname.endsWith('/contacts') ? 'bg-black/5 dark:bg-dark-50' : ''
              }`}
            >
              Contacts
            </Button>
          </Link>
          
          {/* Only show Jobs and Scheduling tabs if NOT Office Admin and NOT in Office Portal */}
          {!hideJobsAndScheduling && (
            <>
              <Link to={isGlobalPortal ? '/all-jobs' : `${basePath}/jobs`} onClick={() => setIsMobileSidebarOpen(false)}>
                <Button 
                  variant="ghost" 
                  className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                    location.pathname === '/all-jobs' || location.pathname.endsWith('/jobs') ? 'bg-black/5 dark:bg-dark-50' : ''
                  }`}
                >
                  Jobs
                </Button>
              </Link>
              <Link to={`${basePath}/scheduling`} onClick={() => setIsMobileSidebarOpen(false)}>
                <Button 
                  variant="ghost" 
                  className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                    location.pathname.endsWith('/scheduling') ? 'bg-black/5 dark:bg-dark-50' : ''
                  }`}
                >
                  Scheduling
                </Button>
              </Link>
              {/* Field Equipment - Show only for specific divisions */}
              {(division === 'north_alabama' || division === 'georgia' || division === 'tennessee' || division === 'international' || division === 'field_tech') && (
                <Link to={division === 'field_tech' ? '/field-tech/field-equipment' : `${basePath}/field-equipment`} onClick={() => setIsMobileSidebarOpen(false)}>
                  <Button 
                    variant="ghost" 
                    className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                      location.pathname.endsWith('/field-equipment') ? 'bg-black/5 dark:bg-dark-50' : ''
                    }`}
                  >
                    Field Equipment
                  </Button>
                </Link>
              )}
            </>
          )}
          {/* Features & Fixes portal - always visible */}
          <Link to={`/features-fixes`} onClick={() => setIsMobileSidebarOpen(false)}>
            <Button 
              variant="ghost" 
              className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                location.pathname === '/features-fixes' ? 'bg-black/5 dark:bg-dark-50' : ''
              }`}
            >
              Features & Fixes
            </Button>
          </Link>
          {/* Custom Report Builder - Engineering portal only */}
          {division === 'engineering' && (
            <Link to="/custom-forms/templates" onClick={() => setIsMobileSidebarOpen(false)}>
              <Button 
                variant="ghost" 
                className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                  location.pathname.startsWith('/custom-forms') ? 'bg-black/5 dark:bg-dark-50' : ''
                }`}
              >
                Custom Report Builder
              </Button>
            </Link>
          )}
        </>
      );
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

  const sidebar = !isMeetingsPage ? (
      <div 
        ref={sidebarRef}
        className={`
          fixed lg:static inset-y-0 left-0 z-50 w-64 flex-col border-r border-black/10 bg-white dark:bg-dark-150 dark:border-dark-200 flex
          transform transition-transform duration-300 ease-in-out lg:transform-none
          ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex-shrink-0 print:hidden
          ${useHeaderBarLayout ? 'lg:top-auto' : ''}
        `}
        style={{ minWidth: '16rem', maxWidth: '16rem' }}
      >
        {useHeaderBarLayout ? (
          <div className="flex h-12 items-center justify-end border-b border-black/10 dark:border-dark-200 px-4 lg:hidden">
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-dark-100"
            >
              <X className="h-5 w-5 text-gray-600 dark:text-white" />
            </button>
          </div>
        ) : (
          <div className="flex h-16 lg:h-20 items-center border-b border-black/10 dark:border-dark-200 px-4 lg:px-6">
            <Link to="/portal" onClick={() => setIsMobileSidebarOpen(false)}>
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
                alt="AMP Logo"
                className="h-10 lg:h-12 cursor-pointer hover:opacity-80 transition-opacity"
              />
            </Link>
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="ml-auto lg:hidden p-2 rounded-md hover:bg-gray-100 dark:hover:bg-dark-100"
            >
              <X className="h-5 w-5 text-gray-600 dark:text-white" />
            </button>
          </div>
        )}
        <div className="flex flex-col gap-1 p-3 lg:p-4 flex-grow overflow-y-auto mobile-space-y-1 min-w-0">
          <div className="flex flex-col gap-1 min-w-0">
            {renderMenuItems()}
          </div>
        </div>
        {/* Bottom Logout Button */}
        <div className="p-3 lg:p-4 border-t border-black/10 dark:border-dark-200">
          <Button
            variant="ghost"
            className="w-full justify-start pl-0 text-left font-medium text-red-600 hover:bg-black/5 dark:text-red-400 dark:hover:bg-dark-50 !justify-start"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {isSigningOut ? 'Signing out...' : 'Sign Out'}
          </Button>
        </div>
      </div>
  ) : null;

  const mainContent = (
        <main className="flex-1 min-w-0 p-3 sm:p-4 lg:p-6 overflow-x-auto overflow-y-auto">
          {isReportLocked && (
            <div className="report-locked-banner print:hidden mb-4 px-4 py-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg flex items-center gap-3" aria-hidden="true">
              <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">Report Locked</p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300">This report has been approved or sent and cannot be edited. To make changes, the report status must be changed first.</p>
              </div>
            </div>
          )}
          {children}
        </main>
  );

  const legacyHeader = !useHeaderBarLayout ? (
          <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/75 backdrop-blur-sm dark:bg-dark-150/75 dark:border-dark-200 shadow-sm print:hidden">
            <div className="w-full px-3 sm:px-4 lg:px-8">
              <div className="flex h-16 lg:h-20 items-center justify-between">
              <div className="flex items-center gap-2 lg:gap-4 min-w-0 flex-1 print:hidden"> {/* <-- Keep print:hidden here too */}
                {/* Mobile Menu Button — hidden when sidebar is not shown */}
                {!isMeetingsPage && (
                <button
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-md hover:bg-gray-100 dark:hover:bg-dark-100 flex-shrink-0"
                >
                  <Menu className="h-5 w-5 text-gray-600 dark:text-white" />
                </button>
                )}

                {/* Back to Job button - only show on report pages */}
                {isReportPage && jobId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/jobs/${jobId}?tab=assets`)}
                    className="flex items-center gap-1 lg:gap-2 text-[#f26722] hover:text-[#e55611] hover:bg-[#f26722]/10 dark:text-[#f26722] dark:hover:text-[#e55611] dark:hover:bg-[#f26722]/10 text-xs lg:text-sm px-2 lg:px-3"
                  >
                    <ArrowLeft className="h-3 w-3 lg:h-4 lg:w-4" />
                    <span className="hidden sm:inline">Back to Job</span>
                    <span className="sm:hidden">Back</span>
                  </Button>
                )}
                <h2 className="text-sm lg:text-lg font-semibold truncate mobile-nav-text">{location.pathname === '/all-jobs' || useGlobalJobs ? 'Global Portal' : (formatDivisionName(division) || 'AMP Portal')}</h2>
              </div>

              <div className="flex items-center gap-1 sm:gap-2 print:hidden">
                <CommunityBoardPopover triggerClassName="w-9 h-9 lg:w-10 lg:h-10" />
                <div className="relative" ref={profileMenuRef}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full w-8 h-8 lg:w-10 lg:h-10 hover:bg-gray-100 dark:hover:bg-dark-50 p-0 overflow-hidden"
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  >
                    {user?.user_metadata?.profileImage ? (
                      <img
                        src={user.user_metadata.profileImage}
                        alt="Profile"
                        className="h-8 w-8 lg:h-10 lg:w-10 rounded-full object-cover"
                      />
                    ) : (
                      <UserIcon className="h-4 w-4 lg:h-5 lg:w-5 text-gray-600 dark:text-dark-400" />
                    )}
                  </Button>

                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 lg:w-64 origin-top-right rounded-md bg-white dark:bg-dark-150 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
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
  ) : null;

  return (
    <div className={`flex min-h-screen bg-background dark:bg-dark-background ${useHeaderBarLayout ? 'flex-col' : ''}`}>
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {useHeaderBarLayout && (
        <div className="sticky top-0 z-30 w-full shrink-0 print:hidden border-b border-gray-200 dark:border-dark-200">
          <HeaderBar />
        </div>
      )}

      {useHeaderBarLayout ? (
        <div className="flex min-h-0 flex-1 min-w-0">
          {sidebar}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center px-3 py-2 border-b border-gray-200 dark:border-dark-200 lg:hidden print:hidden">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-dark-100"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5 text-gray-600 dark:text-white" />
              </button>
            </div>
            {mainContent}
          </div>
        </div>
      ) : (
        <>
          {sidebar}
          <div className="flex flex-col flex-1 lg:ml-0 min-w-0">
            {legacyHeader}
            {mainContent}
          </div>
        </>
      )}

      <SettingsPopup
        isOpen={settingsMenuOpen}
        onClose={() => setSettingsMenuOpen(false)}
        onAbout={handleAbout}
        currentUser={user}
      />

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

      <Outlet />
    </div>
  );
};

export default Layout; 