"use client";

import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";
import { getProofContract, shortenHex } from "@/lib/contract";
import { signAdminRequest, toQuery } from "@/lib/client";
import type { AdminStudentRecord } from "@/types/attendance";

export default function AdminStudentsPanel() {
  const { address, signer } = useWallet();
  const [students, setStudents] = useState<AdminStudentRecord[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [matricNo, setMatricNo] = useState("");
  const [studentWallet, setStudentWallet] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStudents = useCallback(async () => {
    try {
      const signed = address && signer ? await signAdminRequest(signer, address) : {};
      const res = await fetch(`/api/admin/students${toQuery(signed)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load students");
      setStudents(Array.isArray(data.students) ? data.students : []);
    } catch {
      setStudents([]);
    }
  }, [address, signer]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const handleRegister = useCallback(async () => {
    const hasWallet = studentWallet.trim() !== "";
    if (!hasWallet && !email.trim() && !matricNo.trim()) {
      setError("Provide a wallet address, email or matric number");
      return;
    }
    // A wallet-backed registration requires a connected wallet to send the
    // on-chain tx. Email/matric registrations work with the Google-login
    // session alone.
    if (hasWallet && (!address || !signer)) {
      setError("Connect your wallet to register a student on-chain");
      return;
    }

    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      let txHash = "";

      // A wallet-backed registration is recorded on-chain first (the
      // contract's registerStudent is admin/teacher-only — enforced there).
      if (hasWallet && address && signer) {
        const contract = await getProofContract();
        const tx: ethers.TransactionResponse = await contract.registerStudent(
          studentWallet.trim()
        );
        const receipt = await tx.wait();
        txHash = receipt?.hash ?? tx.hash;
      }

      // Signed params when a wallet is connected; otherwise the Google-login
      // session cookie authorizes the request.
      const signed =
        address && signer ? await signAdminRequest(signer, address) : {};
      const res = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...signed,
          studentWallet: hasWallet ? studentWallet.trim() : "",
          name: name.trim(),
          email: email.trim(),
          matricNo: matricNo.trim(),
          ...(txHash ? { txHash } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to register student");

      setNotice(
        hasWallet
          ? `Student registered on-chain (tx ${shortenHex(txHash)})`
          : "Student saved — they can link their wallet from the student portal using their matric number."
      );
      setName("");
      setEmail("");
      setMatricNo("");
      setStudentWallet("");
      await loadStudents();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to register student";
      if (
        message.includes("user rejected") ||
        message.includes("User denied") ||
        message.includes("ACTION_REJECTED")
      ) {
        setError("Transaction cancelled.");
      } else {
        setError(message);
      }
    } finally {
      setIsBusy(false);
    }
  }, [address, signer, name, email, matricNo, studentWallet, loadStudents]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Register Students
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Add students by wallet address, email or matric / ID number
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleRegister();
        }}
        className="space-y-3 mb-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={studentWallet}
            onChange={(e) => setStudentWallet(e.target.value)}
            placeholder="Wallet address (0x…) — registers on-chain"
            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm font-mono text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
          />
          <input
            value={matricNo}
            onChange={(e) => setMatricNo(e.target.value)}
            placeholder="Matric / ID number"
            maxLength={32}
            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name (optional)"
            maxLength={100}
            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
          />
        </div>

        <button
          type="submit"
          disabled={isBusy}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/20 disabled:cursor-not-allowed"
        >
          {isBusy ? "Registering..." : "Register Student"}
        </button>
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          With a wallet address: an on-chain tx registers the student (only
          registered students can mark). Without a wallet: a pending record is
          created — the student links their wallet later.
        </p>
      </form>

      {notice && (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 mb-4">
          {notice}
        </p>
      )}
      {error && (
        <p className="text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {students.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No registered students yet.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-6">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 pb-3">Student</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 pb-3">Matric</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 pb-3">Wallet</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 pb-3">Status</th>
                <th className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 pb-3">Attended</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-6 py-3.5">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {student.name ?? "No name"}
                    </span>
                    {student.email && (
                      <span className="block text-xs text-gray-400 dark:text-gray-500">
                        {student.email}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                      {student.matricNo ?? "—"}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    {student.wallet ? (
                      <code className="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded-md">
                        {shortenHex(student.wallet)}
                      </code>
                    ) : (
                      <span className="text-xs text-gray-400 italic">
                        Not linked
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5">
                    {student.isRegistered ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        Registered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                        Pending wallet link
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {student.attendanceCount}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
