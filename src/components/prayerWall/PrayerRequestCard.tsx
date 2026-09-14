import React, { useState } from "react";
import { Dialog } from "@headlessui/react";
import { CheckCircle2, HeartHandshake, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { formatRelativeSafe } from "@/lib/formatRelativeSafe";
import { cn } from "@/lib/utils";
import { PRAYER_NOTE_MAX, PrayerRequest } from "@/services/prayerWallService";

interface PrayerRequestCardProps {
  request: PrayerRequest;
  busy?: boolean;
  onTogglePraying: (request: PrayerRequest) => void;
  onMarkAnswered: (request: PrayerRequest, note: string) => Promise<void>;
  onDelete: (request: PrayerRequest) => Promise<void>;
}

export function PrayerRequestCard({
  request,
  busy = false,
  onTogglePraying,
  onMarkAnswered,
  onDelete,
}: PrayerRequestCardProps) {
  const [answerOpen, setAnswerOpen] = useState(false);
  const [answerNote, setAnswerNote] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isAnswered = request.status === "answered";
  // The view already nulls author_name on anonymous rows for everyone but the
  // author, so a null here is the only signal we need.
  const authorLabel = request.author_name
    ? request.is_anonymous
      ? "Anonymous (you)"
      : request.author_name
    : "Anonymous";

  const handleAnswer = async () => {
    setSubmitting(true);
    try {
      await onMarkAnswered(request, answerNote);
      setAnswerOpen(false);
      setAnswerNote("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await onDelete(request);
      setDeleteOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className="rounded-none border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span
              className={cn(
                "font-medium",
                request.author_name
                  ? "text-neutral-900 dark:text-white"
                  : "text-neutral-500 dark:text-neutral-400 italic",
              )}
            >
              {authorLabel}
            </span>
            <span className="text-neutral-400 dark:text-neutral-500">·</span>
            <time
              dateTime={request.created_at}
              className="text-neutral-500 dark:text-neutral-400"
            >
              {formatRelativeSafe(request.created_at)}
            </time>
            {isAnswered && (
              <span className="inline-flex items-center gap-1 rounded-none bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-800 dark:text-green-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Answered
              </span>
            )}
          </div>
          {request.title && (
            <h3 className="mt-1 text-base font-semibold text-neutral-900 dark:text-white break-words">
              {request.title}
            </h3>
          )}
        </div>

        {request.is_mine && (
          <div className="flex shrink-0 items-center gap-1">
            {!isAnswered && (
              <button
                type="button"
                onClick={() => setAnswerOpen(true)}
                disabled={busy}
                className="rounded-none p-1.5 text-neutral-500 hover:text-green-700 dark:text-neutral-400 dark:hover:text-green-400 disabled:opacity-50"
                aria-label="Mark as answered"
                title="Mark as answered"
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={busy}
              className="rounded-none p-1.5 text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 disabled:opacity-50"
              aria-label="Delete request"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-neutral-800 dark:text-neutral-200">
        {request.body}
      </p>

      {isAnswered && request.answered_note && (
        <div className="mt-3 border-l-2 border-green-500 bg-green-50 dark:bg-green-900/20 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200">
          <div className="text-xs font-medium uppercase tracking-wide text-green-800 dark:text-green-300">
            How it was answered
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words">{request.answered_note}</p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onTogglePraying(request)}
          disabled={busy}
          aria-pressed={request.is_praying}
          className={cn(
            "inline-flex items-center gap-2 rounded-none border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
            request.is_praying
              ? "border-brand bg-brand text-white hover:bg-brand/90"
              : "border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:border-brand hover:text-brand",
          )}
        >
          <HeartHandshake className="h-4 w-4" />
          {request.is_praying ? "Praying" : "I'm praying for this"}
        </button>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          {request.praying_count === 1
            ? "1 person praying"
            : `${request.praying_count} people praying`}
        </span>
      </div>

      {/* Mark answered */}
      <Dialog
        open={answerOpen}
        onClose={() => !submitting && setAnswerOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-md rounded-none bg-white dark:bg-neutral-900 p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white">
                Mark as answered
              </Dialog.Title>
              <button
                type="button"
                onClick={() => setAnswerOpen(false)}
                disabled={submitting}
                className="text-neutral-400 hover:text-neutral-500 dark:hover:text-neutral-300"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Textarea
              label="How was it answered? (optional)"
              value={answerNote}
              onChange={(e) => setAnswerNote(e.target.value.slice(0, PRAYER_NOTE_MAX))}
              rows={4}
              maxLength={PRAYER_NOTE_MAX}
              className="rounded-none"
              placeholder="Share a short update"
            />
            <div className="-mt-3 text-right text-xs text-neutral-500 dark:text-neutral-400">
              {answerNote.length}/{PRAYER_NOTE_MAX}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAnswerOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleAnswer} isLoading={submitting}>
                Mark answered
              </Button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={deleteOpen}
        onClose={() => !submitting && setDeleteOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-sm rounded-none bg-white dark:bg-neutral-900 p-6 shadow-xl">
            <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white">
              Delete this request?
            </Dialog.Title>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              This removes it for everyone. It can't be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                isLoading={submitting}
              >
                Delete
              </Button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </article>
  );
}

export default PrayerRequestCard;
