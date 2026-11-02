/**
 * Photo field: pictures placed where they belong in the report (a nameplate
 * photo next to the nameplate data, a defect next to its inspection item),
 * not only in the photo pages at the end.
 *
 * Images go to the same storage bucket as the report photos, in a folder of
 * their own so the end-of-report photo list never shows them twice. The
 * field's value is the list of { path, url, caption } as JSON text. Photos
 * need a saved report (storage is filed under the report's id).
 */

import React, { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { deriveReportPathParts, toJpeg } from "@/components/reports/common/reportPhotoUtils";

/** The storage client, loaded only when a photo is actually added or removed. */
const storage = async () => (await import("@/lib/supabase")).supabase.storage.from(BUCKET);

const BUCKET = "job-documents";
export const MAX_FIELD_PHOTOS = 6;

export interface FieldPhoto {
  path: string;
  url: string;
  caption?: string;
}

export function parsePhotos(value: unknown): FieldPhoto[] {
  if (Array.isArray(value)) return value as FieldPhoto[];
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const PhotoField: React.FC<{
  value: unknown;
  readOnly: boolean;
  onChange: (next: string) => void;
}> = ({ value, readOnly, onChange }) => {
  const photos = parsePhotos(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parts = deriveReportPathParts();
  const save = (next: FieldPhoto[]) => onChange(next.length ? JSON.stringify(next) : "");

  const upload = async (files: FileList | null) => {
    if (!files?.length || !parts) return;
    setBusy(true);
    setError(null);
    try {
      const folder = `report-photos-inline/${parts.jobId}/${parts.slug}/${parts.reportId}`;
      const added: FieldPhoto[] = [];
      for (const file of Array.from(files).slice(0, MAX_FIELD_PHOTOS - photos.length)) {
        const jpeg = await toJpeg(file);
        const path = `${folder}/${Date.now()}_${jpeg.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const bucket = await storage();
        const { error: uploadError } = await bucket.upload(path, jpeg, {
          cacheControl: "3600",
          upsert: false,
        });
        if (uploadError) throw uploadError;
        added.push({ path, url: bucket.getPublicUrl(path).data.publicUrl });
      }
      save([...photos, ...added]);
    } catch (err: any) {
      console.error("Photo upload failed:", err);
      setError(err?.message || "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (photo: FieldPhoto) => {
    save(photos.filter((p) => p.path !== photo.path));
    // Best effort: the form no longer points at it either way.
    await storage()
      .then((bucket) => bucket.remove([photo.path]))
      .catch(() => undefined);
  };

  return (
    <div className="cf-photos space-y-1">
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 print:grid-cols-3 print:gap-1">
          {photos.map((photo) => (
            <figure key={photo.path} className="relative print:break-inside-avoid">
              <img
                src={photo.url}
                alt={photo.caption || "Photo"}
                className="w-full h-32 print:h-28 object-cover border border-neutral-200 dark:border-neutral-700"
              />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(photo)}
                  className="absolute top-1 right-1 p-1 bg-white/90 border border-neutral-300 rounded-none text-neutral-600 hover:text-red-600 print:hidden"
                  title="Remove photo"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              {readOnly ? (
                photo.caption && <figcaption className="text-[10px] mt-0.5">{photo.caption}</figcaption>
              ) : (
                <>
                  <input
                    value={photo.caption ?? ""}
                    onChange={(e) =>
                      save(photos.map((p) => (p.path === photo.path ? { ...p, caption: e.target.value || undefined } : p)))
                    }
                    placeholder="Caption"
                    className="mt-0.5 w-full h-6 px-1 text-[11px] bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-900 dark:text-white print:hidden"
                  />
                  {photo.caption && (
                    <figcaption className="hidden print:block text-[10px] mt-0.5">{photo.caption}</figcaption>
                  )}
                </>
              )}
            </figure>
          ))}
        </div>
      )}
      {!readOnly && (
        <div className="print:hidden">
          {parts ? (
            photos.length < MAX_FIELD_PHOTOS && (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => upload(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                  className="h-7 px-2 flex items-center gap-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-700 dark:text-neutral-200 hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {busy ? "Uploading…" : photos.length ? "Add photo" : "Take or add photo"}
                </button>
              </>
            )
          ) : (
            <p className="text-[11px] text-neutral-500">Save the report first, then add photos here.</p>
          )}
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
};

export default PhotoField;
