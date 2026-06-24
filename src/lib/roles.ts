export type Role = 
  | 'NETA Technician'
  | 'Lab Technician'
  | 'Scav'
  | 'HR Rep'
  | 'Office Admin'
  | 'Sales Representative'
  | 'Engineer'
  | 'Operations Manager'
  | 'Admin'
  | string; // Allow for dynamic custom roles

export type Portal = 
  | 'sales'
  | 'neta'
  | 'lab'
  | 'hr'
  | 'office'
  | 'engineering'
  | 'scavenger'
  | 'meetings'
  | 'admin'
  | 'field_tech'; // Add field_tech as a portal

export type PermissionAction = 
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'assign'
  | 'import'
  | 'export'
  | 'share'
  | 'revoke'
  | 'manage'
  | 'configure';

export type PermissionResource = 
  | 'users'
  | 'roles'
  | 'customers'
  | 'jobs'
  | 'opportunities'
  | 'reports'
  | 'documents'
  | 'settings'
  | 'encryption'
  | 'system'
  | 'equipment'
  | 'technicians'
  | 'lab'
  | 'engineering'
  | 'hr'
  | 'office'
  | 'sales'
  | 'meetings'
  | 'teams'
  | 'metrics'
  | 'rocks'
  | 'issues'
  | 'todos'
  | 'vto';

// Structure for fine-grained permissions
export interface Permission {
  resource: PermissionResource;
  action: PermissionAction;
  scope?: 'own' | 'team' | 'division' | 'all'; // Added 'division' scope
  condition?: string; // Optional SQL-like condition for advanced filtering
}

export interface RolePermissions {
  portals: Portal[];
  canManageUsers: boolean;
  canManageContent: boolean;
  canViewAllData: boolean;
  permissions?: Permission[]; // Fine-grained permissions
  isSystemRole?: boolean; // Used to identify roles that shouldn't be deleted
  parentRole?: Role; // Role hierarchy - inherit permissions from parent
  description?: string; // Added description for better documentation
  priority?: number; // Added priority for conflict resolution in permission inheritance
}

// Superuser emails that always have full admin access regardless of assigned role.
const SUPERUSER_EMAILS: string[] = [
  'john.chambers@ampqes.com',
  'jack.lyons@ampqes.com'
];

export const isSuperUser = (email: string | undefined | null): boolean => {
  if (!email) return false;
  return SUPERUSER_EMAILS.includes(email.toLowerCase());
};

// Roles allowed to log customer interactions (Log Interaction page + header button).
export const INTERACTION_LOGGING_ROLES: Role[] = [
  'Sales Representative',
  'Scav',
  'Admin',
  'Operations Manager',
  'Super Admin',
];

// Whether a user may log interactions. Superusers always qualify.
export const canLogInteractions = (
  role: string | undefined | null,
  email?: string | null,
): boolean => {
  if (isSuperUser(email)) return true;
  return !!role && INTERACTION_LOGGING_ROLES.includes(role);
};

