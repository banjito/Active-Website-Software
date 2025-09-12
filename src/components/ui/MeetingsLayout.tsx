import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LogOut,
  User as UserIcon,
  Settings,
  ArrowLeft,
  Menu,
  X,
  Target,
  Lightbulb,
  BarChart3,
  Mountain,
  CheckSquare,
  AlertTriangle,
  MessageSquare,
  Megaphone,
  Eye,
  Users,
  GraduationCap,
  BookOpen,
  ClipboardList,
  Phone
} from "lucide-react"
import { Button } from './Button';
import { ThemeToggle } from '../theme/theme-toggle';
import { SettingsPopup } from './SettingsPopup';
import { ProfileView } from '../profile/ProfileView';
import { AboutPopup } from './AboutPopup';
import { useMobileDetection } from '../../hooks/useMobileDetection';

interface MeetingsLayoutProps {
  children: React.ReactNode;
}

export const MeetingsLayout: React.FC<MeetingsLayoutProps> = ({ children }) => {
  const { user, signOut } = useAuth();
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

  if (!user) return <div className="min-h-screen">{children}</div>; // Should be handled by RequireAuth but good fallback

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

  const handleBackToPortal = () => {
    navigate('/portal');
  };

  const menuItems = [
    // Top Section
    {
      icon: Target,
      label: "My Data",
      path: "/meetings/my-90",
      active: location.pathname === "/meetings/my-90"
    },
    
    // First Group
    {
      icon: Lightbulb,
      label: "Insights",
      path: "/meetings/insights",
      active: location.pathname === "/meetings/insights"
    },
    
    // Separator
    { type: "separator" },
    
    // Second Group
    {
      icon: BarChart3,
      label: "Data",
      path: "/meetings/data",
      active: location.pathname === "/meetings/data"
    },
    {
      icon: Mountain,
      label: "Rocks",
      path: "/meetings/rocks",
      active: location.pathname === "/meetings/rocks"
    },
    {
      icon: CheckSquare,
      label: "To-Dos",
      path: "/meetings/todos",
      active: location.pathname === "/meetings/todos"
    },
    {
      icon: AlertTriangle,
      label: "Issues",
      path: "/meetings/issues",
      active: location.pathname === "/meetings/issues"
    },
    {
      icon: MessageSquare,
      label: "Meetings",
      path: "/meetings",
      active: location.pathname === "/meetings"
    },
    {
      icon: Megaphone,
      label: "Headlines",
      path: "/meetings/headlines",
      active: location.pathname === "/meetings/headlines"
    },
    
    // Separator
    { type: "separator" },
    
    // Third Group
    {
      icon: Eye,
      label: "Vision",
      path: "/meetings/vision",
      active: location.pathname === "/meetings/vision"
    },
    {
      icon: Users,
      label: "Responsibilities",
      path: "/meetings/responsibilities",
      active: location.pathname === "/meetings/responsibilities"
    },
    {
      icon: GraduationCap,
      label: "Knowledge",
      path: "/meetings/knowledge",
      active: location.pathname === "/meetings/knowledge"
    },
    {
      icon: BookOpen,
      label: "Process",
      path: "/meetings/process",
      active: location.pathname === "/meetings/process"
    },
    {
      icon: Phone,
      label: "Directory",
      path: "/meetings/directory",
      active: location.pathname === "/meetings/directory"
    },
    {
      icon: GraduationCap,
      label: "Mastery",
      path: "/meetings/mastery",
      active: location.pathname === "/meetings/mastery"
    },
    {
      icon: ClipboardList,
      label: "Assessments",
      path: "/meetings/assessments",
      active: location.pathname === "/meetings/assessments"
    }
  ];

  const renderMenuItems = () => {
    return menuItems.map((item, index) => {
      if (item.type === "separator") {
        return (
          <div key={index} className="my-2 border-t border-gray-200 dark:border-gray-700"></div>
        );
      }

      const Icon = item.icon as React.ComponentType<{ className?: string }>;
      return (
        <Link
          key={index}
          to={item.path!}
          onClick={() => setIsMobileSidebarOpen(false)}
          className={`
            flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors
            ${item.active 
              ? 'bg-gray-100 dark:bg-dark-100 text-gray-900 dark:text-white' 
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-100 hover:text-gray-900 dark:hover:text-white'
            }
          `}
        >
          <Icon className="h-4 w-4" />
          <span>{item.label}</span>
        </Link>
      );
    });
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
            <X className="h-5 w-5 text-gray-600 dark:text-white" />
          </button>
        </div>
        
        <div className="flex flex-col gap-1 p-3 lg:p-4 flex-grow overflow-y-auto mobile-space-y-1">
          <h2 className="px-2 text-xs font-semibold text-muted-foreground dark:text-dark-500 mb-2 mobile-nav-text">MEETINGS MENU</h2>
          <div className="flex flex-col gap-1">
            {renderMenuItems()}
          </div>
        </div>
        
        {/* Bottom Logout Button */}
        <div className="border-t border-black/10 dark:border-dark-200 p-3 lg:p-4">
          <Button
            onClick={handleBackToPortal}
            variant="outline"
            className="w-full justify-start mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Portal
          </Button>
          
          <div className="relative" ref={profileMenuRef}>
            <Button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              variant="outline"
              className="w-full justify-start"
            >
              <UserIcon className="h-4 w-4 mr-2" />
              {user?.email || 'Profile'}
            </Button>
            
            {isProfileMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-full bg-white dark:bg-dark-150 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50">
                <button
                  onClick={handleViewProfile}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-100 flex items-center gap-2"
                >
                  <UserIcon className="h-4 w-4" />
                  View Profile
                </button>
                <button
                  onClick={handleSettings}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-100 flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </button>
                <button
                  onClick={handleAbout}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-100 flex items-center gap-2"
                >
                  <Eye className="h-4 w-4" />
                  About
                </button>
                <hr className="my-1 border-gray-200 dark:border-gray-700" />
                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-dark-100 flex items-center gap-2 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  {isSigningOut ? 'Signing out...' : 'Sign out'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-150">
          <button
            onClick={() => setIsMobileSidebarOpen(true)}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-dark-100"
          >
            <Menu className="h-5 w-5 text-gray-600 dark:text-white" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Meetings Portal</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Modals */}
      {settingsMenuOpen && (
        <SettingsPopup
          isOpen={settingsMenuOpen}
          onClose={() => setSettingsMenuOpen(false)}
        />
      )}
      
      {isProfileViewOpen && (
        <ProfileView
          isOpen={isProfileViewOpen}
          onClose={() => setIsProfileViewOpen(false)}
        />
      )}
      
      {isAboutOpen && (
        <AboutPopup
          isOpen={isAboutOpen}
          onClose={() => setIsAboutOpen(false)}
        />
      )}
    </div>
  );
};
