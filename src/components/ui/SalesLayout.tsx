import React, { useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import { LogOut } from "lucide-react"
import { Button } from './Button';
import { HeaderBar } from './HeaderBar';

interface SalesLayoutProps {
  children: React.ReactNode;
}

export const SalesLayout: React.FC<SalesLayoutProps> = ({ children }) => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const searchParams = new URLSearchParams(location.search);
  const isEmbed = searchParams.get('embed') === 'true';

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

  if (isEmbed) {
    return (
      <div className="min-h-screen bg-white dark:bg-dark-150">
        <main className="p-0">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-dark-background">
      <div className="sticky top-0 z-30 w-full shrink-0 print:hidden border-b border-gray-200 dark:border-dark-200">
        <HeaderBar />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-64 min-w-64 flex-shrink-0 flex flex-col border-r border-black/10 bg-white dark:bg-dark-150 dark:border-dark-200">
            <div className="flex flex-col gap-1 p-4 flex-grow overflow-y-auto">
              <div className="flex flex-col gap-1">
                <Link to="/sales-dashboard">
                  <Button
                    variant="ghost"
                    className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                      location.pathname === '/sales-dashboard' ? 'bg-black/5 dark:bg-dark-50' : ''
                    }`}
                  >
                    Sales Dashboard
                  </Button>
                </Link>

                <Link to="/sales-dashboard/opportunities">
                  <Button
                    variant="ghost"
                    className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                      location.pathname === '/sales-dashboard/opportunities' ? 'bg-black/5 dark:bg-dark-50' : ''
                    }`}
                  >
                    Opportunities
                  </Button>
                </Link>

                <Link to="/sales-dashboard/opportunities/calendar">
                  <Button
                    variant="ghost"
                    className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                      location.pathname === '/sales-dashboard/opportunities/calendar' ? 'bg-black/5 dark:bg-dark-50' : ''
                    }`}
                  >
                    Proposal due calendar
                  </Button>
                </Link>

                <Link to="/sales/goals">
                  <Button
                    variant="ghost"
                    className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                      location.pathname.startsWith('/sales/goals') ? 'bg-black/5 dark:bg-dark-50' : ''
                    }`}
                  >
                    Sales Goals
                  </Button>
                </Link>

                <Link to="/sales/pipeline-calendar">
                  <Button
                    variant="ghost"
                    className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                      location.pathname === '/sales/pipeline-calendar' ? 'bg-black/5 dark:bg-dark-50' : ''
                    }`}
                  >
                    Pipeline Calendar
                  </Button>
                </Link>

                <Link to="/sales-dashboard/customers" state={{ from: 'sales' }}>
                  <Button
                    variant="ghost"
                    className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                      location.pathname.startsWith('/customers') || location.pathname.startsWith('/sales-dashboard/customers') ? 'bg-black/5 dark:bg-dark-50' : ''
                    }`}
                  >
                    Customers
                  </Button>
                </Link>

                <Link to="/sales-dashboard/contacts" state={{ from: 'sales' }}>
                  <Button
                    variant="ghost"
                    className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                      location.pathname.startsWith('/contacts') || location.pathname.startsWith('/sales-dashboard/contacts') ? 'bg-black/5 dark:bg-dark-50' : ''
                    }`}
                  >
                    Contacts
                  </Button>
                </Link>

                <Link to="/sales/estimating-presets">
                  <Button
                    variant="ghost"
                    className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                      location.pathname === '/sales/estimating-presets' ? 'bg-black/5 dark:bg-dark-50' : ''
                    }`}
                  >
                    Estimating Preset Settings
                  </Button>
                </Link>
              </div>
            </div>
            <div className="p-4 border-t border-black/10 dark:border-dark-200">
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

        <main className="flex-1 min-w-0 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default SalesLayout;
