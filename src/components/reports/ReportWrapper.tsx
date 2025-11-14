import React, { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface ReportWrapperProps {
  children: React.ReactNode;
  isPrintMode?: boolean;
}

export const ReportWrapper: React.FC<ReportWrapperProps> = ({ children, isPrintMode = false }) => {
  useEffect(() => {
    // Inject print CSS once
    if (typeof document !== 'undefined' && !document.getElementById('vm-standard-print-css')) {
      const style = document.createElement('style');
      style.id = 'vm-standard-print-css';
      
      // Detect Windows platform and add class to html element
      const isWindows = navigator.platform.includes('Win') || navigator.userAgent.includes('Windows');
      if (isWindows && typeof document !== 'undefined') {
        document.documentElement.classList.add('is-windows');
      }
      
      style.textContent = `
        @media print {
          /* ============================================ */
          /* CROSS-PLATFORM PRINT STANDARDIZATION        */
          /* macOS appearance preserved, Windows matched */
          /* ============================================ */
          
          /* Preserve colors across platforms */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          
          /* Override container sizing for print to avoid page-length blank gaps */
          #report-container {
            min-height: auto !important;
            padding: 10px 20px 20px 20px !important;
            margin: 0 auto !important;
          }
          
          /* Global: make inputs/selects look like plain text in print */
          #report-container input,
          #report-container select,
          #report-container textarea {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            -webkit-appearance: none !important;
            -moz-appearance: none !important;
            appearance: none !important;
            padding: 0 !important;
            margin: 0 !important;
            color: black !important;
            /* Windows Chrome form element fixes */
            outline: none !important;
            text-indent: 0 !important;
          }
          
          /* Hide select dropdown arrow - Windows & IE/Edge */
          #report-container select::-ms-expand { display: none !important; }
          #report-container select { 
            background-image: none !important;
            padding-right: 0 !important;
          }
          
          /* Remove number input spinners - cross-browser */
          #report-container input[type="number"]::-webkit-outer-spin-button,
          #report-container input[type="number"]::-webkit-inner-spin-button { 
            -webkit-appearance: none !important; 
            margin: 0 !important; 
            display: none !important;
          }
          #report-container input[type="number"] { 
            -moz-appearance: textfield !important; 
          }
          #report-container input[type="number"]::-ms-clear { display: none !important; }

          /* ============================================ */
          /* TABLE BORDERS - Windows Chrome Enhancement */
          /* ============================================ */
          
          /* Enforce crisp table borders across all reports */
          #report-container table,
          #report-container th,
          #report-container td,
          #report-container thead,
          #report-container tbody,
          #report-container tr {
            border: 1px solid black !important;
            /* Windows-specific border rendering fixes */
            border-style: solid !important;
            border-width: 1px !important;
            border-color: #000000 !important;
          }
          
          #report-container table { 
            border-collapse: collapse !important; 
            width: 100% !important;
            /* Windows table rendering improvements */
            table-layout: auto !important;
            border-spacing: 0 !important;
          }
          
          #report-container th, #report-container td { 
            padding: 2px 3px !important;
            /* Windows text rendering in tables */
            line-height: 1.2 !important;
            vertical-align: top !important;
          }

          /* Standardize Visual/Mechanical tables that include a Results column */
          #report-container .vm-standard,
          #report-container .visual-mechanical-table { width: 100% !important; table-layout: fixed !important; }
          #report-container .vm-standard th, 
          #report-container .vm-standard td,
          #report-container .visual-mechanical-table th,
          #report-container .visual-mechanical-table td { 
            white-space: normal !important; 
            word-break: break-word !important; 
            font-size: 9px !important; 
            line-height: 1.15 !important; 
            padding: 3px 4px !important; 
            vertical-align: top !important;
          }
          /* Column widths: small NETA Section, large Description, Results on right */
          #report-container .vm-standard thead th:first-child,
          #report-container .vm-standard tbody td:first-child,
          #report-container .visual-mechanical-table thead th:first-child,
          #report-container .visual-mechanical-table tbody td:first-child { width: 10% !important; text-align: left !important; }
          #report-container .vm-standard thead th:nth-child(2),
          #report-container .vm-standard tbody td:nth-child(2),
          #report-container .visual-mechanical-table thead th:nth-child(2),
          #report-container .visual-mechanical-table tbody td:nth-child(2) { width: 75% !important; text-align: left !important; }
          #report-container .vm-standard thead th:nth-child(3),
          #report-container .vm-standard tbody td:nth-child(3),
          #report-container .visual-mechanical-table thead th:nth-child(3),
          #report-container .visual-mechanical-table tbody td:nth-child(3) { width: 15% !important; text-align: center !important; }

          /* Force-print toggle helpers for IR table */
          #report-container .ir-screen { display: none !important; }
          #report-container .ir-print { display: block !important; }
          #report-container .ir-print table { width: 100% !important; table-layout: fixed !important; }
          #report-container .ir-print th, 
          #report-container .ir-print td { font-size: 9px !important; padding: 2px 3px !important; }

          /* ============================================ */
          /* WINDOWS-ONLY PRINT FIXES                   */
          /* Only apply when .is-windows class is present */
          /* ============================================ */
          
          .is-windows #report-container * {
            -webkit-font-smoothing: antialiased !important;
            -moz-osx-font-smoothing: grayscale !important;
            text-rendering: optimizeLegibility !important;
            font-smooth: always !important;
          }
          
          .is-windows #report-container input,
          .is-windows #report-container select,
          .is-windows #report-container textarea {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            -webkit-appearance: none !important;
            -moz-appearance: none !important;
            appearance: none !important;
            padding: 0 !important;
            margin: 0 !important;
            color: black !important;
            /* Windows Chrome form element fixes */
            outline: none !important;
            text-indent: 0 !important;
          }
          
          .is-windows #report-container select::-ms-expand { display: none !important; }
          .is-windows #report-container select { 
            background-image: none !important;
            padding-right: 0 !important;
          }
          
          .is-windows #report-container input[type="number"]::-webkit-outer-spin-button,
          .is-windows #report-container input[type="number"]::-webkit-inner-spin-button { 
            -webkit-appearance: none !important; 
            margin: 0 !important; 
            display: none !important;
          }
          .is-windows #report-container input[type="number"] { 
            -moz-appearance: textfield !important; 
          }
          .is-windows #report-container input[type="number"]::-ms-clear { display: none !important; }

          .is-windows #report-container table,
          .is-windows #report-container th,
          .is-windows #report-container td,
          .is-windows #report-container thead,
          .is-windows #report-container tbody,
          .is-windows #report-container tr {
            border: 1px solid black !important;
            /* Windows-specific border rendering fixes */
            border-style: solid !important;
            border-width: 1px !important;
            border-color: #000000 !important;
          }
          
          .is-windows #report-container table { 
            border-collapse: collapse !important; 
            width: 100% !important;
            /* Windows table rendering improvements */
            table-layout: auto !important;
            border-spacing: 0 !important;
          }
          
          .is-windows #report-container th, .is-windows #report-container td { 
            padding: 2px 3px !important;
            /* Windows text rendering in tables */
            line-height: 1.2 !important;
            vertical-align: top !important;
          }
        }

        /* ============================================ */
        /* LIVE PREVIEW - Mirror print styles         */
        /* ============================================ */
        
        /* Windows-specific font rendering fixes for preview */
        .force-print * {
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
          text-rendering: optimizeLegibility !important;
          font-smooth: always !important;
        }
        
        /* Preserve colors in preview */
        .force-print * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        
        .force-print #report-container {
          min-height: auto !important;
          padding: 10px 20px 20px 20px !important;
          margin: 0 auto !important;
        }
        
        .force-print #report-container input,
        .force-print #report-container select,
        .force-print #report-container textarea {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          padding: 0 !important;
          margin: 0 !important;
          color: black !important;
          outline: none !important;
          text-indent: 0 !important;
        }
        
        .force-print #report-container select::-ms-expand { display: none !important; }
        .force-print #report-container select { 
          background-image: none !important;
          padding-right: 0 !important;
        }
        
        .force-print #report-container input[type="number"]::-webkit-outer-spin-button,
        .force-print #report-container input[type="number"]::-webkit-inner-spin-button { 
          -webkit-appearance: none !important; 
          margin: 0 !important;
          display: none !important;
        }
        .force-print #report-container input[type="number"] { 
          -moz-appearance: textfield !important; 
        }
        .force-print #report-container input[type="number"]::-ms-clear { display: none !important; }

        .force-print #report-container table,
        .force-print #report-container th,
        .force-print #report-container td,
        .force-print #report-container thead,
        .force-print #report-container tbody,
        .force-print #report-container tr {
          border: 1px solid black !important;
          border-style: solid !important;
          border-width: 1px !important;
          border-color: #000000 !important;
        }
        
        .force-print #report-container table { 
          border-collapse: collapse !important; 
          width: 100% !important;
          table-layout: auto !important;
          border-spacing: 0 !important;
        }
        
        .force-print #report-container th, 
        .force-print #report-container td { 
          padding: 2px 3px !important;
          line-height: 1.2 !important;
          vertical-align: top !important;
        }

        .force-print #report-container .vm-standard,
        .force-print #report-container .visual-mechanical-table { width: 100% !important; table-layout: fixed !important; }
        .force-print #report-container .vm-standard th, 
        .force-print #report-container .vm-standard td,
        .force-print #report-container .visual-mechanical-table th,
        .force-print #report-container .visual-mechanical-table td { 
          white-space: normal !important; 
          word-break: break-word !important; 
          font-size: 9px !important; 
          line-height: 1.15 !important; 
          padding: 3px 4px !important; 
          vertical-align: top !important;
        }
        .force-print #report-container .vm-standard thead th:first-child,
        .force-print #report-container .vm-standard tbody td:first-child,
        .force-print #report-container .visual-mechanical-table thead th:first-child,
        .force-print #report-container .visual-mechanical-table tbody td:first-child { width: 10% !important; text-align: left !important; }
        .force-print #report-container .vm-standard thead th:nth-child(2),
        .force-print #report-container .vm-standard tbody td:nth-child(2),
        .force-print #report-container .visual-mechanical-table thead th:nth-child(2),
        .force-print #report-container .visual-mechanical-table tbody td:nth-child(2) { width: 75% !important; text-align: left !important; }
        .force-print #report-container .vm-standard thead th:nth-child(3),
        .force-print #report-container .vm-standard tbody td:nth-child(3),
        .force-print #report-container .visual-mechanical-table thead th:nth-child(3),
        .force-print #report-container .visual-mechanical-table tbody td:nth-child(3) { width: 15% !important; text-align: center !important; }

        .force-print #report-container .ir-screen { display: none !important; }
        .force-print #report-container .ir-print { display: block !important; }
        .force-print #report-container .ir-print table { width: 100% !important; table-layout: fixed !important; }
        .force-print #report-container .ir-print th, 
        .force-print #report-container .ir-print td { font-size: 9px !important; padding: 2px 3px !important; }

        /* ============================================ */
        /* WINDOWS-ONLY LIVE PREVIEW FIXES              */
        /* Only apply when both .force-print and .is-windows */
        /* ============================================ */
        
        .force-print.is-windows #report-container * {
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
          text-rendering: optimizeLegibility !important;
          font-smooth: always !important;
        }
        
        .force-print.is-windows #report-container input,
        .force-print.is-windows #report-container select,
        .force-print.is-windows #report-container textarea {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          padding: 0 !important;
          margin: 0 !important;
          color: black !important;
          outline: none !important;
          text-indent: 0 !important;
        }
        
        .force-print.is-windows #report-container select::-ms-expand { display: none !important; }
        .force-print.is-windows #report-container select { 
          background-image: none !important;
          padding-right: 0 !important;
        }
        
        .force-print.is-windows #report-container input[type="number"]::-webkit-outer-spin-button,
        .force-print.is-windows #report-container input[type="number"]::-webkit-inner-spin-button { 
          -webkit-appearance: none !important; 
          margin: 0 !important;
          display: none !important;
        }
        .force-print.is-windows #report-container input[type="number"] { 
          -moz-appearance: textfield !important; 
        }
        .force-print.is-windows #report-container input[type="number"]::-ms-clear { display: none !important; }

        .force-print.is-windows #report-container table,
        .force-print.is-windows #report-container th,
        .force-print.is-windows #report-container td,
        .force-print.is-windows #report-container thead,
        .force-print.is-windows #report-container tbody,
        .force-print.is-windows #report-container tr {
          border: 1px solid black !important;
          border-style: solid !important;
          border-width: 1px !important;
          border-color: #000000 !important;
        }
        
        .force-print.is-windows #report-container table { 
          border-collapse: collapse !important; 
          width: 100% !important;
          table-layout: auto !important;
          border-spacing: 0 !important;
        }
        
        .force-print.is-windows #report-container th, 
        .force-print.is-windows #report-container td { 
          padding: 2px 3px !important;
          line-height: 1.2 !important;
          vertical-align: top !important;
        }

        /* --- Mobile responsiveness for common report headers and job info grids --- */
        @media (max-width: 640px) {
          /* Standard header container used across reports */
          #report-container .print\\:hidden.flex.justify-between.items-center.mb-6 {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 0.75rem !important; /* ~gap-3 */
          }
          #report-container .print\\:hidden.flex.justify-between.items-center.mb-6 > h1 {
            font-size: 1.25rem !important; /* text-xl */
            line-height: 1.75rem !important; /* leading-7 */
            overflow-wrap: anywhere !important; /* break long titles */
          }
          #report-container .print\\:hidden.flex.justify-between.items-center.mb-6 > div {
            width: 100% !important;
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: flex-end !important;
            gap: 0.5rem !important; /* gap-2 */
          }

          /* Fallback for headers without the print:hidden class but with the same layout */
          #report-container .flex.justify-between.items-center.mb-6 {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 0.75rem !important;
          }
          #report-container .flex.justify-between.items-center.mb-6 > h1 {
            font-size: 1.25rem !important;
            line-height: 1.75rem !important;
            overflow-wrap: anywhere !important;
          }
          #report-container .flex.justify-between.items-center.mb-6 > div {
            width: 100% !important;
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: flex-end !important;
            gap: 0.5rem !important;
          }

          /* Collapse common two-column grids on small screens */
          #report-container .grid.grid-cols-2 { grid-template-columns: 1fr !important; }
        }
      `;
      document.head.appendChild(style);
    }

    const standardizeVMTables = () => {
      const container = document.getElementById('report-container');
      if (!container) return;
      const tables = Array.from(container.querySelectorAll('table')) as HTMLTableElement[];
      tables.forEach((tbl) => {
        const headerCells = Array.from(tbl.querySelectorAll('thead th')) as HTMLTableCellElement[];
        if (!headerCells.length) return;
        const headerTexts = headerCells.map((th) => (th.textContent || '').trim().toLowerCase());
        const hasNetaSection = headerTexts.some((t) => t.includes('neta') || t.includes('section'));
        const hasDescription = headerTexts.some((t) => t.includes('description'));
        const resultsIndex = headerTexts.findIndex((t) => t === 'results' || t === 'result');
        if (hasNetaSection && hasDescription && resultsIndex >= 0) {
          // Tag this table for standardized print layout
          tbl.classList.add('vm-standard');
          // Hide comments column if present
          const commentsIndex = headerTexts.findIndex((t) => t.includes('comment'));
          if (commentsIndex >= 0) {
            const rows = Array.from(tbl.querySelectorAll('tr')) as HTMLTableRowElement[];
            rows.forEach((row) => {
              const cells = Array.from(row.querySelectorAll('th,td')) as HTMLElement[];
              const cell = cells[commentsIndex];
              if (cell) cell.style.display = 'none';
            });
          }
        }
      });
    };

    // Strip numeric prefixes like "3- ", "4.", etc. from report titles only for print
    const stripTitlePrefixesForPrint = () => {
      const container = document.getElementById('report-container');
      if (!container) return;
      const titleSelectors = ['h1', 'h2', '.section-header'];
      const regex = /^\s*\d+\s*[-.]\s*/i;
      titleSelectors.forEach((sel) => {
        const nodes = Array.from(container.querySelectorAll(sel)) as HTMLElement[];
        nodes.forEach((el) => {
          const current = el.textContent || '';
          if (!current) return;
          if (regex.test(current)) {
            if (!el.dataset.originalTitle) {
              el.dataset.originalTitle = current;
            }
            el.textContent = current.replace(regex, '').trim();
          }
        });
      });
    };

    // Restore titles after printing
    const restoreTitlesAfterPrint = () => {
      const container = document.getElementById('report-container');
      if (!container) return;
      const nodes = Array.from(container.querySelectorAll('[data-original-title]')) as HTMLElement[];
      nodes.forEach((el) => {
        if (el.dataset.originalTitle) {
          el.textContent = el.dataset.originalTitle;
          delete el.dataset.originalTitle;
        }
      });
    };

    // Run on mount and before print
    if (typeof window !== 'undefined') {
      standardizeVMTables();
      const beforeHandler = () => { standardizeVMTables(); stripTitlePrefixesForPrint(); };
      const afterHandler = () => { restoreTitlesAfterPrint(); };
      window.addEventListener('beforeprint', beforeHandler);
      window.addEventListener('afterprint', afterHandler);
      return () => {
        window.removeEventListener('beforeprint', beforeHandler);
        window.removeEventListener('afterprint', afterHandler);
      };
    }
  }, []);

  // Global lock check: hide Edit button for approved/sent reports across all report pages
  useEffect(() => {
    let isCancelled = false;

    const derivePathParts = () => {
      if (typeof window === 'undefined') return null;
      const parts = (window.location?.pathname || '').split('/').filter(Boolean);
      // Expecting /jobs/:jobId/:slug/:reportId
      const jobsIdx = parts.indexOf('jobs');
      if (jobsIdx === -1 || parts.length < jobsIdx + 4) return null;
      const jobId = parts[jobsIdx + 1];
      const slug = parts[jobsIdx + 2];
      const reportId = parts[jobsIdx + 3];
      if (!jobId || !slug || !reportId) return null;
      return { jobId, slug, reportId };
    };

    const hideEditButtons = () => {
      const container = document.getElementById('report-container') || document;
      const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
      buttons.forEach((btn) => {
        const text = (btn.textContent || '').trim();
        if (text === 'Edit Report') {
          (btn as HTMLButtonElement).style.display = 'none';
        }
      });
    };

    const checkAndHide = async () => {
      const parts = derivePathParts();
      if (!parts) return;
      const { jobId, slug, reportId } = parts;

      try {
        // Try to resolve technical report via asset link
        const fileUrl = `report:/jobs/${jobId}/${slug}/${reportId}`;
        const { data: asset } = await supabase
          .schema('neta_ops')
          .from('assets')
          .select('id')
          .eq('file_url', fileUrl)
          .maybeSingle();

        let techStatus: string | null = null;

        if (asset?.id) {
          const { data: link } = await supabase
            .schema('neta_ops')
            .from('asset_reports')
            .select('report_id')
            .eq('asset_id', asset.id)
            .maybeSingle();
          if (link?.report_id) {
            const { data: tech } = await supabase
              .schema('neta_ops')
              .from('technical_reports')
              .select('status')
              .eq('id', link.report_id)
              .maybeSingle();
            techStatus = (tech as any)?.status || null;
          } else {
            // Fallback: technical_reports where report_data contains asset_id
            const { data: techList } = await supabase
              .schema('neta_ops')
              .from('technical_reports')
              .select('status')
              .contains('report_data', { asset_id: asset.id });
            if (Array.isArray(techList) && techList.length > 0) {
              techStatus = (techList[0] as any)?.status || null;
            }
          }
        } else {
          // Broader fallback: look up asset by suffix match on reportId
          const { data: assetsBySuffix } = await supabase
            .schema('neta_ops')
            .from('assets')
            .select('id, file_url')
            .ilike('file_url', `%/${reportId}`);
          if (Array.isArray(assetsBySuffix) && assetsBySuffix.length > 0) {
            const candidate = assetsBySuffix.find(a => (a.file_url || '').startsWith('report:/jobs/')) || assetsBySuffix[0];
            if (candidate?.id) {
              const { data: link2 } = await supabase
                .schema('neta_ops')
                .from('asset_reports')
                .select('report_id')
                .eq('asset_id', candidate.id)
                .maybeSingle();
              if (link2?.report_id) {
                const { data: tech2 } = await supabase
                  .schema('neta_ops')
                  .from('technical_reports')
                  .select('status')
                  .eq('id', link2.report_id)
                  .maybeSingle();
                techStatus = (tech2 as any)?.status || null;
              }
            }
          }
        }

        if (!isCancelled) {
          const s = String(techStatus || '').toLowerCase();
          if (s === 'approved' || s === 'sent') {
            hideEditButtons();
          }
        }
      } catch {
        // Silent fallback
      }
    };

    if (typeof window !== 'undefined') {
      checkAndHide();
    }

    return () => {
      isCancelled = true;
    };
  }, []);

  // Global live preview for all reports (except ones that implement their own)
  const [showGlobalPreview, previewUrl] = React.useMemo(() => {
    if (typeof window === 'undefined') return [false, ''] as const;
    const parts = (window.location?.pathname || '').split('/').filter(Boolean);
    const jobsIdx = parts.indexOf('jobs');
    const hasReportId = jobsIdx !== -1 && parts.length >= jobsIdx + 4; // /jobs/:jobId/:slug/:reportId
    if (!hasReportId) return [false, ''] as const;
    if (isPrintMode) return [false, ''] as const; // don't show during print render
    const params = new URLSearchParams(window.location.search);
    params.set('print', 'true'); // request print mode
    params.set('preview', 'true'); // mark as preview tab (forces no nested preview)
    params.set('pv', String(Date.now())); // cache-buster
    const url = `${window.location.pathname}?${params.toString()}`;
    return [true, url] as const;
  }, [isPrintMode]);

  // Global toggle persistence
  const [showPreviewEnabled, setShowPreviewEnabled] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const v = window.localStorage.getItem('amp_report_preview_enabled_global');
      return v !== 'false';
    } catch {
      return true;
    }
  });
  const toggleGlobalPreview = () => {
    setShowPreviewEnabled(prev => {
      const next = !prev;
      try { window.localStorage.setItem('amp_report_preview_enabled_global', String(next)); } catch {}
      return next;
    });
  };

  // If a page is opened directly with ?preview=true, render in print-look mode and disable nested preview
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const isPreviewQuery = params.get('preview') === 'true';
    if (isPreviewQuery) {
      document.documentElement.classList.add('force-print');
    }
  }, []);

  const [previewStatus, setPreviewStatus] = React.useState<string>('idle');
  const [reloadNonce, setReloadNonce] = React.useState<number>(0);

  const onPreviewLoad = React.useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const iframe = e.currentTarget as HTMLIFrameElement;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) { setPreviewStatus('error: no document'); return; }

      // Force the preview to render with print rules applied
      doc.documentElement.classList.add('force-print');
      // Also add Windows class if on Windows platform
      if (navigator.platform.includes('Win') || navigator.userAgent.includes('Windows')) {
        doc.documentElement.classList.add('is-windows');
      }

      // 1) Copy key parent styles into the iframe to ensure parity with PDF
      const parentStyles = Array.from(document.querySelectorAll('style')) as HTMLStyleElement[];
      parentStyles.forEach((s, idx) => {
        try {
          const cloned = doc.createElement('style');
          // Copy all rules (includes our @media print and .force-print mirrors)
          cloned.textContent = s.textContent || '';
          cloned.setAttribute('data-copied', 'true');
          cloned.setAttribute('data-source-index', String(idx));
          doc.head.appendChild(cloned);
        } catch {}
      });

      // 2) Baseline helpers (kept minimal) in case a report is missing mirrors
      const style = doc.createElement('style');
      style.textContent = `
        .print\\:block { display: block !important; }
        .print\\:flex { display: flex !important; }
        .print\\:hidden { display: none !important; }
        .print\\:text-black { color: black !important; }
        .print\\:bg-white { background-color: white !important; }
        .print\\:border-black { border-color: black !important; }
        .print\\:font-bold { font-weight: 700 !important; }
        .print\\:text-center { text-align: center !important; }
        #report-container table { border-collapse: collapse !important; width: 100% !important; }
        #report-container th, #report-container td { border: 1px solid black !important; padding: 4px !important; }
        #report-container th { background-color: #f0f0f0 !important; font-weight: bold !important; }
        /* Small debug marker inside preview */
        #__preview_debug_marker { position: fixed; top: 6px; right: 8px; z-index: 9999; font: 10px/1 monospace; color: #111; background:#fffa; border:1px solid #999; padding:2px 4px; }
      `;
      doc.head.appendChild(style);

      // 3) Add debug marker so we know the iframe rendered
      const marker = doc.createElement('div');
      marker.id = '__preview_debug_marker';
      marker.textContent = 'preview loaded';
      doc.body.appendChild(marker);

      setPreviewStatus(`loaded: readyState=${doc.readyState}; title=${doc.title || ''}`);
    } catch {}
  }, []);

  const onPreviewError = React.useCallback(() => {
    setPreviewStatus('error: iframe failed to load');
  }, []);

  const actuallyShowPreview = showGlobalPreview && showPreviewEnabled;

  return (
    <div className={actuallyShowPreview ? 'flex flex-col lg:flex-row gap-4 items-start' : ''}>
      <div 
        id="report-container"
        className={`w-full ${actuallyShowPreview ? 'lg:flex-1' : 'max-w-4xl'} mx-auto p-6 pb-20 ${isPrintMode ? 'print-mode' : ''} overflow-x-auto`}
        style={{ minHeight: 'calc(100vh + 100px)' }}
      >
        {/* Global preview toggle (hidden during actual print) */}
        {!isPrintMode && (
          <div className="print:hidden flex justify-end mb-2">
            <button
              onClick={toggleGlobalPreview}
              className="px-3 py-1 text-xs text-gray-700 dark:text-white bg-white dark:bg-dark-100 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-dark-200 focus:outline-none"
            >
              {showPreviewEnabled ? 'Hide Preview' : 'Show Preview'}
            </button>
          </div>
        )}
        {children}
      </div>
      {actuallyShowPreview && (
        <div className="w-full lg:w-[48%] max-w-[820px] lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <div className="mb-2 text-xs text-gray-600 dark:text-gray-300">
            <div className="flex items-center gap-2">
              <span className="font-medium">Preview URL:</span>
              <code className="break-all">{previewUrl}</code>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span>Status: {previewStatus}</span>
              <a href={previewUrl} target="_blank" rel="noreferrer" className="underline">Open in new tab</a>
              <button onClick={() => setReloadNonce(n => n + 1)} className="px-2 py-0.5 border rounded">Reload preview</button>
            </div>
          </div>
          <div className="h-[60vh] lg:h-full border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden bg-white dark:bg-dark-150 shadow-sm">
            <iframe key={String(reloadNonce) + previewUrl} src={previewUrl} title="Print Preview" className="w-full h-full" onLoad={onPreviewLoad} onError={onPreviewError} />
          </div>
        </div>
      )}
    </div>
  );
}; 