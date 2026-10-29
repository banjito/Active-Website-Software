import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export const LOST_REASON_CATEGORIES = [
  { value: "price", label: "Price" },
  { value: "terms", label: "Terms and conditions" },
  { value: "competitor", label: "Competitor" },
  { value: "cancelled", label: "Project cancelled" },
  { value: "no_response", label: "No response" },
  { value: "other", label: "Other" },
] as const;

export interface LostInfo {
  lost_reason_category: string;
  lost_reason: string;
}

export function lostReasonLabel(category?: string | null) {
  if (!category) return "";
  return (
    LOST_REASON_CATEGORIES.find((c) => c.value === category)?.label ?? category
  );
}

// Columns to write alongside status = "lost".
export function lostFields(info: LostInfo, userId?: string | null) {
  return {
    lost_reason_category: info.lost_reason_category,
    lost_reason: info.lost_reason,
    lost_at: new Date().toISOString(),
    lost_by: userId ?? null,
  };
}

interface MarkLostModalProps {
  isOpen: boolean;
  quoteNumber?: string | null;
  onCancel: () => void;
  onSave: (info: LostInfo) => void | Promise<void>;
}

export default function MarkLostModal({
  isOpen,
  quoteNumber,
  onCancel,
  onSave,
}: MarkLostModalProps) {
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCategory("");
      setNote("");
      setSaving(false);
    }
  }, [isOpen]);

  const canSave = !!category && note.trim().length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({ lost_reason_category: category, lost_reason: note.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      size="sm"
      title={quoteNumber ? `Mark as lost · ${quoteNumber}` : "Mark as lost"}
    >
      <div className="space-y-4">
        <div>
          <label
            htmlFor="lost_reason_category"
            className="block text-sm font-medium text-neutral-700 dark:text-white"
          >
            Reason
          </label>
          <select
            id="lost_reason_category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
          >
            <option value="" className="dark:bg-dark-150 dark:text-white">
              Pick a reason
            </option>
            {LOST_REASON_CATEGORIES.map((c) => (
              <option
                key={c.value}
                value={c.value}
                className="dark:bg-dark-150 dark:text-white"
              >
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="lost_reason"
            className="block text-sm font-medium text-neutral-700 dark:text-white"
          >
            What happened (required)
          </label>
          <textarea
            id="lost_reason"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Customer would not remove pay-when-paid"
            className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave} isLoading={saving}>
            Mark as lost
          </Button>
        </div>
      </div>
    </Modal>
  );
}
