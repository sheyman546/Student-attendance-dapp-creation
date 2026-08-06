"use client";

import type { CourseBreakdown } from "@/types/attendance";

interface CourseBreakdownPanelProps {
  breakdown: CourseBreakdown[];
  isLoading?: boolean;
}

export default function CourseBreakdownPanel({
  breakdown,
  isLoading = false,
}: CourseBreakdownPanelProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-8 w-full bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-8 w-full bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  const max = Math.max(1, ...breakdown.map((b) => b.attended));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Per-Course Breakdown
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            How many sessions you attended in each course
          </p>
        </div>
        <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-teal-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
        </div>
      </div>

      {breakdown.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No attendance recorded yet — once you mark sessions, your per-course
          progress appears here.
        </p>
      ) : (
        <ul className="space-y-5">
          {breakdown.map((course) => (
            <li key={course.courseCode}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  <span className="font-mono text-blue-600 dark:text-blue-400 mr-2">
                    {course.courseCode}
                  </span>
                  {course.courseName}
                </span>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {course.attended} session{course.attended === 1 ? "" : "s"}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-teal-500 h-2 rounded-full transition-all duration-700"
                  style={{ width: `${Math.max(4, (course.attended / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
