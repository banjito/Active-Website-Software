import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  AlertTriangle,
  Camera,
  ExternalLink,
  FlaskConical,
  Plus,
  RefreshCw,
  Star,
  Unplug,
} from "lucide-react";
import {
  getQuickBooksStatus,
  disconnectQuickBooks,
  setMainQuickBooksCompany,
  getQuickBooksCompanyInfo,
  getQuickBooksOAuthUrl,
} from "@/services/quickbooksService";
import {
  fetchCompanyLogos,
  removeCompanyLogo,
  uploadCompanyLogo,
  type CompanyLogos,
} from "@/services/quickbooksLogos";

interface QuickBooksIntegration {
  id: string;
  realm_id: string | null;
  company_name: string | null;
  environment: "sandbox" | "production";
  expires_at: string;
  created_at: string;
  connected_by: string | null;
  is_primary: boolean;
}

interface ConnectionStatus {
  connected: boolean;
  can_manage?: boolean;
  integration?: QuickBooksIntegration;
  companies?: QuickBooksIntegration[];
  error?: string;
}

const companyName = (c: QuickBooksIntegration) =>
  c.company_name || `Company ${c.realm_id ?? ""}`.trim();

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-US", { dateStyle: "medium" });

/** The company's picture, or its initials. Admins click it to add or change the picture. */
function CompanyPicture({
  name,
  url,
  isMain,
  uploading,
  onPick,
}: {
  name: string;
  url?: string;
  isMain: boolean;
  uploading: boolean;
  onPick?: () => void;
}) {
  const face = url ? (
    <img src={url} alt="" className="h-full w-full object-contain" />
  ) : (
    <span className="text-sm font-semibold">{initials(name)}</span>
  );
  const box = `relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden ${
    url
      ? "border border-neutral-200 bg-white p-1 dark:border-neutral-700"
      : isMain
        ? "bg-brand text-white"
        : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
  }`;

  if (!onPick) return <div className={box} aria-hidden>{face}</div>;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={uploading}
      title={url ? "Change picture" : "Add a picture"}
      aria-label={url ? `Change ${name} picture` : `Add a ${name} picture`}
      className={`group ${box}`}
    >
      {face}
      <span
        className={`absolute inset-0 flex items-center justify-center bg-black/50 text-white transition-opacity ${
          uploading ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
        }`}
      >
        {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
      </span>
    </button>
  );
}

