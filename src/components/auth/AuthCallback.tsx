import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { readAuthUrlParams, AuthUrlParams } from "../../lib/authUrlSnapshot";
import type { EmailOtpType, Session } from "@supabase/supabase-js";

/**
 * How long to give the Supabase client to finish the session exchange it starts
 * on its own (detectSessionInUrl) before we step in and try it ourselves.
 */
const SDK_WAIT_MS = 4000;
const POLL_INTERVAL_MS = 250;

/** Link types that land on the password form instead of profile setup. */
const PASSWORD_TYPES = new Set(["recovery", "invite"]);

function toOtpType(type: string | null): EmailOtpType {
  switch (type) {
    case "recovery":
    case "invite":
    case "magiclink":
    case "email":
    case "email_change":
      return type;
    default:
      return "signup";
  }
}

/**
 * Resolves as soon as a session exists, or with null after `timeoutMs`.
 * Listens for auth events *and* polls, because the session can land either way
 * depending on whether the client or this component performed the exchange.
 */
function waitForSession(timeoutMs: number): Promise<Session | null> {
  return new Promise((resolve) => {
    // Held in an object so `finish` can reference the unsubscribe handle that is
    // only available after the listener below is registered.
    const listener = { settled: false, unsubscribe: () => {} };

    const finish = (session: Session | null) => {
      if (listener.settled) return;
      listener.settled = true;
      clearInterval(poll);
      clearTimeout(timer);
      listener.unsubscribe();
      resolve(session);
    };

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) finish(data.session);
    };

    const poll = setInterval(() => void check(), POLL_INTERVAL_MS);
    const timer = setTimeout(() => finish(null), timeoutMs);

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(session);
    });
    listener.unsubscribe = () => data.subscription.unsubscribe();
    if (listener.settled) listener.unsubscribe();

    void check();
  });
}

/** Human-readable text for a failure Supabase reported in the URL itself. */
function describeUrlError(params: AuthUrlParams): string {
  const code = params.errorCode ?? "";

  if (code.includes("expired")) {
    return "This link has expired. Request a new one from the login page.";
  }
  if (code === "access_denied") {
    return "This link is no longer valid. It may have already been used. Try signing in, or request a new link.";
  }
  return (
    params.errorDescription?.replace(/\+/g, " ") ||
    "This link could not be verified. Request a new one from the login page."
  );
}

export default function AuthCallback() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    // One-time tokens can only be redeemed once, so this must never run twice
    // (React StrictMode mounts effects twice in development).
    if (started.current) return;
    started.current = true;

    let cancelled = false;

    const fail = (message: string, underlying?: unknown) => {
      if (cancelled) return;
      console.error("Auth callback failed:", message, underlying);
      setError(message);
      if (underlying instanceof Error) setDetail(underlying.message);
      setLoading(false);
    };

    const succeed = (needsPassword: boolean) => {
      if (cancelled) return;
      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        if (cancelled) return;
        navigate(needsPassword ? "/reset-password" : "/profile-setup", {
          replace: true,
        });
      }, 1200);
    };

    const handleAuthCallback = async () => {
      try {
        const params = readAuthUrlParams();
        const needsPassword = PASSWORD_TYPES.has(params.type ?? "");

        console.log("Processing auth callback:", {
          type: params.type,
          hasCode: !!params.code,
          hasTokenHash: !!params.tokenHash,
          hasAccessToken: !!params.accessToken,
          errorCode: params.errorCode,
        });

        // 1. Supabase already told us it rejected the link.
        if (params.errorCode || params.errorDescription) {
          fail(describeUrlError(params));
          return;
        }

        // 2. A one-time token (?token_hash=). The client never touches these,
        //    so there is no race - redeem it directly. This flow works even when
        //    the link is opened in a different browser than it was requested in.
        if (params.tokenHash) {
          const { data, error: otpError } = await supabase.auth.verifyOtp({
            token_hash: params.tokenHash,
            type: toOtpType(params.type),
          });

          if (otpError || !data.session) {
            fail(
              "This link could not be verified. It may have expired or already been used. Try signing in, or request a new link.",
              otpError,
            );
            return;
          }

          succeed(needsPassword);
          return;
        }

        // 3. Otherwise the client is mid-exchange on the ?code= or #access_token
        //    in the URL. Wait for it rather than racing it - redeeming the code
        //    twice fails.
        const session = await waitForSession(SDK_WAIT_MS);
        if (cancelled) return;
        if (session) {
          succeed(needsPassword);
          return;
        }

        // 4. The client did not get there. Try the exchange ourselves.
        if (params.code) {
          const { data, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(params.code);
          if (cancelled) return;

          if (!exchangeError && data.session) {
            succeed(needsPassword);
            return;
          }

          // The client may have consumed the code first and still be finishing,
          // which surfaces here as a spurious error - give it a last chance.
          const late = await waitForSession(SDK_WAIT_MS);
          if (cancelled) return;
          if (late) {
            succeed(needsPassword);
            return;
          }

          // Genuine PKCE failure: the code verifier lives in the browser that
          // requested the link, so opening it elsewhere (a mail app's built-in
          // browser, another device) can never complete. The email itself is
          // already verified at this point, so signing in works.
          fail(
            "Your email is verified, but we could not sign you in automatically because this link was opened in a different browser than the one you signed up in. Please sign in with your password.",
            exchangeError,
          );
          return;
        }

        if (params.accessToken) {
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: params.accessToken,
            refresh_token: params.refreshToken || "",
          });
          if (cancelled) return;

          if (sessionError || !data.session) {
            fail(
              "This link could not be verified. It may have expired. Request a new one from the login page.",
              sessionError,
            );
            return;
          }

          succeed(needsPassword);
          return;
        }

        fail(
          "This link is missing its verification details. Request a new one from the login page.",
        );
      } catch (err) {
        fail("An unexpected error occurred. Please try again later.", err);
      }
    };

    void handleAuthCallback();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="animate-spin rounded-none h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <h2 className="text-xl font-semibold mb-2">Verifying your email...</h2>
        <p className="text-neutral-600">
          Please wait while we complete the verification process.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 max-w-lg">
          <h2 className="text-xl font-semibold mb-2">
            Could not complete sign-in
          </h2>
          <p>{error}</p>
          {detail && (
            <p className="mt-2 text-xs text-red-600 opacity-75">{detail}</p>
          )}
        </div>
        <button
          onClick={() => navigate("/login", { replace: true })}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Continue to Sign In
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          <h2 className="text-xl font-semibold mb-2">Success</h2>
          <p>You will be redirected in a moment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <p>Processing your verification...</p>
    </div>
  );
}
