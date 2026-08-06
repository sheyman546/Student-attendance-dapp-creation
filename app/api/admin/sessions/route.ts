import { authorizeAdminOrTeacher } from "@/lib/auth";
import { getSessionOnChain } from "@/lib/proof";
import { toAttendanceJson, toSessionJson } from "@/lib/attendance";
import type { SessionInfo } from "@/types/attendance";

const DURATION_MAX_SECONDS = 7 * 24 * 3600; // one week

/** Lists sessions, optionally with the attendance records of one session. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const auth = await authorizeAdminOrTeacher(request, {
    wallet: searchParams.get("wallet") ?? undefined,
    message: searchParams.get("message") ?? undefined,
    signature: searchParams.get("signature") ?? undefined,
  });
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const sessionId = searchParams.get("sessionId") ?? "";

  try {
    const { prisma } = await import("@/lib/prisma");

    // Detailed view: a single session + every attendance record in it.
    if (sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          course: true,
          attendance: {
            include: { user: { select: { name: true, email: true, matricNo: true } } },
            orderBy: { date: "asc" },
          },
        },
      });
      if (!session) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }

      const info = toSessionJson(session, {
        attendanceCount: session.attendance.length,
      });
      const records = session.attendance.map((record) => ({
        ...toAttendanceJson(record),
        wallet: record.wallet,
        studentName: record.user?.name ?? null,
        studentEmail: record.user?.email ?? null,
        matricNo: record.user?.matricNo ?? null,
      }));

      return Response.json({ session: info, records });
    }

    // List view: all sessions with counts.
    const sessions = await prisma.session.findMany({
      include: {
        course: true,
        _count: { select: { attendance: true } },
      },
      orderBy: { startTime: "desc" },
    });

    const list: (SessionInfo & { attendanceCount: number })[] = sessions.map(
      (s) => ({
        ...toSessionJson(s, { attendanceCount: s._count.attendance }),
        attendanceCount: s._count.attendance,
      })
    );

    return Response.json({ sessions: list });
  } catch (error) {
    console.error("Failed to list sessions:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}

/**
 * Opens or closes a session. The admin/teacher sends the contract tx from
 * their browser wallet first (openSession / closeSession) and this route
 * mirrors the resulting on-chain state into the database.
 *
 * Open:  { action: "open",  courseCode, startTime, durationSeconds,
 *          onChainId, txHash }
 * Close: { action: "close", sessionId, txHash }
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const auth = await authorizeAdminOrTeacher(request, {
    wallet: typeof body.wallet === "string" ? body.wallet : undefined,
    message: typeof body.message === "string" ? body.message : undefined,
    signature: typeof body.signature === "string" ? body.signature : undefined,
  });
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const action = typeof body.action === "string" ? body.action : "";
  if (action !== "open" && action !== "close") {
    return Response.json(
      { error: "action must be 'open' or 'close'" },
      { status: 400 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    if (action === "open") {
      const courseCode =
        typeof body.courseCode === "string"
          ? body.courseCode.trim().toUpperCase()
          : "";
      const startTimeStr = typeof body.startTime === "string" ? body.startTime : "";
      const durationSeconds =
        typeof body.durationSeconds === "number"
          ? body.durationSeconds
          : Number(body.durationSeconds);
      const txHash = typeof body.txHash === "string" ? body.txHash : "";
      const onChainId =
        typeof body.onChainId === "string" ? Number(body.onChainId) : NaN;

      const startTime = new Date(startTimeStr);
      if (Number.isNaN(startTime.getTime())) {
        return Response.json(
          { error: "A valid start time is required" },
          { status: 400 }
        );
      }
      if (
        !Number.isInteger(durationSeconds) ||
        durationSeconds <= 0 ||
        durationSeconds > DURATION_MAX_SECONDS
      ) {
        return Response.json(
          { error: "Duration must be between 1 second and 7 days" },
          { status: 400 }
        );
      }
      if (!Number.isInteger(onChainId) || onChainId <= 0) {
        return Response.json(
          { error: "The on-chain session id is required" },
          { status: 400 }
        );
      }
      if (!txHash) {
        return Response.json(
          { error: "The openSession transaction hash is required" },
          { status: 400 }
        );
      }

      const course = await prisma.course.findUnique({ where: { code: courseCode } });
      if (!course) {
        return Response.json(
          { error: "Course not found — create it first" },
          { status: 404 }
        );
      }

      // Best-effort: the session on-chain must reference this course and the
      // given start/duration.
      const onChain = await getSessionOnChain(onChainId);
      if (
        onChain &&
        (Number(onChain.courseId) !== (course.onChainId ?? 0) ||
          Number(onChain.startTime) !== Math.floor(startTime.getTime() / 1000) ||
          Number(onChain.duration) !== durationSeconds)
      ) {
        return Response.json(
          { error: "On-chain session parameters do not match" },
          { status: 400 }
        );
      }

      const session = await prisma.session.create({
        data: {
          courseId: course.id,
          onChainId,
          startTime,
          durationSeconds,
          closed: false,
        },
      });

      return Response.json({ session: toSessionJson(session) }, { status: 201 });
    }

    // Close
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const txHash = typeof body.txHash === "string" ? body.txHash : "";
    if (!sessionId) {
      return Response.json({ error: "sessionId is required" }, { status: 400 });
    }
    if (!txHash) {
      return Response.json(
        { error: "The closeSession transaction hash is required" },
        { status: 400 }
      );
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { course: true },
    });
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.closed) {
      return Response.json(
        { error: "This session is already closed" },
        { status: 409 }
      );
    }

    // Best-effort on-chain check that the session is now closed.
    if (session.onChainId != null) {
      const onChain = await getSessionOnChain(session.onChainId);
      if (onChain && onChain.exists && !onChain.closed) {
        return Response.json(
          { error: "The session is still open on-chain" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { closed: true, closedAt: new Date() },
      include: { course: true },
    });

    return Response.json({ session: toSessionJson(updated) }, { status: 200 });
  } catch (error) {
    console.error("Failed to update session:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}
