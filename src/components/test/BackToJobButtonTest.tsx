import React from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Test component to verify the back to job button logic
 * This shows how the URL parsing works for different report paths
 */
export const BackToJobButtonTest: React.FC = () => {
  const location = useLocation();

  // Same logic as in Layout.tsx
  const isReportPage = location.pathname.includes('/jobs/') && 
    location.pathname.split('/').length > 3 && 
    !location.pathname.endsWith('/jobs') &&
    location.pathname.split('/')[3] !== '';
  
  const getJobIdFromReportPath = (): string | null => {
    if (!isReportPage) return null;
    const pathParts = location.pathname.split('/');
    const jobsIndex = pathParts.findIndex(part => part === 'jobs');
    if (jobsIndex !== -1 && jobsIndex + 1 < pathParts.length) {
      return pathParts[jobsIndex + 1];
    }
    return null;
  };
  
  const jobId = getJobIdFromReportPath();

  // Test URLs to demonstrate the logic
  const testUrls = [
    '/jobs/123/switchgear-report',
    '/jobs/456/switchgear-report/789',
    '/jobs/123/panelboard-report',
    '/jobs/456/automatic-transfer-switch-ats-report/abc123',
    '/jobs',
    '/jobs/123',
    '/dashboard',
    '/customers',
    '/jobs/123/low-voltage-circuit-breaker-electronic-trip-ats-report/def456'
  ];

  const testUrlLogic = (url: string) => {
    const isReport = url.includes('/jobs/') && 
      url.split('/').length > 3 && 
      !url.endsWith('/jobs') &&
      url.split('/')[3] !== '';
    
    let jobIdFromUrl: string | null = null;
    if (isReport) {
      const pathParts = url.split('/');
      const jobsIndex = pathParts.findIndex(part => part === 'jobs');
      if (jobsIndex !== -1 && jobsIndex + 1 < pathParts.length) {
        jobIdFromUrl = pathParts[jobsIndex + 1];
      }
    }
    
    return { isReport, jobId: jobIdFromUrl };
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Back to Job Button Test
        </h1>
        
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">
            Current Page Analysis:
          </h2>
          <div className="text-blue-700 dark:text-blue-300 space-y-1">
            <p><strong>Current URL:</strong> {location.pathname}</p>
            <p><strong>Is Report Page:</strong> {isReportPage ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Job ID:</strong> {jobId || 'None detected'}</p>
            <p><strong>Button Should Show:</strong> {isReportPage && jobId ? '✅ Yes' : '❌ No'}</p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Test URL Analysis:
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
              <thead>
                <tr className="bg-gray-50 dark:bg-dark-200">
                  <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">URL</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">Is Report?</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">Job ID</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">Show Button?</th>
                </tr>
              </thead>
              <tbody>
                {testUrls.map((url, index) => {
                  const result = testUrlLogic(url);
                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-dark-100">
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 font-mono text-sm">
                        {url}
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                        {result.isReport ? '✅' : '❌'}
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                        {result.jobId || '-'}
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                        {result.isReport && result.jobId ? '✅' : '❌'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">
            How It Works:
          </h3>
          <ul className="text-green-700 dark:text-green-300 space-y-1 text-sm">
            <li>• The button appears automatically on any report page</li>
            <li>• Report pages are detected by the URL pattern: <code>/jobs/[jobId]/[reportType]/[reportId?]</code></li>
            <li>• The job ID is extracted from the URL and used for the back navigation</li>
            <li>• Clicking the button navigates to <code>/jobs/[jobId]</code></li>
            <li>• No changes needed to individual report components</li>
            <li>• Works for all current and future reports automatically</li>
          </ul>
        </div>
      </div>
    </div>
  );
}; 