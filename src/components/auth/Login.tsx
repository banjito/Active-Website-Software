import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { useTheme } from "../theme/theme-provider";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  CheckCircle2,
  MailCheck,
  RefreshCw,
} from "lucide-react";
import { Button } from "../ui";
import { companyConfig, emailPlaceholder } from "@/lib/companyConfig";
import { useSiteLogos } from "@/services/siteThemeService";

const ALLOWED_EMAIL_DOMAINS = companyConfig.allowedEmailDomains;
const ALLOWED_EMAIL_DOMAINS_LABEL =
  ALLOWED_EMAIL_DOMAINS.length <= 1
    ? ALLOWED_EMAIL_DOMAINS.join("")
    : `${ALLOWED_EMAIL_DOMAINS.slice(0, -1).join(", ")} or ${
        ALLOWED_EMAIL_DOMAINS[ALLOWED_EMAIL_DOMAINS.length - 1]
      }`;

const MIN_PASSWORD_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

const isAllowedEmailDomain = (value: string) =>
  ALLOWED_EMAIL_DOMAINS.some((domain) =>
    value.trim().toLowerCase().endsWith(domain),
  );

const getFriendlyAuthMessage = (error: unknown, fallback: string) => {
  if (!(error instanceof Error)) return fallback;

  const message = error.message.toLowerCase();
  const status = (error as { status?: number }).status ?? 0;

  // A server crash (5xx) often reaches us as the literal message "{}".
  if (message === "{}" || status >= 500) {
    return `Something went wrong on our end. Try again in a few minutes, or email ${companyConfig.supportEmail}.`;
  }

  if (message.includes("error sending confirmation email")) {
    return `We couldn't send the confirmation email. Email ${companyConfig.supportEmail} for help.`;
  }

  if (message.includes("rate limit") || message.includes("rate_limit")) {
    return `Too many emails sent. Wait a few minutes, or email ${companyConfig.supportEmail} for help.`;
  }

  if (message.includes("email not confirmed")) {
    return "Confirm your email first. Check your inbox for the link.";
  }

  if (message.includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }

  return error.message;
};

type Mode = "signin" | "signup" | "reset";
type Notice = { tone: "error" | "success" | "warning"; text: string } | null;

const COPY: Record<Mode, { title: string; subtitle: string; submit: string }> =
  {
    signin: {
      title: "Sign in",
      subtitle: "Welcome back. Sign in to continue.",
      submit: "Sign in",
    },
    signup: {
      title: "Create your account",
      subtitle: "Use your company email to get started.",
      submit: "Create account",
    },
    reset: {
      title: "Reset your password",
      subtitle: "Enter your email and we'll send you a reset link.",
      submit: "Send reset link",
    },
  };

const inputClass =
  "w-full h-11 pl-10 bg-white border border-neutral-300 rounded-none text-[15px] text-neutral-900 placeholder:text-neutral-400 transition-[border-color,box-shadow] hover:border-neutral-400 focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/15";

function NoticeBox({ notice }: { notice: NonNullable<Notice> }) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    success: "border-green-200 bg-green-50 text-green-800",
  };
  const Icon = notice.tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 border px-3.5 py-3 text-sm rounded-none ${tones[notice.tone]}`}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{notice.text}</span>
    </div>
  );
}

/** One live requirement row: square box that fills in when met. */
function Requirement({
  met,
  bad,
  children,
}: {
  met: boolean;
  bad?: boolean;
  children: React.ReactNode;
}) {
  return (
    <p
      className={`mt-2 flex items-center gap-2 text-xs transition-colors ${
        met ? "text-green-700" : bad ? "text-red-600" : "text-neutral-500"
      }`}
    >
      <span
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border rounded-none transition-colors ${
          met
            ? "border-green-600 bg-green-600 text-white"
            : bad
              ? "border-red-400"
              : "border-neutral-300"
        }`}
      >
        {met && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      {children}
    </p>
  );
}

