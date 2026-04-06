import { supabase } from '@/lib/supabase';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface EmployeeCertification {
  id: string;
  employee_id: string;
  cert_name: string;
  cert_type: 'license' | 'certification' | 'training' | 'clearance' | 'other';
  cert_category: string;
  cert_number?: string;
  issuing_organization?: string;
  cert_date: string;
  expiration_date?: string | null;
  renewal_date?: string | null;
  renewal_required: boolean;
  status: 'active' | 'expired' | 'pending_renewal' | 'revoked' | 'inactive';
  document_id?: string | null;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CertificationFilter {
  employeeId?: string;
  certType?: string;
  certCategory?: string;
  status?: string;
  expired?: boolean;
  expiringSoon?: boolean; // Within 30 days
}

export const CERT_TYPES = [
  'license',
  'certification',
  'training',
  'clearance',
  'other',
] as const;

export const CERT_CATEGORIES = [
  'professional',
  'safety',
  'technical',
  'compliance',
  'driver',
  'medical',
  'other',
] as const;

export const CERT_STATUSES = [
  'active',
  'expired',
  'pending_renewal',
  'revoked',
  'inactive',
] as const;

// ============================================================================
// Helper Functions
// ============================================================================

/** Parse as local calendar date (avoids UTC-midnight shift) */
function toLocalDate(iso: string | null | undefined): Date | null {
  if (!iso || typeof iso !== 'string') return null;
  const s = iso.slice(0, 10);
  const parts = s.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Compute if a certification is expired (date-only, local time)
 */
function computeIsExpired(expirationDate: string | null | undefined): boolean {
  const expDate = toLocalDate(expirationDate);
  if (!expDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expDate.setHours(0, 0, 0, 0);
  return expDate < today;
}

/**
 * Compute if a certification is expiring soon (within 30 days, date-only local)
 */
function computeIsExpiringSoon(expirationDate: string | null | undefined): boolean {
  const expDate = toLocalDate(expirationDate);
  if (!expDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expDate.setHours(0, 0, 0, 0);
  const daysUntilExpiry = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
}

/**
 * Compute days until expiration (date-only, local)
 */
function computeDaysUntilExpiration(expirationDate: string | null | undefined): number | null {
  const expDate = toLocalDate(expirationDate);
  if (!expDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expDate.setHours(0, 0, 0, 0);
  return Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Certification Operations
// ============================================================================

/**
 * Create a new certification
 */
export async function createCertification(
  certification: Omit<EmployeeCertification, 'id' | 'created_at' | 'updated_at'>
): Promise<EmployeeCertification> {
  try {
    const { data, error } = await supabase
      .schema('common')
      .from('employee_certifications')
      .insert([certification])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating certification:', error);
    throw error;
  }
}

/**
 * Fetch certifications with optional filters
 */
export async function fetchCertifications(filter: CertificationFilter = {}): Promise<EmployeeCertification[]> {
  try {
    let query = supabase
      .schema('common')
      .from('employee_certifications')
      .select('*')
      .order('cert_date', { ascending: false });

    // Apply filters
    if (filter.employeeId) {
      query = query.eq('employee_id', filter.employeeId);
    }

    if (filter.certType) {
      query = query.eq('cert_type', filter.certType);
    }

    if (filter.certCategory) {
      query = query.eq('cert_category', filter.certCategory);
    }

    if (filter.status) {
      query = query.eq('status', filter.status);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Apply client-side filters for computed fields
    let filteredData = data || [];

    if (filter.expired !== undefined) {
      filteredData = filteredData.filter(cert => {
        const isExpired = computeIsExpired(cert.expiration_date);
        return filter.expired ? isExpired : !isExpired;
      });
    }

    if (filter.expiringSoon !== undefined && filter.expiringSoon) {
      filteredData = filteredData.filter(cert => computeIsExpiringSoon(cert.expiration_date));
    }

    return filteredData;
  } catch (error) {
    console.error('Error fetching certifications:', error);
    throw error;
  }
}

/**
 * Get a single certification by ID
 */
export async function getCertification(certificationId: string): Promise<EmployeeCertification | null> {
  try {
    const { data, error } = await supabase
      .schema('common')
      .from('employee_certifications')
      .select('*')
      .eq('id', certificationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error fetching certification:', error);
    throw error;
  }
}

/**
 * Update a certification
 */
export async function updateCertification(
  certificationId: string,
  updates: Partial<Omit<EmployeeCertification, 'id' | 'created_at' | 'employee_id'>>
): Promise<EmployeeCertification> {
  try {
    const { data, error } = await supabase
      .schema('common')
      .from('employee_certifications')
      .update(updates)
      .eq('id', certificationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating certification:', error);
    throw error;
  }
}

/**
 * Delete a certification
 */
export async function deleteCertification(certificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .schema('common')
      .from('employee_certifications')
      .delete()
      .eq('id', certificationId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting certification:', error);
    throw error;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get certification status based on expiration date
 */
export function getCertificationStatus(cert: EmployeeCertification): {
  status: EmployeeCertification['status'];
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysUntilExpiration: number | null;
} {
  const isExpired = computeIsExpired(cert.expiration_date);
  const isExpiringSoon = computeIsExpiringSoon(cert.expiration_date);
  const daysUntilExpiration = computeDaysUntilExpiration(cert.expiration_date);

  // Auto-update status based on expiration if status is active
  let status = cert.status;
  if (status === 'active' && isExpired) {
    status = 'expired';
  } else if (status === 'active' && isExpiringSoon && cert.renewal_required) {
    status = 'pending_renewal';
  }

  return {
    status,
    isExpired,
    isExpiringSoon,
    daysUntilExpiration,
  };
}

/**
 * Format date for display (date-only safe; avoids timezone shift)
 */
export function formatDate(date: string | null | undefined): string {
  if (!date) return 'N/A';
  const s = String(date).slice(0, 10);
  const parts = s.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => isNaN(n))) return String(date);
  const [y, m, d] = parts;
  return new Date(y, m - 1, d).toLocaleDateString();
}

// ============================================================================
// Service Object Export
// ============================================================================

export const employeeCertificationsService = {
  createCertification,
  fetchCertifications,
  getCertification,
  updateCertification,
  deleteCertification,
  getCertificationStatus,
  formatDate,
};
