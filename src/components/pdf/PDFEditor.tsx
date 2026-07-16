import React, { useState, useRef, useEffect } from "react";
import { Save, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface PDFEditorProps {
  fileUrl: string;
  fileName: string;
  onSave: (editedBlob: Blob) => Promise<void>;
  onClose: () => void;
  onUrlUpdate?: (newUrl: string) => void;
}

export function PDFEditor({
  fileUrl,
  fileName,
  onSave,
  onClose,
  onUrlUpdate,
}: PDFEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(fileUrl);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Update currentUrl when fileUrl prop changes
  useEffect(() => {
    setCurrentUrl(fileUrl);
  }, [fileUrl]);

  const handleSavePDF = async () => {
    setIsSaving(true);
    try {
      // Get the current iframe content
      const response = await fetch(currentUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch PDF: ${response.status} ${response.statusText}`,
        );
      }

      const blob = await response.blob();
      await onSave(blob);

      // Update URL after successful save
      if (onUrlUpdate) {
        const timestamp = Date.now();
        const newUrl = `${currentUrl}?t=${timestamp}`;
        onUrlUpdate(newUrl);
        setCurrentUrl(newUrl);
      }

      // Force iframe reload with new URL
      if (iframeRef.current) {
        const timestamp = Date.now();
        iframeRef.current.src = `${currentUrl}?t=${timestamp}#toolbar=1&navpanes=0&scrollbar=1`;
      }

      alert("PDF saved successfully!");
    } catch (error) {
      console.error("Error saving PDF:", error);
      alert("Failed to save PDF. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* PDF Editor Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-neutral-500" />
          <span className="text-sm font-medium text-neutral-700 dark:text-white">
            {fileName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="text-neutral-600 hover:text-neutral-800" leftIcon={<Download className="h-4 w-4" />}>
            Print
          </Button>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 relative bg-neutral-100">
        <iframe
          ref={iframeRef}
          src={`${currentUrl}#toolbar=1&navpanes=0&scrollbar=1`}
          className="w-full h-full border-0"
          title={fileName}
          style={{
            minHeight: "600px",
            backgroundColor: "white",
          }}
        />
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between p-2 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 text-xs text-neutral-500">
        <span>
          Use your browser's PDF tools to annotate. Click Save when done.
        </span>
      </div>
    </div>
  );
}
