import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  Filter,
  Download,
  Upload,
  Bookmark,
  StarOff,
  Loader2,
  FileSpreadsheet,
  Pencil,
  Trash2,
} from "lucide-react";
import * as XLSX from "xlsx";
import Card, {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  SelectRoot as Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/Dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/toast";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/lib/AuthContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  fetchVendors,
  createVendor,
  updateVendor,
  deleteVendor,
  createContact,
  updateContact,
  deleteContact,
  Vendor,
  VendorContact,
  VendorFormData,
} from "@/services/vendorService";

// Sample categories for dropdown
const vendorCategories = [
  "Technology",
  "Software",
  "Hardware",
  "Office Supplies",
  "Furniture",
  "Maintenance",
  "Facilities",
  "Food Services",
  "Events",
  "Transportation",
  "Logistics",
  "Consulting",
  "Legal",
  "Financial",
  "Telecommunications",
  "Marketing",
  "Printing",
  "Shipping",
  "Utilities",
  "Security",
  "Cleaning",
  "Healthcare",
  "Education",
  "Construction",
  "Electrical",
  "Other",
];

// Empty form for new vendor
const emptyVendorForm: VendorFormData = {
  company_name: "",
  category: [],
  address_street: "",
  address_city: "",
  address_state: "",
  address_zip: "",
  address_country: "USA",
  phone: "",
  email: "",
  website: "",
  rating: 0,
  active: true,
  notes: "",
};

