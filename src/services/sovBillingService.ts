import { supabase } from '@/lib/supabase';
import { describeSupabaseError, withWriteRetry } from '@/lib/supabaseRetry';
import { getQuickBooksStatus, quickBooksApiCall } from '@/services/quickbooksService';
import type { PayApp } from '@/utils/pmDashboardCalculations';

// PM item 11, step 1: bill a job's month from its SOV as a QuickBooks invoice.
// For now this only ever writes to an Intuit TEST company (Admin → Integrations →
// Connect test company), never the real books.

export interface TestCompany {
  realmId: string;
  name: string;
}

export interface TestInvoice {
  id: string;
  docNumber: string | null;
  total: number;
  customerName: string;
}

interface Ref {
  value: string;
  name?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** QuickBooks queries escape quotes with a backslash */
const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** The connected Intuit test company, or null. Never the main company. */
export async function findTestCompany(): Promise<TestCompany | null> {
  const status = await getQuickBooksStatus();
  const company = status.companies?.find((c) => c.environment === 'sandbox' && !c.is_primary && c.realm_id);
  return company ? { realmId: company.realm_id!, name: company.company_name || 'Test company' } : null;
}

async function query<T>(realm: string, sql: string): Promise<T[]> {
  const res = await quickBooksApiCall(`/v3/company/{realmId}/query?query=${encodeURIComponent(sql)}`, 'GET', undefined, realm);
  const qr = res?.QueryResponse ?? {};
  const entity = Object.keys(qr).find((k) => Array.isArray(qr[k]));
  return entity ? (qr[entity] as T[]) : [];
}

/** The test company's customer with this name, made if missing (test customers don't match ours). */
async function testCustomer(realm: string, name: string): Promise<Ref> {
  const displayName = name.trim().slice(0, 100) || 'ampOS test customer';
  const [found] = await query<{ Id: string; DisplayName: string }>(
    realm,
    `SELECT Id, DisplayName FROM Customer WHERE DisplayName = ${quote(displayName)}`,
  );
  if (found) return { value: found.Id, name: found.DisplayName };
  const created = await quickBooksApiCall('/v3/company/{realmId}/customer', 'POST', { DisplayName: displayName }, realm);
  return { value: created.Customer.Id, name: created.Customer.DisplayName };
}

/** A service item to put the lines on: "Services" when it exists. */
async function serviceItem(realm: string): Promise<Ref> {
  const items = await query<{ Id: string; Name: string }>(
    realm,
    "SELECT Id, Name FROM Item WHERE Type = 'Service' AND Active = true MAXRESULTS 100",
  );
  const pick = items.find((i) => /^services?$/i.test(i.Name)) ?? items[0];
  if (!pick) throw new Error('The test company has no service items to bill with.');
  return { value: pick.Id, name: pick.Name };
}

/** This month's retainage: held on everything to date, less what was held before. */
export const retainageThisMonth = (app: PayApp) => round2(app.retainage - app.previousRetainage);

/** Invoice lines: one per SOV line billed this month, then retainage held as a minus line. */
export function sovInvoiceLines(app: PayApp, retainagePct: number, item: Ref) {
  const line = (amount: number, description: string) => ({
    DetailType: 'SalesItemLineDetail',
    Amount: amount,
    Description: description,
    SalesItemLineDetail: { ItemRef: item, Qty: 1, UnitPrice: amount },
  });
  const lines = app.rows
    .filter((r) => Math.abs(r.thisPeriod) >= 0.005)
    .map((r) => line(round2(r.thisPeriod), r.line.item));
  const held = retainageThisMonth(app);
  if (Math.abs(held) >= 0.005) lines.push(line(-held, `Retainage held (${retainagePct}%)`));
  return lines;
}

/** Make the month's invoice in the test company. Not emailed: it just sits in QuickBooks. */
export async function createTestSovInvoice(opts: {
  company: TestCompany;
  app: PayApp;
  retainagePct: number;
  customerName: string;
  jobLabel: string;
  monthLabel: string;
}): Promise<TestInvoice> {
  const { company, app } = opts;
  if (app.thisPeriod <= 0) throw new Error('Nothing to bill this month.');
  const [customer, item] = await Promise.all([
    testCustomer(company.realmId, opts.customerName),
    serviceItem(company.realmId),
  ]);
  const memo = `Pay application #${app.applicationNumber} for ${opts.monthLabel}. ${opts.jobLabel}`;
  const res = await quickBooksApiCall(
    '/v3/company/{realmId}/invoice',
    'POST',
    {
      CustomerRef: customer,
      Line: sovInvoiceLines(app, opts.retainagePct, item),
      CustomerMemo: { value: memo.slice(0, 1000) },
      PrivateNote: `Made by ampOS from the SOV. ${memo}`.slice(0, 4000),
    },
    company.realmId,
  );
  const invoice = res?.Invoice;
  if (!invoice?.Id) throw new Error('QuickBooks did not return the new invoice.');
  return {
    id: invoice.Id,
    docNumber: invoice.DocNumber ?? null,
    total: Number(invoice.TotalAmt ?? 0),
    customerName: customer.name ?? opts.customerName,
  };
}

/** The invoice PDF exactly as QuickBooks prints it. */
export async function fetchInvoicePdf(realm: string, invoiceId: string): Promise<Blob> {
  const res = await quickBooksApiCall(`/v3/company/{realmId}/invoice/${invoiceId}/pdf`, 'GET', undefined, realm);
  if (!res?.pdf_base64) throw new Error('QuickBooks did not send the PDF.');
  const raw = atob(res.pdf_base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

// ---- Bill records (neta_ops.job_bills, database/migrations/job_bills.sql) ----

export interface JobBill {
  id: string;
  job_id: string;
  /** Billing month, like 2026-10 */
  period: string;
  application_number: number | null;
  realm_id: string;
  is_test: boolean;
  qbo_invoice_id: string;
  qbo_doc_number: string | null;
  amount: number;
  retainage: number;
  status: 'draft' | 'sent' | 'void';
  created_at: string;
  sent_at?: string | null;
  /** Filled once sent (bill_send.sql) */
  sent_to?: string[] | null;
  sent_cc?: string[] | null;
  sent_subject?: string | null;
}

const billsTable = () => supabase.schema('neta_ops').from('job_bills');
const tableMissing = (code?: string) => code === 'PGRST205' || code === '42P01';

/** A job's bills, newest month first. Empty until job_bills.sql is run. */
export async function fetchJobBills(jobId: string): Promise<JobBill[]> {
  const { data, error } = await billsTable()
    .select('*')
    .eq('job_id', jobId)
    .order('period', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    if (tableMissing(error.code)) return [];
    throw new Error(describeSupabaseError(error));
  }
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount), retainage: Number(r.retainage) }) as JobBill);
}

