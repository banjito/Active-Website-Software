import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function QuickBooksCallback() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      setLoading(true);
      try {
        // Get authorization code and realmId from URL parameters
        const code = searchParams.get('code');
        const realmId = searchParams.get('realmId');
        const errorParam = searchParams.get('error');

        // Check for OAuth errors
        if (errorParam) {
          const errorDescription = searchParams.get('error_description') || 'Unknown error';
          setError(`QuickBooks authorization failed: ${errorDescription}`);
          setLoading(false);
          return;
        }

        if (!code) {
          setError('No authorization code received from QuickBooks');
          setLoading(false);
          return;
        }

        // Get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          setError('You must be logged in to connect QuickBooks');
          setLoading(false);
          return;
        }

        // Call Edge Function to exchange code for tokens
        const { data, error: exchangeError } = await supabase.functions.invoke('quickbooks-oauth', {
          body: { code, realmId },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (exchangeError || !data?.success) {
          console.error('Token exchange error:', exchangeError || data);
          setError(exchangeError?.message || data?.error || 'Failed to connect QuickBooks');
          setLoading(false);
          return;
        }

        setSuccess(true);
        
        // Redirect to settings or dashboard after a short delay
        setTimeout(() => {
          navigate('/settings/integrations', { replace: true });
        }, 2000);
      } catch (err) {
        console.error('Unexpected error during QuickBooks callback:', err);
        setError('An unexpected error occurred. Please try again later.');
        setLoading(false);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <h2 className="text-xl font-semibold mb-2">Connecting QuickBooks...</h2>
        <p className="text-gray-600">Please wait while we complete the connection.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 max-w-md">
          <h2 className="text-xl font-semibold mb-2">Connection Failed</h2>
          <p>{error}</p>
        </div>
        <button 
          onClick={() => navigate('/settings/integrations', { replace: true })}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Return to Settings
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 max-w-md">
          <h2 className="text-xl font-semibold mb-2">QuickBooks Connected Successfully!</h2>
          <p>You will be redirected to your settings in a moment...</p>
        </div>
      </div>
    );
  }

  return null;
}
