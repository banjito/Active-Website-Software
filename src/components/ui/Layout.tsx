import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useDivision } from '../../App';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
  Plus,
  Users,
  FileText,
  BriefcaseIcon,
  LogOut,
  MapPin,
  User as UserIcon,
  Settings,
  Eye,
  Calendar,
  Building,
  Wrench,
  GraduationCap,
  Award,
  LineChart,
  Heart,
  ClipboardList,
  ArrowLeft,
  Menu,
  X
} from "lucide-react"
import { Button } from './Button';
import { ThemeToggle } from '../theme/theme-toggle';
import { SettingsPopup } from './SettingsPopup';
import { ProfileView } from '../profile/ProfileView';
import { AboutPopup } from './AboutPopup';
import { ChatButton } from '../chat/ChatButton';
import { useMobileDetection } from '../../hooks/useMobileDetection';

interface LayoutProps {
  children: React.ReactNode;
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

  console.log('Layout - Current division:', division);
  console.log('Layout - Current location:', location.pathname);

  // Determine the correct dashboard path based on context
  const dashboardPath = division ? `/${division}/dashboard` : '/portal';
  console.log('Layout - Dashboard path:', dashboardPath);
  
  // Determine the correct base path for list views based on context
  const basePath = division ? `/${division}` : '';
  
  // Check if currently in HR portal
  const isHRPortal = location.pathname.startsWith('/hr');
  
  // Check if currently on a report page and extract job ID
  const isReportPage = location.pathname.includes('/jobs/') && 
    location.pathname.split('/').length > 3 && 
    !location.pathname.endsWith('/jobs') &&
    location.pathname.split('/')[3] !== '';
  
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

  // Format division name for display
  function formatDivisionName(divisionValue: string | null): string {
    if (!divisionValue) return 'All Divisions';
    
    const divisionMap: { [key: string]: string } = {
      'north_alabama': 'North Alabama Division',
      'northAlabama': 'North Alabama Division',
      'tennessee': 'Tennessee Division',
      'georgia': 'Georgia Division',
      'international': 'International Division',
      'calibration': 'Calibration Division',
      'armadillo': 'Armadillo Division',
      'scavenger': 'Scavenger Division',
      'engineering': 'Engineering Portal',
      'Decatur': 'North Alabama Division (Decatur)',
      'hr': 'HR Portal'
    };
    
    return divisionMap[divisionValue] || 'All Divisions';
  }

