import { verifySignedRequest, WALLET_REGEX } from "@/lib/auth";
import { verifyMarkOnChain } from "@/lib/proof";
import { toAttendanceJson } from "@/lib/attendance";
import { attendanceLimiter } from "@/lib/rateLimit";

const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

/** True when `error` is a Prisma P2002 (unique constraint violation). */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

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
    const records = await prisma.attendance.findMany({
      where: { wallet },
      include: { session: { include: { course: true } } },
      orderBy: { date: "desc" },
    });
    return Response.json(records.map(toAttendanceJson));
  } catch (error) {
    console.error("Failed to fetch attendance:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}

/**
 * Indexes a student's on-chain markAttendance transaction.
 *
 * The student sends markAttendance(sessionId) from their own wallet (all
 * safeguards — registered student, open window, no double-marking — are
 * enforced by the contract). This endpoint records the resulting tx so the
 * dashboards can show history, per-course breakdowns and the tx hash.
 */
export async function POST(request: Request) {
  let body: {
    wallet?: unknown;
    message?: unknown;
    signature?: unknown;
    sessionId?: unknown;
    txHash?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const wallet = typeof body.wallet === "string" ? body.wallet.toLowerCase() : "";
  const message = typeof body.message === "string" ? body.message : "";
  const signature = typeof body.signature === "string" ? body.signature : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const txHash = typeof body.txHash === "string" ? body.txHash : "";

  // Prove the requester owns the wallet and the request is fresh
  const check = verifySignedRequest(wallet, message, signature, "Attendance request");
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: check.status });
  }

  if (!sessionId) {
    return Response.json({ error: "A session is required" }, { status: 400 });
  }
  if (!TX_HASH_REGEX.test(txHash)) {
    return Response.json(
      { error: "A valid transaction hash is required" },
      { status: 400 }
    );
  }

  // Per-wallet rate limit (applied AFTER signature verification).
  if (!attendanceLimiter.check(wallet)) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { course: true },
    });
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const now = new Date();

    // No double-marking per session (mirrors the contract's hasMarked map).
    const existing = await prisma.attendance.findUnique({
      where: { wallet_sessionId: { wallet, sessionId } },
    });
    if (existing) {
      return Response.json(
        { error: "You already marked this session" },
        { status: 409 }
      );
    }

    // Best-effort on-chain verification: confirm the tx exists, succeeded,
    // and hasStudentMarked(session, wallet) is true on-chain.
    const verified = await verifyMarkOnChain(
      session.onChainId,
      wallet,
      txHash
    );
    if (verified === false) {
      return Response.json(
        { error: "Could not verify your attendance transaction on-chain" },
        { status: 400 }
      );
    }

    // The contract is the authority on timing: when the mark verifies
    // on-chain it was accepted within the window at tx time, so the window
    // checks below must not reject it afterwards. They only apply as a
    // fallback when RPC verification is unavailable (off-chain mode).
    if (verified === null) {
      const startMs = session.startTime.getTime();
      const endMs = startMs + session.durationSeconds * 1000;

      if (session.closed) {
        return Response.json(
          { error: "This session has been closed" },
          { status: 400 }
        );
      }
      if (now.getTime() < startMs) {
        return Response.json(
          { error: "This session hasn't started yet" },
          { status: 400 }
        );
      }
      if (now.getTime() > endMs) {
        return Response.json(
          { error: "This session has expired" },
          { status: 400 }
        );
      }
    }
    // verified === true -> confirmed; verified === null (RPC not configured)
    // -> stored as pending after the fallback checks, mirroring the existing
    // off-chain fallback.

    const dateKey = now.toISOString().slice(0, 10);

    // Link the record to the student's profile (best-effort).
    let userId: string | null = null;
    try {
      const user = await prisma.user.findUnique({ where: { wallet } });
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }

    let record;
    try {
      record = await prisma.attendance.create({
        data: {
          wallet,
          sessionId,
          courseId: session.courseId,
          txHash,
          hashProof: verified ? txHash : null,
          date: now,
          dateKey,
          userId,
        },
        include: { session: { include: { course: true } } },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return Response.json(
          { error: "You already marked this session" },
          { status: 409 }
        );
      }
      throw error;
    }

    return Response.json(toAttendanceJson(record), { status: 201 });
  } catch (error) {
    console.error("Failed to mark attendance:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}