export default function Login() {
  const { logoUrl, hideLogo } = useSiteLogos();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // After sign-up: the address we sent the confirmation link to.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { setTheme } = useTheme();

  // Where to send the user after a successful sign-in. RequireAuth redirects
  // unauthenticated users here with state={{ from: location }}, so we honor that
  // (e.g. /sales-dashboard/mobile-log) and fall back to /portal otherwise.
  const redirectTo =
    (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname || "/portal";

  // Store the current theme and force light mode
  useEffect(() => {
    const savedTheme = localStorage.getItem("vite-ui-theme") as
      | "light"
      | "dark"
      | "system";
    setTheme("light");

    // Restore the previous theme when component unmounts
    return () => {
      if (savedTheme && savedTheme !== "light") {
        setTheme(savedTheme);
      }
    };
  }, [setTheme]);

  // Dynamic favicon change for login page
  useEffect(() => {
    const setFavicon = (href: string) => {
      const existingLinks = document.querySelectorAll('link[rel*="icon"]');
      existingLinks.forEach((link) => link.remove());

      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      link.href = href + "?v=" + Date.now();
      document.head.appendChild(link);
    };

    setFavicon(companyConfig.faviconPath);

    return () => {
      setFavicon(companyConfig.faviconPath);
    };
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate(redirectTo, { replace: true });
    }
  }, [user, navigate, redirectTo]);

  // Count down the resend timer.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setNotice(null);
    setSentTo(null);
    setAlreadyRegistered(false);
    setShowPassword(false);
    if (next === "reset") setPassword("");
  };

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) throw loginError;

      navigate(redirectTo, { replace: true });
    } catch (error) {
      setNotice({
        tone: "error",
        text: getFriendlyAuthMessage(error, "Could not sign in"),
      });
    } finally {
      setLoading(false);
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    if (!email.trim()) {
      setNotice({ tone: "error", text: "Enter your email first." });
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      );

      if (resetError) throw resetError;

      setNotice({
        tone: "success",
        text: "Reset link sent. Check your inbox.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: getFriendlyAuthMessage(error, "Could not send reset email"),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    const trimmedEmail = email.trim();

    if (!isAllowedEmailDomain(trimmedEmail)) {
      setNotice({
        tone: "error",
        text: `Use an email ending in ${ALLOWED_EMAIL_DOMAINS_LABEL}.`,
      });
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setNotice({
        tone: "error",
        text: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            email: trimmedEmail,
          },
        },
      });

      if (error) throw error;

      setSentTo(trimmedEmail);
      setAlreadyRegistered(false);
      setPassword("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      console.error("Signup error:", error);
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("already registered") ||
        message.includes("already exists")
      ) {
        setSentTo(trimmedEmail);
        setAlreadyRegistered(true);
      } else {
        setNotice({
          tone: "error",
          text: getFriendlyAuthMessage(
            error,
            "Something went wrong creating your account.",
          ),
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!sentTo) return;

    setResendLoading(true);
    setNotice(null);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: sentTo,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      setNotice({
        tone: "success",
        text: "Sent again. Check your inbox and spam folder.",
      });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      console.error("Resend verification error:", error);
      setNotice({
        tone: "error",
        text: getFriendlyAuthMessage(error, "Could not resend the email."),
      });
    } finally {
      setResendLoading(false);
    }
  };

  const copy = COPY[mode];
  const onSubmit =
    mode === "signin"
      ? handleSignIn
      : mode === "signup"
        ? handleSignUp
        : handleForgotPassword;

  // Live checks shown under the fields while creating an account.
  const passwordOk = password.length >= MIN_PASSWORD_LENGTH;

  const linkClass =
    "font-semibold text-neutral-900 underline-offset-4 hover:text-brand hover:underline disabled:opacity-50";

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col items-center justify-center px-4 py-10 sm:py-16">
      {!hideLogo && (
        <img
          src={logoUrl}
          alt="ampOS"
          className="h-14 sm:h-16 w-auto mb-8 sm:mb-10"
        />
      )}

      <div className="w-full max-w-[420px]">
        <div className="bg-white border border-neutral-200 rounded-none shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-20px_rgba(0,0,0,0.25)]">
          {/* Thin brand strip across the top */}
          <div className="h-1 bg-brand" />

          <div className="px-6 py-8 sm:px-10 sm:py-10">
            {sentTo ? (
              /* ---------- After sign-up: check your inbox ---------- */
              <div className="text-center">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center bg-brand/10 text-brand rounded-none">
                  {alreadyRegistered ? (
                    <AlertCircle className="h-6 w-6" />
                  ) : (
                    <MailCheck className="h-6 w-6" />
                  )}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {alreadyRegistered
                    ? "Already registered"
                    : "Check your inbox"}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                  {alreadyRegistered ? (
                    <>
                      <span className="font-medium text-neutral-900">
                        {sentTo}
                      </span>{" "}
                      already has an account. Sign in, or resend the
                      confirmation link if you never clicked it.
                    </>
                  ) : (
                    <>
                      We sent a confirmation link to{" "}
                      <span className="font-medium text-neutral-900">
                        {sentTo}
                      </span>
                      . Click it to finish setting up your account.
                    </>
                  )}
                </p>

                {notice && (
                  <div className="mt-5 text-left">
                    <NoticeBox notice={notice} />
                  </div>
                )}

                <div className="mt-6 space-y-3">
                  {alreadyRegistered && (
                    <Button
                      type="button"
                      variant="primary"
                      fullWidth
                      onClick={() => switchMode("signin")}
                      rightIcon={<ArrowRight className="h-4 w-4" />}
                      className="h-11"
                    >
                      Sign in
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    fullWidth
                    onClick={handleResendVerification}
                    isLoading={resendLoading}
                    disabled={cooldown > 0}
                    leftIcon={<RefreshCw className="h-4 w-4" />}
                    className="h-11"
                  >
                    {cooldown > 0
                      ? `Resend email in ${cooldown}s`
                      : "Resend email"}
                  </Button>
                </div>

                <p className="mt-5 text-xs text-neutral-500">
                  Not seeing it? Check your spam folder.
                </p>
              </div>
            ) : (
              /* ---------- Sign in / Create account / Reset ---------- */
              <>
                <div className="mb-7">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {copy.title}
                  </h1>
                  <p className="mt-1.5 text-sm text-neutral-500">
                    {copy.subtitle}
                  </p>
                </div>

                <form className="space-y-5" onSubmit={onSubmit}>
                  {/* Email */}
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-1.5 block text-sm font-medium text-neutral-800"
                    >
                      {mode === "signup" ? "Work email" : "Email"}
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={emailPlaceholder}
                        className={`${inputClass} pr-3`}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  {mode !== "reset" && (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label
                          htmlFor="password"
                          className="block text-sm font-medium text-neutral-800"
                        >
                          Password
                        </label>
                        {mode === "signin" && (
                          <button
                            type="button"
                            onClick={() => switchMode("reset")}
                            className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                        <input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete={
                            mode === "signup"
                              ? "new-password"
                              : "current-password"
                          }
                          required
                          minLength={
                            mode === "signup" ? MIN_PASSWORD_LENGTH : undefined
                          }
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={
                            mode === "signup"
                              ? "Create a password"
                              : "Your password"
                          }
                          className={`${inputClass} pr-11`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          className="absolute inset-y-0 right-0 flex items-center px-3.5 text-neutral-400 hover:text-neutral-700 focus:outline-none focus-visible:text-brand"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {mode === "signup" && (
                        <Requirement met={passwordOk}>
                          At least {MIN_PASSWORD_LENGTH} characters
                        </Requirement>
                      )}
                    </div>
                  )}

                  {notice && <NoticeBox notice={notice} />}

                  <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    isLoading={loading}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                    className="h-11 !mt-7"
                  >
                    {copy.submit}
                  </Button>
                </form>
              </>
            )}
          </div>

          {/* Card footer: switch between views */}
          <div className="border-t border-neutral-100 bg-neutral-50/70 px-6 py-4 text-center text-sm text-neutral-600 sm:px-10">
            {sentTo ? (
              <button
                type="button"
                onClick={() => {
                  setSentTo(null);
                  setAlreadyRegistered(false);
                  setNotice(null);
                }}
                className={linkClass}
              >
                Use a different email
              </button>
            ) : mode === "signin" ? (
              <>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  disabled={loading}
                  className={linkClass}
                >
                  Create an account
                </button>
              </>
            ) : mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  disabled={loading}
                  className={linkClass}
                >
                  Sign in
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => switchMode("signin")}
                disabled={loading}
                className={`${linkClass} inline-flex items-center gap-1.5`}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </button>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-neutral-400">
          © {new Date().getFullYear()} ampOS. All rights reserved.
        </p>
      </div>
    </div>
  );
}
