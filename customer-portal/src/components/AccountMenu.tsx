import { useState } from "react";
import { Check, KeyRound, LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { getCurrentUserContact, type Contact } from "@/services/portalData";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const src = (name || email).trim();
  return src.slice(0, 2).toUpperCase() || "?";
}

function contactFullName(contact: Contact | null): string {
  return [contact?.first_name, contact?.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}

export function AccountMenu() {
  const { user, signOut, updateProfile, updateEmail, updatePassword } =
    useAuth();
  const meta = (user?.user_metadata ?? {}) as Record<
    string,
    string | undefined
  >;

  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(meta.full_name ?? "");
  const [phone, setPhone] = useState(meta.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [contact, setContact] = useState<Contact | null>(null);
  const [loadingContact, setLoadingContact] = useState(false);
  const [contactLoadError, setContactLoadError] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const [busy, setBusy] = useState<"profile" | "password" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState(false);

  const contactName = contactFullName(contact);
  const avatarName = (meta.full_name ?? "").trim() || contactName;
  const display = avatarName || user?.email || "";

  async function loadContactDefaults() {
    if (!user?.email) return;

    setLoadingContact(true);
    setContactLoadError(null);
    try {
      const currentContact = await getCurrentUserContact(user.email);
      setContact(currentContact);

      if (currentContact) {
        const name = contactFullName(currentContact);
        setFullName(name || (meta.full_name ?? ""));
        setPhone(currentContact.phone ?? meta.phone ?? "");
        setEmail(user.email ?? currentContact.email ?? "");
      }
    } catch (e) {
      setContactLoadError(
        e instanceof Error ? e.message : "Could not load contact details.",
      );
    } finally {
      setLoadingContact(false);
    }
  }

  function openModal() {
    // Re-sync fields with the latest auth values immediately, then prefer the
    // matching ampOS contact once it loads from Supabase.
    setContact(null);
    setFullName(meta.full_name ?? "");
    setPhone(meta.phone ?? "");
    setEmail(user?.email ?? "");
    setNewPassword("");
    setShowPassword(false);
    setError(null);
    setOk(null);
    setEmailNotice(false);
    setContactLoadError(null);
    setOpen(true);
    void loadContactDefaults();
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy("profile");
    setError(null);
    setOk(null);
    setEmailNotice(false);

    const metaChanged =
      fullName.trim() !== (meta.full_name ?? "") ||
      phone.trim() !== (meta.phone ?? "");
    if (metaChanged) {
      const { error } = await updateProfile({
        full_name: fullName.trim(),
        phone: phone.trim(),
      });
      if (error) return fail(error);
    }

    const emailChanged =
      email.trim().toLowerCase() !== (user?.email ?? "").toLowerCase();
    if (emailChanged) {
      const { error } = await updateEmail(email.trim());
      if (error) return fail(error);
      setEmailNotice(true);
    }

    if (!metaChanged && !emailChanged) setOk("Nothing to save.");
    else setOk("Saved.");
    setBusy(null);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (newPassword.length < 6)
      return setError("Password must be at least 6 characters.");
    setBusy("password");
    const { error } = await updatePassword(newPassword);
    if (error) return fail(error);
    setNewPassword("");
    setShowPassword(false);
    setOk("Password updated.");
    setBusy(null);
  }

  function fail(message: string) {
    setError(message);
    setBusy(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Account settings"
        title={display}
        className="inline-flex h-9 w-9 items-center justify-center bg-primary text-xs font-bold text-primary-foreground shadow-soft ring-2 ring-transparent transition-all duration-300 ease-spring hover:scale-105 hover:ring-primary/30 active:scale-95"
      >
        {initials(avatarName, user?.email ?? "")}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Your account">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center bg-primary text-base font-bold text-primary-foreground shadow-soft">
            {initials(avatarName, user?.email ?? "")}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{display}</div>
            <div className="truncate text-sm text-muted-foreground">
              {user?.email}
            </div>
          </div>
        </div>

        <form onSubmit={saveProfile} className="space-y-4">
          {loadingContact}

          {contactLoadError && (
            <p className="text-xs text-muted-foreground">
              Could not load ampOS contact defaults: {contactLoadError}
            </p>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="acct-name">
              Full name
            </label>
            <Input
              id="acct-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              disabled={loadingContact}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="acct-phone">
              Phone{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <Input
              id="acct-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              disabled={loadingContact}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="acct-email">
              Email
            </label>
            <Input
              id="acct-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loadingContact}
            />
            <p className="text-xs text-muted-foreground">
              Changing this sends a confirmation link to the new address.
            </p>
          </div>

          {emailNotice && (
            <p className="bg-accent px-3 py-2 text-xs text-accent-foreground">
              Check your new email for a link to confirm the change.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {ok && (
            <p className="flex items-center gap-1.5 text-sm text-primary">
              <Check className="h-4 w-4" /> {ok}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={busy !== null || loadingContact}
          >
            {busy === "profile" && (
              <Spinner className="text-primary-foreground" />
            )}
            Save changes
          </Button>
        </form>

        <div className="my-5 border-t border-border" />

        {!showPassword ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setShowPassword(true);
              setError(null);
              setOk(null);
            }}
          >
            <KeyRound className="h-4 w-4" />
            Change password
          </Button>
        ) : (
          <form onSubmit={savePassword} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="acct-pass">
                New password
              </label>
              <Input
                id="acct-pass"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={busy !== null}>
                {busy === "password" && (
                  <Spinner className="text-primary-foreground" />
                )}
                Update password
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowPassword(false);
                  setNewPassword("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        <div className="my-5 border-t border-border" />

        <Button
          type="button"
          variant="ghost"
          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void signOut()}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </Modal>
    </>
  );
}
