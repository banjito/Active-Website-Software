// Print Service Worker for Headless PDF Generation
self.addEventListener('install', (event) => {
  console.log('Print Service Worker installed');
});

self.addEventListener('activate', (event) => {
  console.log('Print Service Worker activated');
});

self.addEventListener('message', (event) => {
  if (event.data.type === 'PRINT_REPORT') {
    handlePrintReport(event.data);
  }
});

async function handlePrintReport(data) {
  try {
    const { reportUrl, filename } = data;
    
    // Fetch the report content
    const response = await fetch(reportUrl);
    const html = await response.text();
    
    // Create a blob with the HTML content
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    // Create a new window for printing
    const printWindow = self.open(url, '_blank', 'width=1200,height=800');
    
    if (printWindow) {
      // Wait for the window to load
      printWindow.onload = () => {
        // Apply print styles
        const style = printWindow.document.createElement('style');
        style.textContent = `
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
        printWindow.document.head.appendChild(style);
        
        // Trigger print
        printWindow.print();
        
        // Close window after printing
        setTimeout(() => {
          printWindow.close();
          URL.revokeObjectURL(url);
        }, 1000);
      };
    }
  } catch (error) {
    console.error('Error in service worker print:', error);
  }
} 