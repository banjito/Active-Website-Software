import React, { useState, useEffect, useId } from "react";
import { PermissionAction, PermissionResource } from "@/lib/roles";
import {
  UserPermission,
  getUserPermissions,
  grantUserPermission,
  revokeUserPermission,
} from "@/services/permissionService";
import { Permission } from "@/types/permissions";
import { supabase } from "@/lib/supabase";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { AlertCircle, CheckCircle, Plus, Shield, Trash2, X, Calendar } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/Alert";
import { formatDistance } from "date-fns";
import { Badge } from "../ui/Badge";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

interface PanelUser {
  id: string;
  email: string;
  user_metadata?: {
    name?: string;
    role?: string;
  };
}

interface UserPermissionsPanelProps {
  user: PanelUser;
  currentUserId?: string;
}

// Available resources and actions for permissions
const availableResources: PermissionResource[] = [
  "users",
  "roles",
  "customers",
  "jobs",
  "opportunities",
  "reports",
  "documents",
  "settings",
  "encryption",
  "system",
  "equipment",
  "technicians",
  "lab",
  "engineering",
  "hr",
  "office",
  "sales",
];

const availableActions: PermissionAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "assign",
  "import",
  "export",
  "share",
  "revoke",
  "manage",
  "configure",
];

// Format time relative to now
const formatTime = (timestamp: string): string => {
  try {
    return formatDistance(new Date(timestamp), new Date(), {
      addSuffix: true,
    });
  } catch (err) {
    return timestamp;
  }
};

// Get permission scope badge color
const getScopeBadge = (scope?: string) => {
  switch (scope) {
    case "own":
      return (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
        >
          Own
        </Badge>
      );
    case "team":
      return (
        <Badge
          variant="outline"
          className="bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-200"
        >
          Team
        </Badge>
      );
    case "division":
      return (
        <Badge
          variant="outline"
          className="bg-purple-50 text-purple-700 dark:bg-purple-900 dark:text-purple-200"
        >
          Division
        </Badge>
      );
    case "all":
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-200"
        >
          All
        </Badge>
      );
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
};

