/**
 * PDF & Video Upload Modal Component
 *
 * Modal for uploading PDF or video documents to the Help Center.
 * Supports PDFs and video files (MP4, WebM, MOV). Large videos (e.g. 3+ hours)
 * are supported; increase the storage bucket file size limit in Supabase if needed.
 */

import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import { Upload, FileText, Video, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  PortalCategory,
  PORTAL_CATEGORY_LABELS,
  HelpCenterDocument,
} from "@/lib/types/helpCenter";

const ACCEPTED_PDF = ".pdf,application/pdf";
const ACCEPTED_VIDEO = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";
const ACCEPTED_ALL = `${ACCEPTED_PDF},${ACCEPTED_VIDEO}`;

const MAX_PDF_MB = 50;
const MAX_VIDEO_MB = 2048; // 2GB for long videos
const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

function isVideoFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("video/")) return true;
  const name = (file.name || "").toLowerCase();
  return /\.(mp4|webm|mov|ogg)$/.test(name);
}

function fileNameWithoutExtension(name: string): string {
  return name.replace(/\.(pdf|mp4|webm|mov|ogg)$/i, "");
}

interface UploadPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export const UploadPdfModal: React.FC<UploadPdfModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const { user } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<PortalCategory>(
    PortalCategory.GENERAL,
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isVideo = isVideoFile(file);
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_PDF_BYTES;
    const maxLabel = isVideo ? `${MAX_VIDEO_MB}MB` : `${MAX_PDF_MB}MB`;

    if (isVideo) {
      if (
        !file.type.startsWith("video/") &&
        !/\.(mp4|webm|mov|ogg)$/i.test(file.name)
      ) {
        toast.error("Please select a video file (MP4, WebM, or MOV) or a PDF");
        return;
      }
    } else {
      if (file.type !== "application/pdf") {
        toast.error("Please select a PDF or video file (MP4, WebM, MOV)");
        return;
      }
    }

    if (file.size > maxBytes) {
      toast.error(`File size must be less than ${maxLabel}`);
      return;
    }

    setSelectedFile(file);
    if (!documentName) {
      setDocumentName(fileNameWithoutExtension(file.name));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a PDF or video file");
      return;
    }

    if (!documentName.trim()) {
      toast.error("Please enter a document name");
      return;
    }

    if (!user) {
      toast.error("You must be logged in to upload documents");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 1. Upload file to storage
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      // File path should not include bucket name - just the file name or subfolder
      const filePath = fileName;

      setUploadProgress(10);

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from("help-center-documents")
        .upload(filePath, selectedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("Upload error details:", uploadError);
        // If bucket doesn't exist, provide helpful error
        if (
          uploadError.message.includes("Bucket not found") ||
          uploadError.message.includes("does not exist")
        ) {
          toast.error(
            'Storage bucket "help-center-documents" not found. Please create it in Supabase Storage first.',
          );
        } else if (
          uploadError.message.includes("new row violates row-level security")
        ) {
          toast.error(
            "Permission denied. Please check storage bucket policies.",
          );
        } else {
          toast.error(
            `Upload failed: ${uploadError.message || "Unknown error"}`,
          );
          throw uploadError;
        }
        setIsUploading(false);
        setUploadProgress(0);
        return;
      }

      setUploadProgress(50);

      // 2. Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("help-center-documents").getPublicUrl(filePath);

      setUploadProgress(70);

      // 3. Create document record in database
      const { data, error: dbError } = await supabase
        .schema("common")
        .from("help_center_documents")
        .insert({
          name: documentName.trim(),
          category: selectedCategory,
          file_path: filePath,
          file_url: publicUrl,
          file_size: selectedFile.size,
          file_type: selectedFile.type,
          created_by: user.id,
        })
        .select()
        .single();

      if (dbError) {
        // If table doesn't exist, clean up uploaded file
        await supabase.storage.from("help-center-documents").remove([filePath]);
        if (dbError.code === "42P01") {
          toast.error(
            "Database table not configured. Please run the migration script.",
          );
        } else {
          throw dbError;
        }
        return;
      }

      setUploadProgress(100);

      toast.success(
        selectedFile.type.startsWith("video/")
          ? "Video uploaded successfully!"
          : "PDF uploaded successfully!",
      );

      // Reset form
      setSelectedFile(null);
      setDocumentName("");
      setSelectedCategory(PortalCategory.GENERAL);
      setUploadProgress(0);

      // Close modal and refresh list
      onClose();
      onUploadSuccess();
    } catch (error: any) {
      console.error("Error uploading file:", error);
      toast.error(`Failed to upload: ${error.message || "Unknown error"}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleClose = () => {
    if (isUploading) return; // Prevent closing during upload

    setSelectedFile(null);
    setDocumentName("");
    setSelectedCategory(PortalCategory.GENERAL);
    setUploadProgress(0);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Upload PDF or Video"
      size="md"
    >
      <div className="space-y-6">
        {/* File Selection */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Select PDF or Video File
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-neutral-300 dark:border-neutral-600 border-dashed rounded-none hover:border-[#f26722] transition-colors">
            <div className="space-y-1 text-center">
              {selectedFile ? (
                <div className="flex flex-col items-center">
                  {isVideoFile(selectedFile) ? (
                    <Video className="w-12 h-12 text-[#f26722] mb-2" />
                  ) : (
                    <FileText className="w-12 h-12 text-[#f26722] mb-2" />
                  )}
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    {isVideoFile(selectedFile) &&
                      selectedFile.size > 100 * 1024 * 1024 && (
                        <span className="block mt-1">
                          Large file – upload may take a few minutes
                        </span>
                      )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="mt-2 text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="mx-auto h-12 w-12 text-neutral-400" />
                  <div className="flex text-sm text-neutral-600 dark:text-neutral-400">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-none font-medium text-[#f26722] hover:text-[#e55611] focus-within:outline-none focus-within:ring-2 focus-within:ring-[#f26722] focus-within:ring-offset-2"
                    >
                      <span>Upload a file</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        accept={ACCEPTED_ALL}
                        className="sr-only"
                        onChange={handleFileSelect}
                        disabled={isUploading}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    PDF up to {MAX_PDF_MB}MB • Video (MP4, WebM, MOV) up to{" "}
                    {MAX_VIDEO_MB}MB
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Document Name */}
        <div>
          <label
            htmlFor="document-name"
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            Document Name *
          </label>
          <Input
            id="document-name"
            type="text"
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
            placeholder="Enter document name"
            disabled={isUploading}
            className="w-full"
          />
        </div>

        {/* Portal Category */}
        <div>
          <label
            htmlFor="portal-category"
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            Portal Category *
          </label>
          <select
            id="portal-category"
            value={selectedCategory}
            onChange={(e) =>
              setSelectedCategory(e.target.value as PortalCategory)
            }
            disabled={isUploading}
            className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-100 text-neutral-900 dark:text-white text-sm focus:ring-2 focus:ring-[#f26722] focus:border-transparent"
          >
            {Object.entries(PORTAL_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Upload Progress */}
        {isUploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-600 dark:text-neutral-400">
                Uploading...
              </span>
              <span className="text-neutral-600 dark:text-neutral-400">
                {uploadProgress}%
              </span>
            </div>
            <div className="w-full bg-neutral-200 dark:bg-dark-100 rounded-none h-2">
              <div
                className="bg-[#f26722] h-2 rounded-none transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFile || !documentName.trim() || isUploading}
            className="bg-[#f26722] hover:bg-[#e55611] text-white"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
