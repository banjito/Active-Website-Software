import React, { useEffect, useRef, useState } from "react";
import { Camera, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/toast";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { deriveReportPathParts, toJpeg } from "./reportPhotoUtils";

export { deriveReportPathParts, toJpeg } from "./reportPhotoUtils";

export const MAX_REPORT_PHOTOS = 5;

const BUCKET = "job-documents";
const PHOTOS_CHANGED_EVENT = "report-photos-changed";

export interface ReportPhoto {
  name: string;
  url: string;
}

const photosFolder = (parts: { jobId: string; slug: string; reportId: string }) =>
  `report-photos/${parts.jobId}/${parts.slug}/${parts.reportId}`;

export const listReportPhotos = async (): Promise<ReportPhoto[]> => {
  const parts = deriveReportPathParts();
  if (!parts) return [];
  const folder = photosFolder(parts);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(folder, { sortBy: { column: "name", order: "asc" } });
  if (error || !data) return [];
  return data
    .filter((f) => f.name && !f.name.startsWith("."))
    .map((f) => ({
      name: f.name,
      url: supabase.storage.from(BUCKET).getPublicUrl(`${folder}/${f.name}`)
        .data.publicUrl,
    }));
};

const notifyPhotosChanged = () => {
  window.dispatchEvent(new CustomEvent(PHOTOS_CHANGED_EVENT));
};

interface ReportPhotosButtonProps {
  /** Tooltip handlers applied to the button only (not the modal). */
  onButtonMouseEnter?: React.MouseEventHandler;
  onButtonMouseMove?: React.MouseEventHandler;
  onButtonMouseLeave?: () => void;
}

/**
 * Camera button for the report headbar. Opens a modal to attach up to
 * MAX_REPORT_PHOTOS images to the report. Fully self-contained: identifies
 * the report from the URL, so no per-report wiring is needed.
 */
export const ReportPhotosButton: React.FC<ReportPhotosButtonProps> = ({
  onButtonMouseEnter,
  onButtonMouseMove,
  onButtonMouseLeave,
}) => {
  // Re-derived every render so the button picks up the saved id after the
  // route changes from a new-report URL to the saved report's URL.
  const pathParts = deriveReportPathParts();
  const folderKey = pathParts ? photosFolder(pathParts) : null;
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setPhotos(await listReportPhotos());
  };

  useEffect(() => {
    if (folderKey) refresh();
    else setPhotos([]);
  }, [folderKey]);

  const handleOpen = () => {
    onButtonMouseLeave?.();
    if (!pathParts) {
      toast({
        title: "Save the report first",
        description: "Photos can be attached once the report has been saved.",
        variant: "warning",
      });
      return;
    }
    setIsOpen(true);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!pathParts) return;
    if (!files || files.length === 0) return;
    const remaining = MAX_REPORT_PHOTOS - photos.length;
    if (remaining <= 0) {
      toast({
        title: "Photo limit reached",
        description: `A report can have up to ${MAX_REPORT_PHOTOS} photos. Delete one to add another.`,
        variant: "destructive",
      });
      return;
    }

    const selected = Array.from(files).slice(0, remaining);
    if (selected.length < files.length) {
      toast({
        title: "Some photos skipped",
        description: `Only ${remaining} more photo${remaining === 1 ? "" : "s"} can be added (max ${MAX_REPORT_PHOTOS}).`,
        variant: "warning",
      });
    }

    setUploading(true);
    try {
      const folder = photosFolder(pathParts);
      for (const file of selected) {
        const jpeg = await toJpeg(file);
        const safeName = jpeg.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(`${folder}/${Date.now()}_${safeName}`, jpeg, {
            cacheControl: "3600",
            upsert: false,
          });
        if (error) throw error;
      }
      await refresh();
      notifyPhotosChanged();
    } catch (err: any) {
      console.error("Report photo upload failed:", err);
      toast({
        title: "Upload failed",
        description: err?.message || "Could not upload the photo.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (name: string) => {
    if (!pathParts) return;
    setDeletingName(name);
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .remove([`${photosFolder(pathParts)}/${name}`]);
      if (error) throw error;
      await refresh();
      notifyPhotosChanged();
    } catch (err: any) {
      console.error("Report photo delete failed:", err);
      toast({
        title: "Delete failed",
        description: err?.message || "Could not delete the photo.",
        variant: "destructive",
      });
    } finally {
      setDeletingName(null);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        onMouseEnter={onButtonMouseEnter}
        onMouseMove={onButtonMouseMove}
        onMouseLeave={onButtonMouseLeave}
        className="relative px-2 py-2 text-sm rounded-none text-white bg-neutral-600 border border-neutral-600 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-500"
        title={onButtonMouseEnter ? undefined : "Report Photos"}
        aria-label="Report Photos"
        data-flag-target="Photos"
      >
        <Camera className="w-6 h-6" />
        {photos.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
            {photos.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-dark-150 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Report Photos ({photos.length}/{MAX_REPORT_PHOTOS})
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-6">
              {photos.length === 0 && !uploading ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-8">
                  No photos attached. Photos print below the Comments section.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {photos.map((photo) => (
                    <div
                      key={photo.name}
                      className="relative group border border-neutral-200 dark:border-neutral-700"
                    >
                      <img
                        src={photo.url}
                        alt="Report photo"
                        className="h-36 w-full object-cover"
                      />
                      <button
                        onClick={() => {
                          if (window.confirm("Delete this photo?"))
                            handleDelete(photo.name);
                        }}
                        disabled={deletingName === photo.name}
                        className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center bg-red-600 text-white opacity-0 touch:opacity-100 group-hover:opacity-100 hover:bg-red-700 disabled:opacity-50"
                        title="Delete photo"
                      >
                        {deletingName === photo.name ? (
                          <LoadingSpinner size="xs" variant="light" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-neutral-200 dark:border-neutral-700 px-6 py-4">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Up to {MAX_REPORT_PHOTOS} photos. Printed below Comments.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || photos.length >= MAX_REPORT_PHOTOS}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand hover:bg-brand/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <LoadingSpinner size="xs" variant="light" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {uploading ? "Uploading..." : "Add Photos"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/**
 * Print-only photo grid, rendered by ReportWrapper after the report body so
 * it lands directly below the Comments section (the last printed section in
 * the standard report layout). Sized to stay well inside the 7.5in printable
 * width of the letter page.
 */
export const ReportPhotosPrintSection: React.FC = () => {
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);

  useEffect(() => {
    if (!deriveReportPathParts()) return;
    const refresh = async () => setPhotos(await listReportPhotos());
    refresh();
    window.addEventListener(PHOTOS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PHOTOS_CHANGED_EVENT, refresh);
  }, []);

  if (photos.length === 0) return null;

  return (
    <div className="report-photos-print hidden print:block">
      <h2
        className="font-bold text-black"
        style={{
          fontSize: "11px",
          borderBottom: "1px solid #000",
          paddingBottom: "2px",
          marginBottom: "8px",
          pageBreakAfter: "avoid",
          breakAfter: "avoid",
        }}
      >
        Photographs
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.2in" }}>
        {photos.map((photo) => (
          <div
            key={photo.name}
            style={{
              pageBreakInside: "avoid",
              breakInside: "avoid",
            }}
          >
            <img
              src={photo.url}
              alt="Report photograph"
              style={{
                maxWidth: "3.5in",
                maxHeight: "2.8in",
                width: "auto",
                height: "auto",
                objectFit: "contain",
                border: "1px solid #000",
                display: "block",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
