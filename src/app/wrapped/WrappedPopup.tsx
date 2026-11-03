import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import WrappedSlides, { LiveSaturn, Logo } from "./WrappedSlides";
import { getsBigfootSlide, isWrappedEligible, toWrappedData, type WrappedData } from "./wrappedData";
import { markWrappedFinished, markWrappedOpened, snoozeWrapped } from "./wrappedDrop";
import "./wrapped.css";

function WrappedInvite({
  data,
  preview,
  skipInvite,
  onStart,
  onLeave,
  onFinish,
}: {
  data: WrappedData;
  preview: boolean;
  skipInvite: boolean;
  onStart: () => void;
  onLeave: () => void;
  onFinish: () => void;
}) {
  const [watching, setWatching] = useState(skipInvite);
  const openButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (watching) onStart();
  }, [watching, onStart]);

  // Stops the portal scrolling behind the popup
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    if (watching) return;
    openButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onLeave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [watching, onLeave]);

  if (watching) {
    return <WrappedSlides data={data} preview={preview} onClose={onLeave} onFinish={onFinish} />;
  }

  return (
    <div className="wr-popup" onClick={onLeave}>
      <div
        className="wr-popup-card wr-tone-paper"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wr-popup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <LiveSaturn />
        <div className="wr-body">
          <div className="wr-top">
            <Logo className="wr-logo-sm" />
          </div>
          <div className="wr-grow" />
          <div className="wr-popup-left">
            <div id="wr-popup-title" className="wr-wrapped">
              Wrapped.
            </div>
            <div className="wr-text">
              {data.firstName
                ? `${data.firstName}, your year in ampOS is ready.`
                : "Your year in ampOS is ready."}
            </div>
            <button
              ref={openButton}
              type="button"
              className="wr-popup-open"
              onClick={() => setWatching(true)}
            >
              {"See your ampOS Wrapped ->"}
            </button>
            <button type="button" className="wr-popup-later" onClick={onLeave}>
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * No userId means preview: it saves nothing and skips the minimum, so anyone can be checked.
 * skipInvite goes straight to the slides, for the portal's rewatch button.
 */
export default function WrappedPopup({
  userId,
  numbers,
  onClose,
  skipInvite = false,
}: {
  userId?: string;
  numbers: Promise<any>;
  onClose: () => void;
  skipInvite?: boolean;
}) {
  const [data, setData] = useState<WrappedData | null>(null);

  const leave = useCallback(() => {
    if (userId) snoozeWrapped(userId);
    onClose();
  }, [userId, onClose]);

  const start = useCallback(() => {
    if (userId) markWrappedOpened(userId);
  }, [userId]);

  const finish = useCallback(() => {
    if (userId) markWrappedFinished(userId);
  }, [userId]);

  useEffect(() => {
    let alive = true;
    numbers
      .then(async (row) => {
        if (!alive) return;
        const loaded = row ? toWrappedData(row) : null;
        if (loaded) loaded.bigfoot = await getsBigfootSlide(loaded.email);
        if (!alive) return;
        if (loaded && (!userId || isWrappedEligible(loaded))) setData(loaded);
        else leave();
      })
      .catch((error) => {
        console.error("Could not load Wrapped:", error);
        if (!alive) return;
        // Someone who clicked a button needs to hear it failed; the surprise popup can stay quiet
        if (!userId || skipInvite) toast.error(error?.message ?? "Could not load Wrapped");
        onClose();
      });
    return () => {
      alive = false;
    };
  }, [userId, numbers, leave, onClose, skipInvite]);

  if (!data) return null;
  return (
    <WrappedInvite
      data={data}
      preview={!userId}
      skipInvite={skipInvite}
      onStart={start}
      onLeave={leave}
      onFinish={finish}
    />
  );
}
