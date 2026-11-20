import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/lib/AuthContext";
import { useCan } from "@/lib/permissions";
import {
  Catalog,
  PersonRow,
  loadCatalog,
  loadPeople,
  plainError,
} from "@/services/rolesAdminService";
import PeopleTab from "./PeopleTab";
import RolesTab from "./RolesTab";
import HistoryTab from "./HistoryTab";

type TabKey = "people" | "roles" | "history";
const TABS: TabKey[] = ["people", "roles", "history"];

/**
 * Admin → Roles & permissions (Roles scope item 3).
 * People: pick each person's new role. Roles: tick what each role can do.
 * History: every change, who and when.
 */
export default function RolesAndPermissions() {
  const { user } = useAuth();
  const { can } = useCan();
  const isSuper = can("admin.make_super_admin");
  const [params, setParams] = useSearchParams();
  const tab: TabKey = TABS.includes(params.get("tab") as TabKey) ? (params.get("tab") as TabKey) : "people";

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  const reloadCatalog = useCallback(async () => {
    try {
      setCatalog(await loadCatalog());
    } catch (err) {
      setError(plainError(err));
    }
  }, []);

  const reloadPeople = useCallback(async () => {
    try {
      setPeople(await loadPeople());
    } catch (err) {
      setError(plainError(err));
    }
  }, []);

  useEffect(() => {
    void reloadCatalog();
    void reloadPeople();
  }, [reloadCatalog, reloadPeople]);

  const changed = useCallback(() => setHistoryVersion((v) => v + 1), []);

  const peopleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of people ?? []) {
      if (!p.is_active) continue;
      const k = p.new_role ?? "";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [people]);

  const setTab = (next: string) => {
    const nextParams = new URLSearchParams(params);
    if (next === "people") nextParams.delete("tab");
    else nextParams.set("tab", next);
    setParams(nextParams, { replace: true });
  };

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-none border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  if (!catalog || !people) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const activeCount = people.filter((p) => p.is_active).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-none border border-brand/40 bg-brand/5 p-4">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
        <p className="text-sm text-neutral-700 dark:text-neutral-200">
          <span className="font-semibold text-neutral-900 dark:text-white">Not switched on yet.</span>{" "}
          What you set here is saved, but everyone keeps today&apos;s access until ampOS switches over, one
          area at a time. Sort people and roles now so switch-over day is quiet.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="people">People ({activeCount})</TabsTrigger>
          <TabsTrigger value="roles">Roles ({catalog.roles.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="people" className="pt-4">
          <PeopleTab
            catalog={catalog}
            people={people}
            setPeople={setPeople}
            currentUserId={user?.id ?? null}
            isSuper={isSuper}
            onChanged={changed}
          />
        </TabsContent>

        <TabsContent value="roles" className="pt-4">
          <RolesTab
            catalog={catalog}
            peopleCounts={peopleCounts}
            isSuper={isSuper}
            reloadCatalog={reloadCatalog}
            onChanged={changed}
            onRoleDeleted={reloadPeople}
          />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <HistoryTab key={historyVersion} catalog={catalog} people={people} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
