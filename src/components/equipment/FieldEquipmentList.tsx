import React, { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  User,
  Briefcase,
  TriangleAlert,
  Truck as TruckIcon,
  FileText,
  Upload,
  Eye,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ExternalLink,
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ThumbsUp,
  Tag,
  MapPin,
  Layers,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Wrench,
} from "lucide-react";
import { Dialog } from "@headlessui/react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";
import { toast } from "../ui/toast";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { PageLayout } from "../ui/PageLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/Tabs";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Switch } from "../ui/Switch";
import { employeeEmailRegex, employeeNameEmailRegex } from "@/lib/companyConfig";

interface SubComponent {
  qty: number;
  item: string;
  serial_number: string;
  cal_date: string;
  amp_id: string;
}

type AssignedType = "user" | "job_site" | "truck";

interface FieldEquipment {
  id: string;
  equipment_name: string;
  amp_id: string | null;
  serial_number: string | null;
  calibration_date: string | null;
  calibration_due_date: string | null;
  category: string | null;
  location: string | null;
  sub_components: SubComponent[] | null;
  assigned_to: string | null;
  assigned_type: AssignedType | null;
  checked_out_by: string | null;
  checked_out_at: string | null;
  notes: string | null;
  tracking_url: string | null;
  calibration_certificate_url: string | null;
  in_service?: boolean;
  created_at: string;
  updated_at: string;
}

interface UserData {
  id: string;
  email: string;
  user_metadata: any;
}

interface EquipmentFormData {
  equipment_name: string;
  amp_id: string;
  serial_number: string;
  calibration_date: string;
  calibration_due_date: string;
  category: string;
  location: string;
  assigned_to: string | null;
  assigned_type: AssignedType | null;
  notes: string;
  tracking_url: string;
  in_service: boolean;
}

const initialFormData: EquipmentFormData = {
  equipment_name: "",
  amp_id: "",
  serial_number: "",
  calibration_date: "",
  calibration_due_date: "",
  category: "",
  location: "",
  assigned_to: null,
  assigned_type: null,
  notes: "",
  tracking_url: "",
  in_service: true,
};

const emptySubComponent: SubComponent = {
  qty: 1,
  item: "",
  serial_number: "",
  cal_date: "",
  amp_id: "",
};

