import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ImagePlus, Pencil, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";
import { describeSupabaseError } from "@/lib/supabaseRetry";
import {
  ACTION_ITEM_CATEGORY_LABELS,
  ACTION_ITEM_PRIORITY_LABELS,
  ACTION_ITEM_STATUS_LABELS,
  ACTION_ITEM_STATUS_NOTE_HINTS,
  isOpenActionItem,
  type ActionItem,
  type ActionItemCategory,
  type ActionItemDetail,
  type ActionItemPriority,
  type ActionItemStatus,
  addActionItemNote,
  addActionItemRecipients,
  createActionItem,
  fetchActionItemDetail,
  fetchActionItems,
  fetchDefaultRecipients,
  markActionItemSeen,
  notifyActionItemsChanged,
  setActionItemStatus,
  updateActionItemDetails,
  uploadActionItemPhotos,
} from "@/services/reportActionItemService";

/**
 * Action items on one report: things that still need doing or telling the
 * customer even though the report passes. Lists the report's items, adds new
 * ones (same fields as the issue/feature form) and moves them along.
 * Opened from the report toolbar, or imperatively from the review dialog.
 */
export interface ActionItemsDialogProps {
  assetId: string;
  /** For the default people to notify (job PM and lead). */
  jobId?: string | null;
  /** "26103-203"; null when the report has no number yet. */
  reportCode: string | null;
  reportName?: string;
  /** Passed in because the imperative mount has no auth context. */
  userId: string;
  /** Open straight to this item (e.g. from the notification bell). */
  initialItemId?: string | null;
  onClose: () => void;
}

type View =
  | { mode: "list" }
  | { mode: "new" }
  | { mode: "detail"; itemId: string }
  | { mode: "edit"; itemId: string };

interface UserOption {
  id: string;
  name: string;
}

