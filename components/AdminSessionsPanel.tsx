"use client";

import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";
import { getProofContract, readEventFromReceipt, shortenHex } from "@/lib/contract";
import { signAdminRequest, toQuery } from "@/lib/client";
import type { CourseSummary, SessionInfo } from "@/types/attendance";

interface SessionWithRecords extends SessionInfo {
  attendanceCount: number;
  records?: Array<{
    id: string;
    wallet: string;
    studentName: string | null;
    studentEmail: string | null;
    matricNo: string | null;
    date: string;
    status: string;
  }>;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminSessionsPanel({
  courses,
}: {
  courses: CourseSummary[];
}) {
  const { address, signer } = useWallet();
  const [sessions, setSessions] = useState<SessionWithRecords[]>([]);
  const [courseId, setCourseId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [isBusy, setIsBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedRecords, setExpandedRecords] = useState<
    NonNullable<SessionWithRecords["records"]> | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const signed = address && signer ? await signAdminRequest(signer, address) : {};
      const res = await fetch(`/api/admin/sessions${toQuery(signed)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load sessions");
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      setSessions([]);
    }
  }, [address, signer]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const loadRecords = useCallback(
    async (sessionId: string) => {
      try {
        const signed = address && signer ? await signAdminRequest(signer, address) : {};
        const res = await fetch(
          `/api/admin/sessions${toQuery({ ...signed, sessionId })}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load records");
        setExpandedRecords(Array.isArray(data.records) ? data.records : []);
      } catch {
        setExpandedRecords([]);
      }
    },
    [address, signer]
  );

  const toggleExpand = useCallback(
    (sessionId: string) => {
      if (expanded === sessionId) {
        setExpanded(null);
        setExpandedRecords(null);
      } else {
        setExpanded(sessionId);
        setExpandedRecords(null);
        void loadRecords(sessionId);
      }
    },
    [expanded, loadRecords]
  );

