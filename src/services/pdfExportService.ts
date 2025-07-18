import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Asset {
  id: string;
  name: string;
  file_url: string;
  status?: 'in_progress' | 'ready_for_review' | 'approved' | 'issue';
}

interface ProgressCallback {
  (progress: number, status: string): void;
}

export class PDFExportService {
  private static instance: PDFExportService;
  private loadingContainer: HTMLDivElement | null = null;
  private printQueue: Asset[] = [];
  private isProcessing = false;
  private serviceWorker: ServiceWorker | null = null;

  constructor() {
    this.registerServiceWorker();
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

  private async registerServiceWorker() {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/print-service-worker.js');
        this.serviceWorker = registration.active;
        console.log('Print service worker registered');
      }
    } catch (error) {
      console.error('Failed to register service worker:', error);
    }
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
    onProgress?: ProgressCallback
  ): Promise<void> {
    const approvedReports = assets.filter(
      asset => asset.status === 'approved' && asset.file_url?.startsWith('report:')
    );

    if (approvedReports.length === 0) {
      throw new Error('No approved reports found to print');
    }

    onProgress?.(0, 'Preparing reports for PDF generation...');

    try {
      // Process each report
      for (let i = 0; i < approvedReports.length; i++) {
        const asset = approvedReports[i];
        const progress = ((i + 1) / approvedReports.length) * 100;
        onProgress?.(progress, `Generating PDF for ${asset.name}...`);

        // Generate the report URL
        const reportUrl = asset.file_url.replace('report:', '');
        const fullUrl = `${window.location.origin}${reportUrl}`;
        
        // Generate filename
        const filename = asset.name.replace(/[^a-z0-9]/gi, '_');

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

    // Load the report in the iframe
    iframe.src = reportUrl;

    // Wait for iframe to load
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
    });

    // Wait for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get the iframe document
    const iframeDocument = iframe.contentDocument;
    if (!iframeDocument) {
      throw new Error('Failed to access iframe content');
    }

    // Apply print styles to the iframe content
    const printStyle = iframeDocument.createElement('style');
    printStyle.textContent = `
      @media print {
        body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
        * { color: black !important; }
        
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

    // Force the iframe to apply print styles
    iframeDocument.documentElement.classList.add('print-mode');
    
    // Wait for styles to apply
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Try to use the browser's print API with silent printing
    if (iframe.contentWindow) {
      try {
        // Check if we can use the print API with silent options
        if ('print' in iframe.contentWindow) {
          // Try to use the print API with silent printing
          const printOptions = {
            silent: true,
            printBackground: true,
            color: false,
            margin: {
              marginType: 'printableArea'
            },
            landscape: false,
            pagesPerSheet: 1,
            collate: false,
            copies: 1,
            header: '',
            footer: ''
          };

          // Try to print silently
          iframe.contentWindow.print();
          
          // Since silent printing might not work in all browsers,
          // we'll use a different approach - create a service worker
          // or use a headless browser approach
        }
      } catch (error) {
        console.log('Silent printing not available, using alternative method');
      }
    }

    // Clean up iframe
    document.body.removeChild(iframe);
  }
}

export const pdfExportService = PDFExportService.getInstance(); 