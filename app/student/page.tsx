"use client";

import { useEffect, useRef } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";
import { useStudentOverview } from "@/hooks/useStudentOverview";
import ProtectedRoute from "@/components/ProtectedRoute";
import RegistrationStatusCard from "@/components/RegistrationStatusCard";
import ActiveSessionsPanel from "@/components/ActiveSessionsPanel";
import CourseBreakdownPanel from "@/components/CourseBreakdownPanel";
import StudentHistoryTable from "@/components/StudentHistoryTable";
import { getProofContractReadOnly } from "@/lib/contract";
import type { SessionInfo } from "@/types/attendance";

function StatCard({
  label,
  value,
  gradient,
}: {
  label: string;
  value: string | number;
  gradient: string;
}) {
  return (
    <div className="group relative bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient} rounded-t-2xl`} />
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300 pointer-events-none`} />
      <div className={`absolute -bottom-px left-0 right-0 h-1 bg-gradient-to-r ${gradient} rounded-b-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
      <div className={`absolute top-4 right-4 w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} opacity-10 group-hover:opacity-20 transition-opacity`} />
    </div>
  );
}

export default function StudentPage() {
  const { address } = useWallet();
  const { overview, isLoading, error, refresh } = useStudentOverview(address);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  // Listen for AttendanceMarked events for this wallet in real time so the
  // portal updates the moment an attendance tx lands, instead of polling.
  useEffect(() => {
    if (!address) return;
    let contract: ethers.Contract | null = null;
    let cancelled = false;

    const subscribe = async () => {
      try {
        contract = await getProofContractReadOnly();
        const onMarked = (...args: unknown[]) => {
          const student = args[1] as string;
          if (student && student.toLowerCase() === address.toLowerCase()) {
            if (!cancelled) void refreshRef.current();
          }
        };
        contract.on("AttendanceMarked", onMarked);
      } catch {
        // Contract not configured / no wallet — the portal works without
        // real-time events.
      }
    };

    void subscribe();
    return () => {
      cancelled = true;
      try {
        contract?.removeAllListeners("AttendanceMarked");
      } catch {
        // ignore
      }
    };
  }, [address]);

  const active = overview?.activeSessions ?? [];
  const upcoming = overview?.upcomingSessions ?? [];

  const { breakdown = [], history = [], totals = { attended: 0, attendanceRate: 0 } } =
    overview ?? {};

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-emerald-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-white/[0.02] rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1 mb-4">
                  <div className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse" />
                  <span className="text-xs font-medium text-emerald-100">
                    Student Portal
                  </span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                  My Attendance
                </h1>
                <p className="mt-2 text-blue-100 text-sm sm:text-base max-w-xl">
                  Mark your presence for open sessions, view your on-chain
                  transaction hashes and track your progress per course.
                </p>
              </div>

              {address && (
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2.5 self-start sm:self-auto">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-sm font-mono text-white/90">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 pb-12">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {error}
              </p>
            </div>
          )}

          {isLoading || !overview ? (
            <div className="space-y-6">
              <div className="animate-pulse">
                <div className="h-20 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 animate-pulse">
                    <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                    <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Registration status */}
              <RegistrationStatusCard
                registered={overview.registered}
                profile={overview.profile}
                onLinked={() => void refresh()}
              />

              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  label="Sessions Attended"
                  value={totals.attended}
                  gradient="from-blue-500 to-cyan-500"
                />
                <StatCard
                  label="Attendance Rate"
                  value={`${totals.attendanceRate}%`}
                  gradient="from-emerald-500 to-green-500"
                />
                <StatCard
                  label="Courses"
                  value={breakdown.length}
                  gradient="from-violet-500 to-purple-500"
                />
              </div>

              {/* Mark attendance */}
              <ActiveSessionsPanel
                sessions={active}
                onMarked={() => void refresh()}
              />

              {upcoming.length > 0 && (
                <ActiveSessionsPanel
                  sessions={upcoming as SessionInfo[]}
                  title="Upcoming Sessions"
                  emptyMessage=""
                  onMarked={() => void refresh()}
                />
              )}

              {/* Breakdown + history */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1">
                  <CourseBreakdownPanel breakdown={breakdown} />
                </div>
                <div className="lg:col-span-2">
                  <StudentHistoryTable records={history} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
