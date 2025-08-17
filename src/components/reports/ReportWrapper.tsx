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