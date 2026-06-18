import React, { useEffect, useRef, useState } from "react";
import {
  Feather,
  Search,
  X,
  Phone,
  Mail,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/toast";
import {
  createInteraction,
  getContactsForCustomer,
  searchCustomers,
  type InteractionType,
} from "@/services/interactionsService";

const iconButtonClass =
  "rounded-full w-10 h-10 p-0 flex items-center justify-center text-neutral-600 dark:text-white hover:text-[#f26722] dark:hover:text-[#f26722] bg-transparent hover:bg-transparent focus:outline-none focus:text-[#f26722] focus:bg-[#f26722]/10 focus:ring-2 focus:ring-[#f26722]/30";
const iconButtonActiveClass =
  "text-[#f26722] bg-[#f26722]/10 ring-2 ring-[#f26722]/30";

const TYPES: {
  value: InteractionType;
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: "call", label: "Call", icon: <Phone className="h-4 w-4" /> },
  { value: "email", label: "Email", icon: <Mail className="h-4 w-4" /> },
  {
    value: "in_person",
    label: "In Person",
    icon: <UserIcon className="h-4 w-4" />,
  },
];

type Customer = { id: string; company_name: string; name: string };
type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  is_primary?: boolean;
};

/**
 * Top-bar widget: quickly log an interaction. Flow: pick Customer → Contact → Note.
 * Dispatches an "interactionLogged" window event on success so feeds can refresh.
 */
export const QuickLogInteraction: React.FC = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Customer search
  const [customerTerm, setCustomerTerm] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );

  // Contacts for selected customer
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactId, setContactId] = useState("");

  // Note fields
  const [noteType, setNoteType] = useState<InteractionType>("call");
  const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced customer search (only while no customer chosen yet)
  useEffect(() => {
    if (!open || selectedCustomer) return;
    if (!customerTerm.trim()) {
      setCustomerResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchCustomers(customerTerm);
        if (active) setCustomerResults(results);
      } catch {
        if (active) setCustomerResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [customerTerm, open, selectedCustomer]);

  // Load contacts when a customer is selected
  useEffect(() => {
    if (!selectedCustomer) {
      setContacts([]);
      setContactId("");
      return;
    }
    let active = true;
    setContactsLoading(true);
    getContactsForCustomer(selectedCustomer.id)
      .then((data) => {
        if (!active) return;
        setContacts(data);
        const primary = data.find((c) => c.is_primary) || data[0];
        setContactId(primary ? primary.id : "");
      })
      .catch(() => active && setContacts([]))
      .finally(() => active && setContactsLoading(false));
    return () => {
      active = false;
    };
  }, [selectedCustomer]);

  const resetForm = () => {
    setCustomerTerm("");
    setCustomerResults([]);
    setSelectedCustomer(null);
    setContacts([]);
    setContactId("");
    setNoteType("call");
    setContext("");
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!selectedCustomer) {
      toast({
        title: "Error",
        description: "Select a customer",
        variant: "destructive",
      });
      return;
    }
    if (!contactId) {
      toast({
        title: "Error",
        description: "Select a contact",
        variant: "destructive",
      });
      return;
    }
    if (!context.trim()) {
      toast({
        title: "Error",
        description: "Enter a note",
        variant: "destructive",
      });
      return;
    }
    const contact = contacts.find((c) => c.id === contactId);
    const displayName = contact
      ? `${contact.first_name} ${contact.last_name}`
      : "Unknown";
    setSaving(true);
    try {
      await createInteraction({
        customer_id: selectedCustomer.id,
        contact_id: contactId,
        contact_display_name: displayName,
        author_email: user.email || "",
        note_type: noteType,
        context,
      });
      toast({
        title: "Logged",
        description: "Interaction logged",
        variant: "success",
      });
      window.dispatchEvent(new CustomEvent("interactionLogged"));
      resetForm();
      setOpen(false);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to save",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="relative flex h-10 w-10 items-center justify-center"
      ref={containerRef}
    >
      <button
        type="button"
        aria-label="Log interaction"
        aria-haspopup="true"
        aria-expanded={open}
        title="Log interaction"
        onClick={() => setOpen((v) => !v)}
        className={cn(iconButtonClass, open && iconButtonActiveClass)}
      >
        <Feather className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] origin-top-right rounded-md bg-white dark:bg-dark-150 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
          <div className="p-3 border-b border-neutral-200 dark:border-dark-200 flex items-center justify-between">
            <div className="font-medium text-neutral-900 dark:text-white">
              Log interaction
            </div>
            <button
              onClick={handleClose}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-3 space-y-3">
            {/* Step 1: Customer */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                Customer
              </label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-dark-200 px-3 py-2">
                  <span className="text-sm text-neutral-900 dark:text-white truncate">
                    {selectedCustomer.company_name || selectedCustomer.name}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerTerm("");
                    }}
                    className="text-xs text-[#f26722] hover:underline shrink-0 ml-2"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  {customerTerm ? (
                    <button
                      onClick={() => setCustomerTerm("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
                      aria-label="Clear"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : (
                    <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
                  )}
                  <input
                    autoFocus
                    type="text"
                    value={customerTerm}
                    onChange={(e) => setCustomerTerm(e.target.value)}
                    placeholder="Search customers..."
                    className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 pl-3 pr-9 py-2 text-sm text-neutral-900 dark:text-white focus:ring-2 focus:ring-[#f26722]"
                  />
                  {customerTerm.trim() && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-neutral-200 dark:border-dark-200 bg-white dark:bg-dark-150 shadow-lg">
                      {searching ? (
                        <div className="px-3 py-2 text-xs text-neutral-500">
                          Hmm...
                        </div>
                      ) : customerResults.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-neutral-500">
                          No customers found.
                        </div>
                      ) : (
                        customerResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setSelectedCustomer(c)}
                            className="w-full text-left px-3 py-2 text-sm text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-dark-200 truncate"
                          >
                            {c.company_name || c.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Contact */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                Contact
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                disabled={!selectedCustomer || contactsLoading}
                className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:ring-2 focus:ring-[#f26722] disabled:opacity-50"
              >
                {!selectedCustomer ? (
                  <option value="">Select a customer first</option>
                ) : contactsLoading ? (
                  <option value="">Loading…</option>
                ) : contacts.length === 0 ? (
                  <option value="">No contacts for this customer</option>
                ) : (
                  contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}
                      {c.is_primary ? " (Primary)" : ""}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Step 3: Type */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setNoteType(t.value)}
                    className={`flex flex-col items-center justify-center gap-1 rounded-md border py-2 text-xs font-medium transition-colors ${
                      noteType === t.value
                        ? "border-[#f26722] bg-[#f26722]/10 text-[#f26722]"
                        : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 text-neutral-600 dark:text-neutral-300"
                    }`}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                Note
              </label>
              <textarea
                rows={3}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="What happened during this interaction..."
                className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:ring-2 focus:ring-[#f26722]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={handleClose}
                className="px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-dark-200 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1 px-4 py-1.5 text-sm bg-[#f26722] text-white rounded hover:bg-[#f26722]/90 disabled:opacity-50"
              >
                <Feather className="h-4 w-4" />
                {saving ? "Saving…" : "Log"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickLogInteraction;
