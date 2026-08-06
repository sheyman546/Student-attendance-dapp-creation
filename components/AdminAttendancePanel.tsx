"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@/hooks/useWallet";
import { signAdminRequest, toQuery } from "@/lib/client";
import AdminAttendanceTable, {
  type AdminPagination,
} from "@/components/AdminAttendanceTable";
import type { AdminAttendanceRecord } from "@/types/attendance";

interface AdminStats {
  totalStudents: number;
  totalRecords: number;
  todayRecords: number;
}

const EMPTY_STATS: AdminStats = {
  totalStudents: 0,
  totalRecords: 0,
  todayRecords: 0,
};

const PAGE_SIZE = 10;

export default function AdminAttendancePanel() {
  const { address, signer } = useWallet();
  const [records, setRecords] = useState<AdminAttendanceRecord[]>([]);
  const [stats, setStats] = useState<AdminStats>(EMPTY_STATS);
  const [pagination, setPagination] = useState<AdminPagination | null>(null);
  const [page, setPage] = useState(1);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const loadData = useCallback(
    async (targetPage?: number) => {
      const hasAuth = address && signer;
      if (!hasAuth) {
        setRecords([]);
        setStats(EMPTY_STATS);
        setPagination(null);
        setIsLoadingData(false);
        return;
      }
      setIsLoadingData(true);
      setError(null);
      try {
        const signed = await signAdminRequest(signer, address);
        const res = await fetch(
          `/api/admin/attendance${toQuery({
            ...signed,
            page: targetPage ?? page,
            pageSize: PAGE_SIZE,
          })}`
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load admin data");
        }

        setRecords(Array.isArray(data.records) ? data.records : []);
        setStats(data.stats ?? EMPTY_STATS);
        setPagination(data.pagination ?? null);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to load admin data";
        setError(message);
        setRecords([]);
        setStats(EMPTY_STATS);
        setPagination(null);
      } finally {
        setIsLoadingData(false);
      }
    },
    [address, signer, page]
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (nextPage < 1) return;
      setPage(nextPage);
      void loadData(nextPage);
    },
    [loadData]
  );

  const handleExport = useCallback(async () => {
    if (!address || !signer) return;
    setIsExporting(true);
    try {
      const signed = await signAdminRequest(signer, address);
      const res = await fetch(`/api/admin/attendance/export${toQuery(signed)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to export attendance");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to export attendance";
      setError(message);
    } finally {
      setIsExporting(false);
    }
  }, [address, signer]);

  const handleRetryAttestations = useCallback(async () => {
    if (!address || !signer) return;
    setIsRetrying(true);
    setRetryResult(null);
    try {
      const signed = await signAdminRequest(signer, address);
      const res = await fetch("/api/admin/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signed),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to retry attestations");
      }

      setRetryResult(
        `Attested ${data.attested} of ${data.pending} pending record(s)` +
          (data.failed.length > 0 ? `; ${data.failed.length} still failed` : "")
      );
      await loadData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to retry attestations";
      setRetryResult(`Error: ${message}`);
    } finally {
      setIsRetrying(false);
    }
  }, [address, signer, loadData]);

  const statCards = [
    {
      label: "Total Students",
      value: stats.totalStudents,
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      label: "Total Records",
      value: stats.totalRecords,
      gradient: "from-violet-500 to-purple-500",
    },
    {
      label: "Marked Today",
      value: stats.todayRecords,
      gradient: "from-emerald-500 to-green-500",
    },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            {error}
          </p>
        </div>
      )}

      {!address && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Connect your wallet to view all attendance records and export them.
          </p>
        </div>
      )}

      {/* Attestation retry / backfill */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Retry pending attestations
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Re-attempts on-chain attestation for every pending legacy record.
          </p>
          {retryResult && (
            <p className="text-xs mt-1 text-blue-600 dark:text-blue-400">
              {retryResult}
            </p>
          )}
        </div>
        <button
          onClick={handleRetryAttestations}
          disabled={isRetrying || !address}
          className="self-start sm:self-auto shrink-0 inline-flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 disabled:from-gray-400 disabled:to-gray-400 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-cyan-600/20 disabled:cursor-not-allowed"
        >
          {isRetrying ? "Retrying..." : "Retry Pending"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="relative bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
          >
            <div
              className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${stat.gradient} rounded-t-2xl`}
            />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {stat.label}
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <AdminAttendanceTable
        records={records}
        isLoading={isLoadingData}
        pagination={pagination ?? undefined}
        onPageChange={handlePageChange}
        onExport={handleExport}
        isExporting={isExporting}
      />
    </div>
  );
}
