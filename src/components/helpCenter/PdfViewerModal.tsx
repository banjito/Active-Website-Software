/**
 * PDF Viewer Modal Component
 * 
 * Modal for viewing PDF documents in the Help Center.
 * Opens PDFs in an embedded viewer.
 */

import React, { useState, useEffect } from 'react';
import { X, Download, ExternalLink, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { HelpCenterDocument, isVideoDocument } from '@/lib/types/helpCenter';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/supabase';

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: HelpCenterDocument | null;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  onClose,
  document,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [pdfError, setPdfError] = useState(false);

  useEffect(() => {
    if (isOpen && document) {
      setIsLoading(true);
      setPdfError(false);
      
      // Increment view count when PDF is opened
      if (document.id) {
        incrementViewCount(document.id);
      }
    }
  }, [isOpen, document]);

  const incrementViewCount = async (documentId: string) => {
    try {
      await supabase
        .schema('common')
        .from('help_center_documents')
        .update({ view_count: (document?.viewCount || 0) + 1 })
        .eq('id', documentId);
    } catch (error) {
      console.error('Error incrementing view count:', error);
    }
  };

  const handlePdfLoad = () => {
    setIsLoading(false);
  };

  const handlePdfError = () => {
    setIsLoading(false);
    setPdfError(true);
  };

  const handleDownload = () => {
    if (document?.file_url) {
      const link = window.document.createElement('a');
      link.href = document.file_url;
      link.download = document.name || 'download';
      link.target = '_blank';
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
    }
  };

  const handleOpenInNewTab = () => {
    if (document?.file_url) {
      window.open(document.file_url, '_blank');
    }
  };

  if (!document) return null;

  const isVideo = isVideoDocument(document);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={document.name} size="full">
      <div className="flex flex-col h-full">
        {/* Header Actions */}
        <div className="flex items-center justify-between px-6 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span>{isVideo ? 'Video' : 'PDF Document'}</span>
            <span>•</span>
            <span>{(document.file_size / 1024 / 1024).toFixed(2)} MB</span>
            {document.viewCount !== undefined && (
              <>
                <span>•</span>
                <span>{document.viewCount} view{document.viewCount !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenInNewTab}
              className="flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open in New Tab
            </Button>
          </div>
        </div>

        {/* Content: Video or PDF */}
        <div className="flex-1 relative bg-gray-100 dark:bg-dark-200 overflow-hidden min-h-0">
          {isVideo ? (
            <>
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-dark-200 z-10">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-[#f26722] animate-spin" />
                    <p className="text-sm text-gray-600 dark:text-gray-400"><LoadingSpinner size="md" /></p>
                  </div>
                </div>
              )}
              <video
                className="w-full h-full object-contain bg-black"
                controls
                preload="metadata"
                playsInline
                src={document.file_url}
                title={document.name}
                onLoadedData={handlePdfLoad}
                onError={handlePdfError}
              />
            </>
          ) : (
            <>
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-dark-200 z-10">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-[#f26722] animate-spin" />
                    <p className="text-sm text-gray-600 dark:text-gray-400"><LoadingSpinner size="md" /></p>
                  </div>
                </div>
              )}

              {pdfError ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center p-8">
                    <p className="text-red-600 dark:text-red-400 mb-4">
                      Failed to load PDF document
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleOpenInNewTab}
                        className="flex items-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open in New Tab
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleDownload}
                        className="flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download PDF
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <iframe
                  src={`${document.file_url}#toolbar=1&navpanes=1&scrollbar=1`}
                  className="w-full h-full border-0"
                  title={document.name}
                  onLoad={handlePdfLoad}
                  onError={handlePdfError}
                />
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};
