import React, { useEffect, useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { Link, useLocation } from "react-router-dom";
import { Button } from "./Button";
import { HeaderBar } from "./HeaderBar";
import { Menu, X } from "lucide-react";

interface SalesLayoutProps {
  children: React.ReactNode;
}

export const SalesLayout: React.FC<SalesLayoutProps> = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isEmbed = searchParams.get("embed") === "true";
  // Below laptop width the side menu slides in from the left instead of
  // always taking up space.
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  if (!user) return <div className="min-h-screen">{children}</div>;

  if (isEmbed) {
    return (
      <div className="min-h-screen bg-white dark:bg-dark-150">
        <main className="p-0">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-dark-background text-foreground">
      <div className="sticky top-0 z-30 w-full shrink-0 print:hidden border-b border-neutral-200 dark:border-dark-200">
        <HeaderBar />
      </div>

      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <div
          className={`fixed inset-y-0 left-0 z-50 lg:static lg:z-auto w-64 min-w-64 flex-shrink-0 flex flex-col border-r border-black/10 bg-white dark:bg-dark-150 dark:border-dark-200 transition-transform duration-300 ease-in-out lg:transform-none ${
            isMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-12 items-center justify-end border-b border-black/10 dark:border-dark-200 px-2 lg:hidden">
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="p-2 rounded-none hover:bg-neutral-100 dark:hover:bg-dark-100"
              aria-label="Close menu"
            >
              <X className="h-5 w-5 text-neutral-600 dark:text-white" />
            </button>
          </div>
          <div className="flex flex-col gap-1 p-4 flex-grow overflow-y-auto">
            <div className="flex flex-col gap-1">
              <Link to="/sales-dashboard">
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                    location.pathname === "/sales-dashboard"
                      ? "bg-black/5 dark:bg-dark-50"
                      : ""
                  }`}
                >
                  Sales Dashboard
                </Button>
              </Link>

              <Link to="/sales-dashboard/opportunities">
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                    location.pathname === "/sales-dashboard/opportunities"
                      ? "bg-black/5 dark:bg-dark-50"
                      : ""
                  }`}
                >
                  Opportunities
                </Button>
              </Link>

              <Link to="/sales-dashboard/estimates">
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                    location.pathname === "/sales-dashboard/estimates"
                      ? "bg-black/5 dark:bg-dark-50"
                      : ""
                  }`}
                >
                  Estimates
                </Button>
              </Link>

              <Link to="/sales-dashboard/opportunities/calendar">
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                    location.pathname ===
                    "/sales-dashboard/opportunities/calendar"
                      ? "bg-black/5 dark:bg-dark-50"
                      : ""
                  }`}
                >
                  Proposal due calendar
                </Button>
              </Link>

              <Link to="/sales/goals">
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                    location.pathname.startsWith("/sales/goals")
                      ? "bg-black/5 dark:bg-dark-50"
                      : ""
                  }`}
                >
                  Sales Goals
                </Button>
              </Link>

              <Link to="/sales/pipeline-calendar">
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                    location.pathname === "/sales/pipeline-calendar"
                      ? "bg-black/5 dark:bg-dark-50"
                      : ""
                  }`}
                >
                  Pipeline Projection
                </Button>
              </Link>

              <Link to="/sales-dashboard/customers" state={{ from: "sales" }}>
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                    location.pathname.startsWith("/customers") ||
                    location.pathname.startsWith("/sales-dashboard/customers")
                      ? "bg-black/5 dark:bg-dark-50"
                      : ""
                  }`}
                >
                  Customers
                </Button>
              </Link>

              <Link to="/sales-dashboard/contacts" state={{ from: "sales" }}>
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                    location.pathname.startsWith("/contacts") ||
                    location.pathname.startsWith("/sales-dashboard/contacts")
                      ? "bg-black/5 dark:bg-dark-50"
                      : ""
                  }`}
                >
                  Contacts
                </Button>
              </Link>

              <Link to="/sales/estimating-presets">
                <Button
                  variant="ghost"
                  className={`w-full justify-start pl-0 text-left font-medium text-black dark:text-dark-900 hover:bg-black/5 dark:hover:bg-dark-50 !justify-start ${
                    location.pathname === "/sales/estimating-presets"
                      ? "bg-black/5 dark:bg-dark-50"
                      : ""
                  }`}
                >
                  Estimating Presets
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center px-3 py-2 border-b border-neutral-200 dark:border-dark-200 print:hidden lg:hidden">
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="p-2 rounded-none hover:bg-neutral-100 dark:hover:bg-dark-100"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5 text-neutral-600 dark:text-white" />
            </button>
          </div>
          <main className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
};

export default SalesLayout;
