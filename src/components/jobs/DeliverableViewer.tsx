import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

// Declare PDF.js types
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

interface DeliverableData {
  id: string;
  name: string;
  cover_letter_id: string;
  executive_summary_id: string | null;
  status: string;
}

interface GeneratedDoc {
  id: string;
  html: string;
  name: string;
  selected_report_ids: string[];
}

interface Asset {
  id: string;
  name: string;
  file_url: string;
}

export default function DeliverableViewer() {
  const { jobId, deliverableId } = useParams<{ jobId: string; deliverableId: string }>();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deliverable, setDeliverable] = useState<DeliverableData | null>(null);
  const [coverLetter, setCoverLetter] = useState<GeneratedDoc | null>(null);
  const [executiveSummary, setExecutiveSummary] = useState<GeneratedDoc | null>(null);
  const [reports, setReports] = useState<Asset[]>([]);
  
  // PDF generation state
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState('');

  useEffect(() => {
    loadDeliverable();
  }, [deliverableId, jobId]);

  const getReportRoute = (fileUrl: string) => {
    // Expected formats (file_url):
    // - report:/jobs/{jobId}/{slug}/{reportId}
    // - report:/jobs/{jobId}/{slug}/{substationFolder}/{reportId}
    // file_url may also have query params like ?returnToAssets=true which must be stripped
    if (!fileUrl.startsWith('report:/')) return null;

    // Remove "report:/" prefix and any query string
    const urlContent = fileUrl.split(':/')[1]; // e.g. "jobs/{jobId}/slug/..."
    const pathPart = urlContent.split('?')[0];
    const segments = pathPart.split('/').filter(Boolean);

    // We expect: ['jobs', jobId, slug, ...]
    if (segments[0] !== 'jobs' || !segments[1] || !segments[2]) {
      console.warn('[DeliverableViewer] Unexpected report file_url format:', fileUrl);
      return null;
    }

    const slug = segments[2];
    const isGroundingReport =
      slug === 'grounding-system-master' ||
      slug === 'grounding-fall-of-potential-slope-method-test' ||
      slug === 'gfi-trip-test-report';

    let substation: string | undefined;
    let reportId: string | undefined;

    if (isGroundingReport && segments.length >= 5) {
      // Format: jobs/{jobId}/{slug}/{substationFolder}/{reportId}
      substation = segments[3];
      reportId = segments[4];
    } else if (segments.length >= 4) {
      // Standard format: jobs/{jobId}/{slug}/{reportId}
      reportId = segments[3];
    }

    if (!reportId) {
      console.warn('[DeliverableViewer] Missing reportId in file_url:', fileUrl);
      return null;
    }

    // Build route used by App.tsx, always adding print + embedded flags
    if (substation) {
      return `/jobs/${jobId}/${slug}/${substation}/${reportId}?print=true&embedded=true`;
    }

    return `/jobs/${jobId}/${slug}/${reportId}?print=true&embedded=true`;
  };

  const loadDeliverable = async () => {
    try {
      setLoading(true);

      const { data: deliverableData, error: deliverableError } = await supabase
        .schema('neta_ops')
        .from('deliverables')
        .select('*')
        .eq('id', deliverableId)
        .eq('job_id', jobId)
        .single();

      if (deliverableError) throw deliverableError;
      setDeliverable(deliverableData);

      const { data: coverData, error: coverError } = await supabase
        .schema('neta_ops')
        .from('generated_documents')
        .select('id, html, name, selected_report_ids')
        .eq('id', deliverableData.cover_letter_id)
        .single();

      if (coverError) throw coverError;
      setCoverLetter(coverData);

      if (deliverableData.executive_summary_id) {
        const { data: summaryData, error: summaryError } = await supabase
          .schema('neta_ops')
          .from('generated_documents')
          .select('id, html, name, selected_report_ids')
          .eq('id', deliverableData.executive_summary_id)
          .single();

        if (!summaryError && summaryData) {
          setExecutiveSummary(summaryData);
        }
      }

      const reportIds = coverData.selected_report_ids || [];
      
      if (reportIds.length > 0) {
        const { data: assetData, error: assetError } = await supabase
          .schema('neta_ops')
          .from('assets')
          .select('id, name, file_url')
          .in('id', reportIds);

        if (assetError) throw assetError;
        
        const sortedReports = reportIds
          .map(id => assetData?.find(a => a.id === id))
          .filter(Boolean) as Asset[];
        
        setReports(sortedReports);
      }

      setLoading(false);
    } catch (err: any) {
      console.error('Error loading deliverable:', err);
      setError(err.message || 'Failed to load deliverable');
      setLoading(false);
    }
  };

  // Load a report in iframe and extract its full HTML (including styles)
  const extractReportHTML = (reportUrl: string, reportName: string): Promise<{ html: string; styles: string } | null> => {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '0';
      iframe.style.top = '0';
      iframe.style.width = '8.5in';
      iframe.style.height = '11in';
      iframe.style.zIndex = '-9999';
      iframe.style.opacity = '0.01';
      
      const timeout = setTimeout(() => {
        console.warn(`Timeout loading: ${reportName}`);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        resolve(null);
      }, 30000);

      iframe.onload = async () => {
        // Wait for React to fully render - poll for content to be ready
        // In print mode, reports may take longer to render their print-specific tables
        const maxWaitTime = 20000; // Increased to 20 seconds for async data loading
        const pollInterval = 500;
        let waited = 0;
        
        const waitForContent = async (): Promise<void> => {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iframeDoc) return;
          
          const container = iframeDoc.getElementById('report-container');
          if (!container) {
            // No container yet, keep waiting
            if (waited < maxWaitTime) {
              waited += pollInterval;
              await new Promise(r => setTimeout(r, pollInterval));
              return waitForContent();
            }
            return;
          }
          
          // Check if still showing a loading spinner (data not yet loaded)
          const hasLoadingSpinner = container.querySelector('.animate-spin') !== null;
          
          // Check for data-loaded marker (set by reports when async data fetch completes)
          const dataLoadedMarker = container.querySelector('[data-report-loaded="true"]');
          const hasDataLoadedMarker = dataLoadedMarker !== null;
          
          // Check for actual customer data in the marker (more reliable than just the flag)
          const hasCustomerData = container.querySelector('[data-has-customer="true"]') !== null;
          
          // Check if report container has substantial content
          const hasContent = container.innerHTML.length > 500;
          
          // Check for print-specific elements that indicate rendering is complete
          const hasPrintContent = 
            container.querySelector('.job-info-print') ||
            container.querySelector('.overview-print') ||
            container.querySelector('[class*="-print"]') ||
            container.querySelector('[class*="print:block"]') ||
            container.querySelector('table');
          
          // Check for actual data in tables (not just empty tables)
          const tables = container.querySelectorAll('table');
          const hasTableData = Array.from(tables).some(table => {
            const cells = table.querySelectorAll('td');
            return Array.from(cells).some(cell => (cell.textContent || '').trim().length > 0);
          });
          
          // Content is ready when:
          // 1. No loading spinner present AND
          // 2. Has substantial content AND
          // 3. Either: has data-loaded marker WITH actual data, OR has print content with table data, OR we've waited at least 12 seconds
          const isReady = !hasLoadingSpinner && hasContent && (
            (hasDataLoadedMarker && (hasCustomerData || hasTableData)) ||
            (hasPrintContent && hasTableData) || 
            waited >= 12000
          );
          
          if (isReady) {
            // Wait an additional 2 seconds for React to fully render data to DOM
            await new Promise(r => setTimeout(r, 2000));
            return;
          }
          
          if (waited < maxWaitTime) {
            waited += pollInterval;
            await new Promise(r => setTimeout(r, pollInterval));
            return waitForContent();
          }
        };
        
        await waitForContent();
        
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iframeDoc) {
            clearTimeout(timeout);
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            resolve(null);
            return;
          }

          // Get all stylesheets and inline styles
          const styles: string[] = [];
          iframeDoc.querySelectorAll('style').forEach(style => {
            styles.push(style.outerHTML);
          });
          
          // Get the report container or body
          const container = iframeDoc.getElementById('report-container') || iframeDoc.body;
          const html = container ? container.outerHTML : '';
          
          clearTimeout(timeout);
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          
          console.log(`✅ Extracted ${html.length} chars from: ${reportName} (waited ${waited}ms)`);
          resolve({ html, styles: styles.join('\n') });
        } catch (e) {
          console.error(`Error extracting ${reportName}:`, e);
          clearTimeout(timeout);
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          resolve(null);
        }
      };

      iframe.onerror = () => {
        clearTimeout(timeout);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        resolve(null);
      };

      iframe.src = reportUrl;
      document.body.appendChild(iframe);
    });
  };

  // Generate combined PDF by opening print window with all content
  const generatePDF = async () => {
    if (!coverLetter) return;
    
    setGenerating(true);
    setGenProgress('Preparing documents...');
    
    // Detect Windows for print fixes (detect early so it's available to all functions)
    const isWindows = navigator.platform.includes('Win') || navigator.userAgent.includes('Windows');
    
    try {
      const reportContents: { name: string; html: string; styles: string }[] = [];
      
      // Helper function to convert PDF pages to images using PDF.js
      const convertPdfToImages = async (pdfUrl: string, reportName: string): Promise<{ html: string; styles: string }> => {
        try {
          // Dynamically import PDF.js
          let pdfjsLib: any;
          try {
            // Try to use the global pdfjsLib if available
            if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
              pdfjsLib = (window as any).pdfjsLib;
            } else {
              // Try to import from pdfjs-dist
              const pdfjsModule = await import('pdfjs-dist');
              pdfjsLib = pdfjsModule;
              // Set worker if needed
              if (pdfjsLib.GlobalWorkerOptions) {
                pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
              }
            }
          } catch (importError) {
            // Fallback: try loading from CDN
            if (!(window as any).pdfjsLib) {
              await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                script.onload = () => {
                  (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                  resolve(void 0);
                };
                script.onerror = reject;
                document.head.appendChild(script);
                setTimeout(() => reject(new Error('PDF.js load timeout')), 10000);
              });
            }
            pdfjsLib = (window as any).pdfjsLib;
          }

          // Fetch PDF file
          const response = await fetch(pdfUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.statusText}`);
          }
          
          const arrayBuffer = await response.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const numPages = pdf.numPages;
          
          const pageImages: string[] = [];
          
          // Render each page to canvas and convert to image
          for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better quality
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Could not get canvas context');
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({
              canvasContext: context,
              viewport: viewport
            }).promise;
            
            // Convert canvas to base64 image
            const imageData = canvas.toDataURL('image/png', 0.95);
            pageImages.push(imageData);
          }
          
          // Create HTML with all pages - include header on first page only
          // Use page-break-before on subsequent pages instead of page-break-after to avoid double breaks
          const pagesHtml = pageImages.map((imgData, idx) => {
            const isFirstPage = idx === 0;
            const pageBreakStyle = isFirstPage 
              ? '' 
              : 'page-break-before: always;';
            return `
            <div style="${pageBreakStyle} width: 100%; text-align: center; margin: 0; padding: 0;">
              ${isFirstPage ? `<h2 style="text-align: center; margin-bottom: 1rem; font-size: 18px; font-weight: bold; page-break-after: avoid;">${reportName}</h2>` : ''}
              <img src="${imgData}" style="max-width: 100%; height: auto; display: block; margin: 0 auto; page-break-inside: avoid;" alt="Page ${idx + 1} of ${reportName}" />
            </div>
          `;
          }).join('');
          
          return {
            html: `<div class="pdf-report-section">
              ${pagesHtml}
            </div>`,
            styles: ''
          };
        } catch (error: any) {
          console.error(`Error converting PDF to images for ${reportName}:`, error);
          // Fallback: return a placeholder with download link
          return {
            html: `<div class="pdf-report-section" style="padding: 2rem; text-align: center;">
              <h2 style="margin-bottom: 1rem;">${reportName}</h2>
              <p style="color: #666;">PDF could not be loaded. Please download separately: <a href="${pdfUrl}" target="_blank">${reportName}</a></p>
            </div>`,
            styles: ''
          };
        }
      };
      
      // Extract each report's HTML (or convert PDFs to images)
      for (let i = 0; i < reports.length; i++) {
        const report = reports[i];
        const shortName = report.name.length > 30 ? report.name.substring(0, 30) + '...' : report.name;
        setGenProgress(`Loading report ${i + 1}/${reports.length}: ${shortName}`);
        
        // Check if this is a PDF report (direct file URL, not report:/ URL)
        if (report.file_url && !report.file_url.startsWith('report:/') && report.file_url.toLowerCase().endsWith('.pdf')) {
          // Convert PDF pages to images and embed
          const pdfContent = await convertPdfToImages(report.file_url, report.name);
          reportContents.push({ name: report.name, ...pdfContent });
          continue;
        }
        
        const reportRoute = getReportRoute(report.file_url);
        if (!reportRoute) continue;
        
        const fullUrl = `${window.location.origin}${reportRoute}`;
        const result = await extractReportHTML(fullUrl, report.name);
        
        if (result) {
          reportContents.push({ name: report.name, ...result });
        }
        
        // Small delay between reports
        await new Promise(r => setTimeout(r, 300));
      }
      
      setGenProgress('Building print document...');
      
      // Build the combined HTML document
      const printWindow = window.open('', '_blank', 'width=850,height=1100');
      if (!printWindow) {
        alert('Please allow popups to generate the PDF');
        setGenerating(false);
        return;
      }
      
      // Convert image URL to base64 data URI
      const imageToBase64 = async (url: string): Promise<string> => {
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(url); // Fallback to original URL
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.error('Failed to convert image:', e);
          return url; // Fallback to original URL
        }
      };
      
      // Convert all image URLs in HTML to base64
      const convertImagesToBase64 = async (html: string): Promise<string> => {
        const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
        const matches = [...html.matchAll(imgRegex)];
        
        let result = html;
        for (const match of matches) {
          const originalTag = match[0];
          const imageUrl = match[1];
          
          // Skip if already a data URI
          if (imageUrl.startsWith('data:')) continue;
          
          try {
            const base64 = await imageToBase64(imageUrl);
            const newTag = originalTag.replace(imageUrl, base64);
            result = result.replace(originalTag, newTag);
          } catch (e) {
            console.error('Failed to convert image:', imageUrl, e);
          }
        }
        
        return result;
      };
      
      setGenProgress('Converting images for print...');
      
      // Convert images in cover letter and exec summary to base64
      const coverLetterFullHtml = await convertImagesToBase64(coverLetter.html);
      
      let execSummaryFullHtml = '';
      if (executiveSummary?.html) {
        execSummaryFullHtml = await convertImagesToBase64(executiveSummary.html);
      }
      
      // Load cover letter in hidden iframe and extract rendered HTML (same as reports)
      const loadDocumentHTML = (html: string, name: string): Promise<{ html: string; styles: string }> => {
        return new Promise((resolve) => {
          // Create blob URL from HTML
          const blob = new Blob([html], { type: 'text/html' });
          const blobUrl = URL.createObjectURL(blob);
          
          const iframe = document.createElement('iframe');
          iframe.style.position = 'fixed';
          iframe.style.left = '0';
          iframe.style.top = '0';
          iframe.style.width = '8.5in';
          iframe.style.height = '11in';
          iframe.style.zIndex = '-9999';
          iframe.style.opacity = '0.01';
          
          const timeout = setTimeout(() => {
            console.warn(`Timeout loading: ${name}`);
            URL.revokeObjectURL(blobUrl);
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            resolve({ html: '', styles: '' });
          }, 10000);

          iframe.onload = async () => {
            await new Promise(r => setTimeout(r, 1000));
            
            try {
              const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (!iframeDoc) {
                clearTimeout(timeout);
                URL.revokeObjectURL(blobUrl);
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                resolve({ html: '', styles: '' });
                return;
              }

              // Get all styles
              const styles: string[] = [];
              iframeDoc.querySelectorAll('style').forEach(style => {
                styles.push(style.outerHTML);
              });
              
              // Get body content
              const html = iframeDoc.body ? iframeDoc.body.innerHTML : '';
              
              clearTimeout(timeout);
              URL.revokeObjectURL(blobUrl);
              if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
              
              console.log(`✅ Loaded ${name}: ${html.length} chars`);
              resolve({ html, styles: styles.join('\n') });
            } catch (e) {
              console.error(`Error loading ${name}:`, e);
              clearTimeout(timeout);
              URL.revokeObjectURL(blobUrl);
              if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
              resolve({ html: '', styles: '' });
            }
          };

          iframe.src = blobUrl;
          document.body.appendChild(iframe);
        });
      };
      
      // Helper to inline computed styles on elements for print
      const inlineStylesForPrint = (html: string): string => {
        // Create a temporary div to parse the HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // Add inline styles to critical elements
        // For the orange stripe, replace with an <img> tag using an SVG data URI
        // Images are the most reliable way to print colored elements
        const orangeSvgDataUri = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='1200'%3E%3Crect fill='%23f26722' width='36' height='1200'/%3E%3C/svg%3E";
        
        const ampStripes = tempDiv.querySelectorAll('.amp-stripe');
        ampStripes.forEach(el => {
          // Replace with an img element
          const img = document.createElement('img');
          img.src = orangeSvgDataUri;
          img.className = 'amp-stripe-img';
          img.setAttribute('style', 'position:absolute;top:0;left:0;width:36px;height:100%;min-height:11in;display:block;');
          el.parentNode?.replaceChild(img, el);
        });
        
        // Style .amp-page elements
        const ampPages = tempDiv.querySelectorAll('.amp-page');
        ampPages.forEach(el => {
          const htmlEl = el as HTMLElement;
          htmlEl.style.cssText = 'position:relative !important;width:8.5in !important;min-height:11in !important;height:11in !important;margin:0 !important;padding:0.9in 0.9in 0.9in 1.25in !important;box-sizing:border-box !important;background:white !important;font-family:Arial,sans-serif !important;overflow:visible !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;';
        });
        
        // Hide AMP badge on all pages
        const ampBadges = tempDiv.querySelectorAll('.amp-badge');
        ampBadges.forEach(el => {
          (el as HTMLElement).style.cssText = 'display:none !important;visibility:hidden !important;';
        });
        
        // Hide AMP header/logo on TOC page (toc-page class)
        const tocPages = tempDiv.querySelectorAll('.toc-page');
        tocPages.forEach(page => {
          const headers = page.querySelectorAll('.amp-header');
          headers.forEach(el => {
            (el as HTMLElement).style.cssText = 'display:none !important;visibility:hidden !important;';
          });
        });
        
        const ampHeaders = tempDiv.querySelectorAll('.amp-header');
        ampHeaders.forEach(el => {
          (el as HTMLElement).style.cssText = 'position:absolute !important;top:0.5in !important;left:1.25in !important;right:0.9in !important;display:flex !important;align-items:center !important;gap:12px !important;z-index:10 !important;';
          // Constrain header logo images so they don't blow up to natural size in print
          el.querySelectorAll('img').forEach(img => {
            img.style.cssText = 'height:50px !important;max-height:50px !important;width:auto !important;object-fit:contain !important;';
          });
        });
        
        const ampFooters = tempDiv.querySelectorAll('.amp-footer');
        ampFooters.forEach(el => {
          (el as HTMLElement).style.cssText = 'position:absolute !important;bottom:0.9in !important;left:1.25in !important;right:0.9in !important;display:flex !important;align-items:center !important;gap:16px !important;z-index:10 !important;';
          // Constrain footer logo images (NETA etc.)
          el.querySelectorAll('img').forEach(img => {
            if (!img.classList.contains('amp-stripe-img')) {
              img.style.cssText = 'height:34px !important;max-height:34px !important;width:auto !important;object-fit:contain !important;';
            }
          });
        });
        
        const footerRules = tempDiv.querySelectorAll('.amp-footer .rule');
        footerRules.forEach(el => {
          (el as HTMLElement).style.cssText = 'flex:1 !important;height:2px !important;background:#8b7359 !important;margin:0 12px !important;-webkit-print-color-adjust:exact !important;';
        });
        
        const coverBlocks = tempDiv.querySelectorAll('.cover-block');
        coverBlocks.forEach(el => {
          (el as HTMLElement).style.cssText = 'margin-top:1.2in !important;';
        });
        
        const coverTitles = tempDiv.querySelectorAll('.cover-title');
        coverTitles.forEach(el => {
          (el as HTMLElement).style.cssText = 'font-size:44px !important;font-weight:900 !important;margin:0 0 24px !important;font-family:Arial,sans-serif !important;';
        });
        
        const coverLines = tempDiv.querySelectorAll('.cover-line');
        coverLines.forEach(el => {
          (el as HTMLElement).style.cssText = 'font-size:18px !important;font-weight:800 !important;margin:12px 0 !important;font-family:Arial,sans-serif !important;';
        });
        
        const execTitles = tempDiv.querySelectorAll('.exec-title');
        execTitles.forEach(el => {
          (el as HTMLElement).style.cssText = 'font-size:28px !important;font-weight:900 !important;text-decoration:underline !important;margin-bottom:6px !important;font-family:Arial,sans-serif !important;';
        });
        
        // Fix exec summary fonts - make all text use Arial and proper sizes
        const execMeta = tempDiv.querySelectorAll('.exec-meta');
        execMeta.forEach(el => {
          (el as HTMLElement).style.cssText = 'margin:6px 0 12px !important;font-size:14px !important;font-family:Arial,sans-serif !important;';
        });
        
        const execSections = tempDiv.querySelectorAll('.exec-section');
        execSections.forEach(el => {
          (el as HTMLElement).style.cssText = 'margin:12px 0 !important;font-size:14px !important;font-family:Arial,sans-serif !important;';
        });
        
        const sigGrids = tempDiv.querySelectorAll('.sig-grid');
        sigGrids.forEach(el => {
          (el as HTMLElement).style.cssText = 'display:flex !important;flex-direction:row !important;flex-wrap:nowrap !important;gap:28px !important;margin-top:18px !important;font-family:Arial,sans-serif !important;';
          // Strip stray text nodes that can appear between sig-col divs from DOM round-trips
          Array.from(el.childNodes).forEach(child => {
            if (child.nodeType === 3 && !child.textContent?.trim()) {
              el.removeChild(child);
            }
          });
        });
        
        const sigCols = tempDiv.querySelectorAll('.sig-col');
        sigCols.forEach(el => {
          (el as HTMLElement).style.cssText = 'flex:1 !important;min-width:0 !important;font-family:Arial,sans-serif !important;font-size:14px !important;line-height:1.5 !important;overflow-wrap:break-word !important;word-wrap:break-word !important;';
          // Remove contenteditable for print (it can cause Chrome to inject extra markup)
          el.removeAttribute('contenteditable');
          // Ensure <b> headers inside sig-col are block-level
          el.querySelectorAll('b').forEach(b => {
            (b as HTMLElement).style.cssText = 'display:block !important;margin-bottom:6px !important;';
          });
        });
        
        // Add inline borders to all tables for print reliability
        const tables = tempDiv.querySelectorAll('table');
        tables.forEach(table => {
          (table as HTMLElement).style.cssText += 'border-collapse:collapse !important;border:1px solid #000 !important;';
        });
        
        const thTds = tempDiv.querySelectorAll('table th, table td');
        thTds.forEach(cell => {
          (cell as HTMLElement).style.cssText += 'border:1px solid #000 !important;';
        });
        
        const execTitleRules = tempDiv.querySelectorAll('.exec-title-rule');
        execTitleRules.forEach(el => {
          (el as HTMLElement).style.cssText = 'height:3px !important;background:#f26722 !important;margin:4px 0 14px !important;-webkit-print-color-adjust:exact !important;';
        });
        
        const tocTwoColumns = tempDiv.querySelectorAll('.toc-two-columns');
        tocTwoColumns.forEach(el => {
          (el as HTMLElement).style.cssText = 'display:flex !important;flex-direction:row !important;gap:20px !important;';
        });
        
        // Force print-only sections to be visible (they have 'hidden print:block' classes)
        // This applies to ALL platforms, not just Windows
        const printSections = tempDiv.querySelectorAll('.job-info-print, .nameplate-print, .test-eqpt-print, .device-print, .overview-print, [class*="-print"]:not([class*="no-print"])');
        printSections.forEach(el => {
          const htmlEl = el as HTMLElement;
          htmlEl.style.cssText += 'display:block !important;visibility:visible !important;';
        });
        
        // Hide screen-only sections (they have 'print:hidden' class)
        const screenOnlySections = tempDiv.querySelectorAll('[class*="print:hidden"], [class*="print\\:hidden"]');
        screenOnlySections.forEach(el => {
          const htmlEl = el as HTMLElement;
          htmlEl.style.cssText += 'display:none !important;';
        });
        
        // Also handle elements with 'hidden' class that should be visible for print
        const hiddenPrintElements = tempDiv.querySelectorAll('.hidden[class*="print:block"], .hidden[class*="-print"]');
        hiddenPrintElements.forEach(el => {
          const htmlEl = el as HTMLElement;
          htmlEl.style.cssText += 'display:block !important;visibility:visible !important;';
        });
        // Report print header/title: elements with print:flex (e.g. report title bar) must show in deliverable print
        const printFlexElements = tempDiv.querySelectorAll('[class*="print:flex"]');
        printFlexElements.forEach(el => {
          const htmlEl = el as HTMLElement;
          htmlEl.style.cssText += 'display:flex !important;visibility:visible !important;';
        });
        const printBlockElements = tempDiv.querySelectorAll('[class*="print:block"]');
        printBlockElements.forEach(el => {
          const htmlEl = el as HTMLElement;
          const current = (htmlEl.style.cssText || '');
          if (!current.includes('display:')) htmlEl.style.cssText += 'display:block !important;visibility:visible !important;';
        });
        
        // Add print-color-adjust to all elements
        tempDiv.querySelectorAll('*').forEach(el => {
          const htmlEl = el as HTMLElement;
          if (htmlEl.style) {
            htmlEl.style.setProperty('-webkit-print-color-adjust', 'exact', 'important');
            htmlEl.style.setProperty('print-color-adjust', 'exact', 'important');
          }
        });
        
        // Remove empty list items that cause extra bullets in print
        tempDiv.querySelectorAll('li').forEach(li => {
          if (!li.textContent?.trim() && !li.querySelector('img')) {
            li.remove();
          }
        });
        tempDiv.querySelectorAll('ul').forEach(ul => {
          if (!ul.textContent?.trim() && !ul.querySelector('li')) {
            ul.remove();
          }
        });
        
        return tempDiv.innerHTML;
      };
      
      setGenProgress('Loading cover letter...');
      const coverLetterRendered = await loadDocumentHTML(coverLetterFullHtml, 'Cover Letter');
      // Apply inline styles for print
      coverLetterRendered.html = inlineStylesForPrint(coverLetterRendered.html);
      
      let execSummaryRendered = { html: '', styles: '' };
      if (execSummaryFullHtml) {
        setGenProgress('Loading executive summary...');
        execSummaryRendered = await loadDocumentHTML(execSummaryFullHtml, 'Executive Summary');
        execSummaryRendered.html = inlineStylesForPrint(execSummaryRendered.html);
      }
      
      // Convert report images to base64 and apply inline print styles; keep each report's styles for placement after its HTML
      const convertedReportContents: { name: string; html: string; styles: string }[] = [];
      for (const report of reportContents) {
        let processedHtml = await convertImagesToBase64(report.html);
        processedHtml = inlineStylesForPrint(processedHtml);
        convertedReportContents.push({
          name: report.name,
          html: processedHtml,
          styles: report.styles || ''
        });
      }
      
      // Collect styles from cover letter and exec summary only; report styles are emitted per-report after each report's HTML so they override deliverable generic rules
      const allStyles = new Set<string>();
      if (coverLetterRendered.styles) allStyles.add(coverLetterRendered.styles);
      if (execSummaryRendered.styles) allStyles.add(execSummaryRendered.styles);
      
      const combinedHTML = `
<!DOCTYPE html>
<html class="${isWindows ? 'is-windows' : ''}">
<head>
  <meta charset="UTF-8">
  <title>${deliverable?.name || 'Deliverable'}</title>
  <style>
    /* Force print color preservation on ALL elements */
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    
    /* No @page margin so user can print with "None" margins and orange bar spans full page */
    @page {
      size: letter;
      margin: 0;
    }
    
    /* ============================================ */
    /* TAILWIND PRINT CLASS OVERRIDES              */
    /* Show print versions, hide screen versions   */
    /* ============================================ */
    
    /* Show elements with print:block class */
    .print\\:block,
    [class*="print:block"],
    .hidden.print\\:block,
    .hidden[class*="print:block"],
    .hidden[class*="-print"],
    [class*="hidden"][class*="print"] {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    
    /* Force hide screen-only elements */
    .print\\:hidden,
    [class*="print:hidden"] {
      display: none !important;
    }
    
    /* Show elements with print:flex class */
    .print\\:flex,
    [class*="print:flex"] {
      display: flex !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    
    /* Tailwind utility classes for flexbox - needed for print header layout */
    .flex {
      display: flex !important;
    }
    .justify-between {
      justify-content: space-between !important;
    }
    .items-center {
      align-items: center !important;
    }
    .flex-1 {
      flex: 1 1 0% !important;
    }
    .text-center {
      text-align: center !important;
    }
    .text-right {
      text-align: right !important;
    }
    
    /* Table layout fixes - prevent vertical text stacking */
    table {
      table-layout: auto !important;
      width: 100% !important;
      border-collapse: collapse !important;
    }
    
    th, td {
      white-space: normal !important;
      word-wrap: break-word !important;
      overflow-wrap: break-word !important;
      vertical-align: top !important;
      padding: 4px 6px !important;
    }
    
    /* Ensure table headers don't stack text vertically */
    th {
      white-space: nowrap !important;
      min-width: fit-content !important;
    }
    
    /* Fix narrow columns causing vertical text - specific column headers */
    th:last-child,
    td:last-child {
      min-width: 80px !important;
    }
    
    /* Prevent single-letter-per-line stacking */
    th, td, span, div {
      word-break: normal !important;
      overflow-wrap: normal !important;
      hyphens: none !important;
    }
    
    /* Ensure result/status columns have enough width */
    td[class*="result"], td[class*="status"],
    th[class*="result"], th[class*="status"] {
      min-width: 90px !important;
      white-space: nowrap !important;
    }
    
    /* Hide elements with print:hidden class */
    .print\\:hidden,
    [class*="print:hidden"] {
      display: none !important;
    }
    
    /* Hide on-screen form versions - they have editable inputs/selects */
    [class*="-onscreen"],
    [class*="onscreen-"],
    .job-info-onscreen,
    .nameplate-onscreen,
    .test-eqpt-onscreen,
    .device-onscreen {
      display: none !important;
    }
    
    /* Show print versions of sections */
    .job-info-print,
    .nameplate-print,
    .test-eqpt-print,
    .device-print,
    [class*="-print"]:not([class*="no-print"]) {
      display: block !important;
      visibility: visible !important;
    }
    
    /* Print text styling */
    .print\\:text-black,
    [class*="print:text-black"] {
      color: black !important;
    }
    
    .print\\:bg-white,
    [class*="print:bg-white"] {
      background-color: white !important;
    }
    
    .print\\:border-black,
    [class*="print:border-black"] {
      border-color: black !important;
    }
    
    .print\\:font-bold,
    [class*="print:font-bold"] {
      font-weight: 700 !important;
    }
    
    .print\\:text-center,
    [class*="print:text-center"] {
      text-align: center !important;
    }
    
    .print\\:border,
    [class*="print:border"] {
      border-width: 1px !important;
      border-style: solid !important;
    }
    
    @media print {
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      
      html, body {
        margin: 0 !important;
        padding: 0.5in !important;
        background: white !important;
        box-sizing: border-box !important;
      }
      
      .print-section {
        page-break-after: always !important;
        break-after: page !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      
      .print-section:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      
      /* Ensure no gaps between pages for continuous orange bar */
      .cover-letter-section, .exec-summary-section {
        margin: 0 !important;
        padding: 0 !important;
      }
      
      /* Full-bleed orange bar: break out of 0.5in body padding so bar spans entire page when user prints with no margins */
      .cover-letter-section .amp-page:first-child,
      .exec-summary-section .amp-page:first-child {
        margin-top: -0.5in !important;
      }
      .cover-letter-section .amp-page:last-child .amp-footer,
      .exec-summary-section .amp-page:last-child .amp-footer {
        bottom: -0.5in !important;
        left: -0.5in !important;
        width: calc(100% + 1in) !important;
        max-width: 8.5in !important;
      }
      .cover-letter-section .amp-stripe,
      .cover-letter-section .amp-stripe-img,
      .exec-summary-section .amp-stripe,
      .exec-summary-section .amp-stripe-img {
        left: -0.5in !important;
      }
      .cover-letter-section .amp-header,
      .exec-summary-section .amp-header {
        left: -0.5in !important;
        width: calc(100% + 1in) !important;
        max-width: 8.5in !important;
        margin-top: -0.5in !important;
      }
      .cover-letter-section .exec-title-rule,
      .exec-summary-section .exec-title-rule {
        margin-left: -0.5in !important;
        margin-right: -0.5in !important;
        width: calc(100% + 1in) !important;
        max-width: 8.5in !important;
      }
      
      /* Orange stripe image styling */
      .amp-stripe-img {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 36px !important;
        height: 100% !important;
        min-height: 11in !important;
        display: block !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Hide original .amp-stripe if still present */
      .amp-stripe:not(.amp-stripe-img) {
        display: none !important;
        left: 0 !important;
        width: 36px !important;
        height: 100% !important;
        min-height: 11in !important;
      }
      
      .amp-stripe rect {
        fill: #f26722 !important;
      }
      
      /* Constrain header & footer logo images so they don't blow up in print */
      .amp-header img {
        height: 50px !important;
        max-height: 50px !important;
        width: auto !important;
        object-fit: contain !important;
      }
      .amp-footer img:not(.amp-stripe-img) {
        height: 34px !important;
        max-height: 34px !important;
        width: auto !important;
        object-fit: contain !important;
      }
      .amp-badge img {
        height: 48px !important;
        max-height: 48px !important;
        width: auto !important;
      }
      
      /* Hide AMP badge */
      .amp-badge {
        display: none !important;
        visibility: hidden !important;
      }
      
      /* Hide AMP header on TOC page */
      .toc-page .amp-header {
        display: none !important;
        visibility: hidden !important;
      }
      
      /* Signature grid: ensure flex layout survives print */
      .sig-grid {
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        gap: 28px !important;
        margin-top: 18px !important;
        font-family: Arial, sans-serif !important;
      }
      .sig-col {
        flex: 1 !important;
        min-width: 0 !important;
        font-size: 14px !important;
        line-height: 1.5 !important;
        font-family: Arial, sans-serif !important;
        overflow-wrap: break-word !important;
      }
      .sig-col b {
        display: block !important;
        margin-bottom: 6px !important;
      }
      
      /* Ensure amp-page fills full page height with no gaps */
      .amp-page {
        position: relative !important;
        min-height: 11in !important;
        height: 11in !important;
        margin: 0 !important;
        overflow: visible !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        box-sizing: border-box !important;
      }
      
      /* No gaps between sections */
      .print-section .amp-page {
        margin: 0 !important;
      }
      
      /* Minimal table fallback only - no column widths or th/td overrides so each report's own print CSS controls layout (e.g. Low Voltage Switch, Panelboard). */
      .report-section table {
        border-collapse: collapse !important;
        width: 100% !important;
      }
      
      .amp-page {
        position: relative !important;
        width: 8.5in !important;
        height: 11in !important;
        min-height: 11in !important;
        margin: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        box-sizing: border-box !important;
        padding: 0 !important;
        background: white !important;
        overflow: visible !important;
      }
      
      .amp-header {
        position: absolute !important;
        top: 0 !important;
        left: 0.5in !important;
        right: 0 !important;
        display: flex !important;
      }
      
      .amp-footer {
        position: absolute !important;
        bottom: 0 !important;
        left: 0.5in !important;
        right: 0 !important;
        display: flex !important;
      }
      
      .amp-footer .rule {
        background: #8b7359 !important;
        background-color: #8b7359 !important;
      }
      
      .exec-title-rule {
        background: #f26722 !important;
        background-color: #f26722 !important;
      }
      
      /* ============================================ */
      /* WINDOWS-SPECIFIC PRINT FIXES                */
      /* ============================================ */
      
      /* Ensure print meta sections are visible on Windows */
      .is-windows .report-section .job-info-print,
      .is-windows .report-section .nameplate-print,
      .is-windows .report-section .test-eqpt-print,
      .is-windows .report-section .device-print {
        display: block !important;
        visibility: visible !important;
      }
      
      /* Windows: only minimal table layout so report styles control appearance */
      .is-windows .report-section table {
        table-layout: auto !important;
        width: 100% !important;
      }
    }
    
    html, body {
      margin: 0;
      padding: 0.5in;
      background: white;
      box-sizing: border-box;
    }
    
    /* Section styling */
    .print-section {
      page-break-after: always;
      background: white;
      margin: 0;
      padding: 0;
    }
    
    .print-section:last-child {
      page-break-after: auto;
    }
    
    .cover-letter-section,
    .exec-summary-section {
      margin: 0;
      padding: 0;
    }
    
    /* Report section styling - @page handles margins */
    .report-section #report-container {
      max-width: 8in;
      margin: 0 auto;
      padding: 0;
      background: white;
    }
    
    /* Hide print buttons */
    button, .no-print, [class*="print:hidden"] {
      display: none !important;
    }
    
    /* Minimal table fallback - reports use their own print CSS for layout (e.g. Low Voltage Switch, Panelboard, CT). */
    .report-section table {
      border-collapse: collapse !important;
      width: 100% !important;
    }
  </style>
  
  <!-- All document styles -->
  ${Array.from(allStyles).join('\n')}
</head>
<body>
  <!-- Cover Letter -->
  <div class="print-section cover-letter-section">
    ${coverLetterRendered.html}
  </div>
  
  ${execSummaryRendered.html ? `
  <!-- Executive Summary -->
  <div class="print-section exec-summary-section">
    ${execSummaryRendered.html}
  </div>
  ` : ''}
  
  <!-- Reports: inline each report's HTML with its styles immediately after so report CSS wins (no iframe - iframes often don't print) -->
  ${convertedReportContents.map((report, idx) => `
  <!-- Report ${idx + 1}: ${report.name} -->
  <div class="print-section report-section">
    ${report.html}
  </div>
  ${report.styles ? `<style>${report.styles}</style>` : ''}
  `).join('\n')}
  
  <script>
    // Auto-trigger print after content loads
    setTimeout(function() {
      window.print();
    }, 1500);
  </script>
</body>
</html>
      `;
      
      printWindow.document.write(combinedHTML);
      printWindow.document.close();
      
      setGenProgress('Print dialog opening...');
      
      setTimeout(() => {
        setGenerating(false);
        setGenProgress('');
      }, 2000);
      
    } catch (err: any) {
      console.error('PDF generation error:', err);
      setGenProgress(`Error: ${err.message}`);
      setTimeout(() => {
        setGenerating(false);
        setGenProgress('');
      }, 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-dark-200">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#f26722] mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-white">Loading deliverable...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-dark-200">
        <p className="text-red-600 dark:text-red-400">Error: {error}</p>
      </div>
    );
  }

  if (!deliverable || !coverLetter) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-dark-200">
        <p className="text-gray-600 dark:text-white">Deliverable not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-dark-200">
      <style>{`
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        .document-content .amp-page {
          position: relative;
          width: 8.5in;
          height: 11in;
          margin: 0 auto;
          padding: 0.9in 0.9in 0.9in 1.25in;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          box-sizing: border-box !important;
          box-sizing: border-box;
          background: white;
        }
        
        .document-content .amp-stripe {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: 36px;
          background: #f26722;
        }
        
        .document-content .amp-header {
          position: absolute;
          top: 0.9in;
          left: 1.25in;
          right: 0.9in;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .document-content .amp-footer {
          position: absolute;
          bottom: 0.9in;
          left: 1.25in;
          right: 0.9in;
          display: flex;
          align-items: center;
          gap: 16px;
        }
        
        .document-content .amp-page-content {
          padding-top: 80px;
          padding-bottom: 60px;
        }
        
        .document-content .amp-badge {
          display: none !important;
        }
        
        .document-content .amp-page * {
          font-family: Arial, sans-serif;
        }
        
        .deliverable-content {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
        }
        
        .deliverable-section {
          margin-bottom: 20px;
          background: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        /* TOC styles */
        .document-content .toc-two-columns {
          display: flex !important;
          flex-direction: row !important;
          gap: 20px !important;
        }
        .document-content .toc-col-left,
        .document-content .toc-col-right {
          flex: 1 !important;
        }
        .document-content .toc-group {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      `}</style>

      {/* Header */}
      <div className="bg-white dark:bg-dark-150 border-b border-gray-200 dark:border-gray-700 p-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{deliverable.name}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Status: {deliverable.status} • {reports.length} report(s)
            </p>
          </div>
          <div className="flex items-center gap-4">
            {generating ? (
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-md">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#f26722] border-t-transparent"></div>
                <span className="text-sm text-gray-700 dark:text-gray-200">{genProgress}</span>
              </div>
            ) : (
              <button
                onClick={generatePDF}
                className="px-4 py-2 bg-[#f26722] hover:bg-[#e55611] text-white rounded-md font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Generate PDF
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="deliverable-content">
        {/* Cover Letter */}
        <div className="deliverable-section cover-letter-section">
          <div 
            dangerouslySetInnerHTML={{ __html: coverLetter.html }}
            className="document-content"
          />
        </div>

        {/* Executive Summary */}
        {executiveSummary && (
          <div className="deliverable-section exec-summary-section">
            <div 
              dangerouslySetInnerHTML={{ __html: executiveSummary.html }}
              className="document-content"
            />
          </div>
        )}

        {/* Reports Preview */}
        <div className="deliverable-section p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Reports Included ({reports.length})
          </h3>
          <ul className="space-y-2">
            {reports.map((report, idx) => (
              <li key={report.id} className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <span className="text-[#f26722] font-bold">{idx + 1}.</span>
                {report.name}
              </li>
            ))}
          </ul>
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-blue-800 dark:text-blue-200 text-sm">
              <strong>How it works:</strong> Click "Generate PDF" to load each report, extract its content, 
              and open a print-ready document with everything combined. Use your browser's "Save as PDF" option 
              in the print dialog.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
