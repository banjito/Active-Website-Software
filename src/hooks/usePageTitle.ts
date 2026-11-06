import { useEffect } from "react";

const APP_NAME = "ampOS";

/**
 * Sets the browser tab title while a page is open, then puts the old one
 * back when the page closes. Pass null/empty while data is still loading.
 */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    const clean = (title || "").trim();
    if (!clean) return;
    const prev = document.title;
    document.title = `${clean} | ${APP_NAME}`;
    return () => {
      // Never leave the tab blank (a blank title makes the browser show the URL).
      document.title = prev.trim() ? prev : APP_NAME;
    };
  }, [title]);
}
