import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  name: string;
  description?: string;
  category: string;
  file_path: string;
  file_url: string;
  file_type?: string;
  file_size: number;
  folder_id?: string | null;
  tags: string[];
  version: number;
  expiration_date?: string | null;
  is_expired?: boolean;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  archived: boolean;
}

export interface EmployeeDocumentFolder {
  id: string;
  employee_id: string;
  name: string;
  description?: string;
  parent_folder_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentUploadParams {
  file: File;
  employeeId: string;
  name?: string;
  description?: string;
  category?: string;
  folderId?: string | null;
  tags?: string[];
  expirationDate?: string | null;
}

export interface DocumentFilter {
  employeeId?: string;
  category?: string;
  folderId?: string | null;
  tags?: string[];
  archived?: boolean;
  expired?: boolean;
}

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
 * Compute if a document is expired based on expiration_date (date-only, local time)
 */
function computeIsExpired(expirationDate: string | null | undefined): boolean {
  const expDate = toLocalDate(expirationDate);
  if (!expDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expDate.setHours(0, 0, 0, 0);
  return expDate < today;
}

// ============================================================================
// Document Operations
// ============================================================================

/**
 * Upload a document for an employee
 */
export async function uploadEmployeeDocument(params: DocumentUploadParams): Promise<EmployeeDocument> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // 1. Upload the file to storage
    const fileExt = params.file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `employee-documents/${params.employeeId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('employee-documents')
      .upload(filePath, params.file);

    if (uploadError) throw uploadError;

    // 2. Get signed URL for the file (private bucket)
    const { data: urlData, error: urlError } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(filePath, 31536000); // 1 year expiration

    if (urlError) throw urlError;

    // 3. Create document record in database
    const documentData = {
      employee_id: params.employeeId,
      name: params.name || params.file.name,
      description: params.description || null,
      category: params.category || 'general',
      file_path: filePath,
      file_url: urlData.signedUrl,
      file_type: params.file.type || fileExt?.toUpperCase() || 'UNKNOWN',
      file_size: params.file.size,
      folder_id: params.folderId || null,
      tags: params.tags || [],
      version: 1,
      expiration_date: params.expirationDate || null,
      uploaded_by: user.id,
    };

    const { data: docData, error: docError } = await supabase
      .schema('common')
      .from('employee_documents')
      .insert([documentData])
      .select()
      .single();

    if (docError) {
      // If the database insert fails, try to clean up the uploaded file
      await supabase.storage.from('employee-documents').remove([filePath]);
      throw docError;
    }

    return docData;
  } catch (error) {
    console.error('Error uploading employee document:', error);
    throw error;
  }
}

/**
 * Fetch employee documents with optional filters
 */
export async function fetchEmployeeDocuments(filter: DocumentFilter = {}): Promise<EmployeeDocument[]> {
  try {
    let query = supabase
      .schema('common')
      .from('employee_documents')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (filter.employeeId) {
      query = query.eq('employee_id', filter.employeeId);
    }

    if (filter.category) {
      query = query.eq('category', filter.category);
    }

    if (filter.folderId !== undefined) {
      if (filter.folderId === null) {
        query = query.is('folder_id', null);
      } else {
        query = query.eq('folder_id', filter.folderId);
      }
    }

    if (filter.archived !== undefined) {
      query = query.eq('archived', filter.archived);
    }

    if (filter.tags && filter.tags.length > 0) {
      query = query.contains('tags', filter.tags);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Refresh signed URLs for documents and compute is_expired
    const documentsWithUrls = await Promise.all(
      (data || []).map(async (doc) => {
        try {
          const { data: urlData } = await supabase.storage
            .from('employee-documents')
            .createSignedUrl(doc.file_path, 3600); // 1 hour expiration

          return {
            ...doc,
            file_url: urlData?.signedUrl || doc.file_url,
            is_expired: computeIsExpired(doc.expiration_date),
          };
        } catch (err) {
          console.error('Error refreshing URL for document:', doc.id, err);
          return {
            ...doc,
            is_expired: computeIsExpired(doc.expiration_date),
          };
        }
      })
    );

    // Apply expired filter client-side if specified
    let filteredDocuments = documentsWithUrls;
    if (filter.expired !== undefined) {
      filteredDocuments = documentsWithUrls.filter(doc => doc.is_expired === filter.expired);
    }

    return filteredDocuments;
  } catch (error) {
    console.error('Error fetching employee documents:', error);
    throw error;
  }
}

/**
 * Get a single employee document by ID
 */
export async function getEmployeeDocument(documentId: string): Promise<EmployeeDocument | null> {
  try {
    const { data, error } = await supabase
      .schema('common')
      .from('employee_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    if (!data) return null;

    // Refresh signed URL
    const { data: urlData } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(data.file_path, 3600);

    return {
      ...data,
      file_url: urlData?.signedUrl || data.file_url,
      is_expired: computeIsExpired(data.expiration_date),
    };
  } catch (error) {
    console.error('Error fetching employee document:', error);
    throw error;
  }
}

/**
 * Update an employee document
 */
export async function updateEmployeeDocument(
  documentId: string,
  updates: Partial<Omit<EmployeeDocument, 'id' | 'created_at' | 'file_path' | 'file_url'>>
): Promise<EmployeeDocument> {
  try {
    const { data, error } = await supabase
      .schema('common')
      .from('employee_documents')
      .update(updates)
      .eq('id', documentId)
      .select()
      .single();

    if (error) throw error;

    // Refresh signed URL
    const { data: urlData } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(data.file_path, 3600);

    return {
      ...data,
      file_url: urlData?.signedUrl || data.file_url,
      is_expired: computeIsExpired(data.expiration_date),
    };
  } catch (error) {
    console.error('Error updating employee document:', error);
    throw error;
  }
}

/**
 * Check if the current user can delete a given document.
 * Allowed: Admin, Super Admin, or the user who uploaded the document.
 */
export async function canDeleteEmployeeDocument(doc: EmployeeDocument): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  if (doc.uploaded_by === user.id) return true;
  const role = user.user_metadata?.role as string | undefined;
  if (role === 'Admin' || role === 'Super Admin') return true;
  return false;
}

/**
 * Synchronous check for delete permission using already-available user data.
 */
export function canDeleteEmployeeDocumentSync(
  doc: EmployeeDocument,
  userId: string | undefined,
  userRole: string | undefined
): boolean {
  if (!userId) return false;
  if (doc.uploaded_by === userId) return true;
  if (userRole === 'Admin' || userRole === 'Super Admin') return true;
  return false;
}

/**
 * Delete an employee document
 */
export async function deleteEmployeeDocument(documentId: string): Promise<boolean> {
  try {
    // First, get the document to know the file path and verify permissions
    const { data: document, error: fetchError } = await supabase
      .schema('common')
      .from('employee_documents')
      .select('file_path, uploaded_by')
      .eq('id', documentId)
      .single();

    if (fetchError) throw fetchError;
    if (!document) throw new Error('Document not found');

    // Verify the current user has permission to delete
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const role = user.user_metadata?.role as string | undefined;
    const isUploader = document.uploaded_by === user.id;
    const isAdmin = role === 'Admin' || role === 'Super Admin';

    if (!isUploader && !isAdmin) {
      throw new Error('You do not have permission to delete this document. Only admins or the person who uploaded it can delete.');
    }

    // Delete the file from storage
    const { error: storageError } = await supabase.storage
      .from('employee-documents')
      .remove([document.file_path]);

    if (storageError) {
      console.warn('Error deleting file from storage:', storageError);
    }

    // Delete the record from the database
    const { error: deleteError, count } = await supabase
      .schema('common')
      .from('employee_documents')
      .delete({ count: 'exact' })
      .eq('id', documentId);

    if (deleteError) throw deleteError;

    // RLS may silently block the delete (returns 0 rows affected without error)
    if (count === 0) {
      throw new Error(
        'Unable to delete this document. Your database permissions may not allow it — please contact an administrator.'
      );
    }

    return true;
  } catch (error) {
    console.error('Error deleting employee document:', error);
    throw error;
  }
}

/**
 * Archive or unarchive a document
 */
export async function archiveEmployeeDocument(documentId: string, archived: boolean): Promise<EmployeeDocument> {
  return updateEmployeeDocument(documentId, { archived });
}

// ============================================================================
// Folder Operations
// ============================================================================

/**
 * Create a folder for organizing employee documents
 */
export async function createEmployeeDocumentFolder(
  folder: Omit<EmployeeDocumentFolder, 'id' | 'created_at' | 'updated_at'>
): Promise<EmployeeDocumentFolder> {
  try {
    const { data, error } = await supabase
      .schema('common')
      .from('employee_document_folders')
      .insert([folder])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating employee document folder:', error);
    throw error;
  }
}

/**
 * Fetch folders for an employee
 */
export async function fetchEmployeeDocumentFolders(employeeId: string): Promise<EmployeeDocumentFolder[]> {
  try {
    const { data, error } = await supabase
      .schema('common')
      .from('employee_document_folders')
      .select('*')
      .eq('employee_id', employeeId)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching employee document folders:', error);
    throw error;
  }
}

/**
 * Update a folder
 */
export async function updateEmployeeDocumentFolder(
  folderId: string,
  updates: Partial<Omit<EmployeeDocumentFolder, 'id' | 'created_at' | 'updated_at'>>
): Promise<EmployeeDocumentFolder> {
  try {
    const { data, error } = await supabase
      .schema('common')
      .from('employee_document_folders')
      .update(updates)
      .eq('id', folderId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating employee document folder:', error);
    throw error;
  }
}

/**
 * Delete a folder (documents in the folder will have folder_id set to null)
 */
export async function deleteEmployeeDocumentFolder(folderId: string): Promise<boolean> {
  try {
    // First, update all documents in this folder to remove folder reference
    await supabase
      .schema('common')
      .from('employee_documents')
      .update({ folder_id: null })
      .eq('folder_id', folderId);

    // Delete the folder
    const { error } = await supabase
      .schema('common')
      .from('employee_document_folders')
      .delete()
      .eq('id', folderId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting employee document folder:', error);
    throw error;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get document categories
 */
export const DOCUMENT_CATEGORIES = [
  'general',
  'contracts',
  'certifications',
  'performance',
  'hr',
  'payroll',
  'benefits',
  'training',
  'disciplinary',
  'other',
] as const;

export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number];

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ============================================================================
// Service Object Export
// ============================================================================

export const employeeDocumentsService = {
  uploadEmployeeDocument,
  fetchEmployeeDocuments,
  getEmployeeDocument,
  updateEmployeeDocument,
  deleteEmployeeDocument,
  canDeleteEmployeeDocument,
  canDeleteEmployeeDocumentSync,
  archiveEmployeeDocument,
  createEmployeeDocumentFolder,
  fetchEmployeeDocumentFolders,
  updateEmployeeDocumentFolder,
  deleteEmployeeDocumentFolder,
};
