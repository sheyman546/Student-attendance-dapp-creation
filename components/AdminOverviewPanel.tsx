"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { signAdminRequest, toQuery } from "@/lib/client";

interface OverviewStats {
  totalStudents: number;
  totalCourses: number;
  openSessions: number;
  todayRecords: number;
  totalRecords: number;
}

export default function AdminOverviewPanel() {
  const { address, signer } = useWallet();
  const [stats, setStats] = useState<OverviewStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const signed =
          address && signer ? await signAdminRequest(signer, address) : {};
        const [attendanceRes, studentsRes, coursesRes, sessionsRes] =
          await Promise.all([
            fetch(`/api/admin/attendance${toQuery({ ...signed, pageSize: 1 })}`),
            fetch(`/api/admin/students${toQuery(signed)}`),
            fetch(`/api/admin/courses${toQuery(signed)}`),
            fetch(`/api/admin/sessions${toQuery(signed)}`),
          ]);
        const attendance = await attendanceRes.json();
        const students = await studentsRes.json();
        const courses = await coursesRes.json();
        const sessions = await sessionsRes.json();

        if (cancelled) return;
        setStats({
          totalStudents:
            Array.isArray(students.students) ? students.students.length : 0,
          totalCourses:
            Array.isArray(courses.courses) ? courses.courses.length : 0,
          openSessions: Array.isArray(sessions.sessions)
            ? sessions.sessions.filter((s: { closed: boolean }) => !s.closed)
                .length
            : 0,
          todayRecords: attendance.stats?.todayRecords ?? 0,
          totalRecords: attendance.stats?.totalRecords ?? 0,
        });
      } catch {
        if (!cancelled) setStats(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [address, signer]);

  const cards = stats
    ? [
        { label: "Registered Students", value: stats.totalStudents, gradient: "from-blue-500 to-cyan-500" },
        { label: "Courses", value: stats.totalCourses, gradient: "from-fuchsia-600 to-purple-600" },
        { label: "Open Sessions", value: stats.openSessions, gradient: "from-emerald-500 to-green-500" },
        { label: "Marks Today", value: stats.todayRecords, gradient: "from-amber-500 to-orange-500" },
      ]
    : [];

  if (!stats) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 animate-pulse">
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`group relative bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}
        >
          <div
            className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.gradient} rounded-t-2xl`}
          />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {card.label}
          </p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
            {card.value}
          </p>
          <div
            className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${card.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300 pointer-events-none`}
          />
        </div>
      ))}
    </div>
  );
}
