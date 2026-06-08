import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, CardContent, Input } from "../ui";
import Card from "../ui/Card";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        setIsError(true);
        setMessage("This reset link is invalid or expired.");
      }

      setCheckingSession(false);
    };

    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsError(false);

    if (password.length < 6) {
      setIsError(true);
      setMessage("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setIsError(true);
      setMessage("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "Could not update password",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-center mb-10">
        <img
          src="/ampOS_full_logo.svg"
          alt="ampOS"
          className="h-[5rem] w-auto"
        />
      </div>

      <div className="w-full flex flex-col justify-center">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-black mb-2">
              Set new password
            </h2>
          </div>

          <Card className="bg-[#f26722] border border-gray-800 shadow-sm">
            <CardContent className="p-12">
              {checkingSession ? (
                <p className="text-sm text-black">Checking reset link...</p>
              ) : isError && message === "This reset link is invalid or expired." ? (
                <div className="space-y-6">
                  <div className="rounded-xl p-4 bg-transparent border border-red-700 text-red-950">
                    <div className="text-sm font-medium">{message}</div>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={() => navigate("/login", { replace: true })}
                    className="h-12 font-medium hover:bg-[#f26722]/75"
                  >
                    Back to sign in
                  </Button>
                </div>
              ) : (
                <form className="space-y-8" onSubmit={handleSubmit}>
                  <div className="space-y-6 pt-4">
                    <Input
                      label="New password"
                      id="new-password"
                      name="new-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      leftIcon={<Lock className="h-5 w-5 text-gray-400" />}
                      minLength={6}
                      placeholder="Enter new password"
                      hint="Password must be at least 6 characters"
                      className="bg-gray-200 border-gray-400 text-black placeholder-gray-500 h-12 focus:!border-[#f26722] focus:!ring-2 focus:!ring-[#f26722] focus:!ring-offset-2 focus:!ring-offset-gray-200"
                    />

                    <Input
                      label="Confirm password"
                      id="confirm-password"
                      name="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      leftIcon={<Lock className="h-5 w-5 text-gray-400" />}
                      minLength={6}
                      placeholder="Re-enter new password"
                      className="bg-gray-200 border-gray-400 text-black placeholder-gray-500 h-12 focus:!border-[#f26722] focus:!ring-2 focus:!ring-[#f26722] focus:!ring-offset-2 focus:!ring-offset-gray-200"
                    />
                  </div>

                  {message && (
                    <div
                      className={`rounded-xl p-4 ${
                        isError
                          ? "bg-transparent border border-red-700 text-red-950"
                          : "bg-transparent border border-green-700 text-green-950"
                      }`}
                    >
                      <div className="text-sm font-medium">{message}</div>
                    </div>
                  )}

                  <div>
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      fullWidth
                      isLoading={loading}
                      leftIcon={<Lock className="h-5 w-5" />}
                      className="h-12 font-medium hover:bg-[#f26722]/75"
                    >
                      Update password
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
