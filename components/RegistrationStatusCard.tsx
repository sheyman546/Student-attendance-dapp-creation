"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@/hooks/useWallet";
import { signLinkRequest } from "@/lib/client";
import type { StudentProfile } from "@/types/attendance";

interface RegistrationStatusCardProps {
  registered: boolean;
  profile: StudentProfile | null;
  onLinked: () => void;
}

export default function RegistrationStatusCard({
  registered,
  profile,
  onLinked,
}: RegistrationStatusCardProps) {
  const { address, signer } = useWallet();
  const [matricNo, setMatricNo] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLink = useCallback(async () => {
    if (!address || !signer) return;
    setIsLinking(true);
    setError(null);
    setResult(null);
    try {
      const signed = await signLinkRequest(signer, address);
      const res = await fetch("/api/student/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...signed, matricNo: matricNo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to link your registration");
      }
      setResult(
        `🎉 You're registered! On-chain tx: ${(data as { txHash?: string }).txHash ?? "confirmed"}`
      );
      setMatricNo("");
      onLinked();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to link your registration";
      setError(message);
    } finally {
      setIsLinking(false);
    }
  }, [address, signer, matricNo, onLinked]);

  if (registered) {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 flex-shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              Registered Student ✓
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
              Your wallet is on the attendance roster — you can mark attendance
              when a session is open.
              {profile?.matricNo && (
                <span className="mt-1 block">
                  Matric: <span className="font-mono">{profile.matricNo}</span>
                  {profile.name ? ` · ${profile.name}` : ""}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 bg-amber-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-amber-500/20 flex-shrink-0">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            You&apos;re not registered on-chain yet
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Only registered students can mark attendance. Ask your teacher to
            register you, or if your teacher already added you by matric
            number, link your wallet below.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleLink();
            }}
            className="flex flex-col sm:flex-row gap-2 mt-4"
          >
            <input
              type="text"
              value={matricNo}
              onChange={(e) => setMatricNo(e.target.value)}
              placeholder="Matric / student ID number"
              maxLength={32}
              className="flex-1 bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-amber-700/50 dark:placeholder-amber-300/40 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            />
            <button
              type="submit"
              disabled={isLinking || !matricNo.trim()}
              className="shrink-0 bg-amber-600 hover:bg-amber-700 disabled:from-gray-400 disabled:to-gray-400 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-amber-600/20 disabled:cursor-not-allowed"
            >
              {isLinking ? "Linking..." : "Link My Wallet"}
            </button>
          </form>

          {result && (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mt-3">
              {result}
            </p>
          )}
          {error && (
            <p className="text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mt-3">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