export const IntegrationsSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [logos, setLogos] = useState<CompanyLogos>({});
  const [uploadingRealm, setUploadingRealm] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pickingRealm = useRef<string | null>(null);

  useEffect(() => {
    checkConnectionStatus();
    fetchCompanyLogos()
      .then(setLogos)
      .catch((error) => console.error("Error loading company pictures:", error));
  }, []);

  const pickLogo = (realmId: string | null) => {
    if (!realmId) return;
    pickingRealm.current = realmId;
    fileInput.current?.click();
  };

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const realmId = pickingRealm.current;
    e.target.value = ""; // so picking the same file again still fires
    if (!file || !realmId) return;
    setUploadingRealm(realmId);
    try {
      setLogos(await uploadCompanyLogo(realmId, file));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Couldn't upload the picture.");
    } finally {
      setUploadingRealm(null);
    }
  };

  const handleRemoveLogo = async (realmId: string) => {
    try {
      setLogos(await removeCompanyLogo(realmId));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Couldn't remove the picture.");
    }
  };

  const loadStatus = async () => {
    const qbStatus = await getQuickBooksStatus();
    setStatus({
      connected: qbStatus.connected,
      can_manage: qbStatus.can_manage,
      companies: qbStatus.companies,
      integration: qbStatus.integration,
    });
    return qbStatus;
  };

  const checkConnectionStatus = async () => {
    setLoading(true);
    try {
      const qbStatus = await loadStatus();
      // Older connections may be missing the company name; asking QuickBooks stores it
      if (qbStatus.connected && !qbStatus.integration?.company_name) {
        getQuickBooksCompanyInfo()
          .then(loadStatus)
          .catch((error) => console.error("Error fetching company info:", error));
      }
    } catch (error: any) {
      console.error("Error checking QuickBooks status:", error);
      setStatus({
        connected: false,
        error: error?.message || "Couldn't check the connection. Try refreshing.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await checkConnectionStatus();
    setRefreshing(false);
  };

  const handleConnect = async (sandbox = false) => {
    try {
      const authUrl = await getQuickBooksOAuthUrl(sandbox);
      if (!authUrl) {
        alert(
          sandbox
            ? "Couldn't start the test sign-in. Check QB_SANDBOX_CLIENT_ID and QB_SANDBOX_CLIENT_SECRET in Supabase."
            : "Couldn't start the QuickBooks sign-in. Check that QuickBooks is set up on the server.",
        );
        return;
      }
      window.location.href = authUrl;
    } catch (error) {
      console.error("Error connecting to QuickBooks:", error);
      alert("Something went wrong starting the QuickBooks sign-in.");
    }
  };

  const handleMakeMain = async (company: QuickBooksIntegration) => {
    if (
      !confirm(
        `Make ${companyName(company)} the main company? Job linking, billing, change orders and A/R will use it.`,
      )
    ) {
      return;
    }
    setBusyId(company.id);
    try {
      if (await setMainQuickBooksCompany(company.realm_id ?? "")) {
        await loadStatus();
      } else {
        alert("Couldn't change the main company. Please try again.");
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnect = async (company: QuickBooksIntegration) => {
    if (
      !confirm(
        `Disconnect ${companyName(company)} for everyone? Its numbers stop showing in ampOS until an admin reconnects it.`,
      )
    ) {
      return;
    }
    setBusyId(company.id);
    try {
      if (await disconnectQuickBooks(company.realm_id ?? undefined)) {
        await loadStatus();
      } else {
        alert("Couldn't disconnect. Please try again.");
      }
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-9" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const companies = status.companies ?? [];
  const hasMain = companies.some((c) => c.is_primary);
  const canManage = !!status.can_manage;

  return (
    <div className="space-y-6">
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleLogoFile}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Integrations
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Outside services ampOS connects to.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh"
          title="Refresh"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <section className="border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        {/* Title */}
        <div className="flex flex-wrap items-center gap-4 border-b border-neutral-200 p-5 dark:border-neutral-700">
          <img
            src="/img/Intuit_QuickBooks_logo.svg"
            alt=""
            className="h-10 w-10 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              QuickBooks Online
            </h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Job billing, change orders and company KPIs.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
            <span
              className={`h-2 w-2 rounded-none ${
                companies.length ? "bg-emerald-500" : "bg-neutral-400 dark:bg-neutral-500"
              }`}
            />
            {companies.length === 0
              ? "Not connected"
              : companies.length === 1
                ? "Connected"
                : `${companies.length} companies connected`}
          </span>
        </div>

        {status.error && (
          <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {status.error}
          </div>
        )}

        {companies.length > 0 && !hasMain && (
          <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            No main company is picked, so job linking and billing are off.
            {canManage ? " Click Make main on AMP." : " Ask an admin to pick one."}
          </div>
        )}

        {companies.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <p className="text-base font-medium text-neutral-900 dark:text-neutral-100">
              QuickBooks isn't connected
            </p>
            <p className="mt-1 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
              {canManage
                ? "Connect the main company first (AMP). You can add the others after."
                : "Ask an admin to connect it."}
            </p>
            {canManage && (
              <Button
                onClick={() => handleConnect()}
                className="mt-5 bg-[#2CA01C] text-white hover:bg-[#2CA01C]/85"
              >
                Connect QuickBooks
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Companies */}
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {companies.map((company) => {
                const name = companyName(company);
                const busy = busyId === company.id;
                return (
                  <li
                    key={company.id}
                    className="flex flex-wrap items-center gap-4 px-5 py-4"
                  >
                    <CompanyPicture
                      name={name}
                      url={company.realm_id ? logos[company.realm_id] : undefined}
                      isMain={company.is_primary}
                      uploading={uploadingRealm === company.realm_id}
                      onPick={canManage ? () => pickLogo(company.realm_id) : undefined}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {name}
                        </span>
                        {company.is_primary && (
                          <span className="border border-brand px-1.5 text-[10px] font-semibold uppercase leading-4 tracking-wide text-brand">
                            Main
                          </span>
                        )}
                        {company.environment === "sandbox" && (
                          <span className="border border-amber-300 px-1.5 text-[10px] font-semibold uppercase leading-4 tracking-wide text-amber-700 dark:border-amber-700 dark:text-amber-400">
                            Sandbox
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        Connected by {company.connected_by || "Unknown"} on{" "}
                        {formatDate(company.created_at)} · Renews automatically
                        {canManage && company.realm_id && logos[company.realm_id] && (
                          <>
                            {" · "}
                            <button
                              type="button"
                              onClick={() => handleRemoveLogo(company.realm_id!)}
                              className="hover:text-neutral-900 hover:underline dark:hover:text-neutral-100"
                            >
                              Remove picture
                            </button>
                          </>
                        )}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        {!company.is_primary && company.environment !== "sandbox" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMakeMain(company)}
                            disabled={busy}
                            leftIcon={<Star className="h-3.5 w-3.5" />}
                          >
                            Make main
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDisconnect(company)}
                          disabled={busy}
                          className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                          leftIcon={<Unplug className="h-3.5 w-3.5" />}
                        >
                          Disconnect
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-neutral-200 px-5 py-3 dark:border-neutral-700">
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleConnect()}
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  Connect another company
                </Button>
              )}
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleConnect(true)}
                  leftIcon={<FlaskConical className="h-4 w-4" />}
                  title="An Intuit test company. Nothing here touches the real books."
                >
                  Connect test company
                </Button>
              )}
              <a
                href="https://qbo.intuit.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900 hover:underline dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                Open QuickBooks
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </>
        )}
      </section>

      {/* For whoever maintains the server; most people never need this */}
      <details className="border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Server setup
        </summary>
        <ul className="space-y-1.5 border-t border-neutral-200 px-5 py-4 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
          <li>
            Supabase secrets:{" "}
            <code className="bg-neutral-100 px-1 font-mono text-xs dark:bg-neutral-800">
              QB_CLIENT_ID
            </code>
            ,{" "}
            <code className="bg-neutral-100 px-1 font-mono text-xs dark:bg-neutral-800">
              QB_CLIENT_SECRET
            </code>
            ,{" "}
            <code className="bg-neutral-100 px-1 font-mono text-xs dark:bg-neutral-800">
              QB_ENCRYPTION_KEY
            </code>
          </li>
          <li>
            Functions:{" "}
            <code className="bg-neutral-100 px-1 font-mono text-xs dark:bg-neutral-800">
              quickbooks-oauth
            </code>
            ,{" "}
            <code className="bg-neutral-100 px-1 font-mono text-xs dark:bg-neutral-800">
              quickbooks-api
            </code>
          </li>
          <li>
            Table:{" "}
            <code className="bg-neutral-100 px-1 font-mono text-xs dark:bg-neutral-800">
              common.quickbooks_integrations
            </code>
          </li>
        </ul>
      </details>
    </div>
  );
};

export default IntegrationsSettings;