const VendorManagement: React.FC = () => {
  const { user } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importPreview, setImportPreview] = useState<VendorFormData[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [editContact, setEditContact] = useState<VendorContact | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [page, setPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(50);

  const [vendorForm, setVendorForm] = useState<VendorFormData>(emptyVendorForm);

  const [contactForm, setContactForm] = useState({
    name: "",
    title: "",
    email: "",
    phone: "",
    is_primary: false,
  });

  // Load vendors on mount
  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      setLoading(true);
      const data = await fetchVendors();
      setVendors(data);
    } catch (error) {
      console.error("Error loading vendors:", error);
      toast({
        title: "Error",
        description: "Failed to load vendors. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter vendors based on search term, category, rating, and status
  const filteredVendors = vendors.filter((vendor) => {
    const matchesSearch =
      vendor.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendor.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (vendor.contacts || []).some(
        (contact) =>
          contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          contact.email?.toLowerCase().includes(searchTerm.toLowerCase()),
      );

    const matchesCategory =
      categoryFilter === "all" ||
      (vendor.category || []).includes(categoryFilter);
    const matchesRating =
      ratingFilter === "all" || vendor.rating === parseInt(ratingFilter);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && vendor.active) ||
      (statusFilter === "inactive" && !vendor.active);

    return matchesSearch && matchesCategory && matchesRating && matchesStatus;
  });

  const filteredVendorsByTab =
    activeTab === "all"
      ? filteredVendors
      : filteredVendors.filter((vendor) =>
          (vendor.category || []).includes(activeTab),
        );

  // Pagination
  const totalPages = Math.ceil(filteredVendorsByTab.length / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedVendors = filteredVendorsByTab.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, categoryFilter, ratingFilter, statusFilter, activeTab]);

  // Format currency for display
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  };

  // Handle vendor save
  const handleSaveVendor = async () => {
    if (!vendorForm.company_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Company name is required.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (editVendor) {
        // Update existing vendor
        const updated = await updateVendor(editVendor.id, vendorForm);
        setVendors(vendors.map((v) => (v.id === updated.id ? updated : v)));
        toast({
          title: "Vendor Updated",
          description: `${vendorForm.company_name} has been updated successfully.`,
          variant: "default",
        });
      } else {
        // Create new vendor
        const newVendor = await createVendor(vendorForm, user?.id);
        setVendors([...vendors, newVendor]);
        toast({
          title: "Vendor Added",
          description: `${vendorForm.company_name} has been added successfully.`,
          variant: "default",
        });
      }
      setEditVendor(null);
      setShowVendorForm(false);
      setVendorForm(emptyVendorForm);
    } catch (error) {
      console.error("Error saving vendor:", error);
      toast({
        title: "Error",
        description: "Failed to save vendor. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle vendor delete
  const handleDeleteVendor = async (vendor: Vendor) => {
    if (
      !confirm(
        `Are you sure you want to delete ${vendor.company_name}? This will also delete all associated contacts.`,
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      await deleteVendor(vendor.id);
      setVendors(vendors.filter((v) => v.id !== vendor.id));
      toast({
        title: "Vendor Deleted",
        description: `${vendor.company_name} has been deleted.`,
        variant: "default",
      });
    } catch (error) {
      console.error("Error deleting vendor:", error);
      toast({
        title: "Error",
        description: "Failed to delete vendor. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle Excel file import
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
        }) as any[][];

        if (jsonData.length < 2) {
          toast({
            title: "Import Error",
            description: "File appears to be empty or has no data rows.",
            variant: "destructive",
          });
          return;
        }

        // Get headers from first row (case-insensitive mapping)
        const headers = jsonData[0].map((h: any) =>
          String(h || "")
            .toLowerCase()
            .trim(),
        );

        // Map common header variations
        const headerMap: Record<string, string> = {};
        headers.forEach((h: string, i: number) => {
          if (
            h.includes("company") ||
            h.includes("vendor") ||
            h.includes("name")
          )
            headerMap["company_name"] = String(i);
          if (h.includes("street") || h.includes("address1") || h === "address")
            headerMap["address_street"] = String(i);
          if (h.includes("city")) headerMap["address_city"] = String(i);
          if (h.includes("state")) headerMap["address_state"] = String(i);
          if (h.includes("zip") || h.includes("postal"))
            headerMap["address_zip"] = String(i);
          if (h.includes("country")) headerMap["address_country"] = String(i);
          if (h.includes("phone") || h.includes("tel"))
            headerMap["phone"] = String(i);
          if (h.includes("email")) headerMap["email"] = String(i);
          if (h.includes("website") || h.includes("url") || h.includes("web"))
            headerMap["website"] = String(i);
          if (h.includes("category") || h.includes("type"))
            headerMap["category"] = String(i);
          if (h.includes("note") || h.includes("comment"))
            headerMap["notes"] = String(i);
        });

        // Parse data rows
        const vendorData: VendorFormData[] = [];
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;

          const companyName = headerMap["company_name"]
            ? String(row[parseInt(headerMap["company_name"])] || "").trim()
            : String(row[0] || "").trim();

          if (!companyName) continue; // Skip rows without company name

          const vendor: VendorFormData = {
            company_name: companyName,
            category: headerMap["category"]
              ? [
                  String(row[parseInt(headerMap["category"])] || "").trim(),
                ].filter(Boolean)
              : [],
            address_street: headerMap["address_street"]
              ? String(row[parseInt(headerMap["address_street"])] || "").trim()
              : "",
            address_city: headerMap["address_city"]
              ? String(row[parseInt(headerMap["address_city"])] || "").trim()
              : "",
            address_state: headerMap["address_state"]
              ? String(row[parseInt(headerMap["address_state"])] || "").trim()
              : "",
            address_zip: headerMap["address_zip"]
              ? String(row[parseInt(headerMap["address_zip"])] || "").trim()
              : "",
            address_country: headerMap["address_country"]
              ? String(row[parseInt(headerMap["address_country"])] || "").trim()
              : "USA",
            phone: headerMap["phone"]
              ? String(row[parseInt(headerMap["phone"])] || "").trim()
              : "",
            email: headerMap["email"]
              ? String(row[parseInt(headerMap["email"])] || "").trim()
              : "",
            website: headerMap["website"]
              ? String(row[parseInt(headerMap["website"])] || "").trim()
              : "",
            rating: 0,
            active: true,
            notes: headerMap["notes"]
              ? String(row[parseInt(headerMap["notes"])] || "").trim()
              : "",
          };

          vendorData.push(vendor);
        }

        if (vendorData.length === 0) {
          toast({
            title: "Import Error",
            description: "No valid vendor data found in the file.",
            variant: "destructive",
          });
          return;
        }

        setImportPreview(vendorData);
        setShowImportDialog(true);
      } catch (error) {
        console.error("Error parsing Excel file:", error);
        toast({
          title: "Import Error",
          description: "Failed to parse Excel file. Please check the format.",
          variant: "destructive",
        });
      }
    };
    reader.readAsArrayBuffer(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Import vendors from preview
  const handleImportVendors = async () => {
    if (importPreview.length === 0) return;

    setImporting(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const vendorData of importPreview) {
        try {
          const newVendor = await createVendor(vendorData, user?.id);
          setVendors((prev) => [...prev, newVendor]);
          successCount++;
        } catch (error) {
          console.error(
            "Error importing vendor:",
            vendorData.company_name,
            error,
          );
          errorCount++;
        }
      }

      toast({
        title: "Import Complete",
        description: `Successfully imported ${successCount} vendor(s).${errorCount > 0 ? ` ${errorCount} failed.` : ""}`,
        variant: errorCount > 0 ? "default" : "default",
      });

      setShowImportDialog(false);
      setImportPreview([]);
    } catch (error) {
      console.error("Error during import:", error);
      toast({
        title: "Import Error",
        description: "An error occurred during import.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  // Handle contact save
  const handleSaveContact = async () => {
    if (!selectedVendor || !contactForm.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Contact name is required.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (editContact) {
        // Update existing contact
        const updated = await updateContact(editContact.id, contactForm);
        setVendors(
          vendors.map((v) => {
            if (v.id === selectedVendor.id) {
              return {
                ...v,
                contacts: (v.contacts || []).map((c) =>
                  c.id === updated.id ? updated : c,
                ),
              };
            }
            return v;
          }),
        );
        toast({
          title: "Contact Updated",
          description: `${contactForm.name} has been updated.`,
          variant: "default",
        });
      } else {
        // Create new contact
        const newContact = await createContact(selectedVendor.id, contactForm);
        setVendors(
          vendors.map((v) => {
            if (v.id === selectedVendor.id) {
              return {
                ...v,
                contacts: [...(v.contacts || []), newContact],
              };
            }
            return v;
          }),
        );
        toast({
          title: "Contact Added",
          description: `${contactForm.name} has been added.`,
          variant: "default",
        });
      }
      setEditContact(null);
      setShowContactForm(false);
      setContactForm({
        name: "",
        title: "",
        email: "",
        phone: "",
        is_primary: false,
      });
    } catch (error) {
      console.error("Error saving contact:", error);
      toast({
        title: "Error",
        description: "Failed to save contact. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle contact delete
  const handleDeleteContact = async (contact: VendorContact) => {
    if (!confirm(`Are you sure you want to delete ${contact.name}?`)) {
      return;
    }

    setSaving(true);
    try {
      await deleteContact(contact.id);
      setVendors(
        vendors.map((v) => ({
          ...v,
          contacts: (v.contacts || []).filter((c) => c.id !== contact.id),
        })),
      );
      toast({
        title: "Contact Deleted",
        description: `${contact.name} has been deleted.`,
        variant: "default",
      });
    } catch (error) {
      console.error("Error deleting contact:", error);
      toast({
        title: "Error",
        description: "Failed to delete contact. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Open vendor form for editing
  const openEditVendor = (vendor: Vendor) => {
    setEditVendor(vendor);
    setVendorForm({
      company_name: vendor.company_name,
      category: vendor.category || [],
      address_street: vendor.address_street || "",
      address_city: vendor.address_city || "",
      address_state: vendor.address_state || "",
      address_zip: vendor.address_zip || "",
      address_country: vendor.address_country || "USA",
      phone: vendor.phone || "",
      email: vendor.email || "",
      website: vendor.website || "",
      rating: vendor.rating || 0,
      active: vendor.active ?? true,
      notes: vendor.notes || "",
    });
    setShowVendorForm(true);
  };

  // Open vendor form for new vendor
  const openNewVendor = () => {
    setEditVendor(null);
    setVendorForm(emptyVendorForm);
    setShowVendorForm(true);
  };

  // Open contact form for editing
  const openEditContact = (vendor: Vendor, contact: VendorContact) => {
    setSelectedVendor(vendor);
    setEditContact(contact);
    setContactForm({
      name: contact.name,
      title: contact.title || "",
      email: contact.email || "",
      phone: contact.phone || "",
      is_primary: contact.is_primary || false,
    });
    setShowContactForm(true);
  };

  // Open contact form for new contact
  const openNewContact = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setEditContact(null);
    setContactForm({
      name: "",
      title: "",
      email: "",
      phone: "",
      is_primary: false,
    });
    setShowContactForm(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
        <span className="ml-2 text-neutral-500">
          <LoadingSpinner size="md" />
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold dark:text-white">
          Vendor Management
        </h2>
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()} leftIcon={<Upload className="h-4 w-4" />}>
            Import Excel
          </Button>
          <Button onClick={openNewVendor} leftIcon={<Plus className="h-4 w-4" />}>
            Add Vendor
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400"
                size={18}
              />
              <Input
                className="pl-10"
                placeholder="Search vendors by name, email, or contact..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {vendorCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={ratingFilter} onValueChange={setRatingFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ratings</SelectItem>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <SelectItem key={rating} value={rating.toString()}>
                      {rating} Star{rating !== 1 ? "s" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All Vendors</TabsTrigger>
              {[
                "Technology",
                "Office Supplies",
                "Maintenance",
                "Electrical",
                "Logistics",
              ].map((category) => (
                <TabsTrigger key={category} value={category}>
                  {category}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {/* Vendor List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
              <span className="ml-2 text-neutral-500">
                <LoadingSpinner size="md" />
              </span>
            </div>
          ) : paginatedVendors.length === 0 ? (
            <div className="text-center py-12 text-neutral-500">
              {vendors.length === 0 ? (
                <div>
                  <p className="mb-4">No vendors have been added yet.</p>
                  <Button onClick={openNewVendor} leftIcon={<Plus className="h-4 w-4" />}>
                    Add Your First Vendor
                  </Button>
                </div>
              ) : (
                <p>No vendors found with the current filters.</p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {paginatedVendors.map((vendor) => (
                <li
                  key={vendor.id}
                  onClick={() => setSelectedVendor(vendor)}
                  className={`px-6 py-4 hover:bg-neutral-50 dark:hover:bg-neutral-700 cursor-pointer transition-colors ${
                    !vendor.active ? "opacity-75" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-none bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center">
                          <span className="text-neutral-500 dark:text-white text-lg font-medium">
                            {vendor.company_name?.charAt(0) || "V"}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                            {vendor.company_name}
                          </div>
                          {!vendor.active && (
                            <Badge variant="destructive" className="text-xs">
                              Inactive
                            </Badge>
                          )}
                          {vendor.rating > 0 && (
                            <div className="flex items-center">
                              {[...Array(5)].map((_, i) => (
                                <Bookmark
                                  key={i}
                                  className={`h-3 w-3 ${
                                    i < vendor.rating
                                      ? "fill-amber-400 text-amber-400"
                                      : "text-neutral-300"
                                  }`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
                          {vendor.email && (
                            <span className="truncate">{vendor.email}</span>
                          )}
                          {vendor.phone && (
                            <span className="truncate">{vendor.phone}</span>
                          )}
                          {vendor.address_city && vendor.address_state && (
                            <span className="truncate">
                              {vendor.address_city}, {vendor.address_state}
                            </span>
                          )}
                        </div>
                        {(vendor.category || []).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(vendor.category || [])
                              .slice(0, 3)
                              .map((cat, index) => (
                                <Badge
                                  key={index}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {cat}
                                </Badge>
                              ))}
                            {(vendor.category || []).length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{(vendor.category || []).length - 3} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditVendor(vendor);
                        }}
                        className="text-neutral-400 hover:text-neutral-500 dark:hover:text-neutral-300"
                      >
                        <Pencil className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteVendor(vendor);
                        }}
                        className="text-neutral-400 hover:text-red-500 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      {!loading && paginatedVendors.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            Showing {startIndex + 1} to{" "}
            {Math.min(endIndex, filteredVendorsByTab.length)} of{" "}
            {filteredVendorsByTab.length} vendors
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <span className="text-sm text-neutral-600 dark:text-white">
              Page {page} of {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Vendor Form Dialog */}
      <Dialog open={showVendorForm} onOpenChange={setShowVendorForm}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {editVendor ? "Edit Vendor" : "Add New Vendor"}
            </DialogTitle>
            <DialogDescription>
              {editVendor
                ? "Update vendor information and details"
                : "Enter information about the new vendor"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block dark:text-white">
                  Company Name*
                </label>
                <Input
                  placeholder="Enter company name"
                  value={vendorForm.company_name}
                  onChange={(e) =>
                    setVendorForm({
                      ...vendorForm,
                      company_name: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block dark:text-white">
                  Categories*
                </label>
                <Select
                  value={vendorForm.category[0] || ""}
                  onValueChange={(value) =>
                    setVendorForm({ ...vendorForm, category: [value] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select primary category" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorCategories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-neutral-500 mt-1">
                  Primary vendor category
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block dark:text-white">
                  Phone
                </label>
                <Input
                  placeholder="(123) 456-7890"
                  value={vendorForm.phone}
                  onChange={(e) =>
                    setVendorForm({ ...vendorForm, phone: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block dark:text-white">
                  Email
                </label>
                <Input
                  placeholder="company@example.com"
                  type="email"
                  value={vendorForm.email}
                  onChange={(e) =>
                    setVendorForm({ ...vendorForm, email: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block dark:text-white">
                  Website
                </label>
                <Input
                  placeholder="www.example.com"
                  value={vendorForm.website}
                  onChange={(e) =>
                    setVendorForm({ ...vendorForm, website: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block dark:text-white">
                  Rating
                </label>
                <Select
                  value={vendorForm.rating.toString()}
                  onValueChange={(value) =>
                    setVendorForm({ ...vendorForm, rating: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select rating" />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 4, 3, 2, 1, 0].map((rating) => (
                      <SelectItem key={rating} value={rating.toString()}>
                        {rating > 0
                          ? `${rating} Star${rating !== 1 ? "s" : ""}`
                          : "Not Rated"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="active-status"
                  checked={vendorForm.active}
                  onChange={(e) =>
                    setVendorForm({ ...vendorForm, active: e.target.checked })
                  }
                  className="rounded"
                />
                <label
                  htmlFor="active-status"
                  className="text-sm font-medium dark:text-white"
                >
                  Active Vendor
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block dark:text-white">
                  Street Address
                </label>
                <Input
                  placeholder="Street address"
                  value={vendorForm.address_street}
                  onChange={(e) =>
                    setVendorForm({
                      ...vendorForm,
                      address_street: e.target.value,
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium mb-1 block dark:text-white">
                    City
                  </label>
                  <Input
                    placeholder="City"
                    value={vendorForm.address_city}
                    onChange={(e) =>
                      setVendorForm({
                        ...vendorForm,
                        address_city: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block dark:text-white">
                    State
                  </label>
                  <Input
                    placeholder="State"
                    value={vendorForm.address_state}
                    onChange={(e) =>
                      setVendorForm({
                        ...vendorForm,
                        address_state: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium mb-1 block dark:text-white">
                    ZIP Code
                  </label>
                  <Input
                    placeholder="ZIP"
                    value={vendorForm.address_zip}
                    onChange={(e) =>
                      setVendorForm({
                        ...vendorForm,
                        address_zip: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block dark:text-white">
                    Country
                  </label>
                  <Input
                    placeholder="Country"
                    value={vendorForm.address_country}
                    onChange={(e) =>
                      setVendorForm({
                        ...vendorForm,
                        address_country: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block dark:text-white">
                  Notes
                </label>
                <Textarea
                  placeholder="Additional notes about this vendor"
                  rows={5}
                  value={vendorForm.notes}
                  onChange={(e) =>
                    setVendorForm({ ...vendorForm, notes: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditVendor(null);
                setShowVendorForm(false);
                setVendorForm(emptyVendorForm);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveVendor} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editVendor ? "Update Vendor" : "Add Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact Form Dialog */}
      <Dialog open={showContactForm} onOpenChange={setShowContactForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editContact ? "Edit Contact" : "Add New Contact"}
            </DialogTitle>
            <DialogDescription>
              {selectedVendor && (
                <span>
                  {editContact ? "Update" : "Add"} contact information for{" "}
                  {selectedVendor.company_name}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block dark:text-white">
                Contact Name*
              </label>
              <Input
                placeholder="Full Name"
                value={contactForm.name}
                onChange={(e) =>
                  setContactForm({ ...contactForm, name: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block dark:text-white">
                Title/Position
              </label>
              <Input
                placeholder="e.g. Account Manager"
                value={contactForm.title}
                onChange={(e) =>
                  setContactForm({ ...contactForm, title: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block dark:text-white">
                Email
              </label>
              <Input
                placeholder="email@example.com"
                type="email"
                value={contactForm.email}
                onChange={(e) =>
                  setContactForm({ ...contactForm, email: e.target.value })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block dark:text-white">
                Phone
              </label>
              <Input
                placeholder="(123) 456-7890"
                value={contactForm.phone}
                onChange={(e) =>
                  setContactForm({ ...contactForm, phone: e.target.value })
                }
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="primary-contact"
                checked={contactForm.is_primary}
                onChange={(e) =>
                  setContactForm({
                    ...contactForm,
                    is_primary: e.target.checked,
                  })
                }
                className="rounded"
              />
              <label
                htmlFor="primary-contact"
                className="text-sm font-medium dark:text-white"
              >
                Primary Contact
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditContact(null);
                setShowContactForm(false);
                setContactForm({
                  name: "",
                  title: "",
                  email: "",
                  phone: "",
                  is_primary: false,
                });
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveContact} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editContact ? "Update Contact" : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vendor Details Dialog */}
      <Dialog
        open={!!selectedVendor && !showContactForm}
        onOpenChange={(open) => !open && setSelectedVendor(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedVendor && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedVendor.company_name}
                  {!selectedVendor.active && (
                    <Badge variant="destructive">Inactive</Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  Complete vendor information and history
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                <div>
                  <h4 className="font-semibold mb-2 dark:text-white">
                    Company Information
                  </h4>
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="text-neutral-500">Categories:</span>{" "}
                      {(selectedVendor.category || []).join(", ") || "None"}
                    </p>
                    <p>
                      <span className="text-neutral-500">Phone:</span>{" "}
                      {selectedVendor.phone || "N/A"}
                    </p>
                    <p>
                      <span className="text-neutral-500">Email:</span>{" "}
                      {selectedVendor.email || "N/A"}
                    </p>
                    <p>
                      <span className="text-neutral-500">Website:</span>{" "}
                      {selectedVendor.website || "N/A"}
                    </p>
                    <p>
                      <span className="text-neutral-500">Address:</span>{" "}
                      {[
                        selectedVendor.address_street,
                        selectedVendor.address_city,
                        selectedVendor.address_state,
                        selectedVendor.address_zip,
                      ]
                        .filter(Boolean)
                        .join(", ") || "N/A"}
                    </p>
                    <p>
                      <span className="text-neutral-500">Rating:</span>{" "}
                      {"★".repeat(selectedVendor.rating || 0)}
                      {"☆".repeat(5 - (selectedVendor.rating || 0))}
                    </p>
                    {selectedVendor.notes && (
                      <p>
                        <span className="text-neutral-500">Notes:</span>{" "}
                        {selectedVendor.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold dark:text-white">
                      Contacts ({(selectedVendor.contacts || []).length})
                    </h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openNewContact(selectedVendor)} leftIcon={<Plus className="h-4 w-4" />}>
                      Add
                    </Button>
                  </div>
                  {(selectedVendor.contacts || []).length === 0 ? (
                    <p className="text-sm text-neutral-500">
                      No contacts added.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {(selectedVendor.contacts || []).map((contact) => (
                        <div
                          key={contact.id}
                          className="border dark:border-neutral-700 rounded p-2 text-sm"
                        >
                          <div className="flex justify-between">
                            <span className="font-medium dark:text-white">
                              {contact.name}
                            </span>
                            {contact.is_primary && (
                              <Badge variant="secondary" className="text-xs">
                                Primary
                              </Badge>
                            )}
                          </div>
                          <p className="text-neutral-600 dark:text-neutral-400">
                            {contact.title}
                          </p>
                          <p className="dark:text-neutral-300">
                            {contact.email} • {contact.phone}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSelectedVendor(null)}
                >
                  Close
                </Button>
                <Button onClick={() => openEditVendor(selectedVendor)}>
                  Edit Vendor
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Import Preview Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="w-[90vw] max-w-[1000px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Import Vendors Preview
              </div>
            </DialogTitle>
            <DialogDescription>
              Review the vendors to be imported. {importPreview.length}{" "}
              vendor(s) found.
            </DialogDescription>
          </DialogHeader>

          <div className="border dark:border-neutral-700 rounded-none overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 dark:bg-dark-200 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium dark:text-white">
                      Company Name
                    </th>
                    <th className="px-3 py-2 text-left font-medium dark:text-white">
                      City
                    </th>
                    <th className="px-3 py-2 text-left font-medium dark:text-white">
                      State
                    </th>
                    <th className="px-3 py-2 text-left font-medium dark:text-white">
                      Phone
                    </th>
                    <th className="px-3 py-2 text-left font-medium dark:text-white">
                      Email
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                  {importPreview.map((vendor, index) => (
                    <tr
                      key={index}
                      className="hover:bg-neutral-50 dark:hover:bg-dark-100"
                    >
                      <td className="px-3 py-2 font-medium dark:text-white">
                        {vendor.company_name}
                      </td>
                      <td className="px-3 py-2 dark:text-neutral-300">
                        {vendor.address_city || "-"}
                      </td>
                      <td className="px-3 py-2 dark:text-neutral-300">
                        {vendor.address_state || "-"}
                      </td>
                      <td className="px-3 py-2 dark:text-neutral-300">
                        {vendor.phone || "-"}
                      </td>
                      <td className="px-3 py-2 dark:text-neutral-300">
                        {vendor.email || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowImportDialog(false);
                setImportPreview([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImportVendors}
              disabled={importing || importPreview.length === 0}
            >
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {importPreview.length} Vendor(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendorManagement;
