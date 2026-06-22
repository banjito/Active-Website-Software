import { useEffect, useState } from "react";
import {
  Building2,
  Check,
  Image as ImageIcon,
  Pencil,
  Plus,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useBranding } from "@/lib/BrandingContext";
import { extractLogoColors, normalizeHexColor } from "@/lib/brandColors";
import {
  deleteContact,
  getCompany,
  getContacts,
  updateCompany,
  updateCompanyBranding,
  uploadCompanyLogo,
  upsertContact,
  type Company,
  type Contact,
} from "@/services/portalData";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type ContactDraft = {
  id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
};

const MAX_LOGO_FILE_SIZE = 4 * 1024 * 1024;

function isSupportedLogoFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/png" ||
    file.type === "image/svg+xml" ||
    name.endsWith(".png") ||
    name.endsWith(".svg")
  );
}

export function CompanyMenu() {
  const { customerId, user } = useAuth();
  const { setBranding } = useBranding();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [company, setCompany] = useState<Company | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [brandPrimary, setBrandPrimary] = useState("");
  const [palette, setPalette] = useState<string[]>([]);
  const [extractingColors, setExtractingColors] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyOk, setCompanyOk] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newDraft, setNewDraft] = useState<ContactDraft | null>(null);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  async function load() {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const [c, list] = await Promise.all([getCompany(), getContacts()]);
      setCompany(c);
      setCompanyName(c?.company_name ?? "");
      setAddress(c?.address ?? "");
      setPhone(c?.phone ?? "");
      setEmail(c?.email ?? "");
      setLogoUrl(c?.logo_url ?? "");
      setLogoFile(null);
      setLogoPreviewUrl(null);
      setBrandPrimary(normalizeHexColor(c?.brand_primary) ?? "");
      setPalette(
        c?.brand_primary
          ? [normalizeHexColor(c.brand_primary) ?? c.brand_primary]
          : [],
      );
      setContacts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load company.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshContacts() {
    setContacts(await getContacts());
  }

  function openModal() {
    setOpen(true);
    setCompanyOk(false);
    setNewDraft(null);
    void load();
  }

  function startAddContact() {
    const meta = (user?.user_metadata ?? {}) as Record<
      string,
      string | undefined
    >;
    const parts = (meta.full_name ?? "").trim().split(/\s+/).filter(Boolean);
    setNewDraft({
      id: null,
      first_name: parts[0] ?? "",
      last_name: parts.slice(1).join(" "),
      email: user?.email ?? "",
      phone: meta.phone ?? "",
      position: "",
      is_primary: contacts.length === 0,
    });
  }

  async function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;

    setError(null);
    setCompanyOk(false);

    if (!isSupportedLogoFile(file)) {
      setError("Logo must be a PNG or SVG file.");
      return;
    }

    if (file.size > MAX_LOGO_FILE_SIZE) {
      setError("Logo must be 4 MB or smaller.");
      return;
    }

    setLogoFile(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
    setExtractingColors(true);

    try {
      const colors = await extractLogoColors(file);
      setPalette(colors);
      if (colors[0]) setBrandPrimary(colors[0]);
      else
        setError(
          "Logo uploaded for preview, but no distinct logo colors were detected.",
        );
    } catch (err) {
      setPalette([]);
      setError(
        err instanceof Error ? err.message : "Could not read logo colors.",
      );
    } finally {
      setExtractingColors(false);
    }
  }

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    setSavingCompany(true);
    setError(null);
    setCompanyOk(false);
    try {
      if (!customerId) throw new Error("Not a customer account.");

      const nextBrandPrimary = normalizeHexColor(brandPrimary);
      if (brandPrimary.trim() && !nextBrandPrimary) {
        throw new Error("Choose a valid primary color from the logo palette.");
      }

      let nextLogoUrl = logoUrl.trim() || null;
      if (logoFile) {
        nextLogoUrl = await uploadCompanyLogo(logoFile, customerId);
      }

      await updateCompany({
        company_name: companyName.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
      });

      const brandingChanged =
        Boolean(logoFile) ||
        nextLogoUrl !== (company?.logo_url ?? null) ||
        nextBrandPrimary !==
          (normalizeHexColor(company?.brand_primary) ?? null);

      if (brandingChanged) {
        await updateCompanyBranding({
          logo_url: nextLogoUrl,
          brand_primary: nextBrandPrimary,
        });
        setBranding({ logoUrl: nextLogoUrl, primaryColor: nextBrandPrimary });
      }

      setCompany((prev) =>
        prev
          ? {
              ...prev,
              company_name: companyName.trim() || null,
              address: address.trim() || null,
              phone: phone.trim() || null,
              email: email.trim() || null,
              logo_url: nextLogoUrl,
              brand_primary: nextBrandPrimary,
            }
          : prev,
      );
      setLogoUrl(nextLogoUrl ?? "");
      setLogoFile(null);
      setLogoPreviewUrl(null);
      setBrandPrimary(nextBrandPrimary ?? "");
      if (nextBrandPrimary) {
        setPalette((prev) =>
          [
            nextBrandPrimary,
            ...prev.filter((color) => color !== nextBrandPrimary),
          ].slice(0, 3),
        );
      }
      setCompanyOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save company.");
    } finally {
      setSavingCompany(false);
    }
  }

  const logoPreviewSrc = logoPreviewUrl || logoUrl;
  const selectedBrandPrimary = normalizeHexColor(brandPrimary);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Your Company"
        title="Your Company"
        className="inline-flex h-9 w-9 items-center justify-center border border-border bg-card/60 text-muted-foreground transition-all duration-300 ease-spring hover:scale-105 hover:border-primary/40 hover:text-foreground active:scale-95"
      >
        <Building2 className="h-[18px] w-[18px]" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Your Company"
        titleAction={
          company?.status ? (
            <span className="bg-accent px-2.5 py-0.5 text-xs font-medium capitalize text-accent-foreground">
              {company.status}
            </span>
          ) : null
        }
        panelClassName="max-h-[82vh] max-w-5xl"
      >
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
            <section className="space-y-5">
              {/* Company details */}
              <form onSubmit={saveCompany} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="co-name">
                    Company name
                  </label>
                  <Input
                    id="co-name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="co-address">
                    Address
                  </label>
                  <Input
                    id="co-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium" htmlFor="co-phone">
                      Phone
                    </label>
                    <Input
                      id="co-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium" htmlFor="co-email">
                      Email
                    </label>
                    <Input
                      id="co-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-3 border border-border bg-background/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <label className="text-sm font-medium" htmlFor="co-logo">
                        Company logo
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Accepted file types: PNG or SVG.
                      </p>
                    </div>
                    <div className="flex h-14 w-32 shrink-0 items-center justify-center border border-border bg-card p-2">
                      {logoPreviewSrc ? (
                        <img
                          src={logoPreviewSrc}
                          alt="Company logo preview"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  <label
                    htmlFor="co-logo"
                    className="flex cursor-pointer items-center justify-center gap-2 border border-dashed border-primary/40 bg-accent/40 px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent"
                  >
                    <Upload className="h-4 w-4" />
                    {logoFile ? logoFile.name : "Upload logo"}
                    <input
                      id="co-logo"
                      type="file"
                      accept=".png,.svg,image/png,image/svg+xml"
                      className="sr-only"
                      onChange={handleLogoFileChange}
                    />
                  </label>

                  {extractingColors && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Spinner className="h-3.5 w-3.5" /> Finding logo colors…
                    </p>
                  )}

                  {palette.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {palette.map((color) => {
                          const selected = selectedBrandPrimary === color;
                          return (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setBrandPrimary(color)}
                              className={`group flex items-center gap-2 border px-2 py-1 text-xs font-medium transition-all ${
                                selected
                                  ? "border-primary bg-card text-foreground ring-2 ring-ring/40"
                                  : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
                              }`}
                              aria-pressed={selected}
                            >
                              <span
                                className="flex h-6 w-6 items-center justify-center border border-black/10 shadow-sm"
                                style={{ backgroundColor: color }}
                              >
                                {selected && (
                                  <Check className="h-3.5 w-3.5 text-white drop-shadow" />
                                )}
                              </span>
                              {color}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
                {companyOk && (
                  <p className="flex items-center gap-1.5 text-sm text-primary">
                    <Check className="h-4 w-4" /> Company saved.
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={savingCompany || extractingColors}
                >
                  {savingCompany && (
                    <Spinner className="text-primary-foreground" />
                  )}
                  Save company
                </Button>
              </form>
            </section>

            {/* Contacts */}
            <section className="space-y-3 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Contacts</h3>
                {!newDraft && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={startAddContact}
                  >
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                )}
              </div>

              <div
                className={`space-y-3 ${
                  contacts.length > 4 ? "max-h-80 overflow-y-auto pr-1" : ""
                }`}
              >
                {contacts.length === 0 && !newDraft && (
                  <p className="text-sm text-muted-foreground">
                    No contacts on file yet.
                  </p>
                )}

                {contacts.map((c) => (
                  <ContactItem
                    key={c.id}
                    contact={c}
                    onChanged={refreshContacts}
                  />
                ))}
              </div>

              {newDraft && (
                <ContactEditor
                  draft={newDraft}
                  onCancel={() => setNewDraft(null)}
                  onSaved={async () => {
                    setNewDraft(null);
                    await refreshContacts();
                  }}
                />
              )}
            </section>
          </div>
        )}
      </Modal>
    </>
  );
}

function ContactItem({
  contact,
  onChanged,
}: {
  contact: Contact;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (editing) {
    return (
      <ContactEditor
        draft={{
          id: contact.id,
          first_name: contact.first_name ?? "",
          last_name: contact.last_name ?? "",
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          position: contact.position ?? "",
          is_primary: contact.is_primary ?? false,
        }}
        onCancel={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false);
          await onChanged();
        }}
      />
    );
  }

  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    "Unnamed contact";

  async function remove() {
    setRemoving(true);
    try {
      await deleteContact(contact.id);
      await onChanged();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 border bg-card p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-medium">
          <span className="truncate">{name}</span>
          {contact.is_primary && (
            <Star className="h-3.5 w-3.5 fill-primary text-primary" />
          )}
        </div>
        {contact.position && (
          <div className="text-xs text-muted-foreground">
            {contact.position}
          </div>
        )}
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {contact.email && <span className="truncate">{contact.email}</span>}
          {contact.email && contact.phone && <span>·</span>}
          {contact.phone && <span>{contact.phone}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setEditing(true)}
          aria-label="Edit contact"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={remove}
          disabled={removing}
          aria-label="Delete contact"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {removing ? <Spinner /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function ContactEditor({
  draft,
  onCancel,
  onSaved,
}: {
  draft: ContactDraft;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [c, setC] = useState<ContactDraft>(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) {
    setC((prev) => ({ ...prev, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!c.first_name.trim() && !c.last_name.trim()) {
      setError("Enter a first or last name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await upsertContact({
        id: c.id,
        first_name: c.first_name.trim(),
        last_name: c.last_name.trim(),
        email: c.email.trim(),
        phone: c.phone.trim(),
        position: c.position.trim(),
        is_primary: c.is_primary,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save contact.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="space-y-3 border border-primary/30 bg-accent/30 p-3"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          placeholder="First name"
          value={c.first_name}
          onChange={(e) => set("first_name", e.target.value)}
        />
        <Input
          placeholder="Last name"
          value={c.last_name}
          onChange={(e) => set("last_name", e.target.value)}
        />
      </div>
      <Input
        placeholder="Role / position"
        value={c.position}
        onChange={(e) => set("position", e.target.value)}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          placeholder="Email"
          type="email"
          value={c.email}
          onChange={(e) => set("email", e.target.value)}
        />
        <Input
          placeholder="Phone"
          type="tel"
          value={c.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={c.is_primary}
          onChange={(e) => set("is_primary", e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Primary contact
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" className="flex-1" disabled={busy}>
          {busy && <Spinner className="text-primary-foreground" />}
          Save contact
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
