"use client";

import { useState, useCallback } from "react";
import { verifyProofOnChain } from "@/lib/contract";

type VerifyState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "verified" }
  | { status: "missing" }
  | { status: "error"; message: string };

interface VerifyProofButtonProps {
  hashProof: string;
}

/**
 * Lets a user confirm a proof hash actually exists on-chain by calling the
 * contract's read-only `verifyProof` view (no transaction, no gas).
 */
export default function VerifyProofButton({ hashProof }: VerifyProofButtonProps) {
  const [state, setState] = useState<VerifyState>({ status: "idle" });

  const handleVerify = useCallback(async () => {
    setState({ status: "checking" });
    try {
      const found = await verifyProofOnChain(hashProof);
      setState({ status: found ? "verified" : "missing" });
    } catch (err: unknown) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Verification failed",
      });
    }
  }, [hashProof]);

  if (state.status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        Verified on-chain
      </span>
    );
  }

  if (state.status === "missing") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-full">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
        Not on-chain
      </span>
    );
  }

  if (state.status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-xs text-red-600 dark:text-red-400" title={state.message}>
          Verify error
        </span>
        <button
          onClick={handleVerify}
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline underline-offset-2"
        >
          Retry
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={handleVerify}
      disabled={state.status === "checking"}
      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 disabled:cursor-wait"
    >
      {state.status === "checking" ? (
        <>
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Verifying...
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          Verify
        </>
      )}
    </button>
  );
}
