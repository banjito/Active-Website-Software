import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, Search, Send, Users } from "lucide-react";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import {
  fetchEmployeeRoster,
  type RosterEmployee,
} from "@/lib/utils/employeeRoster";

/** Read by the monthly-calibration-due-report edge function. */
const SETTINGS_KEY = "calibration_report_recipients";

interface AudienceEmployee {
  id: string;
  email: string;
  name: string;
}

interface PreviewResult {
  overdueCount: number;
  dueSoonCount: number;
  recipients: string[];
  subject: string;
}

export default function CalibrationReportRecipients() {
  const [roster, setRoster] = useState<RosterEmployee[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [people, settingRes] = await Promise.all([
        fetchEmployeeRoster(),
        supabase
          .schema("common")
          .from("app_settings")
          .select("value")
          .eq("key", SETTINGS_KEY)
          .maybeSingle(),
      ]);

      setRoster(people);
      const saved = (settingRes.data?.value?.employees ??
        []) as AudienceEmployee[];
      setSelectedIds(new Set(saved.map((e) => e.id).filter(Boolean)));
    } catch (err) {
      console.error("Failed to load calibration report recipients:", err);
      toast({
        title: "Could not load the recipient list",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return roster;
    return roster.filter((p) =>
      `${p.name} ${p.email} ${p.division}`.toLowerCase().includes(query),
    );
  }, [roster, search]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const employees: AudienceEmployee[] = roster
        .filter((p) => selectedIds.has(p.id))
        .map((p) => ({ id: p.id, email: p.email, name: p.name }));

      const { error } = await supabase
        .schema("common")
        .from("app_settings")
        .upsert(
          {
            key: SETTINGS_KEY,
            value: { type: "selected", employees },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" },
        );

      if (error) throw error;
      toast({
        title: `Recipient list saved (${employees.length})`,
        variant: "success",
      });
    } catch (err: any) {
      console.error("Failed to save calibration report recipients:", err);
      toast({
        title: "Could not save the recipient list",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  /** Ask the function what it would send, without sending it. */
  const runPreview = async () => {
    setRunning(true);
    setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "monthly-calibration-due-report",
        { body: { previewOnly: true } },
      );
      if (error) throw error;
      setPreview(data as PreviewResult);
    } catch (err: any) {
      toast({
        title: "Preview failed",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const sendNow = async () => {
    if (
      !window.confirm(
        "Send the calibration report now, to everyone on the list? They will get a real email.",
      )
    ) {
      return;
    }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "monthly-calibration-due-report",
        { body: {} },
      );
      if (error) throw error;
      toast({
        title: data?.emailSent
          ? `Sent to ${data.recipientCount} recipient(s)`
          : "Nothing sent",
        description: data?.emailSent ? undefined : data?.message,
        variant: data?.emailSent ? "success" : "destructive",
      });
    } catch (err: any) {
      toast({
        title: "Send failed",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Calibration report recipients
        </CardTitle>
        <CardDescription>
          Who gets the monthly calibration due report, sent on the 1st at 8:00 AM
          Central. Anyone here receives it without having to opt in. People can
          still switch it off for themselves in their own email settings, and
          anyone not on this list can switch it on.
        </CardDescription>
        <CardDescription>
          Division leads are already included and do not need adding here.
          Whoever is assigned as Director or Project Manager on the division
          switcher receives this report automatically, so a new PM is subscribed
          the moment they are assigned. Use this list for anyone else.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people by name, email or division"
                  className="pl-10"
                />
              </div>
              <span className="text-sm text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                <Users className="inline h-4 w-4 mr-1" />
                {selectedIds.size} selected
              </span>
            </div>

            <div className="max-h-[420px] overflow-y-auto border border-neutral-200 dark:border-dark-200">
              {visible.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  Nobody matches that search.
                </p>
              ) : (
                visible.map((person) => (
                  <label
                    key={person.id}
                    className="flex items-center gap-3 px-4 py-2 border-b border-neutral-100 dark:border-dark-200 last:border-b-0 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(person.id)}
                      onChange={() => toggle(person.id)}
                      className="h-4 w-4 accent-brand"
                    />
                    <span className="flex flex-col">
                      <span className="text-sm font-medium text-neutral-900 dark:text-white">
                        {person.name}
                      </span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {person.email}
                        {person.division ? ` · ${person.division}` : ""}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save list"}
              </Button>
              <Button
                variant="secondary"
                onClick={runPreview}
                disabled={running}
              >
                {running ? "Working…" : "Preview"}
              </Button>
              <Button
                variant="secondary"
                onClick={sendNow}
                disabled={running}
                leftIcon={<Send className="h-4 w-4" />}
              >
                Send now
              </Button>
            </div>

            {preview && (
              <div className="border border-neutral-200 dark:border-dark-200 bg-neutral-50 dark:bg-dark-200 p-4 text-sm">
                <p className="font-medium text-neutral-900 dark:text-white mb-2">
                  {preview.subject}
                </p>
                <p className="text-neutral-600 dark:text-neutral-400">
                  {preview.overdueCount} overdue, {preview.dueSoonCount} due
                  within 60 days.
                </p>
                <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                  Would go to {preview.recipients.length} address
                  {preview.recipients.length === 1 ? "" : "es"}:{" "}
                  {preview.recipients.length > 0
                    ? preview.recipients.join(", ")
                    : "nobody yet"}
                </p>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">
                  This is the real recipient list, so it includes anyone who
                  opted in themselves and excludes anyone who opted out.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
