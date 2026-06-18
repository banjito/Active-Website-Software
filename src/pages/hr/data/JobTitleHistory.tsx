import React, { useState, useEffect, useCallback } from "react";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Label } from "../../../components/ui/Label";
import { History, User, Briefcase, Loader2, Save } from "lucide-react";
import { useAuth } from "../../../lib/AuthContext";
import { toast } from "../../../components/ui/toast";
import { supabase } from "../../../lib/supabase";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface EmployeeOption {
  id: string;
  email: string;
  full_name: string;
  job_title?: string;
}

interface JobTitleHistoryEntry {
  id: string;
  profile_id: string;
  title: string;
  effective_from: string;
  created_at: string;
}

const HR_ADMIN_ROLES = ["Admin", "Super Admin", "HR", "HR Rep"];

export const JobTitleHistory: React.FC = () => {
  const { user } = useAuth();
  const role = (user?.user_metadata?.role as string) || "";
  const canEditTitle = HR_ADMIN_ROLES.includes(role);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [selectedEmployee, setSelectedEmployee] =
    useState<EmployeeOption | null>(null);
  const [currentTitle, setCurrentTitle] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [history, setHistory] = useState<JobTitleHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchEmployees = useCallback(async () => {
    try {
      setLoadingEmployees(true);
      const { data: usersData, error: usersErr } = await supabase
        .schema("common")
        .rpc("admin_get_users");

      let allUsers: any[] = [];
      if (usersErr) {
        const fallback = await supabase.rpc("admin_get_users");
        allUsers = fallback.data || [];
      } else {
        allUsers = usersData || [];
      }

      if (!allUsers?.length) {
        setEmployees([]);
        return;
      }

      const { data: profilesData } = await supabase
        .schema("common")
        .from("profiles")
        .select("id, full_name, job_title");

      const profilesMap: Record<
        string,
        { full_name?: string; job_title?: string }
      > = {};
      (profilesData || []).forEach((p: any) => {
        profilesMap[p.id] = { full_name: p.full_name, job_title: p.job_title };
      });

      const list = allUsers
        .filter((u: any) =>
          (u.email || "").toLowerCase().endsWith("@ampqes.com"),
        )
        .map((u: any) => {
          const profile = profilesMap[u.id];
          const name =
            profile?.full_name ||
            u.raw_user_meta_data?.name ||
            u.user_metadata?.name ||
            u.email?.split("@")[0] ||
            "Unknown";
          return {
            id: u.id,
            email: u.email || "",
            full_name: name,
            job_title: profile?.job_title || "",
          };
        })
        .sort((a: EmployeeOption, b: EmployeeOption) =>
          (a.full_name || a.email)
            .toLowerCase()
            .localeCompare((b.full_name || b.email).toLowerCase()),
        );

      setEmployees(list);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to load employees",
        variant: "destructive",
      });
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const fetchHistory = useCallback(async (profileId: string) => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .schema("common")
        .from("job_title_history")
        .select("id, profile_id, title, effective_from, created_at")
        .eq("profile_id", profileId)
        .order("effective_from", { ascending: false });

      if (error) throw error;
      setHistory((data as JobTitleHistoryEntry[]) || []);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to load title history",
        variant: "destructive",
      });
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedEmployee) {
      setCurrentTitle("");
      setTitleInput("");
      setHistory([]);
      return;
    }
    const title = selectedEmployee.job_title || "";
    setCurrentTitle(title);
    setTitleInput(title);
    fetchHistory(selectedEmployee.id);
  }, [selectedEmployee, fetchHistory]);

  const handleUpdateTitle = async () => {
    if (!selectedEmployee || !user) return;
    if (!canEditTitle) {
      toast({
        title: "Access denied",
        description: "Only HR or Admin can change employee title history.",
        variant: "destructive",
      });
      return;
    }
    const newTitle = (titleInput || "").trim();
    if (!newTitle) {
      toast({
        title: "Enter a title",
        description: "Job title cannot be empty.",
        variant: "destructive",
      });
      return;
    }
    if (newTitle === (selectedEmployee.job_title || "").trim()) {
      toast({
        title: "No change",
        description: "Title is unchanged.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error: insertError } = await supabase
        .schema("common")
        .from("job_title_history")
        .insert({
          profile_id: selectedEmployee.id,
          title: newTitle,
          effective_from: new Date().toISOString(),
          created_by: user.id,
        });

      if (insertError) throw new Error(`History: ${insertError.message}`);

      const { error: updateError } = await supabase
        .schema("common")
        .from("profiles")
        .update({ job_title: newTitle })
        .eq("id", selectedEmployee.id);

      if (updateError) throw new Error(`Profile: ${updateError.message}`);

      toast({
        title: "Success",
        description: "Title updated and history recorded.",
        variant: "success",
      });
      setCurrentTitle(newTitle);
      setSelectedEmployee({ ...selectedEmployee, job_title: newTitle });
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === selectedEmployee.id ? { ...e, job_title: newTitle } : e,
        ),
      );
      fetchHistory(selectedEmployee.id);
    } catch (e: any) {
      const msg = e?.message || "Failed to update title";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <History className="h-8 w-8" />
          Job / Title History
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mt-2">
          Store and track job titles per employee. Changing an employee&apos;s
          title records it in history and updates their current title.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Select employee
          </CardTitle>
          <CardDescription>
            Choose an employee to view or update their job title and history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingEmployees ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="employee-select">Employee</Label>
              <select
                id="employee-select"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:border-dark-300"
                value={selectedEmployee?.id ?? ""}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedEmployee(
                    employees.find((emp) => emp.id === id) || null,
                  );
                }}
              >
                <option value="">— Select employee —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name || emp.email}{" "}
                    {emp.job_title ? `(${emp.job_title})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedEmployee && (
            <div className="pt-4 border-t space-y-4">
              {!canEditTitle ? (
                <p className="text-sm text-muted-foreground">
                  Only HR or Admin roles can change employee title history. You
                  can view current title and history below.
                </p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="title-input">
                    <Briefcase className="h-4 w-4 inline mr-1" />
                    Current / new title
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="title-input"
                      placeholder="e.g. Senior Engineer, Project Manager"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleUpdateTitle()
                      }
                    />
                    <Button onClick={handleUpdateTitle} disabled={saving}>
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Update title
                        </>
                      )}
                    </Button>
                  </div>
                  {currentTitle && (
                    <p className="text-sm text-muted-foreground">
                      Saved current title:{" "}
                      <span className="font-medium text-foreground">
                        {currentTitle}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedEmployee && (
        <Card>
          <CardHeader>
            <CardTitle>Title history</CardTitle>
            <CardDescription>
              Previous titles for{" "}
              {selectedEmployee.full_name || selectedEmployee.email}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <LoadingSpinner size="md" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-muted-foreground py-4">
                No title history yet. Update the title above to create the first
                record.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-dark-300">
                      <th className="text-left py-3 px-2 font-medium">Title</th>
                      <th className="text-left py-3 px-2 font-medium">
                        Effective from
                      </th>
                      <th className="text-left py-3 px-2 font-medium">
                        Recorded at
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-zinc-100 dark:border-dark-200"
                      >
                        <td className="py-2 px-2">{entry.title}</td>
                        <td className="py-2 px-2 text-muted-foreground">
                          {formatDate(entry.effective_from)}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">
                          {formatDate(entry.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
