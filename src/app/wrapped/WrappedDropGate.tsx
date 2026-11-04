import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { fetchWrappedRow, isWrappedDue, useWrappedStatus } from "./wrappedDrop";
import { WrappedWordmark } from "./WrappedWordmark";

// Lazy so the portal does not load the slides, art and fonts for a popup that is usually off
const WrappedPopup = lazy(() => import("./WrappedPopup"));

/**
 * Opens the Wrapped popup when it is due. Add ?wrappedPreview to the portal link to
 * see your own now. Admins can add ?wrappedPreview=name@company.com to see someone's.
 */
export function WrappedDropGate({ paused }: { paused: boolean }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [closed, setClosed] = useState(false);
  const close = useCallback(() => setClosed(true), []);
  const preview = searchParams.has("wrappedPreview");
  const previewEmail = searchParams.get("wrappedPreview") || undefined;
  const userId = user?.id;
  const { unseen } = useWrappedStatus(userId);
  const [dueOnArrival, setDueOnArrival] = useState(false);

  // Decided once per visit. Starting to watch saves "seen", which must not close the popup.
  useEffect(() => {
    if (userId && unseen && isWrappedDue(userId)) setDueOnArrival(true);
  }, [userId, unseen]);

  const due = !!userId && (preview || dueOnArrival) && !closed && !paused;

  // Asked for here, not in the popup, so the numbers and the popup's code load side by side
  const numbers = useMemo(() => {
    if (!due) return null;
    const request = fetchWrappedRow(previewEmail);
    // The popup handles failures, but it may not have loaded yet when one happens
    request.catch(() => undefined);
    return request;
  }, [due, previewEmail]);

  if (!numbers) return null;

  return (
    <Suspense fallback={null}>
      <WrappedPopup userId={preview ? undefined : userId} numbers={numbers} onClose={close} />
    </Suspense>
  );
}

/**
 * Opens Wrapped again, straight to the slides. Stays on the portal for good once someone
 * has started watching, and always shows with ?wrappedPreview so it can be checked.
 */
export function WrappedRewatchButton({ className = "" }: { className?: string }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const preview = searchParams.has("wrappedPreview");
  const previewEmail = searchParams.get("wrappedPreview") || undefined;
  const { seen: canRewatch } = useWrappedStatus(user?.id);
  const [numbers, setNumbers] = useState<Promise<any> | null>(null);
  const close = useCallback(() => setNumbers(null), []);

  if (!user || !(canRewatch || preview)) return null;

  const open = () => {
    const request = fetchWrappedRow(preview ? previewEmail : undefined);
    request.catch(() => undefined);
    setNumbers(request);
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={open}
        disabled={!!numbers}
        aria-label="See your ampOS Wrapped"
        className="inline-flex h-11 items-center px-2 rounded-none bg-transparent text-neutral-900 transition-opacity hover:opacity-70 dark:text-white disabled:cursor-wait focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
      >
        <WrappedWordmark className="h-9 w-auto translate-y-1" />
      </button>
      {numbers && (
        <Suspense fallback={null}>
          <WrappedPopup
            userId={preview ? undefined : user.id}
            numbers={numbers}
            onClose={close}
            skipInvite
          />
        </Suspense>
      )}
    </div>
  );
}
