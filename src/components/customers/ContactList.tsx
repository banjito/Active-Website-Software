import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, ArrowUpAZ, ArrowDownAZ } from "lucide-react";
import { Dialog } from "@headlessui/react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";
import { useDivision } from "../../App";
import { useNavigate, useLocation } from "react-router-dom";
import { Pagination } from "../ui/Pagination";
import { DIVISION_OPTIONS } from "../../services/customerService";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface Contact {
  id: string;
  customer_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
  divisions?: string[] | null;
  customers?: {
    name: string;
    company_name: string;
    divisions?: string[] | null;
  };
}

interface Customer {
  id: string;
  name: string;
  company_name: string;
}

interface ContactFormData {
  customer_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
  divisions: string[];
}

const initialFormData: ContactFormData = {
  customer_id: "",
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  position: "",
  is_primary: false,
  divisions: [],
};

const DIVISION_TO_PORTAL: Record<string, string> = {
  north_alabama: "neta",
  northAlabama: "neta",
  tennessee: "neta",
  georgia: "neta",
  international: "neta",
  neta: "neta",
  field_tech: "field_tech",
  scavenger: "scavenger",
  armadillo: "armadillo",
  engineering: "engineering",
};

// Function to get initial filter settings from localStorage synchronously
function getInitialFilterSettings() {
  try {
    const savedPage = localStorage.getItem("contactListPage");
    const savedSearch = localStorage.getItem("contactListSearch");
    const savedSortOrder = localStorage.getItem("contactListSortOrder");
    const savedDivisionTabs = localStorage.getItem("contactListDivisionTabs");

    return {
      page: savedPage ? parseInt(savedPage, 10) : 1,
      searchTerm: savedSearch || "",
      sortOrder: (savedSortOrder as "asc" | "desc" | null) || null,
      activeDivisionTabs: savedDivisionTabs
        ? JSON.parse(savedDivisionTabs)
        : ([] as string[]),
    };
  } catch (error) {
    console.error(
      "Error loading contact list settings from localStorage:",
      error,
    );
    return {
      page: 1,
      searchTerm: "",
      sortOrder: null as "asc" | "desc" | null,
      activeDivisionTabs: [] as string[],
    };
  }
}

