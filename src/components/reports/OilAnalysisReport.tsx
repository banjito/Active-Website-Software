import React from 'react';
import { useParams } from 'react-router-dom';

function OilAnalysisReport() {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 dark:text-white">
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">Oil Analysis Report</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>NETA</div>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Oil Analysis Report</h1>
      <div className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <p>Oil Analysis Report implementation coming soon...</p>
      </div>
    </div>
  );
}

export { OilAnalysisReport };
export default OilAnalysisReport; 