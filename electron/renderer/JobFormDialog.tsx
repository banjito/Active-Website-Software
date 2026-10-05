import { useState, type FormEvent } from "react";
import {
  findJobByNumber,
  saveJob,
  type OfflineJob,
  type OfflineJobInput,
} from "./offlineJobs";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./ShellChrome";

/**
 * Create or edit a local job. Job # and customer are what every report header
 * shows, and Job # is how an exported job is matched to the online job later,
 * so both are required.
 */
export default function JobFormDialog({
  job,
  onClose,
  onSaved,
}: {
  job?: OfflineJob | null;
  onClose: () => void;
  onSaved: (jobId: string) => void;
}) {
  const [form, setForm] = useState<OfflineJobInput>({
    job_number: job?.job_number ?? "",
    title: job?.title ?? "",
    customerName: job?.customerName ?? "",
    site_address: job?.site_address ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof OfflineJobInput) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.job_number.trim() || !form.customerName.trim()) {
      setError("Job # and Customer are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const duplicate = await findJobByNumber(form.job_number, job?.id);
      if (duplicate) {
        setError(`Job # ${duplicate.job_number} already exists on this computer.`);
        return;
      }
      const id = await saveJob(form, job);
      onSaved(id);
    } catch (err) {
      console.error("Failed to save job:", err);
      setError(err instanceof Error ? err.message : "Could not save the job.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-none border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {job ? "Edit job" : "New job"}
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Use the same Job # as the main app so reports land on the right job when you
          bring them back.
        </p>

        <div className="mt-5 space-y-4">
          <Field label="Job #" required value={form.job_number} onChange={set("job_number")} autoFocus />
          <Field label="Customer" required value={form.customerName} onChange={set("customerName")} />
          <Field label="Site address" value={form.site_address} onChange={set("site_address")} />
          <Field label="Job name" value={form.title} onChange={set("title")} />
        </div>

        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryButtonClass}>
            {saving ? "Saving…" : job ? "Save" : "Create job"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        {label}
        {required && <span className="text-brand"> *</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className={inputClass}
      />
    </label>
  );
}
