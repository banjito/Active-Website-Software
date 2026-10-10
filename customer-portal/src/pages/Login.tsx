import { useState } from "react";
import { Navigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FullPageSpinner, Spinner } from "@/components/ui/spinner";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Login() {
  const { user, loading, signInWithPassword, signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/jobs" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (usePassword) {
      const { error } = await signInWithPassword(email, password);
      if (error) setError(error);
    } else {
      const { error } = await signInWithMagicLink(email);
      if (error) setError(error);
      else setSent(true);
    }
    setBusy(false);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Background video - plain background shows if it can't play */}
      <video
        className="pointer-events-none absolute left-1/2 top-1/2 h-[80%] w-[80%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-20"
        src="/ampos-access.webm"
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
      />
      {/* Dot grid over the video - follows the theme's text color */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(hsl(var(--foreground) / 0.2) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
        aria-hidden="true"
      />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-sm animate-scale-in">
        <div className="mb-6 text-center">
          <img
            src="/ampOSACCESS-logo.svg"
            alt="ampOS ACCESS"
            className="mx-auto h-14 w-auto dark:invert"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            Your reports, in one place.
          </p>
        </div>
        <Card className="shadow-lift">
          <CardHeader>
            <CardTitle>Customer sign in</CardTitle>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center bg-accent text-primary">
                  <MailCheck className="h-6 w-6" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Check{" "}
                  <span className="font-medium text-foreground">{email}</span>{" "}
                  for a sign-in link.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="email">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                  />
                </div>
                {usePassword && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium" htmlFor="password">
                      Password
                    </label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Spinner className="text-primary-foreground" />}
                  {usePassword ? "Sign in" : "Email me a sign-in link"}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setUsePassword((v) => !v);
                    setError(null);
                  }}
                >
                  {usePassword
                    ? "Use a one-time email link instead"
                    : "Sign in with a password instead"}
                </button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