  const runTx = useCallback(
    async (
      action: (
        contract: ethers.Contract
      ) => Promise<ethers.TransactionResponse>,
      after: (receipt: ethers.TransactionReceipt, txHash: string) => Promise<void>
    ) => {
      setIsBusy(true);
      setError(null);
      setNotice(null);
      try {
        const contract = await getProofContract();
        const tx = await action(contract);
        const receipt = (await tx.wait()) as ethers.TransactionReceipt;
        await after(receipt, receipt.hash);
        await loadSessions();
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
    [loadSessions]
  );

  const handleOpen = useCallback(() => {
    if (!address || !signer) {
      setError("Connect your wallet to open a session");
      return;
    }
    const course = courses.find((c) => c.id === courseId);
    if (!course) {
      setError("Select a course first");
      return;
    }
    if (course.onChainId == null) {
      setError("This course has no on-chain id — recreate it with the wallet connected");
      return;
    }
    if (!startTime) {
      setError("Set the attendance start time");
      return;
    }
    const duration = Math.floor(Number(durationMinutes) * 60);
    if (!Number.isFinite(duration) || duration <= 0) {
      setError("Set a valid attendance duration");
      return;
    }
    const startUnix = Math.floor(new Date(startTime).getTime() / 1000);

    void runTx(
      (contract) => contract.openSession(course.onChainId, startUnix, duration),
      async (receipt, txHash) => {
        const event = readEventFromReceipt(receipt ?? { logs: [] }, "SessionOpened");
        const onChainId = event?.sessionId != null ? Number(event.sessionId) : NaN;
        const signed = await signAdminRequest(signer as NonNullable<typeof signer>, address as string);
        const res = await fetch("/api/admin/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...signed,
            action: "open",
            courseCode: course.code,
            startTime: new Date(startUnix * 1000).toISOString(),
            durationSeconds: duration,
            onChainId: String(onChainId),
            txHash,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to open session");
        setNotice(
          `Session opened for ${course.code} — closes in ${durationMinutes}m`
        );
        setStartTime("");
      }
    );
  }, [courseId, courses, startTime, durationMinutes, runTx, signer, address]);

  const handleClose = useCallback(
    (session: SessionWithRecords) => {
      if (!address || !signer) {
        setError("Connect your wallet to close a session");
        return;
      }
      if (session.onChainId == null) {
        setError("This session has no on-chain id");
        return;
      }
      void runTx(
        (contract) => contract.closeSession(session.onChainId as number),
        async (receipt, txHash) => {
          const signed = await signAdminRequest(signer as NonNullable<typeof signer>, address as string);
          const res = await fetch("/api/admin/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...signed,
              action: "close",
              sessionId: session.id,
              txHash,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "Failed to close session");
          setNotice(`Session closed — ${session.courseCode} is no longer claimable`);
        }
      );
    },
    [runTx, signer, address]
  );

  return (
    <div className="space-y-6">
      {/* Open session form */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-600 to-teal-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-cyan-600/20">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Open an Attendance Session
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              The start time and duration map directly to the contract&apos;s{" "}
              <code className="font-mono text-cyan-600 dark:text-cyan-400">openSession(courseId, startTime, duration)</code>{" "}
              parameters. Sessions auto-expire when the duration elapses.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Course
            </label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
            >
              <option value="">Select a course…</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} — {course.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Set time for attendance (start)
            </label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Set attendance duration (minutes)
            </label>
            <input
              type="number"
              min={1}
              max={10080}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
            />
          </div>
        </div>

        <button
          onClick={handleOpen}
          disabled={isBusy}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 disabled:from-gray-400 disabled:to-gray-400 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-cyan-600/20 disabled:cursor-not-allowed"
        >
          {isBusy ? "Sending transaction..." : "Open Session"}
        </button>

        {notice && (
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 mt-4">
            {notice}
          </p>
        )}
        {error && (
          <p className="text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mt-4">
            {error}
          </p>
        )}
      </div>

      {/* Sessions list */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Sessions
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Every session, its status, and who marked attendance
        </p>

        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
            No sessions yet — open your first one above.
          </p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-50 dark:bg-gray-900 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      <span className="font-mono text-cyan-600 dark:text-cyan-400 mr-2">
                        {session.courseCode}
                      </span>
                      {session.courseName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {formatTime(session.startTime)} ·{" "}
                      {Math.round(session.durationSeconds / 60)} min
                      {session.onChainId != null && (
                        <span className="ml-2 font-mono">
                          on-chain #{session.onChainId}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {session.closed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                        Closed
                      </span>
                    ) : session.ended ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                        Expired
                      </span>
                    ) : session.hasStarted ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        Open
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                        Scheduled
                      </span>
                    )}

                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                      {session.attendanceCount} marked
                    </span>

                    {!session.closed && (
                      <button
                        onClick={() => handleClose(session)}
                        disabled={isBusy}
                        className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Close early
                      </button>
                    )}

                    <button
                      onClick={() => toggleExpand(session.id)}
                      className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {expanded === session.id ? "Hide" : "Records"}
                    </button>
                  </div>
                </div>

                {expanded === session.id && (
                  <div className="px-4 py-4 border-t border-gray-100 dark:border-gray-700">
                    {expandedRecords === null ? (
                      <p className="text-xs text-gray-400 animate-pulse">
                        Loading records…
                      </p>
                    ) : expandedRecords.length === 0 ? (
                      <p className="text-xs text-gray-400">
                        No students have marked this session yet.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-700">
                              <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-2 pr-4">Student</th>
                              <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-2 pr-4">Matric</th>
                              <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-2 pr-4">Wallet</th>
                              <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-2 pr-4">Marked At</th>
                              <th className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-2">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {expandedRecords.map((record) => (
                              <tr key={record.id}>
                                <td className="py-2.5 pr-4">
                                  <span className="text-sm text-gray-900 dark:text-white">
                                    {record.studentName ?? "No profile set"}
                                  </span>
                                </td>
                                <td className="py-2.5 pr-4">
                                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                                    {record.matricNo ?? "—"}
                                  </span>
                                </td>
                                <td className="py-2.5 pr-4">
                                  <code className="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded-md">
                                    {shortenHex(record.wallet)}
                                  </code>
                                </td>
                                <td className="py-2.5 pr-4">
                                  <span className="text-sm text-gray-600 dark:text-gray-300">
                                    {formatTime(record.date)}
                                  </span>
                                </td>
                                <td className="py-2.5 text-right">
                                  <span
                                    className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                                      record.status === "confirmed"
                                        ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30"
                                        : "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30"
                                    }`}
                                  >
                                    {record.status === "confirmed" ? "Confirmed" : "Pending"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
