import { supabase } from '@/lib/supabase';

/**
 * Online signing for Change Orders. Everything goes through the
 * change-order-signature edge function; staff can read the signature rows.
 * Tables: database/migrations/change_order_approval.sql.
 */

export type SignatureState = 'sent' | 'signed' | 'declined' | 'void' | 'expired';

export interface SignatureRequest {
  change_order_id: string;
  signer_name: string;
  signer_email: string;
  status: Exclude<SignatureState, 'expired'>;
  sent_at: string;
  signed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  expires_at: string;
}

export interface SigningView {
  state: SignatureState;
  companyName: string;
  changeOrderNumber: string;
  jobNumber: string | null;
  jobTitle: string | null;
  title: string;
  amount: number | null;
  signerName: string;
  letterHtml: string;
  letterSha256: string;
  consentText: string;
  signedName: string | null;
  signedAt: string | null;
  signatureImage: string | null;
  expiresAt: string;
}

// The function answers errors as { error }; show that text instead of a generic one.
async function functionErrorMessage(error: unknown): Promise<string> {
  const response = (error as { context?: unknown })?.context;
  if (response instanceof Response) {
    try {
      const body = await response.clone().json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // fall through
    }
  }
  return error instanceof Error ? error.message : String(error);
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('change-order-signature', { body });
  if (error) throw new Error(await functionErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/** Email the customer a link to sign the Change Order's current letter. Marks it Sent. */
export const sendChangeOrderForSignature = (changeOrderId: string, signerName: string, signerEmail: string) =>
  call<{ sent: true; sentTo: string; expiresAt: string }>({
    action: 'send',
    changeOrderId,
    signerName,
    signerEmail,
    origin: window.location.origin,
  });

/** Tell accounting a Change Order was approved by hand (email, their form, signed letter). */
export const notifyChangeOrderApproved = (changeOrderId: string) =>
  call<{ emailSent: boolean }>({ action: 'notify_approved', changeOrderId });

export const viewChangeOrderSigning = (token: string) => call<SigningView>({ action: 'view', token });

export const signChangeOrder = (token: string, signedName: string, signatureImage: string) =>
  call<{ signed: true; copyEmailed: boolean }>({
    action: 'sign',
    token,
    signedName,
    signatureImage,
    consent: true,
    origin: window.location.origin,
  });

export const declineChangeOrder = (token: string, reason: string) =>
  call<{ declined: true }>({ action: 'decline', token, reason });

/** Latest signature request per Change Order, keyed by Change Order id. */
export async function fetchLatestSignatureRequests(
  changeOrderIds: string[],
): Promise<Record<string, SignatureRequest>> {
  if (changeOrderIds.length === 0) return {};
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('change_order_signatures')
    .select('change_order_id, signer_name, signer_email, status, sent_at, signed_at, declined_at, decline_reason, expires_at')
    .in('change_order_id', changeOrderIds)
    .order('sent_at', { ascending: false });
  if (error) {
    // Table not created yet: no requests
    if ((error as any).code === '42P01' || (error as any).code === 'PGRST205') return {};
    throw error;
  }
  const out: Record<string, SignatureRequest> = {};
  for (const row of (data ?? []) as SignatureRequest[]) {
    if (!out[row.change_order_id]) out[row.change_order_id] = row;
  }
  return out;
}

/** "sent" past its expiry reads as expired. */
export const signatureState = (r: SignatureRequest): SignatureState =>
  r.status === 'sent' && new Date(r.expires_at).getTime() < Date.now() ? 'expired' : r.status;
