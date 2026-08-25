/**
 * Transactional email sending for edge functions.
 *
 * Provider is Resend (https://resend.com). The From address must be on a
 * domain verified in the Resend account — see RESEND_FROM / DEFAULT_FROM_EMAIL
 * in companyConfig.ts.
 */

import { COMPANY_NAME } from "./companyConfig.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendEmailOptions {
  /** Full From header, e.g. `AMP System <notifications@ampqes.com>`. */
  from: string;
  /** One or more bare recipient addresses; a string may be comma-separated. */
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** Optional copied recipients, same accepted shapes as `to`. */
  cc?: string | string[];
}

export interface SendEmailResult {
  ok: boolean;
  status: number;
  /** Raw provider response body, for logging. */
  body: string;
  /** Provider message id when the send succeeded. */
  id?: string;
}

/**
 * Resend takes recipients as an array of addresses and rejects a single
 * comma-separated string, so split those out. Display names are not
 * supported in `to` — pass bare addresses.
 */
const toRecipientArray = (to: string | string[]): string[] =>
  (Array.isArray(to) ? to : to.split(","))
    .map((address) => address.trim())
    .filter(Boolean);

/** API key for the email provider, or null when email is not configured. */
export const getEmailApiKey = (): string | null => {
  const key = Deno.env.get("RESEND_API_KEY")?.trim();
  return key ? key : null;
};

/**
 * Normalizes a bare address into a From header with the company display name.
 * Addresses that already carry a display name are passed through untouched.
 */
export const buildFromHeader = (fromEmail: string): string =>
  fromEmail.includes("<") ? fromEmail : `${COMPANY_NAME} System <${fromEmail}>`;

/**
 * Sends one email. Never throws — callers decide whether a failed send is
 * fatal, since several digests report partial success.
 */
export const sendEmail = async (
  options: SendEmailOptions,
): Promise<SendEmailResult> => {
  const apiKey = getEmailApiKey();
  if (!apiKey) {
    return { ok: false, status: 0, body: "no RESEND_API_KEY" };
  }

  // Drop any cc that duplicates a primary recipient, so nobody is mailed twice.
  const toList = toRecipientArray(options.to);
  const toLower = new Set(toList.map((a) => a.toLowerCase()));
  const ccList = (options.cc ? toRecipientArray(options.cc) : [])
    .filter((a) => !toLower.has(a.toLowerCase()));

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: options.from,
        to: toList,
        subject: options.subject,
        html: options.html,
        ...(options.text ? { text: options.text } : {}),
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
        ...(ccList.length ? { cc: ccList } : {}),
      }),
    });

    const body = await res.text();
    let id: string | undefined;
    try {
      id = JSON.parse(body)?.id;
    } catch {
      // Non-JSON body (rare); the raw text is still returned for logging.
    }

    return { ok: res.ok, status: res.status, body, id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, body: msg };
  }
};
