import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SortHeader, SortDirection, compareSortValues } from "@/components/ui/SortHeader";
import {
  Catalog,
  PersonRow,
  SUPER_ADMIN,
  plainError,
  setPeopleRole,
} from "@/services/rolesAdminService";
import PersonDialog from "./PersonDialog";

type SortField = "name" | "role";

const NONE = "__none__";

interface Props {
  catalog: Catalog;
  people: PersonRow[];
  setPeople: React.Dispatch<React.SetStateAction<PersonRow[] | null>>;
  currentUserId: string | null;
  isSuper: boolean;
  /** "Change roles and permissions": the role columns and bulk moves. */
  canRoles: boolean;
  /** "Invite and remove people": account details. */
  canUsers: boolean;
  onChanged: () => void;
}

/** Snapshot of one person's pick, for undo. */
type Before = { id: string; picked: boolean; role: string | null };

export default function PeopleTab({
  catalog,
  people,
  setPeople,
  currentUserId,
  isSuper,
  canRoles,
  canUsers,
  onChanged,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null); // role key, NONE, or null = all
  const [showInactive, setShowInactive] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const roleLabel = useMemo(() => new Map(catalog.roles.map((r) => [r.key, r.label])), [catalog.roles]);

  const locked = (p: PersonRow): string | null => {
    if (isSuper) return null;
    if (p.id === currentUserId) return "You can't change your own role. Ask a Super Admin.";
    if (p.new_role === SUPER_ADMIN) return "Only a Super Admin can change a Super Admin.";
    return null;
  };

  const pool = useMemo(() => people.filter((p) => showInactive || p.is_active), [people, showInactive]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pool) {
      const k = p.new_role ?? NONE;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [pool]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = pool.filter((p) => {
      if (roleFilter && (p.new_role ?? NONE) !== roleFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.employee_number ?? "").toLowerCase().includes(q) ||
        (roleLabel.get(p.new_role ?? "") ?? "").toLowerCase().includes(q)
      );
    });
    if (!sortField) return list;
    const val = (p: PersonRow) =>
      sortField === "name" ? p.name : roleLabel.get(p.new_role ?? "") ?? "";
    return [...list].sort((a, b) => compareSortValues(val(a), val(b), sortDir));
  }, [pool, query, roleFilter, sortField, sortDir, roleLabel]);

  const selectable = canRoles ? rows.filter((p) => !locked(p)) : [];
  const allSelected = selectable.length > 0 && selectable.every((p) => selected.has(p.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) selectable.forEach((p) => next.delete(p.id));
      else selectable.forEach((p) => next.add(p.id));
      return next;
    });

  /** Apply locally: role key, or null for no role. */
  const applyLocal = (ids: Set<string>, role: string | null) =>
    setPeople((prev) =>
      (prev ?? []).map((p) =>
        ids.has(p.id)
          ? {
              ...p,
              new_role: role,
              new_role_picked: role !== null,
            }
          : p,
      ),
    );

  const restore = async (before: Before[]) => {
    // Group by what each person had, so undo is one call per group.
    const groups = new Map<string, string[]>();
    for (const b of before) {
      const k = b.role ?? NONE;
      groups.set(k, [...(groups.get(k) ?? []), b.id]);
    }
    try {
      for (const [k, ids] of groups) {
        const role = k === NONE ? null : k;
        await setPeopleRole(ids, role);
        applyLocal(new Set(ids), role);
      }
      onChanged();
      toast.success("Undone");
    } catch (err) {
      toast.error(plainError(err));
    }
  };

  const change = async (targets: PersonRow[], role: string | null) => {
    if (targets.length === 0) return;
    const ids = new Set(targets.map((p) => p.id));
    const before: Before[] = targets.map((p) => ({ id: p.id, picked: p.new_role_picked, role: p.new_role }));
    setSaving(true);
    applyLocal(ids, role);
    try {
      await setPeopleRole([...ids], role);
      onChanged();
      const who = targets.length === 1 ? targets[0].name : `${targets.length} people`;
      const what = role ? `moved to ${roleLabel.get(role)}` : "set to no role";
      toast(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            <span>
              {who} {what}.
            </span>
            <button
              type="button"
              className="font-semibold text-brand underline-offset-2 hover:underline"
              onClick={() => {
                toast.dismiss(t.id);
                void restore(before);
              }}
            >
              Undo
            </button>
          </span>
        ),
        { duration: 6000 },
      );
      setSelected(new Set());
    } catch (err) {
      // Put everyone back the way they were.
      setPeople((prev) =>
        (prev ?? []).map((p) => {
          const b = before.find((x) => x.id === p.id);
          return b ? { ...p, new_role: b.role, new_role_picked: b.picked } : p;
        }),
      );
      toast.error(plainError(err));
    } finally {
      setSaving(false);
    }
  };

  const patchPerson = (id: string, patch: Partial<PersonRow>) =>
    setPeople((prev) => (prev ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const openPerson = people.find((p) => p.id === openId) ?? null;
  const selectedPeople = people.filter((p) => selected.has(p.id));
  const columns = canRoles ? 4 : 3;

  const chip = (key: string | null, label: string, n: number) => {
    const on = roleFilter === key;
    return (
      <button
        key={key ?? "all"}
        type="button"
        onClick={() => setRoleFilter(on && key !== null ? null : key)}
        aria-pressed={on}
        className={`rounded-none border px-2.5 py-1 text-xs font-medium transition-colors ${
          on
            ? "border-brand bg-brand text-white"
            : n === 0
              ? "border-neutral-200 text-neutral-400 hover:border-neutral-400 dark:border-neutral-800 dark:text-neutral-500"
              : "border-neutral-300 text-neutral-700 hover:border-brand dark:border-neutral-700 dark:text-neutral-200"
        }`}
      >
        {label} <span className={on ? "text-white/80" : "text-neutral-400"}>{n}</span>
      </button>
    );
  };

  const TH = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400";

  return (
    <div className="space-y-4">


      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, role or ID"
            aria-label="Search people"
            className="form-input w-full rounded-none pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded-none"
          />
          Show switched-off accounts
        </label>
      </div>

      {canRoles && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by new role">
          {chip(null, "Everyone", pool.length)}
          {catalog.roles.map((r) => chip(r.key, r.label, counts.get(r.key) ?? 0))}
          {chip(NONE, "No role", counts.get(NONE) ?? 0)}
        </div>
      )}

      <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150">
        <table className={`w-full text-sm ${canRoles ? "min-w-[720px]" : "min-w-[520px]"}`}>
          <thead className="bg-neutral-50 dark:bg-dark-200">
            <tr>
              {canRoles && (
                <th className={`${TH} w-10`}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={selectable.length === 0}
                    aria-label="Select everyone shown"
                    className="rounded-none"
                  />
                </th>
              )}
              <th className={TH}>
                <SortHeader label="Name" field="name" sortField={sortField} sortDirection={sortDir}
                  onSort={(f, d) => { setSortField(f); setSortDir(d); }} />
              </th>
              <th className={TH}>
                <SortHeader label="Role" field="role" sortField={sortField} sortDirection={sortDir}
                  onSort={(f, d) => { setSortField(f); setSortDir(d); }} />
              </th>
              <th className={`${TH} w-20`}>
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns} className="px-3 py-10 text-center text-neutral-500 dark:text-neutral-400">
                  Nobody matches.
                </td>
              </tr>
            )}
            {rows.map((p) => {
              const lock = locked(p);
              const isSel = selected.has(p.id);
              return (
                <tr
                  key={p.id}
                  className={`border-t border-neutral-100 dark:border-neutral-800 ${
                    isSel ? "bg-brand/5" : ""
                  } ${p.is_active ? "" : "opacity-60"}`}
                >
                  {canRoles && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggle(p.id)}
                        disabled={!!lock}
                        aria-label={`Select ${p.name}`}
                        className="rounded-none"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-none bg-neutral-100 text-sm font-medium text-neutral-600 dark:bg-dark-100 dark:text-white">
                        {p.photo ? (
                          <img src={p.photo} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          p.name[0]?.toUpperCase() ?? "?"
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-neutral-900 dark:text-white">
                          {p.name}
                          {p.id === currentUserId && (
                            <span className="ml-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400">(you)</span>
                          )}
                          {!p.is_active && (
                            <span className="ml-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400">switched off</span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          {p.email}
                          {p.employee_number && <span className="ml-2 font-mono">#{p.employee_number}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {canRoles ? (
                      <select
                        value={p.new_role ?? ""}
                        disabled={!!lock || saving}
                        title={lock ?? undefined}
                        aria-label={`Role for ${p.name}`}
                        onChange={(e) => void change([p], e.target.value || null)}
                        className="form-input w-48 rounded-none py-1 text-sm"
                      >
                        <option value="">No role</option>
                        {catalog.roles
                          .filter((r) => isSuper || r.key !== SUPER_ADMIN || p.new_role === SUPER_ADMIN)
                          .map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.label}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <span className="text-neutral-700 dark:text-neutral-300">
                        {roleLabel.get(p.new_role ?? "") ?? "No role"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setOpenId(p.id)}
                      aria-label={`Edit ${p.name}`}
                      leftIcon={<Pencil className="h-4 w-4" />}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PersonDialog
        person={openPerson}
        onClose={() => setOpenId(null)}
        canUsers={canUsers}
        canRoles={canRoles}
        currentUserId={currentUserId}
        onPatch={patchPerson}
        onRolePicked={(id, role) => applyLocal(new Set([id]), role)}
        onChanged={onChanged}
      />

      {selectedPeople.length > 0 &&
        createPortal(
          <div
            role="region"
            aria-label="Move selected people"
            className="fixed bottom-6 left-4 right-4 z-50 flex flex-wrap items-center gap-3 rounded-none border border-neutral-200 bg-white px-4 py-3 shadow-lg dark:border-dark-200 dark:bg-dark-150 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 print:hidden"
          >
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              {selectedPeople.length} selected
            </span>
            <select
              value={bulkRole}
              onChange={(e) => setBulkRole(e.target.value)}
              aria-label="Move selected people to"
              className="form-input w-44 rounded-none py-1 text-sm"
            >
              <option value="">Move to…</option>
              {catalog.roles
                .filter((r) => isSuper || r.key !== SUPER_ADMIN)
                .map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
            </select>
            <Button
              size="sm"
              disabled={!bulkRole || saving}
              isLoading={saving}
              onClick={() => void change(selectedPeople, bulkRole)}
            >
              Move
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<X className="h-4 w-4" />}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>,
          document.body,
        )}
    </div>
  );
}
