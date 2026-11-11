import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

/**
 * "Allow Claude to use your ampOS account?" page.
 *
 * Supabase's OAuth 2.1 server sends people here (Authentication > OAuth Server >
 * Authorization Path = /oauth/consent) when an outside app, like Claude's ampOS
 * connector, asks to sign in as them. Wrapped in RequireAuth, so a signed-out
 * user logs in first and Login sends them back with ?authorization_id intact.
 *
 * "Allow Dynamic OAuth Apps" means any app can register itself and pick any
 * name, including "Claude". The return address is the part an app can't fake,
 * so we show it and warn loudly when it isn't Claude or this computer.
 */

type View =
  | { kind: "loading" }
  | { kind: "consent"; details: OAuthAuthorizationDetails }
  | { kind: "redirecting" }
  | { kind: "error"; message: string };

type Destination = { host: string; tone: "claude" | "local" | "unknown" };

const CLAUDE_DOMAINS = ["claude.ai", "claude.com", "anthropic.com"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function describeDestination(redirectUri: string): Destination {
  try {
    const url = new URL(redirectUri);
    const host = url.hostname.toLowerCase();
    const isClaude = CLAUDE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
    if (url.protocol === "https:" && isClaude) return { host, tone: "claude" };
    if (LOCAL_HOSTS.includes(host)) return { host, tone: "local" };
    return { host, tone: "unknown" };
  } catch {
    return { host: redirectUri, tone: "unknown" };
  }
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id");
  const [view, setView] = useState<View>({ kind: "loading" });
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);

  useEffect(() => {
    if (!authorizationId) {
      setView({
        kind: "error",
        message: "This link is missing its request ID. Start the connection again from Claude.",
      });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (cancelled) return;
      if (error || !data) {
        setView({
          kind: "error",
          message: "This request expired or was already used. Start the connection again from Claude.",
        });
        return;
      }
      if ("authorization_id" in data) {
        setView({ kind: "consent", details: data });
      } else {
        // Already approved earlier: go straight back to the app.
        setView({ kind: "redirecting" });
        window.location.assign(data.redirect_url);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizationId]);

  const decide = async (approve: boolean) => {
    if (!authorizationId || busy) return;
    setBusy(approve ? "approve" : "deny");
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (error || !data?.redirect_url) {
      setBusy(null);
      setView({
        kind: "error",
        message: error?.message || "Something went wrong. Start the connection again from Claude.",
      });
      return;
    }
    setView({ kind: "redirecting" });
    window.location.assign(data.redirect_url);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4 py-10">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-none">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <span className="h-3 w-3 bg-brand rounded-none" aria-hidden="true" />
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">ampOS</span>
        </div>
        <div className="px-6 py-6">
          {view.kind === "loading" && (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="md" />
            </div>
          )}

          {view.kind === "redirecting" && (
            <div className="flex flex-col items-center gap-3 py-8 text-sm text-neutral-600 dark:text-neutral-400">
              <LoadingSpinner size="md" />
              <span>Sending you back...</span>
            </div>
          )}

          {view.kind === "error" && (
            <div className="space-y-4">
              <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">Can't connect</h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{view.message}</p>
              <Link to="/portal" className="inline-block text-sm font-medium text-brand hover:underline">
                Back to ampOS
              </Link>
            </div>
          )}

          {view.kind === "consent" && (
            <ConsentBody details={view.details} busy={busy} onDecide={decide} />
          )}
        </div>
      </div>
    </div>
  );
}

function ConsentBody({
  details,
  busy,
  onDecide,
}: {
  details: OAuthAuthorizationDetails;
  busy: "approve" | "deny" | null;
  onDecide: (approve: boolean) => void;
}) {
  const appName = details.client?.name?.trim() || "This app";
  const dest = describeDestination(details.redirect_uri);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
          Allow {appName} to use your ampOS account?
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Signed in as {details.user?.email}
        </p>
      </div>

      <ul className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300 list-disc pl-5">
        <li>It can look up the ampOS data you can already see in the app.</li>
        <li>It acts as you. It can't see anything your account can't.</li>
        <li>You can disconnect it any time from that app's settings.</li>
      </ul>

      {dest.tone === "claude" && (
        <div className="border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 rounded-none">
          Sends you back to <span className="font-medium">{dest.host}</span>
        </div>
      )}
      {dest.tone === "local" && (
        <div className="border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 rounded-none">
          Sends you back to an app on this computer ({dest.host}), like Claude Code.
        </div>
      )}
      {dest.tone === "unknown" && (
        <div className="border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-200 rounded-none">
          <span className="font-semibold">This isn't Claude.</span> After you allow, you'll go to{" "}
          <span className="font-medium">{dest.host}</span>. Only allow it if you trust it.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 pt-1">
        <Button
          variant="outline"
          onClick={() => onDecide(false)}
          disabled={busy !== null}
          isLoading={busy === "deny"}
          className="rounded-none"
        >
          Deny
        </Button>
        <Button
          variant="primary"
          onClick={() => onDecide(true)}
          disabled={busy !== null}
          isLoading={busy === "approve"}
          className="rounded-none"
        >
          Allow
        </Button>
      </div>
    </div>
  );
}
