import { supabase } from '../supabase';
import { 
  GLOBAL_DEFAULT_FILES, 
  DIVISION_DEFAULT_FILES, 
  DEFAULT_FILE_SETTINGS 
} from '../config/defaultJobFiles.config';

export interface DefaultJobFile {
  name: string;
  description: string;
  file_url: string;
  template_type?: string;
  status: 'pending' | 'in_progress' | 'approved';
}

/**
 * Adds default files to a newly created job
 */
export async function addDefaultFilesToJob(
  jobId: string, 
  userId: string, 
  division?: string
): Promise<void> {
  try {
    // Check if default files are enabled
    if (!DEFAULT_FILE_SETTINGS.ENABLE_DEFAULT_FILES) {
      return;
    }

    // Combine default files with division-specific files
    const filesToAdd = [...GLOBAL_DEFAULT_FILES];
    
    if (division && DIVISION_DEFAULT_FILES[division]) {
      filesToAdd.push(...DIVISION_DEFAULT_FILES[division]);
    }

    // Create asset records — match neta_ops.assets columns used elsewhere (reports);
    // there is no `description` column on assets in production schema.
    const assetInserts = filesToAdd.map((file) => ({
      name: file.name,
      file_url: file.file_url,
      template_type: file.template_type,
      status: file.status,
      user_id: userId,
      created_at: new Date().toISOString()
    }));

    const { data: insertedAssets, error: assetError } = await supabase
      .schema('neta_ops')
      .from('assets')
      .insert(assetInserts)
      .select('id');

    if (assetError) {
      console.error('Error creating default assets:', assetError);
      if (DEFAULT_FILE_SETTINGS.FAIL_ON_DEFAULT_FILE_ERROR) throw assetError;
      return;
    }

    if (insertedAssets && insertedAssets.length > 0) {
      const jobAssetLinks = insertedAssets.map((asset) => ({
        job_id: jobId,
        asset_id: asset.id,
        user_id: userId
      }));

      const { error: linkError } = await supabase
        .schema('neta_ops')
        .from('job_assets')
        .insert(jobAssetLinks);

      if (linkError) {
        console.error('Error linking assets to job:', linkError);
        if (DEFAULT_FILE_SETTINGS.FAIL_ON_DEFAULT_FILE_ERROR) throw linkError;
        return;
      }
    }

    console.log(`Successfully added ${filesToAdd.length} default files to job ${jobId}`);
  } catch (error) {
    console.error('Error adding default files to job:', error);
    if (DEFAULT_FILE_SETTINGS.FAIL_ON_DEFAULT_FILE_ERROR) throw error;
  }
}

/**
 * Adds a custom default file configuration for a specific division
 */
export function addDivisionDefaultFile(division: string, file: DefaultJobFile): void {
  if (!DIVISION_DEFAULT_FILES[division]) {
    DIVISION_DEFAULT_FILES[division] = [];
  }
  DIVISION_DEFAULT_FILES[division].push(file);
}

/**
 * Gets all default files for a specific division
 */
export function getDefaultFilesForDivision(division?: string): DefaultJobFile[] {
  const files = [...GLOBAL_DEFAULT_FILES];
  
  if (division && DIVISION_DEFAULT_FILES[division]) {
    files.push(...DIVISION_DEFAULT_FILES[division]);
  }
  
  return files;
} 