import React, { useEffect, useState } from "react";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Clock,
  Building2,
  Key,
  Unplug,
  Download,
} from "lucide-react";
import {
  getQuickBooksStatus,
  disconnectQuickBooks,
  getQuickBooksCompanyInfo,
  getQuickBooksOAuthUrl,
} from "@/services/quickbooksService";

interface QuickBooksIntegration {
  id: string;
  realm_id: string | null;
  company_name: string | null;
  environment: "sandbox" | "production";
  expires_at: string;
  created_at: string;
}

interface ConnectionStatus {
  connected: boolean;
  integration?: QuickBooksIntegration;
  error?: string;
}

export const IntegrationsSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [companyInfo, setCompanyInfo] = useState<any>(null);

  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    setLoading(true);
    try {
      const qbStatus = await getQuickBooksStatus();
      setStatus({
        connected: qbStatus.connected,
        integration: qbStatus.integration,
      });

      // If connected and no company name, try to fetch it
      if (qbStatus.connected && !qbStatus.integration?.company_name) {
        fetchCompanyInfo();
      }
    } catch (error: any) {
      console.error("Error checking QuickBooks status:", error);
      setStatus({
        connected: false,
        error:
          error?.message ||
          "Failed to check connection status. The Edge Function may not be deployed.",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanyInfo = async () => {
    setFetchingData(true);
    try {
      const info = await getQuickBooksCompanyInfo();
      setCompanyInfo(info?.CompanyInfo || info);
      // Refresh status to get updated company name
      const qbStatus = await getQuickBooksStatus();
      setStatus({
        connected: qbStatus.connected,
        integration: qbStatus.integration,
      });
    } catch (error: any) {
      console.error("Error fetching company info:", error);
    } finally {
      setFetchingData(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await checkConnectionStatus();
    setRefreshing(false);
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
        setStatus({ connected: false });
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const isTokenExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  const isTokenExpiringSoon = (expiresAt: string) => {
    const expiresDate = new Date(expiresAt);
    const now = new Date();
    const hoursUntilExpiry =
      (expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilExpiry > 0 && hoursUntilExpiry < 24;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Integrations</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Manage external service connections
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2"
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* QuickBooks Integration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* QuickBooks Logo */}
              <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">QB</span>
              </div>
              <div>
                <CardTitle>QuickBooks Online</CardTitle>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Sync invoices, estimates, and customers
                </p>
              </div>
            </div>
            {/* Connection Status Badge */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                status.connected
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
              }`}
            >
              {status.connected ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Connected
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Not Connected
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.connected && status.integration ? (
            <>
              {/* Connection Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 mb-1">
                    <Building2 className="h-4 w-4" />
                    Company
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {status.integration.company_name ||
                        companyInfo?.CompanyName ||
                        "Not available"}
                    </p>
                    {!status.integration.company_name && !companyInfo && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchCompanyInfo}
                        disabled={fetchingData}
                        className="h-6 px-2 text-xs"
                      >
                        {fetchingData ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 mb-1">
                    <Key className="h-4 w-4" />
                    Realm ID
                  </div>
                  <p className="font-mono text-sm">
                    {status.integration.realm_id || "Not available"}
                  </p>
                </div>

                <div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 mb-1">
                    <Clock className="h-4 w-4" />
                    Connected On
                  </div>
                  <p className="font-medium">
                    {formatDate(status.integration.created_at)}
                  </p>
                </div>

                <div
                  className={`p-4 rounded-lg ${
                    isTokenExpired(status.integration.expires_at)
                      ? "bg-red-50 dark:bg-red-900/20"
                      : isTokenExpiringSoon(status.integration.expires_at)
                        ? "bg-yellow-50 dark:bg-yellow-900/20"
                        : "bg-neutral-50 dark:bg-neutral-800"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 mb-1">
                    <Clock className="h-4 w-4" />
                    Token Expires
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {formatDate(status.integration.expires_at)}
                    </p>
                    {isTokenExpired(status.integration.expires_at) && (
                      <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Expired
                      </span>
                    )}
                    {isTokenExpiringSoon(status.integration.expires_at) &&
                      !isTokenExpired(status.integration.expires_at) && (
                        <span className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Expiring soon
                        </span>
                      )}
                  </div>
                </div>
              </div>

              {/* Environment Badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  Environment:
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    status.integration.environment === "production"
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                  }`}
                >
                  {status.integration.environment.charAt(0).toUpperCase() +
                    status.integration.environment.slice(1)}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={fetchCompanyInfo}
                  disabled={fetchingData}
                  className="flex items-center gap-2"
                >
                  <Download
                    className={`h-4 w-4 ${fetchingData ? "animate-spin" : ""}`}
                  />
                  {fetchingData ? "Syncing..." : "Sync Company Info"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20"
                >
                  <Unplug className="h-4 w-4" />
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </Button>
                <a
                  href="https://quickbooks.intuit.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                >
                  Open QuickBooks
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </>
          ) : (
            <>
              {/* Not Connected State */}
              <div className="py-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center">
                  <XCircle className="h-8 w-8 text-neutral-400" />
                </div>
                <h3 className="text-lg font-medium mb-2">
                  QuickBooks Not Connected
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 max-w-md mx-auto">
                  Connect your QuickBooks Online account to sync invoices,
                  estimates, customers, and more with your jobs.
                </p>

                <Button
                  onClick={handleConnect}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Connect QuickBooks
                </Button>
              </div>

              {/* Error Message */}
              {status.error && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        Connection Check Failed
                      </p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        {status.error}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Setup Requirements Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Setup Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center text-xs">
                ?
              </div>
              <div>
                <p className="text-sm font-medium">
                  QB_CLIENT_ID (Server-side)
                </p>
                <p className="text-xs text-neutral-500">
                  Set as Supabase secret for the Edge Function
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center text-xs">
                ?
              </div>
              <div>
                <p className="text-sm font-medium">
                  QB_CLIENT_SECRET (Server-side)
                </p>
                <p className="text-xs text-neutral-500">
                  Set as Supabase secret for the Edge Function
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center text-xs">
                ?
              </div>
              <div>
                <p className="text-sm font-medium">Edge Function Deployed</p>
                <p className="text-xs text-neutral-500">
                  Run:{" "}
                  <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">
                    supabase functions deploy quickbooks-oauth
                  </code>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center text-xs">
                ?
              </div>
              <div>
                <p className="text-sm font-medium">Database Table Created</p>
                <p className="text-xs text-neutral-500">
                  <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">
                    common.quickbooks_integrations
                  </code>{" "}
                  table
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default IntegrationsSettings;