/** Normalize sub_components from API (may be array, JSON string, null, or missing). */
function normalizeSubComponents(raw: unknown): SubComponent[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter(
        (sc): sc is SubComponent =>
          sc && typeof sc === "object" && "item" in sc,
      )
      .map((sc) => ({
        qty: typeof sc.qty === "number" ? sc.qty : 1,
        item: typeof sc.item === "string" ? sc.item : "",
        serial_number:
          typeof sc.serial_number === "string" ? sc.serial_number : "",
        cal_date:
          typeof (sc as SubComponent).cal_date === "string"
            ? (sc as SubComponent).cal_date
            : "",
        amp_id:
          typeof (sc as SubComponent).amp_id === "string"
            ? (sc as SubComponent).amp_id
            : "",
      }));
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return normalizeSubComponents(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

export default function FieldEquipmentList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get("open");
  const [equipment, setEquipment] = useState<FieldEquipment[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(
    null,
  );
  const [formData, setFormData] = useState<EquipmentFormData>(initialFormData);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [equipmentToDelete, setEquipmentToDelete] = useState<string | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [users, setUsers] = useState<UserData[]>([]);
  const [jobSites, setJobSites] = useState<string[]>([]);
  const [trucks, setTrucks] = useState<string[]>([]);
  const [openUserSelectors, setOpenUserSelectors] = useState<{
    [key: string]: boolean;
  }>({});
  const [userSearchQueries, setUserSearchQueries] = useState<{
    [key: string]: string;
  }>({});
  const [assignTabByEquipment, setAssignTabByEquipment] = useState<{
    [key: string]: AssignedType;
  }>({});
  const [openActionMenus, setOpenActionMenus] = useState<{
    [key: string]: boolean;
  }>({});
  const userSelectorRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const actionMenuRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [viewingCertificate, setViewingCertificate] = useState<string | null>(
    null,
  );
  const [editingEquipmentCertificate, setEditingEquipmentCertificate] =
    useState<string | null>(null);
  const [pdfZoom, setPdfZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [viewingTrackingUrl, setViewingTrackingUrl] = useState<string | null>(
    null,
  );
  const [viewingEquipment, setViewingEquipment] =
    useState<FieldEquipment | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [allTabShowExtraColumns, setAllTabShowExtraColumns] =
    useState<boolean>(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryInput, setCategoryInput] = useState<string>("");
  const [showCategoryDropdown, setShowCategoryDropdown] =
    useState<boolean>(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const [locations, setLocations] = useState<string[]>([]);
  const [locationInput, setLocationInput] = useState<string>("");
  const [showLocationDropdown, setShowLocationDropdown] =
    useState<boolean>(false);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const [subComponentItems, setSubComponentItems] = useState<string[]>([]);
  const [formSubComponents, setFormSubComponents] = useState<SubComponent[]>(
    [],
  );
  const [subComponentsExpanded, setSubComponentsExpanded] =
    useState<boolean>(false);
  const [activeSubComponentDropdown, setActiveSubComponentDropdown] = useState<
    number | null
  >(null);
  const subComponentItemRefs = useRef<{ [key: number]: HTMLDivElement | null }>(
    {},
  );

  // Sort state
  type SortField =
    | "equipment_name"
    | "serial_number"
    | "amp_id"
    | "calibration_date"
    | "calibration_due_date"
    | "category"
    | "location"
    | "assigned_to"
    | "notes"
    | null;
  type SortDirection = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Service filter: show all equipment or only in-service (out-of-service viewable only here)
  type ServiceFilter = "all" | "in_service";
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");

  // Category filter: limits list to equipment in the selected category (saved categories)
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  useEffect(() => {
    if (user) {
      fetchEquipment();
      fetchUsers();
      fetchCategories();
      fetchLocations();
      fetchSubComponentItems();
      fetchJobSites();
      fetchTrucks();
    }
  }, [user]);

  // Open equipment view modal when ?open=id is in the URL (e.g. from portal calibration notifications)
  useEffect(() => {
    if (!openId || equipment.length === 0) return;
    const found = equipment.find((e) => e.id === openId);
    if (found) {
      setViewingEquipment(found);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("open");
          return next;
        },
        { replace: true },
      );
    }
  }, [openId, equipment, setSearchParams]);

  // Close user selectors when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      Object.keys(userSelectorRefs.current).forEach((equipmentId) => {
        const ref = userSelectorRefs.current[equipmentId];
        if (ref && !ref.contains(event.target as Node)) {
          setOpenUserSelectors((prev) => ({ ...prev, [equipmentId]: false }));
        }
      });
      Object.keys(actionMenuRefs.current).forEach((equipmentId) => {
        const ref = actionMenuRefs.current[equipmentId];
        if (ref && !ref.contains(event.target as Node)) {
          setOpenActionMenus((prev) => ({ ...prev, [equipmentId]: false }));
        }
      });
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  async function fetchEquipment() {
    try {
      setLoading(true);

      // Get total count (without search filter)
      const { count: totalCountResult } = await supabase
        .schema("neta_ops")
        .from("field_equipment")
        .select("*", { count: "exact", head: true });

      setTotalCount(totalCountResult || 0);

      // Get filtered equipment
      let query = supabase
        .schema("neta_ops")
        .from("field_equipment")
        .select("*")
        .order("equipment_name", { ascending: true });

      // Apply search filter
      if (searchTerm.trim()) {
        const searchLower = `%${searchTerm.toLowerCase()}%`;
        query = query.or(
          `equipment_name.ilike.${searchLower},amp_id.ilike.${searchLower},serial_number.ilike.${searchLower},notes.ilike.${searchLower},category.ilike.${searchLower},location.ilike.${searchLower}`,
        );
      }

      const { data, error } = await query;

      if (error) throw error;
      const rows = (data || []) as (Omit<FieldEquipment, "sub_components"> & {
        sub_components?: unknown;
      })[];
      setEquipment(
        rows.map((row) => {
          const normalized = normalizeSubComponents(row.sub_components);
          const { sub_components: _sc, ...rest } = row;
          return {
            ...rest,
            sub_components: normalized.length > 0 ? normalized : null,
          } as FieldEquipment;
        }),
      );

      // Refresh categories after equipment is loaded (in case table doesn't exist)
      if (categories.length === 0) {
        fetchCategories();
      }
    } catch (error) {
      console.error("Error fetching equipment:", error);
      toast({
        title: "Error",
        description: "Failed to load equipment",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsers() {
    try {
      const { data: adminData, error: adminError } = await supabase
        .schema("common")
        .rpc("admin_get_users");

      if (adminError) {
        console.error("Error fetching users:", adminError);
        return;
      }

      if (adminData) {
        const mappedUsers = adminData.map((user: any) => ({
          id: user.id,
          email: user.email,
          user_metadata: user.raw_user_meta_data || {},
        }));
        setUsers(mappedUsers);
      }
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  }

  async function fetchCategories() {
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("equipment_categories")
        .select("name")
        .order("name", { ascending: true });

      if (error) {
        // If table doesn't exist, extract categories from existing equipment
        if (
          error.code === "42P01" ||
          error.message?.includes("does not exist")
        ) {
          const uniqueCategories = Array.from(
            new Set(
              equipment
                .map((eq) => eq.category)
                .filter((cat): cat is string => cat !== null && cat !== ""),
            ),
          ).sort();
          setCategories(uniqueCategories);
          return;
        }
        console.error("Error fetching categories:", error);
        // Fallback: extract categories from existing equipment
        const uniqueCategories = Array.from(
          new Set(
            equipment
              .map((eq) => eq.category)
              .filter((cat): cat is string => cat !== null && cat !== ""),
          ),
        ).sort();
        setCategories(uniqueCategories);
        return;
      }

      if (data) {
        setCategories(data.map((cat) => cat.name));
      } else {
        // If no categories in table, extract from existing equipment
        const uniqueCategories = Array.from(
          new Set(
            equipment
              .map((eq) => eq.category)
              .filter((cat): cat is string => cat !== null && cat !== ""),
          ),
        ).sort();
        setCategories(uniqueCategories);
      }
    } catch (err) {
      console.error("Error fetching categories:", err);
      // Fallback: extract categories from existing equipment
      const uniqueCategories = Array.from(
        new Set(
          equipment
            .map((eq) => eq.category)
            .filter((cat): cat is string => cat !== null && cat !== ""),
        ),
      ).sort();
      setCategories(uniqueCategories);
    }
  }

  async function createCategory(categoryName: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("equipment_categories")
        .insert([{ name: categoryName.trim() }]);

      if (error) {
        // If it's a unique constraint error, the category already exists
        if (error.code === "23505") {
          return true; // Category already exists, which is fine
        }
        console.error("Error creating category:", error);
        return false;
      }

      // Refresh categories list
      await fetchCategories();
      return true;
    } catch (err) {
      console.error("Error creating category:", err);
      return false;
    }
  }

  async function deleteCategory(categoryName: string) {
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("equipment_categories")
        .delete()
        .eq("name", categoryName.trim());

      if (error) {
        console.error("Error deleting category:", error);
        toast({
          title: "Error",
          description: "Could not delete category",
          variant: "destructive",
        });
        return;
      }
      if (
        categoryInput.trim().toLowerCase() === categoryName.trim().toLowerCase()
      ) {
        setCategoryInput("");
        setFormData((prev) => ({ ...prev, category: "" }));
      }
      await fetchCategories();
      toast({
        title: "Category removed",
        description: `"${categoryName}" removed from saved categories.`,
        variant: "success",
      });
    } catch (err) {
      console.error("Error deleting category:", err);
      toast({
        title: "Error",
        description: "Could not delete category",
        variant: "destructive",
      });
    }
  }

  async function fetchLocations() {
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("equipment_locations")
        .select("name")
        .order("name", { ascending: true });

      if (error) {
        if (
          error.code === "42P01" ||
          error.message?.includes("does not exist")
        ) {
          const uniqueLocations = Array.from(
            new Set(
              equipment
                .map((eq) => eq.location)
                .filter((loc): loc is string => loc !== null && loc !== ""),
            ),
          ).sort();
          setLocations(uniqueLocations);
          return;
        }
        console.error("Error fetching locations:", error);
        const uniqueLocations = Array.from(
          new Set(
            equipment
              .map((eq) => eq.location)
              .filter((loc): loc is string => loc !== null && loc !== ""),
          ),
        ).sort();
        setLocations(uniqueLocations);
        return;
      }

      if (data) {
        setLocations(data.map((item: any) => item.name));
      } else {
        const uniqueLocations = Array.from(
          new Set(
            equipment
              .map((eq) => eq.location)
              .filter((loc): loc is string => loc !== null && loc !== ""),
          ),
        ).sort();
        setLocations(uniqueLocations);
      }
    } catch (err) {
      console.error("Error fetching locations:", err);
      const uniqueLocations = Array.from(
        new Set(
          equipment
            .map((eq) => eq.location)
            .filter((loc): loc is string => loc !== null && loc !== ""),
        ),
      ).sort();
      setLocations(uniqueLocations);
    }
  }

  async function createLocation(locationName: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("equipment_locations")
        .insert([{ name: locationName.trim() }]);

      if (error) {
        if (error.code === "23505") {
          return true; // Location already exists
        }
        console.error("Error creating location:", error);
        return false;
      }

      await fetchLocations();
      return true;
    } catch (err) {
      console.error("Error creating location:", err);
      return false;
    }
  }

  async function deleteLocation(locationName: string) {
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("equipment_locations")
        .delete()
        .eq("name", locationName.trim());

      if (error) {
        console.error("Error deleting location:", error);
        toast({
          title: "Error",
          description: "Could not delete location",
          variant: "destructive",
        });
        return;
      }
      if (
        locationInput.trim().toLowerCase() === locationName.trim().toLowerCase()
      ) {
        setLocationInput("");
        setFormData((prev) => ({ ...prev, location: "" }));
      }
      await fetchLocations();
      toast({
        title: "Location removed",
        description: `"${locationName}" removed from saved locations.`,
        variant: "success",
      });
    } catch (err) {
      console.error("Error deleting location:", err);
      toast({
        title: "Error",
        description: "Could not delete location",
        variant: "destructive",
      });
    }
  }

  async function fetchJobSites() {
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("equipment_job_sites")
        .select("name")
        .order("name", { ascending: true });

      if (error) {
        if (
          error.code === "42P01" ||
          error.message?.includes("does not exist")
        ) {
          setJobSites([]);
          return;
        }
        console.error("Error fetching job sites:", error);
        setJobSites([]);
        return;
      }

      setJobSites((data || []).map((row: any) => row.name));
    } catch (err) {
      console.error("Error fetching job sites:", err);
    }
  }

  async function createJobSite(name: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("equipment_job_sites")
        .insert([{ name: name.trim() }]);

      if (error) {
        if (error.code === "23505") return true; // already exists
        console.error("Error creating job site:", error);
        return false;
      }
      await fetchJobSites();
      return true;
    } catch (err) {
      console.error("Error creating job site:", err);
      return false;
    }
  }

  async function deleteJobSite(name: string) {
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("equipment_job_sites")
        .delete()
        .eq("name", name.trim());

      if (error) {
        console.error("Error deleting job site:", error);
        toast({
          title: "Error",
          description: "Could not delete job site",
          variant: "destructive",
        });
        return;
      }
      await fetchJobSites();
      toast({
        title: "Job site removed",
        description: `"${name}" removed from saved job sites.`,
        variant: "success",
      });
    } catch (err) {
      console.error("Error deleting job site:", err);
      toast({
        title: "Error",
        description: "Could not delete job site",
        variant: "destructive",
      });
    }
  }

  async function fetchTrucks() {
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("equipment_trucks")
        .select("name")
        .order("name", { ascending: true });

      if (error) {
        if (
          error.code === "42P01" ||
          error.message?.includes("does not exist")
        ) {
          setTrucks([]);
          return;
        }
        console.error("Error fetching trucks:", error);
        setTrucks([]);
        return;
      }

      setTrucks((data || []).map((row: any) => row.name));
    } catch (err) {
      console.error("Error fetching trucks:", err);
    }
  }

  async function createTruck(name: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("equipment_trucks")
        .insert([{ name: name.trim() }]);

      if (error) {
        if (error.code === "23505") return true; // already exists
        console.error("Error creating truck:", error);
        return false;
      }
      await fetchTrucks();
      return true;
    } catch (err) {
      console.error("Error creating truck:", err);
      return false;
    }
  }

  async function deleteTruck(name: string) {
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("equipment_trucks")
        .delete()
        .eq("name", name.trim());

      if (error) {
        console.error("Error deleting truck:", error);
        toast({
          title: "Error",
          description: "Could not delete truck",
          variant: "destructive",
        });
        return;
      }
      await fetchTrucks();
      toast({
        title: "Truck removed",
        description: `"${name}" removed from saved trucks.`,
        variant: "success",
      });
    } catch (err) {
      console.error("Error deleting truck:", err);
      toast({
        title: "Error",
        description: "Could not delete truck",
        variant: "destructive",
      });
    }
  }

  async function fetchSubComponentItems() {
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("equipment_sub_component_items")
        .select("name")
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching sub component items:", error);
        return;
      }

      if (data) {
        setSubComponentItems(data.map((item: any) => item.name));
      }
    } catch (err) {
      console.error("Error fetching sub component items:", err);
    }
  }

  async function createSubComponentItem(itemName: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("equipment_sub_component_items")
        .insert([{ name: itemName.trim() }]);

      if (error) {
        if (error.code === "23505") {
          return true; // Item already exists
        }
        console.error("Error creating sub component item:", error);
        return false;
      }

      await fetchSubComponentItems();
      return true;
    } catch (err) {
      console.error("Error creating sub component item:", err);
      return false;
    }
  }

  async function deleteSubComponentItem(itemName: string) {
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("equipment_sub_component_items")
        .delete()
        .eq("name", itemName.trim());

      if (error) {
        console.error("Error deleting sub component item:", error);
        toast({
          title: "Error",
          description: "Could not delete item",
          variant: "destructive",
        });
        return;
      }
      await fetchSubComponentItems();
      toast({
        title: "Item removed",
        description: `"${itemName}" removed from saved sub component items.`,
        variant: "success",
      });
    } catch (err) {
      console.error("Error deleting sub component item:", err);
      toast({
        title: "Error",
        description: "Could not delete item",
        variant: "destructive",
      });
    }
  }

  const deriveNameFromEmail = (email?: string | null): string | null => {
    if (!email) return null;
    const lower = String(email).toLowerCase();
    const m = lower.match(employeeNameEmailRegex);
    if (!m) return null;
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(m[1])} ${cap(m[2])}`;
  };

  const displayUserName = (u: UserData): string => {
    const raw = u?.user_metadata?.name as string | undefined;
    if (raw && raw.includes(" ")) return raw;
    const derived = deriveNameFromEmail(u?.email);
    return derived || raw || u?.email || "Unnamed User";
  };

  const getUserNameById = (userId: string | null): string => {
    if (!userId) return "Not assigned";
    const user = users.find((u) => u.id === userId);
    return user ? displayUserName(user) : "Unknown User";
  };

  const getAssignedLabel = (
    item: Pick<FieldEquipment, "assigned_to" | "assigned_type">,
  ): string => {
    if (!item.assigned_to) return "Not assigned";
    const type = item.assigned_type || "user";
    if (type === "user") {
      const u = users.find((usr) => usr.id === item.assigned_to);
      return u ? displayUserName(u) : "Unknown User";
    }
    return item.assigned_to;
  };

  const getAssignedTypeLabel = (
    type: AssignedType | null | undefined,
  ): string => {
    switch (type) {
      case "job_site":
        return "Job Site";
      case "truck":
        return "Truck";
      case "user":
      default:
        return "User";
    }
  };

  // Helper function to parse date string as local date (not UTC)
  // This prevents timezone issues where dates appear one day off
  const parseLocalDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  // Helper function to format date string as local date string
  const formatLocalDate = (dateString: string | null): string => {
    if (!dateString) return "-";
    const date = parseLocalDate(dateString);
    return date.toLocaleDateString();
  };

  const isCalibrationPastDue = (dueDate: string | null): boolean => {
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = parseLocalDate(dueDate);
    due.setHours(0, 0, 0, 0);
    return due < today;
  };

  const handleFileUpload = async (
    file: File,
    equipmentId?: string,
  ): Promise<string | null> => {
    try {
      setUploadingFile(true);
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = equipmentId
        ? `${equipmentId}/${fileName}`
        : `temp/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from("equipment-certificates")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        // Check if it's a bucket not found error
        if (
          uploadError.message?.includes("Bucket not found") ||
          uploadError.message?.includes("not found")
        ) {
          throw new Error(
            'Storage bucket "equipment-certificates" not found. Please create it in Supabase Dashboard → Storage.',
          );
        }
        throw uploadError;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage
        .from("equipment-certificates")
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      console.error("Error uploading file:", error);
      const errorMessage = error.message?.includes("Bucket not found")
        ? 'Storage bucket not found. Please create "equipment-certificates" bucket in Supabase Dashboard → Storage.'
        : error.message || "Failed to upload certificate";

      toast({
        title: "Upload Error",
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    } finally {
      setUploadingFile(false);
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    try {
      let certificateUrl: string | null = null;

      // Upload file if one is selected
      if (selectedFile) {
        if (isEditMode && editingEquipmentId) {
          certificateUrl = await handleFileUpload(
            selectedFile,
            editingEquipmentId,
          );
        } else {
          // For new equipment, upload to temp first, then move after insert
          certificateUrl = await handleFileUpload(selectedFile);
        }
        if (!certificateUrl) {
          return; // Error already shown in handleFileUpload
        }
      }

      // Create category if it's new
      if (formData.category && formData.category.trim()) {
        const categoryExists = categories.some(
          (cat) => cat.toLowerCase() === formData.category.trim().toLowerCase(),
        );
        if (!categoryExists) {
          await createCategory(formData.category);
        }
      }

      // Create location if it's new
      if (formData.location && formData.location.trim()) {
        const locationExists = locations.some(
          (loc) => loc.toLowerCase() === formData.location.trim().toLowerCase(),
        );
        if (!locationExists) {
          await createLocation(formData.location);
        }
      }

      // Create any new sub component items
      const validSubComponents = formSubComponents.filter(
        (sc) => sc.item.trim() !== "",
      );
      for (const sc of validSubComponents) {
        const itemExists = subComponentItems.some(
          (existing) => existing.toLowerCase() === sc.item.trim().toLowerCase(),
        );
        if (!itemExists) {
          await createSubComponentItem(sc.item);
        }
      }

      const submitData: any = {
        ...formData,
        calibration_date: formData.calibration_date || null,
        calibration_due_date: formData.calibration_due_date || null,
        assigned_to: formData.assigned_to || null,
        assigned_type: formData.assigned_to
          ? formData.assigned_type || "user"
          : null,
        notes: formData.notes || null,
        tracking_url: formData.tracking_url || null,
        category: formData.category?.trim() || null,
        location: formData.location?.trim() || null,
        sub_components:
          validSubComponents.length > 0 ? validSubComponents : null,
        in_service: formData.in_service !== false,
      };

      // Handle certificate URL - use new upload or keep existing
      let oldCertificateUrl: string | null = null;
      if (isEditMode && editingEquipmentId) {
        // Get current certificate URL before updating
        const { data: currentEquipment } = await supabase
          .schema("neta_ops")
          .from("field_equipment")
          .select("calibration_certificate_url")
          .eq("id", editingEquipmentId)
          .single();
        oldCertificateUrl =
          currentEquipment?.calibration_certificate_url || null;
      }

      if (certificateUrl) {
        submitData.calibration_certificate_url = certificateUrl;
      } else if (isEditMode && editingEquipmentCertificate && !selectedFile) {
        // Keep existing certificate if no new file was uploaded and not removed
        submitData.calibration_certificate_url = editingEquipmentCertificate;
      } else if (isEditMode && !editingEquipmentCertificate) {
        // Clear certificate if it was removed (editingEquipmentCertificate is null)
        submitData.calibration_certificate_url = null;
      }

      if (isEditMode && editingEquipmentId) {
        const { error } = await supabase
          .schema("neta_ops")
          .from("field_equipment")
          .update(submitData)
          .eq("id", editingEquipmentId);

        if (error) throw error;

        // Delete old file from storage if certificate was removed or replaced
        if (
          oldCertificateUrl &&
          oldCertificateUrl !== submitData.calibration_certificate_url
        ) {
          try {
            const urlParts = oldCertificateUrl.split(
              "/equipment-certificates/",
            );
            if (urlParts.length > 1) {
              const filePath = urlParts[1].split("?")[0];
              await supabase.storage
                .from("equipment-certificates")
                .remove([filePath]);
            }
          } catch (storageError) {
            console.error(
              "Error deleting old certificate from storage:",
              storageError,
            );
            // Don't fail the update if storage deletion fails
          }
        }
        toast({
          title: "Success",
          description: "Equipment updated successfully",
          variant: "success",
        });
      } else {
        const { data: newEquipment, error } = await supabase
          .schema("neta_ops")
          .from("field_equipment")
          .insert([{ ...submitData, created_by: user.id }])
          .select()
          .single();

        if (error) throw error;

        // If we uploaded to temp, move the file to the equipment folder
        if (
          certificateUrl &&
          typeof certificateUrl === "string" &&
          certificateUrl.includes("/temp/")
        ) {
          const newPath = `${newEquipment.id}/${selectedFile?.name}`;
          const oldPath = certificateUrl.split("/equipment-certificates/")[1];

          // Copy file to new location
          const { data: fileData } = await supabase.storage
            .from("equipment-certificates")
            .download(oldPath);

          if (fileData) {
            await supabase.storage
              .from("equipment-certificates")
              .upload(newPath, fileData);

            // Update with new URL
            const {
              data: { publicUrl },
            } = supabase.storage
              .from("equipment-certificates")
              .getPublicUrl(newPath);

            await supabase
              .schema("neta_ops")
              .from("field_equipment")
              .update({ calibration_certificate_url: publicUrl })
              .eq("id", newEquipment.id);

            // Delete temp file
            await supabase.storage
              .from("equipment-certificates")
              .remove([oldPath]);
          }
        }

        toast({
          title: "Success",
          description: "Equipment added successfully",
          variant: "success",
        });
      }

      setIsOpen(false);
      setFormData(initialFormData);
      setSelectedFile(null);
      setIsEditMode(false);
      setEditingEquipmentId(null);
      setCategoryInput("");
      setShowCategoryDropdown(false);
      setLocationInput("");
      setShowLocationDropdown(false);
      setFormSubComponents([]);
      setSubComponentsExpanded(false);
      setActiveSubComponentDropdown(null);
      fetchEquipment();
    } catch (error: any) {
      console.error("Error saving equipment:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save equipment",
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
    }
  }

  function handleEdit(equipmentItem: FieldEquipment) {
    setFormData({
      equipment_name: equipmentItem.equipment_name,
      amp_id: equipmentItem.amp_id || "",
      serial_number: equipmentItem.serial_number || "",
      calibration_date: equipmentItem.calibration_date || "",
      calibration_due_date: equipmentItem.calibration_due_date || "",
      category: equipmentItem.category || "",
      location: equipmentItem.location || "",
      assigned_to: equipmentItem.assigned_to,
      assigned_type:
        equipmentItem.assigned_type ??
        (equipmentItem.assigned_to ? "user" : null),
      notes: equipmentItem.notes || "",
      tracking_url: equipmentItem.tracking_url || "",
      in_service: equipmentItem.in_service !== false,
    });
    setCategoryInput(equipmentItem.category || "");
    setLocationInput(equipmentItem.location || "");
    setFormSubComponents(equipmentItem.sub_components || []);
    setSubComponentsExpanded((equipmentItem.sub_components || []).length > 0);
    setSelectedFile(null);
    setEditingEquipmentCertificate(equipmentItem.calibration_certificate_url);
    setIsEditMode(true);
    setEditingEquipmentId(equipmentItem.id);
    setIsOpen(true);
  }

  function handleDelete(equipmentId: string) {
    setEquipmentToDelete(equipmentId);
    setDeleteConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!equipmentToDelete || !user) return;

    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("field_equipment")
        .delete()
        .eq("id", equipmentToDelete);

      if (error) throw error;

      setDeleteConfirmOpen(false);
      setEquipmentToDelete(null);
      fetchEquipment();
      toast({
        title: "Success",
        description: "Equipment deleted successfully",
        variant: "success",
      });
    } catch (error: any) {
      console.error("Error deleting equipment:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete equipment",
        variant: "destructive",
      });
    }
  }

  function handleInputChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  const handleAssign = async (
    equipmentId: string,
    type: AssignedType | null,
    value: string | null,
    displayLabel?: string,
  ) => {
    try {
      const assignedTo = value && value.trim() !== "" ? value : null;
      const assignedType = assignedTo ? type : null;

      const { error } = await supabase
        .schema("neta_ops")
        .from("field_equipment")
        .update({
          assigned_to: assignedTo,
          assigned_type: assignedType,
          updated_at: new Date().toISOString(),
        })
        .eq("id", equipmentId);

      if (error) throw error;

      const label = assignedTo
        ? displayLabel || value || "Assigned"
        : "Unassigned";
      toast({
        title: "Success",
        description: assignedTo
          ? `Equipment assigned to ${label}`
          : "Equipment unassigned",
        variant: "success",
      });

      setOpenUserSelectors((prev) => ({ ...prev, [equipmentId]: false }));
      setUserSearchQueries((prev) => ({ ...prev, [equipmentId]: "" }));
      fetchEquipment();
    } catch (error: any) {
      console.error("Failed to assign equipment:", error);
      toast({
        title: "Error",
        description: "Could not assign equipment",
        variant: "destructive",
      });
    }
  };

  // Backwards-compatible helper for user-only assignment paths.
  const handleAssignUser = (
    equipmentId: string,
    selectedUser: UserData | null,
  ) => {
    return handleAssign(
      equipmentId,
      selectedUser ? "user" : null,
      selectedUser ? selectedUser.id : null,
      selectedUser ? displayUserName(selectedUser) : undefined,
    );
  };

  const handleCheckOut = async (equipmentId: string) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be signed in to check out equipment",
        variant: "destructive",
      });
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .schema("neta_ops")
        .from("field_equipment")
        .update({
          checked_out_by: user.id,
          checked_out_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", equipmentId);

      if (error) throw error;

      toast({
        title: "Checked out",
        description: "Equipment is now checked out to you.",
        variant: "success",
      });
      setOpenActionMenus((prev) => ({ ...prev, [equipmentId]: false }));
      fetchEquipment();
    } catch (err: any) {
      console.error("Failed to check out equipment:", err);
      toast({
        title: "Error",
        description: err.message || "Could not check out equipment",
        variant: "destructive",
      });
    }
  };

  const handleCheckIn = async (equipmentId: string) => {
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .schema("neta_ops")
        .from("field_equipment")
        .update({
          checked_out_by: null,
          checked_out_at: null,
          updated_at: nowIso,
        })
        .eq("id", equipmentId);

      if (error) throw error;

      toast({
        title: "Checked in",
        description: "Equipment has been returned.",
        variant: "success",
      });
      setOpenActionMenus((prev) => ({ ...prev, [equipmentId]: false }));
      fetchEquipment();
    } catch (err: any) {
      console.error("Failed to check in equipment:", err);
      toast({
        title: "Error",
        description: err.message || "Could not check in equipment",
        variant: "destructive",
      });
    }
  };

  const formatDateTime = (iso: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  };

  const formatRelativeTime = (iso: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const diffMs = Date.now() - d.getTime();
    const diffSec = Math.round(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEquipment();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filteredUsers = (equipmentId: string) => {
    const query = (userSearchQueries[equipmentId] || "").toLowerCase();
    return users.filter((u) => {
      const email = u.email?.toLowerCase() || "";
      if (!employeeEmailRegex.test(email)) return false;
      const name = displayUserName(u).toLowerCase();
      return email.includes(query) || name.includes(query);
    });
  };

  const filteredJobSites = (equipmentId: string) => {
    const query = (userSearchQueries[equipmentId] || "").toLowerCase();
    if (!query) return jobSites;
    return jobSites.filter((s) => s.toLowerCase().includes(query));
  };

  const filteredTrucks = (equipmentId: string) => {
    const query = (userSearchQueries[equipmentId] || "").toLowerCase();
    if (!query) return trucks;
    return trucks.filter((t) => t.toLowerCase().includes(query));
  };

  // Handle sort column click
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // If already sorting by this field, toggle direction or clear
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        // Reset sort
        setSortField(null);
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Render sort icon for a column header
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="inline-block ml-1 w-3 h-3 opacity-40" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="inline-block ml-1 w-3 h-3 text-blue-500" />
    ) : (
      <ArrowDown className="inline-block ml-1 w-3 h-3 text-blue-500" />
    );
  };

  // Filter equipment based on active tab and service filter
  const getFilteredEquipment = (): FieldEquipment[] => {
    let filtered = equipment;

    // Apply service filter: in_service only shows equipment where in_service !== false
    if (serviceFilter === "in_service") {
      filtered = filtered.filter((item) => item.in_service !== false);
    }

    switch (activeTab) {
      case "in-cal":
        // Show equipment with calibration dates
        filtered = filtered.filter(
          (item) =>
            item.calibration_date !== null ||
            item.calibration_due_date !== null,
        );
        break;
      case "out-of-cal":
        // Show equipment that is past due (calibration_due_date is in the past)
        filtered = filtered.filter(
          (item) =>
            item.calibration_due_date !== null &&
            isCalibrationPastDue(item.calibration_due_date),
        );
        break;
      case "assigned":
        // Show only assigned equipment
        filtered = filtered.filter((item) => item.assigned_to !== null);
        break;
      case "unassigned":
        // Show only unassigned equipment
        filtered = filtered.filter((item) => item.assigned_to === null);
        break;
      case "category":
        // Show all equipment, will be sorted by category
        break;
      case "all":
      default:
        break;
    }

    // Apply category filter (saved categories)
    if (categoryFilter) {
      if (categoryFilter === "__uncategorized__") {
        filtered = filtered.filter(
          (item) => !item.category || item.category.trim() === "",
        );
      } else {
        filtered = filtered.filter(
          (item) => (item.category || "").trim() === categoryFilter,
        );
      }
    }

    // Sort by category for category tab (default when no user sort is active)
    if (activeTab === "category" && !sortField) {
      filtered = [...filtered].sort((a, b) => {
        const catA = a.category || "Uncategorized";
        const catB = b.category || "Uncategorized";
        if (catA === catB) {
          // If same category, sort by equipment name
          return a.equipment_name.localeCompare(b.equipment_name);
        }
        return catA.localeCompare(catB);
      });
    }

    // Apply user-selected column sort
    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let valA: string = "";
        let valB: string = "";

        switch (sortField) {
          case "equipment_name":
            valA = a.equipment_name || "";
            valB = b.equipment_name || "";
            break;
          case "serial_number":
            valA = a.serial_number || "";
            valB = b.serial_number || "";
            break;
          case "amp_id":
            valA = a.amp_id || "";
            valB = b.amp_id || "";
            break;
          case "calibration_date":
            valA = a.calibration_date || "";
            valB = b.calibration_date || "";
            break;
          case "calibration_due_date":
            valA = a.calibration_due_date || "";
            valB = b.calibration_due_date || "";
            break;
          case "category":
            valA = a.category || "";
            valB = b.category || "";
            break;
          case "location":
            valA = a.location || "";
            valB = b.location || "";
            break;
          case "assigned_to": {
            valA = a.assigned_to ? getAssignedLabel(a) : "";
            valB = b.assigned_to ? getAssignedLabel(b) : "";
            break;
          }
          case "notes":
            valA = a.notes || "";
            valB = b.notes || "";
            break;
        }

        const comparison = valA.localeCompare(valB, undefined, {
          sensitivity: "base",
        });
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return filtered;
  };

  const filteredEquipment = getFilteredEquipment();
  const currentDivision = location.pathname.split("/").filter(Boolean)[0];
  const maintenancePath = currentDivision
    ? `/${currentDivision}/maintenance`
    : "/field-tech/maintenance";

  return (
    <PageLayout title="Field Equipment">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
              Field Equipment
            </h1>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => navigate(maintenancePath)}
                className="group flex items-center gap-2 border border-brand bg-transparent text-brand hover:bg-brand hover:text-white"
                leftIcon={
                  <TriangleAlert className="h-4 w-4 text-brand group-hover:text-white" />
                }
              >
                <span className="text-brand group-hover:text-white">
                  Maintenance
                </span>
              </Button>
              <Button
                onClick={() => {
                  setFormData(initialFormData);
                  setCategoryInput("");
                  setLocationInput("");
                  setFormSubComponents([]);
                  setSubComponentsExpanded(false);
                  setSelectedFile(null);
                  setIsEditMode(false);
                  setEditingEquipmentId(null);
                  setIsOpen(true);
                }}
                className="flex items-center gap-2"
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Add Equipment
              </Button>
            </div>
          </div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            {activeTab === "all" ? (
              <>
                Total Equipment:{" "}
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {totalCount}
                </span>
                {(searchTerm || categoryFilter) &&
                  filteredEquipment.length !== totalCount && (
                    <span className="ml-2 text-neutral-500 dark:text-neutral-500">
                      (Showing {filteredEquipment.length} of {totalCount})
                    </span>
                  )}
              </>
            ) : (
              <>
                {activeTab === "in-cal" && "Equipment with Calibration: "}
                {activeTab === "out-of-cal" && "Out of Calibration: "}
                {activeTab === "assigned" && "Assigned Equipment: "}
                {activeTab === "unassigned" && "Unassigned Equipment: "}
                {activeTab === "category" && "Equipment by Category: "}
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {filteredEquipment.length}
                </span>
                {(searchTerm || categoryFilter) && (
                  <span className="ml-2 text-neutral-500 dark:text-neutral-500">
                    (filtered from {totalCount} total)
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Search Bar and Service Filter */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              type="text"
              placeholder="Search equipment by name, AMP ID, serial number, category, location, or notes..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
              Show:
            </span>
            <select
              value={serviceFilter}
              onChange={(e) =>
                setServiceFilter(e.target.value as ServiceFilter)
              }
              className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="all">All equipment</option>
              <option value="in_service">In service only</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
              Category:
            </span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand min-w-[180px]"
            >
              <option value="">All categories</option>
              <option value="__uncategorized__">Uncategorized</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(tab) => {
            setActiveTab(tab);
            setSortField(null);
            setSortDirection("asc");
          }}
          className="mb-4"
        >
          <TabsList className="inline-flex flex-wrap space-x-1 bg-neutral-100 dark:bg-dark-150 p-1 rounded-none">
            <TabsTrigger
              value="all"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-none transition-colors text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-dark-150 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <FileText className="h-4 w-4" />
              All
            </TabsTrigger>
            <TabsTrigger
              value="in-cal"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-none transition-colors text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-dark-150 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <AlertTriangle className="h-4 w-4" />
              In Cal
            </TabsTrigger>
            <TabsTrigger
              value="out-of-cal"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-none transition-colors text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-dark-150 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <ThumbsUp className="h-4 w-4" />
              Out of Cal
            </TabsTrigger>
            <TabsTrigger
              value="assigned"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-none transition-colors text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-dark-150 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <CheckCircle className="h-4 w-4" />
              Assigned
            </TabsTrigger>
            <TabsTrigger
              value="unassigned"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-none transition-colors text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-dark-150 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <XCircle className="h-4 w-4" />
              Unassigned
            </TabsTrigger>
            <TabsTrigger
              value="category"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-none transition-colors text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-dark-150 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <Tag className="h-4 w-4" />
              Category
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Equipment Table */}
        {loading ? (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <div className="bg-white dark:bg-dark-150 rounded-none border border-neutral-200 dark:border-dark-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 dark:bg-dark-200">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                      onClick={() => handleSort("equipment_name")}
                    >
                      Equipment Name{renderSortIcon("equipment_name")}
                    </th>
                    {(activeTab === "all" || activeTab === "category") && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                        Status
                      </th>
                    )}
                    {activeTab === "all" && (
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                        onClick={() => handleSort("serial_number")}
                      >
                        Serial Number{renderSortIcon("serial_number")}
                      </th>
                    )}
                    {activeTab !== "category" && (
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                        onClick={() => handleSort("amp_id")}
                      >
                        AMP ID{renderSortIcon("amp_id")}
                      </th>
                    )}
                    {activeTab === "all" && allTabShowExtraColumns && (
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                        onClick={() => handleSort("calibration_date")}
                      >
                        In Cal Date{renderSortIcon("calibration_date")}
                      </th>
                    )}
                    {(activeTab === "in-cal" || activeTab === "out-of-cal") && (
                      <>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                          onClick={() => handleSort("calibration_date")}
                        >
                          Calibration Date{renderSortIcon("calibration_date")}
                        </th>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                          onClick={() => handleSort("calibration_due_date")}
                        >
                          Cal Due Date{renderSortIcon("calibration_due_date")}
                        </th>
                      </>
                    )}
                    {activeTab === "category" && (
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                        onClick={() => handleSort("category")}
                      >
                        Category{renderSortIcon("category")}
                      </th>
                    )}
                    {(activeTab === "all" || activeTab === "category") && (
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                        onClick={() => handleSort("location")}
                      >
                        Location{renderSortIcon("location")}
                      </th>
                    )}
                    {activeTab === "all" && allTabShowExtraColumns && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                        Sub Components
                      </th>
                    )}
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                      onClick={() => handleSort("assigned_to")}
                    >
                      Assigned To{renderSortIcon("assigned_to")}
                    </th>
                    {activeTab !== "all" && activeTab !== "category" && (
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                        onClick={() => handleSort("notes")}
                      >
                        Notes{renderSortIcon("notes")}
                      </th>
                    )}
                    {(activeTab === "all" || activeTab === "category") &&
                      (activeTab !== "all" || allTabShowExtraColumns) && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                          Tracking
                        </th>
                      )}
                    {activeTab === "all" && allTabShowExtraColumns && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                        Certificate
                      </th>
                    )}
                    <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-dark-200">
                  {filteredEquipment.length === 0 ? (
                    <tr>
                      <td
                        colSpan={
                          activeTab === "in-cal" || activeTab === "out-of-cal"
                            ? 7
                            : activeTab === "all"
                              ? allTabShowExtraColumns
                                ? 12
                                : 7
                              : activeTab === "category"
                                ? 7
                                : 5
                        }
                        className="px-4 py-8 text-center text-neutral-500 dark:text-neutral-400"
                      >
                        {searchTerm
                          ? "No equipment found matching your search"
                          : activeTab === "in-cal"
                            ? "No equipment with calibration dates"
                            : activeTab === "out-of-cal"
                              ? "No equipment out of calibration"
                              : activeTab === "assigned"
                                ? "No assigned equipment"
                                : activeTab === "unassigned"
                                  ? "No unassigned equipment"
                                  : activeTab === "category"
                                    ? "No equipment available"
                                    : serviceFilter === "in_service"
                                      ? "No in-service equipment found"
                                      : "No equipment available"}
                      </td>
                    </tr>
                  ) : (
                    filteredEquipment.map((item) => {
                      const isPastDue = isCalibrationPastDue(
                        item.calibration_due_date,
                      );
                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-neutral-50 dark:hover:bg-dark-100 cursor-pointer ${
                            isPastDue ? "bg-red-50 dark:bg-red-900/20" : ""
                          }`}
                          onClick={(e) => {
                            // Don't trigger if clicking on buttons or interactive elements
                            const target = e.target as HTMLElement;
                            if (
                              target.closest("button") ||
                              target.closest("a") ||
                              target.closest(".relative") ||
                              target.tagName === "BUTTON" ||
                              target.tagName === "A"
                            ) {
                              return;
                            }
                            setViewingEquipment(item);
                          }}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="text-sm font-medium text-neutral-900 dark:text-white">
                                {item.equipment_name}
                              </span>
                              {isPastDue && (
                                <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-red-500 text-white rounded">
                                  PAST DUE
                                </span>
                              )}
                            </div>
                          </td>
                          {(activeTab === "all" ||
                            activeTab === "category") && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              {item.in_service === false ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 rounded">
                                  <Wrench className="h-3 w-3" />
                                  Out of Service
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 rounded">
                                  <CheckCircle className="h-3 w-3" />
                                  In Service
                                </span>
                              )}
                            </td>
                          )}
                          {activeTab === "all" && (
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
                              {item.serial_number || "-"}
                            </td>
                          )}
                          {activeTab !== "category" && (
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
                              {item.amp_id || "-"}
                            </td>
                          )}
                          {activeTab === "all" && allTabShowExtraColumns && (
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
                              {formatLocalDate(item.calibration_date)}
                            </td>
                          )}
                          {(activeTab === "in-cal" ||
                            activeTab === "out-of-cal") && (
                            <>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
                                {formatLocalDate(item.calibration_date)}
                              </td>
                              <td
                                className={`px-4 py-3 whitespace-nowrap text-sm ${
                                  isPastDue
                                    ? "font-semibold text-red-600 dark:text-red-400"
                                    : "text-neutral-500 dark:text-neutral-400"
                                }`}
                              >
                                {formatLocalDate(item.calibration_due_date)}
                              </td>
                            </>
                          )}
                          {activeTab === "category" && (
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
                              {item.category || "Uncategorized"}
                            </td>
                          )}
                          {(activeTab === "all" ||
                            activeTab === "category") && (
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
                              {item.location || "-"}
                            </td>
                          )}
                          {activeTab === "all" && allTabShowExtraColumns && (
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
                              {item.sub_components &&
                              item.sub_components.length > 0
                                ? `${item.sub_components.length} item${item.sub_components.length > 1 ? "s" : ""}`
                                : "-"}
                            </td>
                          )}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div
                              className="relative"
                              ref={(el) => {
                                userSelectorRefs.current[item.id] = el;
                              }}
                            >
                              <button
                                className="flex items-center gap-2 px-3 py-1 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-none hover:bg-neutral-50 dark:hover:bg-dark-100 text-neutral-700 dark:text-white"
                                onClick={() =>
                                  setOpenUserSelectors((prev) => ({
                                    ...prev,
                                    [item.id]: !prev[item.id],
                                  }))
                                }
                                title={
                                  item.assigned_to
                                    ? `${getAssignedTypeLabel(item.assigned_type)}: ${getAssignedLabel(item)}`
                                    : "Not assigned"
                                }
                              >
                                {item.assigned_type === "job_site" ? (
                                  <Briefcase className="h-4 w-4" />
                                ) : item.assigned_type === "truck" ? (
                                  <TruckIcon className="h-4 w-4" />
                                ) : (
                                  <User className="h-4 w-4" />
                                )}
                                <span>{getAssignedLabel(item)}</span>
                              </button>
                              {item.checked_out_by && (
                                <div
                                  className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 rounded"
                                  title={`Checked out by ${getUserNameById(item.checked_out_by)} on ${formatDateTime(item.checked_out_at)}`}
                                >
                                  <ArrowUp className="h-3 w-3" />
                                  <span>
                                    Checked out ·{" "}
                                    {getUserNameById(item.checked_out_by)} ·{" "}
                                    {formatRelativeTime(item.checked_out_at)}
                                  </span>
                                </div>
                              )}

                              {openUserSelectors[item.id] &&
                                (() => {
                                  const activeAssignTab: AssignedType =
                                    assignTabByEquipment[item.id] ||
                                    (item.assigned_type ?? "user");
                                  const searchValue =
                                    userSearchQueries[item.id] || "";
                                  const setSearchValue = (v: string) =>
                                    setUserSearchQueries((prev) => ({
                                      ...prev,
                                      [item.id]: v,
                                    }));
                                  const setActiveAssignTab = (
                                    t: AssignedType,
                                  ) => {
                                    setAssignTabByEquipment((prev) => ({
                                      ...prev,
                                      [item.id]: t,
                                    }));
                                    setSearchValue("");
                                  };
                                  const placeholderByTab: Record<
                                    AssignedType,
                                    string
                                  > = {
                                    user: "Search users...",
                                    job_site: "Search or create job site...",
                                    truck: "Search or create truck...",
                                  };
                                  const tabButtonClass = (t: AssignedType) =>
                                    `flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                                      activeAssignTab === t
                                        ? "border-brand text-brand"
                                        : "border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                                    }`;
                                  return (
                                    <div className="absolute left-0 top-full mt-2 w-80 bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-lg z-50">
                                      <div className="flex border-b border-neutral-200 dark:border-neutral-700">
                                        <button
                                          type="button"
                                          className={tabButtonClass("user")}
                                          onClick={() =>
                                            setActiveAssignTab("user")
                                          }
                                        >
                                          <User className="h-3.5 w-3.5" /> Users
                                        </button>
                                        <button
                                          type="button"
                                          className={tabButtonClass("job_site")}
                                          onClick={() =>
                                            setActiveAssignTab("job_site")
                                          }
                                        >
                                          <Briefcase className="h-3.5 w-3.5" />{" "}
                                          Job Sites
                                        </button>
                                        <button
                                          type="button"
                                          className={tabButtonClass("truck")}
                                          onClick={() =>
                                            setActiveAssignTab("truck")
                                          }
                                        >
                                          <TruckIcon className="h-3.5 w-3.5" />{" "}
                                          Trucks
                                        </button>
                                      </div>
                                      <div className="p-3">
                                        <Input
                                          type="text"
                                          placeholder={
                                            placeholderByTab[activeAssignTab]
                                          }
                                          value={searchValue}
                                          onChange={(e) =>
                                            setSearchValue(e.target.value)
                                          }
                                          className="w-full"
                                        />
                                      </div>
                                      <div className="max-h-60 overflow-y-auto">
                                        <div
                                          className="px-3 py-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100 border-b border-neutral-100 dark:border-neutral-700"
                                          onClick={() =>
                                            handleAssign(item.id, null, null)
                                          }
                                        >
                                          <div className="flex flex-col">
                                            <span className="font-medium text-neutral-900 dark:text-white">
                                              Unassign
                                            </span>
                                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                              Remove assignment
                                            </span>
                                          </div>
                                        </div>

                                        {activeAssignTab === "user" && (
                                          <>
                                            {filteredUsers(item.id).map((u) => (
                                              <div
                                                key={u.id}
                                                className="px-3 py-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100 border-b border-neutral-100 dark:border-neutral-700 last:border-b-0"
                                                onClick={() =>
                                                  handleAssign(
                                                    item.id,
                                                    "user",
                                                    u.id,
                                                    displayUserName(u),
                                                  )
                                                }
                                              >
                                                <div className="flex flex-col">
                                                  <span className="font-medium text-neutral-900 dark:text-white">
                                                    {displayUserName(u)}
                                                  </span>
                                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                                    {u.email}
                                                  </span>
                                                  {u.user_metadata?.role && (
                                                    <span className="text-xs text-neutral-600 dark:text-neutral-300">
                                                      Role:{" "}
                                                      {u.user_metadata.role}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            ))}
                                            {filteredUsers(item.id).length ===
                                              0 && (
                                              <div className="px-3 py-4 text-center text-neutral-500 dark:text-neutral-400">
                                                No users found
                                              </div>
                                            )}
                                          </>
                                        )}

                                        {activeAssignTab === "job_site" && (
                                          <>
                                            {filteredJobSites(item.id).map(
                                              (site) => (
                                                <div
                                                  key={site}
                                                  className="group flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100 border-b border-neutral-100 dark:border-neutral-700 last:border-b-0"
                                                  onClick={() =>
                                                    handleAssign(
                                                      item.id,
                                                      "job_site",
                                                      site,
                                                      site,
                                                    )
                                                  }
                                                >
                                                  <div className="flex items-center gap-2">
                                                    <Briefcase className="h-4 w-4 text-neutral-400" />
                                                    <span className="font-medium text-neutral-900 dark:text-white">
                                                      {site}
                                                    </span>
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      deleteJobSite(site);
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-opacity"
                                                    title="Remove from saved job sites"
                                                  >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                  </button>
                                                </div>
                                              ),
                                            )}
                                            {searchValue.trim() &&
                                              !jobSites.some(
                                                (s) =>
                                                  s.toLowerCase() ===
                                                  searchValue
                                                    .trim()
                                                    .toLowerCase(),
                                              ) && (
                                                <div
                                                  className="px-3 py-2 cursor-pointer bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border-t border-neutral-200 dark:border-neutral-700"
                                                  onClick={async () => {
                                                    const name =
                                                      searchValue.trim();
                                                    const success =
                                                      await createJobSite(name);
                                                    if (success) {
                                                      await handleAssign(
                                                        item.id,
                                                        "job_site",
                                                        name,
                                                        name,
                                                      );
                                                    } else {
                                                      toast({
                                                        title: "Error",
                                                        description:
                                                          "Failed to create job site",
                                                        variant: "destructive",
                                                      });
                                                    }
                                                  }}
                                                >
                                                  <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                                                    + Create &amp; assign "
                                                    {searchValue.trim()}"
                                                  </span>
                                                </div>
                                              )}
                                            {filteredJobSites(item.id)
                                              .length === 0 &&
                                              !searchValue.trim() && (
                                                <div className="px-3 py-4 text-center text-neutral-500 dark:text-neutral-400 text-sm">
                                                  No saved job sites yet. Type a
                                                  name above to add one.
                                                </div>
                                              )}
                                          </>
                                        )}

                                        {activeAssignTab === "truck" && (
                                          <>
                                            {filteredTrucks(item.id).map(
                                              (truckName) => (
                                                <div
                                                  key={truckName}
                                                  className="group flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100 border-b border-neutral-100 dark:border-neutral-700 last:border-b-0"
                                                  onClick={() =>
                                                    handleAssign(
                                                      item.id,
                                                      "truck",
                                                      truckName,
                                                      truckName,
                                                    )
                                                  }
                                                >
                                                  <div className="flex items-center gap-2">
                                                    <TruckIcon className="h-4 w-4 text-neutral-400" />
                                                    <span className="font-medium text-neutral-900 dark:text-white">
                                                      {truckName}
                                                    </span>
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      deleteTruck(truckName);
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-opacity"
                                                    title="Remove from saved trucks"
                                                  >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                  </button>
                                                </div>
                                              ),
                                            )}
                                            {searchValue.trim() &&
                                              !trucks.some(
                                                (t) =>
                                                  t.toLowerCase() ===
                                                  searchValue
                                                    .trim()
                                                    .toLowerCase(),
                                              ) && (
                                                <div
                                                  className="px-3 py-2 cursor-pointer bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border-t border-neutral-200 dark:border-neutral-700"
                                                  onClick={async () => {
                                                    const name =
                                                      searchValue.trim();
                                                    const success =
                                                      await createTruck(name);
                                                    if (success) {
                                                      await handleAssign(
                                                        item.id,
                                                        "truck",
                                                        name,
                                                        name,
                                                      );
                                                    } else {
                                                      toast({
                                                        title: "Error",
                                                        description:
                                                          "Failed to create truck",
                                                        variant: "destructive",
                                                      });
                                                    }
                                                  }}
                                                >
                                                  <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                                                    + Create &amp; assign "
                                                    {searchValue.trim()}"
                                                  </span>
                                                </div>
                                              )}
                                            {filteredTrucks(item.id).length ===
                                              0 &&
                                              !searchValue.trim() && (
                                                <div className="px-3 py-4 text-center text-neutral-500 dark:text-neutral-400 text-sm">
                                                  No saved trucks yet. Type a
                                                  name above to add one.
                                                </div>
                                              )}
                                          </>
                                        )}
                                      </div>
                                      <div className="p-2 border-t border-neutral-200 dark:border-neutral-700">
                                        <button
                                          className="w-full px-3 py-1 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
                                          onClick={() => {
                                            setOpenUserSelectors((prev) => ({
                                              ...prev,
                                              [item.id]: false,
                                            }));
                                            setUserSearchQueries((prev) => ({
                                              ...prev,
                                              [item.id]: "",
                                            }));
                                          }}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })()}
                            </div>
                          </td>
                          {activeTab !== "all" && activeTab !== "category" && (
                            <td className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
                              <div
                                className="truncate"
                                title={item.notes || ""}
                              >
                                {item.notes || "-"}
                              </div>
                            </td>
                          )}
                          {((activeTab === "all" && allTabShowExtraColumns) ||
                            activeTab === "category") && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              {item.tracking_url ? (
                                <button
                                  onClick={() =>
                                    setViewingTrackingUrl(item.tracking_url)
                                  }
                                  className="flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-none transition-colors"
                                  title="Open Tracking"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  Tracking
                                </button>
                              ) : (
                                <span className="text-neutral-400 dark:text-neutral-500 text-sm">
                                  -
                                </span>
                              )}
                            </td>
                          )}
                          {activeTab === "all" && allTabShowExtraColumns && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              {item.calibration_certificate_url ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() =>
                                      setViewingCertificate(
                                        item.calibration_certificate_url,
                                      )
                                    }
                                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                    title="View Certificate"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      const link = document.createElement("a");
                                      link.href =
                                        item.calibration_certificate_url!;
                                      link.download = `${item.equipment_name}_certificate.pdf`;
                                      link.target = "_blank";
                                      link.click();
                                    }}
                                    className="text-neutral-600 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                                    title="Download Certificate"
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-neutral-400 dark:text-neutral-500 text-sm">
                                  -
                                </span>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                            <div
                              className="relative inline-block"
                              ref={(el) => {
                                actionMenuRefs.current[item.id] = el;
                              }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenActionMenus((prev) => ({
                                    ...prev,
                                    [item.id]: !prev[item.id],
                                  }))
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-dark-100 rounded-none transition-colors"
                                title="Actions"
                              >
                                Actions
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              {openActionMenus[item.id] && (
                                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-lg z-40 py-1">
                                  {item.checked_out_by ? (
                                    <button
                                      type="button"
                                      onClick={() => handleCheckIn(item.id)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-dark-100"
                                    >
                                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                                      Check In
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleCheckOut(item.id)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-dark-100"
                                    >
                                      <ArrowUp className="h-4 w-4 text-brand" />
                                      Check Out
                                    </button>
                                  )}
                                  <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionMenus((prev) => ({
                                        ...prev,
                                        [item.id]: false,
                                      }));
                                      handleEdit(item);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-dark-100"
                                  >
                                    <Pencil className="h-4 w-4 text-brand" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionMenus((prev) => ({
                                        ...prev,
                                        [item.id]: false,
                                      }));
                                      handleDelete(item.id);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog
          open={isOpen}
          onClose={() => setIsOpen(false)}
          className="relative z-50"
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="mx-auto max-w-3xl w-full max-h-[90vh] rounded-none bg-white dark:bg-dark-150 shadow-xl flex flex-col">
              <div className="flex items-center justify-between p-6 pb-4 border-b border-neutral-200 dark:border-dark-200 flex-shrink-0">
                <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-white">
                  {isEditMode ? "Edit Equipment" : "Add Equipment"}
                </Dialog.Title>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={handleSubmit}
                className="flex flex-col flex-1 min-h-0"
                autoComplete="off"
              >
                <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Equipment Name *
                    </label>
                    <Input
                      type="text"
                      name="equipment_name"
                      value={formData.equipment_name}
                      onChange={handleInputChange}
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      AMP ID
                    </label>
                    <Input
                      type="text"
                      name="amp_id"
                      value={formData.amp_id}
                      onChange={handleInputChange}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Serial Number
                    </label>
                    <Input
                      type="text"
                      name="serial_number"
                      value={formData.serial_number}
                      onChange={handleInputChange}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Category
                    </label>
                    <div className="relative" ref={categoryInputRef}>
                      <Input
                        type="text"
                        name="category"
                        value={categoryInput}
                        onChange={(e) => {
                          const value = e.target.value;
                          setCategoryInput(value);
                          setFormData((prev) => ({ ...prev, category: value }));
                          setShowCategoryDropdown(true);
                        }}
                        onFocus={() => setShowCategoryDropdown(true)}
                        onBlur={(e) => {
                          // Delay hiding dropdown to allow clicking on items
                          setTimeout(() => {
                            if (
                              !categoryInputRef.current?.contains(
                                document.activeElement,
                              )
                            ) {
                              setShowCategoryDropdown(false);
                            }
                          }, 200);
                        }}
                        className="w-full"
                        placeholder="Type to search or add new category"
                      />
                      {showCategoryDropdown && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-lg max-h-60 overflow-y-auto">
                          {categories
                            .filter(
                              (cat) =>
                                categoryInput === "" ||
                                cat
                                  .toLowerCase()
                                  .includes(categoryInput.toLowerCase()),
                            )
                            .map((category) => (
                              <div
                                key={category}
                                role="option"
                                className="group flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100 border-b border-neutral-100 dark:border-neutral-700 last:border-b-0"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setCategoryInput(category);
                                  setFormData((prev) => ({
                                    ...prev,
                                    category,
                                  }));
                                  setShowCategoryDropdown(false);
                                }}
                              >
                                <span className="text-sm text-neutral-900 dark:text-white">
                                  {category}
                                </span>
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteCategory(category);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-opacity"
                                  title="Remove from saved categories"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          {categoryInput &&
                            !categories.some(
                              (cat) =>
                                cat.toLowerCase() ===
                                categoryInput.toLowerCase(),
                            ) && (
                              <div
                                role="option"
                                className="px-3 py-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100 border-t border-neutral-200 dark:border-neutral-700 bg-blue-50 dark:bg-blue-900/20"
                                onMouseDown={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const success =
                                    await createCategory(categoryInput);
                                  if (success) {
                                    setFormData((prev) => ({
                                      ...prev,
                                      category: categoryInput.trim(),
                                    }));
                                    setCategoryInput(categoryInput.trim());
                                    setShowCategoryDropdown(false);
                                  } else {
                                    toast({
                                      title: "Error",
                                      description: "Failed to create category",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                              >
                                <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                                  + Create "{categoryInput}"
                                </span>
                              </div>
                            )}
                          {categories.filter(
                            (cat) =>
                              categoryInput === "" ||
                              cat
                                .toLowerCase()
                                .includes(categoryInput.toLowerCase()),
                          ).length === 0 &&
                            !categoryInput && (
                              <div className="px-3 py-4 text-center text-neutral-500 dark:text-neutral-400 text-sm">
                                No categories found. Type to create a new one.
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                      Select an existing category or type to create a new one
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Location
                    </label>
                    <div className="relative" ref={locationInputRef}>
                      <Input
                        type="text"
                        name="location"
                        value={locationInput}
                        onChange={(e) => {
                          const value = e.target.value;
                          setLocationInput(value);
                          setFormData((prev) => ({ ...prev, location: value }));
                          setShowLocationDropdown(true);
                        }}
                        onFocus={() => setShowLocationDropdown(true)}
                        onBlur={(e) => {
                          setTimeout(() => {
                            if (
                              !locationInputRef.current?.contains(
                                document.activeElement,
                              )
                            ) {
                              setShowLocationDropdown(false);
                            }
                          }, 200);
                        }}
                        className="w-full"
                        placeholder="Type to search or add new location"
                      />
                      {showLocationDropdown && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-lg max-h-60 overflow-y-auto">
                          {locations
                            .filter(
                              (loc) =>
                                locationInput === "" ||
                                loc
                                  .toLowerCase()
                                  .includes(locationInput.toLowerCase()),
                            )
                            .map((location) => (
                              <div
                                key={location}
                                role="option"
                                className="group flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100 border-b border-neutral-100 dark:border-neutral-700 last:border-b-0"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setLocationInput(location);
                                  setFormData((prev) => ({
                                    ...prev,
                                    location,
                                  }));
                                  setShowLocationDropdown(false);
                                }}
                              >
                                <span className="text-sm text-neutral-900 dark:text-white">
                                  {location}
                                </span>
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteLocation(location);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-opacity"
                                  title="Remove from saved locations"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          {locationInput &&
                            !locations.some(
                              (loc) =>
                                loc.toLowerCase() ===
                                locationInput.toLowerCase(),
                            ) && (
                              <div
                                role="option"
                                className="px-3 py-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100 border-t border-neutral-200 dark:border-neutral-700 bg-blue-50 dark:bg-blue-900/20"
                                onMouseDown={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const success =
                                    await createLocation(locationInput);
                                  if (success) {
                                    setFormData((prev) => ({
                                      ...prev,
                                      location: locationInput.trim(),
                                    }));
                                    setLocationInput(locationInput.trim());
                                    setShowLocationDropdown(false);
                                  } else {
                                    toast({
                                      title: "Error",
                                      description: "Failed to create location",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                              >
                                <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                                  + Create "{locationInput}"
                                </span>
                              </div>
                            )}
                          {locations.filter(
                            (loc) =>
                              locationInput === "" ||
                              loc
                                .toLowerCase()
                                .includes(locationInput.toLowerCase()),
                          ).length === 0 &&
                            !locationInput && (
                              <div className="px-3 py-4 text-center text-neutral-500 dark:text-neutral-400 text-sm">
                                No locations found. Type to create a new one.
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                      Select an existing location or type to create a new one
                    </p>
                  </div>

                  <div className="py-2">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        In service
                      </label>
                      <Switch
                        checked={formData.in_service}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({
                            ...prev,
                            in_service: checked,
                          }))
                        }
                        checkedClassName="bg-brand"
                      />
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Out-of-service equipment is hidden from test report
                      equipment selection but remains in this list and can be
                      placed back in service.
                    </p>
                  </div>

                  {/* Sub Components Section */}
                  <div className="border border-neutral-200 dark:border-neutral-600 rounded-none">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-dark-100 rounded-none transition-colors"
                      onClick={() =>
                        setSubComponentsExpanded(!subComponentsExpanded)
                      }
                    >
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        <span>
                          Sub Components{" "}
                          {formSubComponents.length > 0 &&
                            `(${formSubComponents.length})`}
                        </span>
                      </div>
                      {subComponentsExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>

                    {subComponentsExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        {formSubComponents.length > 0 && (
                          <div className="space-y-2">
                            {/* Header row - same grid as data rows for alignment */}
                            <div className="grid grid-cols-[60px_2fr_1.5fr_10rem_7rem_32px] gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                              <span>Qty</span>
                              <span>Item</span>
                              <span>SN</span>
                              <span>Cal Date</span>
                              <span>AMP ID</span>
                              <span></span>
                            </div>
                            {formSubComponents.map((sc, index) => (
                              <div
                                key={index}
                                className="grid grid-cols-[60px_2fr_1.5fr_10rem_7rem_32px] gap-2 items-start"
                              >
                                <Input
                                  type="number"
                                  min="1"
                                  value={sc.qty}
                                  onChange={(e) => {
                                    const updated = [...formSubComponents];
                                    updated[index] = {
                                      ...updated[index],
                                      qty: parseInt(e.target.value) || 1,
                                    };
                                    setFormSubComponents(updated);
                                  }}
                                  className="w-full text-sm"
                                />
                                <div
                                  className="relative"
                                  ref={(el) => {
                                    subComponentItemRefs.current[index] = el;
                                  }}
                                >
                                  <Input
                                    type="text"
                                    value={sc.item}
                                    onChange={(e) => {
                                      const updated = [...formSubComponents];
                                      updated[index] = {
                                        ...updated[index],
                                        item: e.target.value,
                                      };
                                      setFormSubComponents(updated);
                                      setActiveSubComponentDropdown(index);
                                    }}
                                    onFocus={() =>
                                      setActiveSubComponentDropdown(index)
                                    }
                                    onBlur={() => {
                                      setTimeout(() => {
                                        if (
                                          !subComponentItemRefs.current[
                                            index
                                          ]?.contains(document.activeElement)
                                        ) {
                                          setActiveSubComponentDropdown(null);
                                        }
                                      }, 200);
                                    }}
                                    placeholder="Item name"
                                    className="w-full text-sm"
                                  />
                                  {activeSubComponentDropdown === index && (
                                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-lg max-h-40 overflow-y-auto">
                                      {subComponentItems
                                        .filter(
                                          (item) =>
                                            sc.item === "" ||
                                            item
                                              .toLowerCase()
                                              .includes(sc.item.toLowerCase()),
                                        )
                                        .map((item) => (
                                          <div
                                            key={item}
                                            className="group flex items-center justify-between gap-2 px-3 py-1.5 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100 border-b border-neutral-100 dark:border-neutral-700 last:border-b-0"
                                            onClick={() => {
                                              const updated = [
                                                ...formSubComponents,
                                              ];
                                              updated[index] = {
                                                ...updated[index],
                                                item,
                                              };
                                              setFormSubComponents(updated);
                                              setActiveSubComponentDropdown(
                                                null,
                                              );
                                            }}
                                          >
                                            <span className="text-sm text-neutral-900 dark:text-white">
                                              {item}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                deleteSubComponentItem(item);
                                              }}
                                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-opacity"
                                              title="Remove from saved items"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        ))}
                                      {sc.item &&
                                        !subComponentItems.some(
                                          (item) =>
                                            item.toLowerCase() ===
                                            sc.item.toLowerCase(),
                                        ) && (
                                          <div
                                            className="px-3 py-1.5 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100 border-t border-neutral-200 dark:border-neutral-700 bg-blue-50 dark:bg-blue-900/20"
                                            onClick={async () => {
                                              const success =
                                                await createSubComponentItem(
                                                  sc.item,
                                                );
                                              if (success) {
                                                setActiveSubComponentDropdown(
                                                  null,
                                                );
                                              }
                                            }}
                                          >
                                            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                              + Save "{sc.item}"
                                            </span>
                                          </div>
                                        )}
                                      {subComponentItems.filter(
                                        (item) =>
                                          sc.item === "" ||
                                          item
                                            .toLowerCase()
                                            .includes(sc.item.toLowerCase()),
                                      ).length === 0 &&
                                        !sc.item && (
                                          <div className="px-3 py-2 text-center text-neutral-500 dark:text-neutral-400 text-xs">
                                            No saved items. Type to add.
                                          </div>
                                        )}
                                    </div>
                                  )}
                                </div>
                                <Input
                                  type="text"
                                  value={sc.serial_number}
                                  onChange={(e) => {
                                    const updated = [...formSubComponents];
                                    updated[index] = {
                                      ...updated[index],
                                      serial_number: e.target.value,
                                    };
                                    setFormSubComponents(updated);
                                  }}
                                  placeholder="Serial number"
                                  className="w-full text-sm"
                                />
                                <Input
                                  type="date"
                                  value={sc.cal_date}
                                  onChange={(e) => {
                                    const updated = [...formSubComponents];
                                    updated[index] = {
                                      ...updated[index],
                                      cal_date: e.target.value,
                                    };
                                    setFormSubComponents(updated);
                                  }}
                                  placeholder="Cal date"
                                  className="w-full text-sm min-w-0"
                                />
                                <Input
                                  type="text"
                                  value={sc.amp_id}
                                  onChange={(e) => {
                                    const updated = [...formSubComponents];
                                    updated[index] = {
                                      ...updated[index],
                                      amp_id: e.target.value,
                                    };
                                    setFormSubComponents(updated);
                                  }}
                                  placeholder="AMP ID"
                                  className="w-full text-sm min-w-0"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormSubComponents(
                                      formSubComponents.filter(
                                        (_, i) => i !== index,
                                      ),
                                    );
                                  }}
                                  className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 mt-1"
                                  title="Remove"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setFormSubComponents([
                              ...formSubComponents,
                              { ...emptySubComponent },
                            ]);
                          }}
                          className="flex items-center gap-1 text-sm text-brand hover:text-brand-dark font-medium"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Sub Component
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        Calibration Date
                      </label>
                      <Input
                        type="date"
                        name="calibration_date"
                        value={formData.calibration_date}
                        onChange={handleInputChange}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        Calibration Due Date
                      </label>
                      <Input
                        type="date"
                        name="calibration_due_date"
                        value={formData.calibration_due_date}
                        onChange={handleInputChange}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Notes
                    </label>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          notes: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-100 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand"
                      rows={3}
                      placeholder="Additional notes or comments..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Tracking URL
                    </label>
                    <Input
                      type="url"
                      name="tracking_url"
                      value={formData.tracking_url}
                      onChange={handleInputChange}
                      className="w-full"
                      placeholder="https://example.com/tracking"
                    />
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                      Enter a URL to link to equipment tracking
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Calibration Certificate (PDF)
                    </label>
                    <div className="space-y-2">
                      {isEditMode &&
                        editingEquipmentCertificate &&
                        !selectedFile && (
                          <div className="flex items-center gap-2 p-2 bg-neutral-50 dark:bg-dark-200 rounded-none">
                            <FileText className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                            <span className="text-sm text-neutral-600 dark:text-neutral-400 flex-1">
                              Current certificate attached
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setViewingCertificate(
                                  editingEquipmentCertificate,
                                )
                              }
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                              title="View Certificate"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (
                                  window.confirm(
                                    "Are you sure you want to remove this certificate? The file will be deleted from storage.",
                                  )
                                ) {
                                  // Delete file from storage
                                  if (editingEquipmentCertificate) {
                                    try {
                                      // Extract file path from URL
                                      const urlParts =
                                        editingEquipmentCertificate.split(
                                          "/equipment-certificates/",
                                        );
                                      if (urlParts.length > 1) {
                                        const filePath =
                                          urlParts[1].split("?")[0]; // Remove query params
                                        await supabase.storage
                                          .from("equipment-certificates")
                                          .remove([filePath]);
                                      }
                                    } catch (error) {
                                      console.error(
                                        "Error deleting file from storage:",
                                        error,
                                      );
                                      // Continue anyway - we'll still remove the reference
                                    }
                                  }
                                  setEditingEquipmentCertificate(null);
                                }
                              }}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm"
                              title="Remove Certificate"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-100 text-neutral-700 dark:text-neutral-300 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-50">
                          <Upload className="h-4 w-4" />
                          {selectedFile
                            ? selectedFile.name
                            : isEditMode && editingEquipmentCertificate
                              ? "Replace PDF file"
                              : "Choose PDF file"}
                          <input
                            type="file"
                            accept=".pdf,application/pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.type !== "application/pdf") {
                                  toast({
                                    title: "Invalid File",
                                    description: "Please upload a PDF file",
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                setSelectedFile(file);
                                setEditingEquipmentCertificate(null); // Clear existing when new file selected
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                        {selectedFile && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFile(null);
                              // Restore existing certificate if in edit mode
                              if (isEditMode && editingEquipmentId) {
                                const currentEquipment = equipment.find(
                                  (e) => e.id === editingEquipmentId,
                                );
                                setEditingEquipmentCertificate(
                                  currentEquipment?.calibration_certificate_url ||
                                    null,
                                );
                              }
                            }}
                            className="text-red-600 hover:text-red-800"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {uploadingFile && (
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                          Uploading...
                        </p>
                      )}
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {isEditMode &&
                        editingEquipmentCertificate &&
                        !selectedFile
                          ? "Upload a new file to replace the existing certificate"
                          : "Upload a PDF calibration certificate for this equipment"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between p-6 pt-4 border-t border-neutral-200 dark:border-dark-200 flex-shrink-0">
                  <div>
                    {isEditMode && editingEquipmentId && (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => {
                          setIsOpen(false);
                          handleDelete(editingEquipmentId);
                        }}
                        className="flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsOpen(false);
                        setFormData(initialFormData);
                        setCategoryInput("");
                        setLocationInput("");
                        setFormSubComponents([]);
                        setSubComponentsExpanded(false);
                        setSelectedFile(null);
                        setShowCategoryDropdown(false);
                        setShowLocationDropdown(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">
                      {isEditMode ? "Update" : "Add"} Equipment
                    </Button>
                  </div>
                </div>
              </form>
            </Dialog.Panel>
          </div>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={deleteConfirmOpen}
          onClose={() => setDeleteConfirmOpen(false)}
          className="relative z-50"
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="mx-auto max-w-md rounded-none bg-white dark:bg-dark-150 p-6 shadow-xl">
              <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">
                Confirm Delete
              </Dialog.Title>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
                Are you sure you want to delete this equipment? This action
                cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmOpen(false)}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmDelete}>
                  Delete
                </Button>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>

        {/* Equipment Details Viewer Dialog */}
        <Dialog
          open={!!viewingEquipment}
          onClose={() => setViewingEquipment(null)}
          className="relative z-50"
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="mx-auto max-w-2xl w-full max-h-[90vh] rounded-none bg-white dark:bg-dark-150 shadow-xl flex flex-col">
              <div className="flex items-center justify-between p-6 pb-4 border-b border-neutral-200 dark:border-dark-200 flex-shrink-0">
                <Dialog.Title className="text-xl font-semibold text-neutral-900 dark:text-white">
                  Equipment Details
                </Dialog.Title>
                <button
                  onClick={() => setViewingEquipment(null)}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {viewingEquipment && (
                  <div className="space-y-6">
                    {/* Equipment Name */}
                    <div>
                      <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                        Equipment Name
                      </label>
                      <p className="text-base font-semibold text-neutral-900 dark:text-white">
                        {viewingEquipment.equipment_name}
                        {isCalibrationPastDue(
                          viewingEquipment.calibration_due_date,
                        ) && (
                          <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-red-500 text-white rounded">
                            PAST DUE
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Grid Layout for Details */}
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                          AMP ID
                        </label>
                        <p className="text-base text-neutral-900 dark:text-white">
                          {viewingEquipment.amp_id || "-"}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                          Serial Number
                        </label>
                        <p className="text-base text-neutral-900 dark:text-white">
                          {viewingEquipment.serial_number || "-"}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                          Category
                        </label>
                        <p className="text-base text-neutral-900 dark:text-white">
                          {viewingEquipment.category || "-"}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                          Location
                        </label>
                        <p className="text-base text-neutral-900 dark:text-white">
                          {viewingEquipment.location || "-"}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                          Status
                        </label>
                        <p className="text-base">
                          {viewingEquipment.in_service === false ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 rounded">
                              <Wrench className="h-3.5 w-3.5" />
                              Out of Service
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 rounded">
                              <CheckCircle className="h-3.5 w-3.5" />
                              In Service
                            </span>
                          )}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                          Assigned To
                        </label>
                        <p className="text-base text-neutral-900 dark:text-white flex items-center gap-2">
                          {viewingEquipment.assigned_to ? (
                            <>
                              {viewingEquipment.assigned_type === "job_site" ? (
                                <Briefcase className="h-4 w-4 text-neutral-400" />
                              ) : viewingEquipment.assigned_type === "truck" ? (
                                <TruckIcon className="h-4 w-4 text-neutral-400" />
                              ) : (
                                <User className="h-4 w-4 text-neutral-400" />
                              )}
                              <span>{getAssignedLabel(viewingEquipment)}</span>
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                (
                                {getAssignedTypeLabel(
                                  viewingEquipment.assigned_type,
                                )}
                                )
                              </span>
                            </>
                          ) : (
                            "Not assigned"
                          )}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                          Checked Out
                        </label>
                        {viewingEquipment.checked_out_by ? (
                          <div className="space-y-2">
                            <p className="text-base text-neutral-900 dark:text-white flex items-center gap-2">
                              <ArrowUp className="h-4 w-4 text-amber-500" />
                              <span>
                                {getUserNameById(
                                  viewingEquipment.checked_out_by,
                                )}
                              </span>
                              {viewingEquipment.checked_out_at && (
                                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                  ·{" "}
                                  {formatDateTime(
                                    viewingEquipment.checked_out_at,
                                  )}{" "}
                                  (
                                  {formatRelativeTime(
                                    viewingEquipment.checked_out_at,
                                  )}
                                  )
                                </span>
                              )}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                handleCheckIn(viewingEquipment.id);
                                setViewingEquipment(null);
                              }}
                              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-200 dark:hover:bg-green-900/50 rounded-none transition-colors"
                            >
                              <CheckCircle className="h-4 w-4" />
                              Check In
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-base text-neutral-500 dark:text-neutral-400">
                              Not checked out
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                handleCheckOut(viewingEquipment.id);
                                setViewingEquipment(null);
                              }}
                              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-brand/10 text-brand hover:bg-brand/20 dark:bg-brand/20 dark:hover:bg-brand/30 rounded-none transition-colors"
                            >
                              <ArrowUp className="h-4 w-4" />
                              Check Out
                            </button>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                          Calibration Date
                        </label>
                        <p className="text-base text-neutral-900 dark:text-white">
                          {formatLocalDate(viewingEquipment.calibration_date)}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                          Calibration Due Date
                        </label>
                        <p
                          className={`text-base ${
                            isCalibrationPastDue(
                              viewingEquipment.calibration_due_date,
                            )
                              ? "font-semibold text-red-600 dark:text-red-400"
                              : "text-neutral-900 dark:text-white"
                          }`}
                        >
                          {formatLocalDate(
                            viewingEquipment.calibration_due_date,
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Sub Components - always show section; data from sub_components column, items from equipment_sub_component_items */}
                    {(() => {
                      const subList = normalizeSubComponents(
                        viewingEquipment.sub_components,
                      );
                      return (
                        <div>
                          <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                            Sub Components
                          </label>
                          {subList.length === 0 ? (
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">
                              No sub components
                            </p>
                          ) : (
                            <div className="border border-neutral-200 dark:border-dark-200 rounded-none overflow-hidden">
                              <table className="w-full">
                                <thead className="bg-neutral-50 dark:bg-dark-200">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                                      QTY
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                                      Item
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                                      SN
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                                      Cal Date
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                                      AMP ID
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-200 dark:divide-dark-200">
                                  {subList.map((sc, index) => (
                                    <tr key={index}>
                                      <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white">
                                        {sc.qty}
                                      </td>
                                      <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white">
                                        {sc.item}
                                      </td>
                                      <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white">
                                        {sc.serial_number || "-"}
                                      </td>
                                      <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white">
                                        {sc.cal_date || "-"}
                                      </td>
                                      <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white">
                                        {sc.amp_id || "-"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Notes */}
                    {viewingEquipment.notes && (
                      <div>
                        <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                          Notes
                        </label>
                        <p className="text-base text-neutral-900 dark:text-white whitespace-pre-wrap">
                          {viewingEquipment.notes}
                        </p>
                      </div>
                    )}

                    {/* Tracking URL */}
                    {viewingEquipment.tracking_url && (
                      <div>
                        <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                          Tracking
                        </label>
                        <div className="flex items-center gap-2">
                          <a
                            href={viewingEquipment.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            <ExternalLink className="h-4 w-4" />
                            <span className="text-sm break-all">
                              {viewingEquipment.tracking_url}
                            </span>
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Calibration Certificate */}
                    {viewingEquipment.calibration_certificate_url && (
                      <div>
                        <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                          Calibration Certificate
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setViewingCertificate(
                                viewingEquipment.calibration_certificate_url,
                              )
                            }
                            className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-none transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                            View Certificate
                          </button>
                          <button
                            onClick={() => {
                              const link = document.createElement("a");
                              link.href =
                                viewingEquipment.calibration_certificate_url!;
                              link.download = `${viewingEquipment.equipment_name}_certificate.pdf`;
                              link.target = "_blank";
                              link.click();
                            }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-600 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-none transition-colors"
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Timestamps */}
                    <div className="pt-4 border-t border-neutral-200 dark:border-dark-200">
                      <div className="grid grid-cols-2 gap-6 text-xs text-neutral-500 dark:text-neutral-400">
                        <div>
                          <span className="font-medium">Created:</span>{" "}
                          {new Date(
                            viewingEquipment.created_at,
                          ).toLocaleString()}
                        </div>
                        <div>
                          <span className="font-medium">Last Updated:</span>{" "}
                          {new Date(
                            viewingEquipment.updated_at,
                          ).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end p-6 pt-4 border-t border-neutral-200 dark:border-dark-200 flex-shrink-0">
                <div className="flex gap-2">
                  {viewingEquipment && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setViewingEquipment(null);
                        handleEdit(viewingEquipment);
                      }}
                      className="flex items-center gap-2"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit Equipment
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => setViewingEquipment(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>

        {/* Tracking URL Viewer Dialog */}
        <Dialog
          open={!!viewingTrackingUrl}
          onClose={() => setViewingTrackingUrl(null)}
          className="relative z-50"
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="mx-auto max-w-4xl w-full max-h-[90vh] rounded-none bg-white dark:bg-dark-150 shadow-xl flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-dark-200 flex-shrink-0">
                <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-white">
                  Equipment Tracking
                </Dialog.Title>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (viewingTrackingUrl) {
                        window.open(viewingTrackingUrl, "_blank");
                      }
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Open in New Tab
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewingTrackingUrl(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden p-4 bg-neutral-100 dark:bg-dark-200">
                {viewingTrackingUrl && (
                  <iframe
                    src={viewingTrackingUrl}
                    className="w-full h-full border border-neutral-300 dark:border-neutral-600 rounded shadow-lg bg-white"
                    title="Equipment Tracking"
                    style={{ minHeight: "600px" }}
                  />
                )}
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>

        {/* PDF Certificate Viewer Dialog */}
        <Dialog
          open={!!viewingCertificate}
          onClose={() => {
            setViewingCertificate(null);
            setPdfZoom(100);
            setIsFullscreen(false);
          }}
          className="relative z-50"
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <div
            className={`fixed inset-0 flex items-center justify-center ${isFullscreen ? "p-0" : "p-4"}`}
          >
            <Dialog.Panel
              className={`${isFullscreen ? "w-full h-full rounded-none" : "mx-auto max-w-[95vw] w-full max-h-[95vh] rounded-none bg-white dark:bg-dark-150 shadow-xl flex flex-col"}`}
            >
              <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-dark-200 flex-shrink-0">
                <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-white">
                  Calibration Certificate
                </Dialog.Title>
                <div className="flex items-center gap-2">
                  {/* Zoom Controls */}
                  <div className="flex items-center gap-1 border border-neutral-300 dark:border-neutral-600 rounded-none">
                    <button
                      onClick={() =>
                        setPdfZoom((prev) => Math.max(50, prev - 25))
                      }
                      className="p-1.5 hover:bg-neutral-100 dark:hover:bg-dark-100 text-neutral-700 dark:text-neutral-300"
                      title="Zoom Out"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    <span className="px-2 text-sm text-neutral-700 dark:text-neutral-300 min-w-[3rem] text-center">
                      {pdfZoom}%
                    </span>
                    <button
                      onClick={() =>
                        setPdfZoom((prev) => Math.min(200, prev + 25))
                      }
                      className="p-1.5 hover:bg-neutral-100 dark:hover:bg-dark-100 text-neutral-700 dark:text-neutral-300"
                      title="Zoom In"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setPdfZoom(100)}
                      className="px-2 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-dark-100 text-neutral-700 dark:text-neutral-300 border-l border-neutral-300 dark:border-neutral-600"
                      title="Reset Zoom"
                    >
                      Reset
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (viewingCertificate) {
                        window.open(viewingCertificate, "_blank");
                      }
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Open in New Tab
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (viewingCertificate) {
                        const link = document.createElement("a");
                        link.href = viewingCertificate;
                        link.download = "calibration_certificate.pdf";
                        link.click();
                      }
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setViewingCertificate(null);
                      setPdfZoom(100);
                      setIsFullscreen(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 bg-neutral-100 dark:bg-dark-200">
                {viewingCertificate && (
                  <div className="flex justify-center items-start min-h-full">
                    <iframe
                      src={`${viewingCertificate}#zoom=${pdfZoom}`}
                      className="border border-neutral-300 dark:border-neutral-600 rounded shadow-lg bg-white"
                      title="Calibration Certificate"
                      style={{
                        width: `${pdfZoom}%`,
                        height: `${(pdfZoom / 100) * 800}px`,
                        minHeight: "600px",
                        maxWidth: "100%",
                      }}
                    />
                  </div>
                )}
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>
      </div>
    </PageLayout>
  );
}
