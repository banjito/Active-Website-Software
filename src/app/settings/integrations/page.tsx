import React, { Suspense } from 'react';
import QuickBooksIntegration from '../../../components/quickbooks/QuickBooksIntegration';

export default function IntegrationsPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Integrations</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Connect your accounts and services to enhance your workflow.
        </p>
      </div>

      <div className="space-y-4">
        <Suspense fallback={
          <div className="border rounded-lg p-6">
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-gray-600">Loading QuickBooks integration...</span>
            </div>
          </div>
        }>
          <QuickBooksIntegration
            onConnect={() => {
              console.log('QuickBooks connected');
            }}
            onDisconnect={() => {
              console.log('QuickBooks disconnected');
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}

