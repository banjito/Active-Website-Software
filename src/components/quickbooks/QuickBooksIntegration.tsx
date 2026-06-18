import React, { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  getQuickBooksStatus,
  disconnectQuickBooks,
  getQuickBooksOAuthUrl,
} from "../../services/quickbooksService";

interface QuickBooksIntegrationProps {
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export default function QuickBooksIntegration({
  onConnect,
  onDisconnect,
}: QuickBooksIntegrationProps) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [integration, setIntegration] = useState<any>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const status = await getQuickBooksStatus();
      setConnected(status.connected);
      setIntegration(status.integration);
    } catch (error) {
      console.error("Error loading QuickBooks status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      const authUrl = await getQuickBooksOAuthUrl();
      if (!authUrl) {
        alert(
          "Failed to get QuickBooks authorization URL. Please ensure QuickBooks is configured on the server.",
        );
        return;
      }
      window.location.href = authUrl;
    } catch (error) {
      console.error("Error connecting to QuickBooks:", error);
      alert("An error occurred while connecting to QuickBooks.");
    }
  };

  const handleDisconnect = async () => {
    if (
      !confirm(
        "Are you sure you want to disconnect QuickBooks? You will need to reconnect to use QuickBooks features.",
      )
    ) {
      return;
    }

    setDisconnecting(true);
    try {
      const success = await disconnectQuickBooks();
      if (success) {
        setConnected(false);
        setIntegration(null);
        if (onDisconnect) {
          onDisconnect();
        }
      } else {
        alert("Failed to disconnect QuickBooks. Please try again.");
      }
    } catch (error) {
      console.error("Error disconnecting QuickBooks:", error);
      alert("An error occurred while disconnecting QuickBooks.");
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-neutral-600">
          <LoadingSpinner size="md" />
        </span>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">QuickBooks Integration</h3>
          <p className="text-sm text-neutral-600">
            Connect your QuickBooks account to sync invoices, customers, and
            more.
          </p>
        </div>
      </div>

      {connected ? (
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-green-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium">Connected</span>
          </div>

          {integration && (
            <div className="bg-neutral-50 rounded p-4 space-y-2 text-sm">
              <div>
                <span className="font-medium">Environment:</span>{" "}
                <span className="capitalize">{integration.environment}</span>
              </div>
              {integration.realm_id && (
                <div>
                  <span className="font-medium">Company ID:</span>{" "}
                  <span className="font-mono text-xs">
                    {integration.realm_id}
                  </span>
                </div>
              )}
              {integration.company_name && (
                <div>
                  <span className="font-medium">Company:</span>{" "}
                  <span>{integration.company_name}</span>
                </div>
              )}
              <div>
                <span className="font-medium">Connected:</span>{" "}
                <span>
                  {new Date(integration.created_at).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="font-medium">Token expires:</span>{" "}
                <span>
                  {new Date(integration.token_expires_at).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {disconnecting ? "Disconnecting..." : "Disconnect QuickBooks"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-neutral-500">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span>Not Connected</span>
          </div>

          <button
            onClick={handleConnect}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Connect QuickBooks
          </button>
        </div>
      )}
    </div>
  );
}
