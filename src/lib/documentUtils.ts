import { supabase } from './supabase';
import { v4 as uuidv4 } from 'uuid';
import { 
  DocumentUpload, 
  DocumentFilter, 
  OneLineDrawing, 
  OneLineDrawingUpload, 
  StorageBucket 
} from './types';

export interface DocumentFilter {
  division?: string;
  category?: string;
  tags?: string[];
  createdBy?: string;
}

export async function uploadDocument(document: DocumentUpload) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // 1. Upload the file to storage
    const fileExt = document.file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `${document.division}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, document.file);

    if (uploadError) throw uploadError;

    // 2. Add entry to the documents table
    const { data, error } = await supabase
      .schema('common')
      .from('documents')
      .insert({
        title: document.title,
        description: document.description || '',
        file_path: filePath,
        file_type: document.file.type,
        file_size: document.file.size,
        division: document.division,
        category: document.category || 'general',
        tags: document.tags || [],
        created_by: user.id
      })
      .select()
      .single();

    if (error) {
      // If the database insert fails, try to clean up the uploaded file
      await supabase.storage.from('documents').remove([filePath]);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error uploading document:', error);
    throw error;
  }
}

export async function fetchDocuments(filter: DocumentFilter = {}) {
  try {
    let query = supabase
      .schema('common')
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (filter.division) {
      query = query.eq('division', filter.division);
    }
    
    if (filter.category) {
      query = query.eq('category', filter.category);
    }
    
    if (filter.createdBy) {
      query = query.eq('created_by', filter.createdBy);
    }
    
    if (filter.tags && filter.tags.length > 0) {
      // Filter for documents that have at least one of the specified tags
      query = query.contains('tags', filter.tags);
    }

    const { data, error } = await query;
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Error fetching documents:', error);
    throw error;
  }
}

export async function getDocumentUrl(filePath: string, expiresIn = 3600) {
  try {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, expiresIn);
    
    if (error) throw error;
    
    return data.signedUrl;
  } catch (error) {
    console.error('Error getting document URL:', error);
    throw error;
  }
}

export async function deleteDocument(documentId: string) {
  try {
    // First, get the document to know the file path
    const { data: document, error: fetchError } = await supabase
      .schema('common')
      .from('documents')
      .select('file_path')
      .eq('id', documentId)
      .single();
    
    if (fetchError) throw fetchError;
    if (!document) throw new Error('Document not found');
    
    // Delete the file from storage
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([document.file_path]);
    
    if (storageError) throw storageError;
    
    // Delete the record from the database
    const { error: deleteError } = await supabase
      .schema('common')
      .from('documents')
      .delete()
      .eq('id', documentId);
    
    if (deleteError) throw deleteError;
    
    return true;
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
}

export async function getDocumentCount(division?: string) {
  try {
    let query = supabase
      .schema('common')
      .from('documents')
      .select('id', { count: 'exact' });
    
    if (division) {
      query = query.eq('division', division);
    }
    
    const { count, error } = await query;
    
    if (error) throw error;
    
    return count || 0;
  } catch (error) {
    console.error('Error getting document count:', error);
    return 0;
  }
}

// ============================================================================
// ONE-LINE DRAWING FUNCTIONS
// ============================================================================

export async function uploadOneLineDrawing(drawing: OneLineDrawingUpload) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // 1. Upload the file to storage
    const fileExt = drawing.file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `${drawing.job_id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('one-line-drawings')
      .upload(filePath, drawing.file);

    if (uploadError) throw uploadError;

    // 2. Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('one-line-drawings')
      .getPublicUrl(filePath);

    // 3. Mark all other drawings for this job as not current if this is current
    if (!drawing.version || drawing.version === 'current') {
      await supabase
        .schema('neta_ops')
        .from('one_line_drawings')
        .update({ is_current: false })
        .eq('job_id', drawing.job_id);
    }

    // 4. Add entry to the one_line_drawings table
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('one_line_drawings')
      .insert({
        job_id: drawing.job_id,
        user_id: user.id,
        name: drawing.name,
        description: drawing.description || '',
        file_url: publicUrl,
        file_path: filePath,
        file_type: drawing.file.type,
        file_size: drawing.file.size,
        version: drawing.version || '1.0',
        is_current: !drawing.version || drawing.version === 'current' || drawing.version === '1.0'
      })
      .select()
      .single();

    if (error) {
      // If the database insert fails, try to clean up the uploaded file
      await supabase.storage.from('one-line-drawings').remove([filePath]);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error uploading one-line drawing:', error);
    throw error;
  }
}

