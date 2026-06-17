import React, { useEffect, useRef, useState } from "react";
import {
  Phone,
  Mail,
  User as UserIcon,
  Search,
  X,
  Check,
  MessageSquarePlus,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "../../../lib/AuthContext";
import { toast } from "../../../components/ui/toast";
import {
  createInteraction,
  getContactsForCustomer,
  searchCustomers,
  interactionTypeLabel,
  type InteractionType,
} from "../../../services/interactionsService";

type Customer = { id: string; company_name: string; name: string };
type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  is_primary?: boolean;
};
type SessionLog = {
  id: string;
  customer: string;
  contact: string;
  type: string;
  at: string;
};

const TYPES: {
  value: InteractionType;
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: "call", label: "Call", icon: <Phone className="h-5 w-5" /> },
  { value: "email", label: "Email", icon: <Mail className="h-5 w-5" /> },
  {
    value: "in_person",
    label: "In Person",
    icon: <UserIcon className="h-5 w-5" />,
  },
];

/**
 * Mobile-first standalone page for quickly logging customer/contact interactions
 * from a phone. Flow: Customer → Contact → Type → Note.
 */
export default function MobileLogInteraction() {
  const { user } = useAuth();

  // Customer search
  const [customerTerm, setCustomerTerm] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactId, setContactId] = useState("");

  // Note
  const [noteType, setNoteType] = useState<InteractionType>("call");
  const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false);

  // This-session confirmation list
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const contextRef = useRef<HTMLTextAreaElement>(null);

  // Debounced customer search
  useEffect(() => {
    if (selectedCustomer) return;
    if (!customerTerm.trim()) {
      setCustomerResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchCustomers(customerTerm, 15);
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
  }, [customerTerm, selectedCustomer]);

  // Load contacts when customer chosen
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

  const resetForKeepCustomer = () => {
    setNoteType("call");
    setContext("");
  };

  const clearAll = () => {
    setSelectedCustomer(null);
    setCustomerTerm("");
    setCustomerResults([]);
    setContacts([]);
    setContactId("");
    resetForKeepCustomer();
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
      contextRef.current?.focus();
      return;
    }
    const contact = contacts.find((c) => c.id === contactId);
    const displayName = contact
      ? `${contact.first_name} ${contact.last_name}`
      : "Unknown";
    setSaving(true);
    try {
      const saved = await createInteraction({
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
      setSessionLogs((prev) => [
        {
          id: saved.id,
          customer: selectedCustomer.company_name || selectedCustomer.name,
          contact: displayName,
          type: noteType,
          at: new Date().toISOString(),
        },
        ...prev,
      ]);
      // Keep the customer selected for logging multiple notes in a row.
      resetForKeepCustomer();
      contextRef.current?.focus();
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

  const canSave =
    !!selectedCustomer && !!contactId && !!context.trim() && !saving;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-100 flex flex-col">
      {/* Branding */}
      <div className="sticky top-0 z-20 bg-white dark:bg-dark-150 border-b border-gray-200 dark:border-dark-200 px-4 py-3 flex items-center justify-center">
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
          alt="AMP"
          className="h-9 w-auto"
        />
      </div>

      {/* Header */}
      <header className="bg-[#f26722] text-white px-4 py-3 shadow-md flex items-center gap-2">
        <MessageSquarePlus className="h-6 w-6" />
        <h1 className="text-lg font-semibold">Log Interaction</h1>
      </header>

      <main className="flex-1 px-4 py-4 pb-32 max-w-lg w-full mx-auto space-y-5">
        {/* Step 1: Customer */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
            1. Customer
          </label>
          {selectedCustomer ? (
            <div className="flex items-center justify-between rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 px-4 py-3.5">
              <span className="text-base font-medium text-gray-900 dark:text-white truncate">
                {selectedCustomer.company_name || selectedCustomer.name}
              </span>
              <button
                onClick={() => {
                  setSelectedCustomer(null);
                  setCustomerTerm("");
                }}
                className="text-sm text-[#f26722] font-medium shrink-0 ml-3 px-2 py-1"
              >
                Change
              </button>
            </div>
          ) : (
            <div>
              <div className="relative">
                {customerTerm ? (
                  <button
                    onClick={() => setCustomerTerm("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    aria-label="Clear"
                  >
                    <X className="h-5 w-5" />
                  </button>
                ) : (
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                )}
                <input
                  type="text"
                  inputMode="search"
                  value={customerTerm}
                  onChange={(e) => setCustomerTerm(e.target.value)}
                  placeholder="Search customers..."
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 pl-5 pr-5 py-3.5 text-base text-gray-900 dark:text-white focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722]"
                />
              </div>
              {customerTerm.trim() && (
                <div className="mt-2 rounded-xl border border-gray-200 dark:border-dark-200 bg-white dark:bg-dark-150 overflow-hidden divide-y divide-gray-100 dark:divide-dark-200 max-h-72 overflow-y-auto">
                  {searching ? (
                    <div className="px-4 py-3 text-sm text-gray-500">
                      Searching…
                    </div>
                  ) : customerResults.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500">
                      No customers found
                    </div>
                  ) : (
                    customerResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCustomer(c)}
                        className="w-full text-left px-4 py-3.5 text-base text-gray-900 dark:text-white active:bg-gray-100 dark:active:bg-dark-200 truncate"
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
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
            2. Contact
          </label>
          <select
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            disabled={!selectedCustomer || contactsLoading}
            className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 px-4 py-3.5 text-base text-gray-900 dark:text-white focus:ring-2 focus:ring-[#f26722] disabled:opacity-50"
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
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
            3. Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setNoteType(t.value)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border py-3.5 text-sm font-medium transition-colors ${
                  noteType === t.value
                    ? "border-[#f26722] bg-[#f26722]/10 text-[#f26722]"
                    : "border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 text-gray-600 dark:text-gray-300"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Step 4: Note */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
            4. Note
          </label>
          <textarea
            ref={contextRef}
            rows={4}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="What happened during this interaction..."
            className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 px-4 py-3.5 text-base text-gray-900 dark:text-white focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722]"
          />
        </div>

        {/* This-session confirmations */}
        {sessionLogs.length > 0 && (
          <div className="pt-2">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Logged this session
            </h2>
            <div className="space-y-2">
              {sessionLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-2 rounded-xl border border-gray-200 dark:border-dark-200 bg-white dark:bg-dark-150 px-3 py-2.5"
                >
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {log.customer} · {log.contact}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {interactionTypeLabel(log.type)} ·{" "}
                      {format(new Date(log.at), "h:mm a")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-white dark:bg-dark-150 border-t border-gray-200 dark:border-dark-200 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {selectedCustomer && (
            <button
              onClick={clearAll}
              className="px-4 py-3.5 rounded-xl text-base font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-dark-200"
            >
              Clear
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#f26722] px-4 py-3.5 text-base font-semibold text-white shadow-sm active:bg-[#f26722]/90 disabled:opacity-50"
          >
            <Check className="h-5 w-5" />
            {saving ? "Saving…" : "Log Interaction"}
          </button>
        </div>
      </div>
    </div>
  );
}