const STATUS_STYLES: Record<ActionItemStatus, string> = {
  unaddressed: "bg-brand/10 text-brand",
  verbally_communicated:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  formally_notified:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  closed:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  archived:
    "bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300",
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const errorText = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? describeSupabaseError(e as any)
    : e instanceof Error
      ? e.message
      : "Unknown error";

export const StatusPill: React.FC<{ status: ActionItemStatus }> = ({
  status,
}) => (
  <span
    className={`inline-flex items-center rounded-none px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_STYLES[status]}`}
  >
    {ACTION_ITEM_STATUS_LABELS[status]}
  </span>
);

let usersCache: UserOption[] | null = null;

async function loadUsers(): Promise<UserOption[]> {
  if (usersCache) return usersCache;
  const { data } = await supabase
    .schema("common")
    .from("profiles")
    .select("id, full_name, email");
  usersCache = (data || [])
    .filter((p: any) => p.id && (p.full_name || p.email))
    .map((p: any) => ({
      id: p.id,
      name: p.full_name || p.email.split("@")[0],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return usersCache;
}

/** Search box + chips for picking people, like the issue form's interested parties. */
const PeoplePicker: React.FC<{
  inputId: string;
  users: UserOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}> = ({ inputId, users, selected, onChange }) => {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return users
      .filter((u) => !selected.includes(u.id) && u.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, users, selected]);
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name || "Unknown";

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-none border border-neutral-300 dark:border-dark-200 bg-neutral-50 dark:bg-dark-100 px-2 py-0.5 text-xs text-neutral-800 dark:text-neutral-200"
            >
              {nameOf(id)}
              <button
                type="button"
                aria-label={`Remove ${nameOf(id)}`}
                onClick={() => onChange(selected.filter((s) => s !== id))}
                className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name..."
          className="form-input w-full rounded-none"
          autoComplete="off"
        />
        {matches.length > 0 && (
          <div className="absolute z-10 mt-1 w-full border border-neutral-200 dark:border-dark-200 bg-white dark:bg-dark-150 shadow-lg">
            {matches.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  onChange([...selected, u.id]);
                  setQuery("");
                }}
                className="block w-full px-3 py-2 text-left text-sm text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-dark-100"
              >
                {u.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/** Add or edit form. Fields match the issue/feature request form. */
const ItemForm: React.FC<{
  assetId: string;
  jobId?: string | null;
  userId: string;
  nextCode: string | null;
  editing?: ActionItem;
  onSaved: (itemId: string) => void;
  onCancel: () => void;
}> = ({ assetId, jobId, userId, nextCode, editing, onSaved, onCancel }) => {
  const [title, setTitle] = useState(editing?.title || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [category, setCategory] = useState<ActionItemCategory>(
    editing?.category || "cosmetic_damage",
  );
  const [priority, setPriority] = useState<ActionItemPriority>(
    editing?.priority || "normal",
  );
  const [notify, setNotify] = useState<string[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    loadUsers().then((list) => !cancelled && setUsers(list));
    if (jobId) {
      fetchDefaultRecipients(jobId).then(
        (ids) =>
          !cancelled &&
          setNotify((prev) =>
            Array.from(new Set([...prev, ...ids.filter((id) => id !== userId)])),
          ),
      );
    }
    return () => {
      cancelled = true;
    };
  }, [editing, jobId, userId]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateActionItemDetails(editing.id, {
          title,
          description,
          category,
          priority,
        });
        notifyActionItemsChanged(assetId);
        onSaved(editing.id);
        return;
      }
      const item = await createActionItem({
        assetId,
        title,
        description,
        category,
        priority,
        notifyUserIds: notify,
      });
      if (files.length > 0) {
        const failed = await uploadActionItemPhotos(item.id, files, userId);
        if (failed > 0) {
          toast({
            title: `${failed} photo${failed === 1 ? "" : "s"} didn't upload`,
            description: "Open the item and add them again.",
            variant: "warning",
          });
        }
      }
      toast({ title: `Action item ${item.item_code} added`, variant: "success" });
      notifyActionItemsChanged(assetId);
      onSaved(item.id);
    } catch (e) {
      toast({
        title: editing ? "Couldn't save changes" : "Couldn't add action item",
        description: errorText(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {!editing && nextCode && (
        <span className="self-start rounded-none bg-brand/10 px-2 py-1 font-mono text-xs text-brand">
          Will be #{nextCode}
        </span>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="action-item-title" className="form-label">
          Title
        </label>
        <input
          id="action-item-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Brief summary, e.g. Dented door on section 2"
          className="form-input w-full rounded-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="action-item-description" className="form-label">
          Description
        </label>
        <textarea
          id="action-item-description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What it is, where it is, and what the customer should know"
          className="form-input w-full rounded-none resize-y"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="action-item-category" className="form-label">
            Category
          </label>
          <select
            id="action-item-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ActionItemCategory)}
            className="form-input w-full rounded-none"
          >
            {Object.entries(ACTION_ITEM_CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="action-item-priority" className="form-label">
            Priority
          </label>
          <select
            id="action-item-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as ActionItemPriority)}
            className="form-input w-full rounded-none"
          >
            {Object.entries(ACTION_ITEM_PRIORITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!editing && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="action-item-notify" className="form-label">
              Notify
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              The job's PM and lead are added for you when they can be found.
            </p>
            <PeoplePicker
              inputId="action-item-notify"
              users={users}
              selected={notify}
              onChange={setNotify}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="action-item-photos" className="form-label">
              Photos
            </label>
            <input
              id="action-item-photos"
              type="file"
              accept="image/jpeg,image/png,image/gif"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="text-sm text-neutral-700 dark:text-neutral-300"
            />
          </div>
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} isLoading={saving} disabled={!title.trim()}>
          {editing ? "Save changes" : "Add action item"}
        </Button>
      </div>
    </div>
  );
};

/** One item: details, photos, who was told, its timeline, and status/note controls. */
const ItemDetailView: React.FC<{
  item: ActionItem;
  userId: string;
  onEdit: () => void;
  onChanged: () => void;
}> = ({ item, userId, onEdit, onChanged }) => {
  const [detail, setDetail] = useState<ActionItemDetail | null>(null);
  const [status, setStatus] = useState<ActionItemStatus>(item.status);
  const [statusNote, setStatusNote] = useState("");
  const [note, setNote] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [addPeople, setAddPeople] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchActionItemDetail(item);
      setDetail(d);
      // Opening an item you were told about clears it from your bell
      if (d.recipients.some((r) => r.user_id === userId && !r.seen_at)) {
        await markActionItemSeen(item.id, userId);
        notifyActionItemsChanged(item.asset_id);
      }
    } catch (e) {
      toast({
        title: "Couldn't load this action item",
        description: errorText(e),
        variant: "destructive",
      });
    }
  }, [item, userId]);

  useEffect(() => {
    setStatus(item.status);
    load();
  }, [item, load]);

  useEffect(() => {
    loadUsers().then(setUsers);
  }, []);

  const run = async (work: () => Promise<void>, failTitle: string) => {
    setBusy(true);
    try {
      await work();
      notifyActionItemsChanged(item.asset_id);
      onChanged();
      await load();
    } catch (e) {
      toast({ title: failTitle, description: errorText(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const describeUpdate = (u: ActionItemDetail["updates"][number]) => {
    if (!u.to_status) return "Note";
    if (!u.from_status) return "Opened";
    return `${ACTION_ITEM_STATUS_LABELS[u.from_status]} → ${ACTION_ITEM_STATUS_LABELS[u.to_status]}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-brand">
            #{item.item_code}
          </span>
          <StatusPill status={item.status} />
          {(item.priority === "high" || item.priority === "urgent") && (
            <span className="text-xs font-semibold text-red-600 dark:text-red-400">
              {ACTION_ITEM_PRIORITY_LABELS[item.priority]} priority
            </span>
          )}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h4 className="text-base font-semibold text-neutral-900 dark:text-dark-900 break-words min-w-0">
            {item.title}
          </h4>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            leftIcon={<Pencil className="h-3.5 w-3.5" />}
          >
            Edit
          </Button>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {ACTION_ITEM_CATEGORY_LABELS[item.category]} ·{" "}
          {[detail?.createdByName, formatWhen(item.created_at)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {item.description && (
          <p className="text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words">
            {item.description}
          </p>
        )}
      </div>

      {detail === null ? (
        <div className="flex justify-center py-4">
          <LoadingSpinner size="sm" />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <p className="form-label">Photos</p>
            {detail.photos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {detail.photos.map((p) => (
                  <a
                    key={p.id}
                    href={p.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square overflow-hidden border border-neutral-200 dark:border-dark-200"
                    title={p.file_name || "Photo"}
                  >
                    <img
                      src={p.file_url}
                      alt={p.file_name || "Action item photo"}
                      className="h-full w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
            <label className="inline-flex items-center gap-2 self-start cursor-pointer text-sm text-brand hover:underline">
              <ImagePlus className="h-4 w-4" />
              Add photos
              <input
                id={`action-item-add-photos-${item.id}`}
                type="file"
                accept="image/jpeg,image/png,image/gif"
                multiple
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = "";
                  if (files.length === 0) return;
                  run(async () => {
                    const failed = await uploadActionItemPhotos(item.id, files, userId);
                    if (failed > 0) throw new Error(`${failed} photo(s) didn't upload`);
                  }, "Couldn't add photos");
                }}
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <p className="form-label">Notified</p>
            {detail.recipients.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Nobody yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {detail.recipients.map((r) => (
                  <li
                    key={r.user_id}
                    className="rounded-none border border-neutral-200 dark:border-dark-200 px-2 py-0.5 text-xs text-neutral-700 dark:text-neutral-300"
                    title={r.seen_at ? `Seen ${formatWhen(r.seen_at)}` : "Not seen yet"}
                  >
                    {r.name || "Unknown"} {r.seen_at ? "· seen" : "· not seen"}
                  </li>
                ))}
              </ul>
            )}
            <PeoplePicker
              inputId={`action-item-add-people-${item.id}`}
              users={users.filter(
                (u) => !detail.recipients.some((r) => r.user_id === u.id),
              )}
              selected={addPeople}
              onChange={setAddPeople}
            />
            {addPeople.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await addActionItemRecipients(item.id, addPeople);
                    setAddPeople([]);
                  }, "Couldn't notify those people")
                }
              >
                Notify {addPeople.length === 1 ? "1 person" : `${addPeople.length} people`}
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-neutral-200 dark:border-dark-200 pt-4">
            <label htmlFor={`action-item-status-${item.id}`} className="form-label">
              Status
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Changing it needs a short note: who was told and/or how (email,
              AMP report, the customer's system).
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                id={`action-item-status-${item.id}`}
                value={status}
                onChange={(e) => setStatus(e.target.value as ActionItemStatus)}
                className="form-input rounded-none sm:w-48"
              >
                {Object.entries(ACTION_ITEM_STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                id={`action-item-status-note-${item.id}`}
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder={
                  status === item.status
                    ? "Pick a new status first"
                    : `Required: ${ACTION_ITEM_STATUS_NOTE_HINTS[status]}`
                }
                aria-label="Who was told, and/or how (required)"
                className="form-input flex-1 rounded-none"
              />
              <Button
                disabled={busy || status === item.status || !statusNote.trim()}
                onClick={() =>
                  run(async () => {
                    await setActionItemStatus(item.id, status, statusNote);
                    setStatusNote("");
                  }, "Couldn't change status")
                }
              >
                Save
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="form-label">Timeline</p>
            <ol className="flex flex-col gap-3">
              {detail.updates.map((u) => (
                <li key={u.id} className="text-sm">
                  <p className="font-medium text-neutral-900 dark:text-dark-900">
                    {describeUpdate(u)}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {[u.updated_by_name, formatWhen(u.created_at)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {u.note && (
                    <p className="mt-1 bg-neutral-100 dark:bg-dark-100 px-3 py-2 text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words">
                      {u.note}
                    </p>
                  )}
                </li>
              ))}
            </ol>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id={`action-item-note-${item.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note"
                className="form-input flex-1 rounded-none"
              />
              <Button
                variant="outline"
                disabled={busy || !note.trim()}
                onClick={() =>
                  run(async () => {
                    await addActionItemNote(item.id, note, userId);
                    setNote("");
                  }, "Couldn't add note")
                }
              >
                Add note
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const ActionItemsDialog: React.FC<ActionItemsDialogProps> = ({
  assetId,
  jobId,
  reportCode,
  reportName,
  userId,
  initialItemId,
  onClose,
}) => {
  const [items, setItems] = useState<ActionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(
    initialItemId ? { mode: "detail", itemId: initialItemId } : { mode: "list" },
  );

  const reload = useCallback(async () => {
    try {
      setItems(await fetchActionItems(assetId));
      setError(null);
    } catch (e) {
      console.error("[ActionItems] Failed to load:", e);
      setError("Couldn't load action items. Try again in a moment.");
    }
  }, [assetId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    // Capture phase so Esc doesn't also close the review dialog underneath.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const current =
    view.mode === "detail" || view.mode === "edit"
      ? items?.find((i) => i.id === view.itemId) ?? null
      : null;
  const nextCode = reportCode
    ? `${reportCode}-${Math.max(0, ...(items || []).map((i) => i.item_number)) + 1}`
    : null;
  const openCount = (items || []).filter((i) => isOpenActionItem(i.status)).length;

  const heading =
    view.mode === "new"
      ? "New action item"
      : view.mode === "edit"
        ? "Edit action item"
        : view.mode === "detail"
          ? "Action item"
          : "Action items";

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-items-title"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-none bg-white dark:bg-dark-150 shadow-xl border border-neutral-200 dark:border-dark-200">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-neutral-200 dark:border-dark-200">
          <div className="flex items-start gap-2 min-w-0">
            {view.mode !== "list" && (
              <button
                type="button"
                aria-label="Back to all action items"
                onClick={() =>
                  setView(
                    view.mode === "edit"
                      ? { mode: "detail", itemId: view.itemId }
                      : { mode: "list" },
                  )
                }
                className="mt-0.5 p-1 rounded-none text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-dark-100"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <h3
                id="action-items-title"
                className="text-base font-semibold text-neutral-900 dark:text-dark-900"
              >
                {heading}
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 truncate">
                {[reportName, reportCode && `#${reportCode}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close action items"
            className="p-1 rounded-none text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-dark-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : items === null ? (
            <div className="flex justify-center py-6">
              <LoadingSpinner size="sm" />
            </div>
          ) : view.mode === "new" ? (
            <ItemForm
              assetId={assetId}
              jobId={jobId}
              userId={userId}
              nextCode={nextCode}
              onCancel={() => setView({ mode: "list" })}
              onSaved={async (itemId) => {
                await reload();
                setView({ mode: "detail", itemId });
              }}
            />
          ) : view.mode === "edit" && current ? (
            <ItemForm
              assetId={assetId}
              jobId={jobId}
              userId={userId}
              nextCode={null}
              editing={current}
              onCancel={() => setView({ mode: "detail", itemId: current.id })}
              onSaved={async (itemId) => {
                await reload();
                setView({ mode: "detail", itemId });
              }}
            />
          ) : view.mode === "detail" && current ? (
            <ItemDetailView
              item={current}
              userId={userId}
              onEdit={() => setView({ mode: "edit", itemId: current.id })}
              onChanged={reload}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {items.length === 0
                    ? "Things that still need doing or telling the customer, even though the report passes."
                    : `${openCount} open of ${items.length}`}
                </p>
                <Button
                  size="sm"
                  onClick={() => setView({ mode: "new" })}
                  disabled={!reportCode}
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  Add action item
                </Button>
              </div>
              {!reportCode && (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  This report has no report number yet, so it can't have action
                  items. It gets one once it's saved to a job (uploaded PDFs:
                  once sent for review).
                </p>
              )}
              {items.length > 0 && (
                <ul className="flex flex-col border-t border-neutral-200 dark:border-dark-200">
                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setView({ mode: "detail", itemId: item.id })}
                        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-neutral-200 dark:border-dark-200 px-1 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-dark-100"
                      >
                        <span className="font-mono text-xs text-brand">
                          #{item.item_code}
                        </span>
                        <span className="min-w-0 truncate text-sm text-neutral-900 dark:text-white">
                          {item.title}
                        </span>
                        <StatusPill status={item.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

/**
 * Opens the dialog outside React (the review dialog in ReportApprovalWorkflow is
 * plain HTML). Resolves when it closes, so the caller can refresh its counts.
 */
export function openActionItemsDialog(
  props: Omit<ActionItemsDialogProps, "onClose">,
): Promise<void> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    let settled = false;
    const onClose = () => {
      if (settled) return;
      settled = true;
      root.unmount();
      host.remove();
      resolve();
    };
    root.render(<ActionItemsDialog {...props} onClose={onClose} />);
  });
}

export default ActionItemsDialog;