export async function fetchOneLineDrawings(jobId: string): Promise<OneLineDrawing[]> {
  try {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('one_line_drawings')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Error fetching one-line drawings:', error);
    throw error;
  }
}

export async function getCurrentOneLineDrawing(jobId: string): Promise<OneLineDrawing | null> {
  try {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('one_line_drawings')
      .select('*')
      .eq('job_id', jobId)
      .eq('is_current', true)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
    
    return data;
  } catch (error) {
    console.error('Error fetching current one-line drawing:', error);
    return null;
  }
}

export async function deleteOneLineDrawing(drawingId: string): Promise<boolean> {
  try {
    // First, get the drawing to know the file path
    const { data: drawing, error: fetchError } = await supabase
      .schema('neta_ops')
      .from('one_line_drawings')
      .select('file_path, job_id')
      .eq('id', drawingId)
      .single();
    
    if (fetchError) throw fetchError;
    if (!drawing) throw new Error('Drawing not found');
    
    // Delete the file from storage
    const { error: storageError } = await supabase.storage
      .from('one-line-drawings')
      .remove([drawing.file_path]);
    
    if (storageError) throw storageError;
    
    // Delete the record from the database
    const { error: deleteError } = await supabase
      .schema('neta_ops')
      .from('one_line_drawings')
      .delete()
      .eq('id', drawingId);
    
    if (deleteError) throw deleteError;
    
    return true;
  } catch (error) {
    console.error('Error deleting one-line drawing:', error);
    throw error;
  }
}

export async function setCurrentOneLineDrawing(drawingId: string): Promise<boolean> {
  try {
    // Get the drawing to know the job_id
    const { data: drawing, error: fetchError } = await supabase
      .schema('neta_ops')
      .from('one_line_drawings')
      .select('job_id')
      .eq('id', drawingId)
      .single();
    
    if (fetchError) throw fetchError;
    if (!drawing) throw new Error('Drawing not found');
    
    // Mark all drawings for this job as not current
    await supabase
      .schema('neta_ops')
      .from('one_line_drawings')
      .update({ is_current: false })
      .eq('job_id', drawing.job_id);
    
    // Mark the selected drawing as current
    const { error: updateError } = await supabase
      .schema('neta_ops')
      .from('one_line_drawings')
      .update({ is_current: true })
      .eq('id', drawingId);
    
    if (updateError) throw updateError;
    
    return true;
  } catch (error) {
    console.error('Error setting current one-line drawing:', error);
    throw error;
  }
}

// ============================================================================
// ENHANCED STORAGE UTILITIES
// ============================================================================

export async function getFileUrl(bucket: StorageBucket, filePath: string, expiresIn = 3600) {
  try {
    // For public buckets, use getPublicUrl
    if (bucket === 'job-documents' || bucket === 'one-line-drawings' || bucket === 'user-uploads') {
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);
      return publicUrl;
    }
    
    // For private buckets, use createSignedUrl
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresIn);
    
    if (error) throw error;
    
    return data.signedUrl;
  } catch (error) {
    console.error('Error getting file URL:', error);
    throw error;
  }
}

export async function deleteFile(bucket: StorageBucket, filePath: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);
    
    if (error) throw error;
    
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
} 