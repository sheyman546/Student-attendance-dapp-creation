import { WALLET_REGEX } from "@/lib/auth";
import { isStudentRegisteredOnChain } from "@/lib/proof";
import { toAttendanceJson, toSessionJson } from "@/lib/attendance";
import type {
  CourseBreakdown,
  StudentOverview,
} from "@/types/attendance";

/**
 * Everything the student portal needs in one call: on-chain registration
 * status, the sessions they can (or will be able to) mark, their full
 * history with per-course breakdown, and headline totals.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet")?.toLowerCase() ?? "";

  if (!WALLET_REGEX.test(wallet)) {
    return Response.json(
      { error: "A valid wallet address is required" },
      { status: 400 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    const user = await prisma.user.findUnique({ where: { wallet } });
    const onChainRegistered = await isStudentRegisteredOnChain(wallet);
    const registered = onChainRegistered ?? user?.isRegistered ?? false;

    const now = new Date();

    const [openSessions, history] = await Promise.all([
      prisma.session.findMany({
        where: { closed: false },
        include: { course: true },
        orderBy: { startTime: "asc" },
      }),
      prisma.attendance.findMany({
        where: { wallet },
        include: { session: { include: { course: true } } },
        orderBy: { date: "desc" },
      }),
    ]);

    // Which open sessions has this student already marked (and with which tx)?
    const openSessionIds = openSessions.map((s) => s.id);
    const myMarks = openSessionIds.length
      ? await prisma.attendance.findMany({
          where: { wallet, sessionId: { in: openSessionIds } },
          select: { sessionId: true, txHash: true },
        })
      : [];
    const markBySession = new Map(
      myMarks.map((m) => [m.sessionId, m.txHash])
    );

    const activeSessions = openSessions
      .filter(
        (s) =>
          now.getTime() >= s.startTime.getTime() &&
          now.getTime() <=
            s.startTime.getTime() + s.durationSeconds * 1000
      )
      .map((s) =>
        toSessionJson(s, {
          markedByMe: markBySession.has(s.id),
          myTxHash: markBySession.get(s.id) ?? null,
        })
      );

    const upcomingSessions = openSessions
      .filter((s) => now.getTime() < s.startTime.getTime())
      .map((s) => toSessionJson(s));

    // Per-course breakdown from the student's history.
    const byCourse = new Map<
      string,
      { courseCode: string; courseName: string; attended: number }
    >();
    for (const record of history) {
      const code = record.session?.course?.code ?? "Unknown";
      const name = record.session?.course?.name ?? code;
      const entry = byCourse.get(code) ?? {
        courseCode: code,
        courseName: name,
        attended: 0,
      };
      entry.attended += 1;
      byCourse.set(code, entry);
    }
    const breakdown: CourseBreakdown[] = [...byCourse.values()];

    // Attendance rate vs sessions that have already started (past + current).
    const startedSessions = await prisma.session.count({
      where: { startTime: { lte: now } },
    });
    const attended = history.length;
    const attendanceRate =
      startedSessions > 0
        ? Math.round((attended / startedSessions) * 100)
        : 0;

    const overview: StudentOverview = {
      registered,
      profile: user
        ? {
            name: user.name ?? null,
            email: user.email ?? null,
            matricNo: user.matricNo ?? null,
          }
        : null,
      activeSessions,
      upcomingSessions,
      history: history.map(toAttendanceJson),
      breakdown,
      totals: { attended, attendanceRate },
    };

    return Response.json(overview);
  } catch (error) {
    console.error("Failed to load student overview:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}
