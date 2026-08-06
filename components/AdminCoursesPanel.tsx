"use client";

import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";
import { getProofContract, readEventFromReceipt, shortenHex } from "@/lib/contract";
import { signAdminRequest, toQuery } from "@/lib/client";
import type { CourseSummary } from "@/types/attendance";

export default function AdminCoursesPanel() {
  const { address, signer } = useWallet();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    try {
      // Signed params when a wallet is connected; otherwise the Google-login
      // session cookie authorizes the request.
      const signed = address && signer ? await signAdminRequest(signer, address) : {};
      const res = await fetch(
        `/api/admin/courses${toQuery(signed)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load courses");
      setCourses(Array.isArray(data.courses) ? data.courses : []);
    } catch {
      setCourses([]);
    }
  }, [address, signer]);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  const handleCreate = useCallback(async () => {
    if (!code.trim() || !name.trim()) return;
    if (!address || !signer) {
      setError("Connect your wallet to send this transaction");
      return;
    }
    setIsCreating(true);
    setError(null);
    setNotice(null);
    try {
      // 1. Create the course on-chain (admin/teacher wallet pays).
      const contract = await getProofContract();
      const tx: ethers.TransactionResponse = await contract.createCourse(
        code.trim().toUpperCase(),
        name.trim()
      );
      const receipt = await tx.wait();
      const event = readEventFromReceipt(receipt ?? { logs: [] }, "CourseCreated");
      const onChainId = event?.courseId != null ? Number(event.courseId) : NaN;

      // 2. Mirror into the database.
      const signed = await signAdminRequest(signer, address);
      const res = await fetch("/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...signed,
          code: code.trim().toUpperCase(),
          name: name.trim(),
          onChainId: String(onChainId),
          txHash: receipt?.hash ?? tx.hash,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create course");

      setNotice(
        `Course ${(data.course as { code: string }).code} created on-chain (tx ${shortenHex(
          receipt?.hash ?? tx.hash
        )})`
      );
      setCode("");
      setName("");
      await loadCourses();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create course";
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
      setIsCreating(false);
    }
  }, [address, signer, code, name, loadCourses]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-fuchsia-600 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-fuchsia-600/20">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Courses
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Create course titles — each is recorded on-chain
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleCreate();
        }}
        className="flex flex-col sm:flex-row gap-2 mb-6"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Course code (e.g. CS101)"
          maxLength={16}
          className="sm:w-40 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Course title (e.g. Blockchain Basics)"
          maxLength={64}
          className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
        />
        <button
          type="submit"
          disabled={isCreating || !code.trim() || !name.trim()}
          className="shrink-0 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-fuchsia-600/20 disabled:cursor-not-allowed"
        >
          {isCreating ? "Creating..." : "Create Course"}
        </button>
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

      {courses.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No courses yet — create your first course above.
        </p>
      ) : (
        <ul className="space-y-2">
          {courses.map((course) => (
            <li
              key={course.id}
              className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  <span className="font-mono text-fuchsia-600 dark:text-fuchsia-400 mr-2">
                    {course.code}
                  </span>
                  {course.name}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {course.sessionCount ?? 0} session
                  {(course.sessionCount ?? 0) === 1 ? "" : "s"}
                  {course.onChainId != null && (
                    <span className="ml-2 font-mono">
                      on-chain #{course.onChainId}
                    </span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
