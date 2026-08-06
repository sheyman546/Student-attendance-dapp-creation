"use client";

import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";
import { getProofContract, shortenHex } from "@/lib/contract";
import { signAdminRequest, toQuery } from "@/lib/client";
import type { AdminStudentRecord } from "@/types/attendance";

export default function AdminTeachersPanel({ isAdmin }: { isAdmin: boolean }) {
  const { address, signer } = useWallet();
  const [teachers, setTeachers] = useState<AdminStudentRecord[]>([]);
  const [teacherWallet, setTeacherWallet] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadTeachers = useCallback(async () => {
    try {
      const signed = address && signer ? await signAdminRequest(signer, address) : {};
      const res = await fetch(`/api/admin/teachers${toQuery(signed)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load teachers");
      setTeachers(Array.isArray(data.teachers) ? data.teachers : []);
    } catch {
      setTeachers([]);
    }
  }, [address, signer]);

  useEffect(() => {
    void loadTeachers();
  }, [loadTeachers]);

  const runTeacherTx = useCallback(
    async (
      action: (contract: ethers.Contract) => Promise<ethers.TransactionResponse>,
      body: Record<string, string>,
      successMessage: string
    ) => {
      if (!address || !signer) return;
      setIsBusy(true);
      setError(null);
      setNotice(null);
      try {
        const contract = await getProofContract();
        const tx = await action(contract);
        const receipt = await tx.wait();

        const signed = await signAdminRequest(signer, address);
        const res = await fetch("/api/admin/teachers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...signed,
            ...body,
            txHash: receipt?.hash ?? tx.hash,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to update teacher");

        setNotice(successMessage);
        setTeacherWallet("");
        setEmail("");
        setName("");
        await loadTeachers();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Transaction failed";
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
    },
    [address, signer, loadTeachers]
  );

  const handleAuthorize = useCallback(() => {
    if (!address || !signer) {
      setError("Connect your wallet to authorize teachers");
      return;
    }
    if (!teacherWallet.trim()) {
      setError("Enter the teacher's wallet address");
      return;
    }
    void runTeacherTx(
      (contract) => contract.authorizeMarker(teacherWallet.trim()),
      { teacherWallet: teacherWallet.trim(), email: email.trim(), name: name.trim() },
      `Teacher authorized — they can now open sessions and register students.`
    );
  }, [address, signer, teacherWallet, email, name, runTeacherTx]);

  const handleRevoke = useCallback(
    (teacher: AdminStudentRecord) => {
      if (!address || !signer) {
        setError("Connect your wallet to revoke teachers");
        return;
      }
      if (!teacher.wallet) return;
      void runTeacherTx(
        (contract) => contract.revokeMarker(teacher.wallet as string),
        { teacherWallet: teacher.wallet, revoke: "true" },
        `Teacher ${shortenHex(teacher.wallet)} revoked.`
      );
    },
    [address, signer, runTeacherTx]
  );

  if (!isAdmin) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Manage Teachers
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Only the admin (contract owner) can authorize teachers. Contact the
          admin to grant teacher access.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-teal-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Manage Teachers
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Grant the teacher role on-chain and pair it with a Google email for
            Gmail login
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          value={teacherWallet}
          onChange={(e) => setTeacherWallet(e.target.value)}
          placeholder="Teacher wallet (0x…)"
          className="sm:flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm font-mono text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Google email (for Gmail login)"
          className="sm:flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="sm:w-44 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
        />
        <button
          onClick={handleAuthorize}
          disabled={isBusy}
          className="shrink-0 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 disabled:from-gray-400 disabled:to-gray-400 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-cyan-600/20 disabled:cursor-not-allowed"
        >
          {isBusy ? "Authorizing..." : "Authorize"}
        </button>
      </div>

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

      {teachers.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
          No teachers authorized yet. Only the contract owner can authorize
          teachers.
        </p>
      ) : (
        <ul className="space-y-2">
          {teachers.map((teacher) => (
            <li
              key={teacher.id}
              className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {teacher.name ?? teacher.email ?? "Teacher"}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  {teacher.wallet && (
                    <code className="text-xs font-mono text-gray-500 dark:text-gray-400">
                      {shortenHex(teacher.wallet)}
                    </code>
                  )}
                  {teacher.email && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {teacher.email}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleRevoke(teacher)}
                disabled={isBusy}
                className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
