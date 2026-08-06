"use client";

import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import { useTeacherStatus } from "@/hooks/useTeacherStatus";

export default function Navbar() {
  const { address, connect, disconnect, isConnecting, error } = useWallet();
  const { canAccess } = useTeacherStatus();

  return (
    <nav className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20 group-hover:shadow-blue-600/30 transition-shadow">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
              </svg>
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              Attend<span className="text-blue-600 dark:text-blue-400">dApp</span>
            </span>
          </Link>

          <div className="hidden sm:flex items-center gap-6">
            <Link href="/" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Home</Link>
            <Link href="/student" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Student Portal</Link>
            <Link href="/admin" className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors">Teacher / Admin</Link>
          </div>

          <div className="flex items-center gap-3">
            {address ? (
              <div className="flex items-center gap-3">
                <Link href="/student" className="sm:hidden text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Student</Link>
                {canAccess && (
                  <Link href="/admin" className="sm:hidden text-sm font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors">Teacher</Link>
                )}
                <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-1.5 border border-gray-200 dark:border-gray-700">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{address.slice(0, 6)}...{address.slice(-4)}</span>
                </div>
                <button onClick={disconnect} className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg transition-colors">Disconnect</button>
              </div>
            ) : (
              <button onClick={connect} disabled={isConnecting} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 text-white text-sm font-semibold py-2 px-4 rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/20 disabled:cursor-not-allowed">
                {isConnecting ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Connecting...
                  </span>
                ) : "Connect Wallet"}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="pb-3">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
