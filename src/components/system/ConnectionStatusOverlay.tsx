import { useEffect, useState } from "react";
import { useSupabaseHealth } from "@/hooks/useSupabaseHealth";

/**
 * Full-screen maintenance overlay shown whenever the app can't reach Supabase
 * — e.g. the database is being upgraded, the project is restarting/paused, or
 * the user has lost their internet connection. It auto-recovers: the underlying
 * health hook keeps polling and the overlay disappears the moment the backend
 * responds again.
 */
export default function ConnectionStatusOverlay() {
  const { status, isBrowserOffline, checkNow } = useSupabaseHealth();
  const [retrying, setRetrying] = useState(false);

  const isDown = status === "down";

  // Lock body scroll while the overlay is visible.
  useEffect(() => {
    if (isDown) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isDown]);

  if (!isDown) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await checkNow();
    } finally {
      // Brief visual feedback even if the check resolves instantly.
      setTimeout(() => setRetrying(false), 600);
    }
  };

  const heading = isBrowserOffline
    ? "You seem to be offline..."
    : "We're getting ampOS back online!";

  const subtext = isBrowserOffline
    ? "Check your internet connection. ampOS will reconnect automatically as soon as you're back online."
    : "ampOS is temporarily unavailable while we perform maintenance. This usually only takes a few minutes.";

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={heading}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-neutral-950/95 backdrop-blur-sm p-6"
    >
      <div className="w-full max-w-md rounded-none border border-neutral-800 bg-neutral-900 px-8 py-10 text-center shadow-2xl">
        <img
          src="/ampOS_full_logo.svg"
          alt="ampOS"
          // The logo artwork is solid black; invert it to white for the dark overlay.
          className="mx-auto mb-8 h-9 w-auto opacity-90 [filter:brightness(0)_invert(1)]"
          onError={(e) => {
            // Hide the image gracefully if the asset path ever changes.
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />

        {/* Pulsing status dot / spinner */}
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center">
          <span className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f26722] opacity-20" />
            <span className="relative inline-flex h-10 w-10 animate-spin rounded-full border-2 border-neutral-700 border-t-[#f26722]" />
          </span>
        </div>

        <h1 className="mb-3 text-xl font-semibold text-neutral-50">
          {heading}
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-neutral-400">
          {subtext}
        </p>

        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="inline-flex items-center justify-center gap-2 rounded-none bg-[#f26722] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#d9591b] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {retrying ? "Checking…" : "Try again"}
        </button>

        <p className="mt-6 text-xs text-neutral-600">
          Checking for a connection automatically…
        </p>
      </div>
    </div>
  );
}
