import React, { useState, useEffect, useRef } from "react";
import Card, { CardContent } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/Dialog";
import {
  Users,
  Search,
  Mail,
  Briefcase,
  MapPin,
  Phone,
  Loader2,
  ChevronRight,
  CircleCheck,
  CircleX,
  IdCard,
  Upload,
  Download,
} from "lucide-react";
import {
  buildImportRows,
  EXAMPLE_EMPLOYEE_ID_CSV,
  ImportFormatError,
  IMPORT_STATUS_LABELS,
  type ImportProfile,
  type ImportRow,
} from "@/lib/employeeIdImport";
import { useAuth } from "../../../lib/AuthContext";
import { isSuperUser } from "@/lib/roles";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "../../../components/ui/toast";
import { supabase } from "../../../lib/supabase";
import { ProfileView } from "../../../components/profile/ProfileView";
import { employeeEmailRegex } from "@/lib/companyConfig";

interface EmployeeProfile {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
  bio?: string;
  division?: string;
  birthday?: string;
  avatar_url?: string;
  cover_image?: string;
  phone?: string;
  location?: string;
  job_title?: string;
  department?: string;
  employee_number?: string;
  hire_date?: string;
  employment_status?: string;
  profile_set_up?: boolean; // Flag to indicate if profile is set up
  hidden?: boolean; // Flag to indicate if profile is hidden
  [key: string]: any;
}

type StatusFilter = "all" | "active" | "inactive";
type SortOption =
  | "name_asc"
  | "name_desc"
  | "department_asc"
  | "job_title_asc"
  | "employee_number_asc";

