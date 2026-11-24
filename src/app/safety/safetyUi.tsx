/** Shared bits for the safety screens (questions, hazard lists, job JHA). */
import React, { useLayoutEffect, useRef } from "react";

export const CARD = "border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150";
export const MUTED = "text-neutral-500 dark:text-neutral-400";

/** Looks like plain text until you point at it or click in. */
export const GHOST_BASE =
  "-mx-1.5 rounded-none border border-transparent bg-transparent px-1.5 py-0.5 " +
  "placeholder:text-neutral-400 hover:border-neutral-300 focus:border-brand focus:bg-white focus:outline-none focus:ring-0 " +
  "dark:placeholder:text-neutral-500 dark:hover:border-neutral-600 dark:focus:bg-dark-100";
export const GHOST = `${GHOST_BASE} w-[calc(100%+0.75rem)]`;

/** A quiet bordered box, for screens people fill in on a phone or tablet. */
export const FIELD =
  "w-full rounded-none border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 touch:py-2.5 touch:text-base " +
  "placeholder:text-neutral-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand " +
  "dark:border-neutral-600 dark:bg-dark-100 dark:text-white dark:placeholder:text-neutral-500";

/** A text box that grows with what's typed. */
export function AutoTextarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} className={`${className} resize-none overflow-hidden`} />;
}
