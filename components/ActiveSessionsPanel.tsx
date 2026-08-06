"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";
import { getProofContract, getTxExplorerUrl, shortenHex } from "@/lib/contract";
import { signAttendanceRequest } from "@/lib/client";
import type { SessionInfo } from "@/types/attendance";

interface ActiveSessionsPanelProps {
  sessions: SessionInfo[];
  title?: string;
  emptyMessage?: string;
  onMarked: () => void;
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Ended";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default function ActiveSessionsPanel({
  sessions,
  title = "Open Attendance Sessions",
  emptyMessage = "No attendance sessions are open right now. Check back when your teacher opens one.",
  onMarked,
}: ActiveSessionsPanelProps) {
  const { address, signer } = useWallet();
  const now = useNow();
  const [markingSessionId, setMarkingSessionId] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<{
    sessionId: string;
    txHash: string;
    error?: string;
  } | null>(null);

  const handleMark = useCallback(
    async (session: SessionInfo) => {
      if (!address || !signer || session.onChainId == null) return;
      setMarkingSessionId(session.id);
      setTxResult(null);
      let txSent = false;
      let txHash = "";
      try {
        // 1. Send the markAttendance transaction from the student's wallet —
        //    the contract enforces registration, the time window, and the
        //    no-double-mark rule.
        const contract = await getProofContract();
        const tx: ethers.TransactionResponse = await contract.markAttendance(
          session.onChainId
        );
        const receipt = await tx.wait();
        txSent = true;
        txHash = receipt?.hash ?? tx.hash;

        // 2. Sign the attendance request and index the record off-chain.
        const signed = await signAttendanceRequest(signer, address);
        const res = await fetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...signed,
            sessionId: session.id,
            txHash,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Failed to record your attendance");
        }

        setTxResult({ sessionId: session.id, txHash });
        onMarked();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Transaction failed";
        // User-initiated rejections are not errors.
        if (
          message.includes("user rejected") ||
          message.includes("User denied") ||
          message.includes("ACTION_REJECTED")
        ) {
          setTxResult({
            sessionId: session.id,
            txHash: "",
            error: "Transaction cancelled.",
          });
        } else if (message.includes("already marked")) {
          setTxResult({
            sessionId: session.id,
            txHash,
            error: "You already marked this session.",
          });
        } else if (txSent) {
          // The on-chain mark succeeded but indexing failed — surface the tx
          // hash so the student can show it, and refresh so the portal picks
          // up the record if the server recovers.
          setTxResult({
            sessionId: session.id,
            txHash,
            error:
              "Recorded on-chain, but failed to save locally. Your tx hash is below — contact your teacher if it doesn't appear.",
          });
          onMarked();
        } else {
          setTxResult({ sessionId: session.id, txHash: "", error: message });
        }
      } finally {
        setMarkingSessionId(null);
      }
    },
    [address, signer, onMarked]
  );

  if (sessions.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{emptyMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {sessions.length} session{sessions.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sessions.map((session) => {
          const endMs =
            new Date(session.startTime).getTime() +
            session.durationSeconds * 1000;
          const remaining = endMs - now;
          const active = session.isActive && !session.markedByMe;
          const txUrl = session.myTxHash
            ? getTxExplorerUrl(session.myTxHash)
            : null;
          const result =
            txResult && txResult.sessionId === session.id ? txResult : null;

          return (
            <div
              key={session.id}
              className={`bg-white dark:bg-gray-800 rounded-2xl border p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 ${
                session.markedByMe
                  ? "border-emerald-200 dark:border-emerald-800"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                    {session.courseCode}
                  </p>
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                    {session.courseName}
                  </h4>
                </div>
                {session.markedByMe ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full flex-shrink-0">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                    Marked ✓
                  </span>
                ) : active ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full flex-shrink-0 animate-pulse">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                    Open
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-full flex-shrink-0">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                    {session.ended ? "Ended" : "Upcoming"}
                  </span>
                )}
              </div>

              <div className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300 mb-5">
                <p className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                  Starts {formatTime(session.startTime)}
                </p>
                <p className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  {session.ended ? (
                    "Window closed"
                  ) : (
                    <>
                      Closes in{" "}
                      <span
                        className={`font-mono font-semibold ${
                          remaining < 5 * 60 * 1000
                            ? "text-red-500"
                            : "text-gray-900 dark:text-white"
                        }`}
                      >
                        {formatRemaining(remaining)}
                      </span>
                    </>
                  )}
                </p>
              </div>

              {session.markedByMe && session.myTxHash && (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 mb-4">
                  <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                    Attendance recorded on-chain
                  </p>
                  {txUrl ? (
                    <a
                      href={txUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-emerald-600 dark:text-emerald-400 hover:underline break-all"
                    >
                      {session.myTxHash}
                    </a>
                  ) : (
                    <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 break-all mt-0.5">
                      {session.myTxHash}
                    </p>
                  )}
                </div>
              )}

              {result && (
                <div
                  className={`rounded-xl px-4 py-3 mb-4 border ${
                    result.error
                      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                      : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                  }`}
                >
                  {result.error ? (
                    <p className="text-xs font-medium text-red-700 dark:text-red-300">
                      {result.error}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                        Attendance marked! 🎉 Transaction hash:
                      </p>
                      {getTxExplorerUrl(result.txHash) ? (
                        <a
                          href={getTxExplorerUrl(result.txHash) ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono text-emerald-600 dark:text-emerald-400 hover:underline break-all"
                        >
                          {result.txHash}
                        </a>
                      ) : (
                        <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 break-all mt-0.5">
                          {result.txHash}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {active && (
                <button
                  onClick={() => void handleMark(session)}
                  disabled={markingSessionId === session.id}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
                >
                  {markingSessionId === session.id ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Confirming in MetaMask...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                      Mark Attendance
                    </span>
                  )}
                </button>
              )}

              {!active && !session.markedByMe && (
                <p className="text-center text-xs text-gray-400 dark:text-gray-500">
                  {session.ended
                    ? "This session has ended."
                    : `Opens ${formatTime(session.startTime)}`}
                </p>
              )}

              {session.markedByMe && (
                <p className="text-center text-xs text-gray-400 dark:text-gray-500">
                  Tx: {shortenHex(session.myTxHash ?? "")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
