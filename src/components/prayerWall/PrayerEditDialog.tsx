import React, { useState } from "react";
import { Dialog } from "@headlessui/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  PRAYER_BODY_MAX,
  PRAYER_TITLE_MAX,
  PrayerRequest,
} from "@/services/prayerWallService";

interface PrayerEditDialogProps {
  request: PrayerRequest;
  onClose: () => void;
  onSave: (
    request: PrayerRequest,
    input: { title: string; body: string },
  ) => Promise<void>;
}

/**
 * Rendered by the page, not the card: the feed swaps to a spinner whenever the
 * tab regains focus, which would unmount a card and lose unsaved edits.
 */
export function PrayerEditDialog({ request, onClose, onSave }: PrayerEditDialogProps) {
  const [title, setTitle] = useState(request.title ?? "");
  const [body, setBody] = useState(request.body);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(request, { title, body });
      onClose();
    } catch {
      // The page already showed the error. Stay open so the text isn't lost.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={() => !saving && onClose()} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-lg rounded-none bg-white dark:bg-neutral-900 p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white">
              Edit request
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-neutral-400 hover:text-neutral-500 dark:hover:text-neutral-300"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <Input
            id="prayer-edit-title"
            label="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, PRAYER_TITLE_MAX))}
            maxLength={PRAYER_TITLE_MAX}
            disabled={saving}
            className="rounded-none"
          />
          <Textarea
            id="prayer-edit-body"
            label="Request"
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, PRAYER_BODY_MAX))}
            maxLength={PRAYER_BODY_MAX}
            rows={6}
            disabled={saving}
            className="rounded-none"
          />
          <div className="-mt-3 text-right text-xs text-neutral-500 dark:text-neutral-400">
            {body.length}/{PRAYER_BODY_MAX}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              isLoading={saving}
              disabled={!body.trim()}
            >
              Save
            </Button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

export default PrayerEditDialog;
