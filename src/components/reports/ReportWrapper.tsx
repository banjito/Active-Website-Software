import React from 'react';

interface ReportWrapperProps {
  children: React.ReactNode;
  isPrintMode?: boolean;
}

export const ReportWrapper: React.FC<ReportWrapperProps> = ({ children, isPrintMode = false }) => {
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