/** The live (not voided) bill for this month in this QuickBooks company. */
export const billFor = (bills: JobBill[], period: string, realmId: string) =>
  bills.find((b) => b.period === period && b.realm_id === realmId && b.status !== 'void') ?? null;

/** Save the record of an invoice ampOS just made. */
export async function recordBill(bill: Omit<JobBill, 'id' | 'status' | 'created_at'>): Promise<void> {
  // Our own id makes a retry safe: a repeat finds the row already there
  const id = crypto.randomUUID();
  const { error } = await withWriteRetry(() => billsTable().insert({ id, ...bill }), { label: 'save bill' });
  if (!error) return;
  if (error.code === '23505') {
    const { data } = await billsTable().select('id').eq('id', id).maybeSingle();
    if (data) return;
  }
  if (tableMissing(error.code)) throw new Error('Bill records need database/migrations/job_bills.sql run first.');
  throw new Error(describeSupabaseError(error));
}

/** Forget a test-company bill (the test invoice stays in the test company). */
export async function deleteTestBill(id: string): Promise<void> {
  const { error } = await withWriteRetry(() => billsTable().delete().eq('id', id).eq('is_test', true), {
    label: 'clear test bill',
  });
  if (error) throw new Error(describeSupabaseError(error));
}

/**
 * Open an invoice PDF in a new tab. Call straight from a click: the tab opens
 * first so the browser doesn't block it while QuickBooks sends the file.
 */
