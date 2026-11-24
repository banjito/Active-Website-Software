import { useCallback, useEffect, useState } from "react";
import { HardHat, Mail, Plus, X } from "lucide-react";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { toast } from "@/components/ui/toast";
import {
  inviteSubcontractor,
  loadJobSubcontractors,
  removeSubcontractorFromJob,
  type JobSubcontractor,
} from "@/services/subcontractorService";

/**
 * Job → Overview → Subcontractors (Roles scope item 8). Shown to people with
 * "Invite subcontractors" (Admin and PM). Invited subs see this job and every report
 * on it, fill in their own reports and add photos. Nothing else.
 */
export default function JobSubcontractorsCard({ jobId }: { jobId: string }) {
  const [subs, setSubs] = useState<JobSubcontractor[] | null>(null);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "" });
  const [sending, setSending] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSubs(await loadJobSubcontractors(jobId));
    } catch (err) {
      console.warn("Could not load subcontractors", err);
      setSubs([]);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await inviteSubcontractor({ jobId, ...form });
      toast({
        title: res.emailed ? `Invite sent to ${form.email}` : "Added, but the email didn't send",
        description: res.emailed
          ? "Their link signs them in and opens this job."
          : "They can use \"Email me a sign-in link\" on the login page.",
        variant: res.emailed ? "success" : "destructive",
      });
      setInviting(false);
      setForm({ name: "", email: "", company: "" });
      await load();
    } catch (err) {
      toast({
        title: "Invite not sent",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const remove = async (sub: JobSubcontractor) => {
    if (!window.confirm(`Remove ${sub.name} from this job? They lose access to it right away.`)) return;
    setRemoving(sub.user_id);
    try {
      await removeSubcontractorFromJob(jobId, sub.user_id);
      setSubs((prev) => (prev ?? []).filter((s) => s.user_id !== sub.user_id));
      toast({ title: `${sub.name} removed from this job`, variant: "success" });
    } catch (err) {
      toast({
        title: "Could not remove",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setRemoving(null);
    }
  };

  const signedIn = (s: JobSubcontractor) =>
    s.last_sign_in_at
      ? `Last signed in ${new Date(s.last_sign_in_at).toLocaleDateString()}`
      : "Not signed in yet";

  return (
    <>
      <Card className="group">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <HardHat className="h-5 w-5 text-brand" />
            <span>Subcontractors</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subs === null ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
          ) : subs.length === 0 ? null : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {subs.map((s) => (
                <li key={s.user_id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                      {s.name}
                      <span className="ml-2 font-normal text-neutral-500 dark:text-neutral-400">{s.company}</span>
                    </div>
                    <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {s.email} · {signedIn(s)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(s)}
                    disabled={removing === s.user_id}
                    aria-label={`Remove ${s.name} from this job`}
                    title="Remove from this job"
                    className="rounded-none p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-red-600 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-dark-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Faint until you hover the card (full on touch screens and keyboard focus) */}
          <button
            type="button"
            onClick={() => setInviting(true)}
            className={`${subs?.length ? "mt-3 " : ""}inline-flex items-center gap-1 rounded-none text-sm font-medium text-brand opacity-40 transition-opacity hover:underline focus-visible:opacity-100 group-hover:opacity-100 touch:opacity-100`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Invite
          </button>
        </CardContent>
      </Card>

      <Dialog open={inviting} onOpenChange={(open) => !sending && setInviting(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite a subcontractor</DialogTitle>
            <DialogDescription>
              They get an email with a sign-in link. No password. They see this job and every report
              on it, fill in their own reports and add photos. Access lasts until you remove them.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={send} className="space-y-3">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              autoFocus
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
            <Input
              label="Company"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              required
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviting(false)} disabled={sending}>
                Cancel
              </Button>
              <Button type="submit" isLoading={sending} leftIcon={<Mail className="h-4 w-4" />}>
                Send invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
