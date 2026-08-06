"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useTeacherStatus } from "@/hooks/useTeacherStatus";
import { signAdminRequest, toQuery } from "@/lib/client";
import TeacherLoginCard from "@/components/TeacherLoginCard";
import AdminOverviewPanel from "@/components/AdminOverviewPanel";
import AdminCoursesPanel from "@/components/AdminCoursesPanel";
import AdminSessionsPanel from "@/components/AdminSessionsPanel";
import AdminStudentsPanel from "@/components/AdminStudentsPanel";
import AdminTeachersPanel from "@/components/AdminTeachersPanel";
import AdminAttendancePanel from "@/components/AdminAttendancePanel";
import type { CourseSummary } from "@/types/attendance";

type TabKey = "overview" | "courses" | "sessions" | "students" | "teachers" | "attendance";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" },
  { key: "courses", label: "Courses", icon: "M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" },
  { key: "sessions", label: "Sessions", icon: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  { key: "students", label: "Students", icon: "M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" },
  { key: "teachers", label: "Teachers", icon: "M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" },
  { key: "attendance", label: "Attendance", icon: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" },
];

export default function AdminPage() {
  const { address, signer } = useWallet();
  const { status, isLoading, canAccess, refresh } = useTeacherStatus();
  const [tab, setTab] = useState<TabKey>("overview");
  const [courses, setCourses] = useState<CourseSummary[]>([]);

  const loadCourses = useCallback(async () => {
    try {
      const signed = address && signer ? await signAdminRequest(signer, address) : {};
      const res = await fetch(`/api/admin/courses${toQuery(signed)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load courses");
      setCourses(Array.isArray(data.courses) ? data.courses : []);
    } catch {
      setCourses([]);
    }
  }, [address, signer]);

  useEffect(() => {
    if (canAccess) void loadCourses();
  }, [canAccess, loadCourses]);

  const showLogin = !canAccess && !isLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-violet-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-indigo-950">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1 mb-4">
                <div className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse" />
                <span className="text-xs font-medium text-violet-100">
                  Teacher / Admin Portal
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Manage Attendance
              </h1>
              <p className="mt-2 text-violet-100 text-sm sm:text-base max-w-xl">
                Register students, create courses and open attendance sessions
                with enforceable on-chain rules.
              </p>
            </div>
            {canAccess && (
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2.5 self-start sm:self-auto">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-white/90">
                  {status?.teacherEmail ??
                    (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Teacher")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 pb-12">
        {isLoading ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
            <div className="animate-pulse space-y-4">
              <div className="h-6 w-48 mx-auto bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-10 w-64 mx-auto bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          </div>
        ) : showLogin ? (
          <TeacherLoginCard teacherEmail={status?.teacherEmail ?? null} onRefresh={() => void refresh()} />
        ) : (
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-2xl p-1.5">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all duration-200 whitespace-nowrap ${
                    tab === t.key
                      ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-600/25"
                      : "text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-gray-700"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
                  </svg>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Content */}
            {tab === "overview" && <AdminOverviewPanel />}
            {tab === "courses" && <AdminCoursesPanel />}
            {tab === "sessions" && <AdminSessionsPanel courses={courses} />}
            {tab === "students" && <AdminStudentsPanel />}
            {tab === "teachers" && (
              <AdminTeachersPanel isAdmin={status?.isAdmin ?? false} />
            )}
            {tab === "attendance" && <AdminAttendancePanel />}
          </div>
        )}
      </div>
    </div>
  );
}