  // Format dashboard display name (without "Division")
  function formatDashboardName(divisionValue: string | null): string {
    if (!divisionValue) return 'NETA Tech';
    
    const dashboardMap: { [key: string]: string } = {
      'north_alabama': 'North Alabama',
      'northAlabama': 'North Alabama',
      'tennessee': 'Tennessee',
      'georgia': 'Georgia',
      'international': 'International',
      'calibration': 'Calibration',
      'armadillo': 'Armadillo',
      'scavenger': 'Scavenger',
      'engineering': 'Engineering Portal',
      'Decatur': 'North Alabama (Decatur)',
      'hr': 'HR Portal'
    };
    
    return dashboardMap[divisionValue] || divisionValue;
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

  // Set dashboard display name based on current division
  const dashboardDisplayName = isHRPortal ? 'HR Dashboard' : 
    (division === 'engineering' ? 'Engineering Portal' : 
    (division ? `${formatDashboardName(division)} Dashboard` : 'NETA Tech Dashboard'));

  // Render the appropriate menu items based on whether we're in the HR portal
  const renderMenuItems = () => {
    if (isHRPortal) {
      return (
        <>
          <Link to="/hr" onClick={() => setIsMobileSidebarOpen(false)}>
            <Button
              variant="ghost"
              className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                location.pathname === '/hr' && !location.hash ? 'bg-black/5 dark:bg-dark-50' : ''
              }`}
            >
              <FileText className="mr-2 h-4 w-4" />
              HR Dashboard
            </Button>
          </Link>
          <Link to="/hr#employees" onClick={() => setIsMobileSidebarOpen(false)}>
            <Button 
              variant="ghost" 
              className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                location.hash === '#employees' ? 'bg-black/5 dark:bg-dark-50' : ''
              }`}
            >
              <Users className="mr-2 h-4 w-4" />
              Employee Records
            </Button>
          </Link>
          <Link to="/hr#training" onClick={() => setIsMobileSidebarOpen(false)}>
            <Button 
              variant="ghost" 
              className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                location.hash === '#training' ? 'bg-black/5 dark:bg-dark-50' : ''
              }`}
            >
              <GraduationCap className="mr-2 h-4 w-4" />
              Training
            </Button>
          </Link>
          <Link to="/hr#certifications" onClick={() => setIsMobileSidebarOpen(false)}>
            <Button 
              variant="ghost" 
              className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                location.hash === '#certifications' ? 'bg-black/5 dark:bg-dark-50' : ''
              }`}
            >
              <Award className="mr-2 h-4 w-4" />
              Certifications
            </Button>
          </Link>
          <Link to="/hr#performance" onClick={() => setIsMobileSidebarOpen(false)}>
            <Button 
              variant="ghost" 
              className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                location.hash === '#performance' ? 'bg-black/5 dark:bg-dark-50' : ''
              }`}
            >
              <LineChart className="mr-2 h-4 w-4" />
              Performance Reviews
            </Button>
          </Link>
          <Link to="/hr#benefits" onClick={() => setIsMobileSidebarOpen(false)}>
            <Button 
              variant="ghost" 
              className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                location.hash === '#benefits' ? 'bg-black/5 dark:bg-dark-50' : ''
              }`}
            >
              <Heart className="mr-2 h-4 w-4" />
              Benefits
            </Button>
          </Link>
          <Link to="/hr#policies" onClick={() => setIsMobileSidebarOpen(false)}>
            <Button 
              variant="ghost" 
              className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                location.hash === '#policies' ? 'bg-black/5 dark:bg-dark-50' : ''
              }`}
            >
              <ClipboardList className="mr-2 h-4 w-4" />
              Policies
            </Button>
          </Link>
        </>
      );
    } else {
      // Check if user is Office Admin or if we're in the Office Administration Portal
      const isOfficeAdmin = user?.user_metadata?.role === 'Office Admin';
      const isOfficePortal = location.pathname.startsWith('/office');
      const hideJobsAndScheduling = isOfficeAdmin || isOfficePortal;
      
      // Determine the appropriate dashboard path for Office Admins or Office Portal
      const officeDashboardPath = '/office';
      const currentDashboardPath = (isOfficeAdmin || isOfficePortal) ? officeDashboardPath : dashboardPath;
      
      // Default menu items for non-HR portals
      return (
        <>
          <Link to={currentDashboardPath} onClick={() => setIsMobileSidebarOpen(false)}>
            <Button
              variant="ghost"
              className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                (isOfficeAdmin || isOfficePortal) ? 
                  location.pathname.startsWith('/office') ? 'bg-black/5 dark:bg-dark-50' : '' :
                  location.pathname === dashboardPath ? 'bg-black/5 dark:bg-dark-50' : ''
              }`}
            >
              <FileText className="mr-2 h-4 w-4" />
              {isOfficeAdmin || isOfficePortal ? 'Office Dashboard' : dashboardDisplayName}
            </Button>
          </Link>
          <Link to={`${basePath}/customers`} onClick={() => setIsMobileSidebarOpen(false)}>
            <Button 
              variant="ghost" 
              className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                location.pathname.endsWith('/customers') ? 'bg-black/5 dark:bg-dark-50' : ''
              }`}
            >
              <Building className="mr-2 h-4 w-4" />
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
              <Users className="mr-2 h-4 w-4" />
              Contacts
            </Button>
          </Link>
          
          {/* Only show Jobs and Scheduling tabs if NOT Office Admin and NOT in Office Portal */}
          {!hideJobsAndScheduling && (
            <>
              <Link to={`${basePath}/jobs`} onClick={() => setIsMobileSidebarOpen(false)}>
                <Button 
                  variant="ghost" 
                  className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                    location.pathname.endsWith('/jobs') ? 'bg-black/5 dark:bg-dark-50' : ''
                  }`}
                >
                  <BriefcaseIcon className="mr-2 h-4 w-4" />
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
                  <Calendar className="mr-2 h-4 w-4" />
                  Scheduling
                </Button>
              </Link>
            </>
          )}
        </>
      );
    }
  };

  return (
    <div className="flex min-h-screen bg-background dark:bg-dark-background">
      {/* Mobile Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div 
        ref={sidebarRef}
        className={`
          fixed lg:static inset-y-0 left-0 z-50 w-64 flex-col border-r border-black/10 bg-white dark:bg-dark-150 dark:border-dark-200 flex
          transform transition-transform duration-300 ease-in-out lg:transform-none
          ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex h-16 lg:h-20 items-center border-b border-black/10 dark:border-dark-200 px-4 lg:px-6">
          <Link to="/portal" onClick={() => setIsMobileSidebarOpen(false)}>
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
              alt="AMP Logo"
              className="h-10 lg:h-12 cursor-pointer hover:opacity-80 transition-opacity"
            />
          </Link>
          {/* Mobile Close Button */}
          <button
            onClick={() => setIsMobileSidebarOpen(false)}
            className="ml-auto lg:hidden p-2 rounded-md hover:bg-gray-100 dark:hover:bg-dark-100"
          >
            <X className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
        <div className="flex flex-col gap-1 p-3 lg:p-4 flex-grow overflow-y-auto mobile-space-y-1">
          <h2 className="px-2 text-xs font-semibold text-muted-foreground dark:text-dark-500 mb-2 mobile-nav-text">DASHBOARD MENU</h2>
          <div className="flex flex-col gap-1">
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

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 lg:ml-0">
        <header className="sticky top-0 z-30 w-full border-b border-gray-200 bg-white/75 backdrop-blur-sm dark:bg-dark-150/75 dark:border-dark-200 print:hidden"> {/* <-- Add print:hidden to entire header */}
          <div className="w-full px-3 sm:px-4 lg:px-8">
            <div className="flex h-16 lg:h-20 items-center justify-between">
              <div className="flex items-center gap-2 lg:gap-4 min-w-0 flex-1 print:hidden"> {/* <-- Keep print:hidden here too */}
                {/* Mobile Menu Button */}
                <button
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-md hover:bg-gray-100 dark:hover:bg-dark-100 flex-shrink-0"
                >
                  <Menu className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>

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
                <h2 className="text-sm lg:text-lg font-semibold truncate mobile-nav-text">{formatDivisionName(division)}</h2>
              </div>

              <div className="flex items-center print:hidden"> {/* <-- Add print:hidden to right side too */}
                <div className="hidden sm:block">
                  <ChatButton />
                </div>
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
                    <div className="absolute right-0 mt-2 w-56 lg:w-64 origin-top-right rounded-md bg-white dark:bg-dark-100 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
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

        {/* Settings Popup */}
        <SettingsPopup
          isOpen={settingsMenuOpen}
          onClose={() => setSettingsMenuOpen(false)}
          onAbout={handleAbout}
          currentUser={user}
        />

        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-y-auto">
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

      <Outlet />
    </div>
  );
};

export default Layout; 