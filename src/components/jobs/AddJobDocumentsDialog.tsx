import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { uploadWithProgress } from "@/lib/uploadWithProgress";

/** What the job-documents folder accepts (its storage settings). */
const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png", "gif", "txt"];
const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

type Status = "waiting" | "uploading" | "done" | "error";
interface Item {
  key: string;
  file: File;
  status: Status;
  percent: number;
  error?: string;
}

/** What a new document row needs, whichever table it goes in. */
export interface NewDocumentRow {
  name: string;
  file_url: string;
  file_path: string;
  file_type: string;
  file_size: number;
  category: string;
}

interface Props {
  /** Tag the files get; null keeps the window closed. */
  category: string | null;
  categoryLabel: string;
  /** Files dropped on the Documents card; they start uploading when the window opens. */
  initialFiles?: File[];
  /** Folder inside job-documents, e.g. "miscellaneous/<job id>" or "opportunities/<quote id>". */
  pathPrefix: string;
  /** Saves the document's row (job or quote table). Throw to report a failure. */
  saveRow: (row: NewDocumentRow) => Promise<void>;
  onClose: () => void;
  /** Called after each file is added, to refresh the list. */
  onUploaded: () => void;
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export default function AddJobDocumentsDialog({
  category,
  categoryLabel,
  initialFiles,
  pathPrefix,
  saveRow,
  onClose,
  onUploaded,
}: Props) {
  const [items, setItems] = useState<Item[]>([]);
  // Same list, readable from the upload loop without waiting for a render.
  const itemsRef = useRef<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const open = category !== null;

  const setList = (next: Item[]) => {
    itemsRef.current = next;
    setItems(next);
  };

  // Fresh list each time the window opens, starting any files dropped on the card.
  useEffect(() => {
    if (!open) return;
    setList([]);
    if (initialFiles?.length) addFiles(initialFiles);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key: string, patch: Partial<Item>) =>
    setList(itemsRef.current.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const uploadOne = async (item: Item) => {
    if (!category) return;
    update(item.key, { status: "uploading", percent: 0 });
    const file = item.file;
    const unique = Math.random().toString(36).slice(2, 8);
    const filePath = `${pathPrefix}/${Date.now()}_${unique}.${extensionOf(file.name)}`;
    try {
      await uploadWithProgress("job-documents", filePath, file, (percent) =>
        update(item.key, { percent }),
      );
      const {
        data: { publicUrl },
      } = supabase.storage.from("job-documents").getPublicUrl(filePath);
      try {
        await saveRow({
          name: file.name.replace(/\.[^.]+$/, "") || file.name,
          file_url: publicUrl,
          file_path: filePath,
          file_type: file.type,
          file_size: file.size,
          category,
        });
      } catch (rowError) {
        // Don't leave a file with no row pointing at it
        await supabase.storage.from("job-documents").remove([filePath]);
        throw rowError;
      }
      update(item.key, { status: "done", percent: 100 });
      onUploaded();
    } catch (err) {
      console.error("Error adding document:", file.name, err);
      update(item.key, {
        status: "error",
        error: err instanceof Error ? err.message : "Didn't upload. Try again.",
      });
    }
  };

  // One at a time, in the order added. Files dropped mid-way join the line.
  const pump = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      for (;;) {
        const next = itemsRef.current.find((i) => i.status === "waiting");
        if (!next) break;
        await uploadOne(next);
      }
    } finally {
      busy.current = false;
    }
  };

  const addFiles = (list: FileList | File[]) => {
    const files = Array.from(list);
    if (files.length === 0) return;
    const added: Item[] = files.map((file, idx) => {
      const key = `${Date.now()}-${idx}-${file.name}`;
      if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name)))
        return { key, file, status: "error", percent: 0, error: "This file type isn't accepted." };
      if (file.size > MAX_BYTES)
        return { key, file, status: "error", percent: 0, error: "Over 50 MB." };
      return { key, file, status: "waiting", percent: 0 };
    });
    setList([...itemsRef.current, ...added]);
    void pump();
  };

  const uploading = items.some((i) => i.status === "uploading" || i.status === "waiting");
  const addedCount = items.filter((i) => i.status === "done").length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !uploading) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add {categoryLabel}</DialogTitle>
          <DialogDescription>
            Each file is added tagged {categoryLabel}, named after the file. Rename it later with Edit.
          </DialogDescription>
        </DialogHeader>

        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            if (!dragging) setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-none border-2 border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            dragging
              ? "border-brand bg-brand/5"
              : "border-neutral-300 hover:border-neutral-400 dark:border-neutral-600 dark:hover:border-neutral-500"
          }`}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-none bg-brand/10">
            <Upload className="h-5 w-5 text-brand" aria-hidden="true" />
          </div>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            {dragging ? (
              "Drop to add"
            ) : (
              <>
                Drag files here or{" "}
                <span className="font-semibold text-neutral-900 underline underline-offset-2 dark:text-white">
                  choose files
                </span>
              </>
            )}
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            // Its click would bubble to the drop area and open the picker again
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        <div className="flex justify-between gap-4 text-xs text-neutral-500 dark:text-neutral-400">
          <span>PDF, Word, Excel, JPG, PNG, GIF, text</span>
          <span>Up to 50 MB each</span>
        </div>

        {items.length > 0 && (
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {items.map((item) => (
              <li
                key={item.key}
                className="border border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-800/60"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                      {item.file.name}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {item.status === "error" ? (
                        <span className="text-red-600 dark:text-red-400">{item.error}</span>
                      ) : (
                        formatSize(item.file.size)
                      )}
                    </p>
                  </div>
                  {item.status === "done" && (
                    <span className="flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Added
                    </span>
                  )}
                  {item.status === "error" && (
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-label="Didn't upload" />
                  )}
                  {(item.status === "uploading" || item.status === "waiting") && (
                    <span className="w-10 text-right text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                      {item.status === "waiting" ? "..." : `${item.percent}%`}
                    </span>
                  )}
                </div>
                {(item.status === "uploading" || item.status === "waiting") && (
                  <div className="mt-2 h-1.5 w-full bg-neutral-200 dark:bg-neutral-700">
                    <div
                      className="h-full bg-brand transition-[width] duration-200"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button onClick={onClose} disabled={uploading}>
            {uploading
              ? "Uploading..."
              : addedCount > 0
                ? `Done (${addedCount} added)`
                : "Done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
