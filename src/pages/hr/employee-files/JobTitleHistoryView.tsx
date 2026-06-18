import React, { useState, useEffect } from "react";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Label } from "../../../components/ui/Label";
import { History, Loader2, Save } from "lucide-react";
import { useAuth } from "../../../lib/AuthContext";
import { toast } from "../../../components/ui/toast";
import { supabase } from "../../../lib/supabase";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const HR_ADMIN_ROLES = ["Admin", "Super Admin", "HR", "HR Rep"];

interface JobTitleHistoryViewProps {
  profileId: string;
  employeeName: string;
}

interface JobTitleEntry {
  id: string;
  title: string;
  effective_from: string;
  created_at: string;
}

function formatDate(iso: string): string {
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
}

export const JobTitleHistoryView: React.FC<JobTitleHistoryViewProps> = ({
  profileId,
  employeeName,
}) => {
  const { user } = useAuth();
  const role = (user?.user_metadata?.role as string) || "";
  const canEdit = HR_ADMIN_ROLES.includes(role);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
  const [history, setHistory] = useState<JobTitleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [titleInput, setTitleInput] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: profileData } = await supabase
        .schema("common")
        .from("profiles")
        .select("job_title")
        .eq("id", profileId)
        .single();
      const title = profileData?.job_title ?? null;
      setCurrentTitle(title);
      setTitleInput(title || "");

      const { data: historyData } = await supabase
        .schema("common")
        .from("job_title_history")
        .select("id, title, effective_from, created_at")
        .eq("profile_id", profileId)
        .order("effective_from", { ascending: false });
      setHistory((historyData as JobTitleEntry[]) || []);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [profileId]);

  const handleUpdateTitle = async () => {
    if (!user) return;
    if (!canEdit) {
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
    if (newTitle === (currentTitle || "").trim()) {
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
          profile_id: profileId,
          title: newTitle,
          effective_from: new Date().toISOString(),
          created_by: user.id,
        });
      if (insertError) throw new Error(insertError.message);

      const { error: updateError } = await supabase
        .schema("common")
        .from("profiles")
        .update({ job_title: newTitle })
        .eq("id", profileId);
      if (updateError) throw new Error(updateError.message);

      toast({
        title: "Success",
        description: "Title updated and history recorded.",
        variant: "success",
      });
      fetchData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to update title",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="h-5 w-5 animate-spin" />
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Current job title
          </CardTitle>
          <CardDescription>Current title for {employeeName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentTitle ? (
            <p className="text-lg text-zinc-900 dark:text-white">
              {currentTitle}
            </p>
          ) : (
            <p className="text-muted-foreground">No job title on file.</p>
          )}
          {canEdit && (
            <div className="pt-4 border-t border-zinc-200 dark:border-dark-200 space-y-4">
              <Label htmlFor="title-input">Update job title</Label>
              <div className="flex gap-2">
                <Input
                  id="title-input"
                  placeholder="e.g. Senior Engineer, Project Manager"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUpdateTitle()}
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
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job / title history</CardTitle>
          <CardDescription>
            Previous job titles for {employeeName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground py-4">No job title history.</p>
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
    </div>
  );
};
