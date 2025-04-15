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
  Wrench
} from "lucide-react"
import { Button } from './Button';
import { ThemeToggle } from '../theme/theme-toggle';
import { SettingsPopup } from './SettingsPopup';
import { ProfileView } from '../profile/ProfileView';
import { AboutPopup } from './AboutPopup';
import { ChatButton } from '../chat/ChatButton';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, signOut } = useAuth();
  const { division } = useDivision();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [isProfileViewOpen, setIsProfileViewOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  console.log('Layout - Current division:', division);
  console.log('Layout - Current location:', location.pathname);

  // Determine the correct dashboard path based on context
  const dashboardPath = division ? `/${division}/dashboard` : '/portal';
  console.log('Layout - Dashboard path:', dashboardPath);
  
  // Determine the correct base path for list views based on context
  const basePath = division ? `/${division}` : '';

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
      'Decatur': 'North Alabama Division (Decatur)'
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
      'Decatur': 'North Alabama (Decatur)'
    };
    
    return dashboardMap[divisionValue] || divisionValue;
  }

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
  const dashboardDisplayName = division ? `${formatDashboardName(division)} Dashboard` : 'NETA Tech Dashboard';

  return (
    <div className="flex min-h-screen bg-background dark:bg-dark-background">
      {/* Sidebar */}
      <div className="w-64 flex-col border-r border-black/10 bg-white dark:bg-dark-150 dark:border-dark-200 flex">
        <div className="flex h-20 items-center border-b border-black/10 dark:border-dark-200 px-6">
          <Link to="/portal">
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
              alt="AMP Logo"
              className="h-12 cursor-pointer hover:opacity-80 transition-opacity"
            />
          </Link>
        </div>
        <div className="flex flex-col gap-1 p-4 flex-grow">
          <h2 className="px-2 text-xs font-semibold text-muted-foreground dark:text-dark-500">DASHBOARD MENU</h2>
          <div className="flex flex-col gap-1">
            <Link to={dashboardPath}>
              <Button
                variant="ghost"
                className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                  location.pathname === dashboardPath ? 'bg-black/5 dark:bg-dark-50' : ''
                }`}
              >
                <FileText className="mr-2 h-4 w-4" />
                {dashboardDisplayName}
              </Button>
            </Link>
            <Link to={`${basePath}/customers`}>
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
            <Link to={`${basePath}/contacts`}>
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
            <Link to={`${basePath}/jobs`}>
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
            <Link to={`${basePath}/scheduling`}>
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
            <Link to={`${basePath}/equipment`}>
              <Button 
                variant="ghost" 
                className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                  location.pathname.endsWith('/equipment') ? 'bg-black/5 dark:bg-dark-50' : ''
                }`}
              >
                <Wrench className="mr-2 h-4 w-4" />
                Equipment
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1">
        <header className="sticky top-0 z-30 w-full border-b border-gray-200 bg-white/75 backdrop-blur-sm dark:bg-dark-150/75 dark:border-dark-200">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="flex h-20 items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{formatDivisionName(division)}</h2>
              </div>
              <div className="flex items-center">
                <div className="mr-2">
                  <ChatButton />
                </div>
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
                    <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-md bg-white dark:bg-dark-100 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
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

      <Outlet />
    </div>
  );
};

export default Layout; 