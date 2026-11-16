/**
 * Building blocks for the Edit Section window: titled cards, label-left /
 * control-right rows that line up down the page, on/off switches with a
 * one-line explanation.
 */

import React from "react";

export const CARD_CLASS =
  "border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 rounded-none";

/** A titled card. `actions` sit at the right of the title bar. */
export const SettingsCard: React.FC<{
  id: string;
  title: string;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Body without padding, for content that draws its own edges. */
  flush?: boolean;
}> = ({ id, title, icon, description, actions, children, flush }) => (
  <section id={id} className={CARD_CLASS}>
    <CardHeader title={title} icon={icon} description={description} actions={actions} />
    <div className={flush ? "" : "p-3 space-y-3"}>{children}</div>
  </section>
);

/** The title bar of a card, for cards whose body is written out by hand. */
export const CardHeader: React.FC<{
  title: string;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, icon, description, actions }) => (
  <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-100">
    <div className="min-w-0 flex-1">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 dark:text-white">
        {icon && <span className="text-neutral-400">{icon}</span>}
        {title}
      </h3>
      {description && (
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{description}</p>
      )}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-1">{actions}</div>}
  </div>
);

/** Label on the left, control on the right; labels line up across a card. */
export const SettingRow: React.FC<{
  label: React.ReactNode;
  help?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  /** Top-align, for tall controls. */
  top?: boolean;
}> = ({ label, help, htmlFor, children, top }) => (
  <div className={`grid grid-cols-1 sm:grid-cols-[13rem_1fr] gap-x-4 gap-y-1 ${top ? "items-start" : "items-center"}`}>
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </label>
      {help && <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">{help}</p>}
    </div>
    <div className="min-w-0">{children}</div>
  </div>
);

/** An on/off setting: a square switch, its name, and what it does. */
export const ToggleRow: React.FC<{
  id: string;
  label: React.ReactNode;
  help?: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  icon?: React.ReactNode;
}> = ({ id, label, help, checked, onChange, icon }) => (
  <div className="flex items-start gap-3 py-1">
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`mt-0.5 relative shrink-0 h-5 w-9 border rounded-none transition-colors focus:outline-none focus:ring-2 focus:ring-brand/40 ${
        checked ? "bg-brand border-brand" : "bg-neutral-200 dark:bg-dark-100 border-neutral-300 dark:border-neutral-600"
      }`}
    >
      <span
        className={`absolute top-0.5 h-3.5 w-3.5 bg-white rounded-none shadow transition-all ${
          checked ? "left-[1.1rem]" : "left-0.5"
        }`}
      />
    </button>
    {/* A label's click reaches the switch button, so it needs no handler. */}
    <label htmlFor={id} className="min-w-0 cursor-pointer">
      <span className="flex items-center gap-1 text-sm text-neutral-800 dark:text-neutral-200">
        {icon}
        {label}
      </span>
      {help && <span className="block text-[11px] text-neutral-500 dark:text-neutral-400">{help}</span>}
    </label>
  </div>
);