export async function openInvoicePdf(realmId: string, invoiceId: string): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await fetchInvoicePdf(realmId, invoiceId));
    if (tab) tab.location.href = url;
    else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

// ---- Sending (supabase/functions/send-bill, database/migrations/bill_send.sql) ----

export interface BillEmailDefaults {
  /** Always copied besides accounting (accounting is added by the server) */
  cc: string[];
  /** Standard message. {customer} {job} {month} {pay_app} {invoice} {amount} {po} {company} fill in. */
  body: string;
}

const BILL_EMAIL_KEY = 'bill_email';

export const DEFAULT_BILL_BODY = `Hello,

Attached is invoice {invoice} for {job}: pay application #{pay_app} for {month}, {amount}.
PO: {po}

Please reach out with any questions.

Thank you,
{company} Accounting`;

/** Accounting's standard copy list and message (common.app_settings). */
export async function fetchBillEmailDefaults(): Promise<BillEmailDefaults> {
  const { data } = await supabase.schema('common').from('app_settings').select('value').eq('key', BILL_EMAIL_KEY).maybeSingle();
  const value = (data?.value ?? {}) as Partial<BillEmailDefaults>;
  return {
    cc: Array.isArray(value.cc) ? value.cc : [],
    body: typeof value.body === 'string' && value.body.trim() ? value.body : DEFAULT_BILL_BODY,
  };
}

/** Admins only (app_settings rule). */
export async function saveBillEmailDefaults(defaults: BillEmailDefaults): Promise<void> {
  const { error } = await withWriteRetry(() =>
    supabase
      .schema('common')
      .from('app_settings')
      .upsert({ key: BILL_EMAIL_KEY, value: defaults, updated_at: new Date().toISOString() }, { onConflict: 'key' }),
  );
  if (error) throw new Error(describeSupabaseError(error));
}

/** Where this customer's bills went last time. Empty until bill_send.sql is run. */
export async function fetchCustomerBillEmails(customerId: string): Promise<string[]> {
  const { data, error } = await supabase.schema('common').from('customers').select('bill_emails').eq('id', customerId).maybeSingle();
  if (error) return [];
  return Array.isArray(data?.bill_emails) ? data.bill_emails : [];
}

export async function saveCustomerBillEmails(customerId: string, emails: string[]): Promise<void> {
  const { error } = await supabase.schema('common').rpc('save_customer_bill_emails', {
    p_customer_id: customerId,
    p_emails: emails,
  });
  if (error) throw new Error(describeSupabaseError(error));
}

/** The job's customer PO numbers (purchase order contracts). */
export async function fetchJobPoNumbers(jobId: string): Promise<string[]> {
  const { data } = await supabase
    .schema('neta_ops')
    .from('job_contracts')
    .select('name')
    .eq('job_id', jobId)
    .eq('type', 'purchase_order');
  return [...new Set((data ?? []).map((r: { name: string | null }) => (r.name ?? '').trim()).filter(Boolean))];
}

/** Split "a@x.com, b@y.com; c@z.com" into addresses. */
export const parseEmails = (text: string): string[] =>
  [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];

export const isEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });

/** Email the bill. The server pulls the invoice PDF from QuickBooks and copies accounting. */
export async function sendBill(opts: {
  billId: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  files: File[];
}): Promise<void> {
  const attachments = await Promise.all(
    opts.files.map(async (f) => ({ filename: f.name, content: await fileToBase64(f) })),
  );
  const { data, error } = await supabase.functions.invoke('send-bill', {
    body: { bill_id: opts.billId, to: opts.to, cc: opts.cc, subject: opts.subject, body: opts.body, attachments },
  });
  if (error) {
    let reason: string | undefined;
    try {
      reason = (await (error as { context?: Response }).context?.json?.())?.error;
    } catch {
      // keep the original error
    }
    throw new Error(reason || error.message);
  }
  if (!data?.success) throw new Error(data?.error || 'The bill was not sent.');
}
