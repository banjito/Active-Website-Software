import React, { useState } from 'react';
import { ExternalLink, Send } from 'lucide-react';
import type { PmJob } from '@/services/pmDashboardService';
import { openInvoicePdf, type JobBill } from '@/services/sovBillingService';
import { SendBillDialog } from './SendBillDialog';
import { monthLabel } from '@/utils/pmDashboardCalculations';
import { fmtMoney } from './shared';

// The job's billing history: one row per QuickBooks invoice made from the SOV.

const TH = 'px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400';
const TD = 'px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200';
const STATUS: Record<JobBill['status'], string> = { draft: 'Not sent', sent: 'Sent', void: 'Voided' };

export function JobBills({ bills, job, onChanged }: { bills: JobBill[]; job: PmJob; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [sending, setSending] = useState<JobBill | null>(null);

  if (bills.length === 0) return null;

  const open = async (bill: JobBill) => {
    setError(null);
    setOpening(bill.id);
    try {
      await openInvoicePdf(bill.realm_id, bill.qbo_invoice_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get the PDF.');
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="space-y-2 pt-2">
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Bills</h3>
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-700">
        <table className="w-full">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              <th className={TH}>Month</th>
              <th className={TH}>Pay app</th>
              <th className={TH}>Invoice</th>
              <th className={`${TH} text-right`}>Amount</th>
              <th className={TH}>Status</th>
              <th className={TH}>Made</th>
              <th className={TH}>
                <span className="sr-only">PDF</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {bills.map((b) => (
              <tr key={b.id} className={b.status === 'void' ? 'opacity-60' : undefined}>
                <td className={TD}>
                  {monthLabel(b.period, 'long')}
                  {b.is_test && (
                    <span className="ml-2 border border-amber-300 px-1.5 text-[10px] font-semibold uppercase leading-4 tracking-wide text-amber-700 dark:border-amber-700 dark:text-amber-400">
                      Test
                    </span>
                  )}
                </td>
                <td className={TD}>{b.application_number ? `#${b.application_number}` : ''}</td>
                <td className={TD}>{b.qbo_doc_number ? `#${b.qbo_doc_number}` : b.qbo_invoice_id}</td>
                <td className={`${TD} text-right font-mono`}>{fmtMoney(b.amount)}</td>
                <td
                  className={TD}
                  title={b.status === 'sent' && b.sent_to?.length ? `To ${b.sent_to.join(', ')}${b.sent_cc?.length ? `, copied ${b.sent_cc.join(', ')}` : ''}` : undefined}
                >
                  {STATUS[b.status]}
                  {b.status === 'sent' && b.sent_at ? ` ${new Date(b.sent_at).toLocaleDateString()}` : ''}
                </td>
                <td className={TD}>{new Date(b.created_at).toLocaleDateString()}</td>
                <td className={`${TD} whitespace-nowrap text-right`}>
                  {b.status !== 'void' && (
                    <button
                      type="button"
                      onClick={() => setSending(b)}
                      className="mr-3 inline-flex items-center gap-1 text-neutral-700 underline hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
                    >
                      <Send className="h-3 w-3" />
                      {b.status === 'sent' ? 'Send again' : 'Send'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void open(b)}
                    disabled={opening === b.id}
                    className="inline-flex items-center gap-1 text-neutral-700 underline hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-300 dark:hover:text-neutral-100"
                  >
                    {opening === b.id ? 'Opening…' : 'PDF'}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sending && (
        <SendBillDialog
          open
          onOpenChange={(open) => !open && setSending(null)}
          bill={sending}
          job={job}
          onSent={onChanged}
        />
      )}
    </div>
  );
}
