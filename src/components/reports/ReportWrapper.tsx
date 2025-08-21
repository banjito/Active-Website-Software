import React, { useEffect } from 'react';

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
      style.textContent = `
        @media print {
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
          }
          /* Hide select dropdown arrow */
          #report-container select::-ms-expand { display: none !important; }
          /* Remove number input spinners */
          #report-container input[type="number"]::-webkit-outer-spin-button,
          #report-container input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none !important; margin: 0 !important; }
          #report-container input[type="number"] { -moz-appearance: textfield !important; }

          /* Enforce crisp table borders across all reports */
          #report-container table,
          #report-container th,
          #report-container td,
          #report-container thead,
          #report-container tbody,
          #report-container tr {
            border: 1px solid black !important;
          }
          #report-container table { border-collapse: collapse !important; width: 100% !important; }
          #report-container th, #report-container td { padding: 2px 3px !important; }

          /* Standardize Visual/Mechanical tables that include a Results column */
          #report-container .vm-standard { width: 100% !important; table-layout: fixed !important; }
          #report-container .vm-standard th, 
          #report-container .vm-standard td { 
            white-space: normal !important; 
            word-break: break-word !important; 
            font-size: 9px !important; 
            line-height: 1.15 !important; 
            padding: 3px 4px !important; 
            vertical-align: top !important;
          }
          /* Column widths: small NETA Section, large Description, Results on right */
          #report-container .vm-standard thead th:first-child,
          #report-container .vm-standard tbody td:first-child { width: 18% !important; text-align: left !important; }
          #report-container .vm-standard thead th:nth-child(2),
          #report-container .vm-standard tbody td:nth-child(2) { width: 62% !important; text-align: left !important; }
          #report-container .vm-standard thead th:nth-child(3),
          #report-container .vm-standard tbody td:nth-child(3) { width: 20% !important; text-align: center !important; }

          /* Force-print toggle helpers for IR table */
          #report-container .ir-screen { display: none !important; }
          #report-container .ir-print { display: block !important; }
          #report-container .ir-print table { width: 100% !important; table-layout: fixed !important; }
          #report-container .ir-print th, 
          #report-container .ir-print td { font-size: 9px !important; padding: 2px 3px !important; }
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

    // Run on mount and before print
    if (typeof window !== 'undefined') {
      standardizeVMTables();
      const handler = () => standardizeVMTables();
      window.addEventListener('beforeprint', handler);
      return () => window.removeEventListener('beforeprint', handler);
    }
  }, []);

  return (
    <div 
      id="report-container"
      className={`w-full max-w-4xl mx-auto p-6 pb-20 ${isPrintMode ? 'print-mode' : ''}`}
      style={{ minHeight: 'calc(100vh + 100px)' }}
    >
      {children}
    </div>
  );
}; 