export const ROLES: Record<Role, RolePermissions> = {
  'NETA Technician': {
    portals: ['neta', 'field_tech', 'hr'],
    canManageUsers: false,
    canManageContent: false,
    canViewAllData: true,
    isSystemRole: true,
    permissions: [
      { resource: 'customers', action: 'view', scope: 'all' },
      { resource: 'jobs', action: 'view', scope: 'all' },
      { resource: 'jobs', action: 'edit', scope: 'own' },
      { resource: 'reports', action: 'create', scope: 'own' },
      { resource: 'reports', action: 'view', scope: 'own' }
    ]
  },
  'Lab Technician': {
    portals: ['lab', 'hr'],
    canManageUsers: false,
    canManageContent: false,
    canViewAllData: false,
    isSystemRole: true,
    permissions: [
      { resource: 'reports', action: 'create', scope: 'own' },
      { resource: 'reports', action: 'view', scope: 'own' },
      { resource: 'reports', action: 'edit', scope: 'own' }
    ]
  },
  'Scav': {
    portals: ['scavenger', 'hr'],
    canManageUsers: false,
    canManageContent: false,
    canViewAllData: false,
    isSystemRole: true,
    permissions: [
      { resource: 'jobs', action: 'view', scope: 'own' },
      { resource: 'jobs', action: 'edit', scope: 'own' }
    ]
  },
  'HR Rep': {
    portals: ['hr'],
    canManageUsers: false,
    canManageContent: false,
    canViewAllData: false,
    isSystemRole: true,
    permissions: [
      { resource: 'users', action: 'view', scope: 'all' },
      { resource: 'documents', action: 'view', scope: 'all' },
      { resource: 'documents', action: 'create', scope: 'all' }
    ]
  },
  'Office Admin': {
    portals: ['office', 'hr'],
    canManageUsers: false,
    canManageContent: false,
    canViewAllData: false,
    isSystemRole: true,
    permissions: [
      { resource: 'documents', action: 'view', scope: 'all' },
      { resource: 'documents', action: 'create', scope: 'all' },
      { resource: 'documents', action: 'edit', scope: 'all' },
      { resource: 'documents', action: 'delete', scope: 'all' }
    ]
  },
  'Sales Representative': {
    portals: ['sales', 'hr'],
    canManageUsers: false,
    canManageContent: false,
    canViewAllData: true,
    isSystemRole: true,
    permissions: [
      { resource: 'customers', action: 'view', scope: 'all' },
      { resource: 'customers', action: 'create', scope: 'all' },
      { resource: 'customers', action: 'edit', scope: 'all' },
      { resource: 'opportunities', action: 'view', scope: 'all' },
      { resource: 'opportunities', action: 'create', scope: 'all' },
      { resource: 'opportunities', action: 'edit', scope: 'all' }
    ]
  },
  'Engineer': {
    portals: ['engineering', 'hr'],
    canManageUsers: false,
    canManageContent: false,
    canViewAllData: false,
    isSystemRole: true,
    permissions: [
      { resource: 'reports', action: 'view', scope: 'all' },
      { resource: 'reports', action: 'approve', scope: 'all' }
    ]
  },
  'Operations Manager': {
    portals: ['meetings', 'hr'],
    canManageUsers: false,
    canManageContent: true,
    canViewAllData: true,
    isSystemRole: true,
    permissions: [
      // Report oversight
      { resource: 'reports', action: 'view', scope: 'all' },
      { resource: 'reports', action: 'approve', scope: 'all' },
      // Full meetings portal access
      { resource: 'meetings', action: 'view', scope: 'team' },
      { resource: 'meetings', action: 'create', scope: 'team' },
      { resource: 'meetings', action: 'edit', scope: 'team' },
      { resource: 'teams', action: 'view', scope: 'own' },
      { resource: 'teams', action: 'manage', scope: 'own' },
      { resource: 'metrics', action: 'view', scope: 'team' },
      { resource: 'metrics', action: 'create', scope: 'team' },
      { resource: 'metrics', action: 'edit', scope: 'team' },
      { resource: 'rocks', action: 'view', scope: 'team' },
      { resource: 'rocks', action: 'create', scope: 'team' },
      { resource: 'rocks', action: 'edit', scope: 'team' },
      { resource: 'issues', action: 'view', scope: 'team' },
      { resource: 'issues', action: 'create', scope: 'team' },
      { resource: 'issues', action: 'edit', scope: 'team' },
      { resource: 'todos', action: 'view', scope: 'team' },
      { resource: 'todos', action: 'create', scope: 'team' },
      { resource: 'todos', action: 'edit', scope: 'team' },
      { resource: 'todos', action: 'assign', scope: 'team' },
      { resource: 'vto', action: 'view', scope: 'team' },
      { resource: 'vto', action: 'edit', scope: 'team' }
    ]
  },
  'Admin': {
    portals: ['sales', 'neta', 'lab', 'hr', 'office', 'engineering', 'scavenger', 'meetings', 'admin', 'field_tech'],
    canManageUsers: true,
    canManageContent: true,
    canViewAllData: true,
    isSystemRole: true,
    permissions: [
      // Admin has all permissions
      { resource: 'users', action: 'view', scope: 'all' },
      { resource: 'users', action: 'create', scope: 'all' },
      { resource: 'users', action: 'edit', scope: 'all' },
      { resource: 'users', action: 'delete', scope: 'all' },
      { resource: 'roles', action: 'view', scope: 'all' },
      { resource: 'roles', action: 'create', scope: 'all' },
      { resource: 'roles', action: 'edit', scope: 'all' },
      { resource: 'roles', action: 'delete', scope: 'all' },
      { resource: 'settings', action: 'view', scope: 'all' },
      { resource: 'settings', action: 'edit', scope: 'all' },
      { resource: 'encryption', action: 'view', scope: 'all' },
      { resource: 'encryption', action: 'edit', scope: 'all' },
      { resource: 'system', action: 'view', scope: 'all' },
      { resource: 'system', action: 'edit', scope: 'all' },
      // Meetings permissions
      { resource: 'meetings', action: 'view', scope: 'all' },
      { resource: 'meetings', action: 'create', scope: 'all' },
      { resource: 'meetings', action: 'edit', scope: 'all' },
      { resource: 'meetings', action: 'delete', scope: 'all' },
      { resource: 'teams', action: 'view', scope: 'all' },
      { resource: 'teams', action: 'create', scope: 'all' },
      { resource: 'teams', action: 'edit', scope: 'all' },
      { resource: 'teams', action: 'manage', scope: 'all' },
      { resource: 'metrics', action: 'view', scope: 'all' },
      { resource: 'metrics', action: 'create', scope: 'all' },
      { resource: 'metrics', action: 'edit', scope: 'all' },
      { resource: 'rocks', action: 'view', scope: 'all' },
      { resource: 'rocks', action: 'create', scope: 'all' },
      { resource: 'rocks', action: 'edit', scope: 'all' },
      { resource: 'issues', action: 'view', scope: 'all' },
      { resource: 'issues', action: 'create', scope: 'all' },
      { resource: 'issues', action: 'edit', scope: 'all' },
      { resource: 'todos', action: 'view', scope: 'all' },
      { resource: 'todos', action: 'create', scope: 'all' },
      { resource: 'todos', action: 'edit', scope: 'all' },
      { resource: 'vto', action: 'view', scope: 'all' },
      { resource: 'vto', action: 'edit', scope: 'all' }
    ]
  }
};

