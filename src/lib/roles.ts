export type Role = 
  | 'NETA Technician'
  | 'Lab Technician'
  | 'Scav'
  | 'HR Rep'
  | 'Office Admin'
  | 'Sales Representative'
  | 'Engineer'
  | 'Admin';

export type Portal = 
  | 'sales'
  | 'neta'
  | 'lab'
  | 'hr'
  | 'office'
  | 'engineering'
  | 'scavenger';

export interface RolePermissions {
  portals: Portal[];
  canManageUsers: boolean;
  canManageContent: boolean;
  canViewAllData: boolean;
}

export const ROLES: Record<Role, RolePermissions> = {
  'NETA Technician': {
    portals: ['neta'],
    canManageUsers: false,
    canManageContent: false,
    canViewAllData: true
  },
  'Lab Technician': {
    portals: ['lab'],
    canManageUsers: false,
    canManageContent: false,
    canViewAllData: false
  },
  'Scav': {
    portals: ['scavenger'],
    canManageUsers: false,
    canManageContent: false,
    canViewAllData: false
  },
  'HR Rep': {
    portals: ['hr'],
    canManageUsers: false,
    canManageContent: false,
    canViewAllData: false
  },
  'Office Admin': {
    portals: ['office'],
    canManageUsers: false,
    canManageContent: false,
    canViewAllData: false
  },
  'Sales Representative': {
    portals: ['sales'],
    canManageUsers: false,
    canManageContent: false,
    canViewAllData: true
  },
  'Engineer': {
    portals: ['engineering'],
    canManageUsers: false,
    canManageContent: false,
    canViewAllData: false
  },
  'Admin': {
    portals: ['sales', 'neta', 'lab', 'hr', 'office', 'engineering', 'scavenger'],
    canManageUsers: true,
    canManageContent: true,
    canViewAllData: true
  }
};

// Helper function to check if a user has access to a specific portal
export const hasPortalAccess = (userRole: Role, portal: Portal): boolean => {
  return ROLES[userRole].portals.includes(portal);
};

// Helper function to check if a user has a specific permission
export const hasPermission = (userRole: Role, permission: keyof Omit<RolePermissions, 'portals'>): boolean => {
  return ROLES[userRole][permission];
}; 