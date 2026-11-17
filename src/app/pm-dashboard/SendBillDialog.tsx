import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Paperclip, Printer, Send, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { companyConfig } from '@/lib/companyConfig';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import type { PmJob } from '@/services/pmDashboardService';
import {
  fetchBillEmailDefaults,
  fetchCustomerBillEmails,
  fetchJobPoNumbers,
  isEmail,
  openInvoicePdf,
  parseEmails,
  saveBillEmailDefaults,
  saveCustomerBillEmails,
  sendBill,
  type JobBill,
} from '@/services/sovBillingService';
import { monthLabel } from '@/utils/pmDashboardCalculations';

// The Send box: looks like an email. Invoice PDF comes from QuickBooks at send
// time, the SOV PDF is built here, the PM adds the lien waiver. Accounting is
// always copied.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill: JobBill;
  job: PmJob;
  onSent: () => void;
}

const INPUT =
  'w-full rounded-none border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100';
const LABEL = 'w-16 shrink-0 pt-1.5 text-sm text-neutral-500 dark:text-neutral-400';
const LINK = 'inline-flex items-center gap-1 text-sm text-neutral-700 underline hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100';

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Fill {placeholders}. Lines about the PO drop out when the job has none. */
function fillTemplate(template: string, values: Record<string, string>): string {
  return template
    .split('\n')
    .filter((line) => values.po || !line.includes('{po}'))
    .join('\n')
    .replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

export function SendBillDialog({ open, onOpenChange, bill, job, onSent }: Props) {
  const { user } = useAuth();
  const isAdmin = ['Admin', 'Super Admin'].includes(user?.user_metadata?.role ?? '');
  const fileInput = useRef<HTMLInputElement>(null);

  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saveTo, setSaveTo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [template, setTemplate] = useState('');
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [sov, setSov] = useState<File | null>(null);
  const [sovStatus, setSovStatus] = useState<'building' | 'ready' | 'failed' | 'removed'>('building');
  const [sovWarning, setSovWarning] = useState<string | null>(null);

  const invoiceLabel = `#${bill.qbo_doc_number || bill.qbo_invoice_id}`;
  const jobLabel = [job.job_number ? `job ${job.job_number}` : null, job.title].filter(Boolean).join(' ');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setFiles([]);
    setEditingTemplate(false);
    setSov(null);
    setSovStatus('building');
    setSovWarning(null);
    // The SOV PDF library is big, so it loads only when a bill is being sent
    void import('@/lib/sovPdf')
      .then((m) => m.buildSovPdfFile(job.id, bill.period))
      .then(({ file, currentDue }) => {
        if (!alive) return;
        setSov(file);
        setSovStatus('ready');
        if (Math.abs(currentDue - bill.amount) >= 0.01) {
          setSovWarning(
            `The SOV now shows ${dollars.format(currentDue)} due for ${monthLabel(bill.period, 'long')}, but the invoice is ${dollars.format(bill.amount)}. The SOV changed after billing.`,
          );
        }
      })
      .catch((err) => {
        console.error('[Send bill] SOV PDF failed:', err);
        if (alive) setSovStatus('failed');
      });
    void Promise.all([
      fetchBillEmailDefaults(),
      job.customer_id ? fetchCustomerBillEmails(job.customer_id) : Promise.resolve([] as string[]),
      fetchJobPoNumbers(job.id),
    ])
      .then(([defaults, saved, pos]) => {
        if (!alive) return;
        const po = pos.join(', ');
        const filled = {
          customer: job.customer_name,
          job: jobLabel,
          month: monthLabel(bill.period, 'long'),
          pay_app: String(bill.application_number ?? ''),
          invoice: invoiceLabel,
          amount: dollars.format(bill.amount),
          po,
          company: companyConfig.name,
        };
        setValues(filled);
        setTemplate(defaults.body);
        setTo((bill.sent_to?.length ? bill.sent_to : bill.is_test ? [] : saved).join(', '));
        setCc((bill.sent_cc?.length ? bill.sent_cc.filter((a) => a !== companyConfig.accountingEmail) : defaults.cc).join(', '));
        setSubject(po ? `PO ${po} - Invoice ${invoiceLabel}` : `Invoice ${invoiceLabel} - ${jobLabel}`);
        setBody(fillTemplate(defaults.body, filled));
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Could not load the bill details.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // Reload only when the box opens for a bill
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bill.id]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
    if (fileInput.current) fileInput.current.value = '';
  };

  const preview = (file: File) => {
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const previewInvoice = async () => {
    setError(null);
    try {
      await openInvoicePdf(bill.realm_id, bill.qbo_invoice_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get the invoice PDF.');
    }
  };

  const saveTemplate = async () => {
    setSavingTemplate(true);
    setError(null);
    try {
      await saveBillEmailDefaults({ cc: parseEmails(cc).filter(isEmail), body: template });
      setBody(fillTemplate(template, values));
      setEditingTemplate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the standard message.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const send = async () => {
    const toList = parseEmails(to);
    const ccList = parseEmails(cc);
    const bad = [...toList, ...ccList].find((e) => !isEmail(e));
    if (toList.length === 0) return setError('Add who the bill goes to.');
    if (bad) return setError(`"${bad}" isn't an email address.`);
    if (!subject.trim()) return setError('Add a subject.');
    setSending(true);
    setError(null);
    try {
      const attached = sov && sovStatus === 'ready' ? [sov, ...files] : files;
      await sendBill({ billId: bill.id, to: toList, cc: ccList, subject: subject.trim(), body, files: attached });
      if (saveTo && !bill.is_test && job.customer_id) {
        await saveCustomerBillEmails(job.customer_id, toList).catch((err) =>
          console.error('[Send bill] Could not save the customer\'s bill addresses:', err),
        );
      }
      onSent();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The bill was not sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Send bill: {monthLabel(bill.period, 'long')}, invoice {invoiceLabel}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Getting the bill ready…</p>
        ) : (
          <div className="space-y-3">
            {bill.is_test && (
              <p className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                Test bill: it can only go to company email addresses.
              </p>
            )}

            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              From {companyConfig.accountingEmail}. Replies go to accounting.
            </p>

            <div className="flex gap-2">
              <label htmlFor="bill-to" className={LABEL}>To</label>
              <div className="flex-1 space-y-1">
                <input id="bill-to" className={INPUT} value={to} onChange={(e) => setTo(e.target.value)} placeholder="ap@customer.com" />
                {!bill.is_test && job.customer_id && (
                  <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                    <input type="checkbox" checked={saveTo} onChange={(e) => setSaveTo(e.target.checked)} />
                    Use these for {job.customer_name} next time
                  </label>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <label htmlFor="bill-cc" className={LABEL}>CC</label>
              <div className="flex-1 space-y-1">
                <input id="bill-cc" className={INPUT} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Add others to copy" />
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{companyConfig.accountingEmail} is always copied.</p>
              </div>
            </div>

            <div className="flex gap-2">
              <label htmlFor="bill-subject" className={LABEL}>Subject</label>
              <input id="bill-subject" className={INPUT} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            {editingTemplate ? (
              <div className="space-y-2 border border-neutral-300 p-3 dark:border-neutral-600">
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  Standard message for every bill. These fill in: {'{customer} {job} {month} {pay_app} {invoice} {amount} {po} {company}'}.
                  Lines with {'{po}'} are left out when a job has no PO. The CC list above is saved as the standard too.
                </p>
                <textarea className={`${INPUT} h-48 font-mono`} value={template} onChange={(e) => setTemplate(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingTemplate(false)} disabled={savingTemplate}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveTemplate} isLoading={savingTemplate}>
                    Save standard message
                  </Button>
                </div>
              </div>
            ) : (
              <textarea
                aria-label="Message"
                className={`${INPUT} h-48`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            )}

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Attached</p>
              <div className="flex items-center justify-between gap-3 border border-neutral-200 px-3 py-2 dark:border-neutral-700">
                <span className="text-sm text-neutral-800 dark:text-neutral-200">
                  Invoice {invoiceLabel}.pdf <span className="text-neutral-500 dark:text-neutral-400">(from QuickBooks when sent)</span>
                </span>
                <button type="button" onClick={previewInvoice} className={LINK}>
                  Check it
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
              {sovStatus === 'building' && (
                <p className="border border-neutral-200 px-3 py-2 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                  Building the SOV…
                </p>
              )}
              {sovStatus === 'ready' && sov && (
                <div className="flex items-center justify-between gap-3 border border-neutral-200 px-3 py-2 dark:border-neutral-700">
                  <button type="button" onClick={() => preview(sov)} className={`${LINK} min-w-0 truncate`} title="Check it">
                    {sov.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSovStatus('removed')}
                    aria-label="Remove the SOV"
                    className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {sovStatus === 'failed' && (
                <p className="border border-amber-300 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:text-amber-300">
                  Couldn't build the SOV. Print it to PDF below and attach it.
                </p>
              )}
              {sovWarning && sovStatus === 'ready' && (
                <p className="text-sm text-amber-800 dark:text-amber-300">{sovWarning}</p>
              )}
              {files.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between gap-3 border border-neutral-200 px-3 py-2 dark:border-neutral-700"
                >
                  <button type="button" onClick={() => preview(file)} className={`${LINK} min-w-0 truncate`} title="Check it">
                    {file.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove ${file.name}`}
                    className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                <button type="button" onClick={() => fileInput.current?.click()} className={LINK}>
                  <Paperclip className="h-3.5 w-3.5" />
                  Attach lien waiver or other files
                </button>
                {sovStatus !== 'ready' && sovStatus !== 'building' && (
                <a
                  href={`/pm-dashboard/${job.id}/sov?month=${bill.period}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK}
                  title="Opens the SOV printout. Save it as a PDF, then attach it here."
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print the SOV to PDF
                </a>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div>
                {isAdmin && !editingTemplate && (
                  <button type="button" onClick={() => setEditingTemplate(true)} className={LINK}>
                    Edit standard message
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={sending}>
                  Cancel
                </Button>
                <Button size="sm" onClick={send} isLoading={sending} disabled={editingTemplate || sovStatus === 'building'} leftIcon={<Send className="h-4 w-4" />}>
                  {bill.status === 'sent' ? 'Send again' : 'Send'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