// Super Admin has same access as Admin (including HR portal)
(ROLES as any)['Super Admin'] = ROLES['Admin'] ? { ...ROLES['Admin'] } : undefined;

// Helper function to check if a user has access to a specific portal
export const hasPortalAccess = (userRole: Role, portal: Portal): boolean => {
  // HR portal is accessible to all authenticated users — HrLayout enforces
  // per-page restrictions (employee files, document acknowledgment, etc.).
  if (portal === 'hr') return true;

  // For custom roles not in ROLES, default to no access
  if (!ROLES[userRole]) {
    return false;
  }
  return ROLES[userRole].portals.includes(portal);
};

// Helper function to check if a user has a specific permission
export const hasPermission = (userRole: Role, permission: keyof Omit<RolePermissions, 'portals'>): boolean => {
  // For custom roles not in ROLES, default to no permissions
  if (!ROLES[userRole]) {
    return false;
  }
  // Make sure we handle boolean properties safely
  return Boolean(ROLES[userRole][permission]);
};

// Enhanced helper function to check if a user has a specific fine-grained permission
// with support for inheritance, conditions, and audit logging
export const hasActionPermission = (
  userRole: Role, 
  resource: PermissionResource, 
  action: PermissionAction,
  scope: 'own' | 'team' | 'division' | 'all' = 'own',
  context?: {
    userId?: string;
    targetId?: string;
    division?: string;
    logAccess?: boolean; // Flag to enable access logging
    additionalData?: Record<string, any>; // Additional data for logging
  }
): boolean => {
  // For custom roles not in ROLES, default to no permissions
  if (!ROLES[userRole] || !ROLES[userRole].permissions) {
    // Log denied access if logging is enabled
    if (context?.logAccess) {
      logAccessAttempt({
        role: userRole,
        resource,
        action,
        scope,
        granted: false,
        reason: 'Role not found or has no permissions',
        ...context
      });
    }
    return false;
  }
  
  // Check if the role has the exact permission
  const matchingPermission = ROLES[userRole].permissions?.find(
    p => p.resource === resource && 
         p.action === action && 
         (!p.scope || p.scope === scope || p.scope === 'all' || 
          (p.scope === 'division' && scope === 'team')) // Division scope also grants team scope
  );
  
  if (matchingPermission) {
    // Check if there's a condition to evaluate
    if (matchingPermission.condition && context) {
      // Evaluate the condition with the context
      const conditionMet = evaluatePermissionCondition(matchingPermission.condition, context);
      
      // Log access attempt if logging is enabled
      if (context?.logAccess) {
        logAccessAttempt({
          role: userRole,
          resource,
          action,
          scope,
          granted: conditionMet,
          reason: conditionMet ? 'Direct permission with condition (met)' : 'Direct permission with condition (not met)',
          permission: matchingPermission,
          ...context
        });
      }
      
      return conditionMet;
    }
    
    // No condition or context not provided, permission is granted
    if (context?.logAccess) {
      logAccessAttempt({
        role: userRole,
        resource,
        action,
        scope,
        granted: true,
        reason: 'Direct permission',
        permission: matchingPermission,
        ...context
      });
    }
    
    return true;
  }
  
  // If role has a parent, check permissions of parent role (inheritance)
  if (ROLES[userRole].parentRole && ROLES[ROLES[userRole].parentRole]) {
    const parentResult = hasActionPermission(
      ROLES[userRole].parentRole, 
      resource, 
      action, 
      scope, 
      context ? { ...context, logAccess: false } : undefined // Don't log intermediate checks
    );
    
    // Log the inherited result if logging was requested
    if (context?.logAccess) {
      logAccessAttempt({
        role: userRole,
        resource,
        action,
        scope,
        granted: parentResult,
        reason: `Inherited from parent role: ${ROLES[userRole].parentRole}`,
        ...context
      });
    }
    
    return parentResult;
  }
  
  // Log denied access if logging is enabled
  if (context?.logAccess) {
    logAccessAttempt({
      role: userRole,
      resource,
      action,
      scope,
      granted: false,
      reason: 'No matching permission found',
      ...context
    });
  }
  
  return false;
};

