import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useMyMenuEnabled } from '@/lib/userPrefs';
import { SidebarShortcuts } from '@/components/shortcuts/SidebarShortcuts';
import { PanelLeftOpen, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export const FloatingMyMenu: React.FC = () => {
  const { user } = useAuth();
  const [enabled] = useMyMenuEnabled(user?.id);
  const [open, setOpen] = useState<boolean>(false);
  const [hoveringHotspot, setHoveringHotspot] = useState<boolean>(false);
  const [hoveringDrawer, setHoveringDrawer] = useState<boolean>(false);
  const [closeTimer, setCloseTimer] = useState<number | null>(null);
  const [openTimer, setOpenTimer] = useState<number | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(56);
  const OPEN_DELAY = 0; // ms - open immediately for responsiveness
  const CLOSE_DELAY = 0; // ms - close immediately when hover leaves

  useEffect(() => {
    return () => {
      if (openTimer) window.clearTimeout(openTimer);
      if (closeTimer) window.clearTimeout(closeTimer);
    };
  }, [openTimer, closeTimer]);
  const navigate = useNavigate();
  const location = useLocation();
  const isPortalHome = location?.pathname === '/portal';
  const [suspendRefresh, setSuspendRefresh] = useState<boolean>(false);

  // Proactively watch localStorage for AMP_SUSPEND_REFRESH in the same tab
  useEffect(() => {
    const check = () => {
      try {
        setSuspendRefresh(localStorage.getItem('AMP_SUSPEND_REFRESH') === 'true');
      } catch {
        setSuspendRefresh(false);
      }
    };
    check();
    const id = window.setInterval(check, 300);
    return () => window.clearInterval(id);
  }, []);

  const hideOnThisRoute = (() => {
    const p = location?.pathname || '';
    // Hide header on letter proposal/editor screens and while estimate modals are open
    if (p.includes('/letter') || p.includes('/estimate')) return true;
    if (suspendRefresh) return true;
    return false;
  })();

  // Keep body padding-top in sync with header height to prevent content clipping
  useEffect(() => {
    const applyPadding = (value: number) => {
      try {
        document.body.style.paddingTop = value > 0 ? `${value}px` : '';
      } catch {}
    };
    if (enabled && !isPortalHome && !hideOnThisRoute) {
      applyPadding(headerHeight);
      const onResize = () => {
        const h = headerRef.current?.offsetHeight || headerHeight;
        setHeaderHeight(h);
        applyPadding(h);
      };
      window.addEventListener('resize', onResize);
      // Measure once after paint
      setTimeout(onResize, 0);
      return () => {
        window.removeEventListener('resize', onResize);
        applyPadding(0);
      };
    } else {
      applyPadding(0);
    }
  }, [enabled, isPortalHome, hideOnThisRoute, headerHeight]);

  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      {/* Global persistent header when My Menu is enabled (hide on portal home) */}
      {!isPortalHome && !hideOnThisRoute && (
        <>
          <div ref={headerRef} className="fixed top-0 left-0 right-0 z-[65] border-b border-gray-200 bg-white/80 backdrop-blur-sm dark:bg-dark-150/80 dark:border-dark-200 print:hidden">
            <div className="w-full px-3 sm:px-4 lg:px-6">
              <div className="flex h-12 lg:h-14 items-center justify-between">
                <button
                  onClick={() => navigate('/portal')}
                  className="flex items-center gap-2"
                  aria-label="Go to Portal"
                >
                  <img
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
                    alt="AMP Logo"
                    className="h-6 lg:h-8"
                  />
                  <span className="hidden sm:block text-sm lg:text-base font-semibold text-gray-900 dark:text-white">AMP Portal</span>
                </button>
                <button
                  onClick={() => navigate('/portal')}
                  className="rounded-full w-8 h-8 lg:w-10 lg:h-10 overflow-hidden border border-gray-200 dark:border-dark-200"
                  aria-label="Profile"
                  title={user?.email || 'Profile'}
                >
                  {user?.user_metadata?.profileImage ? (
                    <img src={user.user_metadata.profileImage} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-200 dark:bg-dark-100" />
                  )}
                </button>
              </div>
            </div>
          </div>
          {/* Spacer to offset fixed header */}
          <div className="print:hidden" style={{ height: `${headerHeight}px` }} />
        </>
      )}
      {/* Toggle tab */}
      {/* Hover hotspot to open drawer */}
      <div
        onMouseEnter={() => {
          setHoveringHotspot(true);
          if (openTimer) {
            window.clearTimeout(openTimer);
            setOpenTimer(null);
          }
          const t = window.setTimeout(() => setOpen(true), OPEN_DELAY);
          setOpenTimer(t as unknown as number);
          if (closeTimer) {
            window.clearTimeout(closeTimer);
            setCloseTimer(null);
          }
        }}
        onMouseLeave={() => {
          setHoveringHotspot(false);
          if (openTimer) {
            window.clearTimeout(openTimer);
            setOpenTimer(null);
          }
          if (closeTimer) {
            window.clearTimeout(closeTimer);
            setCloseTimer(null);
          }
          if (!hoveringDrawer) {
            setOpen(false);
          }
        }}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-[60] h-[75vh] w-8 bg-transparent print:hidden"
      />
      {/* Floating button: menu toggle */}
      <div className="fixed left-2 top-1/2 -translate-y-1/2 z-[59] flex flex-col gap-2 print:hidden">
        <button
          onClick={() => setOpen(true)}
          onMouseEnter={() => {
            if (openTimer) {
              window.clearTimeout(openTimer);
              setOpenTimer(null);
            }
            const t = window.setTimeout(() => setOpen(true), OPEN_DELAY);
            setOpenTimer(t as unknown as number);
            if (closeTimer) {
              window.clearTimeout(closeTimer);
              setCloseTimer(null);
            }
          }}
          onMouseLeave={() => {
            if (openTimer) {
              window.clearTimeout(openTimer);
              setOpenTimer(null);
            }
            if (closeTimer) {
              window.clearTimeout(closeTimer);
              setCloseTimer(null);
            }
            if (!hoveringDrawer && !hoveringHotspot) {
              setOpen(false);
            }
          }}
          className="rounded-md px-2 py-2 bg-white/90 dark:bg-dark-150 shadow border border-gray-200 dark:border-dark-200 hover:bg-white dark:hover:bg-dark-100"
          aria-label="Open My Menu"
        >
          <PanelLeftOpen className="h-5 w-5 text-gray-700 dark:text-white" />
        </button>
      </div>

      {/* Drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-[70] print:hidden">
          {/* Light/transparent backdrop for click-outside close */}
          <div
            className="absolute inset-0 bg-transparent"
            onClick={() => setOpen(false)}
          />
          {/* Floating popover near the left center */}
          <div
            className="absolute left-3 top-1/2 -translate-y-1/2 w-[320px] max-w-[85vw] h-[70vh] bg-white dark:bg-dark-150 border border-gray-200 dark:border-dark-200 shadow-2xl rounded-xl flex flex-col overflow-hidden"
            onMouseEnter={() => {
              setHoveringDrawer(true);
              if (closeTimer) {
                window.clearTimeout(closeTimer);
                setCloseTimer(null);
              }
            }}
            onMouseLeave={() => {
              setHoveringDrawer(false);
              if (closeTimer) {
                window.clearTimeout(closeTimer);
                setCloseTimer(null);
              }
              if (!hoveringHotspot) {
                setOpen(false);
              }
            }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-dark-200">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">My Menu</div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-100"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-gray-600 dark:text-white" />
              </button>
            </div>
            <div className="p-3 overflow-y-auto">
              <SidebarShortcuts />
            </div>
            {/* Back to Portal moved to floating button stack */}
          </div>
        </div>
      )}
    </>
  );
};

export default FloatingMyMenu;


