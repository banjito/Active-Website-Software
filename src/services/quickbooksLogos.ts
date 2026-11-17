import { supabase } from '@/lib/supabase';
import { describeSupabaseError, withWriteRetry } from '@/lib/supabaseRetry';

// Pictures for each connected QuickBooks company, shown on the Integrations page.
// Kept by realm id in app_settings (not on the connection row), so a logo
// survives reconnecting the company.

const SETTINGS_KEY = 'quickbooks_company_logos';
// Public bucket employees can already write to (customer logos live here too)
const BUCKET = 'customer-brand-assets';
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/** realm id → picture URL */
export type CompanyLogos = Record<string, string>;

export async function fetchCompanyLogos(): Promise<CompanyLogos> {
  const { data, error } = await supabase
    .schema('common')
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(describeSupabaseError(error));
  return (data?.value ?? {}) as CompanyLogos;
}

async function saveCompanyLogos(logos: CompanyLogos): Promise<void> {
  const { error } = await withWriteRetry(() =>
    supabase
      .schema('common')
      .from('app_settings')
      .upsert({ key: SETTINGS_KEY, value: logos, updated_at: new Date().toISOString() }, { onConflict: 'key' }),
  );
  if (error) throw new Error(describeSupabaseError(error));
}

/** Upload a picture for one company and return the updated set. */
export async function uploadCompanyLogo(realmId: string, file: File): Promise<CompanyLogos> {
  const extension = TYPES[file.type];
  if (!extension) throw new Error('Use a PNG, JPG, WebP or SVG image.');
  if (file.size > MAX_BYTES) throw new Error('Pick an image under 2 MB.');

  const path = `ampos-companies/${realmId}/logo-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error('Uploaded, but no picture link came back.');

  const logos = { ...(await fetchCompanyLogos()), [realmId]: data.publicUrl };
  await saveCompanyLogos(logos);
  return logos;
}

/** Go back to initials for one company. */
export async function removeCompanyLogo(realmId: string): Promise<CompanyLogos> {
  const logos = { ...(await fetchCompanyLogos()) };
  delete logos[realmId];
  await saveCompanyLogos(logos);
  return logos;
}
