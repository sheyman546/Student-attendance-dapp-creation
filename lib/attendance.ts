import type { AttendanceRecord } from "@/types/attendance";

/**
 * Serializes an attendance record (optionally with its session + course
 * relations) into the JSON shape consumed by the frontend.
 */
export function toAttendanceJson(record: {
  id: string;
  date: Date;
  txHash?: string | null;
  hashProof: string | null;
  session?: {
    id: string;
    startTime: Date;
    course?: { code: string; name: string } | null;
  } | null;
}): AttendanceRecord {
  return {
    id: record.id,
    date: record.date.toISOString(),
    txHash: record.txHash ?? null,
    hashProof: record.hashProof,
    courseCode: record.session?.course?.code ?? null,
    courseName: record.session?.course?.name ?? null,
    sessionId: record.session?.id ?? null,
    status: record.hashProof ? "confirmed" : "pending",
  };
}

/** Serializes a session (with its course) into a SessionInfo JSON shape. */
export function toSessionJson(
  session: {
    id: string;
    onChainId: number | null;
    startTime: Date;
    durationSeconds: number;
    closed: boolean;
    course?: { code: string; name: string } | null;
  },
  opts: {
    markedByMe?: boolean;
    myTxHash?: string | null;
    attendanceCount?: number;
    now?: Date;
  } = {}
): import("@/types/attendance").SessionInfo {
  const nowMs = (opts.now ?? new Date()).getTime();
  const startMs = session.startTime.getTime();
  const endMs = startMs + session.durationSeconds * 1000;
  const hasStarted = nowMs >= startMs;
  const ended = nowMs > endMs;

  return {
    id: session.id,
    courseCode: session.course?.code ?? "—",
    courseName: session.course?.name ?? "—",
    startTime: session.startTime.toISOString(),
    durationSeconds: session.durationSeconds,
    closed: session.closed,
    isActive: !session.closed && hasStarted && !ended,
    hasStarted,
    ended,
    markedByMe: opts.markedByMe ?? false,
    myTxHash: opts.myTxHash ?? null,
    attendanceCount: opts.attendanceCount,
    onChainId: session.onChainId,
  };
}