const UserPermissionsPanel: React.FC<UserPermissionsPanelProps> = ({
  user,
  currentUserId,
}) => {
  // Unique ids so multiple mounted panels never collide (esp. the date picker bridge)
  const uid = useId();
  const resourceId = `${uid}-resource`;
  const actionId = `${uid}-action`;
  const scopeId = `${uid}-scope`;
  const expirationId = `${uid}-expiration`;
  const datePickerId = `${uid}-date-picker`;

  // State for user permissions
  const [userPermissions, setUserPermissions] = useState<Permission[]>([]);
  const [directPermissions, setDirectPermissions] = useState<UserPermission[]>(
    [],
  );

  // State for adding new permissions
  const [isAdding, setIsAdding] = useState(false);
  const [newResource, setNewResource] = useState<PermissionResource | "">("");
  const [newAction, setNewAction] = useState<PermissionAction | "">("");
  const [newScope, setNewScope] = useState<"own" | "team" | "division" | "all">(
    "own",
  );
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);

  // State for UI
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load permissions whenever the selected user changes
  useEffect(() => {
    loadUserPermissions();
    // Reset any in-progress grant form when switching users
    resetPermissionForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Load permissions for the current user
  const loadUserPermissions = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all permissions (role-based + direct)
      const permissions = await getUserPermissions(
        user.id,
        user.user_metadata?.role,
      );
      setUserPermissions(permissions as Permission[]);

      // Load direct permissions from the database
      const { data, error } = await supabase
        .schema("common")
        .from("user_permissions")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setDirectPermissions(data as UserPermission[]);
    } catch (err: any) {
      setError(`Error loading permissions: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Reset the permission form
  const resetPermissionForm = () => {
    setIsAdding(false);
    setNewResource("");
    setNewAction("");
    setNewScope("own");
    setExpirationDate(null);
  };

  // Grant a new permission to the user
  const handleGrantPermission = async () => {
    if (!newResource || !newAction) {
      setError("Please select a resource and action");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const result = await grantUserPermission(
        user.id,
        newResource as PermissionResource,
        newAction as PermissionAction,
        {
          scope: newScope,
          validUntil: expirationDate || undefined,
          grantedBy: currentUserId,
        },
      );

      if (!result) {
        throw new Error("Failed to grant permission");
      }

      // Reload permissions
      await loadUserPermissions();

      // Show success message
      setSuccess(`Permission granted: ${newAction} ${newResource}`);

      // Reset form
      resetPermissionForm();
    } catch (err: any) {
      setError(`Error granting permission: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Revoke a permission from the user
  const handleRevokePermission = async (permission: UserPermission) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const result = await revokeUserPermission(
        user.id,
        permission.resource as PermissionResource,
        permission.action as PermissionAction,
        permission.scope as "own" | "team" | "division" | "all",
      );

      if (!result) {
        throw new Error("Failed to revoke permission");
      }

      // Reload permissions
      await loadUserPermissions();

      // Show success message
      setSuccess(
        `Permission revoked: ${permission.action} ${permission.resource}`,
      );
    } catch (err: any) {
      setError(`Error revoking permission: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Group permissions by resource type for better organization
  const groupedPermissions = userPermissions.reduce(
    (groups, permission) => {
      const resource = permission.resource;
      if (!groups[resource]) {
        groups[resource] = [];
      }
      groups[resource].push(permission);
      return groups;
    },
    {} as Record<string, Permission[]>,
  );

  return (
    <div>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-4 border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200">
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Grant or revoke permissions beyond the user's role
        </h3>

        <Button
          variant={isAdding ? "destructive" : "outline"}
          size="sm"
          onClick={() => setIsAdding(!isAdding)}
          leftIcon={
            isAdding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />
          }
        >
          {isAdding ? "Cancel" : "Add Permission"}
        </Button>
      </div>

      {/* Add permission form */}
      {isAdding && (
        <div className="border rounded-none p-4 mb-4 bg-neutral-50 dark:bg-dark-150">
          <h4 className="font-medium mb-3">Grant New Permission</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <Label htmlFor={resourceId}>Resource</Label>
              <SelectRoot
                value={newResource}
                onValueChange={(value: string) =>
                  setNewResource(value as PermissionResource)
                }
              >
                <SelectTrigger id={resourceId}>
                  <SelectValue placeholder="Select Resource" />
                </SelectTrigger>
                <SelectContent>
                  {availableResources.map((resource) => (
                    <SelectItem key={resource} value={resource}>
                      {resource.charAt(0).toUpperCase() + resource.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </div>

            <div>
              <Label htmlFor={actionId}>Action</Label>
              <SelectRoot
                value={newAction}
                onValueChange={(value: string) =>
                  setNewAction(value as PermissionAction)
                }
              >
                <SelectTrigger id={actionId}>
                  <SelectValue placeholder="Select Action" />
                </SelectTrigger>
                <SelectContent>
                  {availableActions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action.charAt(0).toUpperCase() + action.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <Label htmlFor={scopeId}>Scope</Label>
              <SelectRoot
                value={newScope}
                onValueChange={(value: string) =>
                  setNewScope(value as "own" | "team" | "division" | "all")
                }
              >
                <SelectTrigger id={scopeId}>
                  <SelectValue placeholder="Select Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="own">Own Resources</SelectItem>
                  <SelectItem value="team">Team Resources</SelectItem>
                  <SelectItem value="division">Division Resources</SelectItem>
                  <SelectItem value="all">All Resources</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>

            <div>
              <Label htmlFor={expirationId}>Expiration (Optional)</Label>
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Input
                    id={expirationId}
                    placeholder="Never expires"
                    value={
                      expirationDate ? expirationDate.toLocaleDateString() : ""
                    }
                    readOnly
                    className="cursor-pointer pr-8"
                    onClick={() =>
                      document.getElementById(datePickerId)?.click()
                    }
                  />
                  <Calendar className="absolute right-2 top-2.5 h-4 w-4 text-neutral-400" />
                </div>
                <DatePicker
                  id={datePickerId}
                  selected={expirationDate}
                  onChange={(date: Date | null) => setExpirationDate(date)}
                  minDate={new Date()}
                  className="hidden"
                />
                {expirationDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    onClick={() => setExpirationDate(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleGrantPermission}
              disabled={!newResource || !newAction || loading}
              leftIcon={<Shield className="h-4 w-4" />}
            >
              Grant Permission
            </Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="all">
        <TabsList className="mb-4 h-auto justify-start space-x-1 bg-neutral-100 p-1 dark:bg-dark-150">
          <TabsTrigger
            value="all"
            className="py-2 text-neutral-600 hover:text-neutral-900 dark:text-white dark:hover:text-white data-[state=active]:text-neutral-900 dark:data-[state=active]:text-white"
          >
            All Permissions
          </TabsTrigger>
          <TabsTrigger
            value="direct"
            className="py-2 text-neutral-600 hover:text-neutral-900 dark:text-white dark:hover:text-white data-[state=active]:text-neutral-900 dark:data-[state=active]:text-white"
          >
            Direct Permissions
          </TabsTrigger>
        </TabsList>

        {/* All permissions tab */}
        <TabsContent value="all">
          {Object.keys(groupedPermissions).length === 0 ? (
            <div className="text-center py-6 text-neutral-500">
              <p>No permissions found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedPermissions).map(
                ([resource, permissions]) => (
                  <div
                    key={resource}
                    className="border rounded-none overflow-hidden"
                  >
                    <div className="bg-neutral-50 dark:bg-dark-150 px-4 py-2 font-medium">
                      {resource.charAt(0).toUpperCase() + resource.slice(1)}
                    </div>
                    <div className="divide-y">
                      {permissions.map((permission, index) => (
                        <div
                          key={index}
                          className="px-4 py-2 flex items-center justify-between"
                        >
                          <div>
                            <span className="font-medium">
                              {permission.action.charAt(0).toUpperCase() +
                                permission.action.slice(1)}
                            </span>
                            <div className="mt-1">
                              {getScopeBadge(permission.scope)}
                              {"condition" in permission &&
                                typeof permission.condition === "string" && (
                                  <span className="text-xs ml-2 text-neutral-500">
                                    Condition: {permission.condition}
                                  </span>
                                )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </TabsContent>

        {/* Direct permissions tab */}
        <TabsContent value="direct">
          {directPermissions.length === 0 ? (
            <div className="text-center py-6 text-neutral-500">
              <p>No direct permissions found</p>
              <p className="text-xs mt-1">
                All permissions are inherited from the user's role
              </p>
            </div>
          ) : (
            <div className="border rounded-none overflow-hidden">
              <table className="min-w-full divide-y">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-dark-150">
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Resource
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Scope
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Granted
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Expires
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {directPermissions.map((permission) => (
                    <tr
                      key={permission.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    >
                      <td className="px-4 py-2">
                        {permission.resource.charAt(0).toUpperCase() +
                          permission.resource.slice(1)}
                      </td>
                      <td className="px-4 py-2">
                        {permission.action.charAt(0).toUpperCase() +
                          permission.action.slice(1)}
                      </td>
                      <td className="px-4 py-2">
                        {getScopeBadge(permission.scope)}
                      </td>
                      <td className="px-4 py-2 text-sm text-neutral-500">
                        {formatTime(permission.created_at)}
                      </td>
                      <td className="px-4 py-2 text-sm text-neutral-500">
                        {permission.valid_until ? (
                          formatTime(permission.valid_until)
                        ) : (
                          <span className="text-xs">Never</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRevokePermission(permission)}
                          disabled={loading}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UserPermissionsPanel;
