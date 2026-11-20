import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { Check, Copy, Eye, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { startViewAs } from "@/lib/viewAs";
import {
  Catalog,
  SUPER_ADMIN,
  copyRole,
  deleteRole,
  groupByArea,
  plainError,
  saveRoleTicks,
} from "@/services/rolesAdminService";

const MAKE_SUPER = "admin.make_super_admin";
const keyOf = (role: string, perm: string) => `${role}\u0000${perm}`;
/** New roles with no old role name: what their people have today. */
const TODAY_ROLE_FALLBACK: Record<string, string> = { lead_tech: "NETA Technician" };

interface Props {
  catalog: Catalog;
  /** new role key -> active people on it */
  peopleCounts: Map<string, number>;
  isSuper: boolean;
  reloadCatalog: () => Promise<void>;
  onChanged: () => void;
  onRoleDeleted: () => Promise<void>;
}

export default function RolesTab({ catalog, peopleCounts, isSuper, reloadCatalog, onChanged, onRoleDeleted }: Props) {
  const { roles, permissions, ticks } = catalog;
  const areas = useMemo(() => groupByArea(permissions), [permissions]);
  const [roleKey, setRoleKey] = useState<string>(() =>
    roles.some((r) => r.key === "admin") ? "admin" : roles[0]?.key ?? "",
  );
  const [view, setView] = useState<"one" | "compare">("one");
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);
  const [copyName, setCopyName] = useState<string | null>(null);

  const role = roles.find((r) => r.key === roleKey) ?? roles[0];

  // Warn before leaving the page with unsaved ticks.
  useEffect(() => {
    if (pending.size === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending.size]);

  const saved = (r: string, p: string) => r === SUPER_ADMIN || !!ticks.get(r)?.has(p);
  const isOn = (r: string, p: string) => {
    const k = keyOf(r, p);
    return pending.has(k) ? pending.get(k)! : saved(r, p);
  };
  const lockReason = (r: string, p: string): string | null => {
    if (r === SUPER_ADMIN) return "Super Admin always has everything.";
    if (p === MAKE_SUPER && !isSuper) return "Only a Super Admin can give this out.";
    return null;
  };

  const set = (r: string, p: string, on: boolean) => {
    if (lockReason(r, p)) return;
    setPending((prev) => {
      const next = new Map(prev);
      const k = keyOf(r, p);
      if (on === saved(r, p)) next.delete(k);
      else next.set(k, on);
      return next;
    });
  };

  const pendingRoles = useMemo(() => {
    const s = new Set<string>();
    pending.forEach((_, k) => s.add(k.split("\u0000")[0]));
    return s;
  }, [pending]);

  const affected = [...pendingRoles].reduce((n, r) => n + (peopleCounts.get(r) ?? 0), 0);
  const roleLabel = (k: string) => roles.find((r) => r.key === k)?.label ?? k;
  const countOn = (r: string) => permissions.filter((p) => isOn(r, p.key)).length;

  /** The old role name screens not yet on permissions will read for this role. */
  const todayRoleFor = (key: string): string => {
    let r = roles.find((x) => x.key === key);
    for (let hops = 0; r && hops < 10; hops++) {
      if (r.legacy_names[0]) return r.legacy_names[0];
      if (TODAY_ROLE_FALLBACK[r.key]) return TODAY_ROLE_FALLBACK[r.key];
      const parent: string | null = r.copied_from;
      r = parent ? roles.find((x) => x.key === parent) : undefined;
    }
    return roles.find((x) => x.key === key)?.label ?? key;
  };

  const viewAsRole = () => {
    const opened = startViewAs({
      roleKey: role.key,
      label: role.label,
      legacyRole: todayRoleFor(role.key),
      permissions: permissions.filter((p) => isOn(role.key, p.key)).map((p) => p.key),
      unsaved: pendingRoles.has(role.key),
    });
    if (!opened) toast.error("Your browser blocked the new tab. Allow pop-ups for ampOS, then try again.");
  };

  const save = async () => {
    const changes = [...pending].map(([k, on]) => {
      const [r, p] = k.split("\u0000");
      return { role: r, permission: p, on };
    });
    setSaving(true);
    try {
      await saveRoleTicks(changes);
      await reloadCatalog();
      setPending(new Map());
      onChanged();
      toast.success(`Saved ${changes.length} change${changes.length === 1 ? "" : "s"}.`);
    } catch (err) {
      toast.error(plainError(err));
    } finally {
      setSaving(false);
    }
  };

  const doCopy = async () => {
    if (!role || copyName === null) return;
    const name = copyName.trim();
    if (!name) {
      toast.error("Give the new role a name.");
      return;
    }
    setSaving(true);
    try {
      const key = await copyRole(role.key, name);
      await reloadCatalog();
      setRoleKey(key);
      setView("one");
      setCopyName(null);
      onChanged();
      toast.success(`Made ${name}. Change its ticks below.`);
    } catch (err) {
      toast.error(plainError(err));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!role) return;
    const ok = await confirmDialog({
      title: `Delete ${role.label}?`,
      description: "The role and its ticks are removed. This can't be undone.",
      confirmLabel: "Delete role",
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteRole(role.key);
      setPending((prev) => new Map([...prev].filter(([k]) => !k.startsWith(role.key + "\u0000"))));
      await reloadCatalog();
      await onRoleDeleted();
      setRoleKey("admin");
      onChanged();
      toast.success(`Deleted ${role.label}.`);
    } catch (err) {
      toast.error(plainError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!role) return null;
  const people = peopleCounts.get(role.key) ?? 0;
  const copiedFrom = role.copied_from ? roleLabel(role.copied_from) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-neutral-600 dark:text-neutral-300">
          Pick a role, then switch on what it can do. Changes wait at the bottom until you save.
        </p>
        <div className="flex" role="radiogroup" aria-label="View">
          {(
            [
              ["one", "One role"],
              ["compare", "Compare all roles"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={`-ml-px border px-3 py-1.5 text-sm first:ml-0 ${
                view === v
                  ? "relative z-10 border-brand bg-brand text-white"
                  : "border-neutral-300 text-neutral-700 hover:border-brand dark:border-neutral-700 dark:text-neutral-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "compare" ? (
        <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150">
          <table className="text-sm">
            <thead className="bg-neutral-50 dark:bg-dark-200">
              <tr>
                <th className="sticky left-0 z-10 min-w-[240px] bg-neutral-50 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-500 dark:bg-dark-200 dark:text-neutral-400">
                  Permission
                </th>
                {roles.map((r) => (
                  <th key={r.key} className="px-2 py-2 text-center text-xs font-medium text-neutral-700 dark:text-neutral-200">
                    <button
                      type="button"
                      onClick={() => {
                        setRoleKey(r.key);
                        setView("one");
                      }}
                      className="whitespace-nowrap hover:text-brand"
                      title={`Open ${r.label}`}
                    >
                      {r.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {areas.map(({ area, items }) => (
                <Fragment key={area}>
                  <tr className="border-t border-neutral-200 bg-neutral-50/60 dark:border-neutral-700 dark:bg-dark-200/60">
                    <td
                      colSpan={roles.length + 1}
                      className="sticky left-0 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300"
                    >
                      {area}
                    </td>
                  </tr>
                  {items.map((p) => (
                    <tr key={p.key} className="border-t border-neutral-100 dark:border-neutral-800">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-neutral-800 dark:bg-dark-150 dark:text-neutral-200">
                        {p.label}
                      </td>
                      {roles.map((r) => {
                        const on = isOn(r.key, p.key);
                        const changed = pending.has(keyOf(r.key, p.key));
                        const lock = lockReason(r.key, p.key);
                        return (
                          <td key={r.key} className={`px-2 py-1.5 text-center ${changed ? "bg-brand/10" : ""}`}>
                            <button
                              type="button"
                              disabled={!!lock}
                              onClick={() => set(r.key, p.key, !on)}
                              title={lock ?? `${on ? "Turn off" : "Turn on"} "${p.label}" for ${r.label}`}
                              aria-label={`${p.label} for ${r.label}: ${on ? "on" : "off"}`}
                              aria-pressed={on}
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-none border ${
                                on
                                  ? "border-brand bg-brand text-white"
                                  : "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-dark-150"
                              } ${lock ? "cursor-not-allowed opacity-50" : "hover:border-brand"}`}
                            >
                              {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
          {/* Role list */}
          <div className="h-max rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150" role="group" aria-label="Roles">
            {roles.map((r) => {
              const sel = r.key === role.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  aria-current={sel ? "true" : undefined}
                  onClick={() => {
                    setRoleKey(r.key);
                    setCopyName(null);
                  }}
                  className={`flex w-full items-center justify-between gap-2 border-l-[3px] px-3 py-2 text-left ${
                    sel
                      ? "border-brand bg-brand/5"
                      : "border-transparent hover:bg-neutral-50 dark:hover:bg-dark-200"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-900 dark:text-white">
                      {r.label}
                    </span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                      {peopleCounts.get(r.key) ?? 0} people · {r.key === SUPER_ADMIN ? "everything" : `${countOn(r.key)} of ${permissions.length}`}
                    </span>
                  </span>
                  {pendingRoles.has(r.key) && (
                    <span className="h-2 w-2 flex-shrink-0 rounded-none bg-brand" title="Unsaved changes" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected role */}
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{role.label}</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {people} {people === 1 ? "person" : "people"}
                  {role.key !== SUPER_ADMIN && ` · ${countOn(role.key)} of ${permissions.length} switched on`}
                  {copiedFrom && ` · copy of ${copiedFrom}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Eye className="h-4 w-4" />}
                  title="Open ampOS as this role in a new tab. Read-only; unsaved ticks included."
                  onClick={viewAsRole}
                >
                  View as
                </Button>
                {role.key !== SUPER_ADMIN && copyName === null && (
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Copy className="h-4 w-4" />}
                    disabled={pendingRoles.has(role.key) || saving}
                    title={pendingRoles.has(role.key) ? "Save or discard this role's changes first" : undefined}
                    onClick={() => setCopyName(`${role.label} copy`)}
                  >
                    Copy role
                  </Button>
                )}
                {!role.is_system && (
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Trash2 className="h-4 w-4" />}
                    disabled={people > 0 || saving}
                    title={people > 0 ? "Move everyone off this role first" : undefined}
                    onClick={() => void doDelete()}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>

            {copyName !== null && (
              <form
                className="flex flex-wrap items-center gap-2 rounded-none border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-dark-200"
                onSubmit={(e) => {
                  e.preventDefault();
                  void doCopy();
                }}
              >
                <label htmlFor="copy-role-name" className="text-sm text-neutral-700 dark:text-neutral-200">
                  Copy {role.label} as
                </label>
                <input
                  id="copy-role-name"
                  autoFocus
                  value={copyName}
                  onChange={(e) => setCopyName(e.target.value)}
                  className="form-input w-56 rounded-none py-1 text-sm"
                />
                <Button size="sm" type="submit" isLoading={saving}>
                  Make copy
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setCopyName(null)}>
                  Cancel
                </Button>
              </form>
            )}

            {role.key === SUPER_ADMIN && (
              <div className="flex items-start gap-2 rounded-none border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-dark-200 dark:text-neutral-200">
                <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
                Super Admin always has everything, so there&apos;s nothing to switch. Only a Super Admin can make
                another one.
              </div>
            )}

            {areas.map(({ area, items }) => {
              const onCount = items.filter((p) => isOn(role.key, p.key)).length;
              const editable = items.filter((p) => !lockReason(role.key, p.key));
              return (
                <section
                  key={area}
                  className="rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-2.5 dark:border-neutral-800">
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                      {area}{" "}
                      <span className="ml-1 font-normal text-neutral-500 dark:text-neutral-400">
                        {onCount} of {items.length}
                      </span>
                    </h3>
                    {editable.length > 0 && (
                      <div className="flex gap-3 text-xs">
                        <button
                          type="button"
                          className="text-neutral-600 hover:text-brand dark:text-neutral-300"
                          onClick={() => editable.forEach((p) => set(role.key, p.key, true))}
                        >
                          All on
                        </button>
                        <button
                          type="button"
                          className="text-neutral-600 hover:text-brand dark:text-neutral-300"
                          onClick={() => editable.forEach((p) => set(role.key, p.key, false))}
                        >
                          All off
                        </button>
                      </div>
                    )}
                  </div>
                  <ul>
                    {items.map((p) => {
                      const on = isOn(role.key, p.key);
                      const changed = pending.has(keyOf(role.key, p.key));
                      const lock = lockReason(role.key, p.key);
                      const id = `perm-${role.key}-${p.key}`;
                      return (
                        <li
                          key={p.key}
                          className={`flex items-start gap-3 border-t border-neutral-100 px-4 py-2.5 first:border-t-0 dark:border-neutral-800 ${
                            changed ? "bg-brand/5" : ""
                          }`}
                        >
                          <Switch
                            checked={on}
                            disabled={!!lock}
                            onCheckedChange={(v) => set(role.key, p.key, v)}
                            onKeyDown={(e) => {
                              if (e.key === " " || e.key === "Enter") {
                                e.preventDefault();
                                set(role.key, p.key, !on);
                              }
                            }}
                            checkedClassName="bg-brand"
                            aria-disabled={!!lock}
                            aria-labelledby={id}
                            className="mt-0.5"
                          />
                          <div className="min-w-0">
                            <div id={id} className="text-sm font-medium text-neutral-900 dark:text-white">
                              {p.label}
                              {changed && (
                                <span className="ml-2 rounded-none bg-brand/10 px-1.5 py-0.5 text-xs font-medium text-brand">
                                  {on ? "Turning on" : "Turning off"}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">
                              {lock && role.key !== SUPER_ADMIN ? lock : p.description}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {pending.size > 0 &&
        createPortal(
          <div
            role="region"
            aria-label="Unsaved changes"
            className="fixed bottom-6 left-4 right-4 z-50 flex flex-wrap items-center gap-3 rounded-none border border-neutral-200 bg-white px-4 py-3 shadow-lg dark:border-dark-200 dark:bg-dark-150 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 print:hidden"
          >
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              {pending.size} unsaved change{pending.size === 1 ? "" : "s"}
            </span>
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              {[...pendingRoles].map(roleLabel).join(", ")} · affects {affected}{" "}
              {affected === 1 ? "person" : "people"}
            </span>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setPending(new Map())}>
              Discard
            </Button>
            <Button size="sm" isLoading={saving} onClick={() => void save()}>
              Save changes
            </Button>
          </div>,
          document.body,
        )}
    </div>
  );
}