// --- Report approval permissions (single source of truth) ---
// All report-approval authorization across the app derives from these helpers,
// which read from the canonical `reports:approve` permission in ROLES above.

// Whether a user may approve OR reject reports. Superusers always qualify.
export const canApproveReports = (
  role: string | undefined | null,
  email?: string | null,
): boolean => {
  if (isSuperUser(email)) return true;
  if (!role) return false;
  return hasActionPermission(role, 'reports', 'approve', 'all');
};

// Reviewing (approve or reject) requires the same authority as approving.
export const canReviewReports = canApproveReports;

// Whether a user may reach the report approval workspace at all.
export const canAccessReportApproval = canApproveReports;

// Whether a user may export reports. Approvers plus anyone who can view all reports.
export const canExportReports = (
  role: string | undefined | null,
  email?: string | null,
): boolean => {
  if (canApproveReports(role, email)) return true;
  if (!role) return false;
  return hasActionPermission(role, 'reports', 'view', 'all');
};

// Tailwind badge classes per role, for consistent role display across the app.
// Falls back to the neutral palette for unknown/custom roles (never gray/zinc).
export const getRoleBadgeClasses = (role: string | undefined | null): string => {
  switch (role) {
    case 'Admin':
    case 'Super Admin':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case 'Engineer':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'Operations Manager':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'NETA Technician':
    case 'Lab Technician':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'Sales Representative':
      return 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300';
    case 'Scav':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
    case 'HR Rep':
      return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300';
    case 'Office Admin':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
    default:
      return 'bg-neutral-100 text-neutral-800 dark:bg-dark-300 dark:text-white';
  }
};

// Helper function to evaluate permission conditions
// This allows for dynamic permission rules based on context
const evaluatePermissionCondition = (
  condition: string,
  context: Record<string, any>
): boolean => {
  try {
    // Simple condition parser for basic expressions
    // For complex scenarios, this could use a proper expression evaluator
    
    // Example conditions:
    // "userId = targetId" - User can only access their own records
    // "division = userDivision" - User can only access records in their division
    
    const parts = condition.split(/\s*(=|!=|>|<|>=|<=)\s*/);
    if (parts.length !== 3) return false;
    
    const [leftKey, operator, rightKey] = parts;
    const leftValue = getNestedValue(context, leftKey);
    const rightValue = getNestedValue(context, rightKey);
    
    switch (operator) {
      case '=': return leftValue === rightValue;
      case '!=': return leftValue !== rightValue;
      case '>': return leftValue > rightValue;
      case '<': return leftValue < rightValue;
      case '>=': return leftValue >= rightValue;
      case '<=': return leftValue <= rightValue;
      default: return false;
    }
  } catch (error) {
    console.error('Error evaluating permission condition:', error);
    return false;
  }
};

// Helper to safely get nested object values from dot notation
const getNestedValue = (obj: Record<string, any>, path: string): any => {
  // Handle literal values with quotes
  if (path.startsWith('"') && path.endsWith('"')) {
    return path.slice(1, -1);
  }
  
  return path.split('.').reduce(
    (value, key) => (value === undefined || value === null) ? undefined : value[key], 
    obj
  );
};

