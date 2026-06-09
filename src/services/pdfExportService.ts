import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Asset {
  id: string;
  name: string;
  file_url: string;
  status?: 'not started' | 'in_progress' | 'ready_for_review' | 'approved' | 'sent' | 'issue' | 'archived';
}

interface ProgressCallback {
  (progress: number, status: string): void;
}

export class PDFExportService {
  private static instance: PDFExportService;
  private loadingContainer: HTMLDivElement | null = null;
  private printQueue: Asset[] = [];
  private isProcessing = false;
  constructor() {
    // Service worker registration removed - was causing caching issues
  }

  static getInstance(): PDFExportService {
    if (!PDFExportService.instance) {
      PDFExportService.instance = new PDFExportService();
    }
    return PDFExportService.instance;
  }

  private createLoadingContainer(): HTMLDivElement {
    if (this.loadingContainer) {
      document.body.removeChild(this.loadingContainer);
    }

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.width = '1200px';
    container.style.height = '800px';
    container.style.overflow = 'hidden';
    container.style.zIndex = '-1000';
    container.style.pointerEvents = 'none';
    
    document.body.appendChild(container);
    this.loadingContainer = container;
    return container;
  }


  private loadReportInIframe(reportUrl: string): Promise<HTMLIFrameElement> {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.width = '1200px';
      iframe.style.height = '800px';
      iframe.style.border = 'none';
      iframe.style.display = 'block';

      const timeout = setTimeout(() => {
        reject(new Error(`Timeout loading report: ${reportUrl}`));
      }, 30000); // 30 second timeout

      iframe.onload = () => {
        clearTimeout(timeout);
        // Give the iframe content time to fully render
        setTimeout(() => resolve(iframe), 2000);
      };

      iframe.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Failed to load report: ${reportUrl}`));
      };

      iframe.src = reportUrl;
      this.loadingContainer?.appendChild(iframe);
    });
  }

  private async captureIframeContent(iframe: HTMLIFrameElement): Promise<string> {
    try {
      // Try to access iframe content
      const iframeDocument = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDocument) {
        throw new Error('Cannot access iframe content - possible cross-origin issue');
      }

      // Wait for any remaining content to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Ensure the document is fully loaded
      if (iframeDocument.readyState !== 'complete') {
        await new Promise(resolve => {
          const checkReady = () => {
            if (iframeDocument.readyState === 'complete') {
              resolve(void 0);
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
        });
      }

      // Get the actual content height
      const bodyHeight = Math.max(
        iframeDocument.body.scrollHeight,
        iframeDocument.body.offsetHeight,
        iframeDocument.documentElement.clientHeight,
        iframeDocument.documentElement.scrollHeight,
        iframeDocument.documentElement.offsetHeight
      );

      // Capture the iframe content
      const canvas = await html2canvas(iframeDocument.body, {
        width: 1200,
        height: Math.max(bodyHeight, 800),
        scale: 0.8, // Reduce scale for better performance
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        removeContainer: false,
        logging: false, // Disable logging to reduce console noise
        imageTimeout: 15000 // 15 second timeout for images
      });

      return canvas.toDataURL('image/png', 0.7); // Reduce quality for smaller file size
    } catch (error) {
      console.error('Error capturing iframe content:', error);
      throw error;
    }
  }

  private cleanup(): void {
    if (this.loadingContainer) {
      document.body.removeChild(this.loadingContainer);
      this.loadingContainer = null;
    }
  }

  async batchPrintApprovedReports(
    assets: Asset[], 
    onProgress?: ProgressCallback,
    dynamicNames?: Record<string, string>
  ): Promise<void> {
    // Filter approved-only (case-insensitive) and report-type assets
    const approvedOnly = assets.filter((asset) =>
      asset.file_url?.startsWith('report:') && String(asset.status || '').toLowerCase() === 'approved'
    );

    // De-duplicate by report id embedded in file_url: report:/jobs/{jobId}/{slug}/{reportId}
    const seen = new Set<string>();
    const approvedReports = approvedOnly.filter((asset) => {
      try {
        const path = asset.file_url.replace('report:', '');
        const parts = path.split('/').filter(Boolean);
        const reportId = parts[parts.length - 1];
        const key = reportId || path;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      } catch {
        return false;
      }
    });

    if (approvedReports.length === 0) {
      throw new Error('No approved reports found to print');
    }

    onProgress?.(0, 'Preparing reports for PDF generation...');

    try {
      // Process each unique approved report
      for (let i = 0; i < approvedReports.length; i++) {
        const asset = approvedReports[i];
        const progress = ((i + 1) / approvedReports.length) * 100;
        
        // Use dynamic name (which includes identifier) if available, otherwise fall back to asset.name
        const displayName = dynamicNames?.[asset.id] || asset.name || '';
        onProgress?.(progress, `Generating PDF for ${displayName}...`);

        // Generate the report URL
        const reportUrl = asset.file_url.replace('report:', '');
        const fullUrl = `${window.location.origin}${reportUrl}`;
        
        // Generate filename as "reportname-identifier.pdf"
        // The dynamic name format is "Report Name - Identifier" (with space-dash-space separator)
        let identifier = '';
        try {
          const parts = displayName.split(' - ');
          if (parts.length > 1) {
            identifier = parts[parts.length - 1].trim();
          }
        } catch {}
        const reportName = (displayName || '').split(' - ')[0].trim();
        const safeReportName = reportName.replace(/[^a-z0-9]/gi, '_');
        const safeIdentifier = identifier ? identifier.replace(/[^a-z0-9]/gi, '_') : '';
        // Combine report name and identifier: "ReportName-Identifier.pdf"
        const filename = safeReportName && safeIdentifier 
          ? `${safeReportName}-${safeIdentifier}` 
          : safeReportName || safeIdentifier || 'report';

        // Use the headless print method
        await this.headlessPrint(fullUrl, filename);

        // Small delay between reports
        if (i < approvedReports.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      onProgress?.(100, 'All reports sent to print queue');
      
    } catch (error) {
      console.error('Error in batch PDF generation:', error);
      throw error;
    }
  }

  private async headlessPrint(reportUrl: string, filename: string): Promise<void> {
    // Create a hidden iframe to load the report
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = '1200px';
    iframe.style.height = '1600px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    // Load the report in the iframe with print mode enabled so it matches in-report export
    // Force landscape for long wide tables
    const urlWithPrint = reportUrl.includes('?') ? `${reportUrl}&print=true` : `${reportUrl}?print=true`;
    iframe.src = urlWithPrint;

    // Wait for iframe to load
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
    });

    // Wait for dynamic content to load, including charts
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Get the iframe document
    const iframeDocument = iframe.contentDocument;
    if (!iframeDocument) {
      throw new Error('Failed to access iframe content');
    }

    // Apply print styles to the iframe content
    const printStyle = iframeDocument.createElement('style');
    printStyle.textContent = `
      @media print {
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
        @page { size: landscape; margin: 0; margin-top: 0.4in; }
        /* Pull first page content up; page 2+ keep 0.4in margin */
        body { margin-top: -0.4in !important; }
        * { color: black !important; }
        #report-container { padding-top: 0.1in !important; padding-right: 0.06in !important; margin-top: 0 !important; }
        #report-container > div:first-child, #report-container .report-body { padding-top: 0 !important; margin-top: 0 !important; }
        /* Grounding Master: no extra padding - uses fixed layout for aligned entries */
        #report-container:has(.gsm-page) { padding: 0 !important; }
        
        /* Hide all navigation and header elements */
        nav, header, .navigation, [class*="nav"], [class*="header"], 
        .sticky, [class*="sticky"], .print\\:hidden { 
          display: none !important; 
        }
        
        /* Hide Back to Job button and division headers specifically */
        button[class*="Back"], 
        *[class*="Back to Job"], 
        h2[class*="Division"],
        .mobile-nav-text,
        [class*="formatDivisionName"] {
          display: none !important;
        }
        
        /* Hide interactive elements */
        button:not(.print-visible) { display: none !important; }
        
        /* Form elements - clean styling for print */
        input, select, textarea { 
          background-color: white !important; 
          border: 1px solid black !important; 
          color: black !important;
          padding: 2px !important; 
          font-size: 11px !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
        }
        
        /* Hide dropdown arrows and form control indicators */
        select {
          background-image: none !important;
          padding-right: 8px !important;
        }
        
        /* Hide spin buttons on number inputs */
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
        }
        input[type="number"] {
          -moz-appearance: textfield !important;
        }
        
        /* Table styling */
        table { 
          border-collapse: collapse !important; 
          width: 100% !important; 
          font-size: 12px !important;
        }
        
        th, td { 
          border: 1px solid black !important; 
          padding: 4px !important; 
          font-size: 11px !important;
        }
        
        th { 
          background-color: #f0f0f0 !important; 
          font-weight: bold !important; 
        }
        
        /* Preserve layout classes */
        .grid { display: grid !important; }
        .flex { display: flex !important; }
        
        /* Section styling */
        section { 
          break-inside: avoid !important; 
          margin-bottom: 20px !important; 
          page-break-inside: avoid !important;
        }
        /* Let the report's own print styles handle page breaks */
        
        /* Preserve spacing and layout */
        .space-x-2 > * + * { margin-left: 0.5rem !important; }
        .space-x-4 > * + * { margin-left: 1rem !important; }
        .space-y-3 > * + * { margin-top: 0.75rem !important; }
        .space-y-4 > * + * { margin-top: 1rem !important; }
        .space-y-6 > * + * { margin-top: 1.5rem !important; }
        .space-y-8 > * + * { margin-top: 2rem !important; }
        
        .gap-2 { gap: 0.5rem !important; }
        .gap-4 { gap: 1rem !important; }
        .gap-6 { gap: 1.5rem !important; }
        
        .w-16 { width: 4rem !important; }
        .w-20 { width: 5rem !important; }
        .w-24 { width: 6rem !important; }
        .w-32 { width: 8rem !important; }
        .w-full { width: 100% !important; }
        
        .text-center { text-align: center !important; }
        .text-left { text-align: left !important; }
        .text-right { text-align: right !important; }
        
        .border-b { border-bottom: 1px solid black !important; }
        .border-r { border-right: 1px solid black !important; }
        .border { border: 1px solid black !important; }
        
        .p-1 { padding: 0.25rem !important; }
        .p-2 { padding: 0.5rem !important; }
        .p-3 { padding: 0.75rem !important; }
        .p-4 { padding: 1rem !important; }
        .p-6 { padding: 1.5rem !important; }
        .px-2 { padding-left: 0.5rem !important; padding-right: 0.5rem !important; }
        .px-3 { padding-left: 0.75rem !important; padding-right: 0.75rem !important; }
        .px-4 { padding-left: 1rem !important; padding-right: 1rem !important; }
        .py-1 { padding-top: 0.25rem !important; padding-bottom: 0.25rem !important; }
        .py-2 { padding-top: 0.5rem !important; padding-bottom: 0.5rem !important; }
        .py-3 { padding-top: 0.75rem !important; padding-bottom: 0.75rem !important; }
        
        .mb-2 { margin-bottom: 0.5rem !important; }
        .mb-4 { margin-bottom: 1rem !important; }
        .mb-6 { margin-bottom: 1.5rem !important; }
        .mt-1 { margin-top: 0.25rem !important; }
        .mt-6 { margin-top: 1.5rem !important; }
        .ml-2 { margin-left: 0.5rem !important; }
        .ml-8 { margin-left: 2rem !important; }
        
        .text-xs { font-size: 0.75rem !important; }
        .text-sm { font-size: 0.875rem !important; }
        .text-lg { font-size: 1.125rem !important; }
        .text-xl { font-size: 1.25rem !important; }
        .text-2xl { font-size: 1.5rem !important; }
        .text-3xl { font-size: 1.875rem !important; }
        
        .font-medium { font-weight: 500 !important; }
        .font-semibold { font-weight: 600 !important; }
        .font-bold { font-weight: 700 !important; }
        
        /* Page break controls */
        .print\\:break-before-page { page-break-before: always; }
        .print\\:break-after-page { page-break-after: always; }
        .print\\:break-inside-avoid { page-break-inside: avoid; }
        .print\\:text-black { color: black !important; }
        .print\\:bg-white { background-color: white !important; }
        .print\\:border-black { border-color: black !important; }
        .print\\:font-bold { font-weight: bold !important; }
        .print\\:text-center { text-align: center !important; }
      }
    `;
    iframeDocument.head.appendChild(printStyle);

    // Remove empty list items that cause extra bullets in print (Windows & Mac fix)
    try {
      iframeDocument.querySelectorAll('li').forEach(li => {
        if (!li.textContent?.trim() && !li.querySelector('img')) {
          li.remove();
        }
      });
      iframeDocument.querySelectorAll('ul').forEach(ul => {
        if (!ul.textContent?.trim() && !ul.querySelector('li')) {
          ul.remove();
        }
      });
    } catch {}

    // Force charts to render properly by triggering resize events
    try {
      // Trigger resize events to ensure charts render
      iframe.contentWindow?.dispatchEvent(new Event('resize'));
      
      // Also trigger window resize for any chart libraries that listen to it
      iframe.contentWindow?.dispatchEvent(new Event('resize'));
      
      // Wait a bit more for charts to fully render
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch {}

    // Force the iframe to apply print styles and trigger in-report beforeprint handlers
    iframeDocument.documentElement.classList.add('print-mode');
    try {
      iframe.contentWindow?.dispatchEvent(new Event('beforeprint'));
    } catch {}
    // Wait for handlers (e.g., ReportWrapper standardizers) to run
    await new Promise(resolve => setTimeout(resolve, 500));

    // Keep browser print headers from showing the asset filename.
    const originalTopTitle = document.title;
    try {
      try {
        if (iframeDocument) {
          iframeDocument.title = ' ';
        }
      } catch {}
      try {
        document.title = ' ';
      } catch {}

      await new Promise<void>((resolve) => {
        let resolved = false;
        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };
        try {
          const win = iframe.contentWindow;
          if (win) {
            const onAfterPrint = () => {
              try { win.removeEventListener('afterprint', onAfterPrint as any); } catch {}
              cleanup();
            };
            try { win.addEventListener('afterprint', onAfterPrint as any); } catch {}
            try { win.focus(); } catch {}
            try { win.print(); } catch { cleanup(); }
            // Safety timeout in case afterprint is not fired
            setTimeout(cleanup, 30000);
          } else {
            cleanup();
          }
        } catch {
          cleanup();
        }
      });
    } finally {
      try { document.title = originalTopTitle; } catch {}
      document.body.removeChild(iframe);
    }
  }
}

export const pdfExportService = PDFExportService.getInstance(); 
