import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { useTheme } from '../theme/theme-provider';
import { Mail, Lock, LogIn, UserPlus, Shield, Zap, Users, Award } from 'lucide-react';
import { Button, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Input } from '../ui';
import Card from '../ui/Card';
import { EditProfilePopup } from '../profile/EditProfilePopup';

// Helper function to clear only user-specific storage
const clearAllStorage = () => {
  try {
    // Save essential data
    const themePreference = localStorage.getItem('vite-ui-theme');
    const supabaseAuth = localStorage.getItem('sb-auth-token');
    
    // Get all localStorage keys
    const keys = Object.keys(localStorage);
    
    // Clear only specific items from localStorage
    keys.forEach(key => {
      // Keep theme, auth token, and Supabase cache data
      if (!key.includes('theme') && 
          !key.includes('sb-auth-token') && 
          !key.startsWith('sb-') && 
          !key.includes('supabase')) {
        localStorage.removeItem(key);
      }
    });
    
    // Clear only user-specific sessionStorage
    const sessionKeys = Object.keys(sessionStorage);
    sessionKeys.forEach(key => {
      if (!key.includes('supabase') && !key.startsWith('sb-')) {
        sessionStorage.removeItem(key);
      }
    });
    
    // Remove only user-specific cookies
    document.cookie.split(';').forEach(cookie => {
      const [name] = cookie.trim().split('=');
      // Keep theme, auth, and Supabase-related cookies
      if (!name.includes('theme') && 
          !name.includes('sb-') && 
          !name.includes('supabase')) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      }
    });
    
    console.log("User-specific storage cleared while preserving app data");
  } catch (e) {
    console.error("Storage clear failed:", e);
  }
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const { theme, setTheme } = useTheme();

  // Store the current theme and force light mode
  useEffect(() => {
    const savedTheme = localStorage.getItem('vite-ui-theme') as 'light' | 'dark' | 'system';
    setTheme('light');

    // Restore the previous theme when component unmounts
    return () => {
      if (savedTheme && savedTheme !== 'light') {
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
      existingLinks.forEach(link => link.remove());
      
      // Create new favicon link with cache busting
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.href = href + '?v=' + Date.now();
      document.head.appendChild(link);
    };
    
    // Set login favicon
    console.log('Setting ampOS favicon for login page...');
    setFavicon('/ampOS-favicon.svg');
    
    // Cleanup: restore default favicon when leaving login page
    return () => {
      setFavicon('/ampOS-favicon.svg');
    };
  }, []);

  // Redirect if already logged in
  React.useEffect(() => {
    if (user) {
      navigate('/portal');
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
      
      navigate('/portal');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Check email domain
    if (!email.endsWith('@ampqes.com')) {
      setError('Only @ampqes.com email addresses are allowed to create accounts.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    try {
      console.log('Attempting signup with email:', email);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            email: email
          }
        },
      });

      if (error) throw error;

      if (data?.user) {
        console.log('Signup successful, user:', data.user.id);
        setShowProfileSetup(true);
        setError('Account created successfully! Please check your email for a verification link.');
      } else {
        console.log('No user data returned from signup');
        setError('Account created! Please check your email for a verification link.');
      }
    } catch (error) {
      console.error('Signup error:', error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('An unexpected error occurred during signup');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSetupComplete = () => {
    // This function might not be needed here anymore if setup happens on a different page
    // Or it could navigate the user away after setup
    setShowProfileSetup(false);
    navigate('/portal'); // Navigate to portal after setup is complete
  };

  return (
    <div className="min-h-screen bg-black text-[#ECE7DB] flex">
      {/* Left Side - Branding Section (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-black items-center justify-center relative overflow-hidden">
        <div className="relative z-10 flex flex-col justify-center items-center p-12 text-center">
          {/* Wordmark */}
          <h1 className="text-6xl tracking-tight" style={{ letterSpacing: '-0.02em' }}>ampOS</h1>
          <p className="mt-6 text-lg text-[#D9D5CA]">Professional Electrical Testing & Maintenance</p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-black">
        {/* Mobile Wordmark (Visible only on mobile) */}
        <div className="lg:hidden flex justify-center mb-8">
          <h1 className="text-5xl tracking-tight" style={{ letterSpacing: '-0.02em' }}>ampOS</h1>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">
              {isSignUpMode ? 'Join Our Team' : 'Welcome Back'}
            </h2>
            <p className="text-gray-300">
              {isSignUpMode 
                ? 'Create your account to get started with ampOS' 
                : 'Sign in to access your dashboard and manage your projects'}
            </p>
          </div>

          <Card className="border border-[#2A2A2A] shadow-xl bg-gray-600">
            <CardContent className="p-12">
              <form className="space-y-8" onSubmit={isSignUpMode ? handleSignUp : handleSubmit}>
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
                    leftIcon={<Mail className="h-5 w-5 text-gray-400" />}
                    placeholder="you@ampqes.com"
                    className="bg-gray-200 border-gray-400 text-black placeholder-gray-500 focus:border-white focus:ring-white h-12"
                  />

                  <Input
                    label="Password"
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={isSignUpMode ? "new-password" : "current-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    leftIcon={<Lock className="h-5 w-5 text-gray-400" />}
                    minLength={6}
                    hint={isSignUpMode ? "Password must be at least 6 characters" : undefined}
                    className="bg-gray-200 border-gray-400 text-black placeholder-gray-500 focus:border-white focus:ring-white h-12"
                  />
                </div>

                {error && (
                  <div className={`rounded-xl p-4 ${
                    error.startsWith('Success') || error.includes('created successfully')
                      ? 'bg-green-900/20 border border-green-700 text-green-200' 
                      : 'bg-red-900/20 border border-red-700 text-red-200'
                  }`}>
                    <div className="text-sm font-medium">
                      {error}
                    </div>
                  </div>
                )}

                <div className="pt-6">
                  <Button
                    type="submit"
                    variant="outline"
                    size="lg"
                    fullWidth
                    isLoading={loading}
                    leftIcon={isSignUpMode ? <UserPlus className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
                    className="bg-gray-800 hover:bg-gray-900 text-white border-transparent h-12 font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    {isSignUpMode ? 'Create Account' : 'Sign In'}
                  </Button>
                </div>
              </form>

              <div className="mt-10">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[#2A2A2A]"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-gray-600 text-gray-300 font-medium">
                      {isSignUpMode ? 'Already have an account?' : 'New to ampOS?'}
                    </span>
                  </div>
                </div>
                
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  fullWidth
                  onClick={() => {
                    setIsSignUpMode(!isSignUpMode);
                    setError(null);
                  }}
                  disabled={loading}
                  leftIcon={isSignUpMode ? <LogIn className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
                  className="mt-6 bg-gray-600 hover:bg-gray-700 text-white border-transparent h-12 font-medium"
                >
                  {isSignUpMode ? 'Sign in instead' : 'Create account'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-[#9A9487]">
            © 2024 ampOS. All rights reserved.
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