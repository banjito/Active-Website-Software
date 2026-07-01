import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useMyMenuEnabled } from "@/lib/userPrefs";
import { SidebarShortcuts } from "@/components/shortcuts/SidebarShortcuts";
import { PanelLeftOpen, X } from "lucide-react";
export const FloatingMyMenu: React.FC = () => {
  const { user } = useAuth();
  const [enabled] = useMyMenuEnabled(user?.id);
  const [open, setOpen] = useState<boolean>(false);
  const [hoveringHotspot, setHoveringHotspot] = useState<boolean>(false);
  const [hoveringDrawer, setHoveringDrawer] = useState<boolean>(false);
  const [closeTimer, setCloseTimer] = useState<number | null>(null);
  const [openTimer, setOpenTimer] = useState<number | null>(null);
  const OPEN_DELAY = 0; // ms - open immediately for responsiveness
  const CLOSE_DELAY = 0; // ms - close immediately when hover leaves

  useEffect(() => {
    return () => {
      if (openTimer) window.clearTimeout(openTimer);
      if (closeTimer) window.clearTimeout(closeTimer);
    };
  }, [openTimer, closeTimer]);

  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
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
          className="rounded-none px-2 py-2 bg-white/90 dark:bg-dark-150 shadow border border-neutral-200 dark:border-dark-200 hover:bg-white dark:hover:bg-dark-100"
          aria-label="Open My Menu"
        >
          <PanelLeftOpen className="h-5 w-5 text-neutral-700 dark:text-white" />
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
            className="absolute left-3 top-1/2 -translate-y-1/2 w-[320px] max-w-[85vw] h-[70vh] bg-white dark:bg-dark-150 border border-neutral-200 dark:border-dark-200 shadow-2xl rounded-none flex flex-col overflow-hidden"
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
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-dark-200">
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                My Menu
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-dark-100"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-neutral-600 dark:text-white" />
              </button>
            </div>
            <div className="p-3 overflow-y-auto">
              <SidebarShortcuts onNavigate={() => setOpen(false)} />
            </div>
            {/* Back to Portal moved to floating button stack */}
          </div>
        </div>
      )}
    </>
  );
};

export default FloatingMyMenu;
