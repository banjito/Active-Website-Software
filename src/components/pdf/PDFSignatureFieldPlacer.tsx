import React, { useState, useRef, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Button } from '@/components/ui/Button';
import { Save, X, Plus, FileText, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';

export interface SignatureFieldPosition {
  id: string;
  name: string;
  page: number;
  x: number; // Percentage from left (0-100)
  y: number; // Percentage from top (0-100)
  width: number; // Percentage
  height: number; // Percentage
  required: boolean;
  signer_type?: string;
}

interface PDFSignatureFieldPlacerProps {
  fileUrl: string;
  fileName: string;
  onSave: (signatureFields: SignatureFieldPosition[]) => Promise<void>;
  onClose: () => void;
  existingFields?: SignatureFieldPosition[];
}

export function PDFSignatureFieldPlacer({
  fileUrl,
  fileName,
  onSave,
  onClose,
  existingFields = [],
}: PDFSignatureFieldPlacerProps) {
  const [signatureFields, setSignatureFields] = useState<SignatureFieldPosition[]>(existingFields);
  const [isPlacing, setIsPlacing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldSignerType, setNewFieldSignerType] = useState('employee');
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // Get total pages from iframe
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.onload = () => {
        try {
          // Try to get page count from PDF.js
          const iframeWindow = iframe.contentWindow as any;
          if (iframeWindow?.PDFViewerApplication?.pagesCount) {
            setTotalPages(iframeWindow.PDFViewerApplication.pagesCount);
          }
        } catch (e) {
          console.log('Could not get page count');
        }
      };
    }
  }, []);

  const handleIframeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPlacing || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Create new signature field
    const newField: SignatureFieldPosition = {
      id: `field_${Date.now()}`,
      name: newFieldName || `Signature ${signatureFields.length + 1}`,
      page: currentPage,
      x: Math.max(0, Math.min(100, x - 5)), // Center and clamp
      y: Math.max(0, Math.min(100, y - 2)),
      width: 10,
      height: 4,
      required: true,
      signer_type: newFieldSignerType,
    };

    setSignatureFields([...signatureFields, newField]);
    setIsPlacing(false);
    setNewFieldName('');
    setSelectedField(newField.id);
    setClickPosition(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(signatureFields);
      toast({
        title: 'Success',
        description: 'Signature fields saved successfully',
        variant: 'success',
      });
    } catch (error) {
      console.error('Error saving signature fields:', error);
      toast({
        title: 'Error',
        description: 'Failed to save signature fields',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteField = (fieldId: string) => {
    setSignatureFields(signatureFields.filter(f => f.id !== fieldId));
    if (selectedField === fieldId) {
      setSelectedField(null);
    }
  };

  const fieldsOnCurrentPage = signatureFields.filter(f => f.page === currentPage);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b bg-gray-50 dark:bg-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-gray-500" />
          <span className="text-sm font-medium">{fileName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsPlacing(true);
              setNewFieldName('');
            }}
            disabled={isPlacing}
          >
            <Plus className="h-4 w-4 mr-1" />
            {isPlacing ? 'Click on PDF to place' : 'Add Signature Field'}
          </Button>
          {isPlacing && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Field name"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                className="px-2 py-1 border rounded text-sm w-40"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsPlacing(false);
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
                onClick={() => {
                  setIsPlacing(false);
                  setClickPosition(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save className="h-4 w-4 mr-1" />
            {isSaving ? 'Saving...' : 'Save Fields'}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* PDF Viewer with Overlay */}
        <div 
          className="flex-1 relative bg-gray-100 overflow-auto" 
          ref={containerRef}
          onClick={handleIframeClick}
          style={{ cursor: isPlacing ? 'crosshair' : 'default' }}
        >
          <iframe
            ref={iframeRef}
            src={`${fileUrl}#page=${currentPage}&toolbar=1&navpanes=1&scrollbar=1`}
            className="w-full h-full border-0"
            title={fileName}
          />
          
          {/* Signature Field Overlays */}
          <div className="absolute inset-0 pointer-events-none">
            {fieldsOnCurrentPage.map((field) => (
              <div
                key={field.id}
                className={`absolute border-2 ${
                  selectedField === field.id
                    ? 'border-[#f26722] bg-orange-100/30'
                    : 'border-blue-500 bg-blue-100/20'
                } ${isPlacing ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'}`}
                style={{
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedField(field.id);
                }}
              >
                <div className="absolute -top-6 left-0 text-xs font-medium bg-white px-1 rounded shadow">
                  {field.name}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Page Navigation */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-white px-4 py-2 rounded shadow-lg">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <span className="text-sm px-4">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>

        {/* Signature Fields Panel */}
        <div className="w-80 border-l bg-white dark:bg-gray-800 overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <h3 className="font-semibold mb-2">Signature Fields</h3>
            <div className="text-xs text-gray-500 mb-4">
              Page {currentPage}
            </div>
            <div className="space-y-2">
              {fieldsOnCurrentPage.map((field) => (
                <div
                  key={field.id}
                  className={`p-3 border rounded cursor-pointer transition-colors ${
                    selectedField === field.id
                      ? 'border-[#f26722] bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedField(field.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{field.name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {field.signer_type} • {field.required ? 'Required' : 'Optional'}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteField(field.id);
                      }}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {fieldsOnCurrentPage.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No signature fields on this page. Click "Add Signature Field" to add one.
                </p>
              )}
            </div>
            
            {/* All Fields Summary */}
            {signatureFields.length > 0 && (
              <div className="mt-6 pt-4 border-t">
                <div className="text-xs text-gray-500 mb-2">All Pages</div>
                <div className="space-y-1">
                  {Array.from(new Set(signatureFields.map(f => f.page))).map(page => {
                    const fieldsOnPage = signatureFields.filter(f => f.page === page);
                    return (
                      <div key={page} className="text-xs text-gray-600">
                        Page {page}: {fieldsOnPage.length} field{fieldsOnPage.length !== 1 ? 's' : ''}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
