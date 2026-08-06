"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";

interface TeacherLoginCardProps {
  teacherEmail: string | null;
  onRefresh: () => void;
}

const OAUTH_MESSAGES: Record<string, string> = {
  success: "Signed in with Google successfully.",
  denied: "Google sign-in was cancelled.",
  error: "Google sign-in failed. Please try again.",
  not_configured:
    "Google login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.",
  not_teacher:
    "This Google account is not registered as a teacher. Ask the admin to add your email.",
  unverified: "Your Google email could not be verified.",
  state_mismatch: "Security check failed — please try signing in again.",
};

export default function TeacherLoginCard({
  teacherEmail,
  onRefresh,
}: TeacherLoginCardProps) {
  const { address, connect, disconnect, isConnecting, error } = useWallet();
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);

  // Read the ?oauth= result from the Google callback redirect (client-side,
  // to avoid useSearchParams Suspense complications).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get("oauth");
    if (result && OAUTH_MESSAGES[result]) {
      setOauthNotice(OAUTH_MESSAGES[result]);
      // Clean the URL so a refresh doesn't re-show the banner.
      const url = new URL(window.location.href);
      url.searchParams.delete("oauth");
      window.history.replaceState({}, "", url.toString());
      onRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[55vh] px-6">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-violet-600 to-purple-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-violet-600/30 mb-6">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Teacher / Admin Portal
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          Sign in to register students, create courses and manage attendance
          sessions.
        </p>

        {oauthNotice && (
          <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
            <p className="text-xs font-medium text-blue-800 dark:text-blue-200">
              {oauthNotice}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <a
            href="/api/auth/google"
            className="w-full inline-flex items-center justify-center gap-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
              <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.97 10.97 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z" />
            </svg>
            Sign in with Google
          </a>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs text-gray-400 dark:text-gray-500">or</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>

          {!address ? (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed shadow-lg shadow-violet-600/20"
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          ) : (
            <div className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-left">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Connected as
                  </p>
                  <p className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    disconnect();
                    onRefresh();
                  }}
                  className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Disconnect
                </button>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                Wallet verified against the contract owner / teacher roster
                before the dashboard unlocks.
              </p>
            </div>
          )}
        </div>

        {teacherEmail && (
          <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-left">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Google session
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {teacherEmail}
                </p>
              </div>
              <a
                href="/api/auth/logout"
                className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors"
              >
                Sign out
              </a>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 text-xs font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