// Function to log access attempts for auditing
export const logAccessAttempt = async (data: {
  role: string;
  resource: string;
  action: string;
  scope: string;
  granted: boolean;
  reason: string;
  userId?: string;
  targetId?: string;
  permission?: Permission;
  [key: string]: any; // Allow additional context data
}): Promise<void> => {
  try {
    // Log to console during development
    if (process.env.NODE_ENV === 'development') {
      console.log(`Access ${data.granted ? 'GRANTED' : 'DENIED'}: ${data.role} -> ${data.action} ${data.resource} (${data.scope}) - Reason: ${data.reason}`);
    }
    
    // Log to database for production
    // This would typically call a service function that inserts into an audit log table
    if (process.env.NODE_ENV === 'production') {
      // Dynamic import to avoid circular dependencies / ESM
      const { logPermissionAccess } = await import('@/services/auditService');
      if (typeof logPermissionAccess === 'function') {
        await logPermissionAccess(data);
      }
    }
  } catch (error) {
    // Ensure logging errors don't break core functionality
    console.error('Error logging permission access:', error);
  }
};

// Get all available roles
export const getAllRoles = (): Role[] => {
  return Object.keys(ROLES) as Role[];
};

// Get all built-in/system roles
export const getSystemRoles = (): Role[] => {
  return Object.entries(ROLES)
    .filter(([_, properties]) => properties.isSystemRole)
    .map(([roleName]) => roleName as Role);
};

// Get all permissions for a role, including inherited from parent roles
export const getAllRolePermissions = (role: Role): Permission[] => {
  const roleConfig = ROLES[role];
  if (!roleConfig) return [];
  
  // Start with the role's own permissions
  const ownPermissions = roleConfig.permissions || [];
  
  // If no parent role, return just the role's permissions
  if (!roleConfig.parentRole) return ownPermissions;
  
  // Get parent permissions recursively
  const parentPermissions = getAllRolePermissions(roleConfig.parentRole);
  
  // Merge permissions, with the role's own permissions taking precedence
  // for the same resource+action+scope combination
  const mergedPermissions: Permission[] = [...parentPermissions];
  
  ownPermissions.forEach(ownPerm => {
    // Check if there's a conflicting parent permission
    const conflictIndex = mergedPermissions.findIndex(
      p => p.resource === ownPerm.resource && 
           p.action === ownPerm.action && 
           p.scope === ownPerm.scope
    );
    
    if (conflictIndex >= 0) {
      // Replace the parent permission with the role's own permission
      mergedPermissions[conflictIndex] = ownPerm;
    } else {
      // No conflict, add the permission
      mergedPermissions.push(ownPerm);
    }
  });
  
  return mergedPermissions;
};

// Function to check if a user has access to a resource based on ownership
export const hasResourceOwnership = async (
  userId: string,
  resource: PermissionResource,
  resourceId: string
): Promise<boolean> => {
  try {
    const { supabase } = await import('@/lib/supabase');

    switch (resource) {
      case 'customers':
        const { data: customer } = await supabase
          .from('customers')
          .select('created_by')
          .eq('id', resourceId)
          .single();
        return customer?.created_by === userId;
        
      case 'jobs':
        const { data: job } = await supabase
          .from('jobs')
          .select('assigned_to')
          .eq('id', resourceId)
          .single();
        return job?.assigned_to === userId;
        
      // Add more resource types as needed
        
      default:
        // For unknown resource types, default to false
        return false;
    }
  } catch (error) {
    console.error(`Error checking resource ownership: ${error}`);
    return false;
  }
};

// Add or update a custom role with enhanced auditing
export const updateRole = (
  roleName: Role,
  roleConfig: Partial<RolePermissions>,
  userId?: string
): void => {
  // Track previous configuration for audit logging
  const previousConfig = ROLES[roleName] ? { ...ROLES[roleName] } : null;
  
  if (!ROLES[roleName]) {
    // Create new role
    ROLES[roleName] = {
      portals: roleConfig.portals || [],
      canManageUsers: roleConfig.canManageUsers || false,
      canManageContent: roleConfig.canManageContent || false,
      canViewAllData: roleConfig.canViewAllData || false,
      permissions: roleConfig.permissions || [],
      isSystemRole: false,
      parentRole: roleConfig.parentRole,
      description: roleConfig.description || `Custom role: ${roleName}`,
      priority: roleConfig.priority || 0
    };
  } else {
    // Update existing role
    ROLES[roleName] = {
      ...ROLES[roleName],
      ...roleConfig,
      // Don't allow changing isSystemRole for built-in roles
      isSystemRole: ROLES[roleName].isSystemRole
    };
  }
  
  // Log the role change to the audit system (dynamic import for ESM / avoid circular deps)
  import('@/services/auditService')
    .then(({ logRoleChange }) => {
      if (typeof logRoleChange === 'function') {
        logRoleChange({
          roleName,
          action: previousConfig ? 'update' : 'create',
          previousConfig,
          newConfig: { ...ROLES[roleName] },
          userId
        });
      }
    })
    .catch((error) => {
      console.error('Error logging role change:', error);
    });
}; 