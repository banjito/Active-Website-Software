import React, { useState, useRef, useEffect } from "react";
import { PDFDocument } from "pdf-lib";
import { Button } from "@/components/ui/Button";
import { Save, X, Plus, FileText } from "lucide-react";
import { toast } from "@/components/ui/toast";

interface SignatureField {
  id: string;
  name: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  signer_type?: string;
}

interface PDFSignatureFieldEditorProps {
  fileUrl: string;
  fileName: string;
  onSave: (pdfBlob: Blob, signatureFields: SignatureField[]) => Promise<void>;
  onClose: () => void;
  existingFields?: SignatureField[];
}

export function PDFSignatureFieldEditor({
  fileUrl,
  fileName,
  onSave,
  onClose,
  existingFields = [],
}: PDFSignatureFieldEditorProps) {
  const [signatureFields, setSignatureFields] =
    useState<SignatureField[]>(existingFields);
  const [isPlacing, setIsPlacing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<PDFDocument | null>(null);
  const [pdfPages, setPdfPages] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldSignerType, setNewFieldSignerType] = useState("employee");

  useEffect(() => {
    loadPDF();
  }, [fileUrl]);

  const loadPDF = async () => {
    try {
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      setPdfDoc(pdf);

      const pages = pdf.getPages();
      setPdfPages(pages);
      renderPage();
    } catch (error) {
      console.error("Error loading PDF:", error);
      toast({
        title: "Error",
        description: "Failed to load PDF",
        variant: "destructive",
      });
    }
  };

  const renderPage = async () => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = pdfPages[currentPage - 1];
      if (!page) return;

      const { width, height } = page.getSize();
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set canvas size
      const scale = Math.min(800 / width, 1000 / height);
      canvas.width = width * scale;
      canvas.height = height * scale;
      ctx.scale(scale, scale);

      // Render PDF page using pdf-lib's embedded rendering
      // Note: pdf-lib doesn't have built-in rendering, so we'll use an iframe approach
      // For now, we'll use a canvas-based approach with pdf.js or similar

      // Draw signature fields
      drawSignatureFields(ctx, width, height);
    } catch (error) {
      console.error("Error rendering page:", error);
    }
  };

  const drawSignatureFields = (
    ctx: CanvasRenderingContext2D,
    pageWidth: number,
    pageHeight: number,
  ) => {
    const fieldsOnPage = signatureFields.filter((f) => f.page === currentPage);

    fieldsOnPage.forEach((field) => {
      const isSelected = selectedField === field.id;

      // Draw signature field rectangle
      ctx.strokeStyle = isSelected ? "var(--brand)" : "#3b82f6";
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.setLineDash(isSelected ? [] : [5, 5]);
      ctx.strokeRect(
        field.x,
        pageHeight - field.y - field.height,
        field.width,
        field.height,
      );

      // Draw field label
      ctx.fillStyle = isSelected ? "var(--brand)" : "#3b82f6";
      ctx.font = "12px Arial";
      ctx.fillText(
        field.name || "Signature",
        field.x + 5,
        pageHeight - field.y - field.height + 15,
      );

      // Draw required indicator
      if (field.required) {
        ctx.fillStyle = "#ef4444";
        ctx.fillText(
          "*",
          field.x + field.width - 15,
          pageHeight - field.y - field.height + 15,
        );
      }
    });
  };

  useEffect(() => {
    renderPage();
  }, [currentPage, signatureFields, selectedField, pdfDoc]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPlacing || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * scale;
    const y = (e.clientY - rect.top) * scale;

    // Get page dimensions
    const page = pdfPages[currentPage - 1];
    if (!page) return;
    const { width, height } = page.getSize();
    const actualScale = canvas.width / width;

    const actualX = x / actualScale;
    const actualY = height - y / actualScale;

    // Create new signature field
    const newField: SignatureField = {
      id: `field_${Date.now()}`,
      name: newFieldName || `Signature ${signatureFields.length + 1}`,
      page: currentPage,
      x: actualX - 75, // Center the field
      y: actualY - 20,
      width: 150,
      height: 40,
      required: true,
      signer_type: newFieldSignerType,
    };

    setSignatureFields([...signatureFields, newField]);
    setIsPlacing(false);
    setNewFieldName("");
    setSelectedField(newField.id);
  };

  const handleSave = async () => {
    if (!pdfDoc) return;

    setIsSaving(true);
    try {
      // Add signature fields to PDF using pdf-lib
      const pages = pdfDoc.getPages();

      signatureFields.forEach((field) => {
        const page = pages[field.page - 1];
        if (!page) return;

        // Create a signature field (annotation)
        // Note: pdf-lib has limited support for form fields, so we'll add them as annotations
        // For full Acrobat-style signature fields, you'd need a more advanced library
        // For now, we'll store the field positions and render them in the viewer

        // Add a text annotation to mark the signature field location
        page.drawRectangle({
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          borderColor: { r: 0.2, g: 0.4, b: 0.9 },
          borderWidth: 1,
          borderDashArray: [5, 5],
          opacity: 0.3,
        });

        page.drawText(field.name || "Signature", {
          x: field.x + 5,
          y: field.y + field.height - 15,
          size: 10,
          color: { r: 0.2, g: 0.4, b: 0.9 },
        });
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });

      await onSave(blob, signatureFields);

      toast({
        title: "Success",
        description: "PDF with signature fields saved successfully",
        variant: "success",
      });
    } catch (error) {
      console.error("Error saving PDF:", error);
      toast({
        title: "Error",
        description: "Failed to save PDF",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteField = (fieldId: string) => {
    setSignatureFields(signatureFields.filter((f) => f.id !== fieldId));
    if (selectedField === fieldId) {
      setSelectedField(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b bg-neutral-50 dark:bg-neutral-800">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-neutral-500" />
          <span className="text-sm font-medium">{fileName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsPlacing(true);
              setNewFieldName("");
            }}
            disabled={isPlacing} leftIcon={<Plus className="h-4 w-4" />}>
            {isPlacing ? "Click on PDF to place field" : "Add Signature Field"}
          </Button>
          {isPlacing && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Field name"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                className="px-2 py-1 border rounded text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setIsPlacing(false);
                }}
              />
              <select
                value={newFieldSignerType}
                onChange={(e) => setNewFieldSignerType(e.target.value)}
                className="px-2 py-1 border rounded text-sm"
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="hr">HR</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPlacing(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={isSaving} leftIcon={<Save className="h-4 w-4" />}>
            {isSaving ? "Saving..." : "Save PDF"}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* PDF Viewer */}
        <div
          className="flex-1 relative bg-neutral-100 overflow-auto"
          ref={containerRef}
        >
          <div className="flex flex-col items-center p-4">
            {pdfPages.length > 0 && (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {currentPage} of {pdfPages.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage(Math.min(pdfPages.length, currentPage + 1))
                    }
                    disabled={currentPage === pdfPages.length}
                  >
                    Next
                  </Button>
                </div>
                <div className="bg-white shadow-lg p-4">
                  <canvas
                    ref={canvasRef}
                    className="border border-neutral-300 cursor-crosshair"
                    onClick={handleCanvasClick}
                    style={{ maxWidth: "100%", height: "auto" }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Signature Fields Panel */}
        <div className="w-80 border-l bg-white dark:bg-neutral-800 overflow-y-auto">
          <div className="p-4">
            <h3 className="font-semibold mb-4">Signature Fields</h3>
            <div className="space-y-2">
              {signatureFields
                .filter((f) => f.page === currentPage)
                .map((field) => (
                  <div
                    key={field.id}
                    className={`p-3 border rounded cursor-pointer ${
                      selectedField === field.id
                        ? "border-brand bg-orange-50"
                        : "border-neutral-200"
                    }`}
                    onClick={() => setSelectedField(field.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{field.name}</div>
                        <div className="text-xs text-neutral-500 mt-1">
                          {field.signer_type} •{" "}
                          {field.required ? "Required" : "Optional"}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteField(field.id);
                        }}
                        className="text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              {signatureFields.filter((f) => f.page === currentPage).length ===
                0 && (
                <p className="text-sm text-neutral-500 text-center py-4">
                  No signature fields on this page. Click "Add Signature Field"
                  to add one.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
