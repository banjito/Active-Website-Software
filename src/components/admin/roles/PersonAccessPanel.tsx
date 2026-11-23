import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/Switch";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useCan } from "@/lib/permissions";
import {
  Catalog,
  SUPER_ADMIN,
  groupByArea,
  loadCatalog,
  loadPersonExtras,
  loadPickedRole,
  plainError,
  setPeopleRole,
  setPersonExtra,
} from "@/services/rolesAdminService";

interface Props {
  userId: string;
  currentUserId: string | null | undefined;
  /** New role picked or cleared here, so the list can follow. */
  onRoleChanged?: (role: string | null) => void;
  /** Anything changed, so History can refresh. */
  onChanged?: () => void;
}

/**
 * People & roles → a person → Permissions (Roles scope item 3).
 * Their new role, plus switches to add or take away single permissions for them.
 */
export default function PersonAccessPanel({ userId, currentUserId, onRoleChanged, onChanged }: Props) {
  const { can } = useCan();
  const isSuper = can("admin.make_super_admin");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [extras, setExtras] = useState<Map<string, boolean>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, r, x] = await Promise.all([loadCatalog(), loadPickedRole(userId), loadPersonExtras(userId)]);
      setCatalog(c);
      setPicked(r);
      setExtras(x);
    } catch (err) {
      setError(plainError(err));
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const areas = useMemo(() => (catalog ? groupByArea(catalog.permissions) : []), [catalog]);

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-none border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }
  if (!catalog) {
    return (
      <div className="flex min-h-[120px] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const roleKey = picked;
  const roleLabel = (k: string | null) => catalog.roles.find((r) => r.key === k)?.label ?? "no role";
  const isPersonSuper = roleKey === SUPER_ADMIN;
  const self = userId === currentUserId;
  const locked = !isSuper && (self || isPersonSuper);
  const lockText = self
    ? "You can't change your own access. Ask a Super Admin."
    : "Only a Super Admin can change a Super Admin.";

  const fromRole = (p: string) => isPersonSuper || (!!roleKey && !!catalog.ticks.get(roleKey)?.has(p));
  const isOn = (p: string) => (isPersonSuper ? true : extras.has(p) ? extras.get(p)! : fromRole(p));
  const total = catalog.permissions.filter((p) => isOn(p.key)).length;

  const changeRole = async (value: string) => {
    const next = value || null;
    setBusy("role");
    try {
      await setPeopleRole([userId], next);
      setPicked(next);
      onRoleChanged?.(next);
      onChanged?.();
      toast.success(next ? `Role: ${roleLabel(next)}` : "Role removed");
    } catch (err) {
      toast.error(plainError(err));
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (perm: string) => {
    if (locked || isPersonSuper) return;
    if (perm === "admin.make_super_admin" && !isSuper) return;
    const want = !isOn(perm);
    // Matching the role clears the extra; otherwise store it.
    const granted = want === fromRole(perm) ? null : want;
    setBusy(perm);
    try {
      await setPersonExtra(userId, perm, granted);
      onChanged?.();
      setExtras((prev) => {
        const next = new Map(prev);
        if (granted === null) next.delete(perm);
        else next.set(perm, granted);
        return next;
      });
    } catch (err) {
      toast.error(plainError(err));
    } finally {
      setBusy(null);
    }
  };

  const reset = async (perm: string) => {
    setBusy(perm);
    try {
      await setPersonExtra(userId, perm, null);
      onChanged?.();
      setExtras((prev) => {
        const next = new Map(prev);
        next.delete(perm);
        return next;
      });
    } catch (err) {
      toast.error(plainError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-none border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-dark-200">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <label
              htmlFor={`new-role-${userId}`}
              className="block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
            >
              Role
            </label>
            <select
              id={`new-role-${userId}`}
              value={picked ?? ""}
              disabled={locked || busy !== null}
              title={locked ? lockText : undefined}
              onChange={(e) => void changeRole(e.target.value)}
              className="form-input mt-1 w-56 rounded-none py-1 text-sm"
            >
              <option value="">No role</option>
              {catalog.roles
                .filter((r) => isSuper || r.key !== SUPER_ADMIN || picked === SUPER_ADMIN)
                .map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
            </select>
          </div>
          <div className="text-sm text-neutral-600 dark:text-neutral-300">
            {total} of {catalog.permissions.length} permissions
            {extras.size > 0 && ` · ${extras.size} just for this person`}
          </div>
        </div>
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          {locked
            ? lockText
            : "Changes count after they reload ampOS. Switch something on or off below to make an exception for this person."}
        </p>
      </div>

      {areas.map(({ area, items }) => (
        <section
          key={area}
          className="rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150"
        >
          <h3 className="border-b border-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 dark:border-neutral-800 dark:text-white">
            {area}
          </h3>
          <ul>
            {items.map((p) => {
              const on = isOn(p.key);
              const extra = extras.has(p.key);
              const disabled =
                locked || isPersonSuper || busy !== null || (p.key === "admin.make_super_admin" && !isSuper);
              const id = `pa-${userId}-${p.key}`;
              return (
                <li
                  key={p.key}
                  className={`flex items-start gap-3 border-t border-neutral-100 px-4 py-2 first:border-t-0 dark:border-neutral-800 ${
                    extra ? "bg-brand/5" : ""
                  }`}
                >
                  <Switch
                    checked={on}
                    disabled={disabled}
                    onCheckedChange={() => void toggle(p.key)}
                    onKeyDown={(e) => {
                      if (!disabled && (e.key === " " || e.key === "Enter")) {
                        e.preventDefault();
                        void toggle(p.key);
                      }
                    }}
                    checkedClassName="bg-brand"
                    aria-disabled={disabled}
                    aria-labelledby={id}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div id={id} className="text-sm text-neutral-900 dark:text-white">
                      {p.label}
                    </div>
                    {extra && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-none bg-brand/10 px-1.5 py-0.5 font-medium text-brand">
                          {extras.get(p.key) ? "Added for this person" : "Taken away for this person"}
                        </span>
                        {!disabled && (
                          <button
                            type="button"
                            onClick={() => void reset(p.key)}
                            className="inline-flex items-center gap-1 text-neutral-600 hover:text-brand dark:text-neutral-300"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Back to the role
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
