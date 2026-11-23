import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AlertCircle, Ban, Camera, KeyRound, RefreshCw, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { useAuth } from "@/lib/AuthContext";
import { isSuperUser } from "@/lib/roles";
import { supabase } from "@/lib/supabase";
import { getViewAs } from "@/lib/viewAs";
import { PersonRow, plainError, setAccountActive } from "@/services/rolesAdminService";

interface Props {
  person: PersonRow;
  /** Show the saved value in the list right away. */
  onPatch: (patch: Partial<PersonRow>) => void;
}

const inputClass =
  "w-full px-3 py-2 text-sm border border-neutral-300 rounded-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand dark:bg-dark-100 dark:border-neutral-600 dark:text-white";
const labelClass = "mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-200";
const hintClass = "mt-1 block text-xs text-neutral-500 dark:text-neutral-400";

/** Edge functions put the real reason in the response body. */
async function functionError(err: unknown, fallback: string): Promise<string> {
  const ctx = (err as { context?: unknown } | null)?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    } catch {
      /* no JSON body */
    }
  }
  return err instanceof Error ? err.message : fallback;
}

/** People & roles → a person → Account: photo, employee ID, email, password, on or off. */
export default function PersonAccountPanel({ person, onPatch }: Props) {
  const { user: me } = useAuth();
  // Login details are limited to Super Admins; the edge functions check it too.
  const canEditLogin = isSuperUser(me?.email);

  const [employeeId, setEmployeeId] = useState(person.employee_number ?? "");
  const [email, setEmail] = useState(person.email);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [activeBusy, setActiveBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // A photo dropped beside the box would make the browser leave the page.
  useEffect(() => {
    const swallow = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);

  const nextEmail = email.trim().toLowerCase();
  const emailChanged = canEditLogin && nextEmail !== person.email.toLowerCase();
  const nextEmployeeId = employeeId.trim() || null;
  const employeeIdChanged = nextEmployeeId !== (person.employee_number || null);
  const dirty = emailChanged || employeeIdChanged;

  const saveEmail = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) throw new Error("Enter a valid email address.");
    const { error: e } = await supabase.functions.invoke("admin-update-user-email", {
      body: { userId: person.id, newEmail: nextEmail },
    });
    if (e) throw new Error(await functionError(e, "Could not change the email."));
    onPatch({ email: nextEmail });
  };

  const saveEmployeeId = async () => {
    // Update first so the profile keeps its HR fields; add a row only if there's none.
    const { data, error: e } = await supabase
      .schema("common")
      .from("profiles")
      .update({ employee_number: nextEmployeeId })
      .eq("id", person.id)
      .select("id");
    if (e) throw e;
    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.schema("common").from("profiles").insert({
        id: person.id,
        employee_number: nextEmployeeId,
        email: person.email,
        full_name: person.name,
      });
      if (insertError) throw insertError;
    }
    onPatch({ employee_number: nextEmployeeId });
  };

  // Stops at the first failure, so the message matches the field that failed.
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (emailChanged) await saveEmail();
      if (employeeIdChanged) await saveEmployeeId();
      toast.success("Saved");
    } catch (err: any) {
      const duplicate =
        err?.code === "23505" || String(err?.message ?? "").includes("profiles_employee_number_key");
      setError(
        duplicate ? `Employee ID "${nextEmployeeId}" already belongs to someone else.` : plainError(err),
      );
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    setError(null);
    if (password.length < 6) return setError("The password needs at least 6 characters.");
    if (password !== password2) return setError("The two passwords don't match.");
    setPasswordBusy(true);
    try {
      const { error: e } = await supabase.functions.invoke("admin-update-user-password", {
        body: { userId: person.id, newPassword: password },
      });
      if (e) throw new Error(await functionError(e, "Could not change the password."));
      setPassword("");
      setPassword2("");
      setPasswordOpen(false);
      toast.success("Password updated");
    } catch (err) {
      setError(plainError(err));
    } finally {
      setPasswordBusy(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Pick an image file.");
    if (file.size > 5 * 1024 * 1024) return setError("The photo must be under 5 MB.");
    // This upload skips the Supabase client, so check "View as" here too.
    if (getViewAs()) return setError("View as is read-only. Nothing was saved.");
    setUploading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("You're signed out. Sign in and try again.");
      const base = import.meta.env.VITE_SUPABASE_URL as string;
      const ext = file.name.split(".").pop();
      const path = `user-uploads/profile-images/${person.id}_${Date.now()}.${ext}`;
      const res = await fetch(`${base}/storage/v1/object/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": file.type,
          "x-upsert": "true",
        },
        body: file,
      });
      if (!res.ok) throw new Error(`The photo didn't upload (${res.status}).`);
      const publicUrl = `${base}/storage/v1/object/public/${path}`;

      const { error: e } = await supabase.schema("common").rpc("admin_update_user_metadata", {
        target_user_id: person.id,
        new_metadata: { profileImage: publicUrl },
      });
      if (e) throw e;
      // Mirror to profiles so others see the new photo.
      const { error: mirrorError } = await supabase
        .schema("common")
        .from("profiles")
        .upsert({ id: person.id, avatar_url: publicUrl, profile_image: publicUrl }, { onConflict: "id" });
      if (mirrorError) console.warn("Photo saved, but the profile copy wasn't updated", mirrorError);
      onPatch({ photo: publicUrl });
      toast.success("Photo updated");
    } catch (err) {
      setError(plainError(err));
    } finally {
      setUploading(false);
    }
  };

  const setActive = async (active: boolean) => {
    if (!active) {
      const ok = await confirmDialog({
        title: `Deactivate ${person.name}?`,
        description:
          "They're signed out, can't log in, and are hidden from lists. Their account and every report they wrote are kept. You can reactivate them any time.",
        confirmLabel: "Deactivate",
        destructive: true,
      });
      if (!ok) return;
    }
    setError(null);
    setActiveBusy(true);
    try {
      await setAccountActive(person.id, active);
      onPatch({ is_active: active });
      toast.success(active ? `${person.name} can log in again` : `${person.name} is deactivated`);
    } catch (err) {
      setError(plainError(err));
    } finally {
      setActiveBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !saving) void save();
      }}
    >
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex flex-shrink-0 flex-col items-center gap-2 sm:w-32">
          <button
            type="button"
            onClick={() => !uploading && fileRef.current?.click()}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file && !uploading) void uploadPhoto(file);
            }}
            aria-label="Change profile photo"
            aria-busy={uploading}
            className={`group relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-none border-2 border-dashed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              dragging
                ? "border-brand bg-brand/10"
                : "border-neutral-300 bg-neutral-100 hover:border-brand dark:border-neutral-600 dark:bg-dark-100"
            }`}
          >
            {person.photo ? (
              <img src={person.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-medium text-neutral-600 dark:text-white">
                {person.name[0]?.toUpperCase() ?? "?"}
              </span>
            )}
            <span
              className={`absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs font-medium text-white transition-opacity ${
                dragging
                  ? "bg-brand/70 opacity-100"
                  : "bg-black/50 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
              }`}
            >
              <Camera className="h-5 w-5" />
              {dragging ? "Drop to upload" : "Change photo"}
            </span>
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/60">
                <RefreshCw className="h-5 w-5 animate-spin text-white" />
              </span>
            )}
          </button>
          <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
            {uploading ? "Uploading..." : "Drag a photo here or click"}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void uploadPhoto(file);
            }}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Employee ID</span>
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="e.g. 1001"
                className={`${inputClass} font-mono`}
              />
              <span className={hintClass}>Roster badge number. Must be unique.</span>
            </label>
            {canEditLogin && (
              <label className="block">
                <span className={labelClass}>Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  className={inputClass}
                />
                <span className={hintClass}>Changes their login right away. Their reports stay linked.</span>
              </label>
            )}
          </div>

          {/* Behind a button, so a browser can't fill or save it by accident */}
          {canEditLogin && (
            <div className="border-t border-neutral-200 pt-4 dark:border-neutral-700">
              {passwordOpen ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="New password"
                      aria-label="New password"
                      autoComplete="new-password"
                      autoFocus
                      className={inputClass}
                    />
                    <input
                      type="password"
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      placeholder="Type it again"
                      aria-label="New password again"
                      autoComplete="new-password"
                      className={inputClass}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void savePassword()}
                      disabled={passwordBusy || !password}
                      leftIcon={<KeyRound className="h-4 w-4" />}
                    >
                      {passwordBusy ? "Setting..." : "Set password"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPasswordOpen(false);
                        setPassword("");
                        setPassword2("");
                        setError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Password</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Set a new password for them.</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPasswordOpen(true)}
                    leftIcon={<KeyRound className="h-4 w-4" />}
                  >
                    Reset password
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-none border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-700">
        <div>
          {person.id !== me?.id && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={activeBusy}
              onClick={() => void setActive(!person.is_active)}
              className={
                person.is_active
                  ? "px-2 text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/20"
                  : "px-2 text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/20"
              }
              leftIcon={
                activeBusy ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : person.is_active ? (
                  <Ban className="h-4 w-4" />
                ) : (
                  <UserCheck className="h-4 w-4" />
                )
              }
            >
              {person.is_active ? "Deactivate" : "Reactivate"}
            </Button>
          )}
        </div>
        <Button type="submit" size="sm" disabled={!dirty || saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
