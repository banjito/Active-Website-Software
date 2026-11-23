import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { AccessChange, Catalog, PersonRow, loadHistory, plainError } from "@/services/rolesAdminService";

interface Props {
  catalog: Catalog;
  people: PersonRow[];
}

/** Every role and permission change, newest first, in plain words. */
export default function HistoryTab({ catalog, people }: Props) {
  const [rows, setRows] = useState<AccessChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadHistory()
      .then((r) => live && setRows(r))
      .catch((err) => live && setError(plainError(err)));
    return () => {
      live = false;
    };
  }, []);

  const personName = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const roleLabel = useMemo(() => new Map(catalog.roles.map((r) => [r.key, r.label])), [catalog.roles]);
  const permLabel = useMemo(() => new Map(catalog.permissions.map((p) => [p.key, p.label])), [catalog.permissions]);

  const who = (id: string | null) => (id ? personName.get(id) || "Someone" : "ampOS setup");
  // A deleted role isn't in the list any more, so make its key readable
  const role = (k: string | null | undefined) =>
    k ? roleLabel.get(k) || k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "no role";
  const perm = (k: string | null) => `"${(k && permLabel.get(k)) || k}"`;

  const describe = (c: AccessChange): string => {
    switch (c.action) {
      case "person_role":
        return c.detail?.cleared
          ? `Set ${who(c.user_id)} back to same as today (${role(c.detail?.to)})`
          : `Moved ${who(c.user_id)} from ${role(c.detail?.from)} to ${role(c.role_key)}`;
      case "role_ticks":
        return `${c.detail?.on ? "Turned on" : "Turned off"} ${perm(c.permission_key)} for ${role(c.role_key)}`;
      case "person_extra":
        if (c.detail?.granted === true) return `Gave ${who(c.user_id)} ${perm(c.permission_key)}`;
        if (c.detail?.granted === false) return `Took ${perm(c.permission_key)} away from ${who(c.user_id)}`;
        return `Set ${perm(c.permission_key)} for ${who(c.user_id)} back to what their role says`;
      case "role_copied":
        return `Made ${c.detail?.label ?? role(c.role_key)} as a copy of ${role(c.detail?.from)}`;
      case "role_deleted":
        return `Deleted the ${c.detail?.label ?? c.role_key} role`;
      default:
        return c.action;
    }
  };

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!rows) {
    return (
      <div className="flex min-h-[160px] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-none border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        No changes yet. Every change made on this screen shows up here: who, what and when.
      </div>
    );
  }

  const TH = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400";
  return (
    <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-neutral-50 dark:bg-dark-200">
          <tr>
            <th className={`${TH} w-44`}>When</th>
            <th className={`${TH} w-44`}>Who</th>
            <th className={TH}>What</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="whitespace-nowrap px-3 py-2 text-neutral-500 dark:text-neutral-400">
                {format(new Date(c.changed_at), "MMM d, h:mm a")}
              </td>
              <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300">{who(c.changed_by)}</td>
              <td className="px-3 py-2 text-neutral-900 dark:text-white">{describe(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
