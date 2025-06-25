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

  async exportApprovedReportsToPDF(
    assets: Asset[], 
    jobTitle: string,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const approvedAssets = assets.filter(
      asset => asset.status === 'approved' && asset.file_url?.startsWith('report:')
    );

    if (approvedAssets.length === 0) {
      throw new Error('No approved reports found to export');
    }

    onProgress?.(0, 'Initializing PDF export...');

    try {
      // Create loading container
      const container = this.createLoadingContainer();
      
      // Initialize PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      let isFirstPage = true;

      onProgress?.(5, 'Starting report processing...');

      for (let i = 0; i < approvedAssets.length; i++) {
        const asset = approvedAssets[i];
        const progress = 10 + (i / approvedAssets.length) * 80;
        
        onProgress?.(progress, `Processing ${asset.name}...`);

        try {
          // Convert report URL to actual path
          const reportPath = asset.file_url.replace('report:', '');
          const reportUrl = `${window.location.origin}${reportPath}`;

          // Load report in iframe
          onProgress?.(progress + 5, `Loading ${asset.name}...`);
          const iframe = await this.loadReportInIframe(reportUrl);

          // Capture content
          onProgress?.(progress + 10, `Capturing ${asset.name}...`);
          const imageData = await this.captureIframeContent(iframe);

          // Add to PDF
          if (!isFirstPage) {
            pdf.addPage();
          }
          isFirstPage = false;

          // Add title page for each report
          pdf.setFontSize(16);
          pdf.text(asset.name, 20, 20);
          pdf.setFontSize(12);
          pdf.text(`Report ${i + 1} of ${approvedAssets.length}`, 20, 30);
          
          // Calculate image dimensions
          const img = new Image();
          img.src = imageData;
          
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve; // Continue even if image fails to load
          });
          
          const imgWidth = 170; // A4 width minus margins
          const aspectRatio = img.height / img.width;
          let imgHeight = imgWidth * aspectRatio;
          
          // If image is too tall for one page, split it
          const maxHeight = 250; // Max height that fits on A4 page with margins
          let yPosition = 40;
          
          if (imgHeight <= maxHeight) {
            // Image fits on one page
            pdf.addImage(imageData, 'PNG', 20, yPosition, imgWidth, imgHeight);
          } else {
            // Image needs to be split across multiple pages
            let remainingHeight = imgHeight;
            let sourceY = 0;
            
            while (remainingHeight > 0) {
              const currentHeight = Math.min(maxHeight, remainingHeight);
              const sourceHeight = (currentHeight / imgHeight) * img.height;
              
              // Create a canvas to crop the image
              const cropCanvas = document.createElement('canvas');
              cropCanvas.width = img.width;
              cropCanvas.height = sourceHeight;
              const ctx = cropCanvas.getContext('2d');
              
              if (ctx) {
                ctx.drawImage(img, 0, sourceY, img.width, sourceHeight, 0, 0, img.width, sourceHeight);
                const croppedImageData = cropCanvas.toDataURL('image/png', 0.7);
                
                pdf.addImage(croppedImageData, 'PNG', 20, yPosition, imgWidth, currentHeight);
              }
              
              remainingHeight -= currentHeight;
              sourceY += sourceHeight;
              
              if (remainingHeight > 0) {
                pdf.addPage();
                yPosition = 20; // Reset Y position for new page
              }
            }
          }

          // Remove iframe
          container.removeChild(iframe);

        } catch (error) {
          console.error(`Error processing report ${asset.name}:`, error);
          // Continue with other reports even if one fails
          if (!isFirstPage) {
            pdf.addPage();
          }
          isFirstPage = false;
          
          pdf.setFontSize(16);
          pdf.text(`Error loading: ${asset.name}`, 20, 20);
          pdf.setFontSize(12);
          pdf.text(`Could not capture this report. Please export individually.`, 20, 40);
        }
      }

      onProgress?.(95, 'Generating PDF file...');

      // Generate and download PDF
      const fileName = `${jobTitle.replace(/[^a-z0-9]/gi, '_')}_Approved_Reports.pdf`;
      pdf.save(fileName);

      onProgress?.(100, 'PDF export complete!');

    } catch (error) {
      console.error('PDF export failed:', error);
      throw error;
    } finally {
      // Always cleanup
      this.cleanup();
    }
  }
}

export const pdfExportService = PDFExportService.getInstance(); 