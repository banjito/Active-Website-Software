import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Users,
  Briefcase,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Tag,
  Plus,
  X,
  User as UserIcon,
  Trash2,
  Edit,
  Feather,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";
import { useDemoMode } from "../../lib/DemoModeContext";
import { format } from "date-fns";
import { Dialog } from "@headlessui/react";
import {
  Customer,
  CustomerCategory,
  getCustomerById,
  updateCustomer,
  getCategories,
  DIVISION_OPTIONS,
} from "../../services/customerService";
import CustomerDocumentManagement from "./CustomerDocumentManagement";
import CustomerHealthMonitoring from "./CustomerHealth";
import { toast } from "../../components/ui/toast";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  getAuthorProfilesByEmail,
  type AuthorProfile,
} from "../../services/interactionsService";
import { AuthorAvatar } from "../sales/AuthorAvatar";
import { formatStatusLabel } from "@/utils/formatters";

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
}

interface Job {
  id: string;
  title: string;
  status: string;
  due_date: string;
  budget: number;
  priority: string;
}

interface CustomerFormData {
  // Define the structure of your customer form data
}

interface ContactFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
  customer_id: string;
  divisions: string[];
}

const initialFormData: CustomerFormData = {
  // Initialize your customer form data
};

const initialContactFormData: ContactFormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  position: "",
  is_primary: false,
  customer_id: "",
  divisions: [],
};

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [categories, setCategories] = useState<CustomerCategory[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState<CustomerFormData>(initialFormData);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isContactFormOpen, setIsContactFormOpen] = useState(false);
  const [contactFormData, setContactFormData] = useState<ContactFormData>(
    initialContactFormData,
  );
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);
  const [isCategorySelectOpen, setIsCategorySelectOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState("overview");
  const [contactsExpanded, setContactsExpanded] = useState(false);
  const [isCustomerEditOpen, setIsCustomerEditOpen] = useState(false);
  const [customerEditForm, setCustomerEditForm] = useState<{
    company_name: string;
    email: string;
    phone: string;
    address: string;
    status: string;
    divisions: string[];
  }>({
    company_name: "",
    email: "",
    phone: "",
    address: "",
    status: "active",
    divisions: [],
  });
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isSavingDivisions, setIsSavingDivisions] = useState(false);
  const [contactPopupOpen, setContactPopupOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Interaction notes state
  const [notes, setNotes] = useState<
    {
      id: string;
      contact_id: string;
      customer_id: string;
      author_email: string;
      contact_display_name: string;
      note_type: string;
      occurred_at: string;
      context: string;
      created_at: string;
    }[]
  >([]);
  const [authorProfiles, setAuthorProfiles] = useState<
    Map<string, AuthorProfile>
  >(new Map());
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteFilter, setNoteFilter] = useState<
    "all" | "call" | "email" | "in_person"
  >("all");
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteFormData, setNoteFormData] = useState({
    contact_id: "",
    note_type: "call",
    context: "",
    occurred_at: "",
  });
  const [noteFormSaving, setNoteFormSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  useEffect(() => {
    if (user && id) {
      fetchCustomerData();
    }
  }, [user, id]);

  useEffect(() => {
    if (
      user &&
      id &&
      (activeTab === "interactions" || activeTab === "overview")
    ) {
      fetchNotes();
    }
  }, [user, id, activeTab]);

  // Refresh when an interaction is logged elsewhere (e.g. the top-bar widget)
  useEffect(() => {
    const handler = () => {
      if (
        user &&
        id &&
        (activeTab === "interactions" || activeTab === "overview")
      )
        fetchNotes();
    };
    window.addEventListener("interactionLogged", handler);
    return () => window.removeEventListener("interactionLogged", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id, activeTab]);

  async function fetchNotes() {
    if (!id) return;
    setNotesLoading(true);
    try {
      const { data, error } = await supabase
        .schema("common")
        .from("contact_notes")
        .select("*")
        .eq("customer_id", id)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      setNotes(data || []);
      const profiles = await getAuthorProfilesByEmail(
        (data || []).map((n) => n.author_email),
      );
      setAuthorProfiles(profiles);
    } catch (e) {
      console.error("Error fetching notes:", e);
    } finally {
      setNotesLoading(false);
    }
  }

  async function handleSaveNote() {
    if (!user || !id) return;
    if (!noteFormData.contact_id || !noteFormData.context.trim()) {
      toast({
        title: "Error",
        description: "Select a contact and enter a note",
        variant: "destructive",
      });
      return;
    }
    const selectedCtx = contacts.find((c) => c.id === noteFormData.contact_id);
    const displayName = selectedCtx
      ? `${selectedCtx.first_name} ${selectedCtx.last_name}`
      : "Unknown";
    setNoteFormSaving(true);
    try {
      if (editingNoteId) {
        const { error } = await supabase
          .schema("common")
          .from("contact_notes")
          .update({
            contact_id: noteFormData.contact_id,
            contact_display_name: displayName,
            note_type: noteFormData.note_type,
            context: noteFormData.context.trim(),
            occurred_at: noteFormData.occurred_at || new Date().toISOString(),
          })
          .eq("id", editingNoteId);
        if (error) throw error;
        toast({
          title: "Updated",
          description: "Interaction updated",
          variant: "success",
        });
      } else {
        const { error } = await supabase
          .schema("common")
          .from("contact_notes")
          .insert({
            contact_id: noteFormData.contact_id,
            customer_id: id,
            author_email: user.email || "",
            contact_display_name: displayName,
            note_type: noteFormData.note_type,
            context: noteFormData.context.trim(),
            occurred_at: noteFormData.occurred_at || new Date().toISOString(),
          });
        if (error) throw error;
        toast({
          title: "Logged",
          description: "Interaction logged",
          variant: "success",
        });
      }
      setShowNoteForm(false);
      setEditingNoteId(null);
      setNoteFormData({
        contact_id: "",
        note_type: "call",
        context: "",
        occurred_at: "",
      });
      fetchNotes();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to save",
        variant: "destructive",
      });
    } finally {
      setNoteFormSaving(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      const { error } = await supabase
        .schema("common")
        .from("contact_notes")
        .delete()
        .eq("id", noteId);
      if (error) throw error;
      toast({
        title: "Deleted",
        description: "Interaction deleted",
        variant: "success",
      });
      fetchNotes();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to delete",
        variant: "destructive",
      });
    }
  }

  async function fetchCustomerData() {
    try {
      // Fetch customer details using the service
      const customerData = await getCustomerById(id!);
      setCustomer(customerData);
      setCustomerEditForm({
        company_name: customerData.company_name || "",
        email: customerData.email || "",
        phone: customerData.phone || "",
        address: customerData.address || "",
        status: customerData.status || "active",
        divisions: customerData.divisions || [],
      });

      // Set the selected category from the customer data
      setSelectedCategoryId(customerData.category_id || null);

      // Fetch categories
      const categoriesData = await getCategories();
      setCategories(categoriesData);

      // Fetch related contacts
      const { data: contactsData, error: contactsError } = await supabase
        .schema("common")
        .from("contacts")
        .select("*")
        .eq("customer_id", id)
        .order("is_primary", { ascending: false });

      if (contactsError) throw contactsError;
      setContacts(contactsData || []);

      // Fetch related jobs
      const { data: jobsData, error: jobsError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("*")
        .eq("customer_id", id)
        .order("created_at", { ascending: false });

      if (jobsError) throw jobsError;
      setJobs(jobsData || []);
    } catch (error) {
      console.error("Error fetching customer data:", error);
      toast({
        title: "Error",
        description: "Failed to load customer data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCustomerEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;
    try {
      setIsSavingCustomer(true);
      const { divisions, ...rest } = customerEditForm;
      await updateCustomer(customer.id, {
        ...rest,
        divisions: divisions.length > 0 ? divisions : (null as any),
      });
      setIsCustomerEditOpen(false);
      await fetchCustomerData();
      toast({
        title: "Saved",
        description: "Customer updated successfully",
        variant: "success",
      });
    } catch (error) {
      console.error("Error updating customer:", error);
      toast({
        title: "Error",
        description: "Failed to update customer",
        variant: "destructive",
      });
    } finally {
      setIsSavingCustomer(false);
    }
  }

  async function handleToggleDivision(divisionValue: string) {
    if (!customer || !id) return;
    const currentDivisions = customer.divisions || [];
    const newDivisions = currentDivisions.includes(divisionValue)
      ? currentDivisions.filter((d) => d !== divisionValue)
      : [...currentDivisions, divisionValue];

    try {
      setIsSavingDivisions(true);
      await updateCustomer(id, {
        divisions: newDivisions.length > 0 ? newDivisions : (null as any),
      });
      await fetchCustomerData();
    } catch (error) {
      console.error("Error updating divisions:", error);
      toast({
        title: "Error",
        description:
          "Failed to update divisions. Run the database migration to add the divisions column.",
        variant: "destructive",
      });
    } finally {
      setIsSavingDivisions(false);
    }
  }

  function handleAddContact() {
    if (customer) {
      setContactFormData({
        ...initialContactFormData,
        customer_id: customer.id,
      });
      setIsContactFormOpen(true);
    }
  }

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !customer || isSubmittingContact) return;

    try {
      setIsSubmittingContact(true);
      const payload: Record<string, any> = {
        ...contactFormData,
        user_id: user.id,
      };
      if (!payload.divisions || payload.divisions.length === 0) {
        payload.divisions = null;
      }

      let { error } = await supabase
        .schema("common")
        .from("contacts")
        .insert([payload]);

      // Retry without divisions if column doesn't exist yet
      if (
        error &&
        ((error as any).code === "42703" ||
          /divisions/i.test(error.message || ""))
      ) {
        const { divisions: _d, ...rest } = payload;
        const retry = await supabase
          .schema("common")
          .from("contacts")
          .insert([rest]);
        error = retry.error as any;
      }

      if (error) throw error;

      setIsContactFormOpen(false);
      setContactFormData(initialContactFormData);

      fetchCustomerData();
      toast({
        title: "Success",
        description: "Contact added successfully",
        variant: "success",
      });
    } catch (error) {
      console.error("Error adding contact:", error);
      toast({
        title: "Error",
        description: "Failed to add contact",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingContact(false);
    }
  }

  function handleContactClick(contact: Contact) {
    setSelectedContact(contact);
    setContactPopupOpen(true);
  }

  async function handleCategoryChange(categoryId: string | null) {
    if (!id) return;

    try {
      await updateCustomer(id, { category_id: categoryId });
      setSelectedCategoryId(categoryId);
      setIsCategorySelectOpen(false);
      fetchCustomerData();
    } catch (error) {
      console.error("Error updating customer category:", error);
    }
  }

  function getCategoryById(categoryId: string | null | undefined) {
    if (!categoryId) return null;
    return categories.find((c) => c.id === categoryId) || null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-neutral-600">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-neutral-600">Customer not found</div>
      </div>
    );
  }

  const category = getCategoryById(customer.category_id);

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center text-sm text-neutral-500 hover:text-neutral-700 mr-4"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </button>
            <div className="flex items-center">
              <Building2 className="h-8 w-8 text-[#f26722]" />
              <h1 className="ml-3 text-2xl font-semibold text-neutral-900 dark:text-white">
                {maskCustomerName(customer.company_name) || "No Company Name"}
              </h1>
            </div>
          </div>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
              customer.status === "active"
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : "bg-neutral-100 text-neutral-800 dark:bg-dark-150 dark:text-neutral-200"
            }`}
          >
            {customer.status}
          </span>
        </div>

        {/* Customer Information and Contacts in one row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Customer Information Card */}
          <div className="bg-white dark:bg-dark-150 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-neutral-900 dark:text-white">
                Customer Information
              </h2>
              <button
                onClick={() => setIsCustomerEditOpen(true)}
                className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#f26722] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
              >
                Edit
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-neutral-900 dark:text-white flex items-center">
                    <Tag className="h-4 w-4 text-neutral-400 mr-2" />
                    Category
                  </h3>
                  <button
                    onClick={() => setIsCategorySelectOpen(true)}
                    className="text-sm text-[#f26722] hover:text-[#f26722]/80"
                  >
                    Change
                  </button>
                </div>
                <div className="mt-2">
                  {category ? (
                    <div className="flex items-center">
                      <div
                        className="w-4 h-4 rounded-full mr-2"
                        style={{ backgroundColor: category.color }}
                      ></div>
                      <span className="text-sm text-neutral-900 dark:text-white">
                        {category.name}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-neutral-500 dark:text-white">
                      No category assigned
                    </span>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-neutral-900 dark:text-white flex items-center mb-2">
                  <Tag className="h-4 w-4 text-neutral-400 mr-2" />
                  Divisions
                </h3>
                <div className="flex flex-wrap gap-2">
                  {DIVISION_OPTIONS.map((div) => {
                    const isActive = (customer.divisions || []).includes(
                      div.value,
                    );
                    return (
                      <button
                        key={div.value}
                        type="button"
                        onClick={() => handleToggleDivision(div.value)}
                        disabled={isSavingDivisions}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                          isActive
                            ? "bg-[#f26722] text-white"
                            : "bg-neutral-100 dark:bg-dark-200 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-dark-100 border border-neutral-300 dark:border-neutral-600"
                        }`}
                      >
                        {div.label}
                      </button>
                    );
                  })}
                </div>
                {(!customer.divisions || customer.divisions.length === 0) && (
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                    Click to assign divisions
                  </p>
                )}
              </div>
              <div className="flex items-start">
                <Mail className="h-5 w-5 text-[#f26722] mt-0.5" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-neutral-500 dark:text-white">
                    Email
                  </p>
                  <p className="text-sm text-neutral-900 dark:text-white">
                    {customer.email || "-"}
                  </p>
                </div>
              </div>
              <div className="flex items-start">
                <Phone className="h-5 w-5 text-[#f26722] mt-0.5" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-neutral-500 dark:text-white">
                    Phone
                  </p>
                  {customer.phone ? (
                    <a
                      href={`tel:${customer.phone}`}
                      className="text-sm text-[#f26722] hover:text-[#f26722]/90"
                    >
                      {customer.phone}
                    </a>
                  ) : (
                    <p className="text-sm text-neutral-900 dark:text-white">
                      -
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-start">
                <MapPin className="h-5 w-5 text-[#f26722] mt-0.5" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-neutral-500 dark:text-white">
                    Address
                  </p>
                  <p className="text-sm text-neutral-900 dark:text-white">
                    {maskCustomerAddress(customer.address) || "-"}
                  </p>
                </div>
              </div>
              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-[#f26722] mt-0.5" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-neutral-500 dark:text-white">
                    Created
                  </p>
                  <p className="text-sm text-neutral-900 dark:text-white">
                    {format(new Date(customer.created_at), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Contacts Card */}
          <div className="bg-white dark:bg-dark-150 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-neutral-900 dark:text-white">
                Contacts
              </h2>
              <button
                onClick={handleAddContact}
                className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </button>
            </div>
            <div className="space-y-4">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-start cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700 p-2 rounded-lg"
                  onClick={() => handleContactClick(contact)}
                >
                  <div className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center">
                    <span className="text-neutral-500 dark:text-white text-lg font-medium">
                      {contact.first_name?.charAt(0) || "C"}
                    </span>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-neutral-900 dark:text-white flex items-center">
                      {contact.first_name} {contact.last_name}
                      {contact.is_primary && (
                        <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          Primary
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-neutral-500 dark:text-white">
                      {contact.position || ""}
                    </p>
                    <p className="text-sm text-neutral-500 dark:text-white">
                      {contact.email}
                    </p>
                  </div>
                </div>
              ))}
              {contacts.length === 0 && (
                <p className="text-sm text-neutral-500 dark:text-white text-center py-4">
                  No contacts found
                </p>
              )}
              <div className="mt-2 text-right">
                <Link
                  to="#"
                  className="text-sm font-medium text-[#f26722] hover:text-[#f26722]/90"
                >
                  View All Contacts
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="border-b border-neutral-200 dark:border-neutral-700">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <a
              href="#overview"
              className={`${
                activeTab === "overview"
                  ? "border-[#f26722] text-[#f26722]"
                  : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              onClick={(e) => {
                e.preventDefault();
                setActiveTab("overview");
              }}
            >
              Overview
            </a>
            <a
              href="#jobs"
              className={`${
                activeTab === "jobs"
                  ? "border-[#f26722] text-[#f26722]"
                  : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              onClick={(e) => {
                e.preventDefault();
                setActiveTab("jobs");
              }}
            >
              Jobs
            </a>
            <a
              href="#documents"
              className={`${
                activeTab === "documents"
                  ? "border-[#f26722] text-[#f26722]"
                  : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              onClick={(e) => {
                e.preventDefault();
                setActiveTab("documents");
              }}
            >
              Documents
            </a>
            <a
              href="#interactions"
              className={`${
                activeTab === "interactions"
                  ? "border-[#f26722] text-[#f26722]"
                  : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              onClick={(e) => {
                e.preventDefault();
                setActiveTab("interactions");
              }}
            >
              Interactions
            </a>
            <a
              href="#health"
              className={`${
                activeTab === "health"
                  ? "border-[#f26722] text-[#f26722]"
                  : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              onClick={(e) => {
                e.preventDefault();
                setActiveTab("health");
              }}
            >
              Health
            </a>
          </nav>
        </div>

        {/* Tab content */}
        <div className="mt-6">
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Jobs section */}
              <div className="bg-white dark:bg-dark-150 rounded-lg shadow">
                <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-medium text-neutral-900 dark:text-white">
                      Recent Jobs
                    </h2>
                    <Link
                      to="#jobs"
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveTab("jobs");
                      }}
                      className="text-sm font-medium text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90"
                    >
                      View all jobs
                    </Link>
                  </div>
                </div>
                <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
                  {jobs.slice(0, 2).map((job) => (
                    <Link
                      key={job.id}
                      to={`/jobs/${job.id}`}
                      className="block p-6 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <Briefcase className="h-5 w-5 text-[#f26722]" />
                          <div className="ml-3">
                            <p className="text-sm font-medium text-neutral-900 dark:text-white">
                              {job.title}
                            </p>
                            <div className="flex items-center mt-1 space-x-2">
                              <span
                                className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                                  job.status === "completed"
                                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                    : job.status === "in_progress"
                                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                      : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                }`}
                              >
                                {formatStatusLabel(job.status)}
                              </span>
                              <span
                                className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                                  job.priority === "high"
                                    ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                    : job.priority === "medium"
                                      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                      : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                }`}
                              >
                                {formatStatusLabel(job.priority)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-sm text-neutral-500 dark:text-white">
                          ${job.budget?.toLocaleString() || "-"}
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-neutral-500 dark:text-white">
                        Due:{" "}
                        {job.due_date
                          ? format(new Date(job.due_date), "MMM d, yyyy")
                          : "Not set"}
                      </div>
                    </Link>
                  ))}
                  {jobs.length === 0 && (
                    <p className="text-sm text-neutral-500 dark:text-white text-center py-6">
                      No jobs found
                    </p>
                  )}
                </div>
              </div>

              {/* Two-column layout for Contacts and Documents */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Contacts section */}
                <div className="bg-white dark:bg-dark-150 rounded-lg shadow">
                  <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-medium text-neutral-900 dark:text-white">
                        Key Contacts
                      </h2>
                      <button
                        onClick={handleAddContact}
                        className="inline-flex items-center text-sm font-medium text-[#f26722] hover:text-[#f26722]/90"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add contact
                      </button>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    {contacts.slice(0, 2).map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-start cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700 p-2 rounded-lg"
                        onClick={() => handleContactClick(contact)}
                      >
                        <div className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center">
                          <span className="text-neutral-500 dark:text-white text-lg font-medium">
                            {contact.first_name?.charAt(0) || "C"}
                          </span>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-neutral-900 dark:text-white flex items-center">
                            {contact.first_name} {contact.last_name}
                            {contact.is_primary && (
                              <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                Primary
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-neutral-500 dark:text-white">
                            {contact.position || "No position"}
                          </p>
                          <p className="text-sm text-neutral-500 dark:text-white">
                            {contact.email}
                          </p>
                        </div>
                      </div>
                    ))}
                    {contacts.length === 0 && (
                      <p className="text-sm text-neutral-500 dark:text-white text-center">
                        No contacts found
                      </p>
                    )}
                    {contacts.length > 2 && (
                      <div className="pt-2 text-center">
                        <button
                          onClick={() =>
                            setContactsExpanded((prevState) => !prevState)
                          }
                          className="inline-flex items-center text-sm font-medium text-[#f26722] hover:text-[#f26722]/90"
                        >
                          {contactsExpanded
                            ? "View fewer contacts"
                            : `View all ${contacts.length} contacts`}
                        </button>
                      </div>
                    )}
                    {contactsExpanded && contacts.length > 2 && (
                      <div className="pt-2 space-y-4 border-t border-neutral-100 dark:border-neutral-700 mt-4">
                        {contacts.slice(2).map((contact) => (
                          <div
                            key={contact.id}
                            className="flex items-start cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700 p-2 rounded-lg"
                            onClick={() => handleContactClick(contact)}
                          >
                            <div className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center">
                              <span className="text-neutral-500 dark:text-white text-lg font-medium">
                                {contact.first_name?.charAt(0) || "C"}
                              </span>
                            </div>
                            <div className="ml-3">
                              <p className="text-sm font-medium text-neutral-900 dark:text-white flex items-center">
                                {contact.first_name} {contact.last_name}
                                {contact.is_primary && (
                                  <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                    Primary
                                  </span>
                                )}
                              </p>
                              <p className="text-sm text-neutral-500 dark:text-white">
                                {contact.position || "No position"}
                              </p>
                              <p className="text-sm text-neutral-500 dark:text-white">
                                {contact.email}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Documents section */}
                <div className="bg-white dark:bg-dark-150 rounded-lg shadow">
                  <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-medium text-neutral-900 dark:text-white">
                        Recent Documents
                      </h2>
                      <Link
                        to="#documents"
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveTab("documents");
                        }}
                        className="text-sm font-medium text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90"
                      >
                        View all documents
                      </Link>
                    </div>
                  </div>
                  <div className="p-6">
                    {/* This is a placeholder - we would fetch actual documents in a real implementation */}
                    <div className="flex flex-col space-y-4">
                      <div className="flex items-center">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mr-3">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5 text-blue-700 dark:text-blue-300"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-neutral-900 dark:text-white">
                            Contract_2023.pdf
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-white">
                            Added on Apr 05, 2023
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mr-3">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5 text-green-700 dark:text-green-300"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-neutral-900 dark:text-white">
                            Quarterly_Report.xlsx
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-white">
                            Added on Mar 10, 2023
                          </p>
                        </div>
                      </div>
                      <div className="pt-2 text-center">
                        <Link
                          to="#documents"
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveTab("documents");
                          }}
                          className="inline-flex items-center text-sm font-medium text-[#f26722] hover:text-[#f26722]/90"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Upload document
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Two-column layout for Interactions and Health */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Interactions section */}
                <div className="bg-white dark:bg-dark-150 rounded-lg shadow">
                  <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-medium text-neutral-900 dark:text-white">
                        Recent Interactions
                      </h2>
                      <Link
                        to="#interactions"
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveTab("interactions");
                        }}
                        className="text-sm font-medium text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90"
                      >
                        View all interactions
                      </Link>
                    </div>
                  </div>
                  <div className="p-6">
                    {notesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <LoadingSpinner size="sm" />
                      </div>
                    ) : notes.length === 0 ? (
                      <div className="text-center py-8">
                        <Phone className="h-8 w-8 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                          No interactions yet
                        </p>
                        <Link
                          to="#interactions"
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveTab("interactions");
                          }}
                          className="inline-flex items-center mt-2 text-sm font-medium text-[#f26722] hover:text-[#f26722]/90"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Log your first interaction
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {notes.slice(0, 5).map((note) => (
                          <div key={note.id} className="flex items-start">
                            <div className="relative flex-shrink-0">
                              <div
                                className={`h-8 w-8 rounded-full flex items-center justify-center ${
                                  note.note_type === "call"
                                    ? "bg-[#f26722]/10"
                                    : note.note_type === "email"
                                      ? "bg-blue-100 dark:bg-blue-900"
                                      : "bg-purple-100 dark:bg-purple-900"
                                }`}
                              >
                                {note.note_type === "call" ? (
                                  <Phone className="h-4 w-4 text-[#f26722]" />
                                ) : note.note_type === "email" ? (
                                  <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                ) : (
                                  <UserIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                )}
                              </div>
                            </div>
                            <div className="ml-4 min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
                                  {note.note_type === "call"
                                    ? "Phone Call"
                                    : note.note_type === "email"
                                      ? "Email"
                                      : "In Person"}
                                </h3>
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    note.note_type === "call"
                                      ? "bg-[#f26722]/10 text-[#f26722]"
                                      : note.note_type === "email"
                                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                        : "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                                  }`}
                                >
                                  {note.contact_display_name}
                                </span>
                              </div>
                              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                {note.occurred_at
                                  ? format(
                                      new Date(note.occurred_at),
                                      "MMM d, yyyy 'at' h:mm a",
                                    )
                                  : "No date"}
                              </p>
                              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300 line-clamp-2">
                                {note.context}
                              </p>
                            </div>
                          </div>
                        ))}
                        <div className="pt-2 text-center">
                          <Link
                            to="#interactions"
                            onClick={(e) => {
                              e.preventDefault();
                              setActiveTab("interactions");
                            }}
                            className="inline-flex items-center text-sm font-medium text-[#f26722] hover:text-[#f26722]/90"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            {notes.length > 5
                              ? `View all ${notes.length} interactions`
                              : "Add interaction"}
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Health metrics section */}
                <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-6">
                  <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-6">
                    Customer Health Dashboard
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-4 flex flex-col items-center">
                      <div className="text-xs text-neutral-500 dark:text-white mb-2">
                        Overall Health
                      </div>
                      <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mb-2">
                        <span className="text-white text-2xl font-bold">
                          85
                        </span>
                      </div>
                      <div className="font-medium text-green-600 dark:text-green-400">
                        Good
                      </div>
                    </div>

                    <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-4">
                      <div className="text-xs text-neutral-500 dark:text-white">
                        Engagement
                      </div>
                      <div className="flex items-end mt-1">
                        <div className="text-xl font-bold text-neutral-900 dark:text-white">
                          85%
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400 ml-2 mb-1">
                          ▲ 5%
                        </div>
                      </div>
                      <div className="mt-2 h-2 w-full bg-neutral-200 dark:bg-neutral-600 rounded-full">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: "85%" }}
                        ></div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-4">
                      <div className="text-xs text-neutral-500 dark:text-white">
                        Satisfaction
                      </div>
                      <div className="flex items-end mt-1">
                        <div className="text-xl font-bold text-neutral-900 dark:text-white">
                          92%
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400 ml-2 mb-1">
                          ▲ 3%
                        </div>
                      </div>
                      <div className="mt-2 h-2 w-full bg-neutral-200 dark:bg-neutral-600 rounded-full">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: "92%" }}
                        ></div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-4">
                      <div className="text-xs text-neutral-500 dark:text-white">
                        Response Time
                      </div>
                      <div className="flex items-end mt-1">
                        <div className="text-xl font-bold text-neutral-900 dark:text-white">
                          78%
                        </div>
                        <div className="text-xs text-yellow-600 dark:text-yellow-400 ml-2 mb-1">
                          ▼ 2%
                        </div>
                      </div>
                      <div className="mt-2 h-2 w-full bg-neutral-200 dark:bg-neutral-600 rounded-full">
                        <div
                          className="h-full bg-yellow-500 rounded-full"
                          style={{ width: "78%" }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 flex justify-end">
                    <button className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2">
                      Generate Health Report
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "jobs" && (
            <div className="bg-white dark:bg-dark-150 rounded-lg shadow">
              <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-white">
                    All Jobs
                  </h2>
                  <Link
                    to="/jobs/new"
                    className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Link>
                </div>
              </div>
              <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {jobs.map((job) => (
                  <Link
                    key={job.id}
                    to={`/jobs/${job.id}`}
                    className="block p-6 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Briefcase className="h-5 w-5 text-[#f26722]" />
                        <div className="ml-3">
                          <p className="text-sm font-medium text-neutral-900 dark:text-white">
                            {job.title}
                          </p>
                          <div className="flex items-center mt-1 space-x-2">
                            <span
                              className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                                job.status === "completed"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                  : job.status === "in_progress"
                                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                    : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                              }`}
                            >
                              {formatStatusLabel(job.status)}
                            </span>
                            <span
                              className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                                job.priority === "high"
                                  ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                  : job.priority === "medium"
                                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                    : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              }`}
                            >
                              {formatStatusLabel(job.priority)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-neutral-500 dark:text-white">
                        ${job.budget?.toLocaleString() || "-"}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-neutral-500 dark:text-white">
                      Due:{" "}
                      {job.due_date
                        ? format(new Date(job.due_date), "MMM d, yyyy")
                        : "Not set"}
                    </div>
                  </Link>
                ))}
                {jobs.length === 0 && (
                  <p className="text-sm text-neutral-500 dark:text-white text-center py-6">
                    No jobs found
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "documents" && (
            <div className="bg-white dark:bg-dark-150 rounded-lg shadow">
              <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-white">
                    Customer Documents
                  </h2>
                </div>
              </div>
              <CustomerDocumentManagement customerId={customer.id} />
            </div>
          )}

          {activeTab === "interactions" &&
            (() => {
              const filteredNotes =
                noteFilter === "all"
                  ? notes
                  : notes.filter((n) => n.note_type === noteFilter);
              const callCount = notes.filter(
                (n) => n.note_type === "call",
              ).length;
              const emailCount = notes.filter(
                (n) => n.note_type === "email",
              ).length;
              const inPersonCount = notes.filter(
                (n) => n.note_type === "in_person",
              ).length;
              const noteTypeIcon = (type: string) => {
                if (type === "call")
                  return <Phone className="h-4 w-4 text-[#f26722]" />;
                if (type === "email")
                  return (
                    <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  );
                return (
                  <UserIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                );
              };
              const noteTypeBg = (type: string) => {
                if (type === "call") return "bg-[#f26722]/10";
                if (type === "email") return "bg-blue-100 dark:bg-blue-900";
                return "bg-purple-100 dark:bg-purple-900";
              };
              const noteTypeLabel = (type: string) => {
                if (type === "call") return "Call";
                if (type === "email") return "Email";
                return "In Person";
              };
              const noteTypeBadge = (type: string) => {
                if (type === "call") return "bg-[#f26722]/10 text-[#f26722]";
                if (type === "email")
                  return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
                return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
              };
              return (
                <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                      Customer Interactions
                    </h2>
                    <button
                      onClick={() => {
                        setShowNoteForm(true);
                        setEditingNoteId(null);
                        setNoteFormData({
                          contact_id: contacts[0]?.id || "",
                          note_type: "call",
                          context: "",
                          occurred_at: "",
                        });
                      }}
                      className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
                    >
                      <Feather className="h-4 w-4 mr-1" />
                      Log Interaction
                    </button>
                  </div>

                  {/* Stats */}
                  <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-dark-150 p-4 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-600">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-[#f26722]/10 flex items-center justify-center">
                          <Phone className="h-5 w-5 text-[#f26722]" />
                        </div>
                        <div className="ml-3">
                          <p className="text-lg font-semibold text-neutral-900 dark:text-white">
                            {callCount}
                          </p>
                          <p className="text-xs text-neutral-500">Calls</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-dark-150 p-4 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-600">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                          <Mail className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                        </div>
                        <div className="ml-3">
                          <p className="text-lg font-semibold text-neutral-900 dark:text-white">
                            {emailCount}
                          </p>
                          <p className="text-xs text-neutral-500">Emails</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-dark-150 p-4 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-600">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                          <UserIcon className="h-5 w-5 text-purple-600 dark:text-purple-300" />
                        </div>
                        <div className="ml-3">
                          <p className="text-lg font-semibold text-neutral-900 dark:text-white">
                            {inPersonCount}
                          </p>
                          <p className="text-xs text-neutral-500">In Person</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Filter tabs */}
                  <div className="flex space-x-4 mb-6 border-b border-neutral-200 dark:border-neutral-700">
                    {(["all", "call", "email", "in_person"] as const).map(
                      (f) => (
                        <button
                          key={f}
                          onClick={() => setNoteFilter(f)}
                          className={`px-4 py-2 text-sm font-medium ${noteFilter === f ? "text-[#f26722] border-b-2 border-[#f26722]" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"}`}
                        >
                          {f === "all"
                            ? "All"
                            : f === "call"
                              ? "Calls"
                              : f === "email"
                                ? "Emails"
                                : "In Person"}
                        </button>
                      ),
                    )}
                  </div>

                  {/* Log form */}
                  {showNoteForm && (
                    <div className="mb-6 bg-neutral-50 dark:bg-dark-200 rounded-lg p-4 border border-neutral-200 dark:border-neutral-600">
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
                        {editingNoteId ? "Edit Interaction" : "Log Interaction"}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                            Contact
                          </label>
                          <select
                            value={noteFormData.contact_id}
                            onChange={(e) =>
                              setNoteFormData((p) => ({
                                ...p,
                                contact_id: e.target.value,
                              }))
                            }
                            className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:ring-2 focus:ring-[#f26722]"
                          >
                            <option value="">Select contact...</option>
                            {contacts.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.first_name} {c.last_name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                            Type
                          </label>
                          <select
                            value={noteFormData.note_type}
                            onChange={(e) =>
                              setNoteFormData((p) => ({
                                ...p,
                                note_type: e.target.value,
                              }))
                            }
                            className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:ring-2 focus:ring-[#f26722]"
                          >
                            <option value="call">Call</option>
                            <option value="email">Email</option>
                            <option value="in_person">In Person</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                            Date / Time
                          </label>
                          <input
                            type="datetime-local"
                            value={noteFormData.occurred_at}
                            onChange={(e) =>
                              setNoteFormData((p) => ({
                                ...p,
                                occurred_at: e.target.value,
                              }))
                            }
                            className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:ring-2 focus:ring-[#f26722]"
                          />
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                          Notes
                        </label>
                        <textarea
                          rows={3}
                          value={noteFormData.context}
                          onChange={(e) =>
                            setNoteFormData((p) => ({
                              ...p,
                              context: e.target.value,
                            }))
                          }
                          placeholder="What happened during this interaction..."
                          className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:ring-2 focus:ring-[#f26722]"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setShowNoteForm(false);
                            setEditingNoteId(null);
                          }}
                          className="px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveNote}
                          disabled={noteFormSaving}
                          className="px-4 py-1.5 text-sm bg-[#f26722] text-white rounded hover:bg-[#f26722]/90 disabled:opacity-50"
                        >
                          {noteFormSaving
                            ? "Saving..."
                            : editingNoteId
                              ? "Update"
                              : "Save"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  {notesLoading ? (
                    <div className="py-12 text-center text-neutral-500">
                      <LoadingSpinner size="md" />
                    </div>
                  ) : filteredNotes.length === 0 ? (
                    <div className="py-12 text-center text-neutral-500">
                      <p className="text-sm">No interactions logged yet.</p>
                      <p className="text-xs mt-1">
                        Click "Log Interaction" to add one.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredNotes.map((note, idx) => (
                        <div key={note.id} className="relative">
                          {idx < filteredNotes.length - 1 && (
                            <div className="absolute top-0 left-6 h-full w-0.5 bg-neutral-200 dark:bg-neutral-700" />
                          )}
                          <div className="flex items-start relative">
                            <div className="absolute top-0 left-0 h-12 w-12 flex items-center justify-center z-10">
                              <div
                                className={`h-8 w-8 rounded-full ${noteTypeBg(note.note_type)} flex items-center justify-center border-4 border-white dark:border-neutral-800`}
                              >
                                {noteTypeIcon(note.note_type)}
                              </div>
                            </div>
                            <div className="ml-16 bg-white dark:bg-dark-150 p-4 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-600 w-full">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
                                    {noteTypeLabel(note.note_type)} with{" "}
                                    {note.contact_display_name}
                                  </h3>
                                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                    {format(
                                      new Date(note.occurred_at),
                                      "MMM d, yyyy 'at' h:mm a",
                                    )}
                                  </p>
                                </div>
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${noteTypeBadge(note.note_type)}`}
                                >
                                  {noteTypeLabel(note.note_type)}
                                </span>
                              </div>
                              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap">
                                {note.context}
                              </p>
                              <div className="mt-3 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <AuthorAvatar
                                    email={note.author_email}
                                    profile={authorProfiles.get(
                                      (note.author_email || "").toLowerCase(),
                                    )}
                                    size={24}
                                  />
                                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                    Logged by: {note.author_email}
                                  </p>
                                </div>
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => {
                                      setEditingNoteId(note.id);
                                      setNoteFormData({
                                        contact_id: note.contact_id,
                                        note_type: note.note_type,
                                        context: note.context,
                                        occurred_at: note.occurred_at
                                          ? new Date(note.occurred_at)
                                              .toISOString()
                                              .slice(0, 16)
                                          : "",
                                      });
                                      setShowNoteForm(true);
                                    }}
                                    className="text-sm text-[#f26722] hover:text-[#f26722]/80 flex items-center gap-0.5"
                                  >
                                    <Edit className="h-3 w-3" /> Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteNote(note.id)}
                                    className="text-sm text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 flex items-center gap-0.5"
                                  >
                                    <Trash2 className="h-3 w-3" /> Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
                    {filteredNotes.length} interaction
                    {filteredNotes.length !== 1 ? "s" : ""}
                  </div>
                </div>
              );
            })()}

          {activeTab === "health" && (
            <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-6">
                Customer Health Dashboard
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-4 flex flex-col items-center">
                  <div className="text-xs text-neutral-500 dark:text-white mb-2">
                    Overall Health
                  </div>
                  <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mb-2">
                    <span className="text-white text-2xl font-bold">85</span>
                  </div>
                  <div className="font-medium text-green-600 dark:text-green-400">
                    Good
                  </div>
                </div>

                <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-4">
                  <div className="text-xs text-neutral-500 dark:text-white">
                    Engagement
                  </div>
                  <div className="flex items-end mt-1">
                    <div className="text-xl font-bold text-neutral-900 dark:text-white">
                      85%
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-400 ml-2 mb-1">
                      ▲ 5%
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full bg-neutral-200 dark:bg-neutral-600 rounded-full">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: "85%" }}
                    ></div>
                  </div>
                </div>

                <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-4">
                  <div className="text-xs text-neutral-500 dark:text-white">
                    Satisfaction
                  </div>
                  <div className="flex items-end mt-1">
                    <div className="text-xl font-bold text-neutral-900 dark:text-white">
                      92%
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-400 ml-2 mb-1">
                      ▲ 3%
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full bg-neutral-200 dark:bg-neutral-600 rounded-full">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: "92%" }}
                    ></div>
                  </div>
                </div>

                <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-4">
                  <div className="text-xs text-neutral-500 dark:text-white">
                    Response Time
                  </div>
                  <div className="flex items-end mt-1">
                    <div className="text-xl font-bold text-neutral-900 dark:text-white">
                      78%
                    </div>
                    <div className="text-xs text-yellow-600 dark:text-yellow-400 ml-2 mb-1">
                      ▼ 2%
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full bg-neutral-200 dark:bg-neutral-600 rounded-full">
                    <div
                      className="h-full bg-yellow-500 rounded-full"
                      style={{ width: "78%" }}
                    ></div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <button className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2">
                  Generate Health Report
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Contact Form Dialog */}
      <Dialog
        open={isContactFormOpen}
        onClose={() => setIsContactFormOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-lg rounded bg-white dark:bg-dark-150 p-6">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white">
                Add New Contact for {customer?.company_name}
              </Dialog.Title>
              <button
                onClick={() => setIsContactFormOpen(false)}
                className="text-neutral-400 hover:text-neutral-500 dark:text-white dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="first_name"
                  className="block text-sm font-medium text-neutral-700 dark:text-white"
                >
                  First Name *
                </label>
                <input
                  type="text"
                  name="first_name"
                  id="first_name"
                  required
                  value={contactFormData.first_name}
                  onChange={(e) =>
                    setContactFormData((prev) => ({
                      ...prev,
                      first_name: e.target.value,
                    }))
                  }
                  className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="last_name"
                  className="block text-sm font-medium text-neutral-700 dark:text-white"
                >
                  Last Name *
                </label>
                <input
                  type="text"
                  name="last_name"
                  id="last_name"
                  required
                  value={contactFormData.last_name}
                  onChange={(e) =>
                    setContactFormData((prev) => ({
                      ...prev,
                      last_name: e.target.value,
                    }))
                  }
                  className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-neutral-700 dark:text-white"
                >
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  required
                  value={contactFormData.email}
                  onChange={(e) =>
                    setContactFormData((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-neutral-700 dark:text-white"
                >
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  id="phone"
                  value={contactFormData.phone}
                  onChange={(e) =>
                    setContactFormData((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                  className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="position"
                  className="block text-sm font-medium text-neutral-700 dark:text-white"
                >
                  Position
                </label>
                <input
                  type="text"
                  name="position"
                  id="position"
                  value={contactFormData.position}
                  onChange={(e) =>
                    setContactFormData((prev) => ({
                      ...prev,
                      position: e.target.value,
                    }))
                  }
                  className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="is_primary"
                  id="is_primary"
                  checked={contactFormData.is_primary}
                  onChange={(e) =>
                    setContactFormData((prev) => ({
                      ...prev,
                      is_primary: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-neutral-300 dark:border-neutral-600 rounded"
                />
                <label
                  htmlFor="is_primary"
                  className="ml-2 block text-sm text-neutral-700 dark:text-white"
                >
                  Primary Contact
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">
                  Divisions
                </label>
                <div className="flex flex-wrap gap-2">
                  {DIVISION_OPTIONS.map((div) => {
                    const isActive = contactFormData.divisions.includes(
                      div.value,
                    );
                    return (
                      <button
                        key={div.value}
                        type="button"
                        onClick={() => {
                          setContactFormData((prev) => ({
                            ...prev,
                            divisions: isActive
                              ? prev.divisions.filter((d) => d !== div.value)
                              : [...prev.divisions, div.value],
                          }));
                        }}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-[#f26722] text-white"
                            : "bg-neutral-100 dark:bg-dark-200 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-dark-100 border border-neutral-300 dark:border-neutral-600"
                        }`}
                      >
                        {div.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Leave empty to inherit from the customer's divisions.
                </p>
              </div>
              <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                <button
                  type="submit"
                  disabled={isSubmittingContact}
                  className="inline-flex w-full justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:col-start-2 sm:text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmittingContact ? "Adding..." : "Add Contact"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsContactFormOpen(false)}
                  className="mt-3 inline-flex w-full justify-center rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 px-4 py-2 text-base font-medium text-neutral-700 dark:text-white shadow-sm hover:bg-neutral-50 dark:hover:bg-dark-200 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:col-start-1 sm:mt-0 sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog
        open={isCustomerEditOpen}
        onClose={() => setIsCustomerEditOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-lg rounded bg-white dark:bg-dark-150 p-6 w-full">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white">
                Edit Customer
              </Dialog.Title>
              <button
                onClick={() => setIsCustomerEditOpen(false)}
                className="text-neutral-400 hover:text-neutral-500 dark:text-white dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCustomerEdit} className="space-y-4">
              <div>
                <label
                  htmlFor="company_name"
                  className="block text-sm font-medium text-neutral-700 dark:text-white"
                >
                  Company Name
                </label>
                <input
                  id="company_name"
                  value={customerEditForm.company_name}
                  onChange={(e) =>
                    setCustomerEditForm((prev) => ({
                      ...prev,
                      company_name: e.target.value,
                    }))
                  }
                  className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="email_edit"
                  className="block text-sm font-medium text-neutral-700 dark:text-white"
                >
                  Email
                </label>
                <input
                  id="email_edit"
                  type="email"
                  value={customerEditForm.email}
                  onChange={(e) =>
                    setCustomerEditForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="phone_edit"
                  className="block text-sm font-medium text-neutral-700 dark:text-white"
                >
                  Phone
                </label>
                <input
                  id="phone_edit"
                  value={customerEditForm.phone}
                  onChange={(e) =>
                    setCustomerEditForm((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                  className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="address_edit"
                  className="block text-sm font-medium text-neutral-700 dark:text-white"
                >
                  Address
                </label>
                <input
                  id="address_edit"
                  value={customerEditForm.address}
                  onChange={(e) =>
                    setCustomerEditForm((prev) => ({
                      ...prev,
                      address: e.target.value,
                    }))
                  }
                  className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="status_edit"
                  className="block text-sm font-medium text-neutral-700 dark:text-white"
                >
                  Status
                </label>
                <select
                  id="status_edit"
                  value={customerEditForm.status}
                  onChange={(e) =>
                    setCustomerEditForm((prev) => ({
                      ...prev,
                      status: e.target.value,
                    }))
                  }
                  className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">
                  Divisions
                </label>
                <div className="flex flex-wrap gap-2">
                  {DIVISION_OPTIONS.map((div) => (
                    <button
                      key={div.value}
                      type="button"
                      onClick={() => {
                        setCustomerEditForm((prev) => ({
                          ...prev,
                          divisions: prev.divisions.includes(div.value)
                            ? prev.divisions.filter((d) => d !== div.value)
                            : [...prev.divisions, div.value],
                        }));
                      }}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        customerEditForm.divisions.includes(div.value)
                          ? "bg-[#f26722] text-white"
                          : "bg-neutral-100 dark:bg-dark-200 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-dark-100 border border-neutral-300 dark:border-neutral-600"
                      }`}
                    >
                      {div.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                <button
                  type="submit"
                  disabled={isSavingCustomer}
                  className="inline-flex w-full justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:col-start-2 sm:text-sm disabled:opacity-50"
                >
                  {isSavingCustomer ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomerEditOpen(false)}
                  className="mt-3 inline-flex w-full justify-center rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 px-4 py-2 text-base font-medium text-neutral-700 dark:text-white shadow-sm hover:bg-neutral-50 dark:hover:bg-dark-200 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:col-start-1 sm:mt-0 sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Contact Detail Popup Dialog */}
      <Dialog
        open={contactPopupOpen}
        onClose={() => setContactPopupOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-md rounded-lg bg-white dark:bg-neutral-900 p-6 shadow-xl">
            {selectedContact && (
              <>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center">
                    <div className="h-12 w-12 rounded-full bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center mr-3">
                      <span className="text-neutral-500 dark:text-white text-lg font-medium">
                        {selectedContact.first_name?.charAt(0)}
                        {selectedContact.last_name?.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white">
                        {selectedContact.first_name} {selectedContact.last_name}
                      </Dialog.Title>
                      {selectedContact.position && (
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                          {selectedContact.position}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedContact.is_primary && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        Primary
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setContactPopupOpen(false)}
                      className="text-neutral-400 hover:text-neutral-500 dark:hover:text-neutral-300"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-4 border-t border-neutral-200 dark:border-neutral-700 pt-4">
                  {selectedContact.phone && (
                    <div className="flex items-center">
                      <Phone className="h-5 w-5 text-[#f26722] mr-3" />
                      <div>
                        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                          Phone
                        </p>
                        <a
                          href={`tel:${selectedContact.phone}`}
                          className="text-sm text-[#f26722] hover:text-[#f26722]/80 font-medium transition-colors"
                        >
                          {selectedContact.phone}
                        </a>
                      </div>
                    </div>
                  )}
                  {selectedContact.email && (
                    <div className="flex items-center">
                      <Mail className="h-5 w-5 text-[#f26722] mr-3" />
                      <div>
                        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                          Email
                        </p>
                        <a
                          href={`mailto:${selectedContact.email}`}
                          className="text-sm text-[#f26722] hover:text-[#f26722]/80 font-medium transition-colors"
                        >
                          {selectedContact.email}
                        </a>
                      </div>
                    </div>
                  )}
                  {!selectedContact.phone && !selectedContact.email && (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-2">
                      No contact information available.
                    </p>
                  )}
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setContactPopupOpen(false)}
                    className="inline-flex justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Category Selection Dialog */}
      <Dialog
        open={isCategorySelectOpen}
        onClose={() => setIsCategorySelectOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-sm rounded bg-white dark:bg-dark-150 p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white">
                Change Category
              </Dialog.Title>
              <button
                type="button"
                onClick={() => setIsCategorySelectOpen(false)}
                className="text-neutral-400 hover:text-neutral-500 dark:hover:text-neutral-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <button
                onClick={() => handleCategoryChange(null)}
                className={`w-full text-left py-2 px-3 rounded-md flex items-center ${
                  selectedCategoryId === null
                    ? "bg-neutral-100 dark:bg-dark-150"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-700"
                }`}
              >
                <span className="text-sm font-medium text-neutral-900 dark:text-white">
                  No Category
                </span>
              </button>

              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => handleCategoryChange(category.id)}
                  className={`w-full text-left py-2 px-3 rounded-md flex items-center ${
                    selectedCategoryId === category.id
                      ? "bg-neutral-100 dark:bg-dark-150"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-700"
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded-full mr-3"
                    style={{ backgroundColor: category.color }}
                  ></div>
                  <div>
                    <span className="text-sm font-medium text-neutral-900 dark:text-white">
                      {category.name}
                    </span>
                    <p className="text-sm text-neutral-500 dark:text-white">
                      {category.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 flex justify-between">
              <Link
                to="/sales-dashboard/customer-categories"
                className="text-sm text-[#f26722] hover:text-[#f26722]/80"
              >
                Manage Categories
              </Link>
              <button
                type="button"
                onClick={() => setIsCategorySelectOpen(false)}
                className="inline-flex justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
              >
                Close
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </>
  );
}
