import React, { useState, useEffect } from "react";
import {
  Upload,
  FileImage,
  Trash2,
  Eye,
  BookmarkOff,
  Download,
  Plus,
  X,
} from "lucide-react";
import { useAuth } from "../../lib/AuthContext";
import { OneLineDrawing } from "../../lib/types";
import {
  uploadOneLineDrawing,
  fetchOneLineDrawings,
  deleteOneLineDrawing,
  setCurrentOneLineDrawing,
  getFileUrl,
} from "../../lib/documentUtils";
import { Button } from "../ui/Button";
import Card, { CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Input } from "../ui/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";

interface OneLineDrawingsProps {
  jobId: string;
}

export default function OneLineDrawings({ jobId }: OneLineDrawingsProps) {
  const { user } = useAuth();
  const [drawings, setDrawings] = useState<OneLineDrawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [drawingName, setDrawingName] = useState("");
  const [drawingDescription, setDrawingDescription] = useState("");
  const [drawingVersion, setDrawingVersion] = useState("1.0");
  const [previewDrawing, setPreviewDrawing] = useState<OneLineDrawing | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDrawings();
  }, [jobId]);

  const loadDrawings = async () => {
    if (!jobId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await fetchOneLineDrawings(jobId);
      setDrawings(data);
    } catch (error) {
      console.error("Error loading one-line drawings:", error);
      setError("Failed to load drawings");
      toast({
        title: "Error",
        description: "Failed to load one-line drawings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Auto-populate name if empty
      if (!drawingName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        setDrawingName(nameWithoutExt);
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !drawingName.trim() || !jobId || !user) {
      toast({
        title: "Error",
        description: "Please select a file and enter a name",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploading(true);

      await uploadOneLineDrawing({
        name: drawingName.trim(),
        description: drawingDescription.trim() || undefined,
        file: selectedFile,
        job_id: jobId,
        version: drawingVersion.trim() || "1.0",
      });

      // Reset form
      setSelectedFile(null);
      setDrawingName("");
      setDrawingDescription("");
      setDrawingVersion("1.0");
      setShowUploadDialog(false);

      // Reload drawings
      await loadDrawings();

      toast({
        title: "Success",
        description: "One-line drawing uploaded successfully",
      });
    } catch (error) {
      console.error("Error uploading drawing:", error);
      toast({
        title: "Error",
        description: "Failed to upload one-line drawing",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (drawingId: string) => {
    if (!confirm("Are you sure you want to delete this one-line drawing?")) {
      return;
    }

    try {
      await deleteOneLineDrawing(drawingId);
      await loadDrawings();
      toast({
        title: "Success",
        description: "One-line drawing deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting drawing:", error);
      toast({
        title: "Error",
        description: "Failed to delete one-line drawing",
        variant: "destructive",
      });
    }
  };

  const handleSetCurrent = async (drawingId: string) => {
    try {
      await setCurrentOneLineDrawing(drawingId);
      await loadDrawings();
      toast({
        title: "Success",
        description: "Set as current drawing",
      });
    } catch (error) {
      console.error("Error setting current drawing:", error);
      toast({
        title: "Error",
        description: "Failed to set as current drawing",
        variant: "destructive",
      });
    }
  };

  const handlePreview = (drawing: OneLineDrawing) => {
    setPreviewDrawing(drawing);
  };

  const handleDownload = async (drawing: OneLineDrawing) => {
    try {
      const url = await getFileUrl("one-line-drawings", drawing.file_path);

      // Create a temporary link element and trigger download
      const a = document.createElement("a");
      a.href = url;
      a.download = drawing.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading drawing:", error);
      toast({
        title: "Error",
        description: "Failed to download drawing",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown size";
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
  };

  const currentDrawing = drawings.find((d) => d.is_current);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileImage className="h-5 w-5" />
            One-Line Drawings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
            <LoadingSpinner size="md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileImage className="h-5 w-5" />
            One-Line Drawings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-500">{error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <FileImage className="h-5 w-5" />
              One-Line Drawings ({drawings.length})
            </CardTitle>
            <Button
              onClick={() => setShowUploadDialog(true)}
              size="sm"
              className="bg-brand hover:bg-brand-dark text-white" leftIcon={<Plus className="h-4 w-4" />}>
              Upload Drawing
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {drawings.length === 0 ? (
            <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
              <FileImage className="h-12 w-12 mx-auto mb-4 text-neutral-300 dark:text-neutral-600" />
              <p>No one-line drawings uploaded yet</p>
              <Button
                onClick={() => setShowUploadDialog(true)}
                variant="outline"
                className="mt-4" leftIcon={<Upload className="h-4 w-4" />}>
                Upload First Drawing
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Current Drawing */}
              {currentDrawing && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-none p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-green-100 dark:bg-green-800 p-2 rounded-none">
                        <FileImage className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-neutral-900 dark:text-white">
                            {currentDrawing.name}
                          </h4>
                          <span className="bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 text-xs px-2 py-1 rounded-none">
                            Current
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 dark:text-neutral-300">
                          Version {currentDrawing.version} •{" "}
                          {formatFileSize(currentDrawing.file_size)}
                        </p>
                        {currentDrawing.description && (
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                            {currentDrawing.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handlePreview(currentDrawing)}
                        variant="ghost"
                        size="sm"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleDownload(currentDrawing)}
                        variant="ghost"
                        size="sm"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleDelete(currentDrawing.id)}
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Other Drawings */}
              {drawings
                .filter((d) => !d.is_current)
                .map((drawing) => (
                  <div
                    key={drawing.id}
                    className="flex items-center justify-between p-4 border border-neutral-200 dark:border-neutral-700 rounded-none hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-neutral-100 dark:bg-neutral-800 p-2 rounded-none">
                        <FileImage className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                      </div>
                      <div>
                        <h4 className="font-medium text-neutral-900 dark:text-white">
                          {drawing.name}
                        </h4>
                        <p className="text-sm text-neutral-600 dark:text-neutral-300">
                          Version {drawing.version} •{" "}
                          {formatFileSize(drawing.file_size)} •{" "}
                          {new Date(drawing.created_at).toLocaleDateString()}
                        </p>
                        {drawing.description && (
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                            {drawing.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleSetCurrent(drawing.id)}
                        variant="ghost"
                        size="sm"
                        title="Set as current"
                      >
                        <BookmarkOff className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handlePreview(drawing)}
                        variant="ghost"
                        size="sm"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleDownload(drawing)}
                        variant="ghost"
                        size="sm"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleDelete(drawing.id)}
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload One-Line Drawing</DialogTitle>
            <DialogDescription>
              Upload a new one-line drawing for this job. Supported formats:
              PDF, JPG, PNG, DWG, DXF, Visio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">File</label>
              <Input
                type="file"
                onChange={handleFileSelect}
                accept=".pdf,.jpg,.jpeg,.png,.gif,.tiff,.bmp,.vsd,.dwg,.dxf"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <Input
                value={drawingName}
                onChange={(e) => setDrawingName(e.target.value)}
                placeholder="Enter drawing name"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Version</label>
              <Input
                value={drawingVersion}
                onChange={(e) => setDrawingVersion(e.target.value)}
                placeholder="1.0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Description (Optional)
              </label>
              <Input
                value={drawingDescription}
                onChange={(e) => setDrawingDescription(e.target.value)}
                placeholder="Brief description of the drawing"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUploadDialog(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || !drawingName.trim() || uploading}
              className="bg-brand hover:bg-brand-dark text-white"
            >
              {uploading ? "Uploading..." : "Upload Drawing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      {previewDrawing && (
        <Dialog
          open={!!previewDrawing}
          onOpenChange={() => setPreviewDrawing(null)}
        >
          <DialogContent className="sm:max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{previewDrawing.name}</DialogTitle>
              <DialogDescription>
                Version {previewDrawing.version} •{" "}
                {formatFileSize(previewDrawing.file_size)}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-auto">
              {previewDrawing.file_type?.startsWith("image/") ? (
                <img
                  src={previewDrawing.file_url}
                  alt={previewDrawing.name}
                  className="w-full h-auto rounded-none border border-neutral-200 dark:border-neutral-700"
                />
              ) : previewDrawing.file_type === "application/pdf" ? (
                <iframe
                  src={previewDrawing.file_url}
                  className="w-full h-96 border border-neutral-200 dark:border-neutral-700 rounded-none"
                  title={previewDrawing.name}
                />
              ) : (
                <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
                  <FileImage className="h-16 w-16 mx-auto mb-4 text-neutral-300 dark:text-neutral-600" />
                  <p>Preview not available for this file type</p>
                  <Button
                    onClick={() => handleDownload(previewDrawing)}
                    variant="outline"
                    className="mt-4" leftIcon={<Download className="h-4 w-4" />}>
                    Download to View
                  </Button>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewDrawing(null)}>
                Close
              </Button>
              <Button
                onClick={() => handleDownload(previewDrawing)}
                className="bg-brand hover:bg-brand-dark text-white" leftIcon={<Download className="h-4 w-4" />}>
                Download
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
