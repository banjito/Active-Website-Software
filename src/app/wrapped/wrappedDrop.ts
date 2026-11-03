import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";

export const WRAPPED_YEAR = 2026;

/**
 * The go-live switch. Turned on 2026-11-03 after Jack checked the numbers. Set it back to
 * false to stop the popup and the button, even inside the drop dates. Previews with
 * ?wrappedPreview work either way.
 */
export const WRAPPED_DATA_READY = true;

// Each person's own time zone. Months count from 0, so 11 is December.
const DROP_DATE = new Date(2026, 11, 1);
// The popup stops here. The button stays for anyone who watched.
const STOPS_ON = new Date(2027, 1, 1);
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
// Saved in this browser: a snooze time, or one of these
const OPENED = "opened";
const FINISHED = "finished";
// Asked after the popup stopped, and they never watched. Saves asking on every visit.
const NEVER = "never";
const CHANGED_EVENT = "ampos-wrapped-changed";

const storageKey = (userId: string) => `ampos.wrapped.2026.${userId}`;
const hasDropped = (now: Date) => WRAPPED_DATA_READY && now >= DROP_DATE;
const popupRuns = (now: Date) => hasDropped(now) && now < STOPS_ON;
const saved = (userId: string) => localStorage.getItem(storageKey(userId));
const seenHere = (value: string | null) => value === OPENED || value === FINISHED;

function save(userId: string, value: string) {
  localStorage.setItem(storageKey(userId), value);
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/** Raw numbers, or null if this login gets no Wrapped. Admins can pass an email to preview someone. */
export async function fetchWrappedRow(previewEmail?: string) {
  const { data, error } = await supabase.schema("common").rpc("get_my_wrapped", {
    p_year: WRAPPED_YEAR,
    p_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    p_preview_email: previewEmail ?? null,
  });
  if (error) throw error;
  return data;
}

/** This browser's half of the answer. useWrappedStatus also asks the database. */
export function isWrappedDue(userId: string, now = new Date()) {
  if (!popupRuns(now)) return false;
  const value = saved(userId);
  if (seenHere(value)) return false;
  return !value || now.getTime() >= Number(value);
}

/** Saved here and in the database, so the popup stops and the button shows on every device */
export function markWrappedOpened(userId: string) {
  if (saved(userId) !== FINISHED) save(userId, OPENED);
  supabase
    .schema("common")
    .rpc("mark_wrapped_seen", { p_year: WRAPPED_YEAR })
    .then(({ error }) => {
      if (error) console.error("Could not save that Wrapped was seen:", error);
    });
}

export function markWrappedFinished(userId: string) {
  save(userId, FINISHED);
}

/** "Not now" brings the popup back in a few days, until they start watching */
export function snoozeWrapped(userId: string) {
  if (seenHere(saved(userId))) return;
  save(userId, String(Date.now() + SNOOZE_MS));
}

// One question to the database per page load, shared by the popup and the button
const lookups = new Map<string, Promise<boolean>>();

function seenElsewhere(userId: string) {
  let lookup = lookups.get(userId);
  if (!lookup) {
    lookup = Promise.resolve(
      supabase.schema("common").rpc("has_seen_wrapped", { p_year: WRAPPED_YEAR }),
    ).then(({ data, error }) => {
      if (error) throw error;
      return data === true;
    });
    lookups.set(userId, lookup);
  }
  return lookup;
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED_EVENT, onChange);
  // Another tab
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * seen: they've watched, here or on another device, so the button shows and the popup doesn't.
 * unseen: the database confirmed they haven't, so the popup may run.
 * Neither while it's still asking.
 */
export function useWrappedStatus(userId?: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => (userId ? saved(userId) : null),
    () => null,
  );
  const [unseen, setUnseen] = useState(false);
  const seen = WRAPPED_DATA_READY && seenHere(value);
  const mustAsk = !!userId && !seen && value !== NEVER && hasDropped(new Date());

  useEffect(() => {
    if (!mustAsk || !userId) return;
    let alive = true;
    seenElsewhere(userId)
      .then((seenThere) => {
        if (!alive) return;
        if (seenThere) {
          save(userId, OPENED);
        } else {
          if (!popupRuns(new Date())) save(userId, NEVER);
          setUnseen(true);
        }
      })
      .catch((error) => {
        // Don't let a failed check block the popup
        console.error("Could not check whether Wrapped was seen:", error);
        if (alive) setUnseen(true);
      });
    return () => {
      alive = false;
    };
  }, [mustAsk, userId]);

  return { seen, unseen: unseen && !seen };
}
