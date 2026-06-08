import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { useTheme } from "../theme/theme-provider";
import {
  Mail,
  Lock,
  LogIn,
  UserPlus,
  Shield,
  Zap,
  Users,
  Award,
  RefreshCw,
} from "lucide-react";
import {
  Button,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
} from "../ui";
import Card from "../ui/Card";
import { EditProfilePopup } from "../profile/EditProfilePopup";

const ALLOWED_EMAIL_DOMAINS = ["@ampqes.com", "@cedsi.com"];
const ALLOWED_EMAIL_DOMAINS_LABEL = ALLOWED_EMAIL_DOMAINS.join(" or ");

const isAllowedEmailDomain = (value: string) =>
  ALLOWED_EMAIL_DOMAINS.some((domain) =>
    value.trim().toLowerCase().endsWith(domain),
  );

// Helper function to clear only user-specific storage
const clearAllStorage = () => {
  try {
    // Save essential data
    const themePreference = localStorage.getItem("vite-ui-theme");
    const supabaseAuth = localStorage.getItem("sb-auth-token");

    // Get all localStorage keys
    const keys = Object.keys(localStorage);

    // Clear only specific items from localStorage
    keys.forEach((key) => {
      // Keep theme, auth token, and Supabase cache data
      if (
        !key.includes("theme") &&
        !key.includes("sb-auth-token") &&
        !key.startsWith("sb-") &&
        !key.includes("supabase")
      ) {
        localStorage.removeItem(key);
      }
    });

    // Clear only user-specific sessionStorage
    const sessionKeys = Object.keys(sessionStorage);
    sessionKeys.forEach((key) => {
      if (!key.includes("supabase") && !key.startsWith("sb-")) {
        sessionStorage.removeItem(key);
      }
    });

    // Remove only user-specific cookies
    document.cookie.split(";").forEach((cookie) => {
      const [name] = cookie.trim().split("=");
      // Keep theme, auth, and Supabase-related cookies
      if (
        !name.includes("theme") &&
        !name.includes("sb-") &&
        !name.includes("supabase")
      ) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      }
    });

    console.log("User-specific storage cleared while preserving app data");
  } catch (e) {
    console.error("Storage clear failed:", e);
  }
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [showResendOption, setShowResendOption] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const { theme, setTheme } = useTheme();

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
    // Simple but effective favicon change with cache busting
    const setFavicon = (href: string) => {
      // Remove existing favicon links
      const existingLinks = document.querySelectorAll('link[rel*="icon"]');
      existingLinks.forEach((link) => link.remove());

      // Create new favicon link with cache busting
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      link.href = href + "?v=" + Date.now();
      document.head.appendChild(link);
    };

    // Set login favicon
    console.log("Setting ampOS favicon for login page...");
    setFavicon("/ampOS-favicon.svg");

    // Cleanup: restore default favicon when leaving login page
    return () => {
      setFavicon("/ampOS-favicon.svg");
    };
  }, []);

  // Redirect if already logged in
  React.useEffect(() => {
    if (user) {
      navigate("/portal");
    }
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) throw loginError;

      navigate("/portal");
    } catch (error) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setShowResendOption(false);

    if (!email.trim()) {
      setError("Enter your email first");
      setLoading(false);
      return;
    }

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      );

      if (resetError) throw resetError;

      setError("Password reset email sent. Check your inbox.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not send reset email");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setShowResendOption(false);

    // Check email domain
    if (!isAllowedEmailDomain(email)) {
      setError(
        `Only ${ALLOWED_EMAIL_DOMAINS_LABEL} email addresses are allowed to create accounts.`,
      );
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      setLoading(false);
      return;
    }

    try {
      console.log("Attempting signup with email:", email);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            email: email,
          },
        },
      });

      if (error) throw error;

      if (data?.user) {
        console.log("Signup successful, user:", data.user.id);
        setShowProfileSetup(true);
        setResendEmail(email);
        setShowResendOption(true);
        setError(
          "Account created successfully! Please check your email for a verification link. If you don't receive it within a few minutes, you can resend it below.",
        );
      } else {
        console.log("No user data returned from signup");
        setResendEmail(email);
        setShowResendOption(true);
        setError(
          "Account created! Please check your email for a verification link. If you don't receive it within a few minutes, you can resend it below.",
        );
      }
    } catch (error) {
      console.error("Signup error:", error);
      if (error instanceof Error) {
        // Check if user already exists but email not confirmed
        if (
          error.message.includes("already registered") ||
          error.message.includes("already exists")
        ) {
          setResendEmail(email);
          setShowResendOption(true);
          setError(
            "This email is already registered. If you haven't verified your email yet, you can resend the verification link below.",
          );
        } else {
          setError(error.message);
        }
      } else {
        setError("An unexpected error occurred during signup");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!resendEmail || !isAllowedEmailDomain(resendEmail)) {
      setError(
        `Please enter a valid ${ALLOWED_EMAIL_DOMAINS_LABEL} email address to resend verification.`,
      );
      return;
    }

    setResendLoading(true);
    try {
      console.log("Resending verification email to:", resendEmail);
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: resendEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      setError(
        "Verification email sent! Please check your inbox and spam folder. Note: Supabase free tier limits emails to 4 per hour.",
      );
    } catch (error) {
      console.error("Resend verification error:", error);
      if (error instanceof Error) {
        if (error.message.includes("rate") || error.message.includes("limit")) {
          setError(
            "Email rate limit reached. Please wait a few minutes before trying again. Supabase free tier allows 4 confirmation emails per hour.",
          );
        } else {
          setError(`Failed to resend: ${error.message}`);
        }
      } else {
        setError(
          "Failed to resend verification email. Please try again later.",
        );
      }
    } finally {
      setResendLoading(false);
    }
  };

  const handleProfileSetupComplete = () => {
    // This function might not be needed here anymore if setup happens on a different page
    // Or it could navigate the user away after setup
    setShowProfileSetup(false);
    navigate("/portal"); // Navigate to portal after setup is complete
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Logo - stacked on top */}
      <div className="flex justify-center mb-10">
        <img
          src="/ampOS_full_logo.svg"
          alt="ampOS"
          className="h-[5rem] w-auto"
        />
      </div>

      {/* Login Form */}
      <div className="w-full flex flex-col justify-center">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-black mb-2">
              {isForgotPasswordMode
                ? "Reset password"
                : isSignUpMode
                  ? "Make your account"
                  : "Welcome back"}
            </h2>
          </div>

          <Card className="bg-[#f26722] border border-gray-800 shadow-sm">
            <CardContent className="p-12">
              <form
                className="space-y-8"
                onSubmit={
                  isForgotPasswordMode
                    ? handleForgotPassword
                    : isSignUpMode
                      ? handleSignUp
                      : handleSubmit
                }
              >
                <div className="space-y-6 pt-4">
                  <Input
                    label="Email address"
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    leftIcon={<Mail className="h-5 w-5 text-gray-800" />}
                    placeholder="you@email.com"
                    className="bg-gray-200 border-gray-400 text-black placeholder-gray-500 h-12 focus:!border-[#f26722] focus:!ring-2 focus:!ring-[#f26722] focus:!ring-offset-2 focus:!ring-offset-gray-200"
                  />

                  {!isForgotPasswordMode && (
                    <Input
                      label="Password"
                      id="password"
                      name="password"
                      type="password"
                      autoComplete={
                        isSignUpMode ? "new-password" : "current-password"
                      }
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      leftIcon={<Lock className="h-5 w-5 text-gray-400" />}
                      minLength={6}
                      placeholder="Enter your password"
                      hint={
                        isSignUpMode
                          ? "Password must be at least 6 characters"
                          : undefined
                      }
                      className="bg-gray-200 border-gray-400 text-black placeholder-gray-500 h-12 focus:!border-[#f26722] focus:!ring-2 focus:!ring-[#f26722] focus:!ring-offset-2 focus:!ring-offset-gray-200"
                    />
                  )}

                  {!isSignUpMode && !isForgotPasswordMode && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setIsForgotPasswordMode(true);
                          setError(null);
                          setPassword("");
                          setShowResendOption(false);
                        }}
                        className="text-sm font-medium text-black hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}
                </div>

                {error && (
                  <div
                    className={`rounded-xl p-4 ${
                      error.startsWith("Success") ||
                      error.includes("created successfully") ||
                      error.includes("Verification email sent") ||
                      error.includes("Password reset email sent")
                        ? "bg-transparent border border-green-700 text-green-950"
                        : error.includes("already registered") ||
                            error.includes("haven't verified")
                          ? "bg-transparent border border-yellow-700 text-yellow-950"
                          : "bg-transparent border border-red-700 text-red-950"
                    }`}
                  >
                    <div className="text-sm font-medium">{error}</div>
                  </div>
                )}

                {showResendOption && (
                  <div className="mt-4 p-4 bg-gray-700/50 rounded-xl border border-gray-600">
                    <p className="text-sm text-gray-300 mb-3">
                      Didn't receive the email? Check your spam folder or resend
                      it:
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        placeholder="your@ampqes.com"
                        className="flex-1 bg-gray-200 border-gray-400 text-black placeholder-gray-500 h-10"
                      />
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleResendVerification}
                        disabled={resendLoading}
                        isLoading={resendLoading}
                        leftIcon={<RefreshCw className="h-4 w-4" />}
                        className="text-white h-10 px-4"
                      >
                        Resend
                      </Button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Note: Supabase free tier limits to 4 confirmation emails
                      per hour.
                    </p>
                  </div>
                )}

                <div>
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    fullWidth
                    isLoading={loading}
                    leftIcon={
                      isForgotPasswordMode ? (
                        <Mail className="h-5 w-5" />
                      ) : isSignUpMode ? (
                        <UserPlus className="h-5 w-5" />
                      ) : (
                        <LogIn className="h-5 w-5" />
                      )
                    }
                    className="h-12 font-medium hover:bg-[#f26722]/75"
                  >
                    {isForgotPasswordMode
                      ? "Send reset link"
                      : isSignUpMode
                        ? "Create account"
                        : "Sign in"}
                  </Button>
                </div>
              </form>

              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  fullWidth
                  onClick={() => {
                    if (isForgotPasswordMode) {
                      setIsForgotPasswordMode(false);
                    } else {
                      setIsSignUpMode(!isSignUpMode);
                    }
                    setError(null);
                    setShowResendOption(false);
                  }}
                  disabled={loading}
                  leftIcon={
                    isForgotPasswordMode || isSignUpMode ? (
                      <LogIn className="h-5 w-5" />
                    ) : (
                      <UserPlus className="h-5 w-5" />
                    )
                  }
                  className="mt-6 h-12 font-medium bg-transparent border-none hover:bg-gray-800/10"
                >
                  {isForgotPasswordMode
                    ? "Back to sign in"
                    : isSignUpMode
                      ? "Sign in instead"
                      : "Create account"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-[#9A9487]">
            © 2026 ampOS. All rights reserved.
          </p>
        </div>
      </div>

      {/* Remove the direct rendering of EditProfilePopup from the Login component */}
      {/* {showProfileSetup && (
        <EditProfilePopup
          isOpen={showProfileSetup}
          onClose={handleProfileSetupComplete}
          currentUser={{
            email: email // This would need the actual user object after verification
          }}
          isNewUser={true}
        />
      )} */}
    </div>
  );
}