export const EmployeeProfiles: React.FC = () => {
  const { user } = useAuth();
  const { getUserRole } = usePermissions();
  const isHrFullAccess =
    getUserRole() === "Admin" || getUserRole() === "Super Admin";

  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [sortOption, setSortOption] = useState<SortOption>("name_asc");
  const [selectedProfile, setSelectedProfile] =
    useState<EmployeeProfile | null>(null);
  const [isProfileViewOpen, setIsProfileViewOpen] = useState(false);

  // Employee ID assignment (HR admins only)
  const [idEditTarget, setIdEditTarget] = useState<EmployeeProfile | null>(null);
  const [idEditValue, setIdEditValue] = useState("");
  const [idEditSaving, setIdEditSaving] = useState(false);

  // Bulk employee ID import (HR admins only)
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importError, setImportError] = useState("");
  const [importApplying, setImportApplying] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchProfiles();
  }, [currentPage]);

  // Fetch profiles when search/filter/sort changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (currentPage === 1) {
        fetchProfiles();
      } else {
        setCurrentPage(1); // This will trigger fetchProfiles via the other useEffect
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, statusFilter, sortOption]);

  const fetchProfiles = async () => {
    try {
      setLoading(true);

      const searchTerm = searchQuery?.trim() || "";

      // Get ALL users from admin_get_users (not just profiles table)
      // This includes users who haven't set up profiles yet
      console.log("Fetching all users from admin_get_users...");
      let allUsers: any[] = [];
      let usersError: any = null;

      const { data: usersData, error: usersErr } = await supabase
        .schema("common")
        .rpc("admin_get_users");

      if (usersErr) {
        // Fallback without schema
        const fallback = await supabase.rpc("admin_get_users");
        if (fallback.error) {
          usersError = usersErr;
        } else {
          allUsers = fallback.data || [];
        }
      } else {
        allUsers = usersData || [];
      }

      // Get profiles data to merge
      const { data: profilesData } = await supabase
        .schema("common")
        .from("profiles")
        .select("*");

      // Create a map of profile data by user ID
      const profilesMap: Record<string, any> = {};
      if (profilesData) {
        profilesData.forEach((profile) => {
          profilesMap[profile.id] = profile;
        });
      }

      // If admin_get_users failed (non-Admin user), build profiles from the profiles table directly
      if (usersError || !allUsers || allUsers.length === 0) {
        console.warn(
          "admin_get_users unavailable, falling back to profiles table",
        );
        if (profilesData && profilesData.length > 0) {
          allUsers = profilesData.map((p: any) => ({
            id: p.id,
            email: p.email || "",
            raw_user_meta_data: p.user_metadata || {},
            user_metadata: p.user_metadata || {},
          }));
        } else {
          setProfiles([]);
          setTotalCount(0);
          return;
        }
      }

      // Combine users with their profile data
      // Filter to only show users with company-domain emails
      let combinedProfiles = allUsers
        .filter((u: any) => {
          const email = u.email || "";
          return employeeEmailRegex.test(email.toLowerCase());
        })
        .map((u: any) => {
          const profile = profilesMap[u.id];
          const name =
            u.raw_user_meta_data?.name ||
            u.user_metadata?.name ||
            u.email?.split("@")[0] ||
            "Unknown";
          const email = u.email || "";

          return {
            id: u.id,
            email: email,
            full_name: profile?.full_name || name,
            role:
              profile?.role ||
              u.raw_user_meta_data?.role ||
              u.user_metadata?.role ||
              "",
            bio:
              profile?.bio ||
              u.raw_user_meta_data?.bio ||
              u.user_metadata?.bio ||
              "",
            division:
              profile?.division ||
              u.raw_user_meta_data?.division ||
              u.user_metadata?.division ||
              "",
            birthday:
              profile?.birthday ||
              u.raw_user_meta_data?.birthday ||
              u.user_metadata?.birthday ||
              "",
            avatar_url:
              profile?.avatar_url ||
              profile?.profile_image ||
              u.raw_user_meta_data?.profileImage ||
              u.user_metadata?.profileImage ||
              u.raw_user_meta_data?.avatar_url ||
              u.user_metadata?.avatar_url ||
              "",
            cover_image:
              profile?.cover_image ||
              u.raw_user_meta_data?.coverImage ||
              u.user_metadata?.coverImage ||
              "",
            department: profile?.department || "",
            job_title: profile?.job_title || "",
            employee_number: profile?.employee_number || "",
            phone:
              profile?.phone ||
              u.raw_user_meta_data?.phone ||
              u.user_metadata?.phone ||
              "",
            employment_status: profile?.employment_status || "active",
            profile_set_up: !!(
              profile &&
              (profile.bio ||
                profile.division ||
                profile.role ||
                profile.avatar_url ||
                profile.cover_image ||
                profile.birthday)
            ),
            hidden:
              profile?.hidden ||
              u.raw_user_meta_data?.profileHidden ||
              u.user_metadata?.profileHidden ||
              false,
          };
        });

      // For users missing avatar, fetch from get_user_metadata (where Edit Profile saves profileImage)
      const missingAvatar = combinedProfiles.filter(
        (p: EmployeeProfile) => !p.avatar_url,
      );
      if (missingAvatar.length > 0) {
        const metadataResults = await Promise.all(
          missingAvatar.map((p: EmployeeProfile) =>
            supabase
              .schema("common")
              .rpc("get_user_metadata", { p_user_id: p.id }),
          ),
        );
        const avatarByUserId: Record<string, string> = {};
        metadataResults.forEach((res: any, i: number) => {
          const meta = res?.data;
          const userId = missingAvatar[i]?.id;
          if (userId && meta) {
            const img =
              meta.profile_image || meta.profileImage || meta.avatar_url;
            if (img && typeof img === "string") avatarByUserId[userId] = img;
          }
        });
        combinedProfiles = combinedProfiles.map((p: EmployeeProfile) =>
          !p.avatar_url && avatarByUserId[p.id]
            ? { ...p, avatar_url: avatarByUserId[p.id] }
            : p,
        ) as typeof combinedProfiles;
      }

      // Filter out hidden profiles unless superuser (see SUPERUSER_EMAILS in roles.ts)
      if (!isSuperUser(user?.email)) {
        combinedProfiles = combinedProfiles.filter(
          (profile) => !profile.hidden,
        );
      }

      if (statusFilter !== "all") {
        combinedProfiles = combinedProfiles.filter((profile) => {
          const status = (profile.employment_status || "active").toLowerCase();
          const isActive = status === "active";
          return statusFilter === "active" ? isActive : !isActive;
        });
      }

      // Apply search filter if needed
      if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        combinedProfiles = combinedProfiles.filter(
          (profile) =>
            (profile.full_name || "").toLowerCase().includes(lowerSearch) ||
            profile.email.toLowerCase().includes(lowerSearch) ||
            (profile.role || "").toLowerCase().includes(lowerSearch) ||
            (profile.department || "").toLowerCase().includes(lowerSearch) ||
            (profile.job_title || "").toLowerCase().includes(lowerSearch) ||
            (profile.employee_number || "").toLowerCase().includes(lowerSearch),
        );
      }

      // Sort before pagination
      combinedProfiles.sort((a, b) => {
        const nameA = (a.full_name || a.email || "").toLowerCase();
        const nameB = (b.full_name || b.email || "").toLowerCase();
        const departmentA = (a.department || "").toLowerCase();
        const departmentB = (b.department || "").toLowerCase();
        const jobTitleA = (a.job_title || a.role || "").toLowerCase();
        const jobTitleB = (b.job_title || b.role || "").toLowerCase();

        if (sortOption === "name_desc") {
          return nameB.localeCompare(nameA);
        }

        if (sortOption === "department_asc") {
          return (
            departmentA.localeCompare(departmentB) || nameA.localeCompare(nameB)
          );
        }

        if (sortOption === "job_title_asc") {
          return (
            jobTitleA.localeCompare(jobTitleB) || nameA.localeCompare(nameB)
          );
        }

        if (sortOption === "employee_number_asc") {
          // Plain string compare is correct here: IDs are zero-padded to a fixed
          // width, so "0034" < "1001" sorts the same as the numbers would.
          // Anyone without an ID yet goes to the bottom.
          const numA = a.employee_number || "";
          const numB = b.employee_number || "";
          if (!numA && !numB) return nameA.localeCompare(nameB);
          if (!numA) return 1;
          if (!numB) return -1;
          return numA.localeCompare(numB) || nameA.localeCompare(nameB);
        }

        return nameA.localeCompare(nameB);
      });

      // Set total count
      setTotalCount(combinedProfiles.length);

      // Apply pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize;
      const paginatedProfiles = combinedProfiles.slice(from, to);

      console.log(
        `Showing ${paginatedProfiles.length} of ${combinedProfiles.length} total users (page ${currentPage})`,
      );

      setProfiles(paginatedProfiles);
    } catch (error: any) {
      console.error("Error fetching profiles:", error);
      toast({
        title: "Error",
        description: `Failed to load employee profiles: ${error.message || "Unknown error"}. Check RLS policies if only seeing 10 profiles.`,
        variant: "destructive",
      });
      setProfiles([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  // Search is now done server-side, so we use profiles directly
  const displayProfiles = profiles;

  const handleViewProfile = (profile: EmployeeProfile) => {
    setSelectedProfile(profile);
    setIsProfileViewOpen(true);
  };

  const downloadExampleCsv = () => {
    const blob = new Blob([EXAMPLE_EMPLOYEE_ID_CSV], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "employee-ids-example.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFileChosen = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    // Reset the input so re-picking the same file still fires onChange.
    e.target.value = "";
    if (!file) return;

    setImportFileName(file.name);
    setImportError("");
    setImportRows([]);

    try {
      const text = await file.text();

      // Match against every profile, not just the current page.
      const { data, error } = await supabase
        .schema("common")
        .from("profiles")
        .select("id, full_name, email, employee_number");

      if (error) throw error;

      setImportRows(buildImportRows(text, (data || []) as ImportProfile[]));
    } catch (err: any) {
      console.error("Error reading employee ID CSV:", err);
      setImportError(
        err instanceof ImportFormatError
          ? err.message
          : err?.message || "Could not read that file.",
      );
    }
  };

  const handleApplyImport = async () => {
    const ready = importRows.filter((r) => r.status === "ready");
    if (ready.length === 0) return;

    setImportApplying(true);
    let applied = 0;
    const failures: string[] = [];

    try {
      for (const row of ready) {
        const { error } = await supabase
          .schema("common")
          .from("profiles")
          .update({ employee_number: row.employeeNumber })
          .eq("id", row.profileId);

        if (error) {
          failures.push(`${row.employeeNumber}: ${error.message}`);
        } else {
          applied++;
        }
      }

      await fetchProfiles();

      if (failures.length > 0) {
        console.error("Employee ID import failures:", failures);
        toast({
          title: `Assigned ${applied}, ${failures.length} failed`,
          description: failures.slice(0, 3).join(" / "),
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: `Assigned ${applied} employee ${applied === 1 ? "ID" : "IDs"}.`,
        });
        setImportOpen(false);
        setImportRows([]);
        setImportFileName("");
      }
    } catch (error: any) {
      console.error("Error applying employee ID import:", error);
      toast({
        title: "Error",
        description: error?.message || "Could not apply the import.",
        variant: "destructive",
      });
    } finally {
      setImportApplying(false);
    }
  };

  const openIdEditor = (profile: EmployeeProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    setIdEditTarget(profile);
    setIdEditValue(profile.employee_number || "");
  };

  const handleSaveEmployeeNumber = async () => {
    if (!idEditTarget) return;

    // Empty clears the ID. Store null rather than "" so the unique index
    // (which only covers non-null values) keeps ignoring unassigned profiles.
    const nextValue = idEditValue.trim() || null;

    if (nextValue === (idEditTarget.employee_number || null)) {
      setIdEditTarget(null);
      return;
    }

    setIdEditSaving(true);
    try {
      const { error } = await supabase
        .schema("common")
        .from("profiles")
        .upsert(
          {
            id: idEditTarget.id,
            employee_number: nextValue,
            full_name:
              idEditTarget.full_name ||
              idEditTarget.email?.split("@")[0] ||
              "",
            email: idEditTarget.email || "",
          },
          { onConflict: "id", ignoreDuplicates: false },
        );

      if (error) throw error;

      await fetchProfiles();
      setIdEditTarget(null);
      toast({
        title: "Success",
        description: nextValue
          ? `Employee ID ${nextValue} assigned to ${idEditTarget.full_name || idEditTarget.email}.`
          : `Employee ID cleared for ${idEditTarget.full_name || idEditTarget.email}.`,
      });
    } catch (error: any) {
      console.error("Error saving employee ID:", error);
      // 23505 = unique violation, i.e. another employee already has this ID.
      const isDuplicate =
        error?.code === "23505" ||
        (error?.message || "").includes("profiles_employee_number_key");
      toast({
        title: "Error",
        description: isDuplicate
          ? `Employee ID "${nextValue}" is already assigned to someone else.`
          : error?.message || "Could not save employee ID.",
        variant: "destructive",
      });
    } finally {
      setIdEditSaving(false);
    }
  };

  const handleToggleEmploymentStatus = async (
    profile: EmployeeProfile,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();

    if (!isHrFullAccess) {
      toast({
        title: "Access Denied",
        description: "Only HR admins can change employee status.",
        variant: "destructive",
      });
      return;
    }


    const currentStatus = (profile.employment_status || "active").toLowerCase();
    const nextStatus = currentStatus === "active" ? "inactive" : "active";

    try {
      const { error } = await supabase
        .schema("common")
        .from("profiles")
        .upsert(
          {
            id: profile.id,
            employment_status: nextStatus,
            hidden: false,
            full_name: profile.full_name || profile.email?.split("@")[0] || "",
            email: profile.email || "",
          },
          {
            onConflict: "id",
            ignoreDuplicates: false,
          },
        );

      if (error) {
        throw error;
      }

      await fetchProfiles();

      toast({
        title: "Success",
        description: `${profile.full_name || profile.email} marked ${nextStatus}.`,
      });
    } catch (error: any) {
      console.error("Error updating employee status:", error);
      toast({
        title: "Error",
        description: `Failed to update employee status: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Employee Profiles</h1>
        </div>
        {isHrFullAccess && (
          <Button
            variant="outline"
            leftIcon={<Upload className="h-4 w-4" />}
            onClick={() => {
              setImportRows([]);
              setImportError("");
              setImportFileName("");
              setImportOpen(true);
            }}
          >
            Import employee IDs
          </Button>
        )}
      </div>

      {/* Search and filters */}
      <Card className="w-full max-w-2xl border-none">
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by employee ID, name, email, role, or department..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  // Trigger fetch when search changes (useEffect will handle it)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    fetchProfiles();
                  }
                }}
                className="pl-9"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as StatusFilter);
                  setCurrentPage(1);
                }}
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                  { value: "all", label: "All" },
                ]}
                className="mb-0"
              />
              <Select
                label="Sort"
                value={sortOption}
                onChange={(e) => {
                  setSortOption(e.target.value as SortOption);
                  setCurrentPage(1);
                }}
                options={[
                  { value: "name_asc", label: "Name A-Z" },
                  { value: "name_desc", label: "Name Z-A" },
                  { value: "department_asc", label: "Department A-Z" },
                  { value: "job_title_asc", label: "Job title A-Z" },
                  { value: "employee_number_asc", label: "Employee ID" },
                ]}
                className="mb-0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profiles Grid */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : displayProfiles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-16 w-16 mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No profiles found</h3>
            <p className="text-muted-foreground text-center">
              {searchQuery
                ? "Try adjusting your search query"
                : "No employee profiles available"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <CardContent className="!p-0">
              <div className="divide-y divide-border">
                {displayProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="hover:bg-muted/50 transition-colors cursor-pointer group"
                    onClick={() => handleViewProfile(profile)}
                  >
                    <div className="flex items-center gap-4 px-4 sm:px-6 py-3 sm:py-4 flex-wrap sm:flex-nowrap">
                      {/* Profile Picture */}
                      <div className="flex-shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-none overflow-hidden bg-muted">
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={profile.full_name || profile.email}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
                            <span className="text-base sm:text-lg font-semibold text-white">
                              {(profile.full_name || profile.email || "?")
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Name, Title, Email, Phone */}
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {profile.employee_number && (
                            <span className="inline-flex items-center rounded-none bg-neutral-100 dark:bg-dark-200 px-2 py-0.5 font-mono text-xs font-medium text-neutral-700 dark:text-neutral-200 shrink-0">
                              {profile.employee_number}
                            </span>
                          )}
                          <h3 className="font-semibold text-base group-hover:text-primary transition-colors truncate">
                            {profile.full_name || profile.email}
                          </h3>
                          {!profile.profile_set_up && (
                            <span className="inline-flex items-center rounded-none bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200 shrink-0">
                              Profile not set up
                            </span>
                          )}
                          {(
                            profile.employment_status || "active"
                          ).toLowerCase() !== "active" && (
                            <span className="inline-flex items-center rounded-none bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-200 shrink-0">
                              Inactive
                            </span>
                          )}
                          {isHrFullAccess && (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 border-none p-0 opacity-0 group-hover:opacity-100 transition-opacity [&>span]:flex [&>span]:items-center [&>span]:justify-center !text-neutral-500 hover:!bg-neutral-500/10 hover:!text-neutral-700 dark:hover:!text-neutral-200"
                              onClick={(e) => openIdEditor(profile, e)}
                              title={
                                profile.employee_number
                                  ? "Change employee ID"
                                  : "Assign employee ID"
                              }
                            >
                              <IdCard className="h-4 w-4" />
                            </Button>
                          )}
                          {isHrFullAccess && (
                            <Button
                              variant="outline"
                              size="icon"
                              className={`h-7 w-7 border-none p-0 opacity-0 group-hover:opacity-100 transition-opacity [&>span]:flex [&>span]:items-center [&>span]:justify-center ${
                                (
                                  profile.employment_status || "active"
                                ).toLowerCase() === "active"
                                  ? "!text-red-600 hover:!bg-red-500/10 hover:!text-red-700"
                                  : "!text-green-600/70 hover:!bg-green-500/10 hover:!text-green-700"
                              }`}
                              onClick={(e) =>
                                handleToggleEmploymentStatus(profile, e)
                              }
                              title={
                                (
                                  profile.employment_status || "active"
                                ).toLowerCase() === "active"
                                  ? "Mark inactive"
                                  : "Mark active"
                              }
                            >
                              {(
                                profile.employment_status || "active"
                              ).toLowerCase() === "active" ? (
                                <CircleX className="h-4 w-4" />
                              ) : (
                                <CircleCheck className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                        {(profile.job_title || profile.role) && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                            <Briefcase className="h-3.5 w-3.5 flex-shrink-0" />
                            {profile.job_title || profile.role}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                          {profile.email && (
                            <span className="flex items-center gap-1.5 truncate">
                              <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">{profile.email}</span>
                            </span>
                          )}
                          {profile.phone && (
                            <span className="flex items-center gap-1.5 truncate">
                              <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">{profile.phone}</span>
                            </span>
                          )}
                          {profile.department && (
                            <span className="flex items-center gap-1.5 truncate">
                              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">
                                {profile.department}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end sm:justify-start">
                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * pageSize + 1} to{" "}
                    {Math.min(currentPage * pageSize, totalCount)} of{" "}
                    {totalCount} employee{totalCount !== 1 ? "s" : ""}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1 || loading}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={
                                currentPage === pageNum ? "primary" : "outline"
                              }
                              size="sm"
                              onClick={() => handlePageChange(pageNum)}
                              disabled={loading}
                            >
                              {pageNum}
                            </Button>
                          );
                        },
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages || loading}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Profile View Modal */}
      {selectedProfile && (
        <ProfileView
          isOpen={isProfileViewOpen}
          onClose={() => {
            setIsProfileViewOpen(false);
            setSelectedProfile(null);
          }}
          userId={selectedProfile.id}
        />
      )}

      {/* Bulk import employee IDs from CSV (HR admins only) */}
      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          if (!open && !importApplying) setImportOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import employee IDs</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={importFileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleImportFileChosen}
              />
              <Button
                variant="outline"
                leftIcon={<Upload className="h-4 w-4" />}
                onClick={() => importFileInputRef.current?.click()}
                disabled={importApplying}
              >
                Choose CSV
              </Button>
              <Button
                variant="outline"
                leftIcon={<Download className="h-4 w-4" />}
                onClick={downloadExampleCsv}
              >
                Download example
              </Button>
              {importFileName && (
                <span className="text-sm text-muted-foreground truncate">
                  {importFileName}
                </span>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Header row required. Needs an <code>employee_id</code> column plus
              either <code>email</code> or <code>first_name</code> and{" "}
              <code>last_name</code>. Email is matched first and is the reliable
              one, so use it wherever two people could share a name. Nothing is
              written until you press Assign.
            </p>

            {importError && (
              <div className="rounded-none border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-200">
                {importError}
              </div>
            )}

            {importRows.length > 0 &&
              (() => {
                const readyCount = importRows.filter(
                  (r) => r.status === "ready",
                ).length;
                const skipCount = importRows.length - readyCount;

                return (
                  <>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span className="font-medium text-green-700 dark:text-green-400">
                        {readyCount} ready
                      </span>
                      <span className="text-muted-foreground">
                        {skipCount} will be skipped
                      </span>
                    </div>

                    <div className="max-h-72 overflow-auto border border-neutral-200 dark:border-dark-300">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-neutral-50 dark:bg-dark-200">
                          <tr className="text-left">
                            <th className="px-3 py-2 font-medium">Line</th>
                            <th className="px-3 py-2 font-medium">ID</th>
                            <th className="px-3 py-2 font-medium">Employee</th>
                            <th className="px-3 py-2 font-medium">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.map((row) => (
                            <tr
                              key={row.lineNumber}
                              className="border-t border-neutral-200 dark:border-dark-300"
                            >
                              <td className="px-3 py-2 text-muted-foreground">
                                {row.lineNumber}
                              </td>
                              <td className="px-3 py-2 font-mono">
                                {row.employeeNumber || "—"}
                              </td>
                              <td className="px-3 py-2">
                                {row.profileName || row.identifier}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={
                                    row.status === "ready"
                                      ? "text-green-700 dark:text-green-400"
                                      : row.status === "unchanged"
                                        ? "text-muted-foreground"
                                        : "text-amber-700 dark:text-amber-400"
                                  }
                                >
                                  {IMPORT_STATUS_LABELS[row.status]}
                                </span>
                                <span className="text-muted-foreground">
                                  {" "}
                                  {row.detail}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportOpen(false)}
              disabled={importApplying}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApplyImport}
              disabled={
                importApplying ||
                importRows.filter((r) => r.status === "ready").length === 0
              }
            >
              {importApplying
                ? "Assigning..."
                : `Assign ${importRows.filter((r) => r.status === "ready").length} IDs`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign / change employee ID (HR admins only) */}
      <Dialog
        open={!!idEditTarget}
        onOpenChange={(open) => {
          if (!open && !idEditSaving) setIdEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {idEditTarget?.employee_number
                ? "Change employee ID"
                : "Assign employee ID"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              {idEditTarget?.full_name || idEditTarget?.email}
            </p>
            <Input
              autoFocus
              value={idEditValue}
              onChange={(e) => setIdEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !idEditSaving) {
                  handleSaveEmployeeNumber();
                }
              }}
              placeholder="e.g. 1001, 0034, S0002"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Letters and leading zeros are kept exactly as typed. Must be
              unique. Leave blank to remove the ID.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIdEditTarget(null)}
              disabled={idEditSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEmployeeNumber} disabled={idEditSaving}>
              {idEditSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
