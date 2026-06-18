import React, { useState, useEffect, useRef } from "react";
import {
  Upload,
  X,
  Pencil,
  Trash2,
  Check,
  ImagePlus,
  Image as ImageIcon,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";
import { toast } from "../ui/toast";
import { ProfileView } from "../profile/ProfileView";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface JobPicture {
  id: string;
  job_id: string;
  user_id: string;
  image_url: string;
  storage_path?: string | null;
  storage_bucket?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  description?: string | null;
  created_at: string;
  updated_at: string;
  edited: boolean;
  user?: {
    email: string;
    displayName: string;
    profileImage?: string;
  };
}

interface JobPicturesProps {
  jobId: string;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB per image
const ACCEPTED_IMAGE_TYPES = "image/*";

// MIME types we know the Supabase bucket accepts without conversion.
// Anything outside this list (AVIF, HEIC, etc.) is converted to JPEG before upload.
const SAFE_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
]);

// Draw any browser-decodable image File onto a canvas and export as JPEG.
const convertImageFileToJpeg = async (file: File): Promise<File> => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(new Error("Unable to decode image in this browser."));
      el.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    // White background for formats with transparency going to JPEG
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Image conversion failed."))),
        "image/jpeg",
        0.92,
      );
    });

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatFileSize = (bytes: number | null | undefined): string => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getInitials = (name?: string): string => {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export default function JobPictures({ jobId }: JobPicturesProps) {
  const { user } = useAuth();
  const [pictures, setPictures] = useState<JobPicture[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Edit state (description editing)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");

  // Profile view
  const [profileViewUserId, setProfileViewUserId] = useState<string | null>(
    null,
  );

  // Fetch pictures and attach lightweight user info (name + profile image)
  const fetchPictures = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("job_pictures")
        .select("*")
        .eq("job_id", jobId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const withUsers = await Promise.all(
        (data || []).map(async (pic: any) => {
          let displayName = "";
          let profileImage: string | undefined;
          let email = "";

          try {
            const { data: profile } = await supabase
              .schema("common")
              .from("profiles")
              .select("id, full_name, email, avatar_url, profile_image")
              .eq("id", pic.user_id)
              .maybeSingle();

            if (profile) {
              email = (profile as any).email || "";
              displayName =
                (profile as any).full_name || email?.split("@")[0] || "";
              profileImage =
                (profile as any).avatar_url || (profile as any).profile_image;
            }
          } catch {
            /* ignore */
          }

          if (!displayName || !profileImage) {
            try {
              const { data: metaData } = await supabase
                .schema("common")
                .rpc("get_user_metadata", { p_user_id: pic.user_id });
              if (metaData) {
                const m = metaData as any;
                if (!email) email = m.email || "";
                if (!displayName)
                  displayName =
                    m.full_name || m.name || email?.split("@")[0] || "";
                if (!profileImage)
                  profileImage = m.profile_image || m.avatar_url;
              }
            } catch {
              /* ignore */
            }
          }

          if (!displayName) {
            displayName = pic.user_id
              ? `User ${pic.user_id.substring(0, 8)}`
              : "Unknown User";
          }

          return {
            ...pic,
            user: { email, displayName, profileImage },
          } as JobPicture;
        }),
      );

      setPictures(withUsers);
    } catch (err) {
      console.error("Error fetching job pictures:", err);
      toast({
        title: "Error",
        description: "Failed to load pictures.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPictures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Clean up preview URL when file changes / modal closes
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const openUploadModal = () => {
    setSelectedFile(null);
    setUploadDescription("");
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setShowUploadModal(true);
  };

  const closeUploadModal = () => {
    setShowUploadModal(false);
    setSelectedFile(null);
    setUploadDescription("");
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: "Images must be smaller than 15MB.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const uploadToStorage = async (
    originalFile: File,
  ): Promise<{
    url: string;
    path: string;
    bucket: string;
    file: File;
  } | null> => {
    // If the MIME type isn't in our safe list, convert to JPEG up front.
    let file = originalFile;
    if (!SAFE_IMAGE_MIME_TYPES.has(file.type)) {
      try {
        file = await convertImageFileToJpeg(file);
      } catch (err) {
        console.warn("Pre-upload conversion failed, will try original:", err);
      }
    }

    const buildPath = (f: File) => {
      const ext = f.name.includes(".") ? f.name.split(".").pop() : "jpg";
      const unique = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      return `job-pictures/${jobId}/${unique}.${ext}`;
    };

    const tryUpload = async (
      f: File,
      bucket: string,
    ): Promise<{ path: string; error: any }> => {
      const path = buildPath(f);
      const { error } = await supabase.storage.from(bucket).upload(path, f, {
        cacheControl: "3600",
        upsert: false,
        contentType: f.type || "image/jpeg",
      });
      return { path, error };
    };

    const isMimeError = (err: any) => {
      const msg = (err?.message || "").toString().toLowerCase();
      return msg.includes("mime") || msg.includes("content type");
    };

    try {
      let bucket = "job-documents";
      let { path, error } = await tryUpload(file, bucket);

      // If the bucket rejected the MIME type, convert to JPEG and retry.
      if (error && isMimeError(error) && file.type !== "image/jpeg") {
        try {
          file = await convertImageFileToJpeg(originalFile);
          ({ path, error } = await tryUpload(file, bucket));
        } catch (convErr) {
          console.warn("Retry conversion failed:", convErr);
        }
      }

      // Fallback to 'documents' bucket if 'job-documents' still failed.
      if (error) {
        console.warn(
          "job-documents upload failed, trying documents bucket",
          error,
        );
        bucket = "documents";
        ({ path, error } = await tryUpload(file, bucket));

        if (error && isMimeError(error) && file.type !== "image/jpeg") {
          try {
            file = await convertImageFileToJpeg(originalFile);
            ({ path, error } = await tryUpload(file, bucket));
          } catch (convErr) {
            console.warn(
              "Retry conversion failed (documents bucket):",
              convErr,
            );
          }
        }
      }

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(path);

      return { url: publicUrl, path, bucket, file };
    } catch (err) {
      console.error("Upload error:", err);
      return null;
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile || !user?.id) return;
    setUploading(true);
    try {
      const uploaded = await uploadToStorage(selectedFile);
      if (!uploaded) {
        toast({
          title: "Upload failed",
          description: "Could not upload the image. Please try again.",
          variant: "destructive",
        });
        return;
      }

      const insertPayload: any = {
        job_id: jobId,
        user_id: user.id,
        image_url: uploaded.url,
        storage_path: uploaded.path,
        storage_bucket: uploaded.bucket,
        file_name: uploaded.file.name,
        file_type: uploaded.file.type,
        file_size: uploaded.file.size,
        description: uploadDescription.trim() || null,
      };

      const { data, error } = await supabase
        .schema("neta_ops")
        .from("job_pictures")
        .insert(insertPayload)
        .select()
        .single();

      if (error) throw error;

      // Merge current user's display info for immediate render
      const meta = (user.user_metadata || {}) as any;
      const newPicture: JobPicture = {
        ...(data as any),
        user: {
          email: user.email || "",
          displayName:
            meta.full_name || meta.name || user.email?.split("@")[0] || "You",
          profileImage: meta.profileImage || meta.avatar_url,
        },
      };

      setPictures((prev) => [newPicture, ...prev]);
      toast({
        title: "Picture uploaded",
        description: "Your picture has been added to the job.",
      });
      closeUploadModal();
    } catch (err: any) {
      console.error("Error uploading picture:", err);
      toast({
        title: "Error",
        description: err?.message || "Failed to upload picture.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const startEditDescription = (pic: JobPicture) => {
    setEditingId(pic.id);
    setEditDescription(pic.description || "");
  };

  const cancelEditDescription = () => {
    setEditingId(null);
    setEditDescription("");
  };

  const saveEditDescription = async (id: string) => {
    try {
      const newDesc = editDescription.trim() || null;
      const { error } = await supabase
        .schema("neta_ops")
        .from("job_pictures")
        .update({ description: newDesc })
        .eq("id", id);
      if (error) throw error;

      setPictures((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                description: newDesc,
                edited: true,
                updated_at: new Date().toISOString(),
              }
            : p,
        ),
      );
      cancelEditDescription();
      toast({ title: "Description updated" });
    } catch (err: any) {
      console.error("Error updating description:", err);
      toast({
        title: "Error",
        description: err?.message || "Failed to update description.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (pic: JobPicture) => {
    if (!user?.id) return;
    if (pic.user_id !== user.id) {
      toast({
        title: "Not allowed",
        description: "You can only delete your own pictures.",
        variant: "destructive",
      });
      return;
    }
    if (!confirm("Delete this picture? This cannot be undone.")) return;

    try {
      // Soft delete the DB record
      const { error } = await supabase
        .schema("neta_ops")
        .from("job_pictures")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", pic.id)
        .eq("user_id", user.id);
      if (error) throw error;

      // Best-effort cleanup of storage object
      if (pic.storage_path) {
        try {
          await supabase.storage
            .from(pic.storage_bucket || "job-documents")
            .remove([pic.storage_path]);
        } catch (e) {
          console.warn("Storage remove failed (non-fatal):", e);
        }
      }

      setPictures((prev) => prev.filter((p) => p.id !== pic.id));
      // If this picture was open in lightbox, close it
      if (lightboxIndex !== null && pictures[lightboxIndex]?.id === pic.id) {
        setLightboxIndex(null);
      }
      toast({ title: "Picture deleted" });
    } catch (err: any) {
      console.error("Error deleting picture:", err);
      toast({
        title: "Error",
        description: err?.message || "Failed to delete picture.",
        variant: "destructive",
      });
    }
  };

  // Lightbox helpers
  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const lightboxPic = lightboxIndex !== null ? pictures[lightboxIndex] : null;

  const gotoPrev = () => {
    if (lightboxIndex === null) return;
    setLightboxIndex((i) =>
      i === null ? null : (i - 1 + pictures.length) % pictures.length,
    );
  };
  const gotoNext = () => {
    if (lightboxIndex === null) return;
    setLightboxIndex((i) => (i === null ? null : (i + 1) % pictures.length));
  };

  // Keyboard navigation in lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") gotoPrev();
      else if (e.key === "ArrowRight") gotoNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex, pictures.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-dark-150 rounded-lg border border-neutral-200 dark:border-neutral-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Pictures
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Upload photos from walkthroughs, site conditions, or progress
              updates. Add a short description so others know what they're
              looking at.
            </p>
          </div>
          <button
            type="button"
            onClick={openUploadModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#f26722] hover:bg-[#e55611] rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722] whitespace-nowrap"
          >
            <ImagePlus className="w-4 h-4" />
            Upload Picture
          </button>
        </div>

        {/* Gallery */}
        <div className="p-6">
          {pictures.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="mx-auto h-12 w-12 text-neutral-400 dark:text-neutral-500" />
              <h3 className="mt-4 text-sm font-medium text-neutral-900 dark:text-white">
                No pictures yet
              </h3>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                Upload the first picture to document this job.
              </p>
              <button
                type="button"
                onClick={openUploadModal}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#f26722] hover:bg-[#e55611] rounded-md"
              >
                <ImagePlus className="w-4 h-4" />
                Upload Picture
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {pictures.map((pic, index) => {
                const isOwner = pic.user_id === user?.id;
                const isEditing = editingId === pic.id;
                return (
                  <div
                    key={pic.id}
                    className="group bg-neutral-50 dark:bg-dark-100 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 flex flex-col"
                  >
                    {/* Thumbnail */}
                    <button
                      type="button"
                      onClick={() => openLightbox(index)}
                      className="relative aspect-square w-full overflow-hidden bg-neutral-200 dark:bg-dark-200 focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                      title="View picture"
                    >
                      <img
                        src={pic.image_url}
                        alt={pic.description || pic.file_name || "Job picture"}
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                        loading="lazy"
                      />
                    </button>

                    {/* Meta & description */}
                    <div className="p-3 flex-1 flex flex-col">
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => setProfileViewUserId(pic.user_id)}
                          className="flex-shrink-0 h-7 w-7 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-[10px] font-medium text-neutral-600 dark:text-neutral-300 hover:ring-2 hover:ring-[#f26722] focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                          title="View profile"
                        >
                          {pic.user?.profileImage ? (
                            <img
                              src={pic.user.profileImage}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            getInitials(pic.user?.displayName)
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => setProfileViewUserId(pic.user_id)}
                            className="block text-xs font-medium text-neutral-900 dark:text-white truncate hover:underline"
                          >
                            {isOwner
                              ? "You"
                              : pic.user?.displayName || "Unknown"}
                          </button>
                          <span className="block text-[11px] text-neutral-500 dark:text-neutral-400">
                            {formatDate(pic.created_at)}
                            {pic.edited && " (edited)"}
                          </span>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            rows={3}
                            placeholder="Describe what this picture shows..."
                            className="w-full px-2 py-1.5 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 text-neutral-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-transparent"
                            autoFocus
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEditDescription}
                              className="p-1.5 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 bg-neutral-100 dark:bg-dark-150 rounded"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEditDescription(pic.id)}
                              className="p-1.5 text-white bg-[#f26722] hover:bg-[#e55611] rounded"
                              title="Save"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words line-clamp-4 flex-1">
                          {pic.description || (
                            <span className="italic text-neutral-400 dark:text-neutral-500">
                              No description
                            </span>
                          )}
                        </p>
                      )}

                      {/* Owner actions */}
                      {isOwner && !isEditing && (
                        <div className="mt-3 flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => startEditDescription(pic)}
                            className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                            title="Edit description"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(pic)}
                            className="p-1.5 text-neutral-400 hover:text-red-500"
                            title="Delete picture"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="relative bg-white dark:bg-dark-150 rounded-lg w-full max-w-lg shadow-xl">
            <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Upload Picture
              </h3>
              <button
                type="button"
                onClick={closeUploadModal}
                className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* File selector / preview */}
              {previewUrl ? (
                <div className="relative">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full max-h-80 object-contain rounded-md bg-neutral-100 dark:bg-dark-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (previewUrl) URL.revokeObjectURL(previewUrl);
                      setSelectedFile(null);
                      setPreviewUrl(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full"
                    title="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  {selectedFile && (
                    <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 truncate">
                      {selectedFile.name} · {formatFileSize(selectedFile.size)}
                    </p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-md text-neutral-500 dark:text-neutral-400 hover:border-[#f26722] hover:text-[#f26722] transition-colors"
                >
                  <Upload className="w-8 h-8" />
                  <span className="text-sm font-medium">Choose image</span>
                  <span className="text-xs">PNG, JPG, HEIC up to 15MB</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Description */}
              <div>
                <label
                  htmlFor="picture-description"
                  className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                >
                  Description
                </label>
                <textarea
                  id="picture-description"
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  rows={3}
                  placeholder="What does this picture show? (e.g., 'Main panel after removing cover during walkthrough')"
                  className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-100 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 resize-none focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-transparent"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-neutral-200 dark:border-neutral-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeUploadModal}
                disabled={uploading}
                className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-white bg-white dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUploadSubmit}
                disabled={!selectedFile || uploading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#f26722] hover:bg-[#e55611] rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxPic && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={closeLightbox}
        >
          {/* Close */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full"
            title="Close"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Prev / Next */}
          {pictures.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  gotoPrev();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full"
                title="Previous"
              >
                <ChevronLeft className="w-7 h-7" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  gotoNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full"
                title="Next"
              >
                <ChevronRight className="w-7 h-7" />
              </button>
            </>
          )}

          <div
            className="max-w-6xl w-full mx-4 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxPic.image_url}
              alt={
                lightboxPic.description || lightboxPic.file_name || "Picture"
              }
              className="max-h-[75vh] max-w-full object-contain rounded-md shadow-2xl"
            />

            <div className="mt-4 w-full max-w-3xl bg-white/5 backdrop-blur text-white rounded-md px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-shrink-0 h-8 w-8 rounded-full overflow-hidden bg-white/20 flex items-center justify-center text-xs font-medium">
                  {lightboxPic.user?.profileImage ? (
                    <img
                      src={lightboxPic.user.profileImage}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getInitials(lightboxPic.user?.displayName)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {lightboxPic.user_id === user?.id
                      ? "You"
                      : lightboxPic.user?.displayName || "Unknown"}
                  </div>
                  <div className="text-[11px] text-white/70">
                    {formatDate(lightboxPic.created_at)}
                    {lightboxPic.edited && " (edited)"}
                  </div>
                </div>
                <a
                  href={lightboxPic.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={lightboxPic.file_name || undefined}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-white/10 hover:bg-white/20 rounded"
                  title="Open original"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="w-3.5 h-3.5" />
                  Original
                </a>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">
                {lightboxPic.description || (
                  <span className="italic text-white/60">No description</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      <ProfileView
        isOpen={!!profileViewUserId}
        onClose={() => setProfileViewUserId(null)}
        userId={profileViewUserId ?? undefined}
      />
    </>
  );
}
