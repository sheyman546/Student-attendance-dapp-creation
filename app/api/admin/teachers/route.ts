import { authorizeAdminOrTeacher, WALLET_REGEX, getOwnerAddress } from "@/lib/auth";
import type { AdminStudentRecord } from "@/types/attendance";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** Lists teachers (users with the TEACHER role). */
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

  try {
    const { prisma } = await import("@/lib/prisma");
    const users = await prisma.user.findMany({
      where: { role: "TEACHER" },
      orderBy: { createdAt: "asc" },
    });

    const teachers: AdminStudentRecord[] = users.map((u) => ({
      id: u.id,
      name: u.name ?? null,
      email: u.email ?? null,
      wallet: u.wallet ?? null,
      matricNo: u.matricNo ?? null,
      isRegistered: u.isRegistered,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      attendanceCount: 0,
    }));

    return Response.json({ teachers });
  } catch (error) {
    console.error("Failed to list teachers:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}

/**
 * Syncs a teacher into the database after the owner sends the on-chain
 * authorizeMarker tx. The teacher's wallet (required) may be paired with an
 * email so they can also sign in with Google.
 */
export async function POST(request: Request) {
  let body: {
    wallet?: unknown;
    message?: unknown;
    signature?: unknown;
    teacherWallet?: unknown;
    name?: unknown;
    email?: unknown;
    txHash?: unknown;
    revoke?: unknown;
  };
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

  // Only the owner (admin) can grant/revoke the teacher role — the contract's
  // authorizeMarker is onlyOwner, and the DB sync must stay in lockstep.
  if (auth.wallet !== getOwnerAddress()) {
    return Response.json(
      { error: "Not authorized — only the admin can manage teachers" },
      { status: 403 }
    );
  }

  const teacherWallet =
    typeof body.teacherWallet === "string" ? body.teacherWallet.toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const txHash = typeof body.txHash === "string" ? body.txHash : "";
  const revoke = body.revoke === true;

  if (!WALLET_REGEX.test(teacherWallet)) {
    return Response.json(
      { error: "A valid teacher wallet address is required" },
      { status: 400 }
    );
  }
  if (email && !EMAIL_REGEX.test(email)) {
    return Response.json(
      { error: "Please enter a valid email address" },
      { status: 400 }
    );
  }
  if (!revoke && !txHash) {
    return Response.json(
      { error: "The authorizeMarker transaction hash is required" },
      { status: 400 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    let user;
    try {
      user = await prisma.user.upsert({
        where: { wallet: teacherWallet },
        update: {
          role: revoke ? "USER" : "TEACHER",
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
        },
        create: {
          wallet: teacherWallet,
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
          role: revoke ? "USER" : "TEACHER",
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return Response.json(
          { error: "That email is already linked to another account" },
          { status: 409 }
        );
      }
      throw error;
    }

    return Response.json(
      {
        teacher: {
          id: user.id,
          name: user.name,
          email: user.email,
          wallet: user.wallet,
          role: user.role,
        },
      },
      { status: revoke ? 200 : 201 }
    );
  } catch (error) {
    console.error("Failed to update teacher:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}