export default function ContactList() {
  const { user, loading: authLoading } = useAuth();
  const { division } = useDivision();
  const navigate = useNavigate();
  const location = useLocation();

  // Load initial settings synchronously before first render
  const initialSettings = getInitialFilterSettings();

  const getInitialDivisionTabs = (): string[] => {
    if (initialSettings.activeDivisionTabs.length > 0) {
      return initialSettings.activeDivisionTabs;
    }
    const portalDivision = division ? DIVISION_TO_PORTAL[division] : null;
    if (
      portalDivision &&
      DIVISION_OPTIONS.some((d) => d.value === portalDivision)
    ) {
      return [portalDivision];
    }
    return [];
  };

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [page, setPage] = useState<number>(initialSettings.page);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ContactFormData>(initialFormData);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Tracks whether the `contacts.divisions` column exists. If a prior query
  // failed with 42703 we skip contact-level division matching on subsequent calls.
  const [contactsDivisionsMissing, setContactsDivisionsMissing] =
    useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>(
    initialSettings.searchTerm,
  );
  const [debouncedSearch, setDebouncedSearch] = useState<string>(
    initialSettings.searchTerm,
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | null>(
    initialSettings.sortOrder,
  );
  const [startsWithFilter, setStartsWithFilter] = useState<string>("");
  const [activeDivisionTabs, setActiveDivisionTabs] = useState<string[]>(
    getInitialDivisionTabs,
  );

  const pageSize = 50;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Log location pathname whenever it changes
  useEffect(() => {
    console.log(
      `[ContactList] Current location.pathname on render/update: ${location.pathname}`,
    );
  }, [location.pathname]);

  useEffect(() => {
    if (user) {
      fetchContacts(sortOrder);
      fetchCustomers();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [
    user,
    authLoading,
    page,
    debouncedSearch,
    sortOrder,
    startsWithFilter,
    activeDivisionTabs,
  ]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchTerm !== debouncedSearch) {
        setDebouncedSearch(searchTerm.trim());
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, debouncedSearch]);

  // Save page to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("contactListPage", page.toString());
  }, [page]);

  // Save search term to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("contactListSearch", searchTerm);
  }, [searchTerm]);

  // Save sort order to localStorage whenever it changes
  useEffect(() => {
    if (sortOrder) {
      localStorage.setItem("contactListSortOrder", sortOrder);
    } else {
      localStorage.removeItem("contactListSortOrder");
    }
  }, [sortOrder]);

  // Save division tabs to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(
      "contactListDivisionTabs",
      JSON.stringify(activeDivisionTabs),
    );
  }, [activeDivisionTabs]);

  function toggleDivisionTab(divisionValue: string) {
    setActiveDivisionTabs((prev) => {
      const next = prev.includes(divisionValue)
        ? prev.filter((d) => d !== divisionValue)
        : [...prev, divisionValue];
      return next;
    });
    setPage(1);
  }

  function clearDivisionTabs() {
    setActiveDivisionTabs([]);
    setPage(1);
  }

  useEffect(() => {
    if (customerSearch.trim()) {
      const filtered = customers.filter((customer) =>
        customer.company_name
          .toLowerCase()
          .includes(customerSearch.toLowerCase()),
      );
      setFilteredCustomers(filtered);
      setShowCustomerResults(true);
    } else {
      setFilteredCustomers([]);
      setShowCustomerResults(false);
    }
  }, [customerSearch, customers]);

  async function fetchContacts(currentSortOrder: "asc" | "desc" | null = null) {
    setLoadError(null);
    if (debouncedSearch || startsWithFilter) {
      setSearchLoading(true);
    } else {
      setLoading(true);
    }

    const timeoutId = setTimeout(() => {
      console.error("ContactList: fetchContacts timed out after 30 seconds");
      setLoadError("This is taking longer than expected. Please try again.");
      setLoading(false);
      setSearchLoading(false);
    }, 30000);

    try {
      // If division filter is active, first get the customer IDs that match
      let divisionCustomerIds: string[] | null = null;
      if (activeDivisionTabs.length > 0) {
        try {
          const { data: divCustomers, error: divError } = await supabase
            .schema("common")
            .from("customers")
            .select("id")
            .overlaps("divisions", activeDivisionTabs);

          if (divError) throw divError;
          divisionCustomerIds = (divCustomers || []).map((c) => c.id);
        } catch {
          // divisions column may not exist yet -- skip filter
          divisionCustomerIds = null;
        }
      }

      // Build a shared clause that matches contacts whose OWN divisions tag
      // matches any selected division, OR whose customer's divisions match.
      // Only includes contact-level match if the column is known to exist.
      const buildDivisionOrClause = (
        includeContactLevel: boolean,
      ): string | null => {
        if (activeDivisionTabs.length === 0) return null;
        const parts: string[] = [];
        if (includeContactLevel) {
          parts.push(`divisions.ov.{${activeDivisionTabs.join(",")}}`);
        }
        if (divisionCustomerIds && divisionCustomerIds.length > 0) {
          parts.push(`customer_id.in.(${divisionCustomerIds.join(",")})`);
        }
        return parts.length > 0 ? parts.join(",") : null;
      };

      const applyCommonFilters = <
        T extends { or: (s: string) => T; ilike: (c: string, v: string) => T },
      >(
        q: T,
      ): T => {
        if (debouncedSearch) {
          // Split into tokens so a full-name search ("Hunter Hearn") matches
          // across first_name + last_name. Each token must match some column
          // (AND across tokens), and within a token we OR across columns.
          const tokens = debouncedSearch
            .split(/\s+/)
            .map((t) => t.replace(/[(),]/g, "").trim())
            .filter(Boolean);
          for (const token of tokens) {
            const like = `%${token}%`;
            q = q.or(
              `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`,
            );
          }
        }
        if (startsWithFilter) {
          q = q.ilike("last_name", `${startsWithFilter}%`);
        }
        return q;
      };

      let useContactLevelDivisions = !contactsDivisionsMissing;

      // If division filter is active but neither the contacts.divisions column
      // exists nor any customers match, there is nothing to show.
      if (
        activeDivisionTabs.length > 0 &&
        !useContactLevelDivisions &&
        (!divisionCustomerIds || divisionCustomerIds.length === 0)
      ) {
        setContacts([]);
        setTotalCount(0);
        return;
      }

      // 1. First get total count with filters applied
      const runCountQuery = async (includeContactLevel: boolean) => {
        let q = supabase
          .schema("common")
          .from("contacts")
          .select("*", { count: "exact", head: true });
        const divOr = buildDivisionOrClause(includeContactLevel);
        if (divOr) q = q.or(divOr);
        q = applyCommonFilters(q as any) as any;
        return await q;
      };

      let { count, error: countError } = await runCountQuery(
        useContactLevelDivisions,
      );
      if (
        countError &&
        (countError as any).code === "42703" &&
        useContactLevelDivisions
      ) {
        // contacts.divisions column doesn't exist yet -- fall back for this and future queries
        setContactsDivisionsMissing(true);
        useContactLevelDivisions = false;
        ({ count, error: countError } = await runCountQuery(false));
      }
      if (countError) throw countError;
      setTotalCount(count || 0);

      // 2. Fetch base contacts data (paged)
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase.schema("common").from("contacts").select("*");

      const divOrData = buildDivisionOrClause(useContactLevelDivisions);
      if (divOrData) {
        query = query.or(divOrData);
      }

      query = applyCommonFilters(query as any) as any;

      // When division tabs are active, default to alphabetical sort
      const effectiveSortOrder =
        activeDivisionTabs.length > 0 && !currentSortOrder
          ? "asc"
          : currentSortOrder;

      if (effectiveSortOrder) {
        query = query
          .order("last_name", { ascending: effectiveSortOrder === "asc" })
          .order("first_name", { ascending: effectiveSortOrder === "asc" });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      query = query.range(from, to);

      const { data: contactData, error: contactError } = await query;

      if (contactError) throw contactError;
      if (!contactData) {
        setContacts([]);
        return;
      }

      const contactsWithCustomers = await Promise.all(
        contactData.map(async (contact) => {
          if (!contact.customer_id) {
            return { ...contact, customers: null };
          }

          try {
            const { data: customerData, error: customerError } = await supabase
              .schema("common")
              .from("customers")
              .select("id, name, company_name")
              .eq("id", contact.customer_id)
              .single();

            if (customerError) {
              console.warn(
                `Error fetching customer for contact ${contact.id}:`,
                customerError,
              );
              return { ...contact, customers: null };
            }

            return { ...contact, customers: customerData };
          } catch (err) {
            console.warn(
              `Error processing customer for contact ${contact.id}:`,
              err,
            );
            return { ...contact, customers: null };
          }
        }),
      );

      setContacts(contactsWithCustomers);
    } catch (error) {
      console.error("Error in fetchContacts function:", error);
      setLoadError("Failed to load contacts. Please try again.");
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      setSearchLoading(false);
    }
  }

  async function fetchCustomers() {
    try {
      const { data, error } = await supabase
        .schema("common")
        .from("customers")
        .select("id, name, company_name")
        .order("name");

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error("Error fetching customers:", error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Only send divisions if it's a non-empty array (graceful fallback if column is missing)
      const payload: Record<string, any> = { ...formData };
      if (!payload.divisions || payload.divisions.length === 0) {
        payload.divisions = null;
      }

      if (isEditMode && editingContactId) {
        const { error } = await supabase
          .schema("common")
          .from("contacts")
          .update(payload)
          .eq("id", editingContactId);

        if (error) {
          // If divisions column doesn't exist yet, retry without it
          if (
            (error as any).code === "42703" ||
            /divisions/i.test(error.message || "")
          ) {
            const { divisions: _d, ...rest } = payload;
            const retry = await supabase
              .schema("common")
              .from("contacts")
              .update(rest)
              .eq("id", editingContactId);
            if (retry.error) throw retry.error;
          } else {
            throw error;
          }
        }
      } else {
        const { error } = await supabase
          .schema("common")
          .from("contacts")
          .insert([{ ...payload, user_id: user.id }]);

        if (error) {
          if (
            (error as any).code === "42703" ||
            /divisions/i.test(error.message || "")
          ) {
            const { divisions: _d, ...rest } = payload;
            const retry = await supabase
              .schema("common")
              .from("contacts")
              .insert([{ ...rest, user_id: user.id }]);
            if (retry.error) throw retry.error;
          } else {
            throw error;
          }
        }
      }

      setIsOpen(false);
      setFormData(initialFormData);
      setIsEditMode(false);
      setEditingContactId(null);
      fetchContacts();
    } catch (error) {
      console.error("Error saving contact:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEdit(contact: Contact) {
    // Find the customer name to display in the search field
    // First try to use the customers property from the contact (if available from join)
    let customerName = "";
    if (contact.customers) {
      customerName =
        contact.customers.company_name || contact.customers.name || "";
    } else {
      // Fallback to searching in the customers list
      const customer = customers.find((c) => c.id === contact.customer_id);
      customerName = customer?.company_name || customer?.name || "";
    }

    setFormData({
      customer_id: contact.customer_id,
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email || "",
      phone: contact.phone || "",
      position: contact.position || "",
      is_primary: contact.is_primary,
      divisions: contact.divisions || [],
    });
    setCustomerSearch(customerName);
    setIsEditMode(true);
    setEditingContactId(contact.id);
    setIsOpen(true);
  }

  function handleDelete(contactId: string) {
    setContactToDelete(contactId);
    setDeleteConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!contactToDelete || !user) return;

    try {
      const { error } = await supabase
        .schema("common")
        .from("contacts")
        .delete()
        .eq("id", contactToDelete);

      if (error) throw error;

      setDeleteConfirmOpen(false);
      setContactToDelete(null);
      fetchContacts();
    } catch (error) {
      console.error("Error deleting contact:", error);
    }
  }

  function handleInputChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    const { name, value, type } = e.target as HTMLInputElement;
    const newValue =
      type === "checkbox" ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: newValue }));
  }

  function handleCustomerSelect(customer: Customer) {
    setFormData((prev) => ({ ...prev, customer_id: customer.id }));
    setCustomerSearch(customer.company_name);
    setFilteredCustomers([]);
    setShowCustomerResults(false);
  }

  function handleAddContactForCustomer(customer: Customer) {
    setFormData((prev) => ({ ...prev, customer_id: customer.id }));
    setCustomerSearch(customer.company_name);
    setIsEditMode(false);
    setEditingContactId(null);
    setIsOpen(true);
  }

  const handleRowClick = (contactId: string) => {
    const currentPath = location.pathname;
    let targetPath = "";

    if (currentPath.startsWith("/sales-dashboard")) {
      targetPath = `/sales-dashboard/contacts/${contactId}`;
    } else {
      // Check if we are in a division context (e.g., /north_alabama/contacts)
      const pathParts = currentPath.split("/").filter((part) => part !== ""); // filter empty strings
      if (pathParts.length >= 2 && pathParts[1] === "contacts") {
        const division = pathParts[0];
        targetPath = `/${division}/contacts/${contactId}`;
      } else {
        // Fallback or default behavior if context is unclear (shouldn't happen with current routes)
        console.warn(
          `[ContactList] Unclear navigation context from path: ${currentPath}. Falling back to generic path.`,
        );
        targetPath = `/contacts/${contactId}`; // This path might not exist anymore, leading to redirect
      }
    }

    console.log(
      `[ContactList] handleRowClick: Current Path = ${currentPath}, Target Path = ${targetPath}`,
    );
    navigate(targetPath);
  };

  function toggleSortOrder() {
    setSortOrder((prev) => {
      if (prev === null) return "asc";
      if (prev === "asc") return "desc";
      return null;
    });
    setPage(1);
  }

  if (loadError) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-red-600 dark:text-red-400 mb-4">
          <svg
            className="w-12 h-12"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <div className="text-zinc-900 dark:text-zinc-100 mb-4">{loadError}</div>
        <button
          onClick={() => {
            setLoadError(null);
            setLoading(true);
            fetchContacts(sortOrder);
          }}
          className="px-4 py-2 bg-[#f26722] hover:bg-[#e55611] text-white font-medium rounded-md"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white mb-1">
            Contacts
          </h1>
        </div>
        <div className="mt-4 sm:mt-0 sm:flex-none flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search contacts by name, email, phone"
            className="w-72 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
          />
          <div className="relative">
            <input
              type="text"
              value={startsWithFilter}
              onChange={(e) => {
                setStartsWithFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Starts with..."
              className="w-32 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
            />
            {startsWithFilter && (
              <button
                type="button"
                onClick={() => {
                  setStartsWithFilter("");
                  setPage(1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchLoading && (
            <div className="flex items-center">
              <LoadingSpinner size="xs" />
            </div>
          )}
          <button
            type="button"
            onClick={toggleSortOrder}
            className={`inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium shadow-sm ${
              sortOrder
                ? "border-[#f26722] bg-[#f26722]/10 text-[#f26722] hover:bg-[#f26722]/20"
                : "border-zinc-300 bg-white dark:bg-dark-150 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-dark-200"
            }`}
            title={
              sortOrder === "asc"
                ? "Sorted A-Z (click to sort Z-A)"
                : sortOrder === "desc"
                  ? "Sorted Z-A (click to clear sort)"
                  : "Sort alphabetically"
            }
          >
            {sortOrder === "desc" ? (
              <ArrowDownAZ className="h-4 w-4 mr-2" />
            ) : (
              <ArrowUpAZ className="h-4 w-4 mr-2" />
            )}
            {sortOrder === "asc"
              ? "A-Z"
              : sortOrder === "desc"
                ? "Z-A"
                : "Sort"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsEditMode(false);
              setEditingContactId(null);
              setFormData(initialFormData);
              setIsOpen(true);
            }}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add contact
          </button>
        </div>
      </div>

      {/* Division Tabs */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={clearDivisionTabs}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeDivisionTabs.length === 0
              ? "bg-[#f26722] text-white"
              : "bg-zinc-100 dark:bg-dark-200 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-dark-100"
          }`}
        >
          All
        </button>
        {DIVISION_OPTIONS.map((div) => (
          <button
            key={div.value}
            type="button"
            onClick={() => toggleDivisionTab(div.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeDivisionTabs.includes(div.value)
                ? "bg-[#f26722] text-white"
                : "bg-zinc-100 dark:bg-dark-200 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-dark-100"
            }`}
          >
            {div.label}
          </button>
        ))}
        {activeDivisionTabs.length > 0 && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-2">
            Sorted A-Z by default
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="-mx-4 overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:-mx-6 md:mx-0 md:rounded-lg">
          <table className="min-w-full divide-y divide-zinc-300">
            <thead className="bg-zinc-50 dark:bg-dark-150">
              <tr>
                <th
                  scope="col"
                  className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 dark:text-white sm:pl-6"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900 dark:text-white"
                >
                  Position
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900 dark:text-white"
                >
                  Email
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900 dark:text-white"
                >
                  Phone
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900 dark:text-white"
                >
                  Primary
                </th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-600 bg-white dark:bg-dark-150">
              {contacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700"
                  onClick={() => handleRowClick(contact.id)}
                >
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-zinc-900 dark:text-zinc-200 sm:pl-6">
                    {contact.first_name} {contact.last_name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-zinc-500 dark:text-white">
                    {contact.position}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-zinc-500 dark:text-white">
                    {contact.email ? (
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-[#f26722] hover:text-[#f26722]/80 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {contact.email}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-zinc-500 dark:text-white">
                    {contact.phone ? (
                      <a
                        href={`tel:${contact.phone}`}
                        className="text-[#f26722] hover:text-[#f26722]/80 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {contact.phone}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-zinc-500 dark:text-white">
                    {contact.is_primary ? (
                      <span className="inline-flex rounded-full bg-green-100 dark:bg-green-900 px-2 text-xs font-semibold leading-5 text-green-800 dark:text-green-200">
                        Yes
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-zinc-100 dark:bg-dark-150 px-2 text-xs font-semibold leading-5 text-zinc-800 dark:text-zinc-200">
                        No
                      </span>
                    )}
                  </td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <div
                      className="flex items-center justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(contact);
                        }}
                        title="Edit contact"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(contact.id);
                        }}
                        title="Delete contact"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 0 && (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-zinc-600 dark:text-white">
            Showing {(page - 1) * pageSize + 1} -{" "}
            {Math.min(page * pageSize, totalCount)} of {totalCount} contacts
          </div>
          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(newPage) => setPage(newPage)}
            />
          )}
        </div>
      )}

      <Dialog
        open={isOpen}
        onClose={() => {
          setIsOpen(false);
          setShowCustomerResults(false);
          setFilteredCustomers([]);
        }}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-lg rounded bg-white dark:bg-dark-150 p-6">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-medium text-zinc-900 dark:text-white">
                {isEditMode ? "Edit Contact" : "Add New Contact"}
              </Dialog.Title>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-400 hover:text-zinc-500 dark:text-white dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <label
                  htmlFor="customer_search"
                  className="block text-sm font-medium text-zinc-700 dark:text-white"
                >
                  Customer *
                </label>
                <input
                  type="text"
                  id="customer_search"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    if (!e.target.value.trim()) {
                      setFilteredCustomers([]);
                      setShowCustomerResults(false);
                    }
                  }}
                  placeholder="Search for a customer..."
                  className="mt-1 block w-full p-2 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  required
                />
                {showCustomerResults && filteredCustomers.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-dark-150 shadow-lg rounded-md border border-zinc-300 dark:border-zinc-600">
                    <ul className="max-h-60 overflow-auto py-1">
                      {filteredCustomers.map((customer) => (
                        <li
                          key={customer.id}
                          className="px-4 py-2 hover:bg-zinc-100 dark:hover:bg-dark-200 cursor-pointer dark:text-white"
                          onClick={() => handleCustomerSelect(customer)}
                        >
                          {customer.company_name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <input
                  type="hidden"
                  name="customer_id"
                  value={formData.customer_id}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="first_name"
                  className="block text-sm font-medium text-zinc-700 dark:text-white"
                >
                  First Name *
                </label>
                <input
                  type="text"
                  name="first_name"
                  id="first_name"
                  required
                  value={formData.first_name}
                  onChange={handleInputChange}
                  className="mt-1 block w-full p-2 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="last_name"
                  className="block text-sm font-medium text-zinc-700 dark:text-white"
                >
                  Last Name *
                </label>
                <input
                  type="text"
                  name="last_name"
                  id="last_name"
                  required
                  value={formData.last_name}
                  onChange={handleInputChange}
                  className="mt-1 block w-full p-2 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-zinc-700 dark:text-white"
                >
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="mt-1 block w-full p-2 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-zinc-700 dark:text-white"
                >
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  id="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="mt-1 block w-full p-2 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="position"
                  className="block text-sm font-medium text-zinc-700 dark:text-white"
                >
                  Position
                </label>
                <input
                  type="text"
                  name="position"
                  id="position"
                  value={formData.position}
                  onChange={handleInputChange}
                  className="mt-1 block w-full p-2 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="is_primary"
                  id="is_primary"
                  checked={formData.is_primary}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      is_primary: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-zinc-300 dark:border-zinc-600 rounded"
                />
                <label
                  htmlFor="is_primary"
                  className="ml-2 block text-sm text-zinc-700 dark:text-white"
                >
                  Primary Contact
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-2">
                  Divisions
                </label>
                <div className="flex flex-wrap gap-2">
                  {DIVISION_OPTIONS.map((div) => {
                    const isActive = formData.divisions.includes(div.value);
                    return (
                      <button
                        key={div.value}
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            divisions: isActive
                              ? prev.divisions.filter((d) => d !== div.value)
                              : [...prev.divisions, div.value],
                          }));
                        }}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-[#f26722] text-white"
                            : "bg-zinc-100 dark:bg-dark-200 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-dark-100 border border-zinc-300 dark:border-zinc-600"
                        }`}
                      >
                        {div.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Tag this contact with the divisions they serve. Leave empty to
                  inherit from the customer.
                </p>
              </div>
              <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex w-full justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:col-start-2 sm:text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting
                    ? "Saving..."
                    : isEditMode
                      ? "Save Changes"
                      : "Add Contact"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="mt-3 inline-flex w-full justify-center rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-dark-150 px-4 py-2 text-base font-medium text-zinc-700 dark:text-white shadow-sm hover:bg-zinc-50 dark:hover:bg-dark-200 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:col-start-1 sm:mt-0 sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-sm rounded bg-white dark:bg-dark-150 p-6">
            <Dialog.Title className="text-lg font-medium text-zinc-900 dark:text-dark-900">
              Delete Contact
            </Dialog.Title>
            <div className="mt-2">
              <p className="text-sm text-zinc-500 dark:text-dark-400">
                Are you sure you want to delete this contact? This action cannot
                be undone.
              </p>
            </div>
            <div className="mt-4 flex space-x-3">
              <button
                type="button"
                onClick={confirmDelete}
                className="inline-flex justify-center rounded-md border border-transparent bg-red-600 dark:bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="inline-flex justify-center rounded-md border border-zinc-300 dark:border-dark-300 bg-white dark:bg-dark-150 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-dark-300 hover:bg-zinc-50 dark:hover:bg-dark-200 focus:outline-none focus:ring-2 focus:ring-amp-orange-500 dark:focus:ring-amp-gold-500 focus:ring-offset-2"
              >
                Cancel
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}
