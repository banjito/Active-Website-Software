import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Role, ROLES, isSuperUser, getRoleBadgeClasses } from "@/lib/roles";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "../ui/Button";
import { Switch } from "@/components/ui/Switch";
import {
  Edit,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  KeyRound,
  Camera,
  Ban,
  UserCheck,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface UserData {
  id: string;
  email: string;
  created_at: string;
  is_active: boolean;
  user_metadata: {
    name?: string;
    role?: Role | string; // Allow string for initial load, map to Role
    profileImage?: string;
    [key: string]: any; // Allow other metadata properties
  };
}

export default function AdminUserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoadingUserId, setPasswordLoadingUserId] = useState<
    string | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [updateSuccessUserId, setUpdateSuccessUserId] = useState<string | null>(
    null,
  );
  const [updateErrorUserId, setUpdateErrorUserId] = useState<string | null>(
    null,
  );
  const [passwordSuccessUserId, setPasswordSuccessUserId] = useState<
    string | null
  >(null);
  const [passwordErrorUserId, setPasswordErrorUserId] = useState<string | null>(
    null,
  );

  const canChangePasswords = isSuperUser(currentUser?.email);
  // Admin and up may change other users' profile images. The server RPC
  // (admin_update_user_metadata) enforces this independently.
  const currentRole = currentUser?.user_metadata?.role as string | undefined;
  const canEditProfileImages =
    ["Admin", "Super Admin"].includes(currentRole ?? "") ||
    isSuperUser(currentUser?.email);

  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const avatarTargetUserIdRef = useRef<string | null>(null);
  const [avatarUploadingUserId, setAvatarUploadingUserId] = useState<
    string | null
  >(null);
  const [activeLoadingUserId, setActiveLoadingUserId] = useState<string | null>(
    null,
  );
  const [confirmDeactivateUserId, setConfirmDeactivateUserId] = useState<
    string | null
  >(null);
  const [showDeactivated, setShowDeactivated] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      setLoading(true);
      setError(null);

      console.log("[fetchUsers] Fetching users via RPC...");

      // Call the admin_get_users RPC function from common schema
      const { data: adminData, error: adminError } = await supabase
        .schema("common")
        .rpc("admin_get_users");

      if (adminError) {
        console.error(
          "[fetchUsers] Error fetching users from RPC:",
          adminError,
        );

        // Provide helpful error message based on the error
        if (
          adminError.message.includes("Access denied") ||
          adminError.message.includes("Admin role required")
        ) {
          setError(
            "Access denied: Admin role required. Please ensure your user account has Admin role in user metadata.",
          );
        } else if (
          adminError.message.includes(
            "function common.admin_get_users() does not exist",
          )
        ) {
          setError(
            "Admin functions not found. Please run the admin function creation SQL in your Supabase SQL editor.",
          );
        } else {
          setError(`Failed to load users: ${adminError.message}`);
        }
        return;
      }

      if (adminData) {
        console.log("[fetchUsers] RPC call succeeded.");
        const mappedUsers: UserData[] = adminData.map((user: any) => ({
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          is_active: user.is_active !== false, // default active if missing
          user_metadata: user.raw_user_meta_data || {},
        }));
        console.log(
          "[fetchUsers] Mapped data sample (first user):",
          JSON.stringify(mappedUsers[0], null, 2),
        );
        setUsers(mappedUsers);
      } else {
        console.log("[fetchUsers] No data returned from RPC.");
        setUsers([]);
      }
    } catch (err) {
      const error = err as Error;
      console.error("Error fetching users:", err);
      setError(`Failed to load users: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function updateUserRole(userId: string, role: Role) {
    console.log(
      `[updateUserRole] Attempting to update user ${userId} to role ${role}`,
    );
    try {
      setError(null);
      setUpdateSuccessUserId(null);
      setUpdateErrorUserId(null);

      // Call the admin_update_user_role RPC function from common schema
      const { error } = await supabase
        .schema("common")
        .rpc("admin_update_user_role", {
          user_id: userId,
          new_role: role,
        });

      if (error) {
        console.error("[updateUserRole] Error response from RPC:", error);

        // Provide helpful error message based on the error
        if (
          error.message.includes("Access denied") ||
          error.message.includes("Admin role required")
        ) {
          setError("Access denied: Admin role required to update user roles.");
        } else if (
          error.message.includes(
            "function common.admin_update_user_role() does not exist",
          )
        ) {
          setError(
            "Admin functions not found. Please run the admin function creation SQL in your Supabase SQL editor.",
          );
        } else {
          setError(`Failed to update role for ${userId}: ${error.message}`);
        }
        setUpdateErrorUserId(userId);
        return;
      }

      console.log("[updateUserRole] RPC call succeeded.");

      // Update local state optimistically ONLY if RPC succeeds
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId
            ? { ...user, user_metadata: { ...user.user_metadata, role } }
            : user,
        ),
      );

      setEditingUser(null);
      setSelectedRole(null);

      // Set success feedback for this user
      setUpdateSuccessUserId(userId);
      setTimeout(() => setUpdateSuccessUserId(null), 3000); // Clear after 3 seconds
    } catch (err: any) {
      // Catch specific error
      console.error("Error updating user role:", err);
      // Set specific error feedback for this user
      setUpdateErrorUserId(userId);
      setError(
        `Failed to update role for ${userId}: ${err.message || "Unknown error"}`,
      );
    }
  }

  const handleStartEdit = (
    userId: string,
    currentRole: string | Role | undefined,
  ) => {
    setEditingUser(userId);
    setPasswordUserId(null);
    setNewPassword("");
    setConfirmPassword("");
    // Ensure we set a valid Role type or null
    const validRole = Object.keys(ROLES).includes(currentRole as string)
      ? (currentRole as Role)
      : null;
    setSelectedRole(validRole);
    setUpdateErrorUserId(null); // Clear specific error when starting edit
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setSelectedRole(null);
    setUpdateErrorUserId(null); // Clear specific error on cancel
  };

  const handleStartPasswordEdit = (userId: string) => {
    setEditingUser(null);
    setSelectedRole(null);
    setPasswordUserId(userId);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordErrorUserId(null);
    setPasswordSuccessUserId(null);
    setError(null);
  };

  const handleCancelPasswordEdit = () => {
    setPasswordUserId(null);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordErrorUserId(null);
  };

  const handleChangePassword = async (userId: string) => {
    setError(null);
    setPasswordSuccessUserId(null);
    setPasswordErrorUserId(null);

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      setPasswordErrorUserId(userId);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      setPasswordErrorUserId(userId);
      return;
    }

    try {
      setPasswordLoadingUserId(userId);

      const { error } = await supabase.functions.invoke(
        "admin-update-user-password",
        {
          body: {
            userId,
            newPassword,
          },
        },
      );

      if (error) {
        throw error;
      }

      setPasswordUserId(null);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccessUserId(userId);
      setTimeout(() => setPasswordSuccessUserId(null), 3000);
    } catch (err) {
      let message =
        err instanceof Error ? err.message : "Could not change password";

      if (
        err &&
        typeof err === "object" &&
        "context" in err &&
        err.context instanceof Response
      ) {
        try {
          const payload = await err.context.json();
          if (payload?.error) {
            message = payload.error;
          }
        } catch {
          // Keep the fallback message above.
        }
      }

      if (message.toLowerCase().includes("access denied")) {
        setError("Only super admins can change passwords.");
      } else {
        setError(message);
      }
      setPasswordErrorUserId(userId);
    } finally {
      setPasswordLoadingUserId(null);
    }
  };

  const handleSaveRole = (userId: string) => {
    if (selectedRole) {
      updateUserRole(userId, selectedRole);
    } else {
      setError(`Cannot save: No role selected for user ${userId}`);
      setUpdateErrorUserId(userId);
    }
  };

  async function handleSetActive(userId: string, active: boolean) {
    // Deactivation is confirmed via the inline popover, not window.confirm.
    setConfirmDeactivateUserId(null);

    setError(null);
    setUpdateErrorUserId(null);
    setUpdateSuccessUserId(null);
    setActiveLoadingUserId(userId);

    try {
      const { error } = await supabase
        .schema("common")
        .rpc("admin_set_user_active", {
          target_user_id: userId,
          active,
        });

      if (error) {
        if (error.message.toLowerCase().includes("access denied")) {
          setError("Access denied: Admin role required to deactivate users.");
        } else if (error.message.toLowerCase().includes("your own account")) {
          setError("You cannot deactivate your own account.");
        } else if (
          error.message.includes("function common.admin_set_user_active")
        ) {
          setError(
            "Deactivation function not found. Please run database/migrations/add_user_deactivation.sql in your Supabase SQL editor.",
          );
        } else {
          setError(`Failed to update user: ${error.message}`);
        }
        setUpdateErrorUserId(userId);
        return;
      }

      // Reflect new status locally without a full refetch.
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_active: active } : u)),
      );
      setUpdateSuccessUserId(userId);
      setTimeout(() => setUpdateSuccessUserId(null), 3000);
    } catch (err: any) {
      console.error("Error updating user active state:", err);
      setUpdateErrorUserId(userId);
      setError(`Failed to update user: ${err.message || "Unknown error"}`);
    } finally {
      setActiveLoadingUserId(null);
    }
  }

  const handleStartAvatarChange = (userId: string) => {
    avatarTargetUserIdRef.current = userId;
    if (avatarFileInputRef.current) {
      avatarFileInputRef.current.value = ""; // allow re-selecting the same file
      avatarFileInputRef.current.click();
    }
  };

  const handleAvatarFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    const userId = avatarTargetUserIdRef.current;
    if (!file || !userId) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      setUpdateErrorUserId(userId);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB.");
      setUpdateErrorUserId(userId);
      return;
    }

    setError(null);
    setUpdateErrorUserId(null);
    setUpdateSuccessUserId(null);
    setAvatarUploadingUserId(userId);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error("Could not get session for upload.");
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL is not defined");

      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}_${Date.now()}.${fileExt}`;
      const storagePath = `user-uploads/profile-images/${fileName}`;

      const response = await fetch(
        `${supabaseUrl}/storage/v1/object/${storagePath}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": file.type,
            "x-upsert": "true",
          },
          body: file,
        },
      );
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Upload failed (${response.status}): ${body}`);
      }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${storagePath}`;

      // Update auth metadata (server enforces Admin/HR/superuser, strips role)
      const { error: rpcError } = await supabase
        .schema("common")
        .rpc("admin_update_user_metadata", {
          target_user_id: userId,
          new_metadata: { profileImage: publicUrl },
        });
      if (rpcError) {
        if (rpcError.message.toLowerCase().includes("access denied")) {
          throw new Error(
            "Only admins can change other users' profile images.",
          );
        }
        throw new Error(rpcError.message);
      }

      // Mirror to common.profiles so others see the new avatar.
      await supabase
        .schema("common")
        .from("profiles")
        .upsert(
          { id: userId, avatar_url: publicUrl, profile_image: publicUrl },
          { onConflict: "id" },
        );

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                user_metadata: {
                  ...u.user_metadata,
                  profileImage: publicUrl,
                },
              }
            : u,
        ),
      );

      setUpdateSuccessUserId(userId);
      setTimeout(() => setUpdateSuccessUserId(null), 3000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not change profile image";
      setError(message);
      setUpdateErrorUserId(userId);
    } finally {
      setAvatarUploadingUserId(null);
      avatarTargetUserIdRef.current = null;
    }
  };

  // First name for sorting: first token of the display name, else the email.
  const firstNameKey = (user: UserData) =>
    (user.user_metadata?.name?.trim().split(/\s+/)[0] || user.email || "")
      .toLowerCase();

  const filteredUsers = users
    .filter((user) => showDeactivated || user.is_active)
    .filter((user) => {
      const searchLower = searchQuery.toLowerCase();
      const email = user.email?.toLowerCase() || "";
      const name = user.user_metadata?.name?.toLowerCase() || "";
      const role = (user.user_metadata?.role as string)?.toLowerCase() || ""; // Treat role as string for search

      return (
        email.includes(searchLower) ||
        name.includes(searchLower) ||
        role.includes(searchLower)
      );
    })
    .sort((a, b) => firstNameKey(a).localeCompare(firstNameKey(b)));

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {canEditProfileImages && (
        <input
          ref={avatarFileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarFileSelected}
          className="hidden"
        />
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
            User Management
          </h2>
          <p className="text-neutral-600 dark:text-white mt-1">
            Manage user accounts and assign roles.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Switch
              checked={showDeactivated}
              onCheckedChange={setShowDeactivated}
              checkedClassName="bg-[#f26722]"
            />
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200 whitespace-nowrap">
              Show Deactivated Users
            </span>
          </label>
          <Button
            onClick={fetchUsers}
            disabled={loading}
            variant="outline"
            className="border-none flex items-center gap-2"
            leftIcon={
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            }
          >
            Refresh
          </Button>
          {/* Placeholder for Invite User functionality */}
          {/* <Button className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Invite User
          </Button> */}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search users by name, email, or role..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-dark-700 dark:border-dark-600 dark:text-white"
        />
      </div>

      {/* Users List (no overflow-hidden so the deactivate confirm popover
          can extend above the top row) */}
      <div className="border border-neutral-200 dark:border-dark-300 rounded-lg shadow-sm">
        <div className="bg-neutral-50 dark:bg-dark-150 px-6 py-3 border-b border-neutral-200 dark:border-dark-300 rounded-t-lg flex items-center justify-between">
          <h3 className="text-base font-medium text-neutral-700 dark:text-neutral-200">
            All Users ({filteredUsers.length})
          </h3>
        </div>

        {loading ? (
          <div className="bg-white dark:bg-dark-150 p-6 text-center text-neutral-500 dark:text-white">
            <LoadingSpinner size="md" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-white dark:bg-dark-150 p-6 text-center text-neutral-500 dark:text-white">
            {searchQuery
              ? "No users found matching your search."
              : "No users found."}
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-dark-300">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="px-6 py-4 flex flex-col gap-4 bg-white dark:bg-dark-150 hover:bg-neutral-50/50 dark:hover:bg-dark-50/50 transition-colors duration-150"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center mb-4 sm:mb-0 flex-grow min-w-0 mr-4">
                    {/* Profile Image/Initial */}
                    <div
                      className={`relative h-10 w-10 rounded-full bg-neutral-200 dark:bg-dark-300 flex items-center justify-center overflow-hidden flex-shrink-0 group ${
                        canEditProfileImages ? "cursor-pointer" : ""
                      }`}
                      onClick={
                        canEditProfileImages &&
                        avatarUploadingUserId !== user.id
                          ? () => handleStartAvatarChange(user.id)
                          : undefined
                      }
                      title={
                        canEditProfileImages
                          ? "Change profile photo"
                          : undefined
                      }
                    >
                      {user.user_metadata?.profileImage ? (
                        <img
                          src={user.user_metadata.profileImage}
                          alt={user.user_metadata?.name || "User"}
                          className="h-10 w-10 object-cover"
                        />
                      ) : (
                        <span className="text-sm font-medium text-neutral-600 dark:text-white">
                          {user.user_metadata?.name?.[0]?.toUpperCase() ||
                            user.email?.[0]?.toUpperCase() ||
                            "?"}
                        </span>
                      )}
                      {canEditProfileImages &&
                        avatarUploadingUserId !== user.id && (
                          <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="h-4 w-4 text-white" />
                          </div>
                        )}
                      {avatarUploadingUserId === user.id && (
                        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                          <RefreshCw className="h-4 w-4 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                    {/* Name, Email, Status Icons */}
                    <div className="ml-3 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 dark:text-white truncate flex items-center">
                        <span className="truncate">
                          {user.user_metadata?.name || "Unnamed User"}
                        </span>
                        {/* Success Indicator */}
                        {updateSuccessUserId === user.id && (
                          <CheckCircle className="inline-block h-4 w-4 ml-2 text-green-500 flex-shrink-0" />
                        )}
                        {passwordSuccessUserId === user.id && (
                          <CheckCircle className="inline-block h-4 w-4 ml-2 text-green-500 flex-shrink-0" />
                        )}
                        {/* Error Indicator */}
                        {(updateErrorUserId === user.id ||
                          passwordErrorUserId === user.id) && (
                          <AlertCircle className="inline-block h-4 w-4 ml-2 text-red-500 flex-shrink-0" />
                        )}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-white truncate flex items-center gap-2">
                        <span className="truncate">{user.email}</span>
                        {!user.is_active && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 flex-shrink-0">
                            Inactive
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Role Display/Edit */}
                  {editingUser === user.id ? (
                    <div className="flex items-center gap-2 flex-shrink-0 mt-2 sm:mt-0">
                      <select
                        value={selectedRole || ""} // Ensure value is controlled
                        onChange={(e) =>
                          setSelectedRole(e.target.value as Role)
                        }
                        className="block w-full pl-3 pr-10 py-1.5 text-sm border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 dark:bg-dark-700 dark:border-dark-600 dark:text-white"
                      >
                        <option value="" disabled>
                          Select a role
                        </option>
                        {Object.keys(ROLES).map((roleKey) => (
                          <option key={roleKey} value={roleKey}>
                            {roleKey}{" "}
                            {/* Display the key (e.g., 'Admin', 'NETA Technician') */}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={() => handleSaveRole(user.id)}
                        disabled={!selectedRole}
                        className="px-2 bg-green-500 hover:bg-green-600 text-white disabled:opacity-50"
                        aria-label="Save Role"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancelEdit}
                        className="px-2 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-dark-50"
                        aria-label="Cancel Edit"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-shrink-0 mt-2 sm:mt-0 flex-wrap justify-end">
                      <div className="mr-2">
                        {/* Role Display Badge — colors per role from roles.ts */}
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getRoleBadgeClasses(
                            user.user_metadata?.role,
                          )}`}
                        >
                          {user.user_metadata?.role || "No Role"}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          handleStartEdit(user.id, user.user_metadata?.role)
                        }
                        className="px-2 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-dark-50"
                        aria-label="Edit Role"
                        leftIcon={<Edit className="h-4 w-4" />}
                      >
                        Edit
                      </Button>
                      {canChangePasswords && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartPasswordEdit(user.id)}
                          className="px-2 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-dark-50"
                          leftIcon={<KeyRound className="h-4 w-4" />}
                        >
                          <span className="ml-1">Change password</span>
                        </Button>
                      )}
                      {/* Deactivate (soft-delete) / Reactivate. We never
                          delete the account, so report authorship is kept. */}
                      {user.id !== currentUser?.id &&
                        (user.is_active ? (
                          <div className="relative">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setConfirmDeactivateUserId((prev) =>
                                  prev === user.id ? null : user.id,
                                )
                              }
                              disabled={activeLoadingUserId === user.id}
                              className="px-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20"
                              aria-label="Deactivate User"
                              title="Deactivate user (blocks login, keeps their reports)"
                              leftIcon={
                                activeLoadingUserId === user.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Ban className="h-4 w-4" />
                                )
                              }
                            >
                              Deactivate
                            </Button>

                            {confirmDeactivateUserId === user.id && (
                              <>
                                {/* click-away backdrop */}
                                <div
                                  className="fixed inset-0 z-40"
                                  onClick={() =>
                                    setConfirmDeactivateUserId(null)
                                  }
                                />
                                <div
                                  role="dialog"
                                  className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-lg border border-neutral-200 dark:border-dark-300 bg-white dark:bg-dark-150 p-4 shadow-xl"
                                >
                                  {/* caret pointing down to the button */}
                                  <div className="absolute -bottom-1.5 right-5 h-3 w-3 rotate-45 border-b border-r border-neutral-200 dark:border-dark-300 bg-white dark:bg-dark-150" />

                                  <div className="flex items-start gap-2">
                                    <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
                                    <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                                      Deactivate{" "}
                                      {user.user_metadata?.name || user.email}?
                                    </p>
                                  </div>
                                  <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                                    They'll be <b>signed out</b> and{" "}
                                    <b>blocked</b> from logging in, and hidden
                                    from selection lists. Their account and all
                                    reports they authored are kept (their name
                                    stays on those reports). You can reactivate
                                    them anytime.
                                  </p>
                                  <div className="mt-3 flex justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        setConfirmDeactivateUserId(null)
                                      }
                                      className="text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-dark-50"
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handleSetActive(user.id, false)
                                      }
                                      className="bg-red-600 text-white hover:bg-red-700"
                                      leftIcon={<Ban className="h-4 w-4" />}
                                    >
                                      Deactivate
                                    </Button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSetActive(user.id, true)}
                            disabled={activeLoadingUserId === user.id}
                            className="px-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20"
                            aria-label="Reactivate User"
                            title="Reactivate user (restores login)"
                            leftIcon={
                              activeLoadingUserId === user.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <UserCheck className="h-4 w-4" />
                              )
                            }
                          >
                            Reactivate
                          </Button>
                        ))}
                    </div>
                  )}
                </div>

                {canChangePasswords && passwordUserId === user.id && (
                  <div className="rounded-md border border-neutral-200 dark:border-dark-300 bg-neutral-50 dark:bg-dark-100 p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New password"
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-dark-700 dark:border-dark-600 dark:text-white"
                      />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-dark-700 dark:border-dark-600 dark:text-white"
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleChangePassword(user.id)}
                        disabled={passwordLoadingUserId === user.id}
                        className="bg-[#f26722] hover:bg-[#d95d1f] text-white"
                      >
                        {passwordLoadingUserId === user.id
                          ? "Saving..."
                          : "Save password"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancelPasswordEdit}
                        disabled={passwordLoadingUserId === user.id}
                        className="text-neutral-500 hover:bg-neutral-200 dark:hover:bg-dark-50"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
