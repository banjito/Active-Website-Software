import { supabase } from "@/lib/supabase";

/**
 * Customer-facing RFQ emails (supabase/functions/rfq-acknowledgment).
 *
 * "acknowledge" thanks the contact and promises the proposal due date.
 * "date_change" tells them the date moved; safe to call after every save,
 * since the server only sends when the date differs from what they were told.
 */
export type RfqEmailMode = "acknowledge" | "date_change";

export interface RfqEmailResult {
  emailSent: boolean;
  sentTo?: string;
  /** Why nothing was sent, e.g. "already_sent" or "date_unchanged". */
  reason?: string;
}

export async function sendRfqEmail(
  opportunityId: string,
  mode: RfqEmailMode = "acknowledge",
  options: { resend?: boolean } = {},
): Promise<RfqEmailResult> {
  const { data, error } = await supabase.functions.invoke("rfq-acknowledgment", {
    body: { opportunityId, mode, resend: options.resend === true },
  });

  if (error) {
    // Non-2xx responses carry the function's own message in the body.
    const detail = await (error as { context?: Response }).context
      ?.json?.()
      .catch(() => null);
    throw new Error(detail?.error || error.message || "Email failed to send");
  }

  return (data || { emailSent: false }) as RfqEmailResult;
